'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FolderOpen, Users, LogOut, Timer, Settings, FileText, User, Scale, ClipboardList, LineChart, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'
import { useEffect, useState } from 'react'
import { formatDuration } from '@/lib/types'
import KairosIcon from '@/components/KairosIcon'

export default function Sidebar({ userName, avatarUrl, onClose }: { userName: string; avatarUrl?: string | null; onClose?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { workspaceName, role, isProjectManager } = useWorkspace()
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
    { href: '/dashboard',   label: t('dashboard'),    icon: LayoutDashboard, show: true },
    { href: '/timer',       label: t('timer'),         icon: Timer,           show: true },
    { href: '/projects',    label: t('projects'),      icon: FolderOpen,      show: true },
    { href: '/clients',     label: t('clients'),       icon: Users,           show: can(role, 'manage:clients') },
    { href: '/timesheets',  label: t('timesheets'),    icon: ClipboardList,   show: true },
    { href: '/invoices',    label: t('invoices'),      icon: FileText,        show: can(role, 'manage:invoices') },
    { href: '/analytics',   label: 'Analytics',        icon: LineChart,       show: can(role, 'view:analytics') || isProjectManager },
    { href: '/absence',     label: 'Absences',         icon: CalendarDays,    show: can(role, 'view:analytics') || isProjectManager },
    { href: '/settings',    label: t('settings'),      icon: Settings,        show: true },
    { href: '/impressum',   label: t('legalNotice'),   icon: Scale,           show: true },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-card border-r border-border flex flex-col z-30">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="Kairos" className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <span className="text-sm font-bold text-foreground tracking-tight block leading-tight">Kairos</span>
            <span className="text-xs text-muted-foreground truncate block max-w-[140px] leading-tight">{workspaceName}</span>
          </div>
        </div>
      </div>

      {/* Running timer */}
      {runningEntry && (
        <Link href="/timer" onClick={onClose} className="mx-2 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 hover:bg-red-500/15 transition-colors">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs font-medium text-red-500 flex-1">{t('timerRunning')}</span>
          <span className="text-xs font-mono text-red-500 tabular-nums">{formatDuration(elapsed)}</span>
        </Link>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV.filter(item => item.show).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                active
                  ? 'bg-brand-600/10 text-brand-600 dark:bg-brand-600/15 dark:text-brand-500'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-brand-600 dark:text-brand-500' : 'text-muted-foreground'}`} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-2 py-3 border-t border-border">
        <Link
          href="/profile"
          onClick={onClose}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 hover:bg-muted/60 transition-colors ${pathname === '/profile' ? 'bg-brand-600/10' : ''}`}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={userName} className="w-7 h-7 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 dark:text-brand-500 text-xs font-bold shrink-0">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate leading-tight">{userName}</p>
            <p className="text-xs text-muted-foreground leading-tight">
              {role === 'admin' ? 'Admin' : role === 'partner' ? 'Partner' : isProjectManager ? 'Project Manager' : 'Member'}
            </p>
          </div>
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all duration-150"
        >
          <LogOut className="w-4 h-4" />
          {t('signOut')}
        </button>
      </div>
      <style>{`
        @keyframes sbHour { to { transform: rotate(360deg); } }
        @keyframes sbMin  { to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  )
}
