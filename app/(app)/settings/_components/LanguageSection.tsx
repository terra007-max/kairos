'use client'
import { useI18n, type Locale } from '@/lib/i18n'
import { Globe } from 'lucide-react'

export function LanguageSection() {
  const { t, locale, setLocale } = useI18n()

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('language')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('languageHint')}</p>
      <div className="flex gap-2">
        {([['en', 'EN', 'English'], ['de', 'DE', 'Deutsch']] as [Locale, string, string][]).map(([l, code, name]) => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`flex-1 flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all border ${
              locale === l
                ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-brand-500/50 hover:text-brand-600'
            }`}
          >
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${locale === l ? 'bg-white/20 text-white' : 'bg-muted text-foreground'}`}>
              {code}
            </span>
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
