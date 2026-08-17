// What the send path does with each push service's answer — the part that
// decides whether a person keeps receiving notifications at all.
//
// The bug this exists to catch is silent by construction: every failure mode
// here (a message batched for hours, a superseded row kept forever, a send
// that left no trace) looks identical from the outside to "notifications work
// fine", and the only way anyone finds out is a colleague saying they never
// heard about a shop.
//
// Run: npm test (from backend/). No network and no database — web-push and the
// Prisma client are replaced in the require cache before lib/push loads them.
const assert = require('assert');

// Both fakes have to be installed before lib/push is required: it reads the
// VAPID keys and captures the client at module load, not per call.
process.env.VAPID_PUBLIC_KEY = 'test-public-key';
process.env.VAPID_PRIVATE_KEY = 'test-private-key';

const sends = [];
// Keyed by endpoint, so a test can make one device fail while the rest succeed.
let answers = {};

const webpushPath = require.resolve('web-push');
require.cache[webpushPath] = {
  id: webpushPath,
  filename: webpushPath,
  loaded: true,
  exports: {
    setVapidDetails() {},
    async sendNotification(subscription, body, options) {
      sends.push({ endpoint: subscription.endpoint, body, options });
      const answer = answers[subscription.endpoint] || { statusCode: 201 };
      if (answer instanceof Error) throw answer;
      return answer;
    },
  },
};

const db = { users: [], subs: [] };
const dbPath = require.resolve('../src/db');
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: {
    user: {
      async findMany({ where }) {
        return db.users.filter((u) => u.id !== where.id.not).map((u) => ({ id: u.id }));
      },
    },
    pushSubscription: {
      async findMany({ where }) {
        return db.subs.filter((s) => where.userId.in.includes(s.userId));
      },
      async deleteMany({ where }) {
        const ids = where.id.in;
        db.subs = db.subs.filter((s) => !ids.includes(s.id));
        return { count: ids.length };
      },
    },
  },
};

const { sendToUsers, notifyOthers } = require('../src/lib/push');

function sub(id, userId, endpoint) {
  return { id, userId, endpoint, auth: 'auth-' + id, p256dh: 'p256dh-' + id };
}

function reset() {
  sends.length = 0;
  answers = {};
  db.users = [{ id: 1 }, { id: 2 }, { id: 3 }];
  db.subs = [
    sub('s1', 1, 'https://web.push.apple.com/one'),
    sub('s2', 2, 'https://fcm.googleapis.com/fcm/send/two'),
  ];
}

let failures = 0;
async function check(name, fn) {
  reset();
  const logged = [];
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = (...args) => logged.push(args.join(' '));
  console.warn = (...args) => logged.push(args.join(' '));
  try {
    await fn(logged);
    realLog('ok  ', name);
  } catch (err) {
    failures += 1;
    realLog('FAIL', name, '\n     ', err.message);
  } finally {
    console.log = realLog;
    console.warn = realWarn;
  }
}

(async () => {
  await check('every send asks for immediate delivery, not the default batching', async () => {
    // The default urgency lets a push service hold a message until the device
    // next wakes on its own — hours, on an Android under Doze. A shop added in
    // the morning and announced that evening is reported as "notifications
    // don't work", because from the phone it is indistinguishable.
    await sendToUsers([1, 2], { title: 'x' });
    assert.equal(sends.length, 2);
    for (const s of sends) assert.equal(s.options.urgency, 'high');
  });

  await check('a notification expires rather than arriving uselessly late', async () => {
    // web-push defaults to four weeks. A push service flushing a fortnight of
    // "New Store Added" at once is worse than having sent nothing.
    await sendToUsers([1, 2], { title: 'x' });
    for (const s of sends) assert.equal(s.options.TTL, 3600);
  });

  await check('410 deletes the subscription, 500 keeps it', async () => {
    // 404/410 is a push service saying the subscription is gone for good.
    // Anything else is transient, and deleting on it would unsubscribe someone
    // because their network wobbled.
    answers['https://web.push.apple.com/one'] = Object.assign(new Error('gone'), { statusCode: 410 });
    answers['https://fcm.googleapis.com/fcm/send/two'] = Object.assign(new Error('boom'), { statusCode: 500 });
    const result = await sendToUsers([1, 2], { title: 'x' });
    assert.deepEqual(result, { sent: 0, removed: 1 });
    assert.deepEqual(db.subs.map((s) => s.id), ['s2']);
  });

  await check('a send leaves a trace in the log, success included', async (logged) => {
    // Without this there is no way to answer "was anything sent when store 107
    // was created?" after the fact. That question cost an afternoon once.
    await sendToUsers([1, 2], { title: 'x' });
    assert.ok(
      logged.some((line) => line.includes('web.push.apple.com') && line.includes('201')),
      'expected an accepted-send line naming the push service and its status'
    );
    assert.ok(
      logged.some((line) => line.includes('2 accepted')),
      'expected a batch summary'
    );
  });

  await check('the log names the push service but never the full endpoint', async (logged) => {
    // The endpoint path is the secret that addresses someone's device; a log
    // aggregator is not the place for it. The host is the useful half anyway —
    // it says which service answered.
    await sendToUsers([1], { title: 'x' });
    assert.ok(logged.some((line) => line.includes('web.push.apple.com')));
    assert.ok(!logged.some((line) => line.includes('/one')), 'endpoint path must not be logged');
  });

  await check('notifyOthers skips the person who did the thing', async () => {
    // Being buzzed about your own action is noise, and it is the one
    // notification guaranteed to arrive with the app already open.
    await notifyOthers(1, { title: 'x' });
    assert.deepEqual(sends.map((s) => s.endpoint), ['https://fcm.googleapis.com/fcm/send/two']);
  });

  await check('no subscriptions is not an error', async () => {
    // Four of seven people having never tapped the button must not throw on a
    // path that runs inside store creation.
    db.subs = [];
    assert.deepEqual(await sendToUsers([1, 2], { title: 'x' }), { sent: 0, removed: 0 });
  });

  process.exit(failures === 0 ? 0 : 1);
})();
