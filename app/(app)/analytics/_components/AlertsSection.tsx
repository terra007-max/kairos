'use client'
import { AlertTriangle } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type WorkspaceMemberLike = { user_id: string; full_name?: string | null; email?: string | null }
type Anomaly = { message: string; severity: 'error' | 'warning' }

export function AlertsSection({ burnoutRisks, anomalies }: {
  burnoutRisks: WorkspaceMemberLike[]
  anomalies: Anomaly[]
}) {
  const { t } = useI18n()

  if (burnoutRisks.length === 0 && anomalies.length === 0) return null

  return (
    <div className="space-y-2">
      {burnoutRisks.map(m => (
        <div key={m.user_id} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-500">{t('burnoutRiskLabel')} — {m.full_name || m.email}</p>
            <p className="text-xs text-muted-foreground">{t('burnoutRiskDetail')}</p>
          </div>
        </div>
      ))}
      {anomalies.map((a, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${a.severity === 'error' ? 'bg-red-500/10 border border-red-500/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
          <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`} />
          <p className={`text-xs ${a.severity === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{a.message}</p>
        </div>
      ))}
    </div>
  )
}
