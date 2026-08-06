// Shared by the "Reorder from Last …" shortcuts on Deliver to Store and
// Direct Sale. Both pull a past document, copy its lines into the form, and
// have to cope with a product that has since left the catalog: it can't be
// picked in the line editor and the API would reject it on submit, so it's
// dropped here and handed back separately for the caller to warn about,
// rather than silently shrinking the order.
//
// Takes lines already normalized to { productId, product, quantity } — each
// page maps its own document shape onto that first.
//
// The price comes from today's catalogue, NOT from the document being copied.
// A reorder repeats what was ordered, not what it cost last month: carrying
// the old pricePerUnit across re-billed a repeat order at a stale price, and
// silently, because the field looked filled in. This is the same price the
// line editor puts there when you pick a product by hand (see emptyLine and
// handleProductChange in LineItemsForm) — blank when the product has none,
// which the server reads as "use the catalogue price".
export function filterToCatalog(candidateLines, products) {
  const catalog = new Map(products.map((p) => [p.id, p]));
  return {
    lines: candidateLines
      .filter((line) => catalog.has(line.productId))
      .map(({ productId, quantity }) => {
        const price = catalog.get(productId).price;
        return { productId, quantity, unitPrice: price != null ? price : '' };
      }),
    dropped: candidateLines.filter((line) => !catalog.has(line.productId)),
  };
}

// "2 discontinued products (Green Sprouts, Mixed Sprouts)" — the phrase both
// pages drop into their warning banner.
export function describeDropped(dropped) {
  return `${dropped.length} discontinued ${dropped.length === 1 ? 'product' : 'products'} (${dropped
    .map((line) => line.product)
    .join(', ')})`;
}
