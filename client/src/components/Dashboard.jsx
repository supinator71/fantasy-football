import React, { useState, useEffect } from 'react'
import axios from 'axios'

export default function Dashboard({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    axios.get('/api/yahoo/leagues')
      .then(({ data }) => setLeagues(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: '#7a94b4', fontSize: 14, marginBottom: 24 }}>Your fantasy football command center</p>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>League Info</div>
          {leagueSettings ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{leagueSettings.league_name || 'My League'}</div>
              <div style={{ color: '#7a94b4', fontSize: 13 }}>
                {leagueSettings.num_teams} teams · {leagueSettings.scoring_type} · {leagueSettings.draft_type} draft
              </div>
            </div>
          ) : (
            <div style={{ color: '#7a94b4' }}>No league configured. Visit <strong>League Setup</strong> to get started.</div>
          )}
        </div>

        <div className="card">
          <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>Quick Actions</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a href="/roster"><button className="btn btn-ghost">My Roster</button></a>
            <a href="/waiver"><button className="btn btn-ghost">Waiver Wire</button></a>
            <a href="/startsit"><button className="btn btn-ghost">Start/Sit</button></a>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 12 }}>Your Leagues</div>
        {loading ? (
          <div className="loading">Loading leagues...</div>
        ) : leagues.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>League</th>
                <th>Key</th>
                <th>Teams</th>
                <th>Scoring</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{l.name || 'Unnamed'}</td>
                  <td style={{ fontSize: 12, color: '#7a94b4' }}>{l.league_key}</td>
                  <td>{l.num_teams || '-'}</td>
                  <td>{l.scoring_type || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#7a94b4', padding: 20, textAlign: 'center' }}>
            No leagues found. Make sure you have an active Yahoo Fantasy Football league.
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>AI Health Check</div>
        <AIHealthCheck />
      </div>
    </div>
  )
}

function AIHealthCheck() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    axios.get('/api/claude/health').then(({ data }) => setStatus(data)).catch(() => setStatus({ status: 'error', error: 'Cannot reach server' }))
  }, [])

  if (!status) return <div style={{ color: '#7a94b4' }}>Checking AI status...</div>

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: status.status === 'ok' ? '#00a86b' : '#ef4444' }} />
      <span style={{ fontSize: 14 }}>
        {status.status === 'ok' ? `AI connected (${status.model})` : `AI error: ${status.error}`}
      </span>
    </div>
  )
}
