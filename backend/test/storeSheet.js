// node test/storeSheet.js
const assert = require('assert');
const { buildStoreSheet } = require('../src/lib/storeSheet');

const banana = { name: 'Banana', costPrice: 3, sortOrder: 1 };
const sprouts = { name: 'Green sprouts', costPrice: 6, sortOrder: 2 };
const shop = (id, name) => ({ storeId: id, store: { name } });

const item = (storeId, productId, product, delivered, sold, returned, price) => ({
  productId,
  product,
  deliveredQty: delivered,
  soldQty: sold,
  returnedQty: returned,
  pricePerUnit: price,
  consignment: { ...shop(storeId, `Store ${storeId}`), createdById: 1, createdBy: { name: 'Ravi' } },
});
// A delivery settled the same day by the same person, as the older tests assume.
const settled = (it, by = { id: 1, name: 'Ravi' }) => ({
  soldQty: it.soldQty,
  returnedQty: it.returnedQty,
  consignmentItem: it,
  settlement: { createdById: by.id, createdBy: { name: by.name } },
});
const consigned = (...items) => ({ consignmentItems: items, settlementLines: items.map((it) => settled(it)) });

const line = (storeId, productId, product, quantity, amount, type = 'SALE') => ({
  productId,
  product,
  quantity,
  amount,
  type,
  sale: { ...shop(storeId, `Store ${storeId}`), createdById: 2, createdBy: { name: 'Mahesh' } },
});

const tests = {
  'consignment: sold earns, returned is a loss at cost, the rest is pending': () => {
    const r = buildStoreSheet({ ...consigned(item(1, 2, sprouts, 10, 6, 3, 10)) });
    const [row] = r.rows;
    assert.strictEqual(row.source, 'CONSIGNMENT');
    assert.strictEqual(row.person, 'Ravi');
    assert.deepStrictEqual(
      [row.delivered, row.sold, row.returned, row.pending, row.revenue, row.cost, row.loss, row.profit],
      [10, 6, 3, 1, 60, 36, 18, 6]
    );
    assert.strictEqual(row.returnRatePct, (3 / 9) * 100);
  },

  'direct: return and exchange earn nothing and lose their cost': () => {
    const r = buildStoreSheet({
      directLines: [line(1, 1, banana, 12, 60), line(1, 1, banana, 2, 0, 'RETURN'), line(1, 1, banana, 1, 0, 'EXCHANGE')],
    });
    const [row] = r.rows;
    assert.strictEqual(row.source, 'DIRECT');
    assert.deepStrictEqual(row.cells[1], {
      delivered: 12, sold: 12, returned: 2, exchanged: 1, pending: 0, revenue: 60, cost: 36, loss: 9,
    });
    assert.strictEqual(row.profit, 15);
  },

  'a store sums both sources; rows stay split by person and source': () => {
    const r = buildStoreSheet({
      ...consigned(item(1, 2, sprouts, 10, 10, 0, 10)),
      directLines: [line(1, 1, banana, 4, 20)],
    });
    assert.strictEqual(r.rows.length, 2);
    assert.strictEqual(r.stores.length, 1);
    assert.strictEqual(r.stores[0].revenue, 120);
    assert.strictEqual(r.totals.revenue, 120);
    const mahesh = r.people.find((p) => p.label === 'Mahesh');
    assert.strictEqual(mahesh.revenueDirect, 20);
    assert.strictEqual(mahesh.revenueConsignment, 0);
    assert.deepStrictEqual(r.products.map((p) => p.name), ['Banana', 'Green sprouts']);
  },

  'advice: heavy returns say deliver less, clean sell-through says deliver more': () => {
    const r = buildStoreSheet({
      ...consigned(item(1, 2, sprouts, 20, 10, 10, 10), item(2, 2, sprouts, 20, 20, 0, 10), item(3, 2, sprouts, 3, 1, 2, 10)),
    });
    assert.deepStrictEqual(r.advice.cut.map((a) => a.store), ['Store 1']);
    assert.deepStrictEqual(r.advice.grow.map((a) => a.store), ['Store 2']);
  },
};

tests['suggestions: biggest saving first, pending listed last'] = () => {
  const r = buildStoreSheet({
    ...consigned(item(1, 2, sprouts, 22, 10, 10, 10), item(2, 2, sprouts, 20, 20, 0, 10)),
  });
  const [first] = r.suggestions;
  assert.strictEqual(first.title, 'Deliver 10 fewer units to Store 1');
  assert.strictEqual(first.impact, 60);
  assert.ok(r.suggestions.some((s) => s.title === 'Try 4 more units at Store 2'));
  assert.strictEqual(r.suggestions.at(-1).title, '2 units are still waiting to be settled');
};

tests['suggestions: a quiet range says nothing it cannot back up'] = () => {
  const r = buildStoreSheet({ ...consigned(item(1, 2, sprouts, 2, 2, 0, 10)) });
  assert.deepStrictEqual(r.suggestions, []);
};

tests['suggestions: no rupee claims when products have no cost price'] = () => {
  const free = { name: 'Green sprouts', costPrice: 0, sortOrder: 2 };
  const r = buildStoreSheet({ ...consigned(item(1, 2, free, 20, 10, 10, 10)) });
  assert.ok(r.suggestions.length > 0);
  for (const s of r.suggestions) assert.doesNotMatch(s.detail + s.title, /₹0|0% of what/);
};

tests['a settlement today of an earlier delivery counts today, for whoever settled'] = () => {
  // Delivered last week (not in today's window), settled today by Mahesh.
  const earlier = item(1, 2, sprouts, 10, 6, 3, 10);
  const r = buildStoreSheet({ settlementLines: [settled(earlier, { id: 2, name: 'Mahesh' })] });
  const [row] = r.rows;
  assert.strictEqual(row.person, 'Mahesh');
  assert.deepStrictEqual([row.delivered, row.sold, row.returned, row.revenue, row.loss], [0, 6, 3, 60, 18]);
};

tests['a delivery today with nothing settled yet is delivered and pending, not sold'] = () => {
  const r = buildStoreSheet({ consignmentItems: [item(1, 2, sprouts, 12, 0, 0, 10)] });
  const [row] = r.rows;
  assert.deepStrictEqual([row.delivered, row.pending, row.sold, row.revenue], [12, 12, 0, 0]);
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n${err.stack}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing`);
if (failed) process.exit(1);
