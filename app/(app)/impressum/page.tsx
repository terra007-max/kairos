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
          <h1 className="text-xl font-semibold text-gray-900">
            {lang === 'de' ? 'Impressum' : 'Legal Notice'}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {lang === 'de' ? 'Pflichtangaben gemäß § 5 ECG' : 'Required information pursuant to § 5 ECG'}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
          <button
            onClick={() => setLang('de')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${lang === 'de' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            🇩🇪 Deutsch
          </button>
          <button
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${lang === 'en' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            🇬🇧 English
          </button>
        </div>
      </div>

      {lang === 'de' ? (
        <div className="max-w-2xl space-y-6">

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Angaben gemäß § 5 ECG</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p className="font-medium text-gray-900">Maximilian Stubhan</p>
              <p>Österreich</p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Kontakt</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p>Bei Fragen oder Anliegen wenden Sie sich bitte über die App an uns.</p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Haftung für Inhalte</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Die Inhalte dieser Anwendung wurden mit größter Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß § 7 Abs.1 ECG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Datenschutz</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Die Nutzung unserer Anwendung ist in der Regel ohne Angabe personenbezogener Daten möglich. Soweit auf unseren Seiten personenbezogene Daten (beispielsweise Name, Anschrift oder E-Mail-Adressen) erhoben werden, erfolgt dies, soweit möglich, stets auf freiwilliger Basis. Diese Daten werden ohne Ihre ausdrückliche Zustimmung nicht an Dritte weitergegeben.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              Wir weisen darauf hin, dass die Datenübertragung im Internet (z.B. bei der Kommunikation per E-Mail) Sicherheitslücken aufweisen kann. Ein lückenloser Schutz der Daten vor dem Zugriff durch Dritte ist nicht möglich.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              Ihre Daten werden auf Servern von Supabase (AWS Frankfurt, EU) gespeichert und verarbeitet. Die Anwendung ist auf Vercel gehostet. Beide Anbieter entsprechen den Anforderungen der DSGVO.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Ihre Rechte</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Sie haben jederzeit das Recht auf:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Auskunft über Ihre gespeicherten personenbezogenen Daten</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Berichtigung unrichtiger Daten</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Löschung Ihrer Daten</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Einschränkung der Verarbeitung</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Datenübertragbarkeit</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Widerspruch gegen die Verarbeitung</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              Zur Ausübung dieser Rechte wenden Sie sich bitte über die App an uns. Sie haben außerdem das Recht, Beschwerde bei der zuständigen Aufsichtsbehörde einzulegen. In Österreich ist dies die Datenschutzbehörde (www.dsb.gv.at).
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Urheberrecht</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Die durch den Betreiber erstellten Inhalte und Werke in dieser Anwendung unterliegen dem österreichischen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Technologie</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p>Diese Anwendung verwendet folgende Technologien:</p>
              <ul className="mt-2 space-y-1">
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Next.js (Vercel) — Hosting & Frontend</li>
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Supabase (AWS Frankfurt) — Datenbank & Authentifizierung</li>
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Keine Tracking-Cookies, keine Werbung</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pb-4">
            © {new Date().getFullYear()} Maximilian Stubhan. Alle Rechte vorbehalten.
          </p>
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Information pursuant to § 5 ECG</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p className="font-medium text-gray-900">Maximilian Stubhan</p>
              <p>Austria</p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Contact</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p>For questions or concerns, please contact us through the app.</p>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Liability for Content</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The contents of this application have been created with the utmost care. However, we cannot guarantee the accuracy, completeness, or timeliness of the content. As a service provider, we are responsible for our own content on these pages in accordance with general laws pursuant to § 7 para. 1 ECG.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Privacy Policy</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The use of our application is generally possible without providing personal data. Where personal data (such as name, address or email addresses) is collected on our pages, this is always done on a voluntary basis wherever possible. This data will not be passed on to third parties without your express consent.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              Please note that data transmission over the internet (e.g. when communicating by email) may have security gaps. Complete protection of data from access by third parties is not possible.
            </p>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              Your data is stored and processed on servers provided by Supabase (AWS Frankfurt, EU). The application is hosted on Vercel. Both providers comply with GDPR requirements.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Your Rights</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              You have the right at any time to:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Access your stored personal data</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Correct inaccurate data</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Delete your data</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Restrict processing</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Data portability</li>
              <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Object to processing</li>
            </ul>
            <p className="text-sm text-gray-600 leading-relaxed mt-3">
              To exercise these rights, please contact us through the app. You also have the right to lodge a complaint with the competent supervisory authority. In Austria, this is the Data Protection Authority (www.dsb.gv.at).
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Copyright</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The content and works created by the operator in this application are subject to Austrian copyright law. Reproduction, processing, distribution and any kind of exploitation outside the limits of copyright law require the written consent of the respective author or creator.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Technology</h2>
            <div className="space-y-1 text-sm text-gray-600">
              <p>This application uses the following technologies:</p>
              <ul className="mt-2 space-y-1">
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Next.js (Vercel) — Hosting & Frontend</li>
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> Supabase (AWS Frankfurt) — Database & Authentication</li>
                <li className="flex items-start gap-2"><span className="text-brand-500 mt-0.5">•</span> No tracking cookies, no advertising</li>
              </ul>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center pb-4">
            © {new Date().getFullYear()} Maximilian Stubhan. All rights reserved.
          </p>
        </div>
      )}
    </div>
  )
}