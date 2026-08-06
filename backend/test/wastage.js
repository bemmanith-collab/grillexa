// End-of-shift wastage: the validation and the summary, without a database.
//
// The thing worth protecting here is that a blank is not an error. The modal
// posts every product in the catalogue and most of them are empty — a rule
// that treated a blank as a zero, or as invalid, would either write dozens of
// junk rows every shift or refuse every submission.
const assert = require('assert');
const { REASONS, validateLines, summarize } = require('../src/lib/wastage');

function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('wastage');

const productIds = new Set([1, 2, 3]);

check('blank products are skipped, counted ones are kept', () => {
  const { lines, error } = validateLines(
    [
      { productId: 1, quantity: '', reason: 'SPOILED' },
      { productId: 2, quantity: '4', reason: 'EXPIRED' },
      { productId: 3, quantity: null, reason: 'SPOILED' },
    ],
    productIds
  );
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(lines, [{ productId: 2, quantity: 4, reason: 'EXPIRED' }]);
});

check('a zero is treated as "none of this spoiled", not as a row', () => {
  const { lines } = validateLines(
    [
      { productId: 1, quantity: 0, reason: 'SPOILED' },
      { productId: 2, quantity: 2, reason: 'SPOILED' },
    ],
    productIds
  );
  assert.deepStrictEqual(lines, [{ productId: 2, quantity: 2, reason: 'SPOILED' }]);
});

check('nothing counted at all is an error, not an empty write', () => {
  const { error } = validateLines([{ productId: 1, quantity: '' }], productIds);
  assert.match(error, /at least one product/);
});

check('a fractional count is refused before it reaches an Int column', () => {
  // The per-store form used to let this through and return a bare 500.
  const { error } = validateLines([{ productId: 1, quantity: 2.5 }], productIds);
  assert.match(error, /whole number/);
});

check('a negative count is refused', () => {
  const { error } = validateLines([{ productId: 1, quantity: -3 }], productIds);
  assert.match(error, /negative/);
});

check('there is deliberately no upper bound on a count', () => {
  // No HQ stock is tracked, so there is nothing to cap against. A big number
  // is a surprising count, not an invalid one, and refusing it would lose a
  // real figure.
  const { lines, error } = validateLines([{ productId: 1, quantity: 99999 }], productIds);
  assert.strictEqual(error, undefined);
  assert.strictEqual(lines[0].quantity, 99999);
});

check('an unknown product is refused', () => {
  const { error } = validateLines([{ productId: 77, quantity: 1 }], productIds);
  assert.match(error, /does not exist/);
});

check('an unknown reason is refused, and a missing one defaults', () => {
  assert.match(validateLines([{ productId: 1, quantity: 1, reason: 'MOOD' }], productIds).error, /Reason/);
  const { lines } = validateLines([{ productId: 1, quantity: 1 }], productIds);
  assert.strictEqual(lines[0].reason, 'OTHER');
  assert.ok(REASONS.includes(lines[0].reason));
});

check('the same product twice is refused rather than double-counted', () => {
  const { error } = validateLines(
    [
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 3 },
    ],
    productIds
  );
  assert.match(error, /twice/);
});

check('the summary values wastage at cost and keeps the reason split', () => {
  // At cost, not the selling price — it is stock paid for and never sold, the
  // same rule the store-wastage figures in analytics.js use.
  const rows = [
    { productId: 1, quantity: 4, reason: 'SPOILED', product: { name: 'Green sprouts', costPrice: 10 } },
    { productId: 1, quantity: 2, reason: 'EXPIRED', product: { name: 'Green sprouts', costPrice: 10 } },
    { productId: 2, quantity: 1, reason: 'DAMAGED', product: { name: 'Banana', costPrice: 5 } },
  ];
  const summary = summarize(rows);
  assert.strictEqual(summary.totalQuantity, 7);
  assert.strictEqual(summary.totalValue, 65);
  // Sorted by what it cost, so the expensive loss is the first thing read.
  assert.strictEqual(summary.products[0].product, 'Green sprouts');
  assert.deepStrictEqual(summary.products[0].byReason, { SPOILED: 4, EXPIRED: 2 });
});

check('a product with no cost price counts units without inventing a value', () => {
  const summary = summarize([
    { productId: 1, quantity: 3, reason: 'SPOILED', product: { name: 'Sample', costPrice: 0 } },
  ]);
  assert.strictEqual(summary.totalQuantity, 3);
  assert.strictEqual(summary.totalValue, 0);
});
