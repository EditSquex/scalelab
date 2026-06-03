'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const API = 'http://localhost:3004/api'
const COLOR = '#FF9500'

const JOB_TYPES = [
  { id: 'email', label: 'Email Job', icon: '📧', fields: [{ name: 'to', placeholder: 'recipient@example.com' }, { name: 'subject', placeholder: 'Subject line' }] },
  { id: 'image', label: 'Image Job', icon: '🖼️', fields: [{ name: 'filename', placeholder: 'photo.jpg' }, { name: 'operation', placeholder: 'resize | compress | convert' }] },
]

const STATUS_COLORS = { waiting: '#FF9500', active: '#007AFF', completed: '#34C759', failed: '#FF3B30', delayed: '#AF52DE' }
const STATUS_ICONS = { waiting: '⏳', active: '🔄', completed: '✅', failed: '❌', delayed: '⏰' }

export default function JobQueuePage() {
  const [jobType, setJobType] = useState('email')
  const [fields, setFields] = useState({ to: '', subject: '', filename: '', operation: 'resize' })
  const [priority, setPriority] = useState(5)
  const [queues, setQueues] = useState(null)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [bulkCount, setBulkCount] = useState(5)

  const fetchQueues = useCallback(async () => {
    try {
      const res = await fetch(`${API}/queues`)
      if (res.ok) setQueues(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { fetchQueues(); const t = setInterval(fetchQueues, 2000); return () => clearInterval(t) }, [fetchQueues])

  const addJob = async () => {
    setLoading(true)
    try {
      const endpoint = jobType === 'email' ? '/jobs/email' : '/jobs/image'
      const body = jobType === 'email'
        ? { to: fields.to || 'test@example.com', subject: fields.subject || 'Test Email', body: 'Hello from ScaleLab!', priority: parseInt(priority) }
        : { filename: fields.filename || 'image.jpg', operation: fields.operation || 'resize', priority: parseInt(priority) }
      const res = await fetch(`${API}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        setJobs(prev => [{ ...data, type: jobType, submittedAt: new Date().toLocaleTimeString(), status: 'waiting' }, ...prev].slice(0, 30))
        fetchQueues()
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const addBulk = async () => {
    setLoading(true)
    try {
      await fetch(`${API}/jobs/bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: parseInt(bulkCount), type: jobType }),
      })
      fetchQueues()
    } catch { /* ignore */ }
    setLoading(false)
  }

  const checkJob = async (jobId) => {
    try {
      const res = await fetch(`${API}/jobs/${jobId}`)
      if (res.ok) {
        const data = await res.json()
        setJobs(prev => prev.map(j => j.jobId === jobId ? { ...j, ...data } : j))
      }
    } catch { /* ignore */ }
  }

  const totalJobs = queues ? Object.values(queues).reduce((sum, q) => sum + (q.waiting || 0) + (q.active || 0) + (q.completed || 0) + (q.failed || 0), 0) : 0

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ios-bg)' }}>
      <nav className="ios-nav" style={{ padding: '0 24px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link href="/"><button className="ios-btn ios-btn-secondary" style={{ padding: '8px 14px', fontSize: '13px', borderRadius: '10px' }}>← Back</button></Link>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Job Queue</div>
              <div style={{ fontSize: '11px', color: 'var(--ios-label-secondary)' }}>Background Workers</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="live-dot" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-green)' }}>Port 3004</span>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '32px 24px' }}>
        <div className="animate-fade-in-up" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'linear-gradient(135deg, #FF9500, #CC7700)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', boxShadow: '0 8px 24px rgba(255,149,0,0.3)',
          }}>⚙️</div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-1px' }}>Job Queue</h1>
            <p style={{ fontSize: '14px', color: 'var(--ios-label-secondary)' }}>BullMQ · Exponential backoff · Dead letter queue · Worker monitoring</p>
          </div>
        </div>

        {/* Queue Stats */}
        {queues && (
          <div className="ios-card animate-fade-in-up delay-1" style={{ padding: '20px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>📊 Queue Monitor</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {Object.entries(queues).map(([qName, stats]) => (
                <div key={qName} style={{ background: 'var(--ios-gray6)', borderRadius: '12px', padding: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>{qName === 'emailQueue' ? '📧' : '🖼️'}</span>
                    {qName === 'emailQueue' ? 'Email Queue' : 'Image Queue'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {[
                      { key: 'waiting', label: 'Waiting' },
                      { key: 'active', label: 'Active' },
                      { key: 'completed', label: 'Done' },
                      { key: 'failed', label: 'Failed' },
                    ].map(s => (
                      <div key={s.key} style={{ textAlign: 'center', padding: '8px', background: 'white', borderRadius: '8px' }}>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: STATUS_COLORS[s.key] }}>
                          {STATUS_ICONS[s.key]} {stats[s.key] || 0}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--ios-label-secondary)', fontWeight: 500 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Job Type */}
            <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Job Type</h2>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {JOB_TYPES.map(t => (
                  <button key={t.id} onClick={() => setJobType(t.id)} style={{
                    flex: 1, padding: '10px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                    background: jobType === t.id ? `rgba(255,149,0,0.1)` : 'var(--ios-gray6)',
                    outline: jobType === t.id ? `2px solid ${COLOR}` : '2px solid transparent',
                    fontWeight: 600, fontSize: '13px', transition: 'all 0.2s',
                    color: jobType === t.id ? COLOR : 'var(--ios-label)',
                  }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {JOB_TYPES.find(t => t.id === jobType)?.fields.map(f => (
                <input key={f.name} className="ios-input" placeholder={f.placeholder} value={fields[f.name]}
                  onChange={e => setFields(p => ({ ...p, [f.name]: e.target.value }))}
                  style={{ marginBottom: '10px' }}
                />
              ))}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ios-label-secondary)', display: 'block', marginBottom: '6px' }}>
                  PRIORITY (1=highest, 10=lowest): {priority}
                </label>
                <input type="range" min={1} max={10} value={priority} onChange={e => setPriority(e.target.value)}
                  style={{ width: '100%', accentColor: COLOR }}
                />
              </div>
            </div>

            {/* Add Job Buttons */}
            <div className="ios-card animate-fade-in-up delay-3" style={{ padding: '20px' }}>
              <button className="ios-btn ios-btn-primary" onClick={addJob} disabled={loading}
                style={{ width: '100%', marginBottom: '10px', background: COLOR }}>
                ➕ Add Single Job
              </button>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input className="ios-input" type="number" value={bulkCount} onChange={e => setBulkCount(e.target.value)} min={1} max={50} style={{ width: '80px', flexShrink: 0 }} />
                <button className="ios-btn ios-btn-secondary" onClick={addBulk} disabled={loading} style={{ flex: 1 }}>
                  🔥 Add {bulkCount} Jobs
                </button>
              </div>
            </div>

            {/* Retry Config */}
            <div className="ios-card animate-fade-in-up delay-4" style={{ padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>🔄 Retry Config</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Max Attempts', value: '3' },
                  { label: 'Backoff Type', value: 'Exponential' },
                  { label: 'Attempt 1 Delay', value: '1,000ms' },
                  { label: 'Attempt 2 Delay', value: '2,000ms' },
                  { label: 'Attempt 3 Delay', value: '4,000ms' },
                  { label: 'After Max', value: 'Dead Letter Queue' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--ios-separator)' }}>
                    <span style={{ color: 'var(--ios-label-secondary)' }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: COLOR }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Job List */}
          <div className="ios-card animate-fade-in-up delay-2" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Submitted Jobs</h2>
            <div style={{ maxHeight: '520px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {jobs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--ios-label-tertiary)', fontSize: '13px' }}>
                  No jobs yet. Add one above! ⚙️
                </div>
              ) : jobs.map(job => (
                <div key={job.jobId} style={{
                  padding: '14px', borderRadius: '12px',
                  background: 'var(--ios-gray6)',
                  border: `1px solid ${STATUS_COLORS[job.status] || 'var(--ios-border)'}20`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>{STATUS_ICONS[job.status] || '⏳'}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: 'var(--ios-label-secondary)' }}>
                        #{String(job.jobId).slice(-6)}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                        background: `${STATUS_COLORS[job.status] || '#8E8E93'}15`,
                        color: STATUS_COLORS[job.status] || '#8E8E93',
                      }}>{(job.status || 'waiting').toUpperCase()}</span>
                    </div>
                    <button onClick={() => checkJob(job.jobId)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>🔄</button>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--ios-label-secondary)' }}>
                    {job.type === 'email' ? `📧 ${fields.to || 'test@example.com'}` : `🖼️ ${fields.filename || 'image.jpg'}`}
                    <span style={{ marginLeft: '8px' }}>{job.submittedAt}</span>
                  </div>
                  {job.result && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--ios-green)', fontWeight: 600 }}>
                      ✅ {JSON.stringify(job.result).slice(0, 60)}
                    </div>
                  )}
                  {job.error && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--ios-red)', fontWeight: 600 }}>
                      ❌ {job.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
