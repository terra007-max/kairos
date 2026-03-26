-- Migration: ensure level_id column exists on workspace_members
-- Run in: Supabase Dashboard > SQL Editor > New query

alter table public.workspace_members
  add column if not exists level_id uuid references public.consultant_levels(id) on delete set null;
