'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import PresenceBar from '@/components/PresenceBar'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { I18nProvider } from '@/lib/i18n'
import { Menu } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; name: string } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user }, error }) => {
      if (error || !user) {
        await supabase.auth.signOut()
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, email').eq('id', user.id).single()
      setUser({ id: user.id, name: profile?.full_name || profile?.email || 'You' })
    })

    return () => window.removeEventListener('resize', checkMobile)
  }, [router])

  if (!user) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </div>
  )

  return (
    <I18nProvider>
      <WorkspaceProvider userId={user.id}>
        <div className="flex bg-background overflow-hidden relative" style={{ height: '100dvh' }}>

          {/* Desktop sidebar */}
          {!isMobile && <Sidebar userName={user.name} />}

          {/* Mobile sidebar overlay */}
          {isMobile && sidebarOpen && (
            <>
              <div
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              />
              <div className="fixed top-0 left-0 bottom-0 z-50" style={{ width: '240px', animation: 'slideIn 0.2s ease-out' }}>
                <Sidebar userName={user.name} onClose={() => setSidebarOpen(false)} />
              </div>
            </>
          )}

          {/* Main content */}
          <main
            className="flex-1 overflow-y-auto overflow-x-hidden"
            style={{
              marginLeft: isMobile ? '0' : '224px',
              paddingBottom: isMobile ? '80px' : '0',
              width: isMobile ? '100%' : 'calc(100% - 224px)',
            }}
          >
            {/* Mobile top bar */}
            {isMobile && (
              <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                >
                  <Menu size={18} className="text-muted-foreground" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="bg-brand-600 rounded-lg p-1 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-foreground">Kairos</span>
                </div>
              </div>
            )}

            {!isMobile && <PresenceBar />}

            <div style={{
              maxWidth: '900px',
              margin: '0 auto',
              padding: isMobile ? '16px 16px 24px' : '24px',
            }}>
              {children}
            </div>
          </main>

          {/* Bottom nav — mobile only */}
          {isMobile && <MobileNav />}
        </div>

        <style>{`
          @keyframes slideIn {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </WorkspaceProvider>
    </I18nProvider>
  )
}
