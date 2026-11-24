// Totals for the deliveries on screen on Deliver to Store, so the day can be
// tallied against what left the van: units and ₹ per product, and per person.
const round2 = (n) => Math.round(n * 100) / 100;

export function tallyOf(consignments) {
  const products = new Map();
  const people = new Map();
  let units = 0;
  let value = 0;
  for (const c of consignments) {
    value += c.totalDeliveredValue;
    const person = people.get(c.createdBy || '—') || { name: c.createdBy || '—', units: 0, value: 0 };
    person.units += 1;
    person.value += c.totalDeliveredValue;
    people.set(person.name, person);
    for (const i of c.items) {
      units += i.deliveredQty;
      const p = products.get(i.product) || { name: i.product, units: 0, value: 0 };
      p.units += i.deliveredQty;
      p.value += i.totalValue;
      products.set(i.product, p);
    }
  }
  const sorted = (m) => [...m.values()].map((r) => ({ ...r, value: round2(r.value) })).sort((a, b) => b.value - a.value);
  return { units, value: round2(value), byProduct: sorted(products), byPerson: sorted(people) };
}

// The bill-by-bill sheet: one row per bill, a qty column per product, then a
// TOTAL row, so every bill can be ticked off and the columns add up to the
// product totals above. Header + rows + total, ready for a table or a CSV.
export function billSheet(consignments, productNames, withPerson = true) {
  const head = ['Bill', 'Store', 'Delivered by', ...productNames, 'Value'];
  const rows = consignments.map((c) => [
    c.consignmentNo,
    c.store,
    c.createdBy || '',
    ...productNames.map((n) => c.items.filter((i) => i.product === n).reduce((s, i) => s + i.deliveredQty, 0)),
    round2(c.totalDeliveredValue),
  ]);
  const total = ['TOTAL', `${rows.length} bill${rows.length === 1 ? "" : "s"}`, '', ...head.slice(3).map((_, k) => round2(rows.reduce((s, r) => s + r[3 + k], 0)))];
  // Scoped (SALES) users don't see who delivered, so the sheet drops that column.
  const cut = (r) => (withPerson ? r : r.filter((_, k) => k !== 2));
  return { head: cut(head), rows: rows.map(cut), total: cut(total) };
}

export function toCsv({ head, rows, total }) {
  const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  return [head, ...rows, total].map((r) => r.map(cell).join(',')).join('\r\n');
}

// One sheet per person, so each rider's bills can be tallied and downloaded
// on their own. Only the products that person delivered get a column; the
// person column is dropped since the whole sheet is theirs.
export function sheetsByPerson(consignments, productNames) {
  const people = new Map();
  for (const c of consignments) {
    const name = c.createdBy || '—';
    people.set(name, (people.get(name) || []).concat(c));
  }
  return [...people].sort(([a], [b]) => a.localeCompare(b)).map(([person, bills]) => {
    const theirs = productNames.filter((n) => bills.some((c) => c.items.some((i) => i.product === n)));
    return { person, sheet: billSheet(bills, theirs, false) };
  });
}
