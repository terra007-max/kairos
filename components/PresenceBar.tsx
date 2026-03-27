'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'

export default function PresenceBar() {
  const supabase = createClient()
  const { workspaceId, members, role } = useWorkspace()
  const [activeUsers, setActiveUsers] = useState<{ userId: string; projectName: string | null; elapsed: number }[]>([])
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('time_entries')
      .select('user_id, start_time, project:projects(name, color)')
      .eq('workspace_id', workspaceId)
      .is('end_time', null)

    setActiveUsers((data || []).map((d: any) => ({
      userId: d.user_id,
      projectName: d.project?.name || null,
      elapsed: Math.floor((Date.now() - new Date(d.start_time).getTime()) / 1000),
    })))
  }, [supabase, workspaceId])

  useEffect(() => {
    if (role !== 'admin') return

    load()

    const channel = supabase
      .channel(`presence-bar-${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'time_entries',
        filter: `workspace_id=eq.${workspaceId}`,
      }, () => { load() })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, role, load, supabase])

  // Tick elapsed locally every second
  useEffect(() => {
    if (activeUsers.length === 0) return
    const id = setInterval(() => {
      setActiveUsers(prev => prev.map(u => ({ ...u, elapsed: u.elapsed + 1 })))
    }, 1000)
    return () => clearInterval(id)
  }, [activeUsers.length])

  if (role !== 'admin' || activeUsers.length === 0) return null

  return (
    <div className="fixed top-4 right-5 z-50 flex items-center gap-1.5">
      <span className="text-xs text-gray-400 mr-1 hidden sm:block">Now tracking:</span>

      <div className="flex items-center">
        {activeUsers.map((u, i) => {
          const member = members.find(m => m.user_id === u.userId)
          const name = member?.full_name || member?.email || '?'
          const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
          const h = Math.floor(u.elapsed / 3600)
          const m2 = Math.floor((u.elapsed % 3600) / 60)
          const s = u.elapsed % 60
          const timeStr = `${String(h).padStart(2,'0')}:${String(m2).padStart(2,'0')}:${String(s).padStart(2,'0')}`

          const colors = [
            'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
            'bg-pink-500', 'bg-cyan-500', 'bg-orange-500'
          ]
          const color = colors[i % colors.length]

          return (
            <div
              key={u.userId}
              className="relative"
              style={{ marginLeft: i > 0 ? '-8px' : '0', zIndex: activeUsers.length - i }}
              onMouseEnter={() => setHoveredId(u.userId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className={`w-8 h-8 rounded-full ${color} border-2 border-white flex items-center justify-center text-white text-xs font-bold cursor-default shadow-sm`}>
                {initials}
              </div>

              <span className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ backgroundColor: 'currentColor' }} />

              {hoveredId === u.userId && (
                <div className="absolute top-10 right-0 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg z-50 min-w-max">
                  <p className="font-semibold">{name}</p>
                  {u.projectName && <p className="text-gray-400 mt-0.5">📁 {u.projectName}</p>}
                  <p className="text-gray-400 mt-0.5 font-mono">⏱ {timeStr}</p>
                  <div className="absolute -top-1 right-3 w-2 h-2 bg-gray-900 rotate-45" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
