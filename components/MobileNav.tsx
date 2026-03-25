'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Timer, FolderOpen, BarChart2, Settings } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function MobileNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  const NAV = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/timer',     label: t('timer'),     icon: Timer },
    { href: '/projects',  label: t('projects'),  icon: FolderOpen },
    { href: '/reports',   label: t('reports'),   icon: BarChart2 },
    { href: '/settings',  label: t('settings'),  icon: Settings },
  ]

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 z-40 md:hidden"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="flex items-center justify-around px-2 pt-2">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all min-w-[56px] ${
                active ? 'text-brand-600' : 'text-gray-400'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-brand-600' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-medium leading-tight ${active ? 'text-brand-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
