import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function MatchupPredictor({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [matchup, setMatchup] = useState(null)
  const [prediction, setPrediction] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) { setSelectedLeague(data[0].league_key); loadMatchup(data[0].league_key) }
    }).catch(() => {})
  }, [])

  async function loadMatchup(key) {
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${key}/matchup`)
      setMatchup(data)
    } catch {}
    setLoading(false)
  }

  async function predict() {
    if (!matchup) return
    setLoading(true)
    try {
      const { data } = await axios.post('/api/claude/matchup/predict', {
        my_team: matchup.myTeam, opponent: matchup.opponent,
        week: matchup.week
      })
      setPrediction(data)
    } catch { toast.error('Prediction failed') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Matchup Predictor</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>AI-powered weekly matchup analysis</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedLeague} onChange={e => { setSelectedLeague(e.target.value); loadMatchup(e.target.value) }} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={predict} disabled={loading || !matchup}>🤖 Predict</button>
        </div>
      </div>

      {matchup && (
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#4adbaf' }}>{matchup.myTeam?.name || 'My Team'}</div>
            <div style={{ fontSize: 12, color: '#7a94b4' }}>Week {matchup.week}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#f87171' }}>{matchup.opponent?.name || 'Opponent'}</div>
            <div style={{ fontSize: 12, color: '#7a94b4' }}>vs</div>
          </div>
        </div>
      )}

      {prediction?.summary && <div className="ai-response" style={{ marginBottom: 16 }}>{prediction.summary}</div>}
      {prediction?.lineup_recommendations && <div className="ai-response">{prediction.lineup_recommendations}</div>}
    </div>
  )
}
