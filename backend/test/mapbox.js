// Mapbox geocoding, and the free-tier meter.
//
// What matters here is that Mapbox's answer comes out in exactly the shape the
// Nominatim path produces — the routes, the map picker and the address fields
// all read one shape and must not be able to tell which provider replied. The
// context array is the fiddly part: it is only as long as the place is mapped,
// so a village has fewer entries than a city and reading it by position puts
// the state in the city field.
//
// Run: npm test (from backend/). No database and no network: the request
// functions are handed a fake fetch, and the meter a fake prisma.
const assert = require('assert');

const { describe: describeFeature, toParts, reverseGeocode, searchPlaces, hasMapbox } = require('../src/lib/mapbox');
const { monthKey, record, read, FREE } = require('../src/lib/mapUsage');

// A real Mapbox reply, trimmed to the fields used.
const hyderabad = {
  place_name: '12 MG Road, Begumpet, Hyderabad, Telangana 500016, India',
  text: 'MG Road',
  address: '12',
  center: [78.4867, 17.385],
  context: [
    { id: 'neighborhood.884', text: 'Begumpet' },
    { id: 'postcode.117', text: '500016' },
    { id: 'place.925', text: 'Hyderabad' },
    { id: 'region.174', text: 'Telangana' },
    { id: 'country.293', text: 'India' },
  ],
};

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

function withToken(value, fn) {
  const before = process.env.MAPBOX_ACCESS_TOKEN;
  process.env.MAPBOX_ACCESS_TOKEN = value;
  return Promise.resolve(fn()).finally(() => {
    if (before === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = before;
  });
}

const tests = {
  'a full feature becomes one address line and its parts': () => {
    const { address, parts } = describeFeature(hyderabad);
    assert.strictEqual(address, '12 MG Road, Begumpet, Hyderabad, Telangana 500016');
    assert.deepStrictEqual(parts, {
      street: '12 MG Road',
      area: 'Begumpet',
      city: 'Hyderabad',
      state: 'Telangana',
      pinCode: '500016',
    });
  },

  'context is read by type, not by position': () => {
    // A village: no neighbourhood and no postcode, so everything after them
    // shifts up. Read by index, "Telangana" lands in the city field.
    const parts = toParts({
      text: 'Bus Stand',
      center: [78.1, 17.9],
      context: [
        { id: 'place.1', text: 'Toopran' },
        { id: 'region.174', text: 'Telangana' },
        { id: 'country.293', text: 'India' },
      ],
    });
    assert.strictEqual(parts.city, 'Toopran');
    assert.strictEqual(parts.state, 'Telangana');
    assert.strictEqual(parts.area, '');
    assert.strictEqual(parts.pinCode, '');
  },

  'a feature with no mapped parts falls back to the full name': () => {
    const { address } = describeFeature({ place_name: 'Somewhere, India', text: '', context: [] });
    assert.strictEqual(address, 'Somewhere, India');
  },

  'a search result carries the pair the map needs': () =>
    withToken('sk.test', async () => {
      const [first] = await searchPlaces('MG Road', null, ok({ features: [hyderabad] }));
      assert.strictEqual(first.lat, 17.385);
      assert.strictEqual(first.lng, 78.4867);
      assert.strictEqual(first.label, hyderabad.place_name);
      assert.strictEqual(first.address, '12 MG Road, Begumpet, Hyderabad, Telangana 500016');
    }),

  'the search is fenced to India and biased to the nearest known store': () =>
    withToken('sk.test', async () => {
      let seen = '';
      const spy = async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
      };
      await searchPlaces('MG Road', [17.385, 78.4867], spy);
      assert.ok(seen.includes('country=in'), 'country filter missing');
      // proximity is lng,lat — the opposite order to everything else in the
      // app, and getting it backwards silently ranks results off the coast.
      assert.ok(seen.includes('proximity=78.4867%2C17.385'), `proximity wrong: ${seen}`);
      assert.ok(!seen.includes('access_token=&'), 'token not sent');
    }),

  'a nonsense proximity is dropped rather than sent': () =>
    withToken('sk.test', async () => {
      let seen = '';
      await searchPlaces('MG Road', ['x', 'y'], async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
      });
      assert.ok(!seen.includes('proximity='), `proximity should be absent: ${seen}`);
    }),

  'a query under three characters never reaches the network': () =>
    withToken('sk.test', async () => {
      const boom = async () => {
        throw new Error('should not have been called');
      };
      assert.deepStrictEqual(await searchPlaces('ad', null, boom), []);
      assert.deepStrictEqual(await searchPlaces('  ', null, boom), []);
    }),

  'a semicolon is stripped, because Mapbox reads it as a batch separator': () =>
    withToken('sk.test', async () => {
      let seen = '';
      await searchPlaces('Anna Nagar; Chennai', null, async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ features: [] }) };
      });
      assert.ok(!seen.includes('%3B') && !seen.includes(';'), `semicolon survived: ${seen}`);
    }),

  'a feature without a usable pair is dropped': () =>
    withToken('sk.test', async () => {
      const results = await searchPlaces(
        'anything',
        null,
        ok({ features: [{ place_name: 'No centre', context: [] }, hyderabad] })
      );
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].lat, 17.385);
    }),

  'a refused request throws with its status, so the log says which': () =>
    withToken('sk.test', async () => {
      await assert.rejects(
        () => reverseGeocode(17.385, 78.4867, async () => ({ ok: false, status: 401 })),
        /401/
      );
    }),

  'a point Mapbox cannot name throws rather than returning a blank address': () =>
    withToken('sk.test', async () => {
      await assert.rejects(() => reverseGeocode(17.385, 78.4867, ok({ features: [] })), /no feature/);
    }),

  'reverse geocoding asks in lng,lat order': () =>
    withToken('sk.test', async () => {
      let seen = '';
      await reverseGeocode(17.385, 78.4867, async (url) => {
        seen = url;
        return { ok: true, status: 200, json: async () => ({ features: [hyderabad] }) };
      });
      assert.ok(seen.includes('/78.4867,17.385.json'), `wrong order: ${seen}`);
    }),

  'no token means Mapbox is off, and the Nominatim path stays in charge': () => {
    const before = process.env.MAPBOX_ACCESS_TOKEN;
    delete process.env.MAPBOX_ACCESS_TOKEN;
    assert.strictEqual(hasMapbox(), false);
    process.env.MAPBOX_ACCESS_TOKEN = '   ';
    assert.strictEqual(hasMapbox(), false, 'whitespace is not a token');
    process.env.MAPBOX_ACCESS_TOKEN = 'sk.real';
    assert.strictEqual(hasMapbox(), true);
    if (before === undefined) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = before;
  },

  'the month key is UTC, so a load at 2am IST lands in the right month': () => {
    // 23:30 UTC on the 31st is 05:00 IST on the 1st. Local time would file
    // this load under September and understate August's bill.
    assert.strictEqual(monthKey(new Date('2026-08-31T23:30:00Z')), '2026-08');
    assert.strictEqual(monthKey(new Date('2026-09-01T00:30:00Z')), '2026-09');
  },

  'a load increments rather than reads-then-writes': async () => {
    const calls = [];
    const prisma = {
      mapUsage: {
        upsert: async (args) => {
          calls.push(args);
          return { month: args.where.month, loads: 41, geocodes: 7 };
        },
      },
    };
    const out = await record(prisma, 'loads', new Date('2026-08-14T00:00:00Z'));
    assert.deepStrictEqual(calls[0].update, { loads: { increment: 1 } });
    assert.deepStrictEqual(calls[0].create, { month: '2026-08', loads: 1 });
    assert.deepStrictEqual(out, {
      month: '2026-08',
      loads: { used: 41, limit: FREE.loads },
      geocodes: { used: 7, limit: FREE.geocodes },
    });
  },

  'a geocode moves its own counter, not the map loads': async () => {
    const calls = [];
    const prisma = {
      mapUsage: {
        upsert: async (args) => {
          calls.push(args);
          return { month: args.where.month, loads: 41, geocodes: 8 };
        },
      },
    };
    const out = await record(prisma, 'geocodes', new Date('2026-08-14T00:00:00Z'));
    assert.deepStrictEqual(calls[0].update, { geocodes: { increment: 1 } });
    assert.deepStrictEqual(calls[0].create, { month: '2026-08', geocodes: 1 });
    assert.strictEqual(out.loads.used, 41);
    assert.strictEqual(out.geocodes.used, 8);
  },

  'a mistyped counter is refused rather than sent to the database': async () => {
    const prisma = {
      mapUsage: {
        upsert: async () => {
          throw new Error('should not have been called');
        },
      },
    };
    await assert.rejects(() => record(prisma, 'mapLoads'), /Unknown usage counter/);
  },

  'a month with nothing spent yet reads zero, not null': async () => {
    const prisma = { mapUsage: { findUnique: async () => null } };
    const out = await read(prisma, new Date('2026-08-14T00:00:00Z'));
    assert.deepStrictEqual(out, {
      month: '2026-08',
      loads: { used: 0, limit: FREE.loads },
      geocodes: { used: 0, limit: FREE.geocodes },
    });
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
  console.log(`\nmapbox: ${Object.keys(tests).length - failed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
