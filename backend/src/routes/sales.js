const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, adjustStock } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

function shapeSale(sale) {
  return {
    id: sale.id,
    number: sale.number,
    date: sale.date.toISOString().slice(0, 10),
    storeId: sale.storeId,
    store: sale.store?.name,
    createdBy: sale.createdBy?.name,
    totalAmount: sale.totalAmount,
    createdAt: sale.createdAt,
    lines: sale.lines?.map((l) => ({
      id: l.id,
      productId: l.productId,
      product: l.product?.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
    })),
  };
}

router.get('/', async (req, res) => {
  const storeId = req.query.storeId ? Number(req.query.storeId) : req.user.role === 'SALES' ? req.user.storeId : undefined;
  if (req.user.role === 'SALES') {
    try {
      assertStoreAccess(req.user, storeId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }
  const where = storeId ? { storeId } : {};
  const sales = await prisma.sale.findMany({
    where,
    include: { store: true, createdBy: true, lines: { include: { product: true } } },
    orderBy: { date: 'desc' },
    take: 200,
  });
  res.json({ sales: sales.map(shapeSale) });
});

router.get('/:id', async (req, res) => {
  const sale = await prisma.sale.findUnique({
    where: { id: Number(req.params.id) },
    include: { store: true, createdBy: true, lines: { include: { product: true } } },
  });
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  if (req.user.role === 'SALES') {
    try {
      assertStoreAccess(req.user, sale.storeId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }
  res.json({ sale: shapeSale(sale) });
});

// Create a retail sales bill. Sales staff always bill against their own
// store; Admin/Manager may bill on behalf of any store. Rejects the whole
// bill if any line would oversell the day's available stock.
router.post('/', requireRole('ADMIN', 'MANAGER', 'SALES'), async (req, res) => {
  const { date, lines } = req.body;
  const storeId = req.user.role === 'SALES' ? req.user.storeId : Number(req.body.storeId);

  if (!storeId) {
    return res.status(400).json({ error: req.user.role === 'SALES' ? 'Your account is not assigned to a store yet' : 'storeId is required' });
  }
  if (!date || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'date and at least one line are required' });
  }
  for (const line of lines) {
    if (!line.productId || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
      return res.status(400).json({ error: 'Each line needs a productId and a positive quantity' });
    }
  }

  try {
    assertStoreAccess(req.user, storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const sale = await prisma.$transaction(async (tx) => {
      const preparedLines = lines.map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        amount: Number(l.quantity) * (Number(l.unitPrice) || 0),
      }));
      const totalAmount = preparedLines.reduce((sum, l) => sum + l.amount, 0);

      // Validate stock availability for every line before writing anything.
      for (const line of preparedLines) {
        await adjustStock(tx, {
          storeId,
          productId: line.productId,
          date: normalizedDate,
          soldDelta: line.quantity,
        });
      }

      const created = await tx.sale.create({
        data: {
          number: 'PENDING',
          date: normalizedDate,
          storeId,
          createdById: req.user.id,
          totalAmount,
          lines: { create: preparedLines },
        },
        include: { store: true, createdBy: true, lines: { include: { product: true } } },
      });

      return tx.sale.update({
        where: { id: created.id },
        data: { number: `SL-${String(created.id).padStart(6, '0')}` },
        include: { store: true, createdBy: true, lines: { include: { product: true } } },
      });
    });

    res.status(201).json({ sale: shapeSale(sale) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create sale' });
  }
});

module.exports = router;
