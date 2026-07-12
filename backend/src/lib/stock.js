// Shared helpers for the daily stock ledger. A "day" is always stored as a
// UTC-midnight DateTime keyed by (date, storeId, productId).

function normalizeDate(dateStr) {
  if (!dateStr) throw new Error('date is required');
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('date must be a valid YYYY-MM-DD string');
  return date;
}

function previousDay(date) {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev;
}

// Returns the ledger row for (date, storeId, productId), creating it (with
// opening = previous day's closing, or 0 if there's no history yet) if needed.
// Must be called with a Prisma transaction client so creation is race-free.
async function getOrCreateDailyEntry(tx, storeId, productId, date) {
  const existing = await tx.dailyStockEntry.findUnique({
    where: { dailyEntryKey: { date, storeId, productId } },
  });
  if (existing) return existing;

  const prevEntry = await tx.dailyStockEntry.findFirst({
    where: { storeId, productId, date: { lte: previousDay(date) } },
    orderBy: { date: 'desc' },
  });
  const opening = prevEntry ? prevEntry.closing : 0;

  return tx.dailyStockEntry.create({
    data: { date, storeId, productId, opening, received: 0, sold: 0, wastage: 0, closing: opening },
  });
}

// Applies a delta (positive or negative) to received/sold/wastage for a
// given day and recomputes closing. Billing (Sales/Returns) is intentionally
// decoupled from inventory enforcement — a bill is never rejected for
// insufficient recorded stock, so closing can go negative when stock wasn't
// (yet) dispatched/recorded. The movement is still written to the ledger so
// history is preserved if strict inventory tracking is turned back on later.
async function adjustStock(tx, { storeId, productId, date, receivedDelta = 0, soldDelta = 0, wastageDelta = 0 }) {
  const entry = await getOrCreateDailyEntry(tx, storeId, productId, date);
  const received = entry.received + receivedDelta;
  const sold = entry.sold + soldDelta;
  const wastage = entry.wastage + wastageDelta;
  const closing = entry.opening + received - sold - wastage;

  return tx.dailyStockEntry.update({
    where: { id: entry.id },
    data: { received, sold, wastage, closing },
  });
}

// A return credits the full quantity back to closing stock. It first
// reverses today's recorded sales (so "Units Sold Today" reflects the
// return, as requested) up to however much was actually sold today, and
// treats anything beyond that — e.g. a return of stock sold on an earlier
// day — as newly received stock re-entering inventory. This way `sold`
// never goes negative but the store still gets full credit for the return.
async function processReturn(tx, { storeId, productId, date, quantity }) {
  const entry = await getOrCreateDailyEntry(tx, storeId, productId, date);
  const soldReduction = Math.min(quantity, entry.sold);
  const overflow = quantity - soldReduction;
  return adjustStock(tx, { storeId, productId, date, soldDelta: -soldReduction, receivedDelta: overflow });
}

module.exports = { normalizeDate, previousDay, getOrCreateDailyEntry, adjustStock, processReturn };
