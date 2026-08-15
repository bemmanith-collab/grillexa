// Turning a GPS fix into something a person recognises.
//
// This runs on the server rather than in the page for two reasons: Nominatim's
// usage policy asks for a User-Agent identifying the application, which a
// browser refuses to let script set, and the app's CSP keeps connect-src to
// 'self' so the page can't call a third-party host anyway.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
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

// The other direction: a typed place name to a handful of candidate points, so
// the map can jump somewhere near the shop before anyone drags a pin.
//
// Biased to India (`countrycodes=in`) because every store is here, and without
// it "Adyar" also matches places in three other countries — a list where the
// right answer is fourth is a list nobody reads to the end of. Capped at five
// for the same reason.
//
// Returns [] rather than throwing for a query that matched nothing: an empty
// result is an ordinary answer to "find this", not a failure.
// An Indian PIN code is exactly six digits. Nominatim will find one through the
// free-text `q`, but its structured `postalcode` parameter is what the postcode
// index is actually built for — free text can match a house number or a road
// that happens to contain the digits. The two cannot be combined: a request
// carrying both `q` and a structured field is rejected, so it is one or the
// other, chosen here.
const PIN_CODE = /^\d{6}$/;

// Half a degree is roughly 55km — a metro and its outskirts. Wide enough that
// a shop on the far edge of the city still ranks, narrow enough that the box
// means something.
const NEAR_BOX_DEG = 0.5;

// `near` is the last known store pin, and it only *prefers* results in that
// box (`bounded=0`) rather than restricting to it — a genuinely distant place
// must still be findable, or expanding to a new city becomes impossible
// through the very screen used to add the first store there.
function viewboxFor(near) {
  if (!Array.isArray(near)) return '';
  const [lat, lng] = near.map(Number);
  if (!isLatLng(lat, lng)) return '';
  const [w, s, e, n] = [lng - NEAR_BOX_DEG, lat - NEAR_BOX_DEG, lng + NEAR_BOX_DEG, lat + NEAR_BOX_DEG];
  return `&viewbox=${w},${s},${e},${n}&bounded=0`;
}

async function searchPlaces(query, near = null, fetchImpl = fetch) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const lookup = PIN_CODE.test(q) ? `postalcode=${q}` : `q=${encodeURIComponent(q)}`;
  const url = `${NOMINATIM_SEARCH_URL}?${lookup}&format=json&addressdetails=1&limit=5&countrycodes=in${viewboxFor(near)}`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      lat: Number(row.lat),
      lng: Number(row.lon),
      label: String(row.display_name || '').trim(),
      address: describe(row).address,
    }))
    // A row without a usable pair is no use to a map, and Nominatim has been
    // known to return one for oddly mapped features.
    .filter((row) => isLatLng(row.lat, row.lng) && row.label);
}

// Resolving a Google Maps share link — the thing everyone actually has to
// hand, because the way you send someone a shop is to share it from Maps.
//
// Only these hosts are followed. The server fetching a URL a user supplied is
// a request-forgery hole otherwise: an internal address, a cloud metadata
// endpoint, anything reachable from inside the network. An allowlist is the
// whole defence, so it is a literal list and not a pattern.
const MAP_LINK_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
]);

// Read from the final URL only, never the page body. Google's HTML contains
// unrelated coordinate-shaped numbers — a naive body scrape on a Hyderabad
// shop returns a point in New Jersey, with nothing to say it is wrong. A
// silently misplaced pin is worse than no pin: it survives into Directions
// and sends a driver to another state.
//
// Four shapes, in the order they are trustworthy: the @ in a map URL, the
// !3d!4d pair in a place URL, and the explicit q=/ll= parameters.
function coordsFromMapUrl(urlText) {
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|daddr|center)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = String(urlText).match(re);
    if (!m) continue;
    const [lat, lng] = [Number(m[1]), Number(m[2])];
    if (isLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

function isMapLink(text) {
  try {
    const url = new URL(String(text).trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && MAP_LINK_HOSTS.has(url.hostname);
  } catch (err) {
    return false;
  }
}

// Returns {lat, lng} when the link carries a position, or null when it only
// carries a Google place id — a short link often resolves to `ftid=…` with no
// coordinates anywhere, and turning that into a point needs the paid Places
// API. Null means "say so", not "guess".
async function resolveMapLink(link, fetchImpl = fetch) {
  if (!isMapLink(link)) return null;
  // A long link may already carry the pair, in which case there is nothing to
  // fetch and no request to make.
  const direct = coordsFromMapUrl(link);
  if (direct) return direct;
  const res = await fetchImpl(String(link).trim(), {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google responded ${res.status}`);
  // res.url is where the redirects landed. Only that.
  return coordsFromMapUrl(res.url);
}

// Mapbox first, Nominatim when Mapbox fails or was never configured.
//
// `hasMapbox` only says a token is CONFIGURED. It never says Mapbox will accept
// it, and the two came apart badly: a token carrying a URL restriction is
// refused 403 on every call this server makes, because a server sends no
// Referer. An exhausted quota is a 429, an expired token a 401. Every one of
// those took geocoding down completely — place search returned 502 and the
// address after a GPS capture failed — because the Nominatim path was reachable
// only when no token was set at all. That is a default, not a fallback.
//
// Takes the calls as functions rather than importing lib/mapbox: this file is
// the Nominatim half, and having it reach for the other provider would make the
// pair circular. It also keeps this testable without a token.
//
// Reports which provider answered, so the caller charges Mapbox's quota only
// when Mapbox actually spent it, and the page can say what is really answering
// rather than what is merely installed.
async function answerWith(hasMapbox, viaMapbox, viaNominatim, onError = () => {}) {
  if (hasMapbox) {
    try {
      return { value: await viaMapbox(), provider: 'mapbox' };
    } catch (err) {
      // Handed out rather than swallowed. lib/mapbox.js puts the HTTP status in
      // the message for exactly this, and it was going nowhere — a 403 from a
      // URL-restricted token read identically to Mapbox being down.
      onError(err);
    }
  }
  return { value: await viaNominatim(), provider: 'nominatim' };
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

module.exports = {
  isLatLng,
  describe,
  reverseGeocode,
  searchPlaces,
  isMapLink,
  coordsFromMapUrl,
  resolveMapLink,
  toParts,
  toAddressLine,
  readCoords,
  answerWith,
};
