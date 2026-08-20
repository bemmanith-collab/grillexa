// The business's clock, not the machine's.
//
// Everything time-dependent in a post is a fact about Andhra Pradesh: the weekday in
// the headline, which meal a batch writes about, which season it is. Reading the
// laptop's clock puts THURSDAY on a Friday post for anyone whose machine is set to UTC,
// and at 3am IST it picks dinner because it is still yesterday evening somewhere else.
//
// Same technique and the same offset as frontend/src/utils/date.js, deliberately: India
// has never observed DST, so a fixed offset is exact, and the arithmetic does not depend
// on timezone data being present on the machine.

const BUSINESS_UTC_OFFSET_MINUTES = 330;

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

// Shifted into IST and then read in UTC, so every getUTC* below is an Indian value.
function businessNow(now = Date.now()) {
  return new Date(now + BUSINESS_UTC_OFFSET_MINUTES * 60000);
}

export function businessWeekday(now) {
  return WEEKDAYS[businessNow(now).getUTCDay()];
}

export function businessHour(now) {
  return businessNow(now).getUTCHours();
}

export function businessMonth(now) {
  return businessNow(now).getUTCMonth() + 1;
}

/** "2026-08-20" — the Indian calendar date, used in output filenames. */
export function businessDateStr(now) {
  return businessNow(now).toISOString().slice(0, 10);
}
