/**
 * fantasyBrain.js — Elite High-Stakes Fantasy Football Engine
 *
 * NOT a consensus recommendation tool. This is a probabilistic market-game
 * optimizer that maximizes first-place equity in top-heavy payout structures.
 *
 * Core principle: Opportunity > talent > box-score results
 */

// ═══════════════════════════════════════════════════════════════════════════════
// FORMAT DEFINITIONS & SCORING MULTIPLIERS
// ═══════════════════════════════════════════════════════════════════════════════

const FORMATS = {
  'PPR':       { recBonus: 1.0,  label: 'Full PPR',   rbRecAdj: 1.3, wrAdj: 1.1, teAdj: 1.15, qbAdj: 1.0 },
  'Half':      { recBonus: 0.5,  label: 'Half PPR',   rbRecAdj: 1.15, wrAdj: 1.05, teAdj: 1.05, qbAdj: 1.0 },
  'Standard':  { recBonus: 0.0,  label: 'Standard',   rbRecAdj: 1.0, wrAdj: 1.0, teAdj: 0.9, qbAdj: 1.0 },
  'Superflex': { recBonus: 1.0,  label: 'Superflex',  rbRecAdj: 1.1, wrAdj: 1.0, teAdj: 1.05, qbAdj: 1.6 },
  '2QB':       { recBonus: 1.0,  label: '2QB',        rbRecAdj: 1.0, wrAdj: 0.95, teAdj: 1.0, qbAdj: 1.8 },
  'TEPrem':    { recBonus: 1.5,  label: 'TE Premium',  rbRecAdj: 1.0, wrAdj: 0.95, teAdj: 1.4, qbAdj: 1.0 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIONAL TIERS — Usage & Opportunity Thresholds
// ═══════════════════════════════════════════════════════════════════════════════

const POSITIONAL_TIERS = {
  QB: {
    elite:    { snapPct: 0.98, rushUpsideFloor: 50, passingFloor: 4200, tdFloor: 30 },
    starter:  { snapPct: 0.95, rushUpsideFloor: 20, passingFloor: 3800, tdFloor: 24 },
    stream:   { snapPct: 0.90, rushUpsideFloor: 0,  passingFloor: 3200, tdFloor: 18 },
    // QB replacement level is cheap in 1QB — expensive in SF/2QB
    replacementVOR: { '1QB': 12, 'SF': 55, '2QB': 65 },
    scarcity: { tier: 'deep', draftWindow: 'Rounds 6-8 or 11+', replacementDropoff: 'Minimal in 1QB, steep in SF' },
  },
  RB: {
    elite:    { snapPct: 0.70, targetShare: 0.06, goalLineShare: 0.60, twoDownPct: 0.75 },
    starter:  { snapPct: 0.55, targetShare: 0.04, goalLineShare: 0.40, twoDownPct: 0.55 },
    flex:     { snapPct: 0.40, targetShare: 0.03, goalLineShare: 0.20, twoDownPct: 0.40 },
    // RB replacement is the steepest cliff — the top 6-8 are separated from the field
    replacementVOR: 40,
    scarcity: { tier: 'elite', draftWindow: 'Rounds 1-3', replacementDropoff: 'Massive — top 8 RBs are irreplaceable' },
    injuryRate: 0.42, // highest injury rate of any position
    ageCliff: 27,     // production cliff age
  },
  WR: {
    elite:    { targetShare: 0.26, targetsPRR: 0.22, airYardsShare: 0.30, snapPct: 0.92 },
    starter:  { targetShare: 0.20, targetsPRR: 0.18, airYardsShare: 0.22, snapPct: 0.85 },
    flex:     { targetShare: 0.14, targetsPRR: 0.14, airYardsShare: 0.15, snapPct: 0.75 },
    // WR depth is good but the alpha WR1 tier is separated
    replacementVOR: 30,
    scarcity: { tier: 'deep_top_heavy', draftWindow: 'Rounds 1-6', replacementDropoff: 'Top 8 separated; mid-range is deep' },
    primeWindow: [23, 29], // age range of peak WR production
  },
  TE: {
    elite:    { targetShare: 0.22, targetsPRR: 0.20, snapPct: 0.88, routePct: 0.75 },
    starter:  { targetShare: 0.15, targetsPRR: 0.15, snapPct: 0.80, routePct: 0.60 },
    stream:   { targetShare: 0.10, targetsPRR: 0.10, snapPct: 0.70, routePct: 0.45 },
    // TE is the scarcest position — the top 3-5 are massively separated
    replacementVOR: 50,
    scarcity: { tier: 'scarce', draftWindow: 'Rounds 3-5 for elite, stream otherwise', replacementDropoff: 'Extreme — top 3 are league-winners' },
  },
  K: {
    replacementVOR: 5,
    scarcity: { tier: 'fungible', draftWindow: 'Last pick or stream', replacementDropoff: 'None — stream weekly' },
  },
  DEF: {
    replacementVOR: 5,
    scarcity: { tier: 'fungible', draftWindow: 'Last pick or stream', replacementDropoff: 'None — stream weekly' },
  },
  FLEX: {
    replacementVOR: 20,
    scarcity: { tier: 'moderate', draftWindow: 'Rounds 5-8', replacementDropoff: 'Moderate' },
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// NFL SCHEDULE INTELLIGENCE — 2025 Bye Weeks (ref data for preseason)
// ═══════════════════════════════════════════════════════════════════════════════

const BYE_WEEKS_2025 = {
  5:  ['DET', 'LAC', 'PHI', 'TEN'],
  6:  ['KC', 'LAR', 'MIA', 'MIN'],
  7:  ['CHI', 'DAL'],
  8:  ['CLE', 'HOU'],
  9:  ['DEN', 'JAX', 'PIT', 'SF'],
  10: ['ATL', 'BUF', 'CIN', 'NYJ'],
  11: ['CAR', 'NYG', 'NO', 'TB'],
  12: ['ARI', 'GB', 'IND', 'WAS'],
  13: ['BAL', 'LV', 'NE', 'SEA'],
};

// Flatten: team -> bye week
const TEAM_BYE = {};
for (const [week, teams] of Object.entries(BYE_WEEKS_2025)) {
  teams.forEach(t => { TEAM_BYE[t] = parseInt(week); });
}

function isOnBye(team, week) {
  return TEAM_BYE[(team || '').toUpperCase()] === week;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFENSE STRENGTH TIERS — Opponent Matchup Quality
// ═══════════════════════════════════════════════════════════════════════════════

const DEFENSE_TIERS = {
  // tier 1: toughest matchups (avoid)
  elite:  ['SF', 'BAL', 'DAL', 'BUF', 'NYJ', 'CLE'],
  // tier 2: above average
  good:   ['PIT', 'DEN', 'MIA', 'NE', 'PHI', 'DET'],
  // tier 3: average
  mid:    ['GB', 'KC', 'LAR', 'SEA', 'MIN', 'CIN', 'TB', 'NO', 'HOU'],
  // tier 4: below average (target)
  weak:   ['JAX', 'CAR', 'LV', 'ARI', 'TEN', 'IND', 'CHI', 'LAC'],
  // tier 5: worst defenses (juicy matchups)
  smash:  ['NYG', 'WAS', 'ATL'],
};

function getMatchupQuality(team, opponent, week) {
  if (!opponent) return { score: 50, grade: 'Unknown', tier: 'mid' };
  if (isOnBye(team, week)) return { score: 0, grade: 'BYE', tier: 'bye' };

  const opp = opponent.toUpperCase();
  if (DEFENSE_TIERS.smash.includes(opp))  return { score: 90, grade: 'Smash', tier: 'smash' };
  if (DEFENSE_TIERS.weak.includes(opp))   return { score: 75, grade: 'Favorable', tier: 'weak' };
  if (DEFENSE_TIERS.mid.includes(opp))    return { score: 50, grade: 'Neutral', tier: 'mid' };
  if (DEFENSE_TIERS.good.includes(opp))   return { score: 30, grade: 'Tough', tier: 'good' };
  if (DEFENSE_TIERS.elite.includes(opp))  return { score: 15, grade: 'Avoid', tier: 'elite' };
  return { score: 50, grade: 'Unknown', tier: 'mid' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCORING ENVIRONMENT DATA
// ═══════════════════════════════════════════════════════════════════════════════

const TEAM_SCORING_ENV = {
  // tier: pace & points/game environment (2025 baselines)
  elite:    ['DET', 'MIA', 'BUF', 'SF', 'DAL', 'PHI'],     // 26+ ppg
  good:     ['KC', 'CIN', 'HOU', 'BAL', 'JAX', 'LAR'],     // 23-26 ppg
  average:  ['TB', 'MIN', 'SEA', 'GB', 'LAC', 'DEN'],      // 20-23 ppg
  poor:     ['ATL', 'PIT', 'IND', 'TEN', 'CHI', 'ARI'],    // 17-20 ppg
  bottom:   ['NYG', 'NYJ', 'NE', 'CAR', 'CLE', 'LV', 'WAS', 'NO'], // <17 ppg
};

function getScoringEnvironment(team) {
  const t = (team || '').toUpperCase();
  for (const [tier, teams] of Object.entries(TEAM_SCORING_ENV)) {
    if (teams.includes(t)) return tier;
  }
  return 'average';
}

const SCORING_ENV_MULTIPLIER = {
  elite: 1.15, good: 1.07, average: 1.0, poor: 0.92, bottom: 0.85,
};

// ═══════════════════════════════════════════════════════════════════════════════
// VALUE OVER REPLACEMENT (VOR) — Usage-Weighted
// ═══════════════════════════════════════════════════════════════════════════════

function calculateVOR(stats, position, leagueSize = 12, format = 'PPR') {
  const pos = String(position || '').split('/')[0].split(',')[0].toUpperCase();
  const fmtConfig = FORMATS[format] || FORMATS['PPR'];
  const tierData = POSITIONAL_TIERS[pos];
  if (!tierData) return 25;

  const replacementBase = typeof tierData.replacementVOR === 'number'
    ? tierData.replacementVOR
    : (tierData.replacementVOR?.['1QB'] || 10);

  if (!stats || Object.keys(stats).length === 0) return replacementBase;

  let score = 0;

  // Yahoo NFL stat IDs
  const passYds   = parseFloat(stats['5'] || stats.passYds || 0);
  const passTDs   = parseFloat(stats['6'] || stats.passTDs || 0);
  const passINTs  = parseFloat(stats['7'] || stats.passINTs || 0);
  const rushYds   = parseFloat(stats['8'] || stats.rushYds || 0);
  const rushTDs   = parseFloat(stats['9'] || stats.rushTDs || 0);
  const receptions= parseFloat(stats['11'] || stats.receptions || 0);
  const recYds    = parseFloat(stats['12'] || stats.recYds || 0);
  const recTDs    = parseFloat(stats['13'] || stats.recTDs || 0);
  const fumbles   = parseFloat(stats['15'] || stats.fumbles || 0);
  const targets   = parseFloat(stats.targets || 0);
  const snaps     = parseFloat(stats.snaps || 0);

  // Calculate raw fantasy points
  let fpts = 0;
  fpts += passYds * 0.04;
  fpts += passTDs * 4;
  fpts -= passINTs * 2;
  fpts += rushYds * 0.1;
  fpts += rushTDs * 6;
  fpts += receptions * fmtConfig.recBonus;
  fpts += recYds * 0.1;
  fpts += recTDs * 6;
  fpts -= fumbles * 2;

  // Normalize to per-game (assume 17-game season if season totals)
  const gamesPlayed = parseFloat(stats.gamesPlayed || stats.GP || 17);
  const fptsPerGame = gamesPlayed > 0 ? fpts / gamesPlayed : 0;

  // Position-specific VOR calculation
  if (pos === 'QB') {
    const qbBaseline = 16; // replacement QB scores ~16 fpts/gm in 1QB
    score = Math.min(100, Math.max(0, ((fptsPerGame - qbBaseline) / 14) * 100 * fmtConfig.qbAdj));

    // Rush upside bonus (dual-threat premium)
    if (rushYds > 400 || rushTDs > 3) score = Math.min(100, score + 10);
  }
  else if (pos === 'RB') {
    const rbBaseline = 8;
    score = Math.min(100, Math.max(0, ((fptsPerGame - rbBaseline) / 16) * 100));

    // Receiving work premium in PPR
    if (receptions > 40) score = Math.min(100, score + 8 * fmtConfig.rbRecAdj);
    if (receptions > 60) score = Math.min(100, score + 5 * fmtConfig.rbRecAdj);

    // Goal-line role bonus
    if (rushTDs > 6) score = Math.min(100, score + 5);
  }
  else if (pos === 'WR') {
    const wrBaseline = 7;
    score = Math.min(100, Math.max(0, ((fptsPerGame - wrBaseline) / 14) * 100 * fmtConfig.wrAdj));

    // Target volume bonus
    if (targets > 120) score = Math.min(100, score + 10);
    else if (receptions > 80) score = Math.min(100, score + 7);

    // Red zone target premium
    if (recTDs > 6) score = Math.min(100, score + 5);
  }
  else if (pos === 'TE') {
    const teBaseline = 5;
    score = Math.min(100, Math.max(0, ((fptsPerGame - teBaseline) / 10) * 100 * fmtConfig.teAdj));

    // Elite TE premium — the gap is massive
    if (fptsPerGame > 12) score = Math.min(100, score + 15);
  }
  else if (pos === 'K' || pos === 'DEF') {
    score = Math.min(40, Math.max(5, fptsPerGame * 3));
  }

  // Scoring environment adjustment
  const team = stats.team || '';
  const envMult = SCORING_ENV_MULTIPLIER[getScoringEnvironment(team)] || 1.0;
  score = Math.min(100, score * envMult);

  // League size adjustment — larger leagues = higher scarcity
  if (leagueSize > 12) score = Math.min(100, score * 1.05);
  if (leagueSize > 14) score = Math.min(100, score * 1.05);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIONAL SCARCITY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function getPositionalScarcity(position, leagueSize = 12, format = 'PPR') {
  const pos = String(position || '').split('/')[0].split(',')[0].toUpperCase();
  const tierData = POSITIONAL_TIERS[pos];
  if (!tierData?.scarcity) return { tier: 'moderate', draftWindow: 'Mid rounds', replacementDropoff: 'Unknown' };

  const scarcity = { ...tierData.scarcity };

  // Format adjustments
  if (pos === 'QB' && (format === 'Superflex' || format === '2QB')) {
    scarcity.tier = 'elite';
    scarcity.draftWindow = 'Rounds 1-4';
    scarcity.replacementDropoff = 'Massive — QB scarcity dominates SF/2QB';
  }
  if (pos === 'TE' && format === 'TEPrem') {
    scarcity.tier = 'ultra_scarce';
    scarcity.draftWindow = 'Rounds 2-4 for elite';
    scarcity.replacementDropoff = 'Extreme — TE premium inflates the top 3-5 massively';
  }
  if (pos === 'RB' && (format === 'PPR' || format === 'Half')) {
    // In PPR, receiving RBs gain additional scarcity premium
    scarcity.replacementDropoff += '. Pass-catching RBs carry extra PPR premium.';
  }

  // League size adjustments
  if (leagueSize >= 14) {
    if (scarcity.tier !== 'fungible') {
      scarcity.replacementDropoff += ` (amplified in ${leagueSize}-team league)`;
    }
  }

  return scarcity;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE SUSTAINABILITY DETECTOR
// Higher-order: detects if production is backed by stable usage or fluky results
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeSustainability(player) {
  const stats = player.stats || {};
  const signals = [];
  let sustainabilityScore = 50; // neutral baseline

  const pos = String(player.position || '').split('/')[0].toUpperCase();
  const targets = parseFloat(stats.targets || 0);
  const receptions = parseFloat(stats.receptions || stats['11'] || 0);
  const recTDs = parseFloat(stats.recTDs || stats['13'] || 0);
  const rushTDs = parseFloat(stats.rushTDs || stats['9'] || 0);
  const rushYds = parseFloat(stats.rushYds || stats['8'] || 0);
  const recYds = parseFloat(stats.recYds || stats['12'] || 0);
  const passYds = parseFloat(stats.passYds || stats['5'] || 0);
  const gp = parseFloat(stats.gamesPlayed || stats.GP || 17);

  if (pos === 'WR' || pos === 'TE') {
    // TD regression: high TD rate on low targets = unsustainable
    const tdRate = receptions > 0 ? recTDs / receptions : 0;
    if (tdRate > 0.12 && targets < 100) {
      signals.push({ flag: 'TD_REGRESSION', detail: `TD rate ${(tdRate*100).toFixed(1)}% on only ${targets} targets — regression likely`, impact: -15 });
      sustainabilityScore -= 15;
    }

    // Volume backing: high target count = sustainable floor
    if (targets > 130) {
      signals.push({ flag: 'VOLUME_BACKED', detail: `${targets} targets — elite volume supports production`, impact: +15 });
      sustainabilityScore += 15;
    } else if (targets > 100) {
      signals.push({ flag: 'SOLID_VOLUME', detail: `${targets} targets — solid usage`, impact: +8 });
      sustainabilityScore += 8;
    } else if (targets < 70 && recTDs > 5) {
      signals.push({ flag: 'LOW_VOLUME_TD_DEPENDENT', detail: `Only ${targets} targets but ${recTDs} TDs — heavily TD-dependent`, impact: -12 });
      sustainabilityScore -= 12;
    }

    // YPC/YPR sustainability
    const ypr = receptions > 0 ? recYds / receptions : 0;
    if (ypr > 18) {
      signals.push({ flag: 'UNSUSTAINABLE_YPR', detail: `${ypr.toFixed(1)} yards/rec is likely to regress`, impact: -8 });
      sustainabilityScore -= 8;
    }
  }

  if (pos === 'RB') {
    // TD regression
    const tdsPerGame = gp > 0 ? rushTDs / gp : 0;
    if (tdsPerGame > 0.7 && rushYds / gp < 65) {
      signals.push({ flag: 'TD_REGRESSION', detail: `${rushTDs} rush TDs on ${(rushYds/gp).toFixed(0)} yds/gm — TD regression candidate`, impact: -12 });
      sustainabilityScore -= 12;
    }

    // Receiving work sustains PPR value
    if (receptions > 50) {
      signals.push({ flag: 'RECEIVING_BACK', detail: `${receptions} receptions — PPR floor is strong and sustainable`, impact: +12 });
      sustainabilityScore += 12;
    }

    // Workload injury concern
    const touchesPerGame = gp > 0 ? ((parseFloat(stats.rushAttempts || 0) + receptions) / gp) : 0;
    if (touchesPerGame > 22) {
      signals.push({ flag: 'HEAVY_WORKLOAD', detail: `${touchesPerGame.toFixed(0)} touches/gm — durability concern`, impact: -5 });
      sustainabilityScore -= 5;
    }
  }

  if (pos === 'QB') {
    // Rushing upside sustainability
    const rushYdsPerGame = gp > 0 ? rushYds / gp : 0;
    if (rushYdsPerGame > 35) {
      signals.push({ flag: 'RUSHING_UPSIDE', detail: `${rushYdsPerGame.toFixed(0)} rush yds/gm — dual-threat creates high floor`, impact: +10 });
      sustainabilityScore += 10;
    }

    // INT risk
    const passINTs = parseFloat(stats.passINTs || stats['7'] || 0);
    if (passINTs > 14) {
      signals.push({ flag: 'INT_RISK', detail: `${passINTs} INTs — turnover-prone risk`, impact: -8 });
      sustainabilityScore -= 8;
    }
  }

  return {
    score: Math.max(0, Math.min(100, sustainabilityScore)),
    signals,
    verdict: sustainabilityScore >= 65 ? 'sustainable' :
             sustainabilityScore >= 40 ? 'mixed' : 'regression_candidate',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTINGENT UPSIDE DETECTOR
// Identifies backup players who are ONE injury away from league-winning workloads
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateContingentUpside(player, rosterContext = []) {
  const pos = String(player.position || '').split('/')[0].toUpperCase();
  const stats = player.stats || {};

  let contingentScore = 0;
  const reasons = [];

  if (pos === 'RB') {
    const rushAttempts = parseFloat(stats.rushAttempts || stats['8'] || 0);
    const receptions = parseFloat(stats.receptions || stats['11'] || 0);
    const gp = parseFloat(stats.gamesPlayed || stats.GP || 17);
    const touchesPerGame = gp > 0 ? (rushAttempts + receptions) / gp : 0;

    // Low current usage but on a team with a bellcow = handcuff
    if (touchesPerGame < 10 && touchesPerGame > 2) {
      const scoringEnv = getScoringEnvironment(player.team || '');
      if (scoringEnv === 'elite' || scoringEnv === 'good') {
        contingentScore = 75;
        reasons.push('Backup RB on elite offense — starter injury makes this an RB1');
      } else {
        contingentScore = 55;
        reasons.push('Backup RB — starter injury gives meaningful workload');
      }
    }

    // Already getting some work = committee could shift
    if (touchesPerGame >= 8 && touchesPerGame < 15) {
      contingentScore = Math.max(contingentScore, 60);
      reasons.push('Committee back — injury or inefficiency could push to bellcow');
    }
  }

  if (pos === 'WR') {
    // WR2/WR3 on high-volume pass offense
    const targets = parseFloat(stats.targets || 0);
    const gp = parseFloat(stats.gamesPlayed || stats.GP || 17);
    const tgtPerGame = gp > 0 ? targets / gp : 0;

    if (tgtPerGame >= 4 && tgtPerGame < 7) {
      const scoringEnv = getScoringEnvironment(player.team || '');
      if (scoringEnv === 'elite' || scoringEnv === 'good') {
        contingentScore = 50;
        reasons.push('WR2/3 on pass-heavy offense — injury above him could unlock WR1 targets');
      }
    }
  }

  return {
    score: Math.min(100, contingentScore),
    reasons,
    isContingentPlay: contingentScore >= 50,
    classification: contingentScore >= 70 ? 'high_value_handcuff' :
                    contingentScore >= 50 ? 'contingent_upside' : 'limited_upside',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE FAIRNESS ENGINE — Market-Based
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateTrade(giving, receiving, myRoster, leagueContext = {}) {
  const leagueSize = leagueContext.num_teams || 12;
  const format = leagueContext.scoring_type || 'PPR';

  // Calculate VOR for each side
  const givingVOR = (giving || []).reduce((sum, p) => sum + calculateVOR(p.stats || {}, p.position, leagueSize, format), 0);
  const receivingVOR = (receiving || []).reduce((sum, p) => sum + calculateVOR(p.stats || {}, p.position, leagueSize, format), 0);

  const vorDelta = receivingVOR - givingVOR;

  // Positional scarcity adjustment
  let scarcityDelta = 0;
  const givingPositions = (giving || []).map(p => String(p.position || '').split('/')[0].toUpperCase());
  const receivingPositions = (receiving || []).map(p => String(p.position || '').split('/')[0].toUpperCase());

  receivingPositions.forEach(pos => {
    const s = getPositionalScarcity(pos, leagueSize, format);
    if (s.tier === 'elite' || s.tier === 'scarce' || s.tier === 'ultra_scarce') scarcityDelta += 8;
  });
  givingPositions.forEach(pos => {
    const s = getPositionalScarcity(pos, leagueSize, format);
    if (s.tier === 'elite' || s.tier === 'scarce' || s.tier === 'ultra_scarce') scarcityDelta -= 8;
  });

  // Roster needs analysis — does the trade fill a void?
  const rosterAnalysis = analyzeRosterStrengths(myRoster || [], leagueSize);
  let needsDelta = 0;
  receivingPositions.forEach(pos => {
    if (rosterAnalysis.voids.includes(pos)) needsDelta += 10;
  });
  givingPositions.forEach(pos => {
    if (rosterAnalysis.voids.includes(pos)) needsDelta -= 15; // penalize trading away need
  });

  // Player count penalty — avoid 3-for-1 that dilutes quality
  const countDelta = receiving.length - giving.length;
  const consolidationBonus = countDelta < 0 ? 5 * Math.abs(countDelta) : countDelta > 0 ? -3 * countDelta : 0;

  // Sustainability check — prefer sustainable production
  let sustainDelta = 0;
  (receiving || []).forEach(p => {
    const s = analyzeSustainability(p);
    if (s.verdict === 'sustainable') sustainDelta += 5;
    if (s.verdict === 'regression_candidate') sustainDelta -= 5;
  });
  (giving || []).forEach(p => {
    const s = analyzeSustainability(p);
    if (s.verdict === 'regression_candidate') sustainDelta += 3; // good to sell
    if (s.verdict === 'sustainable') sustainDelta -= 3;
  });

  const totalScore = 50 + vorDelta * 0.3 + scarcityDelta + needsDelta + consolidationBonus + sustainDelta;
  const score = Math.max(0, Math.min(100, Math.round(totalScore)));

  const reasoning = [];
  if (vorDelta > 5) reasoning.push(`VOR advantage: +${vorDelta.toFixed(0)} value gained`);
  if (vorDelta < -5) reasoning.push(`VOR disadvantage: ${vorDelta.toFixed(0)} value lost`);
  if (scarcityDelta > 0) reasoning.push('Gaining positional scarcity advantage');
  if (scarcityDelta < 0) reasoning.push('Losing positional scarcity');
  if (needsDelta > 0) reasoning.push('Trade fills a roster void');
  if (needsDelta < 0) reasoning.push('⚠️ Trading away a position of need');
  if (consolidationBonus > 0) reasoning.push('Good consolidation — fewer, better players');
  if (sustainDelta > 0) reasoning.push('Acquiring more sustainable production');
  if (sustainDelta < 0) reasoning.push('Acquiring less sustainable production');

  return {
    score,
    verdict: score >= 65 ? 'ACCEPT' : score >= 45 ? 'FAIR_TRADE' : 'DECLINE',
    reasoning: reasoning.join('. '),
    vorDelta: +vorDelta.toFixed(1),
    givingVOR, receivingVOR,
    counterOffer: score < 40 ? 'You need more value back — try getting a draft pick or a better player added to their side.' : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAIVER WIRE SCORING — Role Change First, Box Score Second
// ═══════════════════════════════════════════════════════════════════════════════

function scoreWaiverTarget(player, myRoster = [], settings = {}) {
  const pos = String(player.position || '').split('/')[0].toUpperCase();
  const stats = player.stats || {};
  const recentStats = player.recentStats || {};
  let score = 25; // baseline
  const reasons = [];

  // 1. POSITIONAL NEED (highest weight)
  const rosterAnalysis = analyzeRosterStrengths(myRoster, settings.num_teams || 12);
  if (rosterAnalysis.voids.includes(pos)) {
    score += 25;
    reasons.push(`Fills ${pos} void`);
  }

  // 2. ROLE CHANGE SIGNALS (this is the edge — get there before the box score)
  const contingent = evaluateContingentUpside(player);
  if (contingent.isContingentPlay) {
    score += 20;
    reasons.push(contingent.reasons[0] || 'Contingent upside play');
  }

  // 3. USAGE METRICS > RAW STATS
  const sustainability = analyzeSustainability(player);
  if (sustainability.verdict === 'sustainable') {
    score += 10;
    reasons.push('Production backed by stable usage');
  }

  // 4. SCORING ENVIRONMENT
  const env = getScoringEnvironment(player.team || '');
  if (env === 'elite' || env === 'good') {
    score += 8;
    reasons.push(`Strong team scoring environment (${env})`);
  }
  if (env === 'bottom') {
    score -= 5;
    reasons.push('Poor team scoring environment');
  }

  // 5. RECENT TREND (secondary — don't chase box scores)
  const vor = calculateVOR(stats, pos, settings.num_teams || 12);
  if (vor >= 50) {
    score += 10;
    reasons.push(`VOR: ${vor}/100`);
  }

  // 6. K/DEF streaming — always low priority
  if (pos === 'K' || pos === 'DEF') {
    score = Math.min(30, score);
    reasons.length = 0;
    reasons.push('Streaming option — low roster priority');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    priority: score >= 70 ? 'MUST_ADD' : score >= 50 ? 'STRONG_ADD' : score >= 30 ? 'ROSTER_STASH' : 'MONITOR',
    reasoning: reasons.join('. '),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINEUP OPTIMIZATION — Opportunity-Weighted
// ═══════════════════════════════════════════════════════════════════════════════

function optimizeLineup(roster, week = 1, format = 'PPR') {
  const starters = [];
  const bench = [];

  const enriched = (roster || []).map(p => {
    const pos = String(p.position || '').split('/')[0].toUpperCase();
    const vor = calculateVOR(p.stats || {}, pos, 12, format);
    const bye = isOnBye(p.team, week);
    const sustainability = analyzeSustainability(p);

    let confidence = vor;
    if (bye) confidence = 0;
    if (sustainability.verdict === 'regression_candidate') confidence -= 5;
    if (sustainability.verdict === 'sustainable') confidence += 5;

    return {
      ...p,
      player_name: p.player_name || p.name,
      pos,
      vor,
      isBye: bye,
      confidence: Math.max(0, Math.min(100, confidence)),
      sustainability: sustainability.verdict,
    };
  });

  // Sort by confidence
  enriched.sort((a, b) => b.confidence - a.confidence);

  // Fill starter slots
  const slots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 };
  const filled = { QB: 0, RB: 0, WR: 0, TE: 0, FLEX: 0, K: 0, DEF: 0 };
  const flexPositions = ['RB', 'WR', 'TE'];

  // First pass: fill primary slots
  for (const p of enriched) {
    if (p.isBye) { bench.push(p); continue; }
    if (slots[p.pos] && filled[p.pos] < slots[p.pos]) {
      filled[p.pos]++;
      starters.push(p);
    } else if (flexPositions.includes(p.pos) && filled.FLEX < slots.FLEX) {
      filled.FLEX++;
      starters.push({ ...p, pos: 'FLEX' });
    } else {
      bench.push(p);
    }
  }

  return { starters, bench };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAFT STRATEGY PROFILES — Format-Aware
// ═══════════════════════════════════════════════════════════════════════════════

const DRAFT_STRATEGIES = {
  'WR_FOUNDATION': {
    name: 'WR Foundation (Recommended Default)',
    description: 'Build elite WR core first. WRs have the longest shelf life, most sustainable production, and lowest injury rate. Layer in RBs and contingent upside afterward.',
    roundTargets: {
      '1-2':  'Elite WR (alpha WR1 tier) or consensus RB1 if they fall',
      '3-4':  'Best WR/RB available — do not reach for TE/QB',
      '5-6':  'RB2 or elite TE if available (Kelce/Andrews types only)',
      '7-8':  'QB (unless SF), RB depth, WR3',
      '9-11': 'Backup RBs with contingent upside — one injury away from bellcow',
      '12-14': 'High-upside stashes, WR with role-change potential',
      '15-16': 'DEF and K — NEVER draft these before round 14',
    },
    philosophy: 'WRs are the safest foundation. They peak longer, get hurt less, and are the most predictable. Build your floor with WRs, then gamble on RB upside.',
  },
  'ROBUST_RB': {
    name: 'Robust RB',
    description: 'Lock in two elite RBs early and build around their positional scarcity. Risk: RB injury can wreck the investment.',
    roundTargets: {
      '1-2':  'Two bell-cow RBs (snap share > 70%, goal-line role)',
      '3-4':  'WR1 — target high target share',
      '5-6':  'WR2 or elite TE',
      '7-8':  'QB, WR depth',
      '9-11': 'MUST get at least one RB handcuff for your starters',
      '12-14': 'High-upside bench stashes',
      '15-16': 'DEF and K',
    },
    philosophy: 'If you hit on two RB1s, you have a massive structural edge. But RB injury rate is ~42%, so you MUST roster handcuffs.',
  },
  'HERO_RB': {
    name: 'Hero RB',
    description: 'One elite RB in round 1-2, then go WR heavy through the mid rounds. Rely on one RB stud plus a committee of dart throws.',
    roundTargets: {
      '1':    'Elite bell-cow RB (top-5 ADP)',
      '2-4':  'WR WR WR — stack alpha WRs',
      '5-6':  'TE or QB (best available)',
      '7-9':  'RB committee backs, backup RBs with contingent upside',
      '10-12': 'Best WR/RB available',
      '13-16': 'Stashes, DEF, K',
    },
    philosophy: 'One locked-in RB1 plus WR depth gives elite consistency. Fill RB2 with the waiver wire.',
  },
  'ZERO_RB': {
    name: 'Zero RB',
    description: 'Ignore RBs until mid rounds. Build an elite WR/TE/QB core first. Rely on waiver wire and contingent upside backs.',
    roundTargets: {
      '1-3':  'WR WR WR/TE (if Kelce-tier TE available)',
      '4-5':  'QB or additional WR/TE',
      '6-9':  'RBs — target committee backs, high-upside handcuffs, goal-line backs',
      '10-13': 'RB depth, FLEX options',
      '14-16': 'DEF, K',
    },
    philosophy: 'RBs are volatile and injury-prone. Build a fortress at WR/TE, then exploit RB waiver wire adds all season.',
  },
  'EARLY_TE': {
    name: 'Early TE Premium',
    description: 'Grab an elite TE (rounds 2-4) to lock in the most scarce position. The top 3 TEs outscore TE12 by 8+ fpts/week.',
    roundTargets: {
      '1':    'Best RB or WR available',
      '2-3':  'Elite TE — the positional advantage is massive',
      '4-5':  'WR WR',
      '6-8':  'RB, QB',
      '9-12': 'RB handcuffs, WR depth',
      '13-16': 'Stashes, DEF, K',
    },
    philosophy: 'If you can lock in 8+ fpts/week over the TE wasteland, that edge compounds every single week.',
  },
  'SUPERFLEX_QB_EARLY': {
    name: 'Superflex: QB Early',
    description: 'In superflex/2QB, QBs are THE scarce resource. Lock in two top-12 QBs early.',
    roundTargets: {
      '1-2':  'Elite QB + best RB/WR available (or two QBs)',
      '3-4':  'Second QB if not taken, or elite WR',
      '5-7':  'RB/WR BPA',
      '8-10': 'RB depth, WR depth',
      '11-14': 'QB3 for bye weeks, high-upside stashes',
      '15-16': 'DEF, K',
    },
    philosophy: 'In SF, the QB1-QB12 gap is massive. Two top-12 QBs is a structural advantage that cannot be replicated.',
  },
};

function getDraftStrategy(draftPosition, numTeams = 12, format = 'PPR') {
  const isSF = format === 'Superflex' || format === '2QB';
  const pos = draftPosition || 1;

  let recommended;
  if (isSF) {
    recommended = 'SUPERFLEX_QB_EARLY';
  } else if (pos <= 3) {
    // Early picks: grab an elite RB then go WR heavy
    recommended = 'HERO_RB';
  } else if (pos <= 6) {
    // Mid-early: WR foundation is strongest
    recommended = 'WR_FOUNDATION';
  } else if (pos <= 9) {
    // Mid-late: WR foundation or Zero RB
    recommended = 'WR_FOUNDATION';
  } else {
    // Late picks: Zero RB can work since elite RBs are gone
    recommended = 'ZERO_RB';
  }

  return {
    recommended,
    strategy: DRAFT_STRATEGIES[recommended],
    allStrategies: DRAFT_STRATEGIES,
    draftPosition: pos,
    format,
    numTeams,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROSTER ANALYSIS — Structural Advantage Detection
// ═══════════════════════════════════════════════════════════════════════════════

function analyzeRosterStrengths(roster, leagueSize = 12, format = 'PPR') {
  const positionalCounts = {};
  const playersByPos = {};

  (roster || []).forEach(p => {
    const pos = String(p.position || '').split('/')[0].split(',')[0].toUpperCase();
    positionalCounts[pos] = (positionalCounts[pos] || 0) + 1;
    if (!playersByPos[pos]) playersByPos[pos] = [];
    playersByPos[pos].push(p.player_name || p.name || 'Unknown');
  });

  // Identify surpluses (trade chips) and voids (needs)
  const slotRequirements = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const depthTargets = { QB: 2, RB: 4, WR: 4, TE: 2 };

  const surpluses = [];
  const voids = [];

  for (const [pos, required] of Object.entries(slotRequirements)) {
    const count = positionalCounts[pos] || 0;
    const depth = depthTargets[pos];

    if (count > depth) {
      surpluses.push({
        position: pos,
        count,
        excess: count - depth,
        players: playersByPos[pos] || [],
      });
    }
    if (count < required) {
      voids.push(pos);
    }
  }

  // Identify sell-high / buy-low candidates
  const sellHigh = [];
  const buyLow = [];

  (roster || []).forEach(p => {
    const sustainability = analyzeSustainability(p);
    if (sustainability.verdict === 'regression_candidate') {
      sellHigh.push({
        player: p.player_name || p.name,
        reasons: sustainability.signals.filter(s => s.impact < 0).map(s => s.detail),
      });
    }
  });

  return { surpluses, voids, sellHigh, buyLow, positionalCounts };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER INTELLIGENCE GENERATOR — Concise context for AI prompts
// ═══════════════════════════════════════════════════════════════════════════════

function generatePlayerIntelligence(player) {
  const pos = String(player.position || '').split('/')[0].toUpperCase();
  const stats = player.stats || {};
  const lines = [];

  lines.push(`${player.name || player.player_name} (${pos}, ${player.team || '?'})`);

  const vor = calculateVOR(stats, pos, 12);
  lines.push(`VOR: ${vor}/100`);

  const sustainability = analyzeSustainability(player);
  if (sustainability.signals.length) {
    lines.push(`Flags: ${sustainability.signals.map(s => s.flag).join(', ')}`);
  }

  const env = getScoringEnvironment(player.team || '');
  lines.push(`Scoring env: ${env}`);

  return lines.join(' | ');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core evaluation
  calculateVOR,
  getPositionalScarcity,
  analyzeSustainability,
  evaluateContingentUpside,
  getScoringEnvironment,

  // Game intelligence
  isOnBye,
  getMatchupQuality,

  // Trade & roster
  evaluateTrade,
  scoreWaiverTarget,
  optimizeLineup,
  analyzeRosterStrengths,

  // Draft
  getDraftStrategy,

  // Utilities
  generatePlayerIntelligence,

  // Constants (for external access)
  FORMATS,
  POSITIONAL_TIERS,
  DRAFT_STRATEGIES,
};
