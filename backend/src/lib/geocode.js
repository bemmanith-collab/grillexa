// Turning a GPS fix into something a person recognises.
//
// This runs on the server rather than in the page for two reasons: Nominatim's
// usage policy asks for a User-Agent identifying the application, which a
// browser refuses to let script set, and the app's CSP keeps connect-src to
// 'self' so the page can't call a third-party host anyway.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'grillexa/1.0 (https://grillexa.fly.dev; stock and billing for retail stores)';
const TIMEOUT_MS = 8000;

function isLatLng(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

// Nominatim files the same thing under different keys depending on how the
// area is mapped — a Chennai suburb comes back as `suburb`, `neighbourhood` or
// `city_district`, and the city itself as `city`, `town`, `village` or
// `state_district`. Take the first that exists rather than assuming one shape.
function pick(address, keys) {
  for (const key of keys) {
    const value = address?.[key];
    if (value) return String(value).trim();
  }
  return '';
}

function toParts(address) {
  const houseNumber = pick(address, ['house_number']);
  const road = pick(address, ['road', 'pedestrian', 'footway']);
  return {
    street: [houseNumber, road].filter(Boolean).join(' '),
    area: pick(address, ['neighbourhood', 'suburb', 'city_district', 'quarter']),
    city: pick(address, ['city', 'town', 'village', 'municipality', 'state_district', 'county']),
    state: pick(address, ['state']),
    pinCode: pick(address, ['postcode']),
  };
}

// One line for the single address field the Store table has. The PIN joins the
// state with a space rather than a comma, the way an envelope is written.
function toAddressLine(parts) {
  const tail = [parts.state, parts.pinCode].filter(Boolean).join(' ');
  return [parts.street, parts.area, parts.city, tail].filter(Boolean).join(', ');
}

// Exported for the route; `display_name` is Nominatim's own full string, kept
// as a fallback for a point whose parts are all empty (open country, or a
// place mapped only as a name).
function describe(payload) {
  const parts = toParts(payload?.address);
  const line = toAddressLine(parts);
  return { parts, address: line || String(payload?.display_name || '').trim() };
}

async function reverseGeocode(lat, lng, fetchImpl = fetch) {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  return describe(await res.json());
}

// What a store's pin should become, given a request body. A pin without its
// pair is meaningless and a number out of range is a bug upstream, not a
// location — either both arrive valid or the store has no pin, never half of
// one. Returns {} for "the caller didn't mention coordinates", which must
// leave an existing pin alone on a PATCH.
function readCoords(body) {
  const { lat, lng, accuracyM } = body || {};
  const cleared = lat === null || lng === null || lat === '' || lng === '';
  if (cleared) return { ok: true, data: { lat: null, lng: null, accuracyM: null } };
  if (lat === undefined && lng === undefined) return { ok: true, data: {} };
  const [latNum, lngNum] = [Number(lat), Number(lng)];
  if (!isLatLng(latNum, lngNum)) return { ok: false, error: 'lat and lng must be a valid coordinate pair' };
  // A hand-typed pin has no sensor estimate, so absent is a real value here,
  // not an omission. A nonsense radius is dropped rather than failing the save
  // — the coordinates are the part worth keeping.
  const acc = Number(accuracyM);
  return { ok: true, data: { lat: latNum, lng: lngNum, accuracyM: Number.isFinite(acc) && acc > 0 ? acc : null } };
}

module.exports = { isLatLng, describe, reverseGeocode, toParts, toAddressLine, readCoords };
