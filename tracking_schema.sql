-- Football Detector tracking integration for T5 Papi Academy.
-- Run this in Supabase SQL editor before importing t5_player_stats.json.

create extension if not exists "pgcrypto";

create table if not exists public.tracking_analyses (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  source_version text,
  duration_seconds numeric,
  pitch_width_m numeric,
  pitch_height_m numeric,
  raw_json jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id)
);

create table if not exists public.tracking_player_mapping (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  player_id text not null,
  detected_name text,
  team text,
  jugador_id uuid references public.jugadores(id) on delete set null,
  confidence numeric,
  created_at timestamptz not null default now(),
  unique (analysis_id, player_id)
);

create table if not exists public.tracking_player_stats (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  player_id text not null,
  jugador_id uuid references public.jugadores(id) on delete set null,
  detected_name text,
  team text,
  distance_km numeric,
  avg_speed_kmh numeric,
  max_speed_kmh numeric,
  raw_max_speed_kmh numeric,
  speed_distribution jsonb not null default '{}'::jsonb,
  sprints integer,
  high_intensity_seconds numeric,
  accel_max_mps2 numeric,
  decel_max_mps2 numeric,
  turns_gt_90 integer,
  metabolic_load_index numeric,
  goalkeeper_seconds numeric,
  goalkeeper_episodes jsonb not null default '[]'::jsonb,
  own_half_pct numeric,
  rival_half_pct numeric,
  avg_x_m numeric,
  avg_y_m numeric,
  dispersion_m numeric,
  coverage_pct numeric,
  pulmon_tracking numeric,
  defense_score numeric,
  defense_score_method text,
  advanced_defense_score numeric,
  advanced_defense_axes jsonb not null default '{}'::jsonb,
  fis_valor numeric,
  fis_version text,
  physical_profile jsonb not null default '{}'::jsonb,
  goal_locations jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  highlights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, player_id)
);

create table if not exists public.tracking_player_heatmaps (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  player_id text not null,
  jugador_id uuid references public.jugadores(id) on delete set null,
  heatmap jsonb,
  heatmap_windows jsonb not null default '[]'::jsonb,
  x_bins integer,
  y_bins integer,
  created_at timestamptz not null default now(),
  unique (analysis_id, player_id)
);

create table if not exists public.tracking_team_stats (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  team text,
  distance_km numeric,
  avg_speed_kmh numeric,
  high_intensity_seconds numeric,
  pulmon_tracking_avg numeric,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, team)
);

create table if not exists public.tracking_interactions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  interaction_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, interaction_type)
);

alter table public.tracking_analyses add column if not exists source_version text;
alter table public.tracking_analyses add column if not exists duration_seconds numeric;
alter table public.tracking_analyses add column if not exists pitch_width_m numeric;
alter table public.tracking_analyses add column if not exists pitch_height_m numeric;
alter table public.tracking_analyses add column if not exists raw_json jsonb;
alter table public.tracking_analyses add column if not exists summary jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists created_at timestamptz not null default now();
alter table public.tracking_analyses add column if not exists updated_at timestamptz not null default now();

alter table public.tracking_player_mapping add column if not exists player_id text;
alter table public.tracking_player_mapping add column if not exists detected_name text;
alter table public.tracking_player_mapping add column if not exists team text;
alter table public.tracking_player_mapping add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_player_mapping add column if not exists confidence numeric;
alter table public.tracking_player_mapping add column if not exists created_at timestamptz not null default now();

alter table public.tracking_player_stats add column if not exists player_id text;
alter table public.tracking_player_stats add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_player_stats add column if not exists detected_name text;
alter table public.tracking_player_stats add column if not exists team text;
alter table public.tracking_player_stats add column if not exists distance_km numeric;
alter table public.tracking_player_stats add column if not exists avg_speed_kmh numeric;
alter table public.tracking_player_stats add column if not exists max_speed_kmh numeric;
alter table public.tracking_player_stats add column if not exists raw_max_speed_kmh numeric;
alter table public.tracking_player_stats add column if not exists speed_distribution jsonb not null default '{}'::jsonb;
alter table public.tracking_player_stats add column if not exists sprints integer;
alter table public.tracking_player_stats add column if not exists high_intensity_seconds numeric;
alter table public.tracking_player_stats add column if not exists accel_max_mps2 numeric;
alter table public.tracking_player_stats add column if not exists decel_max_mps2 numeric;
alter table public.tracking_player_stats add column if not exists turns_gt_90 integer;
alter table public.tracking_player_stats add column if not exists metabolic_load_index numeric;
alter table public.tracking_player_stats add column if not exists goalkeeper_seconds numeric;
alter table public.tracking_player_stats add column if not exists goalkeeper_episodes jsonb not null default '[]'::jsonb;
alter table public.tracking_player_stats add column if not exists own_half_pct numeric;
alter table public.tracking_player_stats add column if not exists rival_half_pct numeric;
alter table public.tracking_player_stats add column if not exists avg_x_m numeric;
alter table public.tracking_player_stats add column if not exists avg_y_m numeric;
alter table public.tracking_player_stats add column if not exists dispersion_m numeric;
alter table public.tracking_player_stats add column if not exists coverage_pct numeric;
alter table public.tracking_player_stats add column if not exists pulmon_tracking numeric;
alter table public.tracking_player_stats add column if not exists defense_score numeric;
alter table public.tracking_player_stats add column if not exists defense_score_method text;
alter table public.tracking_player_stats add column if not exists advanced_defense_score numeric;
alter table public.tracking_player_stats add column if not exists advanced_defense_axes jsonb not null default '{}'::jsonb;
alter table public.tracking_player_stats add column if not exists fis_valor numeric;
alter table public.tracking_player_stats add column if not exists fis_version text;
alter table public.tracking_player_stats add column if not exists physical_profile jsonb not null default '{}'::jsonb;
alter table public.tracking_player_stats add column if not exists goal_locations jsonb not null default '[]'::jsonb;
alter table public.tracking_player_stats add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table public.tracking_player_stats add column if not exists highlights jsonb not null default '{}'::jsonb;
alter table public.tracking_player_stats add column if not exists created_at timestamptz not null default now();

alter table public.tracking_player_heatmaps add column if not exists player_id text;
alter table public.tracking_player_heatmaps add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_player_heatmaps add column if not exists heatmap jsonb;
alter table public.tracking_player_heatmaps add column if not exists heatmap_windows jsonb not null default '[]'::jsonb;
alter table public.tracking_player_heatmaps add column if not exists x_bins integer;
alter table public.tracking_player_heatmaps add column if not exists y_bins integer;
alter table public.tracking_player_heatmaps add column if not exists created_at timestamptz not null default now();

alter table public.tracking_team_stats add column if not exists team text;
alter table public.tracking_team_stats add column if not exists distance_km numeric;
alter table public.tracking_team_stats add column if not exists avg_speed_kmh numeric;
alter table public.tracking_team_stats add column if not exists high_intensity_seconds numeric;
alter table public.tracking_team_stats add column if not exists pulmon_tracking_avg numeric;
alter table public.tracking_team_stats add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table public.tracking_team_stats add column if not exists created_at timestamptz not null default now();

alter table public.tracking_interactions add column if not exists interaction_type text;
alter table public.tracking_interactions add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.tracking_interactions add column if not exists created_at timestamptz not null default now();

create index if not exists idx_tracking_analyses_partido on public.tracking_analyses(partido_id);
create index if not exists idx_tracking_player_stats_jugador on public.tracking_player_stats(jugador_id);
create index if not exists idx_tracking_player_stats_analysis on public.tracking_player_stats(analysis_id);
create index if not exists idx_tracking_player_heatmaps_jugador on public.tracking_player_heatmaps(jugador_id);

alter table public.tracking_analyses enable row level security;
alter table public.tracking_player_mapping enable row level security;
alter table public.tracking_player_stats enable row level security;
alter table public.tracking_player_heatmaps enable row level security;
alter table public.tracking_team_stats enable row level security;
alter table public.tracking_interactions enable row level security;

drop policy if exists "tracking read analyses" on public.tracking_analyses;
create policy "tracking read analyses" on public.tracking_analyses for select using (true);
drop policy if exists "tracking write analyses" on public.tracking_analyses;
create policy "tracking write analyses" on public.tracking_analyses for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read mapping" on public.tracking_player_mapping;
create policy "tracking read mapping" on public.tracking_player_mapping for select using (true);
drop policy if exists "tracking write mapping" on public.tracking_player_mapping;
create policy "tracking write mapping" on public.tracking_player_mapping for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read stats" on public.tracking_player_stats;
create policy "tracking read stats" on public.tracking_player_stats for select using (true);
drop policy if exists "tracking write stats" on public.tracking_player_stats;
create policy "tracking write stats" on public.tracking_player_stats for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read heatmaps" on public.tracking_player_heatmaps;
create policy "tracking read heatmaps" on public.tracking_player_heatmaps for select using (true);
drop policy if exists "tracking write heatmaps" on public.tracking_player_heatmaps;
create policy "tracking write heatmaps" on public.tracking_player_heatmaps for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read team stats" on public.tracking_team_stats;
create policy "tracking read team stats" on public.tracking_team_stats for select using (true);
drop policy if exists "tracking write team stats" on public.tracking_team_stats;
create policy "tracking write team stats" on public.tracking_team_stats for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read interactions" on public.tracking_interactions;
create policy "tracking read interactions" on public.tracking_interactions for select using (true);
drop policy if exists "tracking write interactions" on public.tracking_interactions;
create policy "tracking write interactions" on public.tracking_interactions for all using (auth.uid() is not null) with check (auth.uid() is not null);
