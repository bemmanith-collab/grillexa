const jwt = require('jsonwebtoken');
const prisma = require('../db');

// The JWT only proves identity (user id). Role and storeId are re-read from
// the database on every request so that an admin revoking/reassigning a
// user's role or store takes effect immediately, not only after their next login.
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.id }, include: { stores: true } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    storeIds: user.stores.map((s) => s.id),
  };
  next();
}

module.exports = { authenticate };
