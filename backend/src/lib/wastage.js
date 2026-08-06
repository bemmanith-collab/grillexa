// End-of-shift wastage: the rules, kept out of the route so they can be
// checked without a database (see backend/test/wastage.js).
//
// This is HQ wastage — what a salesperson counts as spoiled at the end of a
// run. It is NOT DailyStockEntry.wastage, which is stock that spoiled inside a
// store and feeds the stock ledger and every existing wastage report. Nothing
// here touches adjustStock, and the two figures are never added together. See
// the note on the Wastage model in schema.prisma.

// Matches the reasons offered in the dashboard modal. A per-entry row can
// carry a reason where the ledger counter could not — there was no row to hang
// one on — which is most of why this table exists at all.
const REASONS = ['SPOILED', 'DAMAGED', 'EXPIRED', 'OTHER'];

// The modal sends every product it listed, most of them blank. A blank is not
// an error: it means "none of this spoiled". Only rows with a quantity are
// kept, so an empty submission is caught as "nothing counted" rather than
// writing dozens of zero rows.
//
// Returns { lines } or { error }. Quantities are whole units — a fractional
// count would clear a Number.isFinite guard and then fail inside the
// transaction against an Int column, which is how the per-store wastage form
// used to return a bare 500.
function validateLines(rawLines, productIds) {
  if (!Array.isArray(rawLines)) return { error: 'lines must be an array' };

  const lines = [];
  const seen = new Set();
  for (const raw of rawLines) {
    const productId = Number(raw?.productId);
    if (!productIds.has(productId)) {
      return { error: `Product ${raw?.productId} does not exist` };
    }

    // '' and null are "not counted". 0 is too — someone tabbing through the
    // list types nothing, and a 0 row is noise, not data.
    const blank = raw.quantity === '' || raw.quantity === null || raw.quantity === undefined;
    if (blank) continue;

    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity)) {
      return { error: 'Quantity must be a whole number of units' };
    }
    if (quantity === 0) continue;
    if (quantity < 0) {
      return { error: 'Quantity cannot be negative' };
    }
    // Deliberately no upper bound. The app tracks stock in stores, not at HQ,
    // so there is no "available quantity" here to check against — and the
    // ledger's running balance is meaningless by design (stock is not booked
    // in before it is billed). A cap would refuse a true count.

    const reason = raw.reason || 'OTHER';
    if (!REASONS.includes(reason)) {
      return { error: `Reason must be one of ${REASONS.join(', ')}` };
    }

    // One row per product per submission: two rows for the same product would
    // both be written and the summary would read as double.
    if (seen.has(productId)) {
      return { error: 'The same product appears twice' };
    }
    seen.add(productId);

    lines.push({ productId, quantity, reason });
  }

  if (lines.length === 0) {
    return { error: 'Enter a quantity for at least one product' };
  }
  return { lines };
}

// Rows -> one entry per product, with the reason split kept rather than
// flattened: "40 units wasted" and "40 units wasted, 38 of them expired" are
// different problems, and the second one is the reason anybody asked.
function summarize(rows) {
  const byProduct = new Map();
  for (const row of rows) {
    const key = row.productId;
    if (!byProduct.has(key)) {
      byProduct.set(key, {
        productId: key,
        product: row.product?.name,
        quantity: 0,
        value: 0,
        byReason: {},
      });
    }
    const bucket = byProduct.get(key);
    bucket.quantity += row.quantity;
    // At cost, not at the selling price — the same rule the store-wastage
    // figures use (lib/analytics.js). It is stock the business paid for and
    // never sold, so what it cost is what it lost.
    bucket.value += row.quantity * (row.product?.costPrice || 0);
    bucket.byReason[row.reason] = (bucket.byReason[row.reason] || 0) + row.quantity;
  }

  const products = [...byProduct.values()].sort((a, b) => b.value - a.value);
  return {
    products,
    totalQuantity: products.reduce((sum, p) => sum + p.quantity, 0),
    totalValue: products.reduce((sum, p) => sum + p.value, 0),
  };
}

module.exports = { REASONS, validateLines, summarize };
