'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type WorkspaceRole } from '@/lib/permissions'

export type { WorkspaceRole } from '@/lib/permissions'

export type WorkspaceMember = {
  id: string
  user_id: string | null
  email: string
  role: WorkspaceRole
  status: 'active' | 'pending'
  full_name?: string | null
  level_id?: string | null
  weekly_hours: number
  isProjectManager?: boolean  // true if manager_id on any project
}

export type ProxyUser = { userId: string; name: string }

type WorkspaceCtx = {
  workspaceId: string
  workspaceName: string
  role: WorkspaceRole                // 'member' when proxying
  realRole: WorkspaceRole            // always the actual role
  members: WorkspaceMember[]
  reload: () => Promise<void>
  effectiveUserId: string            // proxy userId when proxying, else own userId
  isProxying: boolean
  proxyUser: ProxyUser | null
  startProxy: (u: ProxyUser) => void
  stopProxy: () => void
  managedProjectIds: string[]        // projects where current user is manager
  isProjectManager: boolean
}

const STORAGE_KEY = 'kairos-active-workspace'
const PROXY_KEY   = 'kairos-proxy-user'

const WorkspaceContext = createContext<WorkspaceCtx | null>(null)

function getStoredProxy(): ProxyUser | null {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(PROXY_KEY) || 'null') } catch { return null }
}

export function WorkspaceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const supabase = createClient()
  const [noWorkspace, setNoWorkspace] = useState(false)
  const [proxyUser, setProxyUser] = useState<ProxyUser | null>(getStoredProxy)
  const [base, setBase] = useState<{
    workspaceId: string
    workspaceName: string
    realRole: WorkspaceRole
    members: WorkspaceMember[]
    managedProjectIds: string[]
  } | null>(null)

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

    const [{ data: members }, { data: managedProjects }, { data: allProjects }] = await Promise.all([
      supabase
        .from('workspace_members')
        .select('id, user_id, email, role, status, level_id, weekly_hours, profile:profiles(full_name)')
        .eq('workspace_id', memberRow.workspace_id),
      supabase
        .from('projects')
        .select('id')
        .eq('workspace_id', memberRow.workspace_id)
        .eq('manager_id', userId)
        .is('deleted_at', null),
      supabase
        .from('projects')
        .select('manager_id')
        .eq('workspace_id', memberRow.workspace_id)
        .not('manager_id', 'is', null)
        .is('deleted_at', null),
    ])

    const projectManagerUserIds = new Set((allProjects || []).map((p: any) => p.manager_id))
    const role = memberRow.role as WorkspaceRole

    const ws = memberRow.workspace as any

    setBase({
      workspaceId: memberRow.workspace_id,
      workspaceName: ws?.name || 'My Workspace',
      realRole: role,
      managedProjectIds: (managedProjects || []).map((p: any) => p.id),
      members: (members || []).filter((m: any) => m.role !== 'admin').map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        email: m.email,
        role: m.role,
        status: m.status,
        full_name: m.profile?.full_name,
        level_id: m.level_id,
        weekly_hours: m.weekly_hours ?? 40,
        isProjectManager: m.user_id ? projectManagerUserIds.has(m.user_id) : false,
      })),
    })
  }, [supabase, userId])

  useEffect(() => { load() }, [load])

  // Derive full context from base + proxy state
  const ctx = useMemo<WorkspaceCtx | null>(() => {
    if (!base) return null
    const canProxy = base.realRole === 'admin'
    const validProxy = canProxy && proxyUser && base.members.some(m => m.user_id === proxyUser.userId)
    const effectiveProxy = validProxy ? proxyUser : null
    if (proxyUser && !validProxy) {
      localStorage.removeItem('kairos-proxy-user')
    }
    const managedProjectIds = effectiveProxy ? [] : base.managedProjectIds
    return {
      ...base,
      role: effectiveProxy ? 'member' : base.realRole,
      effectiveUserId: effectiveProxy?.userId ?? userId,
      isProxying: !!effectiveProxy,
      proxyUser: effectiveProxy,
      startProxy,
      stopProxy,
      reload: load,
      managedProjectIds,
      isProjectManager: managedProjectIds.length > 0 || base.realRole === 'project_manager',
    }
  }, [base, proxyUser, userId, startProxy, stopProxy, load])

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
