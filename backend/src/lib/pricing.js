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
// finite, non-negative number.
//
// billedPrices is what this bill already charged for a product, passed in by
// an edit. Correcting a phone number on a bill must not silently change what
// the customer was charged: the bill keeps its number, so a printed copy in
// someone's hand has to keep matching it. Without this, a SALES edit repriced
// every line to the catalogue and quietly erased a negotiated discount. It's
// read from the saved bill, never from the request, so it can't be used to
// smuggle a price past the SALES rule. A product that wasn't on the bill
// before is new, and prices from the catalogue.
async function resolveLines(tx, lines, role, billedPrices = new Map()) {
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

    let unitPrice = billedPrices.has(productId) ? billedPrices.get(productId) : product.price;
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

// The prices a saved bill already charged, for handing back to resolveLines
// on an edit. First line wins if the same product appears twice: only
// ADMIN/MANAGER can put one product on a bill at two different prices, and
// their edit sends both prices explicitly anyway.
// ponytail: match on line id instead if per-line prices ever have to survive
// a SALES edit — the edit form would have to start sending line ids.
function billedPricesOf(lines) {
  const byProduct = new Map();
  for (const line of lines) {
    if (!byProduct.has(line.productId)) byProduct.set(line.productId, line.unitPrice);
  }
  return byProduct;
}

module.exports = { resolveLines, billedPricesOf };
