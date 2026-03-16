import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function TeamAudit({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) setSelectedLeague(data[0].league_key)
    }).catch(() => {})
  }, [])

  async function runAudit() {
    if (!selectedLeague) return
    setLoading(true)
    try {
      const roster = await axios.get(`/api/yahoo/league/${selectedLeague}/myroster`)
      const { data } = await axios.post('/api/claude/audit', { roster: roster.data.players || [] })
      setAudit(data)
    } catch (err) { toast.error('Audit failed: ' + (err.response?.data?.error || err.message)) }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Team Audit</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>Comprehensive AI analysis of your roster</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={runAudit} disabled={loading}>🤖 Run Audit</button>
        </div>
      </div>

      {loading && <div className="loading">Running AI audit...</div>}

      {audit && (
        <div>
          {audit.grade && (
            <div className="card" style={{ marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: '#d4a843' }}>{audit.grade}</div>
              <div style={{ fontSize: 14, color: '#7a94b4' }}>Overall Grade</div>
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: 16, marginBottom: 8, color: '#4adbaf' }}>Strengths</h3>
              {(audit.strengths || []).map((s, i) => <p key={i} style={{ fontSize: 14, marginBottom: 4 }}>✅ {s}</p>)}
            </div>
            <div className="card">
              <h3 style={{ fontSize: 16, marginBottom: 8, color: '#f87171' }}>Weaknesses</h3>
              {(audit.weaknesses || []).map((w, i) => <p key={i} style={{ fontSize: 14, marginBottom: 4 }}>⚠️ {w}</p>)}
            </div>
          </div>

          {audit.fullAnalysis && <div className="ai-response">{audit.fullAnalysis}</div>}
        </div>
      )}
    </div>
  )
}
