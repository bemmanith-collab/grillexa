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

// What each day actually feels like in a household here.
//
// Without this the prompt only ever receives a weekday name, and a name carries
// nothing: Saturday and Wednesday read identically, so every post suggests the
// same slow walk after dinner. A person writing these would never do that —
// they know Saturday is the day nobody is rushing and Wednesday is the day
// everyone is flagging, and they would write differently for each.
export const DAY_MOOD = {
  Monday: 'Back to it. School and work start again, the markets are restocked, and everyone is deciding what this week is going to look like.',
  Tuesday: 'The quiet middle of the week. Nothing special about it, which makes it the easiest day to change one small thing without anybody noticing.',
  Wednesday: 'Midweek. Energy dips, cooking gets shortcut, and this is the evening good intentions quietly collapse.',
  Thursday: 'Nearly there. People are tired and counting down, and the cooking is getting repetitive by now.',
  Friday: 'The week is ending. There is relief in the house, people stay up later than usual, and the evening feels different from the four before it.',
  Saturday: 'The free day. Nobody is rushing anywhere, the family is around, there is time to cook properly and time to sit. The one day of the week that has room in it.',
  Sunday: 'The big meal, and often guests. Slow morning, heavy afternoon, and by evening a quiet flatness as Monday comes into view.',
};

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

export function moodFor(day) {
  return DAY_MOOD[day];
}
