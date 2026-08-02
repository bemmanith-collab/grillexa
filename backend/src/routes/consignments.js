const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, todayStr, adjustStock } = require('../lib/stock');
const { resolveLines } = require('../lib/pricing');
const { assertStoreAccess } = require('../lib/scope');

const router = express.Router();

router.use(authenticate);

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
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

// Validates and normalizes the delivery-line shape shared by create and edit.
// Prices come from the catalogue via resolveLines, never from the request —
// see lib/pricing.js for why trusting the client zeroed out real revenue.
async function parseDeliveryLines(tx, lines, role) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw httpError(400, 'At least one line is required');
  }
  const resolved = await resolveLines(tx, lines, role);
  return resolved.map((l) => ({
    productId: l.productId,
    deliveredQty: l.quantity,
    pricePerUnit: l.unitPrice,
    totalValue: l.quantity * l.unitPrice,
  }));
}

// Applies one settlement pass (fresh or edited) inside an open transaction:
// stock movement, the generated Sale (created/updated/removed as needed),
// the Settlement + its lines (created or replaced), the CONSIGNMENT_UNSOLD
// Return rows, and the consignment's recomputed status. Shared by both
// POST /:id/settle (existingSettlementId/existingSaleId both null) and
// PATCH /:id/settlements/:settlementId (both provided, reversal already done).
async function applySettlement(tx, { consignment, preparedLines, normalizedDate, notes, userId, existingSettlementId, existingSaleId }) {
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
      // Stock physically leaves the store back to HQ — opposite direction
      // from the customer-facing processReturn(), which credits stock back
      // INTO the store.
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
  let saleId = existingSaleId ?? null;
  if (soldLines.length > 0) {
    const saleLineData = soldLines.map(({ item, soldQty }) => ({
      productId: item.productId,
      quantity: soldQty,
      unitPrice: item.pricePerUnit,
      amount: soldQty * item.pricePerUnit,
      type: 'SALE',
    }));
    const totalAmount = saleLineData.reduce((sum, l) => sum + l.amount, 0);
    if (existingSaleId) {
      await tx.saleLine.deleteMany({ where: { saleId: existingSaleId } });
      await tx.sale.update({
        where: { id: existingSaleId },
        data: { date: normalizedDate, totalAmount, lines: { create: saleLineData } },
      });
    } else {
      const createdSale = await tx.sale.create({
        data: {
          number: 'PENDING',
          date: normalizedDate,
          storeId: consignment.storeId,
          createdById: userId,
          totalAmount,
          consignmentId: consignment.id,
          lines: { create: saleLineData },
        },
      });
      const numbered = await tx.sale.update({
        where: { id: createdSale.id },
        data: { number: `SL-${String(createdSale.id).padStart(6, '0')}` },
      });
      saleId = numbered.id;
    }
  } else if (existingSaleId) {
    // The edited settlement no longer has any sold qty — remove the now-empty sale.
    await tx.saleLine.deleteMany({ where: { saleId: existingSaleId } });
    await tx.sale.delete({ where: { id: existingSaleId } });
    saleId = null;
  }

  let settlementId = existingSettlementId ?? null;
  const settlementLineData = preparedLines.map(({ item, soldQty, returnedQty }) => ({
    consignmentItemId: item.id,
    soldQty,
    returnedQty,
  }));
  if (existingSettlementId) {
    await tx.settlementLine.deleteMany({ where: { settlementId: existingSettlementId } });
    await tx.settlement.update({
      where: { id: existingSettlementId },
      data: {
        settledAt: normalizedDate,
        notes: notes?.trim() || null,
        saleId,
        lines: { create: settlementLineData },
      },
    });
  } else {
    const createdSettlement = await tx.settlement.create({
      data: {
        settlementNo: 'PENDING',
        consignmentId: consignment.id,
        createdById: userId,
        settledAt: normalizedDate,
        notes: notes?.trim() || null,
        saleId,
        lines: { create: settlementLineData },
      },
    });
    const numbered = await tx.settlement.update({
      where: { id: createdSettlement.id },
      data: { settlementNo: `ST-${String(createdSettlement.id).padStart(6, '0')}` },
    });
    settlementId = numbered.id;
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
        createdById: userId,
        settlementId,
      })),
    });
  }

  for (const { item, soldQty, returnedQty } of preparedLines) {
    await tx.consignmentItem.update({
      where: { id: item.id },
      data: { soldQty: { increment: soldQty }, returnedQty: { increment: returnedQty } },
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
    data: { status, settledAt: status === 'SETTLED' || status === 'RETURNED' ? normalizedDate : null },
  });

  return settlementId;
}

// Reverses everything a previously-applied settlement pass did: stock
// movement, the CONSIGNMENT_UNSOLD Return rows it wrote, and the cumulative
// soldQty/returnedQty it added to each ConsignmentItem. Used only when
// editing the most recent settlement, right before re-applying the new values.
async function reverseSettlement(tx, { consignment, settlement }) {
  for (const line of settlement.lines) {
    const item = line.consignmentItem;
    if (line.soldQty > 0) {
      await adjustStock(tx, {
        storeId: consignment.storeId,
        productId: item.productId,
        date: settlement.settledAt,
        soldDelta: -line.soldQty,
        consignmentDelta: line.soldQty,
      });
    }
    if (line.returnedQty > 0) {
      await adjustStock(tx, {
        storeId: consignment.storeId,
        productId: item.productId,
        date: settlement.settledAt,
        receivedDelta: line.returnedQty,
        consignmentDelta: line.returnedQty,
      });
    }
  }

  await tx.return.deleteMany({ where: { settlementId: settlement.id } });

  for (const line of settlement.lines) {
    await tx.consignmentItem.update({
      where: { id: line.consignmentItemId },
      data: { soldQty: { decrement: line.soldQty }, returnedQty: { decrement: line.returnedQty } },
    });
  }
}

// How much history an unfiltered list hands back. Fine for one store; a
// manager across fifty stores burns through it in a few days, which is why a
// status-filtered request is never capped — see below.
const HISTORY_LIMIT = 200;

// Where "who sees which consignments" is actually decided. Only SALES is
// store-scoped: ADMIN and MANAGER see every store, with or without a filter.
// Exported for test/consignment-list.js, since getting this wrong is invisible
// — the list still renders, it is just missing rows nobody knows to look for.
function listQuery(user, query) {
  const requestedStoreId = query.storeId ? Number(query.storeId) : undefined;
  const where = requestedStoreId
    ? { storeId: requestedStoreId }
    : user.role === 'SALES'
    ? { storeId: { in: user.storeIds } }
    : {};

  if (query.status) {
    const statuses = String(query.status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length) where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
  }

  // A status filter is the Settle page asking "what is still outstanding?".
  // Capping that answer hides the consignment nobody has settled in three
  // weeks — precisely the one being looked for, and the oldest, so it sorts
  // last and falls off the end first. Outstanding work is bounded by the
  // business closing it out; history is not, so history keeps the cap.
  return { where, take: where.status ? undefined : HISTORY_LIMIT };
}

router.get('/', async (req, res) => {
  if (req.user.role === 'SALES' && req.query.storeId) {
    try {
      assertStoreAccess(req.user, Number(req.query.storeId));
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message });
    }
  }

  const { where, take } = listQuery(req.user, req.query);
  const consignments = await prisma.consignment.findMany({
    where,
    include: { store: true, createdBy: true, items: { include: { product: true } } },
    orderBy: { deliveredAt: 'desc' },
    take,
  });
  res.json({ consignments: consignments.map(shapeConsignment) });
});

// The store's most recent delivery, backing the "Reorder from Last Delivery"
// shortcut on Deliver to Store. Settlements are deliberately left out of the
// include — the caller only copies delivered lines into a fresh form, and
// pulling the settlement tree here would be dead weight on every click.
// Declared above GET /:id purely for readability; the two can't collide since
// Express path params never match across a "/".
router.get('/latest/:storeId', async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!Number.isInteger(storeId) || storeId <= 0) {
    return res.status(400).json({ error: 'A valid storeId is required' });
  }

  try {
    assertStoreAccess(req.user, storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const latest = await prisma.consignment.findFirst({
    where: { storeId },
    // deliveredAt is date-only (normalized to UTC midnight), so same-day
    // deliveries tie — id breaks it toward whichever was entered last.
    orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
    include: { store: true, createdBy: true, items: { include: { product: true } } },
  });
  if (!latest) return res.status(404).json({ error: 'No past deliveries found' });

  res.json({ consignment: shapeConsignment(latest) });
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
router.post('/', requireRole('ADMIN', 'MANAGER', 'SALES'), async (req, res) => {
  const { date, lines, notes } = req.body;
  const storeId =
    req.user.role === 'SALES'
      ? Number(req.body.storeId) || req.user.storeIds[0]
      : Number(req.body.storeId);

  if (!storeId) {
    return res.status(400).json({ error: req.user.role === 'SALES' ? 'Your account is not assigned to a store yet' : 'storeId is required' });
  }
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  let preparedItems;
  try {
    preparedItems = await parseDeliveryLines(prisma, lines, req.user.role);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
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
    const consignment = await prisma.$transaction(async (tx) => {
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
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'Failed to create consignment',
      });
  }
});

// Edit a delivery that hasn't been touched by a settlement yet — fixes a
// mistyped quantity/price/product/store without leaving stale stock behind.
// Only allowed while status is still DELIVERED: once any settlement has run
// against this consignment, soldQty/returnedQty are in play and replacing
// the delivered lines wholesale would no longer be safe.
router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'SALES'), async (req, res) => {
  const consignmentId = Number(req.params.id);
  const { date, lines, notes } = req.body;

  const consignment = await prisma.consignment.findUnique({ where: { id: consignmentId }, include: { items: true } });
  if (!consignment) return res.status(404).json({ error: 'Consignment not found' });
  if (consignment.status !== 'DELIVERED') {
    return res.status(400).json({ error: 'Cannot edit a delivery once settlement has started — settle or unwind it first' });
  }

  try {
    assertStoreAccess(req.user, consignment.storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const storeId =
    req.body.storeId !== undefined
      ? req.user.role === 'SALES'
        ? Number(req.body.storeId) || req.user.storeIds[0]
        : Number(req.body.storeId)
      : consignment.storeId;
  if (!storeId) {
    return res.status(400).json({ error: 'storeId is required' });
  }
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }
  let preparedItems;
  try {
    preparedItems = await parseDeliveryLines(prisma, lines, req.user.role);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
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

  if (storeId !== consignment.storeId) {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) return res.status(404).json({ error: 'Store not found' });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Reverse the original delivery's stock effect before applying the new one.
      for (const item of consignment.items) {
        await adjustStock(tx, {
          storeId: consignment.storeId,
          productId: item.productId,
          date: consignment.deliveredAt,
          receivedDelta: -item.deliveredQty,
          consignmentDelta: -item.deliveredQty,
        });
      }
      await tx.consignmentItem.deleteMany({ where: { consignmentId } });

      await tx.consignmentItem.createMany({
        data: preparedItems.map((item) => ({ ...item, consignmentId })),
      });

      for (const item of preparedItems) {
        await adjustStock(tx, {
          storeId,
          productId: item.productId,
          date: normalizedDate,
          receivedDelta: item.deliveredQty,
          consignmentDelta: item.deliveredQty,
        });
      }

      return tx.consignment.update({
        where: { id: consignmentId },
        data: {
          storeId,
          deliveredAt: normalizedDate,
          notes: notes !== undefined ? notes?.trim() || null : consignment.notes,
        },
        include: DETAIL_INCLUDE,
      });
    });

    res.json({ consignment: shapeConsignment(updated) });
  } catch (err) {
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'Failed to update consignment',
      });
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
    const settlementId = await prisma.$transaction((tx) =>
      applySettlement(tx, {
        consignment,
        preparedLines,
        normalizedDate,
        notes,
        userId: req.user.id,
        existingSettlementId: null,
        existingSaleId: null,
      })
    );

    const settlement = await prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        createdBy: true,
        sale: true,
        lines: { include: { consignmentItem: { include: { product: true } } } },
      },
    });
    const fullConsignment = await prisma.consignment.findUnique({
      where: { id: consignment.id },
      include: DETAIL_INCLUDE,
    });

    res.status(201).json({ settlement: shapeSettlement(settlement), consignment: shapeConsignment(fullConsignment) });
  } catch (err) {
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'Failed to settle consignment',
      });
  }
});

// Edit the most recent settlement pass against a consignment — fixes a
// mistyped sold/returned quantity without leaving stale stock, sale, or
// return-audit data behind. Only the latest settlement is editable: earlier
// ones were already validated against remaining quantity as of their own
// time, and reopening them would let later passes silently double-count.
router.patch('/:id/settlements/:settlementId', requireRole('ADMIN', 'MANAGER', 'SALES'), async (req, res) => {
  const consignmentId = Number(req.params.id);
  const settlementId = Number(req.params.settlementId);
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

  const consignment = await prisma.consignment.findUnique({
    where: { id: consignmentId },
    include: { items: true, settlements: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!consignment) return res.status(404).json({ error: 'Consignment not found' });

  try {
    assertStoreAccess(req.user, consignment.storeId);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message });
  }

  const latestSettlement = consignment.settlements[0];
  if (!latestSettlement || latestSettlement.id !== settlementId) {
    return res.status(400).json({ error: 'Only the most recent settlement on this consignment can be edited' });
  }

  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { lines: { include: { consignmentItem: true } } },
  });

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date || settlement.settledAt.toISOString().slice(0, 10));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      await reverseSettlement(tx, { consignment, settlement });

      const refreshedItems = await tx.consignmentItem.findMany({ where: { consignmentId } });
      const itemsById = new Map(refreshedItems.map((i) => [i.id, i]));
      const preparedLines = [];
      for (const line of lines) {
        const item = itemsById.get(Number(line.consignmentItemId));
        if (!item) {
          throw httpError(400, `Consignment item ${line.consignmentItemId} does not belong to this consignment`);
        }
        const soldQty = Number(line.soldQty) || 0;
        const returnedQty = Number(line.returnedQty) || 0;
        const remaining = item.deliveredQty - item.soldQty - item.returnedQty;
        if (soldQty + returnedQty > remaining) {
          throw httpError(
            400,
            `${soldQty + returnedQty} exceeds the ${remaining} still remaining for this item once this settlement's own quantities are backed out`
          );
        }
        preparedLines.push({ item, soldQty, returnedQty });
      }

      await applySettlement(tx, {
        consignment,
        preparedLines,
        normalizedDate,
        notes: notes !== undefined ? notes : settlement.notes,
        userId: req.user.id,
        existingSettlementId: settlementId,
        existingSaleId: settlement.saleId,
      });

      return tx.settlement.findUnique({
        where: { id: settlementId },
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

    res.json({ settlement: shapeSettlement(result), consignment: shapeConsignment(fullConsignment) });
  } catch (err) {
    res.status(err.status || 500).json({
        error: err.status ? err.message : 'Failed to update settlement',
      });
  }
});

module.exports = router;
module.exports.listQuery = listQuery;
module.exports.HISTORY_LIMIT = HISTORY_LIMIT;
