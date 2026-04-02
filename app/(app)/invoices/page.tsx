'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { type Client } from '@/lib/types'
import { type SavedInvoice, type WorkspaceLegal } from './_lib/types'
import { InvoiceGenerator } from './_components/InvoiceGenerator'
import { InvoiceHistory }   from './_components/InvoiceHistory'

type Profile = { id: string; full_name: string | null; email: string | null }

export default function InvoicesPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const router = useRouter()
  const { t } = useI18n()

  const [clients, setClients] = useState<Client[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceLegal | null>(null)
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoice[]>([])
  const [activeTab, setActiveTab] = useState<'generate' | 'history'>('generate')

  useEffect(() => {
    if (!can(role, 'manage:invoices')) router.push('/dashboard')
  }, [role, router])

  const load = useCallback(async () => {
    if (!workspaceId || !can(role, 'manage:invoices')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const [{ data: cl }, { data: prof }, { data: ws }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single(),
      supabase.from('workspaces').select('legal_name, address_street, address_city, address_zip, address_country, vat_id, iban, bic').eq('id', workspaceId).single(),
    ])
    setClients(cl || [])
    setProfile(prof ?? { id: user.id, full_name: user.email ?? null, email: user.email ?? null })
    setWorkspace(ws ?? null)
    const { data: inv } = await supabase.from('invoices').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setSavedInvoices((inv as SavedInvoice[]) || [])
  }, [supabase, workspaceId, role])

  useEffect(() => { load() }, [load])

  if (!can(role, 'manage:invoices')) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('invoicesTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('invoicesSubtitle')}</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6 w-fit print:hidden">
        {(['generate', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}>
            {tab === 'generate' ? t('generateInvoice') : t('savedInvoices')}
            {tab === 'history' && savedInvoices.length > 0 && (
              <span className="ml-2 bg-brand-600/10 text-brand-600 text-xs px-1.5 py-0.5 rounded-full">{savedInvoices.length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'generate' && (
        <InvoiceGenerator
          clients={clients}
          workspace={workspace}
          profile={profile}
          onSaved={inv => { setSavedInvoices(prev => [inv, ...prev]); setActiveTab('history') }}
        />
      )}

      {activeTab === 'history' && (
        <InvoiceHistory invoices={savedInvoices} onUpdate={setSavedInvoices} />
      )}

      <style>{`@media print { nav, aside, .print\\:hidden { display: none !important; } #invoice-preview { box-shadow: none; border: none; } }`}</style>
    </div>
  )
}
