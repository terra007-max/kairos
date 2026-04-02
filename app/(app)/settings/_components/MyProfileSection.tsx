'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace, WORKSPACE_STORAGE_KEY } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { User } from 'lucide-react'

export function MyProfileSection() {
  const { t } = useI18n()
  const supabase = createClient()
  const { reload } = useWorkspace()

  const [workspaces, setWorkspaces] = useState<{ workspace_id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id, workspace:workspaces(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
      if (data?.length) {
        const rows = data.map((r: any) => ({ workspace_id: r.workspace_id, name: r.workspace?.name || r.workspace_id }))
        setWorkspaces(rows)
        const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY)
        const active = (saved ? rows.find(r => r.workspace_id === saved) : null) ?? rows[0]
        setSelectedId(active.workspace_id)
      }
    })
  }, [supabase])

  if (!workspaces.length) return null

  function save() {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, selectedId)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    reload()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <User className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('myProfile')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('selectWorkspaceHint')}</p>
      <div className="space-y-3">
        <div>
          <label className="label">{t('activeWorkspace')}</label>
          <select className="input" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
            {workspaces.map(w => (
              <option key={w.workspace_id} value={w.workspace_id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>
      <button onClick={save} className="btn-primary mt-4">
        {saved ? t('savedCheck') : t('save')}
      </button>
    </div>
  )
}
