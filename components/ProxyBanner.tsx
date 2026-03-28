'use client'

import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { Eye, X } from 'lucide-react'

export default function ProxyBanner() {
  const { isProxying, proxyUser, stopProxy } = useWorkspace()
  const { t } = useI18n()
  if (!isProxying || !proxyUser) return null

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-400">
      <div className="flex items-center gap-2 text-xs font-medium">
        <Eye className="w-3.5 h-3.5 flex-shrink-0" />
        {t('proxyViewing')} <strong>{proxyUser.name}</strong> {t('proxyExact')}
      </div>
      <button
        onClick={() => { stopProxy(); window.location.reload() }}
        className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md hover:bg-amber-500/20 transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" /> {t('proxyExit')}
      </button>
    </div>
  )
}
