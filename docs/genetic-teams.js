/**
 * Algoritmo Genético para Auto-Armado de Equipos
 * Versión JavaScript adaptada del código Python original
 */

const ROL_PARTIDO_JUGADOR = 'jugador';
const ROL_PARTIDO_ARQUERO = 'arquero';
const MODO_RENDIMIENTO_HISTORICO = 'historico';
const MODO_RENDIMIENTO_RECIENTE = 'reciente';
const PARTIDOS_RECIENTES_DEFAULT = 5;

function normalizarRolPartido(rol) {
  return rol === ROL_PARTIDO_ARQUERO ? ROL_PARTIDO_ARQUERO : ROL_PARTIDO_JUGADOR;
}

function etiquetaRolPartido(rol) {
  return normalizarRolPartido(rol) === ROL_PARTIDO_ARQUERO ? 'Arquero' : 'Jugador';
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
      cantidadArqueros: 25
    };
  }

  /**
   * Establece la lista de jugadores con sus estadísticas
   * @param {Array} jugadores - Array de objetos jugador con estadísticas
   */
  setJugadores(jugadores) {
    const jugadoresProcesados = jugadores.map(jugador => {
      const rolPartido = normalizarRolPartido(jugador.rolPartido || jugador.rol_matchmaking);
      const rendimientoJugador = this.calcularRendimientoJugador(jugador);
      const rendimientoArqueroDisponible = this.calcularRendimientoArquero(jugador);
      const esArquero = rolPartido === ROL_PARTIDO_ARQUERO;

      return {
        nombre: jugador.nombre || jugador.jugadores?.nombre,
        rolPartido,
        origenRendimiento: jugador.origenRendimiento || MODO_RENDIMIENTO_HISTORICO,
        partidosRecientesSolicitados: jugador.partidosRecientesSolicitados || 0,
        partidosRecientesUsados: jugador.partidosRecientesUsados || 0,
        rendimientoTotal: esArquero ? rendimientoArqueroDisponible : rendimientoJugador,
        rendimientoAtaque: esArquero ? 0 : rendimientoJugador,
        rendimientoArquero: esArquero ? rendimientoArqueroDisponible : 0,
        rendimientoJugador,
        rendimientoArqueroDisponible,
        golesFavorEquipo: esArquero ? 0 : Number(jugador.goles_favor_equipo) || 0,
        golesRecibidosEquipo: esArquero ? Number(jugador.goles_recibidos_equipo) || 0 : 0,
        cantidadArqueros: esArquero ? 1 : 0,
        winrate: jugador.winrate || 0,
        pulmon: jugador.pulmon || jugador.jugadores?.pulmon || 0,
        pj: jugador.pj || 0
      };
    });

    const sumaImpacto = jugadoresProcesados.reduce((total, jugador) => (
      total + Math.abs(Number(jugador.rendimientoTotal) || 0)
    ), 0);
    const impactoFallback = jugadoresProcesados.length > 0 ? 100 / jugadoresProcesados.length : 0;

    this.jugadores = jugadoresProcesados.map(jugador => ({
      ...jugador,
      skillMatchmaking: jugador.rendimientoTotal,
      impactoMatchmaking: sumaImpacto > 0
        ? (Math.abs(Number(jugador.rendimientoTotal) || 0) / sumaImpacto) * 100
        : impactoFallback
    }));
  }

  /**
   * Calcula el rendimiento total de un jugador
   */
  calcularRendimientoTotal(jugador) {
    const rolPartido = normalizarRolPartido(jugador.rolPartido || jugador.rol_matchmaking);
    return rolPartido === ROL_PARTIDO_ARQUERO
      ? this.calcularRendimientoArquero(jugador)
      : this.calcularRendimientoJugador(jugador);
  }

  /**
   * Calcula el rendimiento de un jugador de campo
   */
  calcularRendimientoJugador(jugador) {
    const pj = jugador.pj || 1;
    const golesPP = (jugador.goles || 0) / pj;
    const mvpPP = (jugador.mvp_count || 0) / pj;
    const acePP = (jugador.ace_count || 0) / pj;
    const asistPP = (jugador.asistencias || 0) / pj;
    const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
    const puntosPP = (jugador.total_puntos || 0) / pj;
    
    return (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
  }

  calcularRendimientoAtaque(jugador) {
    return this.calcularRendimientoJugador(jugador);
  }

  /**
   * Calcula el rendimiento de arquero de un jugador
   */
  calcularRendimientoArquero(jugador) {
    const pj = jugador.pj || 1;
    const atajadasPP = (jugador.atajadas || 0) / pj;
    return atajadasPP * 0.66;
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
      cantidadArqueros: 0
    };
    const stats2 = {
      rendimientoTotal: 0,
      rendimientoAtaque: 0,
      rendimientoArquero: 0,
      golesFavorEquipo: 0,
      golesRecibidosEquipo: 0,
      cantidadArqueros: 0
    };

    for (let i = 0; i < individuo.length; i++) {
      const jugador = this.jugadores[i];
      if (individuo[i] === 0) {
        equipo1.push(jugador.nombre);
        stats1.rendimientoTotal += jugador.rendimientoTotal;
        stats1.rendimientoAtaque += jugador.rendimientoAtaque;
        stats1.rendimientoArquero += jugador.rendimientoArquero;
        stats1.golesFavorEquipo += jugador.golesFavorEquipo;
        stats1.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats1.cantidadArqueros += jugador.cantidadArqueros;
      } else {
        equipo2.push(jugador.nombre);
        stats2.rendimientoTotal += jugador.rendimientoTotal;
        stats2.rendimientoAtaque += jugador.rendimientoAtaque;
        stats2.rendimientoArquero += jugador.rendimientoArquero;
        stats2.golesFavorEquipo += jugador.golesFavorEquipo;
        stats2.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats2.cantidadArqueros += jugador.cantidadArqueros;
      }
    }

    const size1 = equipo1.length;
    const size2 = equipo2.length;
    
    if (size1 === 0 || size2 === 0) return 1000;

    const avg1 = {
      rendimientoTotal: stats1.rendimientoTotal / size1,
      rendimientoAtaque: stats1.rendimientoAtaque / size1,
      rendimientoArquero: stats1.rendimientoArquero / size1,
      golesFavorEquipo: stats1.golesFavorEquipo / size1,
      golesRecibidosEquipo: stats1.golesRecibidosEquipo / size1,
      cantidadArqueros: stats1.cantidadArqueros
    };

    const avg2 = {
      rendimientoTotal: stats2.rendimientoTotal / size2,
      rendimientoAtaque: stats2.rendimientoAtaque / size2,
      rendimientoArquero: stats2.rendimientoArquero / size2,
      golesFavorEquipo: stats2.golesFavorEquipo / size2,
      golesRecibidosEquipo: stats2.golesRecibidosEquipo / size2,
      cantidadArqueros: stats2.cantidadArqueros
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
    fitness += Math.abs((avg1.cantidadArqueros || 0) - (avg2.cantidadArqueros || 0)) * this.fitnessWeights.cantidadArqueros;
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
      pulmon: 0,
      cantidadArqueros: 0,
      impactoMatchmaking: 0
    };

    for (const jugador of equipo) {
      stats.rendimientoTotal += jugador.rendimientoTotal;
      stats.rendimientoAtaque += jugador.rendimientoAtaque;
      stats.rendimientoArquero += jugador.rendimientoArquero;
      stats.golesFavorEquipo += jugador.golesFavorEquipo;
      stats.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
      stats.winrate += jugador.winrate;
      stats.pulmon += jugador.pulmon;
      stats.cantidadArqueros += jugador.cantidadArqueros;
      stats.impactoMatchmaking += jugador.impactoMatchmaking || 0;
    }

    const size = equipo.length;
    return {
      rendimientoTotal: stats.rendimientoTotal,
      rendimientoAtaque: stats.rendimientoAtaque,
      rendimientoArquero: stats.rendimientoArquero,
      golesFavorPromedio: size > 0 ? stats.golesFavorEquipo / size : 0,
      golesRecibidosPromedio: size > 0 ? stats.golesRecibidosEquipo / size : 0,
      winratePromedio: size > 0 ? stats.winrate / size : 0,
      pulmonPromedio: size > 0 ? stats.pulmon / size : 0,
      cantidadArqueros: stats.cantidadArqueros,
      impactoMatchmaking: stats.impactoMatchmaking,
      jugadores: size
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

function obtenerPosicionesJugador(jugador) {
  return jugador?.jugadores?.jugador_posicion || jugador?.jugador_posicion || [];
}

function esPosicionArquero(posicionJugador) {
  const nombre = posicionJugador?.posicion?.nombre
    || posicionJugador?.posiciones?.nombre
    || posicionJugador?.nombre
    || posicionJugador?.posicion_nombre
    || '';

  return String(nombre).toLowerCase().includes('arquero');
}

function obtenerRolInicialPartido(jugador) {
  const posicionPrimaria = obtenerPosicionesJugador(jugador).find(posicion => posicion?.es_primaria);

  return esPosicionArquero(posicionPrimaria)
    ? ROL_PARTIDO_ARQUERO
    : ROL_PARTIDO_JUGADOR;
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
        es_gol_en_contra
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

      stats.cagadas_en_gol += Number(jp.cagadas) || 0;
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
    inputJugadores.value = ultimosJugadoresUsados;
    // Trigger del evento para cargar los jugadores
    buscarJugadoresDisponibles();
  } else {
    // Si no hay jugadores previos, resetear todo
    jugadoresSeleccionados = [];
    inputJugadores.value = '';
    actualizarJugadoresSeleccionados();
  }

  if (typeof window.actualizarModoRendimientoMatchmaking === 'function') {
    window.actualizarModoRendimientoMatchmaking();
  }
  
  modal.show();
};

// Función para buscar jugadores mientras se escribe
window.buscarJugadoresDisponibles = function() {
  const input = document.getElementById('input-jugadores-partido').value;
  const nombres = input.split(',').map(n => n.trim()).filter(n => n.length > 0);
  
  if (!window.datosJugadores || window.datosJugadores.length === 0) {
    actualizarJugadoresSeleccionados();
    return;
  }
  
  // Buscar coincidencias
  const rolesPrevios = new Map(jugadoresSeleccionados.map(jugador => [String(jugador.id), jugador.rolPartido]));
  jugadoresSeleccionados = [];
  nombres.forEach(nombre => {
    const jugador = window.datosJugadores.find(j => 
      (j.jugadores?.nombre || j.nombre).toLowerCase().includes(nombre.toLowerCase())
    );
    if (jugador && !jugadoresSeleccionados.find(js => js.id === jugador.jugadores?.id || jugador.id)) {
      const jugadorId = jugador.jugadores?.id || jugador.id;
      jugadoresSeleccionados.push({
        id: jugadorId,
        nombre: jugador.jugadores?.nombre || jugador.nombre,
        data: jugador,
        rolPartido: normalizarRolPartido(rolesPrevios.get(String(jugadorId)) || obtenerRolInicialPartido(jugador))
      });
    }
  });
  
  actualizarJugadoresSeleccionados();
  actualizarSelectsRestricciones();
  validarEjecucion();
};

// Función para actualizar la vista de jugadores seleccionados
window.cambiarRolJugadorSeleccionado = function(jugadorId, rolPartido) {
  const jugador = jugadoresSeleccionados.find(j => String(j.id) === String(jugadorId));
  if (!jugador) return;

  jugador.rolPartido = normalizarRolPartido(rolPartido);
  actualizarJugadoresSeleccionados();
  validarEjecucion();
};

function actualizarJugadoresSeleccionados() {
  const container = document.getElementById('jugadores-seleccionados');
  
  if (jugadoresSeleccionados.length === 0) {
    container.innerHTML = `
      <div class="text-center text-light-emphasis">
        <i class="bi bi-person-plus"></i>
        Escribe los nombres de los jugadores arriba
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
        ${jugadoresSeleccionados.length >= 10 ? 'Listo para armar equipos' : 'Necesitas al menos 10'}
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
              <span class="player-role-name">${j.nombre}</span>
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
  const puedeEjecutar = jugadoresSeleccionados.length >= 10;
  
  boton.disabled = !puedeEjecutar;
  
  if (puedeEjecutar) {
    boton.innerHTML = '<i class="bi bi-play-fill me-2"></i>Ejecutar Algoritmo';
  } else {
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
document.addEventListener('DOMContentLoaded', function() {
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
              pulmon: jugadorCompleto.data.jugadores?.pulmon || jugadorCompleto.data.pulmon,
              jugador_posicion: jugadorCompleto.data.jugadores?.jugador_posicion || []
            },
            jugador_posicion: jugadorCompleto.data.jugadores?.jugador_posicion || [],
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
              pulmon: jugadorCompleto.data.jugadores?.pulmon || jugadorCompleto.data.pulmon,
              jugador_posicion: jugadorCompleto.data.jugadores?.jugador_posicion || []
            },
            jugador_posicion: jugadorCompleto.data.jugadores?.jugador_posicion || [],
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

function renderizarJugadorResultadoMatchmaking(jugador) {
  const skill = Number(jugador.skillMatchmaking ?? jugador.rendimientoTotal) || 0;
  const impacto = Number(jugador.impactoMatchmaking) || 0;
  const rolArquero = jugador.rolPartido === ROL_PARTIDO_ARQUERO;
  const partidosRecientes = jugador.origenRendimiento === MODO_RENDIMIENTO_RECIENTE
    ? `<small class="text-light-emphasis">${jugador.partidosRecientesUsados}/${jugador.partidosRecientesSolicitados} PJ</small>`
    : '';

  return `
    <span class="player-card matchmaking-impact-card">
      <span class="matchmaking-player-main">
        <span class="matchmaking-player-name">${jugador.nombre}</span>
        <span class="badge ${rolArquero ? 'bg-warning text-dark' : 'bg-primary'}">${etiquetaRolPartido(jugador.rolPartido)}</span>
      </span>
      <span class="matchmaking-player-metrics">
        <small class="matchmaking-skill-pill">Skill ${skill.toFixed(1)}</small>
        <small class="matchmaking-impact-pill">${impacto.toFixed(1)}% impacto</small>
        ${partidosRecientes}
      </span>
    </span>
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
    <div class="matchmaking-key-note mt-3">
      <i class="bi bi-exclamation-diamond me-2"></i>
      Este balance depende especialmente de que <strong>${jugadorClave.nombre}</strong> juegue como viene jugando:
      aporta <strong>${impacto.toFixed(1)}%</strong> del impacto del armado con skill <strong>${skill.toFixed(1)}</strong> ${contexto}.
    </div>
  `;
}

// Función para mostrar los resultados
function mostrarResultados(resultado) {
  document.getElementById('progress-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';
  
  const container = document.getElementById('equipos-resultado');
  const configuracion = resultado.configuracionRendimiento || { modo: MODO_RENDIMIENTO_HISTORICO };
  const etiquetaBaseRendimiento = configuracion.modo === MODO_RENDIMIENTO_RECIENTE
    ? `Últimos ${configuracion.partidos || PARTIDOS_RECIENTES_DEFAULT} partidos por jugador${configuracion.temporadaId ? ' en temporada activa' : ''}`
    : 'Histórico / temporada activa';
  
  const html = `
    <div class="col-12">
      <div class="matchmaking-result-mode rounded px-3 py-2">
        <div>
          <i class="bi bi-sliders me-2"></i>
          Base de balance: <strong>${etiquetaBaseRendimiento}</strong>
        </div>
        ${renderizarNotaJugadorClaveMatchmaking(resultado)}
      </div>
    </div>
    <div class="col-md-6">
      <div class="team-result-card team-1">
        <h6 class="text-primary">
          <i class="bi bi-trophy me-2"></i>
          Equipo 1
        </h6>
        <div class="player-list">
          ${resultado.equipo1.jugadores.map(renderizarJugadorResultadoMatchmaking).join('')}
        </div>
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
          ${resultado.equipo2.jugadores.map(renderizarJugadorResultadoMatchmaking).join('')}
        </div>
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
          ${mostrarPosicionesJugador(jugador.jugador_posicion)}
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
