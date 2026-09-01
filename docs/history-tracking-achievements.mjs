const DISTANCE_EPSILON_KM = 0.001;

function numeroFinito(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function metadataEvento(evento = {}) {
  const metadata = evento?.metadata;
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  if (typeof metadata !== 'string') return {};

  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function obtenerDistanciaTrackingJugador(partido, jugadorId) {
  if (!partido || !jugadorId) return null;
  const mapa = partido._tracking_distancia_jugadores;
  if (!(mapa instanceof Map)) return null;
  const fila = mapa.get(String(jugadorId));
  const distanciaKm = numeroFinito(fila?.distance_km);
  return distanciaKm !== null && distanciaKm > 0 ? distanciaKm : null;
}

export function calcularDistanciaTotalTrackingPartido(partido) {
  const mapa = partido?._tracking_distancia_jugadores;
  if (!(mapa instanceof Map) || mapa.size === 0) return null;

  const distancias = [...mapa.values()]
    .map(fila => numeroFinito(fila?.distance_km))
    .filter(distancia => distancia !== null && distancia > 0);
  if (!distancias.length) return null;

  return distancias.reduce((total, distancia) => total + distancia, 0);
}

export function encontrarPartidosConMayorDistancia(partidos = []) {
  const candidatos = (Array.isArray(partidos) ? partidos : [])
    .map(partido => ({ partido, distanciaKm: calcularDistanciaTotalTrackingPartido(partido) }))
    .filter(item => Number.isFinite(item.distanciaKm) && item.distanciaKm > 0);
  if (!candidatos.length) return { maximoKm: null, partidos: [] };

  const maximoKm = Math.max(...candidatos.map(item => item.distanciaKm));
  return {
    maximoKm,
    partidos: candidatos.filter(item => Math.abs(item.distanciaKm - maximoKm) <= DISTANCE_EPSILON_KM)
  };
}

export function construirIndiceRecordsDistanciaJugador(partidos = []) {
  const records = new Map();

  (Array.isArray(partidos) ? partidos : []).forEach(partido => {
    const temporadaId = String(partido?.temporada_id || partido?.temporadas?.id || 'sin-temporada');
    const mapa = partido?._tracking_distancia_jugadores;
    if (!(mapa instanceof Map)) return;

    mapa.forEach((fila, jugadorIdRaw) => {
      const jugadorId = String(jugadorIdRaw || fila?.jugador_id || '');
      const partidoId = String(partido?.id || '');
      const distanciaKm = numeroFinito(fila?.distance_km);
      if (!jugadorId || !partidoId || distanciaKm === null || distanciaKm <= 0) return;

      const key = `${temporadaId}::${jugadorId}`;
      const actual = records.get(key);
      if (!actual || distanciaKm > actual.distanciaKm + DISTANCE_EPSILON_KM) {
        records.set(key, {
          temporadaId,
          jugadorId,
          distanciaKm,
          partidoIds: new Set([partidoId])
        });
        return;
      }

      if (Math.abs(distanciaKm - actual.distanciaKm) <= DISTANCE_EPSILON_KM) {
        actual.partidoIds.add(partidoId);
      }
    });
  });

  return records;
}

export function esRecordDistanciaJugadorPartido(indice, partido, jugadorId) {
  if (!(indice instanceof Map) || !partido || !jugadorId) return null;
  const temporadaId = String(partido.temporada_id || partido.temporadas?.id || 'sin-temporada');
  const record = indice.get(`${temporadaId}::${String(jugadorId)}`);
  if (!record || !record.partidoIds.has(String(partido.id || ''))) return null;
  return record;
}

function marcadorDesdeMetadata(metadata) {
  const equipo1 = numeroFinito(metadata?.marcador_equipo1);
  const equipo2 = numeroFinito(metadata?.marcador_equipo2);
  if (equipo1 === null || equipo2 === null) return null;
  return { 1: equipo1, 2: equipo2 };
}

function marcadorDesdeTimeline(eventosGoles, segundosAtajada) {
  if (!Number.isFinite(segundosAtajada)) return null;
  const marcador = { 1: 0, 2: 0 };
  (Array.isArray(eventosGoles) ? eventosGoles : []).forEach(evento => {
    if (!Number.isFinite(evento?.segundos) || evento.segundos > segundosAtajada) return;
    if (evento.equipoGol === 1 || evento.equipoGol === 2) marcador[evento.equipoGol] += 1;
  });
  return marcador;
}

export function encontrarAtajadaClaveRemontada(partido, dinamica = {}) {
  const equipoGanador = Number(dinamica?.remontada?.equipo);
  if ((equipoGanador !== 1 && equipoGanador !== 2) || Number(dinamica?.ganador) !== equipoGanador) return null;
  const rival = equipoGanador === 1 ? 2 : 1;
  const jugadores = Array.isArray(partido?.jugador_partido) ? partido.jugador_partido : [];
  const eventosGoles = Array.isArray(dinamica?.eventos) ? dinamica.eventos : [];

  const candidatas = (Array.isArray(partido?.review_eventos) ? partido.review_eventos : [])
    .filter(evento => evento?.tipo === 'atajadas' && [3, 5].includes(Number(evento?.cantidad)))
    .map(evento => {
      const jugadorId = String(evento?.jugador_id || metadataEvento(evento).atajadas_jugador_id || '');
      const jugador = jugadores.find(jp => String(jp?.jugador_id || jp?.jugadores?.id || '') === jugadorId);
      if (!jugador || Number(jugador.equipo) !== equipoGanador) return null;

      const metadata = metadataEvento(evento);
      const minuto = numeroFinito(evento.minuto_partido ?? metadata.minuto);
      const marcador = marcadorDesdeMetadata(metadata)
        || marcadorDesdeTimeline(eventosGoles, minuto === null ? null : Math.max(0, minuto * 60));
      if (!marcador || marcador[equipoGanador] >= marcador[rival]) return null;

      return {
        jugadorId,
        jugadorNombre: jugador?.jugadores?.nombre || jugador?.jugador?.nombre || metadata.atajadas_jugador_nombre || 'El arquero',
        equipo: equipoGanador,
        cantidad: Number(evento.cantidad),
        minuto,
        marcador,
        marcadorTexto: `${marcador[1]}-${marcador[2]}`,
        deficit: marcador[rival] - marcador[equipoGanador]
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.cantidad !== b.cantidad) return b.cantidad - a.cantidad;
      if (a.deficit !== b.deficit) return b.deficit - a.deficit;
      return (a.minuto ?? Number.POSITIVE_INFINITY) - (b.minuto ?? Number.POSITIVE_INFINITY);
    });

  return candidatas[0] || null;
}

export { DISTANCE_EPSILON_KM };
