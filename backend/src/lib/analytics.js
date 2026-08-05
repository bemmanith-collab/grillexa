// Aggregation for the charts on Reports and for the Excel export. Pure: every
// function takes rows the route has already fetched and returns numbers, so
// both callers run the same arithmetic — the workbook a manager downloads and
// the chart they were looking at when they clicked Download cannot disagree.
// See test/analytics.js.

const DAY_MS = 86400000;

// Money moved by one sale line. RETURN lines credit the customer, so they
// subtract — from the day, the product, the store and the salesperson alike.
// Summed over a bill's lines this equals its totalAmount exactly (that is how
// the sales route computes it), which is why everything here works off lines:
// it gives the same totals as the bills, and it can also be filtered down to
// one product, which a bill total cannot.
function lineValue(line) {
  return line.type === 'RETURN' ? -line.amount : line.amount;
}

function lineQty(line) {
  return line.type === 'RETURN' ? -line.quantity : line.quantity;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Every day in the window, including the ones with no sales. A line chart that
// simply skips a dead Sunday draws a straight line across it and reports a
// quiet week as a steady one.
function salesTrend(lines, from, to) {
  const byDay = new Map();
  for (let d = from.getTime(); d <= to.getTime(); d += DAY_MS) {
    byDay.set(isoDay(new Date(d)), 0);
  }
  for (const line of lines) {
    const key = isoDay(line.sale.date);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + lineValue(line));
  }
  return [...byDay.entries()].map(([date, amount]) => ({ date, amount }));
}

// Sum sale lines into buckets — by product, by store, by whoever rang them up.
// One helper because the three differ only in which id they group on and where
// the label comes from; the arithmetic is identical and worth having in one
// place that is tested once.
function sumLinesBy(lines, keyOf, labelOf) {
  const buckets = new Map();
  for (const line of lines) {
    const id = keyOf(line);
    if (id == null) continue;
    const bucket = buckets.get(id) || { id, label: labelOf(line), amount: 0, quantity: 0 };
    bucket.amount += lineValue(line);
    bucket.quantity += lineQty(line);
    buckets.set(id, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.amount - a.amount);
}

// Wastage is a per-day counter on the stock ledger, not an event log — there
// is no wastage record to join to, and no reason attached to one. Value is at
// cost: wastage is stock the business paid for and never sold, so what it cost
// is what it lost, not what it hoped to charge.
function wastageByProduct(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const bucket = buckets.get(entry.productId) || {
      id: entry.productId,
      label: entry.product.name,
      quantity: 0,
      value: 0,
    };
    bucket.quantity += entry.wastage;
    bucket.value += entry.wastage * (entry.product.costPrice || 0);
    buckets.set(entry.productId, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.value - a.value || b.quantity - a.quantity);
}

// Fifty stores in a doughnut is a colour wheel, not a chart, and on a phone it
// is unreadable at any size. The tail is real money though, so it is kept as
// one "Other" slice rather than dropped — the total still adds up. The slice
// has no id, which is also what stops the drill-down offering to filter by it.
function withOther(rows, limit, valueOf = (r) => r.amount) {
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit);
  const tail = rows.slice(limit);
  const rest = { id: null, label: `Other (${tail.length})`, amount: 0, quantity: 0, value: 0 };
  for (const row of tail) {
    rest.amount += row.amount || 0;
    rest.quantity += row.quantity || 0;
    rest.value += row.value || 0;
  }
  // Only meaningful for the chart being built, but summing all three costs
  // nothing and keeps one function honest for both money and units.
  return valueOf(rest) === 0 && rest.quantity === 0 ? head : [...head, rest];
}

// Which stores saw any work in the window, and when they last did. Same
// definition of a visit as the dashboard (see lib/dashboard.js): evidence of
// work done at the shop, because nothing here records an arrival.
function storeActivity(...rowSets) {
  const activity = new Map();
  for (const rows of rowSets) {
    for (const row of rows) {
      if (row.storeId == null) continue;
      const seen = activity.get(row.storeId);
      if (!seen || row.date > seen) activity.set(row.storeId, row.date);
    }
  }
  return activity;
}

// Profit per product over the window. COGS is the cost price of what sold;
// wastage is costed the same way but kept separate, because a product can be
// profitable on what sold and still lose money once what rotted is counted.
function productPerformance(lines, wastage) {
  const byProduct = new Map();
  function bucket(id, name) {
    if (!byProduct.has(id)) {
      byProduct.set(id, {
        id,
        name,
        units: 0,
        revenue: 0,
        cost: 0,
        wastageUnits: 0,
        wastageValue: 0,
      });
    }
    return byProduct.get(id);
  }

  for (const line of lines) {
    const row = bucket(line.productId, line.product.name);
    row.units += lineQty(line);
    row.revenue += lineValue(line);
    row.cost += lineQty(line) * (line.product.costPrice || 0);
  }
  for (const entry of wastage) {
    const row = bucket(entry.productId, entry.product.name);
    row.wastageUnits += entry.wastage;
    row.wastageValue += entry.wastage * (entry.product.costPrice || 0);
  }

  return [...byProduct.values()]
    .map((row) => ({
      ...row,
      profit: row.revenue - row.cost,
      marginPct: row.revenue !== 0 ? ((row.revenue - row.cost) / row.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

// How much of their patch each salesperson actually got to, and what it
// brought in. "Efficiency" is deliberately a plain ratio — stores reached over
// stores assigned — and not a blended score: a number nobody can recompute in
// their head is a number nobody trusts when it is used to judge them.
function salespersonPerformance(users, { linesByUser, visitsByUser, settledByUser, pendingByUser }) {
  return users
    .map((user) => {
      const assigned = user.stores.length;
      const visited = visitsByUser.get(user.id)?.size || 0;
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        assignedStores: assigned,
        storesVisited: visited,
        sales: linesByUser.get(user.id) || 0,
        settlements: settledByUser.get(user.id) || 0,
        pendingSettlements: pendingByUser.get(user.id) || 0,
        efficiencyPct: assigned ? (visited / assigned) * 100 : null,
      };
    })
    .sort((a, b) => b.sales - a.sales);
}

module.exports = {
  lineValue,
  lineQty,
  isoDay,
  salesTrend,
  sumLinesBy,
  wastageByProduct,
  withOther,
  storeActivity,
  productPerformance,
  salespersonPerformance,
};
