const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

// The generator lives in the whatsapp/ subproject, which is ESM while this
// backend is CommonJS — hence import() rather than require(). The path is the
// same in development and in the image: the backend is /app/backend and the
// subproject is copied to /app/whatsapp, so ../../../whatsapp resolves either
// way. pathToFileURL matters on Windows, where import() rejects a bare path.
//
// Importing it rather than reimplementing it is the whole point: the prompt
// files, the brand voice, the everyday-ingredient rotation and the audience
// rules stay in one place, so the dashboard and the CLI can never drift apart
// and say different things to customers.
const GENERATOR_DIR = path.join(__dirname, '..', '..', '..', 'whatsapp', 'lib');
const importGenerator = (file) => import(pathToFileURL(path.join(GENERATOR_DIR, file)).href);

// Loaded once and reused. The first request pays for reading the prompt files;
// nothing after that does.
let modules;
async function generator() {
  modules ??= Promise.all([
    importGenerator('generate.js'),
    importGenerator('options.js'),
    importGenerator('rota.js'),
    importGenerator('provider.js'),
  ])
    .then(([generate, options, rota, provider]) => ({ generate, options, rota, provider }))
    .catch((err) => {
      modules = undefined; // let a later request try again after a bad deploy
      throw err;
    });
  return modules;
}

router.use(authenticate);

// Sales accounts have no reason to publish to the customer channel, and every
// call to this route spends money — so the gate is here, at the route, not only
// in the dashboard that hides the panel.
router.use(requireRole('ADMIN', 'MANAGER'));

// Role is not the whole gate. Writing for the customer channel is a job two
// named people do, not something every Admin should be able to do because they
// can also reset passwords — so there is a second, explicit allowlist.
//
// It is configuration rather than a list in this file: adding or removing a
// writer is a secret change, not a code change and a deploy. Emails, because
// they are unique in the database and stable; names are neither.
function channelAuthors() {
  return (process.env.WHATSAPP_AUTHORS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

// Fails closed. An unset variable meaning "everybody" would quietly hand the
// channel to every Admin the first time someone forgot to set a secret, and the
// failure would be invisible — nothing would look wrong. This way it is obvious
// and the message says exactly what to do.
router.use((req, res, next) => {
  const authors = channelAuthors();
  if (authors.length === 0) {
    return res.status(503).json({
      error: 'Nobody is set up to write channel posts yet.',
      hint: 'Set WHATSAPP_AUTHORS to a comma-separated list of the email addresses allowed to post.',
    });
  }
  if (!authors.includes(String(req.user.email).toLowerCase())) {
    return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
  }
  next();
});

// Unlike the rest of the API, every request here goes out to a third party — and
// on Claude it is billed per post, while the free providers have quotas of their
// own that a loop would burn through. A generous ceiling that still stops a stuck
// retry or a leaning keyboard: nobody writing posts by hand needs more than this
// in an hour, and hitting it means something is wrong.
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many posts generated in the last hour. Try again shortly.' },
});

// The dropdowns are built from this, so the panel can never offer a type the
// generator does not have — adding one to the subproject's registry puts it in
// the dashboard with no frontend change.
router.get('/options', async (req, res) => {
  const { options, rota, provider } = await generator();
  const list = (registry) => Object.entries(registry)
    .map(([value, entry]) => ({ value, label: entry.label ?? value }));

  res.json({
    types: list(options.TYPES),
    audiences: list(options.AUDIENCES),
    slots: list(options.SLOTS),
    // The panel opens on today's post already selected, so posting daily is one
    // click rather than three decisions. Computed in IST, like everything else
    // date-shaped here — the person posting is in India whatever the server thinks.
    today: rota.postForToday(),
    // Which service is writing. Shown in the panel because the three differ a
    // lot in quality, and "why does this read badly today" should be answerable
    // without opening a terminal.
    provider: provider.describeProvider(),
    // Which types take a meal slot, so the panel knows when to show that field.
    slottedTypes: Object.entries(options.TYPES)
      .filter(([, spec]) => spec.slotted)
      .map(([value]) => value),
  });
});

router.post('/generate', generateLimiter, async (req, res) => {
  const { options, generate } = await generator();
  const { type, audience, topic, slot } = req.body ?? {};

  if (!options.TYPES[type]) {
    return res.status(400).json({
      error: `Unknown content type "${type}".`,
      valid: Object.keys(options.TYPES),
    });
  }
  if (audience && !options.AUDIENCES[audience]) {
    return res.status(400).json({
      error: `Unknown audience "${audience}".`,
      valid: Object.keys(options.AUDIENCES),
    });
  }
  if (slot && !options.SLOTS[slot]) {
    return res.status(400).json({
      error: `Unknown meal "${slot}".`,
      valid: Object.keys(options.SLOTS),
    });
  }

  // A topic is free text that goes into the prompt. Cap it: the field is meant
  // for a phrase like "eating after 8 PM", and an essay pasted in would be paid
  // for by the token on every request.
  const cleanTopic = typeof topic === 'string' ? topic.trim().slice(0, 300) : undefined;

  try {
    const result = await generate.generate({
      type,
      audience: audience || options.DEFAULTS.audience,
      tone: options.DEFAULTS.tone,
      language: options.DEFAULTS.language,
      quoteLanguage: options.DEFAULTS.quoteLanguage,
      topic: cleanTopic || undefined,
      slot: slot || undefined,
    });

    res.json({
      text: result.text,
      meta: {
        type: result.options.type,
        audience: result.options.audience,
        slot: result.options.slot ?? null,
        day: result.options.day,
        // Shown in the panel so whoever is posting can see the rotation working
        // rather than having to notice it across a week of posts.
        ingredient: result.options.ingredient?.name ?? null,
        quoteLanguage: result.options.quoteLanguage,
      },
    });
  } catch (err) {
    // GenerationError carries a message and a fix written for a person. Anything
    // else is a bug and belongs in the generic error handler.
    if (err?.name !== 'GenerationError') throw err;

    // code 'not-configured' means an operator has to fix something — no
    // provider set up, or a key that was refused. Nothing the person at the
    // dashboard can do, so 503 and a hint aimed at them rather than at whoever
    // edits .env files.
    const operatorProblem = err.code === 'not-configured';
    res.status(operatorProblem ? 503 : 502).json({
      error: err.message,
      hint: operatorProblem
        ? 'Ask an administrator to set GEMINI_API_KEY on the server.'
        : err.hint,
    });
  }
});

module.exports = router;
