'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, Gauge, Zap, Square, BarChart2 } from 'lucide-react'

const API = 'http://localhost:3002/api'
const ACCENT = '#FF3B30'
const GRADIENT = 'linear-gradient(145deg, #FF3B30, #C41A10)'

const ALGOS = [
  {
    id: 'sliding-window',
    label: 'Sliding Window',
    desc: 'Tracks requests in a rolling time window using Redis sorted sets. Most accurate algorithm.',
    pros: 'No boundary spikes',
    cons: 'O(n) memory per user',
  },
  {
    id: 'token-bucket',
    label: 'Token Bucket',
    desc: 'Tokens refill at constant rate. Allows controlled bursting up to bucket capacity.',
    pros: 'Allows burst traffic',
    cons: 'Complex bucket state',
  },
  {
    id: 'fixed-window',
    label: 'Fixed Window',
    desc: 'Simple counter reset at fixed clock intervals. Lowest memory overhead.',
    pros: 'O(1) memory, simple',
    cons: 'Boundary spike risk',
  },
]

export default function RateLimiterPage() {
  const [algo, setAlgo] = useState('sliding-window')
  const [limit, setLimit] = useState(10)
  const [windowMs, setWindowMs] = useState(10000)
  const [userId, setUserId] = useState('demo-user')
  const [log, setLog] = useState([])
  const [autoFire, setAutoFire] = useState(false)
  const [firing, setFiring] = useState(false)
  const autoRef = useRef(null)

  const stats = {
    total:   log.length,
    allowed: log.filter(r => r.ok).length,
    blocked: log.filter(r => !r.ok && r.status !== 'error').length,
    avgMs:   log.length ? Math.round(log.reduce((s, r) => s + r.ms, 0) / log.length) : 0,
  }

  const fire = async () => {
    if (firing) return
    setFiring(true)
    const t0 = Date.now()
    try {
      const res = await fetch(`${API}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ algorithm: algo, limit: +limit, windowMs: +windowMs }),
      })
      const data = await res.json()
      const ms = Date.now() - t0
      const ok = res.status !== 429
      setLog(p => [{
        id: Date.now(), ok, ms, status: ok ? 'allowed' : 'blocked',
        remaining: data?.remaining ?? 0, time: new Date().toLocaleTimeString('en', { hour12: false }),
      }, ...p].slice(0, 60))
    } catch (e) {
      setLog(p => [{ id: Date.now(), ok: false, ms: Date.now() - t0, status: 'error', time: new Date().toLocaleTimeString('en', { hour12: false }) }, ...p].slice(0, 60))
    }
    setFiring(false)
  }

  useEffect(() => {
    if (autoFire) { autoRef.current = setInterval(fire, 500) }
    else clearInterval(autoRef.current)
    return () => clearInterval(autoRef.current)
  }, [autoFire, algo, limit, windowMs, userId])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header className="nav-bar">
        <div className="nav-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <button className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronLeft size={15} strokeWidth={2.5} /> Back
              </button>
            </Link>
            <div style={{ width: 1, height: 18, background: 'var(--separator)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div className="app-icon-sm" style={{ background: GRADIENT, boxShadow: '0 2px 8px rgba(196,26,16,.3)' }}>
                <Gauge size={16} color="#fff" strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.3px' }}>Rate Limiter</div>
                <div style={{ fontSize: 11, color: 'var(--label-2)' }}>Distributed Throttling · Port 3002</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="live-dot" />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>Live</span>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 64px' }}>
        <div className="anim-up" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 56, height: 56, borderRadius: 15, background: GRADIENT, boxShadow: '0 4px 16px rgba(196,26,16,.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Gauge size={24} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-1px', marginBottom: 4 }}>Rate Limiter</h1>
              <p style={{ fontSize: 13, color: 'var(--label-2)', lineHeight: 1.5 }}>
                Three algorithms backed by atomic Redis Lua scripts — no race conditions under concurrent load.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Algorithm selector */}
            <div className="card anim-up d1" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Algorithm</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ALGOS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAlgo(a.id)}
                    style={{
                      padding: '13px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                      textAlign: 'left', transition: 'all .15s',
                      background: algo === a.id ? 'rgba(255,59,48,.06)' : 'var(--grouped)',
                      outline: algo === a.id ? `1.5px solid ${ACCENT}` : '1.5px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: algo === a.id ? ACCENT : 'var(--label)', marginBottom: 3 }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--label-2)', lineHeight: 1.45, marginBottom: 6 }}>{a.desc}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className="badge badge-green" style={{ fontSize: 10 }}>{a.pros}</span>
                      <span className="badge badge-red" style={{ fontSize: 10 }}>{a.cons}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Config */}
            <div className="card anim-up d2" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Configuration</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="input-label">User ID</label>
                  <input className="input" value={userId} onChange={e => setUserId(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="input-label">Limit (reqs)</label>
                    <input className="input" type="number" value={limit} onChange={e => setLimit(e.target.value)} min={1} />
                  </div>
                  <div>
                    <label className="input-label">Window (ms)</label>
                    <input className="input" type="number" value={windowMs} onChange={e => setWindowMs(e.target.value)} step={1000} />
                  </div>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="card anim-up d3" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Send Requests</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-primary" onClick={fire} disabled={firing}>
                  <Zap size={14} strokeWidth={2.5} />
                  Fire Single Request
                </button>
                <button
                  className="btn"
                  onClick={() => setAutoFire(p => !p)}
                  style={{
                    background: autoFire ? 'rgba(255,59,48,.08)' : 'var(--grouped)',
                    color: autoFire ? ACCENT : 'var(--label)',
                    outline: autoFire ? `1.5px solid ${ACCENT}` : 'none',
                  }}
                >
                  <Square size={13} />
                  {autoFire ? 'Stop Auto-fire' : 'Auto-fire (2/sec)'}
                </button>
                <button className="btn btn-ghost" onClick={() => setLog([])}>
                  Clear Log
                </button>
              </div>
            </div>
          </div>

          {/* Right */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Stats */}
            <div className="card anim-up d1" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Live Stats</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {[
                  { label: 'Total',   val: stats.total,   color: 'var(--blue)'   },
                  { label: 'Allowed', val: stats.allowed, color: 'var(--green)'  },
                  { label: 'Blocked', val: stats.blocked, color: ACCENT          },
                  { label: 'Avg ms',  val: stats.avgMs,   color: 'var(--orange)' },
                ].map(s => (
                  <div key={s.label} className="stat-tile" style={{ textAlign: 'center', padding: '12px 8px' }}>
                    <div className="stat-num" style={{ fontSize: 22, color: s.color }}>{s.val}</div>
                    <div className="stat-lbl" style={{ fontSize: 10 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {stats.total > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--label-2)', marginBottom: 6 }}>
                    <span>Block rate</span>
                    <span style={{ color: ACCENT }}>{Math.round(stats.blocked / stats.total * 100)}%</span>
                  </div>
                  <div className="progress">
                    <div className="progress-fill" style={{ width: `${stats.blocked / stats.total * 100}%`, background: ACCENT }} />
                  </div>
                </div>
              )}
            </div>

            {/* Log */}
            <div className="card anim-up d2" style={{ padding: 20, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Request Log</div>
              <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {log.length === 0 ? (
                  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--label-3)', fontSize: 13 }}>
                    Fire a request to see results
                  </div>
                ) : log.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 12px', borderRadius: 10,
                    background: r.ok ? 'rgba(52,199,89,.05)' : 'rgba(255,59,48,.05)',
                    animation: 'fadeIn .15s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: r.ok ? 'var(--green)' : r.status === 'error' ? 'var(--label-3)' : ACCENT,
                      }} />
                      <div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: '.2px',
                          color: r.ok ? 'var(--green)' : r.status === 'error' ? 'var(--label-3)' : ACCENT,
                        }}>
                          {r.status.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--label-3)', marginLeft: 8 }}>{r.time}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{r.ms} ms</div>
                      {r.remaining !== undefined && (
                        <div style={{ fontSize: 10, color: 'var(--label-3)' }}>rem {r.remaining}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Lua snippet */}
            <div className="card anim-up d3" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Sliding Window Lua Script</div>
              <div className="code-block" style={{ fontSize: 12 }}>
                <span style={{ color: '#636366' }}>-- atomic: no race condition</span>{'\n'}
                <span style={{ color: '#5AC8FA' }}>ZREMRANGEBYSCORE</span> key -inf (now-window){'\n'}
                count = <span style={{ color: '#5AC8FA' }}>ZCARD</span> key{'\n'}
                <span style={{ color: '#FF9F0A' }}>if</span> count {'<'} limit <span style={{ color: '#FF9F0A' }}>then</span>{'\n'}
                {'  '}<span style={{ color: '#5AC8FA' }}>ZADD</span> key score member{'\n'}
                {'  '}return <span style={{ color: '#30D158' }}>ALLOWED</span>{'\n'}
                <span style={{ color: '#FF9F0A' }}>else</span>{'\n'}
                {'  '}return <span style={{ color: '#FF453A' }}>RATE_LIMITED</span>{'\n'}
                <span style={{ color: '#FF9F0A' }}>end</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
