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
