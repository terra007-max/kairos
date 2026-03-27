-- Time entry visibility: members see own, PMs see team, Partners see all
-- Run this in the Supabase SQL editor

-- Drop the overly permissive "all workspace members see all entries" policy
DROP POLICY IF EXISTS "Workspace members view workspace entries" ON public.time_entries;

-- Partners (admin role) can see all entries in their workspace
CREATE POLICY "Partners view all workspace entries"
ON public.time_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id = time_entries.workspace_id
      AND wm.role = 'admin'
      AND wm.status = 'active'
  )
);

-- Project managers can see entries of members assigned to their projects
CREATE POLICY "Project managers view team entries"
ON public.time_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.project_members pm ON pm.project_id = p.id
    WHERE p.manager_id = auth.uid()
      AND p.workspace_id = time_entries.workspace_id
      AND p.deleted_at IS NULL
      AND pm.user_id = time_entries.user_id
  )
);

-- Note: regular members already see their own entries via the existing
-- "Users CRUD own entries" policy (auth.uid() = user_id), no changes needed there.
