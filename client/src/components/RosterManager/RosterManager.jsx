import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function RosterManager({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [roster, setRoster] = useState([])
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
      const { data } = await axios.get(`/api/yahoo/league/${key || selectedLeague}/myroster`)
      setRoster(data.players || [])
    } catch {}
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>My Roster</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>Your current NFL fantasy roster</p>
        </div>
        <select value={selectedLeague} onChange={e => { setSelectedLeague(e.target.value); loadRoster(e.target.value) }} style={{ width: 200 }}>
          {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
        </select>
      </div>

      {loading ? <div className="loading">Loading roster...</div> : (
        <div className="card">
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th></tr></thead>
            <tbody>
              {roster.length > 0 ? roster.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0].split(',')[0]}`}>{p.position}</span></td>
                  <td>{p.team}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#7a94b4', padding: 40 }}>No roster data. Select a league above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
