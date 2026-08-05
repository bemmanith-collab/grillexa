// Picking one thing out of a long list on a phone — a store out of fifty, a
// product out of the catalogue. The logic lives here rather than in the
// component so it can be tested without a browser.

const RECENT_MAX = 5;

// Splits a name into alternating plain/matched runs, so the component can
// highlight every occurrence of what was typed without doing regex escaping
// on user-entered names.
export function matchParts(name, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text: name, hit: false }];
  const lower = name.toLowerCase();
  const parts = [];
  let i = 0;
  for (let at = lower.indexOf(q); at !== -1; at = lower.indexOf(q, i)) {
    if (at > i) parts.push({ text: name.slice(i, at), hit: false });
    parts.push({ text: name.slice(at, at + q.length), hit: true });
    i = at + q.length;
  }
  if (i < name.length) parts.push({ text: name.slice(i), hit: false });
  return parts;
}

// Case-insensitive substring match, with the options this device picked most
// recently floated to the top. Sort is stable, so within a tier the order the
// caller gave survives — which matters for products, whose order is the
// deliberate one set in the catalogue, not alphabetical.
// ponytail: recency, not frequency — the store you're delivering to today is
// nearly always one you touched this week. Switch to a count map if that stops
// holding.
export function rankOptions(options, query, recentIds = []) {
  const q = query.trim().toLowerCase();
  const hits = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options.slice();
  const tier = (o) => {
    const i = recentIds.findIndex((r) => String(r) === String(o.id));
    return i === -1 ? recentIds.length : i;
  };
  return hits.sort((a, b) => tier(a) - tier(b));
}

// localStorage is per-device, which is what we want: the phone in a delivery
// van has its own route. Wrapped because it throws in private mode. The key
// belongs to the caller, so two pickers can't mistake one another's ids for
// their own — store 3 and product 3 are different things.
export function readRecent(key) {
  if (!key) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecent(key, id) {
  const next = [id, ...readRecent(key).filter((r) => String(r) !== String(id))].slice(0, RECENT_MAX);
  try {
    if (key) localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Nothing to do — recents are a convenience, not data.
  }
  return next;
}
