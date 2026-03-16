const express = require('express');
const router = express.Router();
const db = require('../db/database');
const brain = require('../services/fantasyBrain');

// Load draft board
router.get('/board', (req, res) => {
  const all = db.prepare('SELECT * FROM draft_board').all();
  const drafted = db.prepare('SELECT COUNT(*) as count FROM draft_board WHERE drafted = 1').get();
  const myPicks = db.prepare("SELECT COUNT(*) as count FROM draft_board WHERE drafted_by = 'me'").get();
  res.json({ players: all, totalDrafted: drafted?.count || 0, myPicks: myPicks?.count || 0 });
});

// Import players to board
router.post('/import', (req, res) => {
  const { players } = req.body;
  if (!players || !Array.isArray(players)) return res.status(400).json({ error: 'players array required' });

  players.forEach(p => {
    db.prepare(`INSERT OR IGNORE INTO draft_board (player_key, player_name, position, team, adp) VALUES (?, ?, ?, ?, ?)`)
      .run(p.player_key || p.key, p.player_name || p.name, p.position, p.team, p.adp || p.average_draft_pick || 999);
  });

  const count = db.prepare('SELECT COUNT(*) as count FROM draft_board').get();
  res.json({ success: true, total: count?.count || 0 });
});

// Mark player as drafted
router.post('/pick', (req, res) => {
  const { player_key, drafted_by, round, pick } = req.body;
  db.prepare('UPDATE draft_board SET drafted = 1, drafted_by = ?, draft_round = ?, draft_pick = ? WHERE player_key = ?')
    .run(drafted_by || 'other', round, pick, player_key);
  res.json({ success: true });
});

// Undo pick
router.post('/undo', (req, res) => {
  const { player_key } = req.body;
  db.prepare('UPDATE draft_board SET drafted = 0, drafted_by = NULL, draft_round = NULL, draft_pick = NULL WHERE player_key = ?')
    .run(player_key);
  res.json({ success: true });
});

// Reset board
router.post('/reset', (req, res) => {
  db.prepare('DELETE FROM draft_board').run();
  res.json({ success: true });
});

// Get my drafted players
router.get('/mypicks', (req, res) => {
  const picks = db.prepare("SELECT * FROM draft_board WHERE drafted_by = 'me' ORDER BY draft_pick ASC").all();
  res.json(picks);
});

// Available players by position
router.get('/available', (req, res) => {
  const { position } = req.query;
  let players;
  if (position && position !== 'ALL') {
    players = db.prepare(`SELECT * FROM draft_board WHERE drafted = 0 AND position LIKE '%${position}%' ORDER BY adp ASC`).all();
  } else {
    players = db.prepare('SELECT * FROM draft_board WHERE drafted = 0 ORDER BY adp ASC').all();
  }

  // Enrich with VOR and scarcity
  const enriched = players.map(p => ({
    ...p,
    vor: brain.calculateVOR(p.stats || {}, p.position, 12),
    scarcity: brain.getPositionalScarcity(p.position, 12),
  }));

  res.json(enriched);
});

module.exports = router;
