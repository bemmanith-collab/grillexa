// Editing a bill must not change what the customer was charged. The bill
// keeps its number when it's edited, so a printed copy in someone's hand has
// to keep matching it — a SALES user fixing a phone number used to reprice
// every line to the catalogue and quietly erase a negotiated discount.
//
// The other half of this file is the rule that made that happen: prices come
// from the catalogue or the saved bill, never from the request, for SALES.
// Both directions are checked here so neither gets loosened by accident.
//
// Run: npm test (from backend/). No database: tx is faked below.
const assert = require('assert');

const { resolveLines, billedPricesOf } = require('../src/lib/pricing');

// Catalogue prices as they stand today — deliberately different from what the
// bills below were written at, which is the whole point.
const CATALOGUE = [
  { id: 1, name: 'Peri Peri Chicken', price: 100 },
  { id: 2, name: 'Smoked Paprika Wings', price: 250 },
];

const tx = {
  product: {
    async findMany({ where: { id: { in: ids } } }) {
      return CATALOGUE.filter((p) => ids.includes(p.id));
    },
  },
};

const tests = {
  'a fresh bill prices from the catalogue': async () => {
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 2 }], 'SALES');
    assert.strictEqual(line.unitPrice, 100);
  },

  'a SALES edit keeps what the bill already charged': async () => {
    // The bill went out at a negotiated 90; the catalogue says 100.
    const billed = billedPricesOf([{ productId: 1, unitPrice: 90 }]);
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 3 }], 'SALES', billed);
    assert.strictEqual(line.unitPrice, 90, 'repriced the customer to the catalogue');
    assert.strictEqual(line.quantity * line.unitPrice, 270);
  },

  'a SALES edit still cannot set a price from the request': async () => {
    // Same guard as before: the discount is honoured because it came off the
    // saved bill, not because the client asked for it.
    const billed = billedPricesOf([{ productId: 1, unitPrice: 90 }]);
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 1, unitPrice: 1 }], 'SALES', billed);
    assert.strictEqual(line.unitPrice, 90);
  },

  'a product added during an edit prices from the catalogue': async () => {
    const billed = billedPricesOf([{ productId: 1, unitPrice: 90 }]);
    const lines = await resolveLines(
      tx,
      [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }],
      'SALES',
      billed
    );
    assert.strictEqual(lines[0].unitPrice, 90, 'existing line lost its price');
    assert.strictEqual(lines[1].unitPrice, 250, 'new line should be catalogue');
  },

  'an ADMIN override still wins over the billed price': async () => {
    const billed = billedPricesOf([{ productId: 1, unitPrice: 90 }]);
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 1, unitPrice: 75 }], 'ADMIN', billed);
    assert.strictEqual(line.unitPrice, 75);
  },

  'an ADMIN editing without sending a price keeps the billed one': async () => {
    const billed = billedPricesOf([{ productId: 1, unitPrice: 90 }]);
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 1, unitPrice: '' }], 'ADMIN', billed);
    assert.strictEqual(line.unitPrice, 90);
  },

  'a zero billed price survives an edit': async () => {
    // A free line is a real thing (a replacement, a sample). `has` rather than
    // a truthiness test is what keeps 0 from falling through to the catalogue.
    const billed = billedPricesOf([{ productId: 1, unitPrice: 0 }]);
    const [line] = await resolveLines(tx, [{ productId: 1, quantity: 1 }], 'SALES', billed);
    assert.strictEqual(line.unitPrice, 0);
  },

  'a negative override is still refused': async () => {
    await assert.rejects(
      () => resolveLines(tx, [{ productId: 1, quantity: 1, unitPrice: -5 }], 'ADMIN'),
      /unit price must be a number of zero or more/
    );
  },

  'a fractional quantity is still refused': async () => {
    await assert.rejects(
      () => resolveLines(tx, [{ productId: 1, quantity: 1.5 }], 'ADMIN'),
      /whole number/
    );
  },

  'billedPricesOf takes the first line when a product appears twice': () => {
    const billed = billedPricesOf([
      { productId: 1, unitPrice: 90 },
      { productId: 1, unitPrice: 80 },
      { productId: 2, unitPrice: 250 },
    ]);
    assert.strictEqual(billed.get(1), 90);
    assert.strictEqual(billed.get(2), 250);
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
