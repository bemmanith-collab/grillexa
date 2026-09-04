// The zone list is fixed, and the check that keeps it fixed lives here: one
// accepted typo becomes a fifth zone in every filter on the Stores page.

const assert = require('assert');
const { readZone, ZONES } = require('../src/lib/storeZones');

const tests = {
  'an absent key is left out, so a rename does not clear the zone': () => {
    assert.deepStrictEqual(readZone({ name: 'X' }), { ok: true, data: {} });
  },
  'every listed zone is accepted': () => {
    for (const z of ZONES) assert.deepStrictEqual(readZone({ zone: z }).data, { zone: z });
  },
  'blank and null clear it': () => {
    assert.deepStrictEqual(readZone({ zone: '' }).data, { zone: null });
    assert.deepStrictEqual(readZone({ zone: null }).data, { zone: null });
  },
  'anything off the list is refused': () => {
    for (const bad of ['Zone 5', 'zone 1', ' Zone 1', 42]) {
      const r = readZone({ zone: bad });
      assert.strictEqual(r.ok, false, `accepted ${JSON.stringify(bad)}`);
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
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}
console.log(`\n${Object.keys(tests).length - failed} passing${failed ? `, ${failed} failing` : ''}`);
if (failed) process.exitCode = 1;
