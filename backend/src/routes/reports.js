const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate } = require('../lib/stock');

const router = express.Router();

// Reports include financial and cross-store data, so they're limited to Admin and Manager.
router.use(authenticate, requireRole('ADMIN', 'MANAGER'));

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

router.get('/summary', async (req, res) => {
  const date = normalizeDate(req.query.date || todayStr());

  const [entries, salesToday, dispatchesToday] = await Promise.all([
    prisma.dailyStockEntry.findMany({ where: { date }, include: { store: true, product: true } }),
    prisma.sale.findMany({ where: { date } }),
    prisma.dispatchInvoice.findMany({ where: { date } }),
  ]);

  const lowStock = entries.filter((e) => e.closing <= e.product.threshold);

  res.json({
    date: date.toISOString().slice(0, 10),
    storesReporting: new Set(entries.map((e) => e.storeId)).size,
    totalClosingStock: entries.reduce((sum, e) => sum + e.closing, 0),
    totalReceivedToday: entries.reduce((sum, e) => sum + e.received, 0),
    totalSoldToday: entries.reduce((sum, e) => sum + e.sold, 0),
    totalWastageToday: entries.reduce((sum, e) => sum + e.wastage, 0),
    salesRevenueToday: salesToday.reduce((sum, s) => sum + s.totalAmount, 0),
    dispatchValueToday: dispatchesToday.reduce((sum, d) => sum + d.totalAmount, 0),
    lowStockCount: lowStock.length,
    lowStock: lowStock.map((e) => ({
      store: e.store.name,
      product: e.product.name,
      closing: e.closing,
      threshold: e.product.threshold,
    })),
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

// Per-store, per-product sales performance over a trailing window, with a
// simple recommendation (increase / maintain / decrease supply) based on
// sell-through rate (sold ÷ received) and wastage rate.
router.get('/recommendations', async (req, res) => {
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

  function classify(agg) {
    const sellThroughRate = agg.totalReceived > 0 ? agg.totalSold / agg.totalReceived : agg.totalSold > 0 ? 1 : 0;
    const wastageRate = agg.totalReceived > 0 ? agg.totalWastage / agg.totalReceived : 0;
    let recommendation = 'MAINTAIN';
    let note = 'Steady performer — maintain current supply.';
    if (agg.totalReceived === 0 && agg.totalSold === 0) {
      recommendation = 'NO_DATA';
      note = 'No dispatch or sales activity in this period.';
    } else if (wastageRate >= 0.2) {
      recommendation = 'DECREASE';
      note = `High wastage (${Math.round(wastageRate * 100)}% of stock received) — reduce supply.`;
    } else if (sellThroughRate >= 0.8) {
      recommendation = 'INCREASE';
      note = `Selling through ${Math.round(sellThroughRate * 100)}% of stock received — consider increasing supply.`;
    } else if (sellThroughRate <= 0.3) {
      recommendation = 'DECREASE';
      note = `Only ${Math.round(sellThroughRate * 100)}% sell-through — consider reducing supply.`;
    }
    return { ...agg, sellThroughRate, wastageRate, recommendation, note };
  }

  const result = stores.map((store) => {
    const byProduct = byStore.get(store.id) || new Map();
    const products = Array.from(byProduct.values()).map(classify).sort((a, b) => b.totalSold - a.totalSold);
    const withSales = products.filter((p) => p.totalSold > 0);
    return {
      storeId: store.id,
      store: store.name,
      products,
      topSeller: withSales[0] || null,
      lowSeller: withSales.length > 1 ? withSales[withSales.length - 1] : null,
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
