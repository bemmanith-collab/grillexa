export function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return value < 0 ? `-₹${Math.abs(value).toFixed(2)}` : `₹${value.toFixed(2)}`;
}
