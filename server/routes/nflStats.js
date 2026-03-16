const express = require('express');
const router = express.Router();
const nflStats = require('../services/nflStatsService');
const brain = require('../services/fantasyBrain');

// GET /api/nfl/player/:name/stats
router.get('/player/:name/stats', async (req, res) => {
  try {
    const { name } = req.params;
    const season = parseInt(req.query.season) || 2025;

    const playerData = await nflStats.getPlayerSeasonStats(name, season);
    if (!playerData) {
      return res.status(404).json({ error: `Player "${name}" not found for ${season}` });
    }

    const intelligence = brain.generatePlayerIntelligence(playerData);

    res.json({
      ...playerData,
      intelligence,
    });
  } catch (err) {
    console.error('[NFL Stats] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nfl/bulk-stats
router.post('/bulk-stats', async (req, res) => {
  try {
    const { players = [], season = 2025 } = req.body;

    const results = await nflStats.getBulkPlayerStats(players, season);

    const enriched = {};
    for (const [name, data] of Object.entries(results)) {
      enriched[name] = {
        ...data,
        intelligence: brain.generatePlayerIntelligence(data),
      };
    }

    res.json({
      found: Object.keys(enriched).length,
      total: players.length,
      players: enriched,
    });
  } catch (err) {
    console.error('[NFL Stats] Bulk error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfl/player/:name/trends
router.get('/player/:name/trends', async (req, res) => {
  try {
    const { name } = req.params;
    const seasons = (req.query.seasons || '2023,2024,2025').split(',').map(Number);

    const multiSeason = await nflStats.getMultiSeasonStats(name, seasons);
    if (!multiSeason || Object.keys(multiSeason.seasonStats || {}).length === 0) {
      return res.status(404).json({ error: `No multi-season data found for "${name}"` });
    }

    res.json(multiSeason);
  } catch (err) {
    console.error('[NFL Stats] Trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
