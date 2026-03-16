import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function LeagueSetup({ onSave }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => setLeagues(data)).catch(() => {})
    axios.get('/api/yahoo/league/settings/local').then(({ data }) => {
      if (data) { setSettings(data); setSelectedLeague(data.league_key || '') }
    }).catch(() => {})
  }, [])

  async function fetchAndSave() {
    if (!selectedLeague) return toast.error('Select a league')
    setLoading(true)
    try {
      const { data } = await axios.get(`/api/yahoo/league/${selectedLeague}`)
      await axios.post('/api/yahoo/league/save', data)
      setSettings(data)
      onSave?.()
      toast.success('League settings saved!')
    } catch (err) { toast.error('Failed: ' + (err.response?.data?.error || err.message)) }
    setLoading(false)
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>League Setup</h1>
      <p style={{ color: '#7a94b4', fontSize: 14, marginBottom: 24 }}>Connect and configure your Yahoo Fantasy Football league</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>Select League</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ flex: 1 }}>
            <option value="">Choose a league...</option>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-primary" onClick={fetchAndSave} disabled={loading}>
            {loading ? 'Loading...' : 'Fetch & Save'}
          </button>
        </div>

        {settings && (
          <div>
            <table>
              <tbody>
                <tr><td style={{ color: '#7a94b4' }}>League</td><td style={{ fontWeight: 500 }}>{settings.league_name}</td></tr>
                <tr><td style={{ color: '#7a94b4' }}>Teams</td><td>{settings.num_teams}</td></tr>
                <tr><td style={{ color: '#7a94b4' }}>Scoring</td><td>{settings.scoring_type}</td></tr>
                <tr><td style={{ color: '#7a94b4' }}>Draft</td><td>{settings.draft_type}</td></tr>
                <tr><td style={{ color: '#7a94b4' }}>Roster Slots</td><td>{settings.roster_slots ? Object.entries(settings.roster_slots).map(([k, v]) => `${k}:${v}`).join(', ') : '-'}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
