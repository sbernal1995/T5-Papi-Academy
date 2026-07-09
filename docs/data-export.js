(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.T5DataExport = api;
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EXPORT_VERSION = '2026-06-26.1';
  const DEFAULT_PAGE_SIZE = 1000;

  const TABLE_CONFIGS = [
    { name: 'temporadas', orderBy: [{ column: 'nombre', ascending: true }] },
    { name: 'posicion', orderBy: [{ column: 'id', ascending: true }] },
    { name: 'jugadores', orderBy: [{ column: 'nombre', ascending: true }] },
    { name: 'jugador_posicion', orderBy: [{ column: 'jugador_id', ascending: true }, { column: 'posicion_id', ascending: true }] },
    { name: 'partidos', orderBy: [{ column: 'fecha', ascending: true }, { column: 'id', ascending: true }] },
    { name: 'jugador_partido', orderBy: [{ column: 'partido_id', ascending: true }, { column: 'equipo', ascending: true }] },
    { name: 'goles', orderBy: [{ column: 'partido_id', ascending: true }, { column: 'minuto', ascending: true }] },
    { name: 'estadisticas_temporada', orderBy: [{ column: 'temporada_id', ascending: true }, { column: 'jugador_id', ascending: true }] },
    { name: 'mundialito_moneda_overrides', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_analyses', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_player_mapping', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_player_stats', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_player_heatmaps', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_team_stats', orderBy: [{ column: 'created_at', ascending: true }] },
    { name: 'tracking_interactions', orderBy: [{ column: 'created_at', ascending: true }] }
  ];

  function getWindow() {
    return typeof window !== 'undefined' ? window : null;
  }

  function getSupabaseClient(explicitClient) {
    if (explicitClient) return explicitClient;
    const win = getWindow();
    return win ? win.supabase : null;
  }

  async function waitForSupabase(explicitClient, timeoutMs = 10000) {
    const existing = getSupabaseClient(explicitClient);
    if (existing) return existing;

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const client = getSupabaseClient();
      if (client) return client;
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    throw new Error('Supabase no esta disponible para exportar datos.');
  }

  function normalizeError(error) {
    if (!error) return null;
    return {
      code: error.code || null,
      message: error.message || String(error),
      details: error.details || null,
      hint: error.hint || null
    };
  }

  function isColumnOrderError(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    return text.includes('column') || text.includes('schema cache') || text.includes('order');
  }

  function applyOrder(query, orderBy = []) {
    return orderBy.reduce((acc, order) => acc.order(order.column, {
      ascending: order.ascending !== false,
      nullsFirst: !!order.nullsFirst
    }), query);
  }

  async function fetchTablePage(client, config, from, to, withOrder) {
    let query = client.from(config.name).select(config.select || '*').range(from, to);
    if (withOrder && config.orderBy?.length) {
      query = applyOrder(query, config.orderBy);
    }
    return query;
  }

  async function fetchTableRows(client, config, options = {}) {
    const pageSize = Math.max(1, Number(options.pageSize || DEFAULT_PAGE_SIZE));
    const rows = [];
    let from = 0;
    let withOrder = config.orderBy?.length > 0;
    let orderAlreadyRetried = false;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await fetchTablePage(client, config, from, to, withOrder);

      if (error) {
        if (withOrder && !orderAlreadyRetried && isColumnOrderError(error)) {
          withOrder = false;
          orderAlreadyRetried = true;
          rows.length = 0;
          from = 0;
          continue;
        }
        return {
          name: config.name,
          rows: [],
          error: normalizeError(error)
        };
      }

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);

      if (page.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return {
      name: config.name,
      rows,
      error: null
    };
  }

  function toKey(value) {
    return value === null || value === undefined ? '' : String(value);
  }

  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function indexById(rows = []) {
    return rows.reduce((map, row) => {
      if (row && row.id !== null && row.id !== undefined) {
        map.set(toKey(row.id), row);
      }
      return map;
    }, new Map());
  }

  function groupBy(rows = [], key) {
    return rows.reduce((map, row) => {
      const value = typeof key === 'function' ? key(row) : row?.[key];
      const mapKey = toKey(value);
      if (!map.has(mapKey)) map.set(mapKey, []);
      map.get(mapKey).push(row);
      return map;
    }, new Map());
  }

  function getPlayerName(playersById, playerId) {
    return playersById.get(toKey(playerId))?.nombre || null;
  }

  function getSeasonName(seasonsById, seasonId) {
    return seasonsById.get(toKey(seasonId))?.nombre || null;
  }

  function normalizeTeam(value) {
    const team = Number(value);
    return team === 1 || team === 2 ? team : null;
  }

  function resolveResult(match, team) {
    const normalizedTeam = normalizeTeam(team);
    const winner = normalizeTeam(match?.equipo_ganador);

    if (!winner) return 'draw';
    if (!normalizedTeam) return 'unknown';
    return winner === normalizedTeam ? 'win' : 'loss';
  }

  function resolveGoalTeam(goal, participants = []) {
    const explicitTeam = normalizeTeam(goal?.equipo);
    if (explicitTeam) return explicitTeam;

    const scorer = participants.find(row => toKey(row?.jugador_id) === toKey(goal?.goleador_id));
    const scorerTeam = normalizeTeam(scorer?.equipo);
    if (!scorerTeam) return null;
    return goal?.es_gol_en_contra ? (scorerTeam === 1 ? 2 : 1) : scorerTeam;
  }

  function countGoalEventsForPlayer(goals, playerId, participants) {
    const playerKey = toKey(playerId);
    return goals.reduce((acc, goal) => {
      const goalTeam = resolveGoalTeam(goal, participants);
      const scorer = participants.find(row => toKey(row?.jugador_id) === toKey(goal?.goleador_id));
      const scorerTeam = normalizeTeam(scorer?.equipo);

      if (toKey(goal.goleador_id) === playerKey && !goal.es_gol_en_contra) acc.goals += 1;
      if (toKey(goal.goleador_id) === playerKey && goal.es_gol_en_contra) acc.own_goals += 1;
      if (toKey(goal.asistidor_id) === playerKey && !goal.es_gol_en_contra) acc.assists += 1;
      if (toKey(goal.cagada_jugador_id) === playerKey) acc.mistakes_leading_to_goal += 1;

      const participant = participants.find(row => toKey(row?.jugador_id) === playerKey);
      const team = normalizeTeam(participant?.equipo);
      if (team && goalTeam === team) acc.team_goals_for += 1;
      if (team && goalTeam && goalTeam !== team) acc.team_goals_against += 1;
      if (team && scorerTeam === team && !goal.es_gol_en_contra) acc.team_direct_goals += 1;

      return acc;
    }, {
      goals: 0,
      assists: 0,
      own_goals: 0,
      mistakes_leading_to_goal: 0,
      team_goals_for: 0,
      team_goals_against: 0,
      team_direct_goals: 0
    });
  }

  function buildMatchRows({ matches, seasonsById, participantsByMatch, goalsByMatch }) {
    return matches.map(match => {
      const participants = participantsByMatch.get(toKey(match.id)) || [];
      const goals = goalsByMatch.get(toKey(match.id)) || [];
      const score = goals.reduce((acc, goal) => {
        const team = resolveGoalTeam(goal, participants);
        if (team === 1) acc.equipo_1 += 1;
        if (team === 2) acc.equipo_2 += 1;
        return acc;
      }, { equipo_1: 0, equipo_2: 0 });

      return {
        id: match.id,
        fecha: match.fecha || null,
        cancha: match.cancha || null,
        temporada_id: match.temporada_id || null,
        temporada_nombre: getSeasonName(seasonsById, match.temporada_id),
        equipo_ganador: match.equipo_ganador ?? null,
        goles_equipo_1: score.equipo_1,
        goles_equipo_2: score.equipo_2,
        jugadores_count: participants.length,
        goles_count: goals.length,
        youtube_link: match.youtube_link || null
      };
    });
  }

  function buildPlayerMatchRows({ matchesById, seasonsById, playersById, participants, participantsByMatch, goalsByMatch }) {
    return participants.map(row => {
      const match = matchesById.get(toKey(row.partido_id)) || {};
      const matchParticipants = participantsByMatch.get(toKey(row.partido_id)) || [];
      const goals = goalsByMatch.get(toKey(row.partido_id)) || [];
      const eventCounts = countGoalEventsForPlayer(goals, row.jugador_id, matchParticipants);

      return {
        partido_id: row.partido_id,
        fecha: match.fecha || null,
        cancha: match.cancha || null,
        temporada_id: match.temporada_id || null,
        temporada_nombre: getSeasonName(seasonsById, match.temporada_id),
        jugador_id: row.jugador_id,
        jugador_nombre: getPlayerName(playersById, row.jugador_id),
        equipo: row.equipo ?? null,
        resultado: resolveResult(match, row.equipo),
        goles_planilla: toNumber(row.goles),
        asistencias_planilla: toNumber(row.asistencias),
        atajadas: toNumber(row.atajadas),
        cagadas: toNumber(row.cagadas),
        puntos: toNumber(row.puntos),
        mvp: !!row.mvp,
        ace: !!row.ace,
        goles_eventos: eventCounts.goals,
        asistencias_eventos: eventCounts.assists,
        goles_en_contra_eventos: eventCounts.own_goals,
        cagadas_en_gol_eventos: eventCounts.mistakes_leading_to_goal,
        goles_equipo_favor: eventCounts.team_goals_for,
        goles_equipo_contra: eventCounts.team_goals_against
      };
    });
  }

  function buildGoalRows({ goals, matchesById, seasonsById, playersById, participantsByMatch }) {
    return goals.map(goal => {
      const match = matchesById.get(toKey(goal.partido_id)) || {};
      const participants = participantsByMatch.get(toKey(goal.partido_id)) || [];
      const team = resolveGoalTeam(goal, participants);

      return {
        id: goal.id,
        partido_id: goal.partido_id,
        fecha: match.fecha || null,
        temporada_id: match.temporada_id || null,
        temporada_nombre: getSeasonName(seasonsById, match.temporada_id),
        minuto: goal.minuto ?? null,
        equipo: team,
        goleador_id: goal.goleador_id || null,
        goleador_nombre: getPlayerName(playersById, goal.goleador_id),
        asistidor_id: goal.asistidor_id || null,
        asistidor_nombre: getPlayerName(playersById, goal.asistidor_id),
        cagada_jugador_id: goal.cagada_jugador_id || null,
        cagada_jugador_nombre: getPlayerName(playersById, goal.cagada_jugador_id),
        arquero_id: goal.arquero_id || null,
        arquero_nombre: getPlayerName(playersById, goal.arquero_id),
        es_gol_en_contra: !!goal.es_gol_en_contra
      };
    });
  }

  function buildPlayerRows({ players, playerPositions, positionsById }) {
    const positionsByPlayer = groupBy(playerPositions, 'jugador_id');

    return players.map(player => ({
      ...player,
      posiciones: (positionsByPlayer.get(toKey(player.id)) || []).map(row => ({
        posicion_id: row.posicion_id,
        posicion_nombre: positionsById.get(toKey(row.posicion_id))?.nombre || null,
        es_primaria: !!row.es_primaria
      }))
    }));
  }

  function buildTrackingPlayerRows({ trackingStats, trackingAnalysesById, matchesById, seasonsById, playersById }) {
    return trackingStats.map(row => {
      const analysis = trackingAnalysesById.get(toKey(row.analysis_id)) || {};
      const match = matchesById.get(toKey(analysis.partido_id)) || {};

      return {
        analysis_id: row.analysis_id,
        partido_id: analysis.partido_id || null,
        fecha: match.fecha || null,
        temporada_id: match.temporada_id || null,
        temporada_nombre: getSeasonName(seasonsById, match.temporada_id),
        jugador_id: row.jugador_id || null,
        jugador_nombre: getPlayerName(playersById, row.jugador_id) || row.detected_name || null,
        player_id: row.player_id || null,
        detected_name: row.detected_name || null,
        team: row.team || null,
        distance_km: row.distance_km ?? null,
        avg_speed_kmh: row.avg_speed_kmh ?? null,
        max_speed_kmh: row.max_speed_kmh ?? null,
        sprints: row.sprints ?? null,
        high_intensity_seconds: row.high_intensity_seconds ?? null,
        goalkeeper_seconds: row.goalkeeper_seconds ?? null,
        pulmon_tracking: row.pulmon_tracking ?? null,
        coverage_pct: row.coverage_pct ?? null,
        created_at: row.created_at || null
      };
    });
  }

  function buildDerivedTables(tables = {}) {
    const seasons = tables.temporadas || [];
    const positions = tables.posicion || [];
    const players = tables.jugadores || [];
    const playerPositions = tables.jugador_posicion || [];
    const matches = tables.partidos || [];
    const participants = tables.jugador_partido || [];
    const goals = tables.goles || [];
    const trackingAnalyses = tables.tracking_analyses || [];
    const trackingStats = tables.tracking_player_stats || [];

    const seasonsById = indexById(seasons);
    const positionsById = indexById(positions);
    const playersById = indexById(players);
    const matchesById = indexById(matches);
    const participantsByMatch = groupBy(participants, 'partido_id');
    const goalsByMatch = groupBy(goals, 'partido_id');
    const trackingAnalysesById = indexById(trackingAnalyses);

    return {
      players: buildPlayerRows({ players, playerPositions, positionsById }),
      match_rows: buildMatchRows({ matches, seasonsById, participantsByMatch, goalsByMatch }),
      player_match_rows: buildPlayerMatchRows({
        matchesById,
        seasonsById,
        playersById,
        participants,
        participantsByMatch,
        goalsByMatch
      }),
      goal_rows: buildGoalRows({ goals, matchesById, seasonsById, playersById, participantsByMatch }),
      tracking_player_rows: buildTrackingPlayerRows({
        trackingStats,
        trackingAnalysesById,
        matchesById,
        seasonsById,
        playersById
      })
    };
  }

  function resolveConfigs(options = {}) {
    const include = new Set(options.includeTables || TABLE_CONFIGS.map(config => config.name));
    const exclude = new Set(options.excludeTables || []);

    return TABLE_CONFIGS.filter(config => include.has(config.name) && !exclude.has(config.name));
  }

  function buildRowCounts(tables) {
    return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 0]));
  }

  async function exportAll(options = {}) {
    const client = await waitForSupabase(options.client, options.timeoutMs);
    const configs = resolveConfigs(options);
    const startedAt = new Date();
    const tables = {};
    const tableErrors = {};

    const results = await Promise.all(configs.map(config => fetchTableRows(client, config, options)));
    results.forEach(result => {
      tables[result.name] = result.rows;
      if (result.error) {
        tableErrors[result.name] = result.error;
      }
    });

    const payload = {
      meta: {
        schema: 't5-historical-export',
        version: EXPORT_VERSION,
        exported_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt.getTime(),
        page_size: Math.max(1, Number(options.pageSize || DEFAULT_PAGE_SIZE)),
        row_counts: buildRowCounts(tables),
        table_errors: tableErrors,
        source: 'supabase'
      },
      tables
    };

    if (options.includeDerived !== false) {
      payload.derived = buildDerivedTables(tables);
      payload.meta.derived_row_counts = buildRowCounts(payload.derived);
    }

    return payload;
  }

  function makeFilename(prefix = 't5-historical-export') {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}-${stamp}.json`;
  }

  function downloadBlob(blob, filename) {
    const win = getWindow();
    if (!win || !win.document) {
      throw new Error('La descarga directa solo esta disponible en el navegador.');
    }

    const url = win.URL.createObjectURL(blob);
    const link = win.document.createElement('a');
    link.href = url;
    link.download = filename;
    win.document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => win.URL.revokeObjectURL(url), 1000);
  }

  async function downloadJson(options = {}) {
    const payload = await exportAll(options);
    const pretty = options.pretty !== false;
    const content = JSON.stringify(payload, null, pretty ? 2 : 0);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    downloadBlob(blob, options.filename || makeFilename());
    return payload;
  }

  function notify(message, type = 'info') {
    const win = getWindow();
    if (win?.showToast) {
      win.showToast(message, type);
      return;
    }
    const method = type === 'error' ? 'error' : 'log';
    console[method](message);
  }

  async function descargarExportHistorico() {
    const win = getWindow();
    const button = win?.document?.getElementById('btn-export-historico');
    const previousHtml = button?.innerHTML;

    try {
      if (button) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Exportando';
      }

      const payload = await downloadJson();
      const totalRows = Object.values(payload.meta.row_counts).reduce((sum, count) => sum + count, 0);
      notify(`Exportacion lista: ${totalRows} filas historicas.`, 'success');
      return payload;
    } catch (error) {
      console.error('Error exportando historico:', error);
      notify(`No se pudo exportar: ${error.message}`, 'error');
      throw error;
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = previousHtml;
      }
    }
  }

  const api = {
    EXPORT_VERSION,
    TABLE_CONFIGS,
    exportAll,
    downloadJson,
    buildDerivedTables,
    fetchTableRows
  };

  const win = getWindow();
  if (win) {
    win.descargarExportHistorico = descargarExportHistorico;
  }

  return api;
}));
