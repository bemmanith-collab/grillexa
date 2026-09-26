// "Today's post isn't written yet" — a push notification at breakfast time.
//
// The channel posts daily, and a daily habit fails on the mornings nobody
// remembers rather than on the mornings nobody has anything to say. Everything
// this needs already exists: web push is set up, and the suggestion engine
// already computes the exact sentence. This is the glue.
//
// Deliberately not a cron service. Fly keeps at least one machine running
// (min_machines_running = 1), so a timer inside the app is enough — and it has
// no auth surface, no external scheduler, and nothing to keep in step with a
// deploy. The one thing it does need is the multi-machine guard below.

const prisma = require('../db');
const { sendToUsers, isConfigured } = require('./push');
const { buildSuggestions } = require('./whatsappSuggestions');

const CHECK_EVERY_MS = 5 * 60 * 1000;
const DEFAULT_HOUR = 7;

// Which business day has already been dealt with.
//
// The timer below fires every five minutes from 07:00 IST to midnight, and
// every one of those ticks used to run three queries — to re-discover a
// decision that cannot change again today. That is ~200 queries a day to send
// one notification, and it is not the query count that costs: the database
// sleeps after five minutes idle and bills by the hour it is awake, so a poll
// on a five-minute timer holds it open for seventeen hours a day. Remembering
// the answer is what lets it sleep.
//
// In memory on purpose. It is an optimisation, not a lock — the unique
// constraint on WhatsAppReminder.sentFor is still the only thing that stops two
// machines sending twice, and a restart simply re-checks the day once.
let settledFor = null;

function daySettled(today) {
  return settledFor === today;
}

// Records the day and passes the reason straight through, so a terminal branch
// stays one line and cannot mark the day without also returning.
function markSettled(today, reason) {
  settledFor = today;
  return reason;
}

function resetSettled() {
  settledFor = null;
}

// Same +5:30 as the rest of the app. The reminder is for people in India;
// the server's idea of morning is irrelevant.
const BUSINESS_UTC_OFFSET_MINUTES = 330;

function businessNow(now = Date.now()) {
  return new Date(now + BUSINESS_UTC_OFFSET_MINUTES * 60000);
}

function reminderHour() {
  // Trimmed and length-checked before Number(), because Number('') is 0 and 0 is
  // a perfectly valid hour — so a WHATSAPP_REMINDER_HOUR= line left empty in a
  // .env would silently move the reminder to midnight.
  const raw = String(process.env.WHATSAPP_REMINDER_HOUR ?? '').trim();
  if (!raw) return DEFAULT_HOUR;
  const hour = Number(raw);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR;
}

function enabled() {
  return String(process.env.WHATSAPP_REMINDER ?? 'on').toLowerCase() !== 'off';
}

// Only the people who actually write the posts. Reusing WHATSAPP_AUTHORS rather
// than inventing a second list means adding a writer stays one change.
async function authorIds() {
  const emails = (process.env.WHATSAPP_AUTHORS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return [];

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  return users
    .filter((user) => emails.includes(String(user.email).toLowerCase()))
    .map((user) => user.id);
}

/**
 * Should a reminder go out? Pure, so the order of the checks can be tested
 * without a database, a clock or a push service — which is where the bugs in
 * something like this actually live.
 *
 * Returns a short reason string. 'send' is the only one that does anything; the
 * rest are what shows in the log when someone asks why no notification arrived.
 */
function decideReminder({
  now = Date.now(),
  isEnabled,
  pushConfigured,
  hour,
  recipientCount,
  alreadyWritten,
  hasSuggestion,
}) {
  if (!isEnabled) return 'disabled';
  if (!pushConfigured) return 'push-not-configured';
  if (businessNow(now).getUTCHours() < hour) return 'too-early';
  if (!recipientCount) return 'no-authors';
  // The whole point of the notification is that the post is missing, so this is
  // checked before the day's row is claimed — claiming first would mean a day
  // where the post got written early gets no reminder AND burns the row.
  if (alreadyWritten) return 'already-written';
  if (!hasSuggestion) return 'nothing-to-suggest';
  return 'send';
}

/**
 * Decides whether a reminder is due and sends it. Safe to call as often as you
 * like — the date row is what stops it repeating, not the caller's timing.
 */
async function runReminderCheck(now = Date.now()) {
  const early = decideReminder({
    now,
    isEnabled: enabled(),
    pushConfigured: isConfigured(),
    hour: reminderHour(),
    // Not known yet; the cheap checks above are worth doing before any query.
    recipientCount: 1,
    alreadyWritten: false,
    hasSuggestion: true,
  });
  if (early !== 'send') return early;

  const ist = businessNow(now);
  const today = ist.toISOString().slice(0, 10);

  // Everything below this line touches the database. Once today is settled
  // there is nothing left for it to find, so the check stops here.
  if (daySettled(today)) return 'settled-today';

  const recipients = await authorIds();
  if (!recipients.length) return markSettled(today, 'no-authors');

  const [rota, clock] = await Promise.all([loadRota(), loadClock()]);
  const due = rota.postForToday(now);
  const alreadyWritten = await prisma.whatsAppPost.count({
    where: { postDate: today, type: due.type },
  });
  if (alreadyWritten > 0) return markSettled(today, 'already-written');

  const posts = await prisma.whatsAppPost.findMany({
    orderBy: { postDate: 'desc' },
    take: 200,
    select: { type: true, postDate: true, used: true },
  });

  const options = await loadOptions();
  const [top] = buildSuggestions({
    posts,
    types: options.TYPES,
    dueToday: due,
    today: clock.businessDateStr(now),
  });
  if (!top) return markSettled(today, 'nothing-to-suggest');

  // The race between machines is settled here: whoever inserts the row first
  // sends, and the others fail the unique constraint and return quietly.
  try {
    await prisma.whatsAppReminder.create({
      data: { sentFor: today, recipients: recipients.length },
    });
  } catch {
    return markSettled(today, 'already-sent');
  }

  await sendToUsers(recipients, {
    title: '🌿 Today\'s Grillo post',
    body: top.reason,
    url: '/whatsapp',
    // One tag per day: a reminder that somehow fires twice replaces itself on
    // the phone rather than stacking up.
    tag: `whatsapp-${today}`,
  });

  return markSettled(today, 'sent');
}

// The rota, the options registry and the clock live in the ESM subproject, so
// they are imported the same way the route imports them.
const path = require('path');
const { pathToFileURL } = require('url');

const GENERATOR_DIR = path.join(__dirname, '..', '..', '..', 'whatsapp', 'lib');
const load = (file) => import(pathToFileURL(path.join(GENERATOR_DIR, file)).href);
const loadRota = () => load('rota.js');
const loadOptions = () => load('options.js');
const loadClock = () => load('clock.js');

function startReminderSchedule() {
  if (!enabled()) {
    console.log('whatsapp reminder: disabled');
    return null;
  }

  // Every five minutes rather than once at the hour: a machine that restarts at
  // 07:03 would otherwise skip the day entirely, and restarts are routine here.
  const timer = setInterval(() => {
    runReminderCheck()
      .then((result) => {
        if (result === 'sent') console.log('whatsapp reminder: sent');
      })
      .catch((err) => console.error('whatsapp reminder failed:', err.message));
  }, CHECK_EVERY_MS);

  // Never hold the process open on this alone.
  timer.unref?.();
  console.log(`whatsapp reminder: checking from ${reminderHour()}:00 IST`);
  return timer;
}

module.exports = {
  decideReminder,
  runReminderCheck,
  startReminderSchedule,
  reminderHour,
  daySettled,
  markSettled,
  resetSettled,
};
