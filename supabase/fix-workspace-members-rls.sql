-- Fix: infinite recursion in workspace_members RLS DELETE policy
-- The policy was checking role by querying workspace_members inside workspace_members,
-- causing infinite recursion. Solution: security-definer helper function.

-- 1. Create a helper that reads workspace_members WITHOUT triggering RLS
CREATE OR REPLACE FUNCTION public.current_user_workspace_role(ws_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = ws_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- 2. Drop the existing recursive DELETE policy (covers common naming variants)
DROP POLICY IF EXISTS "Admins can delete workspace members"     ON public.workspace_members;
DROP POLICY IF EXISTS "Admin can delete workspace members"      ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_delete_policy"         ON public.workspace_members;
DROP POLICY IF EXISTS "Allow admins to delete members"          ON public.workspace_members;
DROP POLICY IF EXISTS "Members can be deleted by admins"        ON public.workspace_members;

-- 3. Re-create the DELETE policy using the non-recursive helper
CREATE POLICY "Admins can delete workspace members"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  public.current_user_workspace_role(workspace_id) IN ('admin', 'partner')
);
