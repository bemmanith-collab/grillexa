const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, adjustStock } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

function shapeInvoice(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    date: invoice.date.toISOString().slice(0, 10),
    storeId: invoice.storeId,
    store: invoice.store?.name,
    createdBy: invoice.createdBy?.name,
    totalAmount: invoice.totalAmount,
    createdAt: invoice.createdAt,
    lines: invoice.lines?.map((l) => ({
      id: l.id,
      productId: l.productId,
      product: l.product?.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
    })),
  };
}

// Sales can view dispatches sent to their own store (read-only, so staff know what arrived).
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
  const invoices = await prisma.dispatchInvoice.findMany({
    where,
    include: { store: true, createdBy: true, lines: { include: { product: true } } },
    orderBy: { date: 'desc' },
    take: 200,
  });
  res.json({ invoices: invoices.map(shapeInvoice) });
});

router.get('/:id', async (req, res) => {
  const invoice = await prisma.dispatchInvoice.findUnique({
    where: { id: Number(req.params.id) },
    include: { store: true, createdBy: true, lines: { include: { product: true } } },
  });
  if (!invoice) return res.status(404).json({ error: 'Dispatch invoice not found' });
  if (req.user.role === 'SALES') {
    try {
      assertStoreAccess(req.user, invoice.storeId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }
  res.json({ invoice: shapeInvoice(invoice) });
});

// Create a dispatch invoice — the "bill" for stock sent from HQ to a store.
// Only Admin/Manager send stock out; this bumps the store's received stock for that date.
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { storeId, date, lines } = req.body;
  if (!storeId || !date || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'storeId, date and at least one line are required' });
  }
  for (const line of lines) {
    if (!line.productId || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
      return res.status(400).json({ error: 'Each line needs a productId and a positive quantity' });
    }
  }

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const store = await prisma.store.findUnique({ where: { id: Number(storeId) } });
  if (!store) return res.status(404).json({ error: 'Store not found' });

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const preparedLines = lines.map((l) => ({
        productId: Number(l.productId),
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice) || 0,
        amount: Number(l.quantity) * (Number(l.unitPrice) || 0),
      }));
      const totalAmount = preparedLines.reduce((sum, l) => sum + l.amount, 0);

      const created = await tx.dispatchInvoice.create({
        data: {
          number: 'PENDING',
          date: normalizedDate,
          storeId: Number(storeId),
          createdById: req.user.id,
          totalAmount,
          lines: { create: preparedLines },
        },
        include: { store: true, createdBy: true, lines: { include: { product: true } } },
      });

      for (const line of preparedLines) {
        await adjustStock(tx, {
          storeId: Number(storeId),
          productId: line.productId,
          date: normalizedDate,
          receivedDelta: line.quantity,
        });
      }

      return tx.dispatchInvoice.update({
        where: { id: created.id },
        data: { number: `DI-${String(created.id).padStart(6, '0')}` },
        include: { store: true, createdBy: true, lines: { include: { product: true } } },
      });
    });

    res.status(201).json({ invoice: shapeInvoice(invoice) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create dispatch invoice' });
  }
});

module.exports = router;
