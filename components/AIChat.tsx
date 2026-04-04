'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/permissions'
import { useI18n } from '@/lib/i18n'

type Message = { role: 'user' | 'assistant'; content: string }

export default function AIChat() {
  const { workspaceId, role, isProjectManager, effectiveUserId, isProxying, proxyUser } = useWorkspace()
  const { t } = useI18n()
  const canSeeAll = can(role, 'review:all')
  const suggestions = [
    ...(canSeeAll                        ? [t('aiSuggest1')] : []),
    ...(canSeeAll                        ? [t('aiSuggest2')] : []),
    ...(canSeeAll || isProjectManager    ? [t('aiSuggest3')] : []),
    ...(canSeeAll                        ? [t('aiSuggest4')] : []),
  ].slice(0, 4)
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMessages([]) }, [effectiveUserId])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

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
          proxyUserId: isProxying ? effectiveUserId : undefined,
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.ok ? (data.reply || 'No response.') : (data.error || 'Something went wrong.'),
      }])
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e?.message || 'Could not reach the AI.'}` }])
    } finally {
      setLoading(false)
    }
  }

  const proxyLabel = isProxying && proxyUser ? `${t('aiViewingAs')} ${proxyUser.name}` : null

  return (
    <div className="card overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-brand-600/10 flex items-center justify-center shrink-0">
          <Sparkles size={15} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-none">{t('aiTitle')}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {proxyLabel ?? t('aiSubtitle')}
          </p>
        </div>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>

      {/* Expandable body */}
      {open && (
        <>
          {/* Messages */}
          <div className="border-t border-border px-4 py-3 space-y-3 overflow-y-auto" style={{ maxHeight: '380px' }}>
            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {proxyLabel
                    ? t('aiAnsweringAs').replace('{name}', proxyUser?.name ?? '')
                    : t('aiTryOne')}
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted text-foreground transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-brand-600/10 flex items-center justify-center shrink-0 mr-2 mt-0.5">
                    <Sparkles size={11} className="text-brand-600" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-muted text-foreground rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-brand-600/10 flex items-center justify-center shrink-0">
                  <Sparkles size={11} className="text-brand-600" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 size={13} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {messages.length > 0 && !loading && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('aiClear')}
              </button>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border px-3 py-2.5 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              placeholder={t('aiPlaceholder')}
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
        </>
      )}
    </div>
  )
}
