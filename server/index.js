require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const yahooRoutes = require('./routes/yahoo');
const claudeRoutes = require('./routes/claude');
const draftRoutes = require('./routes/draft');
const nflStatsRoutes = require('./routes/nflStats');

const app = express();
const PORT = process.env.PORT || 3001;

// Required for Railway (behind reverse proxy) - enables secure cookies
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(session({
  store: new FileStore({ path: './server/db/sessions', retries: 0, logFn: () => {} }),
  secret: process.env.SESSION_SECRET || 'fantasy-football-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use('/auth', authRoutes);
app.use('/api/yahoo', yahooRoutes);
app.use('/api/claude', claudeRoutes);
app.use('/api/draft', draftRoutes);
app.use('/api/nfl', nflStatsRoutes);

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Fantasy Football Server running on port ${PORT}`);
});
