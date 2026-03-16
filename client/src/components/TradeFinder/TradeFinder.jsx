import React, { useState, useEffect } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function TradeFinder({ leagueSettings }) {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')
  const [proposals, setProposals] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) setSelectedLeague(data[0].league_key)
    }).catch(() => {})
  }, [])

  async function findTrades() {
    if (!selectedLeague) return
    setLoading(true)
    try {
      const roster = await axios.get(`/api/yahoo/league/${selectedLeague}/myroster`)
      const { data } = await axios.post('/api/claude/trade/find', { my_roster: roster.data.players || [] })
      setProposals(data.proposals)
    } catch (err) { toast.error('Trade finder failed') }
    setLoading(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Trade Finder</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>AI identifies trade opportunities by analyzing roster surpluses and voids</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 200 }}>
            {leagues.map((l, i) => <option key={i} value={l.league_key}>{l.name || l.league_key}</option>)}
          </select>
          <button className="btn btn-accent" onClick={findTrades} disabled={loading}>🤖 Find Trades</button>
        </div>
      </div>

      {loading && <div className="loading">AI analyzing your roster and league...</div>}
      {proposals && <div className="ai-response">{proposals}</div>}
    </div>
  )
}
