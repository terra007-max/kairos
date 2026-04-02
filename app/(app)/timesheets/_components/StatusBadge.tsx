'use client'
import { CheckCircle, XCircle, Clock, Lock } from 'lucide-react'
import { type TimesheetStatus } from '../_lib/types'

export function StatusBadge({ status, locked, t }: {
  status: TimesheetStatus
  locked?: boolean
  t: (k: any) => string
}) {
  if (locked) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-500">
      <Lock className="w-3 h-3" /> {t('lockedStatus')}
    </span>
  )
  if (status === 'approved') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle className="w-3 h-3" /> {t('approved')}
    </span>
  )
  if (status === 'rejected') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <XCircle className="w-3 h-3" /> {t('returnedStatus')}
    </span>
  )
  if (status === 'submitted') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <Clock className="w-3 h-3" /> {t('submitted')}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <Clock className="w-3 h-3" /> {t('draft')}
    </span>
  )
}
