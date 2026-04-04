-- Track when entries/timesheets were created by proxy (admin acting on behalf of a user)
-- Run in: Supabase Dashboard > SQL Editor

alter table public.time_entries
  add column if not exists proxy_user_id uuid references auth.users(id) on delete set null;

alter table public.timesheets
  add column if not exists proxy_user_id uuid references auth.users(id) on delete set null;

comment on column public.time_entries.proxy_user_id is
  'Set when an admin/partner entered this time entry on behalf of the user via proxy mode.';

comment on column public.timesheets.proxy_user_id is
  'Set when an admin/partner submitted this timesheet on behalf of the user via proxy mode.';
