// The guards on the background geocode that runs after a bill is saved.
//
// Every one of these exists to stop the same two failures: hammering a free
// geocoder that runs on donated hardware from an IP the whole app shares, and
// writing a guess over something better.

const assert = require('assert');
const { shouldAttempt, queryFor, ensureStoreCoordinates, RETRY_MS } = require('../src/lib/storeGeocode');

const CITY = 'Bengaluru';
const NOW = Date.parse('2026-08-29T10:00:00.000Z');
const UNPINNED = { id: 1, name: 'MG Road Store', address: 'MG Road', lat: null, lng: null };

const attempt = (over = {}) =>
  shouldAttempt({ store: UNPINNED, lastAttemptAt: null, now: NOW, city: CITY, ...over });

const tests = {
  'an unpinned store with an address is worth a lookup': () => {
    assert.strictEqual(attempt(), true);
  },

  'no configured city means no lookup at all': () => {
    // The feature is off by default on purpose. A bare "MG Road" exists in
    // several Indian cities, and guessing which is how three of six stores
    // ended up 300km away in a real backfill run.
    assert.strictEqual(attempt({ city: '' }), false);
    assert.strictEqual(attempt({ city: undefined }), false);
  },

  'a store that already has a pin is left alone': () => {
    // Any pin, from any source. This never overwrites; replacing a geocoded pin
    // with something better is storePin.js's job, off a real GPS reading.
    assert.strictEqual(attempt({ store: { ...UNPINNED, lat: 12.97, lng: 77.6 } }), false);
    // Half a pin is not a pin, so this one still gets looked up.
    assert.strictEqual(attempt({ store: { ...UNPINNED, lat: 12.97, lng: null } }), true);
  },

  'a store with no address has nothing to search': () => {
    for (const address of [null, undefined, '', '   ']) {
      assert.strictEqual(attempt({ store: { ...UNPINNED, address } }), false, JSON.stringify(address));
    }
  },

  'the same store is not chased again within the day': () => {
    // The case that matters is the store that can NEVER be geocoded: without
    // this it fires a fresh lookup on every bill it ever rings up.
    assert.strictEqual(attempt({ lastAttemptAt: NOW - 1000 }), false);
    assert.strictEqual(attempt({ lastAttemptAt: NOW - RETRY_MS + 1 }), false);
    assert.strictEqual(attempt({ lastAttemptAt: NOW - RETRY_MS }), true);
    assert.strictEqual(attempt({ lastAttemptAt: NOW - RETRY_MS * 3 }), true);
  },

  'a missing store is not a crash': () => {
    assert.strictEqual(attempt({ store: null }), false);
    assert.strictEqual(attempt({ store: undefined }), false);
  },

  'the city goes into the query, not just the proximity hint': () => {
    // The hint is bounded=0 — a preference the geocoder may ignore, and does.
    assert.strictEqual(queryFor('MG Road', CITY), 'MG Road, Bengaluru');
  },

  'a city already in the address is not repeated': () => {
    assert.strictEqual(queryFor('MG Road, Bengaluru', CITY), 'MG Road, Bengaluru');
    // Matched case-insensitively, since addresses are typed by hand.
    assert.strictEqual(queryFor('MG Road, bengaluru 560001', CITY), 'MG Road, bengaluru 560001');
  },

  'the entry point returns nothing, synchronously, and never throws': () => {
    // The hard constraint: a bill must not be able to slow down or fail because
    // of this. So it cannot be awaited into (returns undefined, not a promise),
    // and no argument may make it throw into a route handler that has already
    // sent its response.
    for (const bad of [null, undefined, 0, -1, 1.5, NaN, '', 'abc', {}, [], Infinity]) {
      const returned = ensureStoreCoordinates(bad);
      assert.strictEqual(returned, undefined, `${JSON.stringify(bad)} should return undefined`);
    }
    // A plausible id is equally safe to call with STORE_GEOCODE_CITY unset,
    // which is how it is configured by default and in this test process.
    assert.strictEqual(ensureStoreCoordinates(1), undefined);
    assert.strictEqual(ensureStoreCoordinates('1', { timeoutMs: 50 }), undefined);
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
