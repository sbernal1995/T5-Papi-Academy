(function () {
  'use strict';

  const APP = {
    analysisByMatch: new Map(),
    detailsByAnalysis: new Map(),
    statsByPlayer: new Map(),
    latestByPlayer: new Map(),
    goalsConcededByPlayer: new Map(),
    profileMatchesByPlayer: new Map(),
    importState: null,
    loadingAnalyses: false,
    stylesReady: false,
    profileReady: false,
    profileRenderTimer: null,
    profileRenderInProgress: false,
    profileObservedPlayerId: null,
    profileDefaultTabPlayerId: null,
    profileWasVisible: false,
    optimizerPatched: false
  };

  const DEFAULT_PITCH = { width: 32, height: 16 };
  const DEFENSE_SCORE_MAX = 100;
  const DEFENSE_SKILL_BASELINE = 50;
  const DEFENSE_SKILL_MIN = 0;
  const DEFENSE_SKILL_MAX = 11;
  const DEFENSE_SKILL_RANGE_EPSILON = 0.001;
  const TRACKING_TABLES = {
    analyses: 'tracking_analyses',
    mapping: 'tracking_player_mapping',
    stats: 'tracking_player_stats',
    heatmaps: 'tracking_player_heatmaps',
    teams: 'tracking_team_stats',
    interactions: 'tracking_interactions',
    shotEvents: 'tracking_shot_events',
    advancedDefenseEvents: 'tracking_advanced_defense_events',
    advancedDefenseAssignments: 'tracking_advanced_defense_assignments'
  };
  const OPTIONAL_COLUMNS_BY_TABLE = {
    tracking_analyses: [
      'export_schema',
      'export_schema_version',
      'source_schema',
      'source_version',
      'duration_seconds',
      'pitch_width_m',
      'pitch_height_m',
      'available_metrics',
      'match_link',
      'review_analysis',
      'advanced_defense',
      'shot_map',
      'effective_play',
      'match_story',
      'cross_stats',
      'physical_profile',
      'matchmaker_seed',
      'supabase_export',
      'goalkeeper_detection',
      'metrics_v2',
      'config_json',
      'team_own_sides',
      'limitations',
      'raw_json',
      'summary'
    ],
    tracking_player_mapping: ['partido_id', 'source_player_id', 'source_name', 'normalized_name', 'confidence'],
    tracking_player_stats: [
      'partido_id',
      'source_player_id',
      'source_name',
      'normalized_name',
      'defense_score',
      'defense_score_method',
      'advanced_defense_score',
      'advanced_defense_axes',
      'fis_valor',
      'fis_version',
      'physical_profile',
      'goal_locations'
    ],
    tracking_player_heatmaps: ['partido_id', 'player_id', 'source_player_id', 'source_name', 'normalized_name', 'counts'],
    tracking_team_stats: ['partido_id', 'team_label'],
    tracking_interactions: ['partido_id'],
    tracking_shot_events: ['partido_id', 'source_player_id', 'source_name', 'normalized_name'],
    tracking_advanced_defense_events: ['partido_id'],
    tracking_advanced_defense_assignments: ['partido_id', 'source_player_id', 'source_name', 'normalized_name']
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeName(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function round(value, decimals = 2) {
    const n = toNumber(value, 0);
    const factor = 10 ** decimals;
    return Math.round(n * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numberOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function trackingDefenseScore(player = null) {
    const candidates = [
      player?.advanced_defense_score,
      player?.advanced_defense?.score,
      player?.tracking?.advanced_defense_score,
      player?.tracking?.advanced_defense?.score,
      player?.metrics?.advanced_defense_score,
      player?.metrics?.advanced_defense?.score,
      player?.scoreDefensivoMatchmaking,
      player?.scoreDefensivoTracking,
      player?.defense_score,
      player?.defense?.defense_score,
      player?.tracking?.defense_score,
      player?.tracking?.defense?.defense_score,
      player?.metrics?.defense_score,
      player?.metrics?.defense?.defense_score
    ];

    for (const value of candidates) {
      const n = numberOrNull(value);
      if (n !== null && n > 0) return clamp(n, 0, 100);
    }

    return null;
  }

  function defenseSkillImpact(score, range = null) {
    const n = numberOrNull(score);
    if (n === null) return 0;
    if (range?.useRange) {
      const normalized = (n - range.min) / range.range;
      return clamp(normalized, 0, 1) * DEFENSE_SKILL_MAX;
    }
    const impact = ((n - DEFENSE_SKILL_BASELINE) / (DEFENSE_SCORE_MAX - DEFENSE_SKILL_BASELINE)) * DEFENSE_SKILL_MAX;
    return clamp(impact, DEFENSE_SKILL_MIN, DEFENSE_SKILL_MAX);
  }

  function defenseSkillRange(players = []) {
    const scores = (players || [])
      .map(player => numberOrNull(player?.scoreDefensivoTracking))
      .filter(score => score !== null);
    if (!scores.length) {
      return { min: null, max: null, range: 0, useRange: false };
    }

    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    return {
      min,
      max,
      range,
      useRange: scores.length > 1 && range > DEFENSE_SKILL_RANGE_EPSILON
    };
  }

  function integerOrNull(value) {
    const n = numberOrNull(value);
    return n === null ? null : Math.round(n);
  }

  function booleanOrNull(value) {
    return typeof value === 'boolean' ? value : null;
  }

  function normalizeIdValue(value) {
    const id = String(value ?? '').trim();
    return id || null;
  }

  function resolveImportPartidoId(state = APP.importState) {
    const candidates = [
      state?.partidoId,
      state?.partido_id,
      state?.matchId,
      state?.match_id,
      state?.match?.id,
      state?.partido?.id,
      state?.normalized?.match_link?.partido_id,
      state?.normalized?.match_link?.match_id,
      state?.normalized?.supabase_export?.partido_id,
      state?.normalized?.raw?.partido_id,
      state?.normalized?.raw?.match_id,
      state?.normalized?.raw?.match?.partido_id,
      state?.normalized?.raw?.match?.id
    ];
    return candidates.map(normalizeIdValue).find(Boolean) || null;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.round(toNumber(seconds, 0)));
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function showToast(message, type = 'info') {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function db() {
    return typeof window !== 'undefined' ? window.supabase : null;
  }

  function userIsAdmin() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    if (typeof window.esUsuarioAdmin === 'function') {
      return window.esUsuarioAdmin();
    }

    if (window.T5AuthState && typeof window.T5AuthState.isAdmin === 'boolean') {
      return window.T5AuthState.isAdmin;
    }

    const logoutButtons = [
      document.getElementById('btn-logout'),
      document.getElementById('btn-logout-mobile')
    ].filter(Boolean);

    return logoutButtons.some(button => {
      const style = window.getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden' && button.offsetParent !== null;
    });
  }

  function removeHistoryTrackingCards() {
    document.querySelectorAll('[data-tracking-card]').forEach(card => card.remove());
  }

  async function waitForSupabase(timeoutMs = 10000) {
    const start = Date.now();
    while (!db() && Date.now() - start < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return db();
  }

  function schemaMissingColumn(error) {
    const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
    const patterns = [
      /could not find the ['"]([^'"]+)['"] column/i,
      /column ['"]([^'"]+)['"] does not exist/i,
      /column\s+([a-zA-Z0-9_]+)\s+does not exist/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1];
    }
    return '';
  }

  function readableError(error) {
    if (!error) return 'Error desconocido';
    if (typeof error === 'string') return error;
    const parts = [
      error.message,
      error.details,
      error.hint,
      error.code ? `code=${error.code}` : ''
    ].filter(Boolean);
    if (parts.length) return parts.join(' | ');
    try {
      return JSON.stringify(error);
    } catch (_) {
      return String(error);
    }
  }

  function tableError(table, error) {
    return new Error(`${table}: ${readableError(error)}`);
  }

  function omitColumn(row, column) {
    const copy = { ...row };
    delete copy[column];
    return copy;
  }

  async function upsertTrackingAnalysisRow(client, row) {
    const optionalColumns = OPTIONAL_COLUMNS_BY_TABLE[TRACKING_TABLES.analyses] || [];
    let currentRow = { ...row };
    const omittedColumns = [];

    for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
      const { data, error } = await client
        .from(TRACKING_TABLES.analyses)
        .upsert(currentRow, { onConflict: 'partido_id' })
        .select('id, partido_id')
        .single();

      if (!error) {
        return {
          analysis: { ...row, ...(data || {}) },
          omittedColumns
        };
      }

      const missingColumn = schemaMissingColumn(error);
      if (missingColumn && optionalColumns.includes(missingColumn) && Object.prototype.hasOwnProperty.call(currentRow, missingColumn)) {
        currentRow = omitColumn(currentRow, missingColumn);
        omittedColumns.push(missingColumn);
        continue;
      }

      throw tableError(TRACKING_TABLES.analyses, error);
    }

    throw new Error('No se pudo guardar tracking por columnas faltantes en tracking_analyses.');
  }

  function buildTrackingPlayerStatsRows(normalized, mappings = new Map(), analysisId = null, partidoId = null) {
    return (normalized?.players || []).map(player => {
      const mapping = mappings.get(player.player_id) || {};
      const jugadorId = mapping.jugador_id || null;
      return {
        analysis_id: analysisId,
        partido_id: partidoId,
        player_id: player.player_id,
        source_player_id: player.player_id,
        source_name: player.detected_name,
        normalized_name: normalizeName(player.detected_name),
        jugador_id: jugadorId,
        detected_name: player.detected_name,
        team: player.team || null,
        distance_km: player.distance_km,
        avg_speed_kmh: player.avg_speed_kmh,
        max_speed_kmh: player.max_speed_kmh,
        raw_max_speed_kmh: player.raw_max_speed_kmh,
        speed_distribution: player.speed_distribution,
        sprints: player.sprints,
        high_intensity_seconds: player.high_intensity_seconds,
        accel_max_mps2: player.accel_max_mps2,
        decel_max_mps2: player.decel_max_mps2,
        turns_gt_90: player.turns_gt_90,
        metabolic_load_index: player.metabolic_load_index,
        goalkeeper_seconds: player.goalkeeper_seconds,
        goalkeeper_episodes: player.goalkeeper_episodes,
        own_half_pct: player.own_half_pct,
        rival_half_pct: player.rival_half_pct,
        avg_x_m: player.avg_x_m,
        avg_y_m: player.avg_y_m,
        dispersion_m: player.dispersion_m,
        coverage_pct: player.coverage_pct,
        pulmon_tracking: player.pulmon_tracking,
        defense_score: player.defense_score,
        defense_score_method: player.defense_score_method || null,
        advanced_defense_score: player.advanced_defense_score,
        advanced_defense_axes: player.advanced_defense_axes || {},
        fis_valor: player.fis_valor ?? player.pulmon_tracking,
        fis_version: player.fis_version || null,
        physical_profile: player.physical_profile || {},
        goal_locations: player.goal_locations || [],
        metrics: {
          fatigue: player.fatigue,
          recovery: player.recovery,
          windows: player.windows,
          directionality: player.directionality,
          lane_distribution: player.lane_distribution,
          field_seconds: player.field_seconds,
          field_minutes: player.field_minutes,
          distance_m: player.distance_m,
          distance_per_field_min: player.distance_per_field_min,
          distance_per_40_min_km: player.distance_per_40_min_km,
          dominant_position_m: player.dominant_position_m,
          defense: player.defense,
          advanced_defense: player.advanced_defense,
          physical_profile: player.physical_profile,
          pulmon: player.pulmon,
          fis_valor: player.fis_valor ?? player.pulmon_tracking,
          fis_version: player.fis_version || null,
          goal_locations: player.goal_locations || [],
          own_side: player.own_side,
          rival_side: player.rival_side
        },
        highlights: player.highlights
      };
    });
  }

  function shotEventKey(event, index) {
    return String(
      event.event_id
      || `${event.type || 'shot'}-${event.outcome || 'unknown'}-${event.order ?? index + 1}-${event.sam3_seconds ?? event.match_seconds ?? event.review_seconds ?? 'na'}-${event.player_id || event.name || 'unknown'}`
    );
  }

  function advancedDefenseEventKey(event, index) {
    return String(
      event.event_id
      || `${event.type || 'danger'}-${event.order ?? index + 1}-${event.sam3_seconds ?? event.match_seconds ?? 'na'}-${event.defending_team || 'team'}`
    );
  }

  function buildTrackingShotEventRows(normalized, mappings = new Map(), analysisId = null, partidoId = null) {
    const events = Array.isArray(normalized?.shot_map?.events) ? normalized.shot_map.events : [];
    return events.map((event, index) => {
      const playerId = String(event.player_id || '');
      const mapping = mappings.get(playerId) || {};
      const goalkeeper = event.active_goalkeeper || {};
      return {
        analysis_id: analysisId,
        partido_id: partidoId,
        event_key: shotEventKey(event, index),
        event_type: event.type || null,
        outcome: event.outcome || null,
        event_order: integerOrNull(event.order),
        review_seconds: numberOrNull(event.review_seconds),
        match_seconds: numberOrNull(event.match_seconds),
        sam3_seconds: numberOrNull(event.sam3_seconds),
        player_id: playerId || null,
        source_player_id: playerId || null,
        source_name: event.name || event.detected_name || null,
        normalized_name: normalizeName(event.name || event.detected_name || playerId),
        jugador_id: mapping.jugador_id || null,
        detected_name: event.name || event.detected_name || null,
        team: event.team || null,
        x_m: numberOrNull(event.x),
        y_m: numberOrNull(event.y),
        quantity: integerOrNull(event.quantity),
        linked: booleanOrNull(event.linked),
        estimated: booleanOrNull(event.estimated),
        position_source: event.position_source || null,
        defending_team: event.defending_team || null,
        active_goalkeeper_player_id: goalkeeper.player_id || null,
        active_goalkeeper_name: goalkeeper.name || null,
        active_goalkeeper_team: goalkeeper.team || null,
        payload: event
      };
    });
  }

  function buildAdvancedDefenseEventRows(normalized, analysisId = null, partidoId = null) {
    const events = Array.isArray(normalized?.advanced_defense?.events) ? normalized.advanced_defense.events : [];
    return events.map((event, index) => {
      const shooter = event.shooter || {};
      const shot = event.shot || {};
      const weighting = event.weighting || {};
      const context = event.context || {};
      const phase = context.phase || {};
      return {
        analysis_id: analysisId,
        partido_id: partidoId,
        event_key: advancedDefenseEventKey(event, index),
        event_type: event.type || null,
        event_order: integerOrNull(event.order),
        sam3_seconds: numberOrNull(event.sam3_seconds),
        match_seconds: numberOrNull(event.match_seconds),
        attacking_team: event.attacking_team || null,
        defending_team: event.defending_team || null,
        shooter_player_id: shooter.player_id || null,
        shooter_name: shooter.name || null,
        shooter_team: shooter.team || null,
        shot_x_m: numberOrNull(shot.x),
        shot_y_m: numberOrNull(shot.y),
        shot_distance_to_goal_m: numberOrNull(weighting.shot_distance_to_goal_m ?? shot.distance_to_goal_m),
        total_blame: numberOrNull(weighting.total_blame),
        context_state: context.state || null,
        phase: phase.phase || null,
        phase_label: phase.phase_label || phase.label || null,
        local_advantage: integerOrNull(context.advantage ?? context.local_advantage),
        payload: event
      };
    });
  }

  function buildAdvancedDefenseAssignmentRows(normalized, mappings = new Map(), analysisId = null, partidoId = null) {
    const events = Array.isArray(normalized?.advanced_defense?.events) ? normalized.advanced_defense.events : [];
    return events.flatMap((event, eventIndex) => {
      const eventKey = advancedDefenseEventKey(event, eventIndex);
      return (event.assignments || []).map(assignment => {
        const playerId = String(assignment.player_id || '');
        const mapping = mappings.get(playerId) || {};
        return {
          analysis_id: analysisId,
          partido_id: partidoId,
          event_key: eventKey,
          player_id: playerId || null,
          source_player_id: playerId || null,
          source_name: assignment.name || null,
          normalized_name: normalizeName(assignment.name || playerId),
          jugador_id: mapping.jugador_id || null,
          detected_name: assignment.name || null,
          team: assignment.team || null,
          role: assignment.role || null,
          event_type: assignment.event_type || event.type || null,
          blame: numberOrNull(assignment.blame),
          capped_blame: numberOrNull(assignment.capped_blame),
          bonus: numberOrNull(assignment.bonus),
          distance_m: numberOrNull(assignment.distance_m),
          nearest: booleanOrNull(assignment.nearest),
          outnumbered: booleanOrNull(assignment.outnumbered),
          advantage: integerOrNull(assignment.advantage),
          return_toward_own_goal_mps: numberOrNull(assignment.return_toward_own_goal_mps),
          shot_distance_to_goal_m: numberOrNull(assignment.shot_distance_to_goal_m),
          reason: assignment.reason || null,
          payload: assignment
        };
      });
    });
  }

  function shotMapFromRows(rows, fallback = {}) {
    if (!Array.isArray(rows) || !rows.length) return fallback || {};
    const events = rows
      .slice()
      .sort((a, b) => toNumber(a.event_order, 0) - toNumber(b.event_order, 0) || toNumber(a.sam3_seconds, 0) - toNumber(b.sam3_seconds, 0))
      .map(row => ({
        ...(row.payload || {}),
        type: row.event_type || row.payload?.type,
        outcome: row.outcome || row.payload?.outcome,
        order: row.event_order ?? row.payload?.order,
        review_seconds: row.review_seconds ?? row.payload?.review_seconds,
        match_seconds: row.match_seconds ?? row.payload?.match_seconds,
        sam3_seconds: row.sam3_seconds ?? row.payload?.sam3_seconds,
        player_id: row.player_id || row.payload?.player_id,
        name: row.detected_name || row.payload?.name,
        team: row.team || row.payload?.team,
        x: row.x_m ?? row.payload?.x,
        y: row.y_m ?? row.payload?.y,
        active_goalkeeper: row.active_goalkeeper_player_id
          ? {
              player_id: row.active_goalkeeper_player_id,
              name: row.active_goalkeeper_name,
              team: row.active_goalkeeper_team
            }
          : row.payload?.active_goalkeeper
      }));
    return {
      ...(fallback || {}),
      events,
      goals: events.filter(event => event.outcome === 'goal' || event.type === 'goal'),
      saved_shots: events.filter(event => event.outcome === 'save' || event.type === 'save')
    };
  }

  function isGoalShotEvent(row = {}) {
    const type = normalizeName(row.event_type || row.payload?.type || row.type || '');
    const outcome = normalizeName(row.outcome || row.payload?.outcome || row.result || '');
    return type === 'goal' || outcome === 'goal' || type.includes('gol') || outcome.includes('gol');
  }

  function registerTrackingPlayerIdentity(row = {}, playerIdByTrackingKey, playerIdByNameKey) {
    const analysisId = String(row.analysis_id || '');
    const jugadorId = String(row.jugador_id || '');
    if (!analysisId || !jugadorId) return;

    [row.player_id, row.source_player_id].forEach(value => {
      const key = String(value || '').trim();
      if (key) playerIdByTrackingKey.set(`${analysisId}:${key}`, jugadorId);
    });

    [row.detected_name, row.source_name, row.normalized_name].forEach(value => {
      const key = normalizeName(value);
      if (key) playerIdByNameKey.set(`${analysisId}:${key}`, jugadorId);
    });
  }

  function buildGoalkeeperConcededGoals(shotRows = [], playerIdByTrackingKey = new Map(), playerIdByNameKey = new Map()) {
    const goalsByPlayer = new Map();

    (shotRows || []).forEach((row, index) => {
      if (!isGoalShotEvent(row)) return;

      const payload = row.payload || {};
      const goalkeeper = payload.active_goalkeeper || payload.goalkeeper || {};
      const analysisId = String(row.analysis_id || '');
      const goalkeeperTrackingId = String(row.active_goalkeeper_player_id || goalkeeper.player_id || goalkeeper.id || '').trim();
      const goalkeeperNameKey = normalizeName(row.active_goalkeeper_name || goalkeeper.name || goalkeeper.detected_name || '');
      const jugadorId = playerIdByTrackingKey.get(`${analysisId}:${goalkeeperTrackingId}`)
        || playerIdByNameKey.get(`${analysisId}:${goalkeeperNameKey}`);
      if (!jugadorId) return;

      const x = numberOrNull(row.x_m ?? payload.x ?? payload.shot?.x);
      const y = numberOrNull(row.y_m ?? payload.y ?? payload.shot?.y);
      if (x === null || y === null) return;

      const pitch = pitchForAnalysis(row.tracking_analyses || {});
      const goalkeeperSideSource = {
        team: row.active_goalkeeper_team || goalkeeper.team || '',
        own_side: goalkeeper.own_side || goalkeeper.ownSide || '',
        metrics: {},
        tracking_analyses: row.tracking_analyses || {}
      };
      const goal = orientPointDefenseToAttack({
        x,
        y,
        order: row.event_order ?? payload.order ?? payload.goal_number ?? index + 1,
        match_id: row.tracking_analyses?.partido_id || row.partido_id || null,
        date: row.tracking_analyses?.partidos?.fecha || null,
        pitch_width_m: pitch.width,
        pitch_height_m: pitch.height,
        shooter_name: row.detected_name || row.source_name || payload.name || payload.player?.name || payload.shooter?.name || '',
        team: row.team || payload.team || '',
        review_seconds: row.review_seconds ?? payload.review_seconds ?? null,
        match_seconds: row.match_seconds ?? payload.match_seconds ?? null,
        source: 'tracking_shot_events'
      }, goalkeeperSideSource, row.tracking_analyses || {}, pitch);

      const key = String(jugadorId);
      if (!goalsByPlayer.has(key)) goalsByPlayer.set(key, []);
      if (goal) goalsByPlayer.get(key).push(goal);
    });

    goalsByPlayer.forEach(goals => {
      goals.sort((a, b) => {
        const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCompare !== 0) return dateCompare;
        return toNumber(a.match_seconds ?? a.review_seconds, 0) - toNumber(b.match_seconds ?? b.review_seconds, 0);
      });
    });

    return goalsByPlayer;
  }

  function advancedDefenseFromRows(eventRows, assignmentRows, fallback = {}) {
    if (!Array.isArray(eventRows) || !eventRows.length) return fallback || {};
    const assignmentsByEvent = (assignmentRows || []).reduce((acc, row) => {
      const key = String(row.event_key || '');
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push({
        ...(row.payload || {}),
        player_id: row.player_id || row.payload?.player_id,
        name: row.detected_name || row.payload?.name,
        team: row.team || row.payload?.team,
        role: row.role || row.payload?.role,
        event_type: row.event_type || row.payload?.event_type,
        blame: row.blame ?? row.payload?.blame,
        capped_blame: row.capped_blame ?? row.payload?.capped_blame,
        bonus: row.bonus ?? row.payload?.bonus,
        distance_m: row.distance_m ?? row.payload?.distance_m,
        nearest: row.nearest ?? row.payload?.nearest,
        outnumbered: row.outnumbered ?? row.payload?.outnumbered,
        advantage: row.advantage ?? row.payload?.advantage,
        return_toward_own_goal_mps: row.return_toward_own_goal_mps ?? row.payload?.return_toward_own_goal_mps,
        shot_distance_to_goal_m: row.shot_distance_to_goal_m ?? row.payload?.shot_distance_to_goal_m,
        reason: row.reason || row.payload?.reason
      });
      return acc;
    }, new Map());
    const events = eventRows
      .slice()
      .sort((a, b) => toNumber(a.event_order, 0) - toNumber(b.event_order, 0) || toNumber(a.sam3_seconds, 0) - toNumber(b.sam3_seconds, 0))
      .map(row => {
        const key = String(row.event_key || '');
        return {
          ...(row.payload || {}),
          event_id: row.payload?.event_id || key,
          type: row.event_type || row.payload?.type,
          order: row.event_order ?? row.payload?.order,
          sam3_seconds: row.sam3_seconds ?? row.payload?.sam3_seconds,
          match_seconds: row.match_seconds ?? row.payload?.match_seconds,
          attacking_team: row.attacking_team || row.payload?.attacking_team,
          defending_team: row.defending_team || row.payload?.defending_team,
          shooter: row.payload?.shooter || {
            player_id: row.shooter_player_id,
            name: row.shooter_name,
            team: row.shooter_team
          },
          shot: row.payload?.shot || {
            x: row.shot_x_m,
            y: row.shot_y_m
          },
          weighting: {
            ...(row.payload?.weighting || {}),
            total_blame: row.total_blame ?? row.payload?.weighting?.total_blame,
            shot_distance_to_goal_m: row.shot_distance_to_goal_m ?? row.payload?.weighting?.shot_distance_to_goal_m
          },
          context: {
            ...(row.payload?.context || {}),
            state: row.context_state || row.payload?.context?.state,
            advantage: row.local_advantage ?? row.payload?.context?.advantage,
            phase: row.payload?.context?.phase || {
              phase: row.phase,
              phase_label: row.phase_label
            }
          },
          assignments: assignmentsByEvent.get(key) || row.payload?.assignments || []
        };
      });
    return {
      ...(fallback || {}),
      events
    };
  }

  function levenshtein(a, b) {
    const left = normalizeName(a);
    const right = normalizeName(b);
    if (!left && !right) return 0;
    if (!left || !right) return Math.max(left.length, right.length);

    const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
    for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;

    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[left.length][right.length];
  }

  function nameSimilarity(a, b) {
    const left = normalizeName(a);
    const right = normalizeName(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.9;
    const distance = levenshtein(left, right);
    return Math.max(0, 1 - distance / Math.max(left.length, right.length));
  }

  function speedMpsToKmh(value) {
    return round(toNumber(value, 0) * 3.6, 2);
  }

  function computePulmonTracking(player, durationSeconds) {
    const field = player.field_role || player;
    const goalkeeper = player.goalkeeper_role || {};
    const goalkeeperSeconds = toNumber(
      goalkeeper.total_seconds ?? player.goalkeeper_seconds,
      0
    );
    const fallbackSeconds = Math.max(0, toNumber(durationSeconds, 0) - goalkeeperSeconds);
    const validSeconds = toNumber(field.valid_seconds ?? player.valid_seconds, fallbackSeconds);
    const minutes = Math.max(validSeconds / 60, 1);
    const distancePerMin = toNumber(field.distance_m ?? player.distance_m, 0) / minutes;
    const highIntensityPerMin = toNumber(field.high_intensity_seconds ?? player.high_intensity_seconds, 0) / minutes;
    const sprintsPerMin = toNumber(field.sprints ?? player.sprints, 0) / minutes;
    const recovery = toNumber((field.recovery_after_sprint || player.recovery_after_sprint || {}).avg_seconds, 45);
    const fatigueDrop = Math.max(0, toNumber((field.fatigue || player.fatigue || {}).drop_pct, 0));

    const distanceScore = Math.min(100, (distancePerMin / 115) * 100);
    const highScore = Math.min(100, (highIntensityPerMin / 0.35) * 100);
    const sprintScore = Math.min(100, (sprintsPerMin / 0.08) * 100);
    const recoveryScore = Math.max(0, Math.min(100, 100 - recovery * 1.1));
    const fatigueScore = Math.max(0, 100 - fatigueDrop * 1.5);

    return round(
      distanceScore * 0.36 +
      highScore * 0.24 +
      sprintScore * 0.18 +
      recoveryScore * 0.12 +
      fatigueScore * 0.10,
      1
    );
  }

  function normalizeHeatmap(heatmap) {
    const counts = heatmap?.counts || [];
    if (!Array.isArray(counts) || counts.length === 0) {
      return { x_bins: 0, y_bins: 0, counts: [], flat: [], total: 0 };
    }
    const yBins = counts.length;
    const xBins = Math.max(...counts.map(row => Array.isArray(row) ? row.length : 0), 0);
    const flat = [];
    let total = 0;
    counts.forEach(row => {
      for (let x = 0; x < xBins; x += 1) {
        const value = toNumber(row?.[x], 0);
        flat.push(value);
        total += value;
      }
    });
    return { x_bins: heatmap.x_bins || xBins, y_bins: heatmap.y_bins || yBins, counts, flat, total };
  }

  function normalizePitchSide(side) {
    const value = normalizeName(side);
    if (value.includes('left') || value.includes('izq')) return 'left';
    if (value.includes('right') || value.includes('der')) return 'right';
    return '';
  }

  function oppositePitchSide(side) {
    const normalized = normalizePitchSide(side);
    if (normalized === 'left') return 'right';
    if (normalized === 'right') return 'left';
    return '';
  }

  function ownSideFromTeamOwnSides(teamOwnSides = {}, team = '') {
    const key = String(team || '').toUpperCase();
    if (!key || !teamOwnSides || typeof teamOwnSides !== 'object') return '';
    const sideInfo = teamOwnSides[key] || teamOwnSides[key.toLowerCase()] || {};
    return normalizePitchSide(sideInfo.own_side || sideInfo.ownSide || sideInfo.side);
  }

  function resolveOwnSideForPlayer(player = {}, context = {}) {
    const metrics = player.metrics || {};
    const fieldSide = player.field_side || metrics.field_side || {};
    const team = player.team || metrics.team || context.team || '';
    const candidates = [
      player.own_side,
      player.ownSide,
      metrics.own_side,
      metrics.ownSide,
      fieldSide.own_side,
      fieldSide.ownSide,
      ownSideFromTeamOwnSides(player.team_own_sides, team),
      ownSideFromTeamOwnSides(player.tracking_analyses?.team_own_sides, team),
      ownSideFromTeamOwnSides(context.team_own_sides, team),
      ownSideFromTeamOwnSides(context.raw?.team_own_sides, team),
      ownSideFromTeamOwnSides(context.tracking_analyses?.team_own_sides, team)
    ];
    return candidates.map(normalizePitchSide).find(Boolean) || '';
  }

  function resolveRivalSideForPlayer(player = {}, context = {}) {
    const metrics = player.metrics || {};
    const fieldSide = player.field_side || metrics.field_side || {};
    return normalizePitchSide(player.rival_side || player.rivalSide || metrics.rival_side || metrics.rivalSide || fieldSide.rival_side || fieldSide.rivalSide)
      || oppositePitchSide(resolveOwnSideForPlayer(player, context));
  }

  function heatmapCountsForOrientation(normalized) {
    const yBins = normalized.counts.length;
    const xBins = Math.max(normalized.x_bins, ...normalized.counts.map(row => Array.isArray(row) ? row.length : 0), 0);
    return Array.from({ length: yBins }, (_, y) => (
      Array.from({ length: xBins }, (_, x) => toNumber(normalized.counts[y]?.[x], 0))
    ));
  }

  function orientHeatmapDefenseToAttack(heatmap, player = {}, context = {}) {
    if (!heatmap || heatmap.orientation === 'defense_to_attack') return heatmap || null;
    const normalized = normalizeHeatmap(heatmap);
    if (!normalized.total || !normalized.counts.length) return heatmap;
    const ownSide = resolveOwnSideForPlayer(player, context);
    if (!ownSide) return heatmap;

    const counts = heatmapCountsForOrientation(normalized);
    return {
      ...heatmap,
      counts: ownSide === 'right' ? counts.map(row => row.slice().reverse()) : counts,
      x_bins: counts[0]?.length || normalized.x_bins,
      y_bins: counts.length || normalized.y_bins,
      orientation: 'defense_to_attack',
      source_own_side: ownSide
    };
  }

  function orientPointDefenseToAttack(point, player = {}, context = {}, pitch = DEFAULT_PITCH) {
    if (!point) return null;
    const contextPitch = pitchForAnalysis(context || {});
    const sourcePitch = {
      width: toNumber(point.pitch_width_m ?? point.pitch?.width ?? contextPitch.width, pitch.width),
      height: toNumber(point.pitch_height_m ?? point.pitch?.height ?? contextPitch.height, pitch.height)
    };
    const ownSide = resolveOwnSideForPlayer(player, context);
    const base = {
      ...point,
      pitch_width_m: sourcePitch.width,
      pitch_height_m: sourcePitch.height
    };

    if (!ownSide || point.orientation === 'defense_to_attack') {
      return base;
    }

    const ratioX = coordinateRatio(point.x ?? point.avg_x_m, sourcePitch.width, point.coordinate_system);
    const ratioY = coordinateRatio(point.y ?? point.avg_y_m, sourcePitch.height, point.coordinate_system);
    const normalizedX = ownSide === 'right' ? 1 - ratioX : ratioX;

    return {
      ...base,
      x: round(normalizedX * sourcePitch.width, 3),
      y: round(ratioY * sourcePitch.height, 3),
      coordinate_system: 'meters',
      orientation: 'defense_to_attack',
      source_own_side: ownSide
    };
  }

  function pitchFromRaw(raw = {}) {
    return {
      width: toNumber(raw.pitch?.width ?? raw.pitch_width_m, DEFAULT_PITCH.width),
      height: toNumber(raw.pitch?.height ?? raw.pitch_height_m, DEFAULT_PITCH.height)
    };
  }

  function pitchForAnalysis(analysis = {}) {
    return {
      width: toNumber(analysis.pitch_width_m ?? analysis.pitch?.width, DEFAULT_PITCH.width),
      height: toNumber(analysis.pitch_height_m ?? analysis.pitch?.height, DEFAULT_PITCH.height)
    };
  }

  function heatmapDominantPosition(heatmap, pitch = DEFAULT_PITCH) {
    const normalized = normalizeHeatmap(heatmap);
    if (!normalized.total || !normalized.flat.length) return null;

    const maxValue = Math.max(...normalized.flat);
    if (maxValue <= 0) return null;

    const cells = [];
    normalized.counts.forEach((row, y) => {
      row.forEach((value, x) => {
        const n = toNumber(value, 0);
        if (n <= 0) return;
        cells.push({
          x,
          y,
          value: n,
          center_x_m: ((x + 0.5) / Math.max(normalized.x_bins, 1)) * pitch.width,
          center_y_m: ((y + 0.5) / Math.max(normalized.y_bins, 1)) * pitch.height
        });
      });
    });
    if (!cells.length) return null;

    const threshold = maxValue * 0.62;
    let selected = cells.filter(cell => cell.value >= threshold);
    if (selected.length < 3) {
      selected = [...cells].sort((a, b) => b.value - a.value).slice(0, Math.min(4, cells.length));
    } else {
      const maxCells = Math.max(3, Math.ceil(cells.length * 0.18));
      selected = selected.sort((a, b) => b.value - a.value).slice(0, maxCells);
    }

    const weightSum = selected.reduce((sum, cell) => sum + cell.value, 0);
    if (!weightSum) return null;
    return {
      x: round(selected.reduce((sum, cell) => sum + cell.center_x_m * cell.value, 0) / weightSum, 3),
      y: round(selected.reduce((sum, cell) => sum + cell.center_y_m * cell.value, 0) / weightSum, 3),
      source: 'heatmap_hotspot'
    };
  }

  function playerFieldMetrics(player = {}, durationSeconds = 0) {
    const metrics = player.metrics || {};
    const duration = toNumber(durationSeconds, 0);
    const goalkeeperSeconds = toNumber(player.goalkeeper_seconds ?? metrics.goalkeeper_seconds, 0);
    const explicitFieldSeconds = [
      player.field_seconds,
      metrics.field_seconds,
      player.valid_seconds,
      metrics.valid_seconds
    ].map(value => Number(value)).find(value => Number.isFinite(value) && value > 0);
    const fieldSeconds = explicitFieldSeconds !== undefined
      ? explicitFieldSeconds
      : Math.max(0, duration - goalkeeperSeconds);
    const distanceM = toNumber(
      player.distance_m ?? metrics.distance_m,
      toNumber(player.distance_km ?? metrics.distance_km, 0) * 1000
    );
    const fieldMinutes = fieldSeconds / 60;
    const distancePerFieldMin = fieldMinutes > 0 ? distanceM / fieldMinutes : 0;

    return {
      field_seconds: round(fieldSeconds, 2),
      field_minutes: round(fieldMinutes, 2),
      field_distance_m: round(distanceM, 2),
      distance_per_field_min: round(distancePerFieldMin, 2),
      distance_per_40_min_km: round((distancePerFieldMin * 40) / 1000, 2)
    };
  }

  function playerDisplayPosition(player = {}, pitch = DEFAULT_PITCH) {
    const metrics = player.metrics || {};
    const direct = player.dominant_position_m || metrics.dominant_position_m || player.heatmap_position_m || metrics.heatmap_position_m;
    if (direct && Number.isFinite(Number(direct.x)) && Number.isFinite(Number(direct.y))) return direct;
    const fromHeatmap = heatmapDominantPosition(player.heatmap || metrics.heatmap, pitch);
    if (fromHeatmap) return fromHeatmap;
    const avgX = Number(player.avg_x_m ?? metrics.avg_x_m);
    const avgY = Number(player.avg_y_m ?? metrics.avg_y_m);
    if (Number.isFinite(avgX) && Number.isFinite(avgY)) return { x: avgX, y: avgY, source: 'avg_position' };
    return { x: pitch.width / 2, y: pitch.height / 2, source: 'fallback_center' };
  }

  function pitchZoneLabel(point, pitch = DEFAULT_PITCH) {
    const x = clamp(toNumber(point?.x, pitch.width / 2), 0, pitch.width);
    const y = clamp(toNumber(point?.y, pitch.height / 2), 0, pitch.height);
    const third = x < pitch.width / 3 ? 'izquierda' : (x > (pitch.width * 2) / 3 ? 'derecha' : 'centro');
    const lane = y < pitch.height / 3 ? 'arriba' : (y > (pitch.height * 2) / 3 ? 'abajo' : 'medio');
    return `${third} / ${lane}`;
  }

  function teamUiLabel(team) {
    const key = String(team || '').toUpperCase();
    if (key === 'A') return 'Equipo 1 (A)';
    if (key === 'B') return 'Equipo 2 (B)';
    return `Equipo ${key || '-'}`;
  }

  function normalizeTeamSide(side) {
    return normalizePitchSide(side);
  }

  function attackDirectionFromOwnSide(ownSide) {
    const side = normalizeTeamSide(ownSide);
    if (side === 'left') return 'right';
    if (side === 'right') return 'left';
    return '';
  }

  function attackDirectionForTeam(details = {}, team) {
    const key = String(team || '').toUpperCase();
    const sideInfo = details?.analysis?.team_own_sides?.[key]
      || details?.team_own_sides?.[key]
      || details?.raw?.team_own_sides?.[key]
      || {};
    return attackDirectionFromOwnSide(sideInfo.own_side || sideInfo.ownSide);
  }

  function attackDirectionLabel(direction) {
    if (direction === 'left') return 'Ataca a la izquierda';
    if (direction === 'right') return 'Ataca a la derecha';
    return 'Ataque sin lado';
  }

  function heatmapOverlap(heatmapA, heatmapB) {
    const a = normalizeHeatmap(heatmapA);
    const b = normalizeHeatmap(heatmapB);
    if (!a.total || !b.total) return 0;
    const len = Math.min(a.flat.length, b.flat.length);
    let overlap = 0;
    for (let i = 0; i < len; i += 1) {
      overlap += Math.min(a.flat[i] / a.total, b.flat[i] / b.total);
    }
    return round(overlap * 100, 2);
  }

  function combineHeatmaps(heatmaps) {
    const normalized = heatmaps.map(normalizeHeatmap).filter(h => h.counts.length > 0);
    if (normalized.length === 0) return null;
    const yBins = normalized[0].y_bins || normalized[0].counts.length;
    const xBins = normalized[0].x_bins || normalized[0].counts[0]?.length || 0;
    const counts = Array.from({ length: yBins }, () => Array(xBins).fill(0));
    normalized.forEach(heatmap => {
      for (let y = 0; y < yBins; y += 1) {
        for (let x = 0; x < xBins; x += 1) {
          counts[y][x] += toNumber(heatmap.counts[y]?.[x], 0);
        }
      }
    });
    return { x_bins: xBins, y_bins: yBins, counts };
  }

  function averageHeatmaps(heatmaps) {
    const normalized = heatmaps.map(normalizeHeatmap).filter(h => h.counts.length > 0);
    const combined = combineHeatmaps(heatmaps);
    if (!combined || !normalized.length) return null;
    return {
      x_bins: combined.x_bins,
      y_bins: combined.y_bins,
      counts: combined.counts.map(row => row.map(value => round(value / normalized.length, 3)))
    };
  }

  function heatmapCoveragePct(heatmap, thresholdRatio = 0.01) {
    const normalized = normalizeHeatmap(heatmap);
    if (!normalized.total || !normalized.flat.length) return 0;
    const maxValue = Math.max(...normalized.flat);
    if (maxValue <= 0) return 0;
    const threshold = maxValue * thresholdRatio;
    const active = normalized.flat.filter(value => value > threshold).length;
    return round((active / normalized.flat.length) * 100, 2);
  }

  function teamHeatmapOverlap(players) {
    const heatmaps = players.map(player => player.tracking?.heatmap || player.heatmap).filter(Boolean);
    if (heatmaps.length < 2) return 0;
    let total = 0;
    let count = 0;
    for (let i = 0; i < heatmaps.length; i += 1) {
      for (let j = i + 1; j < heatmaps.length; j += 1) {
        total += heatmapOverlap(heatmaps[i], heatmaps[j]);
        count += 1;
      }
    }
    return count > 0 ? round(total / count, 2) : 0;
  }

  function windowStartSeconds(window = {}) {
    return toNumber(window.start_seconds ?? window.start ?? window.t0 ?? window.from_seconds, 0);
  }

  function windowEndSeconds(window = {}, fallbackStart = 0, fallbackSize = 300) {
    return toNumber(
      window.end_seconds ?? window.end ?? window.t1 ?? window.to_seconds,
      fallbackStart + fallbackSize
    );
  }

  function windowDistanceMeters(window = {}) {
    const km = Number(window.distance_km ?? window.km);
    if (Number.isFinite(km) && km > 0) return km * 1000;
    return toNumber(
      window.distance_m ?? window.total_distance_m ?? window.field_distance_m ?? window.meters ?? window.distance,
      0
    );
  }

  function windowHighIntensitySeconds(window = {}) {
    return toNumber(
      window.high_intensity_seconds ?? window.high_intensity ?? window.high_seconds ?? window.sprint_seconds,
      0
    );
  }

  function playerWindows(player = {}) {
    const metrics = player.metrics || {};
    const windows = player.windows || metrics.windows || player.field_windows || metrics.field_windows || [];
    return Array.isArray(windows) ? windows : [];
  }

  function overlapSeconds(aStart, aEnd, bStart, bEnd) {
    return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
  }

  function goalkeeperOverlapSeconds(player = {}, startSeconds = 0, endSeconds = 0) {
    const episodes = player.goalkeeper_episodes || player.metrics?.goalkeeper_episodes || [];
    if (!Array.isArray(episodes) || !episodes.length) return 0;
    return episodes.reduce((sum, episode) => {
      const start = toNumber(episode.start_seconds ?? episode.start ?? episode.t0, 0);
      const end = toNumber(episode.end_seconds ?? episode.end ?? episode.t1, start);
      return sum + overlapSeconds(startSeconds, endSeconds, start, end);
    }, 0);
  }

  function timelineWindowTemplates(details = {}, fallbackSize = 300) {
    const explicit = (details.players || []).flatMap(player => playerWindows(player))
      .concat(Array.isArray(details.temporal?.windows) ? details.temporal.windows : []);
    const windows = explicit
      .map(window => {
        const start = windowStartSeconds(window);
        const end = windowEndSeconds(window, start, fallbackSize);
        return end > start ? { start_seconds: start, end_seconds: end } : null;
      })
      .filter(Boolean);
    const unique = new Map(windows.map(window => [`${window.start_seconds}:${window.end_seconds}`, window]));
    if (unique.size) {
      return [...unique.values()].sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds);
    }

    const duration = toNumber(details.analysis?.duration_seconds, 0);
    if (!duration) return [];
    const generated = [];
    for (let start = 0; start < duration; start += fallbackSize) {
      generated.push({ start_seconds: start, end_seconds: Math.min(duration, start + fallbackSize) });
    }
    return generated;
  }

  function buildTeamPulmonWindowSeries(details = {}) {
    const templates = timelineWindowTemplates(details);
    if (!templates.length) return [];

    const series = templates.map(window => ({
      start_seconds: window.start_seconds,
      end_seconds: window.end_seconds,
      teams: {
        A: { distance_m: 0, high_intensity_seconds: 0, field_seconds: 0, players: 0, estimated_distance: false },
        B: { distance_m: 0, high_intensity_seconds: 0, field_seconds: 0, players: 0, estimated_distance: false }
      }
    }));
    const indexByWindow = new Map(series.map((window, index) => [`${window.start_seconds}:${window.end_seconds}`, index]));
    const duration = toNumber(details.analysis?.duration_seconds, 0);

    (details.players || []).forEach(player => {
      const team = String(player.team || '').toUpperCase() === 'B' ? 'B' : 'A';
      const windows = playerWindows(player);
      const sourceWindows = windows.length ? windows : templates;
      const hasDistance = sourceWindows.some(window => windowDistanceMeters(window) > 0);
      const playerMetrics = playerFieldMetrics(player, duration);
      const weights = sourceWindows.map(window => {
        const start = windowStartSeconds(window);
        const end = windowEndSeconds(window, start);
        const totalSeconds = Math.max(0, end - start);
        const fieldSeconds = Math.max(0, totalSeconds - goalkeeperOverlapSeconds(player, start, end));
        return {
          start,
          end,
          fieldSeconds,
          highIntensity: Math.min(fieldSeconds, windowHighIntensitySeconds(window)),
          distance: windowDistanceMeters(window)
        };
      });
      const totalWeight = weights.reduce((sum, item) => sum + (item.highIntensity * 3) + item.fieldSeconds, 0);

      weights.forEach(item => {
        if (item.end <= item.start || item.fieldSeconds <= 0) return;
        const key = `${item.start}:${item.end}`;
        const bucketIndex = indexByWindow.get(key);
        if (bucketIndex === undefined) return;
        const bucket = series[bucketIndex].teams[team];
        const fallbackDistance = !hasDistance && totalWeight > 0
          ? playerMetrics.field_distance_m * (((item.highIntensity * 3) + item.fieldSeconds) / totalWeight)
          : 0;
        const distance = hasDistance ? item.distance : fallbackDistance;
        bucket.distance_m += distance;
        bucket.high_intensity_seconds += item.highIntensity;
        bucket.field_seconds += item.fieldSeconds;
        bucket.players += 1;
        bucket.estimated_distance = bucket.estimated_distance || (!hasDistance && distance > 0);
      });
    });

    return series.map(window => {
      Object.values(window.teams).forEach(team => {
        team.distance_m = round(team.distance_m, 1);
        team.high_intensity_seconds = round(team.high_intensity_seconds, 1);
        team.field_seconds = round(team.field_seconds, 1);
        team.km_per_40 = team.field_seconds > 0
          ? round((team.distance_m / 1000) / (team.field_seconds / 2400), 2)
          : 0;
      });
      return window;
    });
  }

  function advancedDefenseFromRaw(raw) {
    const direct = raw?.advanced_defense || raw?.review_analysis?.advanced_defense || {};
    return direct && typeof direct === 'object' ? direct : {};
  }

  function advancedDefenseForPlayer(rawPlayer, raw) {
    const direct = rawPlayer?.advanced_defense || rawPlayer?.metrics?.advanced_defense || {};
    if (direct && typeof direct === 'object' && direct.score !== undefined) return direct;
    const advanced = advancedDefenseFromRaw(raw);
    const rows = Array.isArray(advanced.players) ? advanced.players : [];
    const playerId = String(rawPlayer?.player_id || rawPlayer?.id || '');
    const nameKey = normalizeName(rawPlayer?.name || rawPlayer?.detected_name || '');
    return rows.find(row => String(row.player_id || '') === playerId)
      || rows.find(row => normalizeName(row.name || '') === nameKey)
      || {};
  }

  function goalLocationEventsFromRaw(raw) {
    const candidates = [
      raw?.shot_map?.events,
      raw?.review_analysis?.shot_map?.events,
      raw?.shot_map?.goals,
      raw?.review_analysis?.shot_map?.goals
    ];
    const events = candidates.flatMap(items => Array.isArray(items) ? items : []);
    const seen = new Set();
    return events
      .filter(event => {
        const type = normalizeName(event?.type || event?.event_type || '');
        const outcome = normalizeName(event?.outcome || event?.result || '');
        return type === 'goal' || outcome === 'goal' || type.includes('gol') || outcome.includes('gol');
      })
      .filter(event => {
        const key = [
          event.player_id || event.player?.player_id || event.shooter?.player_id || normalizeName(event.name || event.player?.name || event.shooter?.name || ''),
          event.order ?? event.goal_number ?? event.index ?? '',
          event.match_seconds ?? event.review_seconds ?? event.sam3_seconds ?? event.seconds ?? '',
          event.x ?? event.position?.x ?? event.location?.x ?? '',
          event.y ?? event.position?.y ?? event.location?.y ?? ''
        ].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function goalLocationsForPlayer(rawPlayer, raw, playerContext = {}) {
    const playerId = String(rawPlayer?.player_id || rawPlayer?.id || '');
    const nameKey = normalizeName(rawPlayer?.name || rawPlayer?.detected_name || '');
    const pitch = pitchFromRaw(raw);
    return goalLocationEventsFromRaw(raw)
      .filter(event => {
        const eventPlayerId = String(event.player_id || event.player?.player_id || event.shooter?.player_id || '');
        const eventName = normalizeName(event.name || event.player?.name || event.shooter?.name || '');
        return (playerId && eventPlayerId === playerId) || (nameKey && eventName === nameKey);
      })
      .map(event => {
        const rawX = event.x ?? event.position?.x ?? event.location?.x;
        const rawY = event.y ?? event.position?.y ?? event.location?.y;
        const x = Number(rawX);
        const y = Number(rawY);
        const location = {
          order: event.order ?? event.goal_number ?? event.index ?? null,
          seconds: toNumber(event.match_seconds ?? event.review_seconds ?? event.sam3_seconds ?? event.seconds, 0),
          x: Number.isFinite(x) ? round(x, 3) : NaN,
          y: Number.isFinite(y) ? round(y, 3) : NaN,
          pitch_width_m: pitch.width,
          pitch_height_m: pitch.height,
          coordinate_system: event.coordinate_system || event.position_units || event.units || '',
          team: event.team || event.player?.team || event.shooter?.team || '',
          goalkeeper: event.active_goalkeeper || event.goalkeeper || null,
          source: event.position_source || event.source || '',
          linked: Boolean(event.linked),
          estimated: Boolean(event.estimated)
        };
        return orientPointDefenseToAttack(location, playerContext, raw, pitch);
      })
      .filter(event => Number.isFinite(event.x) && Number.isFinite(event.y));
  }

  function normalizePlayer(rawPlayer, raw) {
    const field = rawPlayer.field_role || rawPlayer;
    const goalkeeper = rawPlayer.goalkeeper_role || {};
    const fieldSide = rawPlayer.field_side || {};
    const team = String(rawPlayer.team || field.team || '').toUpperCase();
    const sideSource = {
      ...rawPlayer,
      team,
      field_side: fieldSide,
      metrics: {
        ...(rawPlayer.metrics || {}),
        ...(field.metrics || {})
      }
    };
    const ownSide = resolveOwnSideForPlayer(sideSource, raw);
    const rivalSide = resolveRivalSideForPlayer(sideSource, raw);
    const duration = toNumber(raw.duration_seconds ?? raw.config?.duration_seconds, 0);
    const pitch = pitchFromRaw(raw);
    const heatmap = field.heatmap || rawPlayer.heatmap || null;
    const speedDistribution = field.speed_distribution_pct || rawPlayer.speed_distribution_pct || {};
    const defense = rawPlayer.defense || rawPlayer.metrics?.defense || {};
    const defenseScore = defense?.defense_score !== undefined ? toNumber(defense.defense_score, 0) : null;
    const advancedDefense = advancedDefenseForPlayer(rawPlayer, raw);
    const advancedDefenseScore = advancedDefense?.score !== undefined ? toNumber(advancedDefense.score, 0) : null;
    const physicalProfile = rawPlayer.physical_profile || rawPlayer.metrics?.physical_profile || {};
    const pulmonVector = rawPlayer.pulmon || physicalProfile || {};
    const computedPulmon = computePulmonTracking(rawPlayer, duration);
    const pulmonTracking = toNumber(
      pulmonVector.fis ?? pulmonVector.fis_v1 ?? physicalProfile.fis,
      computedPulmon
    );
    const fisVersion = pulmonVector.fis_version || physicalProfile.fis_version || rawPlayer.fis_version || '';
    const robustSpeedMps = toNumber(
      field.speed_peak_mps ?? field.speed_max_mps ?? rawPlayer.speed_peak_mps ?? rawPlayer.speed_p95_mps,
      0
    );
    const avgPosition = field.avg_position || rawPlayer.avg_position || {};
    const goalLocations = goalLocationsForPlayer(rawPlayer, raw, {
      ...sideSource,
      own_side: ownSide,
      rival_side: rivalSide
    });
    const goalkeeperSeconds = round(toNumber(goalkeeper.total_seconds, 0), 2);
    const fieldMetrics = playerFieldMetrics({
      distance_m: field.distance_m ?? rawPlayer.distance_m,
      distance_km: field.distance_km ?? rawPlayer.distance_km,
      goalkeeper_seconds: goalkeeperSeconds,
      valid_seconds: field.valid_seconds ?? rawPlayer.valid_seconds
    }, duration);
    const dominantPosition = heatmapDominantPosition(heatmap, pitch) || {
      x: toNumber(avgPosition.x, pitch.width / 2),
      y: toNumber(avgPosition.y, pitch.height / 2),
      source: 'avg_position'
    };

    return {
      player_id: String(rawPlayer.player_id || rawPlayer.id || rawPlayer.name || ''),
      detected_name: String(rawPlayer.name || rawPlayer.detected_name || rawPlayer.player_id || ''),
      team,
      distance_km: round(toNumber(field.distance_km ?? rawPlayer.distance_km, 0), 3),
      distance_m: round(toNumber(field.distance_m ?? rawPlayer.distance_m, 0), 2),
      avg_speed_kmh: speedMpsToKmh(field.speed_avg_mps ?? rawPlayer.speed_avg_mps),
      max_speed_kmh: speedMpsToKmh(robustSpeedMps),
      raw_max_speed_kmh: speedMpsToKmh(rawPlayer.raw_speed_max_mps ?? field.raw_speed_max_mps ?? robustSpeedMps),
      sprints: toNumber(field.sprints ?? rawPlayer.sprints, 0),
      high_intensity_seconds: round(toNumber(field.high_intensity_seconds ?? rawPlayer.high_intensity_seconds, 0), 2),
      accel_max_mps2: round(toNumber(field.accel_max_mps2 ?? rawPlayer.accel_max_mps2, 0), 3),
      decel_max_mps2: round(toNumber(field.decel_max_mps2 ?? rawPlayer.decel_max_mps2, 0), 3),
      turns_gt_90: toNumber(field.turns_gt_90 ?? rawPlayer.turns_gt_90, 0),
      metabolic_load_index: round(toNumber(field.metabolic_load_index ?? rawPlayer.metabolic_load_index, 0), 2),
      goalkeeper_seconds: goalkeeperSeconds,
      goalkeeper_episodes: goalkeeper.episodes || [],
      field_seconds: fieldMetrics.field_seconds,
      field_minutes: fieldMetrics.field_minutes,
      distance_per_field_min: fieldMetrics.distance_per_field_min,
      distance_per_40_min_km: fieldMetrics.distance_per_40_min_km,
      own_half_pct: round(toNumber(fieldSide.own_pct, 0), 2),
      rival_half_pct: round(toNumber(fieldSide.rival_pct, 0), 2),
      own_side: ownSide,
      rival_side: rivalSide,
      avg_x_m: round(toNumber(avgPosition.x, 0), 3),
      avg_y_m: round(toNumber(avgPosition.y, 0), 3),
      dominant_position_m: dominantPosition,
      dispersion_m: round(toNumber(field.dispersion_m ?? rawPlayer.dispersion_m, 0), 3),
      coverage_pct: round(toNumber(field.coverage_pct ?? rawPlayer.coverage_pct ?? heatmapCoveragePct(heatmap), 0), 2),
      speed_distribution: speedDistribution,
      windows: field.windows || rawPlayer.windows || [],
      heatmap,
      heatmap_windows: field.heatmap_windows || rawPlayer.heatmap_windows || [],
      fatigue: field.fatigue || rawPlayer.fatigue || {},
      recovery: field.recovery_after_sprint || rawPlayer.recovery_after_sprint || {},
      directionality: field.directionality || rawPlayer.directionality || {},
      lane_distribution: field.lane_distribution_pct || rawPlayer.lane_distribution_pct || {},
      highlights: rawPlayer.highlights || field.highlights || {},
      defense,
      defense_score: defenseScore,
      defense_score_method: defense.defense_score_method || defense.method || '',
      advanced_defense: advancedDefense,
      advanced_defense_score: advancedDefenseScore,
      advanced_defense_axes: advancedDefense.axes || {},
      physical_profile: physicalProfile,
      pulmon: pulmonVector,
      fis_valor: pulmonTracking,
      fis_version: fisVersion,
      pulmon_tracking: pulmonTracking,
      goal_locations: goalLocations
    };
  }

  function normalizeFootballDetectorStats(raw) {
    if (!raw || !Array.isArray(raw.players) || raw.players.length === 0) {
      throw new Error('El JSON no tiene players. Carga el t5_player_stats.json exportado por Football Detector.');
    }

    const players = raw.players.map(player => normalizePlayer(player, raw));
    const pitch = {
      width: toNumber(raw.pitch?.width, DEFAULT_PITCH.width),
      height: toNumber(raw.pitch?.height, DEFAULT_PITCH.height)
    };

    const teams = Object.values(players.reduce((acc, player) => {
      const key = player.team || 'SIN';
      if (!acc[key]) {
        acc[key] = {
          team: key,
          players: 0,
          distance_km: 0,
          high_intensity_seconds: 0,
          pulmon_tracking_avg: 0,
          coverage_pct: 0,
          overlap_pct: 0
        };
      }
      acc[key].players += 1;
      acc[key].distance_km += player.distance_km;
      acc[key].high_intensity_seconds += player.high_intensity_seconds;
      acc[key].pulmon_tracking_avg += player.pulmon_tracking;
      return acc;
    }, {})).map(team => {
      const teamPlayers = players.filter(player => (player.team || 'SIN') === team.team);
      const combined = combineHeatmaps(teamPlayers.map(player => player.heatmap).filter(Boolean));
      return {
        ...team,
        distance_km: round(team.distance_km, 2),
        high_intensity_seconds: round(team.high_intensity_seconds, 1),
        pulmon_tracking_avg: round(team.pulmon_tracking_avg / Math.max(team.players, 1), 1),
        coverage_pct: heatmapCoveragePct(combined),
        overlap_pct: teamHeatmapOverlap(teamPlayers)
      };
    });

    const reviewAnalysis = raw.review_analysis || {};
    const matchLink = raw.match_link || raw.t5_export?.match_link || {
      review_json_path: raw.config?.review_json_path || '',
      review_link: reviewAnalysis.review_link || '',
      sync_mode: reviewAnalysis.event_metrics_enabled ? 'timed_events' : 'tracking_only',
      tracking_only: Boolean(reviewAnalysis.tracking_only),
      reason: reviewAnalysis.reason || '',
      coverage: reviewAnalysis.coverage || {},
      sync: reviewAnalysis.sync || {},
      analysis_range: raw.config?.analysis_range || {}
    };
    const advancedDefense = advancedDefenseFromRaw(raw);
    const shotMap = raw.shot_map || reviewAnalysis.shot_map || {};
    const availableMetrics = raw.available_metrics || {
      physical_tracking: players.length > 0,
      heatmaps: players.some(player => player.heatmap),
      team_stats: teams.length > 0,
      average_positions: Boolean(raw.average_positions?.players),
      speed_windows: Boolean(raw.temporal?.windows?.length),
      marking_interactions: Boolean(raw.interactions?.enabled || raw.interactions?.marking_pairs?.length),
      defensive_movement_score: players.some(player => player.defense_score !== null && player.defense_score !== undefined) || Boolean(reviewAnalysis.defensive_players?.length),
      review_json_loaded: Boolean(raw.config?.review_json_path || matchLink.review_json_path || matchLink.review_link),
      review_timeline: Boolean(reviewAnalysis.sync?.timeline_quality?.has_timeline),
      goal_event_positions: Boolean(reviewAnalysis.event_metrics_enabled),
      nearest_defender_on_goal: Boolean(reviewAnalysis.event_metrics_enabled),
      lost_mark_detection: Boolean(reviewAnalysis.event_metrics_enabled),
      defensive_score_from_goals: Boolean(reviewAnalysis.event_metrics_enabled),
      save_timeline: toNumber(reviewAnalysis.coverage?.saves_linked, 0) > 0,
      advanced_defense_score: players.some(player => player.advanced_defense_score !== null && player.advanced_defense_score !== undefined) || Boolean(advancedDefense.players?.length),
      shot_map: Boolean(shotMap.events?.length),
      effective_play: Boolean(raw.effective_play?.enabled),
      match_story: Boolean(raw.match_story?.enabled),
      cross_stats: Boolean(raw.cross_stats?.enabled),
      physical_profile: Boolean(raw.physical_profile?.enabled),
      matchmaker_seed: Boolean(raw.matchmaker_seed?.enabled),
      supabase_export: Boolean(raw.supabase_export?.enabled)
    };

    return {
      raw,
      schema: raw.schema || '',
      schema_version: String(raw.schema_version || raw.t5_export?.schema_version || ''),
      source_schema: raw.source_schema || '',
      version: String(raw.version || raw.schema_version || raw.t5_export?.schema_version || raw.t5_export?.version || 'unknown'),
      duration_seconds: round(toNumber(raw.duration_seconds ?? raw.config?.duration_seconds, 0), 3),
      pitch,
      config: raw.config || {},
      team_own_sides: raw.team_own_sides || {},
      metrics_v2: raw.metrics_v2 || {},
      players,
      teams,
      summary: raw.summary || {},
      available_metrics: availableMetrics,
      review_analysis: reviewAnalysis,
      advanced_defense: advancedDefense,
      shot_map: shotMap,
      match_link: matchLink,
      goalkeeper_detection: raw.goalkeeper_detection || {},
      effective_play: raw.effective_play || {},
      match_story: raw.match_story || {},
      cross_stats: raw.cross_stats || {},
      physical_profile: raw.physical_profile || {},
      matchmaker_seed: raw.matchmaker_seed || {},
      supabase_export: raw.supabase_export || {},
      limitations: raw.limitations || [],
      rankings: raw.rankings || {},
      temporal: raw.temporal || {},
      interactions: raw.interactions || {},
      average_positions: raw.average_positions || {},
      created_at_unix: raw.created_at_unix || null
    };
  }

  function ensureStyles() {
    if (APP.stylesReady || typeof document === 'undefined') return;
    APP.stylesReady = true;
    const style = document.createElement('style');
    style.id = 'tracking-integration-styles';
    style.textContent = `
      .tracking-card { background: rgba(20, 184, 166, 0.08); border: 1px solid rgba(20, 184, 166, 0.25); border-radius: 12px; }
      .tracking-card .btn { white-space: nowrap; }
      .tracking-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; justify-content: space-between; }
      .tracking-status { color: rgba(255,255,255,.78); font-size: .82rem; }
      .tracking-modal-xl { max-width: min(1200px, 96vw); }
      .tracking-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: .75rem; }
      .tracking-kpi { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: .85rem; }
      .tracking-kpi-value { color: #fff; font-weight: 800; font-size: 1.35rem; line-height: 1; }
      .tracking-kpi-label { color: rgba(255,255,255,.62); font-size: .78rem; margin-top: .35rem; }
      .tracking-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); }
      .tracking-table { width: 100%; min-width: 860px; border-collapse: collapse; color: rgba(255,255,255,.88); font-size: .84rem; }
      .tracking-table th, .tracking-table td { padding: .65rem .75rem; border-bottom: 1px solid rgba(255,255,255,.08); vertical-align: middle; }
      .tracking-table th { color: rgba(255,255,255,.68); font-weight: 700; background: rgba(255,255,255,.04); }
      .tracking-player-dot { width: .75rem; height: .75rem; border-radius: 50%; display: inline-block; margin-right: .35rem; }
      .tracking-team-a { color: #60a5fa; }
      .tracking-team-b { color: #f87171; }
      .tracking-canvas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
      .tracking-canvas-card { background: rgba(7, 23, 16, .74); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: .8rem; }
      .tracking-canvas { width: 100%; aspect-ratio: 2 / 1; min-height: 260px; display: block; border-radius: 10px; background: #073b24; }
      .tracking-canvas-card-featured { grid-column: 1 / -1; }
      .tracking-canvas-card-featured .tracking-canvas { aspect-ratio: 2.35 / 1; min-height: 360px; }
      .tracking-carousel-card { min-height: 132px; background: linear-gradient(135deg, rgba(13,110,253,.18), rgba(25,135,84,.16)); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; padding: 1rem; }
      .tracking-slide-title { color: rgba(255,255,255,.68); font-size: .82rem; text-transform: uppercase; letter-spacing: .06em; }
      .tracking-slide-main { color: #fff; font-size: clamp(1.5rem, 4vw, 2.4rem); font-weight: 850; line-height: 1.05; }
      .tracking-slide-sub { color: rgba(255,255,255,.72); }
      #vista-perfil-jugador #perfil-tabs { background: rgba(38, 39, 54, .94); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; padding: .35rem; gap: .25rem; }
      #vista-perfil-jugador #perfil-tabs .nav-link { color: rgba(235,239,255,.76); border: 0; border-radius: 6px; font-weight: 750; font-size: .9rem; min-height: 44px; }
      #vista-perfil-jugador #perfil-tabs .nav-link:hover { color: #fff; background: rgba(255,255,255,.06); }
      #vista-perfil-jugador #perfil-tabs .nav-link.active { color: #fff; background: #51526b; box-shadow: inset 0 -2px 0 #5b8cff; }
      .tracking-profile-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, .85fr); gap: 1rem; }
      .tracking-profile-card { background: rgba(37, 39, 52, .92); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 1rem; }
      .tracking-profile-card.is-wide { grid-column: 1 / -1; }
      .tracking-profile-section-title { color: #fff; font-weight: 850; font-size: .95rem; margin: 0 0 .65rem; }
      .tracking-metric-band { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .65rem; margin-top: .85rem; }
      .tracking-metric-pill { background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.105); border-radius: 8px; padding: .65rem .7rem; min-width: 0; }
      .tracking-metric-pill strong { display: block; color: #fff; font-size: 1rem; line-height: 1.1; }
      .tracking-metric-pill span { display: block; color: #a7acc7; font-size: .72rem; margin-top: .25rem; }
      .tracking-axis-list { display: grid; gap: .55rem; }
      .tracking-axis-row { display: grid; grid-template-columns: minmax(88px, .7fr) minmax(0, 1fr) 42px; gap: .55rem; align-items: center; color: #cbd2ef; font-size: .8rem; }
      .tracking-axis-track { height: 8px; border-radius: 999px; background: rgba(255,255,255,.11); overflow: hidden; }
      .tracking-axis-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #22d3ee, #60a5fa); }
      .tracking-goal-note { color: #a7acc7; font-size: .8rem; margin-top: .45rem; }
      .tracking-profile-dashboard { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: .75rem; color: #eef2ff; }
      .tracking-profile-panel { background: #2f3040; border: 1px solid rgba(255,255,255,.10); border-radius: 8px; overflow: hidden; box-shadow: 0 14px 34px rgba(0,0,0,.22); }
      .tracking-profile-panel-header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .85rem 1rem; border-bottom: 1px solid rgba(0,0,0,.28); background: rgba(255,255,255,.025); }
      .tracking-profile-panel-title { color: #fff; font-weight: 850; font-size: 1rem; margin: 0; }
      .tracking-profile-panel-sub { color: #a7acc7; font-size: .78rem; }
      .tracking-rank-main { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 1rem; align-items: center; padding: 1.15rem 1rem; }
      .tracking-rank-medal { width: 82px; height: 82px; border-radius: 50%; display: grid; place-items: center; color: #9bd0ff; font-size: 2rem; font-weight: 900; background: radial-gradient(circle at 35% 30%, rgba(91,140,255,.35), rgba(10,17,31,.92) 60%); border: 1px solid rgba(91,140,255,.45); box-shadow: inset 0 0 18px rgba(91,140,255,.28); }
      .tracking-rank-label { color: #fff; font-size: 1.35rem; font-weight: 900; line-height: 1.05; }
      .tracking-rank-note { color: #a7acc7; font-size: .82rem; margin-top: .25rem; }
      .tracking-profile-stat-list { display: grid; gap: .45rem; padding: 0 1rem 1rem; }
      .tracking-profile-stat-line { display: flex; align-items: center; justify-content: space-between; gap: .75rem; color: #c7cbe2; font-size: .86rem; }
      .tracking-profile-stat-line strong { color: #fff; font-weight: 850; }
      .tracking-season-table { border-top: 1px solid rgba(0,0,0,.28); padding: .85rem 1rem 1rem; display: grid; gap: .5rem; }
      .tracking-season-row { display: grid; grid-template-columns: 84px minmax(0, 1fr) 64px; gap: .6rem; align-items: center; color: #c2c7e0; font-size: .82rem; }
      .tracking-season-tag { color: #8fb4ff; font-weight: 800; background: rgba(91,140,255,.13); border-radius: 4px; padding: .12rem .35rem; width: max-content; }
      .tracking-recent-summary { display: grid; grid-template-columns: 154px minmax(0, 1fr) minmax(180px, .7fr); gap: 1rem; padding: 1rem; border-bottom: 1px solid rgba(0,0,0,.28); }
      .tracking-win-ring { --win-pct: 0; width: 116px; height: 116px; border-radius: 50%; display: grid; place-items: center; margin: .35rem auto 0; background: conic-gradient(#5b8cff calc(var(--win-pct) * 1%), #ff4868 0); position: relative; }
      .tracking-win-ring::after { content: ''; position: absolute; inset: 18px; border-radius: 50%; background: #272938; }
      .tracking-win-ring span { position: relative; z-index: 1; color: #75a3ff; font-weight: 900; font-size: 1.1rem; }
      .tracking-core-line { display: grid; grid-template-columns: repeat(auto-fit, minmax(78px, 1fr)); gap: .7rem; align-items: end; }
      .tracking-core-metric { color: #a7acc7; font-size: .78rem; }
      .tracking-core-metric strong { display: block; color: #fff; font-size: clamp(1.2rem, 2.3vw, 1.65rem); line-height: 1.05; }
      .tracking-role-bars { display: grid; grid-template-columns: repeat(5, 1fr); align-items: end; gap: .75rem; min-height: 112px; }
      .tracking-role-bar { display: grid; gap: .35rem; justify-items: center; color: #9ca3c7; font-size: .68rem; text-transform: uppercase; }
      .tracking-role-stick { width: 22px; height: 76px; display: flex; align-items: flex-end; background: rgba(255,255,255,.12); border-radius: 2px; overflow: hidden; }
      .tracking-role-fill { width: 100%; min-height: 4px; background: #5b8cff; }
      .tracking-profile-prompts { display: flex; gap: .55rem; padding: .65rem 1rem; overflow-x: auto; border-bottom: 1px solid rgba(0,0,0,.28); }
      .tracking-profile-prompt { border: 0; border-radius: 999px; background: #3b3d52; color: #fff; padding: .48rem .8rem; font-size: .82rem; font-weight: 800; white-space: nowrap; }
      .tracking-profile-prompt:hover { background: #46506f; }
      .tracking-rival-summary { display: grid; gap: .4rem; }
      .tracking-rival-row { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: .45rem; align-items: center; color: #cbd2ef; font-size: .78rem; }
      .tracking-rival-row strong { color: #fff; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tracking-rival-row span:last-child { color: #8fb4ff; font-weight: 850; }
      .tracking-recent-list { display: grid; gap: .45rem; padding: .65rem; }
      .tracking-match-row { display: grid; grid-template-columns: 90px 72px minmax(118px, .55fr) minmax(110px, .45fr) minmax(180px, 1fr) 84px; gap: .45rem; align-items: center; padding: .75rem .7rem; border-radius: 6px; background: #2b3f68; border-left: 5px solid #5b8cff; min-height: 94px; }
      .tracking-match-row.tracking-result-loss { background: #353347; border-left-color: #ff4868; }
      .tracking-match-row.tracking-result-draw { background: #37384a; border-left-color: #fbbf24; }
      .tracking-match-row-date { color: #b8c0df; font-size: .82rem; }
      .tracking-match-row-date strong { display: block; color: #77a6ff; font-size: .88rem; }
      .tracking-match-result { color: #fff; font-weight: 900; }
      .tracking-match-result small { display: block; color: #b8c0df; font-weight: 600; margin-top: .2rem; }
      .tracking-match-primary { display: flex; align-items: center; gap: .75rem; min-width: 0; }
      .tracking-match-avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 52px; color: #fff; font-weight: 900; background: linear-gradient(135deg, #26334f, #5b8cff); border: 1px solid rgba(255,255,255,.25); }
      .tracking-match-main strong { color: #fff; font-size: 1.25rem; line-height: 1; }
      .tracking-match-main span { display: block; color: #b8c0df; font-size: .82rem; margin-top: .25rem; }
      .tracking-match-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: .45rem; }
      .tracking-match-metric { color: #b8c0df; font-size: .72rem; text-transform: uppercase; }
      .tracking-match-metric strong { display: block; color: #fff; font-size: .95rem; text-transform: none; }
      .tracking-match-tags { display: flex; flex-wrap: wrap; gap: .3rem; justify-content: flex-start; }
      .tracking-match-tag { border-radius: 999px; padding: .22rem .48rem; color: #fff; background: rgba(255,255,255,.18); font-size: .74rem; font-weight: 850; }
      .tracking-match-tag.is-blue { background: #5b8cff; }
      .tracking-match-tag.is-red { background: #ff4868; }
      .tracking-match-tag.is-green { background: #16a34a; }
      .tracking-match-tag.is-muted { background: rgba(255,255,255,.10); color: #c4c9df; }
      .tracking-lineups { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; min-width: 0; }
      .tracking-lineup { min-width: 0; }
      .tracking-lineup-title { color: #a7acc7; font-size: .68rem; text-transform: uppercase; margin-bottom: .28rem; letter-spacing: .04em; }
      .tracking-player-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .18rem .35rem; }
      .tracking-player-chip { display: flex; align-items: center; gap: .24rem; min-width: 0; color: #cbd2ef; font-size: .72rem; line-height: 1.1; }
      .tracking-player-chip b { color: #fff; font-weight: 900; }
      .tracking-player-chip.current { color: #fff; font-weight: 850; }
      .tracking-mini-avatar { width: 18px; height: 18px; border-radius: 4px; display: inline-grid; place-items: center; flex: 0 0 18px; background: rgba(91,140,255,.22); color: #8fb4ff; font-size: .62rem; font-weight: 900; }
      .tracking-mini-avatar.rival { background: rgba(255,72,104,.20); color: #ff8aa0; }
      .tracking-mapping-row { display: grid; grid-template-columns: 1fr minmax(180px, 1fr) 88px; gap: .75rem; align-items: center; }
      @media (max-width: 768px) {
        .partido-card > .d-flex.justify-content-between.align-items-start.mb-3 { flex-direction: column; gap: .75rem; }
        .partido-card > .d-flex.justify-content-between.align-items-start.mb-3 > .text-end { text-align: left !important; width: 100%; }
        .partido-card > .d-flex.justify-content-between.align-items-start.mb-3 > .text-end .d-flex { justify-content: flex-start; flex-wrap: wrap; }
        .tracking-actions { align-items: stretch; }
        .tracking-actions .btn { flex: 1 1 100%; }
        .tracking-profile-grid { grid-template-columns: 1fr; }
        .tracking-profile-dashboard { grid-template-columns: 1fr; }
        .tracking-recent-summary { grid-template-columns: 1fr; }
        .tracking-core-line { grid-template-columns: repeat(2, 1fr); }
        .tracking-match-row { grid-template-columns: 1fr; gap: .5rem; }
        .tracking-match-tags { justify-content: flex-start; }
        .tracking-match-metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .tracking-lineups { grid-template-columns: 1fr; }
        .tracking-mapping-row { grid-template-columns: 1fr; }
        .tracking-canvas-grid { grid-template-columns: 1fr; }
        .tracking-modal-xl { max-width: 100vw; margin: .25rem; }
        .tracking-table { min-width: 720px; }
        .tracking-canvas { min-height: 220px; }
        .tracking-canvas-card-featured .tracking-canvas { min-height: 260px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModals() {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('trackingImportModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="trackingImportModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-lg modal-dialog-scrollable">
            <div class="modal-content bg-dark text-light border-secondary">
              <div class="modal-header border-secondary">
                <h5 class="modal-title"><i class="bi bi-upload me-2"></i>Cargar analisis tracking</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body">
                <div class="mb-3">
                  <label class="form-label">Archivo t5_player_stats.json</label>
                  <input type="file" id="tracking-json-input" class="form-control" accept="application/json,.json">
                  <div class="form-text text-light-emphasis">No se cargan videos. Solo el JSON resumido exportado desde Football Detector.</div>
                </div>
                <div class="mb-3">
                  <label class="form-label">O pegar JSON</label>
                  <textarea id="tracking-json-paste" class="form-control bg-dark text-light border-secondary" rows="4" spellcheck="false" placeholder='{"schema":"t5-football-detector-export", ...}'></textarea>
                  <div class="d-flex justify-content-end mt-2">
                    <button type="button" class="btn btn-sm btn-outline-info" id="tracking-json-paste-load">
                      <i class="bi bi-clipboard-check me-1"></i>Usar JSON pegado
                    </button>
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">O cargar JSON desde URL</label>
                  <div class="input-group input-group-sm">
                    <input type="url" id="tracking-json-url" class="form-control bg-dark text-light border-secondary" placeholder="http://localhost:8765/t5_player_stats.json">
                    <button type="button" class="btn btn-outline-info" id="tracking-json-url-load">
                      <i class="bi bi-cloud-download me-1"></i>Cargar URL
                    </button>
                  </div>
                </div>
                <div id="tracking-import-summary" class="small text-light-emphasis mb-3"></div>
                <div id="tracking-mapping-container" class="d-grid gap-2"></div>
              </div>
              <div class="modal-footer border-secondary">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-success" id="tracking-save-import" disabled>
                  <i class="bi bi-database-check me-1"></i>Guardar tracking
                </button>
              </div>
            </div>
          </div>
        </div>
      `);
    }

    if (!document.getElementById('trackingSummaryModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div class="modal fade" id="trackingSummaryModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog tracking-modal-xl modal-dialog-scrollable">
            <div class="modal-content bg-dark text-light border-secondary">
              <div class="modal-header border-secondary">
                <h5 class="modal-title" id="trackingSummaryTitle"><i class="bi bi-activity me-2"></i>Estadisticas tracking</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Cerrar"></button>
              </div>
              <div class="modal-body" id="trackingSummaryBody">
                <div class="text-center py-5"><div class="spinner-border text-info"></div></div>
              </div>
            </div>
          </div>
        </div>
      `);
    }

    const input = document.getElementById('tracking-json-input');
    if (input && !input.dataset.bound) {
      input.dataset.bound = '1';
      input.addEventListener('change', handleImportFileChange);
    }

    const pasteButton = document.getElementById('tracking-json-paste-load');
    if (pasteButton && !pasteButton.dataset.bound) {
      pasteButton.dataset.bound = '1';
      pasteButton.addEventListener('click', handleImportPasteClick);
    }

    const urlButton = document.getElementById('tracking-json-url-load');
    if (urlButton && !urlButton.dataset.bound) {
      urlButton.dataset.bound = '1';
      urlButton.addEventListener('click', handleImportUrlClick);
    }

    const saveButton = document.getElementById('tracking-save-import');
    if (saveButton && !saveButton.dataset.bound) {
      saveButton.dataset.bound = '1';
      saveButton.addEventListener('click', saveCurrentImport);
    }
  }

  function trackingCardHtml(partidoId) {
    return `
      <div class="tracking-card mt-3 p-3" data-tracking-card="${escapeHtml(partidoId)}">
        <div class="tracking-actions">
          <div>
            <div class="text-info fw-semibold"><i class="bi bi-broadcast-pin me-1"></i>Tracking Football Detector</div>
            <div class="tracking-status" data-tracking-status="${escapeHtml(partidoId)}">Buscando analisis...</div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-outline-info d-none" data-tracking-import="${escapeHtml(partidoId)}">
              <i class="bi bi-upload me-1"></i>Cargar tracking
            </button>
            <button type="button" class="btn btn-sm btn-success d-none" data-tracking-summary="${escapeHtml(partidoId)}">
              <i class="bi bi-bar-chart-line me-1"></i>Ver estadisticas
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function updateTrackingImportVisibility() {
    const canImport = userIsAdmin();
    document.querySelectorAll('[data-tracking-import]').forEach(button => {
      button.classList.toggle('d-none', !canImport);
    });
  }

  function decorateHistoryCards() {
    ensureStyles();
    ensureModals();
    const cards = Array.from(document.querySelectorAll('.partido-card[data-partido-id]'));
    if (!cards.length) return;

    cards.forEach(card => {
      const partidoId = card.dataset.partidoId;
      if (!partidoId || card.querySelector(`[data-tracking-card="${CSS.escape(partidoId)}"]`)) return;
      card.insertAdjacentHTML('beforeend', trackingCardHtml(partidoId));
    });

    document.querySelectorAll('[data-tracking-import]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => openImport(button.dataset.trackingImport));
    });
    document.querySelectorAll('[data-tracking-summary]').forEach(button => {
      if (button.dataset.bound) return;
      button.dataset.bound = '1';
      button.addEventListener('click', () => openSummaryByMatch(button.dataset.trackingSummary));
    });

    updateTrackingImportVisibility();
    loadAnalysesForVisibleCards();
  }

  async function loadAnalysesForVisibleCards() {
    if (APP.loadingAnalyses) return;
    const client = await waitForSupabase(3000);
    if (!client) return;

    const ids = Array.from(document.querySelectorAll('.partido-card[data-partido-id]'))
      .map(card => card.dataset.partidoId)
      .filter(Boolean);
    const missing = ids.filter(id => !APP.analysisByMatch.has(id));
    if (!missing.length) {
      ids.forEach(updateTrackingCard);
      return;
    }

    APP.loadingAnalyses = true;
    try {
      const { data, error } = await client
        .from(TRACKING_TABLES.analyses)
        .select('id, partido_id, source_version, duration_seconds, summary')
        .in('partido_id', missing);

      if (error) throw error;
      (data || []).forEach(analysis => APP.analysisByMatch.set(String(analysis.partido_id), analysis));
      const found = new Set((data || []).map(analysis => String(analysis.partido_id)));
      missing.forEach(id => {
        if (!found.has(String(id))) APP.analysisByMatch.set(String(id), null);
      });
      ids.forEach(updateTrackingCard);
    } catch (error) {
      console.warn('[tracking] No se pudieron leer analisis tracking:', error.message || error);
      missing.forEach(id => APP.analysisByMatch.set(String(id), null));
      ids.forEach(id => {
        const status = document.querySelector(`[data-tracking-status="${CSS.escape(id)}"]`);
        if (status) status.textContent = 'Sin analisis cargado';
      });
    } finally {
      APP.loadingAnalyses = false;
    }
  }

  function updateTrackingCard(partidoId) {
    const analysis = APP.analysisByMatch.get(String(partidoId));
    const status = document.querySelector(`[data-tracking-status="${CSS.escape(partidoId)}"]`);
    const summaryButton = document.querySelector(`[data-tracking-summary="${CSS.escape(partidoId)}"]`);
    if (!status || !summaryButton) return;

    if (!analysis) {
      status.textContent = 'Sin analisis cargado';
      summaryButton.classList.add('d-none');
      return;
    }

    const playerCount = analysis.summary?.players || analysis.summary?.player_count || '?';
    status.textContent = `Cargado: ${playerCount} jugadores, ${formatTime(analysis.duration_seconds)} (${analysis.source_version || 'FD'})`;
    summaryButton.classList.remove('d-none');
  }

  async function fetchMatchPlayers(partidoId) {
    const client = await waitForSupabase();
    if (!client) throw new Error('Supabase no esta disponible');
    const { data, error } = await client
      .from('jugador_partido')
      .select('jugador_id, equipo, jugadores(id, nombre, pulmon)')
      .eq('partido_id', partidoId);
    if (error) throw error;
    return (data || []).map(row => ({
      jugador_id: row.jugador_id,
      equipo: row.equipo,
      nombre: row.jugadores?.nombre || `Jugador ${row.jugador_id}`,
      pulmon: row.jugadores?.pulmon ?? null
    }));
  }

  async function openImport(partidoId) {
    if (!userIsAdmin()) {
      showToast('Se requieren permisos de administrador para cargar tracking.', 'error');
      return;
    }

    const cleanPartidoId = normalizeIdValue(partidoId);
    if (!cleanPartidoId) {
      showToast('No pude identificar el partido para cargar tracking. Abri el importador desde la tarjeta del partido.', 'error');
      return;
    }

    try {
      ensureModals();
      const matchPlayers = await fetchMatchPlayers(cleanPartidoId);
      APP.importState = {
        partidoId: cleanPartidoId,
        matchPlayers,
        normalized: null,
        mappings: new Map()
      };

      const input = document.getElementById('tracking-json-input');
      const paste = document.getElementById('tracking-json-paste');
      const url = document.getElementById('tracking-json-url');
      const summary = document.getElementById('tracking-import-summary');
      const mapping = document.getElementById('tracking-mapping-container');
      const saveButton = document.getElementById('tracking-save-import');
      if (input) input.value = '';
      if (paste) paste.value = '';
      if (url) url.value = '';
      if (summary) summary.innerHTML = `${matchPlayers.length} jugadores del partido listos para matchear.`;
      if (mapping) mapping.innerHTML = '<div class="text-light-emphasis">Elegi el JSON para ver el mapeo.</div>';
      if (saveButton) saveButton.disabled = true;

      const modal = new bootstrap.Modal(document.getElementById('trackingImportModal'));
      modal.show();
    } catch (error) {
      console.error('[tracking] Error abriendo import:', error);
      showToast(`No se pudo abrir el importador: ${error.message}`, 'error');
    }
  }

  function loadImportJsonText(text) {
    if (!APP.importState) return;
    const raw = JSON.parse(text);
    const normalized = normalizeFootballDetectorStats(raw);
    APP.importState.normalized = normalized;
    autoMapPlayers();
    renderMappingUI();
  }

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file || !APP.importState) return;
    try {
      const text = await file.text();
      loadImportJsonText(text);
    } catch (error) {
      console.error('[tracking] JSON invalido:', error);
      showToast(`JSON invalido: ${error.message}`, 'error');
    }
  }

  function handleImportPasteClick() {
    const textarea = document.getElementById('tracking-json-paste');
    const text = textarea?.value?.trim() || '';
    if (!text || !APP.importState) return;
    try {
      loadImportJsonText(text);
    } catch (error) {
      console.error('[tracking] JSON pegado invalido:', error);
      showToast(`JSON pegado invalido: ${error.message}`, 'error');
    }
  }

  async function handleImportUrlClick() {
    const input = document.getElementById('tracking-json-url');
    const url = input?.value?.trim() || '';
    if (!url || !APP.importState) return;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      loadImportJsonText(await response.text());
    } catch (error) {
      console.error('[tracking] No se pudo cargar JSON desde URL:', error);
      showToast(`No se pudo cargar JSON desde URL: ${error.message}`, 'error');
    }
  }

  function autoMapPlayers() {
    const state = APP.importState;
    if (!state?.normalized) return;
    state.mappings.clear();
    const used = new Set();

    state.normalized.players.forEach(player => {
      const candidates = state.matchPlayers
        .map(matchPlayer => ({
          ...matchPlayer,
          score: used.has(String(matchPlayer.jugador_id)) ? -1 : nameSimilarity(player.detected_name, matchPlayer.nombre)
        }))
        .sort((a, b) => b.score - a.score);
      const best = candidates[0];
      if (best && best.score >= 0.72) {
        state.mappings.set(player.player_id, {
          jugador_id: best.jugador_id,
          confidence: round(best.score, 3)
        });
        used.add(String(best.jugador_id));
      }
    });
  }

  function renderMappingUI() {
    const state = APP.importState;
    const summary = document.getElementById('tracking-import-summary');
    const container = document.getElementById('tracking-mapping-container');
    const saveButton = document.getElementById('tracking-save-import');
    if (!state?.normalized || !summary || !container || !saveButton) return;

    const players = state.normalized.players;
    const mapped = players.filter(player => state.mappings.get(player.player_id)?.jugador_id).length;
    const review = state.normalized.review_analysis || {};
    const coverage = review.coverage || state.normalized.match_link?.coverage || {};
    const defenseCount = players.filter(player => player.defense_score !== null && player.defense_score !== undefined).length;
    const mode = review.event_metrics_enabled
      ? `goles ${toNumber(coverage.goals_linked)}/${toNumber(coverage.goals_total)} sincronizados`
      : 'solo tracking';
    summary.innerHTML = `
      <div class="alert alert-info py-2 mb-0">
        <strong>${escapeHtml(state.normalized.version)}</strong> -
        ${players.length} jugadores - ${formatTime(state.normalized.duration_seconds)} -
        ${mapped}/${players.length} matcheados.<br>
        <span>${escapeHtml(mode)} - defensa disponible para ${defenseCount} jugadores.</span>
      </div>
    `;

    const options = state.matchPlayers
      .map(player => `<option value="${escapeHtml(player.jugador_id)}">${escapeHtml(player.nombre)} (Equipo ${escapeHtml(player.equipo)})</option>`)
      .join('');

    container.innerHTML = players.map(player => {
      const current = state.mappings.get(player.player_id)?.jugador_id || '';
      const confidence = state.mappings.get(player.player_id)?.confidence || 0;
      return `
        <div class="tracking-mapping-row p-2 rounded border border-secondary">
          <div>
            <div class="fw-semibold">${escapeHtml(player.detected_name)} <span class="text-light-emphasis">(${escapeHtml(player.player_id)})</span></div>
            <div class="small text-light-emphasis">${player.distance_km.toFixed(2)} km | ${player.max_speed_kmh.toFixed(1)} km/h | pulmon ${player.pulmon_tracking}</div>
          </div>
          <select class="form-select form-select-sm bg-dark text-light border-secondary" data-map-player="${escapeHtml(player.player_id)}">
            <option value="">Sin mapear</option>
            ${options}
          </select>
          <div class="small text-light-emphasis">match ${Math.round(confidence * 100)}%</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-map-player]').forEach(select => {
      const current = state.mappings.get(select.dataset.mapPlayer)?.jugador_id || '';
      select.value = current;
      select.addEventListener('change', () => {
        const playerId = select.dataset.mapPlayer;
        state.mappings.set(playerId, {
          jugador_id: select.value,
          confidence: select.value ? 1 : 0
        });
        validateMapping();
      });
    });

    validateMapping();
  }

  function validateMapping() {
    const state = APP.importState;
    const saveButton = document.getElementById('tracking-save-import');
    if (!state?.normalized || !saveButton) return;
    const allMapped = state.normalized.players.every(player => state.mappings.get(player.player_id)?.jugador_id);
    saveButton.disabled = !allMapped || !resolveImportPartidoId(state);
  }

  async function saveCurrentImport() {
    if (!userIsAdmin()) {
      showToast('Se requieren permisos de administrador para guardar tracking.', 'error');
      return;
    }

    const state = APP.importState;
    if (!state?.normalized) return;
    const partidoId = resolveImportPartidoId(state);
    if (!partidoId) {
      showToast('No pude identificar el partido. Volve a abrir el importador desde la tarjeta del partido y carga el JSON otra vez.', 'error');
      return;
    }
    state.partidoId = partidoId;

    const client = await waitForSupabase();
    if (!client) {
      showToast('Supabase no esta disponible', 'error');
      return;
    }

    const normalized = state.normalized;
    const saveButton = document.getElementById('tracking-save-import');
    if (saveButton) {
      saveButton.disabled = true;
      saveButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando...';
    }

    try {
      const summary = {
        players: normalized.players.length,
        duration_seconds: normalized.duration_seconds,
        total_distance_km: round(normalized.players.reduce((sum, player) => sum + player.distance_km, 0), 2),
        max_speed_kmh: round(Math.max(...normalized.players.map(player => player.max_speed_kmh)), 2),
        total_sprints: normalized.players.reduce((sum, player) => sum + player.sprints, 0),
        sync_mode: normalized.match_link?.sync_mode || (normalized.review_analysis?.event_metrics_enabled ? 'timed_events' : 'tracking_only'),
        tracking_only: Boolean(normalized.review_analysis?.tracking_only || normalized.match_link?.tracking_only),
        available_metrics: normalized.available_metrics,
        review_coverage: normalized.review_analysis?.coverage || normalized.match_link?.coverage || {},
        advanced_defense_coverage: normalized.advanced_defense?.coverage || {},
        shot_map_events: toNumber(normalized.shot_map?.events?.length, 0),
        team_distance_km: normalized.teams.reduce((acc, team) => {
          acc[team.team] = team.distance_km;
          return acc;
        }, {})
      };

      const analysisResult = await upsertTrackingAnalysisRow(client, {
        partido_id: partidoId,
        export_schema: normalized.schema || null,
        export_schema_version: normalized.schema_version || null,
        source_schema: normalized.source_schema || null,
        source_version: normalized.version,
        duration_seconds: normalized.duration_seconds,
        pitch_width_m: normalized.pitch.width,
        pitch_height_m: normalized.pitch.height,
        available_metrics: normalized.available_metrics || {},
        match_link: normalized.match_link || {},
        review_analysis: normalized.review_analysis || {},
        advanced_defense: normalized.advanced_defense || {},
        shot_map: normalized.shot_map || {},
        effective_play: normalized.effective_play || {},
        match_story: normalized.match_story || {},
        cross_stats: normalized.cross_stats || {},
        physical_profile: normalized.physical_profile || {},
        matchmaker_seed: normalized.matchmaker_seed || {},
        supabase_export: normalized.supabase_export || {},
        goalkeeper_detection: normalized.goalkeeper_detection || {},
        metrics_v2: normalized.metrics_v2 || {},
        config_json: normalized.config || {},
        team_own_sides: normalized.team_own_sides || {},
        limitations: normalized.limitations || [],
        raw_json: normalized.raw,
        summary
      });
      const analysis = analysisResult.analysis;
      const analysisId = analysis.id;

      await deleteExistingAnalysisRows(client, analysisId);

      const mappingRows = normalized.players.map(player => ({
        analysis_id: analysisId,
        partido_id: partidoId,
        player_id: player.player_id,
        source_player_id: player.player_id,
        source_name: player.detected_name,
        detected_name: player.detected_name,
        normalized_name: normalizeName(player.detected_name),
        team: player.team || null,
        jugador_id: state.mappings.get(player.player_id)?.jugador_id || null,
        confidence: state.mappings.get(player.player_id)?.confidence || null
      }));

      const statsRows = buildTrackingPlayerStatsRows(normalized, state.mappings, analysisId, partidoId);

      const heatmapRows = normalized.players.map(player => ({
        analysis_id: analysisId,
        partido_id: partidoId,
        player_id: player.player_id,
        source_player_id: player.player_id,
        source_name: player.detected_name,
        normalized_name: normalizeName(player.detected_name),
        jugador_id: state.mappings.get(player.player_id)?.jugador_id || null,
        heatmap: player.heatmap,
        counts: player.heatmap?.counts || [],
        heatmap_windows: player.heatmap_windows,
        x_bins: player.heatmap?.x_bins || null,
        y_bins: player.heatmap?.y_bins || null
      }));

      const teamRows = normalized.teams.map(team => ({
        analysis_id: analysisId,
        partido_id: partidoId,
        team: team.team || null,
        team_label: team.team || null,
        distance_km: team.distance_km,
        avg_speed_kmh: null,
        high_intensity_seconds: team.high_intensity_seconds,
        pulmon_tracking_avg: team.pulmon_tracking_avg,
        metrics: team
      }));
      const shotEventRows = buildTrackingShotEventRows(normalized, state.mappings, analysisId, partidoId);
      const advancedDefenseEventRows = buildAdvancedDefenseEventRows(normalized, analysisId, partidoId);
      const advancedDefenseAssignmentRows = buildAdvancedDefenseAssignmentRows(normalized, state.mappings, analysisId, partidoId);

      const interactionRows = [
        { type: 'rankings', payload: normalized.rankings },
        { type: 'interactions', payload: normalized.interactions },
        { type: 'temporal', payload: normalized.temporal },
        { type: 'average_positions', payload: normalized.average_positions },
        { type: 'available_metrics', payload: normalized.available_metrics },
        { type: 'review_analysis', payload: normalized.review_analysis },
        { type: 'advanced_defense', payload: normalized.advanced_defense },
        { type: 'shot_map', payload: normalized.shot_map },
        { type: 'match_link', payload: normalized.match_link },
        { type: 'goalkeeper_detection', payload: normalized.goalkeeper_detection },
        { type: 'effective_play', payload: normalized.effective_play },
        { type: 'match_story', payload: normalized.match_story },
        { type: 'cross_stats', payload: normalized.cross_stats },
        { type: 'physical_profile', payload: normalized.physical_profile },
        { type: 'matchmaker_seed', payload: normalized.matchmaker_seed },
        { type: 'supabase_export', payload: normalized.supabase_export },
        { type: 'limitations', payload: { items: normalized.limitations || [] } }
      ].map(item => ({
        analysis_id: analysisId,
        partido_id: partidoId,
        interaction_type: item.type,
        payload: item.payload || {}
      }));

      const insertResults = [
        await insertRows(client, TRACKING_TABLES.mapping, mappingRows),
        await insertRows(client, TRACKING_TABLES.stats, statsRows),
        await insertRows(client, TRACKING_TABLES.heatmaps, heatmapRows),
        await insertRows(client, TRACKING_TABLES.teams, teamRows),
        await insertRows(client, TRACKING_TABLES.interactions, interactionRows),
        await insertRows(client, TRACKING_TABLES.shotEvents, shotEventRows),
        await insertRows(client, TRACKING_TABLES.advancedDefenseEvents, advancedDefenseEventRows),
        await insertRows(client, TRACKING_TABLES.advancedDefenseAssignments, advancedDefenseAssignmentRows)
      ];
      const omittedColumns = [
        ...analysisResult.omittedColumns,
        ...insertResults.flatMap(result => result?.omittedColumns || [])
      ];

      APP.analysisByMatch.set(String(partidoId), analysis);
      APP.detailsByAnalysis.delete(String(analysisId));
      APP.profileMatchesByPlayer.clear();
      updateTrackingCard(partidoId);
      await refreshTrackingCaches(true);

      const modal = bootstrap.Modal.getInstance(document.getElementById('trackingImportModal'));
      modal?.hide();
      if (omittedColumns.length) {
        showToast(`Tracking guardado. Supabase no tiene columnas opcionales: ${[...new Set(omittedColumns)].join(', ')}. Conviene correr tracking_schema.sql.`, 'warning');
      } else {
        showToast('Tracking guardado para el partido', 'success');
      }
    } catch (error) {
      console.error('[tracking] Error guardando import:', error);
      showToast(`No se pudo guardar tracking: ${readableError(error)}`, 'error');
    } finally {
      if (saveButton) {
        saveButton.innerHTML = '<i class="bi bi-database-check me-1"></i>Guardar tracking';
        validateMapping();
      }
    }
  }

  async function deleteExistingAnalysisRows(client, analysisId) {
    const deletes = [
      TRACKING_TABLES.advancedDefenseAssignments,
      TRACKING_TABLES.advancedDefenseEvents,
      TRACKING_TABLES.shotEvents,
      TRACKING_TABLES.mapping,
      TRACKING_TABLES.stats,
      TRACKING_TABLES.heatmaps,
      TRACKING_TABLES.teams,
      TRACKING_TABLES.interactions
    ].map(table => client.from(table).delete().eq('analysis_id', analysisId));
    const results = await Promise.all(deletes);
    const firstError = results.find(result => result.error)?.error;
    if (firstError) throw tableError('deleteExistingAnalysisRows', firstError);
  }

  async function insertRows(client, table, rows) {
    if (!rows || rows.length === 0) return { omittedColumns: [] };
    const optionalColumns = OPTIONAL_COLUMNS_BY_TABLE[table] || [];
    let currentRows = rows.map(row => ({ ...row }));
    const omittedColumns = [];

    for (let attempt = 0; attempt <= optionalColumns.length; attempt += 1) {
      const { error } = await client.from(table).insert(currentRows);
      if (!error) return { omittedColumns };

      const missingColumn = schemaMissingColumn(error);
      if (missingColumn && optionalColumns.includes(missingColumn) && currentRows.some(row => Object.prototype.hasOwnProperty.call(row, missingColumn))) {
        currentRows = currentRows.map(row => omitColumn(row, missingColumn));
        omittedColumns.push(missingColumn);
        continue;
      }

      throw tableError(table, error);
    }

    throw new Error(`No se pudo guardar tracking por columnas faltantes en ${table}.`);
  }

  async function fetchAnalysisDetails(analysisId) {
    const key = String(analysisId);
    if (APP.detailsByAnalysis.has(key)) return APP.detailsByAnalysis.get(key);
    const client = await waitForSupabase();
    if (!client) throw new Error('Supabase no esta disponible');

    const [
      analysisRes,
      mappingRes,
      statsRes,
      heatmapsRes,
      teamsRes,
      interactionsRes,
      shotEventsRes,
      advancedDefenseEventsRes,
      advancedDefenseAssignmentsRes
    ] = await Promise.all([
      client.from(TRACKING_TABLES.analyses)
        .select('*, partidos(id, fecha, cancha, equipo_ganador, temporada_id, temporadas(nombre))')
        .eq('id', analysisId)
        .single(),
      client.from(TRACKING_TABLES.mapping)
        .select('*, jugadores(id, nombre, pulmon)')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.stats)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.heatmaps)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.teams)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.interactions)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.shotEvents)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.advancedDefenseEvents)
        .select('*')
        .eq('analysis_id', analysisId),
      client.from(TRACKING_TABLES.advancedDefenseAssignments)
        .select('*')
        .eq('analysis_id', analysisId)
    ]);

    const firstError = [
      analysisRes,
      mappingRes,
      statsRes,
      heatmapsRes,
      teamsRes,
      interactionsRes,
      shotEventsRes,
      advancedDefenseEventsRes,
      advancedDefenseAssignmentsRes
    ].find(result => result.error)?.error;
    if (firstError) throw firstError;

    const mappingsByPlayer = new Map((mappingRes.data || []).map(row => [row.player_id || row.source_player_id, row]));
    const heatmapByPlayer = new Map((heatmapsRes.data || []).map(row => [row.player_id, row]));
    const interactionMap = (interactionsRes.data || []).reduce((acc, row) => {
      acc[row.interaction_type] = row.payload || {};
      return acc;
    }, {});
    let rawNormalized = null;
    try {
      rawNormalized = analysisRes.data?.raw_json ? normalizeFootballDetectorStats(analysisRes.data.raw_json) : null;
    } catch (error) {
      rawNormalized = null;
    }
    const rawPlayers = rawNormalized?.players || [];
    const rawByPlayer = new Map(rawPlayers.map(player => [player.player_id, player]));
    const fallbackShotMap = interactionMap.shot_map || rawNormalized?.shot_map || analysisRes.data?.shot_map || analysisRes.data?.raw_json?.shot_map || analysisRes.data?.raw_json?.review_analysis?.shot_map || {};
    const fallbackAdvancedDefense = interactionMap.advanced_defense || rawNormalized?.advanced_defense || analysisRes.data?.advanced_defense || analysisRes.data?.raw_json?.advanced_defense || analysisRes.data?.raw_json?.review_analysis?.advanced_defense || {};
    const structuredShotMap = shotMapFromRows(shotEventsRes.data || [], fallbackShotMap);
    const structuredAdvancedDefense = advancedDefenseFromRows(
      advancedDefenseEventsRes.data || [],
      advancedDefenseAssignmentsRes.data || [],
      fallbackAdvancedDefense
    );
    const preferRawWhenMissing = (value, rawValue) => {
      if (rawValue === undefined || rawValue === null) return value;
      const n = Number(value);
      const rawN = Number(rawValue);
      if (value === undefined || value === null || !Number.isFinite(n)) return rawValue;
      if (Number.isFinite(rawN) && n === 0 && rawN > 0) return rawValue;
      return value;
    };
    const analysisPitch = pitchForAnalysis(analysisRes.data || {});
    const analysisDuration = toNumber(analysisRes.data?.duration_seconds, 0);

    const players = (statsRes.data || []).map((row, index) => {
      const mapping = mappingsByPlayer.get(row.player_id) || {};
      const heatmapRow = heatmapByPlayer.get(row.player_id) || {};
      const rawPlayer = rawByPlayer.get(row.player_id) || rawPlayers[index] || {};
      const metrics = row.metrics || {};
      const defense = metrics.defense || rawPlayer.defense || {};
      const advancedDefense = metrics.advanced_defense || rawPlayer.advanced_defense || {};
      const physicalProfile = row.physical_profile || metrics.physical_profile || rawPlayer.physical_profile || {};
      const pulmon = metrics.pulmon || rawPlayer.pulmon || {};
      const rawGoalLocations = row.goal_locations || metrics.goal_locations || rawPlayer.goal_locations || [];
      const fisValor = row.fis_valor ?? metrics.fis_valor ?? rawPlayer.fis_valor ?? physicalProfile.fis ?? pulmon.fis ?? rawPlayer.pulmon_tracking;
      const fisVersion = row.fis_version || metrics.fis_version || rawPlayer.fis_version || physicalProfile.fis_version || pulmon.fis_version || '';
      const team = row.team || rawPlayer.team || mapping.team || '';
      const sideSource = {
        ...row,
        team,
        metrics,
        tracking_analyses: analysisRes.data || {}
      };
      const ownSide = resolveOwnSideForPlayer(sideSource, analysisRes.data || {});
      const rivalSide = resolveRivalSideForPlayer(sideSource, analysisRes.data || {});
      const goalLocations = rawGoalLocations
        .map(goal => orientPointDefenseToAttack({
          ...goal,
          pitch_width_m: goal.pitch_width_m ?? analysisPitch.width,
          pitch_height_m: goal.pitch_height_m ?? analysisPitch.height
        }, {
          ...sideSource,
          own_side: ownSide,
          rival_side: rivalSide
        }, analysisRes.data || {}, analysisPitch))
        .filter(Boolean);
      const enriched = {
        ...row,
        name: rawPlayer.detected_name || mapping.detected_name || row.detected_name || mapping.jugadores?.nombre || row.player_id,
        team,
        manual_pulmon: mapping.jugadores?.pulmon ?? null,
        distance_m: metrics.distance_m ?? rawPlayer.distance_m ?? toNumber(row.distance_km, 0) * 1000,
        distance_km: preferRawWhenMissing(row.distance_km, rawPlayer.distance_km),
        avg_speed_kmh: preferRawWhenMissing(row.avg_speed_kmh, rawPlayer.avg_speed_kmh),
        max_speed_kmh: preferRawWhenMissing(row.max_speed_kmh, rawPlayer.max_speed_kmh),
        raw_max_speed_kmh: preferRawWhenMissing(row.raw_max_speed_kmh, rawPlayer.raw_max_speed_kmh),
        sprints: preferRawWhenMissing(row.sprints, rawPlayer.sprints),
        high_intensity_seconds: preferRawWhenMissing(row.high_intensity_seconds, rawPlayer.high_intensity_seconds),
        accel_max_mps2: preferRawWhenMissing(row.accel_max_mps2, rawPlayer.accel_max_mps2),
        decel_max_mps2: preferRawWhenMissing(row.decel_max_mps2, rawPlayer.decel_max_mps2),
        goalkeeper_seconds: preferRawWhenMissing(row.goalkeeper_seconds, rawPlayer.goalkeeper_seconds),
        own_half_pct: preferRawWhenMissing(row.own_half_pct, rawPlayer.own_half_pct),
        rival_half_pct: preferRawWhenMissing(row.rival_half_pct, rawPlayer.rival_half_pct),
        own_side: ownSide,
        rival_side: rivalSide,
        avg_x_m: preferRawWhenMissing(row.avg_x_m, rawPlayer.avg_x_m),
        avg_y_m: preferRawWhenMissing(row.avg_y_m, rawPlayer.avg_y_m),
        dispersion_m: preferRawWhenMissing(row.dispersion_m, rawPlayer.dispersion_m),
        coverage_pct: preferRawWhenMissing(row.coverage_pct, rawPlayer.coverage_pct),
        pulmon_tracking: preferRawWhenMissing(row.pulmon_tracking, rawPlayer.pulmon_tracking),
        speed_distribution: row.speed_distribution || rawPlayer.speed_distribution || {},
        defense,
        defense_score: row.defense_score ?? (defense.defense_score !== undefined ? toNumber(defense.defense_score, 0) : rawPlayer.defense_score),
        defense_score_method: row.defense_score_method || defense.defense_score_method || rawPlayer.defense_score_method || defense.method || '',
        advanced_defense: advancedDefense,
        advanced_defense_score: row.advanced_defense_score ?? (advancedDefense.score !== undefined ? toNumber(advancedDefense.score, 0) : rawPlayer.advanced_defense_score),
        advanced_defense_axes: row.advanced_defense_axes || advancedDefense.axes || rawPlayer.advanced_defense_axes || {},
        physical_profile: physicalProfile,
        fis_valor: fisValor,
        fis_version: fisVersion,
        pulmon,
        goal_locations: goalLocations,
        metrics: {
          ...metrics,
          windows: metrics.windows || rawPlayer.windows || [],
          distance_m: metrics.distance_m ?? rawPlayer.distance_m ?? toNumber(row.distance_km, 0) * 1000,
          fatigue: metrics.fatigue || rawPlayer.fatigue || {},
          recovery: metrics.recovery || rawPlayer.recovery || {},
          directionality: metrics.directionality || rawPlayer.directionality || {},
          lane_distribution: metrics.lane_distribution || rawPlayer.lane_distribution || {},
          defense,
          advanced_defense: advancedDefense,
          physical_profile: physicalProfile,
          pulmon,
          fis_valor: fisValor,
          fis_version: fisVersion,
          goal_locations: goalLocations,
          own_side: ownSide,
          rival_side: rivalSide
        },
        highlights: row.highlights || rawPlayer.highlights || {},
        heatmap: heatmapRow.heatmap || rawPlayer.heatmap,
        heatmap_windows: heatmapRow.heatmap_windows || rawPlayer.heatmap_windows
      };
      const derivedField = playerFieldMetrics(enriched, analysisDuration);
      const dominantPosition = metrics.dominant_position_m
        || rawPlayer.dominant_position_m
        || heatmapDominantPosition(enriched.heatmap, analysisPitch);
      return {
        ...enriched,
        ...derivedField,
        dominant_position_m: dominantPosition || playerDisplayPosition(enriched, analysisPitch),
        metrics: {
          ...enriched.metrics,
          ...derivedField,
          dominant_position_m: dominantPosition || playerDisplayPosition(enriched, analysisPitch)
        }
      };
    }).sort((a, b) => (a.team || '').localeCompare(b.team || '') || a.name.localeCompare(b.name));

    const details = {
      analysis: analysisRes.data,
      mappings: mappingRes.data || [],
      players,
      teams: teamsRes.data || [],
      rankings: interactionMap.rankings || analysisRes.data?.raw_json?.rankings || {},
      temporal: interactionMap.temporal || analysisRes.data?.raw_json?.temporal || {},
      interactions: interactionMap.interactions || analysisRes.data?.raw_json?.interactions || {},
      average_positions: interactionMap.average_positions || analysisRes.data?.raw_json?.average_positions || {},
      available_metrics: interactionMap.available_metrics || rawNormalized?.available_metrics || analysisRes.data?.available_metrics || analysisRes.data?.raw_json?.available_metrics || {},
      review_analysis: interactionMap.review_analysis || rawNormalized?.review_analysis || analysisRes.data?.review_analysis || analysisRes.data?.raw_json?.review_analysis || {},
      advanced_defense: structuredAdvancedDefense,
      shot_map: structuredShotMap,
      match_link: interactionMap.match_link || rawNormalized?.match_link || analysisRes.data?.match_link || analysisRes.data?.raw_json?.match_link || {},
      goalkeeper_detection: interactionMap.goalkeeper_detection || rawNormalized?.goalkeeper_detection || analysisRes.data?.goalkeeper_detection || analysisRes.data?.raw_json?.goalkeeper_detection || {},
      effective_play: interactionMap.effective_play || rawNormalized?.effective_play || analysisRes.data?.effective_play || analysisRes.data?.raw_json?.effective_play || {},
      match_story: interactionMap.match_story || rawNormalized?.match_story || analysisRes.data?.match_story || analysisRes.data?.raw_json?.match_story || {},
      cross_stats: interactionMap.cross_stats || rawNormalized?.cross_stats || analysisRes.data?.cross_stats || analysisRes.data?.raw_json?.cross_stats || {},
      physical_profile: interactionMap.physical_profile || rawNormalized?.physical_profile || analysisRes.data?.physical_profile || analysisRes.data?.raw_json?.physical_profile || {},
      matchmaker_seed: interactionMap.matchmaker_seed || rawNormalized?.matchmaker_seed || analysisRes.data?.matchmaker_seed || analysisRes.data?.raw_json?.matchmaker_seed || {},
      supabase_export: interactionMap.supabase_export || rawNormalized?.supabase_export || analysisRes.data?.supabase_export || analysisRes.data?.raw_json?.supabase_export || {},
      limitations: interactionMap.limitations?.items || rawNormalized?.limitations || analysisRes.data?.raw_json?.limitations || [],
      raw: analysisRes.data?.raw_json || null
    };
    APP.detailsByAnalysis.set(key, details);
    return details;
  }

  async function openSummaryByMatch(partidoId) {
    try {
      await loadAnalysesForVisibleCards();
      const analysis = APP.analysisByMatch.get(String(partidoId));
      if (!analysis) {
        showToast('Este partido no tiene tracking cargado', 'info');
        return;
      }
      await openSummaryByAnalysisId(analysis.id);
    } catch (error) {
      console.error('[tracking] Error abriendo estadisticas:', error);
      showToast(`No se pudieron abrir estadisticas: ${error.message}`, 'error');
    }
  }

  async function openSummaryByAnalysisId(analysisId) {
    ensureModals();
    const title = document.getElementById('trackingSummaryTitle');
    const body = document.getElementById('trackingSummaryBody');
    if (title) title.innerHTML = '<i class="bi bi-activity me-2"></i>Estadisticas tracking';
    if (body) body.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-info"></div></div>';
    const modal = new bootstrap.Modal(document.getElementById('trackingSummaryModal'));
    modal.show();

    const details = await fetchAnalysisDetails(analysisId);
    renderSummaryModal(details);
    setTimeout(() => drawSummaryVisuals(details), 60);
  }

  function buildHighlightSlides(details) {
    const players = details.players || [];
    const duration = toNumber(details.analysis?.duration_seconds, 0);
    const topDistance = [...players].sort((a, b) => playerFieldMetrics(b, duration).field_distance_m - playerFieldMetrics(a, duration).field_distance_m)[0];
    const topSpeed = [...players].sort((a, b) => toNumber(b.max_speed_kmh) - toNumber(a.max_speed_kmh))[0];
    const topPulmon = [...players].sort((a, b) => toNumber(b.pulmon_tracking) - toNumber(a.pulmon_tracking))[0];
    const topSprint = [...players].sort((a, b) => toNumber(b.sprints) - toNumber(a.sprints))[0];

    return [
      topDistance && { title: 'Mas corredor', main: `${topDistance.name || topDistance.detected_name || 'Jugador'}`, sub: `${(playerFieldMetrics(topDistance, duration).field_distance_m / 1000).toFixed(2)} km de campo` },
      topSpeed && { title: 'Mas rapido', main: `${topSpeed.name || topSpeed.detected_name || 'Jugador'}`, sub: `${toNumber(topSpeed.max_speed_kmh).toFixed(1)} km/h pico robusto` },
      topPulmon && { title: 'Pulmon tracking', main: `${topPulmon.name || topPulmon.detected_name || 'Jugador'}`, sub: `${toNumber(topPulmon.pulmon_tracking).toFixed(1)}/100 por actividad fisica` },
      topSprint && { title: 'Mas sprints', main: `${topSprint.name || topSprint.detected_name || 'Jugador'}`, sub: `${toNumber(topSprint.sprints)} sprints sostenidos` },
    ].filter(Boolean);
  }

  function renderSummaryModal(details) {
    const body = document.getElementById('trackingSummaryBody');
    const title = document.getElementById('trackingSummaryTitle');
    if (!body) return;

    const match = details.analysis?.partidos || {};
    const date = match.fecha ? new Date(`${match.fecha}T12:00:00`).toLocaleDateString('es-AR') : 'Partido';
    if (title) {
      title.innerHTML = `<i class="bi bi-activity me-2"></i>Tracking - ${escapeHtml(date)} ${match.cancha ? `- ${escapeHtml(match.cancha)}` : ''}`;
    }

    const players = details.players || [];
    const duration = toNumber(details.analysis.duration_seconds, 0);
    const totalDistance = round(players.reduce((sum, player) => sum + playerFieldMetrics(player, duration).field_distance_m / 1000, 0), 2);
    const maxSpeed = round(Math.max(...players.map(player => toNumber(player.max_speed_kmh, 0))), 1);
    const fieldPlayers = players.filter(player => playerFieldMetrics(player, duration).field_seconds > 0);
    const avgPulmon = round(fieldPlayers.reduce((sum, player) => sum + toNumber(player.pulmon_tracking), 0) / Math.max(fieldPlayers.length, 1), 1);
    const avgKm40 = round(fieldPlayers.reduce((sum, player) => sum + playerFieldMetrics(player, duration).distance_per_40_min_km, 0) / Math.max(fieldPlayers.length, 1), 2);
    const totalSprints = players.reduce((sum, player) => sum + toNumber(player.sprints), 0);
    const slides = buildHighlightSlides(details);

    body.innerHTML = `
      <div class="d-grid gap-4">
        ${slides.length ? renderSlides(slides) : ''}
        <div class="tracking-kpi-grid">
          ${kpi('Jugadores', players.length)}
          ${kpi('KM campo', `${totalDistance} km`)}
          ${kpi("KM/40' prom.", `${avgKm40} km`)}
          ${kpi('Vel. maxima', `${maxSpeed} km/h`)}
          ${kpi('Sprints', totalSprints)}
          ${kpi('Pulmon promedio', `${avgPulmon}/100`)}
          ${kpi('Duracion', formatTime(details.analysis.duration_seconds))}
        </div>
        ${renderTrackingAvailability(details)}

        <div class="tracking-canvas-grid">
          <div class="tracking-canvas-card tracking-canvas-card-featured">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-white mb-0">Zonas dominantes</h6>
              <span class="small text-light-emphasis">jugador y zona por heatmap</span>
            </div>
            <canvas class="tracking-canvas" id="tracking-formation-canvas"></canvas>
          </div>
          <div class="tracking-canvas-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-white mb-0">Mapa calor ${teamUiLabel('A')}</h6>
              <span class="small tracking-team-a">azul - ${attackDirectionLabel(attackDirectionForTeam(details, 'A'))}</span>
            </div>
            <canvas class="tracking-canvas" id="tracking-team-heatmap-a-canvas"></canvas>
          </div>
          <div class="tracking-canvas-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-white mb-0">Mapa calor ${teamUiLabel('B')}</h6>
              <span class="small tracking-team-b">rojo - ${attackDirectionLabel(attackDirectionForTeam(details, 'B'))}</span>
            </div>
            <canvas class="tracking-canvas" id="tracking-team-heatmap-b-canvas"></canvas>
          </div>
        </div>

        ${renderDefenseSummary(details)}

        <div>
          <h6 class="text-white mb-2">Resumen fisico por jugador</h6>
          ${renderPlayersTable(players, details)}
        </div>

        <div class="tracking-profile-card">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="text-white mb-0">Pulmon por ventana</h6>
            <span class="small text-light-emphasis">${teamUiLabel('A')} vs ${teamUiLabel('B')}</span>
          </div>
          <div class="text-light-emphasis small mb-2">Eje X: tramo del partido. Eje Y: km/40' (kilometros proyectados cada 40 minutos de campo). Los minutos de arquero no cuentan.</div>
          <canvas class="tracking-canvas" id="tracking-pulmon-window-canvas"></canvas>
          ${renderPulmonWindowTable(details)}
        </div>

        <div>
          <h6 class="text-white mb-2">Mapas de calor individuales</h6>
          <div class="tracking-canvas-grid">
            ${players.map(player => `
              <div class="tracking-canvas-card">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <strong>${escapeHtml(player.name)}</strong>
                  <span class="small ${player.team === 'A' ? 'tracking-team-a' : 'tracking-team-b'}">Equipo ${escapeHtml(player.team || '-')}</span>
                </div>
                <canvas class="tracking-canvas" data-player-heatmap="${escapeHtml(player.player_id)}"></canvas>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function trackingDimensionLabel(key) {
    const labels = {
      motor: 'Motor',
      turbo: 'Turbo',
      chispa: 'Chispa',
      frenos: 'Frenos',
      giros: 'Giros',
      tanque: 'Tanque',
      recuperacion: 'Recuperacion'
    };
    return labels[key] || key.replace(/_/g, ' ');
  }

  function trackingDefenseAxisLabel(key) {
    const labels = {
      duel: 'Duelo',
      sacrifice: 'Sacrificio',
      order: 'Orden',
      responsibility: 'Resp.',
      ball_pressure: 'Presion',
      recovery: 'Vuelta'
    };
    return labels[key] || key.replace(/_/g, ' ');
  }

  function renderTrackingMetricPills(dimensions) {
    const entries = Object.entries(dimensions || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 7);
    if (!entries.length) {
      return '<div class="tracking-goal-note">El JSON no trajo dimensiones fisicas desglosadas para este jugador.</div>';
    }
    return `
      <div class="tracking-metric-band">
        ${entries.map(([key, value]) => `
          <div class="tracking-metric-pill">
            <strong>${round(value, 1)}</strong>
            <span>${escapeHtml(trackingDimensionLabel(key))}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTrackingAxisList(axes) {
    const entries = Object.entries(axes || {})
      .filter(([, value]) => Number.isFinite(Number(value)))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 6);
    if (!entries.length) {
      return '<div class="text-light-emphasis small">Sin ejes defensivos en el JSON importado.</div>';
    }
    return `
      <div class="tracking-axis-list">
        ${entries.map(([key, value]) => {
          const pct = Math.max(0, Math.min(100, toNumber(value)));
          return `
            <div class="tracking-axis-row">
              <span>${escapeHtml(trackingDefenseAxisLabel(key))}</span>
              <div class="tracking-axis-track"><div class="tracking-axis-fill" style="width:${pct}%"></div></div>
              <strong>${round(value, 0)}</strong>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderSlides(slides) {
    const id = 'trackingHighlightsCarousel';
    return `
      <div id="${id}" class="carousel slide" data-bs-ride="carousel" data-bs-interval="3800">
        <div class="carousel-inner">
          ${slides.map((slide, index) => `
            <div class="carousel-item ${index === 0 ? 'active' : ''}">
              <div class="tracking-carousel-card">
                <div class="tracking-slide-title">${escapeHtml(slide.title)}</div>
                <div class="tracking-slide-main">${escapeHtml(slide.main)}</div>
                <div class="tracking-slide-sub">${escapeHtml(slide.sub)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderTrackingAvailability(details) {
    const metrics = details.available_metrics || {};
    const review = details.review_analysis || {};
    const matchLink = details.match_link || {};
    if (!Object.keys(metrics).length && !Object.keys(review).length && !Object.keys(matchLink).length) return '';

    const coverage = review.coverage || matchLink.coverage || {};
    const syncMode = matchLink.sync_mode || (review.event_metrics_enabled ? 'timed_events' : 'tracking_only');
    const modeLabel = review.event_metrics_enabled
      ? `Goles sincronizados ${toNumber(coverage.goals_linked)}/${toNumber(coverage.goals_total)}`
      : 'Solo tracking';
    const metricBadges = [
      ['Fisico', metrics.physical_tracking],
      ['Heatmaps', metrics.heatmaps],
      ['Equipos', metrics.team_stats],
      ['Mapa remates', metrics.shot_map]
    ];
    const reason = review.reason || matchLink.reason || '';

    return `
      <div class="tracking-profile-card">
        <div class="d-flex flex-wrap justify-content-between gap-2 align-items-start">
          <div>
            <h6 class="text-white mb-1">Datos disponibles</h6>
            <div class="text-light-emphasis small">${escapeHtml(modeLabel)} / ${escapeHtml(syncMode)}</div>
          </div>
          <div class="d-flex flex-wrap gap-1 justify-content-end">
            ${metricBadges.map(([label, enabled]) => `
              <span class="badge ${enabled ? 'text-bg-success' : 'text-bg-secondary'}">${escapeHtml(label)}</span>
            `).join('')}
          </div>
        </div>
        ${reason ? `<div class="text-light-emphasis small mt-2">${escapeHtml(reason)}</div>` : ''}
      </div>
    `;
  }

  function renderAdvancedDefenseSummary(details) {
    const advanced = details.advanced_defense || details.review_analysis?.advanced_defense || {};
    const playerById = new Map((details.players || []).map(player => [String(player.player_id), player]));
    let rows = Array.isArray(advanced.players) ? advanced.players : [];
    if (!rows.length) {
      rows = (details.players || [])
        .filter(player => player.advanced_defense_score !== null && player.advanced_defense_score !== undefined)
        .map(player => player.advanced_defense || player);
    }
    rows = rows
      .map(row => {
        const player = playerById.get(String(row.player_id)) || {};
        return {
          ...row,
          name: player.name || player.detected_name || row.name,
          team: player.team || row.team,
          score: row.score ?? player.advanced_defense_score
        };
      })
      .sort((a, b) => toNumber(b.score) - toNumber(a.score));
    if (!rows.length) return '';

    const coverage = advanced.coverage || {};
    const events = Array.isArray(advanced.events) ? advanced.events : [];
    const eventRows = events.slice(0, 12);
    const coverageText = `${toNumber(coverage.goal_events)} goles, ${toNumber(coverage.saved_shot_events)} remates atajados, ${toNumber(coverage.danger_events)} eventos de peligro.`;

    return `
      <div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="text-white mb-0">Detalle defensivo</h6>
          <span class="small text-light-emphasis">${escapeHtml(coverageText)}</span>
        </div>
        <div class="tracking-table-wrap mb-3">
          <table class="tracking-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Equipo</th>
                <th>Score</th>
                <th>Duelo</th>
                <th>Sacrificio</th>
                <th>Orden</th>
                <th>Resp.</th>
                <th>Culpa</th>
                <th>Heroe</th>
                <th>Vuelta</th>
                <th>Presiones</th>
                <th>Tercios</th>
              </tr>
            </thead>
            <tbody>
              ${rows.slice(0, 12).map(row => {
                const axes = row.axes || {};
                const blame = row.event_blame || {};
                const phase = row.phase_metrics || {};
                const thirds = (row.thirds || []).map(item => toNumber(item.score).toFixed(0)).join(' / ');
                return `
                  <tr>
                    <td><span class="tracking-player-dot" style="background:${row.team === 'A' ? '#60a5fa' : '#f87171'}"></span>${escapeHtml(row.name || row.player_id || '-')}</td>
                    <td>${escapeHtml(row.team || '-')}</td>
                    <td><strong>${toNumber(row.score).toFixed(1)}</strong></td>
                    <td>${toNumber(axes.duel).toFixed(0)}</td>
                    <td>${toNumber(axes.sacrifice).toFixed(0)}</td>
                    <td>${toNumber(axes.order).toFixed(0)}</td>
                    <td>${toNumber(axes.responsibility).toFixed(0)}</td>
                    <td>${toNumber(blame.total).toFixed(1)}</td>
                    <td>${toNumber(blame.hero_bonus).toFixed(1)}</td>
                    <td>${toNumber(phase.avg_return_speed_to_own_goal_mps).toFixed(2)} m/s</td>
                    <td>${toNumber(phase.pressure_successes)}</td>
                    <td>${escapeHtml(thirds || '-')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${eventRows.length ? `
          <div class="tracking-table-wrap">
            <table class="tracking-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Tiempo</th>
                  <th>Rematador</th>
                  <th>Defiende</th>
                  <th>Contexto</th>
                  <th>Culpa</th>
                  <th>Reparto</th>
                </tr>
              </thead>
              <tbody>
                ${eventRows.map(event => {
                  const context = event.context || {};
                  const phase = context.phase || {};
                  const weighting = event.weighting || {};
                  const assignments = (event.assignments || [])
                    .filter(item => toNumber(item.capped_blame ?? item.blame) > 0 || toNumber(item.bonus) > 0)
                    .sort((a, b) => toNumber(b.capped_blame ?? b.blame) - toNumber(a.capped_blame ?? a.blame))
                    .slice(0, 3)
                    .map(item => {
                      const bonus = toNumber(item.bonus);
                      const blame = toNumber(item.capped_blame ?? item.blame);
                      return `${item.name || item.player_id || '-'} ${bonus > 0 ? `+${bonus.toFixed(1)}` : `-${blame.toFixed(1)}`}`;
                    })
                    .join(', ');
                  return `
                    <tr>
                      <td>${event.type === 'goal' ? 'Gol' : 'Atajada'} #${escapeHtml(event.order || '')}</td>
                      <td>${formatTime(event.sam3_seconds || 0)}</td>
                      <td>${escapeHtml(event.shooter?.name || event.shooter?.player_id || '-')}</td>
                      <td>${escapeHtml(event.defending_team || '-')}</td>
                      <td>${escapeHtml(context.state || '-')}${phase.phase ? `<br><span class="text-light-emphasis small">${phase.phase === 'transition' ? 'transicion' : 'defensa armada'}</span>` : ''}</td>
                      <td>${toNumber(weighting.total_blame).toFixed(2)}</td>
                      <td>${escapeHtml(assignments || '-')}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>
    `;
  }

  function renderDefenseSummary(details) {
    const review = details.review_analysis || {};
    const playerById = new Map((details.players || []).map(player => [String(player.player_id), player]));
    let rows = (review.defensive_players || [])
      .map(row => {
        const player = playerById.get(String(row.player_id)) || {};
        return { ...row, name: player.name || row.name, team: player.team || row.team };
      });

    if (!rows.length) {
      rows = (details.players || [])
        .filter(player => player.defense_score !== null && player.defense_score !== undefined)
        .map(player => ({ ...player, ...(player.defense || {}) }));
    }
    rows.sort((a, b) => toNumber(b.defense_score) - toNumber(a.defense_score));
    if (!rows.length) return '';

    const coverage = review.coverage || {};
    const modeText = review.event_metrics_enabled
      ? `Eventos sincronizados: ${toNumber(coverage.goals_linked)}/${toNumber(coverage.goals_total)} goles, ${toNumber(coverage.saves_linked)}/${toNumber(coverage.saves_total)} atajadas.`
      : 'Score defensivo por movimiento en campo propio y tercio defensivo.';

    return `
      <div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="text-white mb-0">Score defensivo</h6>
          <span class="small text-light-emphasis">Mayor a menor / ${escapeHtml(modeText)}</span>
        </div>
        <div class="tracking-table-wrap">
          <table class="tracking-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Equipo</th>
                <th>Rol</th>
                <th>Score</th>
                <th>Metodo</th>
                <th>Campo propio</th>
                <th>Tercio def.</th>
                <th>Dist. defensa</th>
                <th>Goles contra</th>
                <th>Atajadas arco</th>
                <th>Carga peligro</th>
                <th>Marca perdida</th>
              </tr>
            </thead>
            <tbody>
              ${rows.slice(0, 10).map(row => {
                const movement = row.movement || row;
                const method = row.defense_score_method || row.method || review.defense_score_method || '';
                const isGoalkeeper = row.role === 'goalkeeper' || method === 'goalkeeper_clean_sheet';
                const methodLabel = method === 'goalkeeper_clean_sheet'
                  ? 'Arquero'
                  : (method === 'event_tracking_blend' ? 'Eventos + movimiento' : 'Movimiento');
                const saves = isGoalkeeper ? row.saves_made : (row.goalkeeper_saves_against ?? row.team_saves_against);
                const dangerLoad = isGoalkeeper ? row.save_load : (row.goalkeeper_save_load_against ?? row.pressure_load_against);
                return `
                  <tr>
                    <td><span class="tracking-player-dot" style="background:${row.team === 'A' ? '#60a5fa' : '#f87171'}"></span>${escapeHtml(row.name || row.detected_name || row.player_id || '-')}</td>
                    <td>${escapeHtml(row.team || '-')}</td>
                    <td>${isGoalkeeper ? 'Arquero' : 'Defensa'}</td>
                    <td><strong>${toNumber(row.defense_score).toFixed(1)}</strong></td>
                    <td>${escapeHtml(methodLabel)}</td>
                    <td>${isGoalkeeper ? '-' : `${toNumber(movement.defensive_half_pct ?? movement.own_half_pct).toFixed(1)}%`}</td>
                    <td>${isGoalkeeper ? '-' : `${toNumber(movement.defensive_third_pct).toFixed(1)}%`}</td>
                    <td>${isGoalkeeper ? '-' : `${toNumber(movement.defensive_distance_m).toFixed(0)} m`}</td>
                    <td>${toNumber(row.goals_against)}</td>
                    <td>${toNumber(saves)}</td>
                    <td>${toNumber(dangerLoad).toFixed(1)}</td>
                    <td>${toNumber(row.lost_mark)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function kpi(label, value) {
    return `
      <div class="tracking-kpi">
        <div class="tracking-kpi-value">${escapeHtml(value)}</div>
        <div class="tracking-kpi-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  function renderPlayersTable(players, details = {}) {
    const pitch = pitchForAnalysis(details.analysis || {});
    const duration = toNumber(details.analysis?.duration_seconds, 0);
    return `
      <div class="tracking-table-wrap">
        <table class="tracking-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>KM campo</th>
              <th>Min campo</th>
              <th>KM/40'</th>
              <th>Vel prom</th>
              <th>Vel max</th>
              <th>Pulmon</th>
              <th>Sprints</th>
              <th>Alta intensidad</th>
              <th>Arq</th>
              <th>Zona dominante</th>
            </tr>
          </thead>
          <tbody>
            ${players.map(player => {
              const field = playerFieldMetrics(player, duration);
              const zone = pitchZoneLabel(playerDisplayPosition(player, pitch), pitch);
              return `
                <tr>
                  <td><span class="tracking-player-dot" style="background:${player.team === 'A' ? '#60a5fa' : '#f87171'}"></span>${escapeHtml(player.name)}</td>
                  <td>${escapeHtml(teamUiLabel(player.team))}</td>
                  <td>${(field.field_distance_m / 1000).toFixed(2)}</td>
                  <td>${field.field_minutes.toFixed(1)}</td>
                  <td>${field.distance_per_40_min_km.toFixed(2)}</td>
                  <td>${toNumber(player.avg_speed_kmh).toFixed(1)} km/h</td>
                  <td>${toNumber(player.max_speed_kmh).toFixed(1)} km/h</td>
                  <td>${toNumber(player.pulmon_tracking).toFixed(1)}</td>
                  <td>${toNumber(player.sprints)}</td>
                  <td>${formatTime(player.high_intensity_seconds)}</td>
                  <td>${formatTime(player.goalkeeper_seconds)}</td>
                  <td>${escapeHtml(zone)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderPulmonWindowTable(details) {
    const windows = buildTeamPulmonWindowSeries(details);
    if (!windows.length) return '<div class="text-light-emphasis small">Sin ventanas temporales.</div>';
    const hasEstimated = windows.some(window => window.teams.A.estimated_distance || window.teams.B.estimated_distance);
    return `
      <div class="tracking-table-wrap mt-3">
        <table class="tracking-table tracking-window-table">
          <thead>
            <tr>
              <th>Tramo</th>
              <th>${teamUiLabel('A')}</th>
              <th>${teamUiLabel('B')}</th>
            </tr>
          </thead>
          <tbody>
            ${windows.slice(0, 12).map(window => {
              const label = `${formatTime(window.start_seconds)}-${formatTime(window.end_seconds)}`;
              const teamA = window.teams.A;
              const teamB = window.teams.B;
              return `
                <tr>
                  <td>${label}</td>
                  <td><strong>${round(teamA.distance_m, 0)} m</strong> | ${teamA.km_per_40.toFixed(2)} km/40' | ${formatTime(teamA.high_intensity_seconds)} alta</td>
                  <td><strong>${round(teamB.distance_m, 0)} m</strong> | ${teamB.km_per_40.toFixed(2)} km/40' | ${formatTime(teamB.high_intensity_seconds)} alta</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${hasEstimated ? '<div class="tracking-goal-note">Cuando el JSON no trae metros por ventana, se estima el reparto usando distancia total, tiempo de campo e intensidad.</div>' : ''}
    `;
  }

  function renderInteractions(details) {
    const pairs = details.interactions?.marking_pairs || [];
    if (!pairs.length) return '<div class="text-light-emphasis">Sin marcas sostenidas en el JSON.</div>';
    return pairs.slice(0, 8).map(pair => {
      const marker = pair.marker || pair.a || pair.player_a || 'Jugador';
      const marked = pair.marked || pair.b || pair.player_b || 'Rival';
      const seconds = pair.seconds || pair.duration_seconds || pair.sustained_seconds || 0;
      const distance = pair.avg_distance_m || pair.distance_m || pair.mean_distance_m || 0;
      return `
        <div class="d-flex justify-content-between border-bottom border-secondary py-2 small">
          <span>${escapeHtml(marker)} -> ${escapeHtml(marked)}</span>
          <strong>${formatTime(seconds)} | ${round(distance, 1)} m</strong>
        </div>
      `;
    }).join('');
  }

  function drawSummaryVisuals(details) {
    const pitch = {
      width: toNumber(details.analysis.pitch_width_m, DEFAULT_PITCH.width),
      height: toNumber(details.analysis.pitch_height_m, DEFAULT_PITCH.height)
    };
    const formationCanvas = document.getElementById('tracking-formation-canvas');
    if (formationCanvas) {
      drawPitch(formationCanvas, pitch, { players: details.players, title: '' });
    }
    ['A', 'B'].forEach(team => {
      const canvas = document.getElementById(`tracking-team-heatmap-${team.toLowerCase()}-canvas`);
      if (!canvas) return;
      const teamPlayers = (details.players || []).filter(player => String(player.team || '').toUpperCase() === team);
      const combined = combineHeatmaps(teamPlayers.map(player => player.heatmap).filter(Boolean));
      drawHeatmap(canvas, pitch, combined, teamPlayers, { attackDirection: attackDirectionForTeam(details, team) });
    });
    drawPulmonWindowChart(document.getElementById('tracking-pulmon-window-canvas'), details);
    document.querySelectorAll('[data-player-heatmap]').forEach(canvas => {
      const player = (details.players || []).find(item => item.player_id === canvas.dataset.playerHeatmap);
      drawHeatmap(canvas, pitch, player?.heatmap, player ? [player] : []);
    });
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 640));
    const height = Math.max(160, Math.round(rect.height || width / 2));
    canvas.width = width;
    canvas.height = height;
    return { ctx: canvas.getContext('2d'), width, height };
  }

  function drawBasePitch(ctx, width, height) {
    ctx.fillStyle = '#0b3b22';
    ctx.fillRect(0, 0, width, height);
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.04)';
      ctx.fillRect((width / stripeCount) * i, 0, width / stripeCount, height);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.62)';
    ctx.lineWidth = Math.max(1, width / 320);
    ctx.strokeRect(width * 0.04, height * 0.08, width * 0.92, height * 0.84);
    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.08);
    ctx.lineTo(width * 0.5, height * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, height * 0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(width * 0.04, height * 0.32, width * 0.16, height * 0.36);
    ctx.strokeRect(width * 0.80, height * 0.32, width * 0.16, height * 0.36);
  }

  function drawCanvasAttackDirection(ctx, width, height, direction) {
    if (!direction) return;
    const text = attackDirectionLabel(direction);
    const right = direction === 'right';
    const fontSize = Math.max(13, Math.min(18, width * 0.02));
    const padX = Math.max(10, width * 0.014);
    const pillH = Math.max(28, fontSize + 12);
    ctx.save();
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    const pillW = Math.min(width * 0.34, ctx.measureText(text).width + padX * 2);
    const x = right ? width - pillW - width * 0.055 : width * 0.055;
    const y = height * 0.105;
    ctx.fillStyle = 'rgba(2, 6, 23, .72)';
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, pillW, pillH, 999);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + pillW / 2, y + pillH / 2 + 0.5);

    const arrowY = y + pillH + Math.max(12, height * 0.035);
    const startX = right ? x : x + pillW;
    const endX = right ? Math.min(width * 0.93, startX + width * 0.18) : Math.max(width * 0.07, startX - width * 0.18);
    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.lineWidth = Math.max(2, width / 360);
    ctx.beginPath();
    ctx.moveTo(startX, arrowY);
    ctx.lineTo(endX, arrowY);
    ctx.stroke();
    const head = Math.max(7, width * 0.012);
    ctx.beginPath();
    ctx.moveTo(endX, arrowY);
    ctx.lineTo(endX + (right ? -head : head), arrowY - head * 0.65);
    ctx.lineTo(endX + (right ? -head : head), arrowY + head * 0.65);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.fill();
    ctx.restore();
  }

  function drawCanvasGoalReference(ctx, width, height, options = {}) {
    const defenseLabel = options.defenseLabel || 'Arco defensa';
    const attackLabel = options.attackLabel || 'Arco ataque';
    const fontSize = Math.max(11, Math.min(16, width * 0.018));
    const goalW = Math.max(10, width * 0.014);
    const goalH = height * 0.26;
    const goalY = (height - goalH) / 2;
    const leftX = Math.max(2, width * 0.04 - goalW * 0.5);
    const rightX = Math.min(width - goalW - 2, width * 0.96 - goalW * 0.5);
    const drawGoal = (x, label, color, alignRight = false) => {
      const labelW = Math.min(width * 0.24, Math.max(104, label.length * fontSize * 0.56 + 22));
      const labelH = Math.max(26, fontSize + 12);
      const labelX = alignRight ? width * 0.96 - labelW : width * 0.04;
      const labelY = height * 0.1;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = 'rgba(2, 6, 23, .72)';
      ctx.lineWidth = Math.max(2, width / 460);
      ctx.strokeRect(x, goalY, goalW, goalH);
      ctx.beginPath();
      ctx.roundRect(labelX, labelY, labelW, labelH, 999);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, labelX + labelW / 2, labelY + labelH / 2 + 0.5);
      ctx.restore();
    };

    drawGoal(leftX, defenseLabel, '#93c5fd');
    drawGoal(rightX, attackLabel, '#facc15', true);
  }

  function coordinateRatio(value, size, coordinateSystem = '') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0.5;
    const system = normalizeName(coordinateSystem);
    if (system.includes('percent') || system.includes('porcentaje')) {
      return clamp(n / 100, 0, 1);
    }
    if ((system.includes('normal') || system.includes('ratio')) && n >= 0 && n <= 1) {
      return clamp(n, 0, 1);
    }
    if (n >= 0 && n <= size) {
      return clamp(n / Math.max(size, 1), 0, 1);
    }
    if (n >= -size / 2 && n <= size / 2) {
      return clamp((n + size / 2) / Math.max(size, 1), 0, 1);
    }
    if (n >= 0 && n <= 100) {
      return clamp(n / 100, 0, 1);
    }
    return clamp(n / Math.max(size, 1), 0, 1);
  }

  function pitchToCanvas(point, pitch, width, height) {
    const padX = width * 0.04;
    const padY = height * 0.08;
    const innerW = width * 0.92;
    const innerH = height * 0.84;
    const sourcePitch = {
      width: toNumber(point.pitch_width_m ?? point.pitch?.width, pitch.width),
      height: toNumber(point.pitch_height_m ?? point.pitch?.height, pitch.height)
    };
    const ratioX = coordinateRatio(point.x ?? point.avg_x_m, sourcePitch.width, point.coordinate_system);
    const ratioY = coordinateRatio(point.y ?? point.avg_y_m, sourcePitch.height, point.coordinate_system);
    return {
      x: padX + ratioX * innerW,
      y: padY + ratioY * innerH
    };
  }

  function canvasPlayerName(player = {}) {
    return player.name || player.detected_name || player.source_name || player.player_id || 'Jugador';
  }

  function fitCanvasText(ctx, text, maxWidth) {
    const suffix = '...';
    const value = String(text || '-').trim() || '-';
    if (ctx.measureText(value).width <= maxWidth) return value;
    let end = value.length;
    while (end > 1) {
      const candidate = `${value.slice(0, end).trim()}${suffix}`;
      if (ctx.measureText(candidate).width <= maxWidth) return candidate;
      end -= 1;
    }
    return value.slice(0, 1);
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function labelOverlapCount(rect, occupiedRects) {
    return occupiedRects.reduce((count, occupied) => count + (rectsOverlap(rect, occupied) ? 1 : 0), 0);
  }

  function labelCandidateRect(anchorX, anchorY, labelW, labelH, width, height, offset) {
    return {
      x: clamp(anchorX + offset.dx, 4, width - labelW - 4),
      y: clamp(anchorY + offset.dy, 4, height - labelH - 4),
      w: labelW,
      h: labelH
    };
  }

  function drawCanvasPlayerLabel(ctx, linesInput, anchor, width, height, options = {}, occupiedRects = []) {
    const lines = (Array.isArray(linesInput) ? linesInput : [linesInput])
      .map(line => String(line || '').trim())
      .filter(Boolean);
    if (!lines.length) return;

    const fontSize = options.fontSize || Math.max(12, Math.min(18, width * 0.018));
    const lineHeight = Math.ceil(fontSize * 1.16);
    const maxLabelWidth = Math.max(92, Math.min(options.maxWidth || width * 0.34, width - 16));
    ctx.save();
    ctx.font = `${options.weight || 800} ${fontSize}px system-ui, sans-serif`;
    const fittedLines = lines.map(line => fitCanvasText(ctx, line, maxLabelWidth - 16));
    const textWidth = Math.max(...fittedLines.map(line => ctx.measureText(line).width));
    const labelW = Math.min(maxLabelWidth, textWidth + 16);
    const labelH = Math.max(24, fittedLines.length * lineHeight + 10);
    const offsets = [
      { dx: 12, dy: -labelH / 2 },
      { dx: -labelW - 12, dy: -labelH / 2 },
      { dx: -labelW / 2, dy: -labelH - 12 },
      { dx: -labelW / 2, dy: 12 },
      { dx: 12, dy: 12 },
      { dx: -labelW - 12, dy: 12 },
      { dx: 12, dy: -labelH - 12 },
      { dx: -labelW - 12, dy: -labelH - 12 }
    ];
    let bestRect = null;
    let bestOverlap = Infinity;
    offsets.forEach(offset => {
      const rect = labelCandidateRect(anchor.x, anchor.y, labelW, labelH, width, height, offset);
      const overlaps = labelOverlapCount(rect, occupiedRects);
      if (overlaps < bestOverlap) {
        bestRect = rect;
        bestOverlap = overlaps;
      }
    });
    if (!bestRect) {
      ctx.restore();
      return;
    }
    occupiedRects.push(bestRect);

    ctx.strokeStyle = options.connectorColor || 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(bestRect.x + bestRect.w / 2, bestRect.y + bestRect.h / 2);
    ctx.stroke();

    ctx.fillStyle = options.background || 'rgba(8, 13, 26, .84)';
    ctx.fillRect(bestRect.x, bestRect.y, bestRect.w, bestRect.h);
    ctx.strokeStyle = options.border || 'rgba(255,255,255,.28)';
    ctx.strokeRect(bestRect.x, bestRect.y, bestRect.w, bestRect.h);
    ctx.fillStyle = options.color || '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    fittedLines.forEach((line, index) => {
      ctx.fillText(line, bestRect.x + 8, bestRect.y + 6 + index * lineHeight);
    });
    ctx.restore();
  }

  function drawCanvasPlayerMarker(ctx, point, color, radius) {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawPitch(canvas, pitch, options = {}) {
    const { ctx, width, height } = setupCanvas(canvas);
    drawBasePitch(ctx, width, height);
    const players = options.players || [];
    const placedPlayers = players.map(player => {
      const position = playerDisplayPosition(player, pitch);
      return {
        player,
        position,
        point: pitchToCanvas(position, pitch, width, height)
      };
    });
    placedPlayers.forEach(({ player, point }) => {
      const color = player.team === 'A' ? '#2563eb' : '#dc2626';
      drawCanvasPlayerMarker(ctx, point, color, Math.max(9, width * 0.011));
    });
    const occupiedRects = [];
    placedPlayers.forEach(({ player, position, point }) => {
      drawCanvasPlayerLabel(
        ctx,
        [canvasPlayerName(player), pitchZoneLabel(position, pitch)],
        point,
        width,
        height,
        {
          fontSize: Math.max(14, Math.min(22, width * 0.02)),
          maxWidth: width * 0.28,
          background: 'rgba(5, 12, 24, .88)'
        },
        occupiedRects
      );
    });
  }

  function drawHeatmap(canvas, pitch, heatmap, players = [], options = {}) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas);
    drawBasePitch(ctx, width, height);
    const normalized = normalizeHeatmap(heatmap);
    if (normalized.counts.length) {
      const padX = width * 0.04;
      const padY = height * 0.08;
      const innerW = width * 0.92;
      const innerH = height * 0.84;
      const maxValue = Math.max(...normalized.flat, 1);
      const cellW = innerW / Math.max(normalized.x_bins, 1);
      const cellH = innerH / Math.max(normalized.y_bins, 1);
      normalized.counts.forEach((row, y) => {
        row.forEach((value, x) => {
          const ratio = Math.min(1, toNumber(value, 0) / maxValue);
          if (ratio <= 0) return;
          ctx.fillStyle = `rgba(245, 158, 11, ${0.08 + ratio * 0.72})`;
          ctx.fillRect(padX + x * cellW, padY + y * cellH, cellW + 1, cellH + 1);
        });
      });
    }
    drawCanvasAttackDirection(ctx, width, height, options.attackDirection);
    if (options.showGoalReference) {
      drawCanvasGoalReference(ctx, width, height, options.goalReference || {});
    }
    const placedPlayers = players.map(player => ({
      player,
      point: pitchToCanvas(playerDisplayPosition(player, pitch), pitch, width, height)
    }));
    placedPlayers.forEach(({ player, point }) => {
      drawCanvasPlayerMarker(
        ctx,
        point,
        player.team === 'A' ? '#60a5fa' : '#f87171',
        Math.max(8, width * 0.011)
      );
    });
    const occupiedRects = [];
    placedPlayers.forEach(({ player, point }) => {
      drawCanvasPlayerLabel(
        ctx,
        canvasPlayerName(player),
        point,
        width,
        height,
        {
          fontSize: Math.max(13, Math.min(18, width * 0.018)),
          maxWidth: width * 0.30,
          background: 'rgba(15, 23, 42, .9)'
        },
        occupiedRects
      );
    });
  }

  function drawPulmonWindowChart(canvas, details = {}) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas);
    const windows = buildTeamPulmonWindowSeries(details);
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, width, height);

    if (!windows.length) {
      ctx.fillStyle = 'rgba(255,255,255,.74)';
      ctx.font = `${Math.max(13, width * 0.022)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Sin ventanas temporales', width / 2, height / 2);
      ctx.textAlign = 'start';
      return;
    }

    const padLeft = Math.max(70, width * 0.095);
    const padRight = Math.max(22, width * 0.04);
    const padTop = Math.max(20, height * 0.12);
    const padBottom = Math.max(52, height * 0.24);
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const values = windows
      .flatMap(window => [window.teams.A.km_per_40, window.teams.B.km_per_40])
      .map(value => Number(value))
      .filter(Number.isFinite);
    let minValue = Math.floor(Math.min(...values) * 10) / 10;
    let maxValue = Math.ceil(Math.max(...values) * 10) / 10;
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      minValue = 0;
      maxValue = 1;
    }
    if (minValue === maxValue) {
      minValue = Math.max(0, minValue - 0.1);
      maxValue += 0.1;
    }
    const valueRange = Math.max(0.1, maxValue - minValue);

    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = `${Math.max(10, width * 0.014)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i += 1) {
      const y = padTop + chartH - (chartH * i) / 4;
      const value = minValue + (valueRange * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(value.toFixed(1), padLeft - 8, y + 4);
    }

    const xFor = (index) => {
      if (windows.length === 1) return padLeft + chartW / 2;
      return padLeft + (chartW * index) / (windows.length - 1);
    };
    const yFor = (value) => padTop + chartH - (chartH * clamp((value - minValue) / valueRange, 0, 1));
    const drawLine = (team, color) => {
      ctx.beginPath();
      windows.forEach((window, index) => {
        const x = xFor(index);
        const y = yFor(window.teams[team].km_per_40);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, width / 260);
      ctx.stroke();

      windows.forEach((window, index) => {
        const x = xFor(index);
        const y = yFor(window.teams[team].km_per_40);
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.arc(x, y, Math.max(3.5, width * 0.005), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    };

    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, padTop);
    ctx.lineTo(padLeft, padTop + chartH);
    ctx.lineTo(width - padRight, padTop + chartH);
    ctx.stroke();

    drawLine('A', '#60a5fa');
    drawLine('B', '#f87171');

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,.70)';
    windows.forEach((window, index) => {
      if (index % Math.ceil(windows.length / 6) !== 0 && index !== windows.length - 1) return;
      ctx.fillText(formatTime(window.start_seconds), xFor(index), height - padBottom + 22);
    });

    ctx.textAlign = 'left';
    ctx.font = `800 ${Math.max(11, width * 0.015)}px system-ui, sans-serif`;
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(teamUiLabel('A'), padLeft, padTop - 5);
    ctx.fillStyle = '#f87171';
    ctx.fillText(teamUiLabel('B'), padLeft + 120, padTop - 5);
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = `${Math.max(10, width * 0.013)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Eje X: tramo del partido', padLeft + chartW / 2, height - 8);
    ctx.save();
    ctx.translate(16, padTop + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText("Eje Y: km/40'", 0, 0);
    ctx.restore();
  }

  function drawGoalLocations(canvas, pitch, goals = []) {
    if (!canvas) return;
    const { ctx, width, height } = setupCanvas(canvas);
    drawBasePitch(ctx, width, height);
    const validGoals = (goals || []).filter(goal => Number.isFinite(Number(goal.x)) && Number.isFinite(Number(goal.y)));
    if (!validGoals.length) {
      ctx.fillStyle = 'rgba(255,255,255,.74)';
      ctx.font = `${Math.max(13, width * 0.022)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Sin goles con ubicacion importada', width / 2, height / 2);
      ctx.textAlign = 'start';
      return;
    }

    validGoals.forEach((goal, index) => {
      const p = pitchToCanvas(goal, pitch, width, height);
      const radius = Math.max(8, width * 0.015);
      ctx.beginPath();
      ctx.fillStyle = 'rgba(250, 204, 21, .92)';
      ctx.strokeStyle = 'rgba(17, 24, 39, .92)';
      ctx.lineWidth = Math.max(2, width / 360);
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#111827';
      ctx.font = `800 ${Math.max(9, width * 0.014)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(goal.order || index + 1), p.x, p.y + 0.5);
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }

  async function refreshTrackingCaches(force = false) {
    if (!force && APP.statsByPlayer.size) return;
    const client = await waitForSupabase(3000);
    if (!client) return;
    try {
      const statsRes = await client.from(TRACKING_TABLES.stats)
        .select('*, tracking_analyses(id, partido_id, duration_seconds, pitch_width_m, pitch_height_m, team_own_sides, partidos(id, fecha, cancha, equipo_ganador, temporada_id, temporadas(nombre)))')
        .not('jugador_id', 'is', null);
      if (statsRes.error) throw statsRes.error;

      let heatmapRows = [];
      const heatmapsRes = await client.from(TRACKING_TABLES.heatmaps)
        .select('analysis_id, jugador_id, heatmap, heatmap_windows')
        .not('jugador_id', 'is', null);
      if (!heatmapsRes.error) {
        heatmapRows = heatmapsRes.data || [];
      }

      let mappingRows = [];
      const mappingRes = await client.from(TRACKING_TABLES.mapping)
        .select('analysis_id, player_id, source_player_id, jugador_id, detected_name, source_name, normalized_name')
        .not('jugador_id', 'is', null);
      if (!mappingRes.error) {
        mappingRows = mappingRes.data || [];
      } else {
        console.warn('[tracking] mapeo de jugadores no disponible para arqueros:', mappingRes.error.message || mappingRes.error);
      }

      let shotEventRows = [];
      const shotEventsRes = await client.from(TRACKING_TABLES.shotEvents)
        .select('analysis_id, partido_id, event_type, outcome, event_order, review_seconds, match_seconds, sam3_seconds, player_id, source_player_id, source_name, normalized_name, detected_name, team, x_m, y_m, active_goalkeeper_player_id, active_goalkeeper_name, active_goalkeeper_team, payload, tracking_analyses(id, partido_id, pitch_width_m, pitch_height_m, team_own_sides, partidos(id, fecha, cancha, temporada_id, temporadas(nombre)))');
      if (!shotEventsRes.error) {
        shotEventRows = shotEventsRes.data || [];
      } else {
        console.warn('[tracking] eventos de remate no disponibles para arqueros:', shotEventsRes.error.message || shotEventsRes.error);
      }

      const heatmapKey = new Map(heatmapRows.map(row => [`${row.analysis_id}:${row.jugador_id}`, row]));
      const playerIdByTrackingKey = new Map();
      const playerIdByNameKey = new Map();
      (statsRes.data || []).forEach(row => registerTrackingPlayerIdentity(row, playerIdByTrackingKey, playerIdByNameKey));
      mappingRows.forEach(row => registerTrackingPlayerIdentity(row, playerIdByTrackingKey, playerIdByNameKey));
      APP.statsByPlayer.clear();
      APP.latestByPlayer.clear();
      APP.goalsConcededByPlayer = buildGoalkeeperConcededGoals(shotEventRows, playerIdByTrackingKey, playerIdByNameKey);
      (statsRes.data || []).forEach(row => {
        const key = String(row.jugador_id);
        const heatmap = heatmapKey.get(`${row.analysis_id}:${row.jugador_id}`);
        let rawPlayer = null;
        try {
          const normalizedRaw = row.tracking_analyses?.raw_json ? normalizeFootballDetectorStats(row.tracking_analyses.raw_json) : null;
          rawPlayer = (normalizedRaw?.players || []).find(player => player.player_id === row.player_id) || null;
        } catch (error) {
          rawPlayer = null;
        }
        const analysisPitch = pitchForAnalysis(row.tracking_analyses || {});
        const team = row.team || rawPlayer?.team || '';
        const sideSource = {
          ...row,
          team,
          metrics: row.metrics || {},
          tracking_analyses: row.tracking_analyses || {}
        };
        const ownSide = resolveOwnSideForPlayer(sideSource, row.tracking_analyses || {});
        const rivalSide = resolveRivalSideForPlayer(sideSource, row.tracking_analyses || {});
        const rawGoalLocations = row.goal_locations || row.metrics?.goal_locations || rawPlayer?.goal_locations || [];
        const enriched = {
          ...row,
          team,
          own_side: ownSide,
          rival_side: rivalSide,
          metrics: row.metrics || {},
          distance_m: row.metrics?.distance_m ?? rawPlayer?.distance_m ?? toNumber(row.distance_km, 0) * 1000,
          distance_km: row.distance_km ?? rawPlayer?.distance_km,
          avg_speed_kmh: row.avg_speed_kmh ?? rawPlayer?.avg_speed_kmh,
          max_speed_kmh: row.max_speed_kmh ?? rawPlayer?.max_speed_kmh,
          high_intensity_seconds: row.high_intensity_seconds ?? rawPlayer?.high_intensity_seconds,
          sprints: row.sprints ?? rawPlayer?.sprints,
          goalkeeper_seconds: row.goalkeeper_seconds ?? rawPlayer?.goalkeeper_seconds,
          coverage_pct: row.coverage_pct ?? rawPlayer?.coverage_pct,
          pulmon_tracking: row.pulmon_tracking ?? rawPlayer?.pulmon_tracking,
          defense: row.metrics?.defense || rawPlayer?.defense || {},
          defense_score: row.defense_score ?? row.metrics?.defense?.defense_score ?? rawPlayer?.defense_score,
          defense_score_method: row.defense_score_method || row.metrics?.defense?.defense_score_method || rawPlayer?.defense_score_method || '',
          advanced_defense: row.metrics?.advanced_defense || rawPlayer?.advanced_defense || {},
          advanced_defense_score: row.advanced_defense_score ?? row.metrics?.advanced_defense?.score ?? rawPlayer?.advanced_defense_score,
          advanced_defense_axes: row.advanced_defense_axes || row.metrics?.advanced_defense?.axes || rawPlayer?.advanced_defense_axes || {},
          physical_profile: row.physical_profile || row.metrics?.physical_profile || rawPlayer?.physical_profile || {},
          pulmon: row.metrics?.pulmon || rawPlayer?.pulmon || {},
          fis_valor: row.fis_valor ?? row.metrics?.fis_valor ?? rawPlayer?.fis_valor ?? row.metrics?.pulmon?.fis ?? rawPlayer?.pulmon?.fis,
          fis_version: row.fis_version || row.metrics?.fis_version || rawPlayer?.fis_version || row.metrics?.pulmon?.fis_version || rawPlayer?.pulmon?.fis_version || '',
          heatmap: heatmap?.heatmap || rawPlayer?.heatmap,
          heatmap_windows: heatmap?.heatmap_windows || rawPlayer?.heatmap_windows
        };
        const goalLocations = rawGoalLocations
          .map(goal => orientPointDefenseToAttack({
            ...goal,
            pitch_width_m: goal.pitch_width_m ?? analysisPitch.width,
            pitch_height_m: goal.pitch_height_m ?? analysisPitch.height
          }, {
            ...sideSource,
            own_side: ownSide,
            rival_side: rivalSide
          }, row.tracking_analyses || {}, analysisPitch))
          .filter(Boolean);
        enriched.goal_locations = goalLocations;
        const derivedField = playerFieldMetrics(enriched, row.tracking_analyses?.duration_seconds);
        const dominantPosition = row.metrics?.dominant_position_m
          || rawPlayer?.dominant_position_m
          || heatmapDominantPosition(enriched.heatmap, analysisPitch);
        enriched.metrics = {
          ...enriched.metrics,
          distance_m: enriched.distance_m,
          ...derivedField,
          dominant_position_m: dominantPosition || playerDisplayPosition(enriched, analysisPitch),
          own_side: ownSide,
          rival_side: rivalSide,
          goal_locations: goalLocations
        };
        Object.assign(enriched, derivedField, {
          dominant_position_m: dominantPosition || playerDisplayPosition(enriched, analysisPitch)
        });
        if (!APP.statsByPlayer.has(key)) APP.statsByPlayer.set(key, []);
        APP.statsByPlayer.get(key).push(enriched);
      });
      APP.statsByPlayer.forEach((rows, key) => {
        rows.sort((a, b) => new Date(b.tracking_analyses?.partidos?.fecha || 0) - new Date(a.tracking_analyses?.partidos?.fecha || 0));
        APP.latestByPlayer.set(key, aggregatePlayerRows(rows));
      });
    } catch (error) {
      console.warn('[tracking] cache no disponible:', error.message || error);
    }
  }

  function getActiveProfileSeasonId() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return '';
    const routeSeason = new URL(window.location.href).searchParams.get('temporada');
    if (routeSeason) return routeSeason;
    const desktop = document.getElementById('selector-temporada');
    const mobile = document.getElementById('selector-temporada-mobile');
    return desktop?.value || mobile?.value || '';
  }

  async function fetchProfileMatchHistory(playerId) {
    const seasonId = getActiveProfileSeasonId();
    const cacheKey = `${playerId}:${seasonId || 'all'}`;
    if (APP.profileMatchesByPlayer.has(cacheKey)) {
      return APP.profileMatchesByPlayer.get(cacheKey);
    }

    const client = await waitForSupabase(5000);
    if (!client) return [];

    const { data: participations, error } = await client
      .from('jugador_partido')
      .select(`
        *,
        partido_id,
        partidos (
          id, fecha, cancha, youtube_link, equipo_ganador, temporada_id,
          temporadas (nombre)
        )
      `)
      .eq('jugador_id', playerId);
    if (error) throw error;

    let filtered = (participations || []).filter(row => row.partidos);
    if (seasonId) {
      filtered = filtered.filter(row => String(row.partidos?.temporada_id || '') === String(seasonId));
    }
    filtered.sort((a, b) => new Date(b.partidos?.fecha || 0) - new Date(a.partidos?.fecha || 0));

    const matchIds = [...new Set(filtered.map(row => row.partido_id).filter(Boolean))];
    let participantsByMatch = new Map();
    let goalsByMatch = new Map();
    if (matchIds.length) {
      const { data: allParticipants, error: allError } = await client
        .from('jugador_partido')
        .select('partido_id, jugador_id, equipo, goles, asistencias, atajadas, cagadas, mvp, ace, jugadores(id, nombre)')
        .in('partido_id', matchIds);
      if (allError) throw allError;
      participantsByMatch = (allParticipants || []).reduce((map, row) => {
        const key = String(row.partido_id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
        return map;
      }, new Map());

      const { data: allGoals, error: goalsError } = await client
        .from('goles')
        .select('partido_id, cagada_jugador_id')
        .in('partido_id', matchIds);
      if (!goalsError) {
        goalsByMatch = (allGoals || []).reduce((map, row) => {
          const key = String(row.partido_id);
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(row);
          return map;
        }, new Map());
      } else if (!String(goalsError.message || '').includes('cagada_jugador_id')) {
        throw goalsError;
      }
    }

    const trackingRows = APP.statsByPlayer.get(String(playerId)) || [];
    const trackingByMatch = new Map(
      trackingRows
        .filter(row => row.tracking_analyses?.partido_id)
        .map(row => [String(row.tracking_analyses.partido_id), row])
    );

    const history = filtered.map(row => {
      const participants = participantsByMatch.get(String(row.partido_id)) || [];
      const goals = goalsByMatch.get(String(row.partido_id)) || [];
      const team = normalizeTeamNumber(row.equipo);
      return {
        participation: row,
        match: row.partidos,
        tracking: trackingByMatch.get(String(row.partido_id)) || null,
        goals,
        mistakes: resolveProfileMistakes(row, goals),
        teammates: participants.filter(player => normalizeTeamNumber(player.equipo) === team),
        rivals: participants.filter(player => normalizeTeamNumber(player.equipo) !== team),
        team
      };
    });

    APP.profileMatchesByPlayer.set(cacheKey, history);
    return history;
  }

  function normalizeTeamNumber(team) {
    if (team === 'A') return 1;
    if (team === 'B') return 2;
    const numeric = Number(team);
    return numeric === 2 ? 2 : 1;
  }

  function resolveProfileMistakes(participation = {}, goals = []) {
    const playerId = String(participation?.jugador_id || '');
    const stored = toNumber(participation?.cagadas);
    const fromGoals = (goals || [])
      .filter(goal => String(goal?.cagada_jugador_id || '') === playerId)
      .length;
    if (stored > 0 && fromGoals > 0) return Math.max(stored, fromGoals);
    return stored + fromGoals;
  }

  function getProfileEntryMistakes(entry = {}) {
    if (Number.isFinite(Number(entry.mistakes))) return Number(entry.mistakes);
    return resolveProfileMistakes(entry.participation || {}, entry.goals || []);
  }

  function averagePresent(rows, getter) {
    const values = (rows || [])
      .map(getter)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function averageObjectValues(rows, getter) {
    const buckets = new Map();
    (rows || []).forEach(row => {
      const source = getter(row) || {};
      Object.entries(source).forEach(([key, value]) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(n);
      });
    });
    return [...buckets.entries()].reduce((acc, [key, values]) => {
      acc[key] = round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
      return acc;
    }, {});
  }

  function physicalDimensionsForRow(row) {
    return row.physical_profile?.dimensions || row.pulmon?.dimensions || row.metrics?.physical_profile?.dimensions || row.metrics?.pulmon?.dimensions || {};
  }

  function defenseAxesForRow(row) {
    return row.advanced_defense_axes || row.advanced_defense?.axes || row.metrics?.advanced_defense?.axes || {};
  }

  function aggregatePlayerRows(rows) {
    const safeRows = rows || [];
    if (!safeRows.length) return null;
    const sum = (field) => safeRows.reduce((total, row) => total + toNumber(row[field]), 0);
    const avg = (field) => sum(field) / safeRows.length;
    const averageHeatmapRaw = averageHeatmaps(
      safeRows
        .map(row => orientHeatmapDefenseToAttack(row.heatmap, row, row.tracking_analyses || {}))
        .filter(Boolean)
    );
    const averageHeatmap = averageHeatmapRaw
      ? { ...averageHeatmapRaw, orientation: 'defense_to_attack' }
      : null;
    const dominantPosition = averageHeatmap ? heatmapDominantPosition(averageHeatmap, DEFAULT_PITCH) : null;
    const goalLocations = safeRows.flatMap(row => (
      row.goal_locations || row.metrics?.goal_locations || []
    ).map(goal => orientPointDefenseToAttack({
      ...goal,
      match_id: row.tracking_analyses?.partido_id || row.partido_id || null,
      date: row.tracking_analyses?.partidos?.fecha || null,
      pitch_width_m: goal.pitch_width_m ?? row.tracking_analyses?.pitch_width_m ?? DEFAULT_PITCH.width,
      pitch_height_m: goal.pitch_height_m ?? row.tracking_analyses?.pitch_height_m ?? DEFAULT_PITCH.height
    }, row, row.tracking_analyses || {}, DEFAULT_PITCH)).filter(Boolean));
    const fisAverage = averagePresent(safeRows, row => row.fis_valor ?? row.pulmon_tracking ?? row.physical_profile?.fis ?? row.pulmon?.fis);
    const defenseAverage = averagePresent(safeRows, row => row.defense_score ?? row.defense?.defense_score);
    const advancedDefenseAverage = averagePresent(safeRows, row => row.advanced_defense_score ?? row.advanced_defense?.score);
    const km40Average = averagePresent(safeRows, row => (
      row.distance_per_40_min_km ?? row.metrics?.distance_per_40_min_km ?? playerFieldMetrics(row, row.tracking_analyses?.duration_seconds).distance_per_40_min_km
    ));
    return {
      matches: safeRows.length,
      distance_km_avg: round(avg('distance_km'), 2),
      distance_km_total: round(sum('distance_km'), 2),
      distance_per_40_min_km: km40Average === null ? 0 : round(km40Average, 2),
      avg_speed_kmh: round(avg('avg_speed_kmh'), 1),
      max_speed_kmh: round(Math.max(...safeRows.map(row => toNumber(row.max_speed_kmh))), 1),
      sprints_avg: round(avg('sprints'), 1),
      pulmon_tracking: round(avg('pulmon_tracking'), 1),
      fis_valor: fisAverage === null ? null : round(fisAverage, 1),
      defense_score: defenseAverage === null ? null : round(defenseAverage, 1),
      advanced_defense_score: advancedDefenseAverage === null ? null : round(advancedDefenseAverage, 1),
      physical_dimensions: averageObjectValues(safeRows, physicalDimensionsForRow),
      advanced_defense_axes: averageObjectValues(safeRows, defenseAxesForRow),
      high_intensity_seconds_avg: round(avg('high_intensity_seconds'), 1),
      coverage_pct: round(avg('coverage_pct'), 1),
      goalkeeper_seconds: round(avg('goalkeeper_seconds'), 1),
      heatmap: averageHeatmap,
      dominant_position_m: dominantPosition,
      goal_locations: goalLocations,
      latest: safeRows[0]
    };
  }

  function getCurrentProfilePlayerId() {
    const selector = document.getElementById('selector-jugador-perfil');
    return selector?.value || null;
  }

  function ensureProfileTabs() {
    if (typeof document === 'undefined') return;
    const tabs = document.getElementById('perfil-tabs');
    const content = document.getElementById('perfil-tab-content');
    if (!tabs || !content) {
      APP.profileReady = false;
      return;
    }
    APP.profileReady = true;

    if (!document.getElementById('tab-perfil-tracking')) {
      tabs.insertAdjacentHTML('beforeend', `
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="tab-perfil-tracking" data-bs-toggle="tab" data-bs-target="#perfil-tracking" type="button" role="tab">
            <i class="bi bi-broadcast-pin me-1"></i>Tracking
          </button>
        </li>
      `);
    }

    if (!document.getElementById('perfil-tracking')) {
      content.insertAdjacentHTML('beforeend', `
        <div class="tab-pane fade" id="perfil-tracking" role="tabpanel">
          <div id="perfil-tracking-container"></div>
        </div>
      `);
    }

    bindProfileTabRender('tab-perfil-tracking');
  }

  function bindProfileTabRender(tabId) {
    const tab = document.getElementById(tabId);
    if (!tab || tab.dataset.trackingBound === '1') return;
    tab.dataset.trackingBound = '1';
    tab.addEventListener('shown.bs.tab', () => scheduleProfileTrackingRender(0));
  }

  function scheduleProfileTrackingRender(delay = 120) {
    if (typeof document === 'undefined') return;
    if (APP.profileRenderTimer) clearTimeout(APP.profileRenderTimer);
    APP.profileRenderTimer = setTimeout(() => {
      APP.profileRenderTimer = null;
      const active = document.querySelector('#tab-perfil-tracking.active');
      if (active) renderProfileTracking();
    }, delay);
  }

  async function renderProfileTracking() {
    if (APP.profileRenderInProgress) return;
    APP.profileRenderInProgress = true;
    try {
      await renderProfileTrackingUnsafe();
    } finally {
      APP.profileRenderInProgress = false;
    }
  }

  async function renderProfileTrackingUnsafe() {
    ensureStyles();
    ensureProfileTabs();
    const playerId = getCurrentProfilePlayerId();
    const summaryContainer = document.getElementById('perfil-tracking-container');
    const matchesContainer = document.getElementById('perfil-tracking-partidos-container');
    if (!playerId || (!summaryContainer && !matchesContainer)) return;
    APP.profileObservedPlayerId = playerId;
    if (matchesContainer && !matchesContainer.innerHTML.trim()) {
      matchesContainer.innerHTML = renderProfileMatchesLoading();
    }

    await refreshTrackingCaches();
    const trackingRows = APP.statsByPlayer.get(String(playerId)) || [];
    const aggregate = aggregatePlayerRows(trackingRows);
    const goalkeeperConcededGoals = APP.goalsConcededByPlayer.get(String(playerId)) || [];
    let matchHistory = [];
    let matchHistoryError = null;
    if (matchesContainer) {
      try {
        matchHistory = await fetchProfileMatchHistory(playerId);
      } catch (error) {
        matchHistoryError = error;
        console.warn('[tracking] no se pudo cargar historial completo:', error.message || error);
      }
    }

    if (!aggregate && goalkeeperConcededGoals.length) {
      if (summaryContainer) {
        summaryContainer.innerHTML = `
          <div class="tracking-profile-grid">
            <div class="tracking-profile-card">
              <h5 class="text-white mb-3">Perfil tracking</h5>
              <div class="tracking-kpi-grid">
                ${kpi('Goles recibidos con mapa', goalkeeperConcededGoals.length)}
              </div>
            </div>
            <div class="tracking-profile-card">
              <h6 class="tracking-profile-section-title">Desde donde le convirtieron</h6>
              <canvas class="tracking-canvas" id="perfil-tracking-goals-against-canvas"></canvas>
              <div class="tracking-goal-note">${goalkeeperConcededGoals.length} goles recibidos con ubicacion importada desde el detector.</div>
            </div>
          </div>
        `;
        setTimeout(() => {
          drawGoalLocations(document.getElementById('perfil-tracking-goals-against-canvas'), DEFAULT_PITCH, goalkeeperConcededGoals);
        }, 40);
      }
    } else if (!aggregate) {
      const empty = `
        <div class="tracking-profile-card text-center py-5">
          <i class="bi bi-broadcast-pin fs-1 text-muted"></i>
          <p class="text-light-emphasis mt-3 mb-0">Este jugador todavia no tiene tracking importado.</p>
        </div>
      `;
      if (summaryContainer) summaryContainer.innerHTML = empty;
    } else if (summaryContainer) {
      const defenseProfileScore = trackingDefenseScore(aggregate);
      const hasDefenseProfileData = defenseProfileScore !== null
        || Object.values(aggregate.advanced_defense_axes || {}).some(value => Number.isFinite(Number(value)));
      summaryContainer.innerHTML = `
        <div class="tracking-profile-grid">
          <div class="tracking-profile-card">
            <h5 class="text-white mb-3">Perfil tracking</h5>
            <div class="tracking-kpi-grid">
              ${kpi('Partidos con tracking', aggregate.matches)}
              ${kpi('Pulmon FIS', `${aggregate.fis_valor ?? aggregate.pulmon_tracking}/100`)}
              ${defenseProfileScore === null ? '' : kpi('Score defensivo', `${round(defenseProfileScore, 1)}/100`)}
              ${kpi('KM prom.', `${aggregate.distance_km_avg} km`)}
              ${kpi("KM/40' prom.", `${aggregate.distance_per_40_min_km} km`)}
              ${kpi('Goles con mapa', aggregate.goal_locations.length)}
              ${goalkeeperConcededGoals.length ? kpi('Goles recibidos con mapa', goalkeeperConcededGoals.length) : ''}
            </div>
            ${renderTrackingMetricPills(aggregate.physical_dimensions)}
          </div>
          ${hasDefenseProfileData ? `
          <div class="tracking-profile-card">
            <h6 class="tracking-profile-section-title">Skill defensivo tracking</h6>
            ${defenseProfileScore === null ? '' : `
            <div class="tracking-metric-band">
              <div class="tracking-metric-pill">
                <strong>${round(defenseProfileScore, 1)}</strong>
                <span>Score defensivo</span>
              </div>
            </div>
            `}
            <div class="mt-3">${renderTrackingAxisList(aggregate.advanced_defense_axes)}</div>
          </div>
          ` : ''}
          <div class="tracking-profile-card">
            <h6 class="tracking-profile-section-title">Mapa de calor promedio</h6>
            <canvas class="tracking-canvas" id="perfil-tracking-heatmap-canvas"></canvas>
            <div class="tracking-goal-note">Orientado de defensa a ataque: izquierda = arco propio, derecha = arco rival.</div>
          </div>
          <div class="tracking-profile-card">
            <h6 class="tracking-profile-section-title">Desde donde convierte goles</h6>
            <canvas class="tracking-canvas" id="perfil-tracking-goals-canvas"></canvas>
            <div class="tracking-goal-note">${aggregate.goal_locations.length ? `${aggregate.goal_locations.length} goles con ubicacion importada desde el detector.` : 'Sin goles con ubicacion importada todavia.'}</div>
          </div>
          ${goalkeeperConcededGoals.length ? `
            <div class="tracking-profile-card">
              <h6 class="tracking-profile-section-title">Desde donde le convirtieron</h6>
              <canvas class="tracking-canvas" id="perfil-tracking-goals-against-canvas"></canvas>
              <div class="tracking-goal-note">${goalkeeperConcededGoals.length} goles recibidos con ubicacion importada desde el detector.</div>
            </div>
          ` : ''}
        </div>
      `;
      setTimeout(() => {
        drawHeatmap(document.getElementById('perfil-tracking-heatmap-canvas'), DEFAULT_PITCH, aggregate.heatmap, [], { showGoalReference: true });
        drawGoalLocations(document.getElementById('perfil-tracking-goals-canvas'), DEFAULT_PITCH, aggregate.goal_locations || []);
        drawGoalLocations(document.getElementById('perfil-tracking-goals-against-canvas'), DEFAULT_PITCH, goalkeeperConcededGoals);
      }, 40);
    }

    if (matchesContainer) {
      matchesContainer.innerHTML = renderProfileMatchesDashboard(matchHistory, trackingRows, aggregate, matchHistoryError);
      matchesContainer.querySelector('[data-profile-action="tracking-full"]')?.addEventListener('click', () => {
        document.getElementById('tab-perfil-tracking')?.click();
      });
    }
  }

  async function renderGoalkeeperConcededMap(playerId, options = {}) {
    if (typeof document === 'undefined') return 0;
    const id = String(playerId || '').trim();
    const canvas = options.canvas || document.getElementById(options.canvasId || 'perfil-arquero-goles-recibidos-canvas');
    const note = options.note || document.getElementById(options.noteId || 'perfil-arquero-goles-recibidos-note');
    if (!id || !canvas) return 0;

    try {
      ensureStyles();
      await refreshTrackingCaches();
      const goals = APP.goalsConcededByPlayer.get(id) || [];
      drawGoalLocations(canvas, DEFAULT_PITCH, goals);
      if (note) {
        note.textContent = goals.length
          ? `${goals.length} goles recibidos con ubicacion importada desde el detector.`
          : 'Sin goles recibidos con ubicacion importada todavia.';
      }
      return goals.length;
    } catch (error) {
      console.warn('[tracking] no se pudo dibujar mapa de goles recibidos:', error.message || error);
      if (note) note.textContent = 'No se pudo cargar el mapa de goles recibidos.';
      return 0;
    }
  }

  function renderProfileMatchesLoading() {
    return `
      <div class="tracking-profile-dashboard">
        <aside class="tracking-profile-panel">
          <div class="tracking-profile-panel-header">
            <h5 class="tracking-profile-panel-title">Resumen tracking</h5>
            <span class="tracking-profile-panel-sub">Cargando</span>
          </div>
          <div class="tracking-rank-main">
            <div class="tracking-rank-medal"><div class="spinner-border spinner-border-sm text-info"></div></div>
            <div>
              <div class="tracking-rank-label">Preparando dashboard</div>
              <div class="tracking-rank-note">Buscando partidos importados y estadisticas fisicas.</div>
            </div>
          </div>
        </aside>
        <section class="tracking-profile-panel">
          <div class="tracking-profile-panel-header">
            <h5 class="tracking-profile-panel-title">Partidos recientes</h5>
            <span class="tracking-profile-panel-sub">Sincronizando</span>
          </div>
          <div class="p-4 text-light-emphasis">Cargando dashboard de partidos...</div>
        </section>
      </div>
    `;
  }

  function renderProfileMatchesDashboard(matchHistory, trackingRows, aggregate, error = null) {
    const rows = matchHistory || [];
    const record = computeProfileMatchRecord(rows);
    const totals = computeProfileParticipationTotals(rows);
    const trackingDistance = round((trackingRows || []).reduce((sum, row) => sum + toNumber(row.distance_km), 0), 2);
    const totalSprints = Math.round((trackingRows || []).reduce((sum, row) => sum + toNumber(row.sprints), 0));
    const topRivals = computeTopRivals(rows).slice(0, 3);
    const latestRows = rows;
    const latest = latestRows[0] || null;
    const latestMatch = latest?.match || {};
    const trackingMatchCount = (trackingRows || []).length;
    const defenseProfileScore = trackingDefenseScore(aggregate);

    if (error) {
      return `
        <div class="tracking-profile-card text-center py-5">
          <i class="bi bi-exclamation-triangle fs-1 text-warning"></i>
          <p class="text-light-emphasis mt-3 mb-0">No se pudo cargar el historial completo: ${escapeHtml(error.message || error)}</p>
        </div>
      `;
    }

    return `
      <div class="tracking-profile-dashboard">
        <aside class="tracking-profile-panel">
          <div class="tracking-profile-panel-header">
            <h5 class="tracking-profile-panel-title">Resumen partidos</h5>
            <span class="tracking-profile-panel-sub">${rows.length} partidos</span>
          </div>
          <div class="tracking-rank-main">
            <div class="tracking-rank-medal">${record.winPct}%</div>
            <div>
              <div class="tracking-rank-label">${record.wins}G ${record.draws}E ${record.losses}P</div>
              <div class="tracking-rank-note">Historial completo del jugador. El tracking fisico se suma cuando existe.</div>
            </div>
          </div>
          <div class="tracking-profile-stat-list">
            ${profileStatLine('Partidos jugados', rows.length)}
            ${profileStatLine('Goles / asistencias', `${totals.goals} / ${totals.assists}`)}
            ${profileStatLine('Atajadas', totals.saves)}
            ${profileStatLine('Cagadas', totals.mistakes)}
            ${profileStatLine('MVP / ACE', `${totals.mvp} / ${totals.ace}`)}
            ${profileStatLine('Tracking cargado', `${trackingMatchCount}/${rows.length}`)}
            ${profileStatLine('KM con tracking', `${trackingDistance.toFixed(2)} km`)}
            ${profileStatLine('Pulmon FIS', aggregate?.fis_valor == null ? '-' : `${aggregate.fis_valor}/100`)}
            ${profileStatLine('Score defensivo', defenseProfileScore === null ? '-' : `${round(defenseProfileScore, 1)}/100`)}
          </div>
          <div class="tracking-season-table">
            <div class="tracking-profile-panel-sub">Ultimos partidos</div>
            ${latestRows.slice(0, 5).map(renderProfileSeasonRow).join('') || '<div class="text-light-emphasis small">Sin partidos registrados.</div>'}
          </div>
        </aside>

        <section class="tracking-profile-panel">
          <div class="tracking-profile-panel-header">
            <h5 class="tracking-profile-panel-title">Partidos recientes</h5>
            <span class="tracking-profile-panel-sub">${record.label}</span>
          </div>
          <div class="tracking-recent-summary">
            <div>
              <div class="tracking-profile-panel-sub text-center">${record.total} partidos jugados</div>
              <div class="tracking-win-ring" style="--win-pct:${record.winPct}">
                <span>${record.winPct}%</span>
              </div>
            </div>
            <div class="tracking-core-line">
              ${profileCoreMetric('GOL', totals.goals, 'goles')}
              ${profileCoreMetric('AST', totals.assists, 'asist.')}
              ${profileCoreMetric('ATA', totals.saves, 'atajadas')}
              ${profileCoreMetric('KM', trackingDistance.toFixed(2), 'tracking')}
              ${profileCoreMetric('DEF', defenseProfileScore === null ? '-' : round(defenseProfileScore, 1), 'tracking')}
            </div>
            <div class="tracking-rival-summary">
              <div class="tracking-profile-panel-sub">Rivales mas repetidos</div>
              ${topRivals.map(renderTopRivalRow).join('') || '<div class="text-light-emphasis small">Sin rivales cargados.</div>'}
            </div>
          </div>
          <div class="tracking-profile-prompts">
            <button type="button" class="tracking-profile-prompt" data-profile-action="tracking-full">
              <i class="bi bi-stars me-1"></i>Ver tracking completo
            </button>
            <span class="tracking-profile-prompt"><i class="bi bi-calendar2-week me-1"></i>${escapeHtml(latestMatch.cancha || 'Ultimo partido')}</span>
            <span class="tracking-profile-prompt"><i class="bi bi-speedometer2 me-1"></i>${trackingMatchCount} con tracking · ${totalSprints} sprints</span>
          </div>
          <div class="tracking-recent-list">
            ${latestRows.map(renderProfileMatchRow).join('')}
          </div>
        </section>
      </div>
    `;
  }

  function profileStatLine(label, value) {
    return `
      <div class="tracking-profile-stat-line">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function profileCoreMetric(label, value, hint) {
    return `
      <div class="tracking-core-metric">
        <strong>${escapeHtml(value)}</strong>
        ${escapeHtml(label)} <span class="text-light-emphasis">${escapeHtml(hint)}</span>
      </div>
    `;
  }

  function profileRoleBar(label, value) {
    const pct = Math.max(4, Math.min(100, toNumber(value, 0)));
    return `
      <div class="tracking-role-bar">
        <div class="tracking-role-stick"><div class="tracking-role-fill" style="height:${pct}%"></div></div>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function renderProfileSeasonRow(entry) {
    const match = entry.match || {};
    const result = getProfileMatchResult(entry);
    return `
      <div class="tracking-season-row">
        <span class="tracking-season-tag">${escapeHtml(result.short)}</span>
        <span class="text-truncate">${escapeHtml(formatProfileDate(match.fecha))}</span>
        <strong class="text-end">${toNumber(entry.participation?.goles)}G</strong>
      </div>
    `;
  }

  function computeProfileMatchRecord(rows) {
    const record = rows.reduce((acc, entry) => {
      const result = getProfileMatchResult(entry);
      if (result.key === 'win') acc.wins += 1;
      if (result.key === 'loss') acc.losses += 1;
      if (result.key === 'draw') acc.draws += 1;
      return acc;
    }, { wins: 0, losses: 0, draws: 0 });
    const total = record.wins + record.losses + record.draws;
    const winPct = total ? Math.round((record.wins / total) * 100) : 0;
    return {
      ...record,
      total,
      winPct,
      label: `${record.wins}G ${record.draws}E ${record.losses}P`
    };
  }

  function computeProfileParticipationTotals(rows) {
    return rows.reduce((acc, entry) => {
      const p = entry.participation || {};
      acc.goals += toNumber(p.goles);
      acc.assists += toNumber(p.asistencias);
      acc.saves += toNumber(p.atajadas);
      acc.mistakes += getProfileEntryMistakes(entry);
      if (p.mvp) acc.mvp += 1;
      if (p.ace) acc.ace += 1;
      return acc;
    }, { goals: 0, assists: 0, saves: 0, mistakes: 0, mvp: 0, ace: 0 });
  }

  function computeTopRivals(rows) {
    const rivals = new Map();
    rows.forEach(entry => {
      (entry.rivals || []).forEach(rival => {
        const key = String(rival.jugador_id);
        if (!rivals.has(key)) {
          rivals.set(key, {
            name: rival.jugadores?.nombre || 'Rival',
            played: 0,
            wins: 0,
            goals: 0
          });
        }
        const item = rivals.get(key);
        item.played += 1;
        if (getProfileMatchResult(entry).key === 'win') item.wins += 1;
        item.goals += toNumber(rival.goles);
      });
    });
    return [...rivals.values()].sort((a, b) => b.played - a.played || b.goals - a.goals);
  }

  function renderTopRivalRow(rival, index) {
    return `
      <div class="tracking-rival-row">
        <span class="tracking-mini-avatar rival">${index + 1}</span>
        <strong>${escapeHtml(rival.name)}</strong>
        <span>${rival.played} PJ</span>
      </div>
    `;
  }

  function formatProfileDate(dateValue) {
    if (!dateValue) return 'Sin fecha';
    const date = new Date(`${dateValue}T12:00:00`);
    if (Number.isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function legacyProfileMatchResult(row) {
    const match = row.tracking_analyses?.partidos || {};
    const trackingTeamNumber = row.team === 'A' ? 1 : row.team === 'B' ? 2 : null;
    const winner = Number(match.equipo_ganador || 0);
    if (!winner) return { key: 'draw', label: 'Empate', tone: 'warning' };
    if (trackingTeamNumber && winner === trackingTeamNumber) return { key: 'win', label: 'Victoria', tone: 'success' };
    if (trackingTeamNumber) return { key: 'loss', label: 'Derrota', tone: 'danger' };
    return { key: 'draw', label: 'Resultado', tone: 'warning' };
  }

  function legacyProfileMatchRow(row) {
    const match = row.tracking_analyses?.partidos || {};
    const result = getProfileMatchResult(row);
    const resultClass = result.key === 'win' ? 'tracking-result-win' : result.key === 'loss' ? 'tracking-result-loss' : 'tracking-result-draw';
    const teamClass = row.team === 'A' ? 'is-blue' : row.team === 'B' ? 'is-red' : '';
    const avatar = row.team === 'A' ? 'A' : row.team === 'B' ? 'B' : 'T';
    const defenseScore = trackingDefenseScore(row);
    return `
      <div class="tracking-match-row ${resultClass}">
        <div class="tracking-match-row-date">
          <strong>${escapeHtml(match.temporadas?.nombre || 'Tracking')}</strong>
          <span>${escapeHtml(formatProfileDate(match.fecha))}</span>
        </div>
        <div class="tracking-match-result">
          ${escapeHtml(result.label)}
          <small>${escapeHtml(formatTime(row.tracking_analyses?.duration_seconds || 0))}</small>
        </div>
        <div class="tracking-match-primary">
          <div class="tracking-match-avatar">${escapeHtml(avatar)}</div>
          <div class="tracking-match-main">
            <strong>${toNumber(row.distance_km).toFixed(2)} km</strong>
            <span>${escapeHtml(match.cancha || 'Partido')} · equipo ${escapeHtml(row.team || '-')}</span>
          </div>
        </div>
        <div class="tracking-match-metrics">
          <div class="tracking-match-metric">Vel<strong>${toNumber(row.avg_speed_kmh).toFixed(1)}</strong></div>
          <div class="tracking-match-metric">Max<strong>${toNumber(row.max_speed_kmh).toFixed(1)}</strong></div>
          <div class="tracking-match-metric">Pulmon<strong>${toNumber(row.pulmon_tracking).toFixed(1)}</strong></div>
          <div class="tracking-match-metric">Def<strong>${defenseScore === null ? '-' : round(defenseScore, 1)}</strong></div>
        </div>
        <div class="tracking-match-tags">
          <span class="tracking-match-tag ${teamClass}">Equipo ${escapeHtml(row.team || '-')}</span>
          <span class="tracking-match-tag">${Math.round(toNumber(row.sprints))} spr</span>
          ${defenseScore === null ? '' : `<span class="tracking-match-tag is-blue">DEF ${round(defenseScore, 1)}</span>`}
          ${toNumber(row.goalkeeper_seconds) > 0 ? `<span class="tracking-match-tag is-green">${formatTime(row.goalkeeper_seconds)} ARQ</span>` : ''}
        </div>
      </div>
    `;
  }

  function getProfileMatchResult(entry) {
    const match = entry.match || {};
    const team = normalizeTeamNumber(entry.participation?.equipo);
    const winner = Number(match.equipo_ganador || 0);
    if (!winner) return { key: 'draw', label: 'Empate', short: 'E', tone: 'warning' };
    if (winner === team) return { key: 'win', label: 'Victoria', short: 'G', tone: 'success' };
    return { key: 'loss', label: 'Derrota', short: 'P', tone: 'danger' };
  }

  function renderProfileMatchRow(entry) {
    const match = entry.match || {};
    const row = entry.tracking || {};
    const p = entry.participation || {};
    const result = getProfileMatchResult(entry);
    const resultClass = result.key === 'win' ? 'tracking-result-win' : result.key === 'loss' ? 'tracking-result-loss' : 'tracking-result-draw';
    const teamNumber = normalizeTeamNumber(p.equipo);
    const teamClass = teamNumber === 1 ? 'is-blue' : 'is-red';
    const hasTracking = !!entry.tracking;
    const defenseScore = hasTracking ? trackingDefenseScore(row) : null;
    return `
      <div class="tracking-match-row ${resultClass}">
        <div class="tracking-match-row-date">
          <strong>${escapeHtml(match.temporadas?.nombre || 'Partido')}</strong>
          <span>${escapeHtml(formatProfileDate(match.fecha))}</span>
        </div>
        <div class="tracking-match-result">
          ${escapeHtml(result.label)}
          <small>${escapeHtml(match.cancha || 'Cancha')}</small>
        </div>
        <div class="tracking-match-primary">
          <div class="tracking-match-avatar">${teamNumber}</div>
          <div class="tracking-match-main">
            <strong>${toNumber(p.goles)} / ${toNumber(p.asistencias)} / ${toNumber(p.atajadas)}</strong>
            <span>Goles / asist. / atajadas · equipo ${teamNumber}</span>
          </div>
        </div>
        <div class="tracking-match-metrics">
          <div class="tracking-match-metric">Cag<strong>${getProfileEntryMistakes(entry)}</strong></div>
          <div class="tracking-match-metric">KM<strong>${hasTracking ? toNumber(row.distance_km).toFixed(2) : '-'}</strong></div>
          <div class="tracking-match-metric">Max<strong>${hasTracking ? toNumber(row.max_speed_kmh).toFixed(1) : '-'}</strong></div>
          <div class="tracking-match-metric">Def<strong>${defenseScore === null ? '-' : round(defenseScore, 1)}</strong></div>
        </div>
        <div class="tracking-lineups">
          ${renderLineupColumn('Equipo', entry.teammates || [], p.jugador_id)}
          ${renderLineupColumn('Rivales', entry.rivals || [], p.jugador_id, true)}
        </div>
        <div class="tracking-match-tags">
          <span class="tracking-match-tag ${teamClass}">Equipo ${teamNumber}</span>
          <span class="tracking-match-tag ${hasTracking ? 'is-green' : 'is-muted'}">${hasTracking ? 'Tracking' : 'Sin tracking'}</span>
          ${hasTracking && row.fis_valor !== null && row.fis_valor !== undefined ? `<span class="tracking-match-tag is-green">FIS ${round(row.fis_valor, 1)}</span>` : ''}
          ${defenseScore === null ? '' : `<span class="tracking-match-tag is-blue">DEF ${round(defenseScore, 1)}</span>`}
          ${hasTracking && row.goal_locations?.length ? `<span class="tracking-match-tag">${row.goal_locations.length} goles mapa</span>` : ''}
          ${p.mvp ? '<span class="tracking-match-tag is-green">MVP</span>' : ''}
          ${p.ace ? '<span class="tracking-match-tag is-blue">ACE</span>' : ''}
        </div>
      </div>
    `;
  }

  function renderLineupColumn(title, players, currentPlayerId, rivals = false) {
    const visible = (players || []).slice(0, 6);
    return `
      <div class="tracking-lineup">
        <div class="tracking-lineup-title">${escapeHtml(title)}</div>
        <div class="tracking-player-list">
          ${visible.map(player => renderPlayerChip(player, currentPlayerId, rivals)).join('')}
        </div>
      </div>
    `;
  }

  function renderPlayerChip(player, currentPlayerId, rival = false) {
    const name = player.jugadores?.nombre || 'Jugador';
    const initials = name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
    const stats = [
      toNumber(player.goles) ? `${toNumber(player.goles)}G` : '',
      toNumber(player.asistencias) ? `${toNumber(player.asistencias)}A` : '',
      toNumber(player.atajadas) ? `${toNumber(player.atajadas)}At` : ''
    ].filter(Boolean).join(' ');
    const current = String(player.jugador_id) === String(currentPlayerId);
    return `
      <div class="tracking-player-chip ${current ? 'current' : ''}">
        <span class="tracking-mini-avatar ${rival ? 'rival' : ''}">${escapeHtml(initials || '?')}</span>
        <span class="text-truncate">${escapeHtml(name)}</span>
        ${stats ? `<b>${escapeHtml(stats)}</b>` : ''}
      </div>
    `;
  }

  function isProfileVisible() {
    const profile = document.getElementById('vista-perfil-jugador');
    return !!profile && !profile.classList.contains('d-none');
  }

  function activateProfileMatchesDashboard(delay = 160) {
    if (typeof document === 'undefined') return;
    setTimeout(() => {
      ensureProfileTabs();
      const playerId = getCurrentProfilePlayerId();
      if (!playerId || !isProfileVisible()) return;
      APP.profileDefaultTabPlayerId = playerId;
      const tab = document.getElementById('tab-perfil-tracking');
      if (tab?.classList.contains('active')) {
        scheduleProfileTrackingRender(0);
      }
    }, delay);
  }

  function attachProfileObserver() {
    bindProfileSelectorChange();
    const profile = document.getElementById('vista-perfil-jugador');
    if (!profile || profile.dataset.trackingObserverBound === '1') return;
    profile.dataset.trackingObserverBound = '1';
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        ensureProfileTabs();
        bindProfileSelectorChange();
        const playerId = getCurrentProfilePlayerId();
        const active = document.querySelector('#tab-perfil-tracking.active');
        const visible = isProfileVisible();
        if (visible && playerId && (!APP.profileWasVisible || playerId !== APP.profileDefaultTabPlayerId)) {
          activateProfileMatchesDashboard(40);
        }
        APP.profileWasVisible = visible;
        if (playerId && playerId !== APP.profileObservedPlayerId && active) {
          scheduleProfileTrackingRender(80);
        }
      }, 80);
    });
    observer.observe(profile, { childList: true, subtree: true });
  }

  function bindProfileSelectorChange() {
    const selector = document.getElementById('selector-jugador-perfil');
    if (!selector || selector.dataset.trackingBound === '1') return;
    selector.dataset.trackingBound = '1';
    selector.addEventListener('change', () => {
      APP.profileObservedPlayerId = null;
      APP.profileDefaultTabPlayerId = null;
      activateProfileMatchesDashboard(320);
      scheduleProfileTrackingRender(360);
    });
  }

  function trackingForRawPlayer(rawPlayer) {
    const id = rawPlayer.jugadores?.id || rawPlayer.jugador_id || rawPlayer.id;
    return id ? APP.latestByPlayer.get(String(id)) : null;
  }

  async function ensureMatchmakingTrackingReady() {
    await refreshTrackingCaches();
    patchOptimizer();
    return {
      players: APP.latestByPlayer.size,
      rows: APP.statsByPlayer.size
    };
  }

  function patchOptimizer() {
    if (APP.optimizerPatched || typeof window === 'undefined' || !window.GeneticTeamOptimizer) return;
    const proto = window.GeneticTeamOptimizer.prototype;
    if (!proto || proto.__trackingPatched) return;
    APP.optimizerPatched = true;
    proto.__trackingPatched = true;

    const originalSetJugadores = proto.setJugadores;
    const originalEvaluar = proto.evaluarIndividuo;
    const originalStats = proto.calcularEstadisticasEquipo;

    proto.setJugadores = function patchedSetJugadores(jugadores) {
      originalSetJugadores.call(this, jugadores);
      const enrichedBasePlayers = this.jugadores.map((processed, index) => {
        const raw = jugadores[index] || {};
        const tracking = trackingForRawPlayer(raw);
        const playerId = raw.jugadores?.id || raw.jugador_id || raw.id || processed.id;
        const concededGoals = playerId ? (APP.goalsConcededByPlayer.get(String(playerId)) || []) : [];
        const scoreDefensivoTracking = trackingDefenseScore(tracking)
          ?? numberOrNull(processed.scoreDefensivoTracking ?? processed.scoreDefensivoMatchmaking);
        const puntosDefensaRankingDirecto = numberOrNull(
          raw.puntosDefensaTrackingPromedio
          ?? raw.puntos_defensa_tracking_promedio
          ?? processed.puntosDefensaRankingDirecto
          ?? processed.puntosDefensaTrackingPromedio
        );
        const impactoSkillDefensa = puntosDefensaRankingDirecto ?? 0;
        const golesRecibidosArquero = Math.max(toNumber(processed.golesRecibidosArquero, 0), concededGoals.length);
        const playerWithGoalkeeperData = {
          ...processed,
          golesRecibidosArquero,
          goles_recibidos_arquero: golesRecibidosArquero,
          pj_arquero: processed.pjArquero
        };
        const rendimientoArquero = processed.rolPartido === 'arquero'
          ? this.calcularRendimientoArquero(playerWithGoalkeeperData)
          : processed.rendimientoArquero;
        const rankingSaveSkill = numberOrNull(processed.rendimientoArqueroRanking)
          ?? (((toNumber(raw.atajadas ?? processed.atajadas, 0)) / Math.max(toNumber(raw.pj ?? processed.pj, 0), 1)) * 0.4);
        const rendimientoTotal = toNumber(processed.rendimientoJugador, 0) + rankingSaveSkill + impactoSkillDefensa;

        return {
          ...processed,
          id: playerId,
          tracking,
          rendimientoTotal,
          skillBaseMatchmaking: rendimientoTotal,
          rendimientoArquero,
          rendimientoArqueroRanking: rankingSaveSkill,
          rendimientoArqueroDisponible: processed.rolPartido === 'arquero' ? rendimientoArquero : processed.rendimientoArqueroDisponible,
          impactoSkillDefensa,
          puntosDefensaRankingDirecto,
          golesRecibidosArquero,
          pulmon: tracking?.pulmon_tracking ?? 0,
          pulmonManual: processed.pulmon,
          pulmonTracking: tracking?.pulmon_tracking ?? null,
          scoreDefensivoMatchmaking: scoreDefensivoTracking ?? processed.scoreDefensivoMatchmaking ?? 0,
          scoreDefensivoTracking,
          defense_score: tracking?.defense_score ?? processed.defense_score ?? null,
          advanced_defense_score: tracking?.advanced_defense_score ?? processed.advanced_defense_score ?? null,
          trackingCoveragePct: tracking?.coverage_pct ?? 0,
          trackingIntensity: tracking?.high_intensity_seconds_avg ?? 0,
          trackingHeatmap: tracking?.heatmap || processed.trackingHeatmap || null,
          dominantPosition: tracking?.dominant_position_m || processed.dominantPosition || processed.dominant_position_m || null,
          trackingGoalkeeperSeconds: tracking?.goalkeeper_seconds ?? 0,
          trackingDistanceKmAvg: tracking?.distance_km_avg ?? processed.trackingDistanceKmAvg ?? 0,
          trackingDistanceKmTotal: tracking?.distance_km_total ?? processed.trackingDistanceKmTotal ?? 0,
          trackingDistancePer40Km: tracking?.distance_per_40_min_km ?? processed.trackingDistancePer40Km ?? 0,
          trackingGoalsScoredLocations: tracking?.goal_locations || processed.trackingGoalsScoredLocations || [],
          trackingGoalsConcededLocations: concededGoals,
          trackingGoalsConcededCount: concededGoals.length
        };
      });

      const defenseRange = defenseSkillRange(enrichedBasePlayers);
      const enrichedPlayers = enrichedBasePlayers.map(player => {
        const impactoSkillDefensa = player.puntosDefensaRankingDirecto !== null
          ? player.puntosDefensaRankingDirecto
          : defenseSkillImpact(player.scoreDefensivoTracking, defenseRange);
        const rendimientoTotal = toNumber(player.rendimientoJugador, 0)
          + toNumber(player.rendimientoArqueroRanking, 0)
          + impactoSkillDefensa;
        return {
          ...player,
          impactoSkillDefensa,
          rendimientoTotal,
          skillBaseMatchmaking: rendimientoTotal
        };
      });

      const sumaImpacto = enrichedPlayers.reduce((total, jugador) => (
        total + Math.abs(toNumber(jugador.rendimientoTotal, 0))
      ), 0);
      const impactoFallback = enrichedPlayers.length > 0 ? 100 / enrichedPlayers.length : 0;
      this.jugadores = enrichedPlayers.map(jugador => ({
        ...jugador,
        skillMatchmaking: jugador.skillBaseMatchmaking,
        impactoMatchmaking: sumaImpacto > 0
          ? (Math.abs(toNumber(jugador.rendimientoTotal, 0)) / sumaImpacto) * 100
          : impactoFallback
      }));
    };

    proto.evaluarIndividuo = function patchedEvaluar(individuo) {
      const base = originalEvaluar.call(this, individuo);
      const equipo1 = [];
      const equipo2 = [];
      for (let i = 0; i < individuo.length; i += 1) {
        (individuo[i] === 0 ? equipo1 : equipo2).push(this.jugadores[i]);
      }
      return base + trackingFitnessPenalty(equipo1, equipo2);
    };

    proto.calcularEstadisticasEquipo = function patchedStats(equipo) {
      const stats = originalStats.call(this, equipo);
      const tracking = evaluateTrackingTeam(equipo);
      const scoreDefensivoTotal = Math.max(toNumber(stats.scoreDefensivoTotal, 0), tracking.defenseTotal);
      const jugadoresConScoreDefensivoTracking = Math.max(
        toNumber(stats.jugadoresConScoreDefensivoTracking, 0),
        tracking.playersWithDefenseScore
      );
      const scoreDefensivoPromedio = tracking.playersWithDefenseScore > 0
        ? tracking.defenseAvg
        : toNumber(stats.scoreDefensivoPromedio, 0);
      return {
        ...stats,
        pulmonPromedio: tracking.pulmonAvg,
        pulmonTotal: tracking.pulmonTotal,
        pulmonTrackingTotal: tracking.pulmonTotal,
        scoreDefensivoPromedio,
        scoreDefensivoTotal,
        jugadoresConScoreDefensivoTracking,
        trackingCoveragePct: tracking.coveragePct,
        trackingOverlapPct: tracking.overlapPct,
        trackingIntensity: tracking.intensityAvg,
        trackingPlayers: tracking.playersWithTracking,
        armoniaHeatmapScore: tracking.harmonyScore,
        heatmapCoveragePct: tracking.coveragePct,
        heatmapOverlapPct: tracking.overlapPct,
        heatmapPlayers: tracking.heatmapPlayers,
        heatmapHarmonyUsable: tracking.heatmapPlayers >= 2
      };
    };
  }

  function evaluateTrackingTeam(team) {
    const withTracking = (team || []).filter(player => (
      player.tracking
      || player.trackingHeatmap
      || player.pulmonTracking !== null && player.pulmonTracking !== undefined
      || trackingDefenseScore(player) !== null
    ));
    const heatmaps = withTracking
      .map(player => orientHeatmapDefenseToAttack(player.trackingHeatmap || player.tracking?.heatmap, player.tracking || player))
      .filter(Boolean);
    const combined = combineHeatmaps(heatmaps);
    const coveragePct = heatmapCoveragePct(combined);
    const overlapPct = teamHeatmapOverlap(heatmaps.map(heatmap => ({ tracking: { heatmap } })));
    const coverageScore = Math.max(0, Math.min(100, coveragePct * 1.35));
    const overlapScore = heatmaps.length >= 2 ? Math.max(0, Math.min(100, 100 - overlapPct)) : 0;
    const harmonyScore = heatmaps.length >= 2
      ? Math.max(0, Math.min(100, (coverageScore * 0.62) + (overlapScore * 0.38)))
      : 0;
    const pulmonValues = withTracking
      .map(player => toNumber(player.pulmonTracking ?? player.tracking?.pulmon_tracking ?? player.tracking?.fis_valor, 0))
      .filter(value => value > 0);
    const pulmonTotal = pulmonValues.reduce((sum, value) => sum + value, 0);
    const defenseValues = withTracking
      .map(player => trackingDefenseScore(player))
      .filter(value => value !== null && value > 0);
    const defenseTotal = defenseValues.reduce((sum, value) => sum + value, 0);
    const intensityValues = withTracking.map(player => toNumber(player.trackingIntensity, 0));
    const goalkeepers = (team || []).filter(player =>
      player.rolPartido === 'arquero' || toNumber(player.trackingGoalkeeperSeconds, 0) >= 300
    ).length;

    return {
      playersWithTracking: withTracking.length,
      heatmapPlayers: heatmaps.length,
      pulmonAvg: pulmonValues.length ? round(pulmonTotal / pulmonValues.length, 1) : 0,
      pulmonTotal: round(pulmonTotal, 1),
      defenseAvg: defenseValues.length ? round(defenseTotal / defenseValues.length, 1) : 0,
      defenseTotal: round(defenseTotal, 1),
      playersWithDefenseScore: defenseValues.length,
      intensityAvg: intensityValues.length ? round(intensityValues.reduce((a, b) => a + b, 0) / intensityValues.length, 1) : 0,
      coveragePct: round(coveragePct, 2),
      overlapPct: round(overlapPct, 2),
      harmonyScore: round(harmonyScore, 1),
      goalkeepers
    };
  }

  function trackingFitnessPenalty(equipo1, equipo2) {
    const stats1 = evaluateTrackingTeam(equipo1);
    const stats2 = evaluateTrackingTeam(equipo2);
    if (stats1.playersWithTracking + stats2.playersWithTracking === 0) return 0;

    let penalty = 0;
    penalty += Math.abs(stats1.pulmonTotal - stats2.pulmonTotal) * 0.65;
    penalty += Math.abs(stats1.defenseTotal - stats2.defenseTotal) * 0.35;
    penalty += Math.abs(stats1.intensityAvg - stats2.intensityAvg) * 0.08;
    if (stats1.goalkeepers === 0) penalty += 12;
    if (stats2.goalkeepers === 0) penalty += 12;
    return penalty;
  }

  function initDomObservers() {
    decorateHistoryCards();
    ensureProfileTabs();
    attachProfileObserver();
    window.addEventListener('t5:admin-state-changed', decorateHistoryCards);

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        decorateHistoryCards();
        ensureProfileTabs();
        attachProfileObserver();
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function init() {
    if (typeof document === 'undefined') return;
    ensureStyles();
    ensureModals();
    initDomObservers();
    patchOptimizer();
    await refreshTrackingCaches();
    patchOptimizer();
    const optimizerRetry = setInterval(() => {
      patchOptimizer();
      if (APP.optimizerPatched) clearInterval(optimizerRetry);
    }, 500);
  }

  const api = {
    normalizeFootballDetectorStats,
    computePulmonTracking,
    heatmapOverlap,
    heatmapCoveragePct,
    heatmapDominantPosition,
    orientHeatmapDefenseToAttack,
    orientPointDefenseToAttack,
    combineHeatmaps,
    playerFieldMetrics,
    buildTeamPulmonWindowSeries,
    aggregatePlayerRows,
    evaluateTrackingTeam,
    trackingFitnessPenalty,
    upsertTrackingAnalysisRow,
    insertRows,
    buildTrackingPlayerStatsRows,
    buildTrackingShotEventRows,
    buildAdvancedDefenseEventRows,
    buildAdvancedDefenseAssignmentRows,
    shotMapFromRows,
    advancedDefenseFromRows,
    ensureMatchmakingTrackingReady,
    resolveImportPartidoId,
    renderGoalkeeperConcededMap,
    schemaMissingColumn,
    refreshTrackingCaches,
    openSummaryByAnalysisId
  };

  if (typeof window !== 'undefined') {
    window.T5TrackingIntegration = api;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof module !== 'undefined') {
    module.exports = api;
  }
}());
