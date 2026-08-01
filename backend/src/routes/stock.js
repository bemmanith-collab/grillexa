const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { normalizeDate, todayStr, getOrCreateDailyEntry, adjustStock } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

// opening/closing are deliberately not exposed. Goods are never booked into
// the system before they're billed, so the running balance they carry doesn't
// describe anything real — it drifts negative as a matter of course. The
// per-day movements below are real (each one is a bill, a delivery or a
// recorded wastage), as is consignmentQty, which tracks what a store still
// holds on consignment. The columns stay in the table for audit history.
function shapeEntry(entry) {
  return {
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    storeId: entry.storeId,
    store: entry.store?.name,
    productId: entry.productId,
    product: entry.product?.name,
    received: entry.received,
    sold: entry.sold,
    wastage: entry.wastage,
    // What came back today, from the Return ledger: unsold consignment stock
    // going back to HQ plus customer returns. `received` is already net of
    // the former (settlement books it as a negative receipt), so this is the
    // gross figure telling you why received is down, not a second deduction.
    returned: entry.returned || 0,
    consignmentQty: entry.consignmentQty,
  };
}

// productId -> units returned on this date, for whichever stores are in scope.
async function returnsByProduct(where) {
  const rows = await prisma.return.groupBy({ by: ['productId'], where, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity || 0]));
}

// Today's ledger row for every product at a given store — auto-creates
// missing rows (opening carried over from the prior day) so the page
// always shows all products even before anything happens today.
router.get('/today', async (req, res) => {
  if (req.query.storeId === 'all') return todayAcrossStores(req, res);

  const storeId = req.query.storeId
    ? Number(req.query.storeId)
    : req.user.role === 'SALES'
    ? req.user.storeIds[0]
    : undefined;
  if (!storeId) return res.status(400).json({ error: 'storeId is required' });
  try {
    assertStoreAccess(req.user, storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const date = normalizeDate(req.query.date || todayStr());
  const [products, store] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: 'asc' } }),
    prisma.store.findUnique({ where: { id: storeId } }),
  ]);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  const entries = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const product of products) {
      const entry = await getOrCreateDailyEntry(tx, storeId, product.id, date);
      rows.push({ ...entry, product, store });
    }
    return rows;
  });

  const returned = await returnsByProduct({ date, storeId });

  res.json({
    date: date.toISOString().slice(0, 10),
    store: store.name,
    entries: entries.map((e) => shapeEntry({ ...e, returned: returned.get(e.productId) })),
  });
});

// One day's totals per product across every store in scope — the end-of-day
// view for someone who supplied thirty stores and wants one sheet, not thirty.
// Read-only on purpose: it doesn't auto-create today's rows the way the
// single-store view does (that would write products × stores rows on every
// page load), so a store that had no movement simply contributes nothing.
async function todayAcrossStores(req, res) {
  const date = normalizeDate(req.query.date || todayStr());
  // ADMIN/MANAGER see the whole route; SALES only the stores they're on.
  const scope = req.user.role === 'SALES' ? { storeId: { in: req.user.storeIds } } : {};

  const [products, entries, storesReporting, outstanding, returned] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: 'asc' } }),
    // received/sold/wastage are that day's movements, so only today's rows count.
    prisma.dailyStockEntry.groupBy({
      by: ['productId'],
      where: { date, ...scope },
      _sum: { received: true, sold: true, wastage: true },
    }),
    // How many stores actually have a row today — tells you at a glance
    // whether every stop on the route got recorded.
    prisma.dailyStockEntry.groupBy({ by: ['storeId'], where: { date, ...scope } }),
    // consignmentQty is a running balance, not a daily movement: a store with
    // no activity today has no row today but is still holding stock. Take each
    // store/product's most recent row up to this date — the same carry-forward
    // the single-store view gets from getOrCreateDailyEntry, without writing
    // a row for every product at every store just to read it.
    prisma.dailyStockEntry.findMany({
      where: { date: { lte: date }, ...scope },
      orderBy: [{ date: 'desc' }],
      distinct: ['storeId', 'productId'],
      select: { productId: true, consignmentQty: true },
    }),
    returnsByProduct({ date, ...scope }),
  ]);

  res.json({
    date: date.toISOString().slice(0, 10),
    store: 'All Stores',
    storeCount: storesReporting.length,
    entries: rollUp({ products, date, movements: entries, outstanding, returned }),
  });
}

// The arithmetic half of the all-stores view, split out so it can be checked
// without a database: every product gets a row (zero-filled if nothing moved),
// day movements come from the grouped totals, and the consignment balance is
// summed over each store's carried-forward row.
function rollUp({ products, date, movements, outstanding, returned }) {
  const totals = new Map(movements.map((m) => [m.productId, m._sum]));
  const onConsignment = new Map();
  for (const row of outstanding) {
    onConsignment.set(row.productId, (onConsignment.get(row.productId) || 0) + row.consignmentQty);
  }

  return products.map((product) => {
    const t = totals.get(product.id) || {};
    return shapeEntry({
      // No DailyStockEntry backs an aggregated row, so key on the product.
      id: `all-${product.id}`,
      date,
      productId: product.id,
      product,
      received: t.received || 0,
      sold: t.sold || 0,
      wastage: t.wastage || 0,
      consignmentQty: onConsignment.get(product.id) || 0,
      returned: returned.get(product.id),
    });
  });
}

// Historical ledger, filterable by store/product/date range.
router.get('/history', async (req, res) => {
  const { productId, from, to } = req.query;
  const requestedStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;

  if (req.user.role === 'SALES' && requestedStoreId) {
    try {
      assertStoreAccess(req.user, requestedStoreId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  const where = {};
  if (requestedStoreId) {
    where.storeId = requestedStoreId;
  } else if (req.user.role === 'SALES') {
    where.storeId = { in: req.user.storeIds };
  }
  if (productId) where.productId = Number(productId);
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = normalizeDate(from);
    if (to) where.date.lte = normalizeDate(to);
  }

  const entries = await prisma.dailyStockEntry.findMany({
    where,
    include: { store: true, product: true },
    orderBy: [{ date: 'desc' }, { storeId: 'asc' }],
    take: 500,
  });

  res.json({ entries: entries.map(shapeEntry) });
});

// Record wastage/returns for a product at a store on a given date.
router.post('/:storeId/:productId/wastage', async (req, res) => {
  const storeId = Number(req.params.storeId);
  const productId = Number(req.params.productId);
  const quantity = Number(req.body.quantity);
  const date = req.body.date ? normalizeDate(req.body.date) : normalizeDate(todayStr());

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }

  try {
    assertStoreAccess(req.user, storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  try {
    const updated = await prisma.$transaction((tx) =>
      adjustStock(tx, { storeId, productId, date, wastageDelta: quantity })
    );
    const product = await prisma.product.findUnique({ where: { id: productId } });
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    res.json({ entry: shapeEntry({ ...updated, product, store }) });
  } catch (err) {
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'Failed to record wastage',
      });
  }
});

module.exports = router;
module.exports.rollUp = rollUp;
