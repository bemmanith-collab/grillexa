const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { isLatLng, reverseGeocode, readCoords } = require('../lib/geocode');
const { notifyOthers } = require('../lib/push');

const router = express.Router();

router.use(authenticate);


// A SALES account sees only its own stores, and never who else is assigned to
// them. This used to return every store's name and address plus the names of
// all sales staff to anyone logged in — the whole customer list and the staff
// directory, to an account that can only bill for one shop. Admin and Manager
// work across stores, so they still get everything.
router.get('/', async (req, res) => {
  const scoped = req.user.role === 'SALES';
  const stores = await prisma.store.findMany({
    // A salesperson sees the shops they cover — plus any they added themselves.
    // Adding one does not assign it to them, so without the second clause a
    // store would vanish the instant it was saved, which reads as data loss
    // rather than as a scoping rule.
    where: scoped
      ? { OR: [{ id: { in: req.user.storeIds } }, { createdById: req.user.id }] }
      : {},
    include: { salesUsers: !scoped },
    orderBy: { name: 'asc' },
  });
  res.json({
    stores: stores.map(({ salesUsers, ...s }) => ({
      ...s,
      ...(scoped ? {} : { salesUsers: (salesUsers || []).map((u) => ({ id: u.id, name: u.name })) }),
    })),
  });
});

// Nominatim is a free service run on donated hardware, and the whole app
// shares one outbound IP — a stuck retry loop here gets that IP blocked for
// everyone. Adding a store is a rare, deliberate act; twenty lookups a minute
// is far more than anyone standing outside a shop needs.
const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many address lookups — wait a minute and try again.' },
});

router.get('/reverse-geocode', requireRole('ADMIN'), geocodeLimiter, async (req, res) => {
  const [lat, lng] = [Number(req.query.lat), Number(req.query.lng)];
  if (!isLatLng(lat, lng)) return res.status(400).json({ error: 'lat and lng must be a valid coordinate pair' });
  try {
    res.json(await reverseGeocode(lat, lng));
  } catch (err) {
    // The pin is already in hand on the client; only the label failed. 502
    // says "not your fault, try typing it" rather than losing the fix.
    res.status(502).json({ error: 'Address lookup is unavailable — type the address instead.' });
  }
});

// Any signed-in role may add a store — a salesperson standing outside a new
// shop is the person best placed to capture its pin, and making them relay it
// to an admin is how it ends up typed in later from memory, or not at all.
//
// Editing and deleting stay ADMIN-only below: adding a shop that exists is
// additive and visible, while renaming or removing one rewrites history that
// invoices and stock ledgers already point at.
router.post('/', async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const coords = readCoords(req.body);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  let store;
  try {
    store = await prisma.store.create({
      data: { name, address, phone, ...coords.data, createdById: req.user.id },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A store with this name already exists' });
    }
    throw err;
  }

  // Told, not asked: the response does not wait on the push services, and a
  // notification failing must never fail the creation. The store exists; that
  // is the part that had to be durable.
  notifyOthers(req.user.id, {
    title: '🏪 New Store Added',
    body: `${store.name} added by ${req.user.name}`,
    url: `/stores?focus=${store.id}`,
    tag: `store-${store.id}`,
  }).catch((err) => console.warn('Store-added notification failed:', err.message));

  res.status(201).json({ store });
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, address, phone } = req.body;
  const coords = readCoords(req.body);
  if (!coords.ok) return res.status(400).json({ error: coords.error });
  try {
    const store = await prisma.store.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...coords.data,
      },
    });
    res.json({ store });
  } catch (err) {
    res.status(404).json({ error: 'Store not found' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.store.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'Cannot delete a store with existing sales, dispatch, or stock history' });
    }
    res.status(404).json({ error: 'Store not found' });
  }
});

module.exports = router;
