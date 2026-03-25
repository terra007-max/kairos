'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Sidebar from '@/components/Sidebar'
import MobileNav from '@/components/MobileNav'
import PresenceBar from '@/components/PresenceBar'
import { WorkspaceProvider } from '@/lib/workspace-context'
import { I18nProvider } from '@/lib/i18n'
import { Menu, X } from 'lucide-react'

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
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, email').eq('id', user.id).single()
      setUser({ id: user.id, name: profile?.full_name || profile?.email || 'You' })
    })

    return () => window.removeEventListener('resize', checkMobile)
  }, [router])

  if (!user) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '32px', height: '32px', border: '2px solid #0ea5e9', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: '12px', color: '#9ca3af' }}>Loading…</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <I18nProvider>
      <WorkspaceProvider userId={user.id}>
        <div style={{ display: 'flex', height: '100dvh', backgroundColor: '#f9fafb', overflow: 'hidden', position: 'relative' }}>

          {/* Desktop sidebar */}
          {!isMobile && <Sidebar userName={user.name} />}

          {/* Mobile sidebar overlay */}
          {isMobile && sidebarOpen && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setSidebarOpen(false)}
                style={{
                  position: 'fixed', inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  zIndex: 40,
                  backdropFilter: 'blur(2px)',
                }}
              />
              {/* Sidebar drawer */}
              <div style={{
                position: 'fixed', top: 0, left: 0, bottom: 0,
                width: '240px',
                zIndex: 50,
                animation: 'slideIn 0.2s ease-out',
              }}>
                <Sidebar userName={user.name} onClose={() => setSidebarOpen(false)} />
              </div>
            </>
          )}

          {/* Main content */}
          <main style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            marginLeft: isMobile ? '0' : '224px',
            paddingBottom: isMobile ? '80px' : '0',
            width: isMobile ? '100%' : 'calc(100% - 224px)',
          }}>
            {/* Mobile top bar */}
            {isMobile && (
              <div style={{
                position: 'sticky', top: 0, zIndex: 30,
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px',
                backgroundColor: 'white',
                borderBottom: '1px solid #f3f4f6',
              }}>
                <button
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '36px', height: '36px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                  }}
                >
                  <Menu size={18} color="#6b7280" />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ backgroundColor: '#0284c7', borderRadius: '8px', padding: '4px', display: 'flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '700', color: '#111827' }}>Kairos</span>
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