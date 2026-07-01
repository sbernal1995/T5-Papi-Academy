-- Review sandbox timestamps for T5 Papi Academy.
-- Run this in the Supabase SQL editor before using timed review events.

create extension if not exists "pgcrypto";

alter table public.partidos
add column if not exists review_inicio_segundos integer;

alter table public.goles
add column if not exists review_segundos integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partidos_review_inicio_segundos_check'
  ) then
    alter table public.partidos
    add constraint partidos_review_inicio_segundos_check
    check (review_inicio_segundos is null or review_inicio_segundos >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'goles_review_segundos_check'
  ) then
    alter table public.goles
    add constraint goles_review_segundos_check
    check (review_segundos is null or review_segundos >= 0);
  end if;
end $$;

create table if not exists public.review_eventos (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  jugador_id uuid references public.jugadores(id) on delete set null,
  tipo text not null check (
    tipo in (
      'gol',
      'asistencia',
      'cagada_gol',
      'atajadas',
      'cagada',
      'mvp',
      'ace'
    )
  ),
  cantidad integer not null default 1 check (cantidad > 0),
  minuto_partido numeric(8, 4),
  review_segundos integer check (review_segundos is null or review_segundos >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.review_eventos add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.review_eventos add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.review_eventos add column if not exists tipo text;
alter table public.review_eventos add column if not exists cantidad integer not null default 1;
alter table public.review_eventos add column if not exists minuto_partido numeric(8, 4);
alter table public.review_eventos add column if not exists review_segundos integer;
alter table public.review_eventos add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.review_eventos add column if not exists created_at timestamptz not null default now();

create index if not exists idx_review_eventos_partido on public.review_eventos(partido_id);
create index if not exists idx_review_eventos_jugador on public.review_eventos(jugador_id);
create index if not exists idx_review_eventos_tipo on public.review_eventos(tipo);
create index if not exists idx_review_eventos_review_segundos on public.review_eventos(partido_id, review_segundos);
create index if not exists idx_goles_review_segundos on public.goles(partido_id, review_segundos);

alter table public.review_eventos enable row level security;

drop policy if exists "review eventos read" on public.review_eventos;
create policy "review eventos read"
on public.review_eventos
for select
using (true);

drop policy if exists "review eventos write" on public.review_eventos;
create policy "review eventos write"
on public.review_eventos
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
