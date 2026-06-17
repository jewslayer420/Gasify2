require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const stationsRouter = require('./routes/stations');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const newsRouter = require('./routes/news');
const { startSyncScheduler, triggerSync } = require('./services/sync');
const { priceFreshness, runPriceFreshnessCheck } = require('./services/price_freshness');
const { probePeru } = require('./services/probes/peru'); // TEMP — remove after Peru scraper is built

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3001;

app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Admin: trigger a named scraper on demand and return results
// Usage: POST /api/admin/sync/norway  (no auth — internal/debugging use only)
app.post('/api/admin/sync/:country', async (req, res) => {
  const country = req.params.country.toLowerCase();
  try {
    const result = await triggerSync(country);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: manual-price freshness. GET = full table; ?run=1 also emails an alert if stale.
app.get('/api/admin/price-freshness', async (req, res) => {
  try {
    if (req.query.run === '1') return res.json(await runPriceFreshnessCheck());
    const all = priceFreshness();
    res.json({ total: all.length, stale: all.filter(c => c.stale).length, prices: all });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMP — Peru reachability + schema-discovery probe (delete with probes/peru.js once Peru scraper lands)
app.get('/api/admin/probe/peru', async (req, res) => {
  try {
    res.json(await probePeru());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/stations', stationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/user', usersRouter);
app.use('/api/news', newsRouter);

app.listen(PORT, () => {
  console.log(`Gasify API running on port ${PORT}`);
  startSyncScheduler();
});
