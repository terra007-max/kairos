'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Clock, LayoutDashboard, FolderOpen, Users, BarChart2, LogOut, Timer, Settings, FileText, User, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { useI18n } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { formatDuration } from '@/lib/types'

export default function Sidebar({ userName, onClose }: { userName: string; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { workspaceName, role } = useWorkspace()
  const { t } = useI18n()
  const [runningEntry, setRunningEntry] = useState<{ start_time: string } | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    async function checkTimer() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('time_entries')
        .select('start_time')
        .eq('user_id', user.id)
        .is('end_time', null)
        .maybeSingle()
      setRunningEntry(data)
      if (data) setElapsed(Math.floor((Date.now() - new Date(data.start_time).getTime()) / 1000))
    }
    checkTimer()
    const interval = setInterval(checkTimer, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!runningEntry) return
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [runningEntry])

  const NAV = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard, adminOnly: false },
    { href: '/timer',     label: t('timer'),     icon: Timer,           adminOnly: false },
    { href: '/projects',  label: t('projects'),  icon: FolderOpen,      adminOnly: false },
    { href: '/clients',   label: t('clients'),   icon: Users,           adminOnly: false },
    { href: '/invoices',  label: t('invoices'),  icon: FileText,        adminOnly: true  },
    { href: '/reports',   label: t('reports'),   icon: BarChart2,       adminOnly: false },
    { href: '/settings',  label: t('settings'),  icon: Settings,        adminOnly: false },
    { href: '/impressum', label: 'Impressum',    icon: Scale,           adminOnly: false },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside style={{ width: '224px' }} className="fixed inset-y-0 left-0 bg-white border-r border-gray-100 flex flex-col z-30">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="bg-brand-600 p-1.5 rounded-lg shadow-sm flex-shrink-0">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold text-gray-900 tracking-tight block leading-tight">Kairos</span>
            <span className="text-xs text-gray-400 truncate block max-w-[140px] leading-tight">{workspaceName}</span>
          </div>
        </div>
      </div>

      {/* Running timer */}
      {runningEntry && (
        <Link href="/timer" onClick={onClose} className="mx-2 mt-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 hover:bg-red-100 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-xs font-medium text-red-600 flex-1">{t('timerRunning')}</span>
          <span className="text-xs font-mono text-red-500 tabular-nums">{formatDuration(elapsed)}</span>
        </Link>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.filter(item => !item.adminOnly || role === 'admin').map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-2 py-3 border-t border-gray-100">
        <Link
          href="/profile"
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 hover:bg-gray-50 transition-colors ${pathname === '/profile' ? 'bg-brand-50' : ''}`}
        >
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate leading-tight">{userName}</p>
            <p className="text-xs text-gray-400 capitalize leading-tight">{role}</p>
          </div>
          <User className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          {t('signOut')}
        </button>
      </div>
    </aside>
  )
}
