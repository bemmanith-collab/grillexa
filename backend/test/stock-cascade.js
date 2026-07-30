// The ledger stores each day's `opening` as a snapshot of the previous day's
// `closing`, so a write to a past date used to leave every later day stale —
// stock invented or destroyed, permanently, with no error. adjustStock now
// re-chains the days after the one it touched; this checks that it does.
//
// Run: npm test (from backend/). No database: prisma is faked below, because
// what's being checked is arithmetic over rows, not SQL.
const assert = require('assert');
const { normalizeDate, rechain, adjustStock } = require('../src/lib/stock');

// Just enough of the Prisma client for lib/stock.js — the four query shapes it
// actually issues. Dates are compared by time value, as Postgres would.
function fakeTx(seed = []) {
  let nextId = 1;
  const rows = seed.map((r) => ({
    id: nextId++,
    received: 0,
    sold: 0,
    wastage: 0,
    consignmentQty: 0,
    ...r,
    date: normalizeDate(r.date),
  }));
  const match = (row, storeId, productId) => row.storeId === storeId && row.productId === productId;

  return {
    rows,
    dailyStockEntry: {
      async findUnique({ where: { dailyEntryKey: k } }) {
        return rows.find((r) => match(r, k.storeId, k.productId) && +r.date === +k.date) || null;
      },
      async findFirst({ where: { storeId, productId, date } }) {
        return (
          rows
            .filter((r) => match(r, storeId, productId) && +r.date <= +date.lte)
            .sort((a, b) => b.date - a.date)[0] || null
        );
      },
      async findMany({ where: { storeId, productId, date } }) {
        return rows
          .filter((r) => match(r, storeId, productId) && +r.date > +date.gt)
          .sort((a, b) => a.date - b.date);
      },
      async create({ data }) {
        const row = { id: nextId++, ...data };
        rows.push(row);
        return row;
      },
      // Understands Prisma's { increment: n } as well as a plain value —
      // adjustStock writes increments so concurrent movements can't clobber
      // each other, and a fake that ignored that would test nothing real.
      async update({ where: { id }, data }) {
        const row = rows.find((r) => r.id === id);
        for (const [field, value] of Object.entries(data)) {
          row[field] =
            value && typeof value === 'object' && 'increment' in value
              ? (row[field] || 0) + value.increment
              : value;
        }
        return row;
      },
      async upsert({ where: { dailyEntryKey: k }, create }) {
        const found = rows.find((r) => match(r, k.storeId, k.productId) && +r.date === +k.date);
        if (found) return found;
        const row = { id: nextId++, ...create };
        rows.push(row);
        return row;
      },
    },
  };
}

const day = (tx, dateStr) => tx.rows.find((r) => +r.date === +normalizeDate(dateStr));

const tests = {
  // The exact scenario from the review: 20 in on the 28th, 5 sold on the 29th,
  // then 10 of wastage recorded against the 28th after the fact. Before the
  // cascade, the 29th kept saying closing 15 while the truth was 5.
  'back-dated wastage re-chains every later day': async () => {
    const tx = fakeTx([
      { date: '2026-07-28', storeId: 1, productId: 1, opening: 0, received: 20, closing: 20 },
      { date: '2026-07-29', storeId: 1, productId: 1, opening: 20, sold: 5, closing: 15 },
    ]);

    await adjustStock(tx, {
      storeId: 1,
      productId: 1,
      date: normalizeDate('2026-07-28'),
      wastageDelta: 10,
    });

    assert.strictEqual(day(tx, '2026-07-28').closing, 10, '28th closing');
    assert.strictEqual(day(tx, '2026-07-29').opening, 10, '29th opening must follow the 28th');
    assert.strictEqual(day(tx, '2026-07-29').closing, 5, '29th closing');
  },

  'the cascade spans a gap of several days': async () => {
    const tx = fakeTx([
      { date: '2026-07-01', storeId: 1, productId: 1, opening: 0, received: 100, closing: 100 },
      { date: '2026-07-05', storeId: 1, productId: 1, opening: 100, sold: 40, closing: 60 },
      { date: '2026-07-09', storeId: 1, productId: 1, opening: 60, sold: 10, wastage: 5, closing: 45 },
    ]);

    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-01'), soldDelta: 30 });

    assert.strictEqual(day(tx, '2026-07-01').closing, 70);
    assert.strictEqual(day(tx, '2026-07-05').opening, 70);
    assert.strictEqual(day(tx, '2026-07-05').closing, 30);
    assert.strictEqual(day(tx, '2026-07-09').opening, 30);
    assert.strictEqual(day(tx, '2026-07-09').closing, 15);
  },

  // consignmentQty is a running balance with no formula behind it, so it can
  // only shift by the delta applied — it must not be recomputed or reset.
  'a back-dated consignment delta shifts later balances by the same amount': async () => {
    const tx = fakeTx([
      { date: '2026-07-10', storeId: 1, productId: 1, opening: 50, closing: 50, consignmentQty: 0 },
      { date: '2026-07-11', storeId: 1, productId: 1, opening: 50, closing: 50, consignmentQty: 0 },
      { date: '2026-07-12', storeId: 1, productId: 1, opening: 50, closing: 50, consignmentQty: 8 },
    ]);

    await adjustStock(tx, {
      storeId: 1,
      productId: 1,
      date: normalizeDate('2026-07-10'),
      consignmentDelta: 12,
    });

    assert.strictEqual(day(tx, '2026-07-10').consignmentQty, 12);
    assert.strictEqual(day(tx, '2026-07-11').consignmentQty, 12);
    // Kept its own +8 on top of the shift rather than being overwritten.
    assert.strictEqual(day(tx, '2026-07-12').consignmentQty, 20);
  },

  'other stores and products are left alone': async () => {
    const tx = fakeTx([
      { date: '2026-07-28', storeId: 1, productId: 1, opening: 0, received: 20, closing: 20 },
      { date: '2026-07-29', storeId: 2, productId: 1, opening: 99, closing: 99 },
      { date: '2026-07-29', storeId: 1, productId: 2, opening: 77, closing: 77 },
    ]);

    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-28'), soldDelta: 5 });

    assert.strictEqual(tx.rows.find((r) => r.storeId === 2).closing, 99, 'other store untouched');
    assert.strictEqual(tx.rows.find((r) => r.productId === 2).closing, 77, 'other product untouched');
  },

  // The overwhelmingly common case — writing today, with nothing after it.
  'a write to the latest day still behaves as before': async () => {
    const tx = fakeTx([
      { date: '2026-07-28', storeId: 1, productId: 1, opening: 0, received: 20, closing: 20 },
    ]);

    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-29'), soldDelta: 5 });

    assert.strictEqual(tx.rows.length, 2, 'the missing day is created');
    assert.strictEqual(day(tx, '2026-07-29').opening, 20, 'opening carried from the 28th');
    assert.strictEqual(day(tx, '2026-07-29').closing, 15);
    assert.strictEqual(day(tx, '2026-07-28').closing, 20, 'the earlier day is not disturbed');
  },

  // Inserting a day between two existing ones must chain through it.
  'a back-dated row created between existing days re-chains the ones after it': async () => {
    const tx = fakeTx([
      { date: '2026-07-01', storeId: 1, productId: 1, opening: 0, received: 30, closing: 30 },
      { date: '2026-07-10', storeId: 1, productId: 1, opening: 30, sold: 10, closing: 20 },
    ]);

    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-05'), wastageDelta: 7 });

    assert.strictEqual(day(tx, '2026-07-05').opening, 30);
    assert.strictEqual(day(tx, '2026-07-05').closing, 23);
    assert.strictEqual(day(tx, '2026-07-10').opening, 23);
    assert.strictEqual(day(tx, '2026-07-10').closing, 13);
  },

  // How PATCH /consignments/:id works (routes/consignments.js): reverse the
  // original delivery at its old date, re-apply it at the new one. Both go
  // through adjustStock, so both cascade — the two must compose to a chain
  // that looks as if the delivery had always been on the new date.
  'moving a delivery from one date to another leaves a consistent chain': async () => {
    const tx = fakeTx([
      { date: '2026-07-01', storeId: 1, productId: 1, opening: 0, received: 40, closing: 40 },
      { date: '2026-07-02', storeId: 1, productId: 1, opening: 40, sold: 6, closing: 34 },
      { date: '2026-07-03', storeId: 1, productId: 1, opening: 34, sold: 4, closing: 30 },
    ]);

    // The 40 delivered on the 1st actually arrived on the 3rd.
    const move = { storeId: 1, productId: 1 };
    await adjustStock(tx, { ...move, date: normalizeDate('2026-07-01'), receivedDelta: -40, consignmentDelta: -40 });
    await adjustStock(tx, { ...move, date: normalizeDate('2026-07-03'), receivedDelta: 40, consignmentDelta: 40 });

    assert.strictEqual(day(tx, '2026-07-01').closing, 0, 'nothing received on the 1st any more');
    assert.strictEqual(day(tx, '2026-07-02').opening, 0);
    assert.strictEqual(day(tx, '2026-07-02').closing, -6, 'sold before it arrived, and the ledger says so');
    assert.strictEqual(day(tx, '2026-07-03').opening, -6);
    assert.strictEqual(day(tx, '2026-07-03').closing, 30, 'same final stock, now dated correctly');
    assert.strictEqual(day(tx, '2026-07-03').consignmentQty, 0, 'the -40 and +40 cancel out');
  },

  // PATCH /sales/:id reverses the original bill's stock before applying the
  // corrected one. If the reversal isn't exact, editing a bill quietly
  // invents or destroys stock — so: sell, reverse, and expect to land back
  // exactly where we started.
  'reversing a bill returns stock to where it was': async () => {
    const tx = fakeTx([
      { date: '2026-07-20', storeId: 1, productId: 1, opening: 0, received: 50, closing: 50 },
      { date: '2026-07-21', storeId: 1, productId: 1, opening: 50, closing: 50 },
    ]);
    const at = { storeId: 1, productId: 1, date: normalizeDate('2026-07-20') };

    // A bill for 12, then the same bill reversed.
    await adjustStock(tx, { ...at, soldDelta: 12 });
    assert.strictEqual(day(tx, '2026-07-20').closing, 38, 'sold 12 of 50');
    assert.strictEqual(day(tx, '2026-07-21').opening, 38, 'cascaded to the next day');

    await adjustStock(tx, { ...at, soldDelta: -12 });
    assert.strictEqual(day(tx, '2026-07-20').closing, 50, 'closing restored');
    assert.strictEqual(day(tx, '2026-07-20').sold, 0, 'sold restored, not left at 12');
    assert.strictEqual(day(tx, '2026-07-21').opening, 50, 'later days restored too');
  },

  // Editing a bill onto a different day must leave nothing behind on the old
  // one — the reversal happens at the original date, not the new one.
  'moving a bill to another day empties the day it left': async () => {
    const tx = fakeTx([
      { date: '2026-07-20', storeId: 1, productId: 1, opening: 0, received: 50, sold: 12, closing: 38 },
      { date: '2026-07-22', storeId: 1, productId: 1, opening: 38, closing: 38 },
    ]);

    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-20'), soldDelta: -12 });
    await adjustStock(tx, { storeId: 1, productId: 1, date: normalizeDate('2026-07-22'), soldDelta: 12 });

    assert.strictEqual(day(tx, '2026-07-20').sold, 0, 'nothing sold on the 20th any more');
    assert.strictEqual(day(tx, '2026-07-20').closing, 50);
    assert.strictEqual(day(tx, '2026-07-22').opening, 50);
    assert.strictEqual(day(tx, '2026-07-22').sold, 12, 'the sale now lands on the 22nd');
    assert.strictEqual(day(tx, '2026-07-22').closing, 38, 'same stock overall');
  },

  'rechain is a no-op on an already-consistent chain': async () => {
    const rows = [
      { opening: 20, received: 0, sold: 5, wastage: 0, closing: 15, consignmentQty: 3 },
      { opening: 15, received: 10, sold: 0, wastage: 2, closing: 23, consignmentQty: 3 },
    ];
    assert.deepStrictEqual(rechain(20, rows), rows);
  },
};

async function main() {
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (err) {
      console.error(`FAIL ${name}\n     ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log(process.exitCode ? '\nFAILED' : '\nall checks passed');
}

main();
