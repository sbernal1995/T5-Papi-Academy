const assert = require('assert');
const dataExport = require('../docs/data-export.js');

function run() {
  const tables = {
    temporadas: [{ id: 't1', nombre: 'Temporada Test' }],
    posicion: [{ id: 1, nombre: 'Arquero' }],
    jugadores: [
      { id: 'j1', nombre: 'Metox' },
      { id: 'j2', nombre: 'Boska' }
    ],
    jugador_posicion: [{ jugador_id: 'j1', posicion_id: 1, es_primaria: true }],
    partidos: [{ id: 'p1', fecha: '2026-06-20', cancha: 'T5', temporada_id: 't1', equipo_ganador: 1 }],
    jugador_partido: [
      { partido_id: 'p1', jugador_id: 'j1', equipo: 1, goles: 1, asistencias: 0, atajadas: 2, cagadas: 0, puntos: 3, mvp: true, ace: false },
      { partido_id: 'p1', jugador_id: 'j2', equipo: 2, goles: 0, asistencias: 0, atajadas: 0, cagadas: 1, puntos: 0, mvp: false, ace: false }
    ],
    goles: [
      { id: 'g1', partido_id: 'p1', goleador_id: 'j1', asistidor_id: 'j2', arquero_id: 'j2', equipo: 1, minuto: 3, es_gol_en_contra: false },
      { id: 'g2', partido_id: 'p1', goleador_id: 'j2', equipo: 1, minuto: 5, es_gol_en_contra: true, cagada_jugador_id: 'j2' }
    ],
    tracking_analyses: [{ id: 'a1', partido_id: 'p1' }],
    tracking_player_stats: [{ analysis_id: 'a1', jugador_id: 'j1', detected_name: 'Metox', distance_km: 1.2, sprints: 4 }]
  };

  const derived = dataExport.buildDerivedTables(tables);

  assert.strictEqual(derived.players[0].posiciones[0].posicion_nombre, 'Arquero');
  assert.strictEqual(derived.match_rows.length, 1);
  assert.strictEqual(derived.match_rows[0].goles_equipo_1, 2);
  assert.strictEqual(derived.match_rows[0].goles_equipo_2, 0);

  const metoxRow = derived.player_match_rows.find(row => row.jugador_id === 'j1');
  assert.strictEqual(metoxRow.resultado, 'win');
  assert.strictEqual(metoxRow.goles_eventos, 1);
  assert.strictEqual(metoxRow.asistencias_eventos, 0);
  assert.strictEqual(metoxRow.goles_equipo_favor, 2);

  const boskaRow = derived.player_match_rows.find(row => row.jugador_id === 'j2');
  assert.strictEqual(boskaRow.resultado, 'loss');
  assert.strictEqual(boskaRow.asistencias_eventos, 1);
  assert.strictEqual(boskaRow.goles_en_contra_eventos, 1);
  assert.strictEqual(boskaRow.cagadas_en_gol_eventos, 1);

  assert.strictEqual(derived.goal_rows[0].goleador_nombre, 'Metox');
  assert.strictEqual(derived.goal_rows[0].arquero_nombre, 'Boska');
  assert.strictEqual(derived.tracking_player_rows[0].jugador_nombre, 'Metox');

  console.log('data export tests passed');
}

run();
