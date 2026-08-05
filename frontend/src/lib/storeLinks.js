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
// fix outdoors lands under ~50m, a wifi-derived one in the hundreds, and an
// IP-derived one — which is what a phone indoors with weak GPS often returns —
// can be kilometres out while looking exactly like the good one on screen.
// That is how a wrong pin gets saved and then trusted by Directions forever.
export const ACCURACY_GOOD_M = 50;
export const ACCURACY_POOR_M = 500;

export function accuracyTier(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return 'unknown';
  if (metres <= ACCURACY_GOOD_M) return 'good';
  if (metres <= ACCURACY_POOR_M) return 'rough';
  return 'poor';
}

export function formatAccuracy(metres) {
  if (!Number.isFinite(metres) || metres <= 0) return '';
  return metres >= 1000 ? `±${(metres / 1000).toFixed(1)}km` : `±${Math.round(metres)}m`;
}

// Accepts what a person actually has to hand: one field pasted straight from
// Google Maps ("13.0878, 80.2103", which is how everyone copies a location),
// or a single number typed into the lat or lng box on its own. Returns
// {lat, lng} when a pair was recognised, {lat} for a lone number, or null.
export function parseCoordInput(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;
  // Strip the decorations Maps and messaging apps add around a pair.
  const cleaned = s.replace(/[()\[\]]/g, ' ').replace(/[;|]/g, ',');
  const nums = cleaned.match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  const [a, b] = nums.map(Number);
  if (nums.length >= 2 && Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
  return Number.isFinite(a) ? { lat: a } : null;
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
