function obtenerIdJugadorPortada(jugador) {
  return jugador?.id ?? jugador?.jugador_id ?? jugador?.jugadorId ?? jugador?.jugadores?.id ?? null;
}

function tienePremioPortada(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true';
}

export function resolverPremiosPortada({ equipo1 = [], equipo2 = [], mvpId = null, aceId = null } = {}) {
  const jugadores = [
    ...(Array.isArray(equipo1) ? equipo1 : []).map(jugador => ({ jugador, equipo: 1 })),
    ...(Array.isArray(equipo2) ? equipo2 : []).map(jugador => ({ jugador, equipo: 2 }))
  ];

  const resolver = (tipo, idDirecto) => {
    const idBuscado = idDirecto !== null && idDirecto !== undefined && String(idDirecto).trim()
      ? String(idDirecto)
      : '';
    const encontrado = (idBuscado
      ? jugadores.find(item => String(obtenerIdJugadorPortada(item.jugador)) === idBuscado)
      : null) || jugadores.find(item => tienePremioPortada(item.jugador?.[tipo]));

    return encontrado
      ? { ...encontrado, tipo: tipo.toUpperCase() }
      : null;
  };

  return {
    mvp: resolver('mvp', mvpId),
    ace: resolver('ace', aceId)
  };
}
