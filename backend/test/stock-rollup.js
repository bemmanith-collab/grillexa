// The all-stores view on Today's Stock adds up thirty stores into one sheet.
// Things it has to get right, none of which show up as an error when they're
// wrong — just a number that's quietly too low:
//   - a product nothing happened to today still needs a (zeroed) row
//   - a store that was idle today is still holding consignment stock
//   - the units column and the value card have to come from one source, or
//     they drift apart and nothing on screen says which one to believe
//
// Run: npm test (from backend/). No database: these are the arithmetic halves,
// fed the row shapes Prisma would return.
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { normalizeDate } = require('../src/lib/stock');
const { rollUp, unitsOf, valueOf } = require('../src/routes/stock');

const date = normalizeDate('2026-08-01');
const products = [
  { id: 1, name: 'Peri Peri Chicken' },
  { id: 2, name: 'Smoked Paprika Wings' },
  { id: 3, name: 'Garlic Naan' },
];

function run({ movements = [], onConsignment = new Map(), returned = new Map() }) {
  return rollUp({ products, date, movements, onConsignment, returned });
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

  'consignment units sum across every store holding stock': () => {
    // Three stores still holding the same product — 8 + 5 + 2 units out there.
    const entries = run({
      onConsignment: unitsOf([
        { productId: 1, deliveredQty: 8, soldQty: 0, returnedQty: 0, pricePerUnit: 10 },
        { productId: 1, deliveredQty: 10, soldQty: 5, returnedQty: 0, pricePerUnit: 10 },
        { productId: 1, deliveredQty: 6, soldQty: 2, returnedQty: 2, pricePerUnit: 10 },
        { productId: 3, deliveredQty: 4, soldQty: 0, returnedQty: 0, pricePerUnit: 10 },
      ]),
    });
    assert.strictEqual(entries.find((e) => e.productId === 1).consignmentQty, 15);
    assert.strictEqual(entries.find((e) => e.productId === 3).consignmentQty, 4);
  },

  'a store idle today still shows the stock it is holding': () => {
    // Only store A moved today; store B has an open consignment and no ledger
    // row at all. Dropping it would understate what's out on the route.
    const entries = run({
      movements: [{ productId: 1, _sum: { received: 0, sold: 6, wastage: 0 } }],
      onConsignment: unitsOf([
        { productId: 1, deliveredQty: 16, soldQty: 6, returnedQty: 0, pricePerUnit: 10 },
        { productId: 1, deliveredQty: 7, soldQty: 0, returnedQty: 0, pricePerUnit: 10 },
      ]),
    });
    const row = entries.find((e) => e.productId === 1);
    assert.strictEqual(row.sold, 6);
    assert.strictEqual(row.consignmentQty, 17);
  },

  'the units column and the value card cannot disagree': () => {
    // The regression this guards: two counters for one fact. Both are read
    // off the same items, so at a flat price the totals have to reconcile.
    const items = [
      { productId: 1, deliveredQty: 20, soldQty: 12, returnedQty: 3, pricePerUnit: 40 },
      { productId: 1, deliveredQty: 9, soldQty: 0, returnedQty: 4, pricePerUnit: 40 },
      { productId: 2, deliveredQty: 15, soldQty: 15, returnedQty: 0, pricePerUnit: 40 },
    ];
    const entries = run({ onConsignment: unitsOf(items) });
    const totalUnits = entries.reduce((sum, e) => sum + e.consignmentQty, 0);
    assert.strictEqual(totalUnits, 10);
    assert.strictEqual(valueOf(items), totalUnits * 40);
  },

  'each item keeps its own delivered price in the value': () => {
    // Same product, two deliveries, two prices — the value has to follow each
    // item rather than any single per-product price.
    const items = [
      { productId: 1, deliveredQty: 10, soldQty: 0, returnedQty: 0, pricePerUnit: 100 },
      { productId: 1, deliveredQty: 10, soldQty: 0, returnedQty: 0, pricePerUnit: 90 },
    ];
    assert.strictEqual(unitsOf(items).get(1), 20);
    assert.strictEqual(valueOf(items), 1900);
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
    const items = [{ productId: 1, deliveredQty: 20, soldQty: 12, returnedQty: 3, pricePerUnit: 40 }];
    assert.strictEqual(valueOf(items), 200);
    assert.strictEqual(unitsOf(items).get(1), 5);
  },

  'a fully settled line is worth nothing, never negative': () => {
    const items = [
      { productId: 1, deliveredQty: 10, soldQty: 10, returnedQty: 0, pricePerUnit: 55.5 },
      { productId: 2, deliveredQty: 8, soldQty: 0, returnedQty: 8, pricePerUnit: 12.25 },
    ];
    assert.strictEqual(valueOf(items), 0);
    assert.strictEqual(unitsOf(items).get(1), 0);
    assert.strictEqual(unitsOf(items).get(2), 0);
  },

  'totals span every open line, not a capped page of them': () => {
    // The 200-row cap this replaced would have stopped counting here.
    const items = Array.from({ length: 250 }, () => ({
      productId: 1,
      deliveredQty: 6,
      soldQty: 2,
      returnedQty: 0,
      pricePerUnit: 10,
    }));
    assert.strictEqual(unitsOf(items).get(1), 250 * 4);
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
