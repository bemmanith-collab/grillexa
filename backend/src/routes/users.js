const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

function sanitize(user) {
  const { passwordHash, ...rest } = user;
  return { ...rest, store: user.store?.name };
}

// Every route below is Admin-only.
router.use(authenticate, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({ include: { store: true }, orderBy: { createdAt: 'asc' } });
  res.json({ users: users.map(sanitize) });
});

router.post('/', async (req, res) => {
  const { name, email, password, role, storeId } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (role === 'SALES' && !storeId) {
    return res.status(400).json({ error: 'Sales accounts must be assigned to a store' });
  }
  if (storeId) {
    const store = await prisma.store.findUnique({ where: { id: Number(storeId) } });
    if (!store) return res.status(400).json({ error: 'storeId does not exist' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role, storeId: role === 'SALES' ? Number(storeId) : null },
    include: { store: true },
  });
  res.status(201).json({ user: sanitize(user) });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, role, storeId } = req.body;

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
  }
  if (id === req.user.id && role && role !== 'ADMIN') {
    return res.status(400).json({ error: 'You cannot remove your own admin role' });
  }

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ error: 'User not found' });

  const nextRole = role !== undefined ? role : current.role;
  const nextStoreId = storeId !== undefined ? Number(storeId) : current.storeId;

  if (nextRole === 'SALES' && !nextStoreId) {
    return res.status(400).json({ error: 'Sales accounts must be assigned to a store' });
  }
  if (nextStoreId) {
    const store = await prisma.store.findUnique({ where: { id: nextStoreId } });
    if (!store) return res.status(400).json({ error: 'storeId does not exist' });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      role: nextRole,
      storeId: nextRole === 'SALES' ? nextStoreId : null,
    },
    include: { store: true },
  });
  res.json({ user: sanitize(user) });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  try {
    await prisma.user.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    res.status(404).json({ error: 'User not found' });
  }
});

module.exports = router;
