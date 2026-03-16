import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function Standings({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [standings, setStandings] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) { setSelectedLeague(data[0].league_key); loadStandings(data[0].league_key) }
    }).catch(() => {})
  }, [])

  async function loadStandings(key) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${key}/standings`)
      setStandings(data || [])
    } catch {}
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Standings</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>League standings and team rankings</p>
        </div>
        <select value={selectedLeague} onChange={e => { setSelectedLeague(e.target.value); loadStandings(e.target.value) }} style={{ width: 200 }}>
          {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
        </select>
      </div>

      {loading ? <div className="loading">Loading standings...</div> : (
        <div className="card">
          {standings.length > 0 ? (
            <table>
              <thead><tr><th>#</th><th>Team</th><th>W-L-T</th><th>Pts For</th></tr></thead>
              <tbody>
                {standings.map((t, i) => {
                  const team = t.team || t
                  const info = Array.isArray(team) ? (Array.isArray(team[0]) ? Object.assign({}, ...team[0]) : team[0]) : team
                  const standingsData = Array.isArray(team) ? team.find(x => x?.team_standings) : null
                  const outcome = standingsData?.team_standings?.outcome_totals || {}
                  const points = standingsData?.team_standings?.points_for || '-'
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>{info?.name || `Team ${i + 1}`}</td>
                      <td>{outcome.wins || 0}-{outcome.losses || 0}-{outcome.ties || 0}</td>
                      <td>{points}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ color: '#7a94b4', padding: 40, textAlign: 'center' }}>No standings data available.</div>
          )}
        </div>
      )}
    </div>
  )
}
