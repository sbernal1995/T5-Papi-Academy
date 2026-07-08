(function () {
  'use strict';

  const APP = {
    analysisByMatch: new Map(),
    detailsByAnalysis: new Map(),
    statsByPlayer: new Map(),
    latestByPlayer: new Map(),
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
  const TRACKING_TABLES = {
    analyses: 'tracking_analyses',
    mapping: 'tracking_player_mapping',
    stats: 'tracking_player_stats',
    heatmaps: 'tracking_player_heatmaps',
    teams: 'tracking_team_stats',
    interactions: 'tracking_interactions'
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

  async function waitForSupabase(timeoutMs = 10000) {
    const start = Date.now();
    while (!db() && Date.now() - start < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return db();
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
    const validSeconds = toNumber(field.valid_seconds ?? player.valid_seconds, durationSeconds || 0);
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

  function normalizePlayer(rawPlayer, raw) {
    const field = rawPlayer.field_role || rawPlayer;
    const goalkeeper = rawPlayer.goalkeeper_role || {};
    const fieldSide = rawPlayer.field_side || {};
    const duration = toNumber(raw.duration_seconds ?? raw.config?.duration_seconds, 0);
    const heatmap = field.heatmap || rawPlayer.heatmap || null;
    const speedDistribution = field.speed_distribution_pct || rawPlayer.speed_distribution_pct || {};
    const robustSpeedMps = toNumber(
      field.speed_peak_mps ?? field.speed_max_mps ?? rawPlayer.speed_peak_mps ?? rawPlayer.speed_p95_mps,
      0
    );
    const avgPosition = field.avg_position || rawPlayer.avg_position || {};

    return {
      player_id: String(rawPlayer.player_id || rawPlayer.id || rawPlayer.name || ''),
      detected_name: String(rawPlayer.name || rawPlayer.detected_name || rawPlayer.player_id || ''),
      team: String(rawPlayer.team || field.team || '').toUpperCase(),
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
      goalkeeper_seconds: round(toNumber(goalkeeper.total_seconds, 0), 2),
      goalkeeper_episodes: goalkeeper.episodes || [],
      own_half_pct: round(toNumber(fieldSide.own_pct, 0), 2),
      rival_half_pct: round(toNumber(fieldSide.rival_pct, 0), 2),
      own_side: fieldSide.own_side || '',
      rival_side: fieldSide.rival_side || '',
      avg_x_m: round(toNumber(avgPosition.x, 0), 3),
      avg_y_m: round(toNumber(avgPosition.y, 0), 3),
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
      pulmon_tracking: computePulmonTracking(rawPlayer, duration)
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

    return {
      raw,
      version: String(raw.version || raw.t5_export?.version || 'unknown'),
      duration_seconds: round(toNumber(raw.duration_seconds ?? raw.config?.duration_seconds, 0), 3),
      pitch,
      players,
      teams,
      summary: raw.summary || {},
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
      .tracking-canvas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
      .tracking-canvas-card { background: rgba(7, 23, 16, .74); border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: .8rem; }
      .tracking-canvas { width: 100%; aspect-ratio: 2 / 1; display: block; border-radius: 10px; background: #073b24; }
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
      .tracking-core-line { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .7rem; align-items: end; }
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
      .tracking-match-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: .45rem; }
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
        .tracking-match-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .tracking-lineups { grid-template-columns: 1fr; }
        .tracking-mapping-row { grid-template-columns: 1fr; }
        .tracking-modal-xl { max-width: 100vw; margin: .25rem; }
        .tracking-table { min-width: 720px; }
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
            <button type="button" class="btn btn-sm btn-outline-info" data-tracking-import="${escapeHtml(partidoId)}">
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
    try {
      ensureModals();
      const matchPlayers = await fetchMatchPlayers(partidoId);
      APP.importState = {
        partidoId,
        matchPlayers,
        normalized: null,
        mappings: new Map()
      };

      const input = document.getElementById('tracking-json-input');
      const summary = document.getElementById('tracking-import-summary');
      const mapping = document.getElementById('tracking-mapping-container');
      const saveButton = document.getElementById('tracking-save-import');
      if (input) input.value = '';
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

  async function handleImportFileChange(event) {
    const file = event.target.files?.[0];
    if (!file || !APP.importState) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      const normalized = normalizeFootballDetectorStats(raw);
      APP.importState.normalized = normalized;
      autoMapPlayers();
      renderMappingUI();
    } catch (error) {
      console.error('[tracking] JSON invalido:', error);
      showToast(`JSON invalido: ${error.message}`, 'error');
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
    summary.innerHTML = `
      <div class="alert alert-info py-2 mb-0">
        <strong>${escapeHtml(state.normalized.version)}</strong> -
        ${players.length} jugadores - ${formatTime(state.normalized.duration_seconds)} -
        ${mapped}/${players.length} matcheados.
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
    saveButton.disabled = !allMapped;
  }

  async function saveCurrentImport() {
    const state = APP.importState;
    if (!state?.normalized) return;
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
        team_distance_km: normalized.teams.reduce((acc, team) => {
          acc[team.team] = team.distance_km;
          return acc;
        }, {})
      };

      const { data: analysis, error: analysisError } = await client
        .from(TRACKING_TABLES.analyses)
        .upsert({
          partido_id: state.partidoId,
          source_version: normalized.version,
          duration_seconds: normalized.duration_seconds,
          pitch_width_m: normalized.pitch.width,
          pitch_height_m: normalized.pitch.height,
          raw_json: normalized.raw,
          summary
        }, { onConflict: 'partido_id' })
        .select('id, partido_id, source_version, duration_seconds, summary')
        .single();

      if (analysisError) throw analysisError;
      const analysisId = analysis.id;

      await deleteExistingAnalysisRows(client, analysisId);

      const mappingRows = normalized.players.map(player => ({
        analysis_id: analysisId,
        player_id: player.player_id,
        detected_name: player.detected_name,
        team: player.team || null,
        jugador_id: state.mappings.get(player.player_id)?.jugador_id || null,
        confidence: state.mappings.get(player.player_id)?.confidence || null
      }));

      const statsRows = normalized.players.map(player => {
        const jugadorId = state.mappings.get(player.player_id)?.jugador_id || null;
        return {
          analysis_id: analysisId,
          player_id: player.player_id,
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
          metrics: {
            fatigue: player.fatigue,
            recovery: player.recovery,
            windows: player.windows,
            directionality: player.directionality,
            lane_distribution: player.lane_distribution,
            own_side: player.own_side,
            rival_side: player.rival_side
          },
          highlights: player.highlights
        };
      });

      const heatmapRows = normalized.players.map(player => ({
        analysis_id: analysisId,
        player_id: player.player_id,
        jugador_id: state.mappings.get(player.player_id)?.jugador_id || null,
        heatmap: player.heatmap,
        heatmap_windows: player.heatmap_windows,
        x_bins: player.heatmap?.x_bins || null,
        y_bins: player.heatmap?.y_bins || null
      }));

      const teamRows = normalized.teams.map(team => ({
        analysis_id: analysisId,
        team: team.team || null,
        distance_km: team.distance_km,
        avg_speed_kmh: null,
        high_intensity_seconds: team.high_intensity_seconds,
        pulmon_tracking_avg: team.pulmon_tracking_avg,
        metrics: team
      }));

      const interactionRows = [
        { type: 'rankings', payload: normalized.rankings },
        { type: 'interactions', payload: normalized.interactions },
        { type: 'temporal', payload: normalized.temporal },
        { type: 'average_positions', payload: normalized.average_positions }
      ].map(item => ({
        analysis_id: analysisId,
        interaction_type: item.type,
        payload: item.payload || {}
      }));

      await insertRows(client, TRACKING_TABLES.mapping, mappingRows);
      await insertRows(client, TRACKING_TABLES.stats, statsRows);
      await insertRows(client, TRACKING_TABLES.heatmaps, heatmapRows);
      await insertRows(client, TRACKING_TABLES.teams, teamRows);
      await insertRows(client, TRACKING_TABLES.interactions, interactionRows);

      APP.analysisByMatch.set(String(state.partidoId), analysis);
      APP.detailsByAnalysis.delete(String(analysisId));
      APP.profileMatchesByPlayer.clear();
      updateTrackingCard(state.partidoId);
      await refreshTrackingCaches(true);

      const modal = bootstrap.Modal.getInstance(document.getElementById('trackingImportModal'));
      modal?.hide();
      showToast('Tracking guardado para el partido', 'success');
    } catch (error) {
      console.error('[tracking] Error guardando import:', error);
      showToast(`No se pudo guardar tracking: ${error.message}`, 'error');
    } finally {
      if (saveButton) {
        saveButton.innerHTML = '<i class="bi bi-database-check me-1"></i>Guardar tracking';
        validateMapping();
      }
    }
  }

  async function deleteExistingAnalysisRows(client, analysisId) {
    const deletes = [
      TRACKING_TABLES.mapping,
      TRACKING_TABLES.stats,
      TRACKING_TABLES.heatmaps,
      TRACKING_TABLES.teams,
      TRACKING_TABLES.interactions
    ].map(table => client.from(table).delete().eq('analysis_id', analysisId));
    const results = await Promise.all(deletes);
    const firstError = results.find(result => result.error)?.error;
    if (firstError) throw firstError;
  }

  async function insertRows(client, table, rows) {
    if (!rows || rows.length === 0) return;
    const { error } = await client.from(table).insert(rows);
    if (!error) return;
    const text = `${error.message || ''} ${error.details || ''}`.toLowerCase();
    if (table === TRACKING_TABLES.heatmaps && text.includes('player_id')) {
      const fallbackRows = rows.map(row => {
        const { player_id, ...rest } = row;
        return rest;
      });
      const retry = await client.from(table).insert(fallbackRows);
      if (!retry.error) return;
      throw retry.error;
    }
    throw error;
  }

  async function fetchAnalysisDetails(analysisId) {
    const key = String(analysisId);
    if (APP.detailsByAnalysis.has(key)) return APP.detailsByAnalysis.get(key);
    const client = await waitForSupabase();
    if (!client) throw new Error('Supabase no esta disponible');

    const [analysisRes, mappingRes, statsRes, heatmapsRes, teamsRes, interactionsRes] = await Promise.all([
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
        .eq('analysis_id', analysisId)
    ]);

    const firstError = [analysisRes, mappingRes, statsRes, heatmapsRes, teamsRes, interactionsRes].find(result => result.error)?.error;
    if (firstError) throw firstError;

    const mappingsByPlayer = new Map((mappingRes.data || []).map(row => [row.player_id, row]));
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
    const preferRawWhenMissing = (value, rawValue) => {
      if (rawValue === undefined || rawValue === null) return value;
      const n = Number(value);
      const rawN = Number(rawValue);
      if (value === undefined || value === null || !Number.isFinite(n)) return rawValue;
      if (Number.isFinite(rawN) && n === 0 && rawN > 0) return rawValue;
      return value;
    };

    const players = (statsRes.data || []).map((row, index) => {
      const mapping = mappingsByPlayer.get(row.player_id) || {};
      const heatmapRow = heatmapByPlayer.get(row.player_id) || {};
      const rawPlayer = rawByPlayer.get(row.player_id) || rawPlayers[index] || {};
      const metrics = row.metrics || {};
      return {
        ...row,
        name: rawPlayer.detected_name || mapping.detected_name || row.detected_name || mapping.jugadores?.nombre || row.player_id,
        team: row.team || rawPlayer.team || mapping.team || '',
        manual_pulmon: mapping.jugadores?.pulmon ?? null,
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
        avg_x_m: preferRawWhenMissing(row.avg_x_m, rawPlayer.avg_x_m),
        avg_y_m: preferRawWhenMissing(row.avg_y_m, rawPlayer.avg_y_m),
        dispersion_m: preferRawWhenMissing(row.dispersion_m, rawPlayer.dispersion_m),
        coverage_pct: preferRawWhenMissing(row.coverage_pct, rawPlayer.coverage_pct),
        pulmon_tracking: preferRawWhenMissing(row.pulmon_tracking, rawPlayer.pulmon_tracking),
        speed_distribution: row.speed_distribution || rawPlayer.speed_distribution || {},
        metrics: {
          ...metrics,
          windows: metrics.windows || rawPlayer.windows || [],
          fatigue: metrics.fatigue || rawPlayer.fatigue || {},
          recovery: metrics.recovery || rawPlayer.recovery || {},
          directionality: metrics.directionality || rawPlayer.directionality || {},
          lane_distribution: metrics.lane_distribution || rawPlayer.lane_distribution || {}
        },
        highlights: row.highlights || rawPlayer.highlights || {},
        heatmap: heatmapRow.heatmap || rawPlayer.heatmap,
        heatmap_windows: heatmapRow.heatmap_windows || rawPlayer.heatmap_windows
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
    const topDistance = [...players].sort((a, b) => toNumber(b.distance_km) - toNumber(a.distance_km))[0];
    const topSpeed = [...players].sort((a, b) => toNumber(b.max_speed_kmh) - toNumber(a.max_speed_kmh))[0];
    const topPulmon = [...players].sort((a, b) => toNumber(b.pulmon_tracking) - toNumber(a.pulmon_tracking))[0];
    const topSprint = [...players].sort((a, b) => toNumber(b.sprints) - toNumber(a.sprints))[0];
    const marking = (details.interactions?.marking_pairs || [])[0];

    return [
      topDistance && { title: 'Mas corredor', main: `${topDistance.name || topDistance.detected_name || 'Jugador'}`, sub: `${toNumber(topDistance.distance_km).toFixed(2)} km recorridos` },
      topSpeed && { title: 'Mas rapido', main: `${topSpeed.name || topSpeed.detected_name || 'Jugador'}`, sub: `${toNumber(topSpeed.max_speed_kmh).toFixed(1)} km/h pico robusto` },
      topPulmon && { title: 'Pulmon tracking', main: `${topPulmon.name || topPulmon.detected_name || 'Jugador'}`, sub: `${toNumber(topPulmon.pulmon_tracking).toFixed(1)}/100 por actividad fisica` },
      topSprint && { title: 'Mas sprints', main: `${topSprint.name || topSprint.detected_name || 'Jugador'}`, sub: `${toNumber(topSprint.sprints)} sprints sostenidos` },
      marking && { title: 'Marca sostenida', main: `${marking.marker || marking.a || 'Jugador'} vs ${marking.marked || marking.b || 'Rival'}`, sub: `${round(marking.seconds || marking.duration_seconds || 0, 1)} s cerca` }
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
    const totalDistance = round(players.reduce((sum, player) => sum + toNumber(player.distance_km), 0), 2);
    const maxSpeed = round(Math.max(...players.map(player => toNumber(player.max_speed_kmh, 0))), 1);
    const avgPulmon = round(players.reduce((sum, player) => sum + toNumber(player.pulmon_tracking), 0) / Math.max(players.length, 1), 1);
    const totalSprints = players.reduce((sum, player) => sum + toNumber(player.sprints), 0);
    const slides = buildHighlightSlides(details);

    body.innerHTML = `
      <div class="d-grid gap-4">
        ${slides.length ? renderSlides(slides) : ''}
        <div class="tracking-kpi-grid">
          ${kpi('Jugadores', players.length)}
          ${kpi('Distancia total', `${totalDistance} km`)}
          ${kpi('Vel. maxima', `${maxSpeed} km/h`)}
          ${kpi('Sprints', totalSprints)}
          ${kpi('Pulmon promedio', `${avgPulmon}/100`)}
          ${kpi('Duracion', formatTime(details.analysis.duration_seconds))}
        </div>

        <div class="tracking-canvas-grid">
          <div class="tracking-canvas-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-white mb-0">Formacion promedio</h6>
              <span class="small text-light-emphasis">A/B por equipo tracking</span>
            </div>
            <canvas class="tracking-canvas" id="tracking-formation-canvas"></canvas>
          </div>
          <div class="tracking-canvas-card">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-white mb-0">Mapa de calor del equipo</h6>
              <span class="small text-light-emphasis">jugadores de campo</span>
            </div>
            <canvas class="tracking-canvas" id="tracking-team-heatmap-canvas"></canvas>
          </div>
        </div>

        <div>
          <h6 class="text-white mb-2">Resumen fisico por jugador</h6>
          ${renderPlayersTable(players)}
        </div>

        <div class="row g-3">
          <div class="col-lg-6">
            <div class="tracking-profile-card h-100">
              <h6 class="text-white">Pulmon por ventana</h6>
              <div class="text-light-emphasis small mb-2">Distancia e intensidad por tramos del partido.</div>
              ${renderTemporalWindows(details)}
            </div>
          </div>
          <div class="col-lg-6">
            <div class="tracking-profile-card h-100">
              <h6 class="text-white">Duelos y marcas</h6>
              ${renderInteractions(details)}
            </div>
          </div>
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

  function kpi(label, value) {
    return `
      <div class="tracking-kpi">
        <div class="tracking-kpi-value">${escapeHtml(value)}</div>
        <div class="tracking-kpi-label">${escapeHtml(label)}</div>
      </div>
    `;
  }

  function renderPlayersTable(players) {
    return `
      <div class="tracking-table-wrap">
        <table class="tracking-table">
          <thead>
            <tr>
              <th>Jugador</th>
              <th>Equipo</th>
              <th>KM</th>
              <th>Vel prom</th>
              <th>Vel max</th>
              <th>Pulmon</th>
              <th>Sprints</th>
              <th>Alta intensidad</th>
              <th>Arq</th>
              <th>Campo rival</th>
            </tr>
          </thead>
          <tbody>
            ${players.map(player => `
              <tr>
                <td><span class="tracking-player-dot" style="background:${player.team === 'A' ? '#60a5fa' : '#f87171'}"></span>${escapeHtml(player.name)}</td>
                <td>${escapeHtml(player.team || '-')}</td>
                <td>${toNumber(player.distance_km).toFixed(2)}</td>
                <td>${toNumber(player.avg_speed_kmh).toFixed(1)} km/h</td>
                <td>${toNumber(player.max_speed_kmh).toFixed(1)} km/h</td>
                <td>${toNumber(player.pulmon_tracking).toFixed(1)}</td>
                <td>${toNumber(player.sprints)}</td>
                <td>${formatTime(player.high_intensity_seconds)}</td>
                <td>${formatTime(player.goalkeeper_seconds)}</td>
                <td>${toNumber(player.rival_half_pct).toFixed(1)}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTemporalWindows(details) {
    const windows = details.temporal?.windows || [];
    if (!windows.length) {
      const playerWindows = (details.players || []).flatMap(player => (player.metrics?.windows || []).map(window => ({ ...window, player: player.name })));
      if (!playerWindows.length) return '<div class="text-light-emphasis">Sin ventanas temporales.</div>';
      return playerWindows.slice(0, 8).map(window => `
        <div class="d-flex justify-content-between border-bottom border-secondary py-1 small">
          <span>${escapeHtml(window.player)} ${formatTime(window.start_seconds)}-${formatTime(window.end_seconds)}</span>
          <strong>${round(window.distance_m, 1)} m</strong>
        </div>
      `).join('');
    }
    return windows.slice(0, 10).map(window => {
      const label = `${formatTime(window.start_seconds)}-${formatTime(window.end_seconds)}`;
      const distance = window.distance_m || window.total_distance_m || window.distance || 0;
      const intensity = window.high_intensity_seconds || window.high_intensity || 0;
      return `
        <div class="d-flex justify-content-between border-bottom border-secondary py-1 small">
          <span>${label}</span>
          <strong>${round(distance, 0)} m | ${formatTime(intensity)} alta</strong>
        </div>
      `;
    }).join('');
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
    const teamHeatmapCanvas = document.getElementById('tracking-team-heatmap-canvas');
    if (teamHeatmapCanvas) {
      const combined = combineHeatmaps((details.players || []).map(player => player.heatmap).filter(Boolean));
      drawHeatmap(teamHeatmapCanvas, pitch, combined, []);
    }
    document.querySelectorAll('[data-player-heatmap]').forEach(canvas => {
      const player = (details.players || []).find(item => item.player_id === canvas.dataset.playerHeatmap);
      drawHeatmap(canvas, pitch, player?.heatmap, player ? [player] : []);
    });
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 640));
    const height = Math.max(160, Math.round(width / 2));
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

  function pitchToCanvas(point, pitch, width, height) {
    const padX = width * 0.04;
    const padY = height * 0.08;
    const innerW = width * 0.92;
    const innerH = height * 0.84;
    return {
      x: padX + (toNumber(point.x ?? point.avg_x_m, 0) / Math.max(pitch.width, 1)) * innerW,
      y: padY + (toNumber(point.y ?? point.avg_y_m, 0) / Math.max(pitch.height, 1)) * innerH
    };
  }

  function drawPitch(canvas, pitch, options = {}) {
    const { ctx, width, height } = setupCanvas(canvas);
    drawBasePitch(ctx, width, height);
    const players = options.players || [];
    players.forEach(player => {
      const p = pitchToCanvas({ x: player.avg_x_m, y: player.avg_y_m }, pitch, width, height);
      const color = player.team === 'A' ? '#2563eb' : '#dc2626';
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, Math.max(7, width * 0.009), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.fillRect(p.x + 8, p.y - 12, Math.min(150, ctx.measureText(player.name).width + 16), 24);
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(11, width * 0.016)}px system-ui, sans-serif`;
      ctx.fillText(player.name, p.x + 15, p.y + 5);
    });
  }

  function drawHeatmap(canvas, pitch, heatmap, players = []) {
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
    players.forEach(player => {
      const p = pitchToCanvas({ x: player.avg_x_m, y: player.avg_y_m }, pitch, width, height);
      ctx.beginPath();
      ctx.fillStyle = player.team === 'A' ? '#60a5fa' : '#f87171';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.arc(p.x, p.y, Math.max(6, width * 0.008), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  async function refreshTrackingCaches(force = false) {
    if (!force && APP.statsByPlayer.size) return;
    const client = await waitForSupabase(3000);
    if (!client) return;
    try {
      const statsRes = await client.from(TRACKING_TABLES.stats)
        .select('*, tracking_analyses(id, partido_id, duration_seconds, raw_json, partidos(id, fecha, cancha, equipo_ganador, temporada_id, temporadas(nombre)))')
        .not('jugador_id', 'is', null);
      if (statsRes.error) throw statsRes.error;

      let heatmapRows = [];
      const heatmapsRes = await client.from(TRACKING_TABLES.heatmaps)
        .select('analysis_id, jugador_id, heatmap, heatmap_windows')
        .not('jugador_id', 'is', null);
      if (!heatmapsRes.error) {
        heatmapRows = heatmapsRes.data || [];
      }

      const heatmapKey = new Map(heatmapRows.map(row => [`${row.analysis_id}:${row.jugador_id}`, row]));
      APP.statsByPlayer.clear();
      APP.latestByPlayer.clear();
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
        const enriched = {
          ...row,
          distance_km: row.distance_km ?? rawPlayer?.distance_km,
          avg_speed_kmh: row.avg_speed_kmh ?? rawPlayer?.avg_speed_kmh,
          max_speed_kmh: row.max_speed_kmh ?? rawPlayer?.max_speed_kmh,
          high_intensity_seconds: row.high_intensity_seconds ?? rawPlayer?.high_intensity_seconds,
          sprints: row.sprints ?? rawPlayer?.sprints,
          goalkeeper_seconds: row.goalkeeper_seconds ?? rawPlayer?.goalkeeper_seconds,
          coverage_pct: row.coverage_pct ?? rawPlayer?.coverage_pct,
          pulmon_tracking: row.pulmon_tracking ?? rawPlayer?.pulmon_tracking,
          heatmap: heatmap?.heatmap || rawPlayer?.heatmap,
          heatmap_windows: heatmap?.heatmap_windows || rawPlayer?.heatmap_windows
        };
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
    }

    const trackingRows = APP.statsByPlayer.get(String(playerId)) || [];
    const trackingByMatch = new Map(
      trackingRows
        .filter(row => row.tracking_analyses?.partido_id)
        .map(row => [String(row.tracking_analyses.partido_id), row])
    );

    const history = filtered.map(row => {
      const participants = participantsByMatch.get(String(row.partido_id)) || [];
      const team = normalizeTeamNumber(row.equipo);
      return {
        participation: row,
        match: row.partidos,
        tracking: trackingByMatch.get(String(row.partido_id)) || null,
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

  function aggregatePlayerRows(rows) {
    const safeRows = rows || [];
    if (!safeRows.length) return null;
    const sum = (field) => safeRows.reduce((total, row) => total + toNumber(row[field]), 0);
    const avg = (field) => sum(field) / safeRows.length;
    const combinedHeatmap = combineHeatmaps(safeRows.map(row => row.heatmap).filter(Boolean));
    return {
      matches: safeRows.length,
      distance_km_avg: round(avg('distance_km'), 2),
      distance_km_total: round(sum('distance_km'), 2),
      avg_speed_kmh: round(avg('avg_speed_kmh'), 1),
      max_speed_kmh: round(Math.max(...safeRows.map(row => toNumber(row.max_speed_kmh))), 1),
      sprints_avg: round(avg('sprints'), 1),
      pulmon_tracking: round(avg('pulmon_tracking'), 1),
      high_intensity_seconds_avg: round(avg('high_intensity_seconds'), 1),
      coverage_pct: round(avg('coverage_pct'), 1),
      goalkeeper_seconds: round(avg('goalkeeper_seconds'), 1),
      heatmap: combinedHeatmap,
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

    if (!document.getElementById('tab-perfil-tracking-partidos')) {
      tabs.insertAdjacentHTML('beforeend', `
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="tab-perfil-tracking-partidos" data-bs-toggle="tab" data-bs-target="#perfil-tracking-partidos" type="button" role="tab">
            <i class="bi bi-calendar2-week me-1"></i>Partidos
          </button>
        </li>
      `);
    }

    if (!document.getElementById('perfil-tracking-partidos')) {
      content.insertAdjacentHTML('beforeend', `
        <div class="tab-pane fade" id="perfil-tracking-partidos" role="tabpanel">
          <div id="perfil-tracking-partidos-container"></div>
        </div>
      `);
    }

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
    bindProfileTabRender('tab-perfil-tracking-partidos');
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
      const active = document.querySelector('#tab-perfil-tracking.active, #tab-perfil-tracking-partidos.active');
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

    if (!aggregate) {
      const empty = `
        <div class="tracking-profile-card text-center py-5">
          <i class="bi bi-broadcast-pin fs-1 text-muted"></i>
          <p class="text-light-emphasis mt-3 mb-0">Este jugador todavia no tiene tracking importado.</p>
        </div>
      `;
      if (summaryContainer) summaryContainer.innerHTML = empty;
    } else if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="tracking-profile-grid">
          <div class="tracking-profile-card">
            <h5 class="text-white mb-3">Perfil fisico tracking</h5>
            <div class="tracking-kpi-grid">
              ${kpi('Partidos con tracking', aggregate.matches)}
              ${kpi('Pulmon tracking', `${aggregate.pulmon_tracking}/100`)}
              ${kpi('KM prom.', `${aggregate.distance_km_avg} km`)}
              ${kpi('Vel. prom.', `${aggregate.avg_speed_kmh} km/h`)}
              ${kpi('Vel. max', `${aggregate.max_speed_kmh} km/h`)}
              ${kpi('Cobertura', `${aggregate.coverage_pct}%`)}
            </div>
          </div>
          <div class="tracking-profile-card">
            <h6 class="text-white">Mapa de calor acumulado</h6>
            <canvas class="tracking-canvas" id="perfil-tracking-heatmap-canvas"></canvas>
          </div>
        </div>
      `;
      setTimeout(() => drawHeatmap(document.getElementById('perfil-tracking-heatmap-canvas'), DEFAULT_PITCH, aggregate.heatmap, []), 40);
    }

    if (matchesContainer) {
      matchesContainer.innerHTML = renderProfileMatchesDashboard(matchHistory, trackingRows, aggregate, matchHistoryError);
      matchesContainer.querySelector('[data-profile-action="tracking-full"]')?.addEventListener('click', () => {
        document.getElementById('tab-perfil-tracking')?.click();
      });
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
      acc.mistakes += toNumber(p.cagadas);
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
        </div>
        <div class="tracking-match-tags">
          <span class="tracking-match-tag ${teamClass}">Equipo ${escapeHtml(row.team || '-')}</span>
          <span class="tracking-match-tag">${Math.round(toNumber(row.sprints))} spr</span>
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
          <div class="tracking-match-metric">Cag<strong>${toNumber(p.cagadas)}</strong></div>
          <div class="tracking-match-metric">KM<strong>${hasTracking ? toNumber(row.distance_km).toFixed(2) : '-'}</strong></div>
          <div class="tracking-match-metric">Max<strong>${hasTracking ? toNumber(row.max_speed_kmh).toFixed(1) : '-'}</strong></div>
        </div>
        <div class="tracking-lineups">
          ${renderLineupColumn('Equipo', entry.teammates || [], p.jugador_id)}
          ${renderLineupColumn('Rivales', entry.rivals || [], p.jugador_id, true)}
        </div>
        <div class="tracking-match-tags">
          <span class="tracking-match-tag ${teamClass}">Equipo ${teamNumber}</span>
          <span class="tracking-match-tag ${hasTracking ? 'is-green' : 'is-muted'}">${hasTracking ? 'Tracking' : 'Sin tracking'}</span>
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
      const tab = document.getElementById('tab-perfil-tracking-partidos');
      if (!tab) return;
      if (!tab.classList.contains('active')) {
        if (window.bootstrap?.Tab) {
          window.bootstrap.Tab.getOrCreateInstance(tab).show();
        } else {
          tab.click();
        }
      }
      scheduleProfileTrackingRender(0);
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
        const active = document.querySelector('#tab-perfil-tracking.active, #tab-perfil-tracking-partidos.active');
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
      this.jugadores = this.jugadores.map((processed, index) => {
        const raw = jugadores[index] || {};
        const tracking = trackingForRawPlayer(raw);
        return {
          ...processed,
          id: raw.jugadores?.id || raw.jugador_id || raw.id || processed.id,
          tracking,
          pulmon: tracking?.pulmon_tracking ?? processed.pulmon,
          pulmonManual: processed.pulmon,
          pulmonTracking: tracking?.pulmon_tracking ?? null,
          trackingCoveragePct: tracking?.coverage_pct ?? 0,
          trackingIntensity: tracking?.high_intensity_seconds_avg ?? 0,
          trackingHeatmap: tracking?.heatmap || null,
          trackingGoalkeeperSeconds: tracking?.goalkeeper_seconds ?? 0
        };
      });
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
      return {
        ...stats,
        pulmonPromedio: tracking.pulmonAvg || stats.pulmonPromedio,
        trackingCoveragePct: tracking.coveragePct,
        trackingOverlapPct: tracking.overlapPct,
        trackingIntensity: tracking.intensityAvg,
        trackingPlayers: tracking.playersWithTracking
      };
    };
  }

  function evaluateTrackingTeam(team) {
    const withTracking = (team || []).filter(player => player.tracking || player.trackingHeatmap || player.pulmonTracking !== null);
    const heatmaps = withTracking.map(player => player.trackingHeatmap || player.tracking?.heatmap).filter(Boolean);
    const combined = combineHeatmaps(heatmaps);
    const pulmonValues = (team || []).map(player => toNumber(player.pulmonTracking ?? player.pulmon, 0)).filter(value => value > 0);
    const intensityValues = withTracking.map(player => toNumber(player.trackingIntensity, 0));
    const goalkeepers = (team || []).filter(player =>
      player.rolPartido === 'arquero' || toNumber(player.trackingGoalkeeperSeconds, 0) >= 300
    ).length;

    return {
      playersWithTracking: withTracking.length,
      pulmonAvg: pulmonValues.length ? round(pulmonValues.reduce((a, b) => a + b, 0) / pulmonValues.length, 1) : 0,
      intensityAvg: intensityValues.length ? round(intensityValues.reduce((a, b) => a + b, 0) / intensityValues.length, 1) : 0,
      coveragePct: heatmapCoveragePct(combined),
      overlapPct: teamHeatmapOverlap(withTracking.map(player => ({ tracking: { heatmap: player.trackingHeatmap || player.tracking?.heatmap } }))),
      goalkeepers
    };
  }

  function trackingFitnessPenalty(equipo1, equipo2) {
    const stats1 = evaluateTrackingTeam(equipo1);
    const stats2 = evaluateTrackingTeam(equipo2);
    if (stats1.playersWithTracking + stats2.playersWithTracking === 0) return 0;

    let penalty = 0;
    penalty += Math.abs(stats1.pulmonAvg - stats2.pulmonAvg) * 0.65;
    penalty += Math.abs(stats1.intensityAvg - stats2.intensityAvg) * 0.08;
    penalty += Math.abs(stats1.coveragePct - stats2.coveragePct) * 0.22;
    penalty += (stats1.overlapPct + stats2.overlapPct) * 0.16;
    if (stats1.goalkeepers === 0) penalty += 12;
    if (stats2.goalkeepers === 0) penalty += 12;
    return penalty;
  }

  function initDomObservers() {
    decorateHistoryCards();
    ensureProfileTabs();
    attachProfileObserver();

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
    combineHeatmaps,
    evaluateTrackingTeam,
    trackingFitnessPenalty,
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
