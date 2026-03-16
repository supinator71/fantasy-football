import React, { useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'

export default function TradeAnalyzer({ leagueSettings }) {
  const [giving, setGiving] = useState('')
  const [receiving, setReceiving] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [loading, setLoading] = useState(false)

  async function analyze() {
    setLoading(true)
    try {
      const givingPlayers = giving.split(',').map(s => ({ player_name: s.trim(), position: 'FLEX' })).filter(p => p.player_name)
      const receivingPlayers = receiving.split(',').map(s => ({ player_name: s.trim(), position: 'FLEX' })).filter(p => p.player_name)
      const { data } = await axios.post('/api/claude/trade', { giving: givingPlayers, receiving: receivingPlayers, my_roster: [] })
      setAnalysis(data.analysis)
    } catch { toast.error('Analysis failed') }
    setLoading(false)
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Trade Analyzer</h1>
      <p style={{ color: '#7a94b4', fontSize: 14, marginBottom: 16 }}>AI-powered trade evaluation with VOR and positional scarcity</p>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>Players You're Giving</div>
          <input placeholder="e.g. Saquon Barkley, Davante Adams" value={giving} onChange={e => setGiving(e.target.value)} />
        </div>
        <div className="card">
          <div style={{ fontSize: 13, color: '#7a94b4', marginBottom: 8 }}>Players You're Receiving</div>
          <input placeholder="e.g. Justin Jefferson, Josh Jacobs" value={receiving} onChange={e => setReceiving(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-accent" onClick={analyze} disabled={loading} style={{ marginBottom: 16 }}>🤖 Analyze Trade</button>

      {analysis && <div className="ai-response">{analysis}</div>}
    </div>
  )
}
