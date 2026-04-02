'use client'
import { useState, useEffect, useCallback } from 'react'
import { useWorkspace } from '@/lib/workspace-context'
import { UserPlus } from 'lucide-react'

export function UnassignedUsersSection({ onAdded }: { onAdded: () => void }) {
  const { workspaceId } = useWorkspace()
  const [users, setUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([])
  const [addingId, setAddingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/users?workspaceId=${workspaceId}`)
    if (res.ok) {
      const json = await res.json()
      setUsers(json.users || [])
    }
  }, [workspaceId])

  useEffect(() => { load() }, [load])

  async function add(u: { id: string; email: string; full_name: string | null }) {
    setAddingId(u.id)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, userId: u.id, email: u.email }),
    })
    setAddingId(null)
    if (res.ok) {
      setUsers(prev => prev.filter(x => x.id !== u.id))
      onAdded()
    } else {
      const err = await res.json()
      alert(err.error || 'Failed to add user')
    }
  }

  if (!users.length) return null

  return (
    <div className="card p-6 border border-amber-500/20">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="w-4 h-4 text-amber-500" />
        <h2 className="font-semibold text-foreground text-sm">Users not in this workspace</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">These accounts exist but are not assigned to your workspace yet.</p>
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-transparent">
            <div className="w-7 h-7 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 text-xs font-bold shrink-0">
              {(u.full_name || u.email)[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{u.full_name || u.email}</p>
              {u.full_name && <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>}
            </div>
            <button
              onClick={() => add(u)}
              disabled={addingId === u.id}
              className="btn-primary text-xs py-1 px-3 shrink-0"
            >
              {addingId === u.id ? 'Adding…' : 'Add to workspace'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
