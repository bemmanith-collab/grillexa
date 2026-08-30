// The rules that decide whether a location taken during billing becomes a
// store's pin. Worth a test because both mistakes are silent: a fix rejected
// too eagerly leaves a store invisible to every location question, and a fix
// accepted too eagerly writes a wifi guess that looks exactly like a GPS pin
// and sends deliveries to the wrong road for good.

const assert = require('assert');
const { wantsPin, shouldSavePin, sourceFor, ACCEPT_ACCURACY_M, PERFECT_ACCURACY_M } = require('../src/lib/storePin');

const NO_PIN = { lat: null, lng: null, accuracyM: null, pinSource: null };
const HAND_PLACED = { lat: 13.0878, lng: 80.2103, accuracyM: null, pinSource: 'MANUAL' };
const GEOCODED = { lat: 13.0878, lng: 80.2103, accuracyM: null, pinSource: 'GEOCODED' };
const MEASURED = (m) => ({ lat: 13.0878, lng: 80.2103, accuracyM: m, pinSource: 'GPS' });
// A row written before pinSource existed: a pin, an accuracy, and no source.
const LEGACY = (m) => ({ lat: 13.0878, lng: 80.2103, accuracyM: m, pinSource: null });

const tests = {
  'a store with no pin is asked for one': () => {
    assert.strictEqual(wantsPin(NO_PIN), true);
    // Half a pin is no pin — either alone is unusable on a map.
    assert.strictEqual(wantsPin({ lat: 13.0878, lng: null, accuracyM: null }), true);
  },

  'a pin somebody placed by hand is left alone': () => {
    // Nothing measured it, so no sensor reading can claim to beat it, and
    // overwriting a deliberate placement silently is not ours to do.
    assert.strictEqual(wantsPin(HAND_PLACED), false);
    assert.strictEqual(shouldSavePin(HAND_PLACED, { lat: 13, lng: 80, accuracyM: 5 }).save, false);
    assert.strictEqual(shouldSavePin(HAND_PLACED, { lat: 13, lng: 80, accuracyM: 5 }).reason, 'hand-placed');
  },

  'a pin already as good as the hardware gets is not chased': () => {
    assert.strictEqual(wantsPin(MEASURED(PERFECT_ACCURACY_M)), false);
    assert.strictEqual(wantsPin(MEASURED(PERFECT_ACCURACY_M - 1)), false);
    assert.strictEqual(wantsPin(MEASURED(PERFECT_ACCURACY_M + 1)), true);
  },

  'a good fix fills an empty pin': () => {
    const r = shouldSavePin(NO_PIN, { lat: 13.0878, lng: 80.2103, accuracyM: 20 });
    assert.deepStrictEqual(r, { save: true, reason: 'first-pin' });
  },

  'a coarse fix is refused even when there is no pin at all': () => {
    // The whole point of the gate. An indoor reading off wifi is the single
    // most likely thing to arrive here, and no pin beats a wrong pin.
    for (const m of [ACCEPT_ACCURACY_M + 1, 500, 5000]) {
      const r = shouldSavePin(NO_PIN, { lat: 13, lng: 80, accuracyM: m });
      assert.strictEqual(r.save, false, `${m}m should be refused`);
      assert.strictEqual(r.reason, 'too-coarse');
    }
    // The boundary itself is accepted.
    assert.strictEqual(shouldSavePin(NO_PIN, { lat: 13, lng: 80, accuracyM: ACCEPT_ACCURACY_M }).save, true);
  },

  'a fix with no accuracy figure is refused': () => {
    // readCoords nulls out an unusable accuracy, so this is what a hand-typed
    // or unmeasured pair looks like by the time it reaches here. Unverifiable,
    // and 0 is not "perfectly accurate" — it is a sensor that said nothing.
    for (const accuracyM of [null, undefined, 0, -5, NaN, 'x']) {
      const r = shouldSavePin(NO_PIN, { lat: 13, lng: 80, accuracyM });
      assert.strictEqual(r.save, false, `${accuracyM} should be refused`);
      assert.strictEqual(r.reason, 'no-accuracy');
    }
  },

  'a measured pin is only replaced by a strictly better one': () => {
    assert.strictEqual(shouldSavePin(MEASURED(40), { lat: 13, lng: 80, accuracyM: 20 }).save, true);
    assert.strictEqual(shouldSavePin(MEASURED(40), { lat: 13, lng: 80, accuracyM: 20 }).reason, 'improved');
    // Equal does not churn the row on every bill of the day.
    assert.strictEqual(shouldSavePin(MEASURED(40), { lat: 13, lng: 80, accuracyM: 40 }).save, false);
    assert.strictEqual(shouldSavePin(MEASURED(20), { lat: 13, lng: 80, accuracyM: 40 }).save, false);
    assert.strictEqual(shouldSavePin(MEASURED(20), { lat: 13, lng: 80, accuracyM: 40 }).reason, 'not-better');
  },

  'the accuracy gate outranks the improvement test': () => {
    // A store sitting on a 5km pin must not have it replaced by a 3km one.
    // Better is not the same as good enough, and both are still wrong roads.
    const r = shouldSavePin(MEASURED(5000), { lat: 13, lng: 80, accuracyM: 3000 });
    assert.strictEqual(r.save, false);
    assert.strictEqual(r.reason, 'too-coarse');
  },

  'a pin guessed from an address is replaced by a real fix': () => {
    // This is the case the backfill script creates. It puts a store on the map
    // today, and must not become the reason the store never gets a true pin —
    // there is no accuracy on a geocode to compare against, so "better" cannot
    // be computed and standing in the shop wins outright.
    assert.strictEqual(wantsPin(GEOCODED), true);
    const r = shouldSavePin(GEOCODED, { lat: 13, lng: 80, accuracyM: 30 });
    assert.deepStrictEqual(r, { save: true, reason: 'replaces-geocoded' });
  },

  'a coarse fix still does not replace a geocoded pin': () => {
    // Replaceable is not the same as replaceable by anything.
    assert.strictEqual(shouldSavePin(GEOCODED, { lat: 13, lng: 80, accuracyM: 3000 }).reason, 'too-coarse');
  },

  'a row from before pinSource existed is judged on accuracy, as it always was': () => {
    assert.strictEqual(wantsPin(LEGACY(40)), true);
    assert.strictEqual(wantsPin(LEGACY(PERFECT_ACCURACY_M)), false);
    // Legacy null accuracy was only ever written by the hand-placed path.
    assert.strictEqual(wantsPin({ ...LEGACY(null) }), false);
    assert.strictEqual(shouldSavePin(LEGACY(null), { lat: 13, lng: 80, accuracyM: 10 }).reason, 'hand-placed');
    assert.strictEqual(shouldSavePin(LEGACY(40), { lat: 13, lng: 80, accuracyM: 10 }).save, true);
  },

  'the source of a pin is read from whether anything measured it': () => {
    assert.strictEqual(sourceFor({ lat: 13, lng: 80, accuracyM: 12 }), 'GPS');
    assert.strictEqual(sourceFor({ lat: 13, lng: 80, accuracyM: null }), 'MANUAL');
    // No pin in the request at all — a rename must not relabel anything.
    assert.strictEqual(sourceFor({ lat: null, lng: null, accuracyM: null }), null);
    assert.strictEqual(sourceFor({}), null);
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
