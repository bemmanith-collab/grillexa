// Sending web push notifications, and forgetting the devices that stopped
// listening.
//
// VAPID keys identify this server to the push services (FCM, Mozilla, Apple).
// They are a keypair, not a secret shared with anyone: the public half is
// handed to browsers so they can address a subscription to us, and the private
// half signs each send. Generate with `npx web-push generate-vapid-keys` and
// set both as secrets — rotating them invalidates every existing subscription,
// so it is not a routine operation.
const webpush = require('web-push');
const prisma = require('../db');

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

// Configured once at require time. Without keys the app must still boot and
// serve everything else — a missing key is a notifications outage, not an
// outage. isConfigured() is what every caller checks instead of throwing.
if (publicKey && privateKey) {
  // The mailto is a contact address the push service uses to reach an operator
  // about a misbehaving sender. It is required to be a mailto: or https: URL.
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:bemmanith@gmail.com',
    publicKey,
    privateKey
  );
}

function isConfigured() {
  return Boolean(publicKey && privateKey);
}

// Sends to every subscription belonging to the given users, and deletes the
// ones the push service says are dead.
//
// 404/410 mean the subscription is gone for good — the app was uninstalled,
// permission was revoked, or the browser cleared its data. Nothing else prunes
// this table, so failing to delete here means retrying a dead endpoint on
// every store added, forever. Any other error (network, 5xx, rate limit) is
// transient and the row is kept.
//
// Never throws. A notification failing must not roll back or 500 the action
// that triggered it — the store was still created.
// One hour, against web push's four-week default. If it could not be delivered
// within the hour the moment has passed, and a push service flushing a
// fortnight of "New Store Added" at once is worse than silence.
const DEFAULT_TTL_S = 3600;

async function sendToUsers(userIds, payload, { ttlSeconds = DEFAULT_TTL_S } = {}) {
  if (!isConfigured() || !userIds.length) return { sent: 0, removed: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (!subs.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  const dead = [];
  let sent = 0;

  // Settled, not all: one device with a dead endpoint must not stop the rest
  // of the team from being told.
  await Promise.allSettled(
    subs.map(async (sub) => {
      // The host is the only part of an endpoint worth logging: it says which
      // push service answered (Apple, FCM, Mozilla) without putting the
      // subscription's secret path into the log.
      const host = (() => {
        try {
          return new URL(sub.endpoint).host;
        } catch (err) {
          return 'unknown-host';
        }
      })();
      try {
        const res = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          body,
          // urgency high, because the default lets a push service hold the
          // message until the device next wakes on its own. On Android under
          // Doze that is hours, and a shop added this morning announced this
          // evening reads as "notifications don't work" — which is how this
          // was reported. It asks for an immediate wake; the device's own
          // battery settings can still overrule it.
          //
          // TTL is how long the push service may hold an undelivered message
          // before dropping it — a hard expiry, enforced by the service rather
          // than by us, and the only expiry that still works when the device
          // was offline the whole time. Defaults to an hour; the caller sets it
          // where the message stays useful for longer.
          { urgency: 'high', TTL: ttlSeconds }
        );
        sent += 1;
        // Logged per send, and on success too. A status code here is the only
        // evidence that a notification ever left, and without it the question
        // "was anything sent when store 107 was created?" is unanswerable
        // after the fact — which cost an afternoon of guessing once already.
        //
        // 201 means the push service accepted it for delivery. It is not proof
        // the device displayed anything, and must never be read as one.
        console.log(`Push accepted user=${sub.userId} ${host} status=${res.statusCode}`);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(sub.id);
          console.log(`Push gone user=${sub.userId} ${host} status=${err.statusCode} (subscription deleted)`);
        } else {
          console.warn(`Push failed user=${sub.userId} ${host} status=${err.statusCode || err.message} (kept for retry)`);
        }
      }
    })
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
  console.log(`Push batch: ${subs.length} subscription(s), ${sent} accepted, ${dead.length} removed`);
  return { sent, removed: dead.length };
}

// Everyone on the team except the person who did the thing. Being notified of
// your own action is noise, and it is the one notification guaranteed to
// arrive while the app is already open in front of you.
async function notifyOthers(actorId, payload) {
  const others = await prisma.user.findMany({
    where: { id: { not: actorId } },
    select: { id: true },
  });
  return sendToUsers(others.map((u) => u.id), payload);
}

// One person, named by email in the environment, and nobody else.
//
// FAILS CLOSED, like WHATSAPP_AUTHORS and unlike TEAM_CHAT_ADMINS: unset means
// nobody is told, never "tell everyone". That direction is deliberate — this
// carries where staff phones were when they billed, so the failure mode of a
// missing or misspelt setting has to be silence, not a broadcast of location
// data to the whole team.
//
// Resolved fresh on each call rather than cached at boot, so correcting the
// address is a restart of nothing. Matched case-insensitively because an email
// typed into a Fly secret and one typed into the users table will differ in
// case sooner or later.
//
// Never throws, for the same reason sendToUsers doesn't: this is told-not-asked
// from paths that have already done their real work.
//
// EXPIRES AFTER 24 HOURS. A pin notification is a "this happened today" note —
// which store got located while somebody was billing in it. Delivered two days
// late it is not a smaller version of the same message, it is noise about a
// day nobody is thinking about any more. TTL is the right lever because the
// push service enforces it: a phone switched off for the weekend gets nothing
// on Monday, rather than a stack of them, and that holds even though this app
// never gets to run any expiry code of its own.
const PIN_WATCHER = String(process.env.GEO_NOTIFY_EMAIL || '').trim();
const PIN_TTL_S = 24 * 60 * 60;

async function notifyPinWatcher(payload) {
  if (!PIN_WATCHER || !isConfigured()) return { sent: 0, removed: 0 };

  const watcher = await prisma.user.findFirst({
    where: { email: { equals: PIN_WATCHER, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!watcher) {
    console.warn(`GEO_NOTIFY_EMAIL is set to "${PIN_WATCHER}" but no user has that address — nobody was notified.`);
    return { sent: 0, removed: 0 };
  }

  // A single id, always. Never widened, never defaulted to anyone else.
  return sendToUsers([watcher.id], payload, { ttlSeconds: PIN_TTL_S });
}

module.exports = { isConfigured, publicKey, sendToUsers, notifyOthers, notifyPinWatcher, PIN_TTL_S };
