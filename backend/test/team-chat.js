// The team chat is one room the whole staff can write in, and two of the five
// Admins moderate it. The part that must not be wrong is who may delete a
// message and remove a person — everything else is a list of texts.
//
// lib/teamChat.js is pure so those rules can be checked here without a database,
// a session or a running server.
//
// Run: npm test (from backend/).
const assert = require('assert');
const {
  isModerator, canPost, validateMessage, unreadFilter, present, pushPreview, MAX_LENGTH,
} = require('../src/lib/teamChat');

const ADMIN_A = { id: 1, role: 'ADMIN', email: 'emmanithbussa2000@gmail.com', name: 'Emmanith' };
const ADMIN_B = { id: 2, role: 'ADMIN', email: 'sairajesh140@gmail.com', name: 'Sai Rajesh' };
const ADMIN_C = { id: 3, role: 'ADMIN', email: 'rakeshmatike31@gmail.com', name: 'Rakesh' };
const MANAGER = { id: 4, role: 'MANAGER', email: 'm@grillexa.com', name: 'Manager' };
const SALES = { id: 5, role: 'SALES', email: 's@grillexa.com', name: 'Sales' };

const ALLOW = { TEAM_CHAT_ADMINS: 'emmanithbussa2000@gmail.com,sairajesh140@gmail.com' };

const tests = {
  'the two named admins moderate; the other three do not': () => {
    assert.strictEqual(isModerator(ADMIN_A, ALLOW), true);
    assert.strictEqual(isModerator(ADMIN_B, ALLOW), true);
    assert.strictEqual(
      isModerator(ADMIN_C, ALLOW), false,
      'an Admin not on the list must not be able to remove people'
    );
  },

  'the allowlist is not case or whitespace sensitive': () => {
    // Typed into a Fly secret by hand, so both are likely.
    const env = { TEAM_CHAT_ADMINS: ' EMMANITHBUSSA2000@GMAIL.COM , sairajesh140@gmail.com ' };
    assert.strictEqual(isModerator(ADMIN_A, env), true);
    assert.strictEqual(isModerator({ ...ADMIN_A, email: 'Emmanithbussa2000@Gmail.com' }, env), true);
  },

  'no allowlist means every admin, and still only admins': () => {
    // Opposite of the WhatsApp channel, on purpose: failing closed here would
    // leave a room nobody can manage.
    assert.strictEqual(isModerator(ADMIN_C, {}), true);
    assert.strictEqual(isModerator(MANAGER, {}), false);
    assert.strictEqual(isModerator(SALES, {}), false);
  },

  'a manager or salesperson is never a moderator, listed or not': () => {
    // The allowlist narrows the Admin role; it must never widen it.
    const env = { TEAM_CHAT_ADMINS: 'm@grillexa.com,s@grillexa.com' };
    assert.strictEqual(isModerator(MANAGER, env), false);
    assert.strictEqual(isModerator(SALES, env), false);
  },

  'nobody is a moderator without a session': () => {
    assert.strictEqual(isModerator(null, ALLOW), false);
    assert.strictEqual(isModerator(undefined, {}), false);
  },

  'posting needs an active membership, not a role': () => {
    assert.strictEqual(canPost({ isActive: true }), true);
    assert.strictEqual(canPost({ isActive: false }), false, 'a removed person must not post');
    assert.strictEqual(canPost(null), false, 'somebody never added must not post');
  },

  'empty and whitespace-only messages are refused': () => {
    assert.strictEqual(validateMessage('').ok, false);
    assert.strictEqual(validateMessage('   \n  ').ok, false, 'whitespace is not a message');
    assert.strictEqual(validateMessage(undefined).ok, false);
    assert.strictEqual(validateMessage(42).ok, false, 'a number is not a message');
  },

  'a message is trimmed and length-capped': () => {
    assert.strictEqual(validateMessage('  hello  ').text, 'hello');
    assert.strictEqual(validateMessage('x'.repeat(MAX_LENGTH)).ok, true);
    assert.strictEqual(validateMessage('x'.repeat(MAX_LENGTH + 1)).ok, false);
  },

  'the badge ignores your own messages and deleted ones': () => {
    const f = unreadFilter({ lastReadAt: new Date('2026-08-27T10:00:00Z') }, 5);
    assert.deepStrictEqual(f.OR[1], { senderId: { not: 5 } }, 'your own messages must not light the badge');
    assert.strictEqual(f.deletedAt, null, 'a badge leading to a deleted message wastes a look');
    assert.ok(f.createdAt.gt instanceof Date);
  },

  'somebody who has never opened the room sees everything as unread': () => {
    const f = unreadFilter({ lastReadAt: null }, 5);
    assert.ok(!('createdAt' in f), 'no cutoff means every message counts');
    assert.deepStrictEqual(f.OR[1], { senderId: { not: 5 } });
  },

  'the badge counts authorless system messages': () => {
    // "senderId <> N" is unknown for a NULL sender in SQL, so a plain not-equals
    // silently drops every system message from the count — the announcement lit
    // no badge at all until this was an OR.
    const f = unreadFilter({ lastReadAt: null }, 5);
    assert.ok(Array.isArray(f.OR), 'the sender check has to admit NULL explicitly');
    assert.deepStrictEqual(f.OR[0], { senderId: null });
    assert.deepStrictEqual(f.OR[1], { senderId: { not: 5 } });
  },

  'a deleted message keeps its place and loses its text': () => {
    const out = present({
      id: 9, senderId: 5, body: 'the original words', isPinned: true,
      deletedAt: new Date(), deletedBy: { name: 'Emmanith' },
      createdAt: new Date(), sender: { name: 'Sales', role: 'SALES' },
    }, { viewerId: 1, moderator: true });

    assert.strictEqual(out.deleted, true);
    assert.strictEqual(out.body, null, 'the body must never leave the server once deleted');
    assert.strictEqual(out.isPinned, false, 'a deleted message cannot stay pinned above the thread');
    assert.strictEqual(out.deletedBy, 'Emmanith');
    assert.strictEqual(out.id, 9, 'it keeps its id so the thread still reads in order');
  },

  'moderator-only buttons are absent for everyone else': () => {
    const raw = {
      id: 1, senderId: 5, body: 'hello', isPinned: false, deletedAt: null,
      createdAt: new Date(), sender: { name: 'Sales', role: 'SALES' },
    };
    assert.strictEqual(present(raw, { viewerId: 1, moderator: true }).canDelete, true);
    assert.strictEqual(present(raw, { viewerId: 4, moderator: false }).canDelete, false);
    assert.strictEqual(present(raw, { viewerId: 4, moderator: false }).canPin, false);
  },

  'a message knows whether it is yours': () => {
    const raw = {
      id: 1, senderId: 5, body: 'hello', isPinned: false, deletedAt: null,
      createdAt: new Date(), sender: { name: 'Sales', role: 'SALES' },
    };
    assert.strictEqual(present(raw, { viewerId: 5, moderator: false }).mine, true);
    assert.strictEqual(present(raw, { viewerId: 1, moderator: false }).mine, false);
  },

  'a sender with no name still renders': () => {
    // The include could be missed on a new query; the thread must not crash.
    const out = present({
      id: 1, senderId: 5, body: 'hi', isPinned: false, deletedAt: null, createdAt: new Date(),
    }, { viewerId: 1, moderator: false });
    assert.strictEqual(out.senderName, 'Someone');
  },


  'the announcement has no author and belongs to nobody': () => {
    // senderId is null on a system message. Attributing it to whichever Admin
    // had the lowest id would put words in a real person's mouth.
    const out = present({
      id: 1, senderId: null, body: '🎉 New Feature Alert!', isSystem: true,
      isPinned: true, deletedAt: null, createdAt: new Date(),
    }, { viewerId: 1, moderator: true });

    assert.strictEqual(out.isSystem, true);
    assert.strictEqual(out.senderId, null);
    assert.strictEqual(out.senderName, 'Grillexa');
    assert.strictEqual(out.senderRole, null, 'a system message has no role badge');
    assert.strictEqual(out.mine, false, "it is nobody's message");
  },

  'nobody can delete or unpin the announcement, moderator included': () => {
    const sys = {
      id: 1, senderId: null, body: 'announcement', isSystem: true,
      isPinned: true, deletedAt: null, createdAt: new Date(),
    };
    const asModerator = present(sys, { viewerId: 1, moderator: true });
    assert.strictEqual(asModerator.canDelete, false, 'the explanation of the room must survive');
    assert.strictEqual(asModerator.canPin, false);

    // And an ordinary message is still moderatable, so the flag is not blanket.
    const normal = { ...sys, isSystem: false, senderId: 5, sender: { name: 'Sales', role: 'SALES' } };
    assert.strictEqual(present(normal, { viewerId: 1, moderator: true }).canDelete, true);
  },

  'a null sender is never mistaken for the viewer': () => {
    // viewerId is compared against senderId; undefined === undefined would make
    // an authorless message look like your own.
    const out = present({
      id: 1, senderId: null, body: 'x', isSystem: true, isPinned: false,
      deletedAt: null, createdAt: new Date(),
    }, { viewerId: undefined, moderator: false });
    assert.strictEqual(out.mine, false);
  },

  'the push preview is one line and does not run on': () => {
    const long = pushPreview('Sai Rajesh', 'word '.repeat(200));
    assert.ok(long.body.length <= 120, `preview was ${long.body.length} characters`);
    assert.ok(long.body.endsWith('…'));
    assert.strictEqual(long.title, 'Sai Rajesh · Grillexa team');

    const wrapped = pushPreview('Emmanith', 'line one\n\n  line two');
    assert.strictEqual(wrapped.body, 'line one line two', 'newlines would break the notification');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
