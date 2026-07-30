// One-off repair for ledger rows corrupted before adjustStock cascaded its
// changes forward. Every back-dated write (a settlement edit, a bill dated
// yesterday) left the days after it holding a stale `opening`, and the error
// compounds from there.
//
//   node scripts/recompute-ledger.js            # dry run, prints what differs
//   node scripts/recompute-ledger.js --apply    # writes, in one transaction
//
// Rebuilt from the ledger itself:
//   opening = previous day's closing (0 for a product's first day)
//   closing = opening + received - sold - wastage
// received/sold/wastage are per-day movements, not running balances, so they
// were never corrupted and are taken as recorded. Wastage in particular has no
// other source — it exists nowhere but this table.
//
// consignmentQty is a running balance with no formula, so it is rebuilt from
// the consignment tables instead: everything delivered to that store on or
// before the day, minus everything settled (sold or returned) on or before it.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const key = (storeId, productId) => `${storeId}|${productId}`;
const dayOf = (d) => d.toISOString().slice(0, 10);

// { "storeId|productId": [{ at: Date, delta: number }] } — the consignment
// movements the app applies via adjustStock's consignmentDelta.
async function loadConsignmentEvents() {
  const [items, lines] = await Promise.all([
    prisma.consignmentItem.findMany({ include: { consignment: true } }),
    prisma.settlementLine.findMany({
      include: { settlement: true, consignmentItem: { include: { consignment: true } } },
    }),
  ]);

  const events = new Map();
  const push = (storeId, productId, at, delta) => {
    if (!delta) return;
    const k = key(storeId, productId);
    if (!events.has(k)) events.set(k, []);
    events.get(k).push({ at, delta });
  };

  for (const item of items) {
    push(item.consignment.storeId, item.productId, item.consignment.deliveredAt, item.deliveredQty);
  }
  for (const line of lines) {
    const { consignment, productId } = line.consignmentItem;
    push(consignment.storeId, productId, line.settlement.settledAt, -(line.soldQty + line.returnedQty));
  }
  return events;
}

async function main() {
  const [entries, events] = await Promise.all([
    prisma.dailyStockEntry.findMany({ orderBy: [{ storeId: 'asc' }, { productId: 'asc' }, { date: 'asc' }] }),
    loadConsignmentEvents(),
  ]);

  const groups = new Map();
  for (const row of entries) {
    const k = key(row.storeId, row.productId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(row);
  }

  const fixes = [];
  for (const [k, rows] of groups) {
    const timeline = events.get(k) || [];
    let opening = 0;
    for (const row of rows) {
      const closing = opening + row.received - row.sold - row.wastage;
      const consignmentQty = timeline
        .filter((e) => e.at <= row.date)
        .reduce((sum, e) => sum + e.delta, 0);

      if (row.opening !== opening || row.closing !== closing || row.consignmentQty !== consignmentQty) {
        fixes.push({ row, opening, closing, consignmentQty });
      }
      opening = closing;
    }
  }

  console.log(`${entries.length} ledger rows across ${groups.size} store/product pairs`);
  if (fixes.length === 0) {
    console.log('Nothing to fix — the ledger is already consistent.');
    return;
  }

  console.log(`${fixes.length} rows differ:\n`);
  for (const f of fixes) {
    const parts = [];
    if (f.row.opening !== f.opening) parts.push(`opening ${f.row.opening} -> ${f.opening}`);
    if (f.row.closing !== f.closing) parts.push(`closing ${f.row.closing} -> ${f.closing}`);
    if (f.row.consignmentQty !== f.consignmentQty) {
      parts.push(`consignmentQty ${f.row.consignmentQty} -> ${f.consignmentQty}`);
    }
    console.log(
      `  ${dayOf(f.row.date)}  store ${f.row.storeId}  product ${f.row.productId}  ${parts.join(', ')}`
    );
  }

  const netClosing = fixes.reduce((sum, f) => sum + (f.closing - f.row.closing), 0);
  console.log(`\nNet change to recorded closing stock across all rows: ${netClosing > 0 ? '+' : ''}${netClosing} units`);

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to write these changes.');
    return;
  }

  await prisma.$transaction(
    fixes.map((f) =>
      prisma.dailyStockEntry.update({
        where: { id: f.row.id },
        data: { opening: f.opening, closing: f.closing, consignmentQty: f.consignmentQty },
      })
    )
  );
  console.log(`\nApplied ${fixes.length} row updates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
