const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { normalizeDate, processReturn } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

const REASONS = ['CUSTOMER_RETURN', 'DAMAGED', 'EXCHANGE', 'OTHER'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shapeReturn(r) {
  return {
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    storeId: r.storeId,
    store: r.store?.name,
    productId: r.productId,
    product: r.product?.name,
    quantity: r.quantity,
    reason: r.reason,
    reference: r.reference,
    createdBy: r.createdBy?.name,
    createdAt: r.createdAt,
  };
}

// Sales, Managers and Admins can all view/process returns; Sales staff are
// scoped to their own stores, same pattern as sales.js/dispatches.js.
router.get('/', async (req, res) => {
  const requestedStoreId = req.query.storeId ? Number(req.query.storeId) : undefined;
  if (req.user.role === 'SALES' && requestedStoreId) {
    try {
      assertStoreAccess(req.user, requestedStoreId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }
  const where = requestedStoreId
    ? { storeId: requestedStoreId }
    : req.user.role === 'SALES'
    ? { storeId: { in: req.user.storeIds } }
    : {};

  const returns = await prisma.return.findMany({
    where,
    include: { store: true, product: true, createdBy: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ returns: returns.map(shapeReturn) });
});

router.post('/', async (req, res) => {
  const { productId, quantity, reason, reference, date } = req.body;
  const storeId =
    req.user.role === 'SALES'
      ? Number(req.body.storeId) || req.user.storeIds[0]
      : Number(req.body.storeId);

  if (!storeId) {
    return res.status(400).json({ error: req.user.role === 'SALES' ? 'Your account is not assigned to a store yet' : 'storeId is required' });
  }
  if (!productId) {
    return res.status(400).json({ error: 'productId is required' });
  }
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive number' });
  }
  if (!REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of ${REASONS.join(', ')}` });
  }

  try {
    assertStoreAccess(req.user, storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date || todayStr());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const [store, product] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId } }),
    prisma.product.findUnique({ where: { id: Number(productId) } }),
  ]);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  try {
    const created = await prisma.$transaction(async (tx) => {
      await processReturn(tx, {
        storeId,
        productId: Number(productId),
        date: normalizedDate,
        quantity: Number(quantity),
      });
      return tx.return.create({
        data: {
          date: normalizedDate,
          storeId,
          productId: Number(productId),
          quantity: Number(quantity),
          reason,
          reference: reference || null,
          createdById: req.user.id,
        },
        include: { store: true, product: true, createdBy: true },
      });
    });
    res.status(201).json({ return: shapeReturn(created) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to process return' });
  }
});

module.exports = router;
