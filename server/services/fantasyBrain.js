/**
 * fantasyBrain.js — Expert fantasy football logic engine
 * Pure computation — no Claude calls. Feeds structured intelligence into AI prompts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// A) POSITIONAL VALUE TIERS
// ─────────────────────────────────────────────────────────────────────────────

const POSITIONAL_DATA = {
  QB: {
    tier: 'moderate',
    draftWindow: 'rounds 3-8',
    replacementDropoff: 'gradual',
    notes: 'Elite QBs (Mahomes, Allen, Lamar) worth rounds 3-5 in 6pt passing TD. Position is deep — late-round QB viable. In 4pt passing TD leagues, wait longer.',
    replacementLevel: { passYds: 3800, passTDs: 22, rushYds: 150, rushTDs: 1, INTs: 12, fantasyPts: 280 },
    starterSlots: 1,
  },
  RB: {
    tier: 'elite',
    draftWindow: 'rounds 1-4',
    replacementDropoff: 'massive',
    notes: 'Most scarce position. Top-12 RBs dominate. Workload cliff after pick 40-50. Bell-cow backs with 3-down roles are premium assets. Injury risk is extreme.',
    replacementLevel: { rushYds: 600, rushTDs: 4, rec: 25, recYds: 180, recTDs: 1, fantasyPts: 140 },
    starterSlots: 2,
  },
  WR: {
    tier: 'deep',
    draftWindow: 'rounds 1-10',
    replacementDropoff: 'gradual',
    notes: 'Deepest skill position. Top-5 WRs (1,500+ yd ceiling) are round 1 value. Massive depth through round 10. PPR boosts slot receivers.',
    replacementLevel: { rec: 50, recYds: 650, recTDs: 4, fantasyPts: 135 },
    starterSlots: 2,
  },
  TE: {
    tier: 'scarce',
    draftWindow: 'rounds 2-6',
    replacementDropoff: 'massive',
    notes: 'Only 3-4 elite TEs exist (Kelce, Andrews tier). The drop from TE3 to TE8 is enormous. Replacement-level TE scores ~60% of elite TE. TE premium leagues amplify this.',
    replacementLevel: { rec: 35, recYds: 400, recTDs: 3, fantasyPts: 90 },
    starterSlots: 1,
  },
  K: {
    tier: 'replacement',
    draftWindow: 'round 15+',
    replacementDropoff: 'minimal',
    notes: 'Never draft before round 15. Stream based on Vegas-implied team totals and dome matchups. Top K vs replacement K gap is ~2 pts/week.',
    replacementLevel: { fgMade: 22, patMade: 30, fantasyPts: 115 },
    starterSlots: 1,
  },
  DEF: {
    tier: 'replacement',
    draftWindow: 'round 14+',
    replacementDropoff: 'minimal',
    notes: 'Stream weekly based on matchup. Target defenses facing bad offenses, high-turnover QBs. Never draft before round 14. Preseason consensus rankings are noise.',
    replacementLevel: { sacks: 30, ints: 10, fumRec: 8, defTDs: 2, fantasyPts: 100 },
    starterSlots: 1,
  },
  FLEX: {
    tier: 'deep',
    draftWindow: 'rounds 5-12',
    replacementDropoff: 'gradual',
    notes: 'RB/WR/TE eligible. Fill with best available value — volume is king. PPR leagues favor high-target WRs and pass-catching RBs.',
    replacementLevel: { fantasyPts: 130 },
    starterSlots: 1,
  },
}

function getPositionalScarcity(position, leagueSize = 12) {
  const pos = String(position || '').split('/')[0].split(',')[0].trim().toUpperCase()
  const normalized = pos === 'D/ST' ? 'DEF' : pos
  const data = POSITIONAL_DATA[normalized] || POSITIONAL_DATA['FLEX']
  const scale = leagueSize / 12

  return {
    tier: data.tier,
    draftWindow: data.draftWindow,
    replacementDropoff: data.replacementDropoff,
    replacementLevel: data.replacementLevel,
    notes: data.notes,
    urgencyScore: { elite: 10, scarce: 8, moderate: 5, deep: 2, replacement: 0 }[data.tier] || 3,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B) SCORING FORMAT STRATEGY
// ─────────────────────────────────────────────────────────────────────────────

const SCORING_ADJUSTMENTS = {
  'PPR': { WR: 1.15, RB: 0.95, TE: 1.10 },       // PPR boosts WR/TE, slightly nerfs non-catching RBs
  'Half PPR': { WR: 1.08, RB: 1.0, TE: 1.05 },
  'Standard': { WR: 0.95, RB: 1.10, TE: 0.95 },   // Standard boosts RBs
  '6pt Passing TD': { QB: 1.20 },                   // 6pt passing TDs raise QB value
}

function getScoringMultiplier(position, scoringType) {
  const pos = String(position || '').toUpperCase()
  const adjustments = SCORING_ADJUSTMENTS[scoringType] || {}
  return adjustments[pos] || 1.0
}

// ─────────────────────────────────────────────────────────────────────────────
// C) VALUE OVER REPLACEMENT (VOR) CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────

const STAT_WEIGHTS = {
  passYds: 0.04,   // 1 pt per 25 yards
  passTDs: 4.0,    // 4 pts per TD (standard)
  INTs: -2.0,
  rushYds: 0.1,    // 1 pt per 10 yards
  rushTDs: 6.0,
  rec: 1.0,        // PPR
  recYds: 0.1,
  recTDs: 6.0,
  fumLost: -2.0,
  fantasyPts: 1.0, // direct pts if available
}

function calculateVOR(playerStats = {}, position, leagueSize = 12) {
  if (!playerStats || Object.keys(playerStats).length === 0) return 0

  const pos = String(position || '').split('/')[0].split(',')[0].trim().toUpperCase()
  const normalized = pos === 'D/ST' ? 'DEF' : pos
  const scarcity = getPositionalScarcity(normalized, leagueSize)
  const baseline = scarcity.replacementLevel

  let rawScore = 0
  let totalWeight = 0

  // If we have raw fantasy points, use that as primary signal
  const pts = parseFloat(playerStats.fantasyPts || playerStats.points || playerStats['57'] || 0)
  const basePts = parseFloat(baseline.fantasyPts || 100)

  if (pts > 0 && basePts > 0) {
    rawScore = (pts - basePts) / Math.max(basePts, 1)
    totalWeight = 1
  }

  if (totalWeight === 0) return 50  // no data, neutral score

  const scarcityMultiplier = { elite: 1.4, scarce: 1.25, moderate: 1.0, deep: 0.85, replacement: 0.7 }[scarcity.tier] || 1.0
  const normalized2 = (rawScore / totalWeight) * scarcityMultiplier

  return Math.min(100, Math.max(0, Math.round(50 + normalized2 * 25)))
}

// ─────────────────────────────────────────────────────────────────────────────
// D) SCHEDULE & MATCHUP INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

// NFL Bye weeks (2026 approximation — update each season)
const BYE_WEEKS = {
  ARI: 14, ATL: 12, BAL: 14, BUF: 12, CAR: 7, CHI: 7, CIN: 12,
  CLE: 9, DAL: 7, DEN: 14, DET: 5, GB: 10, HOU: 14, IND: 14,
  JAX: 12, KC: 6, LAC: 5, LAR: 10, LV: 10, MIA: 6, MIN: 6,
  NE: 14, NO: 12, NYG: 11, NYJ: 12, PHI: 5, PIT: 9, SF: 9,
  SEA: 10, TB: 11, TEN: 5, WAS: 14
}

// Defense strength tiers (approximation — 1.0 = average)
const DEFENSE_STRENGTH = {
  // Strong defenses (harder matchup for opposing offense)
  SF: 0.85, DAL: 0.88, BUF: 0.88, BAL: 0.90, NYJ: 0.90, CLE: 0.92,
  // Average
  MIA: 0.97, PIT: 0.95, DEN: 0.95, PHI: 0.95, DET: 1.00, KC: 1.00,
  GB: 1.00, MIN: 1.00, NO: 1.02, TB: 1.02, SEA: 1.02, LAR: 1.03,
  // Weak defenses (better matchup for opposing offense)
  NE: 1.08, CAR: 1.10, ARI: 1.08, LV: 1.05, NYG: 1.10,
  WAS: 1.05, CHI: 1.05, TEN: 1.08, JAX: 1.05, ATL: 1.03,
  IND: 1.03, CIN: 1.03, HOU: 1.00, LAC: 1.00,
}

// Dome/indoor venues
const DOME_TEAMS = new Set(['ARI', 'ATL', 'DAL', 'DET', 'HOU', 'IND', 'LAC', 'LAR', 'LV', 'MIN', 'NO'])

function getMatchupQuality(teamAbbr, opponentAbbr, weekNumber) {
  const team = String(teamAbbr || '').toUpperCase()
  const opp = String(opponentAbbr || '').toUpperCase()

  const isBye = BYE_WEEKS[team] === weekNumber
  const oppDefStrength = DEFENSE_STRENGTH[opp] || 1.0
  const isDome = DOME_TEAMS.has(team) || DOME_TEAMS.has(opp) // home or away dome

  let score = 50
  if (isBye) return { score: 0, grade: 'BYE WEEK', isBye: true, isDome }

  // Opponent defense quality
  if (oppDefStrength >= 1.08) score += 20      // weak defense = great matchup
  else if (oppDefStrength >= 1.04) score += 12
  else if (oppDefStrength <= 0.90) score -= 15  // elite defense = tough matchup
  else if (oppDefStrength <= 0.95) score -= 8

  // Dome boost (reduces weather risk)
  if (isDome) score += 5

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    grade: score >= 75 ? 'Smash spot' : score >= 60 ? 'Good matchup' : score >= 45 ? 'Neutral' : score >= 30 ? 'Tough matchup' : 'Avoid',
    oppDefStrength,
    isDome,
    isBye: false,
  }
}

function isOnBye(teamAbbr, weekNumber) {
  return BYE_WEEKS[String(teamAbbr || '').toUpperCase()] === weekNumber
}

// ─────────────────────────────────────────────────────────────────────────────
// E) TRADE FAIRNESS ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function evaluateTrade(giving = [], receiving = [], myRoster = [], leagueContext = {}) {
  const leagueSize = leagueContext.num_teams || 12

  const givingVOR = giving.reduce((sum, p) => sum + calculateVOR(p.stats || {}, p.position, leagueSize), 0)
  const receivingVOR = receiving.reduce((sum, p) => sum + calculateVOR(p.stats || {}, p.position, leagueSize), 0)

  const givingScarcity = giving.reduce((sum, p) => {
    const s = getPositionalScarcity(p.position, leagueSize)
    return sum + s.urgencyScore
  }, 0)
  const receivingScarcity = receiving.reduce((sum, p) => {
    const s = getPositionalScarcity(p.position, leagueSize)
    return sum + s.urgencyScore
  }, 0)

  const myPositions = myRoster.map(p => String(p.position || '').split('/')[0].toUpperCase())
  const rosterNeedBonus = receiving.reduce((bonus, p) => {
    const pos = String(p.position || '').split('/')[0].toUpperCase()
    const countAtPos = myPositions.filter(mp => mp === pos).length
    const scarcity = getPositionalScarcity(pos, leagueSize)
    if (countAtPos === 0 && scarcity.tier !== 'deep') return bonus + 15
    if (countAtPos === 0) return bonus + 8
    return bonus
  }, 0)

  const countDelta = receiving.length - giving.length
  const rosterSpotValue = countDelta < 0 ? 10 : countDelta > 0 ? -8 : 0

  const vorDelta = receivingVOR - givingVOR
  const scarcityDelta = receivingScarcity - givingScarcity
  let score = (vorDelta * 0.6) + (scarcityDelta * 2) + rosterNeedBonus + rosterSpotValue

  score = Math.max(-100, Math.min(100, Math.round(score)))

  const verdict =
    score >= 60 ? 'smash accept' :
    score >= 20 ? 'accept' :
    score >= -15 ? 'fair' :
    score >= -45 ? 'decline' :
    'insulting'

  const reasoning = [
    `VOR delta: ${receivingVOR > givingVOR ? '+' : ''}${(receivingVOR - givingVOR).toFixed(0)} in your favor`,
    givingScarcity > receivingScarcity ? `You're giving up scarcer positional value` : `You're receiving scarcer positional value`,
    rosterNeedBonus > 0 ? `Filling a roster hole adds ${rosterNeedBonus} need-bonus points` : null,
  ].filter(Boolean).join('. ')

  const counterOffer = score < -15 && receiving.length > 0
    ? `Counter: ask them to add a ${getPositionalScarcity(giving[0]?.position, leagueSize).tier}-tier player to balance the VOR gap`
    : score >= -15 && score < 20
      ? `Negotiate: request a bench depth upgrade to push this from fair to favorable`
      : ''

  return { score, verdict, reasoning, counterOffer }
}

// ─────────────────────────────────────────────────────────────────────────────
// F) WAIVER WIRE PRIORITY SCORING
// ─────────────────────────────────────────────────────────────────────────────

function scoreWaiverTarget(player = {}, myRoster = [], leagueSettings = {}) {
  let score = 30

  const pos = String(player.position || '').split('/')[0].toUpperCase()
  const leagueSize = leagueSettings.num_teams || 12
  const scarcity = getPositionalScarcity(pos, leagueSize)
  const myPositions = myRoster.map(p => String(p.position || '').split('/')[0].toUpperCase())
  const countAtPos = myPositions.filter(p => p === pos).length
  const required = (leagueSettings.roster_slots || {})[pos] || (pos === 'RB' || pos === 'WR' ? 2 : 1)

  // Positional need
  if (countAtPos < required) score += scarcity.urgencyScore * 3
  else if (countAtPos >= required) score -= 10

  // Recent performance (simplified for NFL)
  const recentPts = parseFloat(player.recentStats?.['57'] || player.recent_pts || 0)
  const seasonPts = parseFloat(player.seasonStats?.['57'] || player.season_pts || 0)
  if (recentPts > 0 && seasonPts > 0) {
    if (recentPts > seasonPts * 1.30) score += 15  // outperforming
    else if (recentPts < seasonPts * 0.70) score -= 10  // underperforming
  }

  score = Math.min(100, Math.max(0, Math.round(score)))

  return {
    score,
    priority: score >= 85 ? 'MUST ADD' : score >= 70 ? 'High priority' : score >= 50 ? 'Speculative add' : score >= 35 ? 'Monitor' : 'Pass',
    reasoning: `Positional need (${pos}: ${countAtPos}/${required}), scarcity: ${scarcity.tier}`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G) WEEKLY LINEUP OPTIMIZATION
// ─────────────────────────────────────────────────────────────────────────────

function optimizeLineup(roster = [], weekNumber = 1, scoringType = 'PPR') {
  if (!roster || roster.length === 0) {
    return { starters: [], bench: [], reasoning: 'No roster provided.' }
  }

  const recommendations = roster.map(player => {
    const team = String(player.team || '').toUpperCase()
    const pos = String(player.position || '').split('/')[0].toUpperCase()
    const isBye = isOnBye(team, weekNumber)

    let startScore = 50

    if (isBye) {
      startScore = 0
    } else {
      // Positional base value
      const posBonus = { QB: 15, RB: 12, WR: 10, TE: 8, K: 3, DEF: 3 }
      startScore += posBonus[pos] || 5

      // Recent pts trend
      const recentPts = parseFloat(player.recentStats?.['57'] || player.recent_pts || 0)
      const seasonPts = parseFloat(player.seasonStats?.['57'] || player.season_pts || 0)
      if (recentPts > 0 && seasonPts > 0) {
        startScore += ((recentPts - seasonPts) / Math.max(seasonPts, 1)) * 15
      }
    }

    const onIR = player.injury_status === 'IR' || player.status === 'IR' || player.injury_status === 'O' || player.status === 'O'
    if (onIR) startScore -= 50

    const confidence = startScore >= 70 ? 'High' : startScore >= 45 ? 'Medium' : 'Low'

    return {
      player_name: player.player_name || player.name,
      position: player.position,
      team: player.team,
      isBye,
      startScore: Math.round(startScore),
      confidence,
      reasoning: isBye ? `ON BYE — cannot start.` :
        (onIR ? 'INJURED — do not start.' :
        `${pos} — ${confidence} confidence.`)
    }
  })

  const sorted = recommendations.sort((a, b) => b.startScore - a.startScore)

  return {
    starters: sorted.filter(p => p.startScore >= 40 && !p.isBye && !p.reasoning.includes('INJURED')).slice(0, 14),
    bench: sorted.filter(p => p.startScore < 40 || p.isBye || p.reasoning.includes('INJURED')),
    reasoning: `Ranked ${roster.length} players for week ${weekNumber}. Bye weeks and injuries factored in.`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// H) DRAFT STRATEGY PROFILES
// ─────────────────────────────────────────────────────────────────────────────

const DRAFT_STRATEGIES = {
  'Robust RB': {
    description: 'Draft 2-3 elite RBs in rounds 1-4, build a dominant rushing foundation.',
    roundTargets: {
      '1-2': 'Two top-12 RBs. Bell-cow backs with three-down roles.',
      '3-5': 'Elite WR1, or third RB if top value falls. Address TE if Kelce/Andrews available.',
      '6-9': 'Fill WR2/WR3 spots with high-target receivers. PPR-friendly pass catchers.',
      '10-15': 'QB (if late-round strategy), handcuff RBs, backup TE, streaming DEF/K.',
    },
    archetypes: ['2-3 elite RBs', '2 high-upside WRs', 'Late-round QB'],
    risk: 'High — RB injuries are devastating. One ACL tear tanks the team.',
    reward: 'Dominant weekly floor from rushing volume + goal-line work.',
    bestFor: 'Picks 1-6, Standard scoring leagues',
  },
  'Hero RB': {
    description: 'Draft one stud RB in round 1, then load up on WRs in rounds 2-5.',
    roundTargets: {
      '1': 'One top-5 RB — the "hero" who carries the position.',
      '2-5': 'Three to four premium WRs. Target high-target high-ceiling receivers.',
      '6-8': 'RB2 depth — pass-catching backs, committee members with upside.',
      '9-15': 'QB, TE, handcuffs, streaming positions.',
    },
    archetypes: ['1 elite RB', '4 premium WRs', 'RB2 from waivers'],
    risk: 'Medium — dependent on Hero RB staying healthy and finding RB2 on waivers.',
    reward: 'Massive WR corps creates weekly ceiling. Trade WR surplus for RB if needed.',
    bestFor: 'PPR leagues, picks 1-5',
  },
  'Zero RB': {
    description: 'Avoid RBs entirely in first 4-5 rounds. Stack elite WRs and TE.',
    roundTargets: {
      '1-3': 'Three elite WRs or 2 WRs + premium TE.',
      '4-5': 'QB (if 6pt passing TD) or continue stacking WR depth.',
      '6-10': 'RBs on the rebound — target high-upside backs. Utilize waiver wire aggressively.',
      '11-15': 'Handcuffs, backup QB, streaming positions.',
    },
    archetypes: ['4 elite WRs', 'Premium TE', 'RBs from waivers/trades'],
    risk: 'High — RB2 spot will be shaky all season. Must hit on waivers.',
    reward: 'League-winning weekly ceiling from WR corps. WR depth is insurance.',
    bestFor: 'PPR leagues, experienced managers, picks 7-12',
  },
  'Late-Round QB': {
    description: 'Wait on QB until round 10+. Load premium skill position players early.',
    roundTargets: {
      '1-4': 'Best available RB/WR — pure value. Ignore QB entirely.',
      '5-7': 'Fill WR/RB depth, address TE.',
      '8-9': 'Backup RB, handcuffs, speculative adds.',
      '10-15': 'QB1, backup QB with rushing upside, streaming K/DEF.',
    },
    archetypes: ['Loaded RB/WR corps', 'QB10-15 range', 'Streaming K/DEF'],
    risk: 'Low — QB is the deepest position. QB12 averages ~3 pts/game less than QB1.',
    reward: 'Extra premium picks at scarce positions (RB/TE).',
    bestFor: '4pt passing TD leagues, any draft position',
  },
  'TE Premium': {
    description: 'Secure an elite TE in rounds 2-3. Pair with strong RB/WR foundation.',
    roundTargets: {
      '1': 'Best available RB or WR1.',
      '2-3': 'Elite TE (Kelce/Andrews tier). The positional advantage is 5-8 pts/week.',
      '4-6': 'Fill RB/WR needs with remaining value.',
      '7-15': 'QB, depth, streaming positions.',
    },
    archetypes: ['Elite TE', '1-2 strong RBs', 'Solid WR corps'],
    risk: 'Medium — paying premium for TE means thinner RB/WR depth.',
    reward: '5-8 pt/week edge at TE. In TE premium leagues, this gap doubles.',
    bestFor: 'TE premium scoring leagues, picks 5-10',
  },
}

function getDraftStrategy(draftPosition, numTeams = 12, scoringType = 'PPR') {
  const early = draftPosition <= 4
  const mid = draftPosition >= 5 && draftPosition <= 8
  const late = draftPosition >= 9

  const isPPR = scoringType.toLowerCase().includes('ppr')
  const isSixPtTD = scoringType.toLowerCase().includes('6pt')

  let recommended
  if (early && !isPPR) recommended = 'Robust RB'
  else if (early && isPPR) recommended = 'Hero RB'
  else if (mid) recommended = 'Late-Round QB'
  else recommended = 'Zero RB'

  return {
    recommended,
    strategy: DRAFT_STRATEGIES[recommended],
    alternatives: Object.entries(DRAFT_STRATEGIES)
      .filter(([name]) => name !== recommended)
      .map(([name, s]) => ({ name, bestFor: s.bestFor })),
    allStrategies: DRAFT_STRATEGIES,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROSTER ANALYSIS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function analyzeRosterStrengths(roster = [], leagueSize = 12) {
  const byPosition = {}
  const vorByPlayer = []

  roster.forEach(player => {
    const pos = String(player.position || '').split('/')[0].toUpperCase()
    if (!byPosition[pos]) byPosition[pos] = []
    const vor = calculateVOR(player.stats || {}, pos, leagueSize)
    byPosition[pos].push({ ...player, vor })
    vorByPlayer.push({ name: player.player_name || player.name, position: pos, vor })
  })

  const surpluses = Object.entries(byPosition)
    .filter(([pos, players]) => players.length >= 3)
    .map(([pos, players]) => ({
      position: pos,
      count: players.length,
      players: players.map(p => p.player_name || p.name),
      scarcity: getPositionalScarcity(pos, leagueSize).tier,
    }))

  const voids = ['QB', 'RB', 'WR', 'TE'].filter(pos =>
    !byPosition[pos] || byPosition[pos].length === 0
  )

  const sellHigh = vorByPlayer
    .filter(p => p.vor >= 70)
    .sort((a, b) => b.vor - a.vor)
    .slice(0, 3)
    .map(p => ({ ...p, reason: 'High VOR — trade from strength' }))

  const buyLow = vorByPlayer
    .filter(p => p.vor <= 35 && p.vor > 0)
    .sort((a, b) => a.vor - b.vor)
    .slice(0, 3)
    .map(p => ({ ...p, reason: 'Low VOR vs expected — buy low or cut' }))

  return { byPosition, surpluses, voids, sellHigh, buyLow, vorByPlayer }
}

// ─────────────────────────────────────────────────────────────────────────────
// I) PLAYER INTELLIGENCE GENERATOR (for Claude context enrichment)
// ─────────────────────────────────────────────────────────────────────────────

function generatePlayerIntelligence(playerData) {
  if (!playerData || !playerData.stats) return null

  const s = playerData.stats
  const type = playerData.type || 'offensive'
  const summaryParts = []

  if (type === 'qb' || playerData.position === 'QB') {
    const passYds = parseInt(s.passYds || s.Pass_Yds || 0)
    const passTDs = parseInt(s.passTDs || s.Pass_TDs || 0)
    const ints = parseInt(s.INTs || s.Int || 0)
    const rushYds = parseInt(s.rushYds || s.Rush_Yds || 0)
    if (passYds) summaryParts.push(`${passYds} pass yds`)
    if (passTDs) summaryParts.push(`${passTDs} pass TDs`)
    if (ints) summaryParts.push(`${ints} INTs`)
    if (rushYds > 200) summaryParts.push(`${rushYds} rush yds (dual-threat)`)
  } else {
    const rushYds = parseInt(s.rushYds || s.Rush_Yds || 0)
    const rushTDs = parseInt(s.rushTDs || s.Rush_TDs || 0)
    const rec = parseInt(s.rec || s.Rec || 0)
    const recYds = parseInt(s.recYds || s.Rec_Yds || 0)
    const recTDs = parseInt(s.recTDs || s.Rec_TDs || 0)
    if (rushYds) summaryParts.push(`${rushYds} rush yds, ${rushTDs} rush TDs`)
    if (rec) summaryParts.push(`${rec} rec, ${recYds} rec yds, ${recTDs} rec TDs`)
  }

  return {
    summary: summaryParts.join(' | ') || 'No stat data available',
    stats: s,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// J) CATEGORY ANALYSIS (for H2H matchups)
// ─────────────────────────────────────────────────────────────────────────────

function analyzeCategories(myStats = {}, leagueStandings = [], scoringType = 'H2H Points') {
  const result = { punt: [], chase: [], locked: [], swing: [], advice: '' }

  // NFL is primarily H2H points, so analyze matchup directly
  const opponent = leagueStandings[0] || {}
  const myPts = parseFloat(myStats.points || myStats['57'] || 0)
  const oppPts = parseFloat(opponent.stats?.points || opponent.stats?.['57'] || opponent.points || 0)

  if (myPts > 0 && oppPts > 0) {
    const gap = myPts - oppPts
    const pct = Math.abs(gap) / Math.max(myPts, 1) * 100

    if (gap > 0 && pct > 15) {
      result.advice = `You're projected to win by ${gap.toFixed(1)} points. Protect your lead — bench risky boom/bust players for safe floors.`
      result.locked.push('Total Points')
    } else if (gap < 0 && pct > 15) {
      result.advice = `You're projected to lose by ${Math.abs(gap).toFixed(1)} points. Swing for the fences — start boom/bust players with high ceilings.`
      result.punt.push('Safety')
    } else {
      result.advice = `Close matchup — projected within ${Math.abs(gap).toFixed(1)} points. Every roster decision matters. Optimize every slot.`
      result.swing.push('Total Points')
    }
  } else {
    result.advice = 'No matchup data — optimize for maximum total production.'
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // Positional analysis
  getPositionalScarcity,
  getScoringMultiplier,
  POSITIONAL_DATA,
  BYE_WEEKS,

  // Value calculations
  calculateVOR,
  analyzeCategories,

  // Matchup & schedule
  getMatchupQuality,
  isOnBye,

  // Trade
  evaluateTrade,

  // Waiver wire
  scoreWaiverTarget,

  // Lineup
  optimizeLineup,

  // Draft
  getDraftStrategy,
  DRAFT_STRATEGIES,

  // Roster analysis
  analyzeRosterStrengths,
  generatePlayerIntelligence,
}
