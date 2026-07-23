const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, adjustStock } = require('../lib/stock');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shapeItem(item) {
  return {
    id: item.id,
    productId: item.productId,
    product: item.product?.name,
    deliveredQty: item.deliveredQty,
    soldQty: item.soldQty,
    returnedQty: item.returnedQty,
    remainingQty: item.deliveredQty - item.soldQty - item.returnedQty,
    pricePerUnit: item.pricePerUnit,
    totalValue: item.totalValue,
  };
}

function shapeSettlement(settlement) {
  return {
    id: settlement.id,
    settlementNo: settlement.settlementNo,
    settledAt: settlement.settledAt.toISOString().slice(0, 10),
    createdBy: settlement.createdBy?.name,
    saleId: settlement.saleId,
    saleNumber: settlement.sale?.number,
    notes: settlement.notes,
    createdAt: settlement.createdAt,
    lines: settlement.lines?.map((l) => ({
      id: l.id,
      consignmentItemId: l.consignmentItemId,
      product: l.consignmentItem?.product?.name,
      soldQty: l.soldQty,
      returnedQty: l.returnedQty,
    })),
  };
}

function shapeConsignment(c) {
  return {
    id: c.id,
    consignmentNo: c.consignmentNo,
    storeId: c.storeId,
    store: c.store?.name,
    createdBy: c.createdBy?.name,
    status: c.status,
    deliveredAt: c.deliveredAt.toISOString().slice(0, 10),
    settledAt: c.settledAt ? c.settledAt.toISOString().slice(0, 10) : null,
    notes: c.notes,
    totalDeliveredValue: c.items?.reduce((sum, i) => sum + i.totalValue, 0) ?? 0,
    createdAt: c.createdAt,
    items: c.items?.map(shapeItem),
    settlements: c.settlements?.map(shapeSettlement),
  };
}

const DETAIL_INCLUDE = {
  store: true,
  createdBy: true,
  items: { include: { product: true } },
  settlements: {
    include: {
      createdBy: true,
      sale: true,
      lines: { include: { consignmentItem: { include: { product: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  },
};

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

  if (req.query.status) {
    const statuses = String(req.query.status).split(',').map((s) => s.trim());
    where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }

  const consignments = await prisma.consignment.findMany({
    where,
    include: { store: true, createdBy: true, items: { include: { product: true } } },
    orderBy: { deliveredAt: 'desc' },
    take: 200,
  });
  res.json({ consignments: consignments.map(shapeConsignment) });
});

router.get('/:id', async (req, res) => {
  const consignment = await prisma.consignment.findUnique({
    where: { id: Number(req.params.id) },
    include: DETAIL_INCLUDE,
  });
  if (!consignment) return res.status(404).json({ error: 'Consignment not found' });
  if (req.user.role === 'SALES') {
    try {
      assertStoreAccess(req.user, consignment.storeId);
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }
  res.json({ consignment: shapeConsignment(consignment) });
});

// Deliver stock to a store on consignment. This is NOT a sale — no revenue,
// no GST — it's a stock transfer HQ still owns until the store settles what
// actually sold. Bumps both physical stock (received) and the consignment
// marker (consignmentQty) for every line.
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { storeId, date, lines, notes } = req.body;
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
    const consignment = await prisma.$transaction(async (tx) => {
      const preparedItems = lines.map((l) => ({
        productId: Number(l.productId),
        deliveredQty: Number(l.quantity),
        pricePerUnit: Number(l.unitPrice) || 0,
        totalValue: Number(l.quantity) * (Number(l.unitPrice) || 0),
      }));

      const created = await tx.consignment.create({
        data: {
          consignmentNo: 'PENDING',
          storeId: Number(storeId),
          createdById: req.user.id,
          status: 'DELIVERED',
          deliveredAt: normalizedDate,
          notes: notes?.trim() || null,
          items: { create: preparedItems },
        },
        include: DETAIL_INCLUDE,
      });

      for (const item of preparedItems) {
        await adjustStock(tx, {
          storeId: Number(storeId),
          productId: item.productId,
          date: normalizedDate,
          receivedDelta: item.deliveredQty,
          consignmentDelta: item.deliveredQty,
        });
      }

      return tx.consignment.update({
        where: { id: created.id },
        data: { consignmentNo: `CN-${String(created.id).padStart(6, '0')}` },
        include: DETAIL_INCLUDE,
      });
    });

    res.status(201).json({ consignment: shapeConsignment(consignment) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create consignment' });
  }
});

// Settle a consignment: the store reports what actually sold vs. what's
// coming back unsold. Generates the real Sale (revenue/GST only apply to
// what sold) and Return audit rows for the unsold portion, in one pass.
// Can be called more than once against the same consignment (e.g. the store
// reports in batches) — soldQty/returnedQty on each line are capped against
// whatever's still remaining on that ConsignmentItem, not the original
// deliveredQty, so a second settlement can't double-count the first.
router.post('/:id/settle', requireRole('ADMIN', 'MANAGER', 'SALES'), async (req, res) => {
  const consignmentId = Number(req.params.id);
  const { date, lines, notes } = req.body;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'At least one line is required' });
  }
  for (const line of lines) {
    if (!line.consignmentItemId) {
      return res.status(400).json({ error: 'Each line needs a consignmentItemId' });
    }
    const sold = Number(line.soldQty) || 0;
    const returned = Number(line.returnedQty) || 0;
    if (sold < 0 || returned < 0) {
      return res.status(400).json({ error: 'soldQty and returnedQty cannot be negative' });
    }
    if (sold === 0 && returned === 0) {
      return res.status(400).json({ error: 'Each line needs a positive soldQty or returnedQty' });
    }
  }

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date || todayStr());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const consignment = await prisma.consignment.findUnique({
    where: { id: consignmentId },
    include: { items: true },
  });
  if (!consignment) return res.status(404).json({ error: 'Consignment not found' });

  try {
    assertStoreAccess(req.user, consignment.storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const itemsById = new Map(consignment.items.map((i) => [i.id, i]));
  const preparedLines = [];
  for (const line of lines) {
    const item = itemsById.get(Number(line.consignmentItemId));
    if (!item) {
      return res.status(400).json({ error: `Consignment item ${line.consignmentItemId} does not belong to this consignment` });
    }
    const soldQty = Number(line.soldQty) || 0;
    const returnedQty = Number(line.returnedQty) || 0;
    const remaining = item.deliveredQty - item.soldQty - item.returnedQty;
    if (soldQty + returnedQty > remaining) {
      return res.status(400).json({
        error: `${soldQty + returnedQty} exceeds the ${remaining} still remaining for this item — it was already delivered ${item.deliveredQty}, with ${item.soldQty} sold and ${item.returnedQty} returned in earlier settlements`,
      });
    }
    preparedLines.push({ item, soldQty, returnedQty });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      for (const { item, soldQty, returnedQty } of preparedLines) {
        if (soldQty > 0) {
          await adjustStock(tx, {
            storeId: consignment.storeId,
            productId: item.productId,
            date: normalizedDate,
            soldDelta: soldQty,
            consignmentDelta: -soldQty,
          });
        }
        if (returnedQty > 0) {
          // Stock physically leaves the store back to HQ — opposite
          // direction from the customer-facing processReturn(), which
          // credits stock back INTO the store.
          await adjustStock(tx, {
            storeId: consignment.storeId,
            productId: item.productId,
            date: normalizedDate,
            receivedDelta: -returnedQty,
            consignmentDelta: -returnedQty,
          });
        }
      }

      const soldLines = preparedLines.filter((l) => l.soldQty > 0);
      let sale = null;
      if (soldLines.length > 0) {
        const saleLineData = soldLines.map(({ item, soldQty }) => ({
          productId: item.productId,
          quantity: soldQty,
          unitPrice: item.pricePerUnit,
          amount: soldQty * item.pricePerUnit,
          type: 'SALE',
        }));
        const totalAmount = saleLineData.reduce((sum, l) => sum + l.amount, 0);
        const createdSale = await tx.sale.create({
          data: {
            number: 'PENDING',
            date: normalizedDate,
            storeId: consignment.storeId,
            createdById: req.user.id,
            totalAmount,
            consignmentId: consignment.id,
            lines: { create: saleLineData },
          },
        });
        sale = await tx.sale.update({
          where: { id: createdSale.id },
          data: { number: `SL-${String(createdSale.id).padStart(6, '0')}` },
        });
      }

      const returnedLines = preparedLines.filter((l) => l.returnedQty > 0);
      if (returnedLines.length > 0) {
        await tx.return.createMany({
          data: returnedLines.map(({ item, returnedQty }) => ({
            date: normalizedDate,
            storeId: consignment.storeId,
            productId: item.productId,
            quantity: returnedQty,
            reason: 'CONSIGNMENT_UNSOLD',
            reference: consignment.consignmentNo,
            createdById: req.user.id,
          })),
        });
      }

      const createdSettlement = await tx.settlement.create({
        data: {
          settlementNo: 'PENDING',
          consignmentId: consignment.id,
          createdById: req.user.id,
          settledAt: normalizedDate,
          notes: notes?.trim() || null,
          saleId: sale?.id ?? null,
          lines: {
            create: preparedLines.map(({ item, soldQty, returnedQty }) => ({
              consignmentItemId: item.id,
              soldQty,
              returnedQty,
            })),
          },
        },
      });
      const settlement = await tx.settlement.update({
        where: { id: createdSettlement.id },
        data: { settlementNo: `ST-${String(createdSettlement.id).padStart(6, '0')}` },
      });

      for (const { item, soldQty, returnedQty } of preparedLines) {
        await tx.consignmentItem.update({
          where: { id: item.id },
          data: { soldQty: item.soldQty + soldQty, returnedQty: item.returnedQty + returnedQty },
        });
      }

      const refreshedItems = await tx.consignmentItem.findMany({ where: { consignmentId: consignment.id } });
      const totalDelivered = refreshedItems.reduce((sum, i) => sum + i.deliveredQty, 0);
      const totalSettled = refreshedItems.reduce((sum, i) => sum + i.soldQty + i.returnedQty, 0);
      const totalSold = refreshedItems.reduce((sum, i) => sum + i.soldQty, 0);
      let status = 'PARTIAL_SETTLED';
      if (totalSettled === 0) status = 'DELIVERED';
      else if (totalSettled >= totalDelivered) status = totalSold === 0 ? 'RETURNED' : 'SETTLED';

      await tx.consignment.update({
        where: { id: consignment.id },
        data: {
          status,
          settledAt: status === 'SETTLED' || status === 'RETURNED' ? normalizedDate : null,
        },
      });

      return tx.settlement.findUnique({
        where: { id: settlement.id },
        include: {
          createdBy: true,
          sale: true,
          lines: { include: { consignmentItem: { include: { product: true } } } },
        },
      });
    });

    const fullConsignment = await prisma.consignment.findUnique({
      where: { id: consignment.id },
      include: DETAIL_INCLUDE,
    });

    res.status(201).json({ settlement: shapeSettlement(result), consignment: shapeConsignment(fullConsignment) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to settle consignment' });
  }
});

module.exports = router;
