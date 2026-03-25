'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type Client } from '@/lib/types'
import { Users, Plus, Pencil, Trash2 } from 'lucide-react'

const COLORS = ['#6366f1','#f97316','#10b981','#ef4444','#3b82f6','#f59e0b','#8b5cf6','#ec4899']

export default function ClientsPage() {
  const supabase = createClient()
  const { workspaceId, role } = useWorkspace()
  const { t } = useI18n()
  const isAdmin = role === 'admin'
  const [clients, setClients] = useState<(Client & { projectCount: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) return
    const [{ data: cl }, { data: proj }] = await Promise.all([
      supabase.from('clients').select('*').eq('workspace_id', workspaceId).order('name'),
      supabase.from('projects').select('id, client_id').eq('workspace_id', workspaceId),
    ])
    const countMap: Record<string, number> = {}
    for (const p of proj || []) { if (p.client_id) countMap[p.client_id] = (countMap[p.client_id] || 0) + 1 }
    setClients((cl || []).map(c => ({ ...c, projectCount: countMap[c.id] || 0 })))
    setLoading(false)
  }, [supabase, workspaceId])

  useEffect(() => { load() }, [load])

  async function remove(id: string) {
    if (!isAdmin) return
    if (!confirm('Delete this client?')) return
    await supabase.from('clients').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('clientsTitle')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isAdmin ? t('manageClients') : t('viewClients')}</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditClient(null); setShowForm(true) }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {t('newClient')}
          </button>
        )}
      </div>

      {isAdmin && (showForm || editClient) && (
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
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: c.color }}>
                    {c.name[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{c.name}</h3>
                    {c.email && <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditClient(c); setShowForm(false) }} className="p-1.5 rounded hover:bg-muted text-muted-foreground/50 hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground/50 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
  const [name, setName] = useState(client?.name || '')
  const [email, setEmail] = useState(client?.email || '')
  const [color, setColor] = useState(client?.color || COLORS[0])
  const [notes, setNotes] = useState(client?.notes || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const payload = { name: name.trim(), email: email || null, color, notes: notes || null }
    if (client) {
      await supabase.from('clients').update(payload).eq('id', client.id)
    } else {
      await supabase.from('clients').insert({ ...payload, user_id: user.id, workspace_id: workspaceId })
    }
    setSaving(false); onSave()
  }

  return (
    <div className="card p-6 mb-6">
      <h2 className="font-semibold text-foreground mb-5 text-sm">{client ? t('editClient') : t('newClient')}</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className="label">{t('clientName')}</label><input className="input" placeholder="Acme Corp" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div><label className="label">{t('email')}</label><input type="email" className="input" placeholder="contact@acme.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div>
          <label className="label">{t('color')}</label>
          <div className="flex items-center gap-2 mt-1">
            {COLORS.map(c => <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-1 ring-border' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />)}
          </div>
        </div>
        <div><label className="label">{t('notes')}</label><input className="input" placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || !name.trim()} className="btn-primary">{saving ? t('saving') : client ? t('saveChanges') : t('createClient')}</button>
        <button onClick={onCancel} className="btn-secondary">{t('cancel')}</button>
      </div>
    </div>
  )
}
