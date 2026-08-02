-- Persist the Puskas vote selected while reviewing a match.

alter table public.goles
add column if not exists es_puskas boolean not null default false;

create index if not exists idx_goles_puskas
on public.goles(goleador_id, partido_id)
where es_puskas = true;

comment on column public.goles.es_puskas is
'True when the goal was selected as a Puskas goal during match review.';
