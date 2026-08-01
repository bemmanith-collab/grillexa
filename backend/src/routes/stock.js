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
    // Today's views pass this in from consignmentSummary(), the same read the
    // value card uses. /history keeps the ledger's own consignmentQty: it
    // answers "what was out on 12 July", and an open consignment item only
    // knows about now.
    consignmentQty: entry.consignmentQty,
  };
}

// The day's takings from walk-in bills: sales with no consignment behind them,
// the same `direct` filter the Direct Sale page lists by. A settlement's sale
// is money recognized against stock delivered earlier, so it isn't counted
// here. Already net of return lines — a bill's totalAmount subtracts them.
async function directSaleRevenue(where) {
  const { _sum } = await prisma.sale.aggregate({
    where: { ...where, consignmentId: null },
    _sum: { totalAmount: true },
  });
  return _sum.totalAmount || 0;
}

// productId -> units returned on this date, for whichever stores are in scope.
async function returnsByProduct(where) {
  const rows = await prisma.return.groupBy({ by: ['productId'], where, _sum: { quantity: true } });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity || 0]));
}

const OPEN_CONSIGNMENT = ['DELIVERED', 'PARTIAL_SETTLED'];

// Everything the stock views say about consignment — units per product, the
// money still out, and how many deliveries are waiting to be settled — comes
// from this one read of the consignment items.
//
// One source on purpose. The units used to come from the daily ledger's
// consignmentQty and the value from these items: two counters incremented by
// the same two events, agreeing right up until the day they didn't, with
// nothing on screen saying which one to believe. Read together, the units
// column and the value card cannot disagree.
//
// Not capped: a page of the consignments list would silently stop counting
// past 200 rows. Priced at each item's own pricePerUnit, which is what
// settlement actually bills (see applySettlement), not today's catalogue
// price — those diverge the moment a product is repriced after delivery.
async function consignmentSummary(scope) {
  const open = { status: { in: OPEN_CONSIGNMENT }, ...scope };
  const [items, pendingSettlements] = await Promise.all([
    prisma.consignmentItem.findMany({
      where: { consignment: open },
      select: {
        productId: true,
        deliveredQty: true,
        soldQty: true,
        returnedQty: true,
        pricePerUnit: true,
      },
    }),
    prisma.consignment.count({ where: open }),
  ]);

  return { unitsByProduct: unitsOf(items), consignmentValue: valueOf(items), pendingSettlements };
}

// What's left of a delivered line: never settled twice, never negative.
function remainingOf(item) {
  return item.deliveredQty - item.soldQty - item.returnedQty;
}

// Split out so both can be checked without a database. They walk the same
// items, so units × price and the value total are the same arithmetic.
function unitsOf(items) {
  const byProduct = new Map();
  for (const item of items) {
    byProduct.set(item.productId, (byProduct.get(item.productId) || 0) + remainingOf(item));
  }
  return byProduct;
}

function valueOf(items) {
  return items.reduce((sum, item) => sum + remainingOf(item) * item.pricePerUnit, 0);
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

  const [returned, { unitsByProduct, ...consignment }, directRevenue] = await Promise.all([
    returnsByProduct({ date, storeId }),
    consignmentSummary({ storeId }),
    directSaleRevenue({ date, storeId }),
  ]);

  res.json({
    date: date.toISOString().slice(0, 10),
    store: store.name,
    ...consignment,
    directRevenue,
    entries: entries.map((e) =>
      shapeEntry({
        ...e,
        returned: returned.get(e.productId),
        // Same source as the value card, so the store view and the all-stores
        // view are answering with the same counter too.
        consignmentQty: unitsByProduct.get(e.productId) || 0,
      })
    ),
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

  const [products, entries, storesReporting, returned, { unitsByProduct, ...consignment }, directRevenue] =
    await Promise.all([
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
      returnsByProduct({ date, ...scope }),
      // Consignment units and value both come from here — a store that was
      // idle today is still holding stock, and unlike a daily ledger row that
      // has to be carried forward, an open consignment item says so directly.
      consignmentSummary(scope),
      directSaleRevenue({ date, ...scope }),
    ]);

  res.json({
    date: date.toISOString().slice(0, 10),
    store: 'All Stores',
    storeCount: storesReporting.length,
    ...consignment,
    directRevenue,
    entries: rollUp({ products, date, movements: entries, onConsignment: unitsByProduct, returned }),
  });
}

// The arithmetic half of the all-stores view, split out so it can be checked
// without a database: every product gets a row (zero-filled if nothing moved)
// and day movements come from the grouped totals.
function rollUp({ products, date, movements, onConsignment, returned }) {
  const totals = new Map(movements.map((m) => [m.productId, m._sum]));

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
module.exports.unitsOf = unitsOf;
module.exports.valueOf = valueOf;
