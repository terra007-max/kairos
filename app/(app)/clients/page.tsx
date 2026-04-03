'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { type Client } from '@/lib/types'
import { Users, Plus, Pencil, Trash2, Upload, X } from 'lucide-react'
import { ClientAvatar } from '@/components/ClientAvatar'
import KairosLoader from '@/components/KairosLoader'

const COLORS = ['#6366f1','#f97316','#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#ec4899']

export default function ClientsPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const { t } = useI18n()
  const canManageClients = can(role, 'manage:clients')

  const [clients, setClients] = useState<(Client & { projectCount: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    const [{ data: cl }, { data: proj }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
      supabase.from('projects').select('id, client_id').eq('workspace_id', workspaceId),
    ])
    const countMap: Record<string, number> = {}
    for (const p of proj || []) { if (p.client_id) countMap[p.client_id] = (countMap[p.client_id] || 0) + 1 }
    setClients((cl || []).map(c => ({ ...c, projectCount: countMap[c.id] || 0 })))
    setLoading(false)
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  async function remove(id: string, logoUrl: string | null) {
    if (!canManageClients) return
    if (!confirm('Delete this client?')) return
    if (logoUrl) {
      const path = logoUrl.split('/client-logos/')[1]
      if (path) await supabase.storage.from('client-logos').remove([decodeURIComponent(path)])
    }
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  if (role === 'member') return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-muted-foreground">Access restricted to admins.</p>
    </div>
  )

  if (loading) return <KairosLoader size="sm" />

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('clientsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{canManageClients ? t('manageClients') : t('viewClients')}</p>
        </div>
        {canManageClients && (
          <button onClick={() => { setEditClient(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('newClient')}
          </button>
        )}
      </div>

      {canManageClients && (showForm || editClient) && (
        <ClientForm workspaceId={workspaceId} client={editClient}
          onSave={() => { setShowForm(false); setEditClient(null); load() }}
          onCancel={() => { setShowForm(false); setEditClient(null) }} />
      )}

      {clients.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t('noClients')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map(c => (
            <div key={c.id} className="card p-5 group hover:shadow-card-hover transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <ClientAvatar client={c} size={36} />
                  <div>
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {c.email && <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>}
                  </div>
                </div>
                {canManageClients && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditClient(c); setShowForm(false) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(c.id, c.logo_url)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">{c.projectCount} {t('projects').toLowerCase()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


function ClientForm({ workspaceId, client, onSave, onCancel }: { workspaceId: string; client: Client | null; onSave: () => void; onCancel: () => void }) {
  const supabase = createClient()
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(client?.name || '')
  const [email, setEmail] = useState(client?.email || '')
  const [color, setColor] = useState(client?.color || COLORS[0])
  const [notes, setNotes] = useState(client?.notes || '')
  const [logoUrl, setLogoUrl] = useState<string | null>(client?.logo_url || null)
  const [logoMode, setLogoMode] = useState<'color' | 'logo'>(client?.logo_url ? 'logo' : 'color')
  const [addressStreet, setAddressStreet] = useState(client?.address_street || '')
  const [addressCity, setAddressCity] = useState(client?.address_city || '')
  const [addressZip, setAddressZip] = useState(client?.address_zip || '')
  const [addressCountry, setAddressCountry] = useState(client?.address_country || 'AT')
  const [vatId, setVatId] = useState(client?.vat_id || '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 2 * 1024 * 1024) { alert('Max 2 MB'); return }
    setUploading(true)
    const clientId = client?.id || crypto.randomUUID()
    const ext = file.name.split('.').pop() || 'png'
    const path = `${workspaceId}/${clientId}.${ext}`
    const { error } = await supabase.storage.from('client-logos').upload(path, file, { upsert: true })
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('client-logos').getPublicUrl(path)
      setLogoUrl(publicUrl)
    }
    setUploading(false)
  }

  function removeLogo() {
    setLogoUrl(null)
    setLogoMode('color')
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = {
      name: name.trim(),
      email: email || null,
      color,
      logo_url: logoMode === 'logo' ? logoUrl : null,
      notes: notes || null,
      address_street: addressStreet || null,
      address_city: addressCity || null,
      address_zip: addressZip || null,
      address_country: addressCountry || 'AT',
      vat_id: vatId || null,
    }
    let error: any
    if (client) {
      ({ error } = await supabase.from('clients').update(payload).eq('id', client.id))
    } else {
      ({ error } = await supabase.from('clients').insert({ ...payload, user_id: user.id, workspace_id: workspaceId }))
    }
    setSaving(false)
    if (error) { alert(`Error saving client: ${error.message}`); return }
    onSave()
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="font-semibold text-foreground mb-5 text-sm">{client ? t('editClient') : t('newClient')}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className="label">{t('clientName')}</label><input className="input" placeholder="Acme Corp" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div><label className="label">{t('email')}</label><input type="email" className="input" placeholder="contact@acme.com" value={email} onChange={e => setEmail(e.target.value)} /></div>

        <div className="col-span-2">
          <label className="label mb-1">Icon</label>
          {/* Tab toggle */}
          <div className="flex gap-1 mb-3 bg-muted/50 p-1 rounded-lg w-fit">
            <button type="button" onClick={() => setLogoMode('color')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${logoMode === 'color' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Color</button>
            <button type="button" onClick={() => setLogoMode('logo')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${logoMode === 'logo' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>Logo</button>
          </div>

          {logoMode === 'color' ? (
            <div className="flex items-center gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-border' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <>
                  <img src={logoUrl} alt="logo" className="w-12 h-12 rounded-xl object-cover border border-border" />
                  <button type="button" onClick={removeLogo} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <Upload className="w-3.5 h-3.5" /> Replace
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-brand-600/50 hover:bg-brand-600/5 transition-colors text-sm text-muted-foreground hover:text-foreground"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading…' : 'Upload logo'}
                  <span className="text-xs opacity-50">PNG, JPG, SVG · max 2 MB</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
            </div>
          )}
        </div>

        {/* Billing address */}
        <div className="col-span-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">Rechnungsadresse (EN 16931)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Straße &amp; Nr.</label>
              <input className="input" placeholder="Musterstraße 1" value={addressStreet} onChange={e => setAddressStreet(e.target.value)} />
            </div>
            <div>
              <label className="label">PLZ</label>
              <input className="input" placeholder="1010" value={addressZip} onChange={e => setAddressZip(e.target.value)} />
            </div>
            <div>
              <label className="label">Ort</label>
              <input className="input" placeholder="Wien" value={addressCity} onChange={e => setAddressCity(e.target.value)} />
            </div>
            <div>
              <label className="label">Land (ISO)</label>
              <select className="input" value={addressCountry} onChange={e => setAddressCountry(e.target.value)}>
                <option value="AT">AT — Österreich</option>
                <option value="DE">DE — Deutschland</option>
                <option value="CH">CH — Schweiz</option>
                <option value="US">US — United States</option>
              </select>
            </div>
            <div>
              <label className="label">UID-Nummer (optional)</label>
              <input className="input" placeholder="ATU12345678" value={vatId} onChange={e => setVatId(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="col-span-2"><label className="label">{t('notes')}</label><input className="input" placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || uploading || !name.trim()} className="btn-primary">{saving ? t('saving') : client ? t('saveChanges') : t('createClient')}</button>
        <button onClick={onCancel} className="btn-secondary">{t('cancel')}</button>
      </div>
    </div>
  )
}
