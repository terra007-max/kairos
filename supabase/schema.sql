-- ================================================================
-- KAIROS — Full Database Schema
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ================================================================

-- 1. PROFILES (auto-populated from auth.users on signup)
create table if not exists public.profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now() not null
);
alter table public.profiles enable row level security;
create policy "Users view own profile"   on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- 2. CLIENTS
create table if not exists public.clients (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null,
  email       text,
  color       text default '#6366f1',
  notes       text,
  created_at  timestamptz default now() not null
);
alter table public.clients enable row level security;
create policy "Users CRUD own clients" on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. PROJECTS
create table if not exists public.projects (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  client_id    uuid references public.clients(id) on delete set null,
  name         text not null,
  color        text default '#f97316',
  hourly_rate  numeric(10,2) default 0,
  status       text default 'active' check (status in ('active', 'archived')),
  notes        text,
  created_at   timestamptz default now() not null
);
alter table public.projects enable row level security;
create policy "Users CRUD own projects" on public.projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. TIME ENTRIES
create table if not exists public.time_entries (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  project_id   uuid references public.projects(id) on delete set null,
  description  text,
  start_time   timestamptz not null,
  end_time     timestamptz,
  billable     boolean default true,
  created_at   timestamptz default now() not null,
  -- duration in seconds (computed on insert/update via trigger)
  duration_sec integer generated always as (
    case when end_time is not null
    then extract(epoch from (end_time - start_time))::integer
    else null
    end
  ) stored
);
alter table public.time_entries enable row level security;
create policy "Users CRUD own entries" on public.time_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 5. AUTO-CREATE PROFILE ON SIGNUP
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. USEFUL INDEX FOR PERFORMANCE
create index if not exists idx_time_entries_user_id on public.time_entries(user_id);
create index if not exists idx_time_entries_start   on public.time_entries(start_time desc);
create index if not exists idx_projects_user_id     on public.projects(user_id);
create index if not exists idx_clients_user_id      on public.clients(user_id);

-- ================================================================
-- MIGRATION 2: TIMESHEETS
-- Run this block separately if upgrading an existing database
-- ================================================================

create table if not exists public.timesheets (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  workspace_id  uuid references public.workspaces(id) on delete cascade not null,
  week_start    date not null,  -- Monday of the week (YYYY-MM-DD)
  status        text default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  note          text,           -- consultant's note when submitting
  reviewer_note text,           -- admin feedback on approve/reject
  submitted_at  timestamptz,
  reviewed_at   timestamptz,
  reviewed_by   uuid references public.profiles(id),
  created_at    timestamptz default now() not null,
  unique(user_id, workspace_id, week_start)
);
alter table public.timesheets enable row level security;

-- Consultants can manage their own timesheets
create policy "Users manage own timesheets" on public.timesheets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Workspace admins can view and update all timesheets in their workspace
create policy "Admins view workspace timesheets" on public.timesheets
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = timesheets.workspace_id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "Admins update workspace timesheets" on public.timesheets
  for update using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = timesheets.workspace_id
        and user_id = auth.uid()
        and role = 'admin'
        and status = 'active'
    )
  );

create index if not exists idx_timesheets_user_workspace on public.timesheets(user_id, workspace_id);
create index if not exists idx_timesheets_workspace_status on public.timesheets(workspace_id, status);

-- ================================================================
-- MIGRATION 3: SAVED INVOICES
-- Run this block separately if upgrading an existing database
-- ================================================================

create table if not exists public.invoices (
  id             uuid default gen_random_uuid() primary key,
  workspace_id   uuid references public.workspaces(id) on delete cascade not null,
  created_by     uuid references public.profiles(id) not null,
  client_id      uuid references public.clients(id) on delete set null,
  client_name    text not null,
  invoice_number text not null,
  issue_date     date not null,
  due_date       date not null,
  period_from    date not null,
  period_to      date not null,
  subtotal       numeric(12,2) not null default 0,
  notes          text,
  status         text default 'draft' check (status in ('draft', 'sent', 'paid')),
  lines          jsonb default '[]'::jsonb,  -- [{description, hours, rate, amount}]
  sent_at        timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz default now() not null
);
alter table public.invoices enable row level security;

-- Only workspace admins can manage invoices
create policy "Admins manage invoices" on public.invoices
  for all using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = invoices.workspace_id
        and user_id = auth.uid()
        and role = 'admin'
        and status = 'active'
    )
  ) with check (
    exists (
      select 1 from public.workspace_members
      where workspace_id = invoices.workspace_id
        and user_id = auth.uid()
        and role = 'admin'
        and status = 'active'
    )
  );

create index if not exists idx_invoices_workspace on public.invoices(workspace_id);
create index if not exists idx_invoices_status on public.invoices(workspace_id, status);
