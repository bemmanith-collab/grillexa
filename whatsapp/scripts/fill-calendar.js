#!/usr/bin/env node

// Fills this year's festival dates into lib/calendar.json.
//
// Most Indian festivals are lunisolar — Vinayaka Chavithi is Bhadrapada Shukla
// Chaturthi, Deepavali is the Amavasya of Kartika — so their dates are moon
// phases resolved against sunrise at a place, not entries anyone can recall.
// Google publishes a calendar that computes them properly, and it has a public
// ICS feed needing no key and no account.
//
// It writes into the file rather than fetching at generation time, on purpose:
// the dates stay reviewable in a diff, a post never waits on a network call, and
// a feed outage cannot quietly change what the channel says. Run it once a year,
// read the diff, commit it.
//
//   npm run calendar:fill              # this year, writes the file
//   npm run calendar:fill -- --dry-run # show what it would change
//   npm run calendar:fill -- --year 2027

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FEED = 'https://calendar.google.com/calendar/ical/'
  + 'en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, '..', 'lib', 'calendar.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const yearArg = args[args.indexOf('--year') + 1];
const year = /^\d{4}$/.test(yearArg || '') ? yearArg : String(new Date().getFullYear());

// Names vary between sources ("Diwali/Deepavali", "Ganesh Chaturthi"), so match
// on a flattened form rather than exactly.
const normalise = (value) => value.toLowerCase().replace(/[^a-z]/g, '');

function parseFeed(ics) {
  const events = [];
  for (const chunk of ics.split('BEGIN:VEVENT').slice(1)) {
    const date = chunk.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
    const summary = chunk.match(/SUMMARY:(.*)/);
    if (!date || !summary) continue;
    events.push({
      date: `${date[1]}-${date[2]}-${date[3]}`,
      name: summary[1].trim(),
    });
  }
  return events;
}

function matchFor(occasion, events) {
  const wanted = [occasion.name, ...(occasion.aliases ?? [])].map(normalise);
  // Earliest first, so a multi-day festival lands on its first day — which is
  // the one worth posting on.
  const hits = events
    .filter((event) => {
      const flat = normalise(event.name);
      return wanted.some((name) => flat === name || flat.includes(name));
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return hits[0]?.date ?? null;
}

const ics = await fetch(FEED).then((res) => {
  if (!res.ok) throw new Error(`the holiday feed returned ${res.status}`);
  return res.text();
});

const events = parseFeed(ics).filter((event) => event.date.startsWith(year));
if (!events.length) {
  console.error(`No ${year} entries in the feed. It usually covers a few years either side of today.`);
  process.exit(1);
}

const calendar = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const filled = [];
const kept = [];
const missed = [];

for (const occasion of calendar.occasions) {
  if (occasion.recurring) continue; // fixed dates need nobody's help
  occasion.dates ??= {};

  if (occasion.dates[year]) {
    kept.push(`${occasion.name} — already ${occasion.dates[year]}`);
    continue;
  }

  const date = matchFor(occasion, events);
  if (date) {
    occasion.dates[year] = date;
    filled.push(`${occasion.name} — ${date}`);
  } else {
    missed.push(occasion.name);
  }
}

const report = (title, rows, colour = '') => {
  if (!rows.length) return;
  console.log(`\n${colour}${title}[0m`);
  for (const row of rows) console.log(`  ${row}`);
};

report(`Filled in for ${year}`, filled, '[32m');
report('Left alone (already set)', kept, '[2m');
report(
  'Not in the national feed — set these by hand',
  missed.map((name) => `${name}  →  "dates": { "${year}": "${year}-MM-DD" }`),
  '[33m'
);

if (missed.length) {
  console.log('\n[2m  Bathukamma and Bonalu are Telangana festivals and are not in a national[0m');
  console.log('[2m  calendar. A local panchangam or a printed calendar has them.[0m');
}

if (!filled.length) {
  console.log('\nNothing to change.');
} else if (dryRun) {
  console.log('\n[2mDry run — nothing written.[0m');
} else {
  fs.writeFileSync(FILE, `${JSON.stringify(calendar, null, 2)}\n`, 'utf8');
  console.log(`\n[32mWrote ${filled.length} dates to lib/calendar.json.[0m`);
  console.log('[2mRead the diff before committing — these go out to customers.[0m');
}
