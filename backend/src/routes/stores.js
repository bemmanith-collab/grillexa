const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticate);

// A SALES account sees only its own stores, and never who else is assigned to
// them. This used to return every store's name and address plus the names of
// all sales staff to anyone logged in — the whole customer list and the staff
// directory, to an account that can only bill for one shop. Admin and Manager
// work across stores, so they still get everything.
router.get('/', async (req, res) => {
  const scoped = req.user.role === 'SALES';
  const stores = await prisma.store.findMany({
    where: scoped ? { id: { in: req.user.storeIds } } : {},
    include: { salesUsers: !scoped },
    orderBy: { name: 'asc' },
  });
  res.json({
    stores: stores.map(({ salesUsers, ...s }) => ({
      ...s,
      ...(scoped ? {} : { salesUsers: (salesUsers || []).map((u) => ({ id: u.id, name: u.name })) }),
    })),
  });
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const store = await prisma.store.create({ data: { name, address } });
    res.status(201).json({ store });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A store with this name already exists' });
    }
    throw err;
  }
});

router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  const { name, address } = req.body;
  try {
    const store = await prisma.store.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
      },
    });
    res.json({ store });
  } catch (err) {
    res.status(404).json({ error: 'Store not found' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const id = Number(req.params.id);
  try {
    await prisma.store.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2003') {
      return res.status(409).json({ error: 'Cannot delete a store with existing sales, dispatch, or stock history' });
    }
    res.status(404).json({ error: 'Store not found' });
  }
});

module.exports = router;
