'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { type ConsultantLevel } from '@/lib/types'
import { Settings, GripVertical, Trash2, Plus } from 'lucide-react'

export function ConsultantLevelsSection({ onChanged }: { onChanged: (levels: ConsultantLevel[]) => void }) {
  const { t } = useI18n()
  const supabase = createClient()
  const { workspaceId } = useWorkspace()

  const [levels, setLevels] = useState<ConsultantLevel[]>([])
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('consultant_levels')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('sort_order')
    const next = data || []
    setLevels(next)
    onChanged(next)
  }, [supabase, workspaceId, onChanged])

  useEffect(() => { load() }, [load])

  async function add() {
    if (!newName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('consultant_levels').insert({
      user_id: user.id,
      workspace_id: workspaceId,
      name: newName.trim(),
      sort_order: levels.length,
    })
    setNewName('')
    setSaving(false)
    load()
  }

  async function remove(id: string) {
    if (!confirm('Delete this level?')) return
    await supabase.from('consultant_levels').delete().eq('id', id)
    load()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('consultantLevels')}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t('consultantLevelsHint')}</p>

      {levels.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-4 italic">{t('noLevelsYet')}</p>
      ) : (
        <div className="space-y-2 mb-4">
          {levels.map((level, i) => (
            <div key={level.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group border border-transparent hover:border-border transition-colors">
              <GripVertical className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground flex-1">{level.name}</span>
              <span className="text-xs text-muted-foreground">Level {i + 1}</span>
              <button
                onClick={() => remove(level.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          placeholder={t('levelPlaceholder')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <button onClick={add} disabled={saving || !newName.trim()} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> {t('add')}
        </button>
      </div>
    </div>
  )
}
