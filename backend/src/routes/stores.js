const express = require('express');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { isLatLng, reverseGeocode, searchPlaces, isMapLink, resolveMapLink, readCoords } = require('../lib/geocode');
const mapbox = require('../lib/mapbox');
const mapUsage = require('../lib/mapUsage');
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

// One geocoding request against the free tier, counted only when Mapbox is the
// one that answered — the Nominatim fallback spends none of it. Returns the
// fresh figures so the meter on the page moves as the requests are made, and
// null rather than throwing if the counter itself failed: a lookup that worked
// must not be reported as broken because a tally missed.
function countGeocode() {
  if (!mapbox.hasMapbox()) return Promise.resolve(null);
  return mapUsage.record(prisma, 'geocodes').catch(() => null);
}

// Not ADMIN-only any more: anyone who can add a store needs the address that
// goes with the pin they just dropped. The rate limiter, not the role, is what
// protects Nominatim here.
router.get('/reverse-geocode', geocodeLimiter, async (req, res) => {
  const [lat, lng] = [Number(req.query.lat), Number(req.query.lng)];
  if (!isLatLng(lat, lng)) return res.status(400).json({ error: 'lat and lng must be a valid coordinate pair' });
  try {
    // Mapbox when a token is configured, Nominatim when it is not. Both return
    // the same {parts, address}, so nothing downstream branches on which ran.
    const found = mapbox.hasMapbox() ? await mapbox.reverseGeocode(lat, lng) : await reverseGeocode(lat, lng);
    res.json({ ...found, usage: await countGeocode() });
  } catch (err) {
    // The pin is already in hand on the client; only the label failed. 502
    // says "not your fault, try typing it" rather than losing the fix.
    res.status(502).json({ error: 'Address lookup is unavailable — type the address instead.' });
  }
});

// Typed place name to candidate points, for the map picker's search box. Goes
// through the server for the same two reasons reverse geocoding does: the page
// cannot set the User-Agent Nominatim's policy asks for, and connect-src stays
// 'self' so it could not reach the host anyway.
//
// Shares the limiter deliberately. Both directions hit the same donated
// hardware from the same outbound IP, so they have to share one budget — a
// search box that fires per keystroke would otherwise spend it alone.
router.get('/geocode', geocodeLimiter, async (req, res) => {
  const q = String(req.query.q || '').trim();
  // Two characters match half of India; the floor is here rather than only in
  // the browser so a stray request cannot spend the shared budget on noise.
  if (q.length < 3) return res.json({ results: [] });
  // Optional "somewhere near here" hint — the last store pin the page knows of.
  // Without it, a common road or colony name ranks by how well a city is
  // mapped, which puts Bengaluru and Chennai above Hyderabad every time.
  const [nearLat, nearLng] = String(req.query.near || '').split(',').map(Number);
  const near = isLatLng(nearLat, nearLng) ? [nearLat, nearLng] : null;
  // A Google Maps share link is what people actually have to hand: the way you
  // send someone a shop is to share it from Maps. Handled here rather than as
  // a separate endpoint so pasting one into the search box just works.
  if (isMapLink(q)) {
    try {
      const point = await resolveMapLink(q);
      if (point) return res.json({ results: [{ ...point, label: 'From your Google Maps link', address: '' }] });
      // A short link often resolves to a Google place id with no coordinates
      // anywhere in the URL. Turning that into a point needs the paid Places
      // API, so the honest answer is to say so and give the manual route.
      return res.status(422).json({
        error:
          "That link doesn't carry coordinates. Open it in Google Maps, press and hold the shop until a pin drops, then copy the numbers it shows and paste them here.",
      });
    } catch (err) {
      return res.status(502).json({ error: 'Could not open that link — paste the coordinates instead.' });
    }
  }

  try {
    const results = mapbox.hasMapbox() ? await mapbox.searchPlaces(q, near) : await searchPlaces(q, near);
    res.json({ results, usage: await countGeocode() });
  } catch (err) {
    res.status(502).json({ error: 'Place search is unavailable — drop the pin by hand instead.' });
  }
});

// What the page needs before it can draw a map: the public token, and how much
// of the month's free tier is gone.
//
// The token is handed out here rather than baked into the bundle at build time
// so that rotating it is `fly secrets set` and a restart, not a rebuild and a
// redeploy. It is a public `pk.` token — Mapbox GL sends it from the browser
// by design, and the control that matters is the URL restriction set on it in
// the Mapbox dashboard, not secrecy. The `sk.` token that can spend money
// stays in lib/mapbox.js and never leaves the server.
router.get('/map-config', async (req, res) => {
  res.json({
    token: String(process.env.MAPBOX_PUBLIC_TOKEN || '').trim(),
    usage: await mapUsage.read(prisma),
  });
});

// Counted when a map actually initialises, which is the thing Mapbox bills
// for — not when the Stores page opens, because the picker is lazy and most
// visits never draw one.
//
// A failure here must never stop the map appearing: the meter being wrong is a
// smaller problem than the picker not opening, so the error is swallowed and
// the last known figure returned.
router.post('/map-load', async (req, res) => {
  try {
    res.json(await mapUsage.record(prisma, 'loads'));
  } catch (err) {
    res.json(await mapUsage.read(prisma).catch(() => null));
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
