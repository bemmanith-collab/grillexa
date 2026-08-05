// Arithmetic for the personal metrics dashboard. Everything here takes rows
// the route has already fetched and returns numbers — no Prisma, so the parts
// that are easy to get quietly wrong (returns subtracting, ties in the
// ranking, a percentage against a zero baseline) can be checked without a
// database. See test/dashboard.js.

const DAY_MS = 86400000;

// A visit is not a check-in. Nothing in this app records one: the GPS work
// pinned where stores *are*, it never tracked anyone arriving. What the app
// does record is work that can only be done standing in the shop — a bill rung
// up, stock delivered, a consignment settled — so a store with any of today's
// work against it was visited, and one with none was not.
//
// This is evidence, not attendance: a salesperson who walks in and sells
// nothing counts as missed. Swap this for real check-ins if that matters (see
// README, "What a visit means here").
function visitedStoreIds(...rowSets) {
  const ids = new Set();
  for (const rows of rowSets) {
    for (const row of rows) {
      if (row.storeId != null) ids.add(row.storeId);
    }
  }
  return ids;
}

// Sale.totalAmount is already net of any RETURN lines on the same bill (see
// the sales route), so this is takings, not gross.
function sumSales(sales) {
  return sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
}

// Null rather than 0 or Infinity when there is nothing to compare against:
// "+100% on a day you sold nothing" is a lie, and the page prints "no sales
// this day last week" instead.
function changePct(today, baseline) {
  if (!baseline) return null;
  return ((today - baseline) / baseline) * 100;
}

// Top sellers by money taken, RETURN lines subtracting from their product.
// A product whose only movement today was a return is dropped rather than
// shown with a negative bar — it is not a top seller, it is a refund.
function topProducts(sales, limit = 3) {
  const byProduct = new Map();
  for (const sale of sales) {
    for (const line of sale.lines) {
      const sign = line.type === 'RETURN' ? -1 : 1;
      const agg = byProduct.get(line.productId) || {
        productId: line.productId,
        name: line.product.name,
        amount: 0,
        quantity: 0,
      };
      agg.amount += sign * line.amount;
      agg.quantity += sign * line.quantity;
      byProduct.set(line.productId, agg);
    }
  }
  return [...byProduct.values()]
    .filter((p) => p.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// Today's takings per person, highest first. Built from a groupBy over every
// sale of the day, so it covers whoever actually sold — plus `alwaysInclude`
// (the person being viewed) even on a blank day: being last is information,
// being absent from your own dashboard is a bug.
function buildLeaderboard(totals, names, alwaysInclude = null) {
  const board = totals.map((row) => ({
    userId: row.createdById,
    name: names.get(row.createdById) || 'Unknown',
    amount: row._sum.totalAmount || 0,
  }));
  if (alwaysInclude != null && !board.some((r) => r.userId === alwaysInclude)) {
    board.push({ userId: alwaysInclude, name: names.get(alwaysInclude) || 'Unknown', amount: 0 });
  }
  return board.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

// Competition ranking: everyone level on the same takings shares the higher
// place, so two people tied on ₹4,200 are both #2 and nobody has to be told
// they came third for sorting alphabetically.
function rankIn(board, userId) {
  const me = board.find((r) => r.userId === userId);
  if (!me) return null;
  return board.filter((r) => r.amount > me.amount).length + 1;
}

function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

// Consignments still owed money on. `graceDays` days after delivery, stock
// that has not been settled is the company's money sitting in someone else's
// shop, so it turns into an alert with the store's name on it. Oldest first —
// that is the one to chase.
function overdueList(consignments, date, graceDays) {
  return consignments
    .map((c) => ({
      consignmentNo: c.consignmentNo,
      store: c.store.name,
      daysOutstanding: daysBetween(c.deliveredAt, date),
    }))
    .filter((c) => c.daysOutstanding >= graceDays)
    .sort((a, b) => b.daysOutstanding - a.daysOutstanding);
}

module.exports = {
  visitedStoreIds,
  sumSales,
  changePct,
  topProducts,
  buildLeaderboard,
  rankIn,
  overdueList,
  daysBetween,
};
