// The store sheet: who delivered/sold what at which store, split by
// consignment vs direct sale, and what each store made and lost. Pure — the
// route fetches, this adds up; see test/storeSheet.js.
//
// Each thing is counted on the day it happened, credited to whoever did it:
// goods delivered on the delivery day (to whoever delivered them, with what
// of that delivery is still unsettled as pending); goods sold or returned on
// the day they were SETTLED (to whoever settled them); direct bills on their
// bill date. So "today" shows what was actually sold today — counting sales
// on their delivery day hid every settlement of an earlier delivery.
//
// Loss is what came back — returned or exchanged — at cost price, on the
// assumption that perishable goods back from a shop are not resold.
// ponytail: consignment cost uses the live Product.costPrice (ConsignmentItem
// has no cost snapshot); add one if costs change often enough to matter.

function blank() {
  return { delivered: 0, sold: 0, returned: 0, exchanged: 0, pending: 0, revenue: 0, cost: 0, loss: 0 };
}

function add(target, m) {
  for (const k of Object.keys(m)) target[k] += m[k];
}

function finish(r) {
  const outcome = r.sold + r.returned;
  r.profit = r.revenue - r.cost - r.loss;
  r.returnRatePct = outcome ? (r.returned / outcome) * 100 : null;
  return r;
}

function buildStoreSheet({ consignmentItems = [], settlementLines = [], directLines = [] }) {
  const rows = new Map(); // store + person + source
  const products = new Map();

  function touch({ storeId, store, personId, person, source, product, productId, m }) {
    products.set(productId, { id: productId, name: product.name, sortOrder: product.sortOrder ?? 100 });
    const key = `${storeId}|${personId}|${source}`;
    if (!rows.has(key)) {
      rows.set(key, { key, storeId, store, personId, person, source, cells: {}, ...blank() });
    }
    const row = rows.get(key);
    row.cells[productId] = row.cells[productId] || blank();
    add(row.cells[productId], m);
    add(row, m);
  }

  // Deliveries made in the window.
  for (const it of consignmentItems) {
    const c = it.consignment;
    const m = blank();
    m.delivered = it.deliveredQty;
    // A closed consignment is no longer waiting on anything.
    m.pending = c.status === 'CLOSED' ? 0 : it.deliveredQty - it.soldQty - it.returnedQty;
    touch({
      storeId: c.storeId,
      store: c.store.name,
      personId: c.createdById,
      person: c.createdBy?.name || 'Unknown',
      source: 'CONSIGNMENT',
      productId: it.productId,
      product: it.product,
      m,
    });
  }

  // Settlements made in the window, whenever the goods went out.
  for (const l of settlementLines) {
    const it = l.consignmentItem;
    const c = it.consignment;
    const st = l.settlement;
    const unitCost = it.product.costPrice || 0;
    const m = blank();
    m.sold = l.soldQty;
    m.returned = l.returnedQty;
    m.revenue = l.soldQty * it.pricePerUnit;
    m.cost = l.soldQty * unitCost;
    m.loss = l.returnedQty * unitCost;
    touch({
      storeId: c.storeId,
      store: c.store.name,
      personId: st.createdById,
      person: st.createdBy?.name || 'Unknown',
      source: 'CONSIGNMENT',
      productId: it.productId,
      product: it.product,
      m,
    });
  }

  for (const l of directLines) {
    const unitCost = l.costPrice ?? l.product.costPrice ?? 0;
    const s = l.sale;
    const m = blank();
    if (l.type === 'RETURN') {
      m.returned = l.quantity;
      m.revenue = -l.amount; // older bills credited the return; new ones are 0
      m.loss = l.quantity * unitCost;
    } else if (l.type === 'EXCHANGE') {
      m.exchanged = l.quantity;
      m.loss = l.quantity * unitCost;
    } else {
      m.delivered = l.quantity;
      m.sold = l.quantity;
      m.revenue = l.amount;
      m.cost = l.quantity * unitCost;
    }
    touch({
      storeId: s.storeId,
      store: s.store.name,
      personId: s.createdById,
      person: s.createdBy?.name || 'Unknown',
      source: 'DIRECT',
      productId: l.productId,
      product: l.product,
      m,
    });
  }

  const sheet = [...rows.values()].map(finish).sort(
    (a, b) => a.store.localeCompare(b.store) || a.person.localeCompare(b.person) || a.source.localeCompare(b.source)
  );

  function rollUp(keyOf, labelOf) {
    const out = new Map();
    for (const r of sheet) {
      const k = keyOf(r);
      if (!out.has(k)) out.set(k, { id: k, ...labelOf(r), ...blank() });
      const t = out.get(k);
      for (const f of Object.keys(blank())) t[f] += r[f];
    }
    return [...out.values()].map(finish);
  }

  const stores = rollUp((r) => r.storeId, (r) => ({ label: r.store })).sort((a, b) => b.revenue - a.revenue);
  const people = rollUp((r) => r.personId, (r) => ({ label: r.person })).sort((a, b) => b.revenue - a.revenue);
  for (const p of people) {
    p.revenueDirect = sheet.filter((r) => r.personId === p.id && r.source === 'DIRECT').reduce((s, r) => s + r.revenue, 0);
    p.revenueConsignment = p.revenue - p.revenueDirect;
  }

  const productTotals = new Map([...products.keys()].map((id) => [id, blank()]));
  for (const r of sheet) for (const [id, c] of Object.entries(r.cells)) add(productTotals.get(Number(id)), c);
  const productList = [...products.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, ...finish(productTotals.get(p.id)) }));

  const totals = finish(blank());
  for (const r of sheet) for (const f of Object.keys(blank())) totals[f] += r[f];
  finish(totals);

  const advice = advise(stores);
  return {
    rows: sheet,
    products: productList,
    stores,
    people,
    totals,
    advice,
    suggestions: suggest({ stores, people, products: productList, totals, advice }),
  };
}

const rupees = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const pctText = (n) => `${Math.round(n)}%`;
const units = (n) => (n === 1 ? 'unit' : 'units');

// The report's closing section: what to do next, worked out from this
// report's own numbers, biggest rupee impact first. Each rule only speaks when
// the data supports it, so a quiet range gives a short list, not filler.
// ponytail: fixed rules and thresholds; tune them here as the business learns.
function suggest({ stores, people, products, totals, advice }) {
  const out = [];
  const byName = new Map(stores.map((s) => [s.label, s]));

  for (const a of advice.cut.slice(0, 3)) {
    const s = byName.get(a.store);
    out.push({
      title: `Deliver ${s.returned} fewer ${units(s.returned)} to ${s.label}`,
      detail: `${s.returned} of ${s.sold + s.returned} came back (${pctText(s.returnRatePct)}).${s.loss ? ` Sending that much less saves about ${rupees(s.loss)} at cost.` : ''}`,
      impact: s.loss,
    });
  }

  for (const a of advice.grow.slice(0, 3)) {
    const s = byName.get(a.store);
    if (!s.sold) continue;
    const extra = Math.max(1, Math.round(s.sold * 0.2));
    const gain = extra * ((s.revenue - s.cost) / s.sold);
    out.push({
      title: `Try ${extra} more ${units(extra)} at ${s.label}`,
      detail: `It sold ${s.sold} with ${s.returned} back. If the extra sells too, that is about ${rupees(gain)} more profit.`,
      impact: gain,
    });
  }

  const judgedProducts = products.filter((p) => p.sold + p.returned >= 5 && p.returnRatePct >= 15);
  const worst = judgedProducts.sort((a, b) => b.returnRatePct - a.returnRatePct)[0];
  if (worst) {
    out.push({
      title: `${worst.name}: ${pctText(worst.returnRatePct)} comes back`,
      detail: `Across all stores, ${worst.returned} of ${worst.sold + worst.returned} came back${worst.loss ? `, costing ${rupees(worst.loss)}` : ''}. If it comes back from most stores, check freshness, pack size or price rather than the stores.`,
      impact: worst.loss,
    });
  }

  const exchanged = products.filter((p) => p.exchanged > 0).sort((a, b) => b.exchanged - a.exchanged)[0];
  if (exchanged) {
    const each = exchanged.loss / (exchanged.returned + exchanged.exchanged);
    out.push({
      title: `${exchanged.exchanged} ${exchanged.name} exchanged`,
      detail: `Each exchange is a free replacement${each ? ` worth about ${rupees(each)} at cost` : ''}. Check quality when packing.`,
      impact: exchanged.exchanged * each,
    });
  }

  const teamRate = totals.returnRatePct;
  if (teamRate != null && people.length > 1) {
    const p = people
      .filter((x) => x.sold + x.returned >= 5 && x.returnRatePct >= teamRate + 10)
      .sort((a, b) => b.returnRatePct - a.returnRatePct)[0];
    if (p) {
      out.push({
        title: `${p.label}'s stores return ${pctText(p.returnRatePct)}, against ${pctText(teamRate)} for the team`,
        detail: `Go through their delivery quantities store by store. Matching the team's rate saves about ${rupees(p.loss * (1 - teamRate / p.returnRatePct))}.`,
        impact: p.loss * (1 - teamRate / p.returnRatePct),
      });
    }
  }

  if (totals.returnRatePct > 10 && totals.revenue > 0 && totals.loss > 0) {
    const gain = totals.loss * (1 - 10 / totals.returnRatePct);
    out.push({
      title: `Returns cost ${pctText((totals.loss / totals.revenue) * 100)} of what we made`,
      detail: `${pctText(totals.returnRatePct)} of settled goods came back. Bringing that down to 10% would add about ${rupees(gain)} profit over a range like this one.`,
      impact: gain,
    });
  }

  if (stores.length >= 6 && totals.revenue > 0) {
    const top = stores.slice(0, 3).reduce((s, x) => s + x.revenue, 0);
    const share = (top / totals.revenue) * 100;
    if (share >= 40) {
      out.push({
        title: `3 stores bring in ${pctText(share)} of sales`,
        detail: `${stores.slice(0, 3).map((s) => s.label).join(', ')}. Losing one would hurt, so grow the stores just below them.`,
        impact: null,
      });
    }
  }

  if (totals.pending > 0) {
    out.push({
      title: `${totals.pending} ${units(totals.pending)} ${totals.pending === 1 ? 'is' : 'are'} still waiting to be settled`,
      detail: 'Settle them so their money and returns count in this report.',
      impact: null,
    });
  }

  return out.sort((a, b) => (b.impact ?? -1) - (a.impact ?? -1)).slice(0, 10);
}

// Plain suggestions a manager can act on tomorrow. Only stores with enough
// settled goods to judge (5+ units) — two returns out of three is noise.
function advise(stores) {
  const judged = stores.filter((s) => s.sold + s.returned >= 5);
  const cut = judged
    .filter((s) => s.returnRatePct >= 30)
    .sort((a, b) => b.loss - a.loss)
    .map((s) => ({ store: s.label, returnRatePct: s.returnRatePct, loss: s.loss, action: 'Deliver less' }));
  const grow = judged
    .filter((s) => s.returnRatePct <= 5)
    .sort((a, b) => b.revenue - a.revenue)
    .map((s) => ({ store: s.label, returnRatePct: s.returnRatePct, revenue: s.revenue, action: 'Deliver more' }));
  return { cut, grow };
}

module.exports = { buildStoreSheet };
