// What the channel should post next.
//
// Nine content types and a daily habit means the easy ones get reached for and
// the rest quietly stop appearing — three Myth vs Fact posts in a fortnight and
// no Customer Story since last month. Nobody notices that from inside; it only
// shows up as the channel getting samey.
//
// So the suggestions are worked out from what was actually written, and they are
// ordered by what is most overdue rather than by what is easiest to write.

const WEEK = 7;

// "a Evening Wind-Down" reads like a machine wrote it, which it did.
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

// Product and customer sit outside the weekly rota on purpose (a channel that
// sells every week stops being read), so they are chased on a longer leash.
const CADENCE_DAYS = {
  product: 14,
  customer: 14,
};
const DEFAULT_CADENCE = WEEK;

/**
 * @param posts    recent WhatsAppPost rows, newest first
 * @param types    the generator's TYPES registry
 * @param dueToday { day, type } from the rota
 */
function buildSuggestions({ posts, types, dueToday, today }) {
  const suggestions = [];
  const lastByType = new Map();
  for (const post of posts) {
    if (!lastByType.has(post.type)) lastByType.set(post.type, post);
  }

  const daysSince = (post) => {
    if (!post) return null;
    const then = Date.parse(`${post.postDate}T00:00:00.000Z`);
    const now = Date.parse(`${today}T00:00:00.000Z`);
    return Math.max(0, Math.round((now - then) / 86400000));
  };

  // 1. Today's rota post, unless it is already written. This is the one that
  //    matters most, so it goes first and says so plainly.
  if (dueToday?.type) {
    const alreadyToday = posts.some(
      (post) => post.postDate === today && post.type === dueToday.type
    );
    if (!alreadyToday) {
      suggestions.push({
        type: dueToday.type,
        slot: dueToday.slot ?? null,
        priority: 'today',
        reason: (() => {
          const label = types[dueToday.type]?.label ?? dueToday.type;
          return `${dueToday.day} is usually ${article(label)} ${label} post, and today's is not written yet.`;
        })(),
      });
    }
  }

  // 2. Types that have gone quiet, most overdue first.
  const stale = [];
  for (const [type, spec] of Object.entries(types)) {
    if (type === dueToday?.type) continue;
    const last = lastByType.get(type);
    const age = daysSince(last);
    const cadence = CADENCE_DAYS[type] ?? DEFAULT_CADENCE;

    if (age === null) {
      stale.push({
        type,
        age: Infinity,
        reason: `No ${spec.label} post has ever gone out.`,
      });
    } else if (age >= cadence) {
      stale.push({
        type,
        age,
        reason: `The last ${spec.label} post was ${age} ${age === 1 ? 'day' : 'days'} ago.`,
      });
    }
  }

  stale.sort((a, b) => b.age - a.age);
  for (const entry of stale) {
    suggestions.push({ type: entry.type, slot: null, priority: 'stale', reason: entry.reason });
  }

  return suggestions;
}

/**
 * A plain-language read on how the channel is doing, for the top of the panel.
 * Counts what was published rather than what was generated — a draft nobody sent
 * is not something the readers saw.
 */
function summarise(posts, today) {
  const weekAgo = new Date(Date.parse(`${today}T00:00:00.000Z`) - WEEK * 86400000)
    .toISOString()
    .slice(0, 10);
  const thisWeek = posts.filter((post) => post.postDate > weekAgo);

  return {
    generatedThisWeek: thisWeek.length,
    usedThisWeek: thisWeek.filter((post) => post.used).length,
    lastPostedOn: posts.find((post) => post.used)?.postDate ?? null,
  };
}

module.exports = { buildSuggestions, summarise, CADENCE_DAYS };
