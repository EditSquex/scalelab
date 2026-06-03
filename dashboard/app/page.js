'use client'

import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import {
  Link2, Gauge, Database, Settings2, Radio, Globe,
  ChevronRight, Circle, Activity
} from 'lucide-react'
import MathCurveLoader from './components/MathCurveLoader'
import CurvedLoop from './components/CurvedLoop'
import MagicBento, { ParticleCard, GlobalSpotlight, BentoCardGrid } from './components/MagicBento'

const MODULES = [
  {
    id: 'url-shortener',
    name: 'URL Shortener',
    subtitle: 'TinyURL Clone',
    description: 'SHA-256 → Base62 encoding, Redis read-through cache, collision handling and click analytics.',
    Icon: Link2,
    gradient: 'linear-gradient(145deg, #1C62FF 0%, #0040CC 100%)',
    shadow: 'rgba(0,64,204,.30)',
    port: 3001,
    tags: ['Base62', 'Cache-Aside', 'Analytics'],
    accent: '#0A84FF',
    glowColorRgb: '10, 132, 255',
    curve: 'rose',
  },
  {
    id: 'rate-limiter',
    name: 'Rate Limiter',
    subtitle: 'Distributed Throttling',
    description: 'Three algorithms — Fixed Window, Sliding Window and Token Bucket — all backed by atomic Redis Lua scripts.',
    Icon: Gauge,
    gradient: 'linear-gradient(145deg, #FF3B30 0%, #C41A10 100%)',
    shadow: 'rgba(196,26,16,.28)',
    port: 3002,
    tags: ['Sliding Window', 'Token Bucket', 'Lua Atomic'],
    accent: '#FF453A',
    glowColorRgb: '255, 69, 58',
    curve: 'lissajous',
  },
  {
    id: 'distributed-cache',
    name: 'Distributed Cache',
    subtitle: 'Cache Strategies',
    description: 'LRU implementation from scratch using a doubly-linked list, plus Cache-Aside, Write-Through and Write-Back patterns.',
    Icon: Database,
    gradient: 'linear-gradient(145deg, #30D158 0%, #1A9C3C 100%)',
    shadow: 'rgba(26,156,60,.28)',
    port: 3003,
    tags: ['LRU', 'Write-Through', 'Cache-Aside'],
    accent: '#30D158',
    glowColorRgb: '48, 209, 88',
    curve: 'spiral',
  },
  {
    id: 'job-queue',
    name: 'Job Queue',
    subtitle: 'Background Workers',
    description: 'BullMQ-powered job processing with exponential backoff, dead letter queue and real-time worker monitoring.',
    Icon: Settings2,
    gradient: 'linear-gradient(145deg, #FF9F0A 0%, #C97800 100%)',
    shadow: 'rgba(201,120,0,.28)',
    port: 3004,
    tags: ['BullMQ', 'Exp. Backoff', 'DLQ'],
    accent: '#FF9F0A',
    glowColorRgb: '255, 159, 10',
    curve: 'fourier',
  },
  {
    id: 'pub-sub',
    name: 'Pub / Sub',
    subtitle: 'Message Broker',
    description: 'Custom in-memory broker with independent consumer group offsets, ACK/NACK protocol and DLQ replay.',
    Icon: Radio,
    gradient: 'linear-gradient(145deg, #BF5AF2 0%, #8833CC 100%)',
    shadow: 'rgba(136,51,204,.28)',
    port: 3005,
    tags: ['Consumer Groups', 'Offsets', 'DLQ Replay'],
    accent: '#BF5AF2',
    glowColorRgb: '191, 90, 242',
    curve: 'butterfly',
  },
  {
    id: 'api-gateway',
    name: 'API Gateway',
    subtitle: 'Smart Routing Layer',
    description: 'Round-robin load balancer with circuit breaker state machine (CLOSED → OPEN → HALF_OPEN) and JWT authentication.',
    Icon: Globe,
    gradient: 'linear-gradient(145deg, #5AC8FA 0%, #1A9FD8 100%)',
    shadow: 'rgba(26,159,216,.28)',
    port: 3006,
    tags: ['Round Robin', 'Circuit Breaker', 'JWT'],
    accent: '#64D2FF',
    glowColorRgb: '100, 210, 255',
    curve: 'original',
  },
]

function ServiceBadge({ port }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        })
        setStatus(res.ok ? 'online' : 'offline')
      } catch {
        setStatus('offline')
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [port])

  const cfg = {
    online:   { color: '#30D158', label: 'Online' },
    offline:  { color: '#FF453A', label: 'Offline' },
    checking: { color: '#FF9F0A', label: 'Checking' },
  }[status]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: cfg.color,
        ...(status === 'online' && { animation: 'pulse-ring 2.2s ease infinite' }),
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, letterSpacing: '.1px' }}>
        {cfg.label}
      </span>
    </div>
  )
}

export default function Home() {
  const [ready, setReady] = useState(false)
  const gridRef = useRef(null)
  useEffect(() => setReady(true), [])

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', position: 'relative' }}>

      {/* Nav */}
      <header className="nav-bar" style={{ height: '75px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CurvedLoop 
          marqueeText="✦ Scale Lab ✦ System Design Playground ✦ Scale Lab ✦ System Design Playground ✦ Scale Lab ✦ System Design Playground ✦ Scale Lab ✦ System Design Playground ✦ Scale Lab ✦ System Design Playground ✦ Scale Lab ✦ System Design Playground ✦"
          speed={0.6}
          curveAmount={25}
          direction="right"
          interactive={true}
          className="nav-title-curved"
        />
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 20px 64px', position: 'relative', zIndex: 1 }}>

        {/* Hero */}
        <div className="anim-up" style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(10,132,255,.12)', color: 'var(--blue)',
            padding: '5px 14px', borderRadius: 999,
            fontSize: 12, fontWeight: 700, letterSpacing: '.3px',
            textTransform: 'uppercase', marginBottom: 20,
            border: '1px solid rgba(10,132,255,.2)'
          }}>
            <Circle size={6} fill="currentColor" stroke="none" />
            Production-grade implementations
          </div>

          <h1 style={{
            fontSize: 'clamp(32px,5vw,56px)',
            fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.06,
            color: 'var(--label)', marginBottom: 16,
          }}>
            System Design<br />Playground
          </h1>
          <p style={{
            fontSize: 17, color: 'var(--label-2)', lineHeight: 1.65,
            maxWidth: 480, margin: '0 auto', fontWeight: 400,
          }}>
            Six classic distributed systems patterns — each a working,
            production-grade service, not just a diagram.
          </p>
        </div>

        {/* Stats strip */}
        <div className="card anim-up d1" style={{ marginBottom: 32, padding: '20px 28px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-around',
            flexWrap: 'wrap', gap: 16,
          }}>
            {[
              { label: 'Services',    value: '6'         },
              { label: 'Cache Layer', value: 'Redis 7'   },
              { label: 'Database',    value: 'Postgres'  },
              { label: 'Job Engine',  value: 'BullMQ'    },
              { label: 'Container',   value: 'Docker'    },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.4px', color: 'var(--label)' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--label-2)', fontWeight: 500, marginTop: 3, letterSpacing: '.1px' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Module Grid */}
        {ready && (
          <GlobalSpotlight
            gridRef={gridRef}
            glowColor="132, 0, 255"
            spotlightRadius={300}
          />
        )}
        <BentoCardGrid gridRef={gridRef}>
          {MODULES.map((mod, i) => {
            const isLarge = mod.id === 'distributed-cache' || mod.id === 'job-queue';
            return (
              <Link
                key={mod.id}
                href={`/${mod.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
                className={`anim-up d${i + 1}`}
              >
                <ParticleCard
                  className="magic-bento-card magic-bento-card--border-glow"
                  glowColor={mod.glowColorRgb}
                  particleCount={isLarge ? 20 : 12}
                  enableTilt={true}
                  enableMagnetism={true}
                  clickEffect={true}
                  style={{
                    '--glow-color-rgb': mod.glowColorRgb,
                  }}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div
                      className="app-icon"
                      style={{
                        background: mod.gradient,
                        boxShadow: `0 4px 14px ${mod.shadow}`,
                      }}
                    >
                      <mod.Icon size={isLarge ? 26 : 22} color="#fff" strokeWidth={2} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {ready && (
                        <MathCurveLoader
                          type={mod.curve}
                          size={isLarge ? 54 : 32}
                          color={mod.accent}
                          particleCount={isLarge ? 40 : 25}
                          opacity={0.7}
                        />
                      )}
                      {ready && <ServiceBadge port={mod.port} />}
                    </div>
                  </div>

                  {/* Text */}
                  <div style={{ marginBottom: isLarge ? 20 : 14, flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{
                      fontSize: isLarge ? 12 : 11, fontWeight: 700, letterSpacing: '.5px',
                      textTransform: 'uppercase', color: mod.accent, marginBottom: 4,
                    }}>
                      {mod.subtitle}
                    </div>
                    <h2 style={{
                      fontSize: isLarge ? 24 : 19, fontWeight: 700, letterSpacing: '-.5px',
                      color: 'var(--label)', marginBottom: 8, lineHeight: 1.25,
                    }}>
                      {mod.name}
                    </h2>
                    <p style={{ 
                      fontSize: isLarge ? 14.5 : 13.5, 
                      color: 'var(--label-2)', 
                      lineHeight: 1.55, 
                      fontWeight: 400,
                      maxWidth: isLarge ? 420 : 'none'
                    }}>
                      {mod.description}
                    </p>
                  </div>

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
                    {mod.tags.map(t => (
                      <span key={t} style={{
                        padding: '3px 9px', borderRadius: 6,
                        background: `${mod.accent}1c`, color: mod.accent,
                        fontSize: isLarge ? 12 : 11.5, fontWeight: 700, letterSpacing: '.15px',
                        border: `1px solid ${mod.accent}15`
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{
                    paddingTop: 14, borderTop: '1px solid var(--separator)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: isLarge ? 14 : 13, fontWeight: 600, color: mod.accent }}>
                      Open playground
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--label-3)', fontFamily: 'monospace' }}>
                        :{mod.port}
                      </span>
                      <ChevronRight size={14} color={mod.accent} />
                    </div>
                  </div>
                </ParticleCard>
              </Link>
            )
          })}
        </BentoCardGrid>

        {/* Footer */}
        <div style={{
          marginTop: 56, textAlign: 'center',
          fontSize: 12, color: 'var(--label-3)', fontWeight: 500, letterSpacing: '.1px',
        }}>
          Squex
        </div>
      </main>
    </div>
  )
}
