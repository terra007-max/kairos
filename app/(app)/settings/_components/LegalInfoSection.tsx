'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { Building2 } from 'lucide-react'

export function LegalInfoSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useI18n()
  const supabase = createClient()

  const [legalName, setLegalName] = useState('')
  const [addressStreet, setAddressStreet] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressZip, setAddressZip] = useState('')
  const [addressCountry, setAddressCountry] = useState('AT')
  const [vatId, setVatId] = useState('')
  const [companyReg, setCompanyReg] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('workspaces').select(
      'legal_name, address_street, address_city, address_zip, address_country, vat_id, company_reg, iban, bic'
    ).eq('id', workspaceId).single()
    if (data) {
      setLegalName(data.legal_name || '')
      setAddressStreet(data.address_street || '')
      setAddressCity(data.address_city || '')
      setAddressZip(data.address_zip || '')
      setAddressCountry(data.address_country || 'AT')
      setVatId(data.vat_id || '')
      setCompanyReg(data.company_reg || '')
      setIban(data.iban || '')
      setBic(data.bic || '')
    }
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  async function save() {
    await supabase.from('workspaces').update({
      legal_name: legalName || null,
      address_street: addressStreet || null,
      address_city: addressCity || null,
      address_zip: addressZip || null,
      address_country: addressCountry || 'AT',
      vat_id: vatId || null,
      company_reg: companyReg || null,
      iban: iban || null,
      bic: bic || null,
    }).eq('id', workspaceId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('legalInfoTitle')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('legalInfoHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">{t('legalCompanyName')}</label>
          <input className="input" placeholder="Kairos Consulting GmbH" value={legalName} onChange={e => setLegalName(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">{t('legalStreet')}</label>
          <input className="input" placeholder="Musterstraße 1" value={addressStreet} onChange={e => setAddressStreet(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('legalZip')}</label>
          <input className="input" placeholder="1010" value={addressZip} onChange={e => setAddressZip(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('legalCity')}</label>
          <input className="input" placeholder="Wien" value={addressCity} onChange={e => setAddressCity(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('legalCountry')}</label>
          <select className="input" value={addressCountry} onChange={e => setAddressCountry(e.target.value)}>
            <option value="AT">AT — Österreich</option>
            <option value="DE">DE — Deutschland</option>
            <option value="CH">CH — Schweiz</option>
            <option value="US">US — United States</option>
          </select>
        </div>
        <div>
          <label className="label">{t('legalVatId')}</label>
          <input className="input" placeholder="ATU12345678" value={vatId} onChange={e => setVatId(e.target.value)} />
        </div>
        <div>
          <label className="label">{t('legalCompanyReg')}</label>
          <input className="input" placeholder="FN 123456 a" value={companyReg} onChange={e => setCompanyReg(e.target.value)} />
        </div>
        <div>
          <label className="label">IBAN</label>
          <input className="input" placeholder="AT12 3456 7890 1234 5678" value={iban} onChange={e => setIban(e.target.value)} />
        </div>
        <div>
          <label className="label">BIC</label>
          <input className="input" placeholder="RLNWATWW" value={bic} onChange={e => setBic(e.target.value)} />
        </div>
      </div>
      <button onClick={save} className="btn-primary mt-4">
        {saved ? t('savedCheck') : t('save')}
      </button>
    </div>
  )
}
