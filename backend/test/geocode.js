// Reverse geocoding: turning a GPS fix into an address a driver recognises.
// Nominatim files the same thing under different keys depending on how an area
// was mapped, so the picking rules are what's checked here — a fix that comes
// back with a blank address sends someone to a shop with no directions.
//
// Run: npm test (from backend/). No database and no network: describe() is
// pure, and reverseGeocode() is handed a fake fetch.
const assert = require('assert');

const { isLatLng, describe: describeFix, reverseGeocode } = require('../src/lib/geocode');

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

  'an error from Nominatim is thrown, never returned as an address': async () => {
    await assert.rejects(
      () => reverseGeocode(13, 80, async () => ({ ok: false, status: 429 })),
      /429/
    );
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
