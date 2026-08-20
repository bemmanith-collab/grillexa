// What to post on a given day.
//
// The channel is posted to every day, and choosing a type from nine every
// morning is a decision nobody needs to make at 6am. It is also the wrong shape
// for readers: a week with a repeating rhythm gets anticipated — people start
// waiting for the Sunday one — while a random type each day is just noise
// arriving at breakfast.
//
// So the week has a fixed shape, and each day's slot is chosen for when it is
// read rather than to spread the types evenly.
//
// product and customer are deliberately absent. Both are worth posting
// occasionally and neither belongs on a weekly rhythm — a channel that sells
// every week stops being read. Pick them by hand, in place of a day's post, no
// more than about once a fortnight.

import { businessWeekday } from './clock.js';

export const ROTA = {
  // The week's idea, stated plainly, while people are still deciding what the
  // week looks like.
  Monday: { type: 'morning' },

  // Clears the belief standing in the way of Monday's idea.
  Tuesday: { type: 'myth' },

  // Midweek is where good intentions quietly collapse, and it collapses at
  // dinner rather than at breakfast.
  Wednesday: { type: 'meal', slot: 'dinner' },

  // Three days in: turn the idea into something with a checkbox against it.
  Thursday: { type: 'habit' },

  // The week is done. Nothing to instruct, nothing to fix.
  Friday: { type: 'evening' },

  // Market day. What is fresh and cheap this week, while people are buying.
  Saturday: { type: 'seasonal' },

  // The most-read post of the week. Never moralise here.
  Sunday: { type: 'cheat' },
};

/** What today's post should be. A suggestion — every part of it can be overridden. */
export function postForToday(now) {
  const day = businessWeekday(now);
  return { day, ...ROTA[day] };
}
