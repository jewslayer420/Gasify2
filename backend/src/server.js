require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');

const stationsRouter = require('./routes/stations');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const newsRouter = require('./routes/news');
const { startSyncScheduler } = require('./services/sync');

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

app.use('/api/stations', stationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/user', usersRouter);
app.use('/api/news', newsRouter);

app.listen(PORT, () => {
  console.log(`Gasify API running on port ${PORT}`);
  startSyncScheduler();
});
