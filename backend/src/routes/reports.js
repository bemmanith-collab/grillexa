const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, todayStr } = require('../lib/stock');

const router = express.Router();

// Reports include financial and cross-store data, so they're limited to Admin and Manager.
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

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
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const [saleLines, stores] = await Promise.all([
    prisma.saleLine.findMany({
      where: { sale: { date: { gte: from, lte: to } } },
      include: { sale: true, product: true },
    }),
    prisma.store.findMany({ orderBy: { name: 'asc' } }),
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
    stores: stores.map((s) => {
      const b = byStore.get(s.id) || { revenue: 0, cogs: 0 };
      return { storeId: s.id, store: s.name, ...shape(b.revenue, b.cogs) };
    }),
  });
});

// Units moved per product, per store, over a trailing window. This used to
// also return a supply recommendation derived from sell-through (sold ÷
// received) — dropped, because goods aren't booked into the system before
// they're billed, so that ratio divided by a number describing nothing and
// confidently told you to increase supply on the strength of it. What's left
// is what was actually recorded.
router.get('/product-sales', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const [entries, stores] = await Promise.all([
    prisma.dailyStockEntry.findMany({
      where: { date: { gte: from, lte: to } },
      include: { product: true },
    }),
    prisma.store.findMany({ orderBy: { name: 'asc' } }),
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
