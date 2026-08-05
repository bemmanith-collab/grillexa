// "24/07/2026" — the standard Indian date format. Formatted in UTC since
// these are calendar dates (ledger days, delivery dates) rather than exact
// instants — using the browser's local timezone could shift the displayed
// day backward for anyone west of UTC.
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

// "2026-07-30" for <input type="date"> and API params.
//
// The business's day, not the device's. It must match what the server
// considers today (see backend/src/lib/stock.js, same offset) — otherwise a
// laptop set to another timezone disagrees with the ledger: date pickers
// default to yesterday, "Today's Stock" asks for the wrong day, and Stock
// History quietly excludes everything recorded since IST midnight.
//
// India has never observed DST, so a fixed offset is exact, and arithmetic
// avoids depending on locale data being present.
const BUSINESS_UTC_OFFSET_MINUTES = 330;

function businessDayStr(ms) {
  return new Date(ms + BUSINESS_UTC_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

export function todayStr() {
  return businessDayStr(Date.now());
}

export function daysAgoStr(n) {
  return businessDayStr(Date.now() - n * 86400000);
}

// Monday, because that is where the week starts for everyone using this. Both
// of these work off the business day above, so "this week" means the same
// thing here as it does to the ledger.
export function startOfWeekStr() {
  const today = new Date(`${todayStr()}T00:00:00.000Z`);
  // getUTCDay: 0 is Sunday, which belongs to the week that has just ended.
  const backToMonday = (today.getUTCDay() + 6) % 7;
  today.setUTCDate(today.getUTCDate() - backToMonday);
  return today.toISOString().slice(0, 10);
}

export function startOfMonthStr() {
  return `${todayStr().slice(0, 7)}-01`;
}
