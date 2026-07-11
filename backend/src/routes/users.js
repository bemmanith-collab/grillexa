const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const router = express.Router();
const ROLES = ['ADMIN', 'MANAGER', 'SALES'];

function sanitize(user) {
  const { passwordHash, stores, ...rest } = user;
  return { ...rest, stores: (stores || []).map((s) => ({ id: s.id, name: s.name })) };
}

function uniqueIds(storeIds) {
  return [...new Set((Array.isArray(storeIds) ? storeIds : []).map(Number))];
}

// Stores can be shared across sales users (e.g. someone covering for a
// colleague), so this only checks the ids actually exist.
async function validateStoreIds(storeIds) {
  if (storeIds.length === 0) return null;
  const stores = await prisma.store.findMany({ where: { id: { in: storeIds } } });
  if (stores.length !== storeIds.length) return 'One or more storeIds do not exist';
  return null;
}

// Every route below is Admin-only.
router.use(authenticate, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const users = await prisma.user.findMany({ include: { stores: true }, orderBy: { createdAt: 'asc' } });
  res.json({ users: users.map(sanitize) });
});

router.post('/', async (req, res) => {
  const { name, email, password, role, storeIds } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const ids = uniqueIds(storeIds);
  if (role === 'SALES' && ids.length === 0) {
    return res.status(400).json({ error: 'Sales accounts must be assigned at least one store' });
  }
  const storeError = await validateStoreIds(ids);
  if (storeError) return res.status(400).json({ error: storeError });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      stores: role === 'SALES' ? { connect: ids.map((id) => ({ id })) } : undefined,
    },
    include: { stores: true },
  });
  res.status(201).json({ user: sanitize(user) });
});

router.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, email, role, storeIds } = req.body;

  if (role && !ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
  }
  if (id === req.user.id && role && role !== 'ADMIN') {
    return res.status(400).json({ error: 'You cannot remove your own admin role' });
  }

  const current = await prisma.user.findUnique({ where: { id }, include: { stores: true } });
  if (!current) return res.status(404).json({ error: 'User not found' });

  const nextRole = role !== undefined ? role : current.role;
  const nextIds = storeIds !== undefined ? uniqueIds(storeIds) : current.stores.map((s) => s.id);

  if (nextRole === 'SALES' && nextIds.length === 0) {
    return res.status(400).json({ error: 'Sales accounts must be assigned at least one store' });
  }
  const storeError = await validateStoreIds(nextIds);
  if (storeError) return res.status(400).json({ error: storeError });

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(email !== undefined && { email }),
      role: nextRole,
      stores: { set: nextRole === 'SALES' ? nextIds.map((sid) => ({ id: sid })) : [] },
    },
    include: { stores: true },
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
