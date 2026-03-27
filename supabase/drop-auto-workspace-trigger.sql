-- ================================================================
-- Run this in Supabase Dashboard > SQL Editor
-- Drops the trigger that auto-creates a personal workspace on signup
-- and cleans up orphaned personal workspaces
-- ================================================================

-- 1. Drop any trigger on auth.users that creates workspaces
--    (try all common names)
DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
DROP TRIGGER IF EXISTS create_workspace_for_new_user ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_workspace ON auth.users;
DROP TRIGGER IF EXISTS on_new_user_workspace ON auth.users;

-- 2. Drop associated functions
DROP FUNCTION IF EXISTS public.handle_new_user_workspace() CASCADE;
DROP FUNCTION IF EXISTS public.create_workspace_for_new_user() CASCADE;

-- 3. Show remaining triggers on auth.users so you can verify
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';

-- 4. Delete personal workspaces (those not named 'Kairos Consulting')
--    Only deletes workspaces where the owner is the only member
--    (safe — won't touch shared workspaces)
DELETE FROM public.workspaces
WHERE id IN (
  SELECT w.id FROM public.workspaces w
  WHERE w.name != 'Kairos Consulting'
    AND (
      SELECT COUNT(*) FROM public.workspace_members wm
      WHERE wm.workspace_id = w.id
    ) <= 1
);
