// The all-stores view on Today's Stock adds up thirty stores into one sheet.
// Two things it has to get right, and neither shows up as an error when it's
// wrong — just a number that's quietly too low:
//   - a product nothing happened to today still needs a (zeroed) row
//   - a store that had no activity today is still holding consignment stock,
//     so its balance is carried forward rather than dropped
//
// Run: npm test (from backend/). No database: rollUp is the arithmetic half,
// fed the row shapes Prisma would return.
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { normalizeDate } = require('../src/lib/stock');
const { rollUp, valueOf } = require('../src/routes/stock');

const date = normalizeDate('2026-08-01');
const products = [
  { id: 1, name: 'Peri Peri Chicken' },
  { id: 2, name: 'Smoked Paprika Wings' },
  { id: 3, name: 'Garlic Naan' },
];

function run({ movements = [], outstanding = [], returned = new Map() }) {
  return rollUp({ products, date, movements, outstanding, returned });
}

const tests = {
  'every product gets a row, zero-filled when nothing moved': () => {
    const entries = run({});
    assert.strictEqual(entries.length, 3);
    assert.deepStrictEqual(
      entries.map((e) => [e.received, e.sold, e.returned, e.wastage, e.consignmentQty]),
      [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ]
    );
  },

  "a day's movements are the grouped totals across stores": () => {
    const entries = run({
      movements: [{ productId: 2, _sum: { received: 120, sold: 95, wastage: 4 } }],
      returned: new Map([[2, 11]]),
    });
    const wings = entries.find((e) => e.productId === 2);
    assert.strictEqual(wings.received, 120);
    assert.strictEqual(wings.sold, 95);
    assert.strictEqual(wings.returned, 11);
    assert.strictEqual(wings.wastage, 4);
  },

  'consignment balances sum across every store holding stock': () => {
    // Three stores still holding the same product — 8 + 5 + 2 units out there.
    const entries = run({
      outstanding: [
        { productId: 1, consignmentQty: 8 },
        { productId: 1, consignmentQty: 5 },
        { productId: 1, consignmentQty: 2 },
        { productId: 3, consignmentQty: 4 },
      ],
    });
    assert.strictEqual(entries.find((e) => e.productId === 1).consignmentQty, 15);
    assert.strictEqual(entries.find((e) => e.productId === 3).consignmentQty, 4);
  },

  'a store idle today still contributes its carried-forward consignment stock': () => {
    // Only store A moved today; store B's balance came from an earlier date.
    // Dropping it would understate what's actually out on the route.
    const entries = run({
      movements: [{ productId: 1, _sum: { received: 0, sold: 6, wastage: 0 } }],
      outstanding: [
        { productId: 1, consignmentQty: 10 },
        { productId: 1, consignmentQty: 7 },
      ],
    });
    const row = entries.find((e) => e.productId === 1);
    assert.strictEqual(row.sold, 6);
    assert.strictEqual(row.consignmentQty, 17);
  },

  'returns are reported gross, not netted into supplied': () => {
    // Settlement books stock going back to HQ as a negative receipt, so
    // `received` is already net of it. Returned is the separate gross figure
    // that explains why — subtracting it again would double-count.
    const entries = run({
      movements: [{ productId: 3, _sum: { received: 40 - 9, sold: 25, wastage: 0 } }],
      returned: new Map([[3, 9]]),
    });
    const row = entries.find((e) => e.productId === 3);
    assert.strictEqual(row.received, 31);
    assert.strictEqual(row.returned, 9);
  },

  'consignment value counts only what is still unsettled': () => {
    // 20 delivered, 12 sold, 3 returned to HQ -> 5 still out at 40.00.
    assert.strictEqual(
      valueOf([{ deliveredQty: 20, soldQty: 12, returnedQty: 3, pricePerUnit: 40 }]),
      200
    );
  },

  'a fully settled line is worth nothing, never negative': () => {
    assert.strictEqual(
      valueOf([
        { deliveredQty: 10, soldQty: 10, returnedQty: 0, pricePerUnit: 55.5 },
        { deliveredQty: 8, soldQty: 0, returnedQty: 8, pricePerUnit: 12.25 },
      ]),
      0
    );
  },

  'value sums across every open line, at each line\'s own price': () => {
    // The point of the fix: this is the whole set, not a capped page of it,
    // and each line keeps the price it was delivered at.
    const items = Array.from({ length: 250 }, () => ({
      deliveredQty: 6,
      soldQty: 2,
      returnedQty: 0,
      pricePerUnit: 10,
    }));
    assert.strictEqual(valueOf(items), 250 * 4 * 10);
  },
};

for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(process.exitCode ? '\nFAILED' : '\nall checks passed');
