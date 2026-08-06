// The Grilling Wisdom Planner's rules. Pure — no Prisma, no network — so both
// the parts worth being sure about can be checked without either: which
// message a given day gets, and which of a quote API's offerings are actually
// about food and health. See test/wisdom.js.

const AUDIENCES = ['STAFF', 'CUSTOMER'];

// A cheap deterministic hash of a YYYY-MM-DD string. Not cryptography: it only
// has to spread consecutive days across the pool and give the same answer
// every time it is asked.
function dayHash(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i += 1) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) % 2147483647;
  }
  return hash;
}

/**
 * The message for one day and one audience.
 *
 * Deterministic, which is the point: the old widget asked for a *random*
 * quote on every request, so it changed on every page load — and now that the
 * dashboard refreshes itself every five minutes, it would have changed under
 * the reader's eyes several times an hour. A daily quote that is not the same
 * all day is not a daily quote, and two salespeople comparing notes should be
 * looking at the same line.
 *
 * A message pinned to this date wins over the rotating pool: pinning is how
 * someone says "on Monday, say this".
 */
function pickForDay(messages, dateStr, audience) {
  const eligible = messages.filter((m) => m.active && m.audience === audience);
  const pinned = eligible.filter((m) => m.showOn === dateStr);
  if (pinned.length) {
    // More than one pinned to the same day is a planning mistake, not a
    // crash: take the oldest so the answer is at least stable.
    return pinned.sort((a, b) => a.id - b.id)[0];
  }
  const pool = eligible.filter((m) => !m.showOn);
  if (!pool.length) return null;
  // Sorted by id first: the pool's order must not depend on what the database
  // happened to return, or the same day could show a different line after an
  // unrelated edit.
  const ordered = [...pool].sort((a, b) => a.id - b.id);
  return ordered[dayHash(dateStr) % ordered.length];
}

// Words that make a quote about food, health or the body. A general quote API
// has no category for any of this (checked: the big ones offer wisdom, life,
// success, leadership and so on), so relevance has to be filtered for on the
// way in — otherwise "Be the change you wish to see" ends up on a bill for
// sprouts.
//
// Deliberately a word list rather than anything cleverer: it is inspectable,
// it is fixed, and an admin approves every survivor by hand anyway. The filter
// only has to make that approval queue worth reading.
const HEALTH_WORDS = [
  'food',
  'eat',
  'eating',
  'ate',
  'diet',
  'nutrition',
  'nourish',
  'health',
  'healthy',
  'healthier',
  'fruit',
  'vegetable',
  'veggies',
  'greens',
  'salad',
  'meal',
  'breakfast',
  'lunch',
  'dinner',
  'hunger',
  'hungry',
  'appetite',
  'body',
  'strength',
  'energy',
  'fresh',
  'medicine',
  'wellness',
  'fitness',
  'cook',
  'kitchen',
  'harvest',
  'garden',
];

// Bills and dashboards are read at a glance, and the footer of an invoice is
// one line — anything longer is cut off or crowds the total.
const MAX_LENGTH = 160;

function isRelevant(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  // Word boundaries, so "health" does not match "unhealthy obsession" via a
  // substring and, more to the point, "ate" does not match "create".
  return HEALTH_WORDS.some((word) => new RegExp(`\\b${word}\\b`).test(lower));
}

/**
 * Turn whatever a quote API returned into suggestions worth showing an admin:
 * on topic, short enough to print, and not something already in the planner.
 */
function toSuggestions(rows, existingTexts = [], limit = 10) {
  const seen = new Set(existingTexts.map((t) => t.trim().toLowerCase()));
  const out = [];
  for (const row of rows) {
    const text = String(row.q ?? row.quote ?? row.text ?? '').trim();
    const author = String(row.a ?? row.author ?? '').trim() || 'Unknown';
    const key = text.toLowerCase();
    if (!isRelevant(text) || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, author });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = { AUDIENCES, pickForDay, isRelevant, toSuggestions, dayHash, MAX_LENGTH };
