-- DIAGNÓSTICO ESPECÍFICO PARA TU BASE DE DATOS
-- ================================================

-- PASO 1: Identificar triggers problemáticos usando los nombres de columnas correctos
SELECT 
    trigger_name,
    event_object_table as table_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('jugador_partido', 'partidos', 'goles', 'estadisticas_jugador', 'estadisticas_temporada')
ORDER BY event_object_table, trigger_name;

-- PASO 2: Verificar si estadisticas_jugador es tabla o vista
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('estadisticas_jugador', 'vista_estadisticas_por_temporada');

-- PASO 3: Ver definición de la vista problemática (si existe)
-- SELECT pg_get_viewdef('vista_estadisticas_por_temporada'::regclass, true);

-- PASO 4: Buscar reglas que puedan estar causando el problema
SELECT 
    schemaname,
    tablename,
    rulename,
    definition
FROM pg_rules 
WHERE tablename IN ('jugador_partido', 'goles', 'estadisticas_jugador', 'estadisticas_temporada')
OR definition ILIKE '%estadisticas_jugador%'
OR definition ILIKE '%vista_estadisticas%';

-- PASO 5: Verificar funciones que puedan estar en triggers
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND (routine_definition ILIKE '%estadisticas_jugador%' 
     OR routine_definition ILIKE '%vista_estadisticas%')
ORDER BY routine_name;

-- SOLUCIÓN: ELIMINAR TRIGGERS PROBLEMÁTICOS ESPECÍFICOS
-- =====================================================

-- *** ESTOS SON LOS TRIGGERS EXACTOS ENCONTRADOS EN TU BASE DE DATOS ***

-- Eliminar trigger de la tabla goles
DROP TRIGGER IF EXISTS trigger_actualizar_estadisticas_goles ON goles;

-- Eliminar trigger de la tabla jugador_partido  
DROP TRIGGER IF EXISTS trigger_actualizar_estadisticas_jugador_partido ON jugador_partido;

-- Eliminar trigger de la tabla partidos
DROP TRIGGER IF EXISTS trigger_actualizar_estadisticas_partidos ON partidos;

-- COMANDOS ALTERNATIVOS (por si los nombres anteriores no funcionan)
-- ===================================================================
DROP TRIGGER IF EXISTS trigger_actualizar_estadisticas ON jugador_partido;
DROP TRIGGER IF EXISTS trigger_estadisticas_insert ON jugador_partido;
DROP TRIGGER IF EXISTS trigger_estadisticas_update ON jugador_partido;
DROP TRIGGER IF EXISTS trigger_estadisticas_delete ON jugador_partido;
DROP TRIGGER IF EXISTS trigger_estadisticas_goles ON goles;
DROP TRIGGER IF EXISTS trigger_actualizar_stats_goles ON goles;
DROP TRIGGER IF EXISTS trigger_goles_estadisticas ON goles;
DROP TRIGGER IF EXISTS trigger_estadisticas_partidos ON partidos;
DROP TRIGGER IF EXISTS trigger_actualizar_stats_partidos ON partidos;
DROP TRIGGER IF EXISTS trigger_update_vista ON estadisticas_jugador;
DROP TRIGGER IF EXISTS trigger_sync_vista ON estadisticas_jugador;

-- VERIFICACIÓN FINAL
-- ===================
SELECT 
    'Triggers restantes:' as info,
    trigger_name,
    event_object_table as table_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND event_object_table IN ('jugador_partido', 'partidos', 'goles', 'estadisticas_jugador', 'estadisticas_temporada')

UNION ALL

SELECT 
    'Reglas restantes:' as info,
    rulename,
    tablename
FROM pg_rules
WHERE schemaname = 'public'
AND tablename IN ('jugador_partido', 'partidos', 'goles', 'estadisticas_jugador', 'estadisticas_temporada');

-- OPCIONAL: Si necesitas recrear estadísticas manualmente
-- ======================================================

-- Script para actualizar estadisticas_jugador desde jugador_partido
/*
INSERT INTO estadisticas_jugador (
    id, nombre, pj, pulmon, winrate, total_puntos, pg, pe, pp, 
    goles, asistencias, cagadas_en_gol, mvp_count, ace_count, 
    atajadas, capitan_defeat, bita_defeat, rendimiento_total, 
    rendimiento_ataque, rendimiento_arquero
)
SELECT 
    j.id,
    j.nombre,
    COUNT(jp.jugador_id) as pj,
    AVG(jp.pulmon) as pulmon,
    ROUND(
        (COUNT(CASE WHEN p.equipo_ganador = jp.equipo THEN 1 END) * 100.0 / 
         NULLIF(COUNT(jp.jugador_id), 0)), 2
    ) as winrate,
    COALESCE(SUM(jp.puntos), 0) as total_puntos,
    COUNT(CASE WHEN p.equipo_ganador = jp.equipo THEN 1 END) as pg,
    COUNT(CASE WHEN p.equipo_ganador IS NULL THEN 1 END) as pe,
    COUNT(CASE WHEN p.equipo_ganador != jp.equipo THEN 1 END) as pp,
    COALESCE(SUM(jp.goles), 0) as goles,
    COALESCE(SUM(jp.asistencias), 0) as asistencias,
    COALESCE(SUM(jp.cagadas), 0) as cagadas_en_gol,
    COUNT(CASE WHEN jp.mvp = true THEN 1 END) as mvp_count,
    COUNT(CASE WHEN jp.ace = true THEN 1 END) as ace_count,
    COALESCE(SUM(jp.atajadas), 0) as atajadas,
    COUNT(CASE WHEN jp.capitan_defeat = true THEN 1 END) as capitan_defeat,
    COUNT(CASE WHEN jp.bita_defeat = true THEN 1 END) as bita_defeat,
    j.rendimiento as rendimiento_total,
    j.rendimiento_ataque,
    j.rendimiento_arquero
FROM jugadores j
LEFT JOIN jugador_partido jp ON j.id = jp.jugador_id
LEFT JOIN partidos p ON jp.partido_id = p.id
GROUP BY j.id, j.nombre, j.pulmon, j.rendimiento, j.rendimiento_ataque, j.rendimiento_arquero
ON CONFLICT (id) DO UPDATE SET
    pj = EXCLUDED.pj,
    pulmon = EXCLUDED.pulmon,
    winrate = EXCLUDED.winrate,
    total_puntos = EXCLUDED.total_puntos,
    pg = EXCLUDED.pg,
    pe = EXCLUDED.pe,
    pp = EXCLUDED.pp,
    goles = EXCLUDED.goles,
    asistencias = EXCLUDED.asistencias,
    cagadas_en_gol = EXCLUDED.cagadas_en_gol,
    mvp_count = EXCLUDED.mvp_count,
    ace_count = EXCLUDED.ace_count,
    atajadas = EXCLUDED.atajadas,
    capitan_defeat = EXCLUDED.capitan_defeat,
    bita_defeat = EXCLUDED.bita_defeat,
    rendimiento_total = EXCLUDED.rendimiento_total,
    rendimiento_ataque = EXCLUDED.rendimiento_ataque,
    rendimiento_arquero = EXCLUDED.rendimiento_arquero;
*/ 