// ===============================
// FUNCIONALIDAD DE PATERNIDADES
// ===============================

// Variables globales para paternidades
let jugadoresDisponibles = [];
let jugadorSeleccionado = null;
let partidosData = [];

// Función para cargar todos los jugadores disponibles
async function cargarJugadoresPaternidades() {
  try {
    const { data: jugadores, error } = await supabase
      .from('jugadores')
      .select('*')
      .order('nombre');

    if (error) {
      console.error('Error al cargar jugadores:', error);
      return;
    }

    jugadoresDisponibles = jugadores || [];
    console.log('✅ Jugadores cargados para paternidades:', jugadoresDisponibles.length);
  } catch (error) {
    console.error('Error al cargar jugadores:', error);
  }
}

// Función para cargar todos los partidos con jugadores (con filtro de temporada)
async function cargarPartidosPaternidades() {
  try {
    // Obtener temporada seleccionada del selector principal
    const temporadaSeleccionada = document.getElementById('selector-temporada')?.value || 
                                 document.getElementById('selector-temporada-mobile')?.value || '';

    console.log('🏆 Cargando partidos para paternidades con temporada:', temporadaSeleccionada || 'Todas');

    let query = supabase
      .from('partidos')
      .select(`
        *,
        jugador_partido (
          jugador_id,
          equipo,
          mvp,
          ace,
          atajadas,
          cagadas,
          jugadores (
            id,
            nombre
          )
        ),
                     goles (
               goleador_id,
               asistidor_id,
               es_gol_en_contra
             )
      `)
      .order('fecha', { ascending: false });

    // Filtrar por temporada si está seleccionada
    if (temporadaSeleccionada && temporadaSeleccionada !== '') {
      query = query.eq('temporada_id', temporadaSeleccionada);
      console.log('🎯 Aplicando filtro de temporada:', temporadaSeleccionada);
    }

    const { data: partidos, error } = await query;

    if (error) {
      console.error('Error al cargar partidos:', error);
      return;
    }

    partidosData = partidos || [];
    console.log('✅ Partidos cargados para paternidades:', partidosData.length, temporadaSeleccionada ? `(Temporada: ${temporadaSeleccionada})` : '(Todas las temporadas)');
  } catch (error) {
    console.error('Error al cargar partidos:', error);
  }
}

// Función para buscar jugadores mientras se escribe
window.buscarJugadorPaternidades = function() {
  const input = document.getElementById('buscar-jugador-paternidades');
  const sugerenciasContainer = document.getElementById('sugerencias-jugadores');
  const busqueda = input.value.toLowerCase().trim();

  if (busqueda.length < 2) {
    sugerenciasContainer.innerHTML = '';
    return;
  }

  const jugadoresFiltrados = jugadoresDisponibles.filter(jugador =>
    jugador.nombre.toLowerCase().includes(busqueda)
  ).slice(0, 5);

  if (jugadoresFiltrados.length === 0) {
    sugerenciasContainer.innerHTML = '<div class="text-muted small">No se encontraron jugadores</div>';
    return;
  }

  const sugerenciasHtml = jugadoresFiltrados.map(jugador => `
    <div class="suggestion-item p-2 rounded mb-1" style="background: rgba(255, 255, 255, 0.1); cursor: pointer;" onclick="seleccionarJugador('${jugador.id}', '${jugador.nombre}')">
      <i class="bi bi-person me-2"></i>${jugador.nombre}
    </div>
  `).join('');

  sugerenciasContainer.innerHTML = sugerenciasHtml;
};

// Función para seleccionar un jugador de las sugerencias
window.seleccionarJugador = function(jugadorId, nombre) {
  document.getElementById('buscar-jugador-paternidades').value = nombre;
  document.getElementById('sugerencias-jugadores').innerHTML = '';
  jugadorSeleccionado = { id: jugadorId, nombre: nombre };
};

// Función principal para analizar un jugador
window.analizarJugador = async function() {
  if (!jugadorSeleccionado) {
    const nombreInput = document.getElementById('buscar-jugador-paternidades').value.trim();
    const jugadorEncontrado = jugadoresDisponibles.find(j => 
      j.nombre.toLowerCase() === nombreInput.toLowerCase()
    );
    
    if (!jugadorEncontrado) {
      alert('Por favor selecciona un jugador válido de la lista');
      return;
    }
    
    jugadorSeleccionado = { id: jugadorEncontrado.id, nombre: jugadorEncontrado.nombre };
  }

  // Mostrar loading
  document.getElementById('jugador-seleccionado-nombre').innerHTML = `
    <i class="bi bi-hourglass-split me-2"></i>Analizando a ${jugadorSeleccionado.nombre}...
  `;
  document.getElementById('estadisticas-jugador-container').style.display = 'block';

  // Analizar estadísticas
  await analizarEstadisticasJugador(jugadorSeleccionado);
};

// Función para analizar las estadísticas de un jugador
async function analizarEstadisticasJugador(jugador) {
  try {
    // Actualizar título
    document.getElementById('jugador-seleccionado-nombre').innerHTML = `
      <i class="bi bi-person-circle me-2"></i>Estadísticas de ${jugador.nombre}
    `;

    // Analizar partidos del jugador
    const partidosJugador = partidosData.filter(partido =>
      partido.jugador_partido?.some(jp => jp.jugador_id === jugador.id)
    );

    if (partidosJugador.length === 0) {
      document.getElementById('mejores-duos').innerHTML = '<div class="text-muted">No hay partidos registrados</div>';
      document.getElementById('rivales-principales').innerHTML = '<div class="text-muted">No hay partidos registrados</div>';
      document.getElementById('enfrentamientos-frecuentes').innerHTML = '<div class="text-muted">No hay partidos registrados</div>';
      document.getElementById('nunca-enfrentados').innerHTML = '<div class="text-muted">No hay partidos registrados</div>';
      document.getElementById('estadisticas-generales').innerHTML = '<div class="text-muted">No hay partidos registrados</div>';
      return;
    }

    // Analizar dúos más exitosos
    const mejoresDuos = analizarMejoresDuos(jugador, partidosJugador);
    renderizarMejoresDuos(mejoresDuos);

    // Analizar rivales principales
    const rivales = analizarRivalesPrincipales(jugador, partidosJugador);
    renderizarRivalesPrincipales(rivales);

    // Analizar enfrentamientos frecuentes
    const enfrentamientos = analizarEnfrentamientosFrecuentes(jugador, partidosJugador);
    renderizarEnfrentamientosFrecuentes(enfrentamientos);

    // Analizar a quien más le gana
    const aQuienMasLeGana = analizarAQuienMasLeGana(jugador, partidosJugador);
    renderizarAQuienMasLeGana(aQuienMasLeGana);

    // Estadísticas generales
    const estadisticasGenerales = calcularEstadisticasGenerales(jugador, partidosJugador);
    renderizarEstadisticasGenerales(estadisticasGenerales);

  } catch (error) {
    console.error('Error al analizar jugador:', error);
    alert('Error al analizar las estadísticas del jugador');
  }
}

// Función para analizar los mejores dúos
function analizarMejoresDuos(jugador, partidos) {
  const duos = {};

  partidos.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugador.id);
    if (!jugadorData) return;

    const equipoJugador = jugadorData.equipo;
    const compañeros = partido.jugador_partido?.filter(jp => 
      jp.equipo === equipoJugador && jp.jugador_id !== jugador.id
    ) || [];

    const gano = partido.equipo_ganador === equipoJugador;

    compañeros.forEach(compañero => {
      const nombre = compañero.jugadores?.nombre;
      if (!nombre) return;

      if (!duos[nombre]) {
        duos[nombre] = { 
          nombre, 
          partidos: 0, 
          victorias: 0, 
          derrotas: 0, 
          empates: 0 
        };
      }

      duos[nombre].partidos++;
      if (gano) duos[nombre].victorias++;
      else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) duos[nombre].empates++;
      else duos[nombre].derrotas++;
    });
  });

  // Calcular winrate y ordenar
  const duosArray = Object.values(duos)
    .filter(duo => duo.partidos >= 2) // Mínimo 2 partidos
    .map(duo => ({
      ...duo,
      // Calcular winrate basado en puntos (empates valen 1 punto)
      winrate: Math.round(((duo.victorias * 3 + duo.empates * 1) / (duo.partidos * 3)) * 100)
    }))
    .filter(duo => duo.winrate > 0) // No mostrar si tiene 0% winrate
    .sort((a, b) => {
      // Ordenar por winrate, luego por partidos
      if (Math.abs(a.winrate - b.winrate) < 0.1) {
        return b.partidos - a.partidos;
      }
      return b.winrate - a.winrate;
    })
    .slice(0, 5);

  return duosArray;
}

// Función para analizar rivales principales
function analizarRivalesPrincipales(jugador, partidos) {
  const rivales = {};

  partidos.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugador.id);
    if (!jugadorData) return;

    const equipoJugador = jugadorData.equipo;
    const oponentes = partido.jugador_partido?.filter(jp => 
      jp.equipo !== equipoJugador
    ) || [];

    const perdio = partido.equipo_ganador !== null && partido.equipo_ganador !== 0 && partido.equipo_ganador !== equipoJugador;

    oponentes.forEach(oponente => {
      const nombre = oponente.jugadores?.nombre;
      if (!nombre) return;

      if (!rivales[nombre]) {
        rivales[nombre] = { 
          nombre, 
          partidos: 0, 
          derrotas: 0, 
          victorias: 0, 
          empates: 0 
        };
      }

      rivales[nombre].partidos++;
      if (perdio) rivales[nombre].derrotas++;
      else if (partido.equipo_ganador === equipoJugador) rivales[nombre].victorias++;
      else rivales[nombre].empates++;
    });
  });

  // Calcular % de derrotas y ordenar
  const rivalesArray = Object.values(rivales)
    .filter(rival => rival.partidos >= 2) // Mínimo 2 partidos
    .map(rival => ({
      ...rival,
      porcentajeDerrota: (rival.derrotas / rival.partidos * 100)
    }))
    .sort((a, b) => {
      if (Math.abs(a.porcentajeDerrota - b.porcentajeDerrota) < 0.1) {
        return b.partidos - a.partidos;
      }
      return b.porcentajeDerrota - a.porcentajeDerrota;
    })
    .slice(0, 5);

  return rivalesArray;
}

// Función para analizar enfrentamientos frecuentes
function analizarEnfrentamientosFrecuentes(jugador, partidos) {
  const enfrentamientos = {};

  partidos.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugador.id);
    if (!jugadorData) return;

    const equipoJugador = jugadorData.equipo;
    const todosOponentes = partido.jugador_partido?.filter(jp => 
      jp.equipo !== equipoJugador
    ) || [];

    const gano = partido.equipo_ganador === equipoJugador;
    const empato = partido.equipo_ganador === null || partido.equipo_ganador === 0;

    todosOponentes.forEach(oponente => {
      const nombre = oponente.jugadores?.nombre;
      if (!nombre) return;

      if (!enfrentamientos[nombre]) {
        enfrentamientos[nombre] = { 
          nombre, 
          partidos: 0, 
          victorias: 0, 
          derrotas: 0, 
          empates: 0 
        };
      }
      
      enfrentamientos[nombre].partidos++;
      if (gano) enfrentamientos[nombre].victorias++;
      else if (empato) enfrentamientos[nombre].empates++;
      else enfrentamientos[nombre].derrotas++;
    });
  });

  // Calcular winrate y filtrar por enfrentamientos mínimos
  return Object.values(enfrentamientos)
    .filter(enfrentamiento => enfrentamiento.partidos >= 3) // Mínimo 3 enfrentamientos
    .map(enfrentamiento => ({
      ...enfrentamiento,
      // Calcular winrate basado en puntos (empates valen 1 punto)
      winrate: Math.round(((enfrentamiento.victorias * 3 + enfrentamiento.empates * 1) / (enfrentamiento.partidos * 3)) * 100)
    }))
    .sort((a, b) => b.partidos - a.partidos)
    .slice(0, 8);
}

// Función para analizar a quien más le gana (enfrentamientos directos)
function analizarAQuienMasLeGana(jugador, partidos) {
  const oponentes = {};

  partidos.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugador.id);
    if (!jugadorData) return;

    const equipoJugador = jugadorData.equipo;
    
    // Solo contar oponentes que estuvieron en el equipo contrario
    const oponentesDirectos = partido.jugador_partido?.filter(jp => 
      jp.equipo !== equipoJugador && jp.jugadores?.nombre
    ) || [];

    const gano = partido.equipo_ganador === equipoJugador;
    const empato = partido.equipo_ganador === null || partido.equipo_ganador === 0;

    oponentesDirectos.forEach(oponente => {
      const nombre = oponente.jugadores.nombre;

      if (!oponentes[nombre]) {
        oponentes[nombre] = { 
          nombre, 
          partidos: 0, 
          victorias: 0, 
          derrotas: 0, 
          empates: 0 
        };
      }

      oponentes[nombre].partidos++;
      if (gano) oponentes[nombre].victorias++;
      else if (empato) oponentes[nombre].empates++;
      else oponentes[nombre].derrotas++;
    });
  });

  // Calcular winrate y filtrar/ordenar
  const oponentesArray = Object.values(oponentes)
    .filter(oponente => oponente.partidos >= 2) // Mínimo 2 enfrentamientos directos
    .map(oponente => ({
      ...oponente,
                  // Calcular winrate basado en puntos (empates valen 1 punto)
            winrate: Math.round(((oponente.victorias * 3 + oponente.empates * 1) / (oponente.partidos * 3)) * 100)
    }))
    .filter(oponente => oponente.winrate > 50) // Solo mostrar a quienes les gana (>50%)
    .sort((a, b) => {
      // Ordenar por winrate primero, luego por victorias totales
      if (Math.abs(a.winrate - b.winrate) < 0.1) {
        return b.victorias - a.victorias;
      }
      return b.winrate - a.winrate;
    })
    .slice(0, 5);

  return oponentesArray;
}

// Función para calcular estadísticas de un jugador desde los partidos
function calcularEstadisticasJugador(jugadorId) {
  const stats = {
    pj: 0,
    pg: 0,
    pe: 0,
    pp: 0,
    goles: 0,
    goles_en_contra: 0,
    asistencias: 0,
    mvp_count: 0,
    ace_count: 0,
    atajadas: 0,
    cagadas_en_gol: 0,
    winrate: 0
  };

  partidosData.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
    if (!jugadorData) return;

    stats.pj++;
    
    // Calcular resultado del partido
    if (partido.equipo_ganador === jugadorData.equipo) {
      stats.pg++;
    } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
      stats.pe++;
    } else {
      stats.pp++;
    }

    // Estadísticas individuales
    stats.atajadas += jugadorData.atajadas || 0;
    stats.cagadas_en_gol += jugadorData.cagadas || 0;
    stats.mvp_count += jugadorData.mvp ? 1 : 0;
    stats.ace_count += jugadorData.ace ? 1 : 0;
  });

  // Contar goles y asistencias desde tabla goles (INCLUIR goles en contra por separado)
  partidosData.forEach(partido => {
    partido.goles?.forEach(gol => {
      if (gol.es_gol_en_contra) {
        // Contar goles en contra
        if (gol.goleador_id === jugadorId) stats.goles_en_contra++;
      } else {
        // Contar goles normales y asistencias
        if (gol.goleador_id === jugadorId) stats.goles++;
        if (gol.asistidor_id === jugadorId) stats.asistencias++;
      }
    });
  });

  // Calcular winrate basado en puntos (empates valen 1 punto)
  if (stats.pj > 0) {
    const puntosObtenidos = (stats.pg * 3) + (stats.pe * 1); // Victoria=3pts, Empate=1pt, Derrota=0pts
    const puntosTotales = stats.pj * 3; // Puntos máximos posibles
    stats.winrate = Math.round((puntosObtenidos / puntosTotales) * 100);
  }

  return stats;
}

// Función para calcular estadísticas generales
function calcularEstadisticasGenerales(jugador, partidos) {
  const stats = {
    partidosJugados: partidos.length,
    victorias: 0,
    derrotas: 0,
    empates: 0,
    mvpCount: 0,
    aceCount: 0
  };

  partidos.forEach(partido => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugador.id);
    if (!jugadorData) return;

    if (partido.equipo_ganador === jugadorData.equipo) {
      stats.victorias++;
    } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
      stats.empates++;
    } else {
      stats.derrotas++;
    }

    if (jugadorData.mvp) stats.mvpCount++;
    if (jugadorData.ace) stats.aceCount++;
  });

      // Calcular winrate basado en puntos (empates valen 1 punto)
    if (stats.partidosJugados > 0) {
      const puntosObtenidos = (stats.victorias * 3) + (stats.empates * 1);
      const puntosTotales = stats.partidosJugados * 3;
      stats.winrate = Math.round((puntosObtenidos / puntosTotales) * 100);
    } else {
      stats.winrate = 0;
    }

  return stats;
}

// Funciones de renderizado
function renderizarMejoresDuos(duos) {
  const container = document.getElementById('mejores-duos');
  
  if (duos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-people text-muted" style="font-size: 3rem; display: block; margin-bottom: 1rem;"></i>
        <p class="text-muted mb-0">No hay dúos exitosos disponibles</p>
        <small class="text-light-emphasis">Mínimo 2 partidos con >0% winrate</small>
      </div>
    `;
    return;
  }

  const html = duos.map((duo, index) => {
    const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
    const winrateColor = duo.winrate >= 70 ? 'success' : duo.winrate >= 50 ? 'warning' : 'info';
    
    return `
      <div class="mb-3 p-3 rounded-3" style="background: rgba(255, 255, 255, 0.05); border-left: 4px solid var(--bs-${winrateColor});">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center mb-2">
              <span class="me-2" style="font-size: 1.1rem;">${rankIcon}</span>
              <h6 class="text-white mb-0 fw-bold">${duo.nombre}</h6>
            </div>
            <p class="text-light-emphasis small mb-0">${duo.partidos} partidos como compañeros</p>
          </div>
          <div class="text-end">
            <div class="fs-4 fw-bold text-${winrateColor} mb-1">${duo.winrate.toFixed(1)}%</div>
            <div class="small text-light-emphasis">${duo.victorias}V-${duo.derrotas}D-${duo.empates}E</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function renderizarRivalesPrincipales(rivales) {
  const container = document.getElementById('rivales-principales');
  
  if (rivales.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-shield-x text-muted" style="font-size: 3rem; display: block; margin-bottom: 1rem;"></i>
        <p class="text-muted mb-0">No hay rivales destacados</p>
        <small class="text-light-emphasis">Mínimo 2 enfrentamientos</small>
      </div>
    `;
    return;
  }

  const html = rivales.map((rival, index) => {
    const mostrarPorcentaje = rival.porcentajeDerrota > 0;
    const rankIcon = index === 0 ? '👑' : index === 1 ? '⭐' : index === 2 ? '🔥' : '💀';
    const intensityColor = rival.porcentajeDerrota >= 70 ? 'danger' : 
                          rival.porcentajeDerrota >= 50 ? 'warning' : 
                          rival.porcentajeDerrota > 0 ? 'info' : 'success';
    
    return `
      <div class="mb-3 p-3 rounded-3" style="background: rgba(255, 255, 255, 0.05); border-left: 4px solid var(--bs-${intensityColor});">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center mb-2">
              <span class="me-2" style="font-size: 1.1rem;">${rankIcon}</span>
              <h6 class="text-white mb-0 fw-bold">${rival.nombre}</h6>
            </div>
            <p class="text-light-emphasis small mb-0">${rival.partidos} enfrentamientos directos</p>
          </div>
          <div class="text-end">
            ${mostrarPorcentaje ? 
              `<div class="fs-4 fw-bold text-${intensityColor} mb-1">${rival.porcentajeDerrota.toFixed(1)}%</div>` : 
              `<div class="fs-4 fw-bold text-success mb-1">0%</div>`
            }
            <div class="small text-light-emphasis">${rival.victorias}V-${rival.derrotas}D-${rival.empates}E</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function renderizarEnfrentamientosFrecuentes(enfrentamientos) {
  const container = document.getElementById('enfrentamientos-frecuentes');
  
  if (enfrentamientos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-lightning text-muted" style="font-size: 3rem; display: block; margin-bottom: 1rem;"></i>
        <p class="text-muted mb-0">No hay enfrentamientos frecuentes</p>
        <small class="text-light-emphasis">Mínimo 3 partidos contra el mismo oponente</small>
      </div>
    `;
    return;
  }

  const html = enfrentamientos.map((enfrentamiento, index) => {
    const winrateColor = enfrentamiento.winrate >= 60 ? 'success' : 
                        enfrentamiento.winrate >= 40 ? 'warning' : 'danger';
    const frequencyIcon = enfrentamiento.partidos >= 8 ? '🔥' : 
                         enfrentamiento.partidos >= 6 ? '⚡' : 
                         enfrentamiento.partidos >= 4 ? '💥' : '⚔️';
    
    return `
      <div class="mb-3 p-3 rounded-3" style="background: rgba(255, 255, 255, 0.05); border-left: 4px solid var(--bs-${winrateColor});">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div class="d-flex align-items-center mb-2">
              <span class="me-2" style="font-size: 1.1rem;">${frequencyIcon}</span>
              <h6 class="text-white mb-0 fw-bold">${enfrentamiento.nombre}</h6>
            </div>
            <p class="text-light-emphasis small mb-0">${enfrentamiento.partidos} enfrentamientos directos</p>
          </div>
          <div class="text-end">
            <div class="fs-4 fw-bold text-${winrateColor} mb-1">${enfrentamiento.winrate.toFixed(1)}%</div>
            <div class="small text-light-emphasis">${enfrentamiento.victorias}V-${enfrentamiento.derrotas}D-${enfrentamiento.empates}E</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

function renderizarAQuienMasLeGana(aQuienMasLeGana) {
  const container = document.getElementById('nunca-enfrentados'); // Reutilizamos el mismo container
  
  if (aQuienMasLeGana.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4">
        <i class="bi bi-trophy text-muted" style="font-size: 3rem; display: block; margin-bottom: 1rem;"></i>
        <p class="text-muted mb-0">No hay dominancia destacada</p>
        <small class="text-light-emphasis">Mínimo 2 enfrentamientos con >50% winrate en temporada actual</small>
      </div>
    `;
    return;
  }

  const html = `
    <div class="list-group list-group-flush">
      ${aQuienMasLeGana.map((oponente, index) => {
        const dominanceLevel = oponente.winrate >= 80 ? 'danger' : 
                              oponente.winrate >= 70 ? 'warning' : 'success';
        const position = index + 1;
        
        return `
          <div class="list-group-item bg-transparent border-0 px-0 py-2">
            <div class="d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center">
                <span class="badge bg-secondary rounded-pill me-3 fs-6">${position}</span>
                <div>
                  <h6 class="mb-0 text-white fw-bold">${oponente.nombre}</h6>
                  <small class="text-light-emphasis">${oponente.partidos} enfrentamientos</small>
                </div>
              </div>
              <div class="text-end">
                <span class="badge bg-${dominanceLevel} fs-6">${oponente.winrate.toFixed(1)}%</span>
                <div class="small text-light-emphasis mt-1">${oponente.victorias}V-${oponente.derrotas}D-${oponente.empates}E</div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function renderizarEstadisticasGenerales(stats) {
  const container = document.getElementById('estadisticas-generales');
  
  const html = `
    <div class="col-md-3">
      <div class="text-center p-2 rounded" style="background: rgba(59, 130, 246, 0.1);">
        <div class="fw-bold text-primary">${stats.partidosJugados}</div>
        <div class="small text-light-emphasis">Partidos</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="text-center p-2 rounded" style="background: rgba(34, 197, 94, 0.1);">
        <div class="fw-bold text-success">${stats.winrate.toFixed(1)}%</div>
        <div class="small text-light-emphasis">Winrate</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="text-center p-2 rounded" style="background: rgba(245, 158, 11, 0.1);">
        <div class="fw-bold text-warning">${stats.mvpCount}</div>
        <div class="small text-light-emphasis">MVP</div>
      </div>
    </div>
    <div class="col-md-3">
      <div class="text-center p-2 rounded" style="background: rgba(139, 92, 246, 0.1);">
        <div class="fw-bold" style="color: #8b5cf6;">${stats.aceCount}</div>
        <div class="small text-light-emphasis">ACE</div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// Funciones para el comparador versus
window.buscarJugadorVersus = function(numero) {
  const input = document.getElementById(`versus-jugador${numero}`);
  const sugerenciasContainer = document.getElementById(`sugerencias-versus${numero}`);
  const busqueda = input.value.toLowerCase().trim();

  if (busqueda.length < 2) {
    sugerenciasContainer.innerHTML = '';
    return;
  }

  const jugadoresFiltrados = jugadoresDisponibles.filter(jugador =>
    jugador.nombre.toLowerCase().includes(busqueda)
  ).slice(0, 5);

  if (jugadoresFiltrados.length === 0) {
    sugerenciasContainer.innerHTML = '<div class="text-muted small">No se encontraron jugadores</div>';
    return;
  }

  const sugerenciasHtml = jugadoresFiltrados.map(jugador => `
    <div class="suggestion-item p-2 rounded mb-1" style="background: rgba(255, 255, 255, 0.1); cursor: pointer;" onclick="seleccionarJugadorVersus(${numero}, '${jugador.id}', '${jugador.nombre}')">
      <i class="bi bi-person me-2"></i>${jugador.nombre}
    </div>
  `).join('');

  sugerenciasContainer.innerHTML = sugerenciasHtml;
};

window.seleccionarJugadorVersus = function(numero, jugadorId, nombre) {
  document.getElementById(`versus-jugador${numero}`).value = nombre;
  document.getElementById(`sugerencias-versus${numero}`).innerHTML = '';
};

// Función para comparar dos jugadores
window.compararJugadores = async function() {
  const nombre1 = document.getElementById('versus-jugador1').value.trim();
  const nombre2 = document.getElementById('versus-jugador2').value.trim();

  if (!nombre1 || !nombre2) {
    alert('Por favor ingresa los nombres de ambos jugadores');
    return;
  }

  const jugador1 = jugadoresDisponibles.find(j => j.nombre.toLowerCase() === nombre1.toLowerCase());
  const jugador2 = jugadoresDisponibles.find(j => j.nombre.toLowerCase() === nombre2.toLowerCase());

  if (!jugador1 || !jugador2) {
    alert('Uno o ambos jugadores no fueron encontrados');
    return;
  }

  if (jugador1.id === jugador2.id) {
    alert('No puedes comparar un jugador consigo mismo');
    return;
  }

  // Analizar enfrentamientos directos
  const enfrentamientosDirectos = analizarEnfrentamientosDirectos(jugador1, jugador2);
  
  // Mostrar resultados
  document.getElementById('resultados-versus').style.display = 'block';
  renderizarHistorialDirecto(enfrentamientosDirectos, jugador1.nombre, jugador2.nombre);
  renderizarDominioPaternidad(enfrentamientosDirectos, jugador1.nombre, jugador2.nombre);
  await renderizarEstadisticasComparadas(jugador1, jugador2);
};

function analizarEnfrentamientosDirectos(jugador1, jugador2) {
  const enfrentamientos = {
    partidos: [],
    jugador1: { victorias: 0, derrotas: 0, empates: 0 },
    jugador2: { victorias: 0, derrotas: 0, empates: 0 }
  };

  partidosData.forEach(partido => {
    const jp1 = partido.jugador_partido?.find(jp => jp.jugador_id === jugador1.id);
    const jp2 = partido.jugador_partido?.find(jp => jp.jugador_id === jugador2.id);

    // Solo contar si ambos jugadores participaron Y estuvieron en equipos CONTRARIOS
    if (jp1 && jp2 && jp1.equipo !== jp2.equipo) {
      enfrentamientos.partidos.push({
        fecha: partido.fecha,
        equipo1: jp1.equipo,
        equipo2: jp2.equipo,
        ganador: partido.equipo_ganador,
        mvp1: jp1.mvp,
        mvp2: jp2.mvp,
        ace1: jp1.ace,
        ace2: jp2.ace
      });

      // Calcular resultado para cada jugador
      if (partido.equipo_ganador === jp1.equipo) {
        enfrentamientos.jugador1.victorias++;
        enfrentamientos.jugador2.derrotas++;
      } else if (partido.equipo_ganador === jp2.equipo) {
        enfrentamientos.jugador2.victorias++;
        enfrentamientos.jugador1.derrotas++;
      } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
        enfrentamientos.jugador1.empates++;
        enfrentamientos.jugador2.empates++;
      }
    }
  });

  return enfrentamientos;
}

function renderizarHistorialDirecto(enfrentamientos, nombre1, nombre2) {
  const container = document.getElementById('historial-directo');
  
  if (enfrentamientos.partidos.length === 0) {
    container.innerHTML = '<div class="text-muted">Estos jugadores nunca se han enfrentado directamente</div>';
    return;
  }

  const totalPartidos = enfrentamientos.partidos.length;
  // Calcular winrate basado en puntos (empates valen 1 punto)
  const puntosObtenidos1 = (enfrentamientos.jugador1.victorias * 3) + (enfrentamientos.jugador1.empates * 1);
  const puntosObtenidos2 = (enfrentamientos.jugador2.victorias * 3) + (enfrentamientos.jugador2.empates * 1);
  const puntosTotales = totalPartidos * 3;
  const winrate1 = Math.round((puntosObtenidos1 / puntosTotales) * 100);
  const winrate2 = Math.round((puntosObtenidos2 / puntosTotales) * 100);

  const html = `
    <div class="mb-3">
      <div class="row g-2 text-center">
        <div class="col-5">
          <div class="p-2 rounded" style="background: rgba(59, 130, 246, 0.1);">
            <div class="fw-bold text-primary">${nombre1}</div>
            <div class="text-light small">${enfrentamientos.jugador1.victorias}V-${enfrentamientos.jugador1.derrotas}D-${enfrentamientos.jugador1.empates}E</div>
            <div class="text-white">${winrate1.toFixed(1)}%</div>
          </div>
        </div>
        <div class="col-2 d-flex align-items-center justify-content-center">
          <div class="text-muted">${totalPartidos}<br><small>partidos</small></div>
        </div>
        <div class="col-5">
          <div class="p-2 rounded" style="background: rgba(239, 68, 68, 0.1);">
            <div class="fw-bold text-danger">${nombre2}</div>
            <div class="text-light small">${enfrentamientos.jugador2.victorias}V-${enfrentamientos.jugador2.derrotas}D-${enfrentamientos.jugador2.empates}E</div>
            <div class="text-white">${winrate2.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="small">
      <div class="fw-bold mb-2">Últimos 5 enfrentamientos:</div>
      ${enfrentamientos.partidos.slice(0, 5).map(partido => {
        const fecha = new Date(partido.fecha).toLocaleDateString();
        let resultado = '';
        if (partido.ganador === partido.equipo1) {
          resultado = `<span class="text-success">${nombre1} ganó</span>`;
        } else if (partido.ganador === partido.equipo2) {
          resultado = `<span class="text-danger">${nombre2} ganó</span>`;
        } else {
          resultado = '<span class="text-warning">Empate</span>';
        }
        
        const mvpAce = [];
        if (partido.mvp1) mvpAce.push(`${nombre1} MVP`);
        if (partido.mvp2) mvpAce.push(`${nombre2} MVP`);
        if (partido.ace1) mvpAce.push(`${nombre1} ACE`);
        if (partido.ace2) mvpAce.push(`${nombre2} ACE`);
        
        return `
          <div class="d-flex justify-content-between align-items-center mb-1 p-1 rounded" style="background: rgba(255, 255, 255, 0.05);">
            <span>${fecha}</span>
            <span>${resultado}</span>
            ${mvpAce.length > 0 ? `<span class="text-info small">${mvpAce.join(', ')}</span>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
  
  container.innerHTML = html;
}

function renderizarDominioPaternidad(enfrentamientos, nombre1, nombre2) {
  const container = document.getElementById('dominio-paternidad');
  
  if (enfrentamientos.partidos.length === 0) {
    container.innerHTML = '<div class="text-muted">No hay suficientes datos para determinar dominio</div>';
    return;
  }

  const victorias1 = enfrentamientos.jugador1.victorias;
  const victorias2 = enfrentamientos.jugador2.victorias;
  
  let dominancia = '';
  let emoji = '';
  
  if (victorias1 > victorias2) {
    const diferencia = victorias1 - victorias2;
    if (diferencia >= 3) {
      dominancia = `${nombre1} tiene <strong>dominio total</strong> sobre ${nombre2}`;
      emoji = '👑';
    } else if (diferencia >= 2) {
      dominancia = `${nombre1} tiene <strong>ventaja clara</strong> sobre ${nombre2}`;
      emoji = '⭐';
    } else {
      dominancia = `${nombre1} tiene <strong>ligera ventaja</strong> sobre ${nombre2}`;
      emoji = '📈';
    }
  } else if (victorias2 > victorias1) {
    const diferencia = victorias2 - victorias1;
    if (diferencia >= 3) {
      dominancia = `${nombre2} tiene <strong>dominio total</strong> sobre ${nombre1}`;
      emoji = '👑';
    } else if (diferencia >= 2) {
      dominancia = `${nombre2} tiene <strong>ventaja clara</strong> sobre ${nombre1}`;
      emoji = '⭐';
    } else {
      dominancia = `${nombre2} tiene <strong>ligera ventaja</strong> sobre ${nombre1}`;
      emoji = '📈';
    }
  } else {
    dominancia = `Hay <strong>equilibrio total</strong> entre ambos jugadores`;
    emoji = '⚖️';
  }

  const html = `
    <div class="text-center p-3 rounded" style="background: rgba(34, 197, 94, 0.1);">
      <div style="font-size: 2rem;">${emoji}</div>
      <div class="mt-2">${dominancia}</div>
      ${enfrentamientos.partidos.length >= 5 ? 
        '<div class="text-success small mt-1">✅ Muestra estadísticamente significativa</div>' : 
        '<div class="text-warning small mt-1">⚠️ Pocos enfrentamientos para conclusiones definitivas</div>'
      }
    </div>
  `;
  
  container.innerHTML = html;
}

async function renderizarEstadisticasComparadas(jugador1, jugador2) {
  const container = document.getElementById('estadisticas-comparadas');
  
  try {
    // Calcular estadísticas directamente desde partidosData
    const stats1 = calcularEstadisticasJugador(jugador1.id);
    const stats2 = calcularEstadisticasJugador(jugador2.id);

    const comparaciones = [
      { label: 'Partidos Jugados', key: 'pj', formato: 'numero' },
      { label: 'Winrate', key: 'winrate', formato: 'porcentaje' },
      { label: 'Goles', key: 'goles', formato: 'numero' },
      { label: 'Asistencias', key: 'asistencias', formato: 'numero' },
      { label: 'MVP', key: 'mvp_count', formato: 'numero' },
      { label: 'ACE', key: 'ace_count', formato: 'numero' },
      { label: 'Atajadas', key: 'atajadas', formato: 'numero' },
      { label: 'Cagadas', key: 'cagadas_en_gol', formato: 'numero' }
    ];

    const html = comparaciones.map(comp => {
      const valor1 = stats1[comp.key] || 0;
      const valor2 = stats2[comp.key] || 0;
      
      let display1 = valor1;
      let display2 = valor2;
      
      if (comp.formato === 'porcentaje') {
        display1 = `${valor1.toFixed(1)}%`;
        display2 = `${valor2.toFixed(1)}%`;
      }
      
      let comparison = '';
      if (valor1 > valor2) {
        comparison = `<span class="text-success">▲ ${jugador1.nombre}</span>`;
      } else if (valor2 > valor1) {
        comparison = `<span class="text-danger">▲ ${jugador2.nombre}</span>`;
      } else {
        comparison = '<span class="text-warning">⚖️ Empate</span>';
      }

      return `
        <div class="col-md-4 mb-3">
          <div class="p-2 rounded" style="background: rgba(255, 255, 255, 0.05);">
            <div class="text-center">
              <div class="fw-bold text-white mb-1">${comp.label}</div>
              <div class="row g-1 small">
                <div class="col-5 text-primary">${display1}</div>
                <div class="col-2 text-center">${comparison}</div>
                <div class="col-5 text-danger">${display2}</div>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `<div class="row">${html}</div>`;

  } catch (error) {
    console.error('Error al renderizar estadísticas comparadas:', error);
    container.innerHTML = '<div class="text-danger">Error al cargar la comparación</div>';
  }
}

// Inicializar funcionalidad de paternidades cuando se abre la pestaña
document.addEventListener('DOMContentLoaded', function() {
  const paternidadesTab = document.getElementById('paternidades-tab');
  if (paternidadesTab) {
    paternidadesTab.addEventListener('shown.bs.tab', async function() {
      if (jugadoresDisponibles.length === 0) {
        await cargarJugadoresPaternidades();
      }
      if (partidosData.length === 0) {
        await cargarPartidosPaternidades();
      }
    });
  }
}); 