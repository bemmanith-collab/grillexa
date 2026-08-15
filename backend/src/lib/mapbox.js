// Mapbox geocoding, in both directions.
//
// Runs on the server for the same reason the Nominatim path does, plus one
// more: the token that can spend money never reaches a browser. The page gets
// a separate public token for drawing the map, which Mapbox expects to be
// public and which is restricted by URL in the Mapbox dashboard. This one —
// MAPBOX_ACCESS_TOKEN, a secret `sk.` token — only ever exists here.
//
// Output shape is deliberately identical to lib/geocode.js, so the routes, the
// map picker and the address fields cannot tell which provider answered. That
// is what makes the Nominatim fallback below a fallback and not a second
// codebase.

const { toAddressLine } = require('./geocode');

const GEOCODE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const TIMEOUT_MS = 8000;
// Every store is in India. Without this, "Adyar" also matches places in three
// other countries and the right answer is fourth in a list nobody reads to the
// end of.
const COUNTRY = 'in';
const LIMIT = 5;
// Mapbox rejects a forward query longer than this, and a semicolon is its
// batch separator rather than text.
const MAX_QUERY = 256;

function token() {
  return String(process.env.MAPBOX_ACCESS_TOKEN || '').trim();
}

// Whether to use Mapbox at all. Unset token means a local checkout, or a
// deploy where the secret was never set — either way the Nominatim path still
// works and is free, so the app degrades instead of losing address lookup.
function hasMapbox() {
  return token().length > 0;
}

// Mapbox files the surrounding area in a `context` array, each entry tagged by
// a dotted id whose first segment is the type — "place.12345" is the city.
// Read by that prefix rather than by position: the array is only as long as
// the place is mapped, so index 2 is a different thing in a village.
function fromContext(feature, ...types) {
  for (const type of types) {
    const hit = (feature.context || []).find((c) => String(c.id || '').split('.')[0] === type);
    if (hit?.text) return String(hit.text).trim();
  }
  return '';
}

// `address` is the house number and `text` the road, but only for a feature
// that is an address. For a shop returned as a POI, `text` is the shop's name,
// which belongs on the street line just as much — it is what someone reads to
// recognise the place.
function toParts(feature) {
  const houseNumber = String(feature.address || '').trim();
  const name = String(feature.text || '').trim();
  return {
    street: [houseNumber, name].filter(Boolean).join(' '),
    area: fromContext(feature, 'neighborhood', 'locality'),
    city: fromContext(feature, 'place', 'district'),
    state: fromContext(feature, 'region'),
    pinCode: fromContext(feature, 'postcode'),
  };
}

// `place_name` is Mapbox's own full string, kept as the fallback for a point
// whose parts are all empty — open country, or a place mapped only as a name.
function describe(feature) {
  const parts = toParts(feature);
  const line = toAddressLine(parts);
  return { parts, address: line || String(feature?.place_name || '').trim() };
}

async function request(path, params, fetchImpl) {
  const query = new URLSearchParams({ access_token: token(), language: 'en', ...params });
  const res = await fetchImpl(`${GEOCODE_URL}/${path}.json?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // 401 is a bad or missing token and 429 is the free tier spent. Both read
  // the same to the caller — the lookup failed, type the address — but the
  // status is kept in the message so the server log says which.
  if (!res.ok) throw new Error(`Mapbox responded ${res.status}`);
  return res.json();
}

async function reverseGeocode(lat, lng, fetchImpl = fetch) {
  // No `limit` here on purpose: Mapbox rejects a limit that is not paired with
  // exactly one `types` value, and the first feature is already the most
  // specific one it has.
  const body = await request(`${lng},${lat}`, {}, fetchImpl);
  const feature = body?.features?.[0];
  if (!feature) throw new Error('Mapbox returned no feature for that point');
  return describe(feature);
}

// A typed place name to candidate points. `near` is the last store pin the
// page knows of, passed as `proximity` so a colony name typed on its own ranks
// against the city the business is actually in.
//
// Returns [] rather than throwing for a query that matched nothing: an empty
// result is an ordinary answer to "find this", not a failure.
async function searchPlaces(query, near = null, fetchImpl = fetch) {
  const q = String(query || '').trim().slice(0, MAX_QUERY).replace(/;/g, ' ');
  if (q.length < 3) return [];
  const params = { country: COUNTRY, limit: String(LIMIT), autocomplete: 'true' };
  if (Array.isArray(near)) {
    const [lat, lng] = near.map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng)) params.proximity = `${lng},${lat}`;
  }
  const body = await request(encodeURIComponent(q), params, fetchImpl);
  const features = Array.isArray(body?.features) ? body.features : [];
  return features
    .map((feature) => {
      const [lng, lat] = feature.center || [];
      return {
        lat: Number(lat),
        lng: Number(lng),
        label: String(feature.place_name || '').trim(),
        address: describe(feature).address,
      };
    })
    // A feature without a usable pair is no use to a map.
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.label);
}

module.exports = { hasMapbox, describe, toParts, reverseGeocode, searchPlaces };
