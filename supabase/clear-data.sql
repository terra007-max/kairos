-- ══════════════════════════════════════════════════════════════════════════════
-- KAIROS — Quick Data Clear
-- Keeps: workspaces, auth.users, profiles, workspace_members
-- Clears: everything else (FK-safe order)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  ws_id uuid;
BEGIN
  SELECT id INTO ws_id FROM public.workspaces LIMIT 1;
  IF ws_id IS NULL THEN RAISE EXCEPTION 'No workspace found'; END IF;

  DELETE FROM public.time_off_entries   WHERE workspace_id = ws_id;
  DELETE FROM public.invoices           WHERE workspace_id = ws_id;
  DELETE FROM public.timesheets         WHERE workspace_id = ws_id;
  DELETE FROM public.time_entries       WHERE workspace_id = ws_id;
  DELETE FROM public.project_members    WHERE workspace_id = ws_id;
  DELETE FROM public.project_level_rates
    WHERE project_id IN (SELECT id FROM public.projects WHERE workspace_id = ws_id);
  DELETE FROM public.projects           WHERE workspace_id = ws_id;
  DELETE FROM public.clients            WHERE workspace_id = ws_id;
  RAISE NOTICE '✓ Cleared all data. Workspace, users, profiles, workspace_members and consultant_levels untouched.';
END $$;
