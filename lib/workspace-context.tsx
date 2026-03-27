'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type WorkspaceMember = {
  id: string
  user_id: string | null
  email: string
  role: 'admin' | 'member'
  status: 'active' | 'pending'
  full_name?: string | null
  level_id?: string | null
}

type WorkspaceCtx = {
  workspaceId: string
  workspaceName: string
  role: 'admin' | 'member'
  members: WorkspaceMember[]
  reload: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const supabase = createClient()
  const [ctx, setCtx] = useState<WorkspaceCtx | null>(null)
  const [noWorkspace, setNoWorkspace] = useState(false)

  const load = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspace:workspaces(name)')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (!memberRows?.length) { setNoWorkspace(true); return }

    // Prefer workspaces where the user is a member (admin-assigned),
    // fall back to admin role (their own auto-created workspace)
    const memberRow = memberRows.find(r => r.role === 'member') || memberRows[0]

    const { data: members } = await supabase
      .from('workspace_members')
      .select('id, user_id, email, role, status, level_id, profile:profiles(full_name)')
      .eq('workspace_id', memberRow.workspace_id)

    const ws = memberRow.workspace as any

    setCtx({
      workspaceId: memberRow.workspace_id,
      workspaceName: ws?.name || 'My Workspace',
      role: memberRow.role as 'admin' | 'member',
      members: (members || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        email: m.email,
        role: m.role,
        status: m.status,
        full_name: m.profile?.full_name,
        level_id: m.level_id,
      })),
      reload: load,
    })
  }, [supabase, userId])

  useEffect(() => { load() }, [load])

  if (noWorkspace) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="card p-8 max-w-sm w-full text-center space-y-4">
        <p className="text-sm font-semibold text-foreground">Waiting for workspace access</p>
        <p className="text-xs text-muted-foreground">Your account has been created but hasn't been assigned to a workspace yet. Please ask your admin to add you in Settings → Team members.</p>
        <button onClick={async () => { const s = createClient(); await s.auth.signOut(); window.location.href = '/login' }} className="btn-secondary w-full">Sign out</button>
      </div>
    </div>
  )

  if (!ctx) return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return <WorkspaceContext.Provider value={ctx}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}