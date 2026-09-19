// Which bills the list returns, and how many of them.
//
// The same failure as test/consignment-list.js, found a second time in a
// second route. Bill History returns the newest SALES_LIMIT by date. That is
// months for one store on a quiet week — and exactly one day the moment a
// bulk settlement writes a few hundred bills at once, which is what it was
// showing when this was reported. Nothing errors. The page renders, one day
// deep, looking complete.
//
// A window has to do two things or it is worse than useless: narrow the query
// AND lift the cap. Narrowing alone returns the newest 200 *of the chosen
// range*, still silently truncated, now with a date filter on screen implying
// the opposite.
//
// Run: npm test (from backend/). No database: salesQuery only builds the
// Prisma arguments, which is where every one of these decisions is made.
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { salesQuery, SALES_LIMIT } = require('../src/routes/sales');

const MANAGER = { id: 1, role: 'MANAGER', storeIds: [] };
const SALES_USER = { id: 3, role: 'SALES', storeIds: [7, 9] };

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

check('an unwindowed list is still capped', () => {
  const { where, take } = salesQuery(MANAGER, {});
  assert.strictEqual(take, SALES_LIMIT);
  assert.strictEqual(where.date, undefined, 'an absent window must not build an empty date filter');
});

check('a single date lifts the cap', () => {
  const { where, take } = salesQuery(MANAGER, { date: '2026-07-11' });
  assert.strictEqual(where.date.toISOString(), '2026-07-11T00:00:00.000Z');
  assert.strictEqual(take, undefined);
});

check('a from date sets a lower bound', () => {
  const { where } = salesQuery(MANAGER, { from: '2026-06-01' });
  assert.strictEqual(where.date.gte.toISOString(), '2026-06-01T00:00:00.000Z');
});

// The whole reported complaint: reaching back to the start of the project and
// having the last day of the range actually included.
check('a to date includes the day it names', () => {
  const { where } = salesQuery(MANAGER, { to: '2026-09-10' });
  assert.strictEqual(where.date.lt.toISOString(), '2026-09-11T00:00:00.000Z');
});

check('a window lifts the cap', () => {
  assert.strictEqual(salesQuery(MANAGER, { from: '2026-06-01', to: '2026-09-19' }).take, undefined,
    'a bounded window must return every match, or the oldest silently drop again');
});

check('an exact date wins over a window rather than both applying', () => {
  const { where } = salesQuery(MANAGER, { date: '2026-08-01', from: '2026-06-01' });
  assert.ok(where.date instanceof Date, 'a single date must not be merged into a range object');
});

check('direct=true narrows to walk-in bills and composes with a window', () => {
  const { where, take } = salesQuery(MANAGER, { direct: 'true', from: '2026-06-01' });
  assert.strictEqual(where.consignmentId, null);
  assert.ok(where.date.gte, 'and still gets the window');
  assert.strictEqual(take, undefined);
});

check('a sales account stays locked to its own stores through a window', () => {
  const { where } = salesQuery(SALES_USER, { from: '2026-06-01' });
  assert.deepStrictEqual(where.storeId, { in: [7, 9] });
});

check('an unparseable date throws rather than silently matching everything', () => {
  assert.throws(() => salesQuery(MANAGER, { from: 'last tuesday' }));
});

if (!process.exitCode) console.log('\nall checks passed');
