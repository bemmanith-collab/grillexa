// Take consignments off the waiting list without settling what is left:
// status becomes CLOSED, and nothing else changes — no Settlement, no Sale,
// no Return, no stock ledger movement. For clearing a backlog nobody is going
// to settle item by item. (To settle the remainder as sold or returned, use
// scripts/bulk-settle.js instead.)
//
//   node scripts/close-consignments.js --through=2026-11-15            # dry run
//   node scripts/close-consignments.js --through=2026-11-15 --apply    # writes
//
//   --through=YYYY-MM-DD  consignments delivered on or before this day (required)
//   --verbose             list every consignment
//   --apply               actually write; without it only the summary prints
require('dotenv').config();
const prisma = require('../src/db');
const { normalizeDate } = require('../src/lib/stock');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
if (!arg('through')) {
  console.error('usage: --through=YYYY-MM-DD [--verbose] [--apply]');
  process.exit(2);
}
const through = normalizeDate(arg('through'));
const inr = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const open = await prisma.consignment.findMany({
    where: { status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] }, deliveredAt: { lte: through } },
    include: { items: true, store: { select: { name: true } } },
    orderBy: { deliveredAt: 'asc' },
  });

  let units = 0;
  let value = 0;
  const byStatus = {};
  for (const c of open) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const left = c.items.reduce((t, i) => t + (i.deliveredQty - i.soldQty - i.returnedQty), 0);
    const leftValue = c.items.reduce((t, i) => t + (i.deliveredQty - i.soldQty - i.returnedQty) * i.pricePerUnit, 0);
    units += left;
    value += leftValue;
    if (VERBOSE) {
      console.log(`  ${c.consignmentNo}  ${c.deliveredAt.toISOString().slice(0, 10)}  ${c.status.padEnd(15)} ${String(left).padStart(4)} units left  ${c.store.name}`);
    }
  }

  const days = open.length ? `${open[0].deliveredAt.toISOString().slice(0, 10)} to ${open.at(-1).deliveredAt.toISOString().slice(0, 10)}` : '—';
  console.log(`${open.length} consignments delivered ${days}: ${JSON.stringify(byStatus)}`);
  console.log(`${units} units still at stores, ${inr(value)} at consignment price — left as they are.`);

  if (!APPLY) {
    console.log('Dry run. Add --apply to close them.');
    return;
  }
  const { count } = await prisma.consignment.updateMany({
    where: { id: { in: open.map((c) => c.id) }, status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] } },
    data: { status: 'CLOSED' },
  });
  console.log(`Closed ${count}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
