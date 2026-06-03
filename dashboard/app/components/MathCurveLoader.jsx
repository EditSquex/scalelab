'use client'

import { useEffect, useRef } from 'react'

const CURVE_DEFS = {
  original: {
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    trailSpan: 0.38,
    strokeWidth: 5.5,
    rotate: true,
    point(progress, detailScale) {
      const t = progress * Math.PI * 2
      const x = 7 * Math.cos(t) - 3 * detailScale * Math.cos(7 * t)
      const y = 7 * Math.sin(t) - 3 * detailScale * Math.sin(7 * t)
      return { x: 50 + x * 3.9, y: 50 + y * 3.9 }
    }
  },
  rose: {
    durationMs: 5400,
    rotationDurationMs: 28000,
    pulseDurationMs: 4600,
    trailSpan: 0.32,
    strokeWidth: 4.5,
    rotate: true,
    point(progress, detailScale) {
      const t = progress * Math.PI * 2
      const a = 9.2 + detailScale * 0.6
      const r = a * (0.72 + detailScale * 0.28) * Math.cos(5 * t)
      return {
        x: 50 + Math.cos(t) * r * 3.25,
        y: 50 + Math.sin(t) * r * 3.25,
      }
    }
  },
  lissajous: {
    durationMs: 6000,
    rotationDurationMs: 36000,
    pulseDurationMs: 5400,
    trailSpan: 0.34,
    strokeWidth: 4.7,
    rotate: false,
    point(progress, detailScale) {
      const t = progress * Math.PI * 2
      const amp = 24 + detailScale * 6
      return {
        x: 50 + Math.sin(3 * t + 1.57) * amp,
        y: 50 + Math.sin(4 * t) * (amp * 0.92),
      }
    }
  },
  heart: {
    durationMs: 8400,
    rotationDurationMs: 22000,
    pulseDurationMs: 5600,
    trailSpan: 0.18,
    strokeWidth: 3.9,
    rotate: false,
    point(progress, detailScale) {
      const xLimit = Math.sqrt(3.3)
      const x = -xLimit + progress * xLimit * 2
      const safeRoot = Math.max(0, 3.3 - x * x)
      const wave = 0.9 * Math.sqrt(safeRoot) * Math.sin(6.4 * Math.PI * x)
      const curve = Math.pow(Math.abs(x), 2 / 3)
      const y = curve + wave
      const scaleX = 23.2
      const scaleY = 24.5 + detailScale * 1.5
      return {
        x: 50 + x * scaleX,
        y: 18 + (1.75 - y) * scaleY,
      }
    }
  },
  spiral: {
    durationMs: 4600,
    rotationDurationMs: 28000,
    pulseDurationMs: 4200,
    trailSpan: 0.34,
    strokeWidth: 4.4,
    rotate: true,
    point(progress, detailScale) {
      const t = progress * Math.PI * 2
      const d = 3 + detailScale * 0.25
      const baseX = (5 - 1) * Math.cos(t) + d * Math.cos(((5 - 1) / 1) * t)
      const baseY = (5 - 1) * Math.sin(t) - d * Math.sin(((5 - 1) / 1) * t)
      const scale = 2.2 + detailScale * 0.45
      return {
        x: 50 + baseX * scale,
        y: 50 + baseY * scale,
      }
    }
  },
  butterfly: {
    durationMs: 9000,
    rotationDurationMs: 50000,
    pulseDurationMs: 7000,
    trailSpan: 0.32,
    strokeWidth: 4.4,
    rotate: false,
    point(progress, detailScale) {
      const t = progress * Math.PI * 12
      const s = Math.exp(Math.cos(t)) - 2 * Math.cos(4 * t) - Math.sin(t / 12) ** 5
      const scale = 4.6 + detailScale * 0.45
      return {
        x: 50 + Math.sin(t) * s * scale,
        y: 50 + Math.cos(t) * s * scale,
      }
    }
  },
  fourier: {
    durationMs: 8400,
    rotationDurationMs: 44000,
    pulseDurationMs: 6800,
    trailSpan: 0.31,
    strokeWidth: 4.2,
    rotate: false,
    point(progress, detailScale) {
      const t = progress * Math.PI * 2
      const mix = 1 + detailScale * 0.16
      const x = 17 * Math.cos(t) + 7.5 * Math.cos(3 * t + 0.6 * mix) + 3.2 * Math.sin(5 * t - 0.4)
      const y = 15 * Math.sin(t) + 8.2 * Math.sin(2 * t + 0.25) - 4.2 * Math.cos(4 * t - 0.5 * mix)
      return {
        x: 50 + x,
        y: 50 + y,
      }
    }
  }
}

function normalizeProgress(p) {
  return ((p % 1) + 1) % 1
}

function getDetailScale(time, cfg) {
  const pulseProgress = (time % cfg.pulseDurationMs) / cfg.pulseDurationMs
  const pulseAngle = pulseProgress * Math.PI * 2
  return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48
}

function getRotation(time, cfg) {
  if (!cfg.rotate) return 0
  return -((time % cfg.rotationDurationMs) / cfg.rotationDurationMs) * 360
}

function buildPath(cfg, detailScale, steps = 180) {
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const pt = cfg.point(i / steps, detailScale)
    d += `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`
  }
  return d
}

export default function MathCurveLoader({
  type = 'original',
  size = 50,
  color = 'currentColor',
  particleCount = 40,
  opacity = 0.85
}) {
  const containerRef = useRef(null)
  const groupRef = useRef(null)
  const pathRef = useRef(null)
  const particlesRef = useRef([])

  const config = CURVE_DEFS[type] || CURVE_DEFS.original
  const count = Math.min(particleCount, 120)

  useEffect(() => {
    const startedAt = performance.now()
    let frameId

    // Re-create particles array of DOM references
    const circles = Array.from(containerRef.current.querySelectorAll('circle'))
    particlesRef.current = circles

    const animate = (now) => {
      const time = now - startedAt
      const progress = (time % config.durationMs) / config.durationMs
      const detailScale = getDetailScale(time, config)
      const rot = getRotation(time, config)

      if (groupRef.current) {
        groupRef.current.setAttribute('transform', `rotate(${rot.toFixed(1)} 50 50)`)
      }

      if (pathRef.current) {
        pathRef.current.setAttribute('d', buildPath(config, detailScale))
      }

      particlesRef.current.forEach((node, index) => {
        if (!node) return
        const tailOffset = index / (count - 1)
        const pt = config.point(
          normalizeProgress(progress - tailOffset * config.trailSpan),
          detailScale
        )
        const fade = Math.pow(1 - tailOffset, 0.56)
        const radius = 0.9 + fade * 2.5
        const op = (0.04 + fade * 0.96) * opacity

        node.setAttribute('cx', pt.x.toFixed(2))
        node.setAttribute('cy', pt.y.toFixed(2))
        node.setAttribute('r', radius.toFixed(2))
        node.setAttribute('opacity', op.toFixed(3))
      })

      frameId = requestAnimationFrame(animate)
    }

    frameId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(frameId)
  }, [type, count, opacity, config])

  return (
    <svg
      ref={containerRef}
      viewBox="0 0 100 100"
      style={{
        width: size,
        height: size,
        overflow: 'visible',
        color: color
      }}
      fill="none"
    >
      <g ref={groupRef}>
        <path
          ref={pathRef}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.1"
        />
        {Array.from({ length: count }).map((_, i) => (
          <circle key={i} fill="currentColor" />
        ))}
      </g>
    </svg>
  )
}
