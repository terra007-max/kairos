'use client'

import { useI18n } from '@/lib/i18n'
import { useState } from 'react'

export default function ImpressumPage() {
  const { locale } = useI18n()
  const [lang, setLang] = useState<'de' | 'en'>(locale === 'de' ? 'de' : 'en')

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {lang === 'de' ? 'Impressum' : 'Legal Notice'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lang === 'de' ? 'Pflichtangaben gemäß § 5 ECG' : 'Required information pursuant to § 5 ECG'}
          </p>
        </div>
        <div className="flex gap-1 bg-muted p-0.5 rounded-lg">
          <button
            onClick={() => setLang('de')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${lang === 'de' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            🇩🇪 Deutsch
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${lang === 'en' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            🇬🇧 English
          </button>
        </div>
      </div>

      {lang === 'de' ? (
        <div className="max-w-2xl space-y-6">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Angaben gemäß § 5 ECG</h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Maximilian Stubhan</p>
              <p>Österreich</p>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Kontakt</h2>
            <p className="text-sm text-muted-foreground">Bei Fragen oder Anliegen wenden Sie sich bitte über die App an uns.</p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Haftung für Inhalte</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Die Inhalte dieser Anwendung wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß § 7 Abs.1 ECG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Datenschutz</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Die Nutzung unserer Anwendung ist in der Regel ohne Angabe personenbezogener Daten möglich. Soweit auf unseren Seiten personenbezogene Daten erhoben werden, erfolgt dies auf freiwilliger Basis. Diese Daten werden ohne Ihre ausdrückliche Zustimmung nicht an Dritte weitergegeben.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              Ihre Daten werden auf Servern von Supabase (AWS Frankfurt, EU) gespeichert und verarbeitet. Die Anwendung ist auf Vercel gehostet. Beide Anbieter entsprechen den Anforderungen der DSGVO.
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Ihre Rechte</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {['Auskunft über Ihre gespeicherten personenbezogenen Daten','Berichtigung unrichtiger Daten','Löschung Ihrer Daten','Einschränkung der Verarbeitung','Datenübertragbarkeit','Widerspruch gegen die Verarbeitung'].map(r => (
                <li key={r} className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>{r}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              In Österreich ist die zuständige Aufsichtsbehörde die Datenschutzbehörde (www.dsb.gv.at).
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Technologie</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>Next.js (Vercel) — Hosting & Frontend</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>Supabase (AWS Frankfurt) — Datenbank & Authentifizierung</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>Keine Tracking-Cookies, keine Werbung</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground text-center pb-4">© {new Date().getFullYear()} Maximilian Stubhan. Alle Rechte vorbehalten.</p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Information pursuant to § 5 ECG</h2>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Maximilian Stubhan</p>
              <p>Austria</p>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Contact</h2>
            <p className="text-sm text-muted-foreground">For questions or concerns, please contact us through the app.</p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Liability for Content</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The contents of this application have been created with the utmost care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content. As a service provider, we are responsible for our own content pursuant to § 7 para. 1 ECG.
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Privacy Policy</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your data is stored and processed on servers provided by Supabase (AWS Frankfurt, EU). The application is hosted on Vercel. Both providers comply with GDPR requirements.
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Your Rights</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {['Access your stored personal data','Correct inaccurate data','Delete your data','Restrict processing','Data portability','Object to processing'].map(r => (
                <li key={r} className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>{r}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground leading-relaxed mt-3">
              In Austria, the competent supervisory authority is the Data Protection Authority (www.dsb.gv.at).
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Technology</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>Next.js (Vercel) — Hosting & Frontend</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>Supabase (AWS Frankfurt) — Database & Authentication</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span>No tracking cookies, no advertising</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground text-center pb-4">© {new Date().getFullYear()} Maximilian Stubhan. All rights reserved.</p>
        </div>
      )}
    </div>
  )
}
