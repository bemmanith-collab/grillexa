// How much of the free Mapbox tier this month has spent.
//
// Counted here rather than read from Mapbox: there is no usage endpoint on the
// free plan, and the number that matters is the one the app is responsible for
// anyway. A load is counted when a map actually initialises in a browser, not
// when the Stores page opens — the map picker is lazy and most visits to
// Stores never draw a map at all. A geocode is counted when Mapbox answered a
// lookup, not when one was asked for: the Nominatim fallback is a different
// provider and spends none of this quota.
//
// One row per calendar month, not one per request. 150,000 rows a month
// existing only to be counted is a table that answers its own question slower
// every day.

// Mapbox's free tier, and what the meter reads against. Not a limit the app
// enforces: going over costs money, it does not break, and cutting off the
// map because a counter is high would be worse than the bill.
const FREE = { loads: 50000, geocodes: 100000 };

// UTC, because Mapbox bills in UTC and a month boundary read in local time
// would put a load in the wrong bucket for five and a half hours a night.
function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

// One shape for both counters, so the page renders them with one bit of markup
// and adding a third meter later is a key here rather than a component there.
function shape(month, row) {
  return {
    month,
    loads: { used: row?.loads || 0, limit: FREE.loads },
    geocodes: { used: row?.geocodes || 0, limit: FREE.geocodes },
  };
}

async function record(prisma, kind = 'loads', date = new Date()) {
  // `kind` becomes a column name below. Only ever called with a literal, but a
  // typo would otherwise reach the database as a query it cannot answer.
  if (!(kind in FREE)) throw new Error(`Unknown usage counter: ${kind}`);
  const month = monthKey(date);
  const row = await prisma.mapUsage.upsert({
    where: { month },
    // Increment rather than read-then-write: two phones opening a map at once
    // would otherwise both read the same number and one load would vanish.
    update: { [kind]: { increment: 1 } },
    create: { month, [kind]: 1 },
  });
  return shape(month, row);
}

async function read(prisma, date = new Date()) {
  const month = monthKey(date);
  return shape(month, await prisma.mapUsage.findUnique({ where: { month } }));
}

module.exports = { FREE, monthKey, record, read };
