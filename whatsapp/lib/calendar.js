// What day it is in the Indian calendar, not just which weekday.
//
// A festival post written on an ordinary template reads badly, and an ordinary
// post published on Deepavali reads worse. This looks up the date and hands the
// prompt the occasion plus a note on how to handle it — including what not to
// say, which is the half that matters on a channel read by families of several
// religions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { businessDateStr } from './clock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const { occasions } = JSON.parse(fs.readFileSync(path.join(here, 'calendar.json'), 'utf8'));

/** Every occasion on a given YYYY-MM-DD, usually none and occasionally two. */
export function occasionsOn(dateStr) {
  const [year, month, day] = dateStr.split('-');
  const monthDay = `${month}-${day}`;

  return occasions.filter((entry) => {
    if (entry.recurring) return entry.recurring === monthDay;
    // Movable festivals only count once someone has filled in this year's date.
    // An unfilled year is not an error — the day just passes as an ordinary one,
    // which is the safe way round.
    return entry.dates?.[year] === dateStr;
  });
}

export function occasionToday(now) {
  return occasionsOn(businessDateStr(now));
}

export function findOccasion(name) {
  const wanted = name.trim().toLowerCase();
  return occasions.find((entry) => entry.name.toLowerCase() === wanted)
    ?? occasions.find((entry) => entry.name.toLowerCase().startsWith(wanted));
}

export function allOccasions() {
  return occasions;
}

/**
 * Movable festivals with no date for this year — they will be silently skipped.
 *
 * Surfaced in --list because the failure is invisible otherwise: Deepavali comes
 * and goes and the channel posts an ordinary Tuesday post, and nobody finds out
 * until a customer mentions it.
 */
export function unscheduled(year = businessDateStr().slice(0, 4)) {
  return occasions
    .filter((entry) => !entry.recurring && !entry.dates?.[year])
    .map((entry) => entry.name);
}

/** The next N days, each with its weekday and any occasion — for the panel's day picker. */
export function upcoming(days = 14, now = Date.now()) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const dateStr = businessDateStr(now + i * 86400000);
    // Built from the date string rather than a local Date so the weekday cannot
    // disagree with the date shown beside it.
    const weekday = new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('en-GB', {
      weekday: 'long', timeZone: 'UTC',
    });
    const label = new Date(`${dateStr}T00:00:00.000Z`).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
    out.push({
      date: dateStr,
      weekday,
      label: `${weekday} ${label}`,
      occasions: occasionsOn(dateStr).map((entry) => entry.name),
    });
  }
  return out;
}
