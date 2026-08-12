const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, todayStr } = require('../lib/stock');
const { SETTLE_GRACE_DAYS } = require('../lib/dashboard');
const {
  salesTrend,
  sumLinesBy,
  wastageByProduct,
  withOther,
  storeActivity,
  productPerformance,
  salespersonPerformance,
  lineValue,
  isoDay,
} = require('../lib/analytics');
const { buildWorkbook } = require('../lib/excelReport');

const router = express.Router();

// Reports include financial and cross-store data, so they're limited to Admin and Manager.
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

// A year at most. The window drives how many rows every query below reads, and
// "all time" on a phone is a request nobody meant to make.
const MAX_RANGE_DAYS = 366;

// from/to win when both are given; otherwise fall back to a trailing window,
// which is what /pnl and /product-sales have always taken.
function parseRange(query) {
  const to = query.to ? normalizeDate(query.to) : normalizeDate(todayStr());
  if (query.from) {
    const from = normalizeDate(query.from);
    if (from > to) {
      const err = new Error('from must be on or before to');
      err.status = 400;
      throw err;
    }
    const span = Math.round((to - from) / 86400000) + 1;
    if (span > MAX_RANGE_DAYS) {
      const err = new Error(`Pick a range of ${MAX_RANGE_DAYS} days or fewer`);
      err.status = 400;
      throw err;
    }
    return { from, to };
  }
  const days = Math.min(Math.max(Number(query.days) || 30, 1), MAX_RANGE_DAYS);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from, to };
}

function optionalId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// The one read every analytic view shares: sale lines, wastage, and the two
// small reference tables. Lines rather than bills because a line carries its
// product, which is what makes a product filter — and the product charts —
// possible at all; summed over a bill they come to the same total.
// `userId` credits by who rang the bill up (createdById) — the same rule the
// personal dashboard uses, and the only attribution the data supports. It
// reaches sale lines and nothing else: a stock ledger row belongs to a store
// and a day, so wastage cannot be filtered by person, only by store.
async function loadCore({ from, to, storeId, productId, userId }) {
  const saleWhere = {
    date: { gte: from, lte: to },
    ...(storeId ? { storeId } : {}),
    ...(userId ? { createdById: userId } : {}),
  };
  const [lines, wastageEntries, stores, users] = await Promise.all([
    prisma.saleLine.findMany({
      where: { sale: saleWhere, ...(productId ? { productId } : {}) },
      select: {
        productId: true,
        quantity: true,
        amount: true,
        type: true,
        product: { select: { name: true, costPrice: true } },
        sale: { select: { id: true, date: true, storeId: true, createdById: true } },
      },
    }),
    prisma.dailyStockEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        wastage: { gt: 0 },
        ...(storeId ? { storeId } : {}),
        ...(productId ? { productId } : {}),
      },
      select: {
        date: true,
        storeId: true,
        productId: true,
        wastage: true,
        product: { select: { name: true, costPrice: true } },
        store: { select: { name: true } },
      },
    }),
    prisma.store.findMany({
      where: storeId ? { id: storeId } : {},
      select: { id: true, name: true, address: true, salesUsers: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, role: true, stores: { select: { id: true } } },
      orderBy: { name: 'asc' },
    }),
  ]);
  return { lines, wastageEntries, stores, users };
}

// Charts for the Reports page: every series in one response. Five endpoints
// would mean five round trips on a phone and five slightly different moments
// in time on one screen.
router.get('/analytics', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const storeId = optionalId(req.query.storeId);
  const productId = optionalId(req.query.productId);
  const userId = optionalId(req.query.userId);

  const { lines, wastageEntries, stores, users } = await loadCore({
    from,
    to,
    storeId,
    productId,
    userId,
  });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const storeNames = new Map(stores.map((s) => [s.id, s.name]));
  // When a store filter is on, `stores` holds only that store — but a line
  // from another store cannot be in the result set anyway, so the lookup is
  // complete either way.
  const byStore = sumLinesBy(lines, (l) => l.sale.storeId, (l) => storeNames.get(l.sale.storeId) || 'Unknown');
  const byProduct = sumLinesBy(lines, (l) => l.productId, (l) => l.product.name);
  const byPerson = sumLinesBy(lines, (l) => l.sale.createdById, (l) => names.get(l.sale.createdById) || 'Unknown');

  res.json({
    from: isoDay(from),
    to: isoDay(to),
    salesTrend: salesTrend(lines, from, to),
    // Eight slices is what a doughnut can label on a phone; the rest is kept
    // as one slice so the total still adds up.
    productDistribution: withOther(byProduct, 8),
    storePerformance: withOther(byStore, 10),
    wastageByProduct: withOther(wastageByProduct(wastageEntries), 10, (r) => r.value),
    salespersonPerformance: byPerson,
    // Wastage is recorded against a store and a day, never against a person,
    // so a person filter cannot reach it. Said here rather than left for
    // someone to infer from a chart that did not change when they filtered.
    wastageIsPersonScoped: false,
    // The filter dropdowns come back with the data — two fewer round trips on
    // a phone, and they can never list a store the figures exclude.
    filters: {
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      products: byProduct.filter((p) => p.id).map((p) => ({ id: p.id, name: p.label })),
      // Everyone, not only those who sold in this window: picking a person who
      // turns out to have sold nothing is a legitimate question, and the empty
      // chart is the answer to it.
      people: users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    },
  });
});

// The manager's workbook: six sheets of detail behind the charts, streamed
// straight to the browser as an attachment.
router.get('/excel', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const storeId = optionalId(req.query.storeId);

  const graceCutoff = new Date(to);
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - SETTLE_GRACE_DAYS);

  const [core, consignments, settlements, pending] = await Promise.all([
    loadCore({ from, to, storeId, productId: null }),
    prisma.consignment.findMany({
      where: { deliveredAt: { gte: from, lte: to }, ...(storeId ? { storeId } : {}) },
      select: {
        consignmentNo: true,
        deliveredAt: true,
        status: true,
        storeId: true,
        createdById: true,
        store: { select: { name: true } },
        items: { select: { deliveredQty: true, soldQty: true, returnedQty: true, totalValue: true } },
      },
      orderBy: { deliveredAt: 'asc' },
    }),
    prisma.settlement.findMany({
      where: { settledAt: { gte: from, lte: to } },
      select: { createdById: true, settledAt: true, consignment: { select: { storeId: true } } },
    }),
    prisma.consignment.findMany({
      where: {
        status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] },
        deliveredAt: { lte: graceCutoff },
        ...(storeId ? { storeId } : {}),
      },
      select: { storeId: true, createdById: true },
    }),
  ]);

  const { lines, wastageEntries, stores, users } = core;

  // Same definition of a visit as the dashboard: evidence of work done at the
  // shop, since nothing here records an arrival. Settlements are dated by when
  // they happened and carry their store through the consignment.
  const settlementRows = settlements.map((s) => ({
    storeId: s.consignment.storeId,
    date: s.settledAt,
    createdById: s.createdById,
  }));
  const activity = storeActivity(
    lines.map((l) => ({ storeId: l.sale.storeId, date: l.sale.date })),
    consignments.map((c) => ({ storeId: c.storeId, date: c.deliveredAt })),
    settlementRows
  );

  const salesByStore = new Map();
  for (const line of lines) {
    salesByStore.set(line.sale.storeId, (salesByStore.get(line.sale.storeId) || 0) + lineValue(line));
  }
  const wastageValueByStore = new Map();
  for (const entry of wastageEntries) {
    const value = entry.wastage * (entry.product.costPrice || 0);
    wastageValueByStore.set(entry.storeId, (wastageValueByStore.get(entry.storeId) || 0) + value);
  }
  const consignmentsByStore = new Map();
  for (const c of consignments) {
    consignmentsByStore.set(c.storeId, (consignmentsByStore.get(c.storeId) || 0) + 1);
  }

  // Per-person totals. Sales and settlements follow whoever did the work;
  // an open consignment is chased by everyone covering that shop, and by its
  // creator when the shop has nobody assigned — which is how an admin's own
  // deliveries still land somewhere.
  const salesByPerson = new Map();
  const visitsByPerson = new Map();
  for (const line of lines) {
    const id = line.sale.createdById;
    salesByPerson.set(id, (salesByPerson.get(id) || 0) + lineValue(line));
    if (!visitsByPerson.has(id)) visitsByPerson.set(id, new Set());
    visitsByPerson.get(id).add(line.sale.storeId);
  }
  for (const row of [...consignments.map((c) => ({ createdById: c.createdById, storeId: c.storeId })), ...settlementRows]) {
    if (!visitsByPerson.has(row.createdById)) visitsByPerson.set(row.createdById, new Set());
    visitsByPerson.get(row.createdById).add(row.storeId);
  }
  const settledByPerson = new Map();
  for (const s of settlements) {
    settledByPerson.set(s.createdById, (settledByPerson.get(s.createdById) || 0) + 1);
  }
  const storeUsers = new Map(stores.map((s) => [s.id, s.salesUsers.map((u) => u.id)]));
  const pendingByPerson = new Map();
  for (const c of pending) {
    const owners = storeUsers.get(c.storeId)?.length ? storeUsers.get(c.storeId) : [c.createdById];
    for (const id of owners) pendingByPerson.set(id, (pendingByPerson.get(id) || 0) + 1);
  }

  const wastageUnits = wastageEntries.reduce((sum, e) => sum + e.wastage, 0);
  const wastageValue = wastageEntries.reduce((sum, e) => sum + e.wastage * (e.product.costPrice || 0), 0);
  const visitedStores = stores.filter((s) => activity.has(s.id));

  const report = {
    from: isoDay(from),
    to: isoDay(to),
    summary: {
      storeFilter: storeId ? stores[0]?.name || `Store ${storeId}` : 'All stores',
      totalSales: lines.reduce((sum, l) => sum + lineValue(l), 0),
      billCount: new Set(lines.map((l) => l.sale.id)).size,
      consignmentCount: consignments.length,
      consignmentValue: consignments.reduce(
        (sum, c) => sum + c.items.reduce((s, i) => s + i.totalValue, 0),
        0
      ),
      settlementCount: settlements.length,
      pendingCount: pending.length,
      wastageUnits,
      wastageValue,
      storesVisited: visitedStores.length,
      storesMissed: stores.length - visitedStores.length,
    },
    stores: stores.map((s) => ({
      store: s.name,
      address: s.address || '',
      salespeople: s.salesUsers.map((u) => u.name).join(', '),
      sales: salesByStore.get(s.id) || 0,
      wastageValue: wastageValueByStore.get(s.id) || 0,
      consignments: consignmentsByStore.get(s.id) || 0,
      lastVisit: activity.get(s.id) || null,
      status: activity.has(s.id) ? 'Visited' : 'No activity',
    })),
    products: productPerformance(lines, wastageEntries),
    salespeople: salespersonPerformance(users, {
      linesByUser: salesByPerson,
      visitsByUser: visitsByPerson,
      settledByUser: settledByPerson,
      pendingByUser: pendingByPerson,
    }),
    consignments: consignments.map((c) => {
      const delivered = c.items.reduce((s, i) => s + i.deliveredQty, 0);
      const sold = c.items.reduce((s, i) => s + i.soldQty, 0);
      const returned = c.items.reduce((s, i) => s + i.returnedQty, 0);
      return {
        consignmentNo: c.consignmentNo,
        store: c.store.name,
        deliveredAt: c.deliveredAt,
        status: c.status,
        deliveredQty: delivered,
        soldQty: sold,
        returnedQty: returned,
        openQty: delivered - sold - returned,
        value: c.items.reduce((s, i) => s + i.totalValue, 0),
      };
    }),
    wastage: wastageEntries
      .map((e) => ({
        date: e.date,
        store: e.store.name,
        product: e.product.name,
        quantity: e.wastage,
        value: e.wastage * (e.product.costPrice || 0),
      }))
      .sort((a, b) => a.date - b.date || a.store.localeCompare(b.store)),
  };

  const workbook = buildWorkbook(report);
  const filename = `Grillexa-report-${report.from}-to-${report.to}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // Streamed rather than buffered: a year of a busy month is a few MB, and
  // there is no reason for it to sit in Node's heap first.
  await workbook.xlsx.write(res);
  res.end();
});

router.get('/summary', async (req, res) => {
  const date = normalizeDate(req.query.date || todayStr());

  const [entries, salesToday, dispatchesToday] = await Promise.all([
    prisma.dailyStockEntry.findMany({ where: { date }, include: { store: true, product: true } }),
    prisma.sale.findMany({ where: { date } }),
    prisma.dispatchInvoice.findMany({ where: { date } }),
  ]);

  // No stock-on-hand or low-stock figures: nothing is booked into inventory
  // before it's billed, so a closing balance measures nothing. Everything
  // below is a real recorded movement or a real amount of money.
  res.json({
    date: date.toISOString().slice(0, 10),
    storesReporting: new Set(entries.map((e) => e.storeId)).size,
    totalReceivedToday: entries.reduce((sum, e) => sum + e.received, 0),
    totalSoldToday: entries.reduce((sum, e) => sum + e.sold, 0),
    totalWastageToday: entries.reduce((sum, e) => sum + e.wastage, 0),
    salesRevenueToday: salesToday.reduce((sum, s) => sum + s.totalAmount, 0),
    dispatchValueToday: dispatchesToday.reduce((sum, d) => sum + d.totalAmount, 0),
  });
});

// Profit & loss over a trailing window: revenue and cost of goods sold from
// every SaleLine (RETURN lines subtract, since they give back both the sale
// amount and its cost), combined and broken out per store.
router.get('/pnl', async (req, res) => {
  // from/to when the caller sends them (the Reports filter bar), otherwise the
  // trailing ?days= window this endpoint has always taken.
  const { from, to } = parseRange(req.query);
  const days = Math.round((to - from) / 86400000) + 1;
  const storeId = optionalId(req.query.storeId);
  const userId = optionalId(req.query.userId);

  const [saleLines, stores] = await Promise.all([
    prisma.saleLine.findMany({
      where: {
        sale: {
          date: { gte: from, lte: to },
          ...(storeId ? { storeId } : {}),
          ...(userId ? { createdById: userId } : {}),
        },
      },
      include: { sale: true, product: true },
    }),
    prisma.store.findMany({ where: storeId ? { id: storeId } : {}, orderBy: { name: 'asc' } }),
  ]);

  const byStore = new Map();
  function bucket(storeId) {
    if (!byStore.has(storeId)) byStore.set(storeId, { revenue: 0, cogs: 0 });
    return byStore.get(storeId);
  }

  let overallRevenue = 0;
  let overallCogs = 0;
  for (const line of saleLines) {
    const sign = line.type === 'RETURN' ? -1 : 1;
    const revenue = sign * line.amount;
    const cogs = sign * (line.product?.costPrice || 0) * line.quantity;
    overallRevenue += revenue;
    overallCogs += cogs;
    const b = bucket(line.sale.storeId);
    b.revenue += revenue;
    b.cogs += cogs;
  }

  function shape(revenue, cogs) {
    const profit = revenue - cogs;
    return { revenue, cogs, profit, marginPct: revenue !== 0 ? (profit / revenue) * 100 : 0 };
  }

  res.json({
    days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    overall: shape(overallRevenue, overallCogs),
    // Only stores that traded in the window, biggest profit first. Every store
    // ever opened was listed alphabetically with zeros filled in, so a phone
    // showed 80 cards to answer "which shops made money" — 14 of them empty,
    // and the best one somewhere in the middle of the alphabet.
    stores: stores
      .map((s) => {
        const b = byStore.get(s.id) || { revenue: 0, cogs: 0 };
        return { storeId: s.id, store: s.name, ...shape(b.revenue, b.cogs) };
      })
      .filter((s) => s.revenue !== 0 || s.cogs !== 0)
      .sort((a, b) => b.profit - a.profit),
  });
});

// Units moved per product, per store, over a trailing window. This used to
// also return a supply recommendation derived from sell-through (sold ÷
// received) — dropped, because goods aren't booked into the system before
// they're billed, so that ratio divided by a number describing nothing and
// confidently told you to increase supply on the strength of it. What's left
// is what was actually recorded.
router.get('/product-sales', async (req, res) => {
  const { from, to } = parseRange(req.query);
  const days = Math.round((to - from) / 86400000) + 1;
  const storeId = optionalId(req.query.storeId);
  const productId = optionalId(req.query.productId);

  const [entries, stores] = await Promise.all([
    prisma.dailyStockEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        ...(storeId ? { storeId } : {}),
        ...(productId ? { productId } : {}),
      },
      include: { product: true },
    }),
    prisma.store.findMany({ where: storeId ? { id: storeId } : {}, orderBy: { name: 'asc' } }),
  ]);

  const byStore = new Map();
  for (const entry of entries) {
    if (!byStore.has(entry.storeId)) byStore.set(entry.storeId, new Map());
    const byProduct = byStore.get(entry.storeId);
    const key = entry.productId;
    const agg = byProduct.get(key) || {
      productId: entry.productId,
      product: entry.product.name,
      totalSold: 0,
      totalReceived: 0,
      totalWastage: 0,
    };
    agg.totalSold += entry.sold;
    agg.totalReceived += entry.received;
    agg.totalWastage += entry.wastage;
    byProduct.set(key, agg);
  }

  const result = stores.map((store) => {
    const byProduct = byStore.get(store.id) || new Map();
    return {
      storeId: store.id,
      store: store.name,
      products: Array.from(byProduct.values()).sort((a, b) => b.totalSold - a.totalSold),
    };
  });

  res.json({
    days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    stores: result,
  });
});

module.exports = router;
