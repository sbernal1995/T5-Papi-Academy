/**
 * Algoritmo Genético para Auto-Armado de Equipos
 * Versión JavaScript adaptada del código Python original
 */

const ROL_PARTIDO_JUGADOR = 'jugador';
const ROL_PARTIDO_ARQUERO = 'arquero';
const MODO_RENDIMIENTO_HISTORICO = 'historico';
const MODO_RENDIMIENTO_RECIENTE = 'reciente';
const PARTIDOS_RECIENTES_DEFAULT = 5;
const SOBRE_RENDIMIENTO_RECIENTE_MIN_ABSOLUTO = 3;
const SOBRE_RENDIMIENTO_RECIENTE_MIN_RELATIVO = 0.25;

function normalizarRolPartido(rol) {
  return rol === ROL_PARTIDO_ARQUERO ? ROL_PARTIDO_ARQUERO : ROL_PARTIDO_JUGADOR;
}

function etiquetaRolPartido(rol) {
  return normalizarRolPartido(rol) === ROL_PARTIDO_ARQUERO ? 'Arquero' : 'Jugador';
}

function numeroFinitoMatchmaking(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function numeroSeguroMatchmaking(valor, fallback = 0) {
  const numero = numeroFinitoMatchmaking(valor);
  return numero === null ? fallback : numero;
}

function obtenerIdJugadorMatchmaking(jugador) {
  return jugador?.jugadores?.id || jugador?.jugador_id || jugador?.id || null;
}

function obtenerNombreJugadorMatchmaking(jugador) {
  return jugador?.nombre || jugador?.jugadores?.nombre || 'Jugador';
}

function obtenerPulmonTrackingMatchmaking(jugador) {
  const candidatos = [
    jugador?.pulmonTracking,
    jugador?.pulmon_tracking,
    jugador?.tracking?.pulmon_tracking,
    jugador?.tracking?.fis_valor,
    jugador?.fis_valor,
    jugador?.physical_profile?.fis,
    jugador?.pulmon?.fis,
    jugador?.metrics?.fis_valor,
    jugador?.metrics?.pulmon?.fis,
    jugador?.pulmonManual,
    jugador?.manual_pulmon,
    jugador?.jugadores?.pulmon,
    jugador?.pulmon
  ];

  for (const valor of candidatos) {
    const numero = numeroFinitoMatchmaking(valor);
    if (numero !== null && numero > 0) return numero;
  }

  return null;
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
      pulmonTrackingTotal: 1.4,
      cantidadArqueros: 25
    };
  }

  /**
   * Establece la lista de jugadores con sus estadísticas
   * @param {Array} jugadores - Array de objetos jugador con estadísticas
   */
  setJugadores(jugadores) {
    const jugadoresProcesados = jugadores.map(jugador => {
      const jugadorId = obtenerIdJugadorMatchmaking(jugador);
      const rolPartido = normalizarRolPartido(jugador.rolPartido || jugador.rol_matchmaking);
      const rendimientoJugador = this.calcularRendimientoJugador(jugador);
      const rendimientoArqueroDisponible = this.calcularRendimientoArquero(jugador);
      const esArquero = rolPartido === ROL_PARTIDO_ARQUERO;
      const historicoMatchmaking = jugador.historicoMatchmaking
        ? {
            ...jugador.historicoMatchmaking,
            rolPartido,
            rol_matchmaking: rolPartido
          }
        : null;
      const rendimientoHistoricoMatchmaking = historicoMatchmaking
        ? (esArquero
            ? this.calcularRendimientoArquero(historicoMatchmaking)
            : this.calcularRendimientoJugador(historicoMatchmaking))
        : null;
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);

      return {
        id: jugadorId,
        nombre: obtenerNombreJugadorMatchmaking(jugador),
        rolPartido,
        origenRendimiento: jugador.origenRendimiento || MODO_RENDIMIENTO_HISTORICO,
        partidosRecientesSolicitados: jugador.partidosRecientesSolicitados || 0,
        partidosRecientesUsados: jugador.partidosRecientesUsados || 0,
        rendimientoTotal: esArquero ? rendimientoArqueroDisponible : rendimientoJugador,
        rendimientoHistoricoMatchmaking: Number.isFinite(rendimientoHistoricoMatchmaking) ? rendimientoHistoricoMatchmaking : null,
        rendimientoAtaque: esArquero ? 0 : rendimientoJugador,
        rendimientoArquero: esArquero ? rendimientoArqueroDisponible : 0,
        rendimientoJugador,
        rendimientoArqueroDisponible,
        golesFavorEquipo: esArquero ? 0 : Number(jugador.goles_favor_equipo) || 0,
        golesRecibidosEquipo: esArquero ? Number(jugador.goles_recibidos_equipo) || 0 : 0,
        cantidadArqueros: esArquero ? 1 : 0,
        goles: numeroSeguroMatchmaking(jugador.goles),
        asistencias: numeroSeguroMatchmaking(jugador.asistencias),
        atajadas: numeroSeguroMatchmaking(jugador.atajadas),
        golesRecibidosArquero: numeroSeguroMatchmaking(jugador.goles_recibidos_arquero ?? jugador.golesRecibidosArquero),
        pjArquero: numeroSeguroMatchmaking(jugador.pj_arquero ?? jugador.pjArquero),
        cagadasEnGol: numeroSeguroMatchmaking(jugador.cagadas_en_gol ?? jugador.cagadasEnGol),
        momentosGolesMatchmaking: Array.isArray(jugador.momentosGolesMatchmaking) ? jugador.momentosGolesMatchmaking : [],
        momentosGolesRecibidosArqueroMatchmaking: Array.isArray(jugador.momentosGolesRecibidosArqueroMatchmaking) ? jugador.momentosGolesRecibidosArqueroMatchmaking : [],
        matchmakingVersus: jugador.matchmakingVersus && typeof jugador.matchmakingVersus === 'object' ? jugador.matchmakingVersus : {},
        matchmakingJuntos: jugador.matchmakingJuntos && typeof jugador.matchmakingJuntos === 'object' ? jugador.matchmakingJuntos : {},
        matchmakingDinamica: jugador.matchmakingDinamica && typeof jugador.matchmakingDinamica === 'object' ? jugador.matchmakingDinamica : null,
        distribucionTramos: jugador.distribucionTramos || jugador.momentosPerfil?.distribucionTramos || null,
        trackingDistanceKmAvg: numeroSeguroMatchmaking(jugador.trackingDistanceKmAvg ?? jugador.distance_km_avg ?? jugador.tracking?.distance_km_avg),
        trackingDistancePer40Km: numeroSeguroMatchmaking(jugador.trackingDistancePer40Km ?? jugador.distance_per_40_min_km ?? jugador.tracking?.distance_per_40_min_km),
        pulmonTracking,
        trackingGoalsScoredLocations: Array.isArray(jugador.trackingGoalsScoredLocations)
          ? jugador.trackingGoalsScoredLocations
          : (Array.isArray(jugador.goal_locations) ? jugador.goal_locations : []),
        trackingGoalsConcededLocations: Array.isArray(jugador.trackingGoalsConcededLocations) ? jugador.trackingGoalsConcededLocations : [],
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
    const pjArquero = Math.max(
      Number(jugador.pj_arquero ?? jugador.pjArquero ?? jugador.pj) || 0,
      1
    );
    const atajadas = Number(jugador.atajadas) || 0;
    const golesRecibidos = Number(jugador.goles_recibidos_arquero ?? jugador.golesRecibidosArquero) || 0;
    const atajadasPP = atajadas / pjArquero;
    const golesRecibidosPP = golesRecibidos / pjArquero;
    const atajadasPorGol = golesRecibidos > 0
      ? atajadas / golesRecibidos
      : (atajadasPP > 0 ? atajadasPP : 0);

    return Math.max(
      0,
      (atajadasPP * 0.66)
        + (Math.min(atajadasPorGol, 5) * 0.8)
        - (Math.min(golesRecibidosPP, 5) * 0.6)
    );
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
      pulmonTrackingTotal: 0,
      cantidadArqueros: 0
    };
    const stats2 = {
      rendimientoTotal: 0,
      rendimientoAtaque: 0,
      rendimientoArquero: 0,
      golesFavorEquipo: 0,
      golesRecibidosEquipo: 0,
      pulmonTrackingTotal: 0,
      cantidadArqueros: 0
    };

    for (let i = 0; i < individuo.length; i++) {
      const jugador = this.jugadores[i];
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);
      if (individuo[i] === 0) {
        equipo1.push(jugador.nombre);
        stats1.rendimientoTotal += jugador.rendimientoTotal;
        stats1.rendimientoAtaque += jugador.rendimientoAtaque;
        stats1.rendimientoArquero += jugador.rendimientoArquero;
        stats1.golesFavorEquipo += jugador.golesFavorEquipo;
        stats1.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats1.pulmonTrackingTotal += pulmonTracking || 0;
        stats1.cantidadArqueros += jugador.cantidadArqueros;
      } else {
        equipo2.push(jugador.nombre);
        stats2.rendimientoTotal += jugador.rendimientoTotal;
        stats2.rendimientoAtaque += jugador.rendimientoAtaque;
        stats2.rendimientoArquero += jugador.rendimientoArquero;
        stats2.golesFavorEquipo += jugador.golesFavorEquipo;
        stats2.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
        stats2.pulmonTrackingTotal += pulmonTracking || 0;
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
      pulmonTrackingTotal: stats1.pulmonTrackingTotal,
      cantidadArqueros: stats1.cantidadArqueros
    };

    const avg2 = {
      rendimientoTotal: stats2.rendimientoTotal / size2,
      rendimientoAtaque: stats2.rendimientoAtaque / size2,
      rendimientoArquero: stats2.rendimientoArquero / size2,
      golesFavorEquipo: stats2.golesFavorEquipo / size2,
      golesRecibidosEquipo: stats2.golesRecibidosEquipo / size2,
      pulmonTrackingTotal: stats2.pulmonTrackingTotal,
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
    fitness += Math.abs((avg1.pulmonTrackingTotal || 0) - (avg2.pulmonTrackingTotal || 0)) * this.fitnessWeights.pulmonTrackingTotal;
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
      pulmonTrackingTotal: 0,
      cantidadArqueros: 0,
      impactoMatchmaking: 0,
      jugadoresConPulmonTracking: 0
    };

    for (const jugador of equipo) {
      stats.rendimientoTotal += jugador.rendimientoTotal;
      stats.rendimientoAtaque += jugador.rendimientoAtaque;
      stats.rendimientoArquero += jugador.rendimientoArquero;
      stats.golesFavorEquipo += jugador.golesFavorEquipo;
      stats.golesRecibidosEquipo += jugador.golesRecibidosEquipo;
      stats.winrate += jugador.winrate;
      const pulmonTracking = obtenerPulmonTrackingMatchmaking(jugador);
      if (pulmonTracking !== null && pulmonTracking > 0) {
        stats.pulmonTrackingTotal += pulmonTracking;
        stats.jugadoresConPulmonTracking += 1;
      }
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
      pulmonPromedio: stats.jugadoresConPulmonTracking > 0 ? stats.pulmonTrackingTotal / stats.jugadoresConPulmonTracking : 0,
      pulmonTotal: stats.pulmonTrackingTotal,
      pulmonTrackingTotal: stats.pulmonTrackingTotal,
      jugadoresConPulmonTracking: stats.jugadoresConPulmonTracking,
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
let seleccionIntercambioMatchmaking = null;

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

function esErrorColumnaFaltanteMatchmaking(error, columna) {
  const mensaje = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code
  ].filter(Boolean).join(' ').toLowerCase();
  return mensaje.includes(String(columna).toLowerCase());
}

function construirSelectPartidosMomentosMatchmaking({ incluirArquero = true, incluirReview = true, incluirCagada = true } = {}) {
  const columnasGol = [
    'id',
    'goleador_id',
    'equipo',
    'es_gol_en_contra',
    'minuto'
  ];

  if (incluirCagada) columnasGol.push('cagada_jugador_id');
  if (incluirArquero) columnasGol.push('arquero_id');
  if (incluirReview) columnasGol.push('review_segundos');

  return `
    id,
    fecha,
    temporada_id,
    equipo_ganador,
    jugador_partido (
      jugador_id,
      equipo,
      cagadas
    ),
    goles (
      ${columnasGol.join(',\n      ')}
    )
  `;
}

async function consultarPartidosMomentosMatchmaking(temporadaId = '', opciones = {}) {
  const incluirArquero = opciones.incluirArquero !== false;
  const incluirReview = opciones.incluirReview !== false;
  const incluirCagada = opciones.incluirCagada !== false;

  let query = window.supabase
    .from('partidos')
    .select(construirSelectPartidosMomentosMatchmaking({ incluirArquero, incluirReview, incluirCagada }))
    .order('fecha', { ascending: true })
    .order('id', { ascending: true });

  if (temporadaId) {
    query = query.eq('temporada_id', temporadaId);
  }

  const resultado = await query;
  if (!resultado.error) return { partidos: resultado.data || [], incluyeArquero: incluirArquero };

  if (incluirCagada && esErrorColumnaFaltanteMatchmaking(resultado.error, 'cagada_jugador_id')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero, incluirReview, incluirCagada: false });
  }

  if (incluirArquero && esErrorColumnaFaltanteMatchmaking(resultado.error, 'arquero_id')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero: false, incluirReview, incluirCagada });
  }

  if (incluirReview && esErrorColumnaFaltanteMatchmaking(resultado.error, 'review_segundos')) {
    return consultarPartidosMomentosMatchmaking(temporadaId, { incluirArquero, incluirReview: false, incluirCagada });
  }

  throw resultado.error;
}

function obtenerMinutoGolMatchmaking(gol) {
  const minuto = numeroFinitoMatchmaking(gol?.minuto);
  if (minuto !== null && minuto >= 0) return minuto;

  const reviewSegundos = numeroFinitoMatchmaking(gol?.review_segundos);
  return reviewSegundos !== null && reviewSegundos >= 0 ? reviewSegundos / 60 : null;
}

function crearDinamicaMatchmakingVacia() {
  return {
    partidos: 0,
    arrancoPerdiendo: 0,
    remontadasGanadas: 0,
    empatesDesdePerdiendo: 0,
    cagadas: 0
  };
}

function crearResumenJugadorMomentosMatchmaking() {
  return {
    convertidos: [],
    recibidosArquero: [],
    versus: new Map(),
    juntos: new Map(),
    dinamica: crearDinamicaMatchmakingVacia()
  };
}

function asegurarRelacionMatchmaking(mapa, jugadorId) {
  const key = String(jugadorId || '');
  if (!key) return null;
  if (!mapa.has(key)) {
    mapa.set(key, {
      pj: 0,
      victorias: 0,
      empates: 0,
      derrotas: 0,
      rachaVictoriasActual: 0,
      mejorRachaVictorias: 0
    });
  }
  return mapa.get(key);
}

function asegurarVersusMatchmaking(resumenJugador, rivalId) {
  return asegurarRelacionMatchmaking(resumenJugador.versus, rivalId);
}

function asegurarJuntosMatchmaking(resumenJugador, companeroId) {
  return asegurarRelacionMatchmaking(resumenJugador.juntos, companeroId);
}

function convertirVersusMatchmaking(versus = new Map()) {
  const salida = {};
  versus.forEach((stat, rivalId) => {
    const pj = Number(stat.pj) || 0;
    salida[rivalId] = {
      ...stat,
      winrate: pj > 0 ? ((Number(stat.victorias) || 0) / pj) * 100 : 0
    };
  });
  return salida;
}

function obtenerEventosGolOrdenadosPartidoMatchmaking(partido) {
  const jugadoresPartido = partido?.jugador_partido || [];
  return (partido?.goles || [])
    .map(gol => ({
      gol,
      equipo: obtenerEquipoGolEnPartidoMatchmaking(gol, jugadoresPartido),
      minuto: obtenerMinutoGolMatchmaking(gol)
    }))
    .filter(evento => evento.equipo === 1 || evento.equipo === 2)
    .sort((a, b) => {
      const minutoA = a.minuto === null ? Number.POSITIVE_INFINITY : a.minuto;
      const minutoB = b.minuto === null ? Number.POSITIVE_INFINITY : b.minuto;
      if (minutoA !== minutoB) return minutoA - minutoB;
      return String(a.gol?.id || '').localeCompare(String(b.gol?.id || ''));
    });
}

function calcularCagadasJugadorPartidoMatchmaking(partido, jugadorPartido) {
  const cagadasJugadorPartido = Number(jugadorPartido?.cagadas) || 0;
  const cagadasDesdeGoles = (partido?.goles || [])
    .filter(gol => String(gol?.cagada_jugador_id || '') === String(jugadorPartido?.jugador_id || ''))
    .length;

  if (cagadasJugadorPartido > 0 && cagadasDesdeGoles > 0) {
    return Math.max(cagadasJugadorPartido, cagadasDesdeGoles);
  }

  return cagadasJugadorPartido + cagadasDesdeGoles;
}

async function enriquecerJugadoresConMomentosMatchmaking(jugadores, temporadaId = '') {
  if (!window.supabase || !Array.isArray(jugadores) || jugadores.length === 0) {
    return jugadores;
  }

  const idsSeleccionados = new Set(
    jugadores
      .map(jugador => obtenerIdJugadorMatchmaking(jugador))
      .filter(Boolean)
      .map(id => String(id))
  );

  if (idsSeleccionados.size === 0) return jugadores;

  try {
    const { partidos, incluyeArquero } = await consultarPartidosMomentosMatchmaking(temporadaId);
    const momentosPorJugador = new Map();

    idsSeleccionados.forEach(id => {
      momentosPorJugador.set(id, crearResumenJugadorMomentosMatchmaking());
    });

    (partidos || []).forEach(partido => {
      const jugadoresPartido = partido.jugador_partido || [];
      const seleccionadosPartido = jugadoresPartido.filter(jp => (
        idsSeleccionados.has(String(jp.jugador_id || ''))
        && (Number(jp.equipo) === 1 || Number(jp.equipo) === 2)
      ));
      const golesOrdenados = obtenerEventosGolOrdenadosPartidoMatchmaking(partido);
      const primerEquipoGol = golesOrdenados[0]?.equipo || null;
      const equipoGanador = Number(partido.equipo_ganador);

      seleccionadosPartido.forEach(jp => {
        const jugadorId = String(jp.jugador_id || '');
        const resumen = momentosPorJugador.get(jugadorId);
        if (!resumen) return;

        const equipoJugador = Number(jp.equipo);
        resumen.dinamica.partidos += 1;
        resumen.dinamica.cagadas += calcularCagadasJugadorPartidoMatchmaking(partido, jp);

        if (primerEquipoGol && primerEquipoGol !== equipoJugador) {
          resumen.dinamica.arrancoPerdiendo += 1;
          if (equipoGanador === equipoJugador) {
            resumen.dinamica.remontadasGanadas += 1;
          } else if (!equipoGanador) {
            resumen.dinamica.empatesDesdePerdiendo += 1;
          }
        }
      });

      seleccionadosPartido.forEach(jugador => {
        seleccionadosPartido.forEach(rival => {
          if (String(jugador.jugador_id) === String(rival.jugador_id)) return;

          const resumen = momentosPorJugador.get(String(jugador.jugador_id));
          if (!resumen) return;

          const mismoEquipo = Number(jugador.equipo) === Number(rival.equipo);
          const stat = mismoEquipo
            ? asegurarJuntosMatchmaking(resumen, rival.jugador_id)
            : asegurarVersusMatchmaking(resumen, rival.jugador_id);
          if (!stat) return;

          stat.pj += 1;
          if (equipoGanador === Number(jugador.equipo)) {
            stat.victorias += 1;
            stat.rachaVictoriasActual = (Number(stat.rachaVictoriasActual) || 0) + 1;
            stat.mejorRachaVictorias = Math.max(Number(stat.mejorRachaVictorias) || 0, stat.rachaVictoriasActual);
          } else if (!equipoGanador) {
            stat.empates += 1;
            stat.rachaVictoriasActual = 0;
          } else {
            stat.derrotas += 1;
            stat.rachaVictoriasActual = 0;
          }
        });
      });

      (partido.goles || []).forEach(gol => {
        const minuto = obtenerMinutoGolMatchmaking(gol);
        const segundos = minuto === null ? null : Math.round(minuto * 60);
        const base = {
          partido_id: partido.id,
          fecha: partido.fecha || null,
          minuto,
          segundos,
          goleador_id: gol.goleador_id || null,
          arquero_id: incluyeArquero ? (gol.arquero_id || null) : null
        };

        if (!gol.es_gol_en_contra && gol.goleador_id && idsSeleccionados.has(String(gol.goleador_id))) {
          momentosPorJugador.get(String(gol.goleador_id))?.convertidos.push(base);
        }

        if (!gol.es_gol_en_contra && incluyeArquero && gol.arquero_id && idsSeleccionados.has(String(gol.arquero_id))) {
          momentosPorJugador.get(String(gol.arquero_id))?.recibidosArquero.push(base);
        }
      });
    });

    return jugadores.map(jugador => {
      const id = obtenerIdJugadorMatchmaking(jugador);
      const momentos = id ? momentosPorJugador.get(String(id)) : null;
      if (!momentos) return jugador;

      return {
        ...jugador,
        momentosGolesMatchmaking: momentos.convertidos,
        momentosGolesRecibidosArqueroMatchmaking: momentos.recibidosArquero,
        matchmakingVersus: convertirVersusMatchmaking(momentos.versus),
        matchmakingJuntos: convertirVersusMatchmaking(momentos.juntos),
        matchmakingDinamica: momentos.dinamica
      };
    });
  } catch (error) {
    console.warn('No se pudieron cargar momentos historicos para matchmaking:', error);
    return jugadores;
  }
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
    historicoMatchmaking: {
      ...jugadorSeleccionado.data,
      rolPartido: jugadorSeleccionado.rolPartido,
      rol_matchmaking: jugadorSeleccionado.rolPartido
    },
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

        datosJugadoresSeleccionados = await enriquecerJugadoresConMomentosMatchmaking(
          datosJugadoresSeleccionados,
          configuracionRendimiento.temporadaId
        );

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
        
        seleccionIntercambioMatchmaking = null;

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

const MATCHMAKING_TEAM_THEMES = {
  equipo1: {
    name: 'Equipo 1',
    color: '#4c8dff',
    soft: 'rgba(76, 141, 255, 0.12)'
  },
  equipo2: {
    name: 'Equipo 2',
    color: '#ff5d5d',
    soft: 'rgba(255, 93, 93, 0.12)'
  }
};

function porcentajeImpactoEquipoMatchmaking(stats1 = {}, stats2 = {}) {
  const impacto1 = numeroSeguroMatchmaking(stats1.impactoMatchmaking);
  const impacto2 = numeroSeguroMatchmaking(stats2.impactoMatchmaking);
  const total = impacto1 + impacto2;
  if (total <= 0) return { equipo1: 50, equipo2: 50 };
  return {
    equipo1: (impacto1 / total) * 100,
    equipo2: (impacto2 / total) * 100
  };
}

function maxImpactoJugadoresMatchmaking(resultado) {
  const impactos = [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ].map(jugador => numeroSeguroMatchmaking(jugador.impactoMatchmaking));
  return Math.max(1, ...impactos);
}

function renderizarJugadorResultadoMatchmaking(jugador, equipoKey = '', index = 0, opciones = {}) {
  const skill = Number(jugador.skillMatchmaking ?? jugador.rendimientoTotal) || 0;
  const impacto = Number(jugador.impactoMatchmaking) || 0;
  const rolArquero = jugador.rolPartido === ROL_PARTIDO_ARQUERO;
  const estaSeleccionado = seleccionIntercambioMatchmaking &&
    seleccionIntercambioMatchmaking.equipoKey === equipoKey &&
    Number(seleccionIntercambioMatchmaking.index) === Number(index);
  const partidosRecientes = jugador.origenRendimiento === MODO_RENDIMIENTO_RECIENTE
    ? `<small class="text-light-emphasis">${jugador.partidosRecientesUsados}/${jugador.partidosRecientesSolicitados} PJ</small>`
    : '';
  const maxImpacto = Math.max(1, numeroSeguroMatchmaking(opciones.maxImpacto, 1));
  const anchoImpacto = Math.max(4, Math.min(100, (impacto / maxImpacto) * 100));
  const tema = MATCHMAKING_TEAM_THEMES[equipoKey] || MATCHMAKING_TEAM_THEMES.equipo1;
  const esClave = opciones.jugadorClave && String(opciones.jugadorClave.id || opciones.jugadorClave.nombre) === String(jugador.id || jugador.nombre);
  const rolTexto = rolArquero ? 'Arquero' : 'Jugador';

  return `
    <button
      type="button"
      class="matchmaking-player-row matchmaking-swap-player ${estaSeleccionado ? 'is-selected' : ''} ${esClave ? 'is-key' : ''}"
      onclick="seleccionarJugadorIntercambioMatchmaking('${equipoKey}', ${index})"
      aria-pressed="${estaSeleccionado ? 'true' : 'false'}"
      title="${estaSeleccionado ? 'Cancelar seleccion' : 'Seleccionar para intercambiar'}"
    >
      <span class="matchmaking-player-row__top">
        <span class="matchmaking-player-row__name">
          ${escaparHtmlMatchmaking(jugador.nombre)}
          ${esClave ? '<i class="bi bi-star-fill matchmaking-player-row__star" title="Jugador clave"></i>' : ''}
        </span>
        <span class="matchmaking-player-row__role">${rolTexto}</span>
        <span class="matchmaking-player-row__skill">Skill ${skill.toFixed(1)}</span>
        <span class="matchmaking-player-row__impact">${impacto.toFixed(1)}%</span>
        ${partidosRecientes}
      </span>
      <span class="matchmaking-player-bar">
        <span class="matchmaking-player-bar__fill" style="width:${anchoImpacto.toFixed(1)}%; background:${tema.color};"></span>
      </span>
    </button>
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
    <div class="matchmaking-key-note">
      <i class="bi bi-exclamation-diamond me-2"></i>
      Este balance depende especialmente de que <strong>${jugadorClave.nombre}</strong> juegue como viene jugando:
      aporta <strong>${impacto.toFixed(1)}%</strong> del impacto del armado con skill <strong>${skill.toFixed(1)}</strong> ${contexto}.
    </div>
  `;
}

function obtenerJugadorSobreRendimientoReciente(resultado) {
  const jugadores = [
    ...(resultado?.equipo1?.jugadores || []),
    ...(resultado?.equipo2?.jugadores || [])
  ];

  const candidatos = jugadores
    .map(jugador => {
      if (jugador.origenRendimiento !== MODO_RENDIMIENTO_RECIENTE) return null;

      const historicoRaw = jugador.rendimientoHistoricoMatchmaking;
      if (historicoRaw === null || historicoRaw === undefined) return null;

      const reciente = Number(jugador.skillMatchmaking ?? jugador.rendimientoTotal);
      const historico = Number(historicoRaw);
      if (!Number.isFinite(reciente) || !Number.isFinite(historico)) return null;

      const diferencia = reciente - historico;
      const variacionRelativa = historico > 0 ? diferencia / historico : Number.POSITIVE_INFINITY;

      if (diferencia < SOBRE_RENDIMIENTO_RECIENTE_MIN_ABSOLUTO) return null;
      if (historico > 0 && variacionRelativa < SOBRE_RENDIMIENTO_RECIENTE_MIN_RELATIVO) return null;

      return {
        jugador,
        reciente,
        historico,
        diferencia,
        variacionRelativa
      };
    })
    .filter(Boolean);

  if (candidatos.length === 0) return null;

  return candidatos.sort((a, b) => {
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    return b.variacionRelativa - a.variacionRelativa;
  })[0];
}

function renderizarNotaSobreRendimientoReciente(resultado) {
  const sobreRendimiento = obtenerJugadorSobreRendimientoReciente(resultado);
  if (!sobreRendimiento) return '';

  const { jugador, reciente, historico, diferencia, variacionRelativa } = sobreRendimiento;
  const variacionTexto = Number.isFinite(variacionRelativa)
    ? `, +${Math.round(variacionRelativa * 100)}%`
    : '';

  return `
    <div class="matchmaking-key-note matchmaking-trend-note">
      <i class="bi bi-graph-up-arrow me-2"></i>
      Ojo con <strong>${jugador.nombre}</strong>: viene jugando bastante por encima de su histórico
      (skill reciente <strong>${reciente.toFixed(1)}</strong> vs histórico <strong>${historico.toFixed(1)}</strong>,
      +<strong>${diferencia.toFixed(1)}</strong>${variacionTexto}). El balance depende de que siga jugando así.
    </div>
  `;
}

// Helpers para notas de atencion del matchmaking
function escaparHtmlMatchmaking(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TRAMOS_GOL_MATCHMAKING = [
  { key: 't0_15', label: '0-15', min: 0, max: 15 * 60 },
  { key: 't15_30', label: '15-30', min: 15 * 60, max: 30 * 60 },
  { key: 't30_45', label: '30-45', min: 30 * 60, max: 45 * 60 },
  { key: 't45_plus', label: '45+', min: 45 * 60, max: Number.POSITIVE_INFINITY }
];

function obtenerListaDisponibleMatchmaking(...listas) {
  return listas.find(lista => Array.isArray(lista) && lista.length > 0) || [];
}

function obtenerSegundosEventoGolMatchmaking(evento) {
  const segundosDirectos = numeroFinitoMatchmaking(
    evento?.segundos ?? evento?.match_seconds ?? evento?.review_seconds ?? evento?.sam3_seconds ?? evento?.seconds
  );
  if (segundosDirectos !== null && segundosDirectos >= 0) return segundosDirectos;

  const minuto = numeroFinitoMatchmaking(evento?.minuto ?? evento?.minute);
  return minuto !== null && minuto >= 0 ? minuto * 60 : null;
}

function crearDistribucionVaciaTramosMatchmaking() {
  return TRAMOS_GOL_MATCHMAKING.reduce((acc, tramo) => {
    acc[tramo.key] = 0;
    return acc;
  }, {});
}

function obtenerTramoPorSegundosMatchmaking(segundos) {
  return TRAMOS_GOL_MATCHMAKING.find(tramo => segundos >= tramo.min && segundos < tramo.max) || null;
}

function calcularDistribucionEventosGolMatchmaking(eventos = []) {
  const distribucion = crearDistribucionVaciaTramosMatchmaking();
  let total = 0;

  (eventos || []).forEach(evento => {
    const segundos = obtenerSegundosEventoGolMatchmaking(evento);
    if (segundos === null) return;

    const tramo = obtenerTramoPorSegundosMatchmaking(segundos);
    if (!tramo) return;

    distribucion[tramo.key] += 1;
    total += 1;
  });

  return { distribucion, total };
}

function obtenerTramoDominanteDistribucionMatchmaking(distribucion = {}, totalForzado = null, opciones = {}) {
  const total = totalForzado ?? TRAMOS_GOL_MATCHMAKING.reduce((sum, tramo) => sum + (Number(distribucion[tramo.key]) || 0), 0);
  const minimoTotal = opciones.minimoTotal ?? 2;
  const minimoCantidad = opciones.minimoCantidad ?? 2;
  const minimoPorcentaje = opciones.minimoPorcentaje ?? 45;

  if (total < minimoTotal) return null;

  const tramos = TRAMOS_GOL_MATCHMAKING
    .map(tramo => ({
      ...tramo,
      cantidad: Number(distribucion[tramo.key]) || 0
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const principal = tramos[0];
  const segundo = tramos[1];
  const porcentaje = total > 0 ? (principal.cantidad / total) * 100 : 0;

  if (principal.cantidad < minimoCantidad || porcentaje < minimoPorcentaje) return null;
  if (segundo && principal.cantidad - segundo.cantidad < 2 && porcentaje < 60) return null;

  return {
    ...principal,
    total,
    porcentaje
  };
}

function obtenerDistribucionTramosJugadorMatchmaking(jugador) {
  const distribucion = jugador?.distribucionTramos;
  if (!distribucion || typeof distribucion !== 'object') return null;
  const total = TRAMOS_GOL_MATCHMAKING.reduce((sum, tramo) => sum + (Number(distribucion[tramo.key]) || 0), 0);
  return total > 0 ? { distribucion, total } : null;
}

function obtenerEventosGolesConvertidosMatchmaking(jugador) {
  return obtenerListaDisponibleMatchmaking(
    jugador?.momentosGolesMatchmaking,
    jugador?.trackingGoalsScoredLocations,
    jugador?.tracking?.goal_locations
  );
}

function obtenerEventosGolesRecibidosArqueroMatchmaking(jugador) {
  return obtenerListaDisponibleMatchmaking(
    jugador?.momentosGolesRecibidosArqueroMatchmaking,
    jugador?.trackingGoalsConcededLocations
  );
}

function obtenerTramoDominanteGolesJugadorMatchmaking(jugador, tipo = 'convertidos') {
  const eventos = tipo === 'recibidos'
    ? obtenerEventosGolesRecibidosArqueroMatchmaking(jugador)
    : obtenerEventosGolesConvertidosMatchmaking(jugador);
  const desdeEventos = calcularDistribucionEventosGolMatchmaking(eventos);
  const dominanteEventos = obtenerTramoDominanteDistribucionMatchmaking(desdeEventos.distribucion, desdeEventos.total, {
    minimoTotal: 2,
    minimoCantidad: 2,
    minimoPorcentaje: tipo === 'recibidos' ? 50 : 45
  });

  if (dominanteEventos) return dominanteEventos;

  if (tipo === 'convertidos') {
    const desdePerfil = obtenerDistribucionTramosJugadorMatchmaking(jugador);
    if (desdePerfil) {
      return obtenerTramoDominanteDistribucionMatchmaking(desdePerfil.distribucion, desdePerfil.total, {
        minimoTotal: 3,
        minimoCantidad: 2,
        minimoPorcentaje: 45
      });
    }
  }

  return null;
}

function obtenerGolesPorPartidoMatchmaking(jugador) {
  const pj = Math.max(numeroSeguroMatchmaking(jugador?.pj), 0);
  return pj > 0 ? numeroSeguroMatchmaking(jugador?.goles) / pj : 0;
}

function obtenerStatsArqueroMatchmaking(jugador) {
  const pjArquero = numeroSeguroMatchmaking(jugador?.pjArquero) || (jugador?.rolPartido === ROL_PARTIDO_ARQUERO ? numeroSeguroMatchmaking(jugador?.pj) : 0);
  const atajadas = numeroSeguroMatchmaking(jugador?.atajadas);
  const golesRecibidos = numeroSeguroMatchmaking(jugador?.golesRecibidosArquero);

  return {
    pjArquero,
    atajadas,
    golesRecibidos,
    atajadasPP: pjArquero > 0 ? atajadas / pjArquero : 0,
    golesRecibidosPP: pjArquero > 0 ? golesRecibidos / pjArquero : 0,
    atajadasPorGol: golesRecibidos > 0 ? atajadas / golesRecibidos : null
  };
}

function obtenerArqueroPrincipalEquipoMatchmaking(jugadores = []) {
  return (jugadores || [])
    .filter(jugador => jugador.rolPartido === ROL_PARTIDO_ARQUERO)
    .sort((a, b) => {
      const statsA = obtenerStatsArqueroMatchmaking(a);
      const statsB = obtenerStatsArqueroMatchmaking(b);
      if (statsB.pjArquero !== statsA.pjArquero) return statsB.pjArquero - statsA.pjArquero;
      return statsB.atajadas - statsA.atajadas;
    })[0] || null;
}

function obtenerMejorGoleadorEquipoMatchmaking(jugadores = []) {
  const candidatos = (jugadores || [])
    .filter(jugador => jugador.rolPartido !== ROL_PARTIDO_ARQUERO)
    .map(jugador => {
      const goles = numeroSeguroMatchmaking(jugador.goles);
      const golesPP = obtenerGolesPorPartidoMatchmaking(jugador);
      if (goles < 3 && golesPP < 0.35) return null;
      return {
        jugador,
        goles,
        golesPP,
        tramo: obtenerTramoDominanteGolesJugadorMatchmaking(jugador, 'convertidos'),
        score: (golesPP * 100) + (goles * 2) + (numeroSeguroMatchmaking(jugador.impactoMatchmaking) * 0.2)
      };
    })
    .filter(Boolean);

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function promedioEquipoMatchmaking(jugadores = [], obtenerValor) {
  const valores = (jugadores || [])
    .map(obtenerValor)
    .map(valor => numeroFinitoMatchmaking(valor))
    .filter(valor => valor !== null && valor > 0);

  if (valores.length === 0) return { promedio: 0, cantidad: 0 };
  return {
    promedio: valores.reduce((sum, valor) => sum + valor, 0) / valores.length,
    cantidad: valores.length
  };
}

function obtenerKm40JugadorMatchmaking(jugador) {
  return numeroFinitoMatchmaking(
    jugador?.trackingDistancePer40Km
    ?? jugador?.tracking?.distance_per_40_min_km
    ?? jugador?.distance_per_40_min_km
  );
}

function obtenerPulmonJugadorMatchmaking(jugador) {
  return obtenerPulmonTrackingMatchmaking(jugador);
}

function generarNotaFisicaMatchmaking(equipo, rival, nombreRival) {
  const kmEquipo = promedioEquipoMatchmaking(equipo, obtenerKm40JugadorMatchmaking);
  const kmRival = promedioEquipoMatchmaking(rival, obtenerKm40JugadorMatchmaking);

  if (kmEquipo.cantidad >= 2 && kmRival.cantidad >= 2) {
    const diferenciaKm = kmEquipo.promedio - kmRival.promedio;
    if (Math.abs(diferenciaKm) >= 0.35) {
      return diferenciaKm > 0
        ? `Dato fisico: +${diferenciaKm.toFixed(1)} km/40 de promedio sobre ${escaparHtmlMatchmaking(nombreRival)}.`
        : `Dato fisico: ${escaparHtmlMatchmaking(nombreRival)} tiene +${Math.abs(diferenciaKm).toFixed(1)} km/40 de promedio.`;
    }
  }

  const pulmonEquipo = promedioEquipoMatchmaking(equipo, obtenerPulmonJugadorMatchmaking);
  const pulmonRival = promedioEquipoMatchmaking(rival, obtenerPulmonJugadorMatchmaking);

  if (pulmonEquipo.cantidad >= 2 && pulmonRival.cantidad >= 2) {
    const diferenciaPulmon = pulmonEquipo.promedio - pulmonRival.promedio;
    if (Math.abs(diferenciaPulmon) >= 4) {
      return diferenciaPulmon > 0
        ? `Pulmon: +${diferenciaPulmon.toFixed(1)} de promedio sobre ${escaparHtmlMatchmaking(nombreRival)}.`
        : `Pulmon: ${escaparHtmlMatchmaking(nombreRival)} tiene +${Math.abs(diferenciaPulmon).toFixed(1)} de promedio.`;
    }
  }

  return null;
}

function obtenerMejorWinratePuntualMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );

  const candidatos = [];
  (equipo || []).forEach(jugador => {
    const versus = jugador.matchmakingVersus || {};
    Object.entries(versus).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const pj = Number(stat.pj) || 0;
      const victorias = Number(stat.victorias) || 0;
      const winrate = pj > 0 ? (victorias / pj) * 100 : 0;
      if (pj < 3 || victorias < 2 || winrate < 65) return;

      candidatos.push({
        jugador,
        rival: rivalJugador,
        pj,
        victorias,
        winrate,
        score: winrate + (pj * 2)
      });
    });
  });

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function obtenerGolesEquipoPorTramoMatchmaking(equipo = []) {
  const eventos = (equipo || []).flatMap(jugador => obtenerEventosGolesConvertidosMatchmaking(jugador));
  const resumen = calcularDistribucionEventosGolMatchmaking(eventos);
  const ultimoCuarto = Number(resumen.distribucion.t45_plus) || 0;
  return {
    ...resumen,
    ultimoCuarto,
    pctUltimoCuarto: resumen.total > 0 ? (ultimoCuarto / resumen.total) * 100 : 0
  };
}

function obtenerDinamicaEquipoMatchmaking(equipo = []) {
  return (equipo || []).reduce((acc, jugador) => {
    const dinamica = jugador.matchmakingDinamica || {};
    acc.partidos += Number(dinamica.partidos) || 0;
    acc.arrancoPerdiendo += Number(dinamica.arrancoPerdiendo) || 0;
    acc.remontadasGanadas += Number(dinamica.remontadasGanadas) || 0;
    acc.empatesDesdePerdiendo += Number(dinamica.empatesDesdePerdiendo) || 0;
    acc.cagadas += Number(dinamica.cagadas) || Number(jugador.cagadasEnGol) || 0;
    return acc;
  }, {
    partidos: 0,
    arrancoPerdiendo: 0,
    remontadasGanadas: 0,
    empatesDesdePerdiendo: 0,
    cagadas: 0
  });
}

function obtenerCagadasEquipoMatchmaking(equipo = []) {
  const dinamica = obtenerDinamicaEquipoMatchmaking(equipo);
  if (dinamica.partidos > 0) {
    return {
      total: dinamica.cagadas,
      partidos: dinamica.partidos,
      porPartido: dinamica.cagadas / dinamica.partidos
    };
  }

  const total = (equipo || []).reduce((sum, jugador) => sum + (Number(jugador.cagadasEnGol) || 0), 0);
  const partidos = (equipo || []).reduce((sum, jugador) => sum + (Number(jugador.pj) || 0), 0);
  return {
    total,
    partidos,
    porPartido: partidos > 0 ? total / partidos : 0
  };
}

function generarNotaWinratePuntualMatchmaking(equipo, rival) {
  const dominio = obtenerMejorWinratePuntualMatchmaking(equipo, rival);
  if (!dominio) return null;

  return `<strong>${escaparHtmlMatchmaking(dominio.jugador.nombre)}</strong> tiene ${dominio.winrate.toFixed(0)}% de winrate sobre <strong>${escaparHtmlMatchmaking(dominio.rival.nombre)}</strong> (${dominio.victorias}/${dominio.pj} PJ).`;
}

function obtenerMejorRachaVsRivalMatchmaking(equipo = [], rival = []) {
  const rivalesPorId = new Map(
    (rival || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );

  const candidatos = [];
  (equipo || []).forEach(jugador => {
    const versus = jugador.matchmakingVersus || {};
    Object.entries(versus).forEach(([rivalId, stat]) => {
      const rivalJugador = rivalesPorId.get(String(rivalId));
      if (!rivalJugador) return;

      const racha = Number(stat.rachaVictoriasActual) || 0;
      const pj = Number(stat.pj) || 0;
      if (racha < 3 || pj < racha) return;

      candidatos.push({
        jugador,
        rival: rivalJugador,
        racha,
        pj,
        score: (racha * 10) + pj
      });
    });
  });

  return candidatos.sort((a, b) => b.score - a.score)[0] || null;
}

function generarNotaRachaVsRivalMatchmaking(equipo, rival) {
  const racha = obtenerMejorRachaVsRivalMatchmaking(equipo, rival);
  if (!racha) return null;

  return `Racha puntual: <strong>${escaparHtmlMatchmaking(racha.jugador.nombre)}</strong> trae ${racha.racha} victorias seguidas sobre <strong>${escaparHtmlMatchmaking(racha.rival.nombre)}</strong>.`;
}

function obtenerPeorWinrateParejaMatchmaking(equipo = []) {
  const jugadoresPorId = new Map(
    (equipo || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  const candidatos = [];
  const paresUsados = new Set();

  (equipo || []).forEach(jugador => {
    const juntos = jugador.matchmakingJuntos || {};
    Object.entries(juntos).forEach(([companeroId, stat]) => {
      const companero = jugadoresPorId.get(String(companeroId));
      if (!companero) return;

      const ids = [String(jugador.id), String(companero.id)].sort();
      const key = ids.join(':');
      if (paresUsados.has(key)) return;
      paresUsados.add(key);

      const pj = Number(stat.pj) || 0;
      const victorias = Number(stat.victorias) || 0;
      const winrate = pj > 0 ? (victorias / pj) * 100 : 0;
      if (pj < 3 || winrate > 35) return;

      candidatos.push({
        jugador,
        companero,
        pj,
        winrate,
        score: winrate - (pj * 1.5)
      });
    });
  });

  return candidatos.sort((a, b) => a.score - b.score)[0] || null;
}

function generarNotaParejaNegativaMatchmaking(equipo) {
  const pareja = obtenerPeorWinrateParejaMatchmaking(equipo);
  if (!pareja) return null;

  return `Advertencia dupla: <strong>${escaparHtmlMatchmaking(pareja.jugador.nombre)}</strong> y <strong>${escaparHtmlMatchmaking(pareja.companero.nombre)}</strong> tienen ${pareja.winrate.toFixed(0)}% de winrate juntos (${pareja.pj} PJ).`;
}

function generarNotaUltimoCuartoMatchmaking(equipo, rival) {
  const propio = obtenerGolesEquipoPorTramoMatchmaking(equipo);
  const rivalStats = obtenerGolesEquipoPorTramoMatchmaking(rival);

  if (propio.total < 5 || propio.ultimoCuarto < 2) return null;
  const ventajaPct = propio.pctUltimoCuarto - rivalStats.pctUltimoCuarto;
  if (propio.pctUltimoCuarto < 38 && ventajaPct < 15) return null;

  return `Cierre goleador: ${propio.pctUltimoCuarto.toFixed(0)}% de sus goles registrados fueron en el ultimo cuarto de hora.`;
}

function generarNotaRemontadaMatchmaking(equipo) {
  const dinamica = obtenerDinamicaEquipoMatchmaking(equipo);
  if (dinamica.arrancoPerdiendo < 5) return null;

  const pctVictoria = (dinamica.remontadasGanadas / dinamica.arrancoPerdiendo) * 100;
  if (pctVictoria >= 40) {
    return `Dio vuelta un partido: ${pctVictoria.toFixed(0)}% cuando recibe el primer gol.`;
  }

  if (pctVictoria <= 20) {
    return `Le cuesta darlo vuelta: ${pctVictoria.toFixed(0)}% cuando recibe el primer gol.`;
  }

  return null;
}

function generarNotaCagadasMatchmaking(equipo, rival, nombreRival) {
  const propio = obtenerCagadasEquipoMatchmaking(equipo);
  const rivalStats = obtenerCagadasEquipoMatchmaking(rival);
  if (propio.partidos < 10 || propio.porPartido < 0.18) return null;
  if (propio.porPartido < rivalStats.porPartido + 0.08 && propio.porPartido < 0.3) return null;

  if (rivalStats.porPartido <= 0) return null;

  const pctMas = ((propio.porPartido - rivalStats.porPartido) / rivalStats.porPartido) * 100;
  if (pctMas < 25 && propio.porPartido < 0.3) return null;

  return `Cagadas: ${pctMas.toFixed(0)}% mas que ${escaparHtmlMatchmaking(nombreRival)}.`;
}

function obtenerDueloGoleadorArqueroMatchmaking(equipo, arqueroRival) {
  if (!arqueroRival) return null;

  const jugadoresPorId = new Map(
    (equipo || [])
      .map(jugador => [String(jugador.id || ''), jugador])
      .filter(([id]) => id)
  );
  if (jugadoresPorId.size === 0) return null;

  const conteo = new Map();
  obtenerEventosGolesRecibidosArqueroMatchmaking(arqueroRival).forEach(evento => {
    const goleadorId = evento?.goleador_id ? String(evento.goleador_id) : '';
    if (!goleadorId || !jugadoresPorId.has(goleadorId)) return;
    conteo.set(goleadorId, (conteo.get(goleadorId) || 0) + 1);
  });

  return [...conteo.entries()]
    .map(([id, goles]) => ({ jugador: jugadoresPorId.get(id), goles }))
    .filter(item => item.goles >= 2)
    .sort((a, b) => b.goles - a.goles)[0] || null;
}

function agregarNotaAtencionMatchmaking(notas, usadas, score, html, key = html) {
  if (!html || usadas.has(key)) return;
  usadas.add(key);
  notas.push({ score, html });
}

function generarNotasAtencionEquipoMatchmaking(resultado, equipoKey) {
  const equipo = resultado?.[equipoKey]?.jugadores || [];
  const rivalKey = equipoKey === 'equipo1' ? 'equipo2' : 'equipo1';
  const rival = resultado?.[rivalKey]?.jugadores || [];
  const nombreRival = rivalKey === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
  const notas = [];
  const usadas = new Set();
  const arqueroPropio = obtenerArqueroPrincipalEquipoMatchmaking(equipo);
  const arqueroRival = obtenerArqueroPrincipalEquipoMatchmaking(rival);
  const goleadorPropio = obtenerMejorGoleadorEquipoMatchmaking(equipo);
  const goleadorRival = obtenerMejorGoleadorEquipoMatchmaking(rival);
  const duelo = obtenerDueloGoleadorArqueroMatchmaking(equipo, arqueroRival);
  const notaWinratePuntual = generarNotaWinratePuntualMatchmaking(equipo, rival);

  if (duelo && arqueroRival) {
    agregarNotaAtencionMatchmaking(
      notas,
      usadas,
      100,
      `Explotar el duelo: <strong>${escaparHtmlMatchmaking(duelo.jugador.nombre)}</strong> ya le hizo <strong>${duelo.goles}</strong> goles a <strong>${escaparHtmlMatchmaking(arqueroRival.nombre)}</strong>.`,
      `duelo:${duelo.jugador.id}:${arqueroRival.id}`
    );
  }

  agregarNotaAtencionMatchmaking(notas, usadas, 96, notaWinratePuntual, 'winrate-puntual');
  agregarNotaAtencionMatchmaking(notas, usadas, 95, generarNotaRachaVsRivalMatchmaking(equipo, rival), 'racha-vs-rival');
  agregarNotaAtencionMatchmaking(notas, usadas, 94, generarNotaParejaNegativaMatchmaking(equipo), 'pareja-negativa');
  agregarNotaAtencionMatchmaking(notas, usadas, 90, generarNotaUltimoCuartoMatchmaking(equipo, rival), 'ultimo-cuarto');
  agregarNotaAtencionMatchmaking(notas, usadas, 84, generarNotaRemontadaMatchmaking(equipo), 'remontada');
  agregarNotaAtencionMatchmaking(notas, usadas, 80, generarNotaCagadasMatchmaking(equipo, rival, nombreRival), 'cagadas');

  if (goleadorRival) {
    const nombre = escaparHtmlMatchmaking(goleadorRival.jugador.nombre);
    if (goleadorRival.tramo) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        92,
        `Cuidar a <strong>${nombre}</strong> en el tramo <strong>${goleadorRival.tramo.label}</strong>: ahi hizo el ${goleadorRival.tramo.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `rival-scorer-time:${goleadorRival.jugador.id}`
      );
    } else {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        78,
        `Cuidar a <strong>${nombre}</strong>: suma ${goleadorRival.goles} goles (${goleadorRival.golesPP.toFixed(2)}/PJ) en el historial.`,
        `rival-scorer:${goleadorRival.jugador.id}`
      );
    }
  }

  if (goleadorPropio && (!duelo || String(duelo.jugador.id) !== String(goleadorPropio.jugador.id))) {
    const nombre = escaparHtmlMatchmaking(goleadorPropio.jugador.nombre);
    if (goleadorPropio.tramo) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        88,
        `Buscar a <strong>${nombre}</strong> en el <strong>${goleadorPropio.tramo.label}</strong>: ahi hizo el ${goleadorPropio.tramo.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `own-scorer-time:${goleadorPropio.jugador.id}`
      );
    } else {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        70,
        `Buscar a <strong>${nombre}</strong>: es el mejor promedio de gol del equipo (${goleadorPropio.golesPP.toFixed(2)}/PJ).`,
        `own-scorer:${goleadorPropio.jugador.id}`
      );
    }
  }

  if (arqueroPropio) {
    const tramoRecibidos = obtenerTramoDominanteGolesJugadorMatchmaking(arqueroPropio, 'recibidos');
    const statsArquero = obtenerStatsArqueroMatchmaking(arqueroPropio);
    const nombre = escaparHtmlMatchmaking(arqueroPropio.nombre);

    if (tramoRecibidos) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        86,
        `Proteger a <strong>${nombre}</strong> en el <strong>${tramoRecibidos.label}</strong>: ahi recibio el ${tramoRecibidos.porcentaje.toFixed(0)}% de sus goles registrados.`,
        `own-keeper-time:${arqueroPropio.id}`
      );
    } else if (statsArquero.golesRecibidos >= 3 && statsArquero.atajadasPorGol !== null && statsArquero.atajadasPorGol < 1.25) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        72,
        `No exponer a <strong>${nombre}</strong>: su ratio es ${statsArquero.atajadasPorGol.toFixed(2)} atajadas por gol recibido.`,
        `own-keeper-ratio:${arqueroPropio.id}`
      );
    }
  }

  if (arqueroRival) {
    const statsRival = obtenerStatsArqueroMatchmaking(arqueroRival);
    const nombre = escaparHtmlMatchmaking(arqueroRival.nombre);
    if (statsRival.golesRecibidos >= 3 && statsRival.atajadasPorGol !== null && statsRival.atajadasPorGol < 1.25) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        82,
        `Probar al arco contra <strong>${nombre}</strong>: recibe bastante para su volumen de atajadas (${statsRival.atajadasPorGol.toFixed(2)} ataj/GR).`,
        `rival-keeper-weak:${arqueroRival.id}`
      );
    } else if (statsRival.atajadas >= 5 && statsRival.atajadasPorGol !== null && statsRival.atajadasPorGol >= 2.2) {
      agregarNotaAtencionMatchmaking(
        notas,
        usadas,
        68,
        `Elegir mejor el tiro ante <strong>${nombre}</strong>: sostiene ${statsRival.atajadasPorGol.toFixed(2)} atajadas por gol recibido.`,
        `rival-keeper-strong:${arqueroRival.id}`
      );
    }
  }

  agregarNotaAtencionMatchmaking(notas, usadas, 64, generarNotaFisicaMatchmaking(equipo, rival, nombreRival), 'fisica');

  if (notas.length === 0) {
    const statsEquipo = resultado?.[equipoKey]?.estadisticas || {};
    const statsRival = resultado?.[rivalKey]?.estadisticas || {};
    const golesFavor = numeroSeguroMatchmaking(statsEquipo.golesFavorPromedio);
    const golesRival = numeroSeguroMatchmaking(statsRival.golesFavorPromedio);
    const golesRecibidos = numeroSeguroMatchmaking(statsEquipo.golesRecibidosPromedio);
    const recibidosRival = numeroSeguroMatchmaking(statsRival.golesRecibidosPromedio);

    if (golesRecibidos > recibidosRival + 0.25) {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Cuidar perdidas y cierres: historicamente este grupo recibe mas goles por partido que el rival.', 'fallback-defense');
    } else if (golesFavor > golesRival + 0.25) {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Acelerar cuando recuperen: el equipo tiene mejor promedio historico de goles a favor.', 'fallback-attack');
    } else {
      agregarNotaAtencionMatchmaking(notas, usadas, 10, 'Partido parejo: priorizar marcas sobre los goleadores y administrar el ritmo antes de abrirse.', 'fallback-balance');
    }
  }

  return notas
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(nota => nota.html);
}

function renderizarNotasAtencionEquipoMatchmaking(resultado, equipoKey) {
  const notas = generarNotasAtencionEquipoMatchmaking(resultado, equipoKey);
  if (notas.length === 0) return '';

  return `
    <div class="matchmaking-attention">
      <div class="matchmaking-attention-title">
        A que prestar atencion
      </div>
      <ul class="matchmaking-attention-list">
        ${notas.map(nota => `
          <li>
            <span class="matchmaking-attention-icon">${iconoNotaAtencionMatchmaking(nota)}</span>
            <span>${nota}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function iconoNotaAtencionMatchmaking(nota = '') {
  const texto = String(nota).toLowerCase();
  if (texto.includes('advertencia') || texto.includes('cagadas') || texto.includes('no exponer') || texto.includes('le cuesta')) {
    return '<i class="bi bi-exclamation-triangle-fill"></i>';
  }
  if (texto.includes('racha')) return '<i class="bi bi-fire"></i>';
  if (texto.includes('winrate') || texto.includes('duelo')) return '<i class="bi bi-diagram-3-fill"></i>';
  if (texto.includes('gol') || texto.includes('tiro')) return '<i class="bi bi-bullseye"></i>';
  if (texto.includes('vuelta') || texto.includes('remont')) return '<i class="bi bi-arrow-return-right"></i>';
  if (texto.includes('fisico') || texto.includes('pulmon')) return '<i class="bi bi-heart-pulse-fill"></i>';
  return '<i class="bi bi-lightning-charge-fill"></i>';
}

// Función para mostrar los resultados
function obtenerCalculadorMatchmaking() {
  return geneticOptimizer instanceof GeneticTeamOptimizer ? geneticOptimizer : new GeneticTeamOptimizer();
}

function convertirStatsEquipoAFitnessMatchmaking(stats = {}) {
  const jugadores = Math.max(1, Number(stats.jugadores) || 0);
  return {
    rendimientoTotal: (Number(stats.rendimientoTotal) || 0) / jugadores,
    rendimientoAtaque: (Number(stats.rendimientoAtaque) || 0) / jugadores,
    rendimientoArquero: (Number(stats.rendimientoArquero) || 0) / jugadores,
    golesFavorEquipo: Number(stats.golesFavorPromedio) || 0,
    golesRecibidosEquipo: Number(stats.golesRecibidosPromedio) || 0,
    pulmonTrackingTotal: numeroSeguroMatchmaking(stats.pulmonTrackingTotal ?? stats.pulmonTotal),
    cantidadArqueros: Number(stats.cantidadArqueros) || 0
  };
}

function recalcularResultadoIntercambioMatchmaking(resultado) {
  if (!resultado?.equipo1?.jugadores || !resultado?.equipo2?.jugadores) return resultado;

  const calculador = obtenerCalculadorMatchmaking();
  resultado.equipo1.estadisticas = calculador.calcularEstadisticasEquipo(resultado.equipo1.jugadores);
  resultado.equipo2.estadisticas = calculador.calcularEstadisticasEquipo(resultado.equipo2.jugadores);
  resultado.fitness = calculador.calcularFitnessBalanceado(
    convertirStatsEquipoAFitnessMatchmaking(resultado.equipo1.estadisticas),
    convertirStatsEquipoAFitnessMatchmaking(resultado.equipo2.estadisticas)
  );

  return resultado;
}

function obtenerJugadorResultadoIntercambioMatchmaking(resultado, equipoKey, index) {
  const jugadores = resultado?.[equipoKey]?.jugadores;
  if (!Array.isArray(jugadores)) return null;
  return jugadores[Number(index)] || null;
}

window.cancelarIntercambioMatchmaking = function() {
  seleccionIntercambioMatchmaking = null;
  if (window.ultimoResultadoGenetico) {
    mostrarResultados(window.ultimoResultadoGenetico);
  }
};

window.toggleMetricasMatchmaking = function(button) {
  const root = button?.closest('.matchmaking-stats');
  if (!root) return;
  const rows = Array.from(root.querySelectorAll('[data-matchmaking-empty="true"]'));
  if (rows.length === 0) return;
  const shouldShow = rows.some(row => row.hidden);
  rows.forEach(row => {
    row.hidden = !shouldShow;
  });
  button.textContent = shouldShow
    ? 'Ocultar metricas sin datos'
    : `Ver metricas sin datos (${rows.length})`;
};

window.seleccionarJugadorIntercambioMatchmaking = function(equipoKey, index) {
  const resultado = window.ultimoResultadoGenetico;
  const equipoValido = equipoKey === 'equipo1' || equipoKey === 'equipo2';
  const jugador = equipoValido ? obtenerJugadorResultadoIntercambioMatchmaking(resultado, equipoKey, index) : null;
  if (!jugador) return;

  if (!seleccionIntercambioMatchmaking) {
    seleccionIntercambioMatchmaking = { equipoKey, index: Number(index) };
    mostrarResultados(resultado);
    return;
  }

  const seleccion = seleccionIntercambioMatchmaking;
  if (seleccion.equipoKey === equipoKey) {
    seleccionIntercambioMatchmaking =
      Number(seleccion.index) === Number(index) ? null : { equipoKey, index: Number(index) };
    mostrarResultados(resultado);
    return;
  }

  const jugadorSeleccionado = obtenerJugadorResultadoIntercambioMatchmaking(resultado, seleccion.equipoKey, seleccion.index);
  if (!jugadorSeleccionado) {
    seleccionIntercambioMatchmaking = { equipoKey, index: Number(index) };
    mostrarResultados(resultado);
    return;
  }

  const equipoOrigen = resultado[seleccion.equipoKey].jugadores;
  const equipoDestino = resultado[equipoKey].jugadores;
  equipoOrigen[Number(seleccion.index)] = jugador;
  equipoDestino[Number(index)] = jugadorSeleccionado;

  seleccionIntercambioMatchmaking = null;
  recalcularResultadoIntercambioMatchmaking(resultado);
  mostrarResultados(resultado);

  if (typeof window.showToast === 'function') {
    window.showToast('Equipos recalculados tras el intercambio', 'success');
  }
};

function renderizarEstadoIntercambioMatchmaking(resultado) {
  if (!seleccionIntercambioMatchmaking) return '';

  const jugador = obtenerJugadorResultadoIntercambioMatchmaking(
    resultado,
    seleccionIntercambioMatchmaking.equipoKey,
    seleccionIntercambioMatchmaking.index
  );
  if (!jugador) return '';

  const equipoTexto = seleccionIntercambioMatchmaking.equipoKey === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
  return `
    <div class="matchmaking-swap-status mt-3">
      <span>
        <i class="bi bi-arrow-left-right me-1"></i>
        Seleccionado: <strong>${escaparHtmlMatchmaking(jugador.nombre)}</strong>
        <small>${equipoTexto}</small>
      </span>
      <button type="button" class="btn btn-sm btn-outline-light" onclick="cancelarIntercambioMatchmaking()">
        Cancelar
      </button>
    </div>
  `;
}

function formatearNumeroMatchmaking(valor, decimales = 1, sufijo = '') {
  return `${numeroSeguroMatchmaking(valor).toFixed(decimales)}${sufijo}`;
}

function renderizarContextoMatchmaking(etiquetaBaseRendimiento) {
  return `
    <div class="matchmaking-result-mode">
      <div>
        <i class="bi bi-sliders me-2"></i>
        Base de balance: <strong>${escaparHtmlMatchmaking(etiquetaBaseRendimiento)}</strong>
      </div>
      <div class="small mt-1">Toca un jugador de cada equipo para intercambiarlos y recalcular el armado.</div>
    </div>
  `;
}

function renderizarBalanzaMatchmaking(resultado) {
  const stats1 = resultado.equipo1.estadisticas;
  const stats2 = resultado.equipo2.estadisticas;
  const impactoPct = porcentajeImpactoEquipoMatchmaking(stats1, stats2);
  return `
    <section class="matchmaking-beam">
      <div class="matchmaking-beam__scores">
        <div>
          <div class="matchmaking-beam__score" style="color:${MATCHMAKING_TEAM_THEMES.equipo1.color};">${stats1.rendimientoTotal.toFixed(1)}</div>
          <div class="matchmaking-beam__label">Equipo 1</div>
        </div>
        <div class="matchmaking-beam__center">
          <div class="matchmaking-beam__label">Rendimiento</div>
          <div class="matchmaking-beam__label" style="opacity:.62;">Matchmaking</div>
        </div>
        <div style="text-align:right;">
          <div class="matchmaking-beam__score" style="color:${MATCHMAKING_TEAM_THEMES.equipo2.color};">${stats2.rendimientoTotal.toFixed(1)}</div>
          <div class="matchmaking-beam__label">Equipo 2</div>
        </div>
      </div>
      <div class="matchmaking-beam__track">
        <div class="matchmaking-beam__side" style="width:${impactoPct.equipo1.toFixed(1)}%; background:${MATCHMAKING_TEAM_THEMES.equipo1.color};"></div>
        <div class="matchmaking-beam__side" style="width:${impactoPct.equipo2.toFixed(1)}%; background:${MATCHMAKING_TEAM_THEMES.equipo2.color};"></div>
        <div class="matchmaking-beam__mid"></div>
      </div>
      <div class="matchmaking-beam__pcts">
        <span>${impactoPct.equipo1.toFixed(1)}% del impacto</span>
        <span>${impactoPct.equipo2.toFixed(1)}% del impacto</span>
      </div>
    </section>
  `;
}

function renderizarEquipoBalanceMatchmaking(resultado, equipoKey, opciones = {}) {
  const tema = MATCHMAKING_TEAM_THEMES[equipoKey] || MATCHMAKING_TEAM_THEMES.equipo1;
  const jugadores = resultado?.[equipoKey]?.jugadores || [];
  return `
    <section class="matchmaking-team-panel" style="--team-color:${tema.color}; --team-soft:${tema.soft};">
      <header class="matchmaking-team-panel__header">
        <span class="matchmaking-team-panel__dot"></span>
        <h3>${tema.name}</h3>
        <span class="matchmaking-team-panel__sub">impacto por jugador</span>
      </header>
      <div class="matchmaking-team-players">
        ${jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, equipoKey, index, opciones)).join('')}
      </div>
      ${renderizarNotasAtencionEquipoMatchmaking(resultado, equipoKey)}
    </section>
  `;
}

function crearFilaComparativaMatchmaking(label, valor1, valor2, opciones = {}) {
  const numero1 = numeroSeguroMatchmaking(valor1);
  const numero2 = numeroSeguroMatchmaking(valor2);
  const formato = opciones.formato || ((valor) => formatearNumeroMatchmaking(valor, opciones.decimales ?? 1, opciones.sufijo || ''));
  const vacia = !opciones.siempreVisible && numero1 === 0 && numero2 === 0;
  const e1Gana = opciones.menorEsMejor ? numero1 < numero2 : numero1 > numero2;
  const e2Gana = opciones.menorEsMejor ? numero2 < numero1 : numero2 > numero1;
  return `
    <div class="matchmaking-stats__row ${vacia ? 'is-empty' : ''}" ${vacia ? 'data-matchmaking-empty="true" hidden' : ''}>
      <span class="matchmaking-stats__value matchmaking-stats__value--e1 ${e1Gana ? 'is-win' : ''}">${escaparHtmlMatchmaking(formato(numero1))}</span>
      <span class="matchmaking-stats__label">${escaparHtmlMatchmaking(label)}</span>
      <span class="matchmaking-stats__value matchmaking-stats__value--e2 ${e2Gana ? 'is-win' : ''}">${escaparHtmlMatchmaking(formato(numero2))}</span>
    </div>
  `;
}

function filasComparativaMatchmaking(resultado) {
  const e1 = resultado.equipo1.estadisticas;
  const e2 = resultado.equipo2.estadisticas;
  return [
    crearFilaComparativaMatchmaking('Rendimiento Matchmaking', e1.rendimientoTotal, e2.rendimientoTotal, { siempreVisible: true, decimales: 1 }),
    crearFilaComparativaMatchmaking('Impacto del Equipo', e1.impactoMatchmaking, e2.impactoMatchmaking, { siempreVisible: true, decimales: 1, sufijo: '%' }),
    crearFilaComparativaMatchmaking('Rendimiento Jugadores', e1.rendimientoAtaque, e2.rendimientoAtaque, { siempreVisible: true, decimales: 1 }),
    crearFilaComparativaMatchmaking('Winrate Promedio', e1.winratePromedio, e2.winratePromedio, { siempreVisible: true, decimales: 1, sufijo: '%' }),
    crearFilaComparativaMatchmaking('Goles a Favor / Partido', e1.golesFavorPromedio, e2.golesFavorPromedio, { siempreVisible: true, decimales: 2 }),
    crearFilaComparativaMatchmaking('Rendimiento Arqueros', e1.rendimientoArquero, e2.rendimientoArquero, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Arqueros', e1.cantidadArqueros, e2.cantidadArqueros, { formato: (valor) => String(Math.round(valor)) }),
    crearFilaComparativaMatchmaking('Pulmon Promedio', e1.pulmonPromedio, e2.pulmonPromedio, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Pulmon Total', e1.pulmonTrackingTotal ?? e1.pulmonTotal, e2.pulmonTrackingTotal ?? e2.pulmonTotal, { decimales: 1 }),
    crearFilaComparativaMatchmaking('Goles Recibidos / Partido', e1.golesRecibidosPromedio, e2.golesRecibidosPromedio, { decimales: 2, menorEsMejor: true })
  ];
}

function renderizarComparativaMatchmaking(resultado) {
  const filas = filasComparativaMatchmaking(resultado);
  const vacias = filas.filter(fila => fila.includes('data-matchmaking-empty="true"')).length;
  return `
    <section class="matchmaking-stats">
      <h4 class="matchmaking-stats__title">Comparativa del armado</h4>
      ${filas.join('')}
      ${vacias ? `
        <button type="button" class="matchmaking-stats__toggle" onclick="toggleMetricasMatchmaking(this)">
          Ver metricas sin datos (${vacias})
        </button>
      ` : ''}
    </section>
  `;
}

function renderizarFooterMatchmaking(resultado) {
  const stats1 = resultado.equipo1.estadisticas;
  const stats2 = resultado.equipo2.estadisticas;
  const difPulmon = Math.abs(
    numeroSeguroMatchmaking(stats1.pulmonTrackingTotal ?? stats1.pulmonTotal)
    - numeroSeguroMatchmaking(stats2.pulmonTrackingTotal ?? stats2.pulmonTotal)
  );

  return `
    <section class="matchmaking-footer">
      <div class="matchmaking-footer-grid">
        <div class="matchmaking-footer-metric">
          <small>Fitness Score</small>
          <strong>${resultado.fitness.toFixed(2)}</strong>
        </div>
        <div class="matchmaking-footer-metric">
          <small>Dif. Matchmaking</small>
          <strong>${Math.abs(stats1.rendimientoTotal - stats2.rendimientoTotal).toFixed(1)}</strong>
        </div>
        <div class="matchmaking-footer-metric">
          <small>Dif. Impacto</small>
          <strong>${Math.abs(stats1.impactoMatchmaking - stats2.impactoMatchmaking).toFixed(1)}%</strong>
        </div>
        <div class="matchmaking-footer-metric">
          <small>Dif. Goles a favor</small>
          <strong>${Math.abs(stats1.golesFavorPromedio - stats2.golesFavorPromedio).toFixed(2)}</strong>
        </div>
        <div class="matchmaking-footer-metric">
          <small>Dif. Pulmon</small>
          <strong>${difPulmon.toFixed(1)}</strong>
        </div>
      </div>
      ${mostrarRestriccionesAplicadas()}
    </section>
  `;
}

function mostrarResultados(resultado) {
  document.getElementById('progress-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'block';
  
  const container = document.getElementById('equipos-resultado');
  const configuracion = resultado.configuracionRendimiento || { modo: MODO_RENDIMIENTO_HISTORICO };
  const etiquetaBaseRendimiento = configuracion.modo === MODO_RENDIMIENTO_RECIENTE
    ? `Últimos ${configuracion.partidos || PARTIDOS_RECIENTES_DEFAULT} partidos por jugador${configuracion.temporadaId ? ' en temporada activa' : ''}`
    : 'Histórico / temporada activa';
  
  if (
    seleccionIntercambioMatchmaking &&
    !obtenerJugadorResultadoIntercambioMatchmaking(
      resultado,
      seleccionIntercambioMatchmaking.equipoKey,
      seleccionIntercambioMatchmaking.index
    )
  ) {
    seleccionIntercambioMatchmaking = null;
  }

  const jugadorClave = obtenerJugadorClaveMatchmaking(resultado);
  const maxImpacto = maxImpactoJugadoresMatchmaking(resultado);
  container.innerHTML = `
    <div class="col-12">
      <div class="matchmaking-balance-root">
        <div class="matchmaking-balance-wrap">
          <div class="matchmaking-context-stack">
            ${renderizarContextoMatchmaking(etiquetaBaseRendimiento)}
            ${renderizarNotaJugadorClaveMatchmaking(resultado)}
            ${renderizarNotaSobreRendimientoReciente(resultado)}
            ${renderizarEstadoIntercambioMatchmaking(resultado)}
          </div>
          ${renderizarBalanzaMatchmaking(resultado)}
          <div class="matchmaking-teams-grid">
            ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo1', { maxImpacto, jugadorClave })}
            ${renderizarEquipoBalanceMatchmaking(resultado, 'equipo2', { maxImpacto, jugadorClave })}
          </div>
          ${renderizarComparativaMatchmaking(resultado)}
          ${renderizarFooterMatchmaking(resultado)}
        </div>
      </div>
    </div>
  `;

  window.ultimoResultadoGenetico = resultado;
  return;

  const html = `
    <div class="col-12">
      <div class="matchmaking-result-mode rounded px-3 py-2">
        <div>
          <i class="bi bi-sliders me-2"></i>
          Base de balance: <strong>${etiquetaBaseRendimiento}</strong>
        </div>
        ${renderizarNotaJugadorClaveMatchmaking(resultado)}
        ${renderizarNotaSobreRendimientoReciente(resultado)}
        ${renderizarEstadoIntercambioMatchmaking(resultado)}
      </div>
    </div>
    <div class="col-md-6">
      <div class="team-result-card team-1">
        <h6 class="text-primary">
          <i class="bi bi-trophy me-2"></i>
          Equipo 1
        </h6>
        <div class="player-list">
          ${resultado.equipo1.jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, 'equipo1', index)).join('')}
        </div>
        ${renderizarNotasAtencionEquipoMatchmaking(resultado, 'equipo1')}
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
            <span>Pulmon Total:</span>
            <span class="fw-bold">${numeroSeguroMatchmaking(resultado.equipo1.estadisticas.pulmonTrackingTotal ?? resultado.equipo1.estadisticas.pulmonTotal).toFixed(1)}</span>
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
          ${resultado.equipo2.jugadores.map((jugador, index) => renderizarJugadorResultadoMatchmaking(jugador, 'equipo2', index)).join('')}
        </div>
        ${renderizarNotasAtencionEquipoMatchmaking(resultado, 'equipo2')}
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
            <span>Pulmon Total:</span>
            <span class="fw-bold">${numeroSeguroMatchmaking(resultado.equipo2.estadisticas.pulmonTrackingTotal ?? resultado.equipo2.estadisticas.pulmonTotal).toFixed(1)}</span>
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
            <div class="small text-light-emphasis">Dif. Pulmon</div>
            <div class="text-white fw-bold">${Math.abs(numeroSeguroMatchmaking(resultado.equipo1.estadisticas.pulmonTrackingTotal ?? resultado.equipo1.estadisticas.pulmonTotal) - numeroSeguroMatchmaking(resultado.equipo2.estadisticas.pulmonTrackingTotal ?? resultado.equipo2.estadisticas.pulmonTotal)).toFixed(1)}</div>
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
