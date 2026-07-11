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

function sanitize(user) {
  const { passwordHash, stores, ...rest } = user;
  return { ...rest, stores: (stores || []).map((s) => ({ id: s.id, name: s.name })) };
}

router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // Public signup always creates a SALES account; an Admin must promote via the Users page.
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'SALES' },
    include: { stores: true },
  });
  const token = signToken(user);
  res.status(201).json({ token, user: sanitize(user) });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
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

module.exports = router;
