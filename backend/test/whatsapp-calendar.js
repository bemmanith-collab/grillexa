// The 30-day calendar is ninety rows of copy in a JSON file and one small map
// joining the channel's three times of day to the generator's content types.
// Both are the kind of thing that rots quietly: a strategy file edited by hand
// until a draft is empty, or a type renamed in the generator's registry so that
// Generate Full Post breaks for afternoons only, and nobody finds out until
// somebody presses it.
//
// So this checks the seed's input and the join, and nothing else. No database,
// no network, no API key, no post generated.
//
// Run: npm test (from backend/).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const STRATEGY_PATH = path.join(__dirname, '..', '..', 'whatsapp', 'strategy', '30-day.json');
const GENERATOR_DIR = path.join(__dirname, '..', '..', 'whatsapp', 'lib');

const SLOTS = ['morning', 'afternoon', 'night'];
const DAYS = 30;

const strategy = () => JSON.parse(fs.readFileSync(STRATEGY_PATH, 'utf8'));

const tests = {
  'the strategy file is where the seed expects it': () => {
    // prisma/seedCalendar.js walks ../../whatsapp/strategy; this test sits one
    // level deeper. If either directory moves, this fails before the seed does.
    assert.ok(fs.existsSync(STRATEGY_PATH), `expected the strategy at ${STRATEGY_PATH}`);
  },

  'there are thirty days, numbered one to thirty with no gaps': () => {
    const days = strategy().days;
    assert.strictEqual(days.length, DAYS, `expected ${DAYS} days, found ${days.length}`);
    days.forEach((day, i) => {
      assert.strictEqual(day.day, i + 1, `day at position ${i} is numbered ${day.day}`);
    });
  },

  'every day has all three times of day': () => {
    for (const day of strategy().days) {
      for (const slot of SLOTS) {
        assert.ok(day.posts?.[slot], `day ${day.day} has no ${slot} post`);
      }
    }
  },

  'nothing the schema requires is blank': () => {
    // theme and draft are NOT NULL. A cell that seeded with an empty string
    // renders as a blank card nobody can act on, which is worse than a crash.
    for (const day of strategy().days) {
      for (const slot of SLOTS) {
        const post = day.posts[slot];
        assert.ok(post.theme?.trim(), `day ${day.day} ${slot}: empty theme`);
        assert.ok(post.draft?.trim(), `day ${day.day} ${slot}: empty draft`);
      }
    }
  },

  'no post is over a hundred words': () => {
    // The brief. A draft that drifts long stops being a WhatsApp post and the
    // generator, handed it as a topic, writes something longer still.
    for (const day of strategy().days) {
      for (const slot of SLOTS) {
        const words = day.posts[slot].draft.trim().split(/\s+/).length;
        assert.ok(words <= 100, `day ${day.day} ${slot} is ${words} words`);
      }
    }
  },

  'the optional fields are absent or real, never empty strings': () => {
    // The seed normalises '' to null. If the file itself carries empty strings
    // the calendar shows an empty 💬 line, so they are wrong here too.
    for (const day of strategy().days) {
      for (const slot of SLOTS) {
        for (const field of ['engagementQuestion', 'imageIdea']) {
          const value = day.posts[slot][field];
          if (value !== undefined && value !== null) {
            assert.ok(
              typeof value === 'string' && value.trim(),
              `day ${day.day} ${slot}: ${field} is present but blank`
            );
          }
        }
      }
    }
  },

  'the brand voice rules the channel enforces are not broken by the seed': async () => {
    // prompts/brand.md forbids these outright, and the seeded copy goes out
    // under the same name as everything the generator writes. Beef and pork are
    // the two that lose readers permanently; the rest are house style.
    const forbidden = [
      /\bbeef\b/i,
      /\bpork\b/i,
      /\bsuperfood\b/i,
      /\bdetox\b/i,
      /\bgame.changer\b/i,
      /\bboost your immunity\b/i,
      /\bjunk food\b/i,
    ];
    for (const day of strategy().days) {
      for (const slot of SLOTS) {
        const post = day.posts[slot];
        const text = [post.theme, post.draft, post.engagementQuestion, post.imageIdea]
          .filter(Boolean)
          .join('\n');
        for (const pattern of forbidden) {
          assert.ok(
            !pattern.test(text),
            `day ${day.day} ${slot} contains ${pattern} — brand.md forbids it`
          );
        }
      }
    }
  },

  'every time of day maps to a content type the generator still has': async () => {
    const { SLOT_TO_TYPE } = require('../src/routes/whatsapp');
    const options = await import(pathToFileURL(path.join(GENERATOR_DIR, 'options.js')).href);

    assert.deepStrictEqual(
      Object.keys(SLOT_TO_TYPE).sort(),
      [...SLOTS].sort(),
      'the route maps a different set of times of day than the strategy file uses'
    );

    for (const [slot, mapped] of Object.entries(SLOT_TO_TYPE)) {
      const spec = options.TYPES[mapped.type];
      assert.ok(spec, `${slot} maps to type "${mapped.type}", which no longer exists`);

      if (mapped.slot) {
        assert.ok(
          options.SLOTS[mapped.slot],
          `${slot} names meal "${mapped.slot}", which no longer exists`
        );
        assert.ok(
          spec.slotted,
          `${slot} passes a meal to type "${mapped.type}", which does not take one`
        );
      } else {
        assert.ok(
          !spec.slotted,
          `${slot} maps to slotted type "${mapped.type}" but passes no meal`
        );
      }
    }
  },
};

(async () => {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (err) {
      failed += 1;
      console.error(`  FAIL  ${name}\n        ${err.message}`);
    }
  }
  const passed = Object.keys(tests).length - failed;
  console.log(`\n${passed} passing${failed ? `, ${failed} failing` : ''}`);
  if (failed) process.exitCode = 1;
})();
