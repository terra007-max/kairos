-- ══════════════════════════════════════════════════════════════════════════════
-- KAIROS — Role system update
-- Adds: partner, project_manager roles
-- Run in Supabase SQL Editor BEFORE running the seed script.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Drop existing role check constraint and add new one
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_check;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role IN ('admin', 'partner', 'project_manager', 'member'));

-- 2. Helper function (SECURITY DEFINER = bypasses RLS inside, breaking recursion)
CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = auth.uid() AND status = 'active'
$$;

-- 3. Update RLS policies

-- workspace_members: any active member of the workspace can see all rows in it
DROP POLICY IF EXISTS "Workspace members view" ON public.workspace_members;
CREATE POLICY "Workspace members view" ON public.workspace_members FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- projects: all roles can view, admin/partner/pm can write
DROP POLICY IF EXISTS "Users CRUD own projects" ON public.projects;
CREATE POLICY "Users CRUD own projects" ON public.projects FOR ALL
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()))
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner','project_manager') AND status = 'active'
    )
  );

-- timesheets: admin + partner + pm can manage all timesheets
DROP POLICY IF EXISTS "Admins manage all timesheets" ON public.timesheets;
CREATE POLICY "Elevated roles manage all timesheets" ON public.timesheets FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner','project_manager') AND status = 'active'
    )
  );

-- invoices: admin + partner can manage
DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admin and partner manage invoices" ON public.invoices FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner') AND status = 'active'
    )
  );

DO $$ BEGIN RAISE NOTICE 'Role update complete'; END $$;
