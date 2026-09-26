// The idle gate every poll checks before touching the network.
//
// This is a cost control, not a feature: Neon bills by the hour its compute is
// awake, so a poll left running at an empty room is a full day of compute for
// nothing. What is checked here is the boundary in both directions — too eager
// and the chat stops updating while somebody is reading it, too lazy and the
// saving never happens.
//
// Run: npm test (from frontend/). No DOM, no network.
import assert from 'assert';
import { isIdle, markActive, IDLE_AFTER_MS } from '../src/lib/userIdle.js';

const tests = {
  'somebody who just touched the app is not idle': () => {
    markActive();
    assert.strictEqual(isIdle(), false);
  },

  'still not idle a moment before the threshold': () => {
    markActive();
    assert.strictEqual(isIdle(Date.now() + IDLE_AFTER_MS - 1000), false);
  },

  'idle once the threshold passes': () => {
    markActive();
    assert.strictEqual(isIdle(Date.now() + IDLE_AFTER_MS + 1000), true);
  },

  'coming back resets it': () => {
    markActive();
    assert.strictEqual(isIdle(Date.now() + IDLE_AFTER_MS + 1000), true);
    markActive();
    assert.strictEqual(isIdle(), false);
  },

  'the window matches what Neon sleeps on': () => {
    // Shorter and the database never sleeps; longer and we pay the difference.
    assert.strictEqual(IDLE_AFTER_MS, 5 * 60 * 1000);
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
