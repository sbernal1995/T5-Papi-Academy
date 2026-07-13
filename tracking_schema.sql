-- Football Detector tracking integration for T5 Papi Academy.
-- Run this in Supabase SQL editor before importing t5_player_stats.json.

create extension if not exists "pgcrypto";

create table if not exists public.tracking_analyses (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  export_schema text,
  export_schema_version text,
  source_schema text,
  source_version text,
  duration_seconds numeric,
  pitch_width_m numeric,
  pitch_height_m numeric,
  available_metrics jsonb not null default '{}'::jsonb,
  match_link jsonb not null default '{}'::jsonb,
  review_analysis jsonb not null default '{}'::jsonb,
  advanced_defense jsonb not null default '{}'::jsonb,
  shot_map jsonb not null default '{}'::jsonb,
  effective_play jsonb not null default '{}'::jsonb,
  match_story jsonb not null default '{}'::jsonb,
  cross_stats jsonb not null default '{}'::jsonb,
  physical_profile jsonb not null default '{}'::jsonb,
  matchmaker_seed jsonb not null default '{}'::jsonb,
  supabase_export jsonb not null default '{}'::jsonb,
  goalkeeper_detection jsonb not null default '{}'::jsonb,
  metrics_v2 jsonb not null default '{}'::jsonb,
  config_json jsonb not null default '{}'::jsonb,
  team_own_sides jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  raw_json jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id)
);

create table if not exists public.tracking_player_mapping (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  player_id text not null,
  source_player_id text,
  detected_name text,
  source_name text,
  normalized_name text,
  team text,
  jugador_id uuid references public.jugadores(id) on delete set null,
  confidence numeric,
  created_at timestamptz not null default now(),
  unique (analysis_id, player_id)
);

create table if not exists public.tracking_player_stats (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  player_id text not null,
  source_player_id text,
  source_name text,
  normalized_name text,
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
  partido_id uuid references public.partidos(id) on delete cascade,
  player_id text not null,
  source_player_id text,
  source_name text,
  normalized_name text,
  jugador_id uuid references public.jugadores(id) on delete set null,
  counts jsonb not null default '[]'::jsonb,
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
  partido_id uuid references public.partidos(id) on delete cascade,
  team text,
  team_label text,
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
  partido_id uuid references public.partidos(id) on delete cascade,
  interaction_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, interaction_type)
);

create table if not exists public.tracking_shot_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  event_key text not null,
  event_type text,
  outcome text,
  event_order integer,
  review_seconds numeric,
  match_seconds numeric,
  sam3_seconds numeric,
  player_id text,
  source_player_id text,
  source_name text,
  normalized_name text,
  jugador_id uuid references public.jugadores(id) on delete set null,
  detected_name text,
  team text,
  x_m numeric,
  y_m numeric,
  quantity integer,
  linked boolean,
  estimated boolean,
  position_source text,
  defending_team text,
  active_goalkeeper_player_id text,
  active_goalkeeper_name text,
  active_goalkeeper_team text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, event_key)
);

create table if not exists public.tracking_advanced_defense_events (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  event_key text not null,
  event_type text,
  event_order integer,
  sam3_seconds numeric,
  match_seconds numeric,
  attacking_team text,
  defending_team text,
  shooter_player_id text,
  shooter_name text,
  shooter_team text,
  shot_x_m numeric,
  shot_y_m numeric,
  shot_distance_to_goal_m numeric,
  total_blame numeric,
  context_state text,
  phase text,
  phase_label text,
  local_advantage integer,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_id, event_key)
);

create table if not exists public.tracking_advanced_defense_assignments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tracking_analyses(id) on delete cascade,
  partido_id uuid references public.partidos(id) on delete cascade,
  event_key text not null,
  player_id text,
  source_player_id text,
  source_name text,
  normalized_name text,
  jugador_id uuid references public.jugadores(id) on delete set null,
  detected_name text,
  team text,
  role text,
  event_type text,
  blame numeric,
  capped_blame numeric,
  bonus numeric,
  distance_m numeric,
  nearest boolean,
  outnumbered boolean,
  advantage integer,
  return_toward_own_goal_mps numeric,
  shot_distance_to_goal_m numeric,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.tracking_analyses add column if not exists export_schema text;
alter table public.tracking_analyses add column if not exists export_schema_version text;
alter table public.tracking_analyses add column if not exists source_schema text;
alter table public.tracking_analyses add column if not exists source_version text;
alter table public.tracking_analyses add column if not exists duration_seconds numeric;
alter table public.tracking_analyses add column if not exists pitch_width_m numeric;
alter table public.tracking_analyses add column if not exists pitch_height_m numeric;
alter table public.tracking_analyses add column if not exists available_metrics jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists match_link jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists review_analysis jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists advanced_defense jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists shot_map jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists effective_play jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists match_story jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists cross_stats jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists physical_profile jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists matchmaker_seed jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists supabase_export jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists goalkeeper_detection jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists metrics_v2 jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists config_json jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists team_own_sides jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists limitations jsonb not null default '[]'::jsonb;
alter table public.tracking_analyses add column if not exists raw_json jsonb;
alter table public.tracking_analyses add column if not exists summary jsonb not null default '{}'::jsonb;
alter table public.tracking_analyses add column if not exists created_at timestamptz not null default now();
alter table public.tracking_analyses add column if not exists updated_at timestamptz not null default now();

alter table public.tracking_player_mapping add column if not exists player_id text;
alter table public.tracking_player_mapping add column if not exists source_player_id text;
alter table public.tracking_player_mapping add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_player_mapping add column if not exists detected_name text;
alter table public.tracking_player_mapping add column if not exists source_name text;
alter table public.tracking_player_mapping add column if not exists normalized_name text;
alter table public.tracking_player_mapping add column if not exists team text;
alter table public.tracking_player_mapping add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_player_mapping add column if not exists confidence numeric;
alter table public.tracking_player_mapping add column if not exists created_at timestamptz not null default now();
update public.tracking_player_mapping
set source_player_id = player_id
where source_player_id is null and player_id is not null;
update public.tracking_player_mapping
set normalized_name = lower(regexp_replace(coalesce(detected_name, source_player_id, player_id, ''), '[^a-zA-Z0-9]+', ' ', 'g'))
where normalized_name is null;

alter table public.tracking_player_stats add column if not exists player_id text;
alter table public.tracking_player_stats add column if not exists source_player_id text;
alter table public.tracking_player_stats add column if not exists source_name text;
alter table public.tracking_player_stats add column if not exists normalized_name text;
alter table public.tracking_player_stats add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
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
alter table public.tracking_player_heatmaps add column if not exists source_player_id text;
alter table public.tracking_player_heatmaps add column if not exists source_name text;
alter table public.tracking_player_heatmaps add column if not exists normalized_name text;
alter table public.tracking_player_heatmaps add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_player_heatmaps add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_player_heatmaps add column if not exists counts jsonb not null default '[]'::jsonb;
alter table public.tracking_player_heatmaps add column if not exists heatmap jsonb;
alter table public.tracking_player_heatmaps add column if not exists heatmap_windows jsonb not null default '[]'::jsonb;
alter table public.tracking_player_heatmaps add column if not exists x_bins integer;
alter table public.tracking_player_heatmaps add column if not exists y_bins integer;
alter table public.tracking_player_heatmaps add column if not exists created_at timestamptz not null default now();

alter table public.tracking_team_stats add column if not exists team text;
alter table public.tracking_team_stats add column if not exists team_label text;
alter table public.tracking_team_stats add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_team_stats add column if not exists distance_km numeric;
alter table public.tracking_team_stats add column if not exists avg_speed_kmh numeric;
alter table public.tracking_team_stats add column if not exists high_intensity_seconds numeric;
alter table public.tracking_team_stats add column if not exists pulmon_tracking_avg numeric;
alter table public.tracking_team_stats add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table public.tracking_team_stats add column if not exists created_at timestamptz not null default now();

alter table public.tracking_interactions add column if not exists interaction_type text;
alter table public.tracking_interactions add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_interactions add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.tracking_interactions add column if not exists created_at timestamptz not null default now();

alter table public.tracking_shot_events add column if not exists event_key text;
alter table public.tracking_shot_events add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_shot_events add column if not exists event_type text;
alter table public.tracking_shot_events add column if not exists outcome text;
alter table public.tracking_shot_events add column if not exists event_order integer;
alter table public.tracking_shot_events add column if not exists review_seconds numeric;
alter table public.tracking_shot_events add column if not exists match_seconds numeric;
alter table public.tracking_shot_events add column if not exists sam3_seconds numeric;
alter table public.tracking_shot_events add column if not exists player_id text;
alter table public.tracking_shot_events add column if not exists source_player_id text;
alter table public.tracking_shot_events add column if not exists source_name text;
alter table public.tracking_shot_events add column if not exists normalized_name text;
alter table public.tracking_shot_events add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_shot_events add column if not exists detected_name text;
alter table public.tracking_shot_events add column if not exists team text;
alter table public.tracking_shot_events add column if not exists x_m numeric;
alter table public.tracking_shot_events add column if not exists y_m numeric;
alter table public.tracking_shot_events add column if not exists quantity integer;
alter table public.tracking_shot_events add column if not exists linked boolean;
alter table public.tracking_shot_events add column if not exists estimated boolean;
alter table public.tracking_shot_events add column if not exists position_source text;
alter table public.tracking_shot_events add column if not exists defending_team text;
alter table public.tracking_shot_events add column if not exists active_goalkeeper_player_id text;
alter table public.tracking_shot_events add column if not exists active_goalkeeper_name text;
alter table public.tracking_shot_events add column if not exists active_goalkeeper_team text;
alter table public.tracking_shot_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.tracking_shot_events add column if not exists created_at timestamptz not null default now();

alter table public.tracking_advanced_defense_events add column if not exists event_key text;
alter table public.tracking_advanced_defense_events add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_advanced_defense_events add column if not exists event_type text;
alter table public.tracking_advanced_defense_events add column if not exists event_order integer;
alter table public.tracking_advanced_defense_events add column if not exists sam3_seconds numeric;
alter table public.tracking_advanced_defense_events add column if not exists match_seconds numeric;
alter table public.tracking_advanced_defense_events add column if not exists attacking_team text;
alter table public.tracking_advanced_defense_events add column if not exists defending_team text;
alter table public.tracking_advanced_defense_events add column if not exists shooter_player_id text;
alter table public.tracking_advanced_defense_events add column if not exists shooter_name text;
alter table public.tracking_advanced_defense_events add column if not exists shooter_team text;
alter table public.tracking_advanced_defense_events add column if not exists shot_x_m numeric;
alter table public.tracking_advanced_defense_events add column if not exists shot_y_m numeric;
alter table public.tracking_advanced_defense_events add column if not exists shot_distance_to_goal_m numeric;
alter table public.tracking_advanced_defense_events add column if not exists total_blame numeric;
alter table public.tracking_advanced_defense_events add column if not exists context_state text;
alter table public.tracking_advanced_defense_events add column if not exists phase text;
alter table public.tracking_advanced_defense_events add column if not exists phase_label text;
alter table public.tracking_advanced_defense_events add column if not exists local_advantage integer;
alter table public.tracking_advanced_defense_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.tracking_advanced_defense_events add column if not exists created_at timestamptz not null default now();

alter table public.tracking_advanced_defense_assignments add column if not exists event_key text;
alter table public.tracking_advanced_defense_assignments add column if not exists partido_id uuid references public.partidos(id) on delete cascade;
alter table public.tracking_advanced_defense_assignments add column if not exists player_id text;
alter table public.tracking_advanced_defense_assignments add column if not exists source_player_id text;
alter table public.tracking_advanced_defense_assignments add column if not exists source_name text;
alter table public.tracking_advanced_defense_assignments add column if not exists normalized_name text;
alter table public.tracking_advanced_defense_assignments add column if not exists jugador_id uuid references public.jugadores(id) on delete set null;
alter table public.tracking_advanced_defense_assignments add column if not exists detected_name text;
alter table public.tracking_advanced_defense_assignments add column if not exists team text;
alter table public.tracking_advanced_defense_assignments add column if not exists role text;
alter table public.tracking_advanced_defense_assignments add column if not exists event_type text;
alter table public.tracking_advanced_defense_assignments add column if not exists blame numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists capped_blame numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists bonus numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists distance_m numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists nearest boolean;
alter table public.tracking_advanced_defense_assignments add column if not exists outnumbered boolean;
alter table public.tracking_advanced_defense_assignments add column if not exists advantage integer;
alter table public.tracking_advanced_defense_assignments add column if not exists return_toward_own_goal_mps numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists shot_distance_to_goal_m numeric;
alter table public.tracking_advanced_defense_assignments add column if not exists reason text;
alter table public.tracking_advanced_defense_assignments add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.tracking_advanced_defense_assignments add column if not exists created_at timestamptz not null default now();

create index if not exists idx_tracking_analyses_partido on public.tracking_analyses(partido_id);
create index if not exists idx_tracking_player_mapping_partido on public.tracking_player_mapping(partido_id);
create index if not exists idx_tracking_player_stats_jugador on public.tracking_player_stats(jugador_id);
create index if not exists idx_tracking_player_stats_analysis on public.tracking_player_stats(analysis_id);
create index if not exists idx_tracking_player_stats_partido on public.tracking_player_stats(partido_id);
create index if not exists idx_tracking_player_heatmaps_jugador on public.tracking_player_heatmaps(jugador_id);
create index if not exists idx_tracking_player_heatmaps_partido on public.tracking_player_heatmaps(partido_id);
create unique index if not exists uq_tracking_analyses_partido on public.tracking_analyses(partido_id);
create unique index if not exists uq_tracking_player_mapping_analysis_player on public.tracking_player_mapping(analysis_id, player_id);
create unique index if not exists uq_tracking_player_stats_analysis_player on public.tracking_player_stats(analysis_id, player_id);
create unique index if not exists uq_tracking_player_heatmaps_analysis_player on public.tracking_player_heatmaps(analysis_id, player_id);
create unique index if not exists uq_tracking_team_stats_analysis_team on public.tracking_team_stats(analysis_id, team);
create unique index if not exists uq_tracking_interactions_analysis_type on public.tracking_interactions(analysis_id, interaction_type);
create index if not exists idx_tracking_shot_events_analysis on public.tracking_shot_events(analysis_id);
create index if not exists idx_tracking_shot_events_partido on public.tracking_shot_events(partido_id);
create index if not exists idx_tracking_shot_events_jugador on public.tracking_shot_events(jugador_id);
create index if not exists idx_tracking_shot_events_player on public.tracking_shot_events(player_id);
create unique index if not exists uq_tracking_shot_events_analysis_key on public.tracking_shot_events(analysis_id, event_key);
create index if not exists idx_tracking_adv_def_events_analysis on public.tracking_advanced_defense_events(analysis_id);
create index if not exists idx_tracking_adv_def_events_partido on public.tracking_advanced_defense_events(partido_id);
create unique index if not exists uq_tracking_adv_def_events_analysis_key on public.tracking_advanced_defense_events(analysis_id, event_key);
create index if not exists idx_tracking_adv_def_assign_analysis on public.tracking_advanced_defense_assignments(analysis_id);
create index if not exists idx_tracking_adv_def_assign_partido on public.tracking_advanced_defense_assignments(partido_id);
create index if not exists idx_tracking_adv_def_assign_jugador on public.tracking_advanced_defense_assignments(jugador_id);

alter table public.tracking_analyses enable row level security;
alter table public.tracking_player_mapping enable row level security;
alter table public.tracking_player_stats enable row level security;
alter table public.tracking_player_heatmaps enable row level security;
alter table public.tracking_team_stats enable row level security;
alter table public.tracking_interactions enable row level security;
alter table public.tracking_shot_events enable row level security;
alter table public.tracking_advanced_defense_events enable row level security;
alter table public.tracking_advanced_defense_assignments enable row level security;

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

drop policy if exists "tracking read shot events" on public.tracking_shot_events;
create policy "tracking read shot events" on public.tracking_shot_events for select using (true);
drop policy if exists "tracking write shot events" on public.tracking_shot_events;
create policy "tracking write shot events" on public.tracking_shot_events for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read advanced defense events" on public.tracking_advanced_defense_events;
create policy "tracking read advanced defense events" on public.tracking_advanced_defense_events for select using (true);
drop policy if exists "tracking write advanced defense events" on public.tracking_advanced_defense_events;
create policy "tracking write advanced defense events" on public.tracking_advanced_defense_events for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "tracking read advanced defense assignments" on public.tracking_advanced_defense_assignments;
create policy "tracking read advanced defense assignments" on public.tracking_advanced_defense_assignments for select using (true);
drop policy if exists "tracking write advanced defense assignments" on public.tracking_advanced_defense_assignments;
create policy "tracking write advanced defense assignments" on public.tracking_advanced_defense_assignments for all using (auth.uid() is not null) with check (auth.uid() is not null);

notify pgrst, 'reload schema';
