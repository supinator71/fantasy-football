import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function PlayerTrends({ selectedLeague }) {
  const [data, setData] = useState({ myPlayers: [], freeAgents: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedLeague) loadTrends(selectedLeague)
  }, [selectedLeague])

  async function loadTrends(key) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${key}/trends`)
      setData(data)
    } catch {}
    setLoading(false)
  }

  const trendColors = { hot: '#ef4444', rising: '#f59e0b', neutral: '#7a94b4', cold: '#3b82f6' }
  const trendLabels = { hot: '🔥 Hot', rising: '📈 Rising', neutral: '➡️ Neutral', cold: '❄️ Cold' }

  if (loading) return <div className="loading">Loading player trends...</div>

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>My Players</h3>
        {data.myPlayers?.length > 0 ? (
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Trend</th><th>Key Stats</th></tr></thead>
            <tbody>
              {data.myPlayers.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0].split(',')[0]}`}>{p.position}</span></td>
                  <td>{p.team}</td>
                  <td style={{ color: trendColors[p.trend] || '#7a94b4', fontWeight: 600 }}>
                    {trendLabels[p.trend] || p.trend}
                  </td>
                  <td style={{ fontSize: 12, color: '#7a94b4' }}>
                    {(p.displayStats || []).slice(0, 3).map(s => `${s.label}: ${s.recent ?? '-'}`).join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#7a94b4', padding: 20, textAlign: 'center' }}>No trend data available</div>
        )}
      </div>

      {data.freeAgents?.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>Hot Free Agents</h3>
          <table>
            <thead><tr><th>Player</th><th>Pos</th><th>Team</th><th>Trend</th></tr></thead>
            <tbody>
              {data.freeAgents.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td><span className={`badge badge-${(p.position || '').toLowerCase().split('/')[0].split(',')[0]}`}>{p.position}</span></td>
                  <td>{p.team}</td>
                  <td style={{ color: trendColors[p.trend], fontWeight: 600 }}>{trendLabels[p.trend]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
