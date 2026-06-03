'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const API = 'http://localhost:3003/api'
const COLOR = '#34C759'

const STRATEGIES = [
  { id: 'cache-aside', label: 'Cache-Aside', icon: '🔍', desc: 'Lazy loading — read from cache, populate on miss', pros: 'Low write overhead', cons: 'Cache miss penalty' },
  { id: 'write-through', label: 'Write-Through', icon: '✍️', desc: 'Every write goes to both cache & DB synchronously', pros: 'Strong consistency', cons: 'Write latency overhead' },
  { id: 'write-back', label: 'Write-Back', icon: '⏳', desc: 'Write to cache instantly, async DB write later', pros: 'Fastest writes', cons: 'Risk of data loss' },
]

export default function DistributedCachePage() {
  const [strategy, setStrategy] = useState('cache-aside')
  const [key, setKey] = useState('user:42')
  const [value, setValue] = useState('{"name":"Alice","role":"admin"}')
  const [lruStats, setLruStats] = useState(null)
  const [lruEntries, setLruEntries] = useState([])
  const [opResult, setOpResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastAction, setLastAction] = useState(null)

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, entriesRes] = await Promise.all([
        fetch(`${API}/lru/stats`),
        fetch(`${API}/lru/entries`),
      ])
      if (statsRes.ok) setLruStats(await statsRes.json())
      if (entriesRes.ok) setLruEntries((await entriesRes.json()).entries || [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchStats(); const t = setInterval(fetchStats, 3000); return () => clearInterval(t) }, [fetchStats])

  const doGet = async () => {
    setLoading(true); setLastAction('get')
    try {
      const res = await fetch(`${API}/strategy/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, strategy }),
      })
      setOpResult(await res.json())
      fetchStats()
    } catch (e) { setOpResult({ error: e.message }) }
    setLoading(false)
  }

  const doSet = async () => {
    setLoading(true); setLastAction('set')
    try {
      const res = await fetch(`${API}/strategy/set`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: JSON.parse(value.startsWith('{') ? value : `"${value}"`), strategy }),
      })
      setOpResult(await res.json())
      fetchStats()
    } catch (e) { setOpResult({ error: e.message }) }
    setLoading(false)
  }

  const doLruGet = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/lru/get/${encodeURIComponent(key)}`)
      setOpResult(await res.json()); fetchStats()
    } catch (e) { setOpResult({ error: e.message }) }
    setLoading(false)
  }

  const doLruSet = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/lru/set`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      setOpResult(await res.json()); fetchStats()
    } catch (e) { setOpResult({ error: e.message }) }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ios-bg)' }}>
      <nav className="ios-nav" style={{ padding: '0 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/"><button className="ios-btn ios-btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '10px' }}>← Back</button></Link>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Distributed Cache</div>
              <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)' }}>Cache Strategies + LRU</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-green)' }}>Port 3003</span>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #34C759, #28A745)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 8px 24px rgba(52,199,89,0.3)',
          }}>🗃️</div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-1px' }}>Distributed Cache</h1>
            <p style={{ fontSize: '14px', color: 'var(--ios-label-secondary)' }}>LRU from scratch · Cache-Aside · Write-Through · Write-Back</p>
          </div>
        </div>

        {/* LRU Stats */}
        {lruStats && (
          <div className="ios-card animate-fade-in-up delay-1" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>📊 LRU Cache Stats</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
              {[
                { label: 'Size', value: `${lruStats.size}/${lruStats.capacity}`, color: COLOR },
                { label: 'Hit Rate', value: `${Math.round((lruStats.hitRate || 0) * 100)}%`, color: '#007AFF' },
                { label: 'Hits', value: lruStats.hits || 0, color: '#34C759' },
                { label: 'Misses', value: lruStats.misses || 0, color: '#FF3B30' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--ios-gray6)', borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ios-label-secondary)', marginBottom: '6px' }}>
                <span>Cache Utilization</span><span>{lruStats.size}/{lruStats.capacity}</span>
              </div>
              <div className="ios-progress">
                <div className="ios-progress-bar" style={{ width: `${(lruStats.size / lruStats.capacity) * 100}%`, background: COLOR }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Strategy Selector */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Cache Strategy</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {STRATEGIES.map(s => (
                  <button key={s.id} onClick={() => setStrategy(s.id)} style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px', borderRadius: '12px',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: strategy === s.id ? 'rgba(52,199,89,0.1)' : 'var(--ios-gray6)',
                    outline: strategy === s.id ? `2px solid ${COLOR}` : '2px solid transparent',
                    transition: 'all 0.2s',
                  }}>
                    <span style={{ fontSize: '18px' }}>{s.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: strategy === s.id ? COLOR : 'var(--ios-label)' }}>{s.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{s.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Key/Value Input */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Key / Value</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input className="ios-input" placeholder="Key (e.g. user:42)" value={key} onChange={e => setKey(e.target.value)} />
                <textarea
                  className="ios-input"
                  placeholder='Value (e.g. {"name":"Alice"})'
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="ios-btn ios-btn-secondary" onClick={doGet} disabled={loading}>📖 GET</button>
                  <button className="ios-btn ios-btn-primary" onClick={doSet} disabled={loading} style={{ background: COLOR }}>✍️ SET</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className="ios-btn ios-btn-secondary" onClick={doLruGet} disabled={loading} style={{ fontSize: '12px' }}>LRU GET</button>
                  <button className="ios-btn ios-btn-secondary" onClick={doLruSet} disabled={loading} style={{ fontSize: '12px' }}>LRU SET</button>
                </div>
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Result */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Result</h2>
              {opResult ? (
                <div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {opResult.source && (
                      <span style={{
                        padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
                        background: opResult.source === 'cache' ? 'rgba(52,199,89,0.12)' : 'rgba(0,122,255,0.12)',
                        color: opResult.source === 'cache' ? COLOR : '#007AFF',
                      }}>
                        {opResult.source === 'cache' ? '⚡ CACHE HIT' : '🔍 CACHE MISS → DB'}
                      </span>
                    )}
                    {opResult.strategy && (
                      <span style={{ padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: 'rgba(142,142,147,0.1)', color: 'var(--ios-gray)' }}>
                        {opResult.strategy}
                      </span>
                    )}
                  </div>
                  <pre style={{
                    background: '#1C1C1E', color: '#E5E5EA', borderRadius: '10px',
                    padding: '14px', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace', maxHeight: '180px', overflowY: 'auto',
                  }}>
                    {JSON.stringify(opResult, null, 2)}
                  </pre>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--ios-label-tertiary)', fontSize: '13px' }}>
                  Perform a GET or SET operation to see results
                </div>
              )}
            </div>

            {/* LRU Entries */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>LRU Entries (MRU order)</h2>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {lruEntries.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--ios-label-tertiary)', fontSize: '13px' }}>
                    Empty cache. Add some entries!
                  </div>
                ) : lruEntries.map((entry, i) => (
                  <div key={entry.key} className="ios-row">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: i === 0 ? COLOR : 'var(--ios-gray5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: i === 0 ? 'white' : 'var(--ios-gray)' }}>{i + 1}</div>
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>{entry.key}</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--ios-label-secondary)', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade-off Card */}
            <div className="ios-card animate-fade-in-up delay-4" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>⚖️ Hardest Problem in CS</h2>
              <div style={{ padding: '12px', background: 'rgba(52,199,89,0.08)', borderRadius: '10px', borderLeft: `3px solid ${COLOR}` }}>
                <p style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--ios-label-secondary)', lineHeight: 1.5 }}>
                  "There are only two hard things in Computer Science: cache invalidation and naming things."
                </p>
                <p style={{ fontSize: '12px', color: 'var(--ios-label-tertiary)', marginTop: '6px' }}>— Phil Karlton</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
