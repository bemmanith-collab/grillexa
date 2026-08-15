// Getting to a store, and ringing it.

// A GPS pin beats a name every time: "Anna Nagar" as a text search drops you
// at the middle of a neighbourhood, while the pin is the shutter someone stood
// at. Stores added before pins existed still get a usable link, so the button
// is never dead — it just searches instead of navigating.
export function directionsUrl(store) {
  const base = 'https://www.google.com/maps/dir/?api=1&destination=';
  if (Number.isFinite(store?.lat) && Number.isFinite(store?.lng)) {
    return `${base}${store.lat},${store.lng}`;
  }
  const query = [store?.name, store?.address].filter(Boolean).join(' ');
  return query ? base + encodeURIComponent(query) : '';
}

export function hasPin(store) {
  return Number.isFinite(store?.lat) && Number.isFinite(store?.lng);
}

// Opens Google Maps so the exact spot can be found by eye and its coordinates
// copied back. This is the reliable path where GPS isn't: long-press the shop
// on the map, copy the pair, paste it into the latitude box.
//
// Centred on the rough pin when there is one — that's the neighbourhood to
// look around in — and otherwise searching whatever address was typed. Zoom 19
// is close enough to tell one shutter from the next.
export function mapsPickUrl(store) {
  if (hasPin(store)) return `https://www.google.com/maps/@${store.lat},${store.lng},19z`;
  const query = [store?.name, store?.address].filter(Boolean).join(' ');
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

// Dialers ignore spaces and brackets but choke on letters, and a leading + has
// to survive — it's what makes a number dialable from outside the country.
export function telHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 6) return '';
  return `tel:${cleaned.startsWith('+') ? '+' : ''}${digits}`;
}

// Six decimal places is about 10cm — past that it's noise from the GPS chip,
// and the extra digits only make the pin harder to read back.
export function formatPin(store) {
  return hasPin(store) ? `${store.lat.toFixed(6)}, ${store.lng.toFixed(6)}` : '';
}

// How much to trust a fix. The browser reports `accuracy` as a radius in
// metres, and the three tiers are really three different sensors: a true GNSS
// fix lands in the tens of metres, a wifi-derived one in the hundreds, and an
// IP-derived one — which is what a phone indoors with weak GPS often returns —
// can be kilometres out while looking exactly like the good one on screen.
// That is how a wrong pin gets saved and then trusted by Directions forever.
//
// 65m, not the textbook 50: on a dense Chennai street the sky is a strip
// between two buildings, and a genuine GNSS fix there settles in the 50-65m
// band. Holding out for 50 mostly buys a longer spinner and the same pin.
// Tune this against real captures, not against what the spec says GPS can do.
export const ACCURACY_GOOD_M = 65;

// Open sky, hardware GPS, nothing left to wait for — stop the watch on sight.
export const ACCURACY_PERFECT_M = 15;

// The line between "check this" and "don't trust this". 200m still reverse
// geocodes to the right road most of the time; past it the answer is a street
// someone never stood on. This was 500m, which was too generous — a 400m fix
// was filling in addresses confidently enough that nobody thought to look.
export const ACCURACY_FAIR_M = 200;

export function accuracyTier(metres) {
  // Null is not zero metres — it's a pin typed by hand, or one saved before
  // accuracy was recorded. Calling that 'perfect' would be the worst possible
  // guess, since nothing measured it at all.
  if (!Number.isFinite(metres) || metres <= 0) return 'unknown';
  if (metres <= ACCURACY_PERFECT_M) return 'perfect';
  if (metres <= ACCURACY_GOOD_M) return 'good';
  if (metres <= ACCURACY_FAIR_M) return 'fair';
  return 'poor';
}

// The badge people actually read. A bare "±2.0km" means nothing to someone who
// has never thought about GPS accuracy — the word is what carries it, and on
// the two bad tiers it also says what to do about it.
export function accuracyLabel(metres) {
  const tier = accuracyTier(metres);
  if (tier === 'unknown') return '';
  const size = formatAccuracy(metres);
  if (tier === 'perfect') return `GPS accuracy: ${size} (perfect)`;
  if (tier === 'good') return `GPS accuracy: ${size} (good)`;
  if (tier === 'fair') return `GPS accuracy: ${size} (fair — check the address)`;
  return `GPS accuracy: ${size} (poor — step outside)`;
}

// Short form for a table row, where the sentence doesn't fit.
export function accuracyBadge(metres) {
  const tier = accuracyTier(metres);
  return tier === 'unknown' ? '' : `${formatAccuracy(metres)} ${tier}`;
}

export function formatAccuracy(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return '';
  return metres >= 1000 ? `±${(metres / 1000).toFixed(1)}km` : `±${Math.round(metres)}m`;
}

// Accepts what a person actually has to hand: one field pasted straight from
// Google Maps ("13.0878, 80.2103", which is how everyone copies a location),
// or a single number typed into the lat or lng box on its own. Returns
// {lat, lng} when a pair was recognised, {lat} for a lone number, or null.
//
// Both patterns are anchored to the WHOLE string, and that anchoring is the
// entire point. This used to pull every number out of the text and take the
// first two, which meant an Indian door number was a coordinate pair:
// "8-2-120/1, Banjara Hills" read as (8, -2) — the Gulf of Guinea — and the
// picker's search box dropped a pin there instead of searching, with no lookup
// and nothing on screen to say it had guessed. "Shop 17, Road 78" is the same
// bug wearing a disguise: (17, 78) is in Maharashtra, so it looks like an
// ordinary Indian pin and nobody catches it until a driver does.
//
// A pair is two numbers and nothing else. Anything with a word in it, a third
// number, or a hyphen where the separator should be is an address, and falling
// through to the geocoder is the safe direction to be wrong in — a search that
// finds nothing is visible, a pin in the Atlantic is not.
// The lone-number form allows a TRAILING DOT — "17." is what the box contains
// for one keystroke while someone types "17.4400", and refusing it there means
// the form's value drops to null mid-word and the "enter both latitude and
// longitude" warning strobes on every decimal point typed.
const COORD_PAIR = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/;
const COORD_ONE = /^-?\d+(?:\.\d*)?$/;

export function parseCoordInput(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  // Strip the decorations Maps and messaging apps put around a pair, and
  // collapse the whitespace so " 13.0878 ,  80.2103 " is still one pair.
  const cleaned = s
    .replace(/[()\[\]]/g, ' ')
    .replace(/[;|]/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
  const pair = cleaned.match(COORD_PAIR);
  if (pair) return { lat: Number(pair[1]), lng: Number(pair[2]) };
  return COORD_ONE.test(cleaned) ? { lat: Number(cleaned) } : null;
}

// Range check, so a transposed pair (Chennai typed as 80.2, 13.0 lands in
// Somalia) is caught at the keyboard rather than by a driver.
export function coordError(lat, lng) {
  const bothBlank = lat == null && lng == null;
  if (bothBlank) return '';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Enter both latitude and longitude.';
  if (lat < -90 || lat > 90) return 'Latitude must be between -90 and 90.';
  if (lng < -180 || lng > 180) return 'Longitude must be between -180 and 180.';
  return '';
}
