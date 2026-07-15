/**
 * Algoritmo Genético para Auto-Armado de Equipos
 * Versión JavaScript adaptada del código Python original
 */

const ROL_PARTIDO_JUGADOR = 'jugador';
const ROL_PARTIDO_ARQUERO = 'arquero';
const MODO_RENDIMIENTO_HISTORICO = 'historico';
const MODO_RENDIMIENTO_RECIENTE = 'reciente';
const PARTIDOS_RECIENTES_DEFAULT = 5;
const SOBRE_RENDIMIENTO_RECIENTE_MIN_ABSOLUTO = 3;
const SOBRE_RENDIMIENTO_RECIENTE_MIN_RELATIVO = 0.25;
const MATCHMAKING_PITCH = { width: 32, height: 16 };
const MATCHMAKING_LIVE_PITCH_PIXELS = { width: 720, height: 360 };
const MATCHMAKING_LIVE_MARKER_COLLISION = {
  minDistPx: 70,
  iterations: 18,
  anchorPull: 0.12,
  verticalScale: 1.02,
  visualSpread: 0.018,
  columnCenterPull: 0.018
};
const MATCHMAKING_KEEPER_ROTATION = {
  layerLambda: 0.015,
  minLayerSep: 0.19,
  intervalMs: 3000,
  keeperSlot: { x: 0.06, y: 0.5 }
};
const MATCHMAKING_AREA_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24', '#34d399', '#fb7185'];
const MATCHMAKING_HARMONY_GRID = { cols: 26, rows: 13 };
const MATCHMAKING_HARMONY_MARKER_MIN_DISTANCE = 6.3;
const MATCHMAKING_HARMONY_MARKER_PADDING = 3.4;
const MATCHMAKING_DEFENSE_SCORE_MAX = 100;
const MATCHMAKING_DEFENSE_SKILL_BASELINE = 50;
const MATCHMAKING_DEFENSE_SKILL_MIN = 0;
const MATCHMAKING_DEFENSE_SKILL_MAX = 11;
const MATCHMAKING_DEFENSE_RANGE_EPSILON = 0.001;
const MATCHMAKING_RANKING_SAVE_WEIGHT = 0.4;
const imagenFotoJugadorMatchmakingCache = new Map();

function normalizarRolPartido(rol) {
  return rol === ROL_PARTIDO_ARQUERO ? ROL_PARTIDO_ARQUERO : ROL_PARTIDO_JUGADOR;
}

function etiquetaRolPartido(rol) {
  return normalizarRolPartido(rol) === ROL_PARTIDO_ARQUERO ? 'Arquero' : 'Jugador';
}

function numeroFinitoMatchmaking(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function numeroSeguroMatchmaking(valor, fallback = 0) {
  const numero = numeroFinitoMatchmaking(valor);
  return numero === null ? fallback : numero;
}

function clampMatchmaking(valor, min, max) {
  return Math.max(min, Math.min(max, valor));
}

function calcularImpactoSkillDefensaMatchmaking(score, rangoDefensa = null) {
  const numero = numeroFinitoMatchmaking(score);
  if (numero === null) return 0;
  if (rangoDefensa?.usaRango) {
    const normalizado = (numero - rangoDefensa.min) / rangoDefensa.rango;
    return clampMatchmaking(normalizado, 0, 1) * MATCHMAKING_DEFENSE_SKILL_MAX;
  }
  const impacto = ((numero - MATCHMAKING_DEFENSE_SKILL_BASELINE) / (MATCHMAKING_DEFENSE_SCORE_MAX - MATCHMAKING_DEFENSE_SKILL_BASELINE)) * MATCHMAKING_DEFENSE_SKILL_MAX;
  return clampMatchmaking(impacto, MATCHMAKING_DEFENSE_SKILL_MIN, MATCHMAKING_DEFENSE_SKILL_MAX);
}

function crearRangoDefensaMatchmaking(jugadores = []) {
  const scores = (jugadores || [])
    .map(jugador => numeroFinitoMatchmaking(jugador?.scoreDefensivoTracking))
    .filter(score => score !== null);
  if (!scores.length) {
    return { min: null, max: null, rango: 0, usaRango: false };
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const rango = max - min;
  return {
    min,
    max,
    rango,
    usaRango: scores.length > 1 && rango > MATCHMAKING_DEFENSE_RANGE_EPSILON
  };
}

function obtenerPuntosDefensaRankingDirectoMatchmaking(jugador) {
  const candidatos = [
    jugador?.puntosDefensaTrackingPromedio,
    jugador?.puntos_defensa_tracking_promedio,
    jugador?.defensaTrackingPromedio,
    jugador?.rankingDefenseSkill,
    jugador?.skillDefensaRanking
  ];

  for (const valor of candidatos) {
    const numero = numeroFinitoMatchmaking(valor);
    if (numero !== null) return numero;
  }

  return null;
}

function calcularRendimientoAtaqueRankingMatchmaking(jugador) {
  const pj = Math.max(Number(jugador?.pj) || 0, 1);
  const golesPP = (Number(jugador?.goles) || 0) / pj;
  const mvpPP = (Number(jugador?.mvp_count) || 0) / pj;
  const acePP = (Number(jugador?.ace_count) || 0) / pj;
  const asistPP = (Number(jugador?.asistencias) || 0) / pj;
  const cagadasPP = (Number(jugador?.cagadas_en_gol ?? jugador?.cagadasEnGol) || 0) / pj;
  const puntosPP = (Number(jugador?.total_puntos) || 0) / pj;

  return (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
}

function calcularRendimientoArqueroRankingMatchmaking(jugador) {
  const pj = Math.max(Number(jugador?.pj) || 0, 1);
  return ((Number(jugador?.atajadas) || 0) / pj) * MATCHMAKING_RANKING_SAVE_WEIGHT;
}

function calcularSkillRankingIndividualMatchmaking(jugador, puntosDefensaTracking = 0) {
  return calcularRendimientoAtaqueRankingMatchmaking(jugador)
    + calcularRendimientoArqueroRankingMatchmaking(jugador)
    + numeroSeguroMatchmaking(puntosDefensaTracking);
}

function obtenerIdJugadorMatchmaking(jugador) {
  return jugador?.jugadores?.id || jugador?.jugador_id || jugador?.id || null;
}

function obtenerNombreJugadorMatchmaking(jugador) {
  return jugador?.nombre || jugador?.jugadores?.nombre || 'Jugador';
}

function normalizarUrlFotoJugadorMatchmaking(valor) {
  const url = String(valor || '').trim();
  if (!url || ['null', 'undefined'].includes(url.toLowerCase())) return '';
  if (/^javascript:/i.test(url)) return '';
  if (/^data:/i.test(url) && !/^data:image\//i.test(url)) return '';
  return url;
}

function obtenerFotoJugadorMatchmaking(jugador = {}) {
  const jugadorId = obtenerIdJugadorMatchmaking(jugador);
  const nombre = obtenerNombreJugadorMatchmaking(jugador);
  const jugadorCache = Array.isArray(window.datosJugadores)
    ? window.datosJugadores.find(item => (
        jugadorId && String(obtenerIdJugadorMatchmaking(item)) === String(jugadorId)
      )) || window.datosJugadores.find(item => (
        nombre && normalizarBusquedaMatchmaking(obtenerNombreJugadorMatchmaking(item)) === normalizarBusquedaMatchmaking(nombre)
      ))
    : null;
  const anidado = jugador?.jugadores || {};
  const data = jugador?.data || {};
  const dataAnidado = data?.jugadores || {};
  const historico = jugador?.historicoMatchmaking || {};
  const historicoAnidado = historico?.jugadores || {};
  const cacheAnidado = jugadorCache?.jugadores || {};
  const candidatos = [
    jugador?.foto_url,
    jugador?.fotoUrl,
    jugador?.photo_url,
    jugador?.avatar_url,
    anidado?.foto_url,
    anidado?.fotoUrl,
    anidado?.photo_url,
    anidado?.avatar_url,
    data?.foto_url,
    data?.fotoUrl,
    data?.photo_url,
    data?.avatar_url,
    dataAnidado?.foto_url,
    dataAnidado?.fotoUrl,
    dataAnidado?.photo_url,
    dataAnidado?.avatar_url,
    historico?.foto_url,
    historico?.fotoUrl,
    historico?.photo_url,
    historico?.avatar_url,
    historicoAnidado?.foto_url,
    historicoAnidado?.fotoUrl,
    historicoAnidado?.photo_url,
    historicoAnidado?.avatar_url,
    jugadorCache?.foto_url,
    jugadorCache?.fotoUrl,
    jugadorCache?.photo_url,
    jugadorCache?.avatar_url,
    cacheAnidado?.foto_url,
    cacheAnidado?.fotoUrl,
    cacheAnidado?.photo_url,
    cacheAnidado?.avatar_url
  ];

  for (const candidato of candidatos) {
    const url = normalizarUrlFotoJugadorMatchmaking(candidato);
    if (url) return url;
  }

  return '';
}

function obtenerPulmonTrackingMatchmaking(jugador) {
  const candidatos = [
    jugador?.pulmonTracking,
    jugador?.pulmon_tracking,
    jugador?.tracking?.pulmon_tracking,
    jugador?.tracking?.fis_valor,
    jugador?.fis_valor,
    jugador?.physical_profile?.fis,
    jugador?.pulmon?.fis,
    jugador?.metrics?.fis_valor,
    jugador?.metrics?.pulmon?.fis,
    jugador?.pulmonManual,
    jugador?.manual_pulmon,
    jugador?.jugadores?.pulmon,
    jugador?.pulmon
  ];

  for (const valor of candidatos) {
    const numero = numeroFinitoMatchmaking(valor);
    if (numero !== null && numero > 0) return numero;
  }

  return null;
}

function obtenerScoreDefensivoMatchmaking(jugador) {
  return obtenerScoreDefensivoTrackingMatchmaking(jugador) ?? 0;
}

function obtenerScoreDefensivoTrackingMatchmaking(jugador) {
  const candidatos = [
    jugador?.advanced_defense_score,
    jugador?.advanced_defense?.score,
    jugador?.tracking?.advanced_defense_score,
    jugador?.tracking?.advanced_defense?.score,
    jugador?.metrics?.advanced_defense_score,
    jugador?.metrics?.advanced_defense?.score,
    jugador?.scoreDefensivoPromedio,
    jugador?.scoreDefensivoMatchmaking,
    jugador?.scoreDefensivoTracking,
    jugador?.defenseScore,
    jugador?.defense_score,
    jugador?.defense?.defense_score,
    jugador?.tracking?.defense_score,
    jugador?.tracking?.defense?.defense_score,
    jugador?.metrics?.defense_score,
    jugador?.metrics?.defense?.defense_score
  ];

  for (const valor of candidatos) {
    const numero = numeroFinitoMatchmaking(valor);
    if (numero !== null && numero > 0) return clampMatchmaking(numero, 0, 100);
  }

  return null;
}

async function asegurarTrackingMatchmakingListo() {
  if (typeof window === 'undefined') return null;
  const trackingApi = window.T5TrackingIntegration;
  if (!trackingApi) return null;

  try {
    if (typeof trackingApi.ensureMatchmakingTrackingReady === 'function') {
      return await trackingApi.ensureMatchmakingTrackingReady();
    }
    if (typeof trackingApi.refreshTrackingCaches === 'function') {
      await trackingApi.refreshTrackingCaches();
    }
  } catch (error) {
    console.warn('[matchmaking] tracking no disponible para armonia:', error?.message || error);
  }

  return null;
}

function normalizarLadoCanchaMatchmaking(lado) {
  const valor = String(lado || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (valor.includes('left') || valor.includes('izq')) return 'left';
  if (valor.includes('right') || valor.includes('der')) return 'right';
  return '';
}

function obtenerHeatmapCrudoJugadorMatchmaking(jugador) {
  return jugador?.trackingHeatmap
    || jugador?.tracking?.heatmap
    || jugador?.heatmap
    || jugador?.metrics?.heatmap
    || null;
}

function obtenerLadoPropioJugadorMatchmaking(jugador, heatmap = null) {
  const candidatos = [
    jugador?.own_side,
    jugador?.ownSide,
    jugador?.metrics?.own_side,
    jugador?.metrics?.ownSide,
    jugador?.tracking?.own_side,
    jugador?.tracking?.ownSide,
    jugador?.tracking?.metrics?.own_side,
    jugador?.tracking?.metrics?.ownSide,
    jugador?.tracking?.latest?.own_side,
    jugador?.tracking?.latest?.metrics?.own_side,
    heatmap?.source_own_side
  ];

  return candidatos.map(normalizarLadoCanchaMatchmaking).find(Boolean) || '';
}

function orientarHeatmapDefensaAtaqueMatchmaking(heatmap, jugador) {
  if (!heatmap || heatmap.orientation === 'defense_to_attack') return heatmap || null;
  const ladoPropio = obtenerLadoPropioJugadorMatchmaking(jugador, heatmap);
  if (!ladoPropio) return heatmap;
  const normalized = normalizarHeatmapMatchmaking(heatmap);
  if (!normalized.total || !normalized.counts.length) return heatmap;

  const counts = normalized.counts.map(row => {
    const normalizedRow = [];
    for (let x = 0; x < Math.max(normalized.xBins, row.length); x += 1) {
      normalizedRow.push(numeroSeguroMatchmaking(row?.[x], 0));
    }
    return ladoPropio === 'right' ? normalizedRow.reverse() : normalizedRow;
  });

  return {
    ...heatmap,
    counts,
    x_bins: counts[0]?.length || normalized.xBins,
    y_bins: counts.length || normalized.yBins,
    orientation: 'defense_to_attack',
    source_own_side: ladoPropio
  };
}

function obtenerHeatmapJugadorMatchmaking(jugador) {
  return orientarHeatmapDefensaAtaqueMatchmaking(obtenerHeatmapCrudoJugadorMatchmaking(jugador), jugador);
}

function normalizarHeatmapMatchmaking(heatmap) {
  const counts = heatmap?.counts || [];
  if (!Array.isArray(counts) || counts.length === 0) {
    return { xBins: 0, yBins: 0, counts: [], flat: [], total: 0 };
  }
  const yBins = counts.length;
  const xBins = Math.max(...counts.map(row => Array.isArray(row) ? row.length : 0), 0);
  const flat = [];
  let total = 0;
  const normalizedCounts = counts.map(row => {
    const normalizedRow = [];
    for (let x = 0; x < xBins; x += 1) {
      const value = numeroSeguroMatchmaking(row?.[x], 0);
      normalizedRow.push(value);
      flat.push(value);
      total += value;
    }
    return normalizedRow;
  });
  return {
    xBins: numeroSeguroMatchmaking(heatmap?.x_bins, xBins) || xBins,
    yBins: numeroSeguroMatchmaking(heatmap?.y_bins, yBins) || yBins,
    counts: normalizedCounts,
    flat,
    total
  };
}

function tieneHeatmapMatchmaking(jugador) {
  return normalizarHeatmapMatchmaking(obtenerHeatmapJugadorMatchmaking(jugador)).total > 0;
}

function combinarHeatmapsMatchmaking(heatmaps = []) {
  const normalized = heatmaps.map(normalizarHeatmapMatchmaking).filter(item => item.total > 0 && item.counts.length);
  if (!normalized.length) return null;
  const yBins = normalized[0].counts.length;
  const xBins = normalized[0].counts[0]?.length || 0;
  const counts = Array.from({ length: yBins }, () => Array(xBins).fill(0));
  normalized.forEach(heatmap => {
    for (let y = 0; y < yBins; y += 1) {
      for (let x = 0; x < xBins; x += 1) {
        counts[y][x] += numeroSeguroMatchmaking(heatmap.counts[y]?.[x], 0);
      }
    }
  });
  return { counts, x_bins: xBins, y_bins: yBins };
}

function coberturaHeatmapMatchmaking(heatmap, thresholdRatio = 0.01) {
  const normalized = normalizarHeatmapMatchmaking(heatmap);
  if (!normalized.total || !normalized.flat.length) return 0;
  const maxValue = Math.max(...normalized.flat);
  if (maxValue <= 0) return 0;
  const threshold = maxValue * thresholdRatio;
  const active = normalized.flat.filter(value => value > threshold).length;
  return (active / normalized.flat.length) * 100;
}

function solapamientoHeatmapMatchmaking(heatmapA, heatmapB) {
  const a = normalizarHeatmapMatchmaking(heatmapA);
  const b = normalizarHeatmapMatchmaking(heatmapB);
  if (!a.total || !b.total) return 0;
  const len = Math.min(a.flat.length, b.flat.length);
  let overlap = 0;
  for (let i = 0; i < len; i += 1) {
    overlap += Math.min(a.flat[i] / a.total, b.flat[i] / b.total);
  }
  return overlap * 100;
}

function solapamientoEquipoHeatmapMatchmaking(jugadores = []) {
  const heatmaps = jugadores.map(obtenerHeatmapJugadorMatchmaking).filter(heatmap => normalizarHeatmapMatchmaking(heatmap).total > 0);
  if (heatmaps.length < 2) return 0;
  let total = 0;
  let pares = 0;
  for (let i = 0; i < heatmaps.length; i += 1) {
    for (let j = i + 1; j < heatmaps.length; j += 1) {
      total += solapamientoHeatmapMatchmaking(heatmaps[i], heatmaps[j]);
      pares += 1;
    }
  }
  return pares > 0 ? total / pares : 0;
}

function posicionDominanteHeatmapMatchmaking(heatmap, pitch = MATCHMAKING_PITCH) {
  const normalized = normalizarHeatmapMatchmaking(heatmap);
  if (!normalized.total || !normalized.flat.length) return null;
  const maxValue = Math.max(...normalized.flat);
  if (maxValue <= 0) return null;

  const cells = [];
  normalized.counts.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value <= 0) return;
      cells.push({
        x,
        y,
        value,
        centerX: ((x + 0.5) / Math.max(normalized.xBins, 1)) * pitch.width,
        centerY: ((y + 0.5) / Math.max(normalized.yBins, 1)) * pitch.height
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
  const weight = selected.reduce((sum, cell) => sum + cell.value, 0);
  if (!weight) return null;
  return {
    x: selected.reduce((sum, cell) => sum + cell.centerX * cell.value, 0) / weight,
    y: selected.reduce((sum, cell) => sum + cell.centerY * cell.value, 0) / weight,
    source: 'heatmap'
  };
}

function posicionNaturalJugadorMatchmaking(jugador, pitch = MATCHMAKING_PITCH) {
  const direct = jugador?.dominantPosition
    || jugador?.dominant_position_m
    || jugador?.metrics?.dominant_position_m
    || jugador?.tracking?.dominant_position_m;
  if (direct && Number.isFinite(Number(direct.x)) && Number.isFinite(Number(direct.y))) {
    return { x: Number(direct.x), y: Number(direct.y), source: 'heatmap' };
  }
  return posicionDominanteHeatmapMatchmaking(obtenerHeatmapJugadorMatchmaking(jugador), pitch);
}

function obtenerEtiquetasPosicionJugadorMatchmaking(jugador = {}) {
  const fuentes = [
    jugador?.jugadorPosicionesMatchmaking,
    jugador?.jugadores?.jugador_posicion,
    jugador?.jugador_posicion,
    jugador?.data?.jugadores?.jugador_posicion,
    jugador?.data?.jugador_posicion,
    jugador?.historicoMatchmaking?.jugadores?.jugador_posicion,
    jugador?.historicoMatchmaking?.jugador_posicion
  ];

  for (const fuente of fuentes) {
    if (Array.isArray(fuente) && fuente.length > 0) return fuente;
  }

  return [];
}

function obtenerTextoEtiquetaPosicionMatchmaking(posicion = {}) {
  return posicion?.posicion?.nombre
    || posicion?.posiciones?.nombre
    || posicion?.nombre
    || posicion?.posicion_nombre
    || posicion?.label
    || '';
}

function normalizarRolVisualCanchaMatchmaking(rol, incluirArquero = false) {
  return rol === 'arquero' && !incluirArquero ? 'defensa' : rol;
}

function obtenerRolEtiquetaCanchaMatchmaking(jugador, opciones = {}) {
  const incluirArquero = opciones.incluirArquero === true;
  if (normalizarRolPartido(jugador?.rolPartido || jugador?.rol_matchmaking) === ROL_PARTIDO_ARQUERO) {
    return normalizarRolVisualCanchaMatchmaking('arquero', incluirArquero);
  }

  const etiquetas = [...obtenerEtiquetasPosicionJugadorMatchmaking(jugador)]
    .sort((a, b) => Number(Boolean(b?.es_primaria)) - Number(Boolean(a?.es_primaria)));
  const texto = normalizarBusquedaMatchmaking(etiquetas.map(obtenerTextoEtiquetaPosicionMatchmaking).join(' '));
  if (!texto) return null;
  if (texto.includes('arquero')) return normalizarRolVisualCanchaMatchmaking('arquero', incluirArquero);
  if (texto.includes('defen') || texto.includes('central') || texto.includes('lateral')) return 'defensa';
  if (texto.includes('medio') || texto.includes('mediocampo') || texto.includes('volante')) return 'medio';
  if (texto.includes('ata') || texto.includes('delanter') || texto.includes('punta')) return 'ataque';
  return null;
}

function evaluarArmoniaEquipoMatchmaking(equipo = []) {
  const jugadoresConHeatmap = (equipo || []).filter(tieneHeatmapMatchmaking);
  const heatmaps = jugadoresConHeatmap.map(obtenerHeatmapJugadorMatchmaking);
  const combined = combinarHeatmapsMatchmaking(heatmaps);
  const coveragePct = combined ? coberturaHeatmapMatchmaking(combined) : 0;
  const overlapPct = solapamientoEquipoHeatmapMatchmaking(jugadoresConHeatmap);
  const coverageScore = clampMatchmaking(coveragePct * 1.35, 0, 100);
  const overlapScore = jugadoresConHeatmap.length >= 2 ? clampMatchmaking(100 - overlapPct, 0, 100) : 0;
  const score = jugadoresConHeatmap.length >= 2
    ? clampMatchmaking((coverageScore * 0.62) + (overlapScore * 0.38), 0, 100)
    : 0;

  return {
    playersWithHeatmap: jugadoresConHeatmap.length,
    coveragePct,
    overlapPct,
    score,
    usable: jugadoresConHeatmap.length >= 2
  };
}

class GeneticTeamOptimizer {
  constructor() {
    this.sinergias = new Map();
    this.jugadores = [];
    this.parejasExcluidas = []; // Jugadores que NO pueden estar juntos
    this.parejasFijas = [];     // Jugadores que DEBEN estar juntos
    
    // Parámetros del algoritmo genético
    this.populationSize = 300;
    this.generations = 100;
    this.crossoverRate = 0.6;
    this.mutationRate = 0.15;
    this.tournamentSize = 3;
    this.fitnessWeights = {
      rendimientoTotal: 3.0,
      rendimientoAtaque: 2.0,
      rendimientoArquero: 1.5,
      golesFavorEquipo: 1.25,
      golesRecibidosEquipo: 1.25,
      pulmonTrackingTotal: 1.4,
      cantidadArqueros: 25,
      scoreDefensivoTotal: 0.22,
      armoniaHeatmap: 0.18,
      equilibrioArmoniaHeatmap: 0.08
    };
  }

  /**
   * Establece la lista de jugadores con sus estadísticas
   * @param {Array} jugadores - Array de objetos jugador con estadísticas
   */
  setJugadores(jugadores) {
    const jugadoresProcesadosBase = jugadores.map(jugador => {
      const jugadorId = obtenerIdJugadorMatchmaking(jugador);
      const rolPartido = normalizarRolPartido(jugador.rolPartido || jugador.rol_matchmaking);
      const rendimientoJugador = this.calcularRendimientoJugador(jugador);
      const rendimientoArqueroRanking = calcularRendimientoArqueroRankingMatchmaking(jugador);
      const rendimientoArqueroDisponible = this.calcularRendimientoArquero(jugador);
      const esArquero = rolPartido === ROL_PARTIDO_ARQUERO;
      const historicoMatchmaking = jugador.historicoMatchmaking
        ? {
            ...jugador.historicoMatchmaking,
            rolPartido,
            rol_matchmaking: rolPartido
          }
        : null;
      const rendimientoHistoricoMatchmaking = historicoMatchmaking
        ? this.calcularRendimientoTotal(historicoMatchmaking)
        : null;
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);
      const scoreDefensivoTracking = obtenerScoreDefensivoTrackingMatchmaking(jugador);
      const scoreDefensivoMatchmaking = scoreDefensivoTracking ?? 0;
      const puntosDefensaRankingDirecto = obtenerPuntosDefensaRankingDirectoMatchmaking(jugador);
      const impactoSkillDefensa = puntosDefensaRankingDirecto ?? 0;
      const rendimientoTotal = calcularSkillRankingIndividualMatchmaking(jugador, impactoSkillDefensa);
      const trackingHeatmap = obtenerHeatmapJugadorMatchmaking(jugador);
      const dominantPosition = posicionNaturalJugadorMatchmaking({
        ...jugador,
        trackingHeatmap
      });
      const jugadorPosicionesMatchmaking = obtenerEtiquetasPosicionJugadorMatchmaking(jugador);

      return {
        id: jugadorId,
        nombre: obtenerNombreJugadorMatchmaking(jugador),
        foto_url: obtenerFotoJugadorMatchmaking(jugador),
        rolPartido,
        origenRendimiento: jugador.origenRendimiento || MODO_RENDIMIENTO_HISTORICO,
        partidosRecientesSolicitados: jugador.partidosRecientesSolicitados || 0,
        partidosRecientesUsados: jugador.partidosRecientesUsados || 0,
        rendimientoTotal,
        skillBaseMatchmaking: rendimientoTotal,
        rendimientoHistoricoMatchmaking: Number.isFinite(rendimientoHistoricoMatchmaking) ? rendimientoHistoricoMatchmaking : null,
        rendimientoAtaque: esArquero ? 0 : rendimientoJugador,
        rendimientoArquero: esArquero ? rendimientoArqueroDisponible : 0,
        rendimientoJugador,
        rendimientoArqueroRanking,
        rendimientoArqueroDisponible,
        impactoSkillDefensa,
        puntosDefensaRankingDirecto,
        golesFavorEquipo: esArquero ? 0 : Number(jugador.goles_favor_equipo) || 0,
        golesRecibidosEquipo: esArquero ? Number(jugador.goles_recibidos_equipo) || 0 : 0,
        cantidadArqueros: esArquero ? 1 : 0,
        goles: numeroSeguroMatchmaking(jugador.goles),
        asistencias: numeroSeguroMatchmaking(jugador.asistencias),
        atajadas: numeroSeguroMatchmaking(jugador.atajadas),
        golesRecibidosArquero: numeroSeguroMatchmaking(jugador.goles_recibidos_arquero ?? jugador.golesRecibidosArquero),
        pjArquero: numeroSeguroMatchmaking(jugador.pj_arquero ?? jugador.pjArquero),
        cagadasEnGol: numeroSeguroMatchmaking(jugador.cagadas_en_gol ?? jugador.cagadasEnGol),
        momentosGolesMatchmaking: Array.isArray(jugador.momentosGolesMatchmaking) ? jugador.momentosGolesMatchmaking : [],
        momentosGolesRecibidosArqueroMatchmaking: Array.isArray(jugador.momentosGolesRecibidosArqueroMatchmaking) ? jugador.momentosGolesRecibidosArqueroMatchmaking : [],
        matchmakingVersus: jugador.matchmakingVersus && typeof jugador.matchmakingVersus === 'object' ? jugador.matchmakingVersus : {},
        matchmakingJuntos: jugador.matchmakingJuntos && typeof jugador.matchmakingJuntos === 'object' ? jugador.matchmakingJuntos : {},
        matchmakingDinamica: jugador.matchmakingDinamica && typeof jugador.matchmakingDinamica === 'object' ? jugador.matchmakingDinamica : null,
        rachaActualMatchmaking: jugador.rachaActualMatchmaking && typeof jugador.rachaActualMatchmaking === 'object' ? jugador.rachaActualMatchmaking : null,
        distribucionTramos: jugador.distribucionTramos || jugador.momentosPerfil?.distribucionTramos || null,
        trackingDistanceKmAvg: numeroSeguroMatchmaking(jugador.trackingDistanceKmAvg ?? jugador.distance_km_avg ?? jugador.tracking?.distance_km_avg),
        trackingDistancePer40Km: numeroSeguroMatchmaking(jugador.trackingDistancePer40Km ?? jugador.distance_per_40_min_km ?? jugador.tracking?.distance_per_40_min_km),
        pulmonTracking,
        scoreDefensivoTracking,
        scoreDefensivoMatchmaking,
        trackingHeatmap,
        dominantPosition,
        jugadorPosicionesMatchmaking,
        jugador_posicion: jugadorPosicionesMatchmaking,
        trackingGoalsScoredLocations: Array.isArray(jugador.trackingGoalsScoredLocations)
          ? jugador.trackingGoalsScoredLocations
          : (Array.isArray(jugador.goal_locations) ? jugador.goal_locations : []),
        trackingGoalsConcededLocations: Array.isArray(jugador.trackingGoalsConcededLocations) ? jugador.trackingGoalsConcededLocations : [],
        winrate: jugador.winrate || 0,
        pulmon: jugador.pulmon || jugador.jugadores?.pulmon || 0,
        pj: jugador.pj || 0
      };
    });

    const rangoDefensaMatchmaking = crearRangoDefensaMatchmaking(jugadoresProcesadosBase);
    const jugadoresProcesados = jugadoresProcesadosBase.map(jugador => {
      const impactoSkillDefensa = jugador.puntosDefensaRankingDirecto !== null
        ? jugador.puntosDefensaRankingDirecto
        : calcularImpactoSkillDefensaMatchmaking(jugador.scoreDefensivoTracking, rangoDefensaMatchmaking);
      const rendimientoTotal = calcularSkillRankingIndividualMatchmaking(jugador, impactoSkillDefensa);
      return {
        ...jugador,
        impactoSkillDefensa,
        rendimientoTotal,
        skillBaseMatchmaking: rendimientoTotal
      };
    });

    const sumaImpacto = jugadoresProcesados.reduce((total, jugador) => (
      total + Math.abs(Number(jugador.rendimientoTotal) || 0)
    ), 0);
    const impactoFallback = jugadoresProcesados.length > 0 ? 100 / jugadoresProcesados.length : 0;

    this.jugadores = jugadoresProcesados.map(jugador => ({
      ...jugador,
      skillMatchmaking: jugador.skillBaseMatchmaking,
      impactoMatchmaking: sumaImpacto > 0
        ? (Math.abs(Number(jugador.rendimientoTotal) || 0) / sumaImpacto) * 100
        : impactoFallback
    }));
  }

  /**
   * Calcula el rendimiento total de un jugador
   */
  calcularRendimientoTotal(jugador) {
    const puntosDefensa = obtenerPuntosDefensaRankingDirectoMatchmaking(jugador) ?? 0;
    return calcularSkillRankingIndividualMatchmaking(jugador, puntosDefensa);
  }

  /**
   * Calcula el rendimiento de un jugador de campo
   */
  calcularRendimientoJugador(jugador) {
    return calcularRendimientoAtaqueRankingMatchmaking(jugador);
  }

  calcularRendimientoAtaque(jugador) {
    return this.calcularRendimientoJugador(jugador);
  }

  /**
   * Calcula el rendimiento de arquero de un jugador
   */
  calcularRendimientoArquero(jugador) {
    const pjArqueroRegistrado = Number(jugador.pj_arquero ?? jugador.pjArquero);
    const pjFallback = Number(jugador.pj) || 0;
    const pjArquero = Number.isFinite(pjArqueroRegistrado) && pjArqueroRegistrado > 0
      ? pjArqueroRegistrado
      : Math.max(pjFallback, 1);
    const atajadas = Number(jugador.atajadas) || 0;
    const golesRecibidos = Number(jugador.goles_recibidos_arquero ?? jugador.golesRecibidosArquero) || 0;
    const atajadasPP = atajadas / pjArquero;
    const golesRecibidosPP = golesRecibidos / pjArquero;
    const atajadasPorGol = golesRecibidos > 0
      ? atajadas / golesRecibidos
      : (atajadasPP > 0 ? atajadasPP : 0);

    return Math.max(
      0,
      (atajadasPP * 0.66)
        + (Math.min(atajadasPorGol, 5) * 0.8)
        - (Math.min(golesRecibidosPP, 5) * 0.6)
    );
  }

  /**
   * Establece restricciones de parejas
   * @param {Array} parejasExcluidas - Array de [jugador1, jugador2] que NO pueden estar juntos
   * @param {Array} parejasFijas - Array de [jugador1, jugador2] que DEBEN estar juntos
   */
  setRestricciones(parejasExcluidas = [], parejasFijas = []) {
    this.parejasExcluidas = parejasExcluidas;
    this.parejasFijas = parejasFijas;
  }

  /**
   * Ejecuta el algoritmo genético
   */
  async ejecutar(onProgress = null) {
    if (this.jugadores.length < 4) {
      throw new Error('Se necesitan al menos 4 jugadores para formar equipos');
    }

    // Calcular sinergias
    this.calcularSinergias();

    // Inicializar población
    let poblacion = [];
    for (let i = 0; i < this.populationSize; i++) {
      poblacion.push(this.crearIndividuo());
    }

    let mejorFitness = Infinity;
    let mejorIndividuo = null;

    for (let gen = 0; gen < this.generations; gen++) {
      // Evaluar población
      const fitness = poblacion.map(ind => this.evaluarIndividuo(ind));
      
      // Encontrar el mejor
      const idxMejor = fitness.indexOf(Math.min(...fitness));
      if (fitness[idxMejor] < mejorFitness) {
        mejorFitness = fitness[idxMejor];
        mejorIndividuo = poblacion[idxMejor].slice();
      }

      // Reportar progreso
      if (onProgress) {
        onProgress({
          generacion: gen + 1,
          mejorFitness: mejorFitness,
          progresoPercent: ((gen + 1) / this.generations) * 100
        });
      }

      // Crear nueva población
      const nuevaPoblacion = [];
      
      // Elitismo: mantener el mejor individuo
      nuevaPoblacion.push(mejorIndividuo.slice());

      while (nuevaPoblacion.length < this.populationSize) {
        const padre1 = this.seleccionTorneo(poblacion, fitness);
        const padre2 = this.seleccionTorneo(poblacion, fitness);
        
        const [hijo1, hijo2] = this.cruzamiento(padre1, padre2);
        
        nuevaPoblacion.push(this.mutacion(hijo1));
        if (nuevaPoblacion.length < this.populationSize) {
          nuevaPoblacion.push(this.mutacion(hijo2));
        }
      }

      poblacion = nuevaPoblacion;

      // Pequeña pausa para no bloquear la UI
      if (gen % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    return this.procesarResultado(mejorIndividuo, mejorFitness);
  }

  calcularSinergias() {
    // Sinergias simplificadas basadas en winrate y rendimiento
    for (let i = 0; i < this.jugadores.length; i++) {
      for (let j = i + 1; j < this.jugadores.length; j++) {
        const jugador1 = this.jugadores[i];
        const jugador2 = this.jugadores[j];
        const key = [jugador1.nombre, jugador2.nombre].sort().join('-');
        
        // Sinergia basada en compatibilidad de estadísticas
        const winrateDiff = Math.abs((jugador1.winrate || 0) - (jugador2.winrate || 0));
        const rendimientoDiff = Math.abs((jugador1.rendimientoTotal || 0) - (jugador2.rendimientoTotal || 0));
        
        const sinergia = 50 + Math.max(0, 25 - winrateDiff/2) + Math.max(0, 15 - rendimientoDiff/3);
        
        this.sinergias.set(key, {
          sinergia: Math.min(sinergia, 100),
          partidas: 10 // Valor por defecto
        });
      }
    }
  }

  crearIndividuo() {
    const individuo = Array(this.jugadores.length).fill(0).map(() => Math.random() < 0.5 ? 0 : 1);
    return this.repararIndividuo(individuo);
  }

  repararIndividuo(individuo) {
    const equipoSize = 5; // Siempre 5 jugadores por equipo
    const noMover = new Set();

    // Aplicar parejas fijas (que deben estar juntas)
    for (const [nombre1, nombre2] of this.parejasFijas) {
      const idx1 = this.jugadores.findIndex(j => j.nombre === nombre1);
      const idx2 = this.jugadores.findIndex(j => j.nombre === nombre2);
      
      if (idx1 !== -1 && idx2 !== -1) {
        individuo[idx2] = individuo[idx1]; // Mismo equipo
        noMover.add(idx1);
        noMover.add(idx2);
      }
    }

    // Aplicar parejas excluidas (que NO pueden estar juntas)
    for (const [nombre1, nombre2] of this.parejasExcluidas) {
      const idx1 = this.jugadores.findIndex(j => j.nombre === nombre1);
      const idx2 = this.jugadores.findIndex(j => j.nombre === nombre2);
      
      if (idx1 !== -1 && idx2 !== -1) {
        if (individuo[idx1] === individuo[idx2]) {
          if (!noMover.has(idx1) && !noMover.has(idx2)) {
            individuo[idx2] = 1 - individuo[idx1]; // Equipos diferentes
            noMover.add(idx1);
            noMover.add(idx2);
          } else if (!noMover.has(idx1)) {
            individuo[idx1] = 1 - individuo[idx2];
            noMover.add(idx1);
          } else if (!noMover.has(idx2)) {
            individuo[idx2] = 1 - individuo[idx1];
            noMover.add(idx2);
          }
        } else {
          noMover.add(idx1);
          noMover.add(idx2);
        }
      }
    }
    
    // Balancear equipos (cada equipo debe tener exactamente 5 jugadores)
    const puedenMover = Array.from({length: this.jugadores.length}, (_, i) => i).filter(i => !noMover.has(i));
    
    while (true) {
      const equipo0Count = individuo.filter(x => x === 0).length;
      const equipo1Count = individuo.filter(x => x === 1).length;
      
      if (equipo0Count === equipoSize && equipo1Count === equipoSize) break;
      
      if (equipo0Count > equipoSize) {
        // Mover jugador de equipo 0 a equipo 1
        const candidatos = puedenMover.filter(i => individuo[i] === 0);
        if (candidatos.length > 0) {
          const idx = candidatos[Math.floor(Math.random() * candidatos.length)];
          individuo[idx] = 1;
        } else break;
      } else if (equipo1Count > equipoSize) {
        // Mover jugador de equipo 1 a equipo 0
        const candidatos = puedenMover.filter(i => individuo[i] === 1);
        if (candidatos.length > 0) {
          const idx = candidatos[Math.floor(Math.random() * candidatos.length)];
          individuo[idx] = 0;
        } else break;
      } else break;
    }

    return individuo;
  }

  evaluarIndividuo(individuo) {
    const equipo1 = [];
    const equipo2 = [];
    const stats1 = {
      rendimientoTotal: 0,
      rendimientoAtaque: 0,
      rendimientoArquero: 0,
      golesFavorEquipo: 0,
      golesRecibidosEquipo: 0,
      pulmonTrackingTotal: 0,
      scoreDefensivoTotal: 0,
      cantidadArqueros: 0
    };
    const stats2 = {
      rendimientoTotal: 0,
      rendimientoAtaque: 0,
      rendimientoArquero: 0,
      golesFavorEquipo: 0,
      golesRecibidosEquipo: 0,
      pulmonTrackingTotal: 0,
      scoreDefensivoTotal: 0,
      cantidadArqueros: 0
    };

    for (let i = 0; i < individuo.length; i++) {
      const jugador = this.jugadores[i];
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);
      if (individuo[i] === 0) {
        equipo1.push(jugador);
        stats1.rendimientoTotal += jugador.rendimientoTotal;
        stats1.rendimientoAtaque += jugador.rendimientoAtaque;
        stats1.rendimientoArquero += jugador.rendimientoArquero;
        stats1.golesFavorEquipo += jugador.golesFavorEquipo;
        stats1.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats1.pulmonTrackingTotal += pulmonTracking || 0;
        stats1.scoreDefensivoTotal += obtenerScoreDefensivoMatchmaking(jugador);
        stats1.cantidadArqueros += jugador.cantidadArqueros;
      } else {
        equipo2.push(jugador);
        stats2.rendimientoTotal += jugador.rendimientoTotal;
        stats2.rendimientoAtaque += jugador.rendimientoAtaque;
        stats2.rendimientoArquero += jugador.rendimientoArquero;
        stats2.golesFavorEquipo += jugador.golesFavorEquipo;
        stats2.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats2.pulmonTrackingTotal += pulmonTracking || 0;
        stats2.scoreDefensivoTotal += obtenerScoreDefensivoMatchmaking(jugador);
        stats2.cantidadArqueros += jugador.cantidadArqueros;
      }
    }

    const size1 = equipo1.length;
    const size2 = equipo2.length;
    
    if (size1 === 0 || size2 === 0) return 1000;
    const armonia1 = evaluarArmoniaEquipoMatchmaking(equipo1);
    const armonia2 = evaluarArmoniaEquipoMatchmaking(equipo2);

    const avg1 = {
      rendimientoTotal: stats1.rendimientoTotal / size1,
      rendimientoAtaque: stats1.rendimientoAtaque / size1,
      rendimientoArquero: stats1.rendimientoArquero / size1,
      golesFavorEquipo: stats1.golesFavorEquipo / size1,
      golesRecibidosEquipo: stats1.golesRecibidosEquipo / size1,
      pulmonTrackingTotal: stats1.pulmonTrackingTotal,
      scoreDefensivoTotal: stats1.scoreDefensivoTotal,
      cantidadArqueros: stats1.cantidadArqueros,
      armoniaHeatmap: armonia1
    };

    const avg2 = {
      rendimientoTotal: stats2.rendimientoTotal / size2,
      rendimientoAtaque: stats2.rendimientoAtaque / size2,
      rendimientoArquero: stats2.rendimientoArquero / size2,
      golesFavorEquipo: stats2.golesFavorEquipo / size2,
      golesRecibidosEquipo: stats2.golesRecibidosEquipo / size2,
      pulmonTrackingTotal: stats2.pulmonTrackingTotal,
      scoreDefensivoTotal: stats2.scoreDefensivoTotal,
      cantidadArqueros: stats2.cantidadArqueros,
      armoniaHeatmap: armonia2
    };

    return this.calcularFitnessBalanceado(avg1, avg2);

    // Calcular fitness como diferencias ponderadas por importancia
    let fitness = 0;
    fitness += Math.abs(avg1.rendimientoTotal - avg2.rendimientoTotal) * 3.0;    // Peso más alto para rendimiento total
    fitness += Math.abs(avg1.rendimientoAtaque - avg2.rendimientoAtaque) * 2.0;  // Peso medio para ataque
    fitness += Math.abs(avg1.rendimientoArquero - avg2.rendimientoArquero) * 1.5; // Peso menor para arquero

    return fitness;
  }

  calcularFitnessBalanceado(avg1, avg2) {
    let fitness = 0;
    fitness += Math.abs(avg1.rendimientoTotal - avg2.rendimientoTotal) * this.fitnessWeights.rendimientoTotal;
    fitness += Math.abs(avg1.rendimientoAtaque - avg2.rendimientoAtaque) * this.fitnessWeights.rendimientoAtaque;
    fitness += Math.abs(avg1.rendimientoArquero - avg2.rendimientoArquero) * this.fitnessWeights.rendimientoArquero;
    fitness += Math.abs(avg1.golesFavorEquipo - avg2.golesFavorEquipo) * this.fitnessWeights.golesFavorEquipo;
    fitness += Math.abs(avg1.golesRecibidosEquipo - avg2.golesRecibidosEquipo) * this.fitnessWeights.golesRecibidosEquipo;
    fitness += Math.abs((avg1.pulmonTrackingTotal || 0) - (avg2.pulmonTrackingTotal || 0)) * this.fitnessWeights.pulmonTrackingTotal;
    fitness += Math.abs((avg1.cantidadArqueros || 0) - (avg2.cantidadArqueros || 0)) * this.fitnessWeights.cantidadArqueros;
    fitness += Math.abs((avg1.scoreDefensivoTotal || 0) - (avg2.scoreDefensivoTotal || 0)) * this.fitnessWeights.scoreDefensivoTotal;
    const armonia1 = avg1.armoniaHeatmap;
    const armonia2 = avg2.armoniaHeatmap;
    if (armonia1?.usable) {
      fitness += (100 - armonia1.score) * this.fitnessWeights.armoniaHeatmap * Math.min(1, armonia1.playersWithHeatmap / 5);
    }
    if (armonia2?.usable) {
      fitness += (100 - armonia2.score) * this.fitnessWeights.armoniaHeatmap * Math.min(1, armonia2.playersWithHeatmap / 5);
    }
    if (armonia1?.usable && armonia2?.usable) {
      fitness += Math.abs(armonia1.score - armonia2.score) * this.fitnessWeights.equilibrioArmoniaHeatmap;
    }
    return fitness;
  }

  seleccionTorneo(poblacion, fitness) {
    const competidores = [];
    for (let i = 0; i < this.tournamentSize; i++) {
      const idx = Math.floor(Math.random() * poblacion.length);
      competidores.push({ individuo: poblacion[idx], fitness: fitness[idx] });
    }
    
    competidores.sort((a, b) => a.fitness - b.fitness);
    return competidores[0].individuo.slice();
  }

  cruzamiento(padre1, padre2) {
    if (Math.random() > this.crossoverRate) {
      return [padre1.slice(), padre2.slice()];
    }

    const punto = Math.floor(Math.random() * padre1.length);
    const hijo1 = padre1.slice(0, punto).concat(padre2.slice(punto));
    const hijo2 = padre2.slice(0, punto).concat(padre1.slice(punto));

    return [this.repararIndividuo(hijo1), this.repararIndividuo(hijo2)];
  }

  mutacion(individuo) {
    if (Math.random() > this.mutationRate) {
      return individuo;
    }

    const mutado = individuo.slice();
    const idx1 = Math.floor(Math.random() * mutado.length);
    let idx2 = Math.floor(Math.random() * mutado.length);
    while (idx2 === idx1) {
      idx2 = Math.floor(Math.random() * mutado.length);
    }

    [mutado[idx1], mutado[idx2]] = [mutado[idx2], mutado[idx1]];
    
    return this.repararIndividuo(mutado);
  }

  procesarResultado(mejorIndividuo, fitness) {
    const equipo1 = [];
    const equipo2 = [];
    
    for (let i = 0; i < mejorIndividuo.length; i++) {
      const jugador = this.jugadores[i];
      if (mejorIndividuo[i] === 0) {
        equipo1.push(jugador);
      } else {
        equipo2.push(jugador);
      }
    }

    return {
      equipo1: {
        jugadores: equipo1,
        estadisticas: this.calcularEstadisticasEquipo(equipo1)
      },
      equipo2: {
        jugadores: equipo2,
        estadisticas: this.calcularEstadisticasEquipo(equipo2)
      },
      fitness: fitness
    };
  }

  calcularEstadisticasEquipo(equipo) {
    const stats = {
      rendimientoTotal: 0,
      rendimientoAtaque: 0,
      rendimientoArquero: 0,
      golesFavorEquipo: 0,
      golesRecibidosEquipo: 0,
      winrate: 0,
      pulmonTrackingTotal: 0,
      scoreDefensivoTotal: 0,
      cantidadArqueros: 0,
      impactoMatchmaking: 0,
      jugadoresConPulmonTracking: 0,
      jugadoresConScoreDefensivoTracking: 0
    };

    for (const jugador of equipo) {
      stats.rendimientoTotal += jugador.rendimientoTotal;
      stats.rendimientoAtaque += jugador.rendimientoAtaque;
      stats.rendimientoArquero += jugador.rendimientoArquero;
      stats.golesFavorEquipo += jugador.golesFavorEquipo;
      stats.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
      stats.winrate += jugador.winrate;
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);
      if (pulmonTracking !== null && pulmonTracking > 0) {
        stats.pulmonTrackingTotal += pulmonTracking;
        stats.jugadoresConPulmonTracking += 1;
      }
      const scoreDefensivo = obtenerScoreDefensivoTrackingMatchmaking(jugador);
      if (scoreDefensivo !== null && scoreDefensivo > 0) {
        stats.scoreDefensivoTotal += scoreDefensivo;
        stats.jugadoresConScoreDefensivoTracking += 1;
      }
      stats.cantidadArqueros += jugador.cantidadArqueros;
      stats.impactoMatchmaking += jugador.impactoMatchmaking || 0;
    }

    const size = equipo.length;
    const armonia = evaluarArmoniaEquipoMatchmaking(equipo);
    return {
      rendimientoTotal: stats.rendimientoTotal,
      rendimientoAtaque: stats.rendimientoAtaque,
      rendimientoArquero: stats.rendimientoArquero,
      golesFavorPromedio: size > 0 ? stats.golesFavorEquipo / size : 0,
      golesRecibidosPromedio: size > 0 ? stats.golesRecibidosEquipo / size : 0,
      winratePromedio: size > 0 ? stats.winrate / size : 0,
      pulmonPromedio: stats.jugadoresConPulmonTracking > 0 ? stats.pulmonTrackingTotal / stats.jugadoresConPulmonTracking : 0,
      pulmonTotal: stats.pulmonTrackingTotal,
      pulmonTrackingTotal: stats.pulmonTrackingTotal,
      scoreDefensivoPromedio: stats.jugadoresConScoreDefensivoTracking > 0 ? stats.scoreDefensivoTotal / stats.jugadoresConScoreDefensivoTracking : 0,
      scoreDefensivoTotal: stats.scoreDefensivoTotal,
      jugadoresConPulmonTracking: stats.jugadoresConPulmonTracking,
      jugadoresConScoreDefensivoTracking: stats.jugadoresConScoreDefensivoTracking,
      cantidadArqueros: stats.cantidadArqueros,
      impactoMatchmaking: stats.impactoMatchmaking,
      jugadores: size,
      armoniaHeatmapScore: armonia.score,
      heatmapCoveragePct: armonia.coveragePct,
      heatmapOverlapPct: armonia.overlapPct,
      heatmapPlayers: armonia.playersWithHeatmap,
      heatmapHarmonyUsable: armonia.usable
    };
  }
}

// Exportar para uso global
window.GeneticTeamOptimizer = GeneticTeamOptimizer;

// ===============================
// Funcionalidad del Algoritmo Genético
// ===============================

let geneticOptimizer = null;
let startTime = null;
let jugadoresSeleccionados = [];
let parejasEnfrentadas = [];
let parejasJuntas = [];
let contadorParejas = { enfrentadas: 1, juntas: 1 };
let ultimosJugadoresUsados = ''; // Para recordar la última configuración
let modoRendimientoMatchmaking = MODO_RENDIMIENTO_HISTORICO;
let partidosRecientesMatchmaking = PARTIDOS_RECIENTES_DEFAULT;
let seleccionIntercambioMatchmaking = null;
let resultadoLiveMatchmaking = null;
let asignacionLiveAnterior = {};
let recalculoLiveVersion = 0;
let ultimoNombreAgregadoLive = '';

function obtenerRolInicialPartido(jugador) {
  return normalizarRolPartido(jugador?.rolPartido || jugador?.rol_matchmaking);
}

function escaparTextoParaJs(valor) {
  return String(valor || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function obtenerTemporadaActivaMatchmaking() {
  return document.getElementById('selector-temporada')?.value
    || document.getElementById('selector-temporada-mobile')?.value
    || '';
}

function obtenerCantidadPartidosRecientesMatchmaking() {
  const input = document.getElementById('input-partidos-recientes-matchmaking');
  const valor = Number.parseInt(input?.value, 10);
  if (!Number.isFinite(valor)) return PARTIDOS_RECIENTES_DEFAULT;
  return Math.min(Math.max(valor, 1), 30);
}

function obtenerConfiguracionRendimientoMatchmaking() {
  const modoSeleccionado = document.querySelector('input[name="matchmaking-performance-mode"]:checked')?.value
    || MODO_RENDIMIENTO_HISTORICO;
  const modo = modoSeleccionado === MODO_RENDIMIENTO_RECIENTE
    ? MODO_RENDIMIENTO_RECIENTE
    : MODO_RENDIMIENTO_HISTORICO;

  return {
    modo,
    partidos: obtenerCantidadPartidosRecientesMatchmaking(),
    temporadaId: obtenerTemporadaActivaMatchmaking()
  };
}

function normalizarBusquedaMatchmaking(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function datosJugadoresMatchmakingDisponibles() {
  return Array.isArray(window.datosJugadores) ? window.datosJugadores : [];
}

function obtenerPartidoIdsRankingMatchmaking(jugadores = []) {
  return [...new Set((jugadores || []).flatMap(jugador => [
    jugador?.partido_id,
    ...(Array.isArray(jugador?.partido_ids) ? jugador.partido_ids : []),
    ...(Array.isArray(jugador?.partidoIds) ? jugador.partidoIds : [])
  ]).map(valor => String(valor || '').trim()).filter(Boolean))];
}

async function asegurarPuntosDefensaRankingMatchmaking(datos = []) {
  if (!Array.isArray(datos) || datos.length === 0) return datos;
  if (datos.every(jugador => obtenerPuntosDefensaRankingDirectoMatchmaking(jugador) !== null)) {
    return datos;
  }

  const cargarPromedios = window.cargarPromediosDefensaTrackingJugadores;
  if (typeof cargarPromedios !== 'function') return datos;

  try {
    const universoRanking = datosJugadoresMatchmakingDisponibles().length
      ? datosJugadoresMatchmakingDisponibles()
      : datos;
    const idsRanking = universoRanking.map(obtenerIdJugadorMatchmaking).filter(Boolean);
    const partidoIdsRanking = obtenerPartidoIdsRankingMatchmaking(universoRanking);
    const promedios = await cargarPromedios(idsRanking, partidoIdsRanking);

    return datos.map(jugador => {
      if (obtenerPuntosDefensaRankingDirectoMatchmaking(jugador) !== null) return jugador;
      const jugadorId = obtenerIdJugadorMatchmaking(jugador);
      const defensa = promedios?.get?.(String(jugadorId || ''));
      if (!defensa) return jugador;
      return {
        ...jugador,
        scoreDefensivoPromedio: defensa.scoreDefensivoPromedio ?? jugador.scoreDefensivoPromedio ?? null,
        puntosDefensaTrackingPromedio: defensa.puntosDefensaTrackingPromedio ?? 0,
        partidosConDefensaTracking: defensa.partidosConDefensaTracking ?? jugador.partidosConDefensaTracking ?? 0
      };
    });
  } catch (error) {
    console.warn('[matchmaking] no se pudo cargar DEF de ranking:', error?.message || error);
    return datos;
  }
}

function nombreDatoJugadorMatchmaking(jugador) {
  return jugador?.jugadores?.nombre || jugador?.nombre || '';
}

function idDatoJugadorMatchmaking(jugador) {
  return obtenerIdJugadorMatchmaking(jugador);
}

function sincronizarInputJugadoresPartido() {
  const input = document.getElementById('input-jugadores-partido');
  if (input) {
    input.value = jugadoresSeleccionados.map(jugador => jugador.nombre).join(', ');
  }
}

function poblarOpcionesJugadoresMatchmaking() {
  const datalist = document.getElementById('matchmaking-player-options');
  if (!datalist) return;
  const usados = new Set(jugadoresSeleccionados.map(jugador => String(jugador.id)));
  datalist.innerHTML = datosJugadoresMatchmakingDisponibles()
    .filter(jugador => !usados.has(String(idDatoJugadorMatchmaking(jugador))))
    .map(jugador => nombreDatoJugadorMatchmaking(jugador))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map(nombre => `<option value="${escaparHtmlMatchmaking(nombre)}"></option>`)
    .join('');
}

function resolverDatoJugadorPorNombreMatchmaking(nombre) {
  const buscado = normalizarBusquedaMatchmaking(nombre);
  if (!buscado) return null;
  const candidatos = datosJugadoresMatchmakingDisponibles();
  return candidatos.find(jugador => normalizarBusquedaMatchmaking(nombreDatoJugadorMatchmaking(jugador)) === buscado)
    || candidatos.find(jugador => normalizarBusquedaMatchmaking(nombreDatoJugadorMatchmaking(jugador)).startsWith(buscado))
    || candidatos.find(jugador => normalizarBusquedaMatchmaking(nombreDatoJugadorMatchmaking(jugador)).includes(buscado))
    || null;
}

function resolverDatoJugadorPorIdMatchmaking(jugadorId) {
  const id = String(jugadorId || '').trim();
  if (!id) return null;
  return datosJugadoresMatchmakingDisponibles()
    .find(jugador => String(idDatoJugadorMatchmaking(jugador) || '') === id) || null;
}

function resolverDatoJugadorPorReferenciaMatchmaking(referencia = {}) {
  return resolverDatoJugadorPorIdMatchmaking(referencia.id || referencia.jugador_id)
    || resolverDatoJugadorPorNombreMatchmaking(referencia.nombre || referencia.name);
}

function crearJugadorSeleccionadoMatchmaking(jugador, rolesPrevios = new Map()) {
  const jugadorId = idDatoJugadorMatchmaking(jugador);
  if (!jugadorId) return null;
  return {
    id: jugadorId,
    nombre: nombreDatoJugadorMatchmaking(jugador),
    data: jugador,
    rolPartido: normalizarRolPartido(rolesPrevios.get(String(jugadorId)) || obtenerRolInicialPartido(jugador))
  };
}

function agregarJugadorSeleccionadoMatchmaking(jugador, opciones = {}) {
  const seleccionado = crearJugadorSeleccionadoMatchmaking(jugador);
  if (!seleccionado) return false;
  if (jugadoresSeleccionados.some(actual => String(actual.id) === String(seleccionado.id))) {
    if (!opciones.silencioso) window.showToast?.(`${seleccionado.nombre} ya esta en el armado`, 'warning');
    return false;
  }
  if (jugadoresSeleccionados.length >= 10) {
    if (!opciones.silencioso) window.showToast?.('El armado ya tiene 10 jugadores', 'warning');
    return false;
  }

  jugadoresSeleccionados.push(seleccionado);
  ultimoNombreAgregadoLive = seleccionado.nombre;
  sincronizarInputJugadoresPartido();
  actualizarJugadoresSeleccionados();
  actualizarSelectsRestricciones();
  validarEjecucion();
  recalcularAutoEquiposLive('alta');
  return true;
}

window.agregarJugadorAutoMatchmaking = function() {
  const input = document.getElementById('input-jugador-live-matchmaking');
  const nombre = input?.value?.trim() || '';
  if (!nombre) {
    window.showToast?.('Ingresa un jugador', 'warning');
    return;
  }

  const jugador = resolverDatoJugadorPorNombreMatchmaking(nombre);
  if (!jugador) {
    window.showToast?.(`No encontre a "${nombre}" en la tabla de jugadores`, 'error');
    return;
  }

  if (agregarJugadorSeleccionadoMatchmaking(jugador)) {
    if (input) input.value = '';
    input?.focus();
  }
};

window.quitarJugadorAutoMatchmaking = function(jugadorId) {
  const jugador = jugadoresSeleccionados.find(actual => String(actual.id) === String(jugadorId));
  jugadoresSeleccionados = jugadoresSeleccionados.filter(actual => String(actual.id) !== String(jugadorId));
  delete asignacionLiveAnterior[String(jugadorId)];
  ultimoNombreAgregadoLive = '';
  sincronizarInputJugadoresPartido();
  actualizarJugadoresSeleccionados();
  actualizarSelectsRestricciones();
  validarEjecucion();
  recalcularAutoEquiposLive(jugador ? 'baja' : '');
};

window.limpiarAutoEquipos = function() {
  jugadoresSeleccionados = [];
  resultadoLiveMatchmaking = null;
  asignacionLiveAnterior = {};
  ultimoNombreAgregadoLive = '';
  sincronizarInputJugadoresPartido();
  actualizarJugadoresSeleccionados();
  actualizarSelectsRestricciones();
  validarEjecucion();
  recalcularAutoEquiposLive('limpiar');
};

function contarBitsMatchmaking(mask, n) {
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (mask & (1 << i)) count += 1;
  }
  return count;
}

function indiceJugadorPorNombreMatchmaking(jugadores, nombre) {
  const buscado = normalizarBusquedaMatchmaking(nombre);
  return jugadores.findIndex(jugador => normalizarBusquedaMatchmaking(jugador.nombre) === buscado);
}

function cumpleRestriccionesIndividuoMatchmaking(individuo, jugadores, restricciones = {}) {
  for (const [nombre1, nombre2] of restricciones.juntas || []) {
    const idx1 = indiceJugadorPorNombreMatchmaking(jugadores, nombre1);
    const idx2 = indiceJugadorPorNombreMatchmaking(jugadores, nombre2);
    if (idx1 >= 0 && idx2 >= 0 && individuo[idx1] !== individuo[idx2]) return false;
  }

  for (const [nombre1, nombre2] of restricciones.enfrentadas || []) {
    const idx1 = indiceJugadorPorNombreMatchmaking(jugadores, nombre1);
    const idx2 = indiceJugadorPorNombreMatchmaking(jugadores, nombre2);
    if (idx1 >= 0 && idx2 >= 0 && individuo[idx1] === individuo[idx2]) return false;
  }

  return true;
}

function asignacionDesdeIndividuoMatchmaking(individuo, jugadores) {
  return jugadores.reduce((acc, jugador, index) => {
    acc[String(jugador.id || jugador.nombre)] = individuo[index];
    return acc;
  }, {});
}

function contarMovimientosMatchmaking(individuo, jugadores, asignacionAnterior = {}) {
  return jugadores.reduce((total, jugador, index) => {
    const key = String(jugador.id || jugador.nombre);
    return Object.prototype.hasOwnProperty.call(asignacionAnterior, key) && asignacionAnterior[key] !== individuo[index]
      ? total + 1
      : total;
  }, 0);
}

function calcularCriterioBalanceLiveMatchmaking(jugadores = [], individuo = []) {
  const resumen = {
    size1: 0,
    size2: 0,
    rendimiento1: 0,
    rendimiento2: 0,
    ataque1: 0,
    ataque2: 0
  };

  jugadores.forEach((jugador, index) => {
    const target = individuo[index] === 0 ? '1' : '2';
    resumen[`size${target}`] += 1;
    resumen[`rendimiento${target}`] += numeroSeguroMatchmaking(jugador.rendimientoTotal);
    resumen[`ataque${target}`] += numeroSeguroMatchmaking(jugador.rendimientoAtaque);
  });

  const avgRendimiento1 = resumen.size1 > 0 ? resumen.rendimiento1 / resumen.size1 : 0;
  const avgRendimiento2 = resumen.size2 > 0 ? resumen.rendimiento2 / resumen.size2 : 0;
  const avgAtaque1 = resumen.size1 > 0 ? resumen.ataque1 / resumen.size1 : 0;
  const avgAtaque2 = resumen.size2 > 0 ? resumen.ataque2 / resumen.size2 : 0;
  const mismosJugadores = resumen.size1 === resumen.size2;

  return {
    ...resumen,
    rendimientoDiff: mismosJugadores
      ? Math.abs(resumen.rendimiento1 - resumen.rendimiento2)
      : Math.abs(avgRendimiento1 - avgRendimiento2),
    ataqueDiff: mismosJugadores
      ? Math.abs(resumen.ataque1 - resumen.ataque2)
      : Math.abs(avgAtaque1 - avgAtaque2),
    rendimientoTotalDiff: Math.abs(resumen.rendimiento1 - resumen.rendimiento2),
    rendimientoAvgDiff: Math.abs(avgRendimiento1 - avgRendimiento2)
  };
}

function compararCandidatosBalanceLiveMatchmaking(candidato, mejor) {
  if (!mejor) return true;
  const epsilon = 0.05;
  const campos = ['fitness', 'rendimientoDiff', 'ataqueDiff', 'movimientos', 'desbalance'];

  for (const campo of campos) {
    const valorCandidato = numeroSeguroMatchmaking(candidato[campo]);
    const valorMejor = numeroSeguroMatchmaking(mejor[campo]);
    if (valorCandidato < valorMejor - epsilon) return true;
    if (valorCandidato > valorMejor + epsilon) return false;
  }

  return false;
}

function optimizarEquiposExactoLiveMatchmaking(datosJugadores, restricciones = {}, asignacionAnterior = {}) {
  const optimizer = new GeneticTeamOptimizer();
  optimizer.setRestricciones(restricciones.enfrentadas || [], restricciones.juntas || []);
  optimizer.setJugadores(datosJugadores);

  const n = optimizer.jugadores.length;
  if (n === 0) return null;

  if (n === 1) {
    const individuo = [0];
    const resultado = optimizer.procesarResultado(individuo, 0);
    const asignacion = asignacionDesdeIndividuoMatchmaking(individuo, optimizer.jugadores);
    resultado.matchmakingLive = { asignacion, movimientos: 0 };
    return { resultado, asignacion };
  }

  const minEquipo = Math.floor(n / 2);
  const maxEquipo = Math.ceil(n / 2);
  let mejor = null;

  for (let mask = 0; mask < (1 << n); mask += 1) {
    const equipo1Size = contarBitsMatchmaking(mask, n);
    if (equipo1Size !== minEquipo && equipo1Size !== maxEquipo) continue;

    const individuo = optimizer.jugadores.map((_, index) => (mask & (1 << index)) ? 0 : 1);
    if (!cumpleRestriccionesIndividuoMatchmaking(individuo, optimizer.jugadores, restricciones)) continue;

    const fitness = optimizer.evaluarIndividuo(individuo);
    if (!Number.isFinite(fitness)) continue;

    const movimientos = contarMovimientosMatchmaking(individuo, optimizer.jugadores, asignacionAnterior);
    const desbalance = Math.abs(equipo1Size - (n - equipo1Size));
    const criterio = calcularCriterioBalanceLiveMatchmaking(optimizer.jugadores, individuo);
    const candidato = {
      individuo,
      fitness,
      movimientos,
      desbalance,
      ...criterio
    };

    if (compararCandidatosBalanceLiveMatchmaking(candidato, mejor)) {
      mejor = candidato;
    }
  }

  if (!mejor) {
    throw new Error('No hay una particion valida con las restricciones actuales');
  }

  const resultado = optimizer.procesarResultado(mejor.individuo, mejor.fitness);
  const asignacion = asignacionDesdeIndividuoMatchmaking(mejor.individuo, optimizer.jugadores);
  resultado.matchmakingLive = { asignacion, movimientos: mejor.movimientos };
  return { resultado, asignacion };
}

async function prepararDatosLiveMatchmaking(configuracion) {
  let datos = jugadoresSeleccionados.map(jugador => ({
    ...jugador.data,
    rolPartido: jugador.rolPartido
  }));

  if (configuracion.modo === MODO_RENDIMIENTO_RECIENTE) {
    datos = await cargarEstadisticasRecientesJugadores(
      jugadoresSeleccionados,
      configuracion.partidos,
      configuracion.temporadaId
    );
  }

  datos = await asegurarPuntosDefensaRankingMatchmaking(datos);

  return enriquecerJugadoresConMomentosMatchmaking(datos, configuracion.temporadaId);
}

function obtenerMovimientosLiveMatchmaking(asignacionAnterior = {}, asignacionActual = {}) {
  return jugadoresSeleccionados
    .filter(jugador => {
      const key = String(jugador.id);
      return Object.prototype.hasOwnProperty.call(asignacionAnterior, key)
        && Object.prototype.hasOwnProperty.call(asignacionActual, key)
        && asignacionAnterior[key] !== asignacionActual[key];
    })
    .map(jugador => jugador.nombre);
}

function obtenerRolCanchaLiveMatchmaking(jugador, opciones = {}) {
  const incluirArquero = opciones.incluirArquero === true;
  const posicion = posicionNaturalJugadorMatchmaking(jugador);
  if (!posicion) return obtenerRolEtiquetaCanchaMatchmaking(jugador, { incluirArquero });
  const ataque = clampMatchmaking(numeroSeguroMatchmaking(posicion.x, MATCHMAKING_PITCH.width / 2) / MATCHMAKING_PITCH.width, 0, 1);
  if (ataque <= 0.16) return normalizarRolVisualCanchaMatchmaking('arquero', incluirArquero);
  if (ataque <= 0.42) return 'defensa';
  if (ataque >= 0.68) return 'ataque';
  return 'medio';
}

function obtenerBoundsEquipoCanchaLiveMatchmaking(equipoKey) {
  return equipoKey === 'equipo1'
    ? { x0: 6.6, x1: 48.0, y0: 14, y1: 86 }
    : { x0: 52.0, x1: 93.4, y0: 14, y1: 86 };
}

function proyectarNormCanchaLiveMatchmaking(norm, equipoKey) {
  const bounds = obtenerBoundsEquipoCanchaLiveMatchmaking(equipoKey);
  const xNorm = clampMatchmaking(numeroSeguroMatchmaking(norm?.x, 0.5), 0, 1);
  const yNorm = clampMatchmaking(numeroSeguroMatchmaking(norm?.y, 0.5), 0, 1);
  const width = bounds.x1 - bounds.x0;
  const height = bounds.y1 - bounds.y0;
  return {
    x: equipoKey === 'equipo1'
      ? bounds.x0 + (xNorm * width)
      : bounds.x1 - (xNorm * width),
    y: bounds.y0 + (yNorm * height)
  };
}

function obtenerBoundsNormCanchaLiveMatchmaking(norm, equipoKey, radioX = 0.1, radioY = 0.15) {
  const x = clampMatchmaking(numeroSeguroMatchmaking(norm?.x, 0.5), 0, 1);
  const y = clampMatchmaking(numeroSeguroMatchmaking(norm?.y, 0.5), 0, 1);
  const x0Norm = clampMatchmaking(x - radioX, 0.04, 0.96);
  const x1Norm = clampMatchmaking(x + radioX, 0.04, 0.96);
  const y0Norm = clampMatchmaking(y - radioY, 0.05, 0.95);
  const y1Norm = clampMatchmaking(y + radioY, 0.05, 0.95);
  const p0 = proyectarNormCanchaLiveMatchmaking({ x: x0Norm, y: y0Norm }, equipoKey);
  const p1 = proyectarNormCanchaLiveMatchmaking({ x: x1Norm, y: y1Norm }, equipoKey);
  const centro = proyectarNormCanchaLiveMatchmaking(norm, equipoKey);
  return {
    x0: Math.min(p0.x, p1.x),
    x1: Math.max(p0.x, p1.x),
    y0: Math.min(p0.y, p1.y),
    y1: Math.max(p0.y, p1.y),
    centerX: centro.x,
    centerY: centro.y
  };
}

function obtenerAnchorRolFallbackCanchaLiveMatchmaking(role) {
  if (role === 'ataque') return { x: 0.82, y: 0.5 };
  if (role === 'medio') return { x: 0.52, y: 0.5 };
  if (role === 'defensa') return { x: 0.22, y: 0.5 };
  return null;
}

function obtenerAnchorJugadorCapasCanchaLiveMatchmaking(jugador) {
  const posicion = posicionNaturalJugadorMatchmaking(jugador);
  if (posicion) {
    return {
      x: clampMatchmaking(numeroSeguroMatchmaking(posicion.x) / MATCHMAKING_PITCH.width, 0, 1),
      y: clampMatchmaking(numeroSeguroMatchmaking(posicion.y) / MATCHMAKING_PITCH.height, 0, 1),
      source: posicion.source || 'tracking',
      tracking: true,
      role: obtenerRolCanchaLiveMatchmaking(jugador)
    };
  }

  const role = obtenerRolEtiquetaCanchaMatchmaking(jugador, { incluirArquero: false });
  const fallback = obtenerAnchorRolFallbackCanchaLiveMatchmaking(role);
  if (!fallback) return null;
  return {
    ...fallback,
    source: 'etiqueta',
    tracking: false,
    role
  };
}

function detectarCapasCanchaLiveMatchmaking(items = [], lambda = MATCHMAKING_KEEPER_ROTATION.layerLambda) {
  const n = items.length;
  if (!n) return { capas: [], costo: 0 };
  const orden = [...items].sort((a, b) => numeroSeguroMatchmaking(a.anchor?.x) - numeroSeguroMatchmaking(b.anchor?.x));
  let mejor = null;

  for (let mask = 0; mask < (1 << Math.max(n - 1, 0)); mask += 1) {
    const capas = [[orden[0]]];
    for (let i = 1; i < n; i += 1) {
      if (mask & (1 << (i - 1))) capas.push([]);
      capas[capas.length - 1].push(orden[i]);
    }

    let costo = 0;
    capas.forEach(capa => {
      const mx = capa.reduce((sum, item) => sum + numeroSeguroMatchmaking(item.anchor?.x), 0) / capa.length;
      costo += capa.reduce((sum, item) => {
        const dx = numeroSeguroMatchmaking(item.anchor?.x) - mx;
        return sum + (dx * dx);
      }, 0);
    });
    costo += lambda * (capas.length - 1);

    if (!mejor || costo < mejor.costo) mejor = { capas, costo };
  }

  return mejor || { capas: [orden], costo: 0 };
}

function normalizarXsCapasCanchaLiveMatchmaking(capas = []) {
  if (!capas.length) return [];
  const minSep = MATCHMAKING_KEEPER_ROTATION.minLayerSep;
  const xs = capas.map(capa => {
    const mean = capa.reduce((sum, item) => sum + numeroSeguroMatchmaking(item.anchor?.x), 0) / capa.length;
    return clampMatchmaking(0.18 + (mean * 0.74), 0.18, 0.92);
  });

  for (let i = 1; i < xs.length; i += 1) {
    if (xs[i] - xs[i - 1] < minSep) xs[i] = xs[i - 1] + minSep;
  }

  const exceso = xs.length ? xs[xs.length - 1] - 0.92 : 0;
  if (exceso > 0) {
    for (let i = 0; i < xs.length; i += 1) xs[i] -= exceso;
  }

  return xs.map(x => clampMatchmaking(x, 0.16, 0.92));
}

function posicionarCapasCanchaLiveMatchmaking(capas = []) {
  const xs = normalizarXsCapasCanchaLiveMatchmaking(capas);
  const posiciones = [];
  capas.forEach((capa, capaIndex) => {
    const ordenY = [...capa].sort((a, b) => numeroSeguroMatchmaking(a.anchor?.y) - numeroSeguroMatchmaking(b.anchor?.y));
    ordenY.forEach((item, index) => {
      const y = ordenY.length === 1
        ? [0.3, 0.5, 0.7].reduce((mejor, candidato) => (
            Math.abs(candidato - numeroSeguroMatchmaking(item.anchor?.y, 0.5)) < Math.abs(mejor - numeroSeguroMatchmaking(item.anchor?.y, 0.5))
              ? candidato
              : mejor
          ), 0.5)
        : (index + 1) / (ordenY.length + 1);
      posiciones.push({
        item,
        norm: { x: xs[capaIndex], y },
        slotRole: `capa-${capaIndex + 1}`
      });
    });
  });
  return posiciones;
}

function claveJugadorCanchaLiveMatchmaking(jugador = {}) {
  return String(jugador?.id || jugador?.nombre || obtenerNombreJugadorMatchmaking(jugador));
}

function generarEscenariosArqueroCanchaLiveMatchmaking(items = [], equipoKey) {
  if (!items.length) return [];
  return items.map(itemArquero => {
    const campo = items.filter(item => claveJugadorCanchaLiveMatchmaking(item.jugador) !== claveJugadorCanchaLiveMatchmaking(itemArquero.jugador));
    const { capas, costo } = detectarCapasCanchaLiveMatchmaking(campo);
    const etiqueta = capas.length ? capas.map(capa => capa.length).join('-') : '0';
    const posiciones = [
      {
        item: itemArquero,
        norm: MATCHMAKING_KEEPER_ROTATION.keeperSlot,
        slotRole: 'arquero',
        isKeeper: true
      },
      ...posicionarCapasCanchaLiveMatchmaking(capas)
    ];

    const markers = posiciones.map(posicion => {
      const punto = proyectarNormCanchaLiveMatchmaking(posicion.norm, equipoKey);
      return {
        jugador: posicion.item.jugador,
        x: punto.x,
        y: punto.y,
        source: posicion.item.anchor.source,
        formation: etiqueta,
        slotRole: posicion.slotRole,
        columnBounds: obtenerBoundsNormCanchaLiveMatchmaking(
          posicion.norm,
          equipoKey,
          posicion.isKeeper ? 0.045 : 0.11,
          posicion.isKeeper ? 0.18 : 0.15
        ),
        isFallback: !posicion.item.anchor.tracking,
        isKeeper: Boolean(posicion.isKeeper)
      };
    });

    return {
      keeperKey: claveJugadorCanchaLiveMatchmaking(itemArquero.jugador),
      keeperName: obtenerNombreJugadorMatchmaking(itemArquero.jugador),
      etiqueta,
      costo,
      markers: resolverOverlapsMarcadoresCanchaLiveMatchmaking(markers, equipoKey)
    };
  }).sort((a, b) => a.costo - b.costo);
}

function porcentajeAPixelCanchaLiveMatchmaking(punto) {
  return {
    x: (numeroSeguroMatchmaking(punto?.x) / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.width,
    y: (numeroSeguroMatchmaking(punto?.y) / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.height
  };
}

function pixelAPorcentajeCanchaLiveMatchmaking(punto) {
  return {
    x: (numeroSeguroMatchmaking(punto?.x) / MATCHMAKING_LIVE_PITCH_PIXELS.width) * 100,
    y: (numeroSeguroMatchmaking(punto?.y) / MATCHMAKING_LIVE_PITCH_PIXELS.height) * 100
  };
}

function boundsAPixelCanchaLiveMatchmaking(bounds) {
  return {
    x0: (bounds.x0 / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.width,
    x1: (bounds.x1 / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.width,
    y0: (bounds.y0 / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.height,
    y1: (bounds.y1 / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.height
  };
}

function resolverOverlapsMarcadoresCanchaLiveMatchmaking(marcadores = [], equipoKey) {
  if (!Array.isArray(marcadores) || marcadores.length < 2) return marcadores;

  const boundsEquipo = obtenerBoundsEquipoCanchaLiveMatchmaking(equipoKey);
  const boundsPxEquipo = boundsAPixelCanchaLiveMatchmaking(boundsEquipo);
  const config = MATCHMAKING_LIVE_MARKER_COLLISION;
  const puntos = marcadores.map((marker, index) => {
    const px = porcentajeAPixelCanchaLiveMatchmaking(marker);
    const boundsMarker = marker.columnBounds || boundsEquipo;
    const boundsPx = boundsAPixelCanchaLiveMatchmaking(boundsMarker);
    const columnCenterX = ((numeroSeguroMatchmaking(boundsMarker.centerX, (boundsMarker.x0 + boundsMarker.x1) / 2)) / 100) * MATCHMAKING_LIVE_PITCH_PIXELS.width;
    return {
      index,
      x: px.x,
      y: px.y,
      anchorX: px.x,
      anchorY: px.y,
      boundsPx,
      columnCenterX
    };
  });

  for (let it = 0; it < config.iterations; it += 1) {
    for (let i = 0; i < puntos.length; i += 1) {
      for (let j = i + 1; j < puntos.length; j += 1) {
        let dx = puntos[j].x - puntos[i].x;
        let dy = puntos[j].y - puntos[i].y;
        let distancia = Math.hypot(dx, dy / config.verticalScale);

        if (distancia === 0) {
          const angle = ((i + 1) * 1.791) + ((j + 1) * 0.977);
          dx = Math.cos(angle);
          dy = Math.sin(angle) * config.verticalScale;
          distancia = Math.hypot(dx, dy / config.verticalScale);
        }

        if (distancia < config.minDistPx) {
          const push = (config.minDistPx - distancia) / 2;
          const ux = dx / distancia;
          const uy = (dy / config.verticalScale) / distancia;
          puntos[i].x -= ux * push;
          puntos[i].y -= uy * push * config.verticalScale;
          puntos[j].x += ux * push;
          puntos[j].y += uy * push * config.verticalScale;
        }
      }
    }

    puntos.forEach(punto => {
      punto.x += (punto.anchorX - punto.x) * config.anchorPull;
      punto.y += (punto.anchorY - punto.y) * config.anchorPull;
      punto.x += (punto.x - punto.anchorX) * config.visualSpread;
      punto.y += (punto.y - punto.anchorY) * config.visualSpread;
      punto.x += (punto.columnCenterX - punto.x) * config.columnCenterPull;
      punto.x = clampMatchmaking(punto.x, punto.boundsPx?.x0 ?? boundsPxEquipo.x0, punto.boundsPx?.x1 ?? boundsPxEquipo.x1);
      punto.y = clampMatchmaking(punto.y, punto.boundsPx?.y0 ?? boundsPxEquipo.y0, punto.boundsPx?.y1 ?? boundsPxEquipo.y1);
    });
  }

  return marcadores.map((marker, index) => {
    const punto = puntos[index];
    const porcentual = pixelAPorcentajeCanchaLiveMatchmaking(punto);
    return {
      ...marker,
      anchorX: marker.x,
      anchorY: marker.y,
      x: porcentual.x,
      y: porcentual.y,
      hasCollisionOffset: Math.hypot(porcentual.x - marker.x, porcentual.y - marker.y) > 0.1
    };
  });
}

function prepararMarcadoresLiveEquipoMatchmaking(jugadores = [], equipoKey) {
  const color = equipoKey === 'equipo1' ? MATCHMAKING_TEAM_THEMES.equipo1.color : MATCHMAKING_TEAM_THEMES.equipo2.color;
  const items = jugadores
    .map(jugador => {
      const anchor = obtenerAnchorJugadorCapasCanchaLiveMatchmaking(jugador);
      if (!anchor) return null;
      return { jugador, anchor };
    })
    .filter(Boolean);
  const escenarios = generarEscenariosArqueroCanchaLiveMatchmaking(items, equipoKey)
    .map(escenario => ({
      ...escenario,
      markers: escenario.markers.map(marker => ({ ...marker, color, teamKey: equipoKey }))
    }));
  const escenarioInicial = escenarios[0] || { etiqueta: '', keeperName: '', markers: [] };

  return {
    marcadores: escenarioInicial.markers,
    escenarios,
    formacion: escenarioInicial.etiqueta,
    arquero: escenarioInicial.keeperName
  };
}

function obtenerJugadoresSinTrackingCanchaLiveMatchmaking(resultado) {
  return [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ].filter(jugador => !posicionNaturalJugadorMatchmaking(jugador) && !obtenerRolEtiquetaCanchaMatchmaking(jugador, { incluirArquero: false }));
}

const rotacionArqueroCanchaMatchmaking = {
  escenarios: { equipo1: [], equipo2: [] },
  index: 0,
  timer: null,
  manualPaused: false,
  hoverPaused: false
};

function totalEscenariosRotacionArqueroMatchmaking() {
  return Math.max(
    rotacionArqueroCanchaMatchmaking.escenarios.equipo1?.length || 0,
    rotacionArqueroCanchaMatchmaking.escenarios.equipo2?.length || 0
  );
}

function escenarioRotacionEquipoMatchmaking(equipoKey, index = rotacionArqueroCanchaMatchmaking.index) {
  const escenarios = rotacionArqueroCanchaMatchmaking.escenarios[equipoKey] || [];
  if (!escenarios.length) return null;
  return escenarios[index % escenarios.length];
}

function estaPausadaRotacionArqueroMatchmaking() {
  return rotacionArqueroCanchaMatchmaking.manualPaused || rotacionArqueroCanchaMatchmaking.hoverPaused;
}

function actualizarUiRotacionArqueroMatchmaking() {
  const pitch = document.querySelector('[data-matchmaking-keeper-pitch]');
  if (!pitch) return;
  const pausada = estaPausadaRotacionArqueroMatchmaking();
  const total = totalEscenariosRotacionArqueroMatchmaking();
  const button = pitch.querySelector('[data-keeper-rotation-toggle]');
  if (button) {
    button.innerHTML = `<i class="bi ${pausada ? 'bi-play-fill' : 'bi-pause-fill'}"></i>`;
    button.setAttribute('aria-label', pausada ? 'Reanudar rotacion de arqueros' : 'Pausar rotacion de arqueros');
  }
  const escenarioActual = pitch.querySelector('[data-keeper-scenario]');
  if (escenarioActual) {
    escenarioActual.textContent = total > 0 ? `${rotacionArqueroCanchaMatchmaking.index + 1}/${total}` : '0/0';
  }
  pitch.querySelectorAll('[data-keeper-dot]').forEach(dot => {
    dot.classList.toggle('is-active', Number(dot.dataset.keeperDot) === rotacionArqueroCanchaMatchmaking.index);
  });
}

function aplicarEscenarioRotacionArqueroMatchmaking() {
  const pitch = document.querySelector('[data-matchmaking-keeper-pitch]');
  if (!pitch) return;

  ['equipo1', 'equipo2'].forEach(equipoKey => {
    const escenario = escenarioRotacionEquipoMatchmaking(equipoKey);
    if (!escenario) return;
    const keeper = pitch.querySelector(`[data-keeper-name="${equipoKey}"]`);
    const formacion = pitch.querySelector(`[data-keeper-formation="${equipoKey}"]`);
    if (keeper) keeper.textContent = escenario.keeperName || '-';
    if (formacion) formacion.textContent = escenario.etiqueta || '-';

    const markersByKey = new Map(
      (escenario.markers || []).map(marker => [claveJugadorCanchaLiveMatchmaking(marker.jugador), marker])
    );
    pitch.querySelectorAll(`[data-marker-team="${equipoKey}"]`).forEach(markerEl => {
      const marker = markersByKey.get(markerEl.dataset.playerKey);
      if (!marker) {
        markerEl.hidden = true;
        return;
      }
      markerEl.hidden = false;
      markerEl.style.setProperty('--marker-x', `${marker.x.toFixed(1)}%`);
      markerEl.style.setProperty('--marker-y', `${marker.y.toFixed(1)}%`);
      markerEl.classList.toggle('is-fallback', Boolean(marker.isFallback));
      markerEl.classList.toggle('is-keeper', Boolean(marker.isKeeper));
      markerEl.title = `${obtenerNombreJugadorMatchmaking(marker.jugador)} - ${marker.isKeeper ? 'ataja' : `capa ${marker.formation || ''}`} - posicion ${marker.source}${marker.hasCollisionOffset ? ' - separado para evitar overlap' : ''}`;
    });
  });

  actualizarUiRotacionArqueroMatchmaking();
}

function reiniciarTimerRotacionArqueroMatchmaking() {
  if (rotacionArqueroCanchaMatchmaking.timer) {
    clearInterval(rotacionArqueroCanchaMatchmaking.timer);
    rotacionArqueroCanchaMatchmaking.timer = null;
  }
  if (estaPausadaRotacionArqueroMatchmaking()) {
    actualizarUiRotacionArqueroMatchmaking();
    return;
  }
  const total = totalEscenariosRotacionArqueroMatchmaking();
  if (total <= 1) {
    actualizarUiRotacionArqueroMatchmaking();
    return;
  }
  rotacionArqueroCanchaMatchmaking.timer = setInterval(() => {
    const totalActual = totalEscenariosRotacionArqueroMatchmaking();
    if (totalActual <= 1) return;
    rotacionArqueroCanchaMatchmaking.index = (rotacionArqueroCanchaMatchmaking.index + 1) % totalActual;
    aplicarEscenarioRotacionArqueroMatchmaking();
  }, MATCHMAKING_KEEPER_ROTATION.intervalMs);
  actualizarUiRotacionArqueroMatchmaking();
}

function iniciarRotacionArqueroMatchmaking() {
  const total = totalEscenariosRotacionArqueroMatchmaking();
  if (total === 0) return;
  rotacionArqueroCanchaMatchmaking.index = clampMatchmaking(rotacionArqueroCanchaMatchmaking.index, 0, total - 1);
  aplicarEscenarioRotacionArqueroMatchmaking();
  reiniciarTimerRotacionArqueroMatchmaking();
}

function detenerRotacionArqueroMatchmaking() {
  if (rotacionArqueroCanchaMatchmaking.timer) clearInterval(rotacionArqueroCanchaMatchmaking.timer);
  rotacionArqueroCanchaMatchmaking.timer = null;
}

window.toggleRotacionArqueroMatchmaking = function() {
  rotacionArqueroCanchaMatchmaking.manualPaused = !rotacionArqueroCanchaMatchmaking.manualPaused;
  reiniciarTimerRotacionArqueroMatchmaking();
};

window.seleccionarEscenarioArqueroMatchmaking = function(index) {
  const total = totalEscenariosRotacionArqueroMatchmaking();
  if (!total) return;
  rotacionArqueroCanchaMatchmaking.index = clampMatchmaking(Number(index) || 0, 0, total - 1);
  rotacionArqueroCanchaMatchmaking.manualPaused = true;
  aplicarEscenarioRotacionArqueroMatchmaking();
  reiniciarTimerRotacionArqueroMatchmaking();
};

window.setHoverRotacionArqueroMatchmaking = function(valor) {
  rotacionArqueroCanchaMatchmaking.hoverPaused = Boolean(valor);
  reiniciarTimerRotacionArqueroMatchmaking();
};

function mostrarToastMatchmaking(mensaje, tipo = 'info') {
  if (typeof window.showToast === 'function') {
    window.showToast(mensaje, tipo);
    return;
  }
  console[tipo === 'error' ? 'error' : 'log'](mensaje);
}

function descargarBlobMatchmaking(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function nombreArchivoGifFormacionesMatchmaking() {
  const fecha = new Date();
  const pad = valor => String(valor).padStart(2, '0');
  const stamp = [
    fecha.getFullYear(),
    pad(fecha.getMonth() + 1),
    pad(fecha.getDate()),
    pad(fecha.getHours()),
    pad(fecha.getMinutes())
  ].join('-');
  return `equipos-formaciones-${stamp}.gif`;
}

function setEstadoExportGifFormacionesMatchmaking(exportando) {
  const button = document.querySelector('[data-keeper-gif-export]');
  if (!button) return;
  button.disabled = Boolean(exportando);
  button.innerHTML = exportando
    ? '<span>GIF</span><i class="bi bi-hourglass-split"></i>'
    : '<span>GIF</span><i class="bi bi-download"></i>';
}

function rgbDesdeHexMatchmaking(hex, fallback = '#e7ecf5') {
  const limpio = String(hex || fallback).replace('#', '').trim();
  const valor = limpio.length === 3
    ? limpio.split('').map(char => char + char).join('')
    : limpio.padEnd(6, '0').slice(0, 6);
  const numero = Number.parseInt(valor, 16);
  if (!Number.isFinite(numero)) return rgbDesdeHexMatchmaking(fallback, '#e7ecf5');
  return {
    r: (numero >> 16) & 255,
    g: (numero >> 8) & 255,
    b: numero & 255
  };
}

function colorRgbaMatchmaking(color, alpha = 1) {
  const rgb = rgbDesdeHexMatchmaking(color);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function dibujarRectRedondeadoMatchmaking(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function textoEllipsisCanvasMatchmaking(ctx, texto, maxWidth) {
  const original = String(texto || '');
  if (ctx.measureText(original).width <= maxWidth) return original;
  let salida = original;
  while (salida.length > 1 && ctx.measureText(`${salida}...`).width > maxWidth) {
    salida = salida.slice(0, -1);
  }
  return `${salida}...`;
}

function dibujarChipGifMatchmaking(ctx, texto, x, y, opciones = {}) {
  const paddingX = opciones.paddingX ?? 12;
  const height = opciones.height ?? 28;
  ctx.font = opciones.font || '800 14px system-ui, -apple-system, Segoe UI, sans-serif';
  const width = Math.min(opciones.maxWidth || 320, Math.ceil(ctx.measureText(texto).width) + (paddingX * 2));
  const finalText = textoEllipsisCanvasMatchmaking(ctx, texto, width - (paddingX * 2));
  dibujarRectRedondeadoMatchmaking(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = opciones.background || 'rgba(10, 15, 30, 0.78)';
  ctx.fill();
  ctx.strokeStyle = opciones.border || 'rgba(231, 236, 245, 0.24)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = opciones.color || '#e7ecf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(finalText, x + (width / 2), y + (height / 2) + 0.5);
  return width;
}

function dibujarCanchaBaseGifMatchmaking(ctx, layout) {
  const { x, y, width, height } = layout;
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  dibujarRectRedondeadoMatchmaking(ctx, x, y, width, height, 16);
  ctx.fillStyle = '#082413';
  ctx.fill();

  ctx.save();
  dibujarRectRedondeadoMatchmaking(ctx, x, y, width, height, 16);
  ctx.clip();
  ctx.strokeStyle = 'rgba(231, 236, 245, 0.23)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 8, y + 8, width - 16, height - 16);
  ctx.beginPath();
  ctx.moveTo(x + (width / 2), y + 8);
  ctx.lineTo(x + (width / 2), y + height - 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + (width / 2), y + (height / 2), 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(x + 8, y + (height * 0.28), 88, height * 0.44);
  ctx.strokeRect(x + width - 96, y + (height * 0.28), 88, height * 0.44);
  ctx.fillStyle = 'rgba(231, 236, 245, 0.34)';
  ctx.beginPath();
  ctx.arc(x + 92, y + (height / 2), 3, 0, Math.PI * 2);
  ctx.arc(x + width - 92, y + (height / 2), 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dibujarHeaderGifFormacionesMatchmaking(ctx, index, total, escenario1, escenario2) {
  ctx.fillStyle = '#e7ecf5';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 24px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillText('Armado de equipos', 32, 38);

  ctx.font = '800 13px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(231, 236, 245, 0.72)';
  ctx.fillText(`Escenario ${index + 1}/${total}`, 34, 61);

  const chipY = 26;
  const chip1 = `E1 ataja ${escenario1?.keeperName || '-'} · ${escenario1?.etiqueta || '-'}`;
  const chip2 = `E2 ataja ${escenario2?.keeperName || '-'} · ${escenario2?.etiqueta || '-'}`;
  const width1 = dibujarChipGifMatchmaking(ctx, chip1, 360, chipY, {
    border: colorRgbaMatchmaking(MATCHMAKING_TEAM_THEMES.equipo1.color, 0.68),
    color: '#e7ecf5',
    maxWidth: 260
  });
  dibujarChipGifMatchmaking(ctx, chip2, 360 + width1 + 10, chipY, {
    border: colorRgbaMatchmaking(MATCHMAKING_TEAM_THEMES.equipo2.color, 0.68),
    color: '#e7ecf5',
    maxWidth: 260
  });
}

function dibujarImagenCubriendoGifMatchmaking(ctx, image, x, y, width, height) {
  if (!image) return false;
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) return false;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const drawX = x + ((width - drawWidth) / 2);
  const drawY = y + ((height - drawHeight) / 2);
  try {
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    return true;
  } catch (error) {
    return false;
  }
}

function cargarImagenFotoJugadorMatchmaking(fotoUrl) {
  const url = normalizarUrlFotoJugadorMatchmaking(fotoUrl);
  if (!url) return Promise.resolve(null);
  if (imagenFotoJugadorMatchmakingCache.has(url)) return imagenFotoJugadorMatchmakingCache.get(url);

  const promesa = new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });

  imagenFotoJugadorMatchmakingCache.set(url, promesa);
  return promesa;
}

async function precargarFotosGifFormacionesMatchmaking(total) {
  const urls = new Set();
  for (let index = 0; index < total; index += 1) {
    ['equipo1', 'equipo2'].forEach(equipoKey => {
      const escenario = escenarioRotacionEquipoMatchmaking(equipoKey, index);
      (escenario?.markers || []).forEach(marker => {
        const url = obtenerFotoJugadorMatchmaking(marker.jugador);
        if (url) urls.add(url);
      });
    });
  }

  const entradas = await Promise.all([...urls].map(async url => [url, await cargarImagenFotoJugadorMatchmaking(url)]));
  return new Map(entradas);
}

function dibujarJugadorGifFormacionesMatchmaking(ctx, marker, layout, imagenes = new Map()) {
  const x = layout.x + ((numeroSeguroMatchmaking(marker?.x) / 100) * layout.width);
  const y = layout.y + ((numeroSeguroMatchmaking(marker?.y) / 100) * layout.height);
  const nombre = obtenerNombreJugadorMatchmaking(marker?.jugador);
  const color = marker?.isKeeper ? '#f6c453' : (marker?.color || '#e7ecf5');
  const fotoUrl = obtenerFotoJugadorMatchmaking(marker?.jugador);
  const image = fotoUrl ? imagenes.get(fotoUrl) : null;
  const radius = marker?.isKeeper ? 21 : 19;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = marker?.isKeeper ? 'rgba(246, 196, 83, 0.22)' : 'rgba(10, 15, 30, 0.94)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = marker?.isKeeper ? 4 : 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
  ctx.clip();
  const drewImage = dibujarImagenCubriendoGifMatchmaking(ctx, image, x - radius + 3, y - radius + 3, (radius - 3) * 2, (radius - 3) * 2);
  if (!drewImage) {
    ctx.fillStyle = marker?.isKeeper ? '#fff8db' : '#ffffff';
    ctx.font = '900 13px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(inicialesJugadorMatchmaking(nombre), x, y + 0.5);
  }
  ctx.restore();
  ctx.restore();

  ctx.font = '800 12px system-ui, -apple-system, Segoe UI, sans-serif';
  const texto = textoEllipsisCanvasMatchmaking(ctx, nombre, 92);
  const width = Math.ceil(ctx.measureText(texto).width) + 14;
  const labelX = x - (width / 2);
  const labelY = y + radius + 6;
  dibujarRectRedondeadoMatchmaking(ctx, labelX, labelY, width, 22, 6);
  ctx.fillStyle = 'rgba(10, 15, 30, 0.82)';
  ctx.fill();
  ctx.fillStyle = '#e7ecf5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, labelY + 11);
}

function renderizarFrameGifFormacionesMatchmaking(index, total, imagenes = new Map()) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No se pudo preparar el canvas del GIF.');
  const escenario1 = escenarioRotacionEquipoMatchmaking('equipo1', index);
  const escenario2 = escenarioRotacionEquipoMatchmaking('equipo2', index);
  const layout = { x: 30, y: 76, width: 900, height: 450 };

  dibujarCanchaBaseGifMatchmaking(ctx, layout);
  dibujarHeaderGifFormacionesMatchmaking(ctx, index, total, escenario1, escenario2);
  dibujarChipGifMatchmaking(ctx, 'Equipo 1', layout.x + 14, layout.y + 14, {
    border: colorRgbaMatchmaking(MATCHMAKING_TEAM_THEMES.equipo1.color, 0.7),
    color: MATCHMAKING_TEAM_THEMES.equipo1.color,
    maxWidth: 110
  });
  dibujarChipGifMatchmaking(ctx, 'Equipo 2', layout.x + layout.width - 104, layout.y + 14, {
    border: colorRgbaMatchmaking(MATCHMAKING_TEAM_THEMES.equipo2.color, 0.7),
    color: MATCHMAKING_TEAM_THEMES.equipo2.color,
    maxWidth: 110
  });

  const markers = [
    ...(escenario1?.markers || []),
    ...(escenario2?.markers || [])
  ].sort((a, b) => Number(Boolean(a.isKeeper)) - Number(Boolean(b.isKeeper)));
  markers.forEach(marker => dibujarJugadorGifFormacionesMatchmaking(ctx, marker, layout, imagenes));
  return canvas;
}

function indicePaletaGifMatchmaking(r, g, b) {
  return ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
}

function crearPaletaGifMatchmaking() {
  const palette = [];
  for (let r = 0; r < 8; r += 1) {
    for (let g = 0; g < 8; g += 1) {
      for (let b = 0; b < 4; b += 1) {
        palette.push(Math.round((r / 7) * 255), Math.round((g / 7) * 255), Math.round((b / 3) * 255));
      }
    }
  }
  return palette;
}

function crearPaletaEnteraGifMatchmaking() {
  const palette = [];
  for (let r = 0; r < 8; r += 1) {
    for (let g = 0; g < 8; g += 1) {
      for (let b = 0; b < 4; b += 1) {
        const rr = Math.round((r / 7) * 255);
        const gg = Math.round((g / 7) * 255);
        const bb = Math.round((b / 3) * 255);
        palette.push((rr << 16) | (gg << 8) | bb);
      }
    }
  }
  return palette;
}

function bytesTextoGifMatchmaking(texto) {
  return Array.from(String(texto), char => char.charCodeAt(0) & 255);
}

function escribirShortGifMatchmaking(bytes, valor) {
  bytes.push(valor & 255, (valor >> 8) & 255);
}

function comprimirLzwGifMatchmaking(indices, minCodeSize = 8) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minCodeSize + 1;
  const dict = new Map();
  const output = [];
  let bitBuffer = 0;
  let bitCount = 0;

  function writeCode(code) {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  function resetDict() {
    dict.clear();
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  }

  function codeFor(sequence) {
    return sequence.indexOf(',') === -1 ? Number(sequence) : dict.get(sequence);
  }

  resetDict();
  writeCode(clearCode);
  let prefix = String(indices[0] || 0);

  for (let i = 1; i < indices.length; i += 1) {
    const current = indices[i];
    const sequence = `${prefix},${current}`;
    if (dict.has(sequence)) {
      prefix = sequence;
      continue;
    }

    writeCode(codeFor(prefix));
    if (nextCode < 4096) {
      dict.set(sequence, nextCode);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      writeCode(clearCode);
      resetDict();
    }
    prefix = String(current);
  }

  writeCode(codeFor(prefix));
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 255);
  return output;
}

function indicesCanvasGifMatchmaking(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const indices = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    indices[p] = indicePaletaGifMatchmaking(data[i], data[i + 1], data[i + 2]);
  }
  return indices;
}

function escribirBloquesGifMatchmaking(bytes, data) {
  for (let i = 0; i < data.length; i += 255) {
    const chunk = data.slice(i, i + 255);
    bytes.push(chunk.length, ...chunk);
  }
  bytes.push(0);
}

function crearGifAnimadoMatchmaking(canvases, delayMs = MATCHMAKING_KEEPER_ROTATION.intervalMs) {
  if (!canvases.length) throw new Error('No hay frames para exportar.');
  const GifWriterCtor = typeof GifWriter === 'function'
    ? GifWriter
    : (window.GifWriter || globalThis.GifWriter);
  if (typeof GifWriterCtor !== 'function') {
    throw new Error('No se pudo cargar el generador de GIF.');
  }

  const width = canvases[0].width;
  const height = canvases[0].height;
  const palette = crearPaletaEnteraGifMatchmaking();
  const delayCs = Math.max(4, Math.round(delayMs / 10));
  const maxSize = (width * height * canvases.length * 3) + 65536;
  const buffer = new Uint8Array(maxSize);
  const writer = new GifWriterCtor(buffer, width, height, { loop: 0, palette });

  canvases.forEach(canvas => {
    writer.addFrame(0, 0, width, height, indicesCanvasGifMatchmaking(canvas), {
      delay: delayCs,
      disposal: 2
    });
  });

  const length = writer.end();
  return new Blob([buffer.slice(0, length)], { type: 'image/gif' });
}

window.exportarGifFormacionesMatchmaking = async function() {
  const total = totalEscenariosRotacionArqueroMatchmaking();
  if (total <= 0) {
    mostrarToastMatchmaking('No hay escenarios para exportar.', 'warning');
    return;
  }

  try {
    setEstadoExportGifFormacionesMatchmaking(true);
    mostrarToastMatchmaking('Generando GIF de formaciones...', 'info');
    await new Promise(resolve => window.setTimeout(resolve, 20));
    const imagenes = await precargarFotosGifFormacionesMatchmaking(total);
    const frames = Array.from({ length: total }, (_, index) => renderizarFrameGifFormacionesMatchmaking(index, total, imagenes));
    const blob = crearGifAnimadoMatchmaking(frames);
    descargarBlobMatchmaking(blob, nombreArchivoGifFormacionesMatchmaking());
    mostrarToastMatchmaking('GIF descargado.', 'success');
  } catch (error) {
    console.error('Error exportando GIF de formaciones:', error);
    mostrarToastMatchmaking(`No se pudo exportar el GIF: ${error.message || error}`, 'error');
  } finally {
    setEstadoExportGifFormacionesMatchmaking(false);
  }
};

function obtenerResultadoCompartibleMatchmaking() {
  return resultadoLiveMatchmaking || window.ultimoResultadoGenetico || null;
}

function crearReferenciaJugadorShareMatchmaking(jugador = {}) {
  return {
    id: obtenerIdJugadorMatchmaking(jugador),
    nombre: obtenerNombreJugadorMatchmaking(jugador),
    rolPartido: normalizarRolPartido(jugador.rolPartido)
  };
}

function descripcionEquipoShareMatchmaking(jugadores = []) {
  return jugadores
    .map(jugador => obtenerNombreJugadorMatchmaking(jugador))
    .filter(Boolean)
    .slice(0, 5)
    .join(', ');
}

function crearPayloadShareMatchmaking(resultado) {
  const equipo1 = resultado?.equipo1?.jugadores || [];
  const equipo2 = resultado?.equipo2?.jugadores || [];
  const seleccionados = jugadoresSeleccionados.map(jugador => ({
    id: jugador.id,
    nombre: jugador.nombre,
    rolPartido: normalizarRolPartido(jugador.rolPartido)
  }));

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    selectedPlayers: seleccionados,
    teams: {
      equipo1: equipo1.map(crearReferenciaJugadorShareMatchmaking),
      equipo2: equipo2.map(crearReferenciaJugadorShareMatchmaking)
    },
    config: obtenerConfiguracionRendimientoMatchmaking(),
    restrictions: obtenerRestricciones()
  };
}

async function generarPreviewPngAutoarmadoMatchmaking(resultado) {
  if (!resultado?.equipo1?.jugadores?.length || !resultado?.equipo2?.jugadores?.length) {
    throw new Error('No hay equipos para generar la imagen.');
  }

  renderizarCanchaLiveMatchmaking(resultado);
  const total = Math.max(totalEscenariosRotacionArqueroMatchmaking(), 1);
  const imagenes = await precargarFotosGifFormacionesMatchmaking(total);
  const canvas = renderizarFrameGifFormacionesMatchmaking(0, total, imagenes);
  return canvas.toDataURL('image/png');
}

function setEstadoCompartirMatchmaking(compartiendo) {
  const button = document.getElementById('btn-compartir-auto-equipos');
  if (!button) return;
  button.disabled = Boolean(compartiendo) || !obtenerResultadoCompartibleMatchmaking();
  button.innerHTML = compartiendo
    ? '<i class="bi bi-hourglass-split me-2"></i>Compartiendo...'
    : '<i class="bi bi-share me-2"></i>Compartir link';
}

function setFeedbackCompartirMatchmaking(html = '') {
  const feedback = document.getElementById('matchmaking-share-feedback');
  if (feedback) feedback.innerHTML = html || '&nbsp;';
}

async function obtenerSesionParaCompartirMatchmaking() {
  if (!window.supabase?.auth?.getSession) return null;
  const { data, error } = await window.supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

async function copiarLinkCompartidoMatchmaking(url) {
  if (!url) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }
  } catch (error) {
    console.warn('[matchmaking] no se pudo copiar al portapapeles:', error?.message || error);
  }
  return false;
}

window.compartirAutoarmadoMatchmaking = async function() {
  const resultado = obtenerResultadoCompartibleMatchmaking();
  if (!resultado || jugadoresSeleccionados.length < 10) {
    mostrarToastMatchmaking('Completa el autoarmado antes de compartir.', 'warning');
    return;
  }

  try {
    setEstadoCompartirMatchmaking(true);
    setFeedbackCompartirMatchmaking('Generando imagen y link...');

    const session = await obtenerSesionParaCompartirMatchmaking();
    if (!session?.access_token) {
      window.verificarPermisosAdmin?.('compartir autoarmados');
      throw new Error('Tenes que iniciar sesion para crear links compartibles.');
    }

    const previewImageBase64 = await generarPreviewPngAutoarmadoMatchmaking(resultado);
    const payload = crearPayloadShareMatchmaking(resultado);
    const equipo1Texto = descripcionEquipoShareMatchmaking(resultado.equipo1.jugadores);
    const equipo2Texto = descripcionEquipoShareMatchmaking(resultado.equipo2.jugadores);
    const response = await fetch(`${window.SUPABASE_URL}/functions/v1/team-share`, {
      method: 'POST',
      headers: {
        apikey: window.SUPABASE_ANON_KEY,
        authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        payload,
        previewImageBase64,
        ttlDays: 7,
        title: 'Autoarmado T5 Papi Academy',
        description: `E1: ${equipo1Texto} vs E2: ${equipo2Texto}`
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo crear el link compartible.');
    }

    const copiado = await copiarLinkCompartidoMatchmaking(data.shareUrl);
    setFeedbackCompartirMatchmaking(`
      <span class="text-success">${copiado ? 'Link copiado.' : 'Link creado.'}</span>
      <a class="link-info ms-2" href="${escaparHtmlMatchmaking(data.shareUrl)}" target="_blank" rel="noopener">${escaparHtmlMatchmaking(data.shareUrl)}</a>
    `);
    mostrarToastMatchmaking(copiado ? 'Link copiado al portapapeles.' : 'Link compartible creado.', 'success');
  } catch (error) {
    console.error('Error compartiendo autoarmado:', error);
    setFeedbackCompartirMatchmaking(`<span class="text-warning">${escaparHtmlMatchmaking(error.message || 'No se pudo compartir.')}</span>`);
    mostrarToastMatchmaking(error.message || 'No se pudo compartir el autoarmado.', 'error');
  } finally {
    setEstadoCompartirMatchmaking(false);
    validarEjecucion();
  }
};

function renderizarCanchaLiveMatchmaking(resultado) {
  const canchaEquipo1 = prepararMarcadoresLiveEquipoMatchmaking(resultado?.equipo1?.jugadores || [], 'equipo1');
  const canchaEquipo2 = prepararMarcadoresLiveEquipoMatchmaking(resultado?.equipo2?.jugadores || [], 'equipo2');
  rotacionArqueroCanchaMatchmaking.escenarios = {
    equipo1: canchaEquipo1.escenarios || [],
    equipo2: canchaEquipo2.escenarios || []
  };
  rotacionArqueroCanchaMatchmaking.index = 0;
  rotacionArqueroCanchaMatchmaking.manualPaused = false;
  rotacionArqueroCanchaMatchmaking.hoverPaused = false;
  const marcadores = [
    ...(canchaEquipo1.marcadores || []),
    ...(canchaEquipo2.marcadores || [])
  ];
  const sinTracking = obtenerJugadoresSinTrackingCanchaLiveMatchmaking(resultado);
  const totalEscenarios = Math.max(canchaEquipo1.escenarios?.length || 0, canchaEquipo2.escenarios?.length || 0);

  return `
    <section
      class="matchmaking-live-pitch"
      aria-label="Cancha del armado automatico"
      data-matchmaking-keeper-pitch
    >
      <div class="matchmaking-live-pitch__inner">
        <svg viewBox="0 0 720 360" aria-hidden="true">
          <g stroke="rgba(231,236,245,0.24)" fill="none" stroke-width="1.2">
            <rect x="6" y="6" width="708" height="348" rx="8"></rect>
            <line x1="360" y1="6" x2="360" y2="354"></line>
            <circle cx="360" cy="180" r="42"></circle>
            <rect x="6" y="105" width="70" height="150"></rect>
            <rect x="644" y="105" width="70" height="150"></rect>
            <circle cx="72" cy="180" r="2"></circle>
            <circle cx="648" cy="180" r="2"></circle>
          </g>
        </svg>
        <span class="matchmaking-live-tag is-team-1">Equipo 1</span>
        <span class="matchmaking-live-tag is-team-2">Equipo 2</span>
        <div
          class="matchmaking-keeper-cycle"
          onmouseenter="setHoverRotacionArqueroMatchmaking(true)"
          onmouseleave="setHoverRotacionArqueroMatchmaking(false)"
        >
          <div class="matchmaking-keeper-cycle__teams">
            <span style="--team-color:${MATCHMAKING_TEAM_THEMES.equipo1.color};">
              E1 ataja <b data-keeper-name="equipo1">${escaparHtmlMatchmaking(canchaEquipo1.arquero || '-')}</b>
              <em data-keeper-formation="equipo1">${escaparHtmlMatchmaking(canchaEquipo1.formacion || '-')}</em>
            </span>
            <span style="--team-color:${MATCHMAKING_TEAM_THEMES.equipo2.color};">
              E2 ataja <b data-keeper-name="equipo2">${escaparHtmlMatchmaking(canchaEquipo2.arquero || '-')}</b>
              <em data-keeper-formation="equipo2">${escaparHtmlMatchmaking(canchaEquipo2.formacion || '-')}</em>
            </span>
          </div>
          <div class="matchmaking-keeper-cycle__controls">
            <span class="matchmaking-keeper-cycle__step" data-keeper-scenario>${totalEscenarios ? `1/${totalEscenarios}` : '0/0'}</span>
            <div class="matchmaking-keeper-cycle__dots">
              ${Array.from({ length: totalEscenarios }, (_, index) => `
                <button
                  type="button"
                  data-keeper-dot="${index}"
                  class="${index === 0 ? 'is-active' : ''}"
                  aria-label="Ver escenario ${index + 1}"
                  onclick="seleccionarEscenarioArqueroMatchmaking(${index})"
                ></button>
              `).join('')}
            </div>
            <button type="button" class="matchmaking-keeper-cycle__toggle" data-keeper-rotation-toggle onclick="toggleRotacionArqueroMatchmaking()" aria-label="Pausar rotacion de arqueros">
              <i class="bi bi-pause-fill"></i>
            </button>
            <button type="button" class="matchmaking-keeper-cycle__export" data-keeper-gif-export onclick="exportarGifFormacionesMatchmaking()" aria-label="Exportar GIF de formaciones">
              <span>GIF</span><i class="bi bi-download"></i>
            </button>
          </div>
        </div>
        ${marcadores.map(marker => {
          const nombreJugador = obtenerNombreJugadorMatchmaking(marker.jugador);
          const fotoUrl = obtenerFotoJugadorMatchmaking(marker.jugador);
          const fotoHtml = fotoUrl
            ? `<img src="${escaparHtmlMatchmaking(fotoUrl)}" alt="${escaparHtmlMatchmaking(nombreJugador)}" loading="lazy" onerror="const disc=this.closest('.matchmaking-live-marker__disc'); if(disc) disc.classList.remove('has-photo'); this.remove();">`
            : '';
          return `
          <div
            class="matchmaking-live-marker${marker.isFallback ? ' is-fallback' : ''}${marker.isKeeper ? ' is-keeper' : ''}"
            data-marker-team="${escaparHtmlMatchmaking(marker.teamKey || '')}"
            data-player-key="${escaparHtmlMatchmaking(claveJugadorCanchaLiveMatchmaking(marker.jugador))}"
            style="--marker-x:${marker.x.toFixed(1)}%; --marker-y:${marker.y.toFixed(1)}%; --team-color:${marker.color};"
            title="${escaparHtmlMatchmaking(nombreJugador)} - ${marker.isKeeper ? 'ataja' : `capa ${escaparHtmlMatchmaking(marker.formation || '')}`} - posicion ${escaparHtmlMatchmaking(marker.source)}${marker.hasCollisionOffset ? ' - separado para evitar overlap' : ''}"
          >
            <span class="matchmaking-live-marker__disc${fotoUrl ? ' has-photo' : ''}">
              ${fotoHtml}
              <span class="matchmaking-live-marker__initials">${escaparHtmlMatchmaking(inicialesJugadorMatchmaking(nombreJugador))}</span>
            </span>
            <span class="matchmaking-live-marker__name">${escaparHtmlMatchmaking(nombreJugador)}</span>
          </div>
        `;
        }).join('')}
      </div>
      ${sinTracking.length ? `
        <div class="matchmaking-live-untracked">
          <span>Sin tracking ni etiqueta para ubicar:</span>
          ${sinTracking.map(jugador => `<b>${escaparHtmlMatchmaking(jugador.nombre)}</b>`).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderizarPreviewLiveMatchmaking(resultado, asignacionAnterior = {}, motivo = '') {
  const container = document.getElementById('matchmaking-live-preview');
  const feedback = document.getElementById('matchmaking-live-feedback');
  if (!container) return;

  if (!resultado) {
    container.innerHTML = '';
    if (feedback) feedback.innerHTML = '&nbsp;';
    detenerRotacionArqueroMatchmaking();
    return;
  }

  if (
    seleccionIntercambioMatchmaking?.scope === 'live' &&
    !obtenerJugadorResultadoIntercambioMatchmaking(
      resultado,
      seleccionIntercambioMatchmaking.equipoKey,
      seleccionIntercambioMatchmaking.index
    )
  ) {
    seleccionIntercambioMatchmaking = null;
  }

  const totalJugadores = jugadoresSeleccionados.length;
  const faltan = Math.max(10 - totalJugadores, 0);
  const asignacionActual = resultado.matchmakingLive?.asignacion || {};
  const movimientos = obtenerMovimientosLiveMatchmaking(asignacionAnterior, asignacionActual);
  const maxImpacto = maxImpactoJugadoresMatchmaking(resultado);
  const jugadorClave = obtenerJugadorClaveMatchmaking(resultado);
  const estado = totalJugadores >= 10
    ? 'Listo para aplicar'
    : `Faltan ${faltan} jugador${faltan === 1 ? '' : 'es'}`;

  if (feedback) {
    const agregado = ultimoNombreAgregadoLive && motivo === 'alta'
      ? `<b>${escaparHtmlMatchmaking(ultimoNombreAgregadoLive)}</b> agregado`
      : '';
    const rebalanceo = movimientos.length
      ? `Rebalanceo: ${movimientos.map(escaparHtmlMatchmaking).join(', ')}`
      : '';
    feedback.innerHTML = [agregado, rebalanceo].filter(Boolean).join(' - ') || '&nbsp;';
  }

  container.innerHTML = `
    <div class="matchmaking-balance-root">
      <div class="matchmaking-balance-wrap">
        <div class="matchmaking-live-status">
          <span><strong>${totalJugadores}/10</strong> jugadores</span>
          <span>${estado}</span>
          <span>Fitness ${numeroSeguroMatchmaking(resultado.fitness).toFixed(2)}</span>
        </div>
        ${renderizarEstadoIntercambioMatchmaking(resultado, 'live')}
        ${renderizarBalanzaMatchmaking(resultado)}
        ${renderizarCanchaLiveMatchmaking(resultado)}
        <div class="matchmaking-teams-grid">
          ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo1', { maxImpacto, jugadorClave, contextoIntercambio: 'live' })}
          ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo2', { maxImpacto, jugadorClave, contextoIntercambio: 'live' })}
        </div>
        ${renderizarHitosPartidoMatchmaking(resultado)}
      </div>
    </div>
  `;
  iniciarRotacionArqueroMatchmaking();
}

async function recalcularAutoEquiposLive(motivo = '') {
  const version = ++recalculoLiveVersion;
  poblarOpcionesJugadoresMatchmaking();
  validarEjecucion();

  const container = document.getElementById('matchmaking-live-preview');
  const feedback = document.getElementById('matchmaking-live-feedback');
  if (!container) return;

  if (jugadoresSeleccionados.length === 0) {
    resultadoLiveMatchmaking = null;
    window.ultimoResultadoGenetico = null;
    container.innerHTML = '';
    if (feedback) feedback.innerHTML = '&nbsp;';
    return;
  }

  if (feedback) feedback.textContent = 'Calculando balance...';

  try {
    const configuracion = obtenerConfiguracionRendimientoMatchmaking();
    const restricciones = obtenerRestricciones();
    const asignacionAnterior = { ...asignacionLiveAnterior };
    const datos = await prepararDatosLiveMatchmaking(configuracion);
    if (version !== recalculoLiveVersion) return;

    const optimizado = optimizarEquiposExactoLiveMatchmaking(datos, restricciones, asignacionAnterior);
    const resultado = optimizado.resultado;
    resultado.configuracionRendimiento = configuracion;
    resultadoLiveMatchmaking = resultado;
    window.ultimoResultadoGenetico = resultado;
    asignacionLiveAnterior = optimizado.asignacion;

    renderizarPreviewLiveMatchmaking(resultado, asignacionAnterior, motivo);
    validarEjecucion();
  } catch (error) {
    console.error('Error recalculando auto equipos live:', error);
    resultadoLiveMatchmaking = null;
    window.ultimoResultadoGenetico = null;
    container.innerHTML = `
      <div class="alert alert-warning mb-0">
        <i class="bi bi-exclamation-triangle me-2"></i>
        ${escaparHtmlMatchmaking(error.message || 'No se pudo recalcular el armado')}
      </div>
    `;
    if (feedback) feedback.innerHTML = '&nbsp;';
    validarEjecucion();
  }
}

window.actualizarModoRendimientoMatchmaking = function() {
  const configuracion = obtenerConfiguracionRendimientoMatchmaking();
  modoRendimientoMatchmaking = configuracion.modo;
  partidosRecientesMatchmaking = configuracion.partidos;

  const inputPartidos = document.getElementById('input-partidos-recientes-matchmaking');
  if (inputPartidos && String(inputPartidos.value) !== String(configuracion.partidos)) {
    inputPartidos.value = configuracion.partidos;
  }

  const recientesConfig = document.getElementById('recent-performance-settings');
  if (recientesConfig) {
    recientesConfig.classList.toggle('d-none', configuracion.modo !== MODO_RENDIMIENTO_RECIENTE);
  }

  const ayuda = document.getElementById('performance-mode-help');
  if (ayuda) {
    ayuda.textContent = configuracion.modo === MODO_RENDIMIENTO_RECIENTE
      ? `El balance usa las últimas ${configuracion.partidos} apariciones de cada jugador${configuracion.temporadaId ? ' en la temporada activa' : ''}.`
      : 'El balance usa las estadísticas históricas/temporada que ya ves en la tabla.';
  }
  recalcularAutoEquiposLive('modo');
};

function obtenerEquipoGolEnPartidoMatchmaking(gol, jugadoresPartido = []) {
  if (gol?.equipo === 1 || gol?.equipo === 2) {
    return gol.equipo;
  }

  const goleadorEnPartido = jugadoresPartido.find(jp => jp.jugador_id === gol?.goleador_id);
  if (!goleadorEnPartido || (goleadorEnPartido.equipo !== 1 && goleadorEnPartido.equipo !== 2)) {
    return null;
  }

  if (gol?.es_gol_en_contra) {
    return goleadorEnPartido.equipo === 1 ? 2 : 1;
  }

  return goleadorEnPartido.equipo;
}

function esErrorColumnaFaltanteMatchmaking(error, columna) {
  const mensaje = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code
  ].filter(Boolean).join(' ').toLowerCase();
  return mensaje.includes(String(columna).toLowerCase());
}

function construirSelectPartidosMomentosMatchmaking({ incluirArquero = true, incluirReview = true, incluirCagada = true } = {}) {
  const columnasGol = [
    'id',
    'goleador_id',
    'equipo',
    'es_gol_en_contra',
    'minuto'
  ];

  if (incluirCagada) columnasGol.push('cagada_jugador_id');
  if (incluirArquero) columnasGol.push('arquero_id');
  if (incluirReview) columnasGol.push('review_segundos');

  return `
    id,
    fecha,
    temporada_id,
    equipo_ganador,
    jugador_partido (
      jugador_id,
      equipo,
      cagadas
    ),
    goles (
      ${columnasGol.join(',\n      ')}
    )
  `;
}

async function consultarPartidosMomentosMatchmaking(temporadaId = '', opciones = {}) {
  const incluirArquero = opciones.incluirArquero !== false;
  const incluirReview = opciones.incluirReview !== false;
  const incluirCagada = opciones.incluirCagada !== false;

  let query = window.supabase
    .from('partidos')
    .select(construirSelectPartidosMomentosMatchmaking({ incluirArquero, incluirReview, incluirCagada }))
    .order('fecha', { ascending: true })
    .order('id', { ascending: true });

  if (temporadaId) {
    query = query.eq('temporada_id', temporadaId);
  }

  const resultado = await query;
  if (!resultado.error) return { partidos: resultado.data || [], incluyeArquero: incluirArquero };

  if (incluirCagada && esErrorColumnaFaltanteMatchmaking(resultado.error, 'cagada_jugador_id')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero, incluirReview, incluirCagada: false });
  }

  if (incluirArquero && esErrorColumnaFaltanteMatchmaking(resultado.error, 'arquero_id')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero: false, incluirReview, incluirCagada });
  }

  if (incluirReview && esErrorColumnaFaltanteMatchmaking(resultado.error, 'review_segundos')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero, incluirReview: false, incluirCagada });
  }

  throw resultado.error;
}

function obtenerMinutoGolMatchmaking(gol) {
  const minuto = numeroFinitoMatchmaking(gol?.minuto);
  if (minuto !== null && minuto >= 0) return minuto;

  const reviewSegundos = numeroFinitoMatchmaking(gol?.review_segundos);
  return reviewSegundos !== null && reviewSegundos >= 0 ? reviewSegundos / 60 : null;
}

function crearDinamicaMatchmakingVacia() {
  return {
    partidos: 0,
    arrancoPerdiendo: 0,
    remontadasGanadas: 0,
    empatesDesdePerdiendo: 0,
    cagadas: 0
  };
}

function crearResumenJugadorMomentosMatchmaking() {
  return {
    convertidos: [],
    recibidosArquero: [],
    versus: new Map(),
    juntos: new Map(),
    dinamica: crearDinamicaMatchmakingVacia(),
    rachaActual: {
      tipo: null,
      cantidad: 0
    }
  };
}

function actualizarRachaActualJugadorMatchmaking(resumen, resultado) {
  if (!resumen) return;
  if (resultado !== 'win' && resultado !== 'defeat') {
    resumen.rachaActual = { tipo: null, cantidad: 0 };
    return;
  }

  if (resumen.rachaActual.tipo === resultado) {
    resumen.rachaActual.cantidad += 1;
    return;
  }

  resumen.rachaActual = {
    tipo: resultado,
    cantidad: 1
  };
}

function asegurarRelacionMatchmaking(mapa, jugadorId) {
  const key = String(jugadorId || '');
  if (!key) return null;
  if (!mapa.has(key)) {
    mapa.set(key, {
      pj: 0,
      victorias: 0,
      empates: 0,
      derrotas: 0,
      rachaVictoriasActual: 0,
      mejorRachaVictorias: 0
    });
  }
  return mapa.get(key);
}

function asegurarVersusMatchmaking(resumenJugador, rivalId) {
  return asegurarRelacionMatchmaking(resumenJugador.versus, rivalId);
}

function asegurarJuntosMatchmaking(resumenJugador, companeroId) {
  return asegurarRelacionMatchmaking(resumenJugador.juntos, companeroId);
}

function convertirVersusMatchmaking(versus = new Map()) {
  const salida = {};
  versus.forEach((stat, rivalId) => {
    const pj = Number(stat.pj) || 0;
    salida[rivalId] = {
      ...stat,
      winrate: pj > 0 ? ((Number(stat.victorias) || 0) / pj) * 100 : 0
    };
  });
  return salida;
}

function obtenerEventosGolOrdenadosPartidoMatchmaking(partido) {
  const jugadoresPartido = partido?.jugador_partido || [];
  return (partido?.goles || [])
    .map(gol => ({
      gol,
      equipo: obtenerEquipoGolEnPartidoMatchmaking(gol, jugadoresPartido),
      minuto: obtenerMinutoGolMatchmaking(gol)
    }))
    .filter(evento => evento.equipo === 1 || evento.equipo === 2)
    .sort((a, b) => {
      const minutoA = a.minuto === null ? Number.POSITIVE_INFINITY : a.minuto;
      const minutoB = b.minuto === null ? Number.POSITIVE_INFINITY : b.minuto;
      if (minutoA !== minutoB) return minutoA - minutoB;
      return String(a.gol?.id || '').localeCompare(String(b.gol?.id || ''));
    });
}

function calcularCagadasJugadorPartidoMatchmaking(partido, jugadorPartido) {
  const cagadasJugadorPartido = Number(jugadorPartido?.cagadas) || 0;
  const cagadasDesdeGoles = (partido?.goles || [])
    .filter(gol => String(gol?.cagada_jugador_id || '') === String(jugadorPartido?.jugador_id || ''))
    .length;

  if (cagadasJugadorPartido > 0 && cagadasDesdeGoles > 0) {
    return Math.max(cagadasJugadorPartido, cagadasDesdeGoles);
  }

  return cagadasJugadorPartido + cagadasDesdeGoles;
}

async function enriquecerJugadoresConMomentosMatchmaking(jugadores, temporadaId = '') {
  if (!window.supabase || !Array.isArray(jugadores) || jugadores.length === 0) {
    return jugadores;
  }

  const idsSeleccionados = new Set(
    jugadores
      .map(jugador => obtenerIdJugadorMatchmaking(jugador))
      .filter(Boolean)
      .map(id => String(id))
  );

  if (idsSeleccionados.size === 0) return jugadores;

  try {
    const { partidos, incluyeArquero } = await consultarPartidosMomentosMatchmaking(temporadaId);
    const momentosPorJugador = new Map();

    idsSeleccionados.forEach(id => {
      momentosPorJugador.set(id, crearResumenJugadorMomentosMatchmaking());
    });

    (partidos || []).forEach(partido => {
      const jugadoresPartido = partido.jugador_partido || [];
      const seleccionadosPartido = jugadoresPartido.filter(jp => (
        idsSeleccionados.has(String(jp.jugador_id || ''))
        && (Number(jp.equipo) === 1 || Number(jp.equipo) === 2)
      ));
      const golesOrdenados = obtenerEventosGolOrdenadosPartidoMatchmaking(partido);
      const primerEquipoGol = golesOrdenados[0]?.equipo || null;
      const equipoGanador = Number(partido.equipo_ganador);

      seleccionadosPartido.forEach(jp => {
        const jugadorId = String(jp.jugador_id || '');
        const resumen = momentosPorJugador.get(jugadorId);
        if (!resumen) return;

        const equipoJugador = Number(jp.equipo);
        resumen.dinamica.partidos += 1;
        resumen.dinamica.cagadas += calcularCagadasJugadorPartidoMatchmaking(partido, jp);

        if (equipoGanador === equipoJugador) {
          actualizarRachaActualJugadorMatchmaking(resumen, 'win');
        } else if (equipoGanador === 1 || equipoGanador === 2) {
          actualizarRachaActualJugadorMatchmaking(resumen, 'defeat');
        } else {
          actualizarRachaActualJugadorMatchmaking(resumen, 'draw');
        }

        if (primerEquipoGol && primerEquipoGol !== equipoJugador) {
          resumen.dinamica.arrancoPerdiendo += 1;
          if (equipoGanador === equipoJugador) {
            resumen.dinamica.remontadasGanadas += 1;
          } else if (!equipoGanador) {
            resumen.dinamica.empatesDesdePerdiendo += 1;
          }
        }
      });

      seleccionadosPartido.forEach(jugador => {
        seleccionadosPartido.forEach(rival => {
          if (String(jugador.jugador_id) === String(rival.jugador_id)) return;

          const resumen = momentosPorJugador.get(String(jugador.jugador_id));
          if (!resumen) return;

          const mismoEquipo = Number(jugador.equipo) === Number(rival.equipo);
          const stat = mismoEquipo
            ? asegurarJuntosMatchmaking(resumen, rival.jugador_id)
            : asegurarVersusMatchmaking(resumen, rival.jugador_id);
          if (!stat) return;

          stat.pj += 1;
          if (equipoGanador === Number(jugador.equipo)) {
            stat.victorias += 1;
            stat.rachaVictoriasActual = (Number(stat.rachaVictoriasActual) || 0) + 1;
            stat.mejorRachaVictorias = Math.max(Number(stat.mejorRachaVictorias) || 0, stat.rachaVictoriasActual);
          } else if (!equipoGanador) {
            stat.empates += 1;
            stat.rachaVictoriasActual = 0;
          } else {
            stat.derrotas += 1;
            stat.rachaVictoriasActual = 0;
          }
        });
      });

      (partido.goles || []).forEach(gol => {
        const minuto = obtenerMinutoGolMatchmaking(gol);
        const segundos = minuto === null ? null : Math.round(minuto * 60);
        const base = {
          partido_id: partido.id,
          fecha: partido.fecha || null,
          minuto,
          segundos,
          goleador_id: gol.goleador_id || null,
          arquero_id: incluyeArquero ? (gol.arquero_id || null) : null
        };

        if (!gol.es_gol_en_contra && gol.goleador_id && idsSeleccionados.has(String(gol.goleador_id))) {
          momentosPorJugador.get(String(gol.goleador_id))?.convertidos.push(base);
        }

        if (!gol.es_gol_en_contra && incluyeArquero && gol.arquero_id && idsSeleccionados.has(String(gol.arquero_id))) {
          momentosPorJugador.get(String(gol.arquero_id))?.recibidosArquero.push(base);
        }
      });
    });

    return jugadores.map(jugador => {
      const id = obtenerIdJugadorMatchmaking(jugador);
      const momentos = id ? momentosPorJugador.get(String(id)) : null;
      if (!momentos) return jugador;

      return {
        ...jugador,
        momentosGolesMatchmaking: momentos.convertidos,
        momentosGolesRecibidosArqueroMatchmaking: momentos.recibidosArquero,
        matchmakingVersus: convertirVersusMatchmaking(momentos.versus),
        matchmakingJuntos: convertirVersusMatchmaking(momentos.juntos),
        matchmakingDinamica: momentos.dinamica,
        rachaActualMatchmaking: momentos.rachaActual.cantidad >= 2 ? momentos.rachaActual : { tipo: null, cantidad: 0 }
      };
    });
  } catch (error) {
    console.warn('No se pudieron cargar momentos historicos para matchmaking:', error);
    return jugadores;
  }
}

function crearStatsRecientesBase(jugadorSeleccionado, cantidadPartidos) {
  return {
    ...jugadorSeleccionado.data,
    jugador_id: jugadorSeleccionado.id,
    nombre: jugadorSeleccionado.nombre,
    jugadores: jugadorSeleccionado.data.jugadores || {
      id: jugadorSeleccionado.id,
      nombre: jugadorSeleccionado.nombre
    },
    rolPartido: jugadorSeleccionado.rolPartido,
    historicoMatchmaking: {
      ...jugadorSeleccionado.data,
      rolPartido: jugadorSeleccionado.rolPartido,
      rol_matchmaking: jugadorSeleccionado.rolPartido
    },
    pj: 0,
    pg: 0,
    pe: 0,
    pp: 0,
    total_puntos: 0,
    goles: 0,
    goles_en_contra: 0,
    asistencias: 0,
    cagadas_en_gol: 0,
    mvp_count: 0,
    ace_count: 0,
    atajadas: 0,
    goles_favor_equipo: 0,
    goles_recibidos_equipo: 0,
    winrate: 0,
    origenRendimiento: MODO_RENDIMIENTO_RECIENTE,
    partidosRecientesSolicitados: cantidadPartidos,
    partidosRecientesUsados: 0
  };
}

async function cargarEstadisticasRecientesJugadores(jugadores, cantidadPartidos, temporadaId = '') {
  if (!window.supabase) {
    throw new Error('No se pudo conectar a Supabase para calcular el rendimiento reciente');
  }

  const cantidad = Math.min(Math.max(Number.parseInt(cantidadPartidos, 10) || PARTIDOS_RECIENTES_DEFAULT, 1), 30);
  const jugadoresPorId = new Map(jugadores.map(jugador => [String(jugador.id), jugador]));
  const idsSeleccionados = new Set(jugadores.map(jugador => String(jugador.id)));
  const statsPorJugador = new Map();

  jugadores.forEach(jugador => {
    statsPorJugador.set(String(jugador.id), crearStatsRecientesBase(jugador, cantidad));
  });

  let query = window.supabase
    .from('partidos')
    .select(`
      id,
      fecha,
      temporada_id,
      equipo_ganador,
      jugador_partido (
        jugador_id,
        equipo,
        cagadas,
        mvp,
        ace,
        atajadas,
        jugadores (
          id,
          nombre,
          pulmon,
          foto_url,
          jugador_posicion (
            posicion_id,
            es_primaria,
            posicion (
              id,
              nombre
            )
          )
        )
      ),
      goles (
        id,
        goleador_id,
        asistidor_id,
        equipo,
        es_gol_en_contra,
        cagada_jugador_id
      )
    `)
    .order('fecha', { ascending: false });

  if (temporadaId) {
    query = query.eq('temporada_id', temporadaId);
  }

  const { data: partidos, error } = await query;
  if (error) {
    throw error;
  }

  (partidos || []).forEach(partido => {
    const jugadoresPartido = partido.jugador_partido || [];
    const jugadoresContadosEnPartido = new Set();
    let golesEquipo1 = 0;
    let golesEquipo2 = 0;

    (partido.goles || []).forEach(gol => {
      const equipoGol = obtenerEquipoGolEnPartidoMatchmaking(gol, jugadoresPartido);
      if (equipoGol === 1) golesEquipo1 += 1;
      if (equipoGol === 2) golesEquipo2 += 1;
    });

    jugadoresPartido.forEach(jp => {
      const jugadorId = String(jp.jugador_id);
      if (!idsSeleccionados.has(jugadorId)) return;

      const stats = statsPorJugador.get(jugadorId);
      if (!stats || stats.pj >= cantidad) return;

      const jugadorSeleccionado = jugadoresPorId.get(jugadorId);
      stats.jugadores = jp.jugadores || stats.jugadores;
      stats.nombre = jp.jugadores?.nombre || jugadorSeleccionado?.nombre || stats.nombre;
      stats.pj += 1;
      stats.partidosRecientesUsados = stats.pj;
      jugadoresContadosEnPartido.add(jugadorId);

      if (partido.equipo_ganador === jp.equipo) {
        stats.pg += 1;
        stats.total_puntos += 3;
      } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
        stats.pe += 1;
        stats.total_puntos += 1;
      } else {
        stats.pp += 1;
      }

      if (jp.equipo === 1) {
        stats.goles_favor_equipo += golesEquipo1;
        stats.goles_recibidos_equipo += golesEquipo2;
      } else if (jp.equipo === 2) {
        stats.goles_favor_equipo += golesEquipo2;
        stats.goles_recibidos_equipo += golesEquipo1;
      }

      stats.cagadas_en_gol += calcularCagadasJugadorPartidoMatchmaking(partido, jp);
      stats.atajadas += Number(jp.atajadas) || 0;
      stats.mvp_count += jp.mvp ? 1 : 0;
      stats.ace_count += jp.ace ? 1 : 0;
    });

    (partido.goles || []).forEach(gol => {
      const goleadorId = String(gol.goleador_id || '');
      const asistidorId = String(gol.asistidor_id || '');

      if (gol.es_gol_en_contra) {
        if (jugadoresContadosEnPartido.has(goleadorId)) {
          statsPorJugador.get(goleadorId).goles_en_contra += 1;
        }
        return;
      }

      if (jugadoresContadosEnPartido.has(goleadorId)) {
        statsPorJugador.get(goleadorId).goles += 1;
      }

      if (jugadoresContadosEnPartido.has(asistidorId)) {
        statsPorJugador.get(asistidorId).asistencias += 1;
      }
    });
  });

  return jugadores.map(jugador => {
    const stats = statsPorJugador.get(String(jugador.id));
    if (!stats || stats.pj === 0) {
      return {
        ...jugador.data,
        rolPartido: jugador.rolPartido,
        origenRendimiento: 'historico-fallback',
        partidosRecientesSolicitados: cantidad,
        partidosRecientesUsados: 0
      };
    }

    const puntosDisputados = stats.pj * 3;
    stats.winrate = puntosDisputados > 0 ? Math.round((stats.total_puntos / puntosDisputados) * 100) : 0;
    return stats;
  });
}

// Función para abrir el modal
window.abrirModalAutoEquipos = function() {
  const modal = new bootstrap.Modal(document.getElementById('autoEquiposModal'));
  
  // Resetear el modal al estado inicial
  document.getElementById('config-section').style.display = 'block';
  document.getElementById('progress-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  
  // Resetear variables de restricciones pero mantener jugadores si existen
  parejasEnfrentadas = [];
  parejasJuntas = [];
  contadorParejas = { enfrentadas: 1, juntas: 1 };
  
  // Si hay jugadores usados previamente, restaurarlos
  const inputJugadores = document.getElementById('input-jugadores-partido');
  if (ultimosJugadoresUsados && ultimosJugadoresUsados.length > 0) {
    if (inputJugadores) inputJugadores.value = ultimosJugadoresUsados;
    // Trigger del evento para cargar los jugadores
    buscarJugadoresDisponibles();
  } else {
    // Si no hay jugadores previos, resetear todo
    jugadoresSeleccionados = [];
    if (inputJugadores) inputJugadores.value = '';
    actualizarJugadoresSeleccionados();
    recalcularAutoEquiposLive('abrir');
  }

  poblarOpcionesJugadoresMatchmaking();

  if (typeof window.actualizarModoRendimientoMatchmaking === 'function') {
    window.actualizarModoRendimientoMatchmaking();
  }
  
  modal.show();
  setTimeout(() => document.getElementById('input-jugador-live-matchmaking')?.focus(), 150);
};

// Función para buscar jugadores mientras se escribe
window.buscarJugadoresDisponibles = function() {
  const input = document.getElementById('input-jugadores-partido')?.value || '';
  const nombres = input.split(',').map(n => n.trim()).filter(n => n.length > 0);
  
  if (!window.datosJugadores || window.datosJugadores.length === 0) {
    actualizarJugadoresSeleccionados();
    return;
  }
  
  // Buscar coincidencias
  const rolesPrevios = new Map(jugadoresSeleccionados.map(jugador => [String(jugador.id), jugador.rolPartido]));
  jugadoresSeleccionados = [];
  nombres.slice(0, 10).forEach(nombre => {
    const jugador = resolverDatoJugadorPorNombreMatchmaking(nombre);
    const seleccionado = jugador ? crearJugadorSeleccionadoMatchmaking(jugador, rolesPrevios) : null;
    if (seleccionado && !jugadoresSeleccionados.find(js => String(js.id) === String(seleccionado.id))) {
      jugadoresSeleccionados.push(seleccionado);
    }
  });
  
  sincronizarInputJugadoresPartido();
  actualizarJugadoresSeleccionados();
  actualizarSelectsRestricciones();
  validarEjecucion();
  recalcularAutoEquiposLive('restaurar');
};

// Función para actualizar la vista de jugadores seleccionados
window.cambiarRolJugadorSeleccionado = function(jugadorId, rolPartido) {
  const jugador = jugadoresSeleccionados.find(j => String(j.id) === String(jugadorId));
  if (!jugador) return;

  jugador.rolPartido = normalizarRolPartido(rolPartido);
  actualizarJugadoresSeleccionados();
  validarEjecucion();
  recalcularAutoEquiposLive('rol');
};

function actualizarJugadoresSeleccionados() {
  const container = document.getElementById('jugadores-seleccionados');
  if (!container) return;
  poblarOpcionesJugadoresMatchmaking();
  
  if (jugadoresSeleccionados.length === 0) {
    container.innerHTML = `
      <div class="text-center text-light-emphasis">
        <i class="bi bi-person-plus"></i>
        Agrega jugadores arriba
      </div>
    `;
    return;
  }
  
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-2">
      <span class="${jugadoresSeleccionados.length >= 10 ? 'text-success' : 'text-warning'} fw-bold">
        <i class="bi bi-people me-1"></i>
        ${jugadoresSeleccionados.length} jugadores seleccionados
      </span>
      <span class="text-light-emphasis small">
        ${jugadoresSeleccionados.length >= 10 ? 'Listo para aplicar' : `Faltan ${10 - jugadoresSeleccionados.length}`}
      </span>
    </div>
    <div class="player-cards-container">
      ${jugadoresSeleccionados.map(j => {
        const rol = normalizarRolPartido(j.rolPartido);
        const jugadorActivo = rol === ROL_PARTIDO_JUGADOR;
        const arqueroActivo = rol === ROL_PARTIDO_ARQUERO;
        const jugadorId = escaparTextoParaJs(j.id);

        return `
          <span class="player-card player-role-card">
            <span class="player-role-info">
              <span class="player-role-name">${escaparHtmlMatchmaking(j.nombre)}</span>
              <small class="text-light-emphasis">(${j.data.pj || 0}PJ, ${j.data.winrate || 0}%)</small>
            </span>
            <span class="btn-group btn-group-sm role-toggle" role="group" aria-label="Rol de ${j.nombre}">
              <button
                type="button"
                class="btn ${jugadorActivo ? 'btn-primary' : 'btn-outline-primary'}"
                title="Usar estadisticas de jugador"
                onclick="cambiarRolJugadorSeleccionado('${jugadorId}', '${ROL_PARTIDO_JUGADOR}')"
              >
                <i class="bi bi-person me-1"></i>Jugador
              </button>
              <button
                type="button"
                class="btn ${arqueroActivo ? 'btn-warning' : 'btn-outline-warning'}"
                title="Usar estadisticas de arquero"
                onclick="cambiarRolJugadorSeleccionado('${jugadorId}', '${ROL_PARTIDO_ARQUERO}')"
              >
                <i class="bi bi-shield-fill me-1"></i>Arquero
              </button>
              <button
                type="button"
                class="btn btn-outline-danger"
                title="Quitar jugador"
                onclick="quitarJugadorAutoMatchmaking('${jugadorId}')"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </span>
          </span>
        `;
      }).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

// Funciones para manejar restricciones
window.agregarPareja = function(tipo) {
  const container = document.getElementById(`parejas-${tipo}`);
  const index = contadorParejas[tipo];
  
  const html = `
    <div class="d-flex gap-2 mb-2" id="pareja-${tipo}-${index}">
      <select class="form-select form-select-sm" id="${tipo === 'enfrentadas' ? 'enfrentado1' : 'junto1'}-${index}">
        <option value="">Seleccionar jugador</option>
      </select>
      <span class="text-muted align-self-center">${tipo === 'enfrentadas' ? 'VS' : '+'}</span>
      <select class="form-select form-select-sm" id="${tipo === 'enfrentadas' ? 'enfrentado2' : 'junto2'}-${index}">
        <option value="">Seleccionar jugador</option>
      </select>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarPareja('${tipo}', ${index})">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `;
  
  container.insertAdjacentHTML('beforeend', html);
  contadorParejas[tipo]++;
  actualizarSelectsRestricciones();
};

window.eliminarPareja = function(tipo, index) {
  const elemento = document.getElementById(`pareja-${tipo}-${index}`);
  if (elemento) {
    elemento.remove();
    recalcularAutoEquiposLive('restriccion');
  }
};

// Función para actualizar los selects de restricciones
function actualizarSelectsRestricciones() {
  const selects = document.querySelectorAll('#parejas-enfrentadas select, #parejas-juntas select');
  
  selects.forEach(select => {
    const valorActual = select.value;
    select.innerHTML = '<option value="">Seleccionar jugador</option>';
    
    jugadoresSeleccionados.forEach(jugador => {
      const option = document.createElement('option');
      option.value = jugador.nombre;
      option.textContent = jugador.nombre;
      if (valorActual === jugador.nombre) {
        option.selected = true;
      }
      select.appendChild(option);
    });
  });
}

// Función para validar si se puede ejecutar el algoritmo
function validarEjecucion() {
  const boton = document.getElementById('btn-ejecutar-algoritmo');
  const botonLive = document.getElementById('btn-aplicar-equipos-live');
  const botonAgregar = document.getElementById('btn-add-live-matchmaking');
  const botonCompartir = document.getElementById('btn-compartir-auto-equipos');
  const puedeEjecutar = jugadoresSeleccionados.length >= 10;
  
  if (boton) boton.disabled = !puedeEjecutar;
  if (botonLive) botonLive.disabled = !puedeEjecutar || !resultadoLiveMatchmaking;
  if (botonAgregar) botonAgregar.disabled = jugadoresSeleccionados.length >= 10;
  if (botonCompartir) botonCompartir.disabled = !puedeEjecutar || !resultadoLiveMatchmaking;
  
  if (boton && puedeEjecutar) {
    boton.innerHTML = '<i class="bi bi-play-fill me-2"></i>Ejecutar Algoritmo';
  } else if (boton) {
    boton.innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i>Necesitas ${10 - jugadoresSeleccionados.length} jugadores más`;
  }
}

// Función para obtener las restricciones configuradas
function obtenerRestricciones() {
  const enfrentadas = [];
  const juntas = [];
  
  // Obtener parejas enfrentadas
  document.querySelectorAll('#parejas-enfrentadas .d-flex').forEach(div => {
    const selects = div.querySelectorAll('select');
    if (selects.length === 2 && selects[0].value && selects[1].value) {
      enfrentadas.push([selects[0].value, selects[1].value]);
    }
  });
  
  // Obtener parejas juntas
  document.querySelectorAll('#parejas-juntas .d-flex').forEach(div => {
    const selects = div.querySelectorAll('select');
    if (selects.length === 2 && selects[0].value && selects[1].value) {
      juntas.push([selects[0].value, selects[1].value]);
    }
  });
  
  return { enfrentadas, juntas };
}

// Event listeners que se ejecutan cuando el DOM está listo
function obtenerShareIdDesdeUrlMatchmaking() {
  try {
    const url = new URL(window.location.href);
    const id = url.searchParams.get('share') || '';
    return /^[a-z0-9]{8,40}$/i.test(id) ? id : '';
  } catch {
    return '';
  }
}

function dormirMatchmaking(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function esperarDatosParaShareMatchmaking() {
  for (let intento = 0; intento < 100; intento += 1) {
    if (
      window.supabase &&
      Array.isArray(window.datosJugadores) &&
      window.datosJugadores.length > 0 &&
      document.getElementById('autoEquiposModal')
    ) {
      return true;
    }
    await dormirMatchmaking(250);
  }
  return false;
}

async function leerAutoarmadoCompartidoMatchmaking(shareId) {
  const { data, error } = await window.supabase
    .from('shared_team_builds')
    .select('id,payload,title,description,preview_url,expires_at,created_at')
    .eq('id', shareId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function referenciasJugadoresShareMatchmaking(payload = {}) {
  const seleccionados = Array.isArray(payload.selectedPlayers) ? payload.selectedPlayers : [];
  const equipo1 = Array.isArray(payload.teams?.equipo1) ? payload.teams.equipo1 : [];
  const equipo2 = Array.isArray(payload.teams?.equipo2) ? payload.teams.equipo2 : [];
  const refs = [...seleccionados, ...equipo1, ...equipo2];
  const vistos = new Set();

  return refs.filter(ref => {
    const key = String(ref?.id || normalizarBusquedaMatchmaking(ref?.nombre || ref?.name) || '');
    if (!key || vistos.has(key)) return false;
    vistos.add(key);
    return true;
  });
}

function aplicarConfiguracionShareMatchmaking(config = {}) {
  const modo = config.modo === MODO_RENDIMIENTO_RECIENTE
    ? MODO_RENDIMIENTO_RECIENTE
    : MODO_RENDIMIENTO_HISTORICO;
  const historico = document.getElementById('performance-mode-historical');
  const reciente = document.getElementById('performance-mode-recent');
  if (historico) historico.checked = modo === MODO_RENDIMIENTO_HISTORICO;
  if (reciente) reciente.checked = modo === MODO_RENDIMIENTO_RECIENTE;

  const inputPartidos = document.getElementById('input-partidos-recientes-matchmaking');
  if (inputPartidos && config.partidos) inputPartidos.value = config.partidos;

  const temporada = config.temporadaId;
  if (temporada) {
    const selector = document.getElementById('selector-temporada');
    const selectorMobile = document.getElementById('selector-temporada-mobile');
    if (selector) selector.value = temporada;
    if (selectorMobile) selectorMobile.value = temporada;
  }
}

function renderizarFilasRestriccionShareMatchmaking(tipo, parejas) {
  const container = document.getElementById(`parejas-${tipo}`);
  if (!container) return;
  const rows = parejas.length ? parejas : [['', '']];
  const operador = tipo === 'enfrentadas' ? 'vs' : '+';
  const prefijo = tipo === 'enfrentadas' ? 'enfrentado' : 'junto';

  container.innerHTML = rows.map((pareja, index) => `
    <div class="d-flex gap-2 mb-2" id="pareja-${tipo}-${index}">
      <select class="form-select form-select-sm" id="${prefijo}1-${index}" data-share-value="${escaparHtmlMatchmaking(pareja[0] || '')}">
        <option value="">Seleccionar jugador</option>
      </select>
      <span class="text-muted align-self-center">${operador}</span>
      <select class="form-select form-select-sm" id="${prefijo}2-${index}" data-share-value="${escaparHtmlMatchmaking(pareja[1] || '')}">
        <option value="">Seleccionar jugador</option>
      </select>
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarPareja('${tipo}', ${index})">
        <i class="bi bi-trash"></i>
      </button>
    </div>
  `).join('');

  contadorParejas[tipo] = rows.length;
}

function restaurarRestriccionesShareMatchmaking(restrictions = {}) {
  const enfrentadas = Array.isArray(restrictions.enfrentadas) ? restrictions.enfrentadas : [];
  const juntas = Array.isArray(restrictions.juntas) ? restrictions.juntas : [];
  renderizarFilasRestriccionShareMatchmaking('enfrentadas', enfrentadas);
  renderizarFilasRestriccionShareMatchmaking('juntas', juntas);
  actualizarSelectsRestricciones();

  document.querySelectorAll('#parejas-enfrentadas select, #parejas-juntas select').forEach(select => {
    const valor = select.dataset.shareValue || '';
    if (valor) select.value = valor;
    delete select.dataset.shareValue;
  });
}

function keyReferenciaShareMatchmaking(ref = {}) {
  return String(ref.id || ref.jugador_id || '').trim()
    || normalizarBusquedaMatchmaking(ref.nombre || ref.name);
}

function crearResultadoDesdeShareMatchmaking(payload, datosPreparados) {
  const optimizer = new GeneticTeamOptimizer();
  optimizer.setJugadores(datosPreparados);

  const equipo1Refs = Array.isArray(payload.teams?.equipo1) ? payload.teams.equipo1 : [];
  const equipo2Refs = Array.isArray(payload.teams?.equipo2) ? payload.teams.equipo2 : [];
  const equipo2Keys = new Set(equipo2Refs.map(keyReferenciaShareMatchmaking).filter(Boolean));

  if (!equipo1Refs.length || !equipo2Keys.size) return null;

  const individuo = optimizer.jugadores.map(jugador => {
    const keyId = String(jugador.id || '').trim();
    const keyNombre = normalizarBusquedaMatchmaking(jugador.nombre);
    return equipo2Keys.has(keyId) || equipo2Keys.has(keyNombre) ? 1 : 0;
  });

  const cantidadEquipo1 = individuo.filter(valor => valor === 0).length;
  const cantidadEquipo2 = individuo.filter(valor => valor === 1).length;
  if (!cantidadEquipo1 || !cantidadEquipo2) return null;

  const fitness = optimizer.evaluarIndividuo(individuo);
  const resultado = optimizer.procesarResultado(individuo, fitness);
  resultado.configuracionRendimiento = payload.config || obtenerConfiguracionRendimientoMatchmaking();
  resultado.matchmakingLive = {
    asignacion: asignacionDesdeIndividuoMatchmaking(individuo, optimizer.jugadores),
    shared: true
  };
  return resultado;
}

async function restaurarAutoarmadoCompartidoMatchmaking(share) {
  const payload = share?.payload || {};
  const referencias = referenciasJugadoresShareMatchmaking(payload);
  const rolesPrevios = new Map(referencias.map(ref => [
    String(ref.id || ref.jugador_id || ''),
    normalizarRolPartido(ref.rolPartido || ref.rol)
  ]));

  aplicarConfiguracionShareMatchmaking(payload.config || {});
  window.abrirModalAutoEquipos?.();
  await dormirMatchmaking(80);

  jugadoresSeleccionados = [];
  referencias.slice(0, 10).forEach(ref => {
    const jugador = resolverDatoJugadorPorReferenciaMatchmaking(ref);
    const seleccionado = jugador ? crearJugadorSeleccionadoMatchmaking(jugador, rolesPrevios) : null;
    if (seleccionado && !jugadoresSeleccionados.some(actual => String(actual.id) === String(seleccionado.id))) {
      jugadoresSeleccionados.push(seleccionado);
    }
  });

  if (jugadoresSeleccionados.length === 0) {
    throw new Error('No encontre los jugadores de este armado.');
  }

  ultimosJugadoresUsados = jugadoresSeleccionados.map(jugador => jugador.nombre).join(', ');
  sincronizarInputJugadoresPartido();
  actualizarJugadoresSeleccionados();
  restaurarRestriccionesShareMatchmaking(payload.restrictions || {});

  await asegurarTrackingMatchmakingListo();
  const config = obtenerConfiguracionRendimientoMatchmaking();
  const datos = await prepararDatosLiveMatchmaking(config);
  const resultadoCompartido = crearResultadoDesdeShareMatchmaking(payload, datos);

  if (resultadoCompartido) {
    resultadoLiveMatchmaking = resultadoCompartido;
    window.ultimoResultadoGenetico = resultadoCompartido;
    asignacionLiveAnterior = resultadoCompartido.matchmakingLive?.asignacion || {};
    renderizarPreviewLiveMatchmaking(resultadoCompartido, {}, 'share');
  } else {
    await recalcularAutoEquiposLive('share');
  }

  validarEjecucion();
  const feedback = document.getElementById('matchmaking-live-feedback');
  if (feedback) feedback.innerHTML = `<b>${escaparHtmlMatchmaking(share.title || 'Autoarmado compartido')}</b> cargado`;
}

let cargaShareDesdeUrlIniciadaMatchmaking = false;

window.cargarAutoarmadoCompartidoDesdeUrlMatchmaking = async function() {
  const shareId = obtenerShareIdDesdeUrlMatchmaking();
  if (!shareId || cargaShareDesdeUrlIniciadaMatchmaking) return;
  cargaShareDesdeUrlIniciadaMatchmaking = true;

  try {
    const listo = await esperarDatosParaShareMatchmaking();
    if (!listo) throw new Error('No se terminaron de cargar los datos de jugadores.');

    const share = await leerAutoarmadoCompartidoMatchmaking(shareId);
    if (!share) throw new Error('Este autoarmado no existe o ya expiro.');

    await restaurarAutoarmadoCompartidoMatchmaking(share);
    mostrarToastMatchmaking('Autoarmado compartido cargado.', 'success');
  } catch (error) {
    console.error('Error cargando autoarmado compartido:', error);
    mostrarToastMatchmaking(error.message || 'No se pudo cargar el autoarmado compartido.', 'error');
  }
};

document.addEventListener('DOMContentLoaded', function() {
  const inputLive = document.getElementById('input-jugador-live-matchmaking');
  if (inputLive) {
    inputLive.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        window.agregarJugadorAutoMatchmaking();
      }
    });
  }

  window.setTimeout(() => {
    window.cargarAutoarmadoCompartidoDesdeUrlMatchmaking?.();
  }, 500);

  const btnAplicarLive = document.getElementById('btn-aplicar-equipos-live');
  if (btnAplicarLive) {
    btnAplicarLive.addEventListener('click', () => {
      if (jugadoresSeleccionados.length < 10 || !resultadoLiveMatchmaking) {
        window.showToast?.('Completa 10 jugadores para aplicar equipos', 'warning');
        return;
      }
      ultimosJugadoresUsados = document.getElementById('input-jugadores-partido')?.value || '';
      document.getElementById('btn-aplicar-equipos')?.click();
    });
  }

  ['parejas-enfrentadas', 'parejas-juntas'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => recalcularAutoEquiposLive('restriccion'));
  });

  // Event listener para ejecutar el algoritmo
  const btnEjecutar = document.getElementById('btn-ejecutar-algoritmo');
  if (btnEjecutar) {
    btnEjecutar.addEventListener('click', async function() {
      if (jugadoresSeleccionados.length < 10) {
        window.showToast('Se necesitan al menos 10 jugadores para formar equipos de 5 vs 5', 'error');
        return;
      }
      
      // Parámetros fijos del algoritmo
      const generations = 75; // Parámetro fijo optimizado
      const population = 200;  // Parámetro fijo optimizado
      
      // Obtener restricciones
      const restricciones = obtenerRestricciones();
      const configuracionRendimiento = obtenerConfiguracionRendimientoMatchmaking();
      
      // Cambiar a la sección de progreso
      document.getElementById('config-section').style.display = 'none';
      document.getElementById('progress-section').style.display = 'block';
      document.getElementById('best-fitness').textContent = 'Tracking...';

      await asegurarTrackingMatchmakingListo();

      // Configurar el optimizador
      geneticOptimizer = new GeneticTeamOptimizer();
      geneticOptimizer.populationSize = population;
      geneticOptimizer.generations = generations;
      
      // Configurar restricciones
      geneticOptimizer.setRestricciones(restricciones.enfrentadas, restricciones.juntas);
      
      // Usar los jugadores seleccionados
      let datosJugadoresSeleccionados = jugadoresSeleccionados.map(js => ({
        ...js.data,
        rolPartido: js.rolPartido
      }));
      
      // Resetear la interfaz de progreso
      document.getElementById('progress-bar').style.width = '0%';
      document.getElementById('progress-percent').textContent = '0%';
      document.getElementById('current-generation').textContent = '0';
      document.getElementById('best-fitness').textContent = configuracionRendimiento.modo === MODO_RENDIMIENTO_RECIENTE ? 'Stats...' : '--';
      document.getElementById('elapsed-time').textContent = '0s';
      
      startTime = Date.now();
      
      // Iniciar el timer
      const timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        document.getElementById('elapsed-time').textContent = `${elapsed}s`;
      }, 1000);
      
      try {
        if (configuracionRendimiento.modo === MODO_RENDIMIENTO_RECIENTE) {
          datosJugadoresSeleccionados = await cargarEstadisticasRecientesJugadores(
            jugadoresSeleccionados,
            configuracionRendimiento.partidos,
            configuracionRendimiento.temporadaId
          );
          document.getElementById('best-fitness').textContent = '--';
        }

        datosJugadoresSeleccionados = await asegurarPuntosDefensaRankingMatchmaking(datosJugadoresSeleccionados);

        datosJugadoresSeleccionados = await enriquecerJugadoresConMomentosMatchmaking(
          datosJugadoresSeleccionados,
          configuracionRendimiento.temporadaId
        );

        geneticOptimizer.setJugadores(datosJugadoresSeleccionados);

        // Ejecutar el algoritmo
        const resultado = await geneticOptimizer.ejecutar((progress) => {
          document.getElementById('progress-bar').style.width = `${progress.progresoPercent}%`;
          document.getElementById('progress-percent').textContent = `${Math.round(progress.progresoPercent)}%`;
          document.getElementById('current-generation').textContent = progress.generacion;
          document.getElementById('best-fitness').textContent = progress.mejorFitness.toFixed(2);
        });

        resultado.configuracionRendimiento = configuracionRendimiento;
        
        clearInterval(timer);
        
        // Guardar los jugadores usados para recordarlos la próxima vez
        ultimosJugadoresUsados = document.getElementById('input-jugadores-partido').value;
        
        seleccionIntercambioMatchmaking = null;

        // Mostrar resultados
        mostrarResultados(resultado);
        
      } catch (error) {
        clearInterval(timer);
        console.error('Error en el algoritmo genético:', error);
        window.showToast('Error al ejecutar el algoritmo: ' + error.message, 'error');
        
        // Volver a la configuración
        document.getElementById('progress-section').style.display = 'none';
        document.getElementById('config-section').style.display = 'block';
      }
    });
  }

  // Event listener para aplicar los equipos generados
  const btnAplicar = document.getElementById('btn-aplicar-equipos');
  if (btnAplicar) {
    btnAplicar.addEventListener('click', function() {
      if (!window.ultimoResultadoGenetico) {
        window.showToast('No hay resultados para aplicar', 'error');
        return;
      }
      
      const resultado = window.ultimoResultadoGenetico;
      
      console.log('Aplicando equipos:', resultado);
      
      // Limpiar equipos actuales
      window.equipo1.length = 0;
      window.equipo2.length = 0;
      
      // Aplicar nuevos equipos - usar los datos completos ya guardados
      resultado.equipo1.jugadores.forEach(jugador => {
        const jugadorCompleto = jugadoresSeleccionados.find(js => js.nombre === jugador.nombre);
        if (jugadorCompleto) {
          // Usar el formato que espera renderizarEquipos
          const jugadorParaEquipo = {
            id: jugadorCompleto.id,
            nombre: jugadorCompleto.nombre,
            rolPartido: jugador.rolPartido || jugadorCompleto.rolPartido,
            jugadores: {
              id: jugadorCompleto.id,
              nombre: jugadorCompleto.nombre,
              pulmon: jugadorCompleto.data.jugadores?.pulmon || jugadorCompleto.data.pulmon
            },
            // Agregar estadísticas para compatibilidad
            ...jugadorCompleto.data
          };
          window.equipo1.push(jugadorParaEquipo);
        }
      });
      
      resultado.equipo2.jugadores.forEach(jugador => {
        const jugadorCompleto = jugadoresSeleccionados.find(js => js.nombre === jugador.nombre);
        if (jugadorCompleto) {
          // Usar el formato que espera renderizarEquipos
          const jugadorParaEquipo = {
            id: jugadorCompleto.id,
            nombre: jugadorCompleto.nombre,
            rolPartido: jugador.rolPartido || jugadorCompleto.rolPartido,
            jugadores: {
              id: jugadorCompleto.id,
              nombre: jugadorCompleto.nombre,
              pulmon: jugadorCompleto.data.jugadores?.pulmon || jugadorCompleto.data.pulmon
            },
            // Agregar estadísticas para compatibilidad
            ...jugadorCompleto.data
          };
          window.equipo2.push(jugadorParaEquipo);
        }
      });
      
      console.log('Equipos después de aplicar:', window.equipo1, window.equipo2);
      
      // Forzar actualización de la interfaz
      try {
        // Intentar llamar a la función de renderizado global
        if (typeof window.renderizarEquipos === 'function') {
          console.log('Llamando a window.renderizarEquipos()');
          window.renderizarEquipos().catch(error => {
            console.error('Error al renderizar equipos:', error);
          });
        } else {
          console.log('window.renderizarEquipos no está disponible, usando evento personalizado');
          // Si no existe la función global, buscar en el scope del módulo
          const event = new CustomEvent('equiposActualizados', {
            detail: { equipo1: window.equipo1, equipo2: window.equipo2 }
          });
          document.dispatchEvent(event);
        }
        
        // Verificar que las cards se actualicen y forzar actualización si es necesario
        setTimeout(() => {
          const equipo1Container = document.getElementById('equipo1-jugadores');
          const equipo2Container = document.getElementById('equipo2-jugadores');
          console.log('Containers después de renderizar:', equipo1Container, equipo2Container);
          
          // Si los containers están vacíos, forzar actualización manual
          if (equipo1Container && equipo2Container) {
            const isEmpty1 = !equipo1Container.children.length || equipo1Container.textContent.includes('no hay jugadores');
            const isEmpty2 = !equipo2Container.children.length || equipo2Container.textContent.includes('no hay jugadores');
            
            if (isEmpty1 || isEmpty2) {
              console.log('Containers vacíos, forzando actualización manual...');
              forzarActualizacionManual();
            }
          }
        }, 200);
        
      } catch (error) {
        console.error('Error al renderizar equipos:', error);
      }
      
      // Cerrar modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('autoEquiposModal'));
      modal.hide();
      
      window.showToast(`¡Equipos aplicados! ${window.equipo1.length} vs ${window.equipo2.length} jugadores`, 'success');
      
      // Scroll hacia los equipos
      setTimeout(() => {
        const teamSection = document.getElementById('team-selection') || document.querySelector('.team-card');
        if (teamSection) {
          teamSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start' 
          });
        }
      }, 500);
    });
  }

  // Event listener para nueva optimización
  const btnNueva = document.getElementById('btn-nueva-optimizacion');
  if (btnNueva) {
    btnNueva.addEventListener('click', function() {
      document.getElementById('results-section').style.display = 'none';
      document.getElementById('config-section').style.display = 'block';
      // Resetear variables pero mantener jugadores seleccionados
      parejasEnfrentadas = [];
      parejasJuntas = [];
      contadorParejas = { enfrentadas: 1, juntas: 1 };
      
      // Limpiar las restricciones del DOM
      document.getElementById('parejas-enfrentadas').innerHTML = `
        <div class="d-flex gap-2 mb-2">
          <select class="form-select form-select-sm" id="enfrentado1-0">
            <option value="">Seleccionar jugador</option>
          </select>
          <span class="text-muted align-self-center">VS</span>
          <select class="form-select form-select-sm" id="enfrentado2-0">
            <option value="">Seleccionar jugador</option>
          </select>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarPareja('enfrentadas', 0)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
      
      document.getElementById('parejas-juntas').innerHTML = `
        <div class="d-flex gap-2 mb-2">
          <select class="form-select form-select-sm" id="junto1-0">
            <option value="">Seleccionar jugador</option>
          </select>
          <span class="text-muted align-self-center">+</span>
          <select class="form-select form-select-sm" id="junto2-0">
            <option value="">Seleccionar jugador</option>
          </select>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarPareja('juntas', 0)">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `;
      
      actualizarJugadoresSeleccionados();
      actualizarSelectsRestricciones();
    });
  }
});

const MATCHMAKING_TEAM_THEMES = {
  equipo1: {
    name: 'Equipo 1',
    color: '#4c8dff',
    soft: 'rgba(76, 141, 255, 0.12)'
  },
  equipo2: {
    name: 'Equipo 2',
    color: '#ff5d5d',
    soft: 'rgba(255, 93, 93, 0.12)'
  }
};

function porcentajeImpactoEquipoMatchmaking(stats1 = {}, stats2 = {}) {
  const impacto1 = numeroSeguroMatchmaking(stats1.impactoMatchmaking);
  const impacto2 = numeroSeguroMatchmaking(stats2.impactoMatchmaking);
  const total = impacto1 + impacto2;
  if (total <= 0) return { equipo1: 50, equipo2: 50 };
  return {
    equipo1: (impacto1 / total) * 100,
    equipo2: (impacto2 / total) * 100
  };
}

function maxImpactoJugadoresMatchmaking(resultado) {
  const impactos = [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ].map(jugador => numeroSeguroMatchmaking(jugador.impactoMatchmaking));
  return Math.max(1, ...impactos);
}

function obtenerRachaRelacionalJugadorMatchmaking(jugador) {
  const relaciones = [
    ...Object.values(jugador?.matchmakingVersus || {}),
    ...Object.values(jugador?.matchmakingJuntos || {})
  ];
  const mejor = relaciones.reduce((actual, stat) => {
    const racha = Number(stat?.rachaVictoriasActual) || 0;
    return racha > actual ? racha : actual;
  }, 0);

  return mejor >= 2
    ? { tipo: 'win', cantidad: mejor, origen: 'relacional', titulo: 'Racha positiva en cruces del grupo' }
    : null;
}

function obtenerRachaVisualJugadorMatchmaking(jugador) {
  const rachaActual = jugador?.rachaActualMatchmaking;
  const cantidadActual = Number(rachaActual?.cantidad) || 0;
  if ((rachaActual?.tipo === 'win' || rachaActual?.tipo === 'defeat') && cantidadActual >= 2) {
    return {
      tipo: rachaActual.tipo,
      cantidad: cantidadActual,
      origen: 'actual',
      titulo: rachaActual.tipo === 'win'
        ? `En racha de ${cantidadActual} victorias`
        : `En racha de ${cantidadActual} derrotas`
    };
  }

  return obtenerRachaRelacionalJugadorMatchmaking(jugador);
}

function obtenerStatsHitosJugadorMatchmaking(jugador = {}) {
  return jugador?.historicoMatchmaking || jugador;
}

function obtenerNumeroHitoJugadorMatchmaking(jugador = {}, campo) {
  const stats = obtenerStatsHitosJugadorMatchmaking(jugador);
  return numeroSeguroMatchmaking(stats?.[campo] ?? jugador?.[campo]);
}

function siguienteNumeroRedondoMatchmaking(valor, tipo = 'base') {
  const numero = Math.max(0, Math.floor(Number(valor) || 0));
  const hitos = tipo === 'partidos'
    ? [10, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500]
    : [10, 20, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
  return hitos.find(hito => hito > numero) || (Math.ceil((numero + 1) / 100) * 100);
}

function esNumeroRedondoPartidoMatchmaking(numero) {
  const n = Math.floor(Number(numero) || 0);
  if (n < 10) return false;
  if (n <= 50) return n % 10 === 0;
  return n % 25 === 0;
}

function crearHitoMatchmaking(key, prioridad, icono, titulo, texto) {
  return { key, prioridad, icono, titulo, texto };
}

function generarHitosNumerosRedondosMatchmaking(jugadores = []) {
  return jugadores.flatMap(jugador => {
    const nombre = escaparHtmlMatchmaking(jugador?.nombre || 'Jugador');
    const jugadorId = escaparHtmlMatchmaking(String(jugador?.id || jugador?.nombre || nombre));
    const hitos = [];
    const pjActuales = obtenerNumeroHitoJugadorMatchmaking(jugador, 'pj');
    const proximoPartido = pjActuales + 1;
    if (esNumeroRedondoPartidoMatchmaking(proximoPartido)) {
      hitos.push(crearHitoMatchmaking(
        `partido:${jugadorId}:${proximoPartido}`,
        120 + proximoPartido,
        'bi-calendar-event',
        `Partido numero ${proximoPartido}`,
        `Este puede ser el partido numero <strong>${proximoPartido}</strong> de <strong>${nombre}</strong>.`
      ));
    }

    const metricas = [
      { campo: 'goles', label: 'goles', maxNecesarios: 3, icono: 'bi-bullseye', prioridad: 100 },
      { campo: 'asistencias', label: 'asistencias', maxNecesarios: 2, icono: 'bi-bezier2', prioridad: 92 },
      { campo: 'atajadas', label: 'atajadas', maxNecesarios: 8, icono: 'bi-shield-fill-check', prioridad: 84 }
    ];

    metricas.forEach(metrica => {
      const actual = obtenerNumeroHitoJugadorMatchmaking(jugador, metrica.campo);
      const hito = siguienteNumeroRedondoMatchmaking(actual, metrica.campo);
      const faltan = hito - actual;
      if (faltan <= 0 || faltan > metrica.maxNecesarios) return;
      hitos.push(crearHitoMatchmaking(
        `${metrica.campo}:${jugadorId}:${hito}`,
        metrica.prioridad + (metrica.maxNecesarios - faltan),
        metrica.icono,
        `${nombre} puede llegar a ${hito}`,
        `En este partido <strong>${nombre}</strong> puede llegar a <strong>${hito} ${metrica.label}</strong>${faltan === 1 ? '' : ` si suma ${faltan}`}.`
      ));
    });

    return hitos;
  });
}

function generarHitosRachasVsRivalMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  const hitos = [];

  (equipo || []).forEach(jugador => {
    Object.entries(jugador?.matchmakingVersus || {}).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const racha = Number(stat?.rachaVictoriasActual) || 0;
      const pj = Number(stat?.pj) || 0;
      if (racha < 2 || pj < racha) return;

      const nombre = escaparHtmlMatchmaking(jugador.nombre);
      const rivalNombre = escaparHtmlMatchmaking(rivalJugador.nombre);
      hitos.push(crearHitoMatchmaking(
        `racha:${jugador.id || jugador.nombre}:${rivalJugador.id || rivalJugador.nombre}`,
        112 + racha,
        'bi-arrow-up-right-circle',
        `${nombre} vs ${rivalNombre}`,
        `En este partido <strong>${nombre}</strong> puede estirar la racha sobre <strong>${rivalNombre}</strong> a <strong>${racha + 1}</strong> victorias seguidas.`
      ));
    });
  });

  return hitos;
}

function generarHitosPaternidadMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  const usados = new Set();
  const hitos = [];

  (equipo || []).forEach(jugador => {
    Object.entries(jugador?.matchmakingVersus || {}).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const key = [String(jugador.id || jugador.nombre), String(rivalJugador.id || rivalJugador.nombre)].sort().join(':');
      if (usados.has(key)) return;
      usados.add(key);

      const victorias = Number(stat?.victorias) || 0;
      const derrotas = Number(stat?.derrotas) || 0;
      const pj = Number(stat?.pj) || victorias + derrotas + (Number(stat?.empates) || 0);
      const diferencia = Math.abs(victorias - derrotas);
      if (pj < 3 || diferencia > 1) return;

      const nombre = escaparHtmlMatchmaking(jugador.nombre);
      const rivalNombre = escaparHtmlMatchmaking(rivalJugador.nombre);
      const estado = victorias === derrotas
        ? `llegan empatados ${victorias}-${derrotas}`
        : `${victorias > derrotas ? nombre : rivalNombre} llega apenas arriba ${Math.max(victorias, derrotas)}-${Math.min(victorias, derrotas)}`;
      hitos.push(crearHitoMatchmaking(
        `paternidad:${key}`,
        108 + pj,
        'bi-diagram-3',
        `Paternidad en juego`,
        `En este partido se define la paternidad entre <strong>${nombre}</strong> y <strong>${rivalNombre}</strong>: ${estado}.`
      ));
    });
  });

  return hitos;
}

function generarHitosPartidoMatchmaking(resultado) {
  const equipo1 = resultado?.equipo1?.jugadores || [];
  const equipo2 = resultado?.equipo2?.jugadores || [];
  const jugadores = [...equipo1, ...equipo2];
  const hitos = [
    ...generarHitosNumerosRedondosMatchmaking(jugadores),
    ...generarHitosRachasVsRivalMatchmaking(equipo1, equipo2),
    ...generarHitosRachasVsRivalMatchmaking(equipo2, equipo1),
    ...generarHitosPaternidadMatchmaking(equipo1, equipo2),
    ...generarHitosPaternidadMatchmaking(equipo2, equipo1)
  ];
  const usados = new Set();
  return hitos
    .filter(hito => {
      if (!hito?.key || usados.has(hito.key)) return false;
      usados.add(hito.key);
      return true;
    })
    .sort((a, b) => b.prioridad - a.prioridad)
    .slice(0, 4);
}

function renderizarHitosPartidoMatchmaking(resultado) {
  const hitos = generarHitosPartidoMatchmaking(resultado);
  if (!hitos.length) return '';

  return `
    <section class="matchmaking-match-facts" aria-label="Hitos posibles del partido">
      <header>
        <span>Hitos posibles</span>
        <strong>Si se juega este armado</strong>
      </header>
      <div class="matchmaking-match-facts__grid">
        ${hitos.map(hito => `
          <article class="matchmaking-match-fact">
            <i class="bi ${escaparHtmlMatchmaking(hito.icono)}" aria-hidden="true"></i>
            <div>
              <h4>${hito.titulo}</h4>
              <p>${hito.texto}</p>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderizarJugadorResultadoMatchmaking(jugador, equipoKey = '', index = 0, opciones = {}) {
  const skill = Number(jugador.skillMatchmaking ?? jugador.rendimientoTotal) || 0;
  const impacto = Number(jugador.impactoMatchmaking) || 0;
  const contextoIntercambio = opciones.contextoIntercambio || 'resultado';
  const estaSeleccionado = seleccionIntercambioMatchmaking &&
    seleccionIntercambioMatchmaking.scope === contextoIntercambio &&
    seleccionIntercambioMatchmaking.equipoKey === equipoKey &&
    Number(seleccionIntercambioMatchmaking.index) === Number(index);
  const esClave = opciones.jugadorClave && String(opciones.jugadorClave.id || opciones.jugadorClave.nombre) === String(jugador.id || jugador.nombre);
  const permiteIntercambio = opciones.intercambio !== false;
  const partidosRecientes = jugador.origenRendimiento === MODO_RENDIMIENTO_RECIENTE
    ? ` - ${jugador.partidosRecientesUsados}/${jugador.partidosRecientesSolicitados} PJ recientes`
    : '';
  const title = permiteIntercambio
    ? `${estaSeleccionado ? 'Cancelar seleccion' : 'Seleccionar para intercambiar'} - Skill ${skill.toFixed(1)} - impacto ${impacto.toFixed(1)}%${partidosRecientes}`
    : `Skill ${skill.toFixed(1)} - impacto ${impacto.toFixed(1)}%${partidosRecientes}`;

  return `
    <button
      type="button"
      class="matchmaking-player-row matchmaking-swap-player ${estaSeleccionado ? 'is-selected' : ''} ${esClave ? 'is-key' : ''}"
      ${permiteIntercambio ? `onclick="seleccionarJugadorIntercambioMatchmaking('${equipoKey}', ${index}, '${contextoIntercambio}')"` : ''}
      aria-pressed="${estaSeleccionado ? 'true' : 'false'}"
      title="${escaparHtmlMatchmaking(title)}"
    >
      <span class="matchmaking-player-row__grip" aria-hidden="true"><i class="bi bi-grip-vertical"></i></span>
      <span class="matchmaking-player-row__body">
        <span class="matchmaking-player-row__name">
          ${escaparHtmlMatchmaking(jugador.nombre)}
        </span>
        <span class="matchmaking-player-row__meta">
          Skill ${skill.toFixed(1)} &middot; Impacto ${impacto.toFixed(1)}%
        </span>
      </span>
    </button>
  `;
}

function obtenerJugadorClaveMatchmaking(resultado) {
  const jugadores = [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ];

  if (jugadores.length === 0) return null;

  return jugadores.reduce((clave, jugador) => {
    const impactoJugador = Number(jugador.impactoMatchmaking) || 0;
    const impactoClave = Number(clave?.impactoMatchmaking) || 0;
    return impactoJugador > impactoClave ? jugador : clave;
  }, jugadores[0]);
}

function renderizarNotaJugadorClaveMatchmaking(resultado) {
  const jugadorClave = obtenerJugadorClaveMatchmaking(resultado);
  if (!jugadorClave) return '';

  const impacto = Number(jugadorClave.impactoMatchmaking) || 0;
  const skill = Number(jugadorClave.skillMatchmaking ?? jugadorClave.rendimientoTotal) || 0;
  const contexto = jugadorClave.origenRendimiento === MODO_RENDIMIENTO_RECIENTE
    ? 'según sus últimos partidos'
    : 'según su rendimiento histórico';

  return `
    <div class="matchmaking-key-note">
      <i class="bi bi-exclamation-diamond me-2"></i>
      Este balance depende especialmente de que <strong>${jugadorClave.nombre}</strong> juegue como viene jugando:
      aporta <strong>${impacto.toFixed(1)}%</strong> del impacto del armado con skill <strong>${skill.toFixed(1)}</strong> ${contexto}.
    </div>
  `;
}

function obtenerJugadorSobreRendimientoReciente(resultado) {
  const jugadores = [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ];

  const candidatos = jugadores
    .map(jugador => {
      if (jugador.origenRendimiento !== MODO_RENDIMIENTO_RECIENTE) return null;

      const historicoRaw = jugador.rendimientoHistoricoMatchmaking;
      if (historicoRaw === null || historicoRaw === undefined) return null;

      const reciente = Number(jugador.skillMatchmaking ?? jugador.rendimientoTotal);
      const historico = Number(historicoRaw);
      if (!Number.isFinite(reciente) || !Number.isFinite(historico)) return null;

      const diferencia = reciente - historico;
      const variacionRelativa = historico > 0 ? diferencia / historico : Number.POSITIVE_INFINITY;

      if (diferencia < SOBRE_RENDIMIENTO_RECIENTE_MIN_ABSOLUTO) return null;
      if (historico > 0 && variacionRelativa < SOBRE_RENDIMIENTO_RECIENTE_MIN_RELATIVO) return null;

      return {
        jugador,
        reciente,
        historico,
        diferencia,
        variacionRelativa
      };
    })
    .filter(Boolean);

  if (candidatos.length === 0) return null;

  return candidatos.sort((a, b) => {
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    return b.variacionRelativa - a.variacionRelativa;
  })[0];
}

function renderizarNotaSobreRendimientoReciente(resultado) {
  const sobreRendimiento = obtenerJugadorSobreRendimientoReciente(resultado);
  if (!sobreRendimiento) return '';

  const { jugador, reciente, historico, diferencia, variacionRelativa } = sobreRendimiento;
  const variacionTexto = Number.isFinite(variacionRelativa)
    ? `, +${Math.round(variacionRelativa * 100)}%`
    : '';

  return `
    <div class="matchmaking-key-note matchmaking-trend-note">
      <i class="bi bi-graph-up-arrow me-2"></i>
      Ojo con <strong>${jugador.nombre}</strong>: viene jugando bastante por encima de su histórico
      (skill reciente <strong>${reciente.toFixed(1)}</strong> vs histórico <strong>${historico.toFixed(1)}</strong>,
      +<strong>${diferencia.toFixed(1)}</strong>${variacionTexto}). El balance depende de que siga jugando así.
    </div>
  `;
}

// Helpers para notas de atencion del matchmaking
function escaparHtmlMatchmaking(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TRAMOS_GOL_MATCHMAKING = [
  { key: 't0_15', label: '0-15', min: 0, max: 15 * 60 },
  { key: 't15_30', label: '15-30', min: 15 * 60, max: 30 * 60 },
  { key: 't30_45', label: '30-45', min: 30 * 60, max: 45 * 60 },
  { key: 't45_plus', label: '45+', min: 45 * 60, max: Number.POSITIVE_INFINITY }
];

function obtenerListaDisponibleMatchmaking(...listas) {
  return listas.find(lista => Array.isArray(lista) && lista.length > 0) || [];
}

function obtenerSegundosEventoGolMatchmaking(evento) {
  const segundosDirectos = numeroFinitoMatchmaking(
    evento?.segundos ?? evento?.match_seconds ?? evento?.review_seconds ?? evento?.sam3_seconds ?? evento?.seconds
  );
  if (segundosDirectos !== null && segundosDirectos >= 0) return segundosDirectos;

  const minuto = numeroFinitoMatchmaking(evento?.minuto ?? evento?.minute);
  return minuto !== null && minuto >= 0 ? minuto * 60 : null;
}

function crearDistribucionVaciaTramosMatchmaking() {
  return TRAMOS_GOL_MATCHMAKING.reduce((acc, tramo) => {
    acc[tramo.key] = 0;
    return acc;
  }, {});
}

function obtenerTramoPorSegundosMatchmaking(segundos) {
  return TRAMOS_GOL_MATCHMAKING.find(tramo => segundos >= tramo.min && segundos < tramo.max) || null;
}

function calcularDistribucionEventosGolMatchmaking(eventos = []) {
  const distribucion = crearDistribucionVaciaTramosMatchmaking();
  let total = 0;

  (eventos || []).forEach(evento => {
    const segundos = obtenerSegundosEventoGolMatchmaking(evento);
    if (segundos === null) return;

    const tramo = obtenerTramoPorSegundosMatchmaking(segundos);
    if (!tramo) return;

    distribucion[tramo.key] += 1;
    total += 1;
  });

  return { distribucion, total };
}

function obtenerTramoDominanteDistribucionMatchmaking(distribucion = {}, totalForzado = null, opciones = {}) {
  const total = totalForzado ?? TRAMOS_GOL_MATCHMAKING.reduce((sum, tramo) => sum + (Number(distribucion[tramo.key]) || 0), 0);
  const minimoTotal = opciones.minimoTotal ?? 2;
  const minimoCantidad = opciones.minimoCantidad ?? 2;
  const minimoPorcentaje = opciones.minimoPorcentaje ?? 45;

  if (total < minimoTotal) return null;

  const tramos = TRAMOS_GOL_MATCHMAKING
    .map(tramo => ({
      ...tramo,
      cantidad: Number(distribucion[tramo.key]) || 0
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const principal = tramos[0];
  const segundo = tramos[1];
  const porcentaje = total > 0 ? (principal.cantidad / total) * 100 : 0;

  if (principal.cantidad < minimoCantidad || porcentaje < minimoPorcentaje) return null;
  if (segundo && principal.cantidad - segundo.cantidad < 2 && porcentaje < 60) return null;

  return {
    ...principal,
    total,
    porcentaje
  };
}

function obtenerDistribucionTramosJugadorMatchmaking(jugador) {
  const distribucion = jugador?.distribucionTramos;
  if (!distribucion || typeof distribucion !== 'object') return null;
  const total = TRAMOS_GOL_MATCHMAKING.reduce((sum, tramo) => sum + (Number(distribucion[tramo.key]) || 0), 0);
  return total > 0 ? { distribucion, total } : null;
}

function obtenerEventosGolesConvertidosMatchmaking(jugador) {
  return obtenerListaDisponibleMatchmaking(
    jugador?.momentosGolesMatchmaking,
    jugador?.trackingGoalsScoredLocations,
    jugador?.tracking?.goal_locations
  );
}

function obtenerEventosGolesRecibidosArqueroMatchmaking(jugador) {
  return obtenerListaDisponibleMatchmaking(
    jugador?.momentosGolesRecibidosArqueroMatchmaking,
    jugador?.trackingGoalsConcededLocations
  );
}

function obtenerTramoDominanteGolesJugadorMatchmaking(jugador, tipo = 'convertidos') {
  const eventos = tipo === 'recibidos'
    ? obtenerEventosGolesRecibidosArqueroMatchmaking(jugador)
    : obtenerEventosGolesConvertidosMatchmaking(jugador);
  const desdeEventos = calcularDistribucionEventosGolMatchmaking(eventos);
  const dominanteEventos = obtenerTramoDominanteDistribucionMatchmaking(desdeEventos.distribucion, desdeEventos.total, {
    minimoTotal: 2,
    minimoCantidad: 2,
    minimoPorcentaje: tipo === 'recibidos' ? 50 : 45
  });

  if (dominanteEventos) return dominanteEventos;

  if (tipo === 'convertidos') {
    const desdePerfil = obtenerDistribucionTramosJugadorMatchmaking(jugador);
    if (desdePerfil) {
      return obtenerTramoDominanteDistribucionMatchmaking(desdePerfil.distribucion, desdePerfil.total, {
        minimoTotal: 3,
        minimoCantidad: 2,
        minimoPorcentaje: 45
      });
    }
  }

  return null;
}

function obtenerGolesPorPartidoMatchmaking(jugador) {
  const pj = Math.max(numeroSeguroMatchmaking(jugador?.pj), 0);
  return pj > 0 ? numeroSeguroMatchmaking(jugador?.goles) / pj : 0;
}

function obtenerStatsArqueroMatchmaking(jugador) {
  const pjArquero = numeroSeguroMatchmaking(jugador?.pjArquero) || (jugador?.rolPartido === ROL_PARTIDO_ARQUERO ? numeroSeguroMatchmaking(jugador?.pj) : 0);
  const atajadas = numeroSeguroMatchmaking(jugador?.atajadas);
  const golesRecibidos = numeroSeguroMatchmaking(jugador?.golesRecibidosArquero);

  return {
    pjArquero,
    atajadas,
    golesRecibidos,
    atajadasPP: pjArquero > 0 ? atajadas / pjArquero : 0,
    golesRecibidosPP: pjArquero > 0 ? golesRecibidos / pjArquero : 0,
    atajadasPorGol: golesRecibidos > 0 ? atajadas / golesRecibidos : null
  };
}

function obtenerArqueroPrincipalEquipoMatchmaking(jugadores = []) {
  return (jugadores || [])
    .filter(jugador => jugador.rolPartido === ROL_PARTIDO_ARQUERO)
    .sort((a, b) => {
      const statsA = obtenerStatsArqueroMatchmaking(a);
      const statsB = obtenerStatsArqueroMatchmaking(b);
      if (statsB.pjArquero !== statsA.pjArquero) return statsB.pjArquero - statsA.pjArquero;
      return statsB.atajadas - statsA.atajadas;
    })[0] || null;
}

function obtenerMejorGoleadorEquipoMatchmaking(jugadores = []) {
  const candidatos = (jugadores || [])
    .filter(jugador => jugador.rolPartido !== ROL_PARTIDO_ARQUERO)
    .map(jugador => {
      const goles = numeroSeguroMatchmaking(jugador.goles);
      const golesPP = obtenerGolesPorPartidoMatchmaking(jugador);
      if (goles < 3 && golesPP < 0.35) return null;
      return {
        jugador,
        goles,
        golesPP,
        tramo: obtenerTramoDominanteGolesJugadorMatchmaking(jugador, 'convertidos'),
        score: (golesPP * 100) + (goles * 2) + (numeroSeguroMatchmaking(jugador.impactoMatchmaking) * 0.2)
      };
    })
    .filter(Boolean);

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function promedioEquipoMatchmaking(jugadores = [], obtenerValor) {
  const valores = (jugadores || [])
    .map(obtenerValor)
    .map(valor => numeroFinitoMatchmaking(valor))
    .filter(valor => valor !== null && valor > 0);

  if (valores.length === 0) return { promedio: 0, cantidad: 0 };
  return {
    promedio: valores.reduce((sum, valor) => sum + valor, 0) / valores.length,
    cantidad: valores.length
  };
}

function obtenerKm40JugadorMatchmaking(jugador) {
  return numeroFinitoMatchmaking(
    jugador?.trackingDistancePer40Km
    ?? jugador?.tracking?.distance_per_40_min_km
    ?? jugador?.distance_per_40_min_km
  );
}

function obtenerPulmonJugadorMatchmaking(jugador) {
  return obtenerPulmonTrackingMatchmaking(jugador);
}

function generarNotaFisicaMatchmaking(equipo, rival, nombreRival) {
  const kmEquipo = promedioEquipoMatchmaking(equipo, obtenerKm40JugadorMatchmaking);
  const kmRival = promedioEquipoMatchmaking(rival, obtenerKm40JugadorMatchmaking);

  if (kmEquipo.cantidad >= 2 && kmRival.cantidad >= 2) {
    const diferenciaKm = kmEquipo.promedio - kmRival.promedio;
    if (Math.abs(diferenciaKm) >= 0.35) {
      return diferenciaKm > 0
        ? `Dato fisico: +${diferenciaKm.toFixed(1)} km/40 de promedio sobre ${escaparHtmlMatchmaking(nombreRival)}.`
        : `Dato fisico: ${escaparHtmlMatchmaking(nombreRival)} tiene +${Math.abs(diferenciaKm).toFixed(1)} km/40 de promedio.`;
    }
  }

  const pulmonEquipo = promedioEquipoMatchmaking(equipo, obtenerPulmonJugadorMatchmaking);
  const pulmonRival = promedioEquipoMatchmaking(rival, obtenerPulmonJugadorMatchmaking);

  if (pulmonEquipo.cantidad >= 2 && pulmonRival.cantidad >= 2) {
    const diferenciaPulmon = pulmonEquipo.promedio - pulmonRival.promedio;
    if (Math.abs(diferenciaPulmon) >= 4) {
      return diferenciaPulmon > 0
        ? `Pulmon: +${diferenciaPulmon.toFixed(1)} de promedio sobre ${escaparHtmlMatchmaking(nombreRival)}.`
        : `Pulmon: ${escaparHtmlMatchmaking(nombreRival)} tiene +${Math.abs(diferenciaPulmon).toFixed(1)} de promedio.`;
    }
  }

  return null;
}

function obtenerMejorWinratePuntualMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );

  const candidatos = [];
  (equipo || []).forEach(jugador => {
    const versus = jugador.matchmakingVersus || {};
    Object.entries(versus).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const pj = Number(stat.pj) || 0;
      const victorias = Number(stat.victorias) || 0;
      const winrate = pj > 0 ? (victorias / pj) * 100 : 0;
      if (pj < 3 || victorias < 2 || winrate < 65) return;

      candidatos.push({
        jugador,
        rival: rivalJugador,
        pj,
        victorias,
        winrate,
        score: winrate + (pj * 2)
      });
    });
  });

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function obtenerGolesEquipoPorTramoMatchmaking(equipo = []) {
  const eventos = (equipo || []).flatMap(jugador => obtenerEventosGolesConvertidosMatchmaking(jugador));
  const resumen = calcularDistribucionEventosGolMatchmaking(eventos);
  const ultimoCuarto = Number(resumen.distribucion.t45_plus) || 0;
  return {
    ...resumen,
    ultimoCuarto,
    pctUltimoCuarto: resumen.total > 0 ? (ultimoCuarto / resumen.total) * 100 : 0
  };
}

function obtenerDinamicaEquipoMatchmaking(equipo = []) {
  return (equipo || []).reduce((acc, jugador) => {
    const dinamica = jugador.matchmakingDinamica || {};
    acc.partidos += Number(dinamica.partidos) || 0;
    acc.arrancoPerdiendo += Number(dinamica.arrancoPerdiendo) || 0;
    acc.remontadasGanadas += Number(dinamica.remontadasGanadas) || 0;
    acc.empatesDesdePerdiendo += Number(dinamica.empatesDesdePerdiendo) || 0;
    acc.cagadas += Number(dinamica.cagadas) || Number(jugador.cagadasEnGol) || 0;
    return acc;
  }, {
    partidos: 0,
    arrancoPerdiendo: 0,
    remontadasGanadas: 0,
    empatesDesdePerdiendo: 0,
    cagadas: 0
  });
}

function obtenerCagadasEquipoMatchmaking(equipo = []) {
  const dinamica = obtenerDinamicaEquipoMatchmaking(equipo);
  if (dinamica.partidos > 0) {
    return {
      total: dinamica.cagadas,
      partidos: dinamica.partidos,
      porPartido: dinamica.cagadas / dinamica.partidos
    };
  }

  const total = (equipo || []).reduce((sum, jugador) => sum + (Number(jugador.cagadasEnGol) || 0), 0);
  const partidos = (equipo || []).reduce((sum, jugador) => sum + (Number(jugador.pj) || 0), 0);
  return {
    total,
    partidos,
    porPartido: partidos > 0 ? total / partidos : 0
  };
}

function generarNotaWinratePuntualMatchmaking(equipo, rival) {
  const dominio = obtenerMejorWinratePuntualMatchmaking(equipo, rival);
  if (!dominio) return null;

  return `<strong>${escaparHtmlMatchmaking(dominio.jugador.nombre)}</strong> tiene ${dominio.winrate.toFixed(0)}% de winrate sobre <strong>${escaparHtmlMatchmaking(dominio.rival.nombre)}</strong> (${dominio.victorias}/${dominio.pj} PJ).`;
}

function obtenerMejorRachaVsRivalMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );

  const candidatos = [];
  (equipo || []).forEach(jugador => {
    const versus = jugador.matchmakingVersus || {};
    Object.entries(versus).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const racha = Number(stat.rachaVictoriasActual) || 0;
      const pj = Number(stat.pj) || 0;
      if (racha < 3 || pj < racha) return;

      candidatos.push({
        jugador,
        rival: rivalJugador,
        racha,
        pj,
        score: (racha * 10) + pj
      });
    });
  });

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function generarNotaRachaVsRivalMatchmaking(equipo, rival) {
  const racha = obtenerMejorRachaVsRivalMatchmaking(equipo, rival);
  if (!racha) return null;

  return `Racha puntual: <strong>${escaparHtmlMatchmaking(racha.jugador.nombre)}</strong> trae ${racha.racha} victorias seguidas sobre <strong>${escaparHtmlMatchmaking(racha.rival.nombre)}</strong>.`;
}

function obtenerPeorWinrateParejaMatchmaking(equipo = []) {
  const jugadoresPorId = new Map(
    (equipo || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  const candidatos = [];
  const paresUsados = new Set();

  (equipo || []).forEach(jugador => {
    const juntos = jugador.matchmakingJuntos || {};
    Object.entries(juntos).forEach(([companeroId, stat]) => {
      const companero = jugadoresPorId.get(String(companeroId));
      if (!companero) return;

      const ids = [String(jugador.id), String(companero.id)].sort();
      const key = ids.join(':');
      if (paresUsados.has(key)) return;
      paresUsados.add(key);

      const pj = Number(stat.pj) || 0;
      const victorias = Number(stat.victorias) || 0;
      const winrate = pj > 0 ? (victorias / pj) * 100 : 0;
      if (pj < 3 || winrate > 35) return;

      candidatos.push({
        jugador,
        companero,
        pj,
        winrate,
        score: winrate - (pj * 1.5)
      });
    });
  });

  return candidatos.sort((a, b) => a.score - b.score)[0] || null;
}

function generarNotaParejaNegativaMatchmaking(equipo) {
  const pareja = obtenerPeorWinrateParejaMatchmaking(equipo);
  if (!pareja) return null;

  return `Advertencia dupla: <strong>${escaparHtmlMatchmaking(pareja.jugador.nombre)}</strong> y <strong>${escaparHtmlMatchmaking(pareja.companero.nombre)}</strong> tienen ${pareja.winrate.toFixed(0)}% de winrate juntos (${pareja.pj} PJ).`;
}

function generarNotaUltimoCuartoMatchmaking(equipo, rival) {
  const propio = obtenerGolesEquipoPorTramoMatchmaking(equipo);
  const rivalStats = obtenerGolesEquipoPorTramoMatchmaking(rival);

  if (propio.total < 5 || propio.ultimoCuarto < 2) return null;
  const ventajaPct = propio.pctUltimoCuarto - rivalStats.pctUltimoCuarto;
  if (propio.pctUltimoCuarto < 38 && ventajaPct < 15) return null;

  return `Cierre goleador: ${propio.pctUltimoCuarto.toFixed(0)}% de sus goles registrados fueron en el ultimo cuarto de hora.`;
}

function generarNotaRemontadaMatchmaking(equipo) {
  const dinamica = obtenerDinamicaEquipoMatchmaking(equipo);
  if (dinamica.arrancoPerdiendo < 5) return null;

  const pctVictoria = (dinamica.remontadasGanadas / dinamica.arrancoPerdiendo) * 100;
  if (pctVictoria >= 40) {
    return `Dio vuelta un partido: ${pctVictoria.toFixed(0)}% cuando recibe el primer gol.`;
  }

  if (pctVictoria <= 20) {
    return `Le cuesta darlo vuelta: ${pctVictoria.toFixed(0)}% cuando recibe el primer gol.`;
  }

  return null;
}

function generarNotaCagadasMatchmaking(equipo, rival, nombreRival) {
  const propio = obtenerCagadasEquipoMatchmaking(equipo);
  const rivalStats = obtenerCagadasEquipoMatchmaking(rival);
  if (propio.partidos < 10 || propio.porPartido < 0.18) return null;
  if (propio.porPartido < rivalStats.porPartido + 0.08 && propio.porPartido < 0.3) return null;

  if (rivalStats.porPartido <= 0) return null;

  const pctMas = ((propio.porPartido - rivalStats.porPartido) / rivalStats.porPartido) * 100;
  if (pctMas < 25 && propio.porPartido < 0.3) return null;

  return `Cagadas: ${pctMas.toFixed(0)}% mas que ${escaparHtmlMatchmaking(nombreRival)}.`;
}

function obtenerDueloGoleadorArqueroMatchmaking(equipo, arqueroRival) {
  if (!arqueroRival) return null;

  const jugadoresPorId = new Map(
    (equipo || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  if (jugadoresPorId.size === 0) return null;

  const conteo = new Map();
  obtenerEventosGolesRecibidosArqueroMatchmaking(arqueroRival).forEach(evento => {
    const goleadorId = evento?.goleador_id ? String(evento.goleador_id) : '';
    if (!goleadorId || !jugadoresPorId.has(goleadorId)) return;
    conteo.set(goleadorId, (conteo.get(goleadorId) || 0) + 1);
  });

  return [...conteo.entries()]
    .map(([id, goles]) => ({ jugador: jugadoresPorId.get(id), goles }))
    .filter(item => item.goles >= 2)
    .sort((a, b) => b.goles - a.goles)[0] || null;
}

function agregarNotaAtencionMatchmaking(notas, usadas, score, html, key = html) {
  if (!html || usadas.has(key)) return;
  usadas.add(key);
  notas.push({ score, html });
}

function generarNotasAtencionEquipoMatchmaking(resultado, equipoKey) {
  const equipo = resultado?.[equipoKey]?.jugadores || [];
  const rivalKey = equipoKey === 'equipo1' ? 'equipo2' : 'equipo1';
  const rival = resultado?.[rivalKey]?.jugadores || [];
  const nombreRival = rivalKey === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
  const notas = [];
  const usadas = new Set();
  const arqueroPropio = obtenerArqueroPrincipalEquipoMatchmaking(equipo);
  const arqueroRival = obtenerArqueroPrincipalEquipoMatchmaking(rival);
  const goleadorPropio = obtenerMejorGoleadorEquipoMatchmaking(equipo);
  const goleadorRival = obtenerMejorGoleadorEquipoMatchmaking(rival);
  const duelo = obtenerDueloGoleadorArqueroMatchmaking(equipo, arqueroRival);
  const notaWinratePuntual = generarNotaWinratePuntualMatchmaking(equipo, rival);

  if (duelo && arqueroRival) {
    agregarNotaAtencionMatchmaking(
      notas,
      usadas,
      100,
      `Explotar el duelo: <strong>${escaparHtmlMatchmaking(duelo.jugador.nombre)}</strong> ya le hizo <strong>${duelo.goles}</strong> goles a <strong>${escaparHtmlMatchmaking(arqueroRival.nombre)}</strong>.`,
      `duelo:${duelo.jugador.id}:${arqueroRival.id}`
    );
  }

  agregarNotaAtencionMatchmaking(notas, usadas, 96, notaWinratePuntual, 'winrate-puntual');
  agregarNotaAtencionMatchmaking(notas, usadas, 95, generarNotaRachaVsRivalMatchmaking(equipo, rival), 'racha-vs-rival');
  agregarNotaAtencionMatchmaking(notas, usadas, 94, generarNotaParejaNegativaMatchmaking(equipo), 'pareja-negativa');
  agregarNotaAtencionMatchmaking(notas, usadas, 90, generarNotaUltimoCuartoMatchmaking(equipo, rival), 'ultimo-cuarto');
  agregarNotaAtencionMatchmaking(notas, usadas, 84, generarNotaRemontadaMatchmaking(equipo), 'remontada');
  agregarNotaAtencionMatchmaking(notas, usadas, 80, generarNotaCagadasMatchmaking(equipo, rival, nombreRival), 'cagadas');

  if (goleadorRival) {
    const nombre = escaparHtmlMatchmaking(goleadorRival.jugador.nombre);
    if (goleadorRival.tramo) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        92,
        `Cuidar a <strong>${nombre}</strong> en el tramo <strong>${goleadorRival.tramo.label}</strong>: ahi hizo el ${goleadorRival.tramo.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `rival-scorer-time:${goleadorRival.jugador.id}`
      );
    } else {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        78,
        `Cuidar a <strong>${nombre}</strong>: suma ${goleadorRival.goles} goles (${goleadorRival.golesPP.toFixed(2)}/PJ) en el historial.`,
        `rival-scorer:${goleadorRival.jugador.id}`
      );
    }
  }

  if (goleadorPropio && (!duelo || String(duelo.jugador.id) !== String(goleadorPropio.jugador.id))) {
    const nombre = escaparHtmlMatchmaking(goleadorPropio.jugador.nombre);
    if (goleadorPropio.tramo) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        88,
        `Buscar a <strong>${nombre}</strong> en el <strong>${goleadorPropio.tramo.label}</strong>: ahi hizo el ${goleadorPropio.tramo.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `own-scorer-time:${goleadorPropio.jugador.id}`
      );
    } else {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        70,
        `Buscar a <strong>${nombre}</strong>: es el mejor promedio de gol del equipo (${goleadorPropio.golesPP.toFixed(2)}/PJ).`,
        `own-scorer:${goleadorPropio.jugador.id}`
      );
    }
  }

  if (arqueroPropio) {
    const tramoRecibidos = obtenerTramoDominanteGolesJugadorMatchmaking(arqueroPropio, 'recibidos');
    const statsArquero = obtenerStatsArqueroMatchmaking(arqueroPropio);
    const nombre = escaparHtmlMatchmaking(arqueroPropio.nombre);

    if (tramoRecibidos) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        86,
        `Proteger a <strong>${nombre}</strong> en el <strong>${tramoRecibidos.label}</strong>: ahi recibio el ${tramoRecibidos.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `own-keeper-time:${arqueroPropio.id}`
      );
    } else if (statsArquero.golesRecibidos >= 3 && statsArquero.atajadasPorGol !== null && statsArquero.atajadasPorGol < 1.25) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        72,
        `No exponer a <strong>${nombre}</strong>: su ratio es ${statsArquero.atajadasPorGol.toFixed(2)} atajadas por gol recibido.`,
        `own-keeper-ratio:${arqueroPropio.id}`
      );
    }
  }

  if (arqueroRival) {
    const statsRival = obtenerStatsArqueroMatchmaking(arqueroRival);
    const nombre = escaparHtmlMatchmaking(arqueroRival.nombre);
    if (statsRival.golesRecibidos >= 3 && statsRival.atajadasPorGol !== null && statsRival.atajadasPorGol < 1.25) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        82,
        `Probar al arco contra <strong>${nombre}</strong>: recibe bastante para su volumen de atajadas (${statsRival.atajadasPorGol.toFixed(2)} ataj/GR).`,
        `rival-keeper-weak:${arqueroRival.id}`
      );
    } else if (statsRival.atajadas >= 5 && statsRival.atajadasPorGol !== null && statsRival.atajadasPorGol >= 2.2) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        68,
        `Elegir mejor el tiro ante <strong>${nombre}</strong>: sostiene ${statsRival.atajadasPorGol.toFixed(2)} atajadas por gol recibido.`,
        `rival-keeper-strong:${arqueroRival.id}`
      );
    }
  }

  agregarNotaAtencionMatchmaking(notas, usadas, 64, generarNotaFisicaMatchmaking(equipo, rival, nombreRival), 'fisica');

  if (notas.length === 0) {
    const statsEquipo = resultado?.[equipoKey]?.estadisticas || {};
    const statsRival = resultado?.[rivalKey]?.estadisticas || {};
    const golesFavor = numeroSeguroMatchmaking(statsEquipo.golesFavorPromedio);
    const golesRival = numeroSeguroMatchmaking(statsRival.golesFavorPromedio);
    const golesRecibidos = numeroSeguroMatchmaking(statsEquipo.golesRecibidosPromedio);
    const recibidosRival = numeroSeguroMatchmaking(statsRival.golesRecibidosPromedio);

    if (golesRecibidos > recibidosRival + 0.25) {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Cuidar perdidas y cierres: historicamente este grupo recibe mas goles por partido que el rival.', 'fallback-defense');
    } else if (golesFavor > golesRival + 0.25) {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Acelerar cuando recuperen: el equipo tiene mejor promedio historico de goles a favor.', 'fallback-attack');
    } else {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Partido parejo: priorizar marcas sobre los goleadores y administrar el ritmo antes de abrirse.', 'fallback-balance');
    }
  }

  return notas
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(nota => nota.html);
}

function renderizarNotasAtencionEquipoMatchmaking(resultado, equipoKey) {
  const notas = generarNotasAtencionEquipoMatchmaking(resultado, equipoKey);
  if (notas.length === 0) return '';

  return `
    <div class="matchmaking-attention">
      <div class="matchmaking-attention-title">
        A que prestar atencion
      </div>
      <ul class="matchmaking-attention-list">
        ${notas.map(nota => `
          <li>
            <span class="matchmaking-attention-icon">${iconoNotaAtencionMatchmaking(nota)}</span>
            <span>${nota}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function iconoNotaAtencionMatchmaking(nota = '') {
  const texto = String(nota).toLowerCase();
  if (texto.includes('advertencia') || texto.includes('cagadas') || texto.includes('no exponer') || texto.includes('le cuesta')) {
    return '<i class="bi bi-exclamation-triangle-fill"></i>';
  }
  if (texto.includes('racha')) return '<i class="bi bi-calendar2-check-fill"></i>';
  if (texto.includes('winrate') || texto.includes('duelo')) return '<i class="bi bi-diagram-3-fill"></i>';
  if (texto.includes('gol') || texto.includes('tiro')) return '<i class="bi bi-bullseye"></i>';
  if (texto.includes('vuelta') || texto.includes('remont')) return '<i class="bi bi-arrow-return-right"></i>';
  if (texto.includes('fisico') || texto.includes('pulmon')) return '<i class="bi bi-heart-pulse-fill"></i>';
  return '<i class="bi bi-lightning-charge-fill"></i>';
}

// Función para mostrar los resultados
function obtenerCalculadorMatchmaking() {
  return geneticOptimizer instanceof GeneticTeamOptimizer ? geneticOptimizer : new GeneticTeamOptimizer();
}

function convertirStatsEquipoAFitnessMatchmaking(stats = {}) {
  const jugadores = Math.max(1, Number(stats.jugadores) || 0);
  const playersWithHeatmap = Number(stats.heatmapPlayers) || 0;
  return {
    rendimientoTotal: (Number(stats.rendimientoTotal) || 0) / jugadores,
    rendimientoAtaque: (Number(stats.rendimientoAtaque) || 0) / jugadores,
    rendimientoArquero: (Number(stats.rendimientoArquero) || 0) / jugadores,
    golesFavorEquipo: Number(stats.golesFavorPromedio) || 0,
    golesRecibidosEquipo: Number(stats.golesRecibidosPromedio) || 0,
    pulmonTrackingTotal: numeroSeguroMatchmaking(stats.pulmonTrackingTotal ?? stats.pulmonTotal),
    scoreDefensivoTotal: numeroSeguroMatchmaking(stats.scoreDefensivoTotal),
    cantidadArqueros: Number(stats.cantidadArqueros) || 0,
    armoniaHeatmap: {
      playersWithHeatmap,
      coveragePct: numeroSeguroMatchmaking(stats.heatmapCoveragePct),
      overlapPct: numeroSeguroMatchmaking(stats.heatmapOverlapPct),
      score: numeroSeguroMatchmaking(stats.armoniaHeatmapScore),
      usable: Boolean(stats.heatmapHarmonyUsable) || playersWithHeatmap >= 2
    }
  };
}

function recalcularResultadoIntercambioMatchmaking(resultado) {
  if (!resultado?.equipo1?.jugadores || !resultado?.equipo2?.jugadores) return resultado;

  const calculador = obtenerCalculadorMatchmaking();
  resultado.equipo1.estadisticas = calculador.calcularEstadisticasEquipo(resultado.equipo1.jugadores);
  resultado.equipo2.estadisticas = calculador.calcularEstadisticasEquipo(resultado.equipo2.jugadores);
  resultado.fitness = calculador.calcularFitnessBalanceado(
    convertirStatsEquipoAFitnessMatchmaking(resultado.equipo1.estadisticas),
    convertirStatsEquipoAFitnessMatchmaking(resultado.equipo2.estadisticas)
  );

  return resultado;
}

function obtenerJugadorResultadoIntercambioMatchmaking(resultado, equipoKey, index) {
  const jugadores = resultado?.[equipoKey]?.jugadores;
  if (!Array.isArray(jugadores)) return null;
  return jugadores[Number(index)] || null;
}

function actualizarAsignacionLiveDesdeResultadoMatchmaking(resultado) {
  if (!resultado?.equipo1?.jugadores || !resultado?.equipo2?.jugadores) return {};

  const asignacion = {};
  resultado.equipo1.jugadores.forEach(jugador => {
    asignacion[String(jugador.id || jugador.nombre)] = 0;
  });
  resultado.equipo2.jugadores.forEach(jugador => {
    asignacion[String(jugador.id || jugador.nombre)] = 1;
  });

  resultado.matchmakingLive = {
    ...(resultado.matchmakingLive || {}),
    asignacion,
    manualSwap: true
  };
  asignacionLiveAnterior = { ...asignacion };
  return asignacion;
}

function renderizarDespuesIntercambioMatchmaking(resultado, scope = 'resultado', feedbackHtml = '') {
  if (scope === 'live') {
    resultadoLiveMatchmaking = resultado;
    window.ultimoResultadoGenetico = resultado;
    actualizarAsignacionLiveDesdeResultadoMatchmaking(resultado);
    renderizarPreviewLiveMatchmaking(resultado, resultado.matchmakingLive?.asignacion || {}, 'intercambio');
    if (feedbackHtml) {
      const feedback = document.getElementById('matchmaking-live-feedback');
      if (feedback) feedback.innerHTML = feedbackHtml;
    }
    validarEjecucion();
    return;
  }

  mostrarResultados(resultado);
}

window.cancelarIntercambioMatchmaking = function(scope = 'resultado') {
  seleccionIntercambioMatchmaking = null;
  const resultado = scope === 'live' ? resultadoLiveMatchmaking : window.ultimoResultadoGenetico;
  if (resultado) renderizarDespuesIntercambioMatchmaking(resultado, scope);
};

window.toggleMetricasMatchmaking = function(button) {
  const root = button?.closest('.matchmaking-stats');
  if (!root) return;
  const rows = Array.from(root.querySelectorAll('[data-matchmaking-empty="true"]'));
  if (rows.length === 0) return;
  const shouldShow = rows.some(row => row.hidden);
  rows.forEach(row => {
    row.hidden = !shouldShow;
  });
  button.textContent = shouldShow
    ? 'Ocultar metricas sin datos'
    : `Ver metricas sin datos (${rows.length})`;
};

window.seleccionarJugadorIntercambioMatchmaking = function(equipoKey, index, scope = 'resultado') {
  const resultado = scope === 'live' ? resultadoLiveMatchmaking : window.ultimoResultadoGenetico;
  const equipoValido = equipoKey === 'equipo1' || equipoKey === 'equipo2';
  const jugador = equipoValido ? obtenerJugadorResultadoIntercambioMatchmaking(resultado, equipoKey, index) : null;
  if (!jugador) return;

  if (!seleccionIntercambioMatchmaking || seleccionIntercambioMatchmaking.scope !== scope) {
    seleccionIntercambioMatchmaking = { equipoKey, index: Number(index), scope };
    renderizarDespuesIntercambioMatchmaking(resultado, scope);
    return;
  }

  const seleccion = seleccionIntercambioMatchmaking;
  if (seleccion.equipoKey === equipoKey) {
    seleccionIntercambioMatchmaking =
      Number(seleccion.index) === Number(index) ? null : { equipoKey, index: Number(index), scope };
    renderizarDespuesIntercambioMatchmaking(resultado, scope);
    return;
  }

  const jugadorSeleccionado = obtenerJugadorResultadoIntercambioMatchmaking(resultado, seleccion.equipoKey, seleccion.index);
  if (!jugadorSeleccionado) {
    seleccionIntercambioMatchmaking = { equipoKey, index: Number(index), scope };
    renderizarDespuesIntercambioMatchmaking(resultado, scope);
    return;
  }

  const equipoOrigen = resultado[seleccion.equipoKey].jugadores;
  const equipoDestino = resultado[equipoKey].jugadores;
  equipoOrigen[Number(seleccion.index)] = jugador;
  equipoDestino[Number(index)] = jugadorSeleccionado;

  seleccionIntercambioMatchmaking = null;
  recalcularResultadoIntercambioMatchmaking(resultado);
  renderizarDespuesIntercambioMatchmaking(
    resultado,
    scope,
    `Intercambio manual: <b>${escaparHtmlMatchmaking(jugadorSeleccionado.nombre)}</b> &harr; <b>${escaparHtmlMatchmaking(jugador.nombre)}</b>`
  );

  if (typeof window.showToast === 'function') {
    window.showToast('Equipos recalculados tras el intercambio', 'success');
  }
};

function renderizarEstadoIntercambioMatchmaking(resultado, scope = 'resultado') {
  if (!seleccionIntercambioMatchmaking || seleccionIntercambioMatchmaking.scope !== scope) return '';

  const jugador = obtenerJugadorResultadoIntercambioMatchmaking(
    resultado,
    seleccionIntercambioMatchmaking.equipoKey,
    seleccionIntercambioMatchmaking.index
  );
  if (!jugador) return '';

  const equipoTexto = seleccionIntercambioMatchmaking.equipoKey === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
  return `
    <div class="matchmaking-swap-status mt-3">
      <span>
        <i class="bi bi-arrow-left-right me-1"></i>
        Seleccionado: <strong>${escaparHtmlMatchmaking(jugador.nombre)}</strong>
        <small>${equipoTexto}</small>
      </span>
      <button type="button" class="btn btn-sm btn-outline-light" onclick="cancelarIntercambioMatchmaking('${scope}')">
        Cancelar
      </button>
    </div>
  `;
}

function formatearNumeroMatchmaking(valor, decimales = 1, sufijo = '') {
  return `${numeroSeguroMatchmaking(valor).toFixed(decimales)}${sufijo}`;
}

function porcentajeRendimientoEquipoMatchmaking(stats1 = {}, stats2 = {}) {
  const rendimiento1 = Math.max(0, numeroSeguroMatchmaking(stats1.rendimientoTotal));
  const rendimiento2 = Math.max(0, numeroSeguroMatchmaking(stats2.rendimientoTotal));
  const total = rendimiento1 + rendimiento2;
  if (total <= 0) return { equipo1: 50, equipo2: 50 };
  return {
    equipo1: (rendimiento1 / total) * 100,
    equipo2: (rendimiento2 / total) * 100
  };
}

function obtenerVeredictoBalanceMatchmaking(stats1 = {}, stats2 = {}) {
  const rendimiento1 = numeroSeguroMatchmaking(stats1.rendimientoTotal);
  const rendimiento2 = numeroSeguroMatchmaking(stats2.rendimientoTotal);
  const delta = Math.abs(rendimiento1 - rendimiento2);
  const lider = rendimiento1 >= rendimiento2 ? 'Equipo 1' : 'Equipo 2';

  if (delta <= 1) {
    return {
      clase: 'is-even',
      texto: `&check; Partido parejo &middot; &Delta; ${delta.toFixed(1)} pts`
    };
  }

  if (delta <= 4) {
    return {
      clase: 'is-edge',
      texto: `${lider} apenas arriba &middot; &Delta; ${delta.toFixed(1)} pts`
    };
  }

  return {
    clase: 'is-gap',
    texto: `Ventaja ${lider} &middot; &Delta; ${delta.toFixed(1)} pts`
  };
}

function renderizarContextoMatchmaking(etiquetaBaseRendimiento) {
  return `
    <div class="matchmaking-result-mode">
      <div>
        <i class="bi bi-sliders me-2"></i>
        Base de balance: <strong>${escaparHtmlMatchmaking(etiquetaBaseRendimiento)}</strong>
      </div>
      <div class="small mt-1">Toca un jugador de cada equipo para intercambiarlos y recalcular el armado.</div>
    </div>
  `;
}

function renderizarBalanzaMatchmaking(resultado) {
  const stats1 = resultado.equipo1.estadisticas;
  const stats2 = resultado.equipo2.estadisticas;
  const rendimientoPct = porcentajeRendimientoEquipoMatchmaking(stats1, stats2);
  const veredicto = obtenerVeredictoBalanceMatchmaking(stats1, stats2);
  return `
    <section class="matchmaking-beam">
      <div class="matchmaking-beam__scores">
        <div>
          <div class="matchmaking-beam__score" style="color:${MATCHMAKING_TEAM_THEMES.equipo1.color};">${stats1.rendimientoTotal.toFixed(1)}</div>
          <div class="matchmaking-beam__label">Equipo 1</div>
        </div>
        <span class="matchmaking-beam__chip ${veredicto.clase}">${veredicto.texto}</span>
        <div style="text-align:right;">
          <div class="matchmaking-beam__score" style="color:${MATCHMAKING_TEAM_THEMES.equipo2.color};">${stats2.rendimientoTotal.toFixed(1)}</div>
          <div class="matchmaking-beam__label">Equipo 2</div>
        </div>
      </div>
      <div class="matchmaking-beam__track">
        <div class="matchmaking-beam__side" style="width:${rendimientoPct.equipo1.toFixed(1)}%; background:${MATCHMAKING_TEAM_THEMES.equipo1.color};"></div>
        <div class="matchmaking-beam__side" style="width:${rendimientoPct.equipo2.toFixed(1)}%; background:${MATCHMAKING_TEAM_THEMES.equipo2.color};"></div>
        <div class="matchmaking-beam__mid"></div>
      </div>
      <div class="matchmaking-beam__pcts">
        <span>${rendimientoPct.equipo1.toFixed(1)}% del rendimiento</span>
        <span>${rendimientoPct.equipo2.toFixed(1)}% del rendimiento</span>
      </div>
    </section>
  `;
}

function renderizarTotalesEquipoMatchmaking(resultado, equipoKey) {
  const stats = resultado?.[equipoKey]?.estadisticas || {};
  const tienePulmonPromedio = numeroSeguroMatchmaking(stats.jugadoresConPulmonTracking) > 0;
  const pulmonValor = tienePulmonPromedio
    ? stats.pulmonPromedio
    : (stats.pulmonTrackingTotal ?? stats.pulmonTotal);
  return `
    <div class="matchmaking-team-totals">
      <div class="matchmaking-team-total-row">
        <span>Rendimiento total</span>
        <b>${formatearNumeroMatchmaking(stats.rendimientoTotal, 1)}</b>
      </div>
      <div class="matchmaking-team-total-row">
        <span>Ataque</span>
        <span>${formatearNumeroMatchmaking(stats.rendimientoAtaque, 1)}</span>
      </div>
      <div class="matchmaking-team-total-row">
        <span>Arquero</span>
        <span>${formatearNumeroMatchmaking(stats.rendimientoArquero, 1)}</span>
      </div>
      <div class="matchmaking-team-total-row">
        <span>Defensa</span>
        <span>${formatearNumeroMatchmaking(stats.scoreDefensivoTotal, 1)}</span>
      </div>
      <div class="matchmaking-team-total-row">
        <span>Pulmon</span>
        <span>${formatearNumeroMatchmaking(pulmonValor, 1)}</span>
      </div>
    </div>
  `;
}

function renderizarEquipoBalanceMatchmaking(resultado, equipoKey, opciones = {}) {
  const tema = MATCHMAKING_TEAM_THEMES[equipoKey] || MATCHMAKING_TEAM_THEMES.equipo1;
  const jugadores = resultado?.[equipoKey]?.jugadores || [];
  const subtitulo = opciones.intercambio === false ? 'plantel sugerido' : 'clic para intercambiar';
  return `
    <section class="matchmaking-team-panel" style="--team-color:${tema.color}; --team-soft:${tema.soft};">
      <header class="matchmaking-team-panel__header">
        <span class="matchmaking-team-panel__dot"></span>
        <h3>${tema.name}</h3>
        <span class="matchmaking-team-panel__sub">${subtitulo}</span>
      </header>
      <div class="matchmaking-team-players">
        ${jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, equipoKey, index, opciones)).join('')}
      </div>
      ${renderizarTotalesEquipoMatchmaking(resultado, equipoKey)}
    </section>
  `;
}

window.toggleDimensionMatchmaking = function(button) {
  const row = button?.closest('.matchmaking-dim');
  if (!row) return;
  const abierto = row.classList.toggle('is-open');
  button.setAttribute('aria-expanded', abierto ? 'true' : 'false');
};

function nombreEquipoMatchmaking(equipoKey) {
  return equipoKey === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
}

function crearDimensionAnalisisMatchmaking(opciones) {
  const valor1 = numeroSeguroMatchmaking(opciones.valor1);
  const valor2 = numeroSeguroMatchmaking(opciones.valor2);
  const decimales = opciones.decimales ?? 1;
  const sufijo = opciones.sufijo || '';
  const formatear = opciones.formato || ((valor) => formatearNumeroMatchmaking(valor, decimales, sufijo));
  const diferenciaBase = opciones.menorEsMejor ? valor2 - valor1 : valor1 - valor2;
  const diferenciaAbsoluta = Math.abs(diferenciaBase);
  const umbral = numeroSeguroMatchmaking(opciones.umbral, 0);
  const balanceada = diferenciaAbsoluta <= umbral;
  const ganador = balanceada ? '' : (diferenciaBase > 0 ? 'equipo1' : 'equipo2');
  const escala = Math.max(numeroSeguroMatchmaking(opciones.escala, diferenciaAbsoluta || 1), diferenciaAbsoluta || 1);
  const ancho = balanceada
    ? 7
    : clampMatchmaking((diferenciaAbsoluta / escala) * 44, 8, 44);
  const detalle = opciones.detalle || '';
  const numeros = opciones.numeros || `${opciones.label} - Equipo 1: ${formatear(valor1)} | Equipo 2: ${formatear(valor2)}`;

  return {
    key: opciones.key,
    label: opciones.label,
    valor1,
    valor2,
    valor1Texto: formatear(valor1),
    valor2Texto: formatear(valor2),
    diferenciaAbsoluta,
    balanceada,
    ganador,
    ancho,
    detalle,
    numeros
  };
}

function dimensionesAnalisisMatchmaking(resultado) {
  const e1 = resultado?.equipo1?.estadisticas || {};
  const e2 = resultado?.equipo2?.estadisticas || {};
  const cagadas1 = obtenerCagadasEquipoMatchmaking(resultado?.equipo1?.jugadores || []);
  const cagadas2 = obtenerCagadasEquipoMatchmaking(resultado?.equipo2?.jugadores || []);
  const fisico1 = numeroSeguroMatchmaking(e1.pulmonPromedio);
  const fisico2 = numeroSeguroMatchmaking(e2.pulmonPromedio);
  const fisicoLabel = fisico1 > 0 || fisico2 > 0 ? 'Pulmon promedio' : 'Pulmon total';
  const fisicoValor1 = fisico1 > 0 || fisico2 > 0 ? fisico1 : numeroSeguroMatchmaking(e1.pulmonTrackingTotal ?? e1.pulmonTotal);
  const fisicoValor2 = fisico1 > 0 || fisico2 > 0 ? fisico2 : numeroSeguroMatchmaking(e2.pulmonTrackingTotal ?? e2.pulmonTotal);

  return [
    crearDimensionAnalisisMatchmaking({
      key: 'general',
      label: 'General',
      valor1: e1.rendimientoTotal,
      valor2: e2.rendimientoTotal,
      decimales: 1,
      umbral: 1,
      escala: 12,
      detalle: 'Rendimiento total usado por el algoritmo para contestar si el partido quedo parejo.',
      numeros: `Puntos - Equipo 1: ${formatearNumeroMatchmaking(e1.rendimientoTotal, 1)} | Equipo 2: ${formatearNumeroMatchmaking(e2.rendimientoTotal, 1)}`
    }),
    crearDimensionAnalisisMatchmaking({
      key: 'experiencia',
      label: 'Experiencia',
      valor1: e1.winratePromedio,
      valor2: e2.winratePromedio,
      decimales: 1,
      sufijo: '%',
      umbral: 4,
      escala: 25,
      detalle: 'Compara el winrate promedio del equipo. Sirve como proxy de experiencia competitiva.',
      numeros: `Winrate promedio - Equipo 1: ${formatearNumeroMatchmaking(e1.winratePromedio, 1, '%')} | Equipo 2: ${formatearNumeroMatchmaking(e2.winratePromedio, 1, '%')}`
    }),
    crearDimensionAnalisisMatchmaking({
      key: 'arquero',
      label: 'Arquero',
      valor1: e1.rendimientoArquero,
      valor2: e2.rendimientoArquero,
      decimales: 1,
      umbral: 2,
      escala: 20,
      detalle: 'Suma el rendimiento asignado a quienes juegan como arquero en cada equipo.',
      numeros: `Rendimiento arquero - Equipo 1: ${formatearNumeroMatchmaking(e1.rendimientoArquero, 1)} | Equipo 2: ${formatearNumeroMatchmaking(e2.rendimientoArquero, 1)}`
    }),
    crearDimensionAnalisisMatchmaking({
      key: 'solidez',
      label: 'Solidez',
      valor1: cagadas1.porPartido,
      valor2: cagadas2.porPartido,
      decimales: 2,
      menorEsMejor: true,
      umbral: 0.12,
      escala: 0.6,
      detalle: 'Compara cagadas por partido estimadas para el grupo. En esta dimension, menos es mejor.',
      numeros: `Cagadas/PJ - Equipo 1: ${formatearNumeroMatchmaking(cagadas1.porPartido, 2)} | Equipo 2: ${formatearNumeroMatchmaking(cagadas2.porPartido, 2)}`
    }),
    crearDimensionAnalisisMatchmaking({
      key: 'ataque',
      label: 'Ataque',
      valor1: e1.golesFavorPromedio,
      valor2: e2.golesFavorPromedio,
      decimales: 2,
      umbral: 0.25,
      escala: 1.2,
      detalle: 'Compara goles a favor por partido del grupo, una lectura directa del potencial ofensivo.',
      numeros: `Goles a favor/PJ - Equipo 1: ${formatearNumeroMatchmaking(e1.golesFavorPromedio, 2)} | Equipo 2: ${formatearNumeroMatchmaking(e2.golesFavorPromedio, 2)}`
    }),
    crearDimensionAnalisisMatchmaking({
      key: 'fisico',
      label: 'Fisico',
      valor1: fisicoValor1,
      valor2: fisicoValor2,
      decimales: 1,
      umbral: 1,
      escala: 8,
      detalle: 'Compara la capacidad fisica disponible con el mejor dato de pulmon/tracking que tenga cada jugador.',
      numeros: `${fisicoLabel} - Equipo 1: ${formatearNumeroMatchmaking(fisicoValor1, 1)} | Equipo 2: ${formatearNumeroMatchmaking(fisicoValor2, 1)}`
    })
  ];
}

function renderizarDimensionAnalisisMatchmaking(dimension, index) {
  const fillClass = dimension.balanceada
    ? 'is-even'
    : (dimension.ganador === 'equipo1' ? 'to1' : 'to2');
  const e1Win = dimension.ganador === 'equipo1';
  const e2Win = dimension.ganador === 'equipo2';
  return `
    <div class="matchmaking-dim ${dimension.balanceada ? 'is-balanced' : ''} ${index === 0 ? 'is-open' : ''}">
      <button type="button" class="matchmaking-dim__head" onclick="toggleDimensionMatchmaking(this)" aria-expanded="${index === 0 ? 'true' : 'false'}">
        <span class="matchmaking-dim__value is-left ${e1Win ? 'is-win' : ''}">${escaparHtmlMatchmaking(dimension.valor1Texto)}</span>
        <span class="matchmaking-dim__bar">
          <span class="matchmaking-dim__name">${escaparHtmlMatchmaking(dimension.label)}${dimension.balanceada ? ' <b>=</b>' : ''}</span>
          <span class="matchmaking-dim__track"></span>
          <span class="matchmaking-dim__mid"></span>
          <span class="matchmaking-dim__fill ${fillClass}" style="width:${dimension.ancho.toFixed(1)}%;"></span>
        </span>
        <span class="matchmaking-dim__value is-right ${e2Win ? 'is-win' : ''}">${escaparHtmlMatchmaking(dimension.valor2Texto)}</span>
      </button>
      <div class="matchmaking-dim__detail">
        ${escaparHtmlMatchmaking(dimension.detalle)}
        <span>${escaparHtmlMatchmaking(dimension.numeros)}</span>
      </div>
    </div>
  `;
}

const MATCHMAKING_RADAR_AXES = [
  { key: 'arquero', label: 'Arquero' },
  { key: 'defensa', label: 'Defensa' },
  { key: 'medio', label: 'Medio' },
  { key: 'ataque', label: 'Ataque' }
];

function calcularRadarRolesEquipoMatchmaking(jugadores = []) {
  const buckets = MATCHMAKING_RADAR_AXES.reduce((acc, axis) => {
    acc[axis.key] = [];
    return acc;
  }, {});

  jugadores.forEach(jugador => {
    const rol = obtenerRolCanchaLiveMatchmaking(jugador, { incluirArquero: true });
    if (!rol) return;
    const key = rol === 'arquero' || rol === 'defensa' || rol === 'ataque' ? rol : 'medio';
    const valor = key === 'arquero'
      ? numeroSeguroMatchmaking(jugador.rendimientoArquero || (jugador.rolPartido === ROL_PARTIDO_ARQUERO ? jugador.rendimientoTotal : 0))
      : numeroSeguroMatchmaking(jugador.skillMatchmaking ?? jugador.rendimientoTotal);
    if (valor > 0) buckets[key].push(valor);
  });

  return MATCHMAKING_RADAR_AXES.reduce((acc, axis) => {
    const valores = buckets[axis.key] || [];
    acc[axis.key] = valores.length
      ? valores.reduce((sum, valor) => sum + valor, 0) / valores.length
      : 0;
    return acc;
  }, {});
}

function puntoRadarMatchmaking(index, frac, cx = 150, cy = 112, radio = 74) {
  const angulo = -Math.PI / 2 + index * (2 * Math.PI / MATCHMAKING_RADAR_AXES.length);
  return [
    cx + Math.cos(angulo) * radio * frac,
    cy + Math.sin(angulo) * radio * frac
  ];
}

function puntosPoligonoRadarMatchmaking(valores) {
  return valores
    .map((valor, index) => puntoRadarMatchmaking(index, valor).map(n => n.toFixed(1)).join(','))
    .join(' ');
}

function renderizarCirculosRadarMatchmaking(valores, clase) {
  return valores.map((valor, index) => {
    const [x, y] = puntoRadarMatchmaking(index, valor);
    return `<circle class="${clase}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"></circle>`;
  }).join('');
}

function renderizarRadarSuperpuestoMatchmaking(resultado) {
  const raw1 = calcularRadarRolesEquipoMatchmaking(resultado?.equipo1?.jugadores || []);
  const raw2 = calcularRadarRolesEquipoMatchmaking(resultado?.equipo2?.jugadores || []);
  const valores1 = MATCHMAKING_RADAR_AXES.map(axis => {
    const max = Math.max(100, raw1[axis.key] || 0, raw2[axis.key] || 0);
    return raw1[axis.key] > 0 ? clampMatchmaking(raw1[axis.key] / max, 0.08, 1) : 0.08;
  });
  const valores2 = MATCHMAKING_RADAR_AXES.map(axis => {
    const max = Math.max(100, raw1[axis.key] || 0, raw2[axis.key] || 0);
    return raw2[axis.key] > 0 ? clampMatchmaking(raw2[axis.key] / max, 0.08, 1) : 0.08;
  });

  return `
    <div class="matchmaking-radar-box">
      <h4>Rendimiento por tracking</h4>
      <svg viewBox="0 0 300 220" role="img" aria-label="Radar comparativo segun posicion dominante de tracking">
        ${[0.33, 0.66, 1].map(frac => `
          <polygon class="matchmaking-radar-grid" points="${puntosPoligonoRadarMatchmaking(MATCHMAKING_RADAR_AXES.map(() => frac))}"></polygon>
        `).join('')}
        ${MATCHMAKING_RADAR_AXES.map((axis, index) => {
          const [x, y] = puntoRadarMatchmaking(index, 1);
          const [lx, ly] = puntoRadarMatchmaking(index, 1.23);
          return `
            <line class="matchmaking-radar-axis" x1="150" y1="112" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line>
            <text class="matchmaking-radar-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}">${escaparHtmlMatchmaking(axis.label)}</text>
          `;
        }).join('')}
        <polygon class="matchmaking-radar-area is-team-1" points="${puntosPoligonoRadarMatchmaking(valores1)}"></polygon>
        <polygon class="matchmaking-radar-area is-team-2" points="${puntosPoligonoRadarMatchmaking(valores2)}"></polygon>
        ${renderizarCirculosRadarMatchmaking(valores1, 'matchmaking-radar-dot is-team-1')}
        ${renderizarCirculosRadarMatchmaking(valores2, 'matchmaking-radar-dot is-team-2')}
      </svg>
      <div class="matchmaking-radar-legend">
        <span><i style="background:${MATCHMAKING_TEAM_THEMES.equipo1.color};"></i>Equipo 1</span>
        <span><i style="background:${MATCHMAKING_TEAM_THEMES.equipo2.color};"></i>Equipo 2</span>
      </div>
    </div>
  `;
}

function renderizarAnalisisEmparejamientoMatchmaking(resultado) {
  const dimensiones = dimensionesAnalisisMatchmaking(resultado);
  return `
    <section class="matchmaking-analysis-panel">
      <h3>Analisis del emparejamiento</h3>
      <p>La barra se inclina hacia el equipo favorecido. Toca una dimension para ver el detalle.</p>
      <div class="matchmaking-dim-list">
        ${dimensiones.map((dimension, index) => renderizarDimensionAnalisisMatchmaking(dimension, index)).join('')}
      </div>
      ${renderizarRadarSuperpuestoMatchmaking(resultado)}
    </section>
  `;
}

function direccionAtaqueMatchmaking(equipoKey) {
  return { side: 'right', chip: 'DEF &rarr; ATA', text: 'Perfil de defensa a ataque' };
}

function offsetEtiquetaPitchMatchmaking(leftPct, topPct, index) {
  const offsetY = [-36, 36, -58, 58, 0][index % 5];
  let offsetX = 0;
  if (leftPct < 28) offsetX = 62;
  if (leftPct > 72) offsetX = -62;
  if (topPct < 18) return { x: offsetX, y: Math.max(36, Math.abs(offsetY)) };
  if (topPct > 82) return { x: offsetX, y: -Math.max(36, Math.abs(offsetY)) };
  return { x: offsetX, y: offsetY };
}

function colorAreaJugadorMatchmaking(index) {
  return MATCHMAKING_AREA_COLORS[index % MATCHMAKING_AREA_COLORS.length];
}

function crearKeyJugadorArmoniaMatchmaking(jugador, index) {
  const id = obtenerIdJugadorMatchmaking(jugador) || obtenerNombreJugadorMatchmaking(jugador) || `jugador-${index}`;
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function inicialesJugadorMatchmaking(nombre = '') {
  const limpio = String(nombre || 'J')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const partes = limpio.split(/\s+/).filter(Boolean);
  const base = partes.length > 1
    ? `${partes[0][0] || ''}${partes[1][0] || ''}`
    : limpio.slice(0, 2);
  return (base || 'J').toUpperCase();
}

function obtenerPicoSuavizadoArmoniaMatchmaking(buckets, cols, rows) {
  let best = null;
  buckets.forEach(cell => {
    let smoothed = 0;
    let weight = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
        const neighbor = buckets.get(`${x}:${y}`);
        const w = dx === 0 && dy === 0 ? 4 : (Math.abs(dx) + Math.abs(dy) === 1 ? 2 : 1);
        smoothed += numeroSeguroMatchmaking(neighbor?.value, 0) * w;
        weight += w;
      }
    }
    const score = weight ? smoothed / weight : cell.value;
    if (
      !best
      || score > best.score
      || (score === best.score && cell.value > best.value)
      || (score === best.score && cell.value === best.value && `${cell.y}:${cell.x}` < `${best.y}:${best.x}`)
    ) {
      best = { x: cell.x, y: cell.y, value: cell.value, score };
    }
  });
  return best;
}

function resolverColisionesMarcadoresArmoniaMatchmaking(players = []) {
  const markers = players.map((player, index) => ({
    playerKey: player.playerKey,
    index,
    x: numeroSeguroMatchmaking(player.center?.x, 50),
    y: numeroSeguroMatchmaking(player.center?.y, 25)
  }));

  for (let iteration = 0; iteration < 40; iteration += 1) {
    let moved = false;
    for (let i = 0; i < markers.length; i += 1) {
      for (let j = i + 1; j < markers.length; j += 1) {
        const a = markers[i];
        const b = markers[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.01) {
          const angle = (((a.index + 1) * 41) + ((b.index + 1) * 17)) * (Math.PI / 180);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = Math.hypot(dx, dy);
        }
        if (distance >= MATCHMAKING_HARMONY_MARKER_MIN_DISTANCE) continue;

        const push = (MATCHMAKING_HARMONY_MARKER_MIN_DISTANCE - distance) / 2;
        dx /= distance;
        dy /= distance;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        moved = true;
      }
    }

    markers.forEach(marker => {
      marker.x = clampMatchmaking(marker.x, MATCHMAKING_HARMONY_MARKER_PADDING, 100 - MATCHMAKING_HARMONY_MARKER_PADDING);
      marker.y = clampMatchmaking(marker.y, MATCHMAKING_HARMONY_MARKER_PADDING, 50 - MATCHMAKING_HARMONY_MARKER_PADDING);
    });
    if (!moved) break;
  }

  return new Map(markers.map(marker => [marker.playerKey, { x: marker.x, y: marker.y }]));
}

function anchoEtiquetaEjeArmoniaMatchmaking(nombre = '') {
  return clampMatchmaking(9 + (String(nombre).length * 0.8), 12, 22);
}

function hayColisionEtiquetaEjeArmoniaMatchmaking(laneItems, item, x) {
  const last = laneItems[laneItems.length - 1];
  if (!last) return false;
  const minGap = ((last.widthPct + item.widthPct) / 2) + 1.6;
  return (x - last.labelPct) < minGap;
}

function ajustarCarrilEtiquetasEjeArmoniaMatchmaking(laneItems) {
  if (!laneItems.length) return;
  laneItems.sort((a, b) => a.labelPct - b.labelPct);
  for (let i = 1; i < laneItems.length; i += 1) {
    const prev = laneItems[i - 1];
    const current = laneItems[i];
    const minGap = ((prev.widthPct + current.widthPct) / 2) + 1.6;
    if (current.labelPct - prev.labelPct < minGap) {
      current.labelPct = prev.labelPct + minGap;
    }
  }

  const last = laneItems[laneItems.length - 1];
  const overflow = (last.labelPct + (last.widthPct / 2)) - 100;
  if (overflow > 0) {
    laneItems.forEach(item => {
      item.labelPct -= overflow;
    });
  }

  const first = laneItems[0];
  const underflow = (first.widthPct / 2) - first.labelPct;
  if (underflow > 0) {
    laneItems.forEach(item => {
      item.labelPct += underflow;
    });
  }

  for (let i = 1; i < laneItems.length; i += 1) {
    const prev = laneItems[i - 1];
    const current = laneItems[i];
    const minGap = ((prev.widthPct + current.widthPct) / 2) + 1.6;
    if (current.labelPct - prev.labelPct < minGap) {
      current.labelPct = prev.labelPct + minGap;
    }
  }
}

function resolverEtiquetasEjeArmoniaMatchmaking(players = []) {
  const sorted = players.map((player, index) => {
    const dotPct = clampMatchmaking(numeroSeguroMatchmaking(player.ataquePct, 0.5) * 100, 0, 100);
    return {
      playerKey: player.playerKey,
      index,
      dotPct,
      labelPct: dotPct,
      widthPct: anchoEtiquetaEjeArmoniaMatchmaking(player.nombre)
    };
  }).sort((a, b) => a.dotPct - b.dotPct || a.index - b.index);
  const lanes = { up: [], down: [] };

  sorted.forEach((item, order) => {
    let lane = order % 2 === 0 ? 'up' : 'down';
    const otherLane = lane === 'up' ? 'down' : 'up';
    if (
      hayColisionEtiquetaEjeArmoniaMatchmaking(lanes[lane], item, item.labelPct)
      && !hayColisionEtiquetaEjeArmoniaMatchmaking(lanes[otherLane], item, item.labelPct)
    ) {
      lane = otherLane;
    }
    item.lane = lane;
    lanes[lane].push(item);
  });

  ajustarCarrilEtiquetasEjeArmoniaMatchmaking(lanes.up);
  ajustarCarrilEtiquetasEjeArmoniaMatchmaking(lanes.down);

  return new Map([...lanes.up, ...lanes.down].map(item => [
    item.playerKey,
    {
      dotPct: item.dotPct,
      labelPct: clampMatchmaking(item.labelPct, item.widthPct / 2, 100 - (item.widthPct / 2)),
      lane: item.lane
    }
  ]));
}

function crearGridHeatmapArmoniaMatchmaking(jugador, index, equipoKey) {
  const nombre = obtenerNombreJugadorMatchmaking(jugador);
  const playerKey = crearKeyJugadorArmoniaMatchmaking(jugador, index);
  const color = colorAreaJugadorMatchmaking(index);
  const heatmap = normalizarHeatmapMatchmaking(obtenerHeatmapJugadorMatchmaking(jugador));
  if (!heatmap.total || !heatmap.flat.length) {
    return { jugador, nombre, playerKey, color, hasHeatmap: false, cells: [] };
  }

  const { cols, rows } = MATCHMAKING_HARMONY_GRID;
  const buckets = new Map();
  heatmap.counts.forEach((row, y) => {
    row.forEach((value, x) => {
      const n = numeroSeguroMatchmaking(value, 0);
      if (n <= 0) return;
      const gx = clampMatchmaking(Math.floor(((x + 0.5) / Math.max(heatmap.xBins, 1)) * cols), 0, cols - 1);
      const gy = clampMatchmaking(Math.floor(((y + 0.5) / Math.max(heatmap.yBins, 1)) * rows), 0, rows - 1);
      const key = `${gx}:${gy}`;
      const actual = buckets.get(key) || { x: gx, y: gy, value: 0 };
      actual.value += n;
      buckets.set(key, actual);
    });
  });

  const allCells = Array.from(buckets.values());
  const maxValue = allCells.reduce((max, cell) => Math.max(max, cell.value), 0);
  if (maxValue <= 0) return { jugador, nombre, playerKey, color, hasHeatmap: false, cells: [] };
  const peakCell = obtenerPicoSuavizadoArmoniaMatchmaking(buckets, cols, rows)
    || allCells[0]
    || { x: Math.floor(cols / 2), y: Math.floor(rows / 2), value: maxValue };

  const threshold = maxValue * 0.18;
  let cells = allCells.filter(cell => cell.value >= threshold);
  if (cells.length < 6) {
    cells = [...allCells].sort((a, b) => b.value - a.value).slice(0, Math.min(10, allCells.length));
  }

  const total = cells.reduce((sum, cell) => sum + cell.value, 0);
  const pesoAtaque = cells.reduce((sum, cell) => {
    const estaEnCampoRival = cell.x >= cols / 2;
    return estaEnCampoRival ? sum + cell.value : sum;
  }, 0);
  const ataquePct = total ? pesoAtaque / total : 0.5;

  return {
    jugador,
    nombre,
    playerKey,
    color,
    hasHeatmap: true,
    initials: inicialesJugadorMatchmaking(nombre),
    ataquePct,
    peak: peakCell,
    center: {
      x: (((peakCell.x + 0.5) / cols) * 100),
      y: (((peakCell.y + 0.5) / rows) * 50)
    },
    cells: cells.map(cell => ({
      ...cell,
      ratio: cell.value / maxValue
    }))
  };
}

function crearModeloCanchaArmoniaMatchmaking(jugadores = [], equipoKey) {
  const players = jugadores.map((jugador, index) => crearGridHeatmapArmoniaMatchmaking(jugador, index, equipoKey));
  const withHeatmap = players.filter(player => player.hasHeatmap);
  const withoutHeatmap = players.filter(player => !player.hasHeatmap);
  const cellsByKey = new Map();
  const markerLayout = resolverColisionesMarcadoresArmoniaMatchmaking(withHeatmap);
  const axisLayout = resolverEtiquetasEjeArmoniaMatchmaking(withHeatmap);

  withHeatmap.forEach(player => {
    player.marker = markerLayout.get(player.playerKey) || player.center;
    player.axis = axisLayout.get(player.playerKey) || {
      dotPct: clampMatchmaking(numeroSeguroMatchmaking(player.ataquePct, 0.5) * 100, 0, 100),
      labelPct: clampMatchmaking(numeroSeguroMatchmaking(player.ataquePct, 0.5) * 100, 0, 100),
      lane: 'up'
    };
  });

  withHeatmap.forEach(player => {
    player.cells.forEach(cell => {
      const key = `${cell.x}:${cell.y}`;
      if (!cellsByKey.has(key)) cellsByKey.set(key, { x: cell.x, y: cell.y, owners: [] });
      cellsByKey.get(key).owners.push({
        playerKey: player.playerKey,
        nombre: player.nombre,
        color: player.color,
        value: cell.value,
        ratio: cell.ratio
      });
    });
  });

  const cells = Array.from(cellsByKey.values()).map(cell => ({
    ...cell,
    owners: cell.owners.sort((a, b) => b.value - a.value)
  }));

  return { players, withHeatmap, withoutHeatmap, cells };
}

function renderizarLineasCanchaArmoniaMatchmaking() {
  return `
    <g class="matchmaking-harmony-lines">
      <rect x="1.2" y="1.2" width="97.6" height="47.6" rx="1.6"></rect>
      <line x1="50" y1="1.2" x2="50" y2="48.8"></line>
      <circle cx="50" cy="25" r="6.5"></circle>
      <rect x="1.2" y="14.5" width="10.5" height="21"></rect>
      <rect x="88.3" y="14.5" width="10.5" height="21"></rect>
    </g>
  `;
}

function ratioCeldaArmoniaMatchmaking(cell = {}) {
  const direct = numeroFinitoMatchmaking(cell.ratio);
  if (direct !== null) return clampMatchmaking(direct, 0, 1);
  const ownerRatios = (cell.owners || [])
    .map(owner => numeroFinitoMatchmaking(owner.ratio))
    .filter(value => value !== null);
  if (ownerRatios.length) return clampMatchmaking(Math.max(...ownerRatios), 0, 1);
  return 1;
}

function renderizarManchasJugadorArmoniaMatchmaking(cells = [], color) {
  const { cols, rows } = MATCHMAKING_HARMONY_GRID;
  const cellW = 100 / cols;
  const cellH = 50 / rows;

  return [...cells]
    .sort((a, b) => ratioCeldaArmoniaMatchmaking(a) - ratioCeldaArmoniaMatchmaking(b))
    .map(cell => {
      const ratio = ratioCeldaArmoniaMatchmaking(cell);
      return `
    <ellipse
      cx="${((cell.x + 0.5) * cellW).toFixed(2)}"
      cy="${((cell.y + 0.5) * cellH).toFixed(2)}"
      rx="${(cellW * (0.72 + ratio * 0.55)).toFixed(2)}"
      ry="${(cellH * (0.72 + ratio * 0.55)).toFixed(2)}"
      fill="${color}"
      opacity="${(0.38 + ratio * 0.54).toFixed(2)}"
    ></ellipse>
  `;
    }).join('');
}

function renderizarCapasCanchaArmoniaMatchmaking(modelo, filterId) {
  const overlapCells = modelo.cells.filter(cell => cell.owners.length > 1);
  const softFilter = escaparHtmlMatchmaking(filterId);

  return `
    <defs>
      <filter id="${softFilter}" x="-16%" y="-16%" width="132%" height="132%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.72"></feGaussianBlur>
      </filter>
    </defs>
    <g class="matchmaking-harmony-layers">
      ${modelo.withHeatmap.map(player => `
        <g
          class="matchmaking-harmony-player-layer"
          data-player-key="${escaparHtmlMatchmaking(player.playerKey)}"
          filter="url(#${softFilter})"
        >
          <title>${escaparHtmlMatchmaking(player.nombre)}</title>
          ${renderizarManchasJugadorArmoniaMatchmaking(player.cells, player.color)}
        </g>
      `).join('')}
      <g class="matchmaking-harmony-overlap-layer" filter="url(#${softFilter})">
        <title>Solape entre jugadores</title>
        ${renderizarManchasJugadorArmoniaMatchmaking(overlapCells, '#ff6bd6')}
      </g>
    </g>
  `;
}

function renderizarMarcadoresCanchaArmoniaMatchmaking(modelo) {
  return modelo.withHeatmap.map(player => `
    <g class="matchmaking-harmony-marker" data-player-key="${escaparHtmlMatchmaking(player.playerKey)}" transform="translate(${player.marker.x.toFixed(2)} ${player.marker.y.toFixed(2)})">
      <circle r="2.9" fill="rgba(8, 13, 26, 0.94)" stroke="${player.color}" stroke-width="0.75"></circle>
      <text text-anchor="middle" dominant-baseline="central">${escaparHtmlMatchmaking(player.initials)}</text>
      <title>${escaparHtmlMatchmaking(player.nombre)}</title>
    </g>
  `).join('');
}

function renderizarSvgCanchaArmoniaMatchmaking(modelo, temaName, cardId) {
  if (!modelo.withHeatmap.length) {
    return `
      <div class="matchmaking-harmony-empty-pitch">
        <span>Sin mapas de calor para ${escaparHtmlMatchmaking(temaName)}</span>
      </div>
    `;
  }

  const filterId = `matchmaking-harmony-soft-${crearKeyJugadorArmoniaMatchmaking({ id: cardId }, 0)}`;
  return `
    <svg class="matchmaking-harmony-svg" viewBox="-4 -3 108 56" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de armonia territorial ${escaparHtmlMatchmaking(temaName)}">
      <rect class="matchmaking-harmony-bg" x="0" y="0" width="100" height="50" rx="2"></rect>
      ${renderizarCapasCanchaArmoniaMatchmaking(modelo, filterId)}
      ${renderizarLineasCanchaArmoniaMatchmaking()}
      ${renderizarMarcadoresCanchaArmoniaMatchmaking(modelo)}
    </svg>
  `;
}

function claseMetricaArmoniaMatchmaking(value, type) {
  const n = clampMatchmaking(numeroSeguroMatchmaking(value), 0, 100);
  if (type === 'overlap') {
    if (n >= 75) return 'bad';
    if (n >= 55) return 'warn';
    return 'good';
  }
  if (n >= 70) return 'good';
  if (n >= 45) return 'warn';
  return 'bad';
}

function renderizarMetricaArmoniaMatchmaking(label, value, type, usable = true) {
  const n = clampMatchmaking(numeroSeguroMatchmaking(value), 0, 100);
  const fillClass = claseMetricaArmoniaMatchmaking(n, type);
  return `
    <div class="matchmaking-harmony-metric">
      <div class="matchmaking-harmony-metric__top">
        <span>${label}</span>
        <strong>${usable ? `${n.toFixed(0)}%` : '-'}</strong>
      </div>
      <div class="matchmaking-harmony-bar">
        <span class="matchmaking-harmony-bar__fill is-${fillClass}" style="width:${usable ? n.toFixed(0) : 0}%"></span>
      </div>
    </div>
  `;
}

function renderizarLeyendaArmoniaMatchmaking(modelo, cardId) {
  if (!modelo.withHeatmap.length) return '';
  return `
    <div class="matchmaking-harmony-legend" aria-label="Jugadores con mapa de calor">
      ${modelo.withHeatmap.map(player => `
        <button
          type="button"
          class="matchmaking-harmony-chip"
          data-player-key="${escaparHtmlMatchmaking(player.playerKey)}"
          onclick="aislarJugadorArmoniaMatchmaking('${escaparTextoParaJs(cardId)}', '${escaparTextoParaJs(player.playerKey)}')"
          title="${escaparHtmlMatchmaking(player.nombre)}: posicion dominante por heatmap"
        >
          <span class="matchmaking-harmony-chip__swatch" style="background:${player.color}"></span>
          <span>${escaparHtmlMatchmaking(player.nombre)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderizarEjeArmoniaMatchmaking(modelo) {
  if (!modelo.withHeatmap.length) return '';
  return `
    <div class="matchmaking-harmony-axis">
      <span>Defensa</span>
      <div class="matchmaking-harmony-axis__track">
        ${modelo.withHeatmap.map((player, index) => `
          <i
            class="matchmaking-harmony-axis__dot"
            data-player-key="${escaparHtmlMatchmaking(player.playerKey)}"
            style="left:${player.axis.dotPct.toFixed(1)}%; background:${player.color};"
            title="${escaparHtmlMatchmaking(player.nombre)}"
          ></i>
          <em
            class="matchmaking-harmony-axis__name ${player.axis.lane === 'down' ? 'is-down' : 'is-up'}"
            data-player-key="${escaparHtmlMatchmaking(player.playerKey)}"
            style="left:${player.axis.labelPct.toFixed(1)}%;"
          >${escaparHtmlMatchmaking(player.nombre)}</em>
        `).join('')}
      </div>
      <span>Ataque</span>
    </div>
  `;
}

function renderizarBancoArmoniaMatchmaking(modelo, cardId, heatmapPlayers) {
  const bench = modelo.withoutHeatmap;
  return `
    <div class="matchmaking-harmony-bench">
      <span>Sin tracking:</span>
      <div class="matchmaking-harmony-bench__list">
        ${bench.length ? bench.map(player => `
          <span class="matchmaking-harmony-bench-chip">
            <span></span>${escaparHtmlMatchmaking(player.nombre)}
          </span>
        `).join('') : '<span class="matchmaking-harmony-bench-empty">Todos con tracking</span>'}
      </div>
      <button
        type="button"
        class="matchmaking-overlap-toggle"
        onclick="toggleSolapeArmoniaMatchmaking('${escaparTextoParaJs(cardId)}', this)"
        aria-pressed="false"
        ${heatmapPlayers >= 2 ? '' : 'disabled'}
      >
        <span></span>Solape
      </button>
    </div>
  `;
}

window.aislarJugadorArmoniaMatchmaking = function(cardId, playerKey) {
  const card = document.querySelector(`[data-harmony-card="${cardId}"]`);
  if (!card) return;
  const nextActive = card.dataset.activePlayer === playerKey ? '' : playerKey;
  card.dataset.activePlayer = nextActive;

  card.querySelectorAll('.matchmaking-harmony-chip').forEach(chip => {
    chip.classList.toggle('is-active', !!nextActive && chip.dataset.playerKey === nextActive);
  });
  card.querySelectorAll('.matchmaking-harmony-player-layer').forEach(layer => {
    const isTarget = layer.dataset.playerKey === nextActive;
    layer.classList.toggle('is-dimmed', !!nextActive && !isTarget);
    layer.classList.toggle('is-focus', !!nextActive && isTarget);
  });
  card.querySelectorAll('.matchmaking-harmony-overlap-layer').forEach(layer => {
    layer.classList.toggle('is-dimmed', !!nextActive);
  });
  card.querySelectorAll('.matchmaking-harmony-marker, .matchmaking-harmony-axis__dot, .matchmaking-harmony-axis__name').forEach(item => {
    item.classList.toggle('is-dimmed', !!nextActive && item.dataset.playerKey !== nextActive);
  });
};

window.toggleSolapeArmoniaMatchmaking = function(cardId, button) {
  const card = document.querySelector(`[data-harmony-card="${cardId}"]`);
  if (!card) return;
  const enabled = card.classList.toggle('is-showing-overlap');
  if (button) {
    button.classList.toggle('is-active', enabled);
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
};

function renderizarCanchaEquipoMatchmaking(resultado, equipoKey) {
  const tema = MATCHMAKING_TEAM_THEMES[equipoKey] || MATCHMAKING_TEAM_THEMES.equipo1;
  const jugadores = resultado?.[equipoKey]?.jugadores || [];
  const stats = resultado?.[equipoKey]?.estadisticas || {};
  const ataque = direccionAtaqueMatchmaking(equipoKey);
  const heatmapPlayers = numeroSeguroMatchmaking(stats.heatmapPlayers);
  const score = numeroSeguroMatchmaking(stats.armoniaHeatmapScore);
  const coverage = numeroSeguroMatchmaking(stats.heatmapCoveragePct);
  const overlap = numeroSeguroMatchmaking(stats.heatmapOverlapPct);
  const modelo = crearModeloCanchaArmoniaMatchmaking(jugadores, equipoKey);
  const cardId = `matchmaking-armonia-${equipoKey}`;

  return `
    <section class="matchmaking-pitch-card" style="--team-color:${tema.color};" data-harmony-card="${cardId}">
      <header class="matchmaking-pitch-card__header">
        <div>
          <h4>${tema.name}</h4>
          <span>${heatmapPlayers}/${jugadores.length} con mapa de calor</span>
        </div>
        <span class="matchmaking-pitch-card__attack">${ataque.chip}</span>
        <strong title="Score de armonia territorial">${heatmapPlayers >= 2 ? score.toFixed(0) : '-'}</strong>
      </header>
      <div class="matchmaking-harmony-metrics">
        ${renderizarMetricaArmoniaMatchmaking('Cobertura', coverage, 'coverage', heatmapPlayers > 0)}
        ${renderizarMetricaArmoniaMatchmaking('Solape', overlap, 'overlap', heatmapPlayers >= 2)}
      </div>
      <div class="matchmaking-pitch" aria-label="Mapa de posiciones ${tema.name}">
        ${renderizarSvgCanchaArmoniaMatchmaking(modelo, tema.name, cardId)}
        <div class="matchmaking-pitch-attack is-${ataque.side}">${ataque.chip}</div>
      </div>
      ${renderizarLeyendaArmoniaMatchmaking(modelo, cardId)}
      ${renderizarEjeArmoniaMatchmaking(modelo)}
      ${renderizarBancoArmoniaMatchmaking(modelo, cardId, heatmapPlayers)}
    </section>
  `;
}

function renderizarMapaArmoniaMatchmaking(resultado) {
  const e1 = resultado?.equipo1?.estadisticas || {};
  const e2 = resultado?.equipo2?.estadisticas || {};
  const totalHeatmaps = numeroSeguroMatchmaking(e1.heatmapPlayers) + numeroSeguroMatchmaking(e2.heatmapPlayers);
  return `
    <section class="matchmaking-harmony">
      <div class="matchmaking-harmony__title">
        <div>
          <h3>Armonia territorial</h3>
          <p>Premia cobertura de cancha y bajo solape entre mapas de calor. Los jugadores sin tracking quedan fuera del campo para no inventar una posicion.</p>
        </div>
        <span>${totalHeatmaps} heatmaps usados</span>
      </div>
      <div class="matchmaking-harmony__grid">
        ${renderizarCanchaEquipoMatchmaking(resultado, 'equipo1')}
        ${renderizarCanchaEquipoMatchmaking(resultado, 'equipo2')}
      </div>
    </section>
  `;
}

function crearFilaComparativaMatchmaking(label, valor1, valor2, opciones = {}) {
  const numero1 = numeroSeguroMatchmaking(valor1);
  const numero2 = numeroSeguroMatchmaking(valor2);
  const formato = opciones.formato || ((valor) => formatearNumeroMatchmaking(valor, opciones.decimales ?? 1, opciones.sufijo || ''));
  const vacia = !opciones.siempreVisible && numero1 === 0 && numero2 === 0;
  const e1Gana = opciones.menorEsMejor ? numero1 < numero2 : numero1 > numero2;
  const e2Gana = opciones.menorEsMejor ? numero2 < numero1 : numero2 > numero1;
  return `
    <div class="matchmaking-stats__row ${vacia ? 'is-empty' : ''}" ${vacia ? 'data-matchmaking-empty="true" hidden' : ''}>
      <span class="matchmaking-stats__value matchmaking-stats__value--e1 ${e1Gana ? 'is-win' : ''}">${escaparHtmlMatchmaking(formato(numero1))}</span>
      <span class="matchmaking-stats__label">${escaparHtmlMatchmaking(label)}</span>
      <span class="matchmaking-stats__value matchmaking-stats__value--e2 ${e2Gana ? 'is-win' : ''}">${escaparHtmlMatchmaking(formato(numero2))}</span>
    </div>
  `;
}

function filasComparativaMatchmaking(resultado) {
  const e1 = resultado.equipo1.estadisticas;
  const e2 = resultado.equipo2.estadisticas;
  return [
    crearFilaComparativaMatchmaking('Rendimiento Matchmaking', e1.rendimientoTotal, e2.rendimientoTotal, { siempreVisible: true, decimales: 1 }),
    crearFilaComparativaMatchmaking('Impacto del Equipo', e1.impactoMatchmaking, e2.impactoMatchmaking, { siempreVisible: true, decimales: 1, sufijo: '%' }),
    crearFilaComparativaMatchmaking('Rendimiento Jugadores', e1.rendimientoAtaque, e2.rendimientoAtaque, { siempreVisible: true, decimales: 1 }),
    crearFilaComparativaMatchmaking('Winrate Promedio', e1.winratePromedio, e2.winratePromedio, { siempreVisible: true, decimales: 1, sufijo: '%' }),
    crearFilaComparativaMatchmaking('Goles a Favor / Partido', e1.golesFavorPromedio, e2.golesFavorPromedio, { siempreVisible: true, decimales: 2 }),
    crearFilaComparativaMatchmaking('Score Defensivo Total', e1.scoreDefensivoTotal, e2.scoreDefensivoTotal, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Score Defensivo Promedio', e1.scoreDefensivoPromedio, e2.scoreDefensivoPromedio, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Jugadores con Defensa Tracking', e1.jugadoresConScoreDefensivoTracking, e2.jugadoresConScoreDefensivoTracking, { formato: (valor) => String(Math.round(valor)) }),
    crearFilaComparativaMatchmaking('Armonia territorial', e1.armoniaHeatmapScore, e2.armoniaHeatmapScore, { decimales: 0 }),
    crearFilaComparativaMatchmaking('Rendimiento Arqueros', e1.rendimientoArquero, e2.rendimientoArquero, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Arqueros', e1.cantidadArqueros, e2.cantidadArqueros, { formato: (valor) => String(Math.round(valor)) }),
    crearFilaComparativaMatchmaking('Pulmon Promedio', e1.pulmonPromedio, e2.pulmonPromedio, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Pulmon Total', e1.pulmonTrackingTotal ?? e1.pulmonTotal, e2.pulmonTrackingTotal ?? e2.pulmonTotal, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Goles Recibidos / Partido', e1.golesRecibidosPromedio, e2.golesRecibidosPromedio, { decimales: 2, menorEsMejor: true })
  ];
}

function renderizarComparativaMatchmaking(resultado) {
  const filas = filasComparativaMatchmaking(resultado);
  const vacias = filas.filter(fila => fila.includes('data-matchmaking-empty="true"')).length;
  return `
    <section class="matchmaking-stats">
      <h4 class="matchmaking-stats__title">Comparativa del armado</h4>
      ${filas.join('')}
      ${vacias ? `
        <button type="button" class="matchmaking-stats__toggle" onclick="toggleMetricasMatchmaking(this)">
          Ver metricas sin datos (${vacias})
        </button>
      ` : ''}
    </section>
  `;
}

function renderizarFooterMatchmaking(resultado) {
  return `
    <section class="matchmaking-footer">
      <span>Fitness ${resultado.fitness.toFixed(2)}</span>
      ${mostrarRestriccionesAplicadas()}
    </section>
  `;
}

function mostrarResultados(resultado) {
  document.getElementById('progress-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';
  
  const container = document.getElementById('equipos-resultado');
  const configuracion = resultado.configuracionRendimiento || { modo: MODO_RENDIMIENTO_HISTORICO };
  const etiquetaBaseRendimiento = configuracion.modo === MODO_RENDIMIENTO_RECIENTE
    ? `Últimos ${configuracion.partidos || PARTIDOS_RECIENTES_DEFAULT} partidos por jugador${configuracion.temporadaId ? ' en temporada activa' : ''}`
    : 'Histórico / temporada activa';
  
  if (
    seleccionIntercambioMatchmaking &&
    !obtenerJugadorResultadoIntercambioMatchmaking(
      resultado,
      seleccionIntercambioMatchmaking.equipoKey,
      seleccionIntercambioMatchmaking.index
    )
  ) {
    seleccionIntercambioMatchmaking = null;
  }

  const jugadorClave = obtenerJugadorClaveMatchmaking(resultado);
  const maxImpacto = maxImpactoJugadoresMatchmaking(resultado);
  container.innerHTML = `
    <div class="col-12">
      <div class="matchmaking-balance-root">
        <div class="matchmaking-balance-wrap">
          <div class="matchmaking-context-stack">
            ${renderizarContextoMatchmaking(etiquetaBaseRendimiento)}
            ${renderizarNotaJugadorClaveMatchmaking(resultado)}
            ${renderizarNotaSobreRendimientoReciente(resultado)}
            ${renderizarEstadoIntercambioMatchmaking(resultado)}
          </div>
          ${renderizarBalanzaMatchmaking(resultado)}
          <div class="matchmaking-layout-grid">
            ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo1', { maxImpacto, jugadorClave })}
            ${renderizarAnalisisEmparejamientoMatchmaking(resultado)}
            ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo2', { maxImpacto, jugadorClave })}
          </div>
          ${renderizarHitosPartidoMatchmaking(resultado)}
          ${renderizarFooterMatchmaking(resultado)}
        </div>
      </div>
    </div>
  `;

  window.ultimoResultadoGenetico = resultado;
  return;

  const html = `
    <div class="col-12">
      <div class="matchmaking-result-mode rounded px-3 py-2">
        <div>
          <i class="bi bi-sliders me-2"></i>
          Base de balance: <strong>${etiquetaBaseRendimiento}</strong>
        </div>
        ${renderizarNotaJugadorClaveMatchmaking(resultado)}
        ${renderizarNotaSobreRendimientoReciente(resultado)}
        ${renderizarEstadoIntercambioMatchmaking(resultado)}
      </div>
    </div>
    <div class="col-md-6">
      <div class="team-result-card team-1">
        <h6 class="text-primary">
          <i class="bi bi-trophy me-2"></i>
          Equipo 1
        </h6>
        <div class="player-list">
          ${resultado.equipo1.jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, 'equipo1', index)).join('')}
        </div>
        ${renderizarNotasAtencionEquipoMatchmaking(resultado, 'equipo1')}
        <div class="stats-summary">
          <div class="stat-row">
            <span>Rendimiento Matchmaking:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.rendimientoTotal.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Impacto del Equipo:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.impactoMatchmaking.toFixed(1)}%</span>
          </div>
          <div class="stat-row">
            <span>Rendimiento Jugadores:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.rendimientoAtaque.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Rendimiento Arqueros:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.rendimientoArquero.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Arqueros:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.cantidadArqueros}</span>
          </div>
          <div class="stat-row">
            <span>Winrate Promedio:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.winratePromedio.toFixed(1)}%</span>
          </div>
          <div class="stat-row">
            <span>Pulmón Promedio:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.pulmonPromedio.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Pulmon Total:</span>
            <span class="fw-bold">${numeroSeguroMatchmaking(resultado.equipo1.estadisticas.pulmonTrackingTotal ?? resultado.equipo1.estadisticas.pulmonTotal).toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Goles a Favor / Partido:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.golesFavorPromedio.toFixed(2)}</span>
          </div>
          <div class="stat-row">
            <span>Goles Recibidos / Partido:</span>
            <span class="fw-bold">${resultado.equipo1.estadisticas.golesRecibidosPromedio.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-6">
      <div class="team-result-card team-2">
        <h6 class="text-danger">
          <i class="bi bi-trophy me-2"></i>
          Equipo 2
        </h6>
        <div class="player-list">
          ${resultado.equipo2.jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, 'equipo2', index)).join('')}
        </div>
        ${renderizarNotasAtencionEquipoMatchmaking(resultado, 'equipo2')}
        <div class="stats-summary">
          <div class="stat-row">
            <span>Rendimiento Matchmaking:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.rendimientoTotal.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Impacto del Equipo:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.impactoMatchmaking.toFixed(1)}%</span>
          </div>
          <div class="stat-row">
            <span>Rendimiento Jugadores:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.rendimientoAtaque.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Rendimiento Arqueros:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.rendimientoArquero.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Arqueros:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.cantidadArqueros}</span>
          </div>
          <div class="stat-row">
            <span>Winrate Promedio:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.winratePromedio.toFixed(1)}%</span>
          </div>
          <div class="stat-row">
            <span>Pulmón Promedio:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.pulmonPromedio.toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Pulmon Total:</span>
            <span class="fw-bold">${numeroSeguroMatchmaking(resultado.equipo2.estadisticas.pulmonTrackingTotal ?? resultado.equipo2.estadisticas.pulmonTotal).toFixed(1)}</span>
          </div>
          <div class="stat-row">
            <span>Goles a Favor / Partido:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.golesFavorPromedio.toFixed(2)}</span>
          </div>
          <div class="stat-row">
            <span>Goles Recibidos / Partido:</span>
            <span class="fw-bold">${resultado.equipo2.estadisticas.golesRecibidosPromedio.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
    <div class="col-12">
      <div class="text-center p-3 rounded bg-dark">
        <h6 class="text-success mb-2">
          <i class="bi bi-graph-up me-2"></i>
          Equilibrio Encontrado
        </h6>
        <div class="row g-2 text-center mb-3">
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Fitness Score</div>
            <div class="text-white fw-bold">${resultado.fitness.toFixed(2)}</div>
            <div class="small text-success">Menor es mejor</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Matchmaking</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.rendimientoTotal - resultado.equipo2.estadisticas.rendimientoTotal).toFixed(1)}</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Impacto</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.impactoMatchmaking - resultado.equipo2.estadisticas.impactoMatchmaking).toFixed(1)}%</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Jugadores</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.rendimientoAtaque - resultado.equipo2.estadisticas.rendimientoAtaque).toFixed(1)}</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Arqueros</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.rendimientoArquero - resultado.equipo2.estadisticas.rendimientoArquero).toFixed(1)}</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Goles a Favor</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.golesFavorPromedio - resultado.equipo2.estadisticas.golesFavorPromedio).toFixed(2)}</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Pulmon</div>
            <div class="text-white fw-bold">${Math.abs(numeroSeguroMatchmaking(resultado.equipo1.estadisticas.pulmonTrackingTotal ?? resultado.equipo1.estadisticas.pulmonTotal) - numeroSeguroMatchmaking(resultado.equipo2.estadisticas.pulmonTrackingTotal ?? resultado.equipo2.estadisticas.pulmonTotal)).toFixed(1)}</div>
          </div>
          <div class="col-6 col-md-2">
            <div class="small text-light-emphasis">Dif. Cant. Arqueros</div>
            <div class="text-white fw-bold">${Math.abs(resultado.equipo1.estadisticas.cantidadArqueros - resultado.equipo2.estadisticas.cantidadArqueros)}</div>
          </div>
        </div>
        ${mostrarRestriccionesAplicadas()}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
  
  // Guardar el resultado para poder aplicarlo
  window.ultimoResultadoGenetico = resultado;
}

// Función para mostrar las restricciones aplicadas
function mostrarRestriccionesAplicadas() {
  const restricciones = obtenerRestricciones();
  const totalRestricciones = restricciones.enfrentadas.length + restricciones.juntas.length;
  
  if (totalRestricciones === 0) {
    return '<div class="small text-muted">Sin restricciones aplicadas</div>';
  }
  
  let html = '<div class="mt-2 pt-2 border-top border-secondary">';
  html += '<div class="small text-light-emphasis mb-2">Restricciones aplicadas:</div>';
  
  if (restricciones.enfrentadas.length > 0) {
    html += '<div class="small text-danger mb-1">';
    html += '<i class="bi bi-x-circle me-1"></i>';
    html += `${restricciones.enfrentadas.length} pareja${restricciones.enfrentadas.length > 1 ? 's' : ''} enfrentada${restricciones.enfrentadas.length > 1 ? 's' : ''}:`;
    restricciones.enfrentadas.forEach(pareja => {
      html += ` <span class="badge bg-danger bg-opacity-75 ms-1">${pareja[0]} vs ${pareja[1]}</span>`;
    });
    html += '</div>';
  }
  
  if (restricciones.juntas.length > 0) {
    html += '<div class="small text-success">';
    html += '<i class="bi bi-heart me-1"></i>';
    html += `${restricciones.juntas.length} pareja${restricciones.juntas.length > 1 ? 's' : ''} fija${restricciones.juntas.length > 1 ? 's' : ''}:`;
    restricciones.juntas.forEach(pareja => {
      html += ` <span class="badge bg-success bg-opacity-75 ms-1">${pareja[0]} + ${pareja[1]}</span>`;
    });
    html += '</div>';
  }
  
  html += '</div>';
  return html;
}

// Función para forzar actualización manual de equipos
function forzarActualizacionManual() {
  console.log('Ejecutando actualización manual de equipos...');
  
  const mostrarPosicionesJugador = (jugadorPosiciones) => {
    if (!jugadorPosiciones || jugadorPosiciones.length === 0) {
      return '<span class="small text-muted">Sin pos.</span>';
    }
    
    const primaria = jugadorPosiciones.find(jp => jp.es_primaria);
    const secundaria = jugadorPosiciones.find(jp => !jp.es_primaria);
    
    let html = '';
    if (primaria) {
      html += `<span class="badge bg-primary badge-sm me-1">🎯</span>`;
    }
    if (secundaria) {
      html += `<span class="badge bg-secondary badge-sm">⚽</span>`;
    }
    
    return html;
  };

  const renderEquipoManual = (equipo, containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = ''; // Limpiar contenido
    
    if (equipo.length === 0) {
      container.innerHTML = `
        <div class="text-center text-light-emphasis py-4">
          <i class="bi bi-people fs-1 text-secondary mb-3"></i>
          <p>Aún no hay jugadores.</p>
        </div>
      `;
      return;
    }
    
    // Lista de jugadores
    const jugadoresDiv = document.createElement('div');
    jugadoresDiv.className = 'mb-3';
    
    equipo.forEach((jugador, index) => {
      const playerEl = document.createElement('div');
      playerEl.className = `player-item d-flex justify-content-between align-items-center p-2 mb-2 rounded`;
      
      playerEl.innerHTML = `
        <div class="d-flex align-items-center">
          <i class="bi bi-grip-vertical text-muted me-2"></i>
          <span class="text-white fw-medium me-2">${jugador.nombre}</span>
        </div>
        <button onclick="quitarJugador('${containerId.includes('1') ? 'equipo1' : 'equipo2'}', ${index})" class="btn btn-sm btn-outline-danger">
          <i class="bi bi-x"></i>
        </button>
      `;
      
      jugadoresDiv.appendChild(playerEl);
    });
    
    container.appendChild(jugadoresDiv);
  };

  renderEquipoManual(window.equipo1, 'equipo1-jugadores');
  renderEquipoManual(window.equipo2, 'equipo2-jugadores');
  
  console.log('Actualización manual completada');
} 
