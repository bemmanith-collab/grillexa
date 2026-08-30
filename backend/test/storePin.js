// The rules that decide whether a location taken during billing becomes a
// store's pin. Worth a test because both mistakes are silent: a fix rejected
// too eagerly leaves a store invisible to every location question, and a fix
// accepted too eagerly writes a wifi guess that looks exactly like a GPS pin
// and sends deliveries to the wrong road for good.

const assert = require('assert');
const {
  wantsPin, shouldSavePin, sourceFor, haversineKm, trustedPins, acceptGeocode,
  ACCEPT_ACCURACY_M, PERFECT_ACCURACY_M, DEFAULT_MAX_KM,
} = require('../src/lib/storePin');

// Readings expressed against the gate rather than as literals. These were once
// 10/20/30/40 — real-looking metre figures that quietly encoded a 65m bar, so
// tightening it to 5m failed four tests that were not actually about 65m. KEEP
// is any reading good enough to store, WORSE a strictly coarser one that is
// still good enough, and TOO_COARSE one the gate must refuse.
const KEEP = ACCEPT_ACCURACY_M - 1;
const WORSE = ACCEPT_ACCURACY_M;
const TOO_COARSE = ACCEPT_ACCURACY_M + 1;

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
    const r = shouldSavePin(NO_PIN, { lat: 13.0878, lng: 80.2103, accuracyM: KEEP });
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
    assert.strictEqual(shouldSavePin(MEASURED(WORSE), { lat: 13, lng: 80, accuracyM: KEEP }).save, true);
    assert.strictEqual(shouldSavePin(MEASURED(WORSE), { lat: 13, lng: 80, accuracyM: KEEP }).reason, 'improved');
    // Equal does not churn the row on every bill of the day.
    assert.strictEqual(shouldSavePin(MEASURED(WORSE), { lat: 13, lng: 80, accuracyM: WORSE }).save, false);
    assert.strictEqual(shouldSavePin(MEASURED(KEEP), { lat: 13, lng: 80, accuracyM: WORSE }).save, false);
    assert.strictEqual(shouldSavePin(MEASURED(KEEP), { lat: 13, lng: 80, accuracyM: WORSE }).reason, 'not-better');
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
    const r = shouldSavePin(GEOCODED, { lat: 13, lng: 80, accuracyM: KEEP });
    assert.deepStrictEqual(r, { save: true, reason: 'replaces-geocoded' });
  },

  'a coarse fix still does not replace a geocoded pin': () => {
    // Replaceable is not the same as replaceable by anything.
    assert.strictEqual(shouldSavePin(GEOCODED, { lat: 13, lng: 80, accuracyM: 3000 }).reason, 'too-coarse');
  },

  'a row from before pinSource existed is judged on accuracy, as it always was': () => {
    assert.strictEqual(wantsPin(LEGACY(TOO_COARSE)), true);
    assert.strictEqual(wantsPin(LEGACY(PERFECT_ACCURACY_M)), false);
    // Legacy null accuracy was only ever written by the hand-placed path.
    assert.strictEqual(wantsPin({ ...LEGACY(null) }), false);
    assert.strictEqual(shouldSavePin(LEGACY(null), { lat: 13, lng: 80, accuracyM: KEEP }).reason, 'hand-placed');
    assert.strictEqual(shouldSavePin(LEGACY(TOO_COARSE), { lat: 13, lng: 80, accuracyM: KEEP }).save, true);
  },

  'the source of a pin is read from whether anything measured it': () => {
    assert.strictEqual(sourceFor({ lat: 13, lng: 80, accuracyM: 12 }), 'GPS');
    assert.strictEqual(sourceFor({ lat: 13, lng: 80, accuracyM: null }), 'MANUAL');
    // No pin in the request at all — a rename must not relabel anything.
    assert.strictEqual(sourceFor({ lat: null, lng: null, accuracyM: null }), null);
    assert.strictEqual(sourceFor({}), null);
  },
};

// --- the geocode plausibility gate ------------------------------------------
// Fixtures are the real thing: the five trusted pins on this network, and the
// worst of the thirteen pins the ungated geocoder wrote from their addresses.
const TRUSTED = [
  { lat: 17.37062, lng: 78.51814, accuracyM: 20, pinSource: 'GPS' },
  { lat: 17.37903, lng: 78.51543, accuracyM: 20, pinSource: 'GPS' },
  { lat: 17.37775, lng: 78.51491, accuracyM: 23, pinSource: 'GPS' },
  { lat: 17.37027, lng: 78.51516, accuracyM: 21, pinSource: 'GPS' },
  { lat: 17.37119, lng: 78.53213, accuracyM: null, pinSource: 'MANUAL' },
];
const COARSE_GPS = { lat: 17.36937, lng: 78.55508, accuracyM: 2000, pinSource: 'GPS' };
const A_GEOCODED = { lat: 17.48908, lng: 78.46680, accuracyM: null, pinSource: 'GEOCODED' };

Object.assign(tests, {
  'haversine is right on a known pair': () => {
    assert.strictEqual(Math.round(haversineKm(TRUSTED[0], TRUSTED[0])), 0);
    // One degree of latitude is ~111km anywhere.
    const d = haversineKm({ lat: 17, lng: 78 }, { lat: 18, lng: 78 });
    assert.ok(Math.abs(d - 111.19) < 0.5, `${d}`);
  },

  'only measured and hand-placed pins are trusted as anchors': () => {
    const t = trustedPins([...TRUSTED, COARSE_GPS, A_GEOCODED]);
    assert.strictEqual(t.length, TRUSTED.length);
    // A guess must never anchor the test that judges the next guess.
    assert.ok(!t.some((p) => p.pinSource === 'GEOCODED'));
    // Nor may a 2km-wide reading anchor a 2km test.
    assert.ok(!t.some((p) => p.accuracyM === 2000));
  },

  'every pin the ungated geocoder actually wrote is refused': () => {
    // Measured against the trusted pins above: median 8.5km out, worst 14.1km,
    // and not one within 2km. This is the regression that started all of it.
    const written = [
      [17.45960, 78.56381], [17.38292, 78.43966], [17.46537, 78.42729],
      [17.38292, 78.43966], [17.35252, 78.55116], [17.38292, 78.43966],
      [17.36136, 78.47452], [17.48908, 78.46680], [17.48908, 78.46680],
      [17.39519, 78.52570], [17.28999, 78.56603], [17.39436, 78.59446],
      [17.40186, 78.50966],
    ];
    for (const [lat, lng] of written) {
      const r = acceptGeocode({ lat, lng }, TRUSTED);
      assert.strictEqual(r.accept, false, `${lat},${lng} was accepted at ${r.km}km`);
      assert.strictEqual(r.reason, 'too-far');
    }
  },

  'a hit inside the trading area is allowed through': () => {
    const r = acceptGeocode({ lat: 17.3730, lng: 78.5190 }, TRUSTED);
    assert.strictEqual(r.accept, true);
    assert.ok(r.km < DEFAULT_MAX_KM, `${r.km}`);
  },

  'with nothing trustworthy to check against, nothing is written': () => {
    // Fails closed. The ungated version had no anchor either, and it wrote
    // thirteen confident wrong answers rather than none.
    const r = acceptGeocode({ lat: 17.3730, lng: 78.5190 }, []);
    assert.strictEqual(r.accept, false);
    assert.strictEqual(r.reason, 'nothing-to-check-against');
  },

  'a hit with no usable coordinates is refused before any maths': () => {
    for (const hit of [null, {}, { lat: 17.37, lng: null }, { lat: NaN, lng: 78.5 }]) {
      assert.strictEqual(acceptGeocode(hit, TRUSTED).reason, 'no-coordinates');
    }
  },
});


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