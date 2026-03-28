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

-- 2. Update RLS policies that only check for 'admin' to also accept elevated roles

-- workspace_members: admins + partners can see all members
DROP POLICY IF EXISTS "Workspace members view" ON public.workspace_members;
CREATE POLICY "Workspace members view" ON public.workspace_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid() AND wm.status = 'active'
    )
  );

-- projects: partner + admin can manage, pm can view
DROP POLICY IF EXISTS "Users CRUD own projects" ON public.projects;
CREATE POLICY "Users CRUD own projects" ON public.projects FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner','project_manager','member') AND status = 'active'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner','project_manager') AND status = 'active'
    )
  );

-- timesheets: partner + admin + pm can review
DROP POLICY IF EXISTS "Admins manage all timesheets" ON public.timesheets;
CREATE POLICY "Elevated roles manage all timesheets" ON public.timesheets FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner','project_manager') AND status = 'active'
    )
  );

-- invoices: partner + admin can manage
DROP POLICY IF EXISTS "Admins manage invoices" ON public.invoices;
CREATE POLICY "Admin and partner manage invoices" ON public.invoices FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role IN ('admin','partner') AND status = 'active'
    )
  );

RAISE NOTICE 'Role update complete';
