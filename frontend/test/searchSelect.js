// The picker's filtering and highlighting. Fifty stores means the wrong
// store is one mistyped tap away, and a delivery booked against it is a
// stock movement someone has to unwind by hand.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { matchParts, rankOptions, readRecent, pushRecent } from '../src/lib/searchSelect.js';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

const stores = [
  { id: 1, name: 'Anna Nagar' },
  { id: 2, name: 'Adyar' },
  { id: 3, name: 'Nagarjuna Circle' },
  { id: 4, name: 'T Nagar' },
];
const names = (list) => list.map((s) => s.name);

check('an empty query keeps every store, in the order given', () => {
  assert.deepEqual(names(rankOptions(stores, '')), ['Anna Nagar', 'Adyar', 'Nagarjuna Circle', 'T Nagar']);
  assert.deepEqual(names(rankOptions(stores, '   ')), names(stores));
});

check('matches anywhere in the name, ignoring case', () => {
  assert.deepEqual(names(rankOptions(stores, 'nagar')), ['Anna Nagar', 'Nagarjuna Circle', 'T Nagar']);
  assert.deepEqual(names(rankOptions(stores, 'NAGAR')), names(rankOptions(stores, 'nagar')));
  assert.deepEqual(names(rankOptions(stores, 'circ')), ['Nagarjuna Circle']);
  assert.deepEqual(rankOptions(stores, 'zzz'), []);
});

check('recent picks come first, and the rest keep their order', () => {
  assert.deepEqual(names(rankOptions(stores, '', [4, 2])), ['T Nagar', 'Adyar', 'Anna Nagar', 'Nagarjuna Circle']);
  // Recents that don't match the query stay filtered out.
  assert.deepEqual(names(rankOptions(stores, 'nagar', [2, 4])), ['T Nagar', 'Anna Nagar', 'Nagarjuna Circle']);
});

check('a recent id stored as a string still matches its store', () => {
  assert.deepEqual(names(rankOptions(stores, '', ['4']))[0], 'T Nagar');
});

check('rankOptions does not reorder the caller list', () => {
  const original = [...stores];
  rankOptions(stores, '', [4]);
  assert.deepEqual(stores, original);
});

check('highlighting covers every occurrence and loses no characters', () => {
  assert.deepEqual(matchParts('Anna Nagar', 'na'), [
    { text: 'An', hit: false },
    { text: 'na', hit: true },
    { text: ' ', hit: false },
    { text: 'Na', hit: true },
    { text: 'gar', hit: false },
  ]);
  for (const q of ['', 'a', 'nagar', 'zzz', 'anna nagar']) {
    assert.equal(matchParts('Anna Nagar', q).map((p) => p.text).join(''), 'Anna Nagar');
  }
});

check('an unmatched query leaves the name as one plain run', () => {
  assert.deepEqual(matchParts('Adyar', 'zz'), [{ text: 'Adyar', hit: false }]);
  assert.deepEqual(matchParts('Adyar', ''), [{ text: 'Adyar', hit: false }]);
});

// The product picker passes no key on purpose, so that the catalogue's
// deliberate order survives. localStorage doesn't exist here, which is also
// what the browser looks like in private mode.
check('no key means no recents, and nothing thrown', () => {
  assert.deepEqual(readRecent(), []);
  assert.deepEqual(readRecent(null), []);
  assert.deepEqual(pushRecent(null, 3), [3]);
  assert.deepEqual(names(rankOptions(stores, '', readRecent())), names(stores));
});
