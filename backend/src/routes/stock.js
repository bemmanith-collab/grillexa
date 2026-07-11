const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { normalizeDate, getOrCreateDailyEntry, adjustStock } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

function shapeEntry(entry) {
  return {
    id: entry.id,
    date: entry.date.toISOString().slice(0, 10),
    storeId: entry.storeId,
    store: entry.store?.name,
    productId: entry.productId,
    product: entry.product?.name,
    threshold: entry.product?.threshold,
    opening: entry.opening,
    received: entry.received,
    sold: entry.sold,
    wastage: entry.wastage,
    closing: entry.closing,
    status: entry.product && entry.closing <= entry.product.threshold ? 'LOW' : 'OK',
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Today's ledger row for every product at a given store — auto-creates
// missing rows (opening carried over from the prior day) so the page
// always shows all products even before anything happens today.
router.get('/today', async (req, res) => {
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

  res.json({
    date: date.toISOString().slice(0, 10),
    store: store.name,
    entries: entries.map(shapeEntry),
  });
});

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
    res.status(err.status || 500).json({ error: err.message || 'Failed to record wastage' });
  }
});

module.exports = router;
