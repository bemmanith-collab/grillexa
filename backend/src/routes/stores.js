const express = require('express');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  const stores = await prisma.store.findMany({ include: { salesUsers: true }, orderBy: { name: 'asc' } });
  res.json({
    stores: stores.map(({ salesUsers, ...s }) => ({
      ...s,
      salesUsers: salesUsers.map((u) => ({ id: u.id, name: u.name })),
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

module.exports = router;
