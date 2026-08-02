// The login greeting. Everyone gets one now, so a wrong boundary here is the
// first thing every member of staff sees every morning — and nothing would
// report it, because a greeting cannot fail, only be wrong.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { greetingFor } from '../src/lib/greeting.js';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

check('greets by first name only', () => {
  assert.equal(greetingFor('Vijay Kumar', 9), 'Good morning, Vijay');
});

check('the day divides at noon and at five', () => {
  assert.equal(greetingFor('Vijay', 0), 'Good morning, Vijay');
  assert.equal(greetingFor('Vijay', 11), 'Good morning, Vijay');
  assert.equal(greetingFor('Vijay', 12), 'Good afternoon, Vijay');
  assert.equal(greetingFor('Vijay', 16), 'Good afternoon, Vijay');
  assert.equal(greetingFor('Vijay', 17), 'Good evening, Vijay');
  assert.equal(greetingFor('Vijay', 23), 'Good evening, Vijay');
});

// A half-rendered "Good morning, " is worse than going straight to the app,
// so the caller relies on an empty string to mean "skip the card".
check('no name means no greeting', () => {
  for (const empty of ['', '   ', null, undefined]) {
    assert.equal(greetingFor(empty, 9), '', `expected no greeting for ${JSON.stringify(empty)}`);
  }
});

check('a padded or double-spaced name still works', () => {
  assert.equal(greetingFor('  Rajesh   N  ', 13), 'Good afternoon, Rajesh');
});

if (!process.exitCode) console.log('\nall checks passed');
