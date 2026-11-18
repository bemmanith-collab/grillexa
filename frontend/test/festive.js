// node test/festive.js
import assert from 'node:assert';
import { indiaDate, festiveFor, festiveToday, festiveCopy, festiveYear, billGreeting } from '../src/lib/festive.js';

const tests = {
  'the day turns at midnight India time, not UTC': () => {
    // 23 Dec 18:30 UTC is 24 Dec 00:00 in India.
    assert.strictEqual(indiaDate(new Date('2026-12-23T18:29:59Z')), '2026-12-23');
    assert.strictEqual(indiaDate(new Date('2026-12-23T18:30:00Z')), '2026-12-24');
    assert.strictEqual(festiveToday(new Date('2026-12-23T18:30:00Z'), ''), 'xmas-eve');
    assert.strictEqual(festiveToday(new Date('2026-12-23T18:29:59Z'), ''), null);
  },

  'the four days, and nothing either side': () => {
    assert.strictEqual(festiveFor('2026-12-24'), 'xmas-eve');
    assert.strictEqual(festiveFor('2026-12-25'), 'xmas');
    assert.strictEqual(festiveFor('2026-12-31'), 'nye');
    assert.strictEqual(festiveFor('2027-01-01'), 'ny');
    for (const d of ['2026-12-23', '2026-12-26', '2026-12-30', '2027-01-02', '', null]) {
      assert.strictEqual(festiveFor(d), null, String(d));
    }
  },

  'New Year words carry the right year': () => {
    assert.strictEqual(festiveCopy('nye', 2026).year, 2027);
    assert.strictEqual(festiveCopy('ny', 2027).year, 2027);
    assert.strictEqual(billGreeting('2026-12-31'), '✨ Thank you for this year. See you in 2027!');
    assert.strictEqual(billGreeting('2027-01-01', { plain: true }), 'Happy New Year 2027! A new day, a new beginning.');
  },

  'the year is right on the day and when previewed early': () => {
    assert.strictEqual(festiveYear('ny', '2027-01-01'), 2027);
    assert.strictEqual(festiveYear('ny', '2026-11-18'), 2027);
    assert.strictEqual(festiveYear('nye', '2026-12-31'), 2026);
    assert.strictEqual(festiveYear('nye', '2026-11-18'), 2026);
    assert.strictEqual(festiveYear('xmas', '2027-01-05'), 2026);
    assert.strictEqual(festiveCopy('ny', festiveYear('ny', '2026-11-18')).year, 2027);
  },

  'a bill on an ordinary day gets no greeting': () => {
    assert.strictEqual(billGreeting('2026-11-18'), null);
  },

  'the PDF greeting has nothing the PDF font cannot draw': () => {
    for (const d of ['2026-12-24', '2026-12-25', '2026-12-31', '2027-01-01']) {
      assert.match(billGreeting(d, { plain: true }), /^[\x20-\x7E]+$/, d);
    }
  },

  'a preview link picks a day, and "off" clears it': () => {
    const ordinary = new Date('2026-11-18T06:00:00Z');
    assert.strictEqual(festiveToday(ordinary, '?festive=nye'), 'nye');
    assert.strictEqual(festiveToday(new Date('2026-12-25T06:00:00Z'), '?festive=off'), null);
    assert.strictEqual(festiveToday(ordinary, '?festive=bogus'), null);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n${err.stack}`);
  }
}
console.log(failed ? `${failed} failing` : 'all checks passed');
if (failed) process.exit(1);
