// Read-only data integrity check for a date window. Writes nothing, ever —
// it is safe to run against the live database while staff are using it.
//
//   node scripts/integrity-check.js
//   node scripts/integrity-check.js --from=2026-08-01 --to=2026-08-15
//   node scripts/integrity-check.js --stale-days=5
//
// Exit code 1 if anything at ERROR level was found, so a scheduled job can
// tell "nothing wrong" from "look at this". WARN and INFO never fail the run.
//
// The window is matched on the business date columns (Sale.date,
// DailyStockEntry.date), not createdAt. Those are calendar days at midnight
// UTC; createdAt is the instant a row was written, which for anything entered
// after 18:30 UTC belongs to the next business day and would land the row in
// the wrong report.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Same offset the app resolves "today" with (see backend/src/lib/stock.js and
// frontend/src/utils/date.js). A check that disagreed with the app about which
// day it is would report the current, still-being-worked day as missing.
const OFFSET_MINUTES = Number(process.env.BUSINESS_UTC_OFFSET_MINUTES || 330);

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function day(str) {
  const d = new Date(`${str}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a YYYY-MM-DD date: ${str}`);
  return d;
}

const iso = (d) => d.toISOString().slice(0, 10);
const businessToday = () => new Date(Date.now() + OFFSET_MINUTES * 60000).toISOString().slice(0, 10);

function daysBetween(from, to) {
  const out = [];
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(new Date(d));
  return out;
}

const issues = [];
const add = (level, check, message, detail) => issues.push({ level, check, message, detail });

// A store with no ledger row for a day did not report that day. The current
// day is excluded: it is still being worked, and every store looks missing
// first thing in the morning.
async function checkMissingStores(from, to) {
  const lastComplete = day(businessToday());
  lastComplete.setUTCDate(lastComplete.getUTCDate() - 1);
  const end = to < lastComplete ? to : lastComplete;
  if (end < from) {
    add('INFO', 'missing-stores', 'No completed days in the window yet.');
    return;
  }

  const [stores, rows] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.dailyStockEntry.groupBy({ by: ['storeId', 'date'], where: { date: { gte: from, lte: end } } }),
  ]);

  const reported = new Set(rows.map((r) => `${r.storeId}|${iso(r.date)}`));
  const gaps = [];
  for (const date of daysBetween(from, end)) {
    for (const store of stores) {
      if (!reported.has(`${store.id}|${iso(date)}`)) gaps.push(`${iso(date)}  ${store.name}`);
    }
  }

  if (!gaps.length) {
    add('INFO', 'missing-stores', `Every store reported on every day from ${iso(from)} to ${iso(end)}.`);
    return;
  }
  add('WARN', 'missing-stores', `${gaps.length} store-days with no ledger row (${stores.length} stores, ${iso(from)}..${iso(end)}).`, gaps);
}

// opening/closing are deliberately meaningless in this app — nothing is booked
// into stock before it is billed, so the running balance drifts negative as a
// matter of course (see the README).
//
// A negative `received` is NOT automatically wrong either, which this check
// originally got backwards and reported eleven healthy rows as errors.
// Settling a consignment books the unsold stock going back to HQ as a negative
// receipt on the settlement date (see applySettlement in routes/consignments.js
// and the note on `returned` in routes/stock.js), while the original delivery
// was a positive receipt on an earlier date. A store that took nothing in that
// day and sent something back therefore ends the day negative, correctly.
//
// What would be wrong is a negative that the day's CONSIGNMENT_UNSOLD returns
// do not account for: received + returnedToHq < 0 means something reduced
// receipts that was not stock going back. That is the error worth raising.
async function checkNegatives(from, to) {
  const [movements, oversettled, negativeClosings] = await Promise.all([
    prisma.$queryRaw`
      SELECT e.date, s.name AS store, p.name AS product,
             e.received, e.sold, e.wastage,
             COALESCE(r.qty, 0)::int AS returned_to_hq
      FROM "DailyStockEntry" e
      JOIN "Store" s   ON s.id = e."storeId"
      JOIN "Product" p ON p.id = e."productId"
      LEFT JOIN (
        SELECT "storeId", "productId", date, SUM(quantity) AS qty
        FROM "Return"
        WHERE reason = 'CONSIGNMENT_UNSOLD'
        GROUP BY "storeId", "productId", date
      ) r ON r."storeId" = e."storeId"
        AND r."productId" = e."productId"
        AND r.date = e.date
      WHERE e.date >= ${from} AND e.date <= ${to}
        AND (e.received < 0 OR e.sold < 0 OR e.wastage < 0)
      ORDER BY e.date, s.name, p.name`,
    // deliveredQty - soldQty - returnedQty < 0 needs arithmetic Prisma cannot
    // express in a where. The CHECK constraint should make this impossible;
    // asserting it costs one query and proves the constraint is still there.
    prisma.$queryRaw`
      SELECT ci.id, c."consignmentNo", p.name AS product,
             ci."deliveredQty", ci."soldQty", ci."returnedQty"
      FROM "ConsignmentItem" ci
      JOIN "Consignment" c ON c.id = ci."consignmentId"
      JOIN "Product" p ON p.id = ci."productId"
      WHERE ci."deliveredQty" - ci."soldQty" - ci."returnedQty" < 0`,
    prisma.dailyStockEntry.count({ where: { date: { gte: from, lte: to }, closing: { lt: 0 } } }),
  ]);

  const describe = (r) =>
    `${iso(r.date)}  ${r.store}  ${r.product}  received=${r.received} sold=${r.sold} wastage=${r.wastage} returnedToHq=${r.returned_to_hq}`;

  // Explained: the day's returns to HQ account for the whole negative, and
  // nothing else went below zero.
  const explained = movements.filter(
    (r) => r.sold >= 0 && r.wastage >= 0 && r.received + r.returned_to_hq >= 0
  );
  const unexplained = movements.filter((r) => !explained.includes(r));

  if (unexplained.length) {
    add('ERROR', 'negative-movements', `${unexplained.length} ledger rows have a negative movement the day's returns do not account for.`,
      unexplained.map(describe));
  }
  if (explained.length) {
    add('INFO', 'negative-received', `${explained.length} rows have a negative received, fully accounted for by unsold stock going back to HQ that day. This is how a settlement records a return — the gross figure is in the Returned column.`,
      explained.map(describe));
  }
  if (oversettled.length) {
    add('ERROR', 'oversettled-consignments', `${oversettled.length} consignment items are settled beyond what was delivered — the CHECK constraint should prevent this.`,
      oversettled.map((r) => `${r.consignmentNo}  ${r.product}  delivered=${r.deliveredQty} sold=${r.soldQty} returned=${r.returnedQty}`));
  }
  if (negativeClosings) {
    add('INFO', 'negative-closing', `${negativeClosings} rows have closing < 0. Expected: stock is not booked in before it is billed, so the running balance drifts negative and is not displayed anywhere.`);
  }
  if (!unexplained.length && !oversettled.length) {
    add('INFO', 'negative-movements', 'No unaccounted-for negative movements and no over-settled consignment items.');
  }
}

// Stock delivered and never reported back on. These are the rows that make a
// period report understate revenue: the goods left, and whether they sold is
// still unknown.
async function checkStaleConsignments(staleDays) {
  const cutoff = day(businessToday());
  cutoff.setUTCDate(cutoff.getUTCDate() - staleDays);

  const stale = await prisma.consignment.findMany({
    where: { status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] }, deliveredAt: { lt: cutoff } },
    include: { store: { select: { name: true } }, items: true },
    orderBy: { deliveredAt: 'asc' },
  });

  if (!stale.length) {
    add('INFO', 'stale-consignments', `Nothing delivered before ${iso(cutoff)} is still unsettled.`);
    return;
  }
  const value = (c) => c.items.reduce((sum, i) => sum + (i.deliveredQty - i.soldQty - i.returnedQty) * i.pricePerUnit, 0);
  const total = stale.reduce((sum, c) => sum + value(c), 0);
  add('WARN', 'stale-consignments', `${stale.length} consignments delivered more than ${staleDays} days ago are still unsettled, holding Rs.${total.toFixed(2)} of unreported stock.`,
    stale.map((c) => `${iso(c.deliveredAt)}  ${c.consignmentNo}  ${c.store.name}  ${c.status}  Rs.${value(c).toFixed(2)}`));
}

// The bug this app has already been bitten by: a bill saved at zero with stock
// correctly deducted and no error anywhere. Prices are resolved server-side
// now, but rows written before that are still in the table.
async function checkZeroPrice(from, to) {
  const [lines, bills] = await Promise.all([
    prisma.saleLine.findMany({
      where: {
        quantity: { gt: 0 },
        OR: [{ unitPrice: { lte: 0 } }, { amount: { lte: 0 } }],
        sale: { date: { gte: from, lte: to } },
      },
      include: {
        product: { select: { name: true } },
        sale: { select: { number: true, date: true, store: { select: { name: true } }, createdBy: { select: { name: true } } } },
      },
    }),
    prisma.sale.findMany({
      where: { date: { gte: from, lte: to }, totalAmount: { lte: 0 } },
      include: { store: { select: { name: true } }, createdBy: { select: { name: true } }, lines: true },
    }),
  ]);

  if (lines.length) {
    add('ERROR', 'zero-price-lines', `${lines.length} sale lines are priced at zero or less.`,
      lines.map((l) => `${iso(l.sale.date)}  ${l.sale.number}  ${l.sale.store.name}  ${l.product.name}  qty=${l.quantity} unit=${l.unitPrice} amount=${l.amount}  by ${l.sale.createdBy.name}`));
  }
  // An all-RETURN bill is legitimately zero or negative, so those are called
  // out separately rather than as an error.
  const suspicious = bills.filter((b) => b.lines.some((l) => l.type !== 'RETURN'));
  if (suspicious.length) {
    add('ERROR', 'zero-total-bills', `${suspicious.length} bills total zero or less while containing non-return lines.`,
      suspicious.map((b) => `${iso(b.date)}  ${b.number}  ${b.store.name}  total=${b.totalAmount}  by ${b.createdBy.name}`));
  }
  if (!lines.length && !suspicious.length) {
    add('INFO', 'zero-price', 'No zero-priced sale lines and no zero-total bills.');
  }
}

async function main() {
  const from = day(arg('from', '2026-08-01'));
  const to = day(arg('to', '2026-08-15'));
  const staleDays = Number(arg('stale-days', '7'));
  if (to < from) throw new Error('--to is before --from');

  await checkMissingStores(from, to);
  await checkNegatives(from, to);
  await checkStaleConsignments(staleDays);
  await checkZeroPrice(from, to);

  const errors = issues.filter((i) => i.level === 'ERROR');
  const warns = issues.filter((i) => i.level === 'WARN');

  console.log(`# Integrity check ${iso(from)} to ${iso(to)}`);
  console.log(`Run at ${new Date().toISOString()} (business day ${businessToday()}, UTC+${OFFSET_MINUTES}m)`);
  console.log(`${errors.length} error(s), ${warns.length} warning(s)\n`);

  for (const issue of issues) {
    console.log(`[${issue.level}] ${issue.check}: ${issue.message}`);
    // Long lists are truncated: the point of the file is to be read, and the
    // count above is the number that matters.
    if (issue.detail) {
      for (const line of issue.detail.slice(0, 40)) console.log(`    ${line}`);
      if (issue.detail.length > 40) console.log(`    … and ${issue.detail.length - 40} more`);
    }
  }

  if (errors.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(`[ERROR] integrity-check failed to run: ${err.message}`);
    process.exitCode = 2;
  })
  .finally(() => prisma.$disconnect());
