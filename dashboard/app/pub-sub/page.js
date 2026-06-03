'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const API = 'http://localhost:3005/api'
const COLOR = '#AF52DE'

export default function PubSubPage() {
  const [topics, setTopics] = useState([])
  const [newTopic, setNewTopic] = useState('')
  const [selectedTopic, setSelectedTopic] = useState('notifications')
  const [groupId, setGroupId] = useState('consumer-group-1')
  const [message, setMessage] = useState('{"event":"user.signup","userId":"42","timestamp":"2024-01-01"}')
  const [messageLog, setMessageLog] = useState([])
  const [dlq, setDlq] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [topicsRes, statsRes, dlqRes] = await Promise.all([
        fetch(`${API}/topics`),
        fetch(`${API}/stats`),
        fetch(`${API}/dlq`),
      ])
      if (topicsRes.ok) setTopics(await topicsRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
      if (dlqRes.ok) setDlq(await dlqRes.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 2000); return () => clearInterval(t) }, [fetchAll])

  const createTopic = async () => {
    if (!newTopic.trim()) return
    await fetch(`${API}/topics`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTopic }) })
    setNewTopic(''); fetchAll()
  }

  const publish = async () => {
    setLoading(true)
    try {
      let parsed; try { parsed = JSON.parse(message) } catch { parsed = message }
      const res = await fetch(`${API}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedTopic, message: parsed }),
      })
      if (res.ok) {
        const data = await res.json()
        setMessageLog(prev => [{
          id: data.messageId, topic: selectedTopic, payload: parsed,
          time: new Date().toLocaleTimeString(), type: 'published',
        }, ...prev].slice(0, 40))
        fetchAll()
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const consume = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/consume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selectedTopic, groupId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.message) {
          setMessageLog(prev => [{
            id: data.message.id, topic: selectedTopic, payload: data.message.payload,
            time: new Date().toLocaleTimeString(), type: 'consumed',
            offset: data.offset,
          }, ...prev].slice(0, 40))
          // Auto-ack
          await fetch(`${API}/acknowledge`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: selectedTopic, groupId, messageId: data.message.id }),
          })
          fetchAll()
        } else {
          setMessageLog(prev => [{ type: 'empty', topic: selectedTopic, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 40))
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const replayDlq = async () => {
    await fetch(`${API}/dlq/replay`, { method: 'POST' })
    fetchAll()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ios-bg)' }}>
      <nav className="ios-nav" style={{ padding: '0 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/"><button className="ios-btn ios-btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '10px' }}>← Back</button></Link>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Pub / Sub System</div>
              <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)' }}>Message Broker</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-green)' }}>Port 3005</span>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #AF52DE, #8B3DB8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 8px 24px rgba(175,82,222,0.3)',
          }}>📡</div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-1px' }}>Pub / Sub System</h1>
            <p style={{ fontSize: '14px', color: 'var(--ios-label-secondary)' }}>In-memory broker · Consumer groups · Offset tracking · DLQ replay</p>
          </div>
        </div>

        {/* Broker Stats */}
        {stats && (
          <div className="ios-card animate-fade-in-up delay-1" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>📊 Broker Stats</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { label: 'Published', value: stats.published || 0, color: COLOR },
                { label: 'Consumed', value: stats.consumed || 0, color: '#34C759' },
                { label: 'Failed', value: stats.failed || 0, color: '#FF3B30' },
                { label: 'DLQ', value: stats.dlq || 0, color: '#FF9500' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--ios-gray6)', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Topics */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Topics</h2>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <input className="ios-input" placeholder="New topic name" value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && createTopic()} />
                <button className="ios-btn ios-btn-primary" onClick={createTopic} style={{ background: COLOR, flexShrink: 0, padding: '0 16px' }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {topics.map(t => (
                  <button key={t.name} onClick={() => setSelectedTopic(t.name)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                    background: selectedTopic === t.name ? 'rgba(175,82,222,0.1)' : 'var(--ios-gray6)',
                    outline: selectedTopic === t.name ? `2px solid ${COLOR}` : '2px solid transparent',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px' }}>📋</span>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: selectedTopic === t.name ? COLOR : 'var(--ios-label)' }}>{t.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(175,82,222,0.1)', color: COLOR, fontWeight: 600 }}>
                        {t.messageCount || 0} msgs
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Publish */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Publish Message</h2>
              <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--ios-label-secondary)' }}>
                Topic: <strong style={{ color: COLOR }}>{selectedTopic}</strong>
              </div>
              <textarea
                className="ios-input"
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', marginBottom: '10px' }}
                placeholder='{"event":"user.signup"}'
              />
              <button className="ios-btn ios-btn-primary" onClick={publish} disabled={loading} style={{ width: '100%', background: COLOR }}>
                📤 Publish to {selectedTopic}
              </button>
            </div>

            {/* Consume */}
            <div className="ios-card animate-fade-in-up delay-4" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Consume Message</h2>
              <input className="ios-input" placeholder="Consumer Group ID" value={groupId} onChange={e => setGroupId(e.target.value)} style={{ marginBottom: '10px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="ios-btn ios-btn-secondary" onClick={consume} disabled={loading} style={{ flex: 1 }}>
                  📥 Pull Next Message
                </button>
                {dlq.length > 0 && (
                  <button className="ios-btn" onClick={replayDlq} style={{ background: 'rgba(255,149,0,0.1)', color: '#FF9500', flex: 1 }}>
                    🔄 Replay DLQ ({dlq.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Message Flow */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px', flex: 1 }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Live Message Flow</h2>
              <div style={{ maxHeight: '480px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {messageLog.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ios-label-tertiary)', fontSize: '13px' }}>
                    Publish or consume a message to see the flow 📡
                  </div>
                ) : messageLog.map((entry, i) => (
                  <div key={i} style={{
                    padding: '12px', borderRadius: '12px',
                    background: entry.type === 'published' ? 'rgba(175,82,222,0.08)' : entry.type === 'consumed' ? 'rgba(52,199,89,0.08)' : 'var(--ios-gray6)',
                    animation: 'fadeInUp 0.3s ease',
                    borderLeft: `3px solid ${entry.type === 'published' ? COLOR : entry.type === 'consumed' ? '#34C759' : 'var(--ios-gray3)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px' }}>{entry.type === 'published' ? '📤' : entry.type === 'consumed' ? '📥' : '🔇'}</span>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: entry.type === 'published' ? COLOR : entry.type === 'consumed' ? '#34C759' : 'var(--ios-gray)' }}>
                          {entry.type === 'published' ? 'PUBLISHED' : entry.type === 'consumed' ? 'CONSUMED' : 'EMPTY'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--ios-label-tertiary)' }}>{entry.time}</span>
                    </div>
                    {entry.topic && <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)', marginBottom: '4px' }}>Topic: <strong>{entry.topic}</strong></div>}
                    {entry.id && <div style={{ fontSize: '10px', color: 'var(--ios-label-tertiary)', fontFamily: 'monospace' }}>ID: {entry.id}</div>}
                    {entry.payload && (
                      <pre style={{ fontSize: '11px', color: 'var(--ios-label-secondary)', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap', maxHeight: '60px' }}>
                        {JSON.stringify(entry.payload, null, 1).slice(0, 120)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Note */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '10px' }}>🏗️ Architecture</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  { icon: '📋', label: 'Topics', desc: 'Named channels, auto-created on publish' },
                  { icon: '👥', label: 'Consumer Groups', desc: 'Independent offset per group, load balanced' },
                  { icon: '#️⃣', label: 'Offsets', desc: 'Track last read message per group' },
                  { icon: '☠️', label: 'Dead Letter Queue', desc: '3 failed attempts → DLQ, replayable' },
                ].map(a => (
                  <div key={a.label} style={{ display: 'flex', gap: '10px', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--ios-separator)' }}>
                    <span>{a.icon}</span>
                    <div>
                      <span style={{ fontWeight: 600 }}>{a.label}</span>
                      <span style={{ color: 'var(--ios-label-secondary)', marginLeft: '6px' }}>{a.desc}</span>
                    </div>
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
