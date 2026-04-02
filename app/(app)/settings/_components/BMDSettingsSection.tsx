'use client'
import { useState, useEffect } from 'react'
import { Receipt } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export function BMDSettingsSection() {
  const { t } = useI18n()
  const [taxCode, setTaxCode] = useState('U20')
  const [revenueAccount, setRevenueAccount] = useState('4000')
  const [debitorAccount, setDebitorAccount] = useState('10000')
  const [saved, setSaved] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setTaxCode(localStorage.getItem('kairos-bmd-taxcode') || 'U20')
    setRevenueAccount(localStorage.getItem('kairos-bmd-revenue') || '4000')
    setDebitorAccount(localStorage.getItem('kairos-bmd-debitor') || '10000')
  }, [])

  if (!mounted) return null

  function save() {
    localStorage.setItem('kairos-bmd-taxcode', taxCode)
    localStorage.setItem('kairos-bmd-revenue', revenueAccount)
    localStorage.setItem('kairos-bmd-debitor', debitorAccount)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Receipt className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('invoicingSettings')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('invoicingSettingsHint')}</p>
      <div className="space-y-3">
        <div>
          <label className="label">{t('taxCodeLabel')}</label>
          <select className="input" value={taxCode} onChange={e => setTaxCode(e.target.value)}>
            <option value="U20">U20 — 20% USt (Inland)</option>
            <option value="U10">U10 — 10% USt (ermäßigt)</option>
            <option value="IG">IG — Innergemeinschaftliche Lieferung (EU)</option>
            <option value="AU">AU — Ausfuhrlieferung (Export)</option>
            <option value="0">0 — Steuerfrei</option>
          </select>
        </div>
        <div>
          <label className="label">{t('revenueAccountLabel')}</label>
          <input className="input" value={revenueAccount} onChange={e => setRevenueAccount(e.target.value)} placeholder="4000" />
        </div>
        <div>
          <label className="label">{t('debitorAccountLabel')}</label>
          <input className="input" value={debitorAccount} onChange={e => setDebitorAccount(e.target.value)} placeholder="10000" />
        </div>
      </div>
      <button onClick={save} className="btn-primary mt-4">
        {saved ? t('savedCheck') : t('save')}
      </button>
    </div>
  )
}
