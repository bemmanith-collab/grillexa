const express = require('express');
const { authenticate } = require('../middleware/auth');
const QUOTES = require('../data/grillingQuotes');

const router = express.Router();

router.use(authenticate);

// Every role can pull a quote for the "Daily Grilling Wisdom" widget.
router.get('/random', (req, res) => {
  const pick = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  res.json(pick);
});

module.exports = router;
