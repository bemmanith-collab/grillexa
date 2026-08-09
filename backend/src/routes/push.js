const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { isConfigured, publicKey } = require('../lib/push');

const router = express.Router();

// Every route here is about *this* user's devices, so all of them need a
// session — including /key, which has nothing to hide but no reason to be
// readable by the unauthenticated internet either.
router.use(authenticate);

// The VAPID public key, served rather than baked into the bundle at build time.
// Vite would inline a VITE_ variable during `npm run build`, which happens
// inside the Docker image where Fly secrets do not exist — so the key would
// have to become a build argument, and rotating it would mean rebuilding.
// Reading it at runtime costs one request and removes both problems.
//
// The key is public by design: it is handed to every browser that subscribes.
router.get('/key', (req, res) => {
  if (!isConfigured()) return res.status(503).json({ error: 'Notifications are not configured on this server.' });
  res.json({ publicKey });
});

// Register this device. Keyed on the endpoint, not the user, because the
// browser hands back the same endpoint every time it re-subscribes — an
// upsert here is what stops a row accumulating on every app open.
//
// The userId is taken from the session, never the body: otherwise anyone could
// register a device against a colleague's account and read their notifications.
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.auth || !keys?.p256dh) {
    return res.status(400).json({ error: 'A push subscription with endpoint and keys is required.' });
  }
  const data = { endpoint, auth: keys.auth, p256dh: keys.p256dh, userId: req.user.id };
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: data,
    create: data,
  });
  res.status(201).json({ subscription: { id: subscription.id } });
});

// Turning notifications off. Deletes by endpoint scoped to the calling user,
// so a known endpoint alone cannot unsubscribe someone else's device.
router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
  res.status(204).end();
});

module.exports = router;
