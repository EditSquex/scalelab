'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const API = 'http://localhost:3006/api'
const COLOR = '#5AC8FA'

const CB_COLORS = { CLOSED: '#34C759', OPEN: '#FF3B30', HALF_OPEN: '#FF9500' }
const CB_ICONS = { CLOSED: '🟢', OPEN: '🔴', HALF_OPEN: '🟡' }

const SERVICES = [
  { id: 'url-shortener', label: 'URL Shortener', icon: '🔗', port: 3001 },
  { id: 'rate-limiter', label: 'Rate Limiter', icon: '⚡', port: 3002 },
  { id: 'distributed-cache', label: 'Distributed Cache', icon: '🗃️', port: 3003 },
  { id: 'job-queue', label: 'Job Queue', icon: '⚙️', port: 3004 },
  { id: 'pub-sub', label: 'Pub / Sub', icon: '📡', port: 3005 },
]

export default function ApiGatewayPage() {
  const [gatewayStats, setGatewayStats] = useState(null)
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('user-demo')
  const [role, setRole] = useState('admin')
  const [selectedService, setSelectedService] = useState('url-shortener')
  const [routePath, setRoutePath] = useState('/health')
  const [routeResult, setRouteResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [cbOverride, setCbOverride] = useState({})

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/gateway/stats`)
      if (res.ok) setGatewayStats(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchStats(); const t = setInterval(fetchStats, 3000); return () => clearInterval(t) }, [fetchStats])

  const generateToken = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/token`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      })
      if (res.ok) { const data = await res.json(); setToken(data.token || '') }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const routeRequest = async () => {
    setLoading(true)
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API}/route/${selectedService}${routePath}`, { headers })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = text }
      setRouteResult({ status: res.status, data, service: selectedService, path: routePath, timestamp: new Date().toLocaleTimeString() })
      fetchStats()
    } catch (e) {
      setRouteResult({ error: e.message, timestamp: new Date().toLocaleTimeString() })
    }
    setLoading(false)
  }

  const toggleCircuitBreaker = async (service, forceOpen) => {
    try {
      await fetch(`${API}/gateway/test-circuit-breaker`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, forceOpen }),
      })
      setCbOverride(p => ({ ...p, [service]: forceOpen }))
      fetchStats()
    } catch { /* ignore */ }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ios-bg)' }}>
      <nav className="ios-nav" style={{ padding: '0 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/"><button className="ios-btn ios-btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '10px' }}>← Back</button></Link>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>API Gateway</div>
              <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)' }}>Smart Routing</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-green)' }}>Port 3006</span>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #5AC8FA, #32ADE6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 8px 24px rgba(90,200,250,0.3)',
          }}>🌐</div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-1px' }}>API Gateway</h1>
            <p style={{ fontSize: '14px', color: 'var(--ios-label-secondary)' }}>Round-robin load balancer · Circuit breaker · JWT auth · Health checks</p>
          </div>
        </div>

        {/* Circuit Breakers Overview */}
        {gatewayStats && (
          <div className="ios-card animate-fade-in-up delay-1" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>🔌 Circuit Breakers</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
              {SERVICES.map(svc => {
                const cb = gatewayStats.circuitBreakers?.[svc.id] || {}
                const state = cb.state || 'CLOSED'
                return (
                  <div key={svc.id} style={{
                    background: 'var(--ios-gray6)', borderRadius: '12px', padding: '12px', textAlign: 'center',
                    border: `2px solid ${CB_COLORS[state]}20`,
                  }}>
                    <div style={{ fontSize: '18px', marginBottom: '4px' }}>{svc.icon}</div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ios-label-secondary)', marginBottom: '6px' }}>
                      {svc.label.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: CB_COLORS[state], marginBottom: '8px' }}>
                      {CB_ICONS[state]} {state}
                    </div>
                    <button
                      onClick={() => toggleCircuitBreaker(svc.id, state !== 'OPEN')}
                      style={{
                        fontSize: '9px', padding: '3px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                        background: state === 'OPEN' ? 'rgba(52,199,89,0.15)' : 'rgba(255,59,48,0.15)',
                        color: state === 'OPEN' ? '#34C759' : '#FF3B30', fontWeight: 700,
                      }}
                    >
                      {state === 'OPEN' ? 'CLOSE' : 'TRIP'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* JWT Token */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>🔐 JWT Authentication</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input className="ios-input" placeholder="User ID" value={userId} onChange={e => setUserId(e.target.value)} />
                <select className="ios-select" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                  <option value="readonly">Read Only</option>
                </select>
                <button className="ios-btn ios-btn-primary" onClick={generateToken} disabled={loading}
                  style={{ background: COLOR }}>
                  🔑 Generate JWT Token
                </button>
                {token && (
                  <div style={{ padding: '12px', background: 'rgba(90,200,250,0.08)', borderRadius: '10px', borderLeft: `3px solid ${COLOR}` }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: COLOR, marginBottom: '4px' }}>TOKEN GENERATED ✅</div>
                    <div style={{
                      fontFamily: 'monospace', fontSize: '10px', color: 'var(--ios-label-secondary)',
                      wordBreak: 'break-all', lineHeight: 1.4,
                    }}>
                      {token.slice(0, 60)}...
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Route Request */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>🔀 Route Request</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-label-secondary)', display: 'block', marginBottom: '6px' }}>TARGET SERVICE</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {SERVICES.map(svc => (
                      <button key={svc.id} onClick={() => setSelectedService(svc.id)} style={{
                        padding: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: selectedService === svc.id ? `rgba(90,200,250,0.15)` : 'var(--ios-gray6)',
                        outline: selectedService === svc.id ? `2px solid ${COLOR}` : '2px solid transparent',
                        fontSize: '12px', fontWeight: 600, transition: 'all 0.15s',
                        color: selectedService === svc.id ? COLOR : 'var(--ios-label)',
                      }}>
                        {svc.icon}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: '12px', color: COLOR, marginTop: '6px', fontWeight: 500 }}>
                    → {SERVICES.find(s => s.id === selectedService)?.label}
                  </div>
                </div>
                <input className="ios-input" placeholder="Path (e.g. /health)" value={routePath} onChange={e => setRoutePath(e.target.value)} />
                <button className="ios-btn ios-btn-primary" onClick={routeRequest} disabled={loading} style={{ background: COLOR }}>
                  {loading ? '⏳ Routing...' : '🌐 Route Request'}
                </button>
              </div>
            </div>

            {/* Circuit Breaker Explainer */}
            <div className="ios-card animate-fade-in-up delay-4" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>🔌 Circuit Breaker States</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { state: 'CLOSED', color: '#34C759', desc: 'Normal operation — all requests pass through' },
                  { state: 'OPEN', color: '#FF3B30', desc: '5+ failures → block all requests, fast fail' },
                  { state: 'HALF_OPEN', color: '#FF9500', desc: 'After 30s → allow one test request' },
                ].map(s => (
                  <div key={s.state} style={{ display: 'flex', gap: '10px', padding: '10px', borderRadius: '10px', background: `${s.color}08` }}>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: s.color, flexShrink: 0 }}>{s.state}</span>
                    <span style={{ fontSize: '12px', color: 'var(--ios-label-secondary)', lineHeight: 1.4 }}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Route Result */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Response</h2>
              {routeResult ? (
                <div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {routeResult.status && (
                      <span style={{
                        padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: routeResult.status < 300 ? 'rgba(52,199,89,0.12)' : 'rgba(255,59,48,0.12)',
                        color: routeResult.status < 300 ? '#34C759' : '#FF3B30',
                      }}>
                        HTTP {routeResult.status}
                      </span>
                    )}
                    {routeResult.service && (
                      <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', background: 'rgba(90,200,250,0.12)', color: COLOR, fontWeight: 600 }}>
                        → {routeResult.service}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: 'var(--ios-label-tertiary)', padding: '4px 0' }}>{routeResult.timestamp}</span>
                  </div>
                  <pre style={{
                    background: '#1C1C1E', color: '#E5E5EA', borderRadius: '10px',
                    padding: '14px', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace', maxHeight: '200px', overflowY: 'auto',
                  }}>
                    {JSON.stringify(routeResult.data || routeResult.error, null, 2)}
                  </pre>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ios-label-tertiary)', fontSize: '13px' }}>
                  Route a request to see the response 🌐
                </div>
              )}
            </div>

            {/* Load Balancer Stats */}
            {gatewayStats?.balancers && (
              <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>⚖️ Load Balancer</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {Object.entries(gatewayStats.balancers).map(([svcId, stats]) => (
                    <div key={svcId} style={{ padding: '10px', background: 'var(--ios-gray6)', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                        <span style={{ fontWeight: 600 }}>{SERVICES.find(s => s.id === svcId)?.icon} {svcId}</span>
                        <span style={{ color: 'var(--ios-label-secondary)', fontSize: '12px' }}>{stats.totalRequests || 0} reqs</span>
                      </div>
                      {stats.backends?.map(b => (
                        <div key={b.url} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ios-label-secondary)' }}>
                          <span>{b.url.split(':').pop()} {b.healthy ? '✅' : '❌'}</span>
                          <span>{b.avgLatency}ms avg</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Architecture */}
            <div className="ios-card animate-fade-in-up delay-4" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>🚀 At 10M RPS</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { label: 'Horizontal Scaling', desc: 'Multiple gateway instances behind a DNS LB' },
                  { label: 'Rate Limiting', desc: 'Redis-backed per-client rate limits' },
                  { label: 'mTLS', desc: 'Mutual TLS between services' },
                  { label: 'Service Mesh', desc: 'Istio/Envoy for advanced traffic management' },
                ].map(s => (
                  <div key={s.label} style={{ fontSize: '13px', display: 'flex', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: COLOR, flexShrink: 0 }}>{s.label}:</span>
                    <span style={{ color: 'var(--ios-label-secondary)' }}>{s.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
