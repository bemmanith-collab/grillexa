// Slice colours for the Product mix doughnut.
//
// What matters here is that a product's colour is a property of the product,
// not of where it landed in a list sorted by amount. Indexing the palette by
// array position meant every filter change repainted the chart, so the same
// product was blue in one range and orange in the next and the two doughnuts
// could not be compared.
//
// Run: npm test (from frontend/).

import assert from 'node:assert/strict';
import { sliceColours, SERIES, OTHER } from '../src/lib/seriesColour.js';

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n     ${err.message}`);
    process.exitCode = 1;
  }
}

const row = (id) => ({ id, label: `Product ${id}`, amount: 100 });

check('a product keeps its colour when the order changes', () => {
  const week = [row(3), row(11), row(7)];
  const month = [row(7), row(3), row(11)];
  const byId = (rows) =>
    Object.fromEntries(rows.map((r, i) => [r.id, sliceColours(rows)[i]]));
  assert.deepEqual(byId(week), byId(month));
});

check('a product keeps its colour when the slice above it is filtered out', () => {
  const before = [row(3), row(11), row(7)];
  const after = [row(3), row(7)];
  assert.equal(sliceColours(before)[2], sliceColours(after)[1]);
});

check('no two slices in one chart share a colour', () => {
  // Ids 1 and 9 both prefer slot 1; the second one takes the next free hue.
  const colours = sliceColours([1, 9, 17, 2, 10, 4, 6, 8].map(row));
  assert.equal(new Set(colours).size, 8);
});

check('Other is grey and never one of the eight', () => {
  const colours = sliceColours([row(1), row(2), { id: null, label: 'Other (4)' }]);
  assert.equal(colours[2], OTHER);
  assert.ok(!SERIES.includes(OTHER));
});

check('more rows than slots terminates', () => {
  const colours = sliceColours(Array.from({ length: 20 }, (_, i) => row(i + 1)));
  assert.equal(colours.length, 20);
  assert.ok(colours.every((c) => SERIES.includes(c)));
});
