'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2 } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/permissions'

type Message = { role: 'user' | 'assistant'; content: string }

function getSuggestions(role: WorkspaceRole | undefined, isProjectManager: boolean) {
  const canSeeTeam = can(role, 'review:all') || isProjectManager
  const canSeeAll  = can(role, 'review:all')

  const suggestions = [
    ...(canSeeTeam ? ['How many hours did the team log this week?'] : []),
    ...(canSeeTeam ? ['Which project has the most hours this month?'] : []),
    ...(canSeeAll  ? ['Who hasn\'t submitted their timesheet yet?'] : []),
    ...(canSeeTeam ? ['Show me project budget status'] : []),
    ...(canSeeAll  ? ['Show team utilization this month'] : []),
  ]
  return suggestions.slice(0, 4)
}

export default function AIChat() {
  const { workspaceId, role, isProjectManager, effectiveUserId, isProxying, proxyUser } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset chat when proxy user changes
  useEffect(() => { setMessages([]) }, [effectiveUserId])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const suggestions = getSuggestions(role, isProjectManager)

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          // When proxying, tell the API to answer from the proxied user's perspective
          proxyUserId: isProxying ? effectiveUserId : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Something went wrong.' }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Something went wrong.' }])
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'Could not reach the AI.'}` }])
    } finally {
      setLoading(false)
    }
  }

  const proxyLabel = isProxying && proxyUser ? `Viewing as ${proxyUser.name}` : null

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed right-4 z-50 w-12 h-12 rounded-full bg-brand-600 hover:bg-brand-700 text-white shadow-lg flex items-center justify-center transition-all"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
        aria-label="Open AI assistant"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
            height: 'min(480px, calc(100dvh - env(safe-area-inset-bottom, 0px) - env(safe-area-inset-top, 0px) - 160px))',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-brand-600 text-white">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">K</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-none">Kairos AI</p>
              <p className="text-[10px] text-white/70 mt-0.5 truncate">
                {proxyLabel ?? 'Ask anything about your data'}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground text-center pt-2">
                  {proxyLabel
                    ? `Answering questions from ${proxyUser?.name}'s perspective.`
                    : 'Ask me anything about hours, projects, or your team.'}
                </p>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-border flex gap-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              placeholder="Ask a question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              disabled={loading}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
