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
import KairosIcon from '@/components/KairosIcon'
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
        <div className="flex bg-background overflow-hidden relative h-dvh">

          {/* Desktop sidebar */}
          {!isMobile && <Sidebar userName={user.name} avatarUrl={user.avatarUrl} />}

          {/* Mobile sidebar overlay */}
          {isMobile && sidebarOpen && (
            <>
              <div
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              />
              <div className="fixed top-0 left-0 bottom-0 z-50 w-60 [animation:slideIn_0.2s_ease-out]">
                <Sidebar userName={user.name} avatarUrl={user.avatarUrl} onClose={() => setSidebarOpen(false)} />
              </div>
            </>
          )}

          {/* Main content */}
          <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isMobile ? 'ml-0 pb-20 w-full' : 'ml-56 pb-0 w-[calc(100%-224px)]'}`}>
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
                    <KairosIcon size={14} />
                  </div>
                  <span className="text-sm font-bold text-foreground">Kairos</span>
                </div>
              </div>
            )}

            {!isMobile && <PresenceBar />}
            <ProxyBanner />

            <div className={`max-w-[900px] mx-auto ${isMobile ? 'px-4 pt-4 pb-6' : 'p-6'}`}>
              {children}
            </div>
          </main>

          {/* Bottom nav — mobile only */}
          {isMobile && <MobileNav />}
        </div>

      </WorkspaceProvider>
    </I18nProvider>
  )
}
