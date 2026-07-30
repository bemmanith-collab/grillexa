require('dotenv').config();
// Express 4 does not forward rejections from async handlers to the error
// middleware — an unhandled rejection kills the process. This patches the
// router so they reach the handler at the bottom of this file instead.
// Remove it if this ever moves to Express 5, which does it natively.
require('express-async-errors');
const express = require('express');
const cors = require('cors');

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

const app = express();

// CORS_ORIGIN accepts a comma-separated list of allowed origins (e.g. the
// Fly.io app URL plus a custom domain). Falls back to "*" so the app still
// works before CORS_ORIGIN is configured, since auth uses a Bearer token
// (not cookies), wildcard origin carries no credential-leak risk here.
const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin:
      allowedOrigins.includes('*')
        ? '*'
        : (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS'));
            }
          },
  })
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
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
