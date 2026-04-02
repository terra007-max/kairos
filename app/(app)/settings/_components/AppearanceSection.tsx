'use client'
import { useTheme } from 'next-themes'
import { useI18n } from '@/lib/i18n'
import { Sun, Moon, Monitor } from 'lucide-react'

export function AppearanceSection() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sun className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('appearance')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('appearanceHint')}</p>
      <div className="grid grid-cols-3 gap-2 p-1 bg-muted/50 rounded-xl">
        {[
          { id: 'light',  labelKey: 'light'  as const, icon: Sun },
          { id: 'dark',   labelKey: 'dark'   as const, icon: Moon },
          { id: 'system', labelKey: 'system' as const, icon: Monitor },
        ].map(opt => (
          <button
            key={opt.id}
            onClick={() => setTheme(opt.id)}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              theme === opt.id
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <opt.icon size={14} />
            {t(opt.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}
