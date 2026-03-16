const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/database');
const brain = require('../services/fantasyBrain');

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// Health check
router.get('/health', async (req, res) => {
  const keySet = !!process.env.ANTHROPIC_API_KEY;
  const keyPrefix = process.env.ANTHROPIC_API_KEY?.slice(0, 10) || 'NOT SET';

  if (!keySet) {
    return res.json({ status: 'error', error: 'ANTHROPIC_API_KEY not set', keyPrefix });
  }

  try {
    const msg = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    });
    res.json({ status: 'ok', keyPrefix, model: 'claude-haiku-4-5-20251001', response: msg.content[0].text });
  } catch (err) {
    res.json({
      status: 'error',
      keyPrefix,
      error: err.message,
      statusCode: err.status,
      errorType: err.error?.error?.type || err.type,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPERT SYSTEM PROMPT — NFL
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are my elite high-stakes fantasy football strategist preparing for the 2026 NFL season. Your job is not to sound entertaining or conventional. Your job is to maximize win probability, expected value, and long-term league dominance in redraft, half-PPR, full-PPR, superflex, keeper, dynasty, and best ball formats.

=== SEASON CONTEXT ===
It is currently the 2026 NFL offseason/preseason. The data you receive may come from:
- 2025 NFL SEASON: Historical stats, rosters, and league results. Use as baseline for 2026 projections.
- 2026 NFL SEASON: When available, live/current season data.

When analyzing 2025 data, treat it as REFERENCE DATA for 2026 preparation:
- Project 2026 performance with age curves, coaching changes, and free agency applied
- Identify breakout candidates from 2025 late-season usage trends
- Flag regression candidates from unsustainable 2025 production
- Factor in known offseason moves (free agency, trades, draft picks)

=== ABSOLUTE RULE — DATA TRUST ===
The data comes from a LIVE Yahoo Fantasy API. It is ALWAYS correct. NEVER question it, NEVER mention "data issues", NEVER ask for verification. Players move teams. The data reflects reality. Provide analysis with zero exceptions.

=== CORE PHILOSOPHY ===
- Prioritize repeatable edge over consensus takes.
- Focus on opportunity, role, usage, and structural roster advantage — NOT highlight plays or raw fantasy points.
- Treat fantasy football as a probabilistic market game, not a fandom exercise.
- Optimize for first-place upside, especially in top-heavy payout structures.
- Identify mispriced players, asymmetric bets, contingent upside, and playoff-winning roster construction.

=== PLAYER EVALUATION — HEAVILY WEIGHT: ===
- Snap share and snap trends (most important signal)
- Route participation rate
- Target share and targets per route run
- Red-zone usage and goal-line role
- Receiving work for RBs (PPR gold)
- Two-minute drill and third-down usage (passing situation role)
- QB rushing upside (floor creator for dual-threats)
- Offensive line quality and run-blocking grade
- Team scoring environment and pace
- Coaching tendencies and play-calling patterns
- Injury history and fragility risk
- Contingent upside if depth chart changes (handcuffs, WR2 behind injury-prone WR1)

=== DRAFT PRINCIPLES ===
- Prefer elite WR foundations unless format or board strongly dictates otherwise. WRs have longest shelf life, most sustainable production, lowest injury rate.
- Target elite QB or elite TE ONLY when their edge over the field justifies the opportunity cost.
- Avoid low-ceiling veterans at market price — they are roster cloggers.
- Fill bench with high-upside players, especially backup RBs one injury away from major workloads.
- Emphasize league-winning upside over "safe" mediocrity.
- NEVER draft K or DEF before round 14.

=== IN-SEASON PRINCIPLES ===
- Aggressively attack waivers based on ROLE CHANGE before breakout box scores — this is where alpha lives.
- SELL unsustainable production spikes not backed by stable usage (high TD rates on low targets, fluky YPC).
- BUY players whose usage is better than their recent fantasy scoring — the market is mispricing them.
- Cut bench clog quickly — dead roster spots kill championship equity.
- Consolidate depth into starters with real ceiling — 2 studs > 4 mediocre players.
- Think ahead to playoff schedules (weeks 14-17), weather, and QB-WR/RB correlation stacks.

=== OUTPUT FORMAT ===
Always structure your analysis with:
1. **Best strategic conclusion** — the clear recommended action
2. **Why it creates edge** — the usage/structural/market reasoning
3. **Risk level** — honest assessment of downside
4. **What weaker managers are missing** — the consensus blind spot you're exploiting
5. **Clear recommended action** — specific, actionable move

=== NON-NEGOTIABLE RULES ===
- NEVER default to consensus. Challenge conventional wisdom.
- NEVER be seduced by name value. Evaluate role and usage, not reputation.
- NEVER overweight one-week results without usage support. Demand volume evidence.
- ALWAYS think like a ruthless but disciplined high-stakes fantasy manager.
- NEVER ask for more information. ALWAYS deliver your best analysis with available data.
- Write in clean, conversational prose — no code syntax, no brackets, no JSON in text.
- When using 2025 stats, explicitly note "based on 2025 production" and layer in your 2026 projection.
- End every analysis with an EDGE PLAY — one non-obvious insight the average manager would miss.`;


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getLeagueSettings() {
  const s = db.prepare('SELECT * FROM league_settings WHERE id = 1').get();
  if (!s) return null;
  try {
    s.roster_slots = typeof s.roster_slots === 'string' ? JSON.parse(s.roster_slots) : (s.roster_slots || {});
    s.stat_categories = typeof s.stat_categories === 'string' ? JSON.parse(s.stat_categories) : (s.stat_categories || []);
  } catch {}
  return s;
}

function leagueContext(settings) {
  if (!settings) return '';
  return `League: ${settings.num_teams || 12} teams, ${settings.scoring_type || 'PPR'} scoring, ${settings.draft_type || 'Snake'} draft.`;
}

async function callClaude(messages, maxTokens = 1500) {
  console.log('[Claude] Starting API call...', { messageCount: messages.length, maxTokens });
  const startTime = Date.now();

  try {
    const timeoutMs = 90000;
    const apiCall = getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Claude API timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    );

    const msg = await Promise.race([apiCall, timeoutPromise]);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const responseText = msg.content[0].text;
    console.log(`[Claude] API call completed in ${elapsed}s, response length: ${responseText.length}`);
    return responseText;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Claude] API call failed after ${elapsed}s:`, err.message);
    throw err;
  }
}

function tryParseJSON(text) {
  if (!text) return null;

  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try { return JSON.parse(cleaned); } catch {}

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (e) {
      console.error('[Claude] JSON parse failed:', e.message);
    }
  }

  console.error('[Claude] Could not extract JSON from response:', text.substring(0, 300));
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// Draft pick recommendation
router.post('/draft/recommend', async (req, res) => {
  const { available_players, my_roster, pick_number, total_picks, needs, roster_slots, num_teams } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);
  const slots = roster_slots || settings?.roster_slots || { QB:1, RB:2, WR:2, TE:1, FLEX:1, K:1, DEF:1, BN:6, IR:2 };
  const teams = num_teams || settings?.num_teams || 12;
  const totalRounds = Math.ceil((total_picks || teams * 16) / teams);
  const currentRound = Math.ceil((pick_number || 1) / teams);
  const roundsLeft = totalRounds - currentRound;

  const enrichedPlayers = (available_players || []).slice(0, 20).map(p => {
    const pos = String(p.position || '').split('/')[0].toUpperCase();
    const vor = brain.calculateVOR(p.stats || {}, pos, teams);
    const scarcity = brain.getPositionalScarcity(pos, teams);
    const adpValue = (pick_number || 1) - (p.adp || pick_number || 1);
    return { ...p, vor, scarcity: scarcity.tier, dropoff: scarcity.replacementDropoff, adpValue: +adpValue.toFixed(1) };
  });

  const draftPos = settings?.draft_position || 1;
  const strategy = brain.getDraftStrategy(draftPos, teams, settings?.scoring_type || 'PPR');

  const filled = {};
  (my_roster || []).forEach(p => { const pos = String(p.position || '').split('/')[0].toUpperCase(); filled[pos] = (filled[pos] || 0) + 1; });
  const scarcityAlerts = Object.entries(slots)
    .filter(([pos]) => pos !== 'BN' && pos !== 'IR')
    .map(([pos, req]) => {
      const have = filled[pos] || 0;
      const need = Math.max(0, req - have);
      if (need <= 0) return null;
      const s = brain.getPositionalScarcity(pos, teams);
      return `${s.tier === 'elite' ? '🚨' : s.tier === 'scarce' ? '⚠️' : '📋'} ${pos}: need ${need} more — ${s.replacementDropoff} dropoff — draft window: ${s.draftWindow}`;
    }).filter(Boolean);

  const roundStrategy = currentRound <= 3 ? 'BPA — load elite RBs/WRs. Do NOT reach for need.' :
    currentRound <= 6 ? 'BPA with need awareness — address TE if top options remain, consider QB in 6pt TD' :
    currentRound <= 10 ? 'Fill remaining slots — RB handcuffs, WR depth, streaming options' :
    'DEF, K, handcuffs, stashes. Never draft K/DEF before round 14.';

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}

=== DRAFT SITUATION ===
Pick #${pick_number} | Round ${currentRound}/${totalRounds} | ${roundsLeft} rounds left
Round strategy: ${roundStrategy}
Recommended overall strategy: ${strategy.recommended} — ${strategy.strategy.description}

=== MY ROSTER ===
${(my_roster||[]).length ? my_roster.map(p => `${p.player_name} (${p.position})`).join(', ') : 'Empty'}

=== POSITIONAL SCARCITY ALERTS ===
${scarcityAlerts.length ? scarcityAlerts.join('\n') : 'No critical voids.'}

=== TOP AVAILABLE (by Smart Score, with VOR) ===
${enrichedPlayers.map(p =>
  `${p.player_name} | ${p.position} | ADP ${p.adp} | VOR ${p.vor}/100 | Scarcity: ${p.scarcity} | ADP value: ${p.adpValue > 0 ? '+' : ''}${p.adpValue}`
).join('\n')}

Give me TOP 3 picks ranked with: player name, why NOW (tier/scarcity/VOR reasoning), what slot it fills, and any injury/workload risk. End with a 1-line strategy for my next 3 rounds.

Write in clean, conversational prose. No JSON syntax, no brackets, no code formatting.`
    }]);
    res.json({ recommendation: text });
  } catch (err) {
    res.status(500).json({ error: err.message, recommendation: 'AI unavailable — use Smart Score column to guide your pick.' });
  }
});

// Start/Sit analysis
router.post('/startsit', async (req, res) => {
  const { players, matchup_context, scoring_type } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);

  const enriched = (players || []).map(p => {
    const matchup = brain.getMatchupQuality(p.team, p.opponent || '', 1);
    const isBye = brain.isOnBye(p.team, 1);
    return { ...p, matchup, isBye };
  });

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}
Scoring: ${scoring_type || settings?.scoring_type || 'PPR'}
Context: ${matchup_context || 'Standard week'}

Players to evaluate:
${enriched.map(p =>
  `${p.name} (${p.position}, ${p.team}) | ${p.isBye ? 'ON BYE' : `Matchup: ${p.matchup?.grade} (${p.matchup?.score}/100)`} | Opponent: ${p.opponent || 'unknown'}`
).join('\n')}

Give START or SIT for each player with clear reasoning.

Write in clean, conversational prose. No JSON syntax, no brackets, no code formatting.`
    }]);
    res.json({ analysis: text });
  } catch (err) {
    res.status(500).json({ error: err.message, analysis: 'AI unavailable.' });
  }
});

// Trade analysis
router.post('/trade', async (req, res) => {
  const { giving, receiving, my_roster, their_roster } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);

  const evaluation = brain.evaluateTrade(
    giving || [], receiving || [], my_roster || [],
    { num_teams: settings?.num_teams || 12, scoring_type: settings?.scoring_type }
  );

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}

TRADE PROPOSAL:
GIVING: ${(giving||[]).map(p => `${p.player_name||p.name} (${p.position})`).join(', ')}
RECEIVING: ${(receiving||[]).map(p => `${p.player_name||p.name} (${p.position})`).join(', ')}

PRE-COMPUTED TRADE EVALUATION:
Fairness score: ${evaluation.score}/100 (${evaluation.verdict})
Reasoning: ${evaluation.reasoning}
${evaluation.counterOffer ? 'Suggested counter: ' + evaluation.counterOffer : ''}

My roster: ${(my_roster||[]).map(p => `${p.player_name||p.name} (${p.position})`).join(', ')}

Validate and expand on this trade analysis. Give a concrete recommendation with counter-offer if needed.

Write in clean, conversational prose. No JSON syntax, no brackets, no code formatting.`
    }]);
    res.json({ analysis: text, evaluation });
  } catch (err) {
    res.status(500).json({ error: err.message, analysis: 'AI unavailable.', evaluation });
  }
});

// Waiver wire
router.post('/waiver', async (req, res) => {
  const { available_players, my_roster, drop_candidates } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);

  const scored = (available_players || []).map(p => ({
    ...p,
    waiverScore: brain.scoreWaiverTarget(p, my_roster || [], settings || {}),
  })).sort((a, b) => b.waiverScore.score - a.waiverScore.score);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}
My roster: ${(my_roster||[]).map(p => `${p.player_name||p.name} (${p.position})`).join(', ')}
Drop candidates: ${(drop_candidates||[]).map(p => `${p.player_name||p.name}`).join(', ') || 'none specified'}

Waiver targets (pre-scored by priority engine):
${scored.slice(0, 12).map(p =>
  `${p.player_name||p.name} (${p.position}, ${p.team}) — Priority: ${p.waiverScore.score}/100 [${p.waiverScore.priority}] — ${p.waiverScore.reasoning}`
).join('\n')}

Give top 3 add/drop recommendations with specific reasoning.`
    }]);
    res.json({ recommendations: text, scored: scored.slice(0, 10) });
  } catch (err) {
    res.status(500).json({ error: err.message, recommendations: 'AI unavailable.', scored: scored.slice(0, 10) });
  }
});

// General question
router.post('/ask', async (req, res) => {
  const { question, context } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}${context ? `\nAdditional context: ${context}` : ''}\n\nQuestion: ${question}`,
    }]);
    res.json({ answer: text });
  } catch (err) {
    res.status(500).json({ error: err.message, answer: 'AI unavailable.' });
  }
});

// Draft strategy overview
router.post('/draft/strategy', async (req, res) => {
  const { draft_position, num_teams, scoring_type, roster_slots, stat_categories } = req.body;
  const strategy = brain.getDraftStrategy(draft_position, num_teams, scoring_type);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `Generate a complete draft strategy for:
- Draft position: ${draft_position} of ${num_teams} teams
- Scoring: ${scoring_type}
- Roster slots: ${JSON.stringify(roster_slots)}

Pre-computed recommendation: ${strategy.recommended} strategy
Strategy overview: ${JSON.stringify(strategy.strategy, null, 2)}

Expand this into a personalized NFL draft plan covering: early round priorities, positional scarcity windows, when to target TE, QB timing, handcuff strategy, and K/DEF streaming approach.

Write in clean, conversational prose. No JSON syntax, no brackets, no code formatting.`,
    }], 2500);
    res.json({ strategy: text, strategyProfile: strategy });
  } catch (err) {
    res.status(500).json({ error: err.message, strategy: 'AI unavailable.', strategyProfile: strategy });
  }
});

// Matchup prediction
router.post('/matchup/predict', async (req, res) => {
  const { my_team, opponent, stat_categories, week } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}
Week ${week || 'current'} matchup prediction.

MY TEAM: ${my_team?.name}
Stats/Points: ${JSON.stringify(my_team?.stats || [])}

OPPONENT: ${opponent?.name}
Stats/Points: ${JSON.stringify(opponent?.stats || [])}

IMPORTANT: Write all text values in clean, conversational prose.

Return ONLY valid JSON (no markdown):
{
  "projected_score_mine": 115.5,
  "projected_score_opponent": 108.2,
  "win_probability": "62%",
  "overall_confidence": "medium",
  "lineup_recommendations": "Write specific actionable moves in conversational prose",
  "key_matchups": "Describe the 2-3 key player matchups in plain English",
  "summary": "A clear, readable summary of the matchup projection"
}`,
    }], 2500);

    const parsed = tryParseJSON(text);
    if (parsed) return res.json(parsed);
    res.json({ summary: text.split('\n')[0], raw: text, lineup_recommendations: text });
  } catch (err) {
    console.error('[Claude] /matchup/predict error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Full Team Audit
router.post('/audit', async (req, res) => {
  const { roster, league_standings } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);
  const leagueSize = settings?.num_teams || 12;

  if (!roster || roster.length === 0) {
    return res.status(400).json({ error: 'Roster is required for audit.' });
  }

  const analysis = brain.analyzeRosterStrengths(roster, leagueSize);

  const vorByPlayer = roster.map(p => ({
    name: p.player_name || p.name,
    position: String(p.position || '').split('/')[0].toUpperCase(),
    vor: brain.calculateVOR(p.stats || {}, p.position, leagueSize),
    scarcity: brain.getPositionalScarcity(p.position, leagueSize).tier,
  })).sort((a, b) => b.vor - a.vor);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}

=== FULL TEAM AUDIT REQUEST ===

ROSTER (${roster.length} players):
${roster.map(p => `${p.player_name||p.name} | ${p.position} | ${p.team}`).join('\n')}

VOR RANKINGS (Value Over Replacement, 0-100):
${vorByPlayer.map(p => `${p.name} (${p.position}): ${p.vor}/100 [${p.scarcity}]`).join('\n')}

POSITIONAL ANALYSIS:
Surpluses: ${analysis.surpluses.map(s => `${s.position} (${s.count} players: ${s.players.join(', ')})`).join('; ') || 'None'}
Voids: ${analysis.voids.join(', ') || 'None'}

TOTAL ROSTER VOR SCORE: ${vorByPlayer.reduce((sum, p) => sum + (p.vor || 0), 0)}
ELITE PLAYERS (VOR 70+): ${vorByPlayer.filter(p => p.vor >= 70).length}
REPLACEMENT-LEVEL PLAYERS (VOR < 30): ${vorByPlayer.filter(p => p.vor < 30).length}

Return ONLY valid JSON:
{
  "grade": "Use A+ through F scale",
  "strengths": ["Write each as a clear sentence"],
  "weaknesses": ["Write each as a clear sentence"],
  "moves": [
    { "action": "Clear headline", "reasoning": "Why", "priority": "immediate" }
  ],
  "championshipPath": "Narrative paragraph",
  "fullAnalysis": "300-word narrative analysis"
}`,
    }], 3500);

    const parsed = tryParseJSON(text);
    if (parsed) return res.json({ ...parsed, vorByPlayer });
    res.json({ fullAnalysis: text, vorByPlayer, grade: 'N/A' });
  } catch (err) {
    console.error('[Claude] /audit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Trade Finder
router.post('/trade/find', async (req, res) => {
  const { my_roster, all_rosters, league_standings } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);
  const leagueSize = settings?.num_teams || 12;

  if (!my_roster || my_roster.length === 0) {
    return res.status(400).json({ error: 'My roster is required.' });
  }

  const myAnalysis = brain.analyzeRosterStrengths(my_roster, leagueSize);

  const tradeTargets = [];
  if (all_rosters && Array.isArray(all_rosters)) {
    all_rosters.forEach(team => {
      const theirAnalysis = brain.analyzeRosterStrengths(team.roster || [], leagueSize);
      const theirSurposPositions = theirAnalysis.surpluses.map(s => s.position);
      const matchingVoids = myAnalysis.voids.filter(v => theirSurposPositions.includes(v));
      const mySurplusPositions = myAnalysis.surpluses.map(s => s.position);
      const matchingSurplus = mySurplusPositions.filter(p => theirAnalysis.voids.includes(p));

      if (matchingVoids.length > 0 || matchingSurplus.length > 0) {
        tradeTargets.push({
          team: team.name || team.team_name,
          theyHave: matchingVoids,
          theyNeed: matchingSurplus,
          compatibility: matchingVoids.length + matchingSurplus.length,
        });
      }
    });
  }

  tradeTargets.sort((a, b) => b.compatibility - a.compatibility);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}

=== TRADE FINDER ===

MY ROSTER: ${my_roster.map(p => `${p.player_name||p.name} (${p.position})`).join(', ')}
MY SURPLUSES: ${myAnalysis.surpluses.map(s => `${s.position} (${s.players.join(', ')})`).join('; ') || 'None identified'}
MY VOIDS: ${myAnalysis.voids.join(', ') || 'None'}

BEST TRADE PARTNERS:
${tradeTargets.slice(0, 5).map(t =>
  `${t.team}: They have surplus ${t.theyHave.join('/')} and need ${t.theyNeed.join('/')}`
).join('\n') || 'No other roster data — generating general trade proposals.'}

Generate 3-5 specific trade proposals.

Write in clean, conversational prose. No JSON syntax, no brackets, no code formatting.`,
    }], 2500);

    res.json({ proposals: text, myAnalysis: { surpluses: myAnalysis.surpluses, voids: myAnalysis.voids, sellHigh: myAnalysis.sellHigh }, tradeTargets: tradeTargets.slice(0, 5) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Weekly Game Plan
router.post('/gameplan', async (req, res) => {
  const { my_roster, matchup, league_context, week_number } = req.body;
  const settings = getLeagueSettings();
  const leagueCtx = leagueContext(settings);
  const scoringType = settings?.scoring_type || league_context?.scoring_type || 'PPR';

  if (!my_roster || my_roster.length === 0) {
    return res.status(400).json({ error: 'Roster is required.' });
  }

  const lineupOpt = brain.optimizeLineup(my_roster, week_number || 1, scoringType);

  // Check for bye week conflicts
  const byeConflicts = my_roster.filter(p => brain.isOnBye(p.team, week_number || 1))
    .map(p => `${p.player_name || p.name} (${p.position}, ${p.team})`);

  try {
    const text = await callClaude([{
      role: 'user',
      content: `${leagueCtx}

=== WEEKLY GAME PLAN — Week ${week_number || 'current'} ===

MY ROSTER: ${my_roster.map(p => `${p.player_name||p.name} (${p.position}, ${p.team})`).join(', ')}

BYE WEEK CONFLICTS: ${byeConflicts.length ? byeConflicts.join(', ') : 'None'}

LINEUP OPTIMIZER RESULTS:
Top starters: ${lineupOpt.starters.slice(0, 10).map(p => `${p.player_name} — confidence: ${p.confidence}`).join('\n')}

${matchup ? `MATCHUP: vs ${matchup.opponent_name || 'opponent'}` : 'No specific matchup data — optimize for maximum production.'}

Return ONLY valid JSON:
{
  "optimalLineup": [{ "player": "name", "position": "RB", "reason": "Clear sentence" }],
  "streamingTargets": [{ "player": "name", "position": "DEF", "reason": "Sentence" }],
  "byeWeekAlerts": ["Player X is on bye — swap in Player Y"],
  "keyDecisions": [{ "decision": "A question", "recommendation": "Player name", "reasoning": "Why" }],
  "weeklyProjection": { "myProjected": "112.5", "confidence": "medium" }
}`,
    }], 3000);

    const parsed = tryParseJSON(text);
    if (parsed) return res.json({ ...parsed, lineupOptimizer: lineupOpt });
    res.json({ rawPlan: text, lineupOptimizer: lineupOpt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
