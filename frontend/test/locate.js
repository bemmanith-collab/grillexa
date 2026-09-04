// The GPS lock loop. Three things it must get right, none of which show up as
// an error when wrong: stop the instant the fix is perfect, keep hunting past
// a merely good one, and actually release the watch when told to.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { captureFix } from '../src/lib/locate.js';

// A fake navigator.geolocation that plays a scripted list of readings, one
// per tick, and records whether clearWatch was called.
function fakeGeo(readings, tickMs = 5) {
  const state = { cleared: false, delivered: 0 };
  // Node 21+ ships a read-only navigator getter, so it has to be redefined
  // rather than assigned.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
    geolocation: {
      watchPosition(onPos) {
        const timer = setInterval(() => {
          if (state.delivered >= readings.length) return;
          const accuracy = readings[state.delivered++];
          onPos({ coords: { latitude: 17.4, longitude: 78.5, accuracy } });
        }, tickMs);
        state.timer = timer;
        return 1;
      },
      clearWatch() {
        state.cleared = true;
        clearInterval(state.timer);
      },
    },
    },
  });
  return state;
}

const checks = {
  'a perfect reading ends the watch at once, before later readings arrive': async () => {
    const geo = fakeGeo([120, 40, 4, 3]);
    const fix = await captureFix({ maxMs: 1000, stallMs: 500 });
    assert.equal(fix.accuracyM, 4);
    assert.equal(fix.locked, true);
    assert.equal(geo.cleared, true);
    assert.equal(geo.delivered, 3, 'stopped listening after the 4m reading');
  },
  'a good reading does not settle early — it keeps hunting to the ceiling and falls back': async () => {
    // Twenty 20m readings, 5ms apart = 100ms of stream. With the ceiling at
    // 60ms the loop must hit the ceiling while still listening, not settle on
    // the first "good" one.
    const geo = fakeGeo(Array(20).fill(20));
    const started = Date.now();
    const fix = await captureFix({ maxMs: 60, stallMs: 500 });
    assert.equal(fix.locked, false);
    assert.equal(fix.accuracyM, 20);
    assert.ok(Date.now() - started >= 55, 'ran to the ceiling');
    assert.ok(geo.delivered > 2, 'was still listening after the first good reading');
    assert.equal(geo.cleared, true);
  },
  'the stall guard returns the best seen when the stream goes quiet': async () => {
    const geo = fakeGeo([90, 30]);
    const fix = await captureFix({ maxMs: 2000, stallMs: 40 });
    assert.equal(fix.accuracyM, 30);
    assert.equal(fix.locked, false);
    assert.equal(geo.cleared, true);
  },
  'abort releases the watch and rejects with AbortError': async () => {
    const geo = fakeGeo(Array(50).fill(50));
    const ctrl = new AbortController();
    const p = captureFix({ signal: ctrl.signal, maxMs: 2000 });
    setTimeout(() => ctrl.abort(), 20);
    await assert.rejects(p, (err) => err.name === 'AbortError');
    assert.equal(geo.cleared, true);
  },
  'best-so-far is reported, not the latest reading': async () => {
    fakeGeo([30, 80, 60]);
    const seen = [];
    await captureFix({ maxMs: 60, stallMs: 500, onProgress: (a) => seen.push(a) });
    assert.deepEqual(seen, [30, 30, 30]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(checks)) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}\n     ${err.message}`);
  }
}
console.log(`\n${Object.keys(checks).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
