const jwt = require('jsonwebtoken');
const prisma = require('../db');
const { resolveStoreIds } = require('../lib/scope');

const TOKEN_COOKIE = 'grillexa_session';

// sameSite 'strict' is the CSRF defence: the browser will not attach this
// cookie to a request originating from another site, so a hostile page cannot
// make an authenticated call on a logged-in user's behalf. Nginx serves the
// app and API from one origin, so nothing legitimate is cross-site.
//
// secure only in production: over plain http://localhost a Secure cookie is
// accepted by Chrome but not by every browser, and local dev has no TLS.
function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

// The JWT only proves identity (user id). Role and storeId are re-read from
// the database on every request so that an admin revoking/reassigning a
// user's role or store takes effect immediately, not only after their next login.
async function authenticate(req, res, next) {
  // The token arrives in an httpOnly cookie, so no script on the page can read
  // it — not the app's own, and not one injected through an XSS. It used to
  // live in localStorage, where a single injected script could lift a valid
  // session and use it from anywhere.
  const token = req.cookies?.[TOKEN_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Not signed in' });
  }
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

  // "All stores" is resolved here, once, rather than at every place that
  // filters by storeIds — and there are a dozen of those. Doing it in one place
  // is also what makes the promise true: the list is rebuilt on every request,
  // so a shop opened this morning is already covered without anyone reopening
  // the assignment dialog.
  //
  // One extra query, only for accounts that carry the flag, returning ids for a
  // table with fewer than a hundred rows.
  const storeIds = resolveStoreIds(
    user,
    user.allStores ? (await prisma.store.findMany({ select: { id: true } })).map((s) => s.id) : []
  );

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    allStores: user.allStores,
    storeIds,
  };
  next();
}

module.exports = { authenticate, TOKEN_COOKIE, cookieOptions };
