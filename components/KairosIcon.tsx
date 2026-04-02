/**
 * KairosIcon — the Razor's Edge K mark.
 *
 * Vertical razor (the present) + two arms reaching into the future (right, solid)
 * + mirror ghost arms dissolving into the past (left, fading).
 *
 * Geometry is normalised to a 24×24 viewBox and scaled via `size`.
 */
export default function KairosIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {/* Past ghost arms — left, dissolving */}
      <line x1="8" y1="12" x2="2" y2="4"  stroke="white" strokeWidth="1.5" strokeLinecap="round"
        style={{ animation: 'razorPast 3.2s ease-in-out infinite' }} />
      <line x1="8" y1="12" x2="2" y2="20" stroke="white" strokeWidth="1.5" strokeLinecap="round"
        style={{ animation: 'razorPast 3.2s ease-in-out infinite 0.4s' }} />
      {/* Razor — the present moment */}
      <line x1="8" y1="3" x2="8" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Future arms — right, forming */}
      <line x1="8" y1="12" x2="19" y2="3"  stroke="white" strokeWidth="2" strokeLinecap="round"
        style={{ animation: 'razorFuture 3.2s ease-in-out infinite' }} />
      <line x1="8" y1="12" x2="19" y2="21" stroke="white" strokeWidth="2" strokeLinecap="round"
        style={{ animation: 'razorFuture 3.2s ease-in-out infinite 0.4s' }} />
    </svg>
  )
}
