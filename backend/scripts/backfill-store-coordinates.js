// Give a pin to every store that trades but has never been located.
//
//   node scripts/backfill-store-coordinates.js                      # preview, changes nothing
//   node scripts/backfill-store-coordinates.js --city="Bengaluru"   # preview, biased to one city
//   node scripts/backfill-store-coordinates.js --city="Bengaluru" --apply
//   node scripts/backfill-store-coordinates.js --all                # include stores with no sales yet
//   node scripts/backfill-store-coordinates.js --apply --json       # machine-readable, for a scheduled run
//
// USE --city WHENEVER THE STORES BEING GEOCODED ARE NOT IN THE SAME CITY AS
// THE ONES ALREADY PINNED. Store addresses here are bare neighbourhood names —
// "MG Road", "Whitefield", "Jayanagar" — and every one of them exists in
// several Indian cities. Without a city the search is biased toward an existing
// pin, and if that pin is in the wrong city the bias actively hurts: the first
// real run put Bengaluru's Indiranagar, Jayanagar and Whitefield in Chennai,
// each with a confident-looking match. Three of six, and nothing about the
// output looked wrong. That is the whole reason this previews by default.
//
// WHY THIS EXISTS: the growth tools answer every "where should we expand"
// question from the stores they can place on a map, and right now that is one
// of eight. Six stores have sales and no coordinates, so their trade is
// invisible to exactly the questions it should be driving.
//
// WHAT IT IS NOT: a substitute for a real fix. An address geocodes to the
// middle of a neighbourhood as often as to the shutter, so these pins are
// written as pinSource 'GEOCODED' — good enough to put a store on the map and
// aggregate it, and explicitly marked as replaceable by the first decent GPS
// reading that arrives from someone billing inside the shop. accuracyM stays
// null because nothing measured this; inventing a radius would make a rooftop
// guess indistinguishable from a GPS fix, which is the one outcome worth
// avoiding here.
//
// A DRY RUN BY DEFAULT, deliberately. A wrong pin is silent — it never looks
// like an error, it just sends deliveries to the wrong road and skews every
// distance afterwards. Read the matches, then re-run with --apply.

const prisma = require('../src/db');
const { searchPlaces, answerWith } = require('../src/lib/geocode');
const mapbox = require('../src/lib/mapbox');

// Nominatim is free, run on donated hardware, and asks for one request per
// second. The whole app shares one outbound IP, so going faster here is how
// that IP gets blocked for every store lookup the app makes. Paced for Mapbox
// too: a handful of stores is seconds either way, and one rule is one thing to
// get wrong.
const PACE_MS = 1100;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const everyStore = args.includes('--all');
const asJson = args.includes('--json');
const city = (args.find((a) => a.startsWith('--city=')) || '').slice('--city='.length).replace(/^["']|["']$/g, '').trim();
// Re-do pins this script wrote before, which is the escape hatch for having run
// it with the wrong --city. Without it a wrong pin is stuck: the store now has
// coordinates, so the next run skips it and the only fix is SQL by hand. Only
// ever reconsiders 'GEOCODED' pins — a GPS fix or a hand-placed one is never
// touched, no matter what flags are passed.
const redoGeocoded = args.includes('--redo-geocoded');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...parts) {
  if (!asJson) console.log(...parts);
}

// Mapbox when a token is configured and accepted, Nominatim otherwise — the
// same fallback the app's own address lookups use, so this script cannot geocode
// a store to somewhere the Stores page would disagree with.
async function geocode(address, near) {
  const { value: results, provider } = await answerWith(
    mapbox.hasMapbox(),
    () => mapbox.searchPlaces(address, near),
    () => searchPlaces(address, near),
    (err) => log(`  (Mapbox failed, using Nominatim: ${err.message})`)
  );
  return { hit: results[0] || null, provider };
}

async function main() {
  // Stores with no pin. `_count.sales` is what decides whether a store is
  // trading — the question this backfill exists to serve is about revenue the
  // network cannot see, and a store with no sales contributes none of it.
  const pinless = await prisma.store.findMany({
    where: {
      OR: [
        { lat: null },
        { lng: null },
        ...(redoGeocoded ? [{ pinSource: 'GEOCODED' }] : []),
      ],
    },
    include: { _count: { select: { sales: true } } },
    orderBy: { name: 'asc' },
  });

  const trading = everyStore ? pinless : pinless.filter((s) => s._count.sales > 0);
  const skippedQuiet = pinless.length - trading.length;

  // An address is the only input this has. Separated out rather than counted as
  // a failure, because the fix is different: somebody has to type one in, and no
  // amount of re-running will help.
  const noAddress = trading.filter((s) => !String(s.address || '').trim());
  const candidates = trading.filter((s) => String(s.address || '').trim());

  // Bias the search toward where these shops actually are. Without any bias a
  // common road name ranks by how thoroughly a city is mapped; with the WRONG
  // bias it ranks toward a city these shops are not in, which is worse — the
  // match still looks plausible. --city is the explicit answer and beats the
  // guess below whenever it is given.
  let near = null;
  let anchorLabel = null;
  if (city) {
    const { hit } = await geocode(city, null);
    if (!hit) {
      console.error(`Could not find "${city}" — check the spelling, or drop --city to bias off an existing pin.`);
      process.exitCode = 1;
      return;
    }
    near = [hit.lat, hit.lng];
    anchorLabel = `--city="${city}" (${hit.label.split(',').slice(0, 2).join(',')})`;
    await sleep(PACE_MS);
  } else {
    const anchorStore = await prisma.store.findFirst({
      where: { lat: { not: null }, lng: { not: null } },
      orderBy: { id: 'desc' },
    });
    if (anchorStore) {
      near = [anchorStore.lat, anchorStore.lng];
      anchorLabel = `${anchorStore.name} — pass --city if these shops are in a different city`;
    }
  }

  log(`${pinless.length} store(s) ${redoGeocoded ? 'without a pin, or carrying one this script wrote' : 'without a pin'}.`);
  if (skippedQuiet > 0) log(`  ${skippedQuiet} skipped: no sales yet (use --all to include them).`);
  if (noAddress.length > 0) {
    log(`  ${noAddress.length} skipped: no address to search — ${noAddress.map((s) => s.name).join(', ')}`);
  }
  if (near) log(`  Biasing search near ${anchorLabel} (${near[0].toFixed(4)}, ${near[1].toFixed(4)}).`);
  else log('  No pinned store to bias toward — pass --city="…" so a bare road name resolves in the right city.');
  log(`  Geocoder: ${mapbox.hasMapbox() ? 'Mapbox, falling back to Nominatim' : 'Nominatim'}`);
  log(apply ? '\nWRITING pins.\n' : '\nDRY RUN — nothing will be written. Re-run with --apply.\n');

  const updated = [];
  const failed = [
    ...noAddress.map((s) => ({ id: s.id, name: s.name, address: null, reason: 'no address on the store record' })),
  ];

  for (const [i, store] of candidates.entries()) {
    if (i > 0) await sleep(PACE_MS);
    // Naming the city in the query itself, not only as a proximity hint. The
    // hint is `bounded=0` — a preference the geocoder is free to ignore, and it
    // does. "Whitefield, Bengaluru" is the thing that actually pins it.
    const query =
      city && !store.address.toLowerCase().includes(city.toLowerCase())
        ? `${store.address}, ${city}`
        : store.address;

    try {
      const { hit, provider } = await geocode(query, near);
      if (!hit) {
        failed.push({ id: store.id, name: store.name, address: store.address, query, reason: 'no match from the geocoder' });
        log(`  ✗ ${store.name} — no match for "${query}"`);
        continue;
      }

      if (apply) {
        await prisma.store.update({
          where: { id: store.id },
          data: { lat: hit.lat, lng: hit.lng, accuracyM: null, pinSource: 'GEOCODED' },
        });
      }
      updated.push({
        id: store.id,
        name: store.name,
        address: store.address,
        query,
        lat: hit.lat,
        lng: hit.lng,
        matched: hit.label,
        provider,
      });
      log(`  ${apply ? '✓' : '·'} ${store.name} -> ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`);
      log(`      searched "${query}"`);
      log(`      matched  "${hit.label}" (${provider})`);
    } catch (err) {
      // One store's failure must not cost the rest of the run — the whole point
      // is to get as many onto the map as possible in one pass.
      failed.push({ id: store.id, name: store.name, address: store.address, reason: err.message });
      log(`  ✗ ${store.name} — ${err.message}`);
    }
  }

  const summary = {
    applied: apply,
    at: new Date().toISOString(),
    storesWithoutPin: pinless.length,
    attempted: candidates.length,
    updatedCount: updated.length,
    failedCount: failed.length,
    updated,
    failed,
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    log(`\n${apply ? 'Wrote' : 'Would write'} ${updated.length} pin(s); ${failed.length} still without one.`);
    if (failed.length > 0) {
      log('\nStill unpinned:');
      for (const f of failed) log(`  ${f.name} — ${f.reason}`);
      log('\nFix these by adding or correcting the address on the Stores page, then re-run.');
    }
    if (!apply && updated.length > 0) {
      log('\nCheck the matches above against what you know, then re-run with --apply.');
    }
  }
}

main()
  .catch((err) => {
    console.error(`backfill-store-coordinates failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
