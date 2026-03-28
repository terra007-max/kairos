-- ─── Timesheet locking + Time-off entries ─────────────────────────────────────
--
-- Run in Supabase SQL editor.
--
-- Adds:
--   • locked / locked_at / locked_by  columns to timesheets
--   • time_off_entries table  (vacation / holiday / sick)

-- 1. Locking columns ────────────────────────────────────────────────────────────
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS locked     boolean    DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by  uuid       REFERENCES auth.users(id);

-- 2. time_off_entries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_off_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL,
  date          date        NOT NULL,
  type          text        NOT NULL DEFAULT 'vacation'
                              CHECK (type IN ('vacation', 'holiday', 'sick')),
  hours         numeric(5,2) NOT NULL DEFAULT 8,
  notes         text,
  created_at    timestamptz  DEFAULT now(),
  UNIQUE (workspace_id, user_id, date)
);

ALTER TABLE public.time_off_entries ENABLE ROW LEVEL SECURITY;

-- Members manage their own time-off
CREATE POLICY "Own time off" ON public.time_off_entries
  FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Partners/admins see all time-off in their workspace
CREATE POLICY "Partners view workspace time off" ON public.time_off_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.user_id      = auth.uid()
        AND wm.workspace_id = time_off_entries.workspace_id
        AND wm.role         = 'admin'
        AND wm.status       = 'active'
    )
  );
