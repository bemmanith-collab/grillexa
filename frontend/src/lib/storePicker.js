// Picking one store out of fifty on a phone. The logic lives here rather than
// in the component so it can be tested without a browser.

const RECENT_KEY = 'grillexa.recentStores';
const RECENT_MAX = 5;

// Splits a name into alternating plain/matched runs, so the component can
// highlight every occurrence of what was typed without doing regex escaping
// on user-entered store names.
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

// Case-insensitive substring match, with the stores this device picked most
// recently floated to the top. Sort is stable, so within a tier the server's
// alphabetical order survives.
// ponytail: recency, not frequency — the store you're delivering to today is
// nearly always one you touched this week. Switch to a count map if that stops
// holding.
export function rankStores(stores, query, recentIds = []) {
  const q = query.trim().toLowerCase();
  const hits = q ? stores.filter((s) => s.name.toLowerCase().includes(q)) : stores.slice();
  const tier = (s) => {
    const i = recentIds.findIndex((r) => String(r) === String(s.id));
    return i === -1 ? recentIds.length : i;
  };
  return hits.sort((a, b) => tier(a) - tier(b));
}

// localStorage is per-device, which is what we want: the phone in a delivery
// van has its own route. Wrapped because it throws in private mode.
export function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushRecent(id) {
  const next = [id, ...readRecent().filter((r) => String(r) !== String(id))].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do — recents are a convenience, not data.
  }
  return next;
}
