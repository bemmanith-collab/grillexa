// The planner decides what a salesperson reads when they open the app and
// what a customer reads on the bottom of their bill. Two things have to hold:
// a day's message is the same all day (the old widget picked at random on
// every request, which now means every five-minute dashboard refresh), and
// nothing off-topic sneaks in from a quote API that has no idea what this
// business sells.
//
// Run: npm test (from backend/). No database, no network.
const assert = require('assert');

const { pickForDay, isRelevant, toSuggestions } = require('../src/lib/wisdom');

const pool = [
  { id: 1, text: 'One', author: 'A', audience: 'STAFF', showOn: null, active: true },
  { id: 2, text: 'Two', author: 'A', audience: 'STAFF', showOn: null, active: true },
  { id: 3, text: 'Three', author: 'A', audience: 'STAFF', showOn: null, active: true },
  { id: 4, text: 'Customer one', author: 'G', audience: 'CUSTOMER', showOn: null, active: true },
];

const tests = {
  'the same day gives the same message every time it is asked': () => {
    const first = pickForDay(pool, '2026-08-06', 'STAFF');
    for (let i = 0; i < 20; i += 1) {
      assert.strictEqual(pickForDay(pool, '2026-08-06', 'STAFF').id, first.id);
    }
  },

  'the pick does not depend on the order the database returned rows in': () => {
    const shuffled = [pool[2], pool[0], pool[3], pool[1]];
    assert.strictEqual(
      pickForDay(shuffled, '2026-08-06', 'STAFF').id,
      pickForDay(pool, '2026-08-06', 'STAFF').id
    );
  },

  'different days do not all land on the same line': () => {
    const week = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
    const picked = new Set(week.map((d) => pickForDay(pool, d, 'STAFF').id));
    assert.ok(picked.size > 1, 'every day of the week showed the same message');
  },

  'each audience is served from its own set': () => {
    assert.strictEqual(pickForDay(pool, '2026-08-06', 'CUSTOMER').id, 4);
    assert.notStrictEqual(pickForDay(pool, '2026-08-06', 'STAFF').audience, 'CUSTOMER');
  },

  'a message pinned to the day beats the rotation': () => {
    const withPinned = [
      ...pool,
      { id: 9, text: 'Republic Day', author: 'A', audience: 'STAFF', showOn: '2026-08-06', active: true },
    ];
    assert.strictEqual(pickForDay(withPinned, '2026-08-06', 'STAFF').id, 9);
    // …and only on that day.
    assert.notStrictEqual(pickForDay(withPinned, '2026-08-07', 'STAFF').id, 9);
  },

  'a switched-off message is never shown': () => {
    const off = pool.map((m) => ({ ...m, active: m.audience === 'CUSTOMER' }));
    assert.strictEqual(pickForDay(off, '2026-08-06', 'STAFF'), null);
  },

  'an empty planner is null, not a crash': () => {
    assert.strictEqual(pickForDay([], '2026-08-06', 'STAFF'), null);
  },

  'a pinned message is used even when nothing else is in the pool': () => {
    const only = [{ id: 5, text: 'Just today', author: 'A', audience: 'STAFF', showOn: '2026-08-06', active: true }];
    assert.strictEqual(pickForDay(only, '2026-08-06', 'STAFF').id, 5);
    assert.strictEqual(pickForDay(only, '2026-08-07', 'STAFF'), null);
  },

  'a quote about food or the body is on topic': () => {
    assert.ok(isRelevant('Let food be thy medicine.'));
    assert.ok(isRelevant('A healthy outside starts from the inside.'));
    assert.ok(isRelevant('Eat fresh, feel strong.'));
  },

  'generic motivation is not': () => {
    assert.ok(!isRelevant('Be the change you wish to see in the world.'));
    assert.ok(!isRelevant('Success is not final, failure is not fatal.'));
  },

  'a near-miss word does not smuggle a quote in': () => {
    // "create" contains "ate", "wealthy" contains "health" — substring
    // matching would pass both of these.
    assert.ok(!isRelevant('Create the future you want.'));
    assert.ok(!isRelevant('A wealthy man is one who is content.'));
  },

  'a quote too long for a bill footer is rejected': () => {
    assert.ok(!isRelevant(`Food ${'x'.repeat(200)}`));
  },

  'suggestions drop what is already in the planner, and duplicates of itself': () => {
    const rows = [
      { q: 'Let food be thy medicine.', a: 'Hippocrates' },
      { q: 'Let food be thy medicine.', a: 'Hippocrates' },
      { q: 'Be the change.', a: 'Gandhi' },
      { q: 'Eat well, live well.', a: 'Unknown' },
    ];
    const out = toSuggestions(rows, ['let food be thy medicine.']);
    assert.deepStrictEqual(out.map((s) => s.text), ['Eat well, live well.']);
  },

  'suggestions read whichever field name the API used': () => {
    const out = toSuggestions([{ quote: 'Fresh food, clear head.', author: 'A' }]);
    assert.strictEqual(out[0].text, 'Fresh food, clear head.');
    assert.strictEqual(out[0].author, 'A');
  },

  'a quote with no author is attributed rather than left blank': () => {
    const out = toSuggestions([{ q: 'Eat your greens.' }]);
    assert.strictEqual(out[0].author, 'Unknown');
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
