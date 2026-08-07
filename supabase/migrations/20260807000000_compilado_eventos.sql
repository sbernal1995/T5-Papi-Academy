create extension if not exists "pgcrypto";

create table if not exists public.compilado_eventos (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  review_evento_id uuid not null references public.review_eventos(id) on delete cascade,
  jugador_id uuid references public.jugadores(id) on delete set null,
  tipo text not null check (
    tipo in ('gol', 'asistencia', 'cagada_gol', 'atajadas', 'buena_jugada', 'cagada')
  ),
  minuto_partido numeric(8, 4),
  review_segundos integer not null check (review_segundos >= 0),
  compilado_segundos integer not null check (compilado_segundos >= 0),
  clip_orden integer not null check (clip_orden > 0),
  evento_orden integer,
  clip_source_key text,
  created_at timestamptz not null default now(),
  unique (review_evento_id)
);

create index if not exists idx_compilado_eventos_partido
on public.compilado_eventos(partido_id, compilado_segundos);

create index if not exists idx_compilado_eventos_jugador
on public.compilado_eventos(jugador_id, tipo);

alter table public.compilado_eventos enable row level security;

drop policy if exists "compilado eventos read" on public.compilado_eventos;
create policy "compilado eventos read"
on public.compilado_eventos
for select
using (true);

drop policy if exists "compilado eventos write" on public.compilado_eventos;
create policy "compilado eventos write"
on public.compilado_eventos
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
