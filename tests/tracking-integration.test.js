const assert = require('assert');
const tracking = require('../docs/tracking-integration.js');

function sampleExport() {
  return {
    version: '0.3.2',
    duration_seconds: 600,
    pitch: { width: 32, height: 16 },
    team_own_sides: {
      A: { own_side: 'left', rival_side: 'right' },
      B: { own_side: 'right', rival_side: 'left' }
    },
    players: [
      {
        player_id: 'P01',
        name: 'Metox',
        team: 'A',
        distance_m: 1200,
        distance_km: 1.2,
        speed_avg_mps: 2,
        speed_peak_mps: 4,
        raw_speed_max_mps: 8,
        sprints: 4,
        high_intensity_seconds: 30,
        accel_max_mps2: 3,
        decel_max_mps2: -3,
        avg_position: { x: 10, y: 8 },
        dispersion_m: 2,
        coverage_pct: 25,
        speed_distribution_pct: { walk: 40, trot: 40, sprint: 20 },
        windows: [
          { start_seconds: 0, end_seconds: 300, distance_m: 700, high_intensity_seconds: 20 },
          { start_seconds: 300, end_seconds: 600, distance_m: 500, high_intensity_seconds: 10 }
        ],
        field_side: { own_pct: 40, rival_pct: 60 },
        goalkeeper_role: { total_seconds: 0, episodes: [] },
        pulmon: { fis_version: 'FIS v1', fis: 88, dimensions: { motor: 90, tanque: 82 } },
        physical_profile: { fis_version: 'FIS v1', fis: 88, dimensions: { motor: 90, tanque: 82 } },
        defense: {
          defense_score: 76.4,
          defense_score_method: 'tracking_movement',
          defensive_half_pct: 64.2,
          defensive_third_pct: 31.5,
          defensive_distance_m: 420
        },
        heatmap: {
          x_bins: 2,
          y_bins: 2,
          counts: [
            [10, 0],
            [0, 0]
          ]
        }
      },
      {
        player_id: 'P02',
        name: 'Boska',
        team: 'B',
        field_role: {
          distance_m: 600,
          distance_km: 0.6,
          speed_avg_mps: 1.5,
          speed_peak_mps: 3,
          sprints: 1,
          high_intensity_seconds: 5,
          windows: [
            { start_seconds: 0, end_seconds: 300, distance_m: 0, high_intensity_seconds: 2 },
            { start_seconds: 300, end_seconds: 600, distance_m: 0, high_intensity_seconds: 3 }
          ],
          avg_position: { x: 22, y: 8 },
          coverage_pct: 10,
          heatmap: {
            x_bins: 2,
            y_bins: 2,
            counts: [
              [0, 0],
              [0, 5]
            ]
          }
        },
        goalkeeper_role: { total_seconds: 120, episodes: [{ start_seconds: 0, end_seconds: 120 }] },
        field_side: { own_pct: 70, rival_pct: 30 }
      }
    ],
    available_metrics: {
      physical_tracking: true,
      heatmaps: true,
      defensive_movement_score: true,
      goal_event_positions: false,
      advanced_defense_score: true,
      shot_map: true
    },
    advanced_defense: {
      schema: 'football-detector-advanced-defense',
      enabled: true,
      coverage: { danger_events: 2, goal_events: 1, saved_shot_events: 1 },
      players: [
        {
          player_id: 'P01',
          name: 'Metox',
          team: 'A',
          score: 71.2,
          axes: { duel: 70, sacrifice: 74, order: 66, responsibility: 75 },
          event_blame: { total: 0.8, hero_bonus: 0.5 },
          phase_metrics: { defensive_seconds: 300, pressure_successes: 2, avg_return_speed_to_own_goal_mps: 2.4 },
          thirds: [{ score: 80 }, { score: 70 }, { score: 64 }]
        }
      ],
      events: [
        {
          event_id: 'goal-1',
          type: 'goal',
          order: 1,
          sam3_seconds: 120,
          defending_team: 'A',
          shooter: { player_id: 'P02', name: 'Boska' },
          context: { state: '2v2', phase: { phase: 'settled' } },
          weighting: { total_blame: 4 },
          assignments: [{ player_id: 'P01', name: 'Metox', capped_blame: 0.8 }]
        }
      ]
    },
    shot_map: {
      events: [
        {
          type: 'goal',
          outcome: 'goal',
          order: 1,
          player_id: 'P01',
          name: 'Metox',
          team: 'A',
          match_seconds: 154,
          x: 12.5,
          y: 6.25,
          active_goalkeeper: { player_id: 'P02', name: 'Boska', team: 'B' },
          position_source: 'review_tracking'
        },
        {
          type: 'goal',
          outcome: 'goal',
          order: 2,
          player_id: 'P02',
          name: 'Boska',
          team: 'B',
          match_seconds: 330,
          x: 24,
          y: 9
        }
      ]
    },
    review_analysis: {
      enabled: true,
      tracking_only: true,
      event_metrics_enabled: false,
      reason: 'review legacy test',
      coverage: { goals_total: 2, goals_linked: 0 },
      shot_map: {
        events: [
          {
            type: 'goal',
            outcome: 'goal',
            order: 1,
            player_id: 'P01',
            name: 'Metox',
            match_seconds: 154,
            x: 12.5,
            y: 6.25
          }
        ]
      },
      defensive_players: [
        { player_id: 'P01', name: 'Metox', team: 'A', role: 'field', defense_score: 76.4 }
      ]
    },
    effective_play: { enabled: true, play_seconds: 420, pause_seconds: 180, net_play_pct: 70 },
    match_story: { enabled: true, final_score: { A: 1, B: 1 }, goals: [{ order: 1, tags: ['apertura'] }] },
    cross_stats: { enabled: true, goals_by_real_goalkeeper: [] },
    physical_profile: { enabled: true, fis_version: 'FIS v1', players: [{ player_id: 'P01', fis: 88 }] },
    matchmaker_seed: { enabled: true, proposals: [{ cost: 3.2 }] },
    supabase_export: { enabled: true, tables: { partido_metricas_jugador: [] } },
    match_link: {
      sync_mode: 'tracking_only',
      tracking_only: true,
      coverage: { goals_total: 2, goals_linked: 0 }
    }
  };
}

async function run() {
  const normalized = tracking.normalizeFootballDetectorStats(sampleExport());
  assert.strictEqual(normalized.players.length, 2);
  assert.strictEqual(normalized.pitch.width, 32);
  assert.strictEqual(normalized.players[0].detected_name, 'Metox');
  assert.strictEqual(normalized.players[0].avg_speed_kmh, 7.2);
  assert.strictEqual(normalized.players[0].max_speed_kmh, 14.4);
  assert.strictEqual(normalized.players[0].defense_score, 76.4);
  assert.strictEqual(normalized.players[0].advanced_defense_score, 71.2);
  assert.strictEqual(normalized.players[0].advanced_defense.axes.duel, 70);
  assert.strictEqual(normalized.players[0].pulmon_tracking, 88);
  assert.strictEqual(normalized.players[0].fis_valor, 88);
  assert.strictEqual(normalized.players[0].fis_version, 'FIS v1');
  assert.strictEqual(normalized.players[0].field_seconds, 600);
  assert.strictEqual(normalized.players[0].distance_per_40_min_km, 4.8);
  assert.strictEqual(normalized.players[0].own_side, 'left');
  assert.strictEqual(normalized.players[1].field_seconds, 480);
  assert.strictEqual(normalized.players[1].distance_per_40_min_km, 3);
  assert.strictEqual(normalized.players[1].own_side, 'right');
  assert.deepStrictEqual(normalized.players[0].dominant_position_m, { x: 8, y: 4, source: 'heatmap_hotspot' });
  assert.strictEqual(normalized.players[0].goal_locations.length, 1);
  assert.strictEqual(normalized.players[0].goal_locations[0].x, 12.5);
  assert.strictEqual(normalized.players[0].goal_locations[0].pitch_width_m, 32);
  assert.strictEqual(normalized.players[0].goal_locations[0].goalkeeper.name, 'Boska');
  assert.strictEqual(normalized.effective_play.net_play_pct, 70);
  assert.strictEqual(normalized.match_story.goals.length, 1);
  assert.strictEqual(normalized.matchmaker_seed.proposals.length, 1);
  assert.strictEqual(normalized.supabase_export.enabled, true);
  assert.strictEqual(normalized.advanced_defense.coverage.danger_events, 2);
  assert.strictEqual(normalized.shot_map.events.length, 2);
  assert.strictEqual(normalized.available_metrics.defensive_movement_score, true);
  assert.strictEqual(normalized.available_metrics.advanced_defense_score, true);
  assert.strictEqual(normalized.review_analysis.tracking_only, true);
  assert.strictEqual(normalized.match_link.sync_mode, 'tracking_only');
  assert(normalized.players[0].pulmon_tracking > normalized.players[1].pulmon_tracking);

  const overlapSame = tracking.heatmapOverlap(
    { counts: [[5, 0], [0, 0]], x_bins: 2, y_bins: 2 },
    { counts: [[10, 0], [0, 0]], x_bins: 2, y_bins: 2 }
  );
  assert.strictEqual(overlapSame, 100);

  const overlapDifferent = tracking.heatmapOverlap(
    { counts: [[5, 0], [0, 0]], x_bins: 2, y_bins: 2 },
    { counts: [[0, 0], [0, 5]], x_bins: 2, y_bins: 2 }
  );
  assert.strictEqual(overlapDifferent, 0);

  const combined = tracking.combineHeatmaps([
    { counts: [[1, 0], [0, 0]], x_bins: 2, y_bins: 2 },
    { counts: [[0, 2], [0, 0]], x_bins: 2, y_bins: 2 }
  ]);
  assert.deepStrictEqual(combined.counts, [[1, 2], [0, 0]]);
  const dominant = tracking.heatmapDominantPosition({ counts: [[0, 0], [0, 9]], x_bins: 2, y_bins: 2 }, { width: 32, height: 16 });
  assert.deepStrictEqual(dominant, { x: 24, y: 12, source: 'heatmap_hotspot' });

  const rightSideDefender = tracking.orientHeatmapDefenseToAttack(
    { counts: [[0, 8], [0, 0]], x_bins: 2, y_bins: 2 },
    { own_side: 'right' }
  );
  assert.deepStrictEqual(rightSideDefender.counts, [[8, 0], [0, 0]]);
  assert.strictEqual(rightSideDefender.orientation, 'defense_to_attack');
  const rightSideGoal = tracking.orientPointDefenseToAttack(
    { x: 8, y: 6, pitch_width_m: 32, pitch_height_m: 16 },
    { own_side: 'right' }
  );
  assert.strictEqual(rightSideGoal.x, 24);
  assert.strictEqual(rightSideGoal.y, 6);
  assert.strictEqual(rightSideGoal.orientation, 'defense_to_attack');

  const windowSeries = tracking.buildTeamPulmonWindowSeries({ analysis: { duration_seconds: 600 }, players: normalized.players });
  assert.strictEqual(windowSeries.length, 2);
  assert.strictEqual(windowSeries[0].teams.A.distance_m, 700);
  assert(windowSeries[0].teams.B.distance_m > 0);
  assert.strictEqual(windowSeries[0].teams.B.estimated_distance, true);
  assert(windowSeries[0].teams.A.km_per_40 > 0);

  const playerWindowSeries = tracking.buildPlayerPulmonWindowSeries([
    {
      distance_km: 1.2,
      goalkeeper_seconds: 0,
      tracking_analyses: { duration_seconds: 600 },
      metrics: {
        windows: [
          { start_seconds: 0, end_seconds: 300, distance_m: 700, high_intensity_seconds: 20 },
          { start_seconds: 300, end_seconds: 600, distance_m: 500, high_intensity_seconds: 10 }
        ]
      }
    },
    {
      distance_km: 1,
      goalkeeper_seconds: 0,
      tracking_analyses: { duration_seconds: 600 },
      metrics: {
        windows: [
          { start_seconds: 0, end_seconds: 300, distance_m: 600, high_intensity_seconds: 15 },
          { start_seconds: 300, end_seconds: 600, distance_m: 400, high_intensity_seconds: 8 }
        ]
      }
    }
  ]);
  assert.strictEqual(playerWindowSeries.length, 2);
  assert.strictEqual(playerWindowSeries[0].matches, 2);
  assert.strictEqual(playerWindowSeries[0].distance_m_avg, 650);
  assert.strictEqual(playerWindowSeries[0].km_per_40, 5.2);
  assert.strictEqual(playerWindowSeries[1].km_per_40, 3.6);
  assert(playerWindowSeries[0].km_per_40 > playerWindowSeries[1].km_per_40);

  const unevenFinalWindows = tracking.buildPlayerPulmonWindowSeries([
    {
      tracking_analyses: { duration_seconds: 338 },
      metrics: { windows: [
        { start_seconds: 0, end_seconds: 300, distance_m: 500 },
        { start_seconds: 300, end_seconds: 338, distance_m: 60 }
      ] }
    },
    {
      tracking_analyses: { duration_seconds: 586 },
      metrics: { windows: [
        { start_seconds: 0, end_seconds: 300, distance_m: 450 },
        { start_seconds: 300, end_seconds: 586, distance_m: 420 }
      ] }
    }
  ]);
  assert.strictEqual(unevenFinalWindows.length, 2);
  assert.strictEqual(unevenFinalWindows[1].start_seconds, 300);
  assert.strictEqual(unevenFinalWindows[1].end_seconds, 586);
  assert.strictEqual(unevenFinalWindows[1].matches, 2);

  const teamPenalty = tracking.trackingFitnessPenalty(
    [
      { pulmonTracking: 80, trackingIntensity: 20, trackingHeatmap: { counts: [[5, 0], [0, 0]], x_bins: 2, y_bins: 2 }, trackingGoalkeeperSeconds: 500 },
      { pulmonTracking: 70, trackingIntensity: 10, trackingHeatmap: { counts: [[5, 0], [0, 0]], x_bins: 2, y_bins: 2 } }
    ],
    [
      { pulmonTracking: 75, trackingIntensity: 15, trackingHeatmap: { counts: [[0, 0], [0, 5]], x_bins: 2, y_bins: 2 }, trackingGoalkeeperSeconds: 500 },
      { pulmonTracking: 72, trackingIntensity: 14, trackingHeatmap: { counts: [[0, 5], [0, 0]], x_bins: 2, y_bins: 2 } }
    ]
  );
  assert(teamPenalty > 0);

  const mappings = new Map([['P01', { jugador_id: 'jugador-1' }]]);
  const statsRows = tracking.buildTrackingPlayerStatsRows(normalized, mappings, 'analysis-1', 'match-1');
  assert.strictEqual(statsRows[0].analysis_id, 'analysis-1');
  assert.strictEqual(statsRows[0].partido_id, 'match-1');
  assert.strictEqual(statsRows[0].source_player_id, 'P01');
  assert.strictEqual(statsRows[0].source_name, 'Metox');
  assert.strictEqual(statsRows[0].normalized_name, 'metox');
  assert.strictEqual(statsRows[0].jugador_id, 'jugador-1');
  assert.strictEqual(statsRows[0].defense_score, 76.4);
  assert.strictEqual(statsRows[0].advanced_defense_score, 71.2);
  assert.strictEqual(statsRows[0].fis_valor, 88);
  assert.strictEqual(statsRows[0].goal_locations.length, 1);
  assert.strictEqual(statsRows[0].metrics.goal_locations.length, 1);
  assert.strictEqual(statsRows[0].metrics.own_side, 'left');

  const shotRows = tracking.buildTrackingShotEventRows(normalized, mappings, 'analysis-1', 'match-1');
  assert.strictEqual(shotRows.length, 2);
  assert.strictEqual(shotRows[0].analysis_id, 'analysis-1');
  assert.strictEqual(shotRows[0].partido_id, 'match-1');
  assert.strictEqual(shotRows[0].source_player_id, 'P01');
  assert.strictEqual(shotRows[0].source_name, 'Metox');
  assert.strictEqual(shotRows[0].jugador_id, 'jugador-1');
  assert.strictEqual(shotRows[0].outcome, 'goal');
  assert.strictEqual(shotRows[0].x_m, 12.5);
  assert.strictEqual(shotRows[0].active_goalkeeper_name, 'Boska');
  const reconstructedShotMap = tracking.shotMapFromRows(shotRows, {});
  assert.strictEqual(reconstructedShotMap.events.length, 2);
  assert.strictEqual(reconstructedShotMap.events[0].active_goalkeeper.name, 'Boska');

  const advancedEventRows = tracking.buildAdvancedDefenseEventRows(normalized, 'analysis-1', 'match-1');
  const advancedAssignmentRows = tracking.buildAdvancedDefenseAssignmentRows(normalized, mappings, 'analysis-1', 'match-1');
  assert.strictEqual(advancedEventRows.length, 1);
  assert.strictEqual(advancedEventRows[0].partido_id, 'match-1');
  assert.strictEqual(advancedEventRows[0].event_type, 'goal');
  assert.strictEqual(advancedEventRows[0].shooter_name, 'Boska');
  assert.strictEqual(advancedEventRows[0].total_blame, 4);
  assert.strictEqual(advancedAssignmentRows.length, 1);
  assert.strictEqual(advancedAssignmentRows[0].partido_id, 'match-1');
  assert.strictEqual(advancedAssignmentRows[0].source_player_id, 'P01');
  assert.strictEqual(advancedAssignmentRows[0].source_name, 'Metox');
  assert.strictEqual(advancedAssignmentRows[0].jugador_id, 'jugador-1');
  assert.strictEqual(advancedAssignmentRows[0].capped_blame, 0.8);
  const reconstructedAdvanced = tracking.advancedDefenseFromRows(advancedEventRows, advancedAssignmentRows, normalized.advanced_defense);
  assert.strictEqual(reconstructedAdvanced.events.length, 1);
  assert.strictEqual(reconstructedAdvanced.events[0].assignments.length, 1);
  assert.strictEqual(reconstructedAdvanced.events[0].assignments[0].capped_blame, 0.8);
  assert.strictEqual(tracking.resolveImportPartidoId({ partidoId: ' match-1 ' }), 'match-1');
  assert.strictEqual(tracking.resolveImportPartidoId({ partidoId: '', normalized: { raw: { match: { id: 'match-2' } } } }), 'match-2');
  assert.strictEqual(tracking.resolveImportPartidoId({ partidoId: '' }), null);

  const aggregate = tracking.aggregatePlayerRows([
    {
      distance_km: 1.2,
      avg_speed_kmh: 7.2,
      max_speed_kmh: 14.4,
      sprints: 4,
      pulmon_tracking: 88,
      fis_valor: 88,
      defense_score: 76.4,
      advanced_defense_score: 71.2,
      advanced_defense_axes: { duel: 70, order: 66 },
      physical_profile: { dimensions: { motor: 90, tanque: 82 } },
      distance_per_40_min_km: 4.8,
      high_intensity_seconds: 30,
      coverage_pct: 25,
      goalkeeper_seconds: 0,
      heatmap: normalized.players[0].heatmap,
      goal_locations: normalized.players[0].goal_locations
    }
  ]);
  assert.strictEqual(aggregate.fis_valor, 88);
  assert.strictEqual(aggregate.distance_per_40_min_km, 4.8);
  assert.strictEqual(aggregate.defense_score, 76.4);
  assert.strictEqual(aggregate.advanced_defense_score, 71.2);
  assert.strictEqual(aggregate.physical_dimensions.motor, 90);
  assert.strictEqual(aggregate.advanced_defense_axes.duel, 70);
  assert.strictEqual(aggregate.goal_locations.length, 1);

  const orientedAggregate = tracking.aggregatePlayerRows([
    {
      distance_km: 1,
      avg_speed_kmh: 7,
      max_speed_kmh: 10,
      sprints: 1,
      pulmon_tracking: 50,
      high_intensity_seconds: 10,
      coverage_pct: 20,
      goalkeeper_seconds: 0,
      own_side: 'left',
      heatmap: { counts: [[6, 0], [0, 0]], x_bins: 2, y_bins: 2 },
      goal_locations: [{ order: 1, x: 24, y: 6, pitch_width_m: 32, pitch_height_m: 16 }]
    },
    {
      distance_km: 1,
      avg_speed_kmh: 7,
      max_speed_kmh: 10,
      sprints: 1,
      pulmon_tracking: 50,
      high_intensity_seconds: 10,
      coverage_pct: 20,
      goalkeeper_seconds: 0,
      own_side: 'right',
      heatmap: { counts: [[0, 6], [0, 0]], x_bins: 2, y_bins: 2 },
      goal_locations: [{ order: 2, x: 8, y: 6, pitch_width_m: 32, pitch_height_m: 16 }]
    }
  ]);
  assert.strictEqual(orientedAggregate.heatmap.orientation, 'defense_to_attack');
  assert(orientedAggregate.heatmap.counts[0][0] > orientedAggregate.heatmap.counts[0][1]);
  assert(orientedAggregate.dominant_position_m.x < 16);
  assert.strictEqual(orientedAggregate.goal_locations.length, 2);
  assert.deepStrictEqual(orientedAggregate.goal_locations.map(goal => goal.x), [24, 24]);
  assert.strictEqual(orientedAggregate.goal_locations[1].source_own_side, 'right');

  assert.strictEqual(
    tracking.schemaMissingColumn({ message: "Could not find the 'pitch_height_m' column of 'tracking_analyses' in the schema cache" }),
    'pitch_height_m'
  );

  const upsertCalls = [];
  const fakeClient = {
    from(table) {
      assert.strictEqual(table, 'tracking_analyses');
      return {
        upsert(row) {
          upsertCalls.push({ ...row });
          return {
            select() {
              return {
                async single() {
                  if (upsertCalls.length === 1) {
                    return {
                      data: null,
                      error: { message: "Could not find the 'pitch_height_m' column of 'tracking_analyses' in the schema cache" }
                    };
                  }
                  return { data: { id: 'analysis-1', partido_id: row.partido_id }, error: null };
                }
              };
            }
          };
        }
      };
    }
  };
  const analysisResult = await tracking.upsertTrackingAnalysisRow(fakeClient, {
    partido_id: 'match-1',
    export_schema: 't5-football-detector-export',
    export_schema_version: '1.1',
    source_schema: 'football-detector-stats',
    source_version: '0.3.3',
    duration_seconds: 600,
    pitch_width_m: 32,
    pitch_height_m: 16,
    available_metrics: normalized.available_metrics,
    match_link: normalized.match_link,
    review_analysis: normalized.review_analysis,
    advanced_defense: normalized.advanced_defense,
    shot_map: normalized.shot_map,
    effective_play: normalized.effective_play,
    match_story: normalized.match_story,
    cross_stats: normalized.cross_stats,
    physical_profile: normalized.physical_profile,
    matchmaker_seed: normalized.matchmaker_seed,
    supabase_export: normalized.supabase_export,
    goalkeeper_detection: normalized.goalkeeper_detection,
    metrics_v2: normalized.metrics_v2,
    config_json: normalized.config,
    team_own_sides: normalized.team_own_sides,
    limitations: normalized.limitations,
    raw_json: { ok: true },
    summary: { players: 2 }
  });
  assert.deepStrictEqual(analysisResult.omittedColumns, ['pitch_height_m']);
  assert.strictEqual(upsertCalls.length, 2);
  assert.strictEqual(upsertCalls[0].pitch_height_m, 16);
  assert.strictEqual(upsertCalls[0].shot_map.events.length, 2);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(upsertCalls[1], 'pitch_height_m'), false);
  assert.strictEqual(upsertCalls[1].advanced_defense.events.length, 1);
  assert.strictEqual(analysisResult.analysis.id, 'analysis-1');

  const insertCalls = [];
  const fakeInsertClient = {
    from(table) {
      assert.strictEqual(table, 'tracking_player_stats');
      return {
        async insert(rows) {
          insertCalls.push(rows.map(row => ({ ...row })));
          if (insertCalls.length === 1) {
            return {
              error: { message: "Could not find the 'advanced_defense_score' column of 'tracking_player_stats' in the schema cache" }
            };
          }
          return { error: null };
        }
      };
    }
  };
  const insertResult = await tracking.insertRows(fakeInsertClient, 'tracking_player_stats', statsRows);
  assert.deepStrictEqual(insertResult.omittedColumns, ['advanced_defense_score']);
  assert.strictEqual(insertCalls.length, 2);
  assert.strictEqual(insertCalls[0][0].advanced_defense_score, 71.2);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(insertCalls[1][0], 'advanced_defense_score'), false);

  const mappingInsertCalls = [];
  const fakeMappingClient = {
    from(table) {
      assert.strictEqual(table, 'tracking_player_mapping');
      return {
        async insert(rows) {
          mappingInsertCalls.push(rows.map(row => ({ ...row })));
          if (mappingInsertCalls.length === 1) {
            return {
              error: { message: "Could not find the 'confidence' column of 'tracking_player_mapping' in the schema cache" }
            };
          }
          return { error: null };
        }
      };
    }
  };
  const mappingResult = await tracking.insertRows(fakeMappingClient, 'tracking_player_mapping', [{
    analysis_id: 'analysis-1',
    partido_id: 'match-1',
    player_id: 'P01',
    source_player_id: 'P01',
    detected_name: 'Metox',
    source_name: 'Metox',
    normalized_name: 'metox',
    team: 'A',
    jugador_id: 'jugador-1',
    confidence: 0.92
  }]);
  assert.deepStrictEqual(mappingResult.omittedColumns, ['confidence']);
  assert.strictEqual(mappingInsertCalls.length, 2);
  assert.strictEqual(mappingInsertCalls[0][0].partido_id, 'match-1');
  assert.strictEqual(mappingInsertCalls[1][0].partido_id, 'match-1');
  assert.strictEqual(mappingInsertCalls[1][0].source_player_id, 'P01');
  assert.strictEqual(mappingInsertCalls[1][0].source_name, 'Metox');
  assert.strictEqual(mappingInsertCalls[1][0].normalized_name, 'metox');
  assert.strictEqual(mappingInsertCalls[0][0].confidence, 0.92);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(mappingInsertCalls[1][0], 'confidence'), false);

  console.log('tracking integration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
