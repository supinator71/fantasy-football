import React, { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import axios from 'axios'

import Dashboard from './components/Dashboard'
import DraftAssistant from './components/DraftAssistant/DraftAssistant'
import RosterManager from './components/RosterManager/RosterManager'
import WaiverWire from './components/WaiverWire/WaiverWire'
import StartSit from './components/StartSit/StartSit'
import TradeAnalyzer from './components/TradeAnalyzer/TradeAnalyzer'
import Standings from './components/Standings/Standings'
import MatchupPredictor from './components/MatchupPredictor/MatchupPredictor'
import LeagueSetup from './components/Layout/LeagueSetup'
import TeamAudit from './components/TeamAudit/TeamAudit'
import TradeFinder from './components/TradeFinder/TradeFinder'
import GamePlan from './components/GamePlan/GamePlan'
import PlayerTrends from './components/PlayerTrends/PlayerTrends'

export default function App() {
  const [authStatus, setAuthStatus] = useState({ authenticated: false, loading: true })
  const [leagueSettings, setLeagueSettings] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    checkAuth()
    loadLeagueSettings()
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/')
      checkAuth()
    }
  }, [])

  async function checkAuth() {
    try {
      const { data } = await axios.get('/auth/status')
      setAuthStatus({ ...data, loading: false })
    } catch {
      setAuthStatus({ authenticated: false, loading: false })
    }
  }

  async function loadLeagueSettings() {
    try {
      const { data } = await axios.get('/api/yahoo/league/settings/local')
      setLeagueSettings(data)
    } catch {}
  }

  if (authStatus.loading) {
    return <div className="loading" style={{ height: '100vh', fontSize: 18 }}>Loading Fantasy Football HQ...</div>
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: '#0f1628', color: '#e2e8f0', border: '1px solid #1e2d4a' } }} />
      <div className="app-layout">

        <div
          className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar
          authenticated={authStatus.authenticated}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="app-body">
          <div className="mobile-topbar">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
              ☰
            </button>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#00875a' }}>🏈 Fantasy HQ</span>
          </div>

          <main className="main-content">
            {!authStatus.authenticated ? (
              <LoginPage />
            ) : (
              <Routes>
                <Route path="/"          element={<Dashboard leagueSettings={leagueSettings} />} />
                <Route path="/draft"     element={<DraftAssistant leagueSettings={leagueSettings} />} />
                <Route path="/roster"    element={<RosterManager leagueSettings={leagueSettings} />} />
                <Route path="/waiver"    element={<WaiverWire leagueSettings={leagueSettings} />} />
                <Route path="/startsit"  element={<StartSit leagueSettings={leagueSettings} />} />
                <Route path="/trade"     element={<TradeAnalyzer leagueSettings={leagueSettings} />} />
                <Route path="/standings" element={<Standings leagueSettings={leagueSettings} />} />
                <Route path="/matchup"   element={<MatchupPredictor leagueSettings={leagueSettings} />} />
                <Route path="/trends"    element={<PlayerTrendsPage />} />
                <Route path="/setup"       element={<LeagueSetup onSave={loadLeagueSettings} />} />
                <Route path="/audit"      element={<TeamAudit leagueSettings={leagueSettings} />} />
                <Route path="/tradefinder" element={<TradeFinder leagueSettings={leagueSettings} />} />
                <Route path="/gameplan"   element={<GamePlan leagueSettings={leagueSettings} />} />
              </Routes>
            )}
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}

function Sidebar({ authenticated, isOpen, onClose }) {
  const navItems = [
    { to: '/',          label: 'Dashboard',         icon: '🏈' },
    { to: '/draft',     label: 'Draft Assistant',    icon: '📋' },
    { to: '/roster',    label: 'My Roster',          icon: '👥' },
    { to: '/waiver',    label: 'Waiver Wire',        icon: '🔄' },
    { to: '/startsit',  label: 'Start / Sit',        icon: '⚡' },
    { to: '/trade',     label: 'Trade Analyzer',     icon: '🤝' },
    { to: '/standings', label: 'Standings',          icon: '🏆' },
    { to: '/matchup',   label: 'Matchup Predictor',  icon: '⚔️' },
    { to: '/audit',       label: 'Team Audit',     icon: '🏅' },
    { to: '/tradefinder', label: 'Trade Finder',   icon: '🔀' },
    { to: '/gameplan',    label: 'Game Plan',      icon: '🗓️' },
    { to: '/trends',      label: 'Player Trends',  icon: '📈' },
    { to: '/setup',       label: 'League Setup',   icon: '⚙️' },
  ]

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div style={{ padding: '0 16px 20px', borderBottom: '1px solid #1e2d4a', marginBottom: 8 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#00875a' }}>🏈 Fantasy HQ</div>
        <div style={{ fontSize: 11, color: '#7a94b4', marginTop: 2 }}>NFL Draft & Season Manager</div>
      </div>

      {authenticated && navItems.map(item => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}
          onClick={onClose}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            textDecoration: 'none', borderRadius: 8, margin: '0 8px',
            background: isActive ? '#0f2440' : 'transparent',
            color: isActive ? '#4adbaf' : '#7a94b4',
            fontSize: 14, fontWeight: isActive ? 600 : 400,
            minHeight: 44,
          })}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
        </NavLink>
      ))}

      {authenticated && (
        <div style={{ marginTop: 'auto', paddingTop: 20, paddingBottom: 20 }}>
          <button
            onClick={async () => {
              try {
                await axios.post('/auth/logout');
                window.location.href = '/';
              } catch (e) {
                console.error('Logout failed:', e);
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              border: 'none', background: 'transparent', width: '100%',
              color: '#f87171', fontSize: 14, cursor: 'pointer', textAlign: 'left',
              margin: '0 8px', borderRadius: 8
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#2a1a24'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: 16 }}>🚪</span> Logout
          </button>
        </div>
      )}

      {!authenticated && (
        <div style={{ padding: '0 16px', color: '#7a94b4', fontSize: 13 }}>
          Login to access all features
        </div>
      )}
    </nav>
  )
}

function LoginPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: 16 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏈</div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Fantasy Football HQ</h1>
        <p style={{ color: '#7a94b4', marginBottom: 32, lineHeight: 1.6 }}>
          Your AI-powered draft assistant and season manager. Connect your Yahoo Fantasy league to get started.
        </p>
        <a href="/auth/yahoo" style={{ display: 'block', textDecoration: 'none' }}>
          <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 16 }}>
            Connect Yahoo Fantasy
          </button>
        </a>
        <p style={{ marginTop: 16, fontSize: 12, color: '#7a94b4' }}>
          You'll be redirected to Yahoo to authorize this app securely.
        </p>
      </div>
    </div>
  )
}

function PlayerTrendsPage() {
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState('')

  useEffect(() => {
    axios.get('/api/yahoo/leagues').then(({ data }) => {
      setLeagues(data)
      if (data[0]?.league_key) setSelectedLeague(data[0].league_key)
    }).catch(() => {})
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Player Trends</h1>
          <p style={{ color: '#7a94b4', fontSize: 14 }}>Hot streaks, rising stars, and cold spells on your roster</p>
        </div>
        {leagues.length > 0 && (
          <select value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 200 }}>
            {leagues.map((l, i) => (
              <option key={i} value={l.league_key}>{l.name || l.league_key}</option>
            ))}
          </select>
        )}
      </div>
      <PlayerTrends selectedLeague={selectedLeague} />
    </div>
  )
}
