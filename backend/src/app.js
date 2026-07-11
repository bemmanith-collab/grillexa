require('dotenv').config();
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

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
