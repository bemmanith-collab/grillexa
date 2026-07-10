const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticate);

// Product catalog (name/sku/price/reorder threshold). Actual quantities live
// per-store-per-day in the DailyStockEntry ledger — see routes/stock.js.
// Financial data (price) is stripped for Sales at the API layer, not just
// hidden in the UI, so the restriction can't be bypassed by calling the API directly.
function shapeProduct(product, role) {
  const base = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    threshold: product.threshold,
  };
  if (role !== 'SALES') {
    base.price = product.price;
  }
  return base;
}

router.get('/', async (req, res) => {
  const products = await prisma.product.findMany({ orderBy: { name: 'asc' } });
  res.json({ products: products.map((p) => shapeProduct(p, req.user.role)) });
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req, res) => {
  const { name, sku, threshold, price } = req.body;
  if (!name || !sku) {
    return res.status(400).json({ error: 'name and sku are required' });
  }
  try {
    const product = await prisma.product.create({
      data: {
        name,
        sku,
        threshold: threshold != null ? Number(threshold) : 10,
        price: price != null ? Number(price) : 0,
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
  const { name, sku, threshold, price } = req.body;
  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(sku !== undefined && { sku }),
        ...(threshold !== undefined && { threshold: Number(threshold) }),
        ...(price !== undefined && { price: Number(price) }),
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
