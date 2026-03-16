const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname);
const DB_FILE = path.join(DB_DIR, 'data.json');

const DEFAULT_DATA = {
  tokens: null,
  league_settings: null,
  draft_board: [],
  my_roster: [],
  notes: []
};

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch {}
  return { ...DEFAULT_DATA };
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Simple synchronous DB interface mimicking SQLite prepare/run/get/all
const db = {
  prepare(query) {
    return {
      run(...args) {
        const data = load();
        // Tokens
        if (query.includes('INSERT OR REPLACE INTO tokens')) {
          data.tokens = { access_token: args[0], refresh_token: args[1], expires_at: args[2], id: 1 };
          save(data);
        } else if (query.includes('UPDATE tokens SET access_token')) {
          if (data.tokens) {
            data.tokens.access_token = args[0];
            data.tokens.refresh_token = args[1];
            data.tokens.expires_at = args[2];
          }
          save(data);
        } else if (query.includes('DELETE FROM tokens')) {
          data.tokens = null;
          save(data);
        }
        // League settings
        else if (query.includes('INSERT OR REPLACE INTO league_settings')) {
          data.league_settings = {
            id: 1, league_key: args[0], league_name: args[1], num_teams: args[2],
            scoring_type: args[3], draft_type: args[4], draft_position: args[5],
            roster_slots: args[6], stat_categories: args[7], updated_at: args[8]
          };
          save(data);
        }
        // Draft board
        else if (query.includes('INSERT OR IGNORE INTO draft_board')) {
          const exists = data.draft_board.find(p => p.player_key === args[0]);
          if (!exists) {
            data.draft_board.push({ player_key: args[0], player_name: args[1], position: args[2], team: args[3], adp: args[4], drafted: 0, drafted_by: null, draft_round: null, draft_pick: null });
          }
          save(data);
        } else if (query.includes('UPDATE draft_board SET drafted = 1')) {
          const p = data.draft_board.find(p => p.player_key === args[3]);
          if (p) { p.drafted = 1; p.drafted_by = args[0]; p.draft_round = args[1]; p.draft_pick = args[2]; }
          save(data);
        } else if (query.includes('UPDATE draft_board SET drafted = 0')) {
          const p = data.draft_board.find(p => p.player_key === args[0]);
          if (p) { p.drafted = 0; p.drafted_by = null; p.draft_round = null; p.draft_pick = null; }
          save(data);
        } else if (query.includes('DELETE FROM draft_board')) {
          data.draft_board = [];
          save(data);
        }
      },
      get(...args) {
        const data = load();
        if (query.includes('FROM tokens')) return data.tokens;
        if (query.includes('FROM league_settings')) return data.league_settings;
        if (query.includes('COUNT(*) as count FROM draft_board WHERE drafted = 1')) return { count: data.draft_board.filter(p => p.drafted).length };
        if (query.includes('COUNT(*) as count FROM draft_board WHERE drafted_by')) return { count: data.draft_board.filter(p => p.drafted_by === 'me').length };
        if (query.includes('COUNT(*) as count FROM draft_board')) return { count: data.draft_board.length };
        return null;
      },
      all(...args) {
        const data = load();
        if (query.includes('FROM draft_board WHERE drafted = 0')) {
          let results = data.draft_board.filter(p => !p.drafted);
          if (query.includes('position LIKE')) {
            const match = query.match(/position LIKE '%(.+?)%'/);
            if (match) results = results.filter(p => p.position && p.position.includes(match[1]));
          }
          return results.sort((a, b) => (a.adp || 0) - (b.adp || 0));
        }
        if (query.includes("drafted_by = 'me'")) {
          return data.draft_board.filter(p => p.drafted_by === 'me').sort((a, b) => (a.draft_pick || 0) - (b.draft_pick || 0));
        }
        if (query.includes('FROM draft_board')) {
          return data.draft_board.sort((a, b) => (a.adp || 0) - (b.adp || 0));
        }
        return [];
      }
    };
  },
  transaction(fn) {
    return function(...args) {
      return fn(...args);
    };
  },
  exec() {}
};

module.exports = db;
