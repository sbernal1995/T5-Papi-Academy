const assert = require('assert');
const tracking = require('../docs/tracking-integration.js');

function sampleExport() {
  return {
    version: '0.3.2',
    duration_seconds: 600,
    pitch: { width: 32, height: 16 },
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
          distance_m: 900,
          distance_km: 0.9,
          speed_avg_mps: 1.5,
          speed_peak_mps: 3,
          sprints: 1,
          high_intensity_seconds: 5,
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
    shot_map: { events: [{ type: 'goal', outcome: 'goal', order: 1 }] },
    review_analysis: {
      enabled: true,
      tracking_only: true,
      event_metrics_enabled: false,
      reason: 'review legacy test',
      coverage: { goals_total: 2, goals_linked: 0 },
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
  assert.strictEqual(normalized.effective_play.net_play_pct, 70);
  assert.strictEqual(normalized.match_story.goals.length, 1);
  assert.strictEqual(normalized.matchmaker_seed.proposals.length, 1);
  assert.strictEqual(normalized.supabase_export.enabled, true);
  assert.strictEqual(normalized.advanced_defense.coverage.danger_events, 2);
  assert.strictEqual(normalized.shot_map.events.length, 1);
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
    source_version: '0.3.3',
    duration_seconds: 600,
    pitch_width_m: 32,
    pitch_height_m: 16,
    raw_json: { ok: true },
    summary: { players: 2 }
  });
  assert.deepStrictEqual(analysisResult.omittedColumns, ['pitch_height_m']);
  assert.strictEqual(upsertCalls.length, 2);
  assert.strictEqual(upsertCalls[0].pitch_height_m, 16);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(upsertCalls[1], 'pitch_height_m'), false);
  assert.strictEqual(analysisResult.analysis.id, 'analysis-1');

  console.log('tracking integration tests passed');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
