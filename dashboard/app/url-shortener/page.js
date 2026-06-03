'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Link2, Copy, Check, Trash2, BarChart2, RefreshCw, ArrowUpRight } from 'lucide-react'

const API = 'http://localhost:3001/api'
const ACCENT = '#007AFF'
const GRADIENT = 'linear-gradient(145deg, #1C62FF, #0040CC)'

function PageHeader() {
  return (
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
            <div className="app-icon-sm" style={{ background: GRADIENT, boxShadow: '0 2px 8px rgba(0,64,204,.3)' }}>
              <Link2 size={16} color="#fff" strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.3px' }}>URL Shortener</div>
              <div style={{ fontSize: 11, color: 'var(--label-2)' }}>TinyURL Clone · Port 3001</div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div className="live-dot" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>Live</span>
        </div>
      </div>
    </header>
  )
}

export default function UrlShortenerPage() {
  const [url, setUrl] = useState('')
  const [expiry, setExpiry] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [urls, setUrls] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  const fetchUrls = useCallback(async () => {
    try {
      const res = await fetch(`${API}/urls?limit=10`)
      if (res.ok) { const d = await res.json(); setUrls(d.urls || []) }
    } catch {}
  }, [])

  useEffect(() => { fetchUrls() }, [fetchUrls])

  const shorten = async () => {
    if (!url.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const body = { url: url.trim() }
      if (expiry) body.expiresIn = parseInt(expiry)
      const res = await fetch(`${API}/shorten`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setResult(data)
      fetchUrls()
      try {
        const aRes = await fetch(`${API}/analytics/${data.shortCode}`)
        if (aRes.ok) setAnalytics(await aRes.json())
      } catch {}
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const copy = () => {
    if (!result?.shortUrl) return
    navigator.clipboard.writeText(result.shortUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const del = async (code) => {
    try { await fetch(`${API}/urls/${code}`, { method: 'DELETE' }); fetchUrls() } catch {}
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader />

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 64px' }}>

        {/* Module intro */}
        <div className="anim-up" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div className="app-icon" style={{ background: GRADIENT, boxShadow: '0 4px 16px rgba(0,64,204,.30)', width: 56, height: 56, borderRadius: 15 }}>
              <Link2 size={24} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-1px', marginBottom: 4 }}>URL Shortener</h1>
              <p style={{ fontSize: 13, color: 'var(--label-2)', lineHeight: 1.5 }}>
                SHA-256 hash → Base62 encode → Redis cache-aside → PostgreSQL persistence
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {['Base62', 'Cache-Aside', 'Collision Retry', 'TTL Expiry', 'Click Analytics'].map(t => (
                  <span key={t} className="badge badge-blue">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Shorten form */}
            <div className="card anim-up d1" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.2px', marginBottom: 14 }}>Shorten a URL</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label className="input-label">Original URL</label>
                  <input
                    className="input"
                    placeholder="https://example.com/very/long/path"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && shorten()}
                  />
                </div>
                <div>
                  <label className="input-label">Expiry (seconds, optional)</label>
                  <input
                    className="input"
                    type="number"
                    placeholder="3600"
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={shorten}
                  disabled={loading || !url.trim()}
                  style={{ marginTop: 2 }}
                >
                  <Link2 size={14} strokeWidth={2.5} />
                  {loading ? 'Shortening…' : 'Shorten URL'}
                </button>
              </div>

              {error && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,59,48,.08)', color: 'var(--red)',
                  fontSize: 13, fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              {result && (
                <div style={{
                  marginTop: 14, padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(0,122,255,.05)', border: '1px solid rgba(0,122,255,.15)',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, letterSpacing: '.3px', marginBottom: 8 }}>
                    URL SHORTENED
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: ACCENT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {result.shortUrl}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={copy} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {copied ? <Check size={13} color="var(--green)" /> : <Copy size={13} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--label-2)' }}>
                    Code: <span className="mono" style={{ fontWeight: 600 }}>{result.shortCode}</span>
                  </div>
                </div>
              )}
            </div>

            {/* How it works */}
            <div className="card anim-up d2" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.2px', marginBottom: 14 }}>How it works</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { n: '1', title: 'Hash',    desc: 'SHA-256(url + attempt), take first 8 bytes as BigInt' },
                  { n: '2', title: 'Encode',  desc: 'Base62 encode → first 7 chars = short code' },
                  { n: '3', title: 'Collide?',desc: 'Check DB for conflict → retry with attempt+1' },
                  { n: '4', title: 'Persist', desc: 'INSERT into PostgreSQL with optional expires_at' },
                  { n: '5', title: 'Cache',   desc: 'SETEX in Redis with 1 h TTL' },
                  { n: '6', title: 'Redirect',desc: 'GET → Redis → DB miss → populate → 302' },
                ].map((s, i, arr) => (
                  <div key={s.n} style={{
                    display: 'flex', gap: 12, padding: '11px 0',
                    borderBottom: i < arr.length - 1 ? '.5px solid var(--separator)' : 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 7,
                      background: 'rgba(0,122,255,.10)', color: ACCENT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>{s.n}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--label-2)', marginTop: 1, lineHeight: 1.45 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Analytics */}
            {analytics && (
              <div className="card anim-in" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Analytics</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="stat-tile">
                    <div className="stat-num" style={{ color: ACCENT }}>{analytics.clicks || 0}</div>
                    <div className="stat-lbl">Total Clicks</div>
                  </div>
                  <div className="stat-tile">
                    <div className="stat-num" style={{ fontSize: 16, color: 'var(--label)' }}>
                      {analytics.lastClicked ? new Date(Number(analytics.lastClicked)).toLocaleTimeString() : '—'}
                    </div>
                    <div className="stat-lbl">Last Click</div>
                  </div>
                </div>
              </div>
            )}

            {/* URL list */}
            <div className="card anim-up d2" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Recent URLs</div>
                <button className="btn btn-ghost btn-sm" onClick={fetchUrls} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>
              <div className="card-inset">
                {urls.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--label-3)', fontSize: 13 }}>
                    No URLs yet
                  </div>
                ) : urls.map((u, i) => (
                  <div key={u.short_code} className="list-row" style={{ gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(0,122,255,.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Link2 size={14} color={ACCENT} />
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: ACCENT }}>/{u.short_code}</div>
                      <div style={{ fontSize: 11, color: 'var(--label-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.original_url}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-blue">{u.click_count}</span>
                      <button onClick={() => del(u.short_code)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--label-3)', display: 'flex' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scale card */}
            <div className="card anim-up d3" style={{ padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Scaling to 10 M users</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { label: 'DB Sharding',    val: 'Hash short_code to shard via consistent hashing' },
                  { label: 'CDN Edge',       val: 'Cache popular redirects at edge nodes' },
                  { label: 'Read Replicas',  val: 'PostgreSQL streaming replicas for 80 % reads' },
                  { label: 'Redis Cluster',  val: 'Hash-slot partitioning across Redis nodes' },
                ].map((r, i, arr) => (
                  <div key={r.label} style={{
                    padding: '10px 0', display: 'flex', gap: 8,
                    borderBottom: i < arr.length - 1 ? '.5px solid var(--separator)' : 'none',
                    fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 600, color: ACCENT, flexShrink: 0, width: 100 }}>{r.label}</span>
                    <span style={{ color: 'var(--label-2)', lineHeight: 1.45 }}>{r.val}</span>
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
