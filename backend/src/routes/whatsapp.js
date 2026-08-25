const path = require('path');
const { pathToFileURL } = require('url');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const prisma = require('../db');
const { buildSuggestions, summarise } = require('../lib/whatsappSuggestions');

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
    importGenerator('clock.js'),
  ])
    .then(([generate, options, rota, provider, clock]) => ({ generate, options, rota, provider, clock }))
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
    // Language is a dropdown now rather than a CLI flag only. The quote follows
    // the body automatically when it is not English, so there is nothing extra
    // for the person posting to remember.
    languages: Object.keys(options.LANGUAGES).map((value) => ({
      value,
      label: value === 'english' ? 'English' : `${value[0].toUpperCase()}${value.slice(1)} (Latin script)`,
    })),
    // The panel opens on today's post already selected, so posting daily is one
    // click rather than three decisions. Computed in IST, like everything else
    // date-shaped here — the person posting is in India whatever the server thinks.
    today: rota.postForToday(),
    // The whole weekly rota, so choosing a day in the panel can set the content
    // type to whatever that day is due without a round trip.
    rota: rota.ROTA,
    weekdays: Object.keys(rota.ROTA),
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
  const { type, audience, topic, slot, day, language } = req.body ?? {};

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
  if (language && !options.LANGUAGES[language]) {
    return res.status(400).json({
      error: `Unknown language "${language}".`,
      valid: Object.keys(options.LANGUAGES),
    });
  }
  if (slot && !options.SLOTS[slot]) {
    return res.status(400).json({
      error: `Unknown meal "${slot}".`,
      valid: Object.keys(options.SLOTS),
    });
  }

  // Weekdays are the rota's own keys, so a day the rota does not know cannot be
  // asked for. Capitalisation is normalised rather than rejected.
  const rotaModule = (await generator()).rota;
  const weekdays = Object.keys(rotaModule.ROTA);
  const cleanDay = day
    ? weekdays.find((d) => d.toLowerCase() === String(day).toLowerCase())
    : undefined;
  if (day && !cleanDay) {
    return res.status(400).json({ error: `Unknown day "${day}".`, valid: weekdays });
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
      language: language || options.DEFAULTS.language,
      quoteLanguage: options.DEFAULTS.quoteLanguage,
      topic: cleanTopic || undefined,
      slot: slot || undefined,
      day: cleanDay,
    });

    // Kept so the channel can be looked at as a whole — what is going stale,
    // what was actually sent. A failure to record must never lose the post the
    // person is waiting for, so it is caught and the response goes out anyway.
    let saved = null;
    try {
      saved = await prisma.whatsAppPost.create({
        data: {
          type: result.options.type,
          audience: result.options.audience,
          language: result.options.language,
          slot: result.options.slot ?? null,
          day: result.options.day,
          postDate: result.options.date,
          occasion: result.options.occasions?.map((o) => o.name).join(', ') || null,
          ingredient: result.options.ingredient?.name ?? null,
          topic: cleanTopic || null,
          provider: (await generator()).provider.describeProvider().name,
          text: result.text,
          authorId: req.user.id,
        },
      });
    } catch (saveError) {
      console.error('whatsapp: could not record post history', saveError);
    }

    res.json({
      id: saved?.id ?? null,
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
        language: result.options.language,
        occasion: result.options.occasions?.map((o) => o.name).join(', ') || null,
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

// What to write next, and how the week has gone. Read by the panel on load.
router.get('/suggestions', async (req, res) => {
  const { options, rota, clock } = await generator();
  // The Indian date, same as everything else here — "this week" has to mean the
  // same thing to the suggestions as it does to the person reading them.
  const today = clock.businessDateStr();

  const posts = await prisma.whatsAppPost.findMany({
    orderBy: { postDate: 'desc' },
    take: 200,
    select: { type: true, postDate: true, used: true },
  });

  res.json({
    suggestions: buildSuggestions({
      posts,
      types: options.TYPES,
      dueToday: rota.postForToday(),
      today,
    }).slice(0, 4),
    summary: summarise(posts, today),
  });
});

// The last posts written, newest first. Small page: this is a "what did we send
// on Tuesday" list, not an archive to browse.
router.get('/history', async (req, res) => {
  const posts = await prisma.whatsAppPost.findMany({
    orderBy: { id: 'desc' },
    take: Math.min(Number(req.query.limit) || 20, 50),
    include: { author: { select: { name: true } } },
  });

  res.json({
    posts: posts.map((post) => ({
      id: post.id,
      type: post.type,
      audience: post.audience,
      language: post.language,
      day: post.day,
      postDate: post.postDate,
      occasion: post.occasion,
      ingredient: post.ingredient,
      used: post.used,
      rating: post.rating,
      author: post.author?.name ?? null,
      createdAt: post.createdAt,
      text: post.text,
    })),
  });
});

// Marking a post used is what makes the suggestions mean anything: without it
// every draft counts as published and the channel looks busier than it is.
router.post('/history/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad post id.' });

  const data = {};
  if (typeof req.body?.used === 'boolean') data.used = req.body.used;
  if ([-1, 0, 1].includes(req.body?.rating)) data.rating = req.body.rating;
  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Nothing to update.', valid: ['used', 'rating'] });
  }

  try {
    const post = await prisma.whatsAppPost.update({ where: { id }, data });
    res.json({ id: post.id, used: post.used, rating: post.rating });
  } catch {
    res.status(404).json({ error: 'No such post.' });
  }
});

// ---------------------------------------------------------------------------
// The 30-day calendar
//
// Ninety planned cells seeded from whatsapp/strategy/30-day.json. Everything
// below sits under the same three gates as the rest of this file — session,
// ADMIN/MANAGER, and the WHATSAPP_AUTHORS allowlist — because it writes to the
// same channel.
// ---------------------------------------------------------------------------

// Which generator type each time of day is polished as. The calendar's three
// slots are the channel's own (7:30 / 13:00 / 20:30); the generator's types are
// a different vocabulary, so the two are joined here rather than either side
// pretending to be the other.
//
// afternoon carries a meal slot because `meal` is a slotted type and lunch is
// what one o'clock is. morning and evening take none.
const SLOT_TO_TYPE = {
  morning: { type: 'morning' },
  afternoon: { type: 'meal', slot: 'lunch' },
  night: { type: 'evening' },
};

const CALENDAR_SLOTS = Object.keys(SLOT_TO_TYPE);

// The whole plan in one response, fullPost included.
//
// Ninety rows with their prose is a couple of hundred kilobytes at absolute
// worst and almost always far less, since most cells have no generated post for
// weeks. Paying that once beats ninety follow-up requests as somebody opens
// cells, and it means the grid renders complete rather than filling in.
router.get('/calendar', async (req, res) => {
  const cells = await prisma.whatsAppContent.findMany({
    orderBy: [{ day: 'asc' }, { id: 'asc' }],
  });

  res.json({
    slots: CALENDAR_SLOTS,
    days: 30,
    // Counted here rather than in the browser so the header cannot disagree
    // with the grid if a filter is added later.
    summary: {
      total: cells.length,
      sent: cells.filter((c) => c.sent).length,
      generated: cells.filter((c) => c.fullPost).length,
    },
    cells,
  });
});

// Polish one cell's draft into a full post.
//
// The draft is handed to the existing generator as the topic, so the brand
// voice, the format, the audience rules and the everyday-ingredient rotation
// all come from prompts/ exactly as they do for a hand-written post. Nothing
// about the voice is re-stated here, which is the only way the calendar and the
// daily panel can stay saying the same thing.
router.post('/calendar/:id/generate', generateLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad cell id.' });

  const cell = await prisma.whatsAppContent.findUnique({ where: { id } });
  if (!cell) return res.status(404).json({ error: 'No such calendar cell.' });

  const { options, generate, provider } = await generator();
  const mapped = SLOT_TO_TYPE[cell.timeSlot] ?? SLOT_TO_TYPE.morning;

  // The panel may override the type — a night cell about the market reads
  // better as `seasonal` than as an evening wind-down, and whoever is writing
  // can see that and the mapping cannot.
  const type = req.body?.type && options.TYPES[req.body.type] ? req.body.type : mapped.type;
  const slotted = options.TYPES[type]?.slotted;
  const language = options.LANGUAGES[req.body?.language] ? req.body.language : options.DEFAULTS.language;

  // Theme, draft and question go in together. The question matters: without it
  // the generator writes a post that ends on the quote and the reply prompt has
  // to be pasted on afterwards, which is how it gets forgotten.
  const topic = [
    cell.theme,
    '',
    cell.draft,
    cell.engagementQuestion ? `\n\nEnd by asking the reader: ${cell.engagementQuestion}` : '',
  ].join('\n').trim();

  try {
    const result = await generate.generate({
      type,
      audience: options.DEFAULTS.audience,
      tone: options.DEFAULTS.tone,
      language,
      quoteLanguage: options.DEFAULTS.quoteLanguage,
      // Not capped at 300 like the free-text field on the daily panel: this is
      // our own seeded copy, under a hundred words by construction, not
      // something typed into a box.
      topic,
      slot: slotted ? mapped.slot : undefined,
    });

    const updated = await prisma.whatsAppContent.update({
      where: { id },
      data: { fullPost: result.text },
    });

    // Also recorded as history, so a calendar post counts towards "what has the
    // channel actually shown people" alongside the hand-written ones. A failure
    // here must not lose the post the person is waiting for.
    try {
      await prisma.whatsAppPost.create({
        data: {
          type: result.options.type,
          audience: result.options.audience,
          language: result.options.language,
          slot: result.options.slot ?? null,
          day: result.options.day,
          postDate: result.options.date,
          occasion: result.options.occasions?.map((o) => o.name).join(', ') || null,
          ingredient: result.options.ingredient?.name ?? null,
          topic: `Calendar day ${cell.day} ${cell.timeSlot}: ${cell.theme}`,
          provider: provider.describeProvider().name,
          text: result.text,
          authorId: req.user.id,
        },
      });
    } catch (saveError) {
      console.error('whatsapp: could not record calendar post history', saveError);
    }

    res.json({ id: updated.id, fullPost: updated.fullPost });
  } catch (err) {
    if (err?.name !== 'GenerationError') throw err;
    const operatorProblem = err.code === 'not-configured';
    res.status(operatorProblem ? 503 : 502).json({
      error: err.message,
      hint: operatorProblem
        ? 'Ask an administrator to set GEMINI_API_KEY on the server.'
        : err.hint,
    });
  }
});

// Mark a cell sent, or un-send one that was ticked by mistake. sentAt follows
// sent rather than being passed in — the server's clock is the only one that
// cannot be wrong about when the button was actually pressed.
//
// fullPost is editable here too: the generator gets it close and the person
// posting almost always changes a line before it goes out, and losing that edit
// on the next page load would make the whole panel untrustworthy.
router.patch('/calendar/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad cell id.' });

  const data = {};
  if (typeof req.body?.sent === 'boolean') {
    data.sent = req.body.sent;
    data.sentAt = req.body.sent ? new Date() : null;
  }
  if (typeof req.body?.fullPost === 'string') {
    data.fullPost = req.body.fullPost.trim() || null;
  }
  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Nothing to update.', valid: ['sent', 'fullPost'] });
  }

  try {
    const cell = await prisma.whatsAppContent.update({ where: { id }, data });
    res.json({ id: cell.id, sent: cell.sent, sentAt: cell.sentAt, fullPost: cell.fullPost });
  } catch {
    res.status(404).json({ error: 'No such calendar cell.' });
  }
});

module.exports = router;

// Exported for test/whatsapp-calendar.js, which checks that every type and meal
// named here still exists in the generator's own registry. Renaming a type in
// whatsapp/lib/options.js would otherwise break Generate Full Post silently, and
// only for whichever time of day pointed at it.
module.exports.SLOT_TO_TYPE = SLOT_TO_TYPE;
