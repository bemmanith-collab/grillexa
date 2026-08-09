// Reverse geocoding: turning a GPS fix into an address a driver recognises.
// Nominatim files the same thing under different keys depending on how an area
// was mapped, so the picking rules are what's checked here — a fix that comes
// back with a blank address sends someone to a shop with no directions.
//
// Run: npm test (from backend/). No database and no network: describe() is
// pure, and reverseGeocode() is handed a fake fetch.
const assert = require('assert');

const { isLatLng, describe: describeFix, reverseGeocode, searchPlaces, readCoords } = require('../src/lib/geocode');

// A real Nominatim reply, trimmed to the fields used.
const chennai = {
  display_name: '12, 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu, 600040, India',
  address: {
    house_number: '12',
    road: '2nd Avenue',
    suburb: 'Anna Nagar',
    city: 'Chennai',
    state: 'Tamil Nadu',
    postcode: '600040',
    country: 'India',
  },
};

const tests = {
  'a full reply becomes one address line and its parts': () => {
    const { address, parts } = describeFix(chennai);
    assert.strictEqual(address, '12 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu 600040');
    assert.deepStrictEqual(parts, {
      street: '12 2nd Avenue',
      area: 'Anna Nagar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pinCode: '600040',
    });
  },

  'a village reply still yields a city, under a different key': () => {
    const { parts } = describeFix({ address: { village: 'Sriperumbudur', state: 'Tamil Nadu' } });
    assert.strictEqual(parts.city, 'Sriperumbudur');
  },

  'a road with no house number does not gain a leading space': () => {
    const { address } = describeFix({ address: { road: 'GST Road', city: 'Chennai' } });
    assert.strictEqual(address, 'GST Road, Chennai');
  },

  'missing pieces are dropped, not printed as gaps': () => {
    const { address } = describeFix({ address: { city: 'Chennai', postcode: '600001' } });
    assert.strictEqual(address, 'Chennai, 600001');
  },

  "a point with no address parts falls back to Nominatim's own line": () => {
    const { address } = describeFix({ display_name: 'Bay of Bengal', address: {} });
    assert.strictEqual(address, 'Bay of Bengal');
  },

  'a reply with nothing usable yields an empty address rather than throwing': () => {
    assert.strictEqual(describeFix({}).address, '');
    assert.strictEqual(describeFix(null).address, '');
  },

  'coordinates are range-checked, and zero is valid': () => {
    assert.strictEqual(isLatLng(13.0878, 80.2103), true);
    assert.strictEqual(isLatLng(0, 0), true);
    assert.strictEqual(isLatLng(-90, 180), true);
    assert.strictEqual(isLatLng(91, 80), false);
    assert.strictEqual(isLatLng(13, 181), false);
    assert.strictEqual(isLatLng(NaN, 80), false);
    assert.strictEqual(isLatLng('13', '80'), false);
  },

  'the lookup identifies the app to Nominatim, as its policy asks': async () => {
    let seen = null;
    await reverseGeocode(13.0878, 80.2103, async (url, opts) => {
      seen = { url, opts };
      return { ok: true, json: async () => chennai };
    });
    assert.ok(seen.url.startsWith('https://nominatim.openstreetmap.org/reverse?'), seen.url);
    assert.ok(seen.url.includes('lat=13.0878') && seen.url.includes('lon=80.2103'), seen.url);
    assert.ok(/grillexa/.test(seen.opts.headers['User-Agent']), 'User-Agent must name the app');
  },


  'a valid pin is taken with its accuracy': () => {
    const r = readCoords({ lat: 13.0878, lng: 80.2103, accuracyM: 12.4 });
    assert.deepStrictEqual(r, { ok: true, data: { lat: 13.0878, lng: 80.2103, accuracyM: 12.4 } });
  },

  'a hand-typed pin has no accuracy, and that is a real value': () => {
    assert.deepStrictEqual(readCoords({ lat: 13, lng: 80 }).data, { lat: 13, lng: 80, accuracyM: null });
    assert.deepStrictEqual(readCoords({ lat: 13, lng: 80, accuracyM: null }).data.accuracyM, null);
    assert.deepStrictEqual(readCoords({ lat: 13, lng: 80, accuracyM: -5 }).data.accuracyM, null);
    assert.deepStrictEqual(readCoords({ lat: 13, lng: 80, accuracyM: 'x' }).data.accuracyM, null);
  },

  'half a pin is rejected rather than half-saved': () => {
    for (const body of [{ lat: 13 }, { lng: 80 }, { lat: 13, lng: 'x' }, { lat: 91, lng: 80 }, { lat: 13, lng: 181 }]) {
      assert.strictEqual(readCoords(body).ok, false, JSON.stringify(body));
    }
  },

  'clearing the pin clears its accuracy too': () => {
    assert.deepStrictEqual(readCoords({ lat: null, lng: null }).data, { lat: null, lng: null, accuracyM: null });
    assert.deepStrictEqual(readCoords({ lat: '', lng: '' }).data, { lat: null, lng: null, accuracyM: null });
  },

  'a body that never mentions coordinates leaves the saved pin alone': () => {
    assert.deepStrictEqual(readCoords({ name: 'Adyar' }).data, {});
    assert.deepStrictEqual(readCoords({}).data, {});
  },

  'zero is a real coordinate here too': () => {
    assert.deepStrictEqual(readCoords({ lat: 0, lng: 0 }).data, { lat: 0, lng: 0, accuracyM: null });
  },
  'an error from Nominatim is thrown, never returned as an address': async () => {
    await assert.rejects(
      () => reverseGeocode(13, 80, async () => ({ ok: false, status: 429 })),
      /429/
    );
  },

  // Place search, the other direction: what the map picker's search box calls.
  'a search result carries a usable pair, a label and an address': async () => {
    const fake = async () => ({
      ok: true,
      json: async () => [{ lat: '13.0067', lon: '80.2570', display_name: 'Adyar, Chennai', address: chennai.address }],
    });
    const [first] = await searchPlaces('Adyar', null, fake);
    assert.strictEqual(first.lat, 13.0067);
    assert.strictEqual(first.lng, 80.257);
    assert.strictEqual(first.label, 'Adyar, Chennai');
    // Composed by the same rules the reverse lookup uses, so a searched
    // address and a captured one read identically.
    assert.strictEqual(first.address, '12 2nd Avenue, Anna Nagar, Chennai, Tamil Nadu 600040');
  },
  'a row without a usable pair is dropped rather than pinned at zero': async () => {
    // Nominatim has returned rows like this for oddly mapped features. Passing
    // one through puts a marker in the Gulf of Guinea with no error anywhere.
    const fake = async () => ({
      ok: true,
      json: async () => [
        { lat: 'not-a-number', lon: '80.2', display_name: 'Broken' },
        { lat: '13.1', lon: '80.2', display_name: '' },
        { lat: '13.2', lon: '80.3', display_name: 'Good one' },
      ],
    });
    const results = await searchPlaces('anything', null, fake);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].label, 'Good one');
  },
  'a query too short to mean anything never reaches Nominatim': async () => {
    // The shared outbound IP has one rate-limit budget for the whole app, so a
    // two-character query must not spend a request from it.
    let called = false;
    const fake = async () => {
      called = true;
      return { ok: true, json: async () => [] };
    };
    assert.deepStrictEqual(await searchPlaces('ad', null, fake), []);
    assert.deepStrictEqual(await searchPlaces('  ', null, fake), []);
    assert.strictEqual(called, false);
  },
  'a six-digit query is looked up as a PIN code, not as free text': async () => {
    // Nominatim rejects a request carrying both `q` and a structured field, so
    // this is one or the other — and free text can match a house number or a
    // road that happens to contain the digits.
    let seen = '';
    const fake = async (url) => {
      seen = url;
      return { ok: true, json: async () => [] };
    };
    await searchPlaces('600040', null, fake);
    assert.ok(seen.includes('postalcode=600040'), seen);
    assert.ok(!seen.includes('q='), 'must not send q alongside postalcode');
  },
  'anything that is not six digits stays a free-text search': async () => {
    let seen = '';
    const fake = async (url) => {
      seen = url;
      return { ok: true, json: async () => [] };
    };
    await searchPlaces('60004', null, fake);
    assert.ok(seen.includes('q=60004'), seen);
    await searchPlaces('Anna Nagar', null, fake);
    assert.ok(seen.includes('q=Anna%20Nagar'), seen);
    assert.ok(!seen.includes('postalcode='), seen);
  },
  'a nearby pin biases results without excluding anywhere else': async () => {
    let seen = '';
    const fake = async (url) => {
      seen = url;
      return { ok: true, json: async () => [] };
    };
    // Hyderabad, where the stores actually are.
    await searchPlaces('MG Road', [17.385, 78.4867], fake);
    assert.ok(seen.includes('viewbox=77.9867,16.885,78.9867,17.885'), seen);
    // bounded=0 is the whole point: a shop in a new city must still be
    // findable through the screen used to add the first store there.
    assert.ok(seen.includes('bounded=0'), seen);
  },
  'a missing or nonsense nearby pin is simply ignored': async () => {
    let seen = '';
    const fake = async (url) => {
      seen = url;
      return { ok: true, json: async () => [] };
    };
    await searchPlaces('MG Road', null, fake);
    assert.ok(!seen.includes('viewbox'), seen);
    await searchPlaces('MG Road', [999, 999], fake);
    assert.ok(!seen.includes('viewbox'), seen);
  },
  'a non-array reply is an empty result, not a crash': async () => {
    const fake = async () => ({ ok: true, json: async () => ({ error: 'Unable to geocode' }) });
    assert.deepStrictEqual(await searchPlaces('nowhere', null, fake), []);
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed++;
      console.error(`FAIL  ${name}\n      ${err.message}`);
    }
  }
  console.log(`\ngeocode: ${Object.keys(tests).length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
