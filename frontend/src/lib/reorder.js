// Shared by the "Reorder from Last …" shortcuts on Deliver to Store and
// Direct Sale. Both pull a past document, copy its lines into the form, and
// have to cope with a product that has since left the catalog: it can't be
// picked in the line editor and the API would reject it on submit, so it's
// dropped here and handed back separately for the caller to warn about,
// rather than silently shrinking the order.
//
// Takes lines already normalized to { productId, product, quantity,
// unitPrice } — each page maps its own document shape onto that first.
export function filterToCatalog(candidateLines, products) {
  const inCatalog = (line) => products.some((p) => p.id === line.productId);
  return {
    lines: candidateLines
      .filter(inCatalog)
      .map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
    dropped: candidateLines.filter((line) => !inCatalog(line)),
  };
}

// "2 discontinued products (Green Sprouts, Mixed Sprouts)" — the phrase both
// pages drop into their warning banner.
export function describeDropped(dropped) {
  return `${dropped.length} discontinued ${dropped.length === 1 ? 'product' : 'products'} (${dropped
    .map((line) => line.product)
    .join(', ')})`;
}
