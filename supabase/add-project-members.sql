-- ================================================================
-- Migration: Add project_members table
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- Drop and recreate to ensure schema is correct
drop table if exists public.project_members cascade;

-- PROJECT MEMBERS — controls which workspace members are assigned to a project
create table public.project_members (
  id           uuid default gen_random_uuid() primary key,
  project_id   uuid references public.projects(id) on delete cascade not null,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  workspace_id uuid not null,
  created_at   timestamptz default now() not null,
  unique(project_id, user_id)
);

alter table public.project_members enable row level security;

-- Admins can manage project members; members can read their own
create policy "Workspace members can view project_members"
  on public.project_members for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = project_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "Admins can manage project_members"
  on public.project_members for all
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = project_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = project_members.workspace_id
        and wm.user_id = auth.uid()
        and wm.role = 'admin'
    )
  );
