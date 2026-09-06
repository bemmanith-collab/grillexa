// Settle every consignment still outstanding that was delivered strictly
// before a cutoff day, in
// one pass, all remaining quantity as sold or all as returned. Runs the same
// applySettlement the Settle screen uses, one transaction per consignment,
// so the ledger, Sale, Return and Settlement rows come out exactly as if
// someone had settled each one by hand.
//
//   node scripts/bulk-settle.js --before=2026-08-31 --as=sold            # dry run
//   node scripts/bulk-settle.js --before=2026-08-31 --as=sold --apply    # writes
//
//   --before=YYYY-MM-DD  consignments delivered strictly before this day (required)
//   --as=sold|returned   what the remaining quantity becomes (required)
//   --date=YYYY-MM-DD    settlement/sale date (default: --before)
//   --user=email         who the settlements are recorded by (default: first ADMIN)
//   --apply              actually write; without it only the summary prints
//
// Sold recognises revenue (a Sale per consignment); returned recognises none.
// That is a business decision, which is why --as has no default.
require('dotenv').config();
const prisma = require('../src/db');
const { normalizeDate } = require('../src/lib/stock');
const { applySettlement } = require('../src/routes/consignments');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const APPLY = process.argv.includes('--apply');
const before = arg('before');
const as = arg('as');
if (!before || !['sold', 'returned'].includes(as)) {
  console.error('usage: --before=YYYY-MM-DD --as=sold|returned [--date=YYYY-MM-DD] [--user=email] [--apply]');
  process.exit(2);
}
const cutoff = normalizeDate(before);
const settleDate = normalizeDate(arg('date') || before);
const inr = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const user = arg('user')
    ? await prisma.user.findUnique({ where: { email: arg('user') } })
    : await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });
  if (!user) throw new Error('no user to record the settlements under');

  const consignments = await prisma.consignment.findMany({
    where: { status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] }, deliveredAt: { lt: cutoff } },
    include: { items: true, store: { select: { name: true } } },
    orderBy: { deliveredAt: 'asc' },
  });

  const plan = [];
  for (const c of consignments) {
    const preparedLines = c.items
      .map((item) => ({ item, remaining: item.deliveredQty - item.soldQty - item.returnedQty }))
      .filter((l) => l.remaining > 0)
      .map(({ item, remaining }) => ({
        item,
        soldQty: as === 'sold' ? remaining : 0,
        returnedQty: as === 'returned' ? remaining : 0,
      }));
    if (preparedLines.length) plan.push({ consignment: c, preparedLines });
  }

  const qty = plan.reduce((s, p) => s + p.preparedLines.reduce((t, l) => t + l.soldQty + l.returnedQty, 0), 0);
  const value = plan.reduce((s, p) => s + p.preparedLines.reduce((t, l) => t + (l.soldQty + l.returnedQty) * l.item.pricePerUnit, 0), 0);
  const byStore = new Map();
  for (const p of plan) byStore.set(p.consignment.store.name, (byStore.get(p.consignment.store.name) || 0) + 1);

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: ${plan.length} consignments delivered before ${before}, all remaining as ${as.toUpperCase()}`);
  console.log(`  ${qty} units, ${inr(value)} at consignment price${as === 'sold' ? ' (becomes revenue)' : ' (no revenue)'}`);
  console.log(`  settlement date ${settleDate.toISOString().slice(0, 10)}, recorded by ${user.email}`);
  if (consignments.length !== plan.length) console.log(`  ${consignments.length - plan.length} outstanding consignments have nothing remaining and are skipped`);
  for (const [name, n] of [...byStore].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name}`);
  if (!APPLY) return;

  let done = 0;
  for (const { consignment, preparedLines } of plan) {
    await prisma.$transaction((tx) =>
      applySettlement(tx, {
        consignment, preparedLines, normalizedDate: settleDate,
        notes: `Bulk settlement: everything delivered before ${before} recorded as ${as}`,
        userId: user.id, existingSettlementId: null, existingSaleId: null,
      })
    );
    done += 1;
    if (done % 50 === 0 || done === plan.length) console.log(`  settled ${done}/${plan.length}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
