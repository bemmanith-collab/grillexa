// The daily "today's post isn't written" reminder.
//
// Only the decision is tested, and that is on purpose: the sending is three
// lines over an existing, already-tested push library, while the order of these
// checks is where a reminder that never arrives — or arrives twice, or arrives
// at 2am — actually comes from.
//
// Run: npm test (from backend/). No database, no network.
const assert = require('assert');
const { decideReminder, reminderHour } = require('../src/lib/whatsappReminder');

// 2026-08-21 is a Friday. Times are given in IST and converted back to an
// instant, so the test reads in the timezone the feature is written for.
const ist = (hour, minute = 0) =>
  Date.parse('2026-08-21T00:00:00.000Z') + (hour - 5.5) * 3600000 + minute * 60000;

const ready = {
  isEnabled: true,
  pushConfigured: true,
  hour: 7,
  recipientCount: 2,
  alreadyWritten: false,
  hasSuggestion: true,
};
const at = (hour, over = {}) => decideReminder({ now: ist(hour), ...ready, ...over });

const tests = {
  'sends once the morning has arrived': () => {
    assert.strictEqual(at(7), 'send');
    assert.strictEqual(at(9), 'send');
  },

  'stays quiet before the hour, in Indian time': () => {
    assert.strictEqual(at(6), 'too-early');
    // 02:00 IST is the previous evening in UTC. Reading the server's clock here
    // would fire a "good morning" notification in the middle of the night.
    assert.strictEqual(at(2), 'too-early');
  },

  'the hour is configurable': () => {
    assert.strictEqual(at(6, { hour: 6 }), 'send');
    assert.strictEqual(at(6, { hour: 8 }), 'too-early');
  },

  'says nothing when the post is already written': () => {
    // The entire message is "it isn't written yet". Sending it anyway is worse
    // than not sending: it teaches people the notification means nothing.
    assert.strictEqual(at(8, { alreadyWritten: true }), 'already-written');
  },

  'does not fire when nobody is allowed to write posts': () => {
    assert.strictEqual(at(8, { recipientCount: 0 }), 'no-authors');
  },

  'does not fire when push is not set up': () => {
    assert.strictEqual(at(8, { pushConfigured: false }), 'push-not-configured');
  },

  'can be switched off entirely': () => {
    assert.strictEqual(at(8, { isEnabled: false }), 'disabled');
  },

  'being switched off beats every other reason': () => {
    // Whoever turns this off wants silence, not a different answer.
    assert.strictEqual(
      at(2, { isEnabled: false, pushConfigured: false, recipientCount: 0 }),
      'disabled'
    );
  },

  'a bad WHATSAPP_REMINDER_HOUR falls back rather than misfiring': () => {
    const saved = process.env.WHATSAPP_REMINDER_HOUR;
    try {
      for (const bad of ['midnight', '-3', '27', '']) {
        process.env.WHATSAPP_REMINDER_HOUR = bad;
        assert.strictEqual(reminderHour(), 7, `"${bad}" should fall back to 7`);
      }
      process.env.WHATSAPP_REMINDER_HOUR = '6';
      assert.strictEqual(reminderHour(), 6);
      // 0 is a real hour and must not be treated as missing.
      process.env.WHATSAPP_REMINDER_HOUR = '0';
      assert.strictEqual(reminderHour(), 0);
    } finally {
      if (saved === undefined) delete process.env.WHATSAPP_REMINDER_HOUR;
      else process.env.WHATSAPP_REMINDER_HOUR = saved;
    }
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}
console.log(failed ? `\n${failed} failing` : `\n${Object.keys(tests).length} passing`);
process.exit(failed ? 1 : 0);
