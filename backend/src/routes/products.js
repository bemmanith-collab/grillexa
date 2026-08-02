const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { PRODUCT_ORDER } = require('../lib/catalogue');

const router = express.Router();

router.use(authenticate);

// Product catalog (name/sku/price/cost). Actual quantities live
// per-store-per-day in the DailyStockEntry ledger — see routes/stock.js.
// The reorder threshold is gone: it only ever fed the low-stock badge, which
// was reading a closing balance nothing maintains. The column stays in the
// schema with its default, so no migration is needed.
// Financial data (price, costPrice) is stripped for Sales at the API layer,
// not just hidden in the UI, so the restriction can't be bypassed by calling
// the API directly. costPrice is margin-sensitive so it's held to the same bar.
function shapeProduct(product, role) {
  const base = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    // Not financial and not secret — it is just where the row sits in a list,
    // and the Products page needs it to show what it is editing.
    sortOrder: product.sortOrder,
  };
  if (role !== 'SALES') {
    base.price = product.price;
    base.costPrice = product.costPrice;
  }
  return base;
}

// undefined means "not supplied, leave it alone"; an Error means reject.
// Number('') is 0, which would silently move a product to the top of every
// list because someone cleared the field.
function sortOrderOf(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return new Error('sortOrder must be a whole number, 0 or more');
  return n;
}

router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: PRODUCT_ORDER });
  res.json({ products: products.map((p) => shapeProduct(p, req.user.role)) });
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, sku, price, costPrice, sortOrder } = req.body;
  if (!name || !sku) {
    return res.status(400).json({ error: 'name and sku are required' });
  }
  const order = sortOrderOf(sortOrder);
  if (order instanceof Error) return res.status(400).json({ error: order.message });
  try {
    const product = await prisma.product.create({
      data: {
        name,
        sku,
        price: price != null ? Number(price) : 0,
        costPrice: costPrice != null ? Number(costPrice) : 0,
        ...(order !== undefined && { sortOrder: order }),
      },
    });
    res.status(201).json({ product: shapeProduct(product, req.user.role) });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A product with this SKU already exists' });
    }
    throw err;
  }
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, sku, price, costPrice, sortOrder } = req.body;
  const order = sortOrderOf(sortOrder);
  if (order instanceof Error) return res.status(400).json({ error: order.message });
  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(sku !== undefined && { sku }),
        ...(price !== undefined && { price: Number(price) }),
        ...(costPrice !== undefined && { costPrice: Number(costPrice) }),
        ...(order !== undefined && { sortOrder: order }),
      },
    });
    res.json({ product: shapeProduct(product, req.user.role) });
  } catch (err) {
    res.status(404).json({ error: 'Product not found' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.product.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: 'Product not found' });
  }
});

module.exports = router;
