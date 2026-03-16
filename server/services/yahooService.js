const axios = require('axios');
const xml2js = require('xml2js');
const db = require('../db/database');

const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

async function getAccessToken() {
  const row = db.prepare('SELECT * FROM tokens WHERE id = 1').get();
  if (!row) throw new Error('Not authenticated with Yahoo');

  // Auto-refresh if expired
  if (Date.now() > row.expires_at - 60000) {
    const axios2 = require('axios');
    const credentials = Buffer.from(
      `${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios2.post('https://api.login.yahoo.com/oauth2/get_token',
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token }),
      { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = Date.now() + expires_in * 1000;
    db.prepare('UPDATE tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE id = 1')
      .run(access_token, refresh_token, expiresAt);
    return access_token;
  }

  return row.access_token;
}

async function yahooGet(endpoint) {
  const token = await getAccessToken();
  const response = await axios.get(`${YAHOO_API_BASE}${endpoint}?format=json`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data;
}

// Helper to convert Yahoo's unpredictable list format to a standard array
function toArray(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;

  let count = parseInt(obj['@attributes']?.count) || parseInt(obj.count) || 0;

  if (!count) {
    count = Object.keys(obj).filter(k => /^\d+$/.test(k)).length;
  }
  if (!count) return [];

  const result = [];
  for (let i = 0; i < count; i++) {
    const item = obj[i] || obj[String(i)];
    if (item) result.push(item);
  }
  return result;
}

async function getLeagues() {
  // Fetch ALL NFL game seasons the user has leagues in (not just current)
  const data = await yahooGet('/users;use_login=1/games;game_codes=nfl/leagues');

  const gamesObj = data?.fantasy_content?.users?.['0']?.user?.[1]?.games;
  const allLeagues = [];

  // Iterate through all NFL game seasons
  const gameCount = parseInt(gamesObj?.['@attributes']?.count || gamesObj?.count || 0);
  const numericKeys = Object.keys(gamesObj || {}).filter(k => /^\d+$/.test(k));
  const total = Math.max(gameCount, numericKeys.length);

  for (let g = 0; g < total; g++) {
    const gameEntry = gamesObj?.[g] || gamesObj?.[String(g)];
    const game = gameEntry?.game;
    if (!game) continue;

    const gameInfo = Array.isArray(game[0]) ? Object.assign({}, ...game[0]) : (game[0] || {});
    const season = gameInfo?.season || 'unknown';
    const gameKey = gameInfo?.game_key || 'nfl';

    const leaguesObj = game[1]?.leagues;
    if (!leaguesObj) continue;

    const leagueList = toArray(leaguesObj);
    for (const l of leagueList) {
      const leagueData = l?.league?.[0];
      if (leagueData) {
        allLeagues.push({
          ...leagueData,
          season,
          game_key: gameKey,
          is_current: parseInt(season) >= 2026,
        });
      }
    }
  }

  // Sort: current/newest seasons first
  allLeagues.sort((a, b) => parseInt(b.season || 0) - parseInt(a.season || 0));

  return allLeagues;
}

async function getLeague(leagueKey) {
  const data = await yahooGet(`/league/${leagueKey}/settings`);
  return data.fantasy_content?.league;
}

async function getRoster(leagueKey, teamKey) {
  const data = await yahooGet(`/team/${teamKey}/roster/players`);
  const team = data.fantasy_content?.team;

  let players = null;

  const roster = team?.[1]?.roster;
  if (roster) {
    if (Array.isArray(roster)) {
      for (const r of roster) {
        if (r?.players) { players = r.players; break; }
      }
    } else {
      for (let i = 0; i <= 2; i++) {
        if (roster[i]?.players) { players = roster[i].players; break; }
        if (roster[String(i)]?.players) { players = roster[String(i)].players; break; }
      }
      if (!players && roster.players) players = roster.players;
    }
  }

  if (!players && Array.isArray(team)) {
    for (const item of team) {
      if (item?.roster) {
        const r = item.roster;
        if (Array.isArray(r)) {
          for (const ri of r) { if (ri?.players) { players = ri.players; break; } }
        } else {
          for (let i = 0; i <= 2; i++) {
            if (r[i]?.players) { players = r[i].players; break; }
            if (r[String(i)]?.players) { players = r[String(i)].players; break; }
          }
          if (!players && r.players) players = r.players;
        }
        if (players) break;
      }
    }
  }

  return toArray(players);
}

async function getStandings(leagueKey) {
  const data = await yahooGet(`/league/${leagueKey}/standings`);
  const teams = data.fantasy_content?.league?.[1]?.standings?.[1]?.teams || data.fantasy_content?.league?.[1]?.standings?.[0]?.teams;
  return toArray(teams);
}

async function getScoreboard(leagueKey) {
  const data = await yahooGet(`/league/${leagueKey}/scoreboard`);
  const league = data.fantasy_content?.league;

  let matchups = null;

  if (Array.isArray(league)) {
    for (const item of league) {
      if (item?.scoreboard) {
        const sb = item.scoreboard;
        if (Array.isArray(sb)) {
          for (const s of sb) {
            if (s?.matchups) { matchups = s.matchups; break; }
          }
        } else {
          for (let i = 0; i <= 2; i++) {
            if (sb[i]?.matchups) { matchups = sb[i].matchups; break; }
            if (sb[String(i)]?.matchups) { matchups = sb[String(i)].matchups; break; }
          }
          if (!matchups && sb.matchups) matchups = sb.matchups;
        }
        if (matchups) break;
      }
    }
  }

  return matchups;
}

async function getPlayers(leagueKey, status = 'A', start = 0) {
  const data = await yahooGet(`/league/${leagueKey}/players;status=${status};sort=AR;start=${start};count=25/stats`);
  const leagueObj = data.fantasy_content?.league;
  const rawPlayers = leagueObj?.[1]?.players || leagueObj?.[0]?.players || {};
  return parsePlayersStats(rawPlayers);
}

async function getDraftResults(leagueKey) {
  const data = await yahooGet(`/league/${leagueKey}/draftresults`);
  return data.fantasy_content?.league?.[1]?.draft_results;
}

async function getTransactions(leagueKey) {
  const data = await yahooGet(`/league/${leagueKey}/transactions;type=waiver`);
  const txns = data.fantasy_content?.league?.[1]?.transactions;
  return toArray(txns);
}

async function getPlayerStats(leagueKey, playerKey) {
  const data = await yahooGet(`/league/${leagueKey}/players;player_keys=${playerKey}/stats`);
  return data.fantasy_content?.league?.[1]?.players?.[0]?.player;
}

function parsePlayersStats(raw) {
  if (!raw) return [];
  const count = raw['@attributes']?.count || raw.count || raw?.length || 0;
  const result = [];
  for (let i = 0; i < count; i++) {
    const rawItem = raw[i] || raw[String(i)];
    const p = rawItem?.player || rawItem;
    if (!p) continue;

    const infoArray = Array.isArray(p) ? (Array.isArray(p[0]) ? p[0] : p) : [];
    const info = Object.assign({}, ...infoArray);

    let statsObj = null;
    if (Array.isArray(p)) {
      statsObj = p.find(item => item && (item.player_stats || item.player_season_stats || item.player_points));
    }

    const statsArr = statsObj?.player_stats?.stats || statsObj?.player_season_stats?.stats || [];
    const stats = {};
    for (const s of statsArr) {
      const stat = s.stat || {};
      if (stat.stat_id !== undefined) stats[String(stat.stat_id)] = stat.value;
    }
    result.push({
      key: info.player_key,
      name: info.full_name || info.name?.full || 'Unknown',
      position: info.display_position || info.eligible_positions?.position || '',
      team: info.editorial_team_abbr || '',
      stats
    });
  }
  return result;
}

async function getBatchPlayerStats(leagueKey, playerKeys, type) {
  if (!playerKeys || !playerKeys.length) return [];
  const batch = playerKeys.slice(0, 25).join(',');
  const typeParam = type ? `;type=${type}` : '';
  const data = await yahooGet(`/league/${leagueKey}/players;player_keys=${batch}/stats${typeParam}`);
  return parsePlayersStats(data.fantasy_content?.league?.[1]?.players);
}

async function getFreeAgentsTrending(leagueKey, count = 25) {
  const [recent, season] = await Promise.all([
    yahooGet(`/league/${leagueKey}/players;status=FA;sort=AR;count=${count}/stats;type=lastweek`),
    yahooGet(`/league/${leagueKey}/players;status=FA;sort=AR;count=${count}/stats`)
  ]);
  const recentPlayers = parsePlayersStats(recent.fantasy_content?.league?.[1]?.players);
  const seasonPlayers = parsePlayersStats(season.fantasy_content?.league?.[1]?.players);
  const seasonMap = {};
  seasonPlayers.forEach(p => { seasonMap[p.key] = p.stats; });
  return recentPlayers.map(p => ({ ...p, recentStats: p.stats, seasonStats: seasonMap[p.key] || {} }));
}

async function getUserTeamKey(leagueKey) {
  try {
    // Use game_codes=nfl to search across all NFL seasons (not just current)
    const data = await yahooGet(`/users;use_login=1/games;game_codes=nfl/leagues;league_keys=${leagueKey}/teams`);

    const gamesObj = data?.fantasy_content?.users?.['0']?.user?.[1]?.games;
    const gameList = toArray(gamesObj);

    for (const g of gameList) {
      const gItem = g?.game;
      if (!gItem) continue;

      const leaguesObj = gItem[1]?.leagues;
      const leagueList = toArray(leaguesObj);

      for (const lItem of leagueList) {
        const leagueData = lItem?.league;
        if (!leagueData) continue;

        const lKey = leagueData[0]?.league_key;
        if (lKey === leagueKey && leagueData[1]?.teams) {
             const teamsList = toArray(leagueData[1].teams);
             for (const tItem of teamsList) {
                 const tData = tItem?.team;
                 if (tData) return tData[0]?.[0]?.team_key || tData[0]?.team_key;
             }
        }
      }
    }
  } catch (e) {
    console.log('Error fetching getUserTeamKey:', e.message);
  }
  return null;
}

module.exports = {
  getLeagues,
  getLeague,
  getRoster,
  getStandings,
  getScoreboard,
  getPlayers,
  getDraftResults,
  getTransactions,
  getPlayerStats,
  getBatchPlayerStats,
  getFreeAgentsTrending,
  getUserTeamKey,
  getAccessToken,
  yahooGet
};
