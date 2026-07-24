export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value < 0 ? `-₹${Math.abs(value).toFixed(2)}` : `₹${value.toFixed(2)}`;
}

// "24 Jul 2026" — short enough to fit a table column, unambiguous unlike
// "07/24/26". Formatted in UTC since these are calendar dates (ledger days,
// delivery dates) rather than exact instants — using the browser's local
// timezone could shift the displayed day backward for anyone west of UTC.
export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
