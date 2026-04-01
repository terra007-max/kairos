-- Drop the old recursive DELETE policy that causes infinite recursion
DROP POLICY IF EXISTS "Members delete team" ON public.workspace_members;
