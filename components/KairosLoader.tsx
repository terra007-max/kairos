'use client'

/**
 * KairosLoader — branded full-screen loading state.
 *
 * Kairos (Καιρός) — Greek god of the opportune moment.
 * "The Razor's Edge": a vertical stroke (the present) flanked by
 * two K-arms reaching into the future (right, solid) while
 * mirror ghost arms dissolve into the past (left, fading).
 */
export default function KairosLoader() {
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

          {/* Past ghost arms — left, dissolving into the past */}
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

          {/* Razor spine — upper half, draws from junction upward */}
          <line x1="28" y1="40" x2="28" y2="6"
            stroke="white" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite' }}
          />
          {/* Razor spine — lower half, draws from junction downward */}
          <line x1="28" y1="40" x2="28" y2="74"
            stroke="white" strokeWidth="3" strokeLinecap="round"
            strokeDasharray="34" strokeDashoffset="34"
            style={{ animation: 'klSpine 3.6s ease-in-out infinite 0.06s' }}
          />

          {/* Future arms — right, materialising */}
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

      <style>{`
        /* 1. Razor spine draws from the junction outward (0–22%) */
        @keyframes klSpine {
          0%         { stroke-dashoffset: 34; opacity: 0; }
          5%         { opacity: 1; }
          22%, 78%   { stroke-dashoffset: 0; opacity: 1; }
          90%        { stroke-dashoffset: 0; opacity: 0; }
          100%       { stroke-dashoffset: 34; opacity: 0; }
        }

        /* 2. Future arms draw from junction outward (17–45%) */
        @keyframes klFuture {
          0%, 17%    { stroke-dashoffset: 55; opacity: 0; }
          20%        { opacity: 1; }
          45%, 78%   { stroke-dashoffset: 0; opacity: 1; }
          90%        { stroke-dashoffset: 0; opacity: 0; }
          100%       { stroke-dashoffset: 55; opacity: 0; }
        }

        /* 3. Past ghost arms bloom then dissolve (28–68%) */
        @keyframes klPast {
          0%, 28%    { stroke-dashoffset: 38; opacity: 0; }
          42%        { stroke-dashoffset: 0;  opacity: 0.45; }
          68%        { stroke-dashoffset: 0;  opacity: 0; }
          100%       { stroke-dashoffset: 38; opacity: 0; }
        }

        /* Progress shimmer */
        @keyframes klBar {
          0%   { transform: translateX(-50px); opacity: 0.4; }
          50%  { opacity: 1; }
          100% { transform: translateX(160px); opacity: 0.4; }
        }

        /* Tagline pulse */
        @keyframes klFade {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
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
