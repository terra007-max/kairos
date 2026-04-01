'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import PresenceBar from '@/components/PresenceBar'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { I18nProvider } from '@/lib/i18n'
import ProxyBanner from '@/components/ProxyBanner'
import KairosLoader from '@/components/KairosLoader'
import { Menu } from 'lucide-react'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null)
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
        .from('profiles').select('full_name, email, avatar_url').eq('id', user.id).single()
      setUser({ id: user.id, name: profile?.full_name || profile?.email || 'You', avatarUrl: profile?.avatar_url || null })
    })

    const handleProfileUpdate = (e: Event) => {
      const { name, avatarUrl } = (e as CustomEvent).detail
      setUser(prev => prev ? { ...prev, name: name ?? prev.name, avatarUrl: avatarUrl ?? prev.avatarUrl } : prev)
    }
    window.addEventListener('profile-updated', handleProfileUpdate)

    return () => {
      window.removeEventListener('resize', checkMobile)
      window.removeEventListener('profile-updated', handleProfileUpdate)
    }
  }, [router])

  if (!user) return <KairosLoader />

  return (
    <I18nProvider>
      <WorkspaceProvider userId={user.id}>
        <div className="flex bg-background overflow-hidden relative" style={{ height: '100dvh' }}>

          {/* Desktop sidebar */}
          {!isMobile && <Sidebar userName={user.name} avatarUrl={user.avatarUrl} />}

          {/* Mobile sidebar overlay */}
          {isMobile && sidebarOpen && (
            <>
              <div
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              />
              <div className="fixed top-0 left-0 bottom-0 z-50" style={{ width: '240px', animation: 'slideIn 0.2s ease-out' }}>
                <Sidebar userName={user.name} avatarUrl={user.avatarUrl} onClose={() => setSidebarOpen(false)} />
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
                    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                      <line x1="12" y1="12" x2="12" y2="7.5" stroke="white" strokeWidth="2" strokeLinecap="round"
                        style={{ transformBox: 'fill-box' as never, transformOrigin: 'center', animation: 'sbHour 12s linear infinite' }} />
                      <line x1="12" y1="12" x2="12" y2="5" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeLinecap="round"
                        style={{ transformBox: 'fill-box' as never, transformOrigin: 'center', animation: 'sbMin 2s linear infinite' }} />
                      <circle cx="12" cy="12" r="1.5" fill="white" />
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-foreground">Kairos</span>
                </div>
              </div>
            )}

            {!isMobile && <PresenceBar />}
            <ProxyBanner />

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
          @keyframes slideIn { from { transform: translateX(-100%); } to { transform: translateX(0); } }
          @keyframes sbHour  { to { transform: rotate(360deg); } }
          @keyframes sbMin   { to { transform: rotate(360deg); } }
        `}</style>
      </WorkspaceProvider>
    </I18nProvider>
  )
}
