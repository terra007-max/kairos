'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { Settings } from 'lucide-react'

export function WorkspaceNameSection({ workspaceId, initialName, onSaved }: {
  workspaceId: string
  initialName: string
  onSaved: () => void
}) {
  const { t } = useI18n()
  const supabase = createClient()
  const [name, setName] = useState(initialName)

  async function save() {
    await supabase.from('workspaces').update({ name }).eq('id', workspaceId)
    onSaved()
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">{t('workspace')}</h2>
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={save} className="btn-primary">{t('save')}</button>
      </div>
    </div>
  )
}
