-- ══════════════════════════════════════════════════════════════════════════════
-- Kairos — DB-level enforcement: admin cannot record personal time
--
-- These RESTRICTIVE policies run alongside (AND-ed with) all existing policies.
-- Even if a permissive policy allows a row, these block admin inserts.
-- Run once in Supabase SQL Editor.
-- ══════════════════════════════════════════════════════════════════════════════

-- Helper: returns the current user's role scoped to the row's workspace.
-- workspace_id is passed in so multi-workspace users get the correct role.
-- SECURITY DEFINER bypasses RLS for the inner lookup (avoids recursion).
CREATE OR REPLACE FUNCTION public.current_user_role_in(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM workspace_members
  WHERE user_id = auth.uid()
    AND workspace_id = p_workspace_id
    AND status = 'active'
  LIMIT 1
$$;

-- ── time_entries: admin cannot insert personal entries ────────────────────
DROP POLICY IF EXISTS "Admin cannot record time entries" ON public.time_entries;
CREATE POLICY "Admin cannot record time entries" ON public.time_entries
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (public.current_user_role_in(workspace_id) != 'admin');

-- ── timesheets: admin cannot create personal timesheets ──────────────────
DROP POLICY IF EXISTS "Admin cannot create timesheets" ON public.timesheets;
CREATE POLICY "Admin cannot create timesheets" ON public.timesheets
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (public.current_user_role_in(workspace_id) != 'admin');

DO $$ BEGIN RAISE NOTICE 'RLS admin-no-record policies applied.'; END $$;
