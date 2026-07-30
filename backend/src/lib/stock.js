// Shared helpers for the daily stock ledger. A "day" is always stored as a
// UTC-midnight DateTime keyed by (date, storeId, productId).

// Throws with status 400 so a bad date from a query string or body surfaces as
// a validation error rather than a 500 — several callers pass user input
// straight in without a try/catch.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function normalizeDate(dateStr) {
  if (typeof dateStr !== 'string' || !dateStr) throw badRequest('date is required');
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw badRequest('date must be a valid YYYY-MM-DD string');
  return date;
}

function previousDay(date) {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev;
}

// The business's calendar day, as YYYY-MM-DD. Not toISOString(): the server
// runs in UTC, so that rolls over at 05:30 IST and would file an early-morning
// movement under yesterday. en-CA's short format is already YYYY-MM-DD; the
// explicit timeZone is what makes this the business's day, not the server's.
const BUSINESS_TZ = process.env.BUSINESS_TZ || 'Asia/Kolkata';

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: BUSINESS_TZ });
}

// Re-chains a run of ledger rows onto a new starting balance. Pure, so the
// arithmetic can be checked without a database — see test/stock-cascade.js.
// consignmentQty has no formula to recompute from (only the running balance is
// stored, not the day's delta), so it shifts by whatever this write applied:
// a delta of X on day D moves the balance for every later day by exactly X.
function rechain(openingFrom, rows, consignmentDelta = 0) {
  let opening = openingFrom;
  return rows.map((row) => {
    const closing = opening + row.received - row.sold - row.wastage;
    const rechained = { ...row, opening, closing, consignmentQty: row.consignmentQty + consignmentDelta };
    opening = closing;
    return rechained;
  });
}

// Returns the ledger row for (date, storeId, productId), creating it (with
// opening = previous day's closing, or 0 if there's no history yet) if needed.
// consignmentQty is carried forward the same way opening is — it's a running
// balance (how much of this store's stock is still on consignment, delivered
// but not yet settled), not a fresh-per-day delta like received/sold/wastage.
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
  const consignmentQty = prevEntry ? prevEntry.consignmentQty : 0;

  return tx.dailyStockEntry.create({
    data: { date, storeId, productId, opening, received: 0, sold: 0, wastage: 0, closing: opening, consignmentQty },
  });
}

// Applies a delta (positive or negative) to received/sold/wastage for a
// given day and recomputes closing. Billing (Sales/Returns) is intentionally
// decoupled from inventory enforcement — a bill is never rejected for
// insufficient recorded stock, so closing can go negative when stock wasn't
// (yet) dispatched/recorded. The movement is still written to the ledger so
// history is preserved if strict inventory tracking is turned back on later.
// consignmentDelta adjusts the running consignmentQty balance directly —
// it's independent of the closing formula above (see the Consignment model
// and /consignments routes for how it's used).
async function adjustStock(tx, { storeId, productId, date, receivedDelta = 0, soldDelta = 0, wastageDelta = 0, consignmentDelta = 0 }) {
  const entry = await getOrCreateDailyEntry(tx, storeId, productId, date);
  const received = entry.received + receivedDelta;
  const sold = entry.sold + soldDelta;
  const wastage = entry.wastage + wastageDelta;
  const closing = entry.opening + received - sold - wastage;
  const consignmentQty = entry.consignmentQty + consignmentDelta;

  const updated = await tx.dailyStockEntry.update({
    where: { id: entry.id },
    data: { received, sold, wastage, closing, consignmentQty },
  });

  // Every later day's opening was snapshotted from this day's closing, so a
  // write to a past date leaves the whole rest of the chain stale — the app
  // invites exactly that with a free date picker on every form, and a
  // settlement edit reverses stock at the *original* settledAt. Without this,
  // amending yesterday silently invents or destroys stock from today on.
  const later = await tx.dailyStockEntry.findMany({
    where: { storeId, productId, date: { gt: date } },
    orderBy: { date: 'asc' },
  });
  for (const row of rechain(closing, later, consignmentDelta)) {
    await tx.dailyStockEntry.update({
      where: { id: row.id },
      data: { opening: row.opening, closing: row.closing, consignmentQty: row.consignmentQty },
    });
  }

  return updated;
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

module.exports = { normalizeDate, previousDay, todayStr, rechain, getOrCreateDailyEntry, adjustStock, processReturn };
