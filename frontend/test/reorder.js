// The "Reorder from Last …" shortcut on Deliver to Store and Direct Sale.
// What matters here is that it repeats the ORDER, not the old prices: carrying
// a stale pricePerUnit across re-bills a repeat order at last month's price,
// and silently, because the field looks filled in.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { filterToCatalog, describeDropped } from '../src/lib/reorder.js';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

const products = [
  { id: 1, name: 'Green sprouts', price: 40 },
  { id: 2, name: 'Mixed fruit bowl', price: 60 },
  { id: 4, name: 'Banana', price: null },
];

check('prices come from the catalogue, not from the document being copied', () => {
  const { lines, dropped } = filterToCatalog(
    [
      { productId: 1, product: 'Green sprouts', quantity: 5, unitPrice: 25 },
      { productId: 2, product: 'Mixed fruit bowl', quantity: 3, unitPrice: 55 },
    ],
    products
  );
  assert.deepEqual(lines, [
    { productId: 1, quantity: 5, unitPrice: 40 },
    { productId: 2, quantity: 3, unitPrice: 60 },
  ]);
  assert.equal(dropped.length, 0);
});

check('a product with no catalogue price yields a blank, never an explicit 0', () => {
  // The server takes 0 as a deliberate override and saves the bill at zero;
  // blank means "use the catalogue price".
  const { lines } = filterToCatalog(
    [{ productId: 4, product: 'Banana', quantity: 2, unitPrice: 12 }],
    products
  );
  assert.equal(lines[0].unitPrice, '');
  assert.notEqual(lines[0].unitPrice, 0);
});

check('a discontinued product is dropped and handed back for the warning', () => {
  const { lines, dropped } = filterToCatalog(
    [
      { productId: 1, product: 'Green sprouts', quantity: 5, unitPrice: 25 },
      { productId: 99, product: 'Mixed sprouts', quantity: 4, unitPrice: 30 },
    ],
    products
  );
  assert.deepEqual(lines, [{ productId: 1, quantity: 5, unitPrice: 40 }]);
  assert.deepEqual(dropped.map((d) => d.product), ['Mixed sprouts']);
  assert.equal(describeDropped(dropped), '1 discontinued product (Mixed sprouts)');
});

check('every line discontinued comes back empty rather than throwing', () => {
  // The caller special-cases this to warn "nothing to reorder".
  const { lines, dropped } = filterToCatalog(
    [{ productId: 99, product: 'Mixed sprouts', quantity: 4, unitPrice: 30 }],
    products
  );
  assert.deepEqual(lines, []);
  assert.equal(describeDropped(dropped), '1 discontinued product (Mixed sprouts)');
});

check('two discontinued products are pluralised', () => {
  const { dropped } = filterToCatalog(
    [
      { productId: 98, product: 'Green sprouts', quantity: 1, unitPrice: 30 },
      { productId: 99, product: 'Mixed sprouts', quantity: 4, unitPrice: 30 },
    ],
    products
  );
  assert.equal(describeDropped(dropped), '2 discontinued products (Green sprouts, Mixed sprouts)');
});
