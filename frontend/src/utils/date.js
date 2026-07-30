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

// "2026-07-30" for <input type="date"> and API params. The mirror image of
// formatDate above: that formats a stored calendar day, this asks what day it
// is *here*, so it must read local fields. toISOString() converts the current
// instant to UTC, which east of UTC (IST is +5:30) returns yesterday until
// mid-morning — enough to file an early delivery under the wrong ledger day.
function localDayStr(d) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayStr() {
  return localDayStr(new Date());
}

export function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDayStr(d);
}
