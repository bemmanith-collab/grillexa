const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { normalizeDate, todayStr } = require('../lib/stock');
const {
  SETTLE_GRACE_DAYS,
  visitedStoreIds,
  sumSales,
  changePct,
  topProducts,
  buildLeaderboard,
  rankIn,
  overdueList,
} = require('../lib/dashboard');
const { salesTrend } = require('../lib/analytics');

const router = express.Router();

router.use(authenticate);

// How much history the dashboard's trend line shows. A month is the shortest
// window a weekly rhythm is visible in, and it is one more query.
const TREND_DAYS = 30;

// Everything on this page is one person's day: their bills, their deliveries,
// their settlements. Scope:
//   SALES              → always themselves, whatever they ask for
//   ADMIN / MANAGER    → themselves by default (they sell too), ?userId=N for
//                        one person, ?userId=all for the whole company
router.get('/salesperson', async (req, res) => {
  const date = normalizeDate(req.query.date || todayStr());
  const staff = req.user.role !== 'SALES';
  const requested = staff ? req.query.userId : undefined;
  const companyWide = requested === 'all';
  const viewedId = companyWide ? null : Number(requested) || req.user.id;

  const viewed = companyWide
    ? null
    : await prisma.user.findUnique({
        where: { id: viewedId },
        select: { id: true, name: true, stores: { select: { id: true, name: true } } },
      });
  if (!companyWide && !viewed) return res.status(404).json({ error: 'User not found' });

  const myStoreIds = companyWide ? [] : viewed.stores.map((s) => s.id);

  // Credit follows who did the work (createdById), not which store it happened
  // at. Stores are shared between sales people — crediting by store would pay
  // two people for the same rupees and make the ranking meaningless.
  const mine = companyWide ? {} : { createdById: viewedId };

  // Settlement pressure is the exception: an unsettled consignment is chased
  // by whoever covers that shop, whether or not they delivered it. So it is
  // scoped to the stores you cover *or* the deliveries you made yourself
  // (which is all an admin with no assigned stores has).
  const owedByMe = companyWide
    ? {}
    : { OR: [{ storeId: { in: myStoreIds } }, { createdById: viewedId }] };

  const lastWeek = new Date(date);
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 7);
  const graceCutoff = new Date(date);
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - SETTLE_GRACE_DAYS);

  const trendFrom = new Date(date);
  trendFrom.setUTCDate(trendFrom.getUTCDate() - (TREND_DAYS - 1));

  const [sales, lastWeekSales, settlements, delivered, pending, users, dayTotals, storeCount, trendLines] =
    await Promise.all([
      prisma.sale.findMany({
        where: { date, ...mine },
        select: {
          storeId: true,
          totalAmount: true,
          lines: {
            select: {
              productId: true,
              quantity: true,
              amount: true,
              type: true,
              product: { select: { name: true } },
            },
          },
        },
      }),
      prisma.sale.aggregate({ _sum: { totalAmount: true }, where: { date: lastWeek, ...mine } }),
      prisma.settlement.findMany({
        where: { settledAt: date, ...mine },
        select: { consignment: { select: { storeId: true } } },
      }),
      prisma.consignment.findMany({
        where: { deliveredAt: date, ...mine },
        select: { storeId: true },
      }),
      prisma.consignment.findMany({
        where: {
          status: { in: ['DELIVERED', 'PARTIAL_SETTLED'] },
          deliveredAt: { lte: graceCutoff },
          ...owedByMe,
        },
        select: { consignmentNo: true, deliveredAt: true, store: { select: { name: true } } },
      }),
      // A shop has a handful of staff, so one unfiltered read is cheaper than
      // a second round trip to name the people in the ranking — and it doubles
      // as the list behind the admin's "viewing" picker.
      prisma.user.findMany({ select: { id: true, name: true, role: true }, orderBy: { name: 'asc' } }),
      // Ranking is company-wide by definition: it is the comparison.
      prisma.sale.groupBy({ by: ['createdById'], where: { date }, _sum: { totalAmount: true } }),
      companyWide ? prisma.store.count() : Promise.resolve(0),
      // The trend line under the stat cards. Lines rather than bill totals so
      // it runs through the same arithmetic as the Reports charts — one
      // definition of "a day's sales" for the whole app.
      prisma.saleLine.findMany({
        where: { sale: { date: { gte: trendFrom, lte: date }, ...mine } },
        select: { amount: true, quantity: true, type: true, sale: { select: { date: true } } },
      }),
    ]);

  const visited = visitedStoreIds(
    sales,
    delivered,
    settlements.map((s) => s.consignment)
  );
  const assigned = companyWide ? storeCount : myStoreIds.length;
  const missed = companyWide
    ? []
    : viewed.stores.filter((s) => !visited.has(s.id)).map((s) => ({ id: s.id, name: s.name }));

  const salesToday = sumSales(sales);
  const names = new Map(users.map((u) => [u.id, u.name]));
  const board = buildLeaderboard(dayTotals, names, viewedId);
  const overdue = overdueList(pending, date, SETTLE_GRACE_DAYS);

  res.json({
    date: date.toISOString().slice(0, 10),
    scope: companyWide ? 'company' : 'person',
    person: companyWide
      ? { id: null, name: 'Everyone', isSelf: false }
      : { id: viewed.id, name: viewed.name, isSelf: viewed.id === req.user.id },
    // Only staff get the picker; a SALES account has nothing to switch to.
    people: staff ? users.map((u) => ({ id: u.id, name: u.name, role: u.role })) : [],
    visits: {
      visited: visited.size,
      // 0 means "no stores assigned", not "visited none of none" — the page
      // prints a bare count instead of x/0.
      assigned,
      missed,
    },
    sales: {
      today: salesToday,
      lastWeek: lastWeekSales._sum.totalAmount || 0,
      changePct: changePct(salesToday, lastWeekSales._sum.totalAmount || 0),
      billCount: sales.length,
    },
    settlements: {
      settledToday: settlements.length,
      pending: overdue.length,
      overdue: overdue.slice(0, 5),
    },
    topProducts: topProducts(sales),
    trend: salesTrend(trendLines, trendFrom, date),
    ranking: companyWide
      ? null
      : {
          rank: rankIn(board, viewedId),
          of: board.length,
          leader: board[0] ? board[0].name : null,
          leaderIsSelf: board[0] ? board[0].userId === viewedId : false,
        },
    // Amounts per person are company data: staff see the whole board, a SALES
    // account only ever learns its own rank and who is top (above).
    leaderboard: staff ? board : [],
  });
});

module.exports = router;
