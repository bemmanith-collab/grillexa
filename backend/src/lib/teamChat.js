// The rules behind the team chat room.
//
// Pure on purpose — no Prisma, no Express, no clock of its own. Everything here
// answers a question about permission or shape, which is exactly the part that
// must not be wrong and exactly the part a route handler makes hard to test.
// test/team-chat.js runs it under plain Node.

const MAX_LENGTH = 4000;

/**
 * Who may moderate: add people, remove people, delete and pin.
 *
 * Two gates, the same pattern the WhatsApp channel uses. The role is the first;
 * TEAM_CHAT_ADMINS is the second, a comma-separated allowlist of email
 * addresses. Five accounts carry the ADMIN role and the two people who actually
 * run the room are a subset of them — being able to reset a password should not
 * also mean being able to remove somebody from the group.
 *
 * Unset means "every Admin", not "nobody". This is the opposite of the channel
 * route, and deliberately: there, failing closed protects customers from a post
 * nobody approved. Here, failing closed would leave a room full of people with
 * no one able to remove a mistake — and the downside of one extra Admin having
 * the button is small.
 */
function isModerator(user, env = process.env) {
  if (!user || user.role !== 'ADMIN') return false;

  const allow = (env.TEAM_CHAT_ADMINS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allow.length === 0) return true;
  return allow.includes(String(user.email).toLowerCase());
}

/**
 * Whether this account may read and post at all.
 *
 * Membership, not role: every role in the app can talk here, but a person an
 * Admin has removed cannot — and removal has to bite immediately rather than at
 * the next login, which is why it is checked per request rather than baked into
 * the session.
 */
function canPost(member) {
  return Boolean(member && member.isActive);
}

/**
 * Validates an outgoing message. Returns { ok } or { ok:false, error }.
 */
function validateMessage(body) {
  if (typeof body !== 'string') return { ok: false, error: 'A message is required.' };

  // Trailing newlines from a textarea are not content. Trimming first means a
  // message of only whitespace is caught as empty rather than stored as blank.
  const text = body.trim();
  if (!text) return { ok: false, error: 'Type something first.' };
  if (text.length > MAX_LENGTH) {
    return { ok: false, error: `Messages are limited to ${MAX_LENGTH} characters.` };
  }
  return { ok: true, text };
}

/**
 * How many messages this member has not seen.
 *
 * Counting is done in SQL; this is the rule for which messages count. Own
 * messages never do — a badge that lights up because you typed something is
 * noise, and it is the single most common way this feature gets annoying.
 * Deleted messages do not count either: a badge that leads to
 * "This message was deleted" spent somebody's attention on nothing.
 */
function unreadFilter(member, viewerId) {
  return {
    deletedAt: null,
    // Not simply { senderId: { not: viewerId } }. That compiles to
    // "senderId <> $1", and in SQL a NULL compared to anything is unknown
    // rather than true — so every authorless system message was silently
    // dropped from the count and the announcement lit no badge at all.
    OR: [
      { senderId: null },
      { senderId: { not: viewerId } },
    ],
    ...(member?.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
  };
}

/**
 * The shape a message takes on the way out.
 *
 * A deleted message keeps its place in the thread and loses its text. Doing the
 * blanking here rather than in the query is what guarantees the body cannot
 * escape through a route that forgot — the row still holds it, and nothing
 * outside this function ever sees it.
 */
function present(message, { viewerId, moderator }) {
  const base = {
    id: message.id,
    senderId: message.senderId ?? null,
    // A system message has no author, so it is never "Someone" and never mine.
    senderName: message.isSystem ? 'Grillexa' : (message.sender?.name ?? 'Someone'),
    senderRole: message.isSystem ? null : (message.sender?.role ?? null),
    isSystem: Boolean(message.isSystem),
    mine: !message.isSystem && message.senderId === viewerId,
    isPinned: message.isPinned,
    createdAt: message.createdAt,
    deleted: Boolean(message.deletedAt),
  };

  if (message.deletedAt) {
    return {
      ...base,
      body: null,
      isPinned: false,
      deletedBy: message.deletedBy?.name ?? null,
    };
  }

  return {
    ...base,
    body: message.body,
    // Only shown to somebody who could act on it, so the UI never has to decide.
    // The announcement is not deletable by anyone — it is the explanation of
    // what this room is, and a new person joining next month should still find
    // it rather than an empty screen.
    canDelete: moderator && !message.isSystem,
    canPin: moderator && !message.isSystem,
  };
}

/** A short preview for the push notification. */
function pushPreview(name, text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return {
    title: `${name} · Grillexa team`,
    body: clean.length > 120 ? `${clean.slice(0, 119)}…` : clean,
  };
}

module.exports = { isModerator, canPost, validateMessage, unreadFilter, present, pushPreview, MAX_LENGTH };
