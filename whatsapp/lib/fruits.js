// What fruit is actually in the market this month.
//
// "Eat seasonal fruit" is advice nobody acts on; "sitaphal is in the market and
// costs nothing right now" is. The list is local to Andhra Pradesh and
// Telangana, because that is who reads this — a national fruit calendar would
// name things nobody here sees.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { businessMonth } from './clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { fruits } = JSON.parse(fs.readFileSync(path.join(here, 'fruits.json'), 'utf8'));

// Ranges wrap the year end: Guava is [8, 2], meaning August through February.
function inSeason(fruit, month) {
  const [from, to] = fruit.months;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

export function fruitsInSeason(now) {
  const month = businessMonth(now);
  return fruits.filter((fruit) => inSeason(fruit, month));
}

/**
 * A few of them, not all — a list of twelve fruits is a catalogue, and nobody
 * buys from a catalogue. The year-round ones are dropped when there is anything
 * genuinely seasonal to name, since banana and papaya are always true and
 * therefore never interesting.
 */
export function pickSeasonalFruits(now, count = 4) {
  const all = fruitsInSeason(now);
  const seasonal = all.filter((fruit) => fruit.months[0] !== 1 || fruit.months[1] !== 12);
  const pool = seasonal.length >= count ? seasonal : all;
  return [...pool].sort(() => Math.random() - 0.5).slice(0, count);
}
