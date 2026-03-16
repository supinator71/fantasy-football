import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function WaiverWire({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [players, setPlayers] = useState([])
  const [aiRec, setAiRec] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) { setSelectedLeague(data[0].league_key); loadPlayers(data[0].league_key) }
    }).catch(() => {})
  }, [])

  async function loadPlayers(key) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${key || selectedLeague}/players?status=FA&start=0`)
      setPlayers(data || [])
    } catch {}
    setLoading(false)
  }

  async function getAIRec() {
    setLoading(true)
    try {
      const roster = await axios.get(`/api/yahoo/league/${selectedLeague}/myroster`)
      const { data } = await axios.post('/api/claude/waiver', { available_players: players.slice(0, 15), my_roster: roster.data.players || [] })
      setAiRec(data.recommendations)
    } catch (err) { toast.error('AI failed') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Waiver Wire</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>Available free agents and AI pickup recommendations</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedLeague} onChange={e => { setSelectedLeague(e.target.value); loadPlayers(e.target.value) }} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={getAIRec} disabled={loading}>🤖 AI Picks</button>
        </div>
      </div>

      {aiRec && <div className="ai-response" style={{ marginBottom: 16 }}>{aiRec}</div>}

      {loading ? <div className="loading">Loading...</div> : (
        <div className="card">
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th></tr></thead>
            <tbody>
              {players.slice(0, 30).map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0].split(',')[0]}`}>{p.position}</span></td>
                  <td>{p.team}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
