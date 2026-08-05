// The dashboard is read by people who are ranked against each other on it, so
// the numbers have to be defensible: a return must not inflate a product, a
// tie must not demote someone alphabetically, and a blank day must not print
// a percentage it invented.
//
// Run: npm test (from backend/). No database — every function here is pure.
const assert = require('assert');

const {
  visitedStoreIds,
  sumSales,
  changePct,
  topProducts,
  buildLeaderboard,
  rankIn,
  overdueList,
} = require('../src/lib/dashboard');

const day = (s) => new Date(`${s}T00:00:00.000Z`);

function sale(storeId, totalAmount, lines = []) {
  return { storeId, totalAmount, lines };
}
function line(productId, name, quantity, amount, type = 'SALE') {
  return { productId, product: { name }, quantity, amount, type };
}

const tests = {
  'a store counts as visited on any of the day\'s work, once': () => {
    const visited = visitedStoreIds(
      [sale(1, 100), sale(1, 200)], // two bills, one shop
      [{ storeId: 2 }], // a delivery
      [{ storeId: 3 }] // a settlement
    );
    assert.deepStrictEqual([...visited].sort(), [1, 2, 3]);
  },

  'a store with nothing recorded is not visited': () => {
    assert.strictEqual(visitedStoreIds([sale(1, 100)]).has(2), false);
  },

  'takings are the bill totals, already net of returns': () => {
    assert.strictEqual(sumSales([sale(1, 4000), sale(2, 200)]), 4200);
  },

  'no sales this day last week gives no percentage, not +100%': () => {
    assert.strictEqual(changePct(4200, 0), null);
  },

  'a normal comparison is a percentage of the baseline': () => {
    assert.strictEqual(Math.round(changePct(4200, 3750)), 12);
  },

  'a drop reads as negative': () => {
    assert.ok(changePct(1000, 2000) < 0);
  },

  'top products subtract returned lines from the same product': () => {
    const [top] = topProducts([
      sale(1, 1500, [line(1, 'Green sprouts', 20, 2000), line(1, 'Green sprouts', 2, 200, 'RETURN')]),
    ]);
    assert.strictEqual(top.amount, 1800, 'the return did not come off');
    assert.strictEqual(top.quantity, 18);
  },

  'a product that was only returned today is not a top seller': () => {
    const top = topProducts([
      sale(1, -200, [line(9, 'Mixed bowl', 2, 200, 'RETURN')]),
      sale(1, 500, [line(1, 'Green sprouts', 5, 500)]),
    ]);
    assert.deepStrictEqual(top.map((p) => p.name), ['Green sprouts']);
  },

  'top products are the best three by money, biggest first': () => {
    const top = topProducts([
      sale(1, 0, [
        line(1, 'A', 1, 300),
        line(2, 'B', 1, 1800),
        line(3, 'C', 1, 900),
        line(4, 'D', 1, 50),
      ]),
    ]);
    assert.deepStrictEqual(top.map((p) => p.name), ['B', 'C', 'A']);
  },

  'the person being viewed is on the board even having sold nothing': () => {
    const board = buildLeaderboard(
      [{ createdById: 1, _sum: { totalAmount: 5000 } }],
      new Map([[1, 'Vijay'], [2, 'Rakesh']]),
      2
    );
    assert.deepStrictEqual(board.map((r) => r.name), ['Vijay', 'Rakesh']);
    assert.strictEqual(rankIn(board, 2), 2);
  },

  'a tie shares the higher place instead of sorting someone down': () => {
    const board = buildLeaderboard(
      [
        { createdById: 1, _sum: { totalAmount: 4200 } },
        { createdById: 2, _sum: { totalAmount: 4200 } },
        { createdById: 3, _sum: { totalAmount: 9000 } },
      ],
      new Map([[1, 'Anil'], [2, 'Rakesh'], [3, 'Vijay']])
    );
    assert.strictEqual(rankIn(board, 1), 2);
    assert.strictEqual(rankIn(board, 2), 2, 'the tied pair were split into 2nd and 3rd');
    assert.strictEqual(rankIn(board, 3), 1);
  },

  'a null sum from the database counts as zero, not NaN': () => {
    const board = buildLeaderboard([{ createdById: 1, _sum: { totalAmount: null } }], new Map([[1, 'Anil']]));
    assert.strictEqual(board[0].amount, 0);
  },

  'a consignment settled inside the grace period raises no alert': () => {
    const alerts = overdueList(
      [{ consignmentNo: 'C-1', deliveredAt: day('2026-08-04'), store: { name: 'Anna Nagar' } }],
      day('2026-08-05'),
      2
    );
    assert.deepStrictEqual(alerts, []);
  },

  'the oldest unsettled consignment is chased first': () => {
    const alerts = overdueList(
      [
        { consignmentNo: 'C-1', deliveredAt: day('2026-08-03'), store: { name: 'Anna Nagar' } },
        { consignmentNo: 'C-2', deliveredAt: day('2026-07-29'), store: { name: 'T Nagar' } },
      ],
      day('2026-08-05'),
      2
    );
    assert.deepStrictEqual(alerts.map((a) => a.store), ['T Nagar', 'Anna Nagar']);
    assert.strictEqual(alerts[0].daysOutstanding, 7);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}
console.log(failed ? `\n${failed} failing` : `\n${Object.keys(tests).length} passing`);
process.exit(failed ? 1 : 0);
