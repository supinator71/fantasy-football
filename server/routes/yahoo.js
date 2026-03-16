const express = require('express');
const router = express.Router();
const yahoo = require('../services/yahooService');
const cache = require('../services/cache');
const db = require('../db/database');

// TTLs (ms)
const TTL = {
  LEAGUES:    5  * 60 * 1000,
  LEAGUE:     5  * 60 * 1000,
  MATCHUP:    5  * 60 * 1000,
  SCOREBOARD: 5  * 60 * 1000,
  PLAYERS:    15 * 60 * 1000,
  TRENDS:     15 * 60 * 1000,
  STATS:      15 * 60 * 1000,
  ROSTER:     15 * 60 * 1000,
  DRAFT:      5  * 60 * 1000,
  TXNS:       15 * 60 * 1000,
  STANDINGS:  30 * 60 * 1000,
}

function requireAuth(req, res, next) {
  const row = db.prepare('SELECT * FROM tokens WHERE id = 1').get();
  if (!row) return res.status(401).json({ error: 'Not authenticated. Please login with Yahoo.' });
  next();
}

async function withCache(res, key, ttlMs, force, fn) {
  if (!force) {
    const entry = cache.get(key)
    if (entry) {
      res.set('X-Cache-Hit', 'true')
      res.set('X-Cache-Updated', entry.cachedAt)
      return entry.value
    }
  }
  const data = await fn()
  const cachedAt = new Date().toISOString()
  cache.set(key, data, ttlMs)
  res.set('X-Cache-Hit', 'false')
  res.set('X-Cache-Updated', cachedAt)
  return data
}

// ── Cache management ───────────────────────────────────────────────────────────
router.get('/cache/stats', (req, res) => res.json(cache.stats()))

router.post('/cache/clear', (req, res) => {
  cache.clear(req.body?.key || undefined)
  res.json({ success: true })
})

// ── League routes ──────────────────────────────────────────────────────────────
router.get('/leagues', requireAuth, async (req, res) => {
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, 'leagues', TTL.LEAGUES, force, () => yahoo.getLeagues())
    res.json(data)
  } catch (err) {
    console.error('Error in /leagues endpoint:', err.message, err.response?.data || '');
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `league:${leagueKey}`, TTL.LEAGUE, force,
      () => yahoo.getLeague(leagueKey))

    const settingsArr = data?.[1]?.settings?.[0];
    const rosterArr = settingsArr?.roster_positions?.[0]?.roster_position || Object.values(settingsArr?.roster_positions || {}).filter(v => v.position);
    const statsArr = settingsArr?.stat_categories?.stats || settingsArr?.stat_categories?.[0]?.stats || Object.values(settingsArr?.stat_categories || {}).filter(v => v.stat);

    const roster_slots = {};
    if (Array.isArray(rosterArr)) {
      rosterArr.forEach(r => {
        const pos = r.position || r.roster_position?.position || r.roster_position?.[0]?.position;
        const count = parseInt(r.count || r.roster_position?.count || r.roster_position?.[0]?.count || 1);
        if (pos) roster_slots[pos] = (roster_slots[pos] || 0) + count;
      });
    }

    const stat_categories = [];
    if (Array.isArray(statsArr)) {
      statsArr.forEach(s => {
        const name = s.stat?.name || s.stat?.[0]?.name;
        if (name) stat_categories.push(name);
      });
    }

    res.json({
      league_key: leagueKey,
      league_name: data?.[0]?.name || '',
      num_teams: parseInt(data?.[0]?.num_teams || 12),
      scoring_type: data?.[0]?.scoring_type || 'Head-to-Head (Points)',
      draft_type: data?.[0]?.draft_type || 'Snake',
      roster_slots: Object.keys(roster_slots).length ? roster_slots : undefined,
      stat_categories: stat_categories.length ? stat_categories : undefined
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/roster', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `roster:${leagueKey}:mine`, TTL.ROSTER, force, async () => {
      const myTeamKey = await yahoo.getUserTeamKey(leagueKey);
      if (!myTeamKey) throw new Error('Could not find your team in this league.');
      return yahoo.getRoster(leagueKey, myTeamKey);
    })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// My roster as flat player array (for AI features)
router.get('/league/:leagueKey/myroster', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const result = await withCache(res, `myroster:${leagueKey}`, TTL.ROSTER, force, async () => {
      const myTeamKey = await yahoo.getUserTeamKey(leagueKey)
      if (!myTeamKey) return { players: [], teamKey: null }
      const rosterData = await yahoo.getRoster(leagueKey, myTeamKey)
      const playerKeys = []
      for (const rosterItem of (rosterData || [])) {
        const p = rosterItem?.player
        if (p && Array.isArray(p)) {
          const infoArray = Array.isArray(p[0]) ? p[0] : []
          const info = Object.assign({}, ...infoArray)
          if (info.player_key) playerKeys.push(info.player_key)
        }
      }
      if (!playerKeys.length) return { players: [], teamKey: myTeamKey }
      const players = await yahoo.getBatchPlayerStats(leagueKey, playerKeys, null)
      return { players, teamKey: myTeamKey }
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/standings', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `standings:${leagueKey}`, TTL.STANDINGS, force,
      () => yahoo.getStandings(leagueKey))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/scoreboard', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `scoreboard:${leagueKey}`, TTL.SCOREBOARD, force,
      () => yahoo.getScoreboard(leagueKey))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/players', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const { status = 'A', start = 0 } = req.query
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `players:${leagueKey}:${status}:${start}`, TTL.PLAYERS, force,
      () => yahoo.getPlayers(leagueKey, status, start))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/draft', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `draft:${leagueKey}`, TTL.DRAFT, force,
      () => yahoo.getDraftResults(leagueKey))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/transactions', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `txns:${leagueKey}`, TTL.TXNS, force,
      () => yahoo.getTransactions(leagueKey))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/:leagueKey/player/:playerKey/stats', requireAuth, async (req, res) => {
  const { leagueKey, playerKey } = req.params
  const force = req.query.force === 'true'
  try {
    const data = await withCache(res, `playerstats:${leagueKey}:${playerKey}`, TTL.STATS, force,
      () => yahoo.getPlayerStats(leagueKey, playerKey))
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Matchup ───────────────────────────────────────────────────────────────────
// Yahoo NFL stat IDs → readable names
const STAT_NAMES = {
  '4': 'Pass Yds', '5': 'Pass TDs', '6': 'INTs',
  '9': 'Rush Yds', '10': 'Rush TDs',
  '11': 'Rec', '12': 'Rec Yds', '13': 'Rec TDs',
  '15': 'Ret TDs', '18': 'Fum Lost',
  '19': 'FG 0-19', '20': 'FG 20-29', '21': 'FG 30-39', '22': 'FG 40-49', '23': 'FG 50+',
  '29': 'PAT Made',
  '31': 'Pts Allowed', '32': 'Sacks', '33': 'INT (DEF)', '34': 'Fum Rec',
  '35': 'TD (DEF)', '36': 'Safeties', '37': 'Blk Kick',
  '57': 'Points', '78': '2-PT Conv',
  '1': 'GP', '2': 'Pass Att', '3': 'Pass Comp',
}
const LOWER_IS_BETTER = new Set(['6', '18', '31'])

router.get('/league/:leagueKey/matchup', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const result = await withCache(res, `matchup:${leagueKey}`, TTL.MATCHUP, force, async () => {
      const [matchups, myTeamKey] = await Promise.all([
        yahoo.getScoreboard(leagueKey),
        yahoo.getUserTeamKey(leagueKey)
      ])

      if (!matchups) throw new Error('No matchup data available')

      let totalMatchups = parseInt(matchups['@attributes']?.count) || 0
      if (!totalMatchups) {
        totalMatchups = Object.keys(matchups).filter(k => /^\d+$/.test(k)).length;
      }
      const week = matchups['@attributes']?.week || null

      function extractTeamsFromMatchup(m) {
        if (!m) return null;
        if (m.teams) return m.teams;
        if (Array.isArray(m)) {
          for (const item of m) {
            if (item?.teams) return item.teams;
          }
        }
        for (const key of Object.keys(m)) {
          if (m[key]?.teams) return m[key].teams;
        }
        return null;
      }

      function getMatchupEntry(idx) {
        const raw = matchups[idx] || matchups[String(idx)];
        if (!raw) return null;
        return raw.matchup || raw;
      }

      function extractTeamKey(teamData) {
        if (!teamData) return null;
        const teamArr = teamData.team || teamData;
        if (!Array.isArray(teamArr)) return teamData.team_key;
        const first = teamArr[0];
        if (Array.isArray(first)) {
          return Object.assign({}, ...first)?.team_key;
        }
        return first?.team_key;
      }

      function getTeamEntries(teamsObj) {
        if (!teamsObj) return [];
        const entries = [];

        const numericKeys = Object.keys(teamsObj).filter(k => /^\d+$/.test(k)).sort((a,b) => a-b);

        if (numericKeys.length > 0) {
          for (const k of numericKeys) {
            if (teamsObj[k]) entries.push(teamsObj[k]);
          }
        }

        if (!entries.length && Array.isArray(teamsObj)) {
          entries.push(...teamsObj);
        }

        if (!entries.length && teamsObj.team) {
          if (Array.isArray(teamsObj.team)) {
            if (teamsObj.team[0] && !Array.isArray(teamsObj.team[0]) && teamsObj.team[0].team_key) {
              entries.push({ team: teamsObj.team });
            } else {
              for (const t of teamsObj.team) {
                entries.push({ team: Array.isArray(t) ? t : [t] });
              }
            }
          }
        }

        return entries;
      }

      let foundMatchup = null
      for (let i = 0; i < totalMatchups; i++) {
        const matchupData = getMatchupEntry(i);
        if (!matchupData) continue;
        const teamsObj = extractTeamsFromMatchup(matchupData);
        if (!teamsObj) continue;

        const teamEntries = getTeamEntries(teamsObj);
        for (const entry of teamEntries) {
          const key = extractTeamKey(entry);
          if (myTeamKey && key === myTeamKey) { foundMatchup = matchupData; break; }
        }
        if (foundMatchup) break;
      }

      if (!foundMatchup) {
        foundMatchup = getMatchupEntry(0);
      }
      if (!foundMatchup) throw new Error('No matchup found')

      const teamsObj = extractTeamsFromMatchup(foundMatchup);
      const teamEntries = getTeamEntries(teamsObj);

      const parsedTeams = []
      for (let j = 0; j < teamEntries.length; j++) {
        const entry = teamEntries[j];
        const teamArr = entry?.team;
        if (!teamArr || !Array.isArray(teamArr)) continue;

        let info = {};
        if (Array.isArray(teamArr[0])) {
          info = Object.assign({}, ...teamArr[0]);
        } else {
          info = teamArr[0] || {};
        }

        let statsObj = {};
        for (let k = 1; k < teamArr.length; k++) {
          if (teamArr[k]?.team_stats) { statsObj = teamArr[k].team_stats; break; }
          if (teamArr[k]?.team_points) { statsObj = teamArr[k].team_points; break; }
        }

        const statsArr = statsObj.stats || []
        const stats = statsArr
          .map(s => s.stat || s)
          .filter(s => s.stat_id !== undefined && s.value !== undefined)
          .map(s => ({ stat_id: String(s.stat_id), name: STAT_NAMES[String(s.stat_id)] || String(s.stat_id), value: s.value }))

        let manager = '';
        const managers = info.managers;
        if (managers) {
          if (Array.isArray(managers)) {
            manager = managers[0]?.manager?.nickname || managers[0]?.nickname || '';
          } else if (managers.manager) {
            manager = managers.manager?.nickname || '';
          }
        }

        parsedTeams.push({
          key: info.team_key,
          name: info.name || `Team ${j + 1}`,
          manager,
          stats
        })
      }

      const myIdx = myTeamKey ? parsedTeams.findIndex(t => t.key === myTeamKey) : 0
      const myTeam = parsedTeams[myIdx >= 0 ? myIdx : 0]
      const opponent = parsedTeams[myIdx === 0 ? 1 : 0]

      // For NFL points-based leagues, total points is the main comparison
      const totalPointsStat = myTeam?.stats?.find(s => s.stat_id === '57') || null
      const oppPointsStat = opponent?.stats?.find(s => s.stat_id === '57') || null

      const statMap = {}
      ;(myTeam?.stats || []).forEach(s => { statMap[s.stat_id] = { ...s, my_value: s.value } })
      ;(opponent?.stats || []).forEach(s => {
        if (statMap[s.stat_id]) statMap[s.stat_id].opp_value = s.value
        else statMap[s.stat_id] = { stat_id: s.stat_id, name: s.name, opp_value: s.value }
      })

      const statComparison = Object.values(statMap).map(s => {
        const myVal = parseFloat(s.my_value) || 0
        const oppVal = parseFloat(s.opp_value) || 0
        const lowerBetter = LOWER_IS_BETTER.has(s.stat_id)
        return {
          ...s,
          my_winning: myVal !== oppVal && (lowerBetter ? myVal < oppVal : myVal > oppVal),
          opp_winning: myVal !== oppVal && (lowerBetter ? oppVal < myVal : oppVal > myVal)
        }
      })

      return { week: week || foundMatchup.week, myTeam, opponent, stats: statComparison }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Trends ────────────────────────────────────────────────────────────────────
function calculateTrend(seasonStats, recentStats, position) {
  const hasRecent = Object.values(recentStats || {}).some(v => parseFloat(v) > 0)
  if (!hasRecent) return 'cold'

  const pos = String(position || '').toUpperCase()
  const isDefense = pos === 'DEF' || pos === 'D/ST'
  const isKicker = pos === 'K'
  let delta = 0
  let components = 0

  if (isDefense || isKicker) {
    // Simplified trend for DEF/K — just compare total points
    const sPts = parseFloat(seasonStats?.['57']); const rPts = parseFloat(recentStats?.['57'])
    if (rPts && sPts && sPts > 0) { delta += (rPts - sPts) / Math.max(sPts, 1) * 100; components++ }
  } else {
    // Offensive players — compare key stats
    // Passing yards
    const sPassYds = parseFloat(seasonStats?.['4']); const rPassYds = parseFloat(recentStats?.['4'])
    if (rPassYds && sPassYds && sPassYds > 0) { delta += (rPassYds - sPassYds) / sPassYds * 100; components++ }
    // Pass TDs
    const sPassTDs = parseFloat(seasonStats?.['5']); const rPassTDs = parseFloat(recentStats?.['5'])
    if (rPassTDs !== undefined && sPassTDs !== undefined && sPassTDs >= 0) { delta += (rPassTDs - sPassTDs) / Math.max(sPassTDs, 1) * 50; components++ }
    // Rush yards
    const sRushYds = parseFloat(seasonStats?.['9']); const rRushYds = parseFloat(recentStats?.['9'])
    if (rRushYds && sRushYds && sRushYds > 0) { delta += (rRushYds - sRushYds) / sRushYds * 100; components++ }
    // Rush TDs
    const sRushTDs = parseFloat(seasonStats?.['10']); const rRushTDs = parseFloat(recentStats?.['10'])
    if (rRushTDs !== undefined && sRushTDs !== undefined && sRushTDs >= 0) { delta += (rRushTDs - sRushTDs) / Math.max(sRushTDs, 1) * 50; components++ }
    // Receptions
    const sRec = parseFloat(seasonStats?.['11']); const rRec = parseFloat(recentStats?.['11'])
    if (rRec && sRec && sRec > 0) { delta += (rRec - sRec) / sRec * 80; components++ }
    // Receiving yards
    const sRecYds = parseFloat(seasonStats?.['12']); const rRecYds = parseFloat(recentStats?.['12'])
    if (rRecYds && sRecYds && sRecYds > 0) { delta += (rRecYds - sRecYds) / sRecYds * 100; components++ }
    // Rec TDs
    const sRecTDs = parseFloat(seasonStats?.['13']); const rRecTDs = parseFloat(recentStats?.['13'])
    if (rRecTDs !== undefined && sRecTDs !== undefined && sRecTDs >= 0) { delta += (rRecTDs - sRecTDs) / Math.max(sRecTDs, 1) * 50; components++ }
  }

  if (components === 0) return 'neutral'
  const score = delta / components
  if (score > 20) return 'hot'
  if (score > 7)  return 'rising'
  if (score >= -7) return 'neutral'
  return 'cold'
}

function trendDisplayStats(recentStats, seasonStats, position) {
  const pos = String(position || '').toUpperCase()
  const isDefense = pos === 'DEF' || pos === 'D/ST'
  const isKicker = pos === 'K'

  if (isDefense) {
    return [
      { label: 'Pts Allowed', recent: recentStats?.['31'], season: seasonStats?.['31'], lowerBetter: true },
      { label: 'Sacks',       recent: recentStats?.['32'], season: seasonStats?.['32'] },
      { label: 'INTs',        recent: recentStats?.['33'], season: seasonStats?.['33'] },
      { label: 'TDs',         recent: recentStats?.['35'], season: seasonStats?.['35'] },
    ].filter(s => s.recent !== undefined || s.season !== undefined)
  }

  if (isKicker) {
    return [
      { label: 'FG 30-39', recent: recentStats?.['21'], season: seasonStats?.['21'] },
      { label: 'FG 40-49', recent: recentStats?.['22'], season: seasonStats?.['22'] },
      { label: 'FG 50+',   recent: recentStats?.['23'], season: seasonStats?.['23'] },
      { label: 'PAT',      recent: recentStats?.['29'], season: seasonStats?.['29'] },
    ].filter(s => s.recent !== undefined || s.season !== undefined)
  }

  // Determine position type for stat display
  const isQB = pos.includes('QB')
  if (isQB) {
    return [
      { label: 'Pass Yds', recent: recentStats?.['4'],  season: seasonStats?.['4'] },
      { label: 'Pass TDs', recent: recentStats?.['5'],  season: seasonStats?.['5'] },
      { label: 'INTs',     recent: recentStats?.['6'],  season: seasonStats?.['6'], lowerBetter: true },
      { label: 'Rush Yds', recent: recentStats?.['9'],  season: seasonStats?.['9'] },
    ].filter(s => s.recent !== undefined || s.season !== undefined)
  }

  // RB/WR/TE — show rushing + receiving
  return [
    { label: 'Rush Yds',  recent: recentStats?.['9'],  season: seasonStats?.['9'] },
    { label: 'Rush TDs',  recent: recentStats?.['10'], season: seasonStats?.['10'] },
    { label: 'Rec',       recent: recentStats?.['11'], season: seasonStats?.['11'] },
    { label: 'Rec Yds',   recent: recentStats?.['12'], season: seasonStats?.['12'] },
    { label: 'Rec TDs',   recent: recentStats?.['13'], season: seasonStats?.['13'] },
  ].filter(s => s.recent !== undefined || s.season !== undefined)
}

router.get('/league/:leagueKey/trends', requireAuth, async (req, res) => {
  const { leagueKey } = req.params
  const force = req.query.force === 'true'
  try {
    const result = await withCache(res, `trends:${leagueKey}`, TTL.TRENDS, force, async () => {
      const myTeamKey = await yahoo.getUserTeamKey(leagueKey)
      if (!myTeamKey) return { myPlayers: [], freeAgents: [] }

      const rosterData = await yahoo.getRoster(leagueKey, myTeamKey)
      const playerKeys = []
      for (const rosterItem of (rosterData || [])) {
        const p = rosterItem?.player
        if (Array.isArray(p)) {
          const infoArray = Array.isArray(p[0]) ? p[0] : []
          const info = Object.assign({}, ...infoArray)
          if (info.player_key) playerKeys.push(info.player_key)
        }
      }

      const [recentMine, seasonMine, faData] = await Promise.all([
        playerKeys.length ? yahoo.getBatchPlayerStats(leagueKey, playerKeys, 'lastweek') : [],
        playerKeys.length ? yahoo.getBatchPlayerStats(leagueKey, playerKeys, null) : [],
        yahoo.getFreeAgentsTrending(leagueKey, 25)
      ])

      const seasonMap = {}
      seasonMine.forEach(p => { seasonMap[p.key] = p.stats })

      const myPlayers = recentMine.map(p => {
        const seasonStats = seasonMap[p.key] || {}
        const trend = calculateTrend(seasonStats, p.stats, p.position)
        return { ...p, recentStats: p.stats, seasonStats, trend, displayStats: trendDisplayStats(p.stats, seasonStats, p.position) }
      }).sort((a, b) => {
        const order = { hot: 0, rising: 1, neutral: 2, cold: 3 }
        return (order[a.trend] ?? 2) - (order[b.trend] ?? 2)
      })

      const freeAgents = faData.map(p => ({
        ...p,
        trend: calculateTrend(p.seasonStats, p.recentStats, p.position),
        displayStats: trendDisplayStats(p.recentStats, p.seasonStats, p.position)
      })).filter(p => p.trend === 'hot' || p.trend === 'rising')
        .sort((a, b) => (a.trend === 'hot' ? -1 : 1))

      return { myPlayers, freeAgents }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── League settings (local, no cache needed) ──────────────────────────────────
router.post('/league/save', requireAuth, async (req, res) => {
  try {
    const { league_key, league_name, num_teams, scoring_type, draft_type, draft_position, roster_slots, stat_categories } = req.body
    db.prepare(`INSERT OR REPLACE INTO league_settings
      (id, league_key, league_name, num_teams, scoring_type, draft_type, draft_position, roster_slots, stat_categories, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(league_key, league_name, num_teams, scoring_type, draft_type, draft_position,
      JSON.stringify(roster_slots), JSON.stringify(stat_categories), Date.now())
    cache.clear(league_key)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/league/settings/local', (req, res) => {
  const settings = db.prepare('SELECT * FROM league_settings WHERE id = 1').get()
  if (!settings) return res.json(null)
  settings.roster_slots = JSON.parse(settings.roster_slots || '{}')
  settings.stat_categories = JSON.parse(settings.stat_categories || '[]')
  res.json(settings)
})

module.exports = router;
