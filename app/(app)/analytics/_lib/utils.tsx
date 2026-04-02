'use client'
import { AlertTriangle, CheckCircle, XCircle, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { formatMoney } from '@/lib/types'

export function healthColor(pct: number) {
  if (pct >= 100) return 'text-red-500'
  if (pct >= 80) return 'text-amber-500'
  return 'text-emerald-500'
}

export function healthBg(pct: number) {
  if (pct >= 100) return 'bg-red-500/10 border-red-500/20'
  if (pct >= 80) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-emerald-500/10 border-emerald-500/20'
}

export function utilBarColor(pct: number) {
  if (pct > 110) return 'bg-red-500'
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-amber-500'
  return 'bg-muted-foreground/40'
}

export function HealthIcon({ pct }: { pct: number }) {
  if (pct >= 100) return <XCircle className="w-4 h-4 text-red-500" />
  if (pct >= 80) return <AlertTriangle className="w-4 h-4 text-amber-500" />
  return <CheckCircle className="w-4 h-4 text-emerald-500" />
}

export function TrendPill({ delta }: { delta: number }) {
  if (Math.abs(delta) < 2) return <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Minus className="w-2.5 h-2.5" />—</span>
  if (delta > 0) return <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500"><ArrowUpRight className="w-2.5 h-2.5" />+{delta}pp</span>
  return <span className="inline-flex items-center gap-0.5 text-[10px] text-red-400"><ArrowDownRight className="w-2.5 h-2.5" />{delta}pp</span>
}

export function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {typeof p.value === 'number' && p.value > 100 ? formatMoney(p.value) : p.value}{p.name === 'hours' ? 'h' : ''}</p>
      ))}
    </div>
  )
}
