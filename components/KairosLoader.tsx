'use client'

/**
 * KairosLoader — branded full-screen loading state.
 * Pure CSS + inline SVG, zero JS overhead, no external deps.
 *
 * Kairos (Καιρός) — Greek god of the opportune moment.
 * Depicted with a forelock you can seize, bald at the back:
 * opportunity must be grasped as it arrives.
 */
export default function KairosLoader() {
  return (
    <div style={styles.root}>
      <div style={styles.scene}>

        {/* ── Watch face ─────────────────────────────────────── */}
        <div style={styles.watchOuter}>
          <div style={styles.watchInner}>
            <svg
              viewBox="0 0 120 120"
              width="120"
              height="120"
              style={styles.svg}
              aria-hidden="true"
            >
              {/* Outer ring glow */}
              <circle cx="60" cy="60" r="56" fill="none" stroke="#4f46e5" strokeWidth="1" opacity="0.2" />

              {/* Tick marks */}
              {Array.from({ length: 12 }).map((_, i) => {
                const angle = (i * 30 * Math.PI) / 180
                const isMajor = i % 3 === 0
                const r1 = isMajor ? 46 : 48
                const r2 = 52
                return (
                  <line
                    key={i}
                    x1={60 + r1 * Math.sin(angle)}
                    y1={60 - r1 * Math.cos(angle)}
                    x2={60 + r2 * Math.sin(angle)}
                    y2={60 - r2 * Math.cos(angle)}
                    stroke="#4f46e5"
                    strokeWidth={isMajor ? 2 : 1}
                    opacity={isMajor ? 0.9 : 0.4}
                    strokeLinecap="round"
                  />
                )
              })}

              {/* Hour hand — slow sweep */}
              <line
                x1="60" y1="60" x2="60" y2="32"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                style={{ transformOrigin: '60px 60px', animation: 'kHour 12s linear infinite' }}
              />

              {/* Minute hand — medium sweep */}
              <line
                x1="60" y1="60" x2="60" y2="22"
                stroke="#a5b4fc"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transformOrigin: '60px 60px', animation: 'kMinute 2s linear infinite' }}
              />

              {/* Second hand — fast, accent color */}
              <line
                x1="60" y1="68" x2="60" y2="18"
                stroke="#4f46e5"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ transformOrigin: '60px 60px', animation: 'kSecond 1s steps(60, end) infinite' }}
              />

              {/* Center jewel */}
              <circle cx="60" cy="60" r="3.5" fill="#4f46e5" />
              <circle cx="60" cy="60" r="1.5" fill="white" />
            </svg>
          </div>
        </div>

        {/* ── Logo + wordmark ─────────────────────────────────── */}
        <div style={styles.wordmark}>
          <span style={styles.word}>Kairos</span>
          <span style={styles.tagline}>Καιρός · the right moment</span>
        </div>

        {/* ── Subtle arc progress ─────────────────────────────── */}
        <svg width="180" height="4" viewBox="0 0 180 4" style={styles.bar} aria-hidden="true">
          <rect x="0" y="0" width="180" height="4" rx="2" fill="#4f46e5" opacity="0.12" />
          <rect
            x="0" y="0" width="60" height="4" rx="2"
            fill="#4f46e5"
            style={{ animation: 'kBar 1.4s ease-in-out infinite' }}
          />
        </svg>
      </div>

      <style>{`
        @keyframes kHour   { to { transform: rotate(360deg); } }
        @keyframes kMinute { to { transform: rotate(360deg); } }
        @keyframes kSecond { to { transform: rotate(360deg); } }
        @keyframes kPulse  {
          0%, 100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); }
          50%       { box-shadow: 0 0 0 16px rgba(79,70,229,0.08); }
        }
        @keyframes kBar {
          0%   { transform: translateX(-60px); opacity: 0.4; }
          50%  { opacity: 1; }
          100% { transform: translateX(180px); opacity: 0.4; }
        }
        @keyframes kFade {
          0%, 100% { opacity: 0.5; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--background, #09090b)',
    zIndex: 9999,
  },
  scene: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  watchOuter: {
    width: '136px',
    height: '136px',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #1e1b4b, #0f0f23)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 1px rgba(79,70,229,0.25), 0 8px 32px rgba(0,0,0,0.6)',
    animation: 'kPulse 3s ease-in-out infinite',
  },
  watchInner: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  svg: {
    display: 'block',
  },
  wordmark: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  word: {
    fontSize: '22px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    color: 'white',
  },
  tagline: {
    fontSize: '10px',
    letterSpacing: '0.12em',
    color: '#6366f1',
    textTransform: 'uppercase' as const,
    animation: 'kFade 2.8s ease-in-out infinite',
  },
  bar: {
    overflow: 'hidden',
    borderRadius: '2px',
  },
}
