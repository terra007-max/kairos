-- Add designated project manager to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Allow project managers to view timesheets of consultants who have
-- worked on at least one of their managed projects
CREATE POLICY "Project managers view timesheets of their members"
  ON public.timesheets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.time_entries te
        ON te.project_id = p.id
        AND te.user_id = timesheets.user_id
        AND te.workspace_id = timesheets.workspace_id
      WHERE p.manager_id = auth.uid()
        AND p.workspace_id = timesheets.workspace_id
        AND p.deleted_at IS NULL
    )
  );
