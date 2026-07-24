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
