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

type ProxyUser = { userId: string; name: string }

type WorkspaceCtx = {
  workspaceId: string
  workspaceName: string
  role: 'admin' | 'member'
  members: WorkspaceMember[]
  reload: () => Promise<void>
  // Proxy
  effectiveUserId: string
  isProxying: boolean
  proxyUser: ProxyUser | null
  startProxy: (u: ProxyUser) => void
  stopProxy: () => void
}

const STORAGE_KEY = 'kairos-active-workspace'
const PROXY_KEY   = 'kairos-proxy-user'

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

export function WorkspaceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const supabase = createClient()
  const [ctx, setCtx] = useState<WorkspaceCtx | null>(null)
  const [noWorkspace, setNoWorkspace] = useState(false)
  const [proxyUser, setProxyUser] = useState<ProxyUser | null>(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem(PROXY_KEY) || 'null') } catch { return null }
  })

  const startProxy = useCallback((u: ProxyUser) => {
    localStorage.setItem(PROXY_KEY, JSON.stringify(u))
    setProxyUser(u)
  }, [])

  const stopProxy = useCallback(() => {
    localStorage.removeItem(PROXY_KEY)
    setProxyUser(null)
  }, [])

  const load = useCallback(async () => {
    const { data: memberRows } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspace:workspaces(name)')
      .eq('user_id', userId)
      .eq('status', 'active')

    if (!memberRows?.length) { setNoWorkspace(true); return }

    const memberRow = memberRows[0]

    const { data: members } = await supabase
      .from('workspace_members')
      .select('id, user_id, email, role, status, level_id, profile:profiles(full_name)')
      .eq('workspace_id', memberRow.workspace_id)

    const ws = memberRow.workspace as any
    const realRole = memberRow.role as 'admin' | 'member'

    setCtx(prev => ({
      workspaceId: memberRow.workspace_id,
      workspaceName: ws?.name || 'My Workspace',
      role: realRole,
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
      effectiveUserId: prev?.proxyUser?.userId ?? userId,
      isProxying: !!(prev?.proxyUser),
      proxyUser: prev?.proxyUser ?? null,
      startProxy,
      stopProxy,
    }))
  }, [supabase, userId, startProxy, stopProxy])

  useEffect(() => { load() }, [load])

  // Re-compute effectiveUserId / role when proxy changes
  useEffect(() => {
    if (!ctx) return
    setCtx(prev => prev ? {
      ...prev,
      effectiveUserId: proxyUser?.userId ?? userId,
      isProxying: !!proxyUser,
      proxyUser,
      // When proxying, appear as member
      role: proxyUser ? 'member' : prev.role,
    } : prev)
  }, [proxyUser, userId])

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

export { STORAGE_KEY as WORKSPACE_STORAGE_KEY }
