require('dotenv').config();
// Express 4 does not forward rejections from async handlers to the error
// middleware — an unhandled rejection kills the process. This patches the
// router so they reach the handler at the bottom of this file instead.
// Remove it if this ever moves to Express 5, which does it natively.
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const reportRoutes = require('./routes/reports');
const stockRoutes = require('./routes/stock');
const dispatchRoutes = require('./routes/dispatches');
const salesRoutes = require('./routes/sales');
const returnRoutes = require('./routes/returns');
const quoteRoutes = require('./routes/quotes');
const consignmentRoutes = require('./routes/consignments');
const importRoutes = require('./routes/import');
const dashboardRoutes = require('./routes/dashboard');
const wastageRoutes = require('./routes/wastage');
const pushRoutes = require('./routes/push');
const whatsappRoutes = require('./routes/whatsapp');
const teamChatRoutes = require('./routes/teamChat');

const app = express();

// Nginx is the only hop in front of Node (see nginx.conf, which sets
// X-Forwarded-For). Without this every request looks like it came from
// 127.0.0.1, so the rate limiter below would count the whole shop as one
// client and lock everyone out together.
app.set('trust proxy', 1);

// Security headers are set once, by Nginx, for everything it serves —
// including proxied API responses (verified against the live host). helmet was
// added here first and then removed: it duplicated every header and disagreed
// with one of them, sending both X-Frame-Options SAMEORIGIN and DENY. Node is
// only reachable through Nginx, so one source is correct and two is a bug
// waiting to be debugged.

// Login is the one unauthenticated endpoint that guesses a secret, so it is
// the one worth limiting. Deliberately generous, and counting failures only:
// a whole shop shares one connection, and staff logging in successfully must
// never eat into the budget that stops someone guessing passwords.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many failed attempts. Wait a few minutes and try again.' },
});

// CORS_ORIGIN accepts a comma-separated list of allowed origins (e.g. the
// Fly.io app URL plus a custom domain). Falls back to "*" so the app still
// works before CORS_ORIGIN is configured, since auth uses a Bearer token
// (not cookies), wildcard origin carries no credential-leak risk here.
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// credentials: true is required now that the session is a cookie — without it
// the browser will not send it on cross-origin calls. That also rules out a
// literal '*' origin, which browsers reject alongside credentials; `true`
// reflects the caller's origin instead, which is valid.
// In production none of this is exercised: Nginx serves the app and the API
// from one origin, so nothing is cross-origin.
app.use(
  cors({
    credentials: true,
    origin:
      allowedOrigins.includes('*')
        ? true
        : (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS'));
            }
          },
  })
);
app.use(cookieParser());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dispatches', dispatchRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/consignments', consignmentRoutes);
app.use('/api/import', importRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/wastage', wastageRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/team-chat', teamChatRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// err.status marks an error as deliberate and safe to show the user (see
// lib/scope.js, lib/stock.js). Anything else is a bug: log it, but never
// return the message, which may carry Prisma model/field internals.
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
