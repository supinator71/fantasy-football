/**
 * nflStatsService.js — NFL stats service
 * Placeholder with mock lookup — can be connected to ESPN API or similar
 */

const axios = require('axios');

// In-memory cache for stats lookups
const statsCache = new Map();

async function getPlayerSeasonStats(name, season = 2025) {
  const cacheKey = `${name}:${season}`;
  if (statsCache.has(cacheKey)) return statsCache.get(cacheKey);

  // Placeholder — return null (no external API connected yet)
  // To connect ESPN/NFL API, implement the lookup here
  console.log(`[NFL Stats] Lookup for ${name} (${season}) — no external API connected`);
  return null;
}

async function getBulkPlayerStats(names = [], season = 2025) {
  const results = {};
  for (const name of names) {
    const data = await getPlayerSeasonStats(name, season);
    if (data) results[name] = data;
  }
  return results;
}

async function getMultiSeasonStats(name, seasons = [2023, 2024, 2025]) {
  const seasonStats = {};
  for (const s of seasons) {
    const data = await getPlayerSeasonStats(name, s);
    if (data) seasonStats[s] = data;
  }

  if (Object.keys(seasonStats).length === 0) return null;

  return {
    name,
    seasonStats,
    position: Object.values(seasonStats)[0]?.position || '',
    age: Object.values(seasonStats)[0]?.age || null,
  };
}

module.exports = {
  getPlayerSeasonStats,
  getBulkPlayerStats,
  getMultiSeasonStats,
};
