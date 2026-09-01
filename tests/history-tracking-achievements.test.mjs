import assert from 'node:assert/strict';
import {
  calcularDistanciaTotalTrackingPartido,
  construirIndiceRecordsDistanciaJugador,
  encontrarPartidosConMayorDistancia,
  encontrarAtajadaClaveRemontada,
  esRecordDistanciaJugadorPartido,
  obtenerDistanciaTrackingJugador
} from '../docs/history-tracking-achievements.mjs';

function partidoConDistancias(id, temporadaId, distancias) {
  return {
    id,
    temporada_id: temporadaId,
    _tracking_distancia_jugadores: new Map(
      Object.entries(distancias).map(([jugadorId, distance_km]) => [jugadorId, { jugador_id: jugadorId, distance_km }])
    )
  };
}

const partido1 = partidoConDistancias('p1', 't1', { j1: 4.1, j2: 3.2 });
const partido2 = partidoConDistancias('p2', 't1', { j1: 5.4, j2: 3.2 });
const partido3 = partidoConDistancias('p3', 't2', { j1: 4.8 });
const indice = construirIndiceRecordsDistanciaJugador([partido1, partido2, partido3]);

assert.equal(calcularDistanciaTotalTrackingPartido(partido1), 7.3, 'debe sumar la distancia de todos los jugadores');
assert.deepEqual(
  encontrarPartidosConMayorDistancia([partido1, partido2, partido3]).partidos.map(item => item.partido.id),
  ['p2'],
  'debe encontrar el partido con mayor recorrido colectivo'
);
const partidoEmpatado = partidoConDistancias('p4', 't2', { j3: 8.6 });
assert.deepEqual(
  encontrarPartidosConMayorDistancia([partido2, partidoEmpatado]).partidos.map(item => item.partido.id),
  ['p2', 'p4'],
  'los empates deben conservar el record colectivo para ambos partidos'
);
assert.equal(obtenerDistanciaTrackingJugador(partido2, 'j1'), 5.4, 'debe obtener la distancia individual del partido');
assert.equal(esRecordDistanciaJugadorPartido(indice, partido1, 'j1'), null, 'un partido inferior no es record personal de temporada');
assert.equal(esRecordDistanciaJugadorPartido(indice, partido2, 'j1')?.distanciaKm, 5.4, 'debe marcar el maximo personal de la temporada');
assert.equal(esRecordDistanciaJugadorPartido(indice, partido3, 'j1')?.distanciaKm, 4.8, 'los records personales deben separarse por temporada');

const partidoRemontada = {
  jugador_partido: [
    { jugador_id: 'a1', equipo: 1, jugadores: { nombre: 'Arquero rival' } },
    { jugador_id: 'a2', equipo: 2, jugadores: { nombre: 'Berni' } }
  ],
  review_eventos: [
    {
      tipo: 'atajadas',
      jugador_id: 'a2',
      cantidad: 3,
      minuto_partido: 12,
      metadata: { marcador_equipo1: 2, marcador_equipo2: 1 }
    },
    {
      tipo: 'atajadas',
      jugador_id: 'a2',
      cantidad: 5,
      minuto_partido: 18,
      metadata: { marcador_equipo1: 3, marcador_equipo2: 1 }
    },
    {
      tipo: 'atajadas',
      jugador_id: 'a2',
      cantidad: 5,
      minuto_partido: 30,
      metadata: { marcador_equipo1: 3, marcador_equipo2: 3 }
    }
  ]
};
const dinamicaRemontada = {
  ganador: 2,
  remontada: { equipo: 2, deficit: 2, desde: '1-3' },
  eventos: []
};
const atajadaClave = encontrarAtajadaClaveRemontada(partidoRemontada, dinamicaRemontada);

assert.equal(atajadaClave?.jugadorNombre, 'Berni', 'debe atribuir el hito al arquero del equipo que remonto');
assert.equal(atajadaClave?.cantidad, 5, 'debe priorizar las atajadas clave de valor 5');
assert.equal(atajadaClave?.marcadorTexto, '3-1', 'debe conservar el marcador en el momento de la atajada');
assert.equal(
  encontrarAtajadaClaveRemontada(partidoRemontada, { ...dinamicaRemontada, remontada: null }),
  null,
  'sin remontada no debe crear el hito de atajada clave'
);

const atajadaPorTimeline = encontrarAtajadaClaveRemontada({
  jugador_partido: [{ jugador_id: 'a2', equipo: 2, jugadores: { nombre: 'Berni' } }],
  review_eventos: [{ tipo: 'atajadas', jugador_id: 'a2', cantidad: 3, minuto_partido: 2 }]
}, {
  ganador: 2,
  remontada: { equipo: 2, deficit: 1, desde: '0-1' },
  eventos: [{ equipoGol: 1, segundos: 60 }]
});
assert.equal(atajadaPorTimeline?.marcadorTexto, '1-0', 'si falta metadata debe reconstruir el marcador con la timeline');

console.log('history tracking achievements tests passed');
