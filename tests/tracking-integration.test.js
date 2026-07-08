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
    ]
  };
}

function run() {
  const normalized = tracking.normalizeFootballDetectorStats(sampleExport());
  assert.strictEqual(normalized.players.length, 2);
  assert.strictEqual(normalized.pitch.width, 32);
  assert.strictEqual(normalized.players[0].detected_name, 'Metox');
  assert.strictEqual(normalized.players[0].avg_speed_kmh, 7.2);
  assert.strictEqual(normalized.players[0].max_speed_kmh, 14.4);
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

  console.log('tracking integration tests passed');
}

run();
