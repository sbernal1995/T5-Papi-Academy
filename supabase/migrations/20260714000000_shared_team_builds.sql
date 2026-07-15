create table if not exists public.shared_team_builds (
  id text primary key,
  payload jsonb not null,
  preview_path text not null,
  preview_url text not null,
  title text not null default 'Autoarmado T5 Papi Academy',
  description text not null default 'Equipo 1 vs Equipo 2',
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.shared_team_builds
  add column if not exists payload jsonb,
  add column if not exists preview_path text,
  add column if not exists preview_url text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists expires_at timestamptz,
  add column if not exists created_at timestamptz default now();

update public.shared_team_builds
set
  payload = coalesce(payload, '{}'::jsonb),
  preview_path = coalesce(preview_path, ''),
  preview_url = coalesce(preview_url, ''),
  title = coalesce(title, 'Autoarmado T5 Papi Academy'),
  description = coalesce(description, 'Equipo 1 vs Equipo 2'),
  expires_at = coalesce(expires_at, now() + interval '7 days'),
  created_at = coalesce(created_at, now());

alter table public.shared_team_builds
  alter column payload set not null,
  alter column preview_path set not null,
  alter column preview_url set not null,
  alter column title set not null,
  alter column title set default 'Autoarmado T5 Papi Academy',
  alter column description set not null,
  alter column description set default 'Equipo 1 vs Equipo 2',
  alter column expires_at set not null,
  alter column created_at set not null,
  alter column created_at set default now();

create index if not exists shared_team_builds_expires_at_idx
  on public.shared_team_builds (expires_at);

alter table public.shared_team_builds enable row level security;

drop policy if exists "Anyone can read non expired shared team builds" on public.shared_team_builds;
create policy "Anyone can read non expired shared team builds"
  on public.shared_team_builds
  for select
  to anon, authenticated
  using (expires_at > now());

drop policy if exists "Users can insert their own shared team builds" on public.shared_team_builds;
create policy "Users can insert their own shared team builds"
  on public.shared_team_builds
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Users can delete their own shared team builds" on public.shared_team_builds;
create policy "Users can delete their own shared team builds"
  on public.shared_team_builds
  for delete
  to authenticated
  using (created_by = auth.uid());
