import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function DraftAssistant({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [board, setBoard] = useState({ players: [], totalDrafted: 0, myPicks: 0 })
  const [posFilter, setPosFilter] = useState('ALL')
  const [aiRec, setAiRec] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) setSelectedLeague(data[0].league_key)
    }).catch(() => {})
    loadBoard()
  }, [])

  function loadBoard() {
    axios.get('/api/draft/board').then(({ data }) => setBoard(data)).catch(() => {})
  }

  async function importPlayers() {
    if (!selectedLeague) return toast.error('Select a league first')
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${selectedLeague}/players?status=A&start=0`)
      await axios.post('/api/draft/import', { players: data })
      loadBoard()
      toast.success(`Imported ${data.length} players`)
    } catch (err) {
      toast.error('Import failed: ' + (err.response?.data?.error || err.message))
    }
    setLoading(false)
  }

  async function getRecommendation() {
    setLoading(true)
    try {
      const available = board.players.filter(p => !p.drafted).slice(0, 20)
      const myPicks = board.players.filter(p => p.drafted_by === 'me')
      const { data } = await axios.post('/api/claude/draft/recommend', {
        available_players: available, my_roster: myPicks,
        pick_number: board.totalDrafted + 1, total_picks: board.players.length,
        num_teams: leagueSettings?.num_teams || 12
      })
      setAiRec(data.recommendation)
    } catch (err) {
      toast.error('AI recommendation failed')
    }
    setLoading(false)
  }

  const positions = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF']
  const filtered = board.players.filter(p => !p.drafted && (posFilter === 'ALL' || (p.position || '').includes(posFilter)))

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Draft Assistant</h1>
      <p style={{ color: '#7a94b4', fontSize: 14, marginBottom: 16 }}>AI-powered NFL draft recommendations</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 200 }}>
          <option value="">Select league...</option>
          {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
        </select>
        <button className="btn btn-primary" onClick={importPlayers} disabled={loading}>Import Players</button>
        <button className="btn btn-accent" onClick={getRecommendation} disabled={loading}>🤖 Get AI Pick</button>
        <button className="btn btn-ghost" onClick={() => { axios.post('/api/draft/reset'); loadBoard() }}>Reset Board</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {positions.map(p => (
          <button key={p} className={`btn ${posFilter === p ? 'btn-primary' : 'btn-ghost'}`}
            style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => setPosFilter(p)}>{p}</button>
        ))}
      </div>

      <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 12 }}>
        {board.totalDrafted} drafted · {board.myPicks} my picks · {filtered.length} available
      </div>

      {aiRec && <div className="ai-response" style={{ marginBottom: 16 }}>{aiRec}</div>}

      <div className="card">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>ADP</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.slice(0, 50).map((p, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{p.player_name}</td>
                <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0]}`}>{p.position}</span></td>
                <td>{p.team}</td>
                <td>{p.adp || '-'}</td>
                <td>
                  <button className="btn btn-primary" style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={() => { axios.post('/api/draft/pick', { player_key: p.player_key, drafted_by: 'me', round: Math.ceil((board.totalDrafted + 1) / 12), pick: board.totalDrafted + 1 }); loadBoard() }}>
                    Draft
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
