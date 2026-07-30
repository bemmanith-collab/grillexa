const { badRequest } = require('./stock');

// Prices are resolved from the product catalogue, never trusted from the
// request body.
//
// GET /products strips `price` for SALES accounts, so a sales user's line
// editor has nothing to prefill and nothing to send back. It arrived as ""
// and `Number('') || 0` turned it into 0 — a real bill saved at ₹0.00 with
// the stock correctly deducted and no error shown to anyone. Revenue simply
// vanished. Nothing rejected a negative price either, so a bill could be
// posted that subtracted from the day's takings.
//
// ADMIN/MANAGER can still override for a negotiated price, but only with a
// finite, non-negative number. SALES always gets the catalogue price.
async function resolveLines(tx, lines, role) {
  const ids = [...new Set(lines.map((l) => Number(l.productId)))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw badRequest('Each line needs a valid productId');
  }

  const products = await tx.product.findMany({ where: { id: { in: ids } } });
  const byId = new Map(products.map((p) => [p.id, p]));

  return lines.map((l) => {
    const productId = Number(l.productId);
    const product = byId.get(productId);
    if (!product) throw badRequest(`Product ${productId} no longer exists`);

    // Quantity is an Int in the schema; a fractional one reaches Prisma and
    // comes back as a 500 naming the model's internals.
    const quantity = Number(l.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw badRequest(`${product.name}: quantity must be a whole number greater than zero`);
    }

    let unitPrice = product.price;
    const supplied = l.unitPrice;
    const wantsOverride = supplied !== undefined && supplied !== null && supplied !== '';
    if (wantsOverride && role !== 'SALES') {
      const n = Number(supplied);
      if (!Number.isFinite(n) || n < 0) {
        throw badRequest(`${product.name}: unit price must be a number of zero or more`);
      }
      unitPrice = n;
    }

    return { ...l, productId, quantity, unitPrice, product };
  });
}

module.exports = { resolveLines };
