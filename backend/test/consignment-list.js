// Who sees which consignments, and how many of them.
//
// A manager reported seeing only a fraction of the consignments awaiting
// settlement. Nothing scoped a manager by store — the loss was quieter than
// that: the list returns the newest 200 by delivery date, which is months for
// a salesperson on one store and about four days for a manager across fifty.
// The oldest unsettled consignment sorts last, so it is the first to fall off
// the end — and it is the one being looked for.
//
// Neither failure raises an error. The list renders, shorter than the truth.
// These assertions are the only thing standing between that and a shipped
// regression.
//
// Run: npm test (from backend/). No database: listQuery only builds the
// Prisma arguments, which is where both decisions are made.
const assert = require('assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { listQuery, HISTORY_LIMIT } = require('../src/routes/consignments');

const MANAGER = { id: 1, role: 'MANAGER', storeIds: [] };
const ADMIN = { id: 2, role: 'ADMIN', storeIds: [] };
// A SALES account carries store ids; a manager's list is empty, which is
// exactly why scoping on storeIds without checking the role would show a
// manager nothing at all.
const SALES = { id: 3, role: 'SALES', storeIds: [7, 9] };

const OPEN = { status: 'DELIVERED,PARTIAL_SETTLED' };

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

check('a manager is not scoped to any store', () => {
  const { where } = listQuery(MANAGER, {});
  assert.deepStrictEqual(where, {}, 'a manager must see every store');
});

check('an admin is not scoped to any store', () => {
  assert.deepStrictEqual(listQuery(ADMIN, {}).where, {});
});

check('a manager filtering by status is still not scoped to a store', () => {
  const { where } = listQuery(MANAGER, OPEN);
  assert.deepStrictEqual(where.storeId, undefined, 'a status filter must not narrow the stores');
  assert.deepStrictEqual(where.status, { in: ['DELIVERED', 'PARTIAL_SETTLED'] });
});

check('a sales account is still locked to its own stores', () => {
  const { where } = listQuery(SALES, {});
  assert.deepStrictEqual(where, { storeId: { in: [7, 9] } });
});

check('a sales account stays locked when filtering by status', () => {
  const { where } = listQuery(SALES, OPEN);
  assert.deepStrictEqual(where.storeId, { in: [7, 9] });
});

// The regression itself: outstanding work must never be truncated.
check('the outstanding list is uncapped', () => {
  const { take } = listQuery(MANAGER, OPEN);
  assert.strictEqual(take, undefined, 'a status-filtered list must return every match');
});

check('the unfiltered history list is still capped', () => {
  assert.strictEqual(listQuery(MANAGER, {}).take, HISTORY_LIMIT);
});

check('one status is matched directly, not wrapped in an in-clause', () => {
  assert.strictEqual(listQuery(MANAGER, { status: 'DELIVERED' }).where.status, 'DELIVERED');
});

// Prisma would reject `{ in: [''] }` shapes and a stray comma is easy to send.
check('an empty status filter is ignored rather than matching nothing', () => {
  const { where, take } = listQuery(MANAGER, { status: ' , ' });
  assert.strictEqual(where.status, undefined, 'must not build an empty status filter');
  assert.strictEqual(take, HISTORY_LIMIT, 'and must fall back to the capped history list');
});

check('an explicit storeId still narrows the list for a manager', () => {
  assert.deepStrictEqual(listQuery(MANAGER, { storeId: '12' }).where, { storeId: 12 });
});

if (!process.exitCode) console.log('\nall checks passed');
