const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { normalizeDate, todayStr } = require('../lib/stock');
const { PRODUCT_ORDER } = require('../lib/catalogue');
const { REASONS, validateLines, summarize } = require('../lib/wastage');

const router = express.Router();

router.use(authenticate);

// End-of-shift wastage: what a salesperson counted as spoiled at the end of
// their run. Storeless on purpose — see the note on the Wastage model in
// schema.prisma. Nothing in this file touches the stock ledger: by the time
// this is counted the goods are back at HQ, which the ledger does not track.

// Everyone posts, including SALES — they are the people doing the counting,
// and it is their shift. There is no store to scope against, so unlike every
// other write in this app there is no assertStoreAccess here: a Sales account
// can write a company-wide row. That is inherent to a storeless count, and the
// reason every row records who counted it.
router.post('/', async (req, res) => {
  const { date, lines } = req.body;

  let normalizedDate;
  try {
    normalizedDate = normalizeDate(date || todayStr());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const products = await prisma.product.findMany({ select: { id: true } });
  const { lines: valid, error } = validateLines(lines, new Set(products.map((p) => p.id)));
  if (error) return res.status(400).json({ error });

  const created = await prisma.wastage.createMany({
    data: valid.map((l) => ({
      date: normalizedDate,
      productId: l.productId,
      quantity: l.quantity,
      reason: l.reason,
      createdById: req.user.id,
    })),
  });

  res.status(201).json({
    recorded: created.count,
    units: valid.reduce((sum, l) => sum + l.quantity, 0),
    date: normalizedDate.toISOString().slice(0, 10),
  });
});

// Company-wide detail, so staff only — the same rule Reports and the Excel
// workbook follow. A salesperson records their own count; what everyone
// together threw away is a manager's number.
router.get('/summary', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  let from;
  let to;
  try {
    from = normalizeDate(req.query.from || todayStr());
    to = normalizeDate(req.query.to || todayStr());
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  if (to < from) return res.status(400).json({ error: 'to is before from' });

  const rows = await prisma.wastage.findMany({
    where: { date: { gte: from, lte: to } },
    include: {
      product: { select: { name: true, costPrice: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  res.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    ...summarize(rows),
    // The raw counts too: "who counted this" is the first question asked of a
    // figure nobody can trace to a store.
    entries: rows.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      productId: r.productId,
      product: r.product?.name,
      quantity: r.quantity,
      reason: r.reason,
      countedBy: r.createdBy?.name,
    })),
  });
});

// The modal needs the product list and the reason list; serving them from here
// keeps the two in step with what POST will accept.
router.get('/products', async (req, res) => {
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: PRODUCT_ORDER,
  });
  res.json({ products, reasons: REASONS });
});

module.exports = router;
