// Festive days: which one (if any) a date is, and the words for it. Pure, no
// imports — test/festive.js and lib/invoice.js load it straight under Node.
//
// The day is decided in India time, whatever the device's clock zone says, so
// a phone set to another zone still turns festive at midnight in Hyderabad.

const DAYS = {
  '12-24': 'xmas-eve',
  '12-25': 'xmas',
  '12-31': 'nye',
  '01-01': 'ny',
};

export const FESTIVE_KEYS = Object.values(DAYS);

// 'YYYY-MM-DD' in India time.
export function indiaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// The festive day a 'YYYY-MM-DD' date falls on, or null.
export function festiveFor(isoDate) {
  if (!isoDate) return null;
  return DAYS[String(isoDate).slice(5, 10)] || null;
}

// Today's festive day. `?festive=<key>` previews one (and `?festive=off`
// clears it) for the rest of the tab, so a theme can be checked before its day.
export function festiveToday(now = new Date(), search = globalThis.location?.search || '') {
  // The link always wins; storage only carries it to the next page of the tab,
  // and may be missing or blocked (private windows), which must not matter.
  const asked = new URLSearchParams(search).get('festive');
  let preview = asked;
  try {
    if (asked) globalThis.sessionStorage?.setItem('festive-preview', asked);
    else preview = globalThis.sessionStorage?.getItem('festive-preview') || null;
  } catch {
    // no storage: the link alone decides
  }
  if (preview === 'off') return null;
  if (FESTIVE_KEYS.includes(preview)) return preview;
  return festiveFor(indiaDate(now));
}

// Words for each day. `year` is the calendar year of the date in question.
export function festiveCopy(key, year) {
  switch (key) {
    case 'xmas-eve':
      return {
        hello: 'Happy Christmas Eve',
        title: 'Happy Christmas Eve',
        detail: 'Shops get busy tonight. Thank you for every delivery this year.',
        login: 'Happy Christmas Eve! Log in to manage your stores.',
        greet: '🎄 Happy Christmas Eve from Grillexa!',
        greetPlain: 'Happy Christmas Eve from Grillexa!',
      };
    case 'xmas':
      return {
        hello: 'Merry Christmas',
        title: 'Merry Christmas from Grillexa',
        detail: 'Wishing you and your family a joyful day.',
        login: 'Merry Christmas! Log in to manage your stores.',
        greet: '🎄 Merry Christmas from Grillexa!',
        greetPlain: 'Merry Christmas from Grillexa!',
      };
    case 'nye':
      return {
        hello: 'Last day of the year',
        title: 'Thank you for a great year',
        detail: `Last deliveries of the year. See you in ${year + 1}.`,
        login: 'Last day of the year! Log in to manage your stores.',
        greet: `✨ Thank you for this year. See you in ${year + 1}!`,
        greetPlain: `Thank you for this year. See you in ${year + 1}!`,
        year: year + 1,
      };
    case 'ny':
      return {
        hello: 'Happy New Year',
        title: 'A new day, a new beginning',
        detail: 'Happy New Year. Wishing you a hopeful, healthy year ahead.',
        login: 'Happy New Year! A new day, a new beginning.',
        greet: `🌅 Happy New Year ${year}! A new day, a new beginning.`,
        greetPlain: `Happy New Year ${year}! A new day, a new beginning.`,
        year,
      };
    default:
      return null;
  }
}

// The calendar year festiveCopy needs for `key`, seen from `isoDate` (today).
// Only matters when previewing a day early: 1 January seen from November
// belongs to next year, 31 December to this one.
export function festiveYear(key, isoDate) {
  const year = Number(String(isoDate).slice(0, 4));
  const month = String(isoDate).slice(5, 7);
  if (key === 'ny' && month !== '01') return year + 1;
  if (key !== 'ny' && month === '01') return year - 1;
  return year;
}

// The greeting a bill dated `isoDate` carries, or null on an ordinary day.
export function billGreeting(isoDate, { plain = false } = {}) {
  const key = festiveFor(isoDate);
  if (!key) return null;
  const copy = festiveCopy(key, Number(String(isoDate).slice(0, 4)));
  return plain ? copy.greetPlain : copy.greet;
}
