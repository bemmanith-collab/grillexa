// Give an unpinned store a provisional pin from its address, off the back of a
// bill, without the bill ever knowing.
//
// WHY IT IS SHAPED LIKE THIS: the obvious version is a middleware that awaits a
// geocode before creating the bill. That puts a third-party HTTP call between a
// customer and their receipt — a slow or down geocoder becomes a slow or down
// till — and an async middleware that throws takes the process with it on
// Express 4 (see test/crash-guards.js). So nothing here is awaited by a route,
// nothing here can reject into one, and it all starts after the response has
// already gone out.
//
// WHAT IT IS FOR: a store added without a pin would otherwise wait for the
// weekly backfill, or for somebody to bill there with location permission
// granted and a clean fix. This closes that gap with a guess, and marks it as
// one.
//
// WHAT IT IS NOT: a substitute for the real fix. Everything written here is
// pinSource 'GEOCODED' with a null accuracyM, so the first decent GPS reading
// from someone billing inside the shop replaces it (see lib/storePin.js). An
// address is a neighbourhood, not a shutter.

const prisma = require('../db');
const { searchPlaces, answerWith } = require('./geocode');
const mapbox = require('./mapbox');
const { notifyPinWatcher } = require('./push');

// OFF UNLESS A CITY IS CONFIGURED, and that is the point rather than an
// oversight. Store addresses here are bare neighbourhood names — "MG Road",
// "Whitefield", "Jayanagar" — and each exists in several Indian cities. Run
// without a city, a real backfill put three of six Bengaluru shops in Chennai,
// every one of them a confident-looking match. There is no safe automatic
// answer to "which city", so somebody has to say, once, in the environment.
const CITY = String(process.env.STORE_GEOCODE_CITY || '').trim();

// Don't chase the same store again for a day. Without this, a store whose
// address will never geocode fires a fresh lookup on every bill it ever rings
// up — and Nominatim asks for one request per second across an outbound IP the
// whole app shares. That is how the app's own address lookups get blocked.
const RETRY_MS = 24 * 60 * 60 * 1000;

// How long to wait for a geocoder before giving up on this bill's attempt.
//
// The HTTP calls already abort themselves at 8s (`AbortSignal.timeout` in
// lib/geocode.js and lib/mapbox.js), so nothing can hang forever without this.
// What this adds is a shorter *waiting* budget: past it we stop caring about
// the answer, log, and let the day's throttle carry the store to tomorrow.
//
// Racing a timer does not cancel the request — the fetch runs on to its own
// abort — so this is "stop waiting", not "stop working". That is the honest
// description, and it is fine here precisely because nobody is waiting on us.
//
// Tunable because 2s is tight for Nominatim on a bad day: a reply that would
// have arrived at 3s is a pin thrown away for nothing, and this work is off the
// request path where the extra second costs no one anything.
const TIMEOUT_MS = Number(process.env.STORE_GEOCODE_TIMEOUT_MS) > 0 ? Number(process.env.STORE_GEOCODE_TIMEOUT_MS) : 2000;

// ponytail: in-memory, so the throttle resets on deploy and is per-process.
// Both are fine at one machine and a handful of stores — the worst case is a
// few extra lookups after a restart. Move it to a column on Store if this ever
// runs on more than one instance.
const attempts = new Map();

/**
 * Whether this store is worth a lookup right now. Pure, so the rule can be
 * checked without a database, a clock or a network — see test/storePin.js.
 */
function shouldAttempt({ store, lastAttemptAt, now, city }) {
  // No city configured means no safe query to build.
  if (!city) return false;
  if (!store) return false;
  // Already located, by any means. Never overwrite a pin we already have.
  if (store.lat != null && store.lng != null) return false;
  // Nothing to search with. Somebody has to type an address in first.
  if (!String(store.address || '').trim()) return false;
  if (lastAttemptAt != null && now - lastAttemptAt < RETRY_MS) return false;
  return true;
}

/**
 * The query to send. Naming the city in the string itself is what actually
 * works — the geocoders' proximity hint is a preference they are free to
 * ignore, and they do.
 */
function queryFor(address, city) {
  return address.toLowerCase().includes(city.toLowerCase()) ? address : `${address}, ${city}`;
}

/**
 * Stop waiting after `ms`, without leaving a timer armed behind us. `.unref()`
 * so a pending one can never hold the process open at shutdown.
 */
function stopWaitingAfter(promise, ms, label) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} gave up after ${ms}ms`)), ms);
  });
  timer.unref?.();
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
}

async function fillPin(storeId, timeoutMs) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const now = Date.now();
  if (!shouldAttempt({ store, lastAttemptAt: attempts.get(storeId), now, city: CITY })) return;

  // Marked before the lookup, not after: a failed attempt has to throttle too,
  // or a store that cannot be geocoded is exactly the one retried hardest.
  attempts.set(storeId, now);

  const query = queryFor(store.address, CITY);
  // Mapbox first, Nominatim if it is absent or refuses — the same fallback the
  // routes use, so this can never resolve a store somewhere the Stores page
  // would disagree with.
  const { value: results } = await stopWaitingAfter(
    answerWith(
      mapbox.hasMapbox(),
      () => mapbox.searchPlaces(query, null),
      () => searchPlaces(query, null),
      (err) => console.warn(`Mapbox failed geocoding ${store.name}, using Nominatim: ${err.message}`)
    ),
    timeoutMs,
    `Geocoding ${store.name}`
  );

  const hit = results[0];
  if (!hit) {
    console.log(`No geocode match for "${query}" (${store.name}) — leaving it unpinned.`);
    return;
  }

  // `lat: null` in the where clause, not a re-read: a GPS fix from somebody
  // billing in the shop can land during the second this lookup takes, and that
  // one is worth more than this one. Letting the database enforce it makes the
  // race impossible rather than unlikely.
  const { count } = await prisma.store.updateMany({
    where: { id: storeId, lat: null },
    data: { lat: hit.lat, lng: hit.lng, accuracyM: null, pinSource: 'GEOCODED' },
  });

  if (count === 0) {
    console.log(`${store.name} was pinned while we were geocoding it — keeping the pin it got.`);
    return;
  }
  console.log(`Provisional pin for ${store.name} from "${query}" -> ${hit.lat.toFixed(5)}, ${hit.lng.toFixed(5)}`);

  // Successes only, and only to GEO_NOTIFY_EMAIL. Says "from its address" in
  // as many words: this pin is a guess at a neighbourhood, not somebody's phone
  // standing at the shutter, and a notification that blurred the two would be
  // the one place that difference stops being visible.
  await notifyPinWatcher({
    title: '🗺️ Store located from its address',
    body: `${store.name} pinned from "${query}". Provisional — a GPS fix while billing will replace it.`,
    url: `/stores?focus=${storeId}`,
    tag: `store-pin-${storeId}`,
  }).catch((err) => console.warn(`Pin notification failed: ${err.message}`));
}

/**
 * Give a store a pin if it has none. Told, not asked.
 *
 * Returns nothing, awaits nothing, throws nothing — synchronously, so a caller
 * cannot accidentally block on it even by writing `await`. The bill that
 * triggered it must not be able to tell whether this ran, succeeded or failed.
 *
 * setImmediate rather than a bare call, so the work is queued behind the
 * response already on its way out.
 *
 * Call it AFTER the response, from any endpoint that creates a bill against a
 * store. It is safe to call for a store that is already pinned, on every bill,
 * from anywhere — the guards are in here, not at the call sites.
 */
function ensureStoreCoordinates(storeId, { timeoutMs = TIMEOUT_MS } = {}) {
  const id = Number(storeId);
  if (!CITY || !Number.isInteger(id) || id <= 0) return;
  setImmediate(() => {
    fillPin(id, timeoutMs).catch((err) =>
      console.warn(`⚠️ Could not populate coordinates for store ${id}: ${err.message}`)
    );
  });
}

module.exports = { ensureStoreCoordinates, shouldAttempt, queryFor, RETRY_MS, TIMEOUT_MS };
