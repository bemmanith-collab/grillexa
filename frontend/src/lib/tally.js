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
