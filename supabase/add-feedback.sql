-- ================================================================
-- KAIROS — Feedback table  (idempotent — safe to re-run)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

CREATE TABLE IF NOT EXISTS public.feedback (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  uuid        REFERENCES public.workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id       uuid        REFERENCES auth.users(id)        ON DELETE CASCADE NOT NULL,
  user_name     text,
  content       text        NOT NULL,
  status        text        DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  admin_comment text,
  commented_by  uuid        REFERENCES auth.users(id),
  created_at    timestamptz DEFAULT now() NOT NULL,
  updated_at    timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Drop existing policies so re-runs are safe
DROP POLICY IF EXISTS "Users insert own feedback"          ON public.feedback;
DROP POLICY IF EXISTS "Workspace members view all feedback" ON public.feedback;
DROP POLICY IF EXISTS "Users update own feedback"          ON public.feedback;
DROP POLICY IF EXISTS "Admins update any feedback"         ON public.feedback;
DROP POLICY IF EXISTS "Users and admins delete feedback"   ON public.feedback;

-- All active workspace members can read all feedback in their workspace
CREATE POLICY "Workspace members view all feedback" ON public.feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = feedback.workspace_id
        AND wm.user_id      = auth.uid()
        AND wm.status       = 'active'
    )
  );

-- Any active workspace member can submit their own feedback
CREATE POLICY "Users insert own feedback" ON public.feedback
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = feedback.workspace_id
        AND wm.user_id      = auth.uid()
        AND wm.status       = 'active'
    )
  );

-- Users can edit their own feedback content
CREATE POLICY "Users update own feedback" ON public.feedback
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can update any feedback (status, comment, content)
CREATE POLICY "Admins update any feedback" ON public.feedback
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = feedback.workspace_id
        AND wm.user_id      = auth.uid()
        AND wm.role         = 'admin'
        AND wm.status       = 'active'
    )
  );

-- Users delete own; admins delete any
CREATE POLICY "Users and admins delete feedback" ON public.feedback
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = feedback.workspace_id
        AND wm.user_id      = auth.uid()
        AND wm.role         = 'admin'
        AND wm.status       = 'active'
    )
  );
