// Undo one bulk-settle run. Finds every settlement carrying that run's exact
// note, reverses it through the route's own reverseSettlement (stock, the
// CONSIGNMENT_UNSOLD Return rows, the soldQty/returnedQty it added), deletes
// the Sale and Settlement rows it created, and puts each consignment back to
// whatever status its remaining history says it should have.
//
//   node scripts/unbulk-settle.js --before=2026-10-10 --as=sold            # dry run
//   node scripts/unbulk-settle.js --before=2026-10-10 --as=sold --apply    # writes
//
//   --before / --as      the SAME values the bulk-settle run used (required)
//   --apply              actually write; without it only the summary prints
//
// --before and --as are how the run is identified: they rebuild the exact note
// string bulk-settle wrote, so only that run is touched and a hand settlement
// with a real note can never be caught by accident.
//
// Undoing is destructive in a way settling is not: the Sale and Settlement
// rows are deleted outright, so their SL-/ST- numbers are gone for good and
// the sequence keeps counting from where it was. That is the intended
// behaviour of an undo, but it is not reversible in turn.
require('dotenv').config();
const prisma = require('../src/db');
const { reverseSettlement } = require('../src/routes/consignments');

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1];
const APPLY = process.argv.includes('--apply');
const before = arg('before');
const as = arg('as');
if (!before || !['sold', 'returned'].includes(as)) {
  console.error('usage: --before=YYYY-MM-DD --as=sold|returned [--apply]');
  process.exit(2);
}
// Must match bulk-settle.js exactly, or this finds nothing.
const marker = `Bulk settlement: everything delivered before ${before} recorded as ${as}`;
const inr = (n) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function main() {
  const settlements = await prisma.settlement.findMany({
    where: { notes: marker },
    include: {
      lines: { include: { consignmentItem: true } },
      consignment: { include: { store: { select: { name: true } } } },
      sale: { select: { id: true, number: true, totalAmount: true } },
    },
    // Newest first, so cumulative quantities unwind in the reverse of the
    // order they were applied.
    orderBy: { id: 'desc' },
  });

  const qty = settlements.reduce((s, st) => s + st.lines.reduce((t, l) => t + l.soldQty + l.returnedQty, 0), 0);
  const saleValue = settlements.reduce((s, st) => s + (st.sale?.totalAmount || 0), 0);
  const withSale = settlements.filter((st) => st.sale).length;
  const byStore = new Map();
  for (const st of settlements) {
    const name = st.consignment.store.name;
    byStore.set(name, (byStore.get(name) || 0) + 1);
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}: undoing ${settlements.length} settlements noted "${marker}"`);
  console.log(`  ${qty} units returned to outstanding, ${withSale} Sale rows deleted worth ${inr(saleValue)}`);
  if (!settlements.length) {
    console.log('  nothing matches that note — check --before and --as match the run you want undone');
    return;
  }
  for (const [name, n] of [...byStore].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${name}`);
  if (!APPLY) return;

  let done = 0;
  for (const settlement of settlements) {
    await prisma.$transaction(async (tx) => {
      await reverseSettlement(tx, { consignment: settlement.consignment, settlement });

      if (settlement.saleId) {
        await tx.saleLine.deleteMany({ where: { saleId: settlement.saleId } });
        await tx.sale.delete({ where: { id: settlement.saleId } });
      }
      await tx.settlementLine.deleteMany({ where: { settlementId: settlement.id } });
      await tx.settlement.delete({ where: { id: settlement.id } });

      // Same recomputation applySettlement ends on, so a consignment that had
      // earlier settlements goes back to PARTIAL_SETTLED rather than DELIVERED.
      const items = await tx.consignmentItem.findMany({ where: { consignmentId: settlement.consignmentId } });
      const totalDelivered = items.reduce((sum, i) => sum + i.deliveredQty, 0);
      const totalSettled = items.reduce((sum, i) => sum + i.soldQty + i.returnedQty, 0);
      const totalSold = items.reduce((sum, i) => sum + i.soldQty, 0);
      let status = 'PARTIAL_SETTLED';
      if (totalSettled === 0) status = 'DELIVERED';
      else if (totalSettled >= totalDelivered) status = totalSold === 0 ? 'RETURNED' : 'SETTLED';

      await tx.consignment.update({
        where: { id: settlement.consignmentId },
        data: { status, settledAt: status === 'SETTLED' || status === 'RETURNED' ? settlement.settledAt : null },
      });
    });
    done += 1;
    if (done % 50 === 0 || done === settlements.length) console.log(`  undone ${done}/${settlements.length}`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
