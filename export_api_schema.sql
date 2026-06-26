-- T5 Papi Academy historical export API.
--
-- Run this in the Supabase SQL editor to expose:
--   POST https://<project>.supabase.co/rest/v1/rpc/export_historical_data
--
-- This intentionally returns every row from the listed public tables. Only run it
-- if those tables are safe to expose to users with the anon key.

create or replace function public.export_historical_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  export_tables text[] := array[
    'temporadas',
    'posicion',
    'jugadores',
    'jugador_posicion',
    'partidos',
    'jugador_partido',
    'goles',
    'estadisticas_temporada',
    'mundialito_moneda_overrides',
    'tracking_analyses',
    'tracking_player_mapping',
    'tracking_player_stats',
    'tracking_player_heatmaps',
    'tracking_team_stats',
    'tracking_interactions'
  ];
  table_name text;
  table_ref regclass;
  table_rows jsonb;
  all_tables jsonb := '{}'::jsonb;
  row_counts jsonb := '{}'::jsonb;
  missing_tables text[] := '{}';
begin
  foreach table_name in array export_tables loop
    table_ref := to_regclass(format('public.%I', table_name));

    if table_ref is null then
      all_tables := jsonb_set(all_tables, array[table_name], '[]'::jsonb, true);
      row_counts := jsonb_set(row_counts, array[table_name], '0'::jsonb, true);
      missing_tables := array_append(missing_tables, table_name);
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from %s) t',
        table_ref
      )
      into table_rows;

      all_tables := jsonb_set(all_tables, array[table_name], table_rows, true);
      row_counts := jsonb_set(row_counts, array[table_name], to_jsonb(jsonb_array_length(table_rows)), true);
    end if;
  end loop;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'schema', 't5-historical-export-rpc',
      'version', '2026-06-26.1',
      'exported_at', now(),
      'row_counts', row_counts,
      'missing_tables', missing_tables
    ),
    'tables', all_tables
  );
end;
$$;

revoke all on function public.export_historical_data() from public;
grant execute on function public.export_historical_data() to anon, authenticated;
