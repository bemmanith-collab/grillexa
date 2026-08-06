const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, todayStr } = require('../lib/stock');
const { AUDIENCES, pickForDay, toSuggestions } = require('../lib/wisdom');

const router = express.Router();

router.use(authenticate);

// ZenQuotes is the only general quote API with keyword support, and it is
// still only a keyword: none of them have a health or food category (checked
// — the categories on offer are wisdom, life, success, leadership and so on).
// So the keyword narrows it and lib/wisdom.js filters what comes back for
// anything actually about food or the body, and an admin approves each
// survivor. Nothing from here reaches a customer's bill unapproved.
//
// The keyword parameter needs an account; without a key the free endpoint
// still returns a batch of random quotes and the filter does the narrowing,
// which is why this works with no configuration at all — just less well.
const ZENQUOTES_URL = 'https://zenquotes.io/api/quotes';
const SUGGEST_KEYWORDS = ['health', 'food', 'nutrition'];
const TIMEOUT_MS = 8000;

// Suggestions are cached for the day. The endpoint is behind an admin login
// and used a handful of times, but a third-party host does not need a request
// per click, and ZenQuotes rate-limits by IP — the whole app shares one.
let suggestionCache = { day: null, rows: [] };

function shape(message) {
  return {
    id: message.id,
    text: message.text,
    author: message.author,
    audience: message.audience,
    showOn: message.showOn ? message.showOn.toISOString().slice(0, 10) : null,
    active: message.active,
    source: message.source,
  };
}

function validAudience(value) {
  return AUDIENCES.includes(value);
}

// What to say today. Open to every role: a salesperson's dashboard asks for
// the STAFF line, and the bill footer asks for the CUSTOMER one.
router.get('/today', async (req, res) => {
  const audience = validAudience(req.query.audience) ? req.query.audience : 'STAFF';
  const date = req.query.date || todayStr();
  const messages = await prisma.wisdomMessage.findMany({
    where: { audience, active: true },
    select: { id: true, text: true, author: true, audience: true, showOn: true, active: true },
  });
  const picked = pickForDay(
    messages.map((m) => ({ ...m, showOn: m.showOn ? m.showOn.toISOString().slice(0, 10) : null })),
    date,
    audience
  );
  // 200 with an empty body rather than a 404: an empty planner is a valid
  // state, and the widget and the bill both simply show nothing.
  res.json({ date, audience, message: picked ? { text: picked.text, author: picked.author } : null });
});

// Everything below plans what gets said, which is an Admin job.
router.use(requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const messages = await prisma.wisdomMessage.findMany({
    orderBy: [{ audience: 'asc' }, { showOn: 'asc' }, { id: 'asc' }],
  });
  res.json({ messages: messages.map(shape) });
});

function readBody(body) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    const err = new Error('text is required');
    err.status = 400;
    throw err;
  }
  if (!validAudience(body.audience)) {
    const err = new Error(`audience must be one of ${AUDIENCES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return {
    text,
    author: (typeof body.author === 'string' && body.author.trim()) || 'The Grillexa Team',
    audience: body.audience,
    showOn: body.showOn ? normalizeDate(body.showOn) : null,
    active: body.active !== false,
    source: body.source === 'WEB' ? 'WEB' : 'CURATED',
  };
}

router.post('/', async (req, res) => {
  const message = await prisma.wisdomMessage.create({ data: readBody(req.body) });
  res.status(201).json({ message: shape(message) });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.wisdomMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Message not found' });
  // A partial edit: the toggle in the list sends `active` alone, so the rest
  // has to survive untouched.
  const data =
    Object.keys(req.body).length === 1 && typeof req.body.active === 'boolean'
      ? { active: req.body.active }
      : readBody({ ...shape(existing), ...req.body });
  const message = await prisma.wisdomMessage.update({ where: { id }, data });
  res.json({ message: shape(message) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.wisdomMessage.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Message not found' });
  await prisma.wisdomMessage.delete({ where: { id } });
  res.status(204).end();
});

// Candidate lines from the web, filtered to the ones about food or health and
// stripped of anything already in the planner. Returns suggestions only —
// approving one is a POST like any other, made by a person.
router.get('/suggestions', async (req, res) => {
  const day = todayStr();
  if (suggestionCache.day !== day || !suggestionCache.rows.length) {
    const key = process.env.ZENQUOTES_KEY;
    const rows = [];
    try {
      // One request per keyword when there is a key to use them with;
      // otherwise a single unfiltered batch, which the word filter narrows.
      const urls = key
        ? SUGGEST_KEYWORDS.map((word) => `${ZENQUOTES_URL}?keyword=${word}&api_key=${encodeURIComponent(key)}`)
        : [ZENQUOTES_URL];
      for (const url of urls) {
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) continue;
        const body = await response.json();
        if (Array.isArray(body)) rows.push(...body);
      }
    } catch (err) {
      // A third party being down must not take an admin page with it. The
      // planner works entirely without this; suggestions are a convenience.
      return res.status(502).json({
        error: 'Could not reach the quote service. The planner still works — write a line yourself.',
      });
    }
    suggestionCache = { day, rows };
  }

  const existing = await prisma.wisdomMessage.findMany({ select: { text: true } });
  res.json({
    suggestions: toSuggestions(suggestionCache.rows, existing.map((m) => m.text)),
    configured: Boolean(process.env.ZENQUOTES_KEY),
  });
});

module.exports = router;
