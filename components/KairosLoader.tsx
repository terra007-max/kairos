'use client'

/**
 * KairosLoader — branded loading state.
 *
 * size="page" (default): full-screen overlay with wordmark + progress bar
 * size="sm": compact inline K mark, same footprint as the old w-6 h-6 spinner
 */
export default function KairosLoader({ size = 'page' }: { size?: 'page' | 'sm' }) {
  if (size === 'sm') {
    return (
      <div className="flex items-center justify-center h-64">
        <svg
          viewBox="0 0 80 80"
          width="28"
          height="28"
          aria-hidden="true"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <filter id="klGlowSm" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <line x1="28" y1="40" x2="5"  y2="10"
            stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="38" strokeDashoffset="38"
            style={{ animation: 'klPast 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="5"  y2="70"
            stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="38" strokeDashoffset="38"
            style={{ animation: 'klPast 3.6s ease-in-out infinite 0.12s' }}
          />
          <line x1="28" y1="40" x2="28" y2="6"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="28" y2="74"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite 0.06s' }}
          />
          <line x1="28" y1="40" x2="72" y2="7"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="55" strokeDashoffset="55"
            filter="url(#klGlowSm)"
            style={{ animation: 'klFuture 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="72" y2="73"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="55" strokeDashoffset="55"
            filter="url(#klGlowSm)"
            style={{ animation: 'klFuture 3.6s ease-in-out infinite 0.12s' }}
          />
        </svg>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.scene}>

        {/* ── Mark ───────────────────────────────────────────── */}
        <svg
          viewBox="0 0 80 80"
          width="120"
          height="120"
          aria-hidden="true"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <filter id="klGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <line x1="28" y1="40" x2="5"  y2="10"
            stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="38" strokeDashoffset="38"
            style={{ animation: 'klPast 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="5"  y2="70"
            stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            strokeDasharray="38" strokeDashoffset="38"
            style={{ animation: 'klPast 3.6s ease-in-out infinite 0.12s' }}
          />

          <line x1="28" y1="40" x2="28" y2="6"
            stroke="white" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="28" y2="74"
            stroke="white" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite 0.06s' }}
          />

          <line x1="28" y1="40" x2="72" y2="7"
            stroke="white" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="55" strokeDashoffset="55"
            filter="url(#klGlow)"
            style={{ animation: 'klFuture 3.6s ease-in-out infinite' }}
          />
          <line x1="28" y1="40" x2="72" y2="73"
            stroke="white" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="55" strokeDashoffset="55"
            filter="url(#klGlow)"
            style={{ animation: 'klFuture 3.6s ease-in-out infinite 0.12s' }}
          />
        </svg>

        {/* ── Wordmark ─────────────────────────────────────── */}
        <div style={styles.wordmark}>
          <span style={styles.word}>Kairos</span>
          <span style={styles.tagline}>Καιρός · the right moment</span>
        </div>

        {/* ── Progress bar ─────────────────────────────────── */}
        <svg width="160" height="4" viewBox="0 0 160 4" style={{ overflow: 'hidden', borderRadius: '2px' }} aria-hidden="true">
          <rect x="0" y="0" width="160" height="4" rx="2" fill="#4f46e5" opacity="0.12" />
          <rect x="0" y="0" width="50"  height="4" rx="2" fill="#4f46e5"
            style={{ animation: 'klBar 1.5s ease-in-out infinite' }}
          />
        </svg>
      </div>
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
    gap: '24px',
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
    letterSpacing: '0.14em',
    color: '#818cf8',
    textTransform: 'uppercase' as const,
    animation: 'klFade 2.8s ease-in-out infinite',
  },
}
