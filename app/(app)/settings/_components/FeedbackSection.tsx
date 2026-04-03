'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useWorkspace } from '@/lib/workspace-context'
import { can } from '@/lib/permissions'
import { format } from 'date-fns'
import {
  MessageSquarePlus, CheckCircle2, XCircle, Clock, Trash2,
  Pencil, MessageSquare, ChevronDown, ChevronUp, Send,
} from 'lucide-react'

type Feedback = {
  id: string
  user_id: string
  user_name: string | null
  content: string
  status: 'pending' | 'approved' | 'declined'
  admin_comment: string | null
  created_at: string
  updated_at: string
}

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  icon: Clock,         class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  approved: { label: 'Approved', icon: CheckCircle2,  class: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  declined: { label: 'Declined', icon: XCircle,       class: 'bg-red-500/10 text-red-500' },
}

export function FeedbackSection() {
  const supabase = createClient()
  const { workspaceId, role, members } = useWorkspace()
  const canManage = role === 'admin'  // admin only — approve/decline/comment/delete

  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')
  const [items, setItems] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)

  // New feedback form
  const [newContent, setNewContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // Comment state
  const [commentingId, setCommentingId] = useState<string | null>(null)
  const [commentText, setCommentText] = useState('')

  // Collapsed state per item
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!workspaceId) return
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setCurrentUserId(user.id)
      const member = members.find(m => m.user_id === user.id)
      setCurrentUserName(member?.full_name || member?.email || '')
    }

    const { data } = await supabase
      .from('feedback')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    setItems((data as Feedback[]) || [])
    setLoading(false)
  }, [supabase, workspaceId, members])

  useEffect(() => { load() }, [load])

  async function submitFeedback() {
    if (!newContent.trim()) return
    setSubmitting(true)
    await supabase.from('feedback').insert({
      workspace_id: workspaceId,
      user_id: currentUserId,
      user_name: currentUserName,
      content: newContent.trim(),
      status: 'pending',
    })
    setNewContent('')
    setSubmitting(false)
    load()
  }

  async function saveEdit(id: string) {
    if (!editContent.trim()) return
    await supabase.from('feedback').update({
      content: editContent.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditingId(null)
    load()
  }

  async function setStatus(id: string, status: 'approved' | 'declined') {
    await supabase.from('feedback').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    load()
  }

  async function saveComment(id: string) {
    await supabase.from('feedback').update({
      admin_comment: commentText.trim() || null,
      commented_by: currentUserId,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setCommentingId(null)
    setCommentText('')
    load()
  }

  async function deleteFeedback(id: string) {
    await supabase.from('feedback').delete().eq('id', id)
    load()
  }

  const displayed = items

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquarePlus className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground text-sm">Kairos Feedback</h2>
        {canManage && items.filter(f => f.status === 'pending').length > 0 && (
          <span className="ml-auto text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
            {items.filter(f => f.status === 'pending').length} pending
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Share ideas, bug reports or suggestions directly with the team.
      </p>

      {/* Submit new feedback */}
      <div className="space-y-2 mb-6">
        <textarea
          className="input resize-none text-sm"
          rows={3}
          placeholder="What's on your mind? Bug, idea, suggestion…"
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
        />
        <button
          onClick={submitFeedback}
          disabled={submitting || !newContent.trim()}
          className="btn-primary flex items-center gap-1.5 text-sm disabled:opacity-40"
        >
          <Send className="w-3.5 h-3.5" />
          {submitting ? 'Sending…' : 'Submit Feedback'}
        </button>
      </div>

      {/* Feedback list */}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
      ) : displayed.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No feedback yet.</p>
      ) : (
        <div className="space-y-3">
          {displayed.map(f => {
            const isOwn       = f.user_id === currentUserId
            const isCollapsed = collapsed[f.id]
            const cfg         = STATUS_CONFIG[f.status]
            const StatusIcon  = cfg.icon

            return (
              <div key={f.id} className="border border-border rounded-xl overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-muted/20 cursor-pointer select-none"
                  onClick={() => setCollapsed(p => ({ ...p, [f.id]: !p[f.id] }))}
                >
                  {/* Avatar */}
                  <div className="w-7 h-7 rounded-full bg-brand-600/10 flex items-center justify-center text-brand-600 dark:text-brand-500 text-xs font-bold shrink-0">
                    {(f.user_name || '?')[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {isOwn ? 'You' : (f.user_name || 'Member')}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(f.created_at), 'd MMM yyyy · HH:mm')}
                    </p>
                  </div>

                  {/* Status badge */}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${cfg.class}`}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {cfg.label}
                  </span>

                  {isCollapsed
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <ChevronUp   className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  }
                </div>

                {/* Body */}
                {!isCollapsed && (
                  <div className="px-4 py-3 space-y-3">
                    {/* Content */}
                    {editingId === f.id ? (
                      <div className="space-y-2">
                        <textarea
                          className="input resize-none text-sm w-full"
                          rows={3}
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(f.id)} className="btn-primary text-xs py-1.5 px-3">Save</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground whitespace-pre-wrap">{f.content}</p>
                    )}

                    {/* Admin comment */}
                    {f.admin_comment && commentingId !== f.id && (
                      <div className="bg-brand-600/5 border border-brand-600/15 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-medium text-brand-600 dark:text-brand-400 mb-1 flex items-center gap-1">
                          <MessageSquare className="w-2.5 h-2.5" /> Admin response
                        </p>
                        <p className="text-xs text-foreground">{f.admin_comment}</p>
                      </div>
                    )}

                    {/* Comment form */}
                    {commentingId === f.id && (
                      <div className="space-y-2">
                        <textarea
                          className="input resize-none text-sm w-full"
                          rows={2}
                          placeholder="Write a response…"
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveComment(f.id)} className="btn-primary text-xs py-1.5 px-3">Save</button>
                          <button onClick={() => { setCommentingId(null); setCommentText('') }} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      {/* Admin actions */}
                      {canManage && (
                        <>
                          {f.status !== 'approved' && (
                            <button
                              onClick={() => setStatus(f.id, 'approved')}
                              className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10 px-2 py-1 rounded-lg transition-colors"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Approve
                            </button>
                          )}
                          {f.status !== 'declined' && (
                            <button
                              onClick={() => setStatus(f.id, 'declined')}
                              className="flex items-center gap-1 text-[11px] font-medium text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors"
                            >
                              <XCircle className="w-3 h-3" /> Decline
                            </button>
                          )}
                          <button
                            onClick={() => { setCommentingId(f.id); setCommentText(f.admin_comment || '') }}
                            className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1 rounded-lg transition-colors"
                          >
                            <MessageSquare className="w-3 h-3" /> {f.admin_comment ? 'Edit response' : 'Respond'}
                          </button>
                        </>
                      )}

                      {/* Own actions */}
                      {isOwn && editingId !== f.id && commentingId !== f.id && (
                        <button
                          onClick={() => { setEditingId(f.id); setEditContent(f.content) }}
                          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-1 rounded-lg transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}

                      {/* Delete — own or admin */}
                      {(isOwn || canManage) && (
                        <button
                          onClick={() => deleteFeedback(f.id)}
                          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 px-2 py-1 rounded-lg transition-colors ml-auto"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
