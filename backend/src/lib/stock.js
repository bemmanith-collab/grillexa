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

// The business's calendar day, as YYYY-MM-DD. A bare toISOString() would give
// the server's UTC day, which rolls over at 05:30 IST and files an
// early-morning delivery under yesterday — so shift by the offset first.
//
// Deliberately arithmetic rather than toLocaleDateString('en-CA', {timeZone}):
// the runtime image installs Alpine's nodejs, whose ICU carries no en-CA data,
// so that call silently returns US-style "7/30/2026" and every date-taking
// endpoint 400s. India has never observed DST, so a fixed offset is exact.
const BUSINESS_UTC_OFFSET_MINUTES = Number(process.env.BUSINESS_UTC_OFFSET_MINUTES) || 330;

function todayStr() {
  return new Date(Date.now() + BUSINESS_UTC_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
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

  // upsert, not create: two first-bills-of-the-day for the same product at
  // one store both miss the findUnique above, and the loser of the race hits
  // the dailyEntryKey unique constraint — rolling back its whole transaction
  // and losing a bill that was already rung up. `update: {}` makes the
  // conflict a no-op read instead.
  return tx.dailyStockEntry.upsert({
    where: { dailyEntryKey: { date, storeId, productId } },
    create: { date, storeId, productId, opening, received: 0, sold: 0, wastage: 0, closing: opening, consignmentQty },
    update: {},
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

  // Written as increments rather than absolute totals. Read-then-write loses
  // one of two concurrent movements: both transactions read sold=0, both
  // write sold=qty, and the second silently overwrites the first — two bills
  // recorded, one deduction. The closing formula is linear in the deltas, so
  // incrementing it by the same amount keeps it exact.
  const updated = await tx.dailyStockEntry.update({
    where: { id: entry.id },
    data: {
      received: { increment: receivedDelta },
      sold: { increment: soldDelta },
      wastage: { increment: wastageDelta },
      consignmentQty: { increment: consignmentDelta },
      closing: { increment: receivedDelta - soldDelta - wastageDelta },
    },
  });
  const closing = updated.closing;

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

module.exports = { badRequest, normalizeDate, previousDay, todayStr, rechain, getOrCreateDailyEntry, adjustStock, processReturn };
