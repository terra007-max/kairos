-- Time-off entries table for absence calendar
create table if not exists public.time_off_entries (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  date          date not null,
  type          text not null check (type in ('vacation', 'holiday', 'sick')),
  hours         numeric(5,2) not null default 8,
  created_at    timestamptz not null default now(),

  unique (workspace_id, user_id, date)
);

alter table public.time_off_entries enable row level security;

-- All active workspace members can read entries in their workspace
create policy "workspace members can read time off entries"
  on public.time_off_entries for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = time_off_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

-- Admins (role = 'admin' or 'partner') can insert
create policy "admins can insert time off entries"
  on public.time_off_entries for insert
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = time_off_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('admin', 'partner')
    )
  );

-- Admins can update
create policy "admins can update time off entries"
  on public.time_off_entries for update
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = time_off_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('admin', 'partner')
    )
  );

-- Admins can delete
create policy "admins can delete time off entries"
  on public.time_off_entries for delete
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = time_off_entries.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
        and wm.role in ('admin', 'partner')
    )
  );
