import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function StartSit({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [roster, setRoster] = useState([])
  const [aiAnalysis, setAiAnalysis] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) { setSelectedLeague(data[0].league_key); loadRoster(data[0].league_key) }
    }).catch(() => {})
  }, [])

  async function loadRoster(key) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${key}/myroster`)
      setRoster(data.players || [])
    } catch {}
    setLoading(false)
  }

  async function getAnalysis() {
    setLoading(true)
    try {
      const { data } = await axios.post('/api/claude/startsit', {
        players: roster.map(p => ({ name: p.name, position: p.position, team: p.team })),
        scoring_type: leagueSettings?.scoring_type || 'PPR'
      })
      setAiAnalysis(data.analysis)
    } catch { toast.error('AI analysis failed') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Start / Sit</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>AI matchup-based start/sit recommendations</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedLeague} onChange={e => { setSelectedLeague(e.target.value); loadRoster(e.target.value) }} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={getAnalysis} disabled={loading || !roster.length}>🤖 Analyze</button>
        </div>
      </div>

      {aiAnalysis && <div className="ai-response" style={{ marginBottom: 16 }}>{aiAnalysis}</div>}

      <div className="card">
        <table>
          <thead><tr><th>Player</th><th>Pos</th><th>Team</th></tr></thead>
          <tbody>
            {roster.map((p, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0].split(',')[0]}`}>{p.position}</span></td>
                <td>{p.team}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
