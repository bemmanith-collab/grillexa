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
async function sendToUsers(userIds, payload) {
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
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          body
        );
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(sub.id);
        } else {
          console.warn('Push send failed (kept for retry):', sub.endpoint, err.statusCode || err.message);
        }
      }
    })
  );

  if (dead.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
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

module.exports = { isConfigured, publicKey, sendToUsers, notifyOthers };
