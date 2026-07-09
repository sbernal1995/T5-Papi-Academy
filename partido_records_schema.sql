-- Persisted match and player record achievements for T5 Papi Academy.
-- Run this in the Supabase SQL editor before relying on persisted records.

create extension if not exists "pgcrypto";

create table if not exists public.partido_records (
  id uuid primary key default gen_random_uuid(),
  temporada_scope text not null,
  temporada_id uuid references public.temporadas(id) on delete set null,
  partido_id uuid not null references public.partidos(id) on delete cascade,
  jugador_id uuid references public.jugadores(id) on delete cascade,
  record_key text not null,
  tipo text not null,
  scope text not null check (scope in ('partido', 'jugador')),
  metric_key text not null,
  valor numeric not null,
  anterior numeric,
  titulo text not null,
  detalle_texto text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (temporada_scope, record_key)
);

alter table public.partido_records add column if not exists temporada_scope text;
alter table public.partido_records add column if not exists temporada_id uuid references public.temporadas(id) on delete set null;
alter table public.partido_records add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.partido_records add column if not exists jugador_id uuid references public.jugadores(id) on delete cascade;
alter table public.partido_records add column if not exists record_key text;
alter table public.partido_records add column if not exists tipo text;
alter table public.partido_records add column if not exists scope text;
alter table public.partido_records add column if not exists metric_key text;
alter table public.partido_records add column if not exists valor numeric;
alter table public.partido_records add column if not exists anterior numeric;
alter table public.partido_records add column if not exists titulo text;
alter table public.partido_records add column if not exists detalle_texto text;
alter table public.partido_records add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.partido_records add column if not exists created_at timestamptz not null default now();
alter table public.partido_records add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'partido_records_scope_check'
  ) then
    alter table public.partido_records
    add constraint partido_records_scope_check
    check (scope in ('partido', 'jugador'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'partido_records_temporada_scope_record_key_key'
  ) then
    alter table public.partido_records
    add constraint partido_records_temporada_scope_record_key_key
    unique (temporada_scope, record_key);
  end if;
end $$;

create index if not exists idx_partido_records_temporada_scope on public.partido_records(temporada_scope);
create index if not exists idx_partido_records_temporada_id on public.partido_records(temporada_id);
create index if not exists idx_partido_records_partido_id on public.partido_records(partido_id);
create index if not exists idx_partido_records_jugador_id on public.partido_records(jugador_id);
create index if not exists idx_partido_records_tipo on public.partido_records(tipo);

create or replace function public.set_partido_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists partido_records_set_updated_at on public.partido_records;
create trigger partido_records_set_updated_at
before update on public.partido_records
for each row execute function public.set_partido_records_updated_at();

alter table public.partido_records enable row level security;

drop policy if exists "partido records read" on public.partido_records;
create policy "partido records read"
on public.partido_records
for select
using (true);

drop policy if exists "partido records write" on public.partido_records;
create policy "partido records write"
on public.partido_records
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
