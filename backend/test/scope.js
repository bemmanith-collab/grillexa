// Who can reach which shop.
//
// The interesting case is "all stores", which is a standing assignment rather
// than a saved list. Ticking every box in the picker would cover the shops that
// existed when somebody opened the dialog and silently miss the one that opened
// the week after — which is exactly the account this setting is for.
//
// Run: npm test (from backend/). No database.
const assert = require('assert');
const { assertStoreAccess, resolveStoreIds } = require('../src/lib/scope');

const EVERY = [1, 2, 3, 4, 5];

const tests = {
  'a sales account reaches only its own shops': () => {
    const user = { role: 'SALES', storeIds: [2, 3] };
    assert.doesNotThrow(() => assertStoreAccess(user, 2));
    assert.throws(() => assertStoreAccess(user, 4), /only access your own stores/);
  },

  'a sales account with no shops is told to ask an admin': () => {
    assert.throws(
      () => assertStoreAccess({ role: 'SALES', storeIds: [] }, 1),
      /not assigned to a store yet/
    );
  },

  'admin and manager are never store-scoped': () => {
    assert.doesNotThrow(() => assertStoreAccess({ role: 'ADMIN', storeIds: [] }, 99));
    assert.doesNotThrow(() => assertStoreAccess({ role: 'MANAGER', storeIds: [] }, 99));
  },

  'an explicit assignment is exactly the shops that were picked': () => {
    const user = { allStores: false, stores: [{ id: 2 }, { id: 5 }] };
    assert.deepStrictEqual(resolveStoreIds(user, EVERY), [2, 5]);
  },

  'all-stores covers whatever exists at the moment of the request': () => {
    // The promise: a shop opened after the assignment is already included, with
    // nobody reopening the dialog. That only holds because the list is passed
    // in fresh rather than read from the account.
    const user = { allStores: true, stores: [] };
    assert.deepStrictEqual(resolveStoreIds(user, EVERY), EVERY);

    // A shop opens later.
    const laterToday = [...EVERY, 6];
    assert.deepStrictEqual(
      resolveStoreIds(user, laterToday),
      laterToday,
      'a shop added after the assignment must be covered without touching the account'
    );
  },

  'all-stores ignores any leftover explicit list': () => {
    // Turning the flag on clears the list, but a row written before this
    // existed could still carry both. The flag wins — two answers to "which
    // shops" is how they drift apart.
    const user = { allStores: true, stores: [{ id: 2 }] };
    assert.deepStrictEqual(resolveStoreIds(user, EVERY), EVERY);
  },

  'no session covers nothing': () => {
    assert.deepStrictEqual(resolveStoreIds(null, EVERY), []);
    assert.deepStrictEqual(resolveStoreIds(undefined, EVERY), []);
  },

  'an account with neither flag nor shops covers nothing': () => {
    assert.deepStrictEqual(resolveStoreIds({ allStores: false }, EVERY), []);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
