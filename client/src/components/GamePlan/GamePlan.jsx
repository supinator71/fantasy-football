import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function GamePlan({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [plan, setPlan] = useState(null)
  const [weekNumber, setWeekNumber] = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) setSelectedLeague(data[0].league_key)
    }).catch(() => {})
  }, [])

  async function generatePlan() {
    if (!selectedLeague) return
    setLoading(true)
    try {
      const roster = await axios.get(`/api/yahoo/league/${selectedLeague}/myroster`)
      const { data } = await axios.post('/api/claude/gameplan', {
        my_roster: roster.data.players || [],
        week_number: weekNumber
      })
      setPlan(data)
    } catch (err) { toast.error('Game plan failed') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Weekly Game Plan</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>AI-optimized lineup with bye week and streaming recommendations</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 13, color: '#7a94b4' }}>Week:</label>
          <select value={weekNumber} onChange={e => setWeekNumber(parseInt(e.target.value))} style={{ width: 70 }}>
            {Array.from({ length: 18 }, (_, i) => <option key={i+1} value={i+1}>Wk {i+1}</option>)}
          </select>
          <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={generatePlan} disabled={loading}>🤖 Generate Plan</button>
        </div>
      </div>

      {loading && <div className="loading">Generating your game plan...</div>}

      {plan && (
        <div>
          {plan.byeWeekAlerts?.length > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: '#f59e0b' }}>
              <h3 style={{ color: '#f59e0b', marginBottom: 8 }}>⚠️ Bye Week Alerts</h3>
              {plan.byeWeekAlerts.map((a, i) => <p key={i} style={{ fontSize: 14, marginBottom: 4 }}>{a}</p>)}
            </div>
          )}

          {plan.optimalLineup && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginBottom: 12 }}>Optimal Lineup</h3>
              <table>
                <thead><tr><th>Player</th><th>Pos</th><th>Why</th></tr></thead>
                <tbody>
                  {plan.optimalLineup.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{p.player}</td>
                      <td><span className={`badge badge-${(p.position || '').toLowerCase()}`}>{p.position}</span></td>
                      <td style={{ fontSize: 13, color: '#7a94b4' }}>{p.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan.rawPlan && <div className="ai-response">{plan.rawPlan}</div>}
        </div>
      )}
    </div>
  )
}
