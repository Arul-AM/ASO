-- ============================================================
-- A Strik Out Co — project request tracking schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → Run
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.requests (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  -- 'student'  = Student Projects form (college-projects.html)
  -- 'client'   = Start a project form (index.html)
  source             text not null check (source in ('student','client')),

  name               text not null,
  email              text not null,
  phone              text,

  -- student-only
  department         text,
  language_tech      text,
  topic              text,
  need_by            date,

  -- client-only
  project_type       text,
  budget_range       text,

  notes              text,

  -- 'new' -> 'in_progress' -> 'done'
  status             text not null default 'new' check (status in ('new','in_progress','done')),

  -- filled in automatically when an admin delivers the project
  software_list      jsonb,
  comparison_table   jsonb,
  install_guide      text,
  video_url          text,
  delivered_at       timestamptz,

  updated_at         timestamptz not null default now()
);

create index if not exists requests_status_idx on public.requests (status);
create index if not exists requests_source_idx on public.requests (source);
create index if not exists requests_created_idx on public.requests (created_at desc);

-- keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists requests_set_updated_at on public.requests;
create trigger requests_set_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security
-- Public visitors may only INSERT (submit a request).
-- Only signed-in admins (Supabase Auth users) may read/update/delete.
-- ============================================================
alter table public.requests enable row level security;

drop policy if exists "public can submit a request" on public.requests;
create policy "public can submit a request"
  on public.requests for insert
  to anon
  with check (true);

drop policy if exists "admins can read requests" on public.requests;
create policy "admins can read requests"
  on public.requests for select
  to authenticated
  using (true);

drop policy if exists "admins can update requests" on public.requests;
create policy "admins can update requests"
  on public.requests for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admins can delete requests" on public.requests;
create policy "admins can delete requests"
  on public.requests for delete
  to authenticated
  using (true);
