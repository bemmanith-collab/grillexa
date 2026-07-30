const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// The token only needs to prove identity — role/storeId are read fresh from
// the database on every request (see middleware/auth.js) so permission
// changes take effect immediately instead of waiting for the token to expire.
function signToken(user) {
  return jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

// Credentials go straight into a Prisma where clause and into bcrypt, both of
// which throw on a non-string (e.g. {"email": 5}). Reject anything that isn't
// a non-empty string before it gets there.
function missingString(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value !== 'string' || !value) return `${key} is required`;
  }
  return null;
}

function sanitize(user) {
  const { passwordHash, stores, ...rest } = user;
  return { ...rest, stores: (stores || []).map((s) => ({ id: s.id, name: s.name })) };
}

// Public signup was removed. It was unauthenticated and linked from the login
// page, so anyone who found the URL could mint a valid token and read every
// store name, address and product in the catalogue. Admins create accounts
// through POST /api/users, which validates properly and assigns stores.

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const missing = missingString({ email, password });
  if (missing) return res.status(400).json({ error: missing });
  const user = await prisma.user.findUnique({ where: { email }, include: { stores: true } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = signToken(user);
  res.json({ token, user: sanitize(user) });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { stores: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: sanitize(user) });
});

router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const missing = missingString({ currentPassword, newPassword });
  if (missing) return res.status(400).json({ error: missing });
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});

module.exports = router;
