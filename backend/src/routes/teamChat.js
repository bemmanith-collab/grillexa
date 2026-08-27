const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const prisma = require('../db');
const push = require('../lib/push');
const {
  isModerator, canPost, validateMessage, unreadFilter, present, pushPreview,
} = require('../lib/teamChat');

const router = express.Router();

router.use(authenticate);

// Every role can talk here, so there is no requireRole gate on the router —
// membership is the gate instead, and it is loaded per request because an Admin
// removing somebody has to take effect now rather than at their next login.
async function loadMember(req, res, next) {
  req.member = await prisma.teamChatMember.findUnique({ where: { userId: req.user.id } });
  req.moderator = isModerator(req.user);
  next();
}
router.use(loadMember);

function requireMembership(req, res, next) {
  if (!canPost(req.member)) {
    return res.status(403).json({
      error: 'You are not in the team chat.',
      hint: 'An admin can add you from the members list.',
    });
  }
  next();
}

// Generous, but it stops a stuck retry loop or a leaning phone from filling the
// room. Nobody typing by hand gets near this.
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Slow down a moment.' },
});

const senderSelect = { select: { id: true, name: true, role: true } };

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

// The whole room in one call: messages, who is in it, and whether this account
// may moderate. The client polls this, so it answers everything the screen
// needs rather than making the phone fire three requests every few seconds.
//
// `after` makes the poll cheap — the client sends the newest id it holds and
// gets only what arrived since. Without it the first load returns the last
// page of history.
router.get('/', requireMembership, async (req, res) => {
  const after = Number(req.query.after);
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const incremental = Number.isInteger(after) && after > 0;

  const messages = await prisma.teamChatMessage.findMany({
    where: incremental ? { id: { gt: after } } : undefined,
    orderBy: { id: incremental ? 'asc' : 'desc' },
    take: limit,
    include: { sender: senderSelect, deletedBy: { select: { name: true } } },
  });

  // The newest-first page is reversed so the client always receives the thread
  // in reading order and never has to know which query it got.
  const ordered = incremental ? messages : messages.reverse();

  const pinned = await prisma.teamChatMessage.findMany({
    where: { isPinned: true, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { sender: senderSelect, deletedBy: { select: { name: true } } },
  });

  res.json({
    messages: ordered.map((m) => present(m, { viewerId: req.user.id, moderator: req.moderator })),
    pinned: pinned.map((m) => present(m, { viewerId: req.user.id, moderator: req.moderator })),
    moderator: req.moderator,
    me: { id: req.user.id, name: req.user.name },
  });
});

// Just the number, for the sidebar badge. Deliberately its own route: it is
// polled from every page in the app, and it must not drag the message bodies
// and the member list along with it.
router.get('/unread', async (req, res) => {
  if (!canPost(req.member)) return res.json({ unread: 0, member: false });

  const unread = await prisma.teamChatMessage.count({
    where: unreadFilter(req.member, req.user.id),
  });
  res.json({ unread, member: true });
});

// Opening the room marks it read. Sent by the client rather than inferred from
// the GET, because the GET also runs while the tab sits in the background and
// marking those as read would clear the badge for messages nobody looked at.
router.post('/read', requireMembership, async (req, res) => {
  await prisma.teamChatMember.update({
    where: { userId: req.user.id },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true, unread: 0 });
});

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

router.post('/', sendLimiter, requireMembership, async (req, res) => {
  const check = validateMessage(req.body?.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const message = await prisma.teamChatMessage.create({
    data: { senderId: req.user.id, body: check.text },
    include: { sender: senderSelect },
  });

  // Sending also counts as reading — otherwise your own message leaves the room
  // looking unread to you the moment you post it.
  await prisma.teamChatMember.update({
    where: { userId: req.user.id },
    data: { lastReadAt: new Date() },
  });

  // Notify the rest of the room. Wrapped: a push failure must never lose a
  // message that is already saved and that the sender is waiting on.
  try {
    if (push.isConfigured()) {
      const others = await prisma.teamChatMember.findMany({
        where: { isActive: true, userId: { not: req.user.id } },
        select: { userId: true },
      });
      if (others.length) {
        await push.sendToUsers(others.map((m) => m.userId), {
          ...pushPreview(req.user.name, check.text),
          url: '/team-chat',
          tag: 'team-chat',
        });
      }
    }
  } catch (err) {
    console.error('team chat: push failed', err);
  }

  res.status(201).json({
    message: present(message, { viewerId: req.user.id, moderator: req.moderator }),
  });
});

// ---------------------------------------------------------------------------
// Moderation — Admin, and on TEAM_CHAT_ADMINS when that is set
// ---------------------------------------------------------------------------

function requireModerator(req, res, next) {
  if (!req.moderator) {
    return res.status(403).json({ error: 'Only an admin can do that.' });
  }
  next();
}

// Soft delete. The row keeps the body; nothing outside lib/teamChat.js ever
// returns it again.
router.delete('/:id', requireModerator, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad message id.' });

  const existing = await prisma.teamChatMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'No such message.' });
  if (existing.isSystem) {
    return res.status(400).json({ error: 'The announcement cannot be deleted.' });
  }

  await prisma.teamChatMessage.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: req.user.id, isPinned: false },
  });
  res.json({ ok: true, id });
});

router.post('/:id/pin', requireModerator, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad message id.' });
  const pinned = req.body?.isPinned !== false;

  const existing = await prisma.teamChatMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'No such message.' });
  if (existing.deletedAt) return res.status(400).json({ error: 'That message was deleted.' });
  if (existing.isSystem) return res.status(400).json({ error: 'The announcement stays pinned.' });

  const message = await prisma.teamChatMessage.update({
    where: { id },
    data: { isPinned: pinned },
    include: { sender: senderSelect },
  });
  res.json({ message: present(message, { viewerId: req.user.id, moderator: true }) });
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

// Everyone can see who is in the room. Which of them can be added or removed is
// the moderator's business, so the list of people not yet in it is only sent to
// somebody who could act on it.
router.get('/members', requireMembership, async (req, res) => {
  const members = await prisma.teamChatMember.findMany({
    where: { isActive: true },
    include: { user: senderSelect, addedBy: { select: { name: true } } },
    orderBy: { joinedAt: 'asc' },
  });

  const payload = {
    moderator: req.moderator,
    members: members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      role: m.user.role,
      joinedAt: m.joinedAt,
      addedBy: m.addedBy?.name ?? null,
      isMe: m.userId === req.user.id,
    })),
  };

  if (req.moderator) {
    const inRoom = new Set(members.map((m) => m.userId));
    const all = await prisma.user.findMany({ ...senderSelect, orderBy: { name: 'asc' } });
    payload.canAdd = all.filter((u) => !inRoom.has(u.id));
  }

  res.json(payload);
});

// Add, or re-add somebody who was removed. Upsert on the unique userId is what
// makes the second case work without leaving two rows for one person.
router.post('/members', requireModerator, async (req, res) => {
  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Bad user id.' });

  const user = await prisma.user.findUnique({ where: { id: userId }, ...senderSelect });
  if (!user) return res.status(404).json({ error: 'No such user.' });

  await prisma.teamChatMember.upsert({
    where: { userId },
    create: { userId, addedById: req.user.id, isActive: true },
    // Re-added, so joinedAt moves and lastReadAt resets: somebody coming back
    // should not have to scroll past the badge for everything said while they
    // were out.
    update: { isActive: true, addedById: req.user.id, leftAt: null, joinedAt: new Date(), lastReadAt: new Date() },
  });

  res.status(201).json({ ok: true, userId, name: user.name });
});

// Removal is a flag, not a delete: their messages stay in the thread, which is
// what keeps the conversation readable after somebody leaves.
router.delete('/members/:userId', requireModerator, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ error: 'Bad user id.' });

  // A moderator who removes themselves loses the button that would let them
  // undo it, and the room can be left with nobody able to manage it.
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot remove yourself from the chat.' });
  }

  try {
    await prisma.teamChatMember.update({
      where: { userId },
      data: { isActive: false, leftAt: new Date() },
    });
    res.json({ ok: true, userId });
  } catch {
    res.status(404).json({ error: 'That person is not in the chat.' });
  }
});

module.exports = router;
