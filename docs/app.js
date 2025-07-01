// src/app.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Cargar variables de entorno desde .env (solo para desarrollo local, en producción usar variables de entorno del build)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Crear cliente de Supabase
console.log('Configurando Supabase:', { SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? 'PRESENTE' : 'FALTANTE' });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hacer Supabase disponible globalmente para paternidades
window.supabase = supabase;
console.log('✅ Supabase asignado a window.supabase');

// Verificar que el cliente se creó correctamente
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('ERROR: Faltan credenciales de Supabase');
  alert('Error de configuración: Faltan credenciales de Supabase');
}

// --- Función principal que se ejecuta cuando el DOM está listo ---
const initApp = () => {
  // --- Selección de elementos del DOM ---
  const statsTableBody = document.getElementById('stats-table-body');
  const playerForm = document.getElementById('player-form');

  // Elementos del formulario de partido
  const btnCargarPartido = document.getElementById('btn-cargar-partido');
  const btnAddGol = document.getElementById('btn-add-gol');

  // Estado de la aplicación
  let todosLosJugadores = [];
  let todasLasPosiciones = [];
  let todasLasTemporadas = [];
  let temporadaSeleccionada = null; // null = todas las temporadas
  let filtroPartidosMinimos = 0; // filtro de partidos mínimos
  let equipo1 = [];
  let equipo2 = [];
  
  // Hacer los equipos disponibles globalmente para el tooltip y algoritmo genético
  window.equipo1 = equipo1;
  window.equipo2 = equipo2;
  window.datosJugadores = null; // Se inicializará cuando se carguen las estadísticas
  window.renderizarEquipos = renderizarEquipos; // Hacer la función disponible globalmente

  // Event listener para actualizaciones de equipos desde el algoritmo genético
  document.addEventListener('equiposActualizados', function(event) {
    console.log('Evento equiposActualizados recibido:', event.detail);
    renderizarEquipos();
  });
  let eventos = [];
  let jugadorEditando = null; // Para saber si estamos editando o agregando
  
  // Estado de ordenamiento
  let currentSortField = 'total_puntos';
  let currentSortOrder = 'desc'; // 'asc' o 'desc'
  let datosJugadores = []; // Cache de datos para ordenamiento

  // Mapeo de iconos de posiciones (se cargará dinámicamente)
  let iconosPosiciones = {};
  let nombresPosiciones = {};
  let posicionesIds = {}; // Para mapear nombre -> UUID

  // --- Sistema de notificaciones toast ---
  function showToast(message, type = 'success') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
      console.error('Toast container not found');
      return;
    }

    const toastId = 'toast-' + Date.now();
    const iconMap = {
      success: 'bi-check-circle-fill',
      error: 'bi-x-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      info: 'bi-info-circle-fill'
    };
    
    const colorMap = {
      success: 'text-bg-success',
      error: 'text-bg-danger',
      warning: 'text-bg-warning',
      info: 'text-bg-info'
    };

    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast align-items-center ${colorMap[type]} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center">
          <i class="bi ${iconMap[type]} me-2"></i>
          <strong>${message}</strong>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Inicializar y mostrar el toast de Bootstrap
    const bsToast = new bootstrap.Toast(toast, {
      autohide: true,
      delay: 4000
    });
    bsToast.show();
    
    // Limpiar el DOM después de que se oculte
    toast.addEventListener('hidden.bs.toast', () => {
      toast.remove();
    });
  }

  // --- Funciones de ordenamiento ---
  function sortData(data, field, order) {
    return [...data].sort((a, b) => {
      let aVal, bVal;
      
      if (field === 'nombre') {
        aVal = a.jugadores?.nombre || '';
        bVal = b.jugadores?.nombre || '';
        return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else if (field === 'skill') {
        // Ordenamiento especial para skill
        const calcularSkill = (jugador) => {
          const pj = jugador.pj || 1;
          const golesPP = (jugador.goles || 0) / pj;
          const mvpPP = (jugador.mvp_count || 0) / pj;
          const acePP = (jugador.ace_count || 0) / pj;
          const asistPP = (jugador.asistencias || 0) / pj;
          const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
          const puntosPP = (jugador.total_puntos || 0) / pj;
          const atajadasPP = (jugador.atajadas || 0) / pj;
          return (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2) + (atajadasPP * 1);
        };
        
        aVal = calcularSkill(a);
        bVal = calcularSkill(b);
        
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      } else {
        aVal = a[field] || 0;
        bVal = b[field] || 0;
        
        // Convertir a número si es necesario
        if (typeof aVal === 'string') aVal = parseFloat(aVal) || 0;
        if (typeof bVal === 'string') bVal = parseFloat(bVal) || 0;
        
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      }
    });
  }

  function updateSortIndicators() {
    // Remover todas las clases de ordenamiento y highlight
    document.querySelectorAll('.sortable').forEach(th => {
      th.classList.remove('active', 'asc', 'desc');
    });
    
    // Remover highlight de todas las columnas
    document.querySelectorAll('.column-highlight').forEach(cell => {
      cell.classList.remove('column-highlight');
    });
    
    // Agregar clase activa al campo actual
    const activeHeader = document.querySelector(`[data-sort="${currentSortField}"]`);
    if (activeHeader) {
      activeHeader.classList.add('active', currentSortOrder);
      
      // Agregar highlight a toda la columna
      const columnIndex = Array.from(activeHeader.parentNode.children).indexOf(activeHeader);
      highlightColumn(columnIndex);
    }
  }

  function highlightColumn(columnIndex) {
    const table = document.querySelector('.table');
    if (!table) return;
    
    // Highlight header
    const headerCell = table.querySelector(`thead tr th:nth-child(${columnIndex + 1})`);
    if (headerCell) {
      headerCell.classList.add('column-highlight');
    }
    
    // Highlight todas las celdas de la columna
    const bodyCells = table.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1})`);
    bodyCells.forEach(cell => {
      cell.classList.add('column-highlight');
    });
  }

  async function handleSort(field) {
    if (currentSortField === field) {
      // Si es el mismo campo, cambiar orden
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // Si es campo diferente, usar orden descendente por defecto
      currentSortField = field;
      currentSortOrder = field === 'nombre' ? 'asc' : 'desc';
    }
    
    await renderizarTablaOrdenada();
  }

  async function renderizarTablaOrdenada() {
    if (datosJugadores.length === 0) return;
    
    await aplicarFiltros();
  }

  // --- Lógica de carga de datos ---
  async function cargarTodosLosJugadores() {
    const { data, error } = await supabase.from('jugadores').select(`
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
    `);
    if (error) {
      console.error('Error al cargar jugadores:', error);
      showToast('Error al cargar la lista de jugadores', 'error');
      return [];
    }
    todosLosJugadores = data || [];
    return todosLosJugadores;
  }

  async function cargarTemporadas() {
    const { data, error } = await supabase.from('temporadas').select('*').order('nombre');
    if (error) {
      console.error('Error al cargar temporadas:', error);
      showToast('Error al cargar temporadas: ' + error.message, 'warning');
      // En caso de error, usar modo simple sin temporadas
      todasLasTemporadas = [];
      cargarOpcionesTemporadas();
      return [];
    }
    todasLasTemporadas = data || [];
    cargarOpcionesTemporadas();
    return todasLasTemporadas;
  }

  function cargarOpcionesTemporadas() {
    const selector = document.getElementById('selector-temporada');
    const selectorMobile = document.getElementById('selector-temporada-mobile');
    const selectorPartido = document.getElementById('temporada-partido');
    
    const selectors = [selector, selectorMobile, selectorPartido].filter(s => s);
    
    selectors.forEach(sel => {
      // Limpiar opciones existentes
      if (sel.id === 'temporada-partido') {
        // Para el selector de partido, usar texto diferente
        sel.innerHTML = '<option value="">Seleccionar temporada</option>';
      } else {
        // Para los selectores de filtro, usar "Todas las temporadas"
        sel.innerHTML = '<option value="">Todas las temporadas</option>';
      }
      
      // Agregar opciones dinámicamente
      todasLasTemporadas.forEach(temporada => {
        const option = `<option value="${temporada.id}">${temporada.nombre}</option>`;
        sel.innerHTML += option;
      });
      
      // Agregar event listener solo para los selectores de filtro (no para el de partido)
      if (sel.id !== 'temporada-partido') {
        sel.addEventListener('change', async (e) => {
          temporadaSeleccionada = e.target.value || null;
          
          // Sincronizar solo los selectores de filtro
          const selectoresFiltro = [selector, selectorMobile].filter(s => s);
          selectoresFiltro.forEach(otherSel => {
            if (otherSel !== e.target) {
              otherSel.value = e.target.value;
            }
          });
          
          // Cargar estadísticas y actualizar gráficos del armador
          await cargarEstadisticas();
          
          // Si hay jugadores en los equipos, actualizar los gráficos
          if (equipo1.length > 0 || equipo2.length > 0) {
            renderizarEquipos();
          }
        });
      }
    });
  }

  function configurarFiltroPartidos() {
    const filtroInput = document.getElementById('filtro-partidos');
    if (!filtroInput) return;
    
    // Event listener para cambio en el filtro
    filtroInput.addEventListener('input', async (e) => {
      filtroPartidosMinimos = parseInt(e.target.value) || 0;
      await aplicarFiltros();
    });
    
    // Event listener para Enter
    filtroInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        filtroPartidosMinimos = parseInt(e.target.value) || 0;
        await aplicarFiltros();
      }
    });
  }

  async function aplicarFiltros() {
    if (datosJugadores.length === 0) return;
    
    // Filtrar por partidos mínimos
    const datosFiltrados = datosJugadores.filter(jugador => 
      (jugador.pj || 0) >= filtroPartidosMinimos
    );
    
    // Aplicar ordenamiento a los datos filtrados
    const sortedData = sortData(datosFiltrados, currentSortField, currentSortOrder);
    await renderizarTablaConDatos(sortedData);
    updateSortIndicators();
  }

  async function cargarPosiciones() {
    const { data, error } = await supabase.from('posicion').select('*').order('nombre');
    if (error) {
      console.error('Error al cargar posiciones:', error);
      return [];
    }
    todasLasPosiciones = data || [];
    
    // Configurar mapeos dinámicos
    iconosPosiciones = {};
    nombresPosiciones = {};
    posicionesIds = {};
    
    data.forEach(pos => {
      const iconos = {
        'Arquero': '🥅',
        'Defensor': '🛡️', 
        'Mediocampo': '⚡',
        'Atacante': '⚽'
      };
      
      const abrev = {
        'Arquero': 'ARQ',
        'Defensor': 'DEF',
        'Mediocampo': 'MED', 
        'Atacante': 'ATA'
      };
      
      iconosPosiciones[pos.id] = iconos[pos.nombre] || '❓';
      nombresPosiciones[pos.id] = abrev[pos.nombre] || pos.nombre.substr(0, 3).toUpperCase();
      posicionesIds[pos.nombre] = pos.id;
    });
    
    return todasLasPosiciones;
  }

  async function inicializarPosiciones() {
    await cargarPosiciones();
    cargarOpcionesPosiciones();
  }

  function cargarOpcionesPosiciones() {
    const selectPrimaria = document.getElementById('posicion-primaria');
    const selectSecundaria = document.getElementById('posicion-secundaria');
    
    if (!selectPrimaria || !selectSecundaria) return;
    
    // Limpiar opciones existentes (excepto la primera)
    selectPrimaria.innerHTML = '<option value="">Seleccionar posición</option>';
    selectSecundaria.innerHTML = '<option value="">Seleccionar posición (opcional)</option>';
    
    // Agregar opciones dinámicamente
    todasLasPosiciones.forEach(pos => {
      const icono = iconosPosiciones[pos.id] || '❓';
      const nombre = nombresPosiciones[pos.id] || pos.nombre;
      const option = `<option value="${pos.id}">${icono} ${pos.nombre} (${nombre})</option>`;
      
      selectPrimaria.innerHTML += option;
      selectSecundaria.innerHTML += option;
    });
  }

  // Función para abrir modal en modo agregar
  window.abrirModalAgregar = () => {
    jugadorEditando = null;
    
    // Cambiar textos del modal
    document.getElementById('modal-title-text').textContent = 'Agregar Nuevo Jugador';
    document.getElementById('submit-text').textContent = 'Agregar Jugador';
    document.getElementById('submit-icon').className = 'bi bi-plus me-2';
    
    // Limpiar formulario
    document.getElementById('player-form').reset();
    
    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('playerModal'));
    modal.show();
  };

  // Función para abrir modal en modo editar
  window.abrirModalEditar = (jugadorId) => {
    const jugador = todosLosJugadores.find(j => j.id === jugadorId);
    if (!jugador) {
      showToast('Jugador no encontrado', 'error');
      return;
    }
    
    jugadorEditando = jugador;
    
    // Cambiar textos del modal
    document.getElementById('modal-title-text').textContent = 'Editar Jugador';
    document.getElementById('submit-text').textContent = 'Guardar Cambios';
    document.getElementById('submit-icon').className = 'bi bi-check-lg me-2';
    
    // Pre-llenar formulario
    document.getElementById('nombre').value = jugador.nombre;
    
    // Pre-seleccionar posiciones
    const posiciones = jugador.jugador_posicion || [];
    const primaria = posiciones.find(p => p.es_primaria);
    const secundaria = posiciones.find(p => !p.es_primaria);
    
    document.getElementById('posicion-primaria').value = primaria ? primaria.posicion_id : '';
    document.getElementById('posicion-secundaria').value = secundaria ? secundaria.posicion_id : '';
    
    // Pre-llenar pulmón
    document.getElementById('pulmon').value = jugador.pulmon || '';
    
    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('playerModal'));
    modal.show();
  };

  // Función para eliminar jugador
  window.eliminarJugador = async (jugadorId, nombreJugador) => {
    const confirmacion = confirm(`¿Estás seguro de que quieres eliminar a "${nombreJugador}"?\n\nEsta acción no se puede deshacer y eliminará todas las estadísticas del jugador.`);
    
    if (!confirmacion) {
      return;
    }

    try {
      // Eliminar jugador (las posiciones se eliminan automáticamente por CASCADE)
      const { error } = await supabase
        .from('jugadores')
        .delete()
        .eq('id', jugadorId);

      if (error) {
        throw error;
      }

      showToast(`${nombreJugador} ha sido eliminado exitosamente`, 'success');
      cargarEstadisticas();
      cargarTodosLosJugadores();
      
      // Remover del armado de equipos si estaba agregado
      equipo1 = equipo1.filter(j => j.id !== jugadorId);
      equipo2 = equipo2.filter(j => j.id !== jugadorId);
      window.equipo1 = equipo1; // Actualizar referencia global
      window.equipo2 = equipo2; // Actualizar referencia global
      renderizarEquipos();

    } catch (error) {
      console.error('Error al eliminar jugador:', error);
      showToast('Error al eliminar el jugador: ' + error.message, 'error');
    }
  };

  // --- Lógica de renderizado ---

  function renderizarEquipos() {
    const mostrarPosicionesJugador = (jugadorPosiciones) => {
      if (!jugadorPosiciones || jugadorPosiciones.length === 0) {
        return '<span class="small text-muted">Sin pos.</span>';
      }
      
      const primaria = jugadorPosiciones.find(jp => jp.es_primaria);
      const secundaria = jugadorPosiciones.find(jp => !jp.es_primaria);
      
      let html = '';
      if (primaria) {
        const icono = iconosPosiciones[primaria.posicion_id] || '❓';
        html += `<span class="badge bg-primary badge-sm me-1">${icono}</span>`;
      }
      if (secundaria) {
        const icono = iconosPosiciones[secundaria.posicion_id] || '❓';
        html += `<span class="badge bg-secondary badge-sm">${icono}</span>`;
      }
      
      return html;
    };

    const contarPosiciones = (equipo) => {
      const conteoPrimarias = {};
      const conteoSecundarias = {};
      
      // Inicializar conteo con todas las posiciones conocidas
      todasLasPosiciones.forEach(pos => {
        conteoPrimarias[pos.id] = 0;
        conteoSecundarias[pos.id] = 0;
      });
      
      equipo.forEach(jugador => {
        if (jugador.jugador_posicion && jugador.jugador_posicion.length > 0) {
          const primaria = jugador.jugador_posicion.find(jp => jp.es_primaria);
          const secundaria = jugador.jugador_posicion.find(jp => !jp.es_primaria);
          
          if (primaria) {
            conteoPrimarias[primaria.posicion_id] = (conteoPrimarias[primaria.posicion_id] || 0) + 1;
          }
          if (secundaria) {
            conteoSecundarias[secundaria.posicion_id] = (conteoSecundarias[secundaria.posicion_id] || 0) + 1;
          }
        }
      });
      
      return { primarias: conteoPrimarias, secundarias: conteoSecundarias };
    };

    const mostrarDistribucion = (conteos) => {
      const { primarias, secundarias } = conteos;
      let html = '<div class="mt-2 pt-2 border-top border-secondary">';
      
      // Verificar posiciones faltantes (solo si no tienen ni primaria ni secundaria)
      const posicionesFaltantes = [];
      todasLasPosiciones.forEach(pos => {
        if (primarias[pos.id] === 0 && secundarias[pos.id] === 0) {
          posicionesFaltantes.push(pos);
        }
      });
      
      // Verificar posiciones con "muchos" jugadores
      const posicionesMuchos = [];
      const limites = {
        // Arquero: máximo 1 (2+ es mucho)
        // Defensor: máximo 2 (3+ es mucho) 
        // Mediocampo: máximo 2 (3+ es mucho)
        // Atacante: máximo 2 (3+ es mucho)
      };
      
      todasLasPosiciones.forEach(pos => {
        const cantidad = primarias[pos.id];
        let esmucho = false;
        
        // Determinar si es "mucho" según la posición
        if (pos.nombre === 'Arquero' && cantidad >= 2) {
          esmucho = true;
        } else if (['Defensor', 'Mediocampo', 'Atacante'].includes(pos.nombre) && cantidad >= 3) {
          esmucho = true;
        }
        
        if (esmucho) {
          posicionesMuchos.push({ posicion: pos, cantidad });
        }
      });
      
      // Mostrar warning si faltan posiciones
      if (posicionesFaltantes.length > 0) {
        html += '<div class="alert alert-warning alert-sm mb-2 py-1 px-2" style="font-size: 0.75rem;">';
        html += '<i class="bi bi-exclamation-triangle me-1"></i>';
        html += 'Faltan: ';
        posicionesFaltantes.forEach((pos, index) => {
          const icono = iconosPosiciones[pos.id];
          html += `<span class="me-1" title="${pos.nombre}">${icono}</span>`;
          if (index < posicionesFaltantes.length - 1) html += ' ';
        });
        html += '</div>';
      }
      
      // Mostrar warning si hay "muchos" de alguna posición
      if (posicionesMuchos.length > 0) {
        html += '<div class="alert alert-danger alert-sm mb-2 py-1 px-2" style="font-size: 0.75rem;">';
        html += '<i class="bi bi-exclamation-triangle-fill me-1"></i>';
        html += 'Hay muchos: ';
        posicionesMuchos.forEach((item, index) => {
          const icono = iconosPosiciones[item.posicion.id];
          html += `<span class="me-1" title="${item.posicion.nombre} (${item.cantidad})">${icono}×${item.cantidad}</span>`;
          if (index < posicionesMuchos.length - 1) html += ' ';
        });
        html += '</div>';
      }
      
      html += '<small class="text-muted d-block mb-2">Distribución:</small>';
      
      // Ordenar posiciones por nombre lógico: Arquero, Defensor, Mediocampo, Atacante
      const posicionesOrdenadas = [...todasLasPosiciones].sort((a, b) => {
        const orden = ['Arquero', 'Defensor', 'Mediocampo', 'Atacante'];
        return orden.indexOf(a.nombre) - orden.indexOf(b.nombre);
      });
      
      // Crear contenedor de distribución con diseño más ordenado
      html += '<div class="distribucion-container p-2 rounded" style="background: rgba(15, 23, 42, 0.4); border: 1px solid rgba(255, 255, 255, 0.05);">';
      
      // Mostrar posiciones primarias en orden
      html += '<div class="d-flex flex-wrap align-items-center mb-2">';
      html += '<small class="text-muted me-2" style="min-width: 60px;">Primaria:</small>';
      posicionesOrdenadas.forEach(posicion => {
        const cantidad = primarias[posicion.id] || 0;
        if (cantidad > 0) {
          const icono = iconosPosiciones[posicion.id];
          const nombre = nombresPosiciones[posicion.id];
          html += `<div class="posicion-grupo me-3 d-flex align-items-center">`;
          for (let i = 0; i < cantidad; i++) {
            html += `<span class="posicion-icono me-1" title="${nombre}" style="font-size: 1.1rem;">${icono}</span>`;
          }
          html += `</div>`;
        }
      });
      html += '</div>';
      
      // Mostrar posiciones secundarias si existen
      const haySecundarias = Object.values(secundarias).some(cantidad => cantidad > 0);
      if (haySecundarias) {
        html += '<div class="d-flex flex-wrap align-items-center opacity-75">';
        html += '<small class="text-muted me-2" style="min-width: 60px; font-size: 0.8rem;">Secund.:</small>';
        posicionesOrdenadas.forEach(posicion => {
          const cantidad = secundarias[posicion.id] || 0;
          if (cantidad > 0) {
            const icono = iconosPosiciones[posicion.id];
            const nombre = nombresPosiciones[posicion.id];
            html += `<div class="posicion-grupo me-3 d-flex align-items-center">`;
            for (let i = 0; i < cantidad; i++) {
              html += `<span class="posicion-icono me-1" title="${nombre} (secundaria)" style="font-size: 0.95rem; opacity: 0.8;">${icono}</span>`;
            }
            html += `</div>`;
          }
        });
        html += '</div>';
      }
      
      html += '</div>';
      
      html += '</div>';
      return html;
    };

    const renderEquipo = (equipo, containerId, colorClass) => {
      const container = document.getElementById(containerId);
      const conteos = contarPosiciones(equipo);
      
      container.innerHTML = ''; // Limpiar siempre antes de renderizar

      if (equipo.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-center text-light-emphasis py-4 d-flex flex-column align-items-center justify-content-center h-100';
        emptyDiv.dataset.equipoDestino = containerId.includes('1') ? 'equipo1' : 'equipo2';
        
        // Configurar como zona de drop
        emptyDiv.addEventListener('dragover', handleDragOver);
        emptyDiv.addEventListener('drop', handleDrop);
        
        emptyDiv.innerHTML = `
          <i class="bi bi-people fs-1 text-secondary mb-3"></i>
          <p class="fw-medium mt-2 mb-1">Aún no hay jugadores.</p>
          <p class="small text-muted">Usa el campo de arriba para arrastra jugadores aquí.</p>
        `;
        
        container.appendChild(emptyDiv);
      } else {
        // Lista de jugadores
        const jugadoresDiv = document.createElement('div');
        jugadoresDiv.className = 'mb-3';
        
        equipo.forEach((jugador, index) => {
          const playerEl = document.createElement('div');
          playerEl.className = `player-item d-flex justify-content-between align-items-center p-2 mb-2 rounded`;
          playerEl.draggable = true;
          playerEl.dataset.jugadorId = jugador.id;
          playerEl.dataset.equipoOrigen = containerId.includes('1') ? 'equipo1' : 'equipo2';
          playerEl.dataset.index = index;
          
          // Agregar eventos de drag
          playerEl.addEventListener('dragstart', handleDragStart);
          playerEl.addEventListener('dragend', handleDragEnd);
          
          playerEl.innerHTML = `
            <div class="d-flex align-items-center">
              <i class="bi bi-grip-vertical text-muted me-2" style="cursor: grab;"></i>
              <span class="text-white fw-medium me-2">${jugador.nombre}</span>
              ${mostrarPosicionesJugador(jugador.jugador_posicion)}
            </div>
            <button onclick="quitarJugador('${containerId.includes('1') ? 'equipo1' : 'equipo2'}', ${index})" class="btn btn-sm btn-outline-danger">
              <i class="bi bi-x"></i>
            </button>
          `;
          jugadoresDiv.appendChild(playerEl);
        });
        
        // Configurar zona de drop
        jugadoresDiv.addEventListener('dragover', handleDragOver);
        jugadoresDiv.addEventListener('drop', handleDrop);
        jugadoresDiv.dataset.equipoDestino = containerId.includes('1') ? 'equipo1' : 'equipo2';
        
        container.appendChild(jugadoresDiv);
        
        // Distribución de posiciones
        const distribucionEl = document.createElement('div');
        distribucionEl.innerHTML = mostrarDistribucion(conteos);
        container.appendChild(distribucionEl);
      }
    };

    renderEquipo(equipo1, 'equipo1-jugadores', 'primary');
    renderEquipo(equipo2, 'equipo2-jugadores', 'danger');
    
    // Renderizar gráficos fuera de las cards
    renderizarGraficos();
    
      // Actualizar todos los selectores de jugadores en "Información del Encuentro"
      poblarSelectoresJugadores();
      
      // Renderizar tabla de goles
      renderizarTablaGoles();
    }

  function renderizarGraficos() {
    // Usar la sección HTML existente
    const analisisContainer = document.getElementById('analisis-equipos');
    const radarEquipo1Container = document.getElementById('radar-equipo1-container');
    const radarEquipo2Container = document.getElementById('radar-equipo2-container');
    
    if (!analisisContainer) return;
    
    // Solo mostrar gráficos si hay jugadores en al menos un equipo
    const hayJugadores = equipo1.length > 0 || equipo2.length > 0;
    
    if (!hayJugadores) {
      // Destruir gráficos existentes antes de ocultar
      ['chart-winrate', 'chart-goles', 'chart-atajadas', 'chart-radar-equipo1', 'chart-radar-equipo2'].forEach(chartId => {
        if (chartInstances[chartId]) {
          chartInstances[chartId].destroy();
          delete chartInstances[chartId];
        }
      });
      
      analisisContainer.style.display = 'none';
      
      // Ocultar también la sección de análisis comparativo
      const analisisComparativoContainer = document.getElementById('analisis-comparativo');
      if (analisisComparativoContainer) analisisComparativoContainer.style.display = 'none';
      
      if (radarEquipo1Container) radarEquipo1Container.style.display = 'none';
      if (radarEquipo2Container) radarEquipo2Container.style.display = 'none';
      return;
    }
    
    // Mostrar la sección de análisis central
    analisisContainer.style.display = 'block';
    
    // Manejar gráficos de radar individuales
    if (equipo1.length > 0 && radarEquipo1Container) {
      radarEquipo1Container.style.display = 'block';
    } else if (radarEquipo1Container) {
      radarEquipo1Container.style.display = 'none';
      if (chartInstances['chart-radar-equipo1']) {
        chartInstances['chart-radar-equipo1'].destroy();
        delete chartInstances['chart-radar-equipo1'];
      }
      // Ocultar también el contenedor de rendimiento
      const rendimientoEquipo1 = document.getElementById('rendimiento-equipo1');
      if (rendimientoEquipo1) rendimientoEquipo1.style.display = 'none';
    }
    
    if (equipo2.length > 0 && radarEquipo2Container) {
      radarEquipo2Container.style.display = 'block';
    } else if (radarEquipo2Container) {
      radarEquipo2Container.style.display = 'none';
      if (chartInstances['chart-radar-equipo2']) {
        chartInstances['chart-radar-equipo2'].destroy();
        delete chartInstances['chart-radar-equipo2'];
      }
      // Ocultar también el contenedor de rendimiento
      const rendimientoEquipo2 = document.getElementById('rendimiento-equipo2');
      if (rendimientoEquipo2) rendimientoEquipo2.style.display = 'none';
    }
    
    // Crear los gráficos después de que el HTML esté visible
    setTimeout(() => {
      // Gráficos separados con escalas independientes
      crearGraficosSeparados();
      
      // Análisis comparativo central
      crearAnalisisComparativo();
      
      // Gráficos de radar individuales
      if (equipo1.length > 0) {
        crearGraficoRadar('chart-radar-equipo1', equipo1);
        mostrarRendimientoEquipo('rendimiento-equipo1', equipo1, 1);
      }
      if (equipo2.length > 0) {
        crearGraficoRadar('chart-radar-equipo2', equipo2);
        mostrarRendimientoEquipo('rendimiento-equipo2', equipo2, 2);
      }
    }, 100);
  }

  // --- Funciones de Drag & Drop ---
  let jugadorArrastrado = null;

  function handleDragStart(e) {
    jugadorArrastrado = {
      id: e.target.dataset.jugadorId,
      equipoOrigen: e.target.dataset.equipoOrigen,
      index: parseInt(e.target.dataset.index)
    };
    
    // Agregar clase visual durante el arrastre
    e.target.style.opacity = '0.5';
    e.target.style.cursor = 'grabbing';
    
    // Agregar efecto visual a las zonas de drop
    const dropZones = document.querySelectorAll('[data-equipo-destino]');
    dropZones.forEach(zone => {
      if (zone.dataset.equipoDestino !== jugadorArrastrado.equipoOrigen) {
        zone.style.border = '2px dashed #6366f1';
        zone.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
      }
    });
  }

  function handleDragEnd(e) {
    // Restaurar estilo original
    e.target.style.opacity = '';
    e.target.style.cursor = 'grab';
    
    // Quitar efectos visuales de las zonas de drop
    const dropZones = document.querySelectorAll('[data-equipo-destino]');
    dropZones.forEach(zone => {
      zone.style.border = '';
      zone.style.backgroundColor = '';
    });
    
    jugadorArrastrado = null;
  }

  function handleDragOver(e) {
    e.preventDefault(); // Permitir el drop
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e) {
    e.preventDefault();
    
    if (!jugadorArrastrado) return;
    
    const equipoDestino = e.currentTarget.dataset.equipoDestino;
    const equipoOrigen = jugadorArrastrado.equipoOrigen;
    
    // No hacer nada si se suelta en el mismo equipo
    if (equipoOrigen === equipoDestino) return;
    
    // Encontrar el jugador en el equipo origen
    const equipoOrigenArray = equipoOrigen === 'equipo1' ? equipo1 : equipo2;
    const equipoDestinoArray = equipoDestino === 'equipo1' ? equipo1 : equipo2;
    
    const jugador = equipoOrigenArray.find(j => j.id === jugadorArrastrado.id);
    
    if (!jugador) return;
    
    // Verificar si el jugador ya está en el equipo destino (no debería pasar, pero por seguridad)
    const yaEstaEnDestino = equipoDestinoArray.find(j => j.id === jugador.id);
    if (yaEstaEnDestino) {
      showToast(`${jugador.nombre} ya está en este equipo`, 'warning');
      return;
    }
    
    // Remover del equipo origen
    const indexOrigen = equipoOrigenArray.findIndex(j => j.id === jugador.id);
    if (indexOrigen !== -1) {
      equipoOrigenArray.splice(indexOrigen, 1);
    }
    
    // Agregar al equipo destino
    equipoDestinoArray.push(jugador);
    
    // Actualizar referencias globales
    window.equipo1 = equipo1;
    window.equipo2 = equipo2;
    
    // Mostrar notificación
    const nombreEquipoDestino = equipoDestino === 'equipo1' ? 'Equipo 1' : 'Equipo 2';
    showToast(`${jugador.nombre} movido a ${nombreEquipoDestino}`, 'success');
    
    // Re-renderizar equipos
    renderizarEquipos();
  }

  // --- Funciones de Gráficos ---
  let chartInstances = {}; // Para almacenar instancias de gráficos y poder destruirlas

  function crearGraficosSeparados() {
    // Crear cinco gráficos separados con escalas apropiadas
    crearGraficoWinrate();
    crearGraficoGoles();
    crearGraficoAtajadas();
    crearGraficoRendimiento();
    crearGraficoPulmon();
  }

  function crearGraficoWinrate() {
    const chartId = 'chart-winrate';
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    // Destruir gráfico existente si existe
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
    }
    
    // Calcular estadísticas de ambos equipos
    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);
    
    // Preparar datasets solo para equipos que tienen jugadores
    const datasets = [];
    
    if (equipo1.length > 0) {
      datasets.push({
        label: `🔵 Equipo 1`,
        data: [parseFloat(statsEquipo1.winrate.toFixed(1))],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        barThickness: equipo2.length > 0 ? 45 : 55
      });
    }
    
    if (equipo2.length > 0) {
      datasets.push({
        label: `🔴 Equipo 2`,
        data: [parseFloat(statsEquipo2.winrate.toFixed(1))],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        barThickness: equipo1.length > 0 ? 45 : 55
      });
    }
    
    chartInstances[chartId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Winrate'],
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 10 },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: 'white',
            bodyColor: 'white',
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y}%`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100, // Escala fija para winrate
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)',
              font: { size: 10 },
              callback: function(value) {
                return value + '%';
              }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 11, weight: 'bold' }
            }
          }
        }
      }
    });
  }

  function crearGraficoGoles() {
    const chartId = 'chart-goles';
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    // Destruir gráfico existente si existe
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
    }
    
    // Calcular estadísticas de ambos equipos
    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);
    
    // Preparar datasets solo para equipos que tienen jugadores
    const datasets = [];
    const maxGoles = Math.max(statsEquipo1.golesPorPartido, statsEquipo2.golesPorPartido);
    
    if (equipo1.length > 0) {
      datasets.push({
        label: `🔵 Equipo 1`,
        data: [parseFloat(statsEquipo1.golesPorPartido.toFixed(2))],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        barThickness: equipo2.length > 0 ? 45 : 55
      });
    }
    
    if (equipo2.length > 0) {
      datasets.push({
        label: `🔴 Equipo 2`,
        data: [parseFloat(statsEquipo2.golesPorPartido.toFixed(2))],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        barThickness: equipo1.length > 0 ? 45 : 55
      });
    }

    chartInstances[chartId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Goles/Partido'],
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: 'top',
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 10 },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: 'white',
            bodyColor: 'white',
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} goles/partido`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: Math.max(maxGoles * 1.2, 2), // Escala dinámica con margen
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: {
              color: 'rgba(255, 255, 255, 0.8)',
              font: { size: 10 }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 11, weight: 'bold' }
            }
          }
        }
      }
    });
  }

  function crearGraficoAtajadas() {
    const chartId = 'chart-atajadas';
    const ctx = document.getElementById(chartId);
    if (!ctx) return;

    // Destruir gráfico existente si existe
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
    }
    
    // Calcular estadísticas de ambos equipos
    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);
    
    // Preparar datasets solo para equipos que tienen jugadores
    const datasets = [];
    const maxAtajadas = Math.max(statsEquipo1.atajadasPorPartido, statsEquipo2.atajadasPorPartido);
    
    if (equipo1.length > 0) {
      datasets.push({
        label: `🔵 Equipo 1`,
        data: [parseFloat(statsEquipo1.atajadasPorPartido.toFixed(2))],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        barThickness: equipo2.length > 0 ? 45 : 55
      });
    }
    
    if (equipo2.length > 0) {
      datasets.push({
        label: `🔴 Equipo 2`,
        data: [parseFloat(statsEquipo2.atajadasPorPartido.toFixed(2))],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        barThickness: equipo1.length > 0 ? 45 : 55
      });
    }
      
      chartInstances[chartId] = new Chart(ctx, {
      type: 'bar',
        data: {
        labels: ['Atajadas/Partido'],
        datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
            display: datasets.length > 1,
            position: 'top',
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 10 },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: 'white',
            bodyColor: 'white',
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} atajadas/partido`;
              }
            }
            }
          },
          scales: {
          y: {
              beginAtZero: true,
            max: Math.max(maxAtajadas * 1.2, 2), // Escala dinámica con margen
            grid: { color: 'rgba(255, 255, 255, 0.1)' },
            ticks: {
                color: 'rgba(255, 255, 255, 0.8)',
              font: { size: 10 }
                }
              },
          x: {
            grid: { display: false },
              ticks: {
              color: 'rgba(255, 255, 255, 0.9)',
              font: { size: 11, weight: 'bold' }
              }
            }
          }
        }
      });
  }

  function crearAnalisisComparativo() {
    // Solo mostrar análisis si ambos equipos tienen jugadores
    const analisisContainer = document.getElementById('analisis-comparativo');
    const puntosContainer = document.getElementById('puntos-comparativos');
    
    if (!analisisContainer || !puntosContainer) return;
    
    if (equipo1.length === 0 || equipo2.length === 0) {
      analisisContainer.style.display = 'none';
      return;
    }

    // Mostrar la sección
    analisisContainer.style.display = 'block';
    
    // Calcular estadísticas de ambos equipos
    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);
    
    // Calcular diferencias
    const difWinrate = statsEquipo1.winrate - statsEquipo2.winrate;
    const difGoles = statsEquipo1.golesPorPartido - statsEquipo2.golesPorPartido;
    const difAtajadas = statsEquipo1.atajadasPorPartido - statsEquipo2.atajadasPorPartido;
    const difCagadas = statsEquipo1.cagadasPorPartido - statsEquipo2.cagadasPorPartido;
    
    // Generar puntos de análisis
    const puntos = [];
    
    // Análisis de Winrate
    if (Math.abs(difWinrate) > 5) { // Diferencia significativa
      if (difWinrate > 15) {
        puntos.push({
          icon: '🔥',
          tipo: 'advantage-team1',
          titulo: 'Dominio total en experiencia ganadora',
          descripcion: `El Equipo 1 tiene una ventaja abrumadora en winrate (${difWinrate.toFixed(1)} puntos porcentuales). Su experiencia en partidos ganados podría ser decisiva.`,
          stats: `Equipo 1: ${statsEquipo1.winrate.toFixed(1)}% | Equipo 2: ${statsEquipo2.winrate.toFixed(1)}%`
        });
      } else if (difWinrate > 0) {
        puntos.push({
          icon: '💪',
          tipo: 'advantage-team1',
          titulo: 'Ventaja en experiencia',
          descripcion: `El Equipo 1 tiene mejor historial de victorias (+${difWinrate.toFixed(1)}%). Su mentalidad ganadora puede ser clave en momentos decisivos.`,
          stats: `Equipo 1: ${statsEquipo1.winrate.toFixed(1)}% | Equipo 2: ${statsEquipo2.winrate.toFixed(1)}%`
        });
      } else if (difWinrate < -15) {
        puntos.push({
          icon: '🔥',
          tipo: 'advantage-team2',
          titulo: 'Dominio total en experiencia ganadora',
          descripcion: `El Equipo 2 tiene una ventaja abrumadora en winrate (+${Math.abs(difWinrate).toFixed(1)} puntos porcentuales). Su experiencia en partidos ganados podría ser decisiva.`,
          stats: `Equipo 1: ${statsEquipo1.winrate.toFixed(1)}% | Equipo 2: ${statsEquipo2.winrate.toFixed(1)}%`
        });
      } else {
        puntos.push({
          icon: '💪',
          tipo: 'advantage-team2',
          titulo: 'Ventaja en experiencia',
          descripcion: `El Equipo 2 tiene mejor historial de victorias (+${Math.abs(difWinrate).toFixed(1)}%). Su mentalidad ganadora puede ser clave en momentos decisivos.`,
          stats: `Equipo 1: ${statsEquipo1.winrate.toFixed(1)}% | Equipo 2: ${statsEquipo2.winrate.toFixed(1)}%`
        });
      }
    } else {
      puntos.push({
        icon: '⚖️',
        tipo: 'balanced',
        titulo: 'Experiencia pareja',
        descripcion: `Ambos equipos tienen winrates similares (diferencia de ${Math.abs(difWinrate).toFixed(1)}%). El partido podría definirse por detalles.`,
        stats: `Equipo 1: ${statsEquipo1.winrate.toFixed(1)}% | Equipo 2: ${statsEquipo2.winrate.toFixed(1)}%`
      });
    }
    
    // Análisis de Goles
    if (Math.abs(difGoles) > 0.3) { // Diferencia significativa
      if (difGoles > 0.8) {
        puntos.push({
          icon: '⚽',
          tipo: 'advantage-team1',
          titulo: 'Supremacía ofensiva clara',
          descripcion: `El Equipo 1 tiene un poder goleador muy superior (+${difGoles.toFixed(2)} goles/partido). Esperá una lluvia de goles de este lado.`,
          stats: `Equipo 1: ${statsEquipo1.golesPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.golesPorPartido.toFixed(2)} goles/partido`
        });
      } else if (difGoles > 0) {
        puntos.push({
          icon: '🎯',
          tipo: 'advantage-team1',
          titulo: 'Mayor potencial ofensivo',
          descripcion: `El Equipo 1 promedia más goles por partido (+${difGoles.toFixed(2)}). Su ataque podría hacer la diferencia.`,
          stats: `Equipo 1: ${statsEquipo1.golesPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.golesPorPartido.toFixed(2)} goles/partido`
        });
      } else if (difGoles < -0.8) {
        puntos.push({
          icon: '⚽',
          tipo: 'advantage-team2',
          titulo: 'Supremacía ofensiva clara',
          descripcion: `El Equipo 2 tiene un poder goleador muy superior (+${Math.abs(difGoles).toFixed(2)} goles/partido). Esperá una lluvia de goles de este lado.`,
          stats: `Equipo 1: ${statsEquipo1.golesPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.golesPorPartido.toFixed(2)} goles/partido`
        });
      } else {
        puntos.push({
          icon: '🎯',
          tipo: 'advantage-team2',
          titulo: 'Mayor potencial ofensivo',
          descripcion: `El Equipo 2 promedia más goles por partido (+${Math.abs(difGoles).toFixed(2)}). Su ataque podría hacer la diferencia.`,
          stats: `Equipo 1: ${statsEquipo1.golesPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.golesPorPartido.toFixed(2)} goles/partido`
        });
      }
    } else {
      puntos.push({
        icon: '🤝',
        tipo: 'balanced',
        titulo: 'Ataque equilibrado',
        descripcion: `Ambos equipos tienen potencial goleador similar (diferencia de ${Math.abs(difGoles).toFixed(2)}). Partido abierto garantizado.`,
        stats: `Equipo 1: ${statsEquipo1.golesPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.golesPorPartido.toFixed(2)} goles/partido`
      });
    }
    
    // Análisis de Atajadas
    if (Math.abs(difAtajadas) > 0.5) { // Diferencia significativa
      if (difAtajadas > 1.0) {
        puntos.push({
          icon: '🥅',
          tipo: 'advantage-team1',
          titulo: 'Muralla defensiva',
          descripcion: `El Equipo 1 tiene arqueros con mucha más experiencia (+${difAtajadas.toFixed(2)} atajadas/partido). Será difícil hacerles gol.`,
          stats: `Equipo 1: ${statsEquipo1.atajadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.atajadasPorPartido.toFixed(2)} atajadas/partido`
        });
      } else if (difAtajadas > 0) {
        puntos.push({
          icon: '🛡️',
          tipo: 'advantage-team1',
          titulo: 'Ventaja bajo los palos',
          descripcion: `El Equipo 1 cuenta con arqueros más experimentados (+${difAtajadas.toFixed(2)} atajadas/partido). Factor clave en partidos cerrados.`,
          stats: `Equipo 1: ${statsEquipo1.atajadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.atajadasPorPartido.toFixed(2)} atajadas/partido`
        });
      } else if (difAtajadas < -1.0) {
        puntos.push({
          icon: '🥅',
          tipo: 'advantage-team2',
          titulo: 'Muralla defensiva',
          descripcion: `El Equipo 2 tiene arqueros con mucha más experiencia (+${Math.abs(difAtajadas).toFixed(2)} atajadas/partido). Será difícil hacerles gol.`,
          stats: `Equipo 1: ${statsEquipo1.atajadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.atajadasPorPartido.toFixed(2)} atajadas/partido`
        });
      } else {
        puntos.push({
          icon: '🛡️',
          tipo: 'advantage-team2',
          titulo: 'Ventaja bajo los palos',
          descripcion: `El Equipo 2 cuenta con arqueros más experimentados (+${Math.abs(difAtajadas).toFixed(2)} atajadas/partido). Factor clave en partidos cerrados.`,
          stats: `Equipo 1: ${statsEquipo1.atajadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.atajadasPorPartido.toFixed(2)} atajadas/partido`
        });
      }
    } else {
      puntos.push({
        icon: '🥊',
        tipo: 'balanced',
        titulo: 'Duelo parejo bajo los palos',
        descripcion: `Ambos equipos tienen nivel arquero similar (diferencia de ${Math.abs(difAtajadas).toFixed(2)}). Los goles vendrán por mérito propio.`,
        stats: `Equipo 1: ${statsEquipo1.atajadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.atajadasPorPartido.toFixed(2)} atajadas/partido`
      });
    }
    
    // Análisis de Cagadas (menos es mejor)
    if (Math.abs(difCagadas) > 0.3) { // Diferencia significativa
      if (difCagadas > 0) {
        puntos.push({
          icon: '🚨',
          tipo: 'advantage-team2',
          titulo: 'Ventaja defensiva importante',
          descripcion: `El Equipo 2 es mucho más sólido defensivamente con ${Math.abs(difCagadas).toFixed(2)} cagadas menos por partido. Menos errores que pueden costar goles.`,
          stats: `Equipo 1: ${statsEquipo1.cagadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.cagadasPorPartido.toFixed(2)} cagadas/partido`
        });
      } else {
        puntos.push({
          icon: '🚨',
          tipo: 'advantage-team1',
          titulo: 'Ventaja defensiva importante',
          descripcion: `El Equipo 1 es mucho más sólido defensivamente con ${Math.abs(difCagadas).toFixed(2)} cagadas menos por partido. Menos errores que pueden costar goles.`,
          stats: `Equipo 1: ${statsEquipo1.cagadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.cagadasPorPartido.toFixed(2)} cagadas/partido`
        });
      }
    } else if (Math.abs(difCagadas) > 0.1) {
      if (difCagadas > 0) {
        puntos.push({
          icon: '⚠️',
          tipo: 'advantage-team2',
          titulo: 'Ligera ventaja en solidez',
          descripcion: `El Equipo 2 es ligeramente más sólido defensivamente con ${Math.abs(difCagadas).toFixed(2)} cagadas menos por partido. Podría ser clave en un partido cerrado.`,
          stats: `Equipo 1: ${statsEquipo1.cagadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.cagadasPorPartido.toFixed(2)} cagadas/partido`
        });
      } else {
        puntos.push({
          icon: '⚠️',
          tipo: 'advantage-team1',
          titulo: 'Ligera ventaja en solidez',
          descripcion: `El Equipo 1 es ligeramente más sólido defensivamente con ${Math.abs(difCagadas).toFixed(2)} cagadas menos por partido. Podría ser clave en un partido cerrado.`,
          stats: `Equipo 1: ${statsEquipo1.cagadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.cagadasPorPartido.toFixed(2)} cagadas/partido`
        });
      }
    } else {
      puntos.push({
        icon: '🛡️',
        tipo: 'balanced',
        titulo: 'Solidez defensiva pareja',
        descripcion: `Ambos equipos tienen una solidez defensiva similar (diferencia de ${Math.abs(difCagadas).toFixed(2)}). Los errores no serán un factor decisivo.`,
        stats: `Equipo 1: ${statsEquipo1.cagadasPorPartido.toFixed(2)} | Equipo 2: ${statsEquipo2.cagadasPorPartido.toFixed(2)} cagadas/partido`
      });
    }
    
    // Análisis de Rendimiento
    const difRendimiento = statsEquipo1.rendimientoTotal - statsEquipo2.rendimientoTotal;
    if (Math.abs(difRendimiento) > 15) { // Diferencia significativa
      if (difRendimiento > 30) {
        puntos.push({
          icon: '⚡',
          tipo: 'advantage-team1',
          titulo: 'Supremacía total en rendimiento',
          descripcion: `El Equipo 1 tiene un rendimiento abrumadoramente superior (+${difRendimiento.toFixed(1)} puntos). Su nivel general debería dominar el partido.`,
          stats: `Equipo 1: ${statsEquipo1.rendimientoTotal.toFixed(1)} | Equipo 2: ${statsEquipo2.rendimientoTotal.toFixed(1)} puntos`
        });
      } else if (difRendimiento > 0) {
        puntos.push({
          icon: '📈',
          tipo: 'advantage-team1',
          titulo: 'Ventaja clara en rendimiento',
          descripcion: `El Equipo 1 tiene mejor rendimiento general (+${difRendimiento.toFixed(1)} puntos). Su nivel técnico puede hacer la diferencia.`,
          stats: `Equipo 1: ${statsEquipo1.rendimientoTotal.toFixed(1)} | Equipo 2: ${statsEquipo2.rendimientoTotal.toFixed(1)} puntos`
        });
      } else if (difRendimiento < -30) {
        puntos.push({
          icon: '⚡',
          tipo: 'advantage-team2',
          titulo: 'Supremacía total en rendimiento',
          descripcion: `El Equipo 2 tiene un rendimiento abrumadoramente superior (+${Math.abs(difRendimiento).toFixed(1)} puntos). Su nivel general debería dominar el partido.`,
          stats: `Equipo 1: ${statsEquipo1.rendimientoTotal.toFixed(1)} | Equipo 2: ${statsEquipo2.rendimientoTotal.toFixed(1)} puntos`
        });
      } else {
        puntos.push({
          icon: '📈',
          tipo: 'advantage-team2',
          titulo: 'Ventaja clara en rendimiento',
          descripcion: `El Equipo 2 tiene mejor rendimiento general (+${Math.abs(difRendimiento).toFixed(1)} puntos). Su nivel técnico puede hacer la diferencia.`,
          stats: `Equipo 1: ${statsEquipo1.rendimientoTotal.toFixed(1)} | Equipo 2: ${statsEquipo2.rendimientoTotal.toFixed(1)} puntos`
        });
      }
    } else {
      puntos.push({
        icon: '⚽',
        tipo: 'balanced',
        titulo: 'Rendimiento equilibrado',
        descripcion: `Ambos equipos tienen rendimiento general similar (diferencia de ${Math.abs(difRendimiento).toFixed(1)}). Se espera un partido muy parejo.`,
        stats: `Equipo 1: ${statsEquipo1.rendimientoTotal.toFixed(1)} | Equipo 2: ${statsEquipo2.rendimientoTotal.toFixed(1)} puntos`
      });
    }
    
    // Análisis de Pulmón
    const difPulmon = statsEquipo1.pulmonPromedio - statsEquipo2.pulmonPromedio;
    if (Math.abs(difPulmon) > 0.8) { // Diferencia significativa
      if (difPulmon > 1.5) {
        puntos.push({
          icon: '🫁',
          tipo: 'advantage-team1',
          titulo: 'Superioridad física abrumadora',
          descripcion: `El Equipo 1 tiene mucha más resistencia física (+${difPulmon.toFixed(1)} puntos). Esperá que dominen los tiempos largos del partido.`,
          stats: `Equipo 1: ${statsEquipo1.pulmonPromedio.toFixed(1)} | Equipo 2: ${statsEquipo2.pulmonPromedio.toFixed(1)} pulmón`
        });
      } else if (difPulmon > 0) {
        puntos.push({
          icon: '💨',
          tipo: 'advantage-team1',
          titulo: 'Ventaja en resistencia física',
          descripcion: `El Equipo 1 tiene mejor condición física (+${difPulmon.toFixed(1)} puntos). Pueden rendir mejor en los últimos minutos.`,
          stats: `Equipo 1: ${statsEquipo1.pulmonPromedio.toFixed(1)} | Equipo 2: ${statsEquipo2.pulmonPromedio.toFixed(1)} pulmón`
        });
      } else if (difPulmon < -1.5) {
        puntos.push({
          icon: '🫁',
          tipo: 'advantage-team2',
          titulo: 'Superioridad física abrumadora',
          descripcion: `El Equipo 2 tiene mucha más resistencia física (+${Math.abs(difPulmon).toFixed(1)} puntos). Esperá que dominen los tiempos largos del partido.`,
          stats: `Equipo 1: ${statsEquipo1.pulmonPromedio.toFixed(1)} | Equipo 2: ${statsEquipo2.pulmonPromedio.toFixed(1)} pulmón`
        });
      } else {
        puntos.push({
          icon: '💨',
          tipo: 'advantage-team2',
          titulo: 'Ventaja en resistencia física',
          descripcion: `El Equipo 2 tiene mejor condición física (+${Math.abs(difPulmon).toFixed(1)} puntos). Pueden rendir mejor en los últimos minutos.`,
          stats: `Equipo 1: ${statsEquipo1.pulmonPromedio.toFixed(1)} | Equipo 2: ${statsEquipo2.pulmonPromedio.toFixed(1)} pulmón`
        });
      }
    } else {
      puntos.push({
        icon: '🏃',
        tipo: 'balanced',
        titulo: 'Condición física pareja',
        descripcion: `Ambos equipos tienen similar resistencia física (diferencia de ${Math.abs(difPulmon).toFixed(1)}). El cansancio no será un factor decisivo.`,
        stats: `Equipo 1: ${statsEquipo1.pulmonPromedio.toFixed(1)} | Equipo 2: ${statsEquipo2.pulmonPromedio.toFixed(1)} pulmón`
      });
    }
    
    // Generar HTML
    puntosContainer.innerHTML = puntos.map(punto => `
      <div class="analysis-point ${punto.tipo}">
        <div class="analysis-icon">${punto.icon}</div>
        <div class="analysis-content">
          <div class="analysis-title">${punto.titulo}</div>
          <div class="analysis-description">${punto.descripcion}</div>
          <div class="analysis-stats">${punto.stats}</div>
        </div>
      </div>
    `).join('');
  }

  function crearGraficoRendimiento() {
    const canvas = document.getElementById('chart-rendimiento');
    if (!canvas) return;

    // Destruir gráfico existente si existe
    if (chartInstances['chart-rendimiento']) {
      chartInstances['chart-rendimiento'].destroy();
    }

    const ctx = canvas.getContext('2d');

    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);

    const datasets = [];

    if (equipo1.length > 0) {
      datasets.push({
        label: `🔵 Equipo 1`,
        data: [parseFloat(statsEquipo1.rendimientoTotal.toFixed(1))],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        barThickness: equipo2.length > 0 ? 45 : 55
      });
    }

    if (equipo2.length > 0) {
      datasets.push({
        label: `🔴 Equipo 2`,
        data: [parseFloat(statsEquipo2.rendimientoTotal.toFixed(1))],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        barThickness: equipo1.length > 0 ? 45 : 55
      });
    }

    if (datasets.length === 0) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';

    chartInstances['chart-rendimiento'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Rendimiento Total'],
        datasets: datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: equipo1.length > 0 && equipo2.length > 0,
            position: 'bottom',
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: 'white',
            bodyColor: 'white',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.x.toFixed(1)} puntos`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)',
              callback: function(value) {
                return value.toFixed(0) + ' pts';
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)'
            }
          }
        }
      }
    });
  }

  function crearGraficoPulmon() {
    const canvas = document.getElementById('chart-pulmon');
    if (!canvas) return;

    // Destruir gráfico existente si existe
    if (chartInstances['chart-pulmon']) {
      chartInstances['chart-pulmon'].destroy();
    }

    const ctx = canvas.getContext('2d');

    const statsEquipo1 = calcularEstadisticasEquipo(equipo1);
    const statsEquipo2 = calcularEstadisticasEquipo(equipo2);

    const datasets = [];

    if (equipo1.length > 0 && statsEquipo1.pulmonPromedio > 0) {
      datasets.push({
        label: `🔵 Equipo 1`,
        data: [parseFloat(statsEquipo1.pulmonPromedio.toFixed(1))],
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        barThickness: equipo2.length > 0 ? 45 : 55
      });
    }

    if (equipo2.length > 0 && statsEquipo2.pulmonPromedio > 0) {
      datasets.push({
        label: `🔴 Equipo 2`,
        data: [parseFloat(statsEquipo2.pulmonPromedio.toFixed(1))],
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        barThickness: equipo1.length > 0 ? 45 : 55
      });
    }

    if (datasets.length === 0) {
      canvas.style.display = 'none';
      return;
    }

    canvas.style.display = 'block';

    chartInstances['chart-pulmon'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pulmón Promedio'],
        datasets: datasets
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: equipo1.length > 0 && equipo2.length > 0,
            position: 'bottom',
            labels: {
              color: 'rgba(255, 255, 255, 0.9)',
              usePointStyle: true
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: 'white',
            bodyColor: 'white',
            borderColor: 'rgba(255, 255, 255, 0.2)',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.x.toFixed(1)}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 10,
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)',
              callback: function(value) {
                return value + '/10';
              }
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.9)'
            }
          }
        }
      }
    });
  }

  // Función global para cerrar el análisis comparativo
  window.cerrarAnalisisComparativo = function() {
    const analisisContainer = document.getElementById('analisis-comparativo');
    if (analisisContainer) {
      analisisContainer.style.display = 'none';
    }
  };

  // Función para mostrar el rendimiento del equipo debajo del radar
  function mostrarRendimientoEquipo(containerId, equipo, equipoNum) {
    const container = document.getElementById(containerId);
    if (!container || !equipo || equipo.length === 0) {
      if (container) container.style.display = 'none';
      return;
    }

    let rendimientoTotal = 0;
    let rendimientoAtaqueTotal = 0;
    let rendimientoArqueroTotal = 0;
    
    equipo.forEach(jugador => {
      const pj = jugador.pj || 1;
      
      // Rendimiento Ataque: (Goles P/P * 5) + (MVP P/P * 7) + (ACE P/P * 6) + (Asist P/P * 4) - (Cagadas P/P * 5) + (Puntos P/P * 2)
      const golesPP = (jugador.goles || 0) / pj;
      const mvpPP = (jugador.mvp_count || 0) / pj;
      const acePP = (jugador.ace_count || 0) / pj;
      const asistPP = (jugador.asistencias || 0) / pj;
      const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
      const puntosPP = (jugador.total_puntos || 0) / pj;
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
      
      // Rendimiento Arquero: atajadas por partido * 1
      const atajadasPP = (jugador.atajadas || 0) / pj;
      const rendArquero = atajadasPP * 1;
      
      rendimientoAtaqueTotal += rendAtaque;
      rendimientoArqueroTotal += rendArquero;
    });
    
    rendimientoTotal = rendimientoAtaqueTotal + rendimientoArqueroTotal;
    
    const colorClass = equipoNum === 1 ? 'primary' : 'danger';
    
    container.innerHTML = `
      <div class="fw-bold text-${colorClass} mb-2 small">
        📈 Rendimiento Total Equipo ${equipoNum}
      </div>
      <div class="row g-2 small">
        <div class="col-12">
          <div class="d-flex justify-content-between">
            <span>🎯 <strong>Rendimiento Total:</strong></span>
            <span class="text-white fw-bold">${rendimientoTotal.toFixed(1)} pts</span>
          </div>
        </div>
        <div class="col-12">
          <div class="d-flex justify-content-between">
            <span>⚔️ Rendimiento Ataque:</span>
            <span>${rendimientoAtaqueTotal.toFixed(1)} pts</span>
          </div>
        </div>
        <div class="col-12">
          <div class="d-flex justify-content-between">
            <span>🥅 Rendimiento Arquero:</span>
            <span>${rendimientoArqueroTotal.toFixed(1)} pts</span>
          </div>
        </div>
        <div class="col-12 mt-1">
          <div class="text-light-emphasis text-center small">
            <em>${equipo.length} jugador(es) en el equipo</em>
          </div>
        </div>
      </div>
    `;
    
    container.style.display = 'block';
  }

  function calcularEstadisticasEquipo(equipo) {
    if (equipo.length === 0) {
      return {
        winrate: 0,
        golesPorPartido: 0,
        atajadasPorPartido: 0,
        cagadasPorPartido: 0,
        rendimientoTotal: 0,
        pulmonPromedio: 0
      };
    }

    // Función para obtener estadísticas por temporada (igual que en radar)
    const obtenerEstadisticasPorTemporada = (jugador) => {
      const temporadaSeleccionada = document.getElementById('selector-temporada')?.value || 
                                   document.getElementById('selector-temporada-mobile')?.value || '';
      
      // Si no hay temporada seleccionada, usar estadísticas globales
      if (!temporadaSeleccionada || temporadaSeleccionada === '') {
        return {
          pj: jugador.pj || 0,
          winrate: jugador.winrate || 0,
          goles: jugador.goles || 0,
          asistencias: jugador.asistencias || 0,
          atajadas: jugador.atajadas || 0,
          cagadas_en_gol: jugador.cagadas_en_gol || 0,
          mvp_count: jugador.mvp_count || 0,
          ace_count: jugador.ace_count || 0,
          total_puntos: jugador.total_puntos || 0
        };
      }
      
      // Buscar las estadísticas del jugador para la temporada seleccionada
      const estadisticasTemporada = window.datosJugadores?.find(dj => 
        dj.jugadores?.id === jugador.id || dj.id === jugador.id
      );
      
      if (estadisticasTemporada) {
        return {
          pj: estadisticasTemporada.pj || 0,
          winrate: estadisticasTemporada.winrate || 0,
          goles: estadisticasTemporada.goles || 0,
          asistencias: estadisticasTemporada.asistencias || 0,
          atajadas: estadisticasTemporada.atajadas || 0,
          cagadas_en_gol: estadisticasTemporada.cagadas_en_gol || 0,
          mvp_count: estadisticasTemporada.mvp_count || 0,
          ace_count: estadisticasTemporada.ace_count || 0,
          total_puntos: estadisticasTemporada.total_puntos || 0
        };
      } else {
        // No se encontraron estadísticas para esta temporada, usar 0s
        return {
          pj: 0,
          winrate: 0,
          goles: 0,
          asistencias: 0,
          atajadas: 0,
          cagadas_en_gol: 0,
          mvp_count: 0,
          ace_count: 0,
          total_puntos: 0
        };
      }
    };

    let totalWinrate = 0;
    let totalGoles = 0;
    let totalAtajadas = 0;
    let totalCagadas = 0;
    let totalPartidos = 0;
    let jugadoresConDatos = 0;
    
    // Nuevas métricas
    let rendimientoTotalEquipo = 0;
    let totalPulmon = 0;
    let jugadoresConPulmon = 0;

    equipo.forEach(jugador => {
      // Usar estadísticas filtradas por temporada
      const stats = obtenerEstadisticasPorTemporada(jugador);
      
      if (stats.winrate !== null && stats.winrate !== undefined) {
        totalWinrate += stats.winrate;
        jugadoresConDatos++;
      }
      if (stats.goles !== null && stats.goles !== undefined) {
        totalGoles += stats.goles;
      }
      if (stats.atajadas !== null && stats.atajadas !== undefined) {
        totalAtajadas += stats.atajadas;
      }
      if (stats.cagadas_en_gol !== null && stats.cagadas_en_gol !== undefined) {
        totalCagadas += stats.cagadas_en_gol;
      }
      if (stats.pj !== null && stats.pj !== undefined) {
        totalPartidos += stats.pj;
      }
      
      // Calcular rendimiento de cada jugador usando stats de temporada
      const pj = stats.pj || 1;
      const golesPP = stats.goles / pj;
      const mvpPP = stats.mvp_count / pj;
      const acePP = stats.ace_count / pj;
      const asistPP = stats.asistencias / pj;
      const cagadasPP = stats.cagadas_en_gol / pj;
      const puntosPP = stats.total_puntos / pj;
      const atajadasPP = stats.atajadas / pj;
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
      const rendArquero = atajadasPP * 1;
      
      rendimientoTotalEquipo += rendAtaque + rendArquero;
      
      // Pulmón - revisar en múltiples ubicaciones posibles (usar datos originales del jugador)
      let pulmonJugador = null;
      if (jugador.pulmon !== null && jugador.pulmon !== undefined) {
        pulmonJugador = jugador.pulmon;
      } else if (jugador.jugadores?.pulmon !== null && jugador.jugadores?.pulmon !== undefined) {
        pulmonJugador = jugador.jugadores.pulmon;
      }
      
      if (pulmonJugador !== null) {
        totalPulmon += pulmonJugador;
        jugadoresConPulmon++;
      }
    });

    const winratePromedio = jugadoresConDatos > 0 ? totalWinrate / jugadoresConDatos : 0;
    const golesPorPartido = totalPartidos > 0 ? totalGoles / totalPartidos : 0;
    const atajadasPorPartido = totalPartidos > 0 ? totalAtajadas / totalPartidos : 0;
    const cagadasPorPartido = totalPartidos > 0 ? totalCagadas / totalPartidos : 0;
    const pulmonPromedio = jugadoresConPulmon > 0 ? totalPulmon / jugadoresConPulmon : 0;

    return {
      winrate: winratePromedio,
      golesPorPartido: golesPorPartido,
      atajadasPorPartido: atajadasPorPartido,
      cagadasPorPartido: cagadasPorPartido,
      rendimientoTotal: rendimientoTotalEquipo,
      pulmonPromedio: pulmonPromedio
    };
  }

  function crearGraficoRadar(chartId, equipo) {
    console.log('🕷️ Creando gráfico radar:', chartId, 'con equipo:', equipo);
    
    const ctx = document.getElementById(chartId);
    if (!ctx) {
      console.error('❌ No se encontró el canvas:', chartId);
      return;
    }

    console.log('✅ Canvas encontrado:', ctx);

    // Destruir gráfico existente si existe
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
      console.log('🗑️ Gráfico anterior destruido');
    }

    // NUEVA FUNCIÓN: Obtener estadísticas filtradas por temporada
    const obtenerEstadisticasPorTemporada = (jugador) => {
      const temporadaSeleccionada = document.getElementById('selector-temporada')?.value || 
                                   document.getElementById('selector-temporada-mobile')?.value || '';
      
      console.log('🏆 Obteniendo estadísticas para temporada:', temporadaSeleccionada, 'jugador:', jugador.nombre);
      
      // Si no hay temporada seleccionada, usar estadísticas globales
      if (!temporadaSeleccionada || temporadaSeleccionada === '') {
        console.log('📊 Usando estadísticas globales para', jugador.nombre);
        return {
          pj: jugador.pj || 0,
          winrate: jugador.winrate || 0,
          goles: jugador.goles || 0,
          asistencias: jugador.asistencias || 0,
          atajadas: jugador.atajadas || 0,
          cagadas_en_gol: jugador.cagadas_en_gol || 0,
          mvp_count: jugador.mvp_count || 0,
          ace_count: jugador.ace_count || 0,
          total_puntos: jugador.total_puntos || 0
        };
      }
      
      // Buscar las estadísticas del jugador para la temporada seleccionada
      const estadisticasTemporada = window.datosJugadores?.find(dj => 
        dj.jugadores?.id === jugador.id || dj.id === jugador.id
      );
      
      if (estadisticasTemporada) {
        console.log('📈 Estadísticas de temporada encontradas para', jugador.nombre, ':', estadisticasTemporada);
        return {
          pj: estadisticasTemporada.pj || 0,
          winrate: estadisticasTemporada.winrate || 0,
          goles: estadisticasTemporada.goles || 0,
          asistencias: estadisticasTemporada.asistencias || 0,
          atajadas: estadisticasTemporada.atajadas || 0,
          cagadas_en_gol: estadisticasTemporada.cagadas_en_gol || 0,
          mvp_count: estadisticasTemporada.mvp_count || 0,
          ace_count: estadisticasTemporada.ace_count || 0,
          total_puntos: estadisticasTemporada.total_puntos || 0
        };
      } else {
        console.log('⚠️ No se encontraron estadísticas de temporada para', jugador.nombre, ', usando 0s');
        // No se encontraron estadísticas para esta temporada, usar 0s
        return {
          pj: 0,
          winrate: 0,
          goles: 0,
          asistencias: 0,
          atajadas: 0,
          cagadas_en_gol: 0,
          mvp_count: 0,
          ace_count: 0,
          total_puntos: 0
        };
      }
    };

    // Función para verificar si un jugador puede jugar en una posición (primaria o secundaria)
    const puedeJugarEn = (jugador, posicion) => {
      if (!jugador.jugador_posicion) return false;
      return jugador.jugador_posicion.some(jp => jp.posicion.nombre === posicion);
    };

    // Función para obtener la posición primaria de un jugador
    const obtenerPosicionPrimaria = (jugador) => {
      if (!jugador.jugador_posicion) return null;
      const primaria = jugador.jugador_posicion.find(jp => jp.es_primaria);
      return primaria ? primaria.posicion.nombre : null;
    };

    // Filtrar jugadores con un mínimo de partidos para estadísticas más significativas (usar estadísticas de temporada)
    const jugadoresConMinPartidos = equipo.filter(j => {
      const stats = obtenerEstadisticasPorTemporada(j);
      return stats.pj >= 1; // Mínimo más bajo para radar, pero usar estadísticas de temporada
    });

        // NUEVA LÓGICA COMPLEJA: Separar jugadores principales vs contribuyentes
    
    // Arqueros: Solo los que pueden jugar de arquero (por posición)
    const arqueros = jugadoresConMinPartidos.filter(j => puedeJugarEn(j, 'Arquero')); 
    
    // DEFENSOR COMPLEJO: Principales (primarios) + Secundarios (65% contribución)
    const defensoresPrincipales = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Defensor');
    const defensoresSecundarios = jugadoresConMinPartidos.filter(j => 
      obtenerPosicionPrimaria(j) !== 'Defensor' && puedeJugarEn(j, 'Defensor')
    ); 
    
    // MEDIOCAMPO COMPLEJO: Principales (primarios) + Secundarios (65% contribución)
    const mediocampistasPrincipales = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Mediocampo');
    const mediocampistasSecundarios = jugadoresConMinPartidos.filter(j => 
      obtenerPosicionPrimaria(j) !== 'Mediocampo' && puedeJugarEn(j, 'Mediocampo')
    );
    
    // ATAQUE COMPLEJO: Principales (atacantes main) + Todos los que contribuyen ofensivamente  
    const atacantesPrincipales = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Atacante');
    const contribuyentesOfensivos = jugadoresConMinPartidos.filter(j => {
      const stats = obtenerEstadisticasPorTemporada(j);
      const tieneGoles = stats.goles > 0;
      const tieneAsistencias = stats.asistencias > 0;
      return tieneGoles || tieneAsistencias; // Cualquiera que contribuya ofensivamente
    });
    
    // Variables globales para ataque ponderado
    const atacantesPrincipalesCompleto = [
      ...atacantesPrincipales,
      ...mediocampistasPrincipales, 
      ...mediocampistasSecundarios
    ].filter(jugador => {
      const stats = obtenerEstadisticasPorTemporada(jugador);
      const tieneGoles = stats.goles > 0;
      const tieneAsistencias = stats.asistencias > 0;
      return tieneGoles || tieneAsistencias; // Solo los que contribuyen ofensivamente
    });
    
    const contribuyentesResto = contribuyentesOfensivos.filter(jugador => {
      const posicionPrimaria = obtenerPosicionPrimaria(jugador);
      const puedeJugarMedio = puedeJugarEn(jugador, 'Mediocampo');
      // Excluir atacantes y mediocampistas (primarios y secundarios)
      return posicionPrimaria !== 'Atacante' && posicionPrimaria !== 'Mediocampo' && !puedeJugarMedio;
    });

    console.log('👥 Distribución de jugadores por contribución:', {
      arqueros: arqueros.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} (${stats.atajadas} atajadas)`;
      }),
      defensoresPrincipales: defensoresPrincipales.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} Main (${stats.winrate}% wr)`;
      }),
      defensoresSecundarios: defensoresSecundarios.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} 65% (${stats.winrate}% wr)`;
      }),
      mediocampistasPrincipales: mediocampistasPrincipales.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} Main (${stats.goles}G + ${stats.asistencias}A)`;
      }),
      mediocampistasSecundarios: mediocampistasSecundarios.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} 65% (${stats.goles}G + ${stats.asistencias}A)`;
      }),
      atacantesPrincipales: atacantesPrincipales.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} Main (${stats.goles}G + ${stats.asistencias}A)`;
      }),
      atacantesPrincipalesCompleto: atacantesPrincipalesCompleto.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} 80% (${stats.goles}G + ${stats.asistencias}A)`;
      }),
      contribuyentesResto: contribuyentesResto.map(j => {
        const stats = obtenerEstadisticasPorTemporada(j);
        return `${j.nombre} 20% (${stats.goles}G + ${stats.asistencias}A)`;
      })
    });

    // === NUEVA FUNCIÓN DE PUNTUACIÓN COMPLEJA ===
    function calcularPuntuacionCompleja() {
      const resultados = {
        arquero: 0,
        defensor: 0, 
        mediocampo: 0,
        ataque: 0
      };
      
      // === ARQUERO PONDERADO (80% mejor arquero, 20% resto) ===
      if (arqueros.length > 0) {
        // Calcular puntuación de cada arquero usando estadísticas de temporada
        const puntuacionesArqueros = arqueros.map(jugador => {
          const stats = obtenerEstadisticasPorTemporada(jugador);
          const pj = stats.pj || 1;
          const winrate = stats.winrate || 0;
          const atajadasPorPartido = stats.atajadas / pj;
          return {
            jugador,
            puntuacion: winrate * 0.4 + atajadasPorPartido * 25
          };
        });
        
        // Ordenar por puntuación descendente
        puntuacionesArqueros.sort((a, b) => b.puntuacion - a.puntuacion);
        
        if (arqueros.length === 1) {
          // Si solo hay un arquero, usar su puntuación completa
          resultados.arquero = puntuacionesArqueros[0].puntuacion;
        } else {
          // El mejor arquero tiene 80% de peso
          const mejorArquero = puntuacionesArqueros[0].puntuacion;
          
          // El resto tiene 20% de peso promediado
          const restoPuntuacion = puntuacionesArqueros.slice(1)
            .reduce((sum, a) => sum + a.puntuacion, 0) / (arqueros.length - 1);
          
          resultados.arquero = mejorArquero * 0.8 + restoPuntuacion * 0.2;
        }
      }
      
      // === DEFENSOR COMPLEJO (con penalización por cagadas) ===
      let puntuacionDefensor = 0;
      let contadorDefensor = 0;
      
      // Principales (100% contribución)
      defensoresPrincipales.forEach(jugador => {
        const stats = obtenerEstadisticasPorTemporada(jugador);
        const pj = stats.pj || 1;
        const winrate = stats.winrate || 0;
        const cagadasPorPartido = stats.cagadas_en_gol / pj;
        const puntuacion = winrate - (cagadasPorPartido * 10);
        puntuacionDefensor += puntuacion;
        contadorDefensor += 1;
      });
      
      // Secundarios (65% contribución)
      defensoresSecundarios.forEach(jugador => {
        const stats = obtenerEstadisticasPorTemporada(jugador);
        const pj = stats.pj || 1;
        const winrate = stats.winrate || 0;
        const cagadasPorPartido = stats.cagadas_en_gol / pj;
        const puntuacion = winrate - (cagadasPorPartido * 10);
        puntuacionDefensor += puntuacion * 0.65; // 65% de contribución
        contadorDefensor += 0.65; // También el denominador se ajusta
      });
      
      if (contadorDefensor > 0) {
        resultados.defensor = Math.max(0, puntuacionDefensor / contadorDefensor);
      }
      
      // === MEDIOCAMPO COMPLEJO ===
      let puntuacionMediocampo = 0;
      let contadorMediocampo = 0;
      
      // Principales (100% contribución)
      mediocampistasPrincipales.forEach(jugador => {
        const stats = obtenerEstadisticasPorTemporada(jugador);
        const pj = stats.pj || 1;
        const golesPorPartido = stats.goles / pj;
        const asistPorPartido = stats.asistencias / pj;
        const winrate = stats.winrate || 0;
        const puntuacion = (golesPorPartido + asistPorPartido) * 24 + winrate * 0.7; // Winrate pesa 70%
        puntuacionMediocampo += puntuacion;
        contadorMediocampo += 1;
      });
      
      // Secundarios (65% contribución)
      mediocampistasSecundarios.forEach(jugador => {
        const stats = obtenerEstadisticasPorTemporada(jugador);
        const pj = stats.pj || 1;
        const golesPorPartido = stats.goles / pj;
        const asistPorPartido = stats.asistencias / pj;
        const winrate = stats.winrate || 0;
        const puntuacion = (golesPorPartido + asistPorPartido) * 24 + winrate * 0.7; // Winrate pesa 70%
        puntuacionMediocampo += puntuacion * 0.65; // 65% de contribución
        contadorMediocampo += 0.65; // También el denominador se ajusta
      });
      
      if (contadorMediocampo > 0) {
        resultados.mediocampo = puntuacionMediocampo / contadorMediocampo;
      }
      
      // === ATAQUE PONDERADO (80% principales, 20% resto) ===
      
      // Calcular puntuación promedio de principales
      let puntuacionPrincipales = 0;
      if (atacantesPrincipalesCompleto.length > 0) {
        atacantesPrincipalesCompleto.forEach(jugador => {
          const stats = obtenerEstadisticasPorTemporada(jugador);
          const pj = stats.pj || 1;
          const golesPorPartido = stats.goles / pj;
          const asistPorPartido = stats.asistencias / pj;
          const winrate = stats.winrate || 0;
          puntuacionPrincipales += (golesPorPartido + asistPorPartido) * 27 + winrate * 1.0;
        });
        puntuacionPrincipales = puntuacionPrincipales / atacantesPrincipalesCompleto.length;
      }
      
      // Calcular puntuación promedio de contribuyentes
      let puntuacionContribuyentes = 0;
      if (contribuyentesResto.length > 0) {
        contribuyentesResto.forEach(jugador => {
          const stats = obtenerEstadisticasPorTemporada(jugador);
          const pj = stats.pj || 1;
          const golesAsistPorPartido = (stats.goles + stats.asistencias) / pj;
          const winrate = stats.winrate || 0;
          puntuacionContribuyentes += golesAsistPorPartido * 18 + winrate * 0.5; // Fórmula reducida para no principales
        });
        puntuacionContribuyentes = puntuacionContribuyentes / contribuyentesResto.length;
      }
      
      // Aplicar ponderación 80/20
      if (atacantesPrincipalesCompleto.length > 0 && contribuyentesResto.length > 0) {
        resultados.ataque = puntuacionPrincipales * 0.8 + puntuacionContribuyentes * 0.2;
      } else if (atacantesPrincipalesCompleto.length > 0) {
        // Solo principales
        resultados.ataque = puntuacionPrincipales;
      } else if (contribuyentesResto.length > 0) {
        // Solo contribuyentes (caso raro)
        resultados.ataque = puntuacionContribuyentes;
      }
      
      return resultados;
    }

    // Calcular scores usando la nueva función compleja
    const scores = calcularPuntuacionCompleja();
    const scoreArquero = scores.arquero;
    const scoreDefensor = scores.defensor;
    const scoreMediocampo = scores.mediocampo;
    const scoreAtacante = scores.ataque;

    console.log('📊 Scores calculados para gráfico radar:', {
      chartId: chartId,
      temporadaSeleccionada: document.getElementById('selector-temporada')?.value || 'Todas',
      totalJugadores: equipo.length,
      jugadoresConMinPartidos: jugadoresConMinPartidos.length,
      scores: {
        arquero: scoreArquero,
        defensor: scoreDefensor,
        mediocampo: scoreMediocampo,
        atacante: scoreAtacante
      },
      windowDatosJugadores: window.datosJugadores ? window.datosJugadores.length : 'No disponible'
    });

    // MÁXIMOS TEÓRICOS REALISTAS para normalización absoluta (por EQUIPO promedio)
    const maximos = {
      // Arquero: winrate 100% + 20 atajadas por partido = (100 * 0.4) + (20 * 25) = 540
      // (20 atajadas/partido = 100%, 12 atajadas ≈ 70%) - Ponderado 80/20
      arquero: 540,
      // Defensor: winrate 100% - 0 cagadas = 100 (perfecto sin cagadas)
      defensor: 100,
      // Mediocampo: Ajustado para que metox (5.6 G+A como secundario) sea 80%
      mediocampo: 145,
      // Atacante: Ajustado para que metox (5.6 G+A + 85% WR) sea 80% → 240 puntos máximo
      atacante: 240
    };

    // Normalizar cada score a escala 0-100 usando sus máximos teóricos
    const labels = ['Arquero', 'Defensor', 'Mediocampo', 'Atacante'];
    const data = [
      Math.min((scoreArquero / maximos.arquero) * 100, 100),
      Math.min((scoreDefensor / maximos.defensor) * 100, 100),
      Math.min((scoreMediocampo / maximos.mediocampo) * 100, 100),
      Math.min((scoreAtacante / maximos.atacante) * 100, 100)
    ];

    console.log('📈 Datos normalizados del gráfico:', { 
      labels, 
      data, 
      maximos,
      porcentajes: {
        arquero: `${data[0].toFixed(1)}%`,
        defensor: `${data[1].toFixed(1)}%`,
        mediocampo: `${data[2].toFixed(1)}%`,
        atacante: `${data[3].toFixed(1)}%`
      }
    });

    // Determinar color basado en el equipo
    const isEquipo1 = chartId.includes('equipo1');
    const color = isEquipo1 ? '59, 130, 246' : '239, 68, 68'; // Azul para equipo1, rojo para equipo2

    try {
    chartInstances[chartId] = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [{
            label: 'Rendimiento por Posición',
          data: data,
            backgroundColor: `rgba(${color}, 0.2)`,
            borderColor: `rgba(${color}, 1)`,
            pointBackgroundColor: `rgba(${color}, 1)`,
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: `rgba(${color}, 1)`,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              titleColor: 'white',
              bodyColor: 'white',
              borderColor: 'rgba(255, 255, 255, 0.2)',
              borderWidth: 1,
              callbacks: {
                label: function(context) {
                  const posicion = context.label;
                  let info = '';
                  
                  if (posicion === 'Arquero') {
                    info = `${arqueros.length} jugador(es)`;
                  } else if (posicion === 'Defensor') {
                    info = `${defensoresPrincipales.length} main + ${defensoresSecundarios.length} sec`;
                  } else if (posicion === 'Mediocampo') {
                    info = `${mediocampistasPrincipales.length} main + ${mediocampistasSecundarios.length} sec`;
                  } else if (posicion === 'Atacante') {
                    info = `${atacantesPrincipalesCompleto.length} principales 80% + ${contribuyentesResto.length} resto 20%`;
                  }
                  
                  return [`${posicion}: ${context.parsed.r.toFixed(1)}`, info];
                }
              }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            grid: {
                color: 'rgba(255, 255, 255, 0.1)'
            },
            pointLabels: {
                color: 'rgba(255, 255, 255, 0.9)',
              font: {
                  size: 10,
                  weight: 'bold'
              }
            },
            ticks: {
                display: false,
                stepSize: 20
            }
          }
        }
      }
    });

      console.log('✅ Gráfico radar creado exitosamente:', chartId);
      
    } catch (error) {
      console.error('❌ Error creando gráfico radar:', error);
    }
  }


  
  // Función para renderizar la tabla de goles (usando el HTML existente)
  function renderizarTablaGoles() {
    const tablaGoles = document.getElementById('tabla-goles');
    if (!tablaGoles) return;

    if (eventos.length === 0) {
      tablaGoles.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-3">
            <i class="bi bi-plus-circle me-2"></i>
            No se han registrado goles aún
          </td>
        </tr>
      `;
      return;
    }

    tablaGoles.innerHTML = eventos.map((evento, index) => {
      const goleador = todosLosJugadores.find(j => j.id == evento.goleador_id)?.nombre || 'N/A';
      const asistencia = evento.asistencia_id === 'nadie' ? 'Sin asistencia' : 
                        (todosLosJugadores.find(j => j.id == evento.asistencia_id)?.nombre || 'N/A');
      
      return `
        <tr>
          <td><span class="fw-bold">${goleador}</span></td>
          <td>${asistencia}</td>
          <td>
            <span class="badge ${evento.equipo === 1 ? 'bg-primary' : 'bg-danger'}">
              ${evento.equipo === 1 ? '🔵 Equipo 1' : '🔴 Equipo 2'}
            </span>
          </td>
          <td>
            <span class="badge bg-success">
              <i class="bi bi-check me-1"></i>Normal
            </span>
          </td>
          <td>
            <button onclick="quitarEvento(${index})" class="btn btn-sm btn-outline-danger">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
    // Actualizar marcador visual después de renderizar la tabla
    actualizarMarcadorAutomatico();
  }


  // Función para poblar todos los selectores de jugadores en "Información del Encuentro"
  function poblarSelectoresJugadores() {
    // Solo usar jugadores de los equipos armados
    const jugadoresDelPartido = [...equipo1, ...equipo2];
    
    // Lista de todos los selectores de jugadores
    const selectores = [
      { id: 'goleador', placeholder: 'Seleccionar goleador' },
      { id: 'asistencia', placeholder: 'Seleccionar asistencia', extraOption: '<option value="nadie">Nadie</option>' },
      { id: 'mvp-partido', placeholder: 'Seleccionar MVP' },
      { id: 'ace-partido', placeholder: 'Seleccionar ACE' }
    ];

    if (jugadoresDelPartido.length === 0) {
      console.log('No hay jugadores en los equipos armados, limpiando selectores');
      
      // Limpiar todos los selectores si no hay jugadores
      selectores.forEach(({ id, placeholder, extraOption }) => {
        const selector = document.getElementById(id);
        if (selector) {
          selector.innerHTML = `<option value="">${placeholder}</option>`;
          if (extraOption) {
            selector.innerHTML += extraOption;
          }
        }
      });
      
      // Limpiar también selectores dinámicos
      const selectoresAtajadas = document.querySelectorAll('.atajadas-jugador');
      selectoresAtajadas.forEach(selector => {
        selector.innerHTML = '<option value="">Seleccionar jugador</option>';
      });
      
      const selectoresCagadas = document.querySelectorAll('.cagadas-jugador');
      selectoresCagadas.forEach(selector => {
        selector.innerHTML = '<option value="">Seleccionar jugador</option>';
      });
      
      return;
    }

    selectores.forEach(({ id, placeholder, extraOption }) => {
      const selector = document.getElementById(id);
      if (selector) {
        selector.innerHTML = `<option value="">${placeholder}</option>`;
        if (extraOption) {
          selector.innerHTML += extraOption;
        }
        
        jugadoresDelPartido.forEach(jugador => {
          const option = `<option value="${jugador.id}">${jugador.nombre}</option>`;
          selector.innerHTML += option;
        });
      }
    });

    // Poblar también los selectores dinámicos de atajadas y cagadas
    poblarSelectoresDinamicos();
    
    // Ocultar campo de equipo del gol ya que se detecta automáticamente
    ocultarCampoEquipoGol();
    
    // Inicializar selectores buscables solo la primera vez, luego solo actualizar
    const wrappers = document.querySelectorAll('.searchable-wrapper');
    if (wrappers.length === 0) {
      initializeSearchableSelects();
    } else {
      updateSearchableSelects();
    }
  }

  function poblarSelectoresDinamicos() {
    // Solo usar jugadores de los equipos armados
    const jugadoresDelPartido = [...equipo1, ...equipo2];
    
    if (jugadoresDelPartido.length === 0) return;

    // Atajadas
    const selectoresAtajadas = document.querySelectorAll('.atajadas-jugador');
    selectoresAtajadas.forEach(selector => {
      const valorActual = selector.value;
      selector.innerHTML = '<option value="">Seleccionar jugador</option>';
      
      jugadoresDelPartido.forEach(jugador => {
        const option = document.createElement('option');
        option.value = jugador.id;
        option.textContent = jugador.nombre;
        if (valorActual === jugador.id) {
          option.selected = true;
        }
        selector.appendChild(option);
      });
    });

    // Cagadas
    const selectoresCagadas = document.querySelectorAll('.cagadas-jugador');
    selectoresCagadas.forEach(selector => {
      const valorActual = selector.value;
      selector.innerHTML = '<option value="">Seleccionar jugador</option>';
      
      jugadoresDelPartido.forEach(jugador => {
        const option = document.createElement('option');
        option.value = jugador.id;
        option.textContent = jugador.nombre;
        if (valorActual === jugador.id) {
          option.selected = true;
        }
        selector.appendChild(option);
      });
    });
    
    // Ocultar campo de equipo del gol ya que se detecta automáticamente
    ocultarCampoEquipoGol();
  }

  // Funciones para agregar/eliminar filas dinámicas
  window.agregarAtajada = function() {
    const container = document.getElementById('atajadas-container');
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'atajadas-row row g-2 mb-2';
    
    nuevaFila.innerHTML = `
      <div class="col-8">
        <select class="form-select form-select-sm atajadas-jugador">
          <option value="">Seleccionar jugador</option>
        </select>
      </div>
      <div class="col-3">
        <input type="number" class="form-control form-control-sm atajadas-cantidad" placeholder="0" min="0">
      </div>
      <div class="col-1">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarAtajada(this)">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `;
    
    container.appendChild(nuevaFila);
    poblarSelectoresDinamicos(); // Poblar el nuevo selector
  };

  window.eliminarAtajada = function(button) {
    const fila = button.closest('.atajadas-row');
    if (fila && document.querySelectorAll('.atajadas-row').length > 1) {
      fila.remove();
    }
  };

  window.agregarCagada = function() {
    const container = document.getElementById('cagadas-container');
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'cagadas-row row g-2 mb-2';
    
    nuevaFila.innerHTML = `
      <div class="col-8">
        <select class="form-select form-select-sm cagadas-jugador">
          <option value="">Seleccionar jugador</option>
        </select>
      </div>
      <div class="col-3">
        <input type="number" class="form-control form-control-sm cagadas-cantidad" placeholder="0" min="0">
      </div>
      <div class="col-1">
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarCagada(this)">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `;
    
    container.appendChild(nuevaFila);
    poblarSelectoresDinamicos(); // Poblar el nuevo selector
  };

  window.eliminarCagada = function(button) {
    const fila = button.closest('.cagadas-row');
    if (fila && document.querySelectorAll('.cagadas-row').length > 1) {
      fila.remove();
    }
  };

  // --- Lógica de negocio ---
  
  window.quitarJugador = (equipo, index) => {
      if (equipo === 'equipo1') {
          const jugadorRemovido = equipo1[index];
          equipo1.splice(index, 1);
          window.equipo1 = equipo1; // Actualizar referencia global
          showToast(`${jugadorRemovido.nombre} removido del Equipo 1`, 'info');
      } else {
          const jugadorRemovido = equipo2[index];
          equipo2.splice(index, 1);
          window.equipo2 = equipo2; // Actualizar referencia global
          showToast(`${jugadorRemovido.nombre} removido del Equipo 2`, 'info');
      }
      renderizarEquipos();
  };

  window.quitarEvento = (index) => {
      eventos.splice(index, 1);
      renderizarTablaGoles();
      actualizarMarcadorAutomatico();
  }

  // Función para ocultar el campo equipo del gol
  function ocultarCampoEquipoGol() {
      const equipoGolContainer = document.getElementById('equipo-gol')?.closest('.col-md-2');
      if (equipoGolContainer) {
          equipoGolContainer.style.display = 'none';
      }
  }

  // Función para actualizar el selector de ACE basándose en el equipo ganador
  window.actualizarSelectACE = function() {
      const equipoGanadorSelect = document.getElementById('equipo-ganador');
      const aceSelect = document.getElementById('ace-partido');
      
      if (!equipoGanadorSelect || !aceSelect) return;
      
      const equipoGanador = equipoGanadorSelect.value;
      
      // Limpiar selector de ACE
      aceSelect.innerHTML = '<option value="">Seleccionar ACE</option>';
      
      // Si no hay equipo ganador seleccionado o es empate, mostrar todos los jugadores
      if (!equipoGanador || equipoGanador === '0') {
          const todosLosJugadores = [...equipo1, ...equipo2];
          todosLosJugadores.forEach(jugador => {
              const option = document.createElement('option');
              option.value = jugador.id;
              option.textContent = jugador.nombre;
              aceSelect.appendChild(option);
          });
          return;
      }
      
      // Determinar el equipo perdedor (ACE viene del equipo perdedor)
      let equipoPerdedor = [];
      if (equipoGanador === '1') {
          // Equipo 1 ganó, ACE viene del equipo 2
          equipoPerdedor = equipo2;
      } else if (equipoGanador === '2') {
          // Equipo 2 ganó, ACE viene del equipo 1
          equipoPerdedor = equipo1;
      }
      
      // Poblar selector con jugadores del equipo perdedor
      equipoPerdedor.forEach(jugador => {
          const option = document.createElement('option');
          option.value = jugador.id;
          option.textContent = jugador.nombre;
          aceSelect.appendChild(option);
      });
  };

  window.agregarJugadorPorNombre = async (equipo) => {
    const inputId = equipo === 'equipo1' ? 'input-equipo1' : 'input-equipo2';
    const input = document.getElementById(inputId);
    const nombreJugador = input.value.trim();
    
    if (!nombreJugador) {
      showToast('Por favor ingresa un nombre', 'warning');
      return;
    }
    
    // Validar que el jugador exista en la base de datos
    const jugadorExistente = todosLosJugadores.find(j => 
      j.nombre.toLowerCase() === nombreJugador.toLowerCase()
    );
    
    if (!jugadorExistente) {
      showToast(`El jugador "${nombreJugador}" no existe en la base de datos. Agrégalo primero desde el botón "+" en la tabla de estadísticas.`, 'error');
      return;
    }
    
    // Verificar si el jugador ya está en algún equipo
    const equipoActual = equipo === 'equipo1' ? equipo1 : equipo2;
    const equipoOpuesto = equipo === 'equipo1' ? equipo2 : equipo1;
    
    const yaEstaEnEquipoActual = equipoActual.find(j => j.id === jugadorExistente.id);
    const yaEstaEnEquipoOpuesto = equipoOpuesto.find(j => j.id === jugadorExistente.id);
    
    if (yaEstaEnEquipoActual) {
      showToast(`${jugadorExistente.nombre} ya está en este equipo`, 'warning');
      return;
    }
    
    if (yaEstaEnEquipoOpuesto) {
      showToast(`${jugadorExistente.nombre} ya está en el equipo contrario`, 'warning');
      return;
    }
    
    // Buscar las estadísticas del jugador en los datos cargados
    const estadisticasJugador = datosJugadores.find(j => j.jugadores.id === jugadorExistente.id);
    
    // Crear objeto jugador con estadísticas
    const jugadorConEstadisticas = {
      ...jugadorExistente,
      // Agregar estadísticas si están disponibles
      ...(estadisticasJugador || {
        total_puntos: 0,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        goles: 0,
        asistencias: 0,
        atajadas: 0,
        winrate: 0
      }),
      // Asegurar que pulmon siempre se mantenga del jugador original
      pulmon: jugadorExistente.pulmon
    };
    
    // Agregar el jugador al equipo
    if (equipo === 'equipo1') {
      equipo1.push(jugadorConEstadisticas);
      window.equipo1 = equipo1; // Actualizar referencia global
      showToast(`${jugadorExistente.nombre} agregado al Equipo 1`, 'success');
    } else {
      equipo2.push(jugadorConEstadisticas);
      window.equipo2 = equipo2; // Actualizar referencia global
      showToast(`${jugadorExistente.nombre} agregado al Equipo 2`, 'success');
    }
    
    input.value = ''; // Limpiar el input
    renderizarEquipos();
  };

  function agregarEvento() {
      const goleador_id = document.getElementById('goleador').value;
      const asistencia_id = document.getElementById('asistencia').value;

      if (!goleador_id) {
          showToast('Debes seleccionar un goleador.', 'warning');
          return;
      }

      // Verificar que goleador y asistidor no sean la misma persona
      if (asistencia_id && asistencia_id !== 'nadie' && asistencia_id === goleador_id) {
          showToast('Un jugador no puede asistirse a sí mismo. Se registrará como gol sin asistencia.', 'warning');
          // Continuar pero sin asistencia
      }

      // Detectar automáticamente el equipo del goleador
      const jugadoresDelPartido = [...equipo1, ...equipo2];
      const goleador = jugadoresDelPartido.find(j => j.id === goleador_id);
      
      if (!goleador) {
          showToast('Error: El goleador debe estar en uno de los equipos.', 'error');
          return;
      }

      // Determinar equipo (1 si está en equipo1, 2 si está en equipo2)
      const equipo = equipo1.find(j => j.id === goleador_id) ? 1 : 2;
      
      // Asegurar que el asistidor no sea el mismo que el goleador
      let asistencia_final = null;
      if (asistencia_id && asistencia_id !== 'nadie' && asistencia_id !== goleador_id) {
          asistencia_final = asistencia_id;
      }
      
      eventos.push({ goleador_id, asistencia_id: asistencia_final, equipo });
      
      const goleadorNombre = goleador.nombre;
      const asistidorNombre = asistencia_final 
          ? jugadoresDelPartido.find(j => j.id === asistencia_final)?.nombre || 'N/A'
          : null;

      const mensaje = asistidorNombre 
          ? `Gol agregado: ${goleadorNombre} (Asist: ${asistidorNombre})`
          : `Gol agregado: ${goleadorNombre}`;
      
      showToast(mensaje, 'success');
      renderizarTablaGoles();
      actualizarMarcadorAutomatico();
      
      // Resetear inputs (tanto selectores como inputs buscables)
      const goleadorElement = document.getElementById('goleador');
      const asistenciaElement = document.getElementById('asistencia');
      
      if (goleadorElement) {
        if (goleadorElement.style.display === 'none') {
          // Es un input buscable
          const inputGoleador = document.getElementById('goleador_input');
          if (inputGoleador) inputGoleador.value = '';
        } else {
          // Es un selector normal
          goleadorElement.selectedIndex = 0;
        }
      }
      
      if (asistenciaElement) {
        if (asistenciaElement.style.display === 'none') {
          // Es un input buscable
          const inputAsistencia = document.getElementById('asistencia_input');
          if (inputAsistencia) inputAsistencia.value = '';
        } else {
          // Es un selector normal
          asistenciaElement.selectedIndex = 0;
        }
      }
  }

  // Función para actualizar el marcador automáticamente basado en los goles
  function actualizarMarcadorAutomatico() {
      let golesEquipo1 = 0;
      let golesEquipo2 = 0;

      eventos.forEach(evento => {
          if (evento.equipo === 1) {
              golesEquipo1++;
          } else if (evento.equipo === 2) {
              golesEquipo2++;
          }
      });

      const resultadoField = document.getElementById('resultado-final');
      if (resultadoField) {
          resultadoField.value = `${golesEquipo1}-${golesEquipo2}`;
      }

      // Actualizar marcador visual en tiempo real
      const marcadorActual = document.getElementById('marcador-actual');
      if (marcadorActual) {
          marcadorActual.textContent = `${golesEquipo1} - ${golesEquipo2}`;
      }

      // Auto-seleccionar equipo ganador si hay diferencia
      const equipoGanadorSelect = document.getElementById('equipo-ganador');
      if (equipoGanadorSelect) {
          if (golesEquipo1 > golesEquipo2) {
              equipoGanadorSelect.value = '1';
          } else if (golesEquipo2 > golesEquipo1) {
              equipoGanadorSelect.value = '2';
          } else if (golesEquipo1 === golesEquipo2 && golesEquipo1 > 0) {
              equipoGanadorSelect.value = '0'; // Empate
          }
      }
  }

  async function cargarPartido() {
      const fecha = document.getElementById('fecha-partido').value;
      const cancha = document.getElementById('cancha-partido').value;
      const resultado = document.getElementById('resultado-final').value;
      const equipoGanadorSelect = document.getElementById('equipo-ganador');
      const equipo_ganador = equipoGanadorSelect ? equipoGanadorSelect.value : null;
      const temporadaPartidoSelect = document.getElementById('temporada-partido');
      const temporada_id = temporadaPartidoSelect ? temporadaPartidoSelect.value : null;

      if (!fecha || !cancha || !resultado || !equipo_ganador) {
          showToast('Completa todos los datos del partido (fecha, cancha, resultado, equipo ganador).', 'warning');
          return;
      }

      if (!temporada_id) {
          showToast('Debes seleccionar una temporada para el partido.', 'warning');
          return;
      }

      if (equipo1.length === 0 || equipo2.length === 0) {
          showToast('Debes tener jugadores en ambos equipos para guardar el partido.', 'warning');
          return;
      }

      try {
          // Mostrar loading
          const btnCargar = document.getElementById('btn-cargar-partido');
          const textoOriginal = btnCargar.innerHTML;
          btnCargar.disabled = true;
          btnCargar.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Guardando partido...';

          // Obtener todos los datos del partido
          const mvp_id = document.getElementById('mvp-partido').value || null;
          const ace_id = document.getElementById('ace-partido').value || null;

          // Procesar atajadas
          const atajadas = [];
          document.querySelectorAll('.atajadas-row').forEach(row => {
              const jugadorSelect = row.querySelector('.atajadas-jugador');
              const cantidadInput = row.querySelector('.atajadas-cantidad');
              
              if (jugadorSelect && cantidadInput && jugadorSelect.value && cantidadInput.value) {
                  atajadas.push({
                      jugador_id: jugadorSelect.value,
                      cantidad: parseInt(cantidadInput.value) || 0
                  });
              }
          });

          // Procesar cagadas
          const cagadas = [];
          document.querySelectorAll('.cagadas-row').forEach(row => {
              const jugadorSelect = row.querySelector('.cagadas-jugador');
              const cantidadInput = row.querySelector('.cagadas-cantidad');
              
              if (jugadorSelect && cantidadInput && jugadorSelect.value && cantidadInput.value) {
                  cagadas.push({
                      jugador_id: jugadorSelect.value,
                      cantidad: parseInt(cantidadInput.value) || 0
                  });
              }
          });

          // Preparar datos para el partido (solo campos que existen en la tabla partidos)
          const partidoData = {
              fecha: fecha,
              cancha: cancha,
              resultado: resultado,
              equipo_ganador: parseInt(equipo_ganador),
              temporada_id: temporada_id
          };

          console.log('Guardando partido:', partidoData);

          // Insertar partido en Supabase
          const { data: partidoInsertado, error: partidoError } = await supabase
              .from('partidos')
              .insert([partidoData])
              .select()
              .single();

          if (partidoError) {
              console.error('Error al insertar partido:', partidoError);
              throw new Error(`Error al guardar el partido: ${partidoError.message}`);
          }

          const partido_id = partidoInsertado.id;
          console.log('Partido insertado con ID:', partido_id);

          // Insertar jugadores del partido en la tabla jugador_partido
          const jugadoresPartidoData = [];
          
          // Agregar jugadores del equipo 1
          equipo1.forEach(jugador => {
              jugadoresPartidoData.push({
                  jugador_id: jugador.id,
                  partido_id: partido_id,
                  equipo: 1,
                  goles: 0,
                  asistencias: 0,
                  cagadas: 0,
                  mvp: mvp_id === jugador.id,
                  ace: ace_id === jugador.id,
                  atajadas: 0,
                  puntos: 0,
                  capitan_defeat: false,
                  bita_defeat: false,
                  pulmon: jugador.pulmon || 0
              });
          });
          
          // Agregar jugadores del equipo 2
          equipo2.forEach(jugador => {
              jugadoresPartidoData.push({
                  jugador_id: jugador.id,
                  partido_id: partido_id,
                  equipo: 2,
                  goles: 0,
                  asistencias: 0,
                  cagadas: 0,
                  mvp: mvp_id === jugador.id,
                  ace: ace_id === jugador.id,
                  atajadas: 0,
                  puntos: 0,
                  capitan_defeat: false,
                  bita_defeat: false,
                  pulmon: jugador.pulmon || 0
              });
          });

          // Guardar jugadores del partido
          const { error: jugadoresError } = await supabase
              .from('jugador_partido')
              .insert(jugadoresPartidoData);

          if (jugadoresError) {
              console.error('Error al insertar jugadores del partido:', jugadoresError);
              
              // Verificar si es el error específico de la vista estadisticas_jugador
              if (jugadoresError.message && jugadoresError.message.includes('estadisticas_jugador')) {
                  console.warn('⚠️ Error de vista estadisticas_jugador detectado - Este error es conocido y será ignorado');
                  console.warn('💡 SOLUCIÓN: Elimina los triggers que intentan escribir en la vista estadisticas_jugador');
                  showToast('⚠️ Partido guardado con advertencias. Los triggers de estadísticas automáticas fallan (normal).', 'warning');
                  
                  // Continuar con el resto del proceso sin lanzar error
                  console.log('🔄 Continuando con guardado de goles...');
              } else {
                  // Si es otro tipo de error, sí fallar
                  throw new Error(`Error crítico al guardar los jugadores del partido: ${jugadoresError.message}`);
              }
          }

          console.log('Jugadores del partido insertados:', jugadoresPartidoData.length);

          // Insertar goles
          if (eventos.length > 0) {
              const golesData = eventos.map(evento => {
                  // Verificar que goleador y asistidor no sean la misma persona
                  let asistidor_id = null;
                  if (evento.asistencia_id && 
                      evento.asistencia_id !== 'nadie' && 
                      evento.asistencia_id !== '' && 
                      evento.asistencia_id !== evento.goleador_id) {
                      asistidor_id = evento.asistencia_id;
                  }
                  
                  return {
                      partido_id: partido_id,
                      goleador_id: evento.goleador_id,
                      asistidor_id: asistidor_id,
                      equipo: evento.equipo,
                      minuto: null // Opcional: agregar minuto si lo necesitas
                  };
              });

              const { error: golesError } = await supabase
                  .from('goles') // Cambio de partido_goles a goles
                  .insert(golesData);

              if (golesError) {
                  console.error('Error al insertar goles:', golesError);
                  
                  // Verificar si es el error específico de la vista estadisticas_jugador
                  if (golesError.message && golesError.message.includes('estadisticas_jugador')) {
                      console.warn('⚠️ Error de vista estadisticas_jugador en goles detectado - Ignorando');
                      // Continuar sin lanzar error
                  } else {
                      throw new Error(`Error al guardar los goles: ${golesError.message}`);
                  }
              }

              console.log('Goles insertados:', golesData.length);
          }

          // Actualizar atajadas en jugador_partido
          if (atajadas.length > 0) {
              for (const atajada of atajadas) {
                  const { error: atajadasError } = await supabase
                      .from('jugador_partido')
                      .update({ atajadas: atajada.cantidad })
                      .eq('partido_id', partido_id)
                      .eq('jugador_id', atajada.jugador_id);

                  if (atajadasError) {
                      console.error('Error al actualizar atajadas:', atajadasError);
                      
                      // Verificar si es el error específico de la vista estadisticas_jugador
                      if (atajadasError.message && atajadasError.message.includes('estadisticas_jugador')) {
                          console.warn('⚠️ Error de vista estadisticas_jugador en atajadas detectado - Ignorando');
                          // Continuar sin lanzar error
                      } else {
                          throw new Error(`Error al guardar las atajadas: ${atajadasError.message}`);
                      }
                  }
              }
              console.log('Atajadas actualizadas:', atajadas.length);
          }

          // Actualizar cagadas en jugador_partido
          if (cagadas.length > 0) {
              for (const cagada of cagadas) {
                  const { error: cagadasError } = await supabase
                      .from('jugador_partido')
                      .update({ cagadas: cagada.cantidad })
                      .eq('partido_id', partido_id)
                      .eq('jugador_id', cagada.jugador_id);

                  if (cagadasError) {
                      console.error('Error al actualizar cagadas:', cagadasError);
                      
                      // Verificar si es el error específico de la vista estadisticas_jugador
                      if (cagadasError.message && cagadasError.message.includes('estadisticas_jugador')) {
                          console.warn('⚠️ Error de vista estadisticas_jugador en cagadas detectado - Ignorando');
                          // Continuar sin lanzar error
                      } else {
                          throw new Error(`Error al guardar las cagadas: ${cagadasError.message}`);
                      }
                  }
              }
              console.log('Cagadas actualizadas:', cagadas.length);
          }

          // Éxito!
          showToast('¡Partido guardado exitosamente! 🎉', 'success');
          
          // Limpiar formulario
          document.getElementById('fecha-partido').value = '';
          document.getElementById('cancha-partido').value = '';
          document.getElementById('resultado-final').value = '';
          document.getElementById('equipo-ganador').value = '';
          document.getElementById('temporada-partido').value = '';
          document.getElementById('mvp-partido').value = '';
          document.getElementById('ace-partido').value = '';
          
          // Limpiar eventos
          eventos.length = 0;
          renderizarTablaGoles();
          
          // Limpiar inputs buscables
          const inputGoleador = document.getElementById('goleador_input');
          const inputAsistencia = document.getElementById('asistencia_input');
          if (inputGoleador) inputGoleador.value = '';
          if (inputAsistencia) inputAsistencia.value = '';
          
          // Limpiar atajadas y cagadas extra (mantener solo una fila)
          document.querySelectorAll('.atajadas-row').forEach((row, index) => {
              if (index === 0) {
                  row.querySelector('.atajadas-jugador').value = '';
                  row.querySelector('.atajadas-cantidad').value = '';
              } else {
                  row.remove();
              }
          });
          
          document.querySelectorAll('.cagadas-row').forEach((row, index) => {
              if (index === 0) {
                  row.querySelector('.cagadas-jugador').value = '';
                  row.querySelector('.cagadas-cantidad').value = '';
              } else {
                  row.remove();
              }
          });

          // Refrescar estadísticas
          await cargarEstadisticas();

      } catch (error) {
          console.error('Error completo al cargar partido:', error);
          showToast(`Error al guardar el partido: ${error.message}`, 'error');
      } finally {
          // Restaurar botón
          const btnCargar = document.getElementById('btn-cargar-partido');
          btnCargar.disabled = false;
          btnCargar.innerHTML = '<i class="bi bi-save me-2"></i>Cargar Partido Completo';
      }
  }
  
  async function cargarEstadisticas() {
    // Obtener temporada seleccionada desde los selectores
    const selectorTemporada = document.getElementById('selector-temporada');
    const selectorTemporadaMobile = document.getElementById('selector-temporada-mobile');
    const temporadaSeleccionada = selectorTemporada?.value || selectorTemporadaMobile?.value || '';
    
    console.log('📊 Cargando estadísticas con temporada:', temporadaSeleccionada);
    
    // PARCHE ESPECIAL PARA TEMPORADA 1: Usar vista_estadisticas_por_temporada
    if (temporadaSeleccionada && temporadaSeleccionada !== '') {
      // Verificar si es temporada 1 consultando el nombre de la temporada
      const { data: temporadaInfo } = await supabase
        .from('temporadas')
        .select('id, nombre')
        .eq('id', temporadaSeleccionada)
        .single();
      
      if (temporadaInfo && (temporadaInfo.nombre.includes('Temporada 1') || temporadaInfo.id === '1' || temporadaInfo.id === 1)) {
        console.log('🏆 PARCHE TEMPORADA 1: Usando estadisticas_temporada');
        
        try {
          // Primero obtener las estadísticas de la temporada
          const { data: statsData, error: statsError } = await supabase
            .from('estadisticas_temporada')
            .select(`
              temporada_id,
              jugador_id,
              total_puntos,
              pj,
              pg,
              pe,
              pp,
              goles,
              asistencias,
              cagadas_en_gol,
              mvp_count,
              ace_count,
              atajadas,
              winrate,
              capitan_defeat,
              bita_defeat
            `)
            .eq('temporada_id', temporadaSeleccionada);
          
          if (statsError) {
            console.error('❌ Error al cargar estadisticas_temporada:', statsError);
            throw statsError;
          }
          
          if (!statsData || statsData.length === 0) {
            console.log('⚠️ No se encontraron datos en estadisticas_temporada para temporada 1');
            throw new Error('Sin datos en estadisticas_temporada');
          }
          
          // Luego obtener la información de los jugadores por separado
          const jugadorIds = statsData.map(stat => stat.jugador_id);
          const { data: jugadoresData, error: jugadoresError } = await supabase
            .from('jugadores')
            .select(`
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
            `)
            .in('id', jugadorIds);
          
          if (jugadoresError) {
            console.error('❌ Error al cargar jugadores:', jugadoresError);
            throw jugadoresError;
          }
          
          // Combinar las estadísticas con la información de los jugadores
          const vistaData = statsData.map(stat => {
            const jugadorInfo = jugadoresData.find(j => j.id === stat.jugador_id);
            return {
              ...stat,
              jugadores: jugadorInfo
            };
                     }).filter(item => item.jugadores); // Filtrar solo los que tienen información de jugador
          
          if (vistaData && vistaData.length > 0) {
            console.log('✅ Datos de temporada 1 cargados desde estadisticas_temporada:', vistaData.length, 'jugadores');
            
            // Procesar datos de estadisticas_temporada para que sean compatibles
            const datosVista = vistaData.map(jugadorData => ({
              ...jugadorData,
              // Asegurar que todos los campos necesarios estén presentes
              rendimiento_total: null,
              rendimiento_ataque: null,
              rendimiento_arquero: null
            }));
            
            // Transformar a formato compatible
            datosJugadores = datosVista.map((jugadorData) => {
              const stats = {
                total_puntos: jugadorData.total_puntos || 0,
                pj: jugadorData.pj || 0,
                pg: jugadorData.pg || 0,
                pe: jugadorData.pe || 0,
                pp: jugadorData.pp || 0,
                goles: jugadorData.goles || 0,
                asistencias: jugadorData.asistencias || 0,
                cagadas_en_gol: jugadorData.cagadas_en_gol || 0,
                mvp_count: jugadorData.mvp_count || 0,
                ace_count: jugadorData.ace_count || 0,
                atajadas: jugadorData.atajadas || 0,
                capitan_defeat: jugadorData.capitan_defeat || 0,
                bita_defeat: jugadorData.bita_defeat || 0,
                rendimiento_total: jugadorData.rendimiento_total,
                rendimiento_ataque: jugadorData.rendimiento_ataque,
                rendimiento_arquero: jugadorData.rendimiento_arquero
              };
              
              const winrate = jugadorData.winrate || 0;
              
              return {
                ...stats,
                winrate,
                jugadores: jugadorData.jugadores,
                nombre: jugadorData.jugadores.nombre
              };
            });
            
            // Actualizar referencia global
            window.datosJugadores = datosJugadores;
            
            // Renderizar tabla y salir de la función
            await renderizarTablaOrdenada();
            return;
          }
        } catch (error) {
          console.error('❌ Error en parche temporada 1:', error);
          console.log('🔄 Continuando con lógica normal...');
        }
      }
    }
    
    // LÓGICA NORMAL: Calcular estadísticas directamente desde jugador_partido
    let data, error;
    
    try {
      // Consulta para obtener todos los partidos de la temporada con sus goles
      let partidosQuery = supabase
        .from('partidos')
        .select(`
          id,
          temporada_id,
          equipo_ganador,
          jugador_partido (
            jugador_id,
            equipo,
            cagadas,
            mvp,
            ace,
            atajadas,
            capitan_defeat,
            bita_defeat,
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
            goleador_id,
            asistidor_id
          )
        `);
      
      // Filtrar por temporada si está seleccionada
      if (temporadaSeleccionada && temporadaSeleccionada !== '') {
        console.log('🏆 Aplicando filtro de temporada en estadísticas:', temporadaSeleccionada);
        partidosQuery = partidosQuery.eq('temporada_id', temporadaSeleccionada);
      }
      
      const result = await partidosQuery;
      
      console.log('📋 Resultado de consulta partidos con goles:', result);
      console.log('🔍 Partidos obtenidos:', result.data?.length || 0);
      
      if (result.error) {
        throw result.error;
      }
      
      // Procesar datos para calcular estadísticas por jugador
      const jugadoresStats = {};
      
      result.data?.forEach(partido => {
        // Procesar cada jugador que participó en este partido
        partido.jugador_partido?.forEach(jp => {
          const jugadorId = jp.jugador_id;
          
          if (!jugadoresStats[jugadorId]) {
            jugadoresStats[jugadorId] = {
              jugador_id: jugadorId,
              temporada_id: partido.temporada_id,
              jugadores: jp.jugadores,
              pj: 0,
              pg: 0,
              pe: 0,
              pp: 0,
              total_puntos: 0,
              goles: 0,
              asistencias: 0,
              cagadas_en_gol: 0,
              mvp_count: 0,
              ace_count: 0,
              atajadas: 0,
              capitan_defeat: 0,
              bita_defeat: 0,
              rendimiento_total: null,
              rendimiento_ataque: null,
              rendimiento_arquero: null
            };
          }
          
          const stats = jugadoresStats[jugadorId];
          
          // Incrementar partidos jugados
          stats.pj += 1;
          
          // Determinar resultado del partido para este jugador
          const equipoGanador = partido.equipo_ganador;
          if (equipoGanador === jp.equipo) {
            stats.pg += 1;
            stats.total_puntos += 3;
          } else if (equipoGanador === null) {
            stats.pe += 1;
            stats.total_puntos += 1;
          } else {
            stats.pp += 1;
            // 0 puntos por derrota
          }
          
          // Sumar estadísticas individuales (SIN goles y asistencias aún)
          stats.cagadas_en_gol += jp.cagadas || 0;
          stats.atajadas += jp.atajadas || 0;
          stats.mvp_count += jp.mvp ? 1 : 0;
          stats.ace_count += jp.ace ? 1 : 0;
          stats.capitan_defeat += jp.capitan_defeat ? 1 : 0;
          stats.bita_defeat += jp.bita_defeat ? 1 : 0;
        });
        
        // Procesar goles del partido para contar goles y asistencias reales
        partido.goles?.forEach(gol => {
          // Contar gol para el goleador
          if (gol.goleador_id && jugadoresStats[gol.goleador_id]) {
            jugadoresStats[gol.goleador_id].goles += 1;
          }
          
          // Contar asistencia para el asistidor
          if (gol.asistidor_id && jugadoresStats[gol.asistidor_id]) {
            jugadoresStats[gol.asistidor_id].asistencias += 1;
          }
        });
      });
      
      // Calcular winrate para cada jugador
      Object.values(jugadoresStats).forEach(stats => {
        const puntosObtenidos = (stats.pg * 3) + (stats.pe * 1);
        const puntosTotalesDisputados = stats.pj * 3;
        stats.winrate = puntosTotalesDisputados > 0 ? Math.round((puntosObtenidos / puntosTotalesDisputados) * 100) : 0;
      });
      
      data = Object.values(jugadoresStats);
      error = null;
      
      console.log('📈 Estadísticas calculadas:', data.length, 'jugadores');
      
    } catch (err) {
      console.error('Error al calcular estadísticas:', err);
      error = err;
      data = null;
    }
    
    if (error || !data || data.length === 0) {
      // Fallback: usar tabla jugadores directamente (para casos sin partidos)
      console.log('🔄 Usando tabla jugadores como fallback...');
      const result = await supabase.from('jugadores').select(`
        *,
        jugador_posicion (
          posicion_id,
          es_primaria,
          posicion (
            id,
            nombre
          )
        )
      `);
      
      if (result.error) {
        console.error('Error al cargar estadísticas:', result.error);
        showToast('Error al cargar estadísticas', 'error');
        return;
      }
      
      // Transformar datos para que sean compatibles con el formato esperado
      data = result.data.map(jugador => ({
        jugador_id: jugador.id,
        temporada_id: temporadaSeleccionada || 1,
        total_puntos: 0,
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        goles: 0,
        asistencias: 0,
        cagadas_en_gol: 0,
        mvp_count: 0,
        ace_count: 0,
        atajadas: 0,
        winrate: 0,
        capitan_defeat: 0,
        bita_defeat: 0,
        rendimiento_total: null,
        rendimiento_ataque: null,
        rendimiento_arquero: null,
        jugadores: {
          id: jugador.id,
          nombre: jugador.nombre,
          pulmon: jugador.pulmon,
          jugador_posicion: jugador.jugador_posicion
        }
      }));
    }
    // Los datos ya vienen agrupados por jugador desde el cálculo anterior
    console.log('👥 Datos de jugadores procesados:', data);
    
    datosJugadores = data.map((jugadorData) => {
      
      // Función para crear badges de colores según el valor
      const createBadge = (value, type = 'default') => {
        const val = value ?? 0;
        let colorClass = 'bg-secondary';
        if (type === 'winrate') {
          if (val >= 70) colorClass = 'bg-success';
          else if (val >= 50) colorClass = 'bg-warning';
          else colorClass = 'bg-danger';
        } else if (type === 'points') {
          if (val >= 100) colorClass = 'bg-success';
          else if (val >= 50) colorClass = 'bg-warning';
          else colorClass = 'bg-secondary';
        } else if (type === 'rendimiento') {
          if (val >= 15) colorClass = 'bg-success';
          else if (val >= 10) colorClass = 'bg-warning';
          else if (val >= 5) colorClass = 'bg-info';
          else colorClass = 'bg-secondary';
        }
        return `<span class="badge ${colorClass}">${val}</span>`;
      };

      // Función para mostrar posiciones con iconos
      const mostrarPosiciones = (jugadorPosiciones) => {
        if (!jugadorPosiciones || jugadorPosiciones.length === 0) {
          return '<span class="text-muted small">Sin posición</span>';
        }
        
        const primaria = jugadorPosiciones.find(jp => jp.es_primaria);
        const secundaria = jugadorPosiciones.find(jp => !jp.es_primaria);
        
        let html = '';
        if (primaria) {
          const icono = iconosPosiciones[primaria.posicion_id] || '❓';
          const nombre = nombresPosiciones[primaria.posicion_id] || 'N/A';
          html += `<span class="badge bg-primary me-1" title="Posición Principal">${icono} ${nombre}</span>`;
        }
        if (secundaria) {
          const icono = iconosPosiciones[secundaria.posicion_id] || '❓';
          const nombre = nombresPosiciones[secundaria.posicion_id] || 'N/A';
          html += `<span class="badge bg-outline-secondary" title="Posición Secundaria">${icono} ${nombre}</span>`;
        }
        
        return html || '<span class="text-muted small">Sin posición</span>';
      };
      
      // Los datos ya vienen calculados, no necesitamos sumar
      const stats = {
        total_puntos: jugadorData.total_puntos || 0,
        pj: jugadorData.pj || 0,
        pg: jugadorData.pg || 0,
        pe: jugadorData.pe || 0,
        pp: jugadorData.pp || 0,
        goles: jugadorData.goles || 0,
        asistencias: jugadorData.asistencias || 0,
        cagadas_en_gol: jugadorData.cagadas_en_gol || 0,
        mvp_count: jugadorData.mvp_count || 0,
        ace_count: jugadorData.ace_count || 0,
        atajadas: jugadorData.atajadas || 0,
        capitan_defeat: jugadorData.capitan_defeat || 0,
        bita_defeat: jugadorData.bita_defeat || 0,
        rendimiento_total: jugadorData.rendimiento_total,
        rendimiento_ataque: jugadorData.rendimiento_ataque,
        rendimiento_arquero: jugadorData.rendimiento_arquero
      };
      
      // El winrate ya viene calculado
      const winrate = jugadorData.winrate || 0;
      
      // Debug específico para Boska
      if (jugadorData.jugadores?.nombre.toLowerCase().includes('boska')) {
        console.log('🔍 DEBUG BOSKA (NUEVA LÓGICA):');
        console.log('📊 Datos del jugador:', jugadorData);
        console.log('📈 Stats procesadas:', stats);
        console.log('🎯 PJ final:', stats.pj);
      }
      
      // Retornar objeto con todos los datos necesarios
      return {
        ...stats,
        winrate,
        jugadores: jugadorData.jugadores,
        // Campos para ordenamiento
        nombre: jugadorData.jugadores.nombre
      };
    });
    
    // Actualizar referencia global para el algoritmo genético
    window.datosJugadores = datosJugadores;
    
    // Renderizar tabla ordenada
    await renderizarTablaOrdenada();
  }

  // Función para calcular rachas más largas de victoria y derrota
  async function calcularRachasMasLargas(data) {
    try {
      // Obtener temporada seleccionada para filtrar correctamente
      const temporadaSeleccionada = document.getElementById('selector-temporada')?.value || 
                                   document.getElementById('selector-temporada-mobile')?.value || '';
      
      // Query base para obtener partidos con jugadores
      let query = supabase
        .from('partidos')
        .select(`
          id,
          fecha,
          equipo_ganador,
          temporada_id,
          jugador_partido (
            jugador_id,
            equipo,
            jugadores (
              id,
              nombre
            )
          )
        `)
        .order('fecha', { ascending: false }); // Más recientes primero
      
      // Filtrar por temporada si está seleccionada
      if (temporadaSeleccionada && temporadaSeleccionada !== '') {
        query = query.eq('temporada_id', temporadaSeleccionada);
      }
      
      const { data: partidos, error } = await query;
      
      if (error || !partidos || partidos.length === 0) {
        return { mejorRachaVictorias: null, mejorRachaDerrota: null };
      }
      
      const rachasHistoricas = {};
      
      // Para cada jugador en los datos, calcular todas sus rachas históricas
      data.forEach(jugadorData => {
        const jugadorId = jugadorData.jugadores?.id;
        if (!jugadorId) return;
        
        // Obtener partidos donde participó este jugador (ordenados por fecha asc para calcular rachas)
        const partidosJugador = partidos
          .filter(partido => 
            partido.jugador_partido?.some(jp => jp.jugador_id === jugadorId)
          )
          .reverse(); // Convertir a orden cronológico
        
        if (partidosJugador.length === 0) {
          rachasHistoricas[jugadorId] = { 
            mejorRachaVictorias: 0, 
            mejorRachaDerrota: 0, 
            nombre: jugadorData.jugadores.nombre 
          };
          return;
        }
        
        let mejorRachaVictorias = 0;
        let mejorRachaDerrota = 0;
        let rachaActualVictorias = 0;
        let rachaActualDerrota = 0;
        
        for (const partido of partidosJugador) {
          const jugadorEnPartido = partido.jugador_partido.find(jp => jp.jugador_id === jugadorId);
          if (!jugadorEnPartido) continue;
          
          const equipoJugador = jugadorEnPartido.equipo;
          const equipoGanador = partido.equipo_ganador;
          
          // Determinar resultado
          if (equipoGanador === equipoJugador) {
            // Victoria
            rachaActualVictorias++;
            rachaActualDerrota = 0;
            mejorRachaVictorias = Math.max(mejorRachaVictorias, rachaActualVictorias);
          } else if (equipoGanador !== null) {
            // Derrota
            rachaActualDerrota++;
            rachaActualVictorias = 0;
            mejorRachaDerrota = Math.max(mejorRachaDerrota, rachaActualDerrota);
          } else {
            // Empate rompe cualquier racha
            rachaActualVictorias = 0;
            rachaActualDerrota = 0;
          }
        }
        
        rachasHistoricas[jugadorId] = {
          mejorRachaVictorias,
          mejorRachaDerrota,
          nombre: jugadorData.jugadores?.nombre || jugadorData.nombre || 'Jugador Desconocido'
        };
      });
      
      // Encontrar jugador con la racha de victorias más larga
      let mejorRachaVictorias = null;
      let maxRachaVictorias = 0;
      
      Object.keys(rachasHistoricas).forEach(jugadorId => {
        const racha = rachasHistoricas[jugadorId];
        if (racha.mejorRachaVictorias > maxRachaVictorias) {
          maxRachaVictorias = racha.mejorRachaVictorias;
          mejorRachaVictorias = {
            nombre: racha.nombre || 'Jugador Sin Nombre',
            racha: racha.mejorRachaVictorias
          };
          console.log('🔥 Nueva mejor racha encontrada:', mejorRachaVictorias);
        }
      });
      
      return { mejorRachaVictorias, mejorRachaDerrota: null };
      
    } catch (error) {
      console.error('Error al calcular rachas más largas:', error);
      return { mejorRachaVictorias: null, mejorRachaDerrota: null };
    }
  }

  async function renderizarDestacados(data) {
    const container = document.getElementById('destacados-container');
    if (!container || data.length === 0) return;
    
    // Calcular los mejores en cada categoría
    const mejorPuntos = data.reduce((max, jugador) => 
      (jugador.total_puntos || 0) > (max.total_puntos || 0) ? jugador : max
    );
    
    const mejorGoles = data.reduce((max, jugador) => 
      (jugador.goles || 0) > (max.goles || 0) ? jugador : max
    );
    
    const mejorAtajadas = data.reduce((max, jugador) => 
      (jugador.atajadas || 0) > (max.atajadas || 0) ? jugador : max
    );
    
    const mejorAsistencias = data.reduce((max, jugador) => 
      (jugador.asistencias || 0) > (max.asistencias || 0) ? jugador : max
    );
    
    // Mejor winrate (mínimo 10 partidos)
    const jugadoresConMinPartidos = data.filter(j => (j.pj || 0) >= 10);
    const mejorWinrate = jugadoresConMinPartidos.length > 0 
      ? jugadoresConMinPartidos.reduce((max, jugador) => 
          (jugador.winrate || 0) > (max.winrate || 0) ? jugador : max
        )
      : null;
    
    // Racha de victorias más larga
    const rachasMasLargas = await calcularRachasMasLargas(data);
    const mejorRachaVictorias = rachasMasLargas.mejorRachaVictorias;
    
    const destacados = [
      {
        categoria: 'Más Puntos',
        icon: '👑',
        jugador: mejorPuntos,
        valor: mejorPuntos.total_puntos || 0,
        sufijo: '',
        clase: 'puntos'
      },
      {
        categoria: 'Más Goles',
        icon: '⚽',
        jugador: mejorGoles,
        valor: mejorGoles.goles || 0,
        sufijo: '',
        clase: 'goles'
      },
      {
        categoria: 'Más Atajadas',
        icon: '🥅',
        jugador: mejorAtajadas,
        valor: mejorAtajadas.atajadas || 0,
        sufijo: '',
        clase: 'atajadas'
      },
      {
        categoria: 'Más Asistencias',
        icon: '🎯',
        jugador: mejorAsistencias,
        valor: mejorAsistencias.asistencias || 0,
        sufijo: '',
        clase: 'asistencias'
      },
      {
        categoria: 'Mejor Winrate',
        icon: '📊',
        jugador: mejorWinrate,
        valor: mejorWinrate ? mejorWinrate.winrate || 0 : 0,
        sufijo: '%',
        clase: 'winrate',
        requisito: '(min. 10 PJ)'
      },
      {
        categoria: 'Racha de Victorias Más Larga',
        icon: '🔥',
        jugador: mejorRachaVictorias ? mejorRachaVictorias.nombre : null,
        valor: mejorRachaVictorias ? mejorRachaVictorias.racha || 0 : 0,
        sufijo: '',
        clase: 'racha-victorias'
      }
    ];
    
    container.innerHTML = destacados.map(destacado => {
      if (!destacado.jugador) {
        return `
          <div class="col-lg col-md-6">
            <div class="destacado-card ${destacado.clase} rounded-3 p-3 text-center">
              <span class="destacado-icon">${destacado.icon}</span>
              <div class="destacado-valor">--</div>
              <div class="destacado-nombre text-white">Sin datos</div>
              <div class="destacado-categoria text-light-emphasis">${destacado.categoria}</div>
              ${destacado.requisito ? `<div class="text-muted small mt-1">${destacado.requisito}</div>` : ''}
            </div>
          </div>
        `;
      }
      
      return `
        <div class="col-lg col-md-6">
          <div class="destacado-card ${destacado.clase} rounded-3 p-3 text-center">
            <span class="destacado-icon">${destacado.icon}</span>
            <div class="destacado-valor">${destacado.valor}${destacado.sufijo}</div>
            <div class="destacado-nombre text-white">${destacado.jugador.nombre || destacado.jugador.jugadores?.nombre || destacado.jugador || 'Jugador'}</div>
            <div class="destacado-categoria text-light-emphasis">${destacado.categoria}</div>
            ${destacado.requisito ? `<div class="text-muted small mt-1">${destacado.requisito}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderizarMejoresPorPuesto(data) {
    const container = document.getElementById('mejores-puesto-container');
    if (!container || data.length === 0) return;
    
    // Función para obtener la posición primaria de un jugador
    const obtenerPosicionPrimaria = (jugador) => {
      if (!jugador.jugadores?.jugador_posicion) return null;
      const primaria = jugador.jugadores.jugador_posicion.find(jp => jp.es_primaria);
      return primaria ? primaria.posicion.nombre : null;
    };
    
    // Función para verificar si un jugador puede jugar en una posición (primaria o secundaria)
    const puedeJugarEn = (jugador, posicion) => {
      if (!jugador.jugadores?.jugador_posicion) return false;
      return jugador.jugadores.jugador_posicion.some(jp => jp.posicion.nombre === posicion);
    };
    
    // Filtrar jugadores con un mínimo de partidos para estadísticas más significativas
    const jugadoresConMinPartidos = data.filter(j => (j.pj || 0) >= 5);
    
    // NUEVA LÓGICA COMPLEJA: Separar jugadores principales vs contribuyentes (igual que el radar)
    const arqueros = jugadoresConMinPartidos.filter(j => puedeJugarEn(j, 'Arquero'));
    const defensores = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Defensor');
    
    // MEDIOCAMPO: Principales + Secundarios (65% contribución)
    const mediocampistasPrincipales = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Mediocampo');
    const mediocampistasSecundarios = jugadoresConMinPartidos.filter(j => 
      obtenerPosicionPrimaria(j) !== 'Mediocampo' && puedeJugarEn(j, 'Mediocampo')
    );
    
    // ATAQUE: Principales + Contribuyentes ofensivos
    const atacantesPrincipales = jugadoresConMinPartidos.filter(j => obtenerPosicionPrimaria(j) === 'Atacante');
    const contribuyentesOfensivos = jugadoresConMinPartidos.filter(j => {
      const tieneGoles = (j.goles || 0) > 0;
      const tieneAsistencias = (j.asistencias || 0) > 0;
      return tieneGoles || tieneAsistencias;
    });
    
    // FUNCIONES DE SCORE (mismas que el radar, ajustadas)
    const calcularScoreArquero = (jugador) => {
      const pj = jugador.pj || 1;
      const winrate = jugador.winrate || 0;
      const atajadasPorPartido = (jugador.atajadas || 0) / pj;
      return winrate * 0.4 + atajadasPorPartido * 25; // Reducido como en radar
    };
    
    const calcularScoreDefensor = (jugador) => {
      const pj = jugador.pj || 1;
      const winrate = jugador.winrate || 0;
      const cagadasPorPartido = (jugador.cagadas_en_gol || 0) / pj;
      return Math.max(winrate - (cagadasPorPartido * 10), 0);
    };
    
    // SCORE COMPLEJO PARA MEDIOCAMPO
    const calcularScoreMediocampo = (jugador, esPrincipal = true) => {
      const pj = jugador.pj || 1;
      const golesPorPartido = (jugador.goles || 0) / pj;
      const asistPorPartido = (jugador.asistencias || 0) / pj;
      const winrate = jugador.winrate || 0;
      const scoreBase = (golesPorPartido + asistPorPartido) * 20 + winrate * 0.5;
      return esPrincipal ? scoreBase : scoreBase * 0.65; // 65% para secundarios
    };
    
    // SCORE COMPLEJO PARA ATAQUE
    const calcularScoreAtaque = (jugador, esPrincipal = true) => {
      const pj = jugador.pj || 1;
      const golesPorPartido = (jugador.goles || 0) / pj;
      const asistPorPartido = (jugador.asistencias || 0) / pj;
      const winrate = jugador.winrate || 0;
      
      if (esPrincipal) {
        // Main atacantes: formula completa
        return (golesPorPartido + asistPorPartido) * 40 + winrate * 1.0;
      } else {
        // Contribuyentes: solo goles+assists
        return (golesPorPartido + asistPorPartido) * 25;
      }
    };
    
    // ENCONTRAR MEJORES CON LÓGICA COMPLEJA
    const mejorArquero = arqueros.length > 0 
      ? arqueros.reduce((max, jugador) => 
          calcularScoreArquero(jugador) > calcularScoreArquero(max) ? jugador : max
        ) 
      : null;
    
    const mejorDefensor = defensores.length > 0
      ? defensores.reduce((max, jugador) => 
          calcularScoreDefensor(jugador) > calcularScoreDefensor(max) ? jugador : max
        )
      : null;
    
    // MEJOR MEDIOCAMPO (combinando principales y secundarios)
    let mejorMediocampista = null;
    let mejorScoreMediocampo = 0;
    
    // Evaluar principales
    mediocampistasPrincipales.forEach(jugador => {
      const score = calcularScoreMediocampo(jugador, true);
      if (score > mejorScoreMediocampo) {
        mejorScoreMediocampo = score;
        mejorMediocampista = jugador;
      }
    });
    
    // Evaluar secundarios
    mediocampistasSecundarios.forEach(jugador => {
      const score = calcularScoreMediocampo(jugador, false);
      if (score > mejorScoreMediocampo) {
        mejorScoreMediocampo = score;
        mejorMediocampista = jugador;
      }
    });
    
    // MEJOR ATACANTE (combinando principales y contribuyentes)
    let mejorAtacante = null;
    let mejorScoreAtaque = 0;
    
    // Evaluar principales
    atacantesPrincipales.forEach(jugador => {
      const score = calcularScoreAtaque(jugador, true);
      if (score > mejorScoreAtaque) {
        mejorScoreAtaque = score;
        mejorAtacante = jugador;
      }
    });
    
    // Evaluar contribuyentes (no principales)
    contribuyentesOfensivos.forEach(jugador => {
      if (obtenerPosicionPrimaria(jugador) !== 'Atacante') {
        const score = calcularScoreAtaque(jugador, false);
        if (score > mejorScoreAtaque) {
          mejorScoreAtaque = score;
          mejorAtacante = jugador;
        }
      }
    });
    
    const mejoresPorPuesto = [
      {
        posicion: 'Arquero',
        icon: '🥅',
        jugador: mejorArquero,
        clase: 'arquero',
        stats: mejorArquero ? [
          `Winrate: ${mejorArquero.winrate}%`,
          `Atajadas: ${mejorArquero.atajadas} (${(mejorArquero.atajadas / mejorArquero.pj).toFixed(1)}/partido)`
        ] : []
      },
      {
        posicion: 'Defensor',
        icon: '🛡️',
        jugador: mejorDefensor,
        clase: 'defensor',
        stats: mejorDefensor ? [
          `Winrate: ${mejorDefensor.winrate}%`,
          `Cagadas: ${mejorDefensor.cagadas_en_gol || 0} (${((mejorDefensor.cagadas_en_gol || 0) / mejorDefensor.pj).toFixed(2)}/partido)`
        ] : []
      },
      {
        posicion: 'Mediocampo',
        icon: '⚡',
        jugador: mejorMediocampista,
        clase: 'mediocampo',
        stats: mejorMediocampista ? [
          `G+A: ${(mejorMediocampista.goles || 0) + (mejorMediocampista.asistencias || 0)} (${(((mejorMediocampista.goles || 0) + (mejorMediocampista.asistencias || 0)) / mejorMediocampista.pj).toFixed(1)}/partido)`,
          `Winrate: ${mejorMediocampista.winrate}%`,
          `Tipo: ${obtenerPosicionPrimaria(mejorMediocampista) === 'Mediocampo' ? 'Principal' : 'Secundario (65%)'}`
        ] : []
      },
      {
        posicion: 'Atacante',
        icon: '⚽',
        jugador: mejorAtacante,
        clase: 'atacante',
        stats: mejorAtacante ? [
          `G+A: ${(mejorAtacante.goles || 0) + (mejorAtacante.asistencias || 0)} (${(((mejorAtacante.goles || 0) + (mejorAtacante.asistencias || 0)) / mejorAtacante.pj).toFixed(1)}/partido)`,
          `Winrate: ${mejorAtacante.winrate}%`,
          `Tipo: ${obtenerPosicionPrimaria(mejorAtacante) === 'Atacante' ? 'Principal' : 'Contribuyente'}`
        ] : []
      }
    ];
    
    container.innerHTML = mejoresPorPuesto.map(puesto => {
      if (!puesto.jugador) {
        return `
          <div class="col-lg-3 col-md-6">
            <div class="mejor-puesto-card ${puesto.clase} rounded-3 p-3 text-center">
              <span class="puesto-icon">${puesto.icon}</span>
              <div class="puesto-posicion text-light-emphasis">${puesto.posicion}</div>
              <div class="puesto-nombre text-white">Sin datos</div>
              <div class="puesto-stats text-muted small">
                <div>Mínimo 5 partidos</div>
              </div>
            </div>
          </div>
        `;
      }
      
      return `
        <div class="col-lg-3 col-md-6">
          <div class="mejor-puesto-card ${puesto.clase} rounded-3 p-3 text-center">
            <span class="puesto-icon">${puesto.icon}</span>
            <div class="puesto-posicion text-light-emphasis">${puesto.posicion}</div>
            <div class="puesto-nombre text-white">${puesto.jugador.jugadores?.nombre || puesto.jugador.nombre}</div>
            <div class="puesto-stats text-light">
              ${puesto.stats.map(stat => `
                <div class="mb-1">
                  <span class="small text-light-emphasis">${stat.split(':')[0]}:</span>
                  <span class="puesto-stat-valor ms-1">${stat.split(':')[1]}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Función para calcular rachas actuales de jugadores
  async function calcularRachasJugadores(jugadoresData) {
    console.log('🔥 Calculando rachas de jugadores...');
    
    const rachas = {};
    
    // Obtener temporada seleccionada para filtrar correctamente
    const temporadaSeleccionada = document.getElementById('selector-temporada')?.value || 
                                 document.getElementById('selector-temporada-mobile')?.value || '';
    
    // PARCHE TEMPORADA 1: No calcular rachas para temporada 1
    if (temporadaSeleccionada && temporadaSeleccionada !== '') {
      const { data: temporadaInfo } = await supabase
        .from('temporadas')
        .select('id, nombre')
        .eq('id', temporadaSeleccionada)
        .single();
      
      if (temporadaInfo && (temporadaInfo.nombre.includes('Temporada 1') || temporadaInfo.id === '1' || temporadaInfo.id === 1)) {
        console.log('🏆 PARCHE TEMPORADA 1: Saltando cálculo de rachas (usa estadisticas_temporada, no partidos individuales)');
        // Devolver rachas vacías para todos los jugadores
        jugadoresData.forEach(jugador => {
          const jugadorId = jugador.jugadores?.id;
          if (jugadorId) {
            rachas[jugadorId] = { tipo: null, cantidad: 0 };
          }
        });
        return rachas;
      }
    }
    
    try {
      // Query base para obtener partidos con jugadores
      let query = supabase
        .from('partidos')
        .select(`
          id,
          fecha,
          equipo_ganador,
          temporada_id,
          jugador_partido (
            jugador_id,
            equipo
          )
        `)
        .order('fecha', { ascending: false }); // Más recientes primero
      
      // Filtrar por temporada si está seleccionada
      if (temporadaSeleccionada && temporadaSeleccionada !== '') {
        query = query.eq('temporada_id', temporadaSeleccionada);
      }
      
      const { data: partidos, error } = await query;
      
      if (error) {
        console.error('Error al cargar partidos para rachas:', error);
        return {};
      }
      
      if (!partidos || partidos.length === 0) {
        console.log('No hay partidos para calcular rachas');
        return {};
      }
      
      console.log('📅 Partidos para calcular rachas:', partidos.length);
      
      // Para cada jugador, calcular su racha actual
      jugadoresData.forEach(jugador => {
        const jugadorId = jugador.jugadores?.id;
        if (!jugadorId) return;
        
        // Obtener partidos donde participó este jugador (ordenados por fecha desc)
        const partidosJugador = partidos.filter(partido => 
          partido.jugador_partido?.some(jp => jp.jugador_id === jugadorId)
        );
        
        if (partidosJugador.length === 0) {
          rachas[jugadorId] = { tipo: null, cantidad: 0 };
          return;
        }
        
        // Calcular racha desde el partido más reciente hacia atrás
        let rachaActual = 0;
        let tipoRacha = null; // 'win' o 'defeat'
        
        for (const partido of partidosJugador) {
          // Encontrar el equipo del jugador en este partido
          const jugadorEnPartido = partido.jugador_partido.find(jp => jp.jugador_id === jugadorId);
          if (!jugadorEnPartido) continue;
          
          const equipoJugador = jugadorEnPartido.equipo;
          const equipoGanador = partido.equipo_ganador;
          
          // Determinar si ganó, empató o perdió
          let resultado;
          if (equipoGanador === equipoJugador) {
            resultado = 'win';
          } else if (equipoGanador === null) {
            resultado = 'draw';
          } else {
            resultado = 'defeat';
          }
          
          // Lógica de racha
          if (rachaActual === 0) {
            // Primer partido, establecer tipo de racha
            if (resultado === 'win') {
              tipoRacha = 'win';
              rachaActual = 1;
            } else if (resultado === 'defeat') {
              tipoRacha = 'defeat';
              rachaActual = 1;
            } else {
              // Empate rompe cualquier racha potencial
              break;
            }
          } else {
            // Continuar racha existente
            if ((tipoRacha === 'win' && resultado === 'win') || 
                (tipoRacha === 'defeat' && resultado === 'defeat')) {
              rachaActual++;
            } else {
              // La racha se rompió
              break;
            }
          }
        }
        
        // Solo considerar rachas significativas (2 o más)
        rachas[jugadorId] = {
          tipo: rachaActual >= 2 ? tipoRacha : null,
          cantidad: rachaActual >= 2 ? rachaActual : 0
        };
      });
      
      console.log('🔥❄️ Rachas calculadas:', rachas);
      return rachas;
      
    } catch (error) {
      console.error('Error al calcular rachas:', error);
      return {};
    }
  }

  async function renderizarTablaConDatos(data) {
    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    
    // Renderizar destacados primero (con datos filtrados)
    await renderizarDestacados(data);
    
    // Renderizar mejores por puesto
    renderizarMejoresPorPuesto(data);
    
    // Calcular rachas de todos los jugadores
    const rachas = await calcularRachasJugadores(data);
    
    // Función para crear el icono de racha
    const crearIconoRacha = (jugadorId) => {
      const racha = rachas[jugadorId];
      if (!racha || !racha.tipo || racha.cantidad < 2) {
        return '';
      }
      
      if (racha.tipo === 'win') {
        return `<span class="ms-2 badge bg-warning text-dark fw-bold" title="En racha de ${racha.cantidad} victorias">
                  🔥 ${racha.cantidad}
                </span>`;
      } else if (racha.tipo === 'defeat') {
        return `<span class="ms-2 badge bg-info text-dark fw-bold" title="En racha de ${racha.cantidad} derrotas">
                  ❄️ ${racha.cantidad}
                </span>`;
      }
      return '';
    };
    
    // Función para crear badges de colores según el valor
    const createBadge = (value, type = 'default') => {
      const val = value ?? 0;
      let colorClass = 'bg-secondary';
      if (type === 'winrate') {
        if (val >= 70) colorClass = 'bg-success';
        else if (val >= 50) colorClass = 'bg-warning';
        else colorClass = 'bg-danger';
      } else if (type === 'points') {
        if (val >= 100) colorClass = 'bg-success';
        else if (val >= 50) colorClass = 'bg-warning';
        else colorClass = 'bg-secondary';
      }
      return `<span class="badge ${colorClass}">${val}</span>`;
    };

    // Función para mostrar posiciones con iconos
    const mostrarPosiciones = (jugadorPosiciones) => {
      if (!jugadorPosiciones || jugadorPosiciones.length === 0) {
        return '<span class="text-muted small">Sin posición</span>';
      }
      
      const primaria = jugadorPosiciones.find(jp => jp.es_primaria);
      const secundaria = jugadorPosiciones.find(jp => !jp.es_primaria);
      
      let html = '';
      if (primaria) {
        const icono = iconosPosiciones[primaria.posicion_id] || '❓';
        const nombre = nombresPosiciones[primaria.posicion_id] || 'N/A';
        html += `<span class="badge bg-primary me-1" title="Posición Principal">${icono} ${nombre}</span>`;
      }
      if (secundaria) {
        const icono = iconosPosiciones[secundaria.posicion_id] || '❓';
        const nombre = nombresPosiciones[secundaria.posicion_id] || 'N/A';
        html += `<span class="badge bg-outline-secondary" title="Posición Secundaria">${icono} ${nombre}</span>`;
      }
      
      return html || '<span class="text-muted small">Sin posición</span>';
    };

    // Calcular skill individual para todos los jugadores
    const calcularSkillIndividual = (jugador) => {
      const pj = jugador.pj || 1;
      const golesPP = (jugador.goles || 0) / pj;
      const mvpPP = (jugador.mvp_count || 0) / pj;
      const acePP = (jugador.ace_count || 0) / pj;
      const asistPP = (jugador.asistencias || 0) / pj;
      const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
      const puntosPP = (jugador.total_puntos || 0) / pj;
      const atajadasPP = (jugador.atajadas || 0) / pj;
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
      const rendArquero = atajadasPP * 1;
      
      return rendAtaque + rendArquero;
    };

    // Calcular min y max para el espectro de colores
    const skills = data.map(j => calcularSkillIndividual(j));
    const minSkill = Math.min(...skills);
    const maxSkill = Math.max(...skills);
    
    // Función para obtener color según skill
    const obtenerColorSkill = (skill) => {
      const normalizado = (skill - minSkill) / (maxSkill - minSkill || 1);
      
      if (normalizado >= 0.8) return 'skill-excellent'; // Verde brillante
      if (normalizado >= 0.6) return 'skill-good';      // Verde
      if (normalizado >= 0.4) return 'skill-average';   // Amarillo
      if (normalizado >= 0.2) return 'skill-below';     // Naranja
      return 'skill-poor';                              // Rojo
    };

    data.forEach((jugadorData, index) => {
      const tr = document.createElement('tr');
      
      // Crear badge de posición
      const posicion = index + 1;
      let positionClass = 'position-other';
      if (posicion === 1) positionClass = 'position-1';
      else if (posicion === 2) positionClass = 'position-2';
      else if (posicion === 3) positionClass = 'position-3';
      
      const skillIndividual = calcularSkillIndividual(jugadorData);
      const colorSkill = obtenerColorSkill(skillIndividual);

      tr.innerHTML = `
        <td class="text-center">
          <div class="position-badge ${positionClass}">${posicion}</div>
        </td>
        <td class="text-center">
          <span class="badge ${colorSkill} fw-bold" title="Skill Individual">
            ${skillIndividual.toFixed(1)}
          </span>
        </td>
        <td class="fw-bold text-white">
          <div class="d-flex align-items-center justify-content-start">
            <span class="text-truncate me-1">${jugadorData.jugadores.nombre}</span>
            ${crearIconoRacha(jugadorData.jugadores.id)}
          </div>
        </td>
        <td>${mostrarPosiciones(jugadorData.jugadores.jugador_posicion)}</td>
        <td class="text-center">${createBadge(jugadorData.total_puntos, 'points')}</td>
        <td class="text-center">${createBadge(jugadorData.winrate, 'winrate')}%</td>
        <td class="text-center"><span class="badge bg-outline-light">${jugadorData.pj}</span></td>
        <td class="text-center"><span class="badge bg-success">${jugadorData.pg}</span></td>
        <td class="text-center"><span class="badge bg-warning">${jugadorData.pe}</span></td>
        <td class="text-center"><span class="badge bg-danger">${jugadorData.pp}</span></td>
        <td class="text-center fw-semibold text-success">${jugadorData.goles}</td>
        <td class="text-center fw-semibold text-info">${jugadorData.asistencias}</td>
        <td class="text-center fw-semibold text-danger">${jugadorData.cagadas_en_gol}</td>
        <td class="text-center"><span class="badge bg-primary">${jugadorData.mvp_count}</span></td>
        <td class="text-center"><span class="badge bg-secondary">${jugadorData.ace_count}</span></td>
        <td class="text-center fw-semibold text-warning">${jugadorData.atajadas}</td>
        <td class="text-center fw-semibold text-light">${jugadorData.capitan_defeat}</td>
        <td class="text-center fw-semibold text-light">${jugadorData.bita_defeat}</td>
        <td class="text-center">
          <div class="btn-group" role="group">
            <button onclick="abrirModalEditar('${jugadorData.jugadores.id}')" class="btn btn-sm btn-outline-primary" title="Editar jugador">
              <i class="bi bi-pencil"></i>
            </button>
            <button onclick="eliminarJugador('${jugadorData.jugadores.id}', '${jugadorData.jugadores.nombre}')" class="btn btn-sm btn-outline-danger" title="Eliminar jugador">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    // Aplicar highlight después de renderizar
    setTimeout(() => {
      updateSortIndicators();
    }, 10);
  }

  // --- Event Listeners ---
  if (btnAddGol) {
    btnAddGol.addEventListener('click', agregarEvento);
  }
  if (btnCargarPartido) {
    btnCargarPartido.addEventListener('click', cargarPartido);
  }

  if (playerForm) {
    playerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('Player form submitted');
    const form = e.target;
    const nombre = form.nombre.value.trim();
    const posicionPrimaria = form.posicion_primaria.value;
    const posicionSecundaria = form.posicion_secundaria.value;
    const pulmon = parseFloat(form.pulmon.value) || null;

    if (!nombre) {
      showToast('Por favor ingresa el nombre del jugador.', 'warning');
      return;
    }

    if (!posicionPrimaria) {
      showToast('Por favor selecciona una posición principal.', 'warning');
      return;
    }

    // Verificar que las posiciones no sean iguales
    if (posicionPrimaria === posicionSecundaria) {
      showToast('La posición principal y secundaria no pueden ser iguales.', 'warning');
      return;
    }

    try {
      if (jugadorEditando) {
        // MODO EDICIÓN
        await editarJugador(jugadorEditando.id, nombre, posicionPrimaria, posicionSecundaria, pulmon);
        showToast('Jugador actualizado exitosamente!', 'success');
      } else {
        // MODO AGREGAR
        await agregarJugador(nombre, posicionPrimaria, posicionSecundaria, pulmon);
        showToast('Jugador agregado exitosamente!', 'success');
      }

      // Cerrar modal usando Bootstrap
      const modal = bootstrap.Modal.getInstance(document.getElementById('playerModal'));
      if (modal) {
        modal.hide();
      }
      form.reset();
      jugadorEditando = null;
      cargarEstadisticas();
      cargarTodosLosJugadores(); // Actualizar lista de jugadores
      renderizarEquipos(); // Actualizar equipos si hay jugadores cargados

    } catch (error) {
      console.error('Error al procesar jugador:', error);
      const accion = jugadorEditando ? 'actualizar' : 'agregar';
      showToast(`Error al ${accion} el jugador: ${error.message}`, 'error');
    }
  });
  }

  // Función para agregar un nuevo jugador
  async function agregarJugador(nombre, posicionPrimaria, posicionSecundaria, pulmon = null) {
    // Insertar el jugador
    const jugadorObject = { nombre: nombre };
    if (pulmon !== null) {
      jugadorObject.pulmon = pulmon;
    }
    
    const { data: jugadorData, error: jugadorError } = await supabase
      .from('jugadores')
      .insert([jugadorObject])
      .select();
    
    if (jugadorError) {
      throw jugadorError;
    }

    const jugadorId = jugadorData[0].id;
    await asignarPosicionesJugador(jugadorId, posicionPrimaria, posicionSecundaria);
  }

  // Función para editar un jugador existente
  async function editarJugador(jugadorId, nombre, posicionPrimaria, posicionSecundaria, pulmon = null) {
    // Actualizar nombre del jugador
    const updateObject = { nombre: nombre };
    if (pulmon !== null) {
      updateObject.pulmon = pulmon;
    }
    
    const { error: jugadorError } = await supabase
      .from('jugadores')
      .update(updateObject)
      .eq('id', jugadorId);
    
    if (jugadorError) {
      throw jugadorError;
    }

    // Eliminar posiciones existentes
    const { error: deleteError } = await supabase
      .from('jugador_posicion')
      .delete()
      .eq('jugador_id', jugadorId);

    if (deleteError) {
      throw deleteError;
    }

    // Asignar nuevas posiciones
    await asignarPosicionesJugador(jugadorId, posicionPrimaria, posicionSecundaria);
  }

  // Función auxiliar para asignar posiciones a un jugador
  async function asignarPosicionesJugador(jugadorId, posicionPrimaria, posicionSecundaria) {
    const posicionesAInsertar = [];
    
    // Posición principal
    posicionesAInsertar.push({
      jugador_id: jugadorId,
      posicion_id: posicionPrimaria,
      es_primaria: true
    });

    // Posición secundaria (si existe)
    if (posicionSecundaria) {
      posicionesAInsertar.push({
        jugador_id: jugadorId,
        posicion_id: posicionSecundaria,
        es_primaria: false
      });
    }

    const { error: posicionError } = await supabase
      .from('jugador_posicion')
      .insert(posicionesAInsertar);

    if (posicionError) {
      throw posicionError;
    }
  }

  // ===============================
  // ANÁLISIS DE ÚLTIMAS ACTUALIZACIONES
  // ===============================
  
  // Función para analizar cambios y actualizaciones recientes
  async function analizarUltimasActualizaciones(partidos) {
    if (!partidos || partidos.length < 1) {
      return null; // No hay partidos para analizar
    }
    
    const actualizaciones = {
      cambios_score: [],
      rachas_notables: [],
      eventos_destacados: [],
      cambios_ranking: []
    };
    
    try {
      // Obtener estadísticas actuales
      const estadisticasActuales = window.datosJugadores || [];
      
      // Obtener el último partido
      const ultimoPartido = partidos[0];
      
      // Analizar cambios de score basados en el último partido
      await analizarCambiosScore(ultimoPartido, actualizaciones);
      
      // Analizar rachas de los jugadores
      await analizarRachasNotables(estadisticasActuales, actualizaciones);
      
      // Analizar eventos destacados del último partido
      analizarEventosDestacados(ultimoPartido, actualizaciones);
      
      // Analizar cambios de ranking
      await analizarCambiosRanking(ultimoPartido, actualizaciones);
      
      return actualizaciones;
      
    } catch (error) {
      console.error('Error al analizar actualizaciones:', error);
      return null;
    }
  }
  
  // Analizar cambios de score en el último partido
  async function analizarCambiosScore(partido, actualizaciones) {
    if (!partido.jugador_partido) return;
    
    partido.jugador_partido.forEach(jp => {
      let puntosPartido = 0;
      
      // Calcular puntos según resultado del partido
      if (partido.equipo_ganador === jp.equipo) {
        puntosPartido = 3; // Victoria
      } else if (partido.equipo_ganador === null) {
        puntosPartido = 1; // Empate
      }
      
      // Contar goles y asistencias reales
      const goles = partido.goles?.filter(g => g.goleador_id === jp.jugador_id).length || 0;
      const asistencias = partido.goles?.filter(g => g.asistidor_id === jp.jugador_id).length || 0;
      
      let cambio = {
        jugador: jp.jugadores?.nombre || 'Jugador',
        puntos_partido: puntosPartido,
        goles: goles,
        asistencias: asistencias,
        mvp: jp.mvp,
        ace: jp.ace,
        atajadas: jp.atajadas || 0,
        cagadas: jp.cagadas || 0
      };
      
      // Solo agregar si hubo actividad significativa
      if (goles > 0 || asistencias > 0 || jp.mvp || jp.ace || (jp.atajadas && jp.atajadas > 0)) {
        actualizaciones.cambios_score.push(cambio);
      }
    });
  }
  
  // Analizar rachas notables
  async function analizarRachasNotables(estadisticasActuales, actualizaciones) {
    if (estadisticasActuales.length === 0) return;
    
    // Calcular rachas de todos los jugadores
    const rachas = await calcularRachasJugadores(estadisticasActuales);
    
    Object.keys(rachas).forEach(jugadorId => {
      const racha = rachas[jugadorId];
      const jugador = estadisticasActuales.find(j => j.jugadores?.id === jugadorId);
      
      // Solo mostrar rachas significativas (3 o más)
      if (racha.cantidad >= 3 && jugador) {
        actualizaciones.rachas_notables.push({
          jugador: jugador.jugadores.nombre,
          tipo: racha.tipo,
          cantidad: racha.cantidad,
          emoji: racha.tipo === 'win' ? '🔥' : '❄️'
        });
      }
    });
  }
  
  // Analizar eventos destacados del último partido
  function analizarEventosDestacados(partido, actualizaciones) {
    // MVP y ACE
    const mvp = partido.jugador_partido?.find(jp => jp.mvp);
    const ace = partido.jugador_partido?.find(jp => jp.ace);
    
    if (mvp) {
      actualizaciones.eventos_destacados.push({
        tipo: 'mvp',
        descripcion: `👑 ${mvp.jugadores?.nombre} fue elegido MVP`,
        emoji: '👑',
        jugador: mvp.jugadores?.nombre
      });
    }
    
    if (ace) {
      actualizaciones.eventos_destacados.push({
        tipo: 'ace',
        descripcion: `⭐ ${ace.jugadores?.nombre} fue el ACE del partido`,
        emoji: '⭐',
        jugador: ace.jugadores?.nombre
      });
    }
    
    // Calcular marcador real
    let goles1 = 0, goles2 = 0;
    if (partido.goles) {
      partido.goles.forEach(gol => {
        const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === gol.goleador_id);
        if (jugadorData) {
          const esEnContra = gol.equipo !== jugadorData.equipo;
          if (esEnContra) {
            if (jugadorData.equipo === 1) goles2++;
            else goles1++;
          } else {
            if (jugadorData.equipo === 1) goles1++;
            else goles2++;
          }
        }
      });
    }
    
    // Goleadas
    const diferencia = Math.abs(goles1 - goles2);
    if (diferencia >= 4) {
      const equipoGanador = goles1 > goles2 ? 'Equipo 1' : 'Equipo 2';
      actualizaciones.eventos_destacados.push({
        tipo: 'goleada',
        descripcion: `🎯 ¡Goleada épica! ${equipoGanador} ganó ${Math.max(goles1, goles2)}-${Math.min(goles1, goles2)}`,
        emoji: '🎯'
      });
    }
    
    // Hat-tricks
    if (partido.goles) {
      const golesPorJugador = {};
      partido.goles.forEach(gol => {
        if (gol.goleador_id) {
          golesPorJugador[gol.goleador_id] = (golesPorJugador[gol.goleador_id] || 0) + 1;
        }
      });
      
      Object.keys(golesPorJugador).forEach(jugadorId => {
        const goles = golesPorJugador[jugadorId];
        if (goles >= 3) {
          const jugador = partido.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
          actualizaciones.eventos_destacados.push({
            tipo: 'hat_trick',
            descripcion: `⚽⚽⚽ ¡Hat-trick de ${jugador?.jugadores?.nombre}! (${goles} goles)`,
            emoji: '⚽',
            jugador: jugador?.jugadores?.nombre
          });
        }
      });
    }
    
    // Atajadas excepcionales
    const atajadasDestacadas = partido.jugador_partido?.filter(jp => jp.atajadas && jp.atajadas >= 5);
    atajadasDestacadas?.forEach(jp => {
      actualizaciones.eventos_destacados.push({
        tipo: 'atajadas',
        descripcion: `🥅 ¡Actuación brillante de ${jp.jugadores?.nombre}! (${jp.atajadas} atajadas)`,
        emoji: '🥅',
        jugador: jp.jugadores?.nombre
      });
    });
    
    // Cagadas destacadas
    const cagadasDestacadas = partido.jugador_partido?.filter(jp => jp.cagadas && jp.cagadas >= 3);
    cagadasDestacadas?.forEach(jp => {
      actualizaciones.eventos_destacados.push({
        tipo: 'cagadas',
        descripcion: `💥 ${jp.jugadores?.nombre} tuvo una tarde complicada (${jp.cagadas} cagadas)`,
        emoji: '💥',
        jugador: jp.jugadores?.nombre
      });
    });
  }
  
  // Analizar cambios de ranking basados en el último partido
  async function analizarCambiosRanking(ultimoPartido, actualizaciones) {
    if (!ultimoPartido.jugador_partido || ultimoPartido.jugador_partido.length === 0) return;
    
    try {
      // Obtener estadísticas actuales (con el último partido incluido)
      const estadisticasActuales = window.datosJugadores || [];
      if (estadisticasActuales.length === 0) return;
      
      // Función para calcular rendimiento individual
      const calcularRendimiento = (jugador) => {
        const pj = jugador.pj || 1;
        
        // Rendimiento Ataque: (Goles P/P * 5) + (MVP P/P * 7) + (ACE P/P * 6) + (Asist P/P * 4) - (Cagadas P/P * 5) + (Puntos P/P * 2)
        const golesPP = (jugador.goles || 0) / pj;
        const mvpPP = (jugador.mvp_count || 0) / pj;
        const acePP = (jugador.ace_count || 0) / pj;
        const asistPP = (jugador.asistencias || 0) / pj;
        const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
        const puntosPP = (jugador.total_puntos || 0) / pj;
        const atajadasPP = (jugador.atajadas || 0) / pj;
        
        const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
        const rendArquero = atajadasPP * 1;
        
        return rendAtaque + rendArquero;
      };
      
      // Crear ranking actual ordenado por rendimiento individual
      const rankingActual = [...estadisticasActuales]
        .sort((a, b) => calcularRendimiento(b) - calcularRendimiento(a))
        .map((jugador, index) => ({
          posicion: index + 1,
          jugador_id: jugador.jugadores?.id,
          nombre: jugador.jugadores?.nombre,
          rendimiento: calcularRendimiento(jugador)
        }));
      
      // Simular estadísticas anteriores (sin el último partido)
      // Restamos las estadísticas del último partido para calcular el ranking anterior
      const jugadoresDelPartido = new Set(ultimoPartido.jugador_partido.map(jp => jp.jugador_id));
      const estadisticasAnteriores = estadisticasActuales.map(jugador => {
        if (!jugadoresDelPartido.has(jugador.jugadores?.id)) {
          return jugador; // No participó en el último partido, no cambió
        }
        
        // Encontrar datos del jugador en el último partido
        const jpData = ultimoPartido.jugador_partido.find(jp => jp.jugador_id === jugador.jugadores?.id);
        if (!jpData) return jugador;
        
        // Calcular estadísticas del último partido
        let puntosPartido = 0;
        if (ultimoPartido.equipo_ganador === jpData.equipo) {
          puntosPartido = 3; // Victoria
        } else if (ultimoPartido.equipo_ganador === null) {
          puntosPartido = 1; // Empate
        }
        
        // Contar goles y asistencias reales del último partido
        const golesUltimoPartido = ultimoPartido.goles?.filter(g => g.goleador_id === jpData.jugador_id).length || 0;
        const asistenciasUltimoPartido = ultimoPartido.goles?.filter(g => g.asistidor_id === jpData.jugador_id).length || 0;
        
        // Restar estadísticas del último partido para simular estadísticas anteriores
        return {
          ...jugador,
          pj: Math.max(1, (jugador.pj || 1) - 1),
          total_puntos: Math.max(0, (jugador.total_puntos || 0) - puntosPartido),
          goles: Math.max(0, (jugador.goles || 0) - golesUltimoPartido),
          asistencias: Math.max(0, (jugador.asistencias || 0) - asistenciasUltimoPartido),
          cagadas_en_gol: Math.max(0, (jugador.cagadas_en_gol || 0) - (jpData.cagadas || 0)),
          atajadas: Math.max(0, (jugador.atajadas || 0) - (jpData.atajadas || 0)),
          mvp_count: Math.max(0, (jugador.mvp_count || 0) - (jpData.mvp ? 1 : 0)),
          ace_count: Math.max(0, (jugador.ace_count || 0) - (jpData.ace ? 1 : 0))
        };
      });
      
      // Crear ranking anterior basado en rendimiento
      const rankingAnterior = [...estadisticasAnteriores]
        .sort((a, b) => calcularRendimiento(b) - calcularRendimiento(a))
        .map((jugador, index) => ({
          posicion: index + 1,
          jugador_id: jugador.jugadores?.id,
          nombre: jugador.jugadores?.nombre,
          rendimiento: calcularRendimiento(jugador)
        }));
      
      // Comparar rankings y encontrar cambios
      ultimoPartido.jugador_partido.forEach(jp => {
        const jugadorId = jp.jugador_id;
        const nombreJugador = jp.jugadores?.nombre;
        
        const datosActuales = rankingActual.find(r => r.jugador_id === jugadorId);
        const datosAnteriores = rankingAnterior.find(r => r.jugador_id === jugadorId);
        
        const posicionActual = datosActuales?.posicion;
        const posicionAnterior = datosAnteriores?.posicion;
        const skillActual = datosActuales?.rendimiento || 0;
        const skillAnterior = datosAnteriores?.rendimiento || 0;
        const cambioSkill = skillActual - skillAnterior;
        
        if (posicionActual && posicionAnterior && posicionActual !== posicionAnterior) {
          const cambio = posicionAnterior - posicionActual; // Positivo = subió, negativo = bajó
          
          actualizaciones.cambios_ranking.push({
            jugador: nombreJugador,
            posicion_actual: posicionActual,
            posicion_anterior: posicionAnterior,
            cambio: cambio,
            skill_actual: skillActual,
            skill_anterior: skillAnterior,
            cambio_skill: cambioSkill,
            subio: cambio > 0,
            icono: cambio > 0 ? '📈' : '📉'
          });
        } else if (posicionActual && nombreJugador) {
          // Jugador que participó pero sin cambio de posición
          actualizaciones.cambios_ranking.push({
            jugador: nombreJugador,
            posicion_actual: posicionActual,
            posicion_anterior: posicionActual,
            cambio: 0,
            skill_actual: skillActual,
            skill_anterior: skillAnterior,
            cambio_skill: cambioSkill,
            subio: null,
            icono: '➡️'
          });
        }
      });
      
      // Ordenar por posición actual para mostrar desde el mejor
      actualizaciones.cambios_ranking.sort((a, b) => a.posicion_actual - b.posicion_actual);
      
    } catch (error) {
      console.error('Error al analizar cambios de ranking:', error);
    }
  }
  

  
  // Función para renderizar la card de actualizaciones
  function renderizarCardActualizaciones(actualizaciones) {
    if (!actualizaciones) return '';
    
    const fecha = new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    

    
    let rankingHtml = '';
    if (actualizaciones.cambios_ranking.length > 0) {
      rankingHtml = actualizaciones.cambios_ranking.map(cambio => {
        let badgeClass = 'bg-secondary';
        let iconoGrande = cambio.icono;
        let cambioTexto = '';
        
        if (cambio.cambio > 0) {
          // Subidas - iconos dependiendo de la magnitud
          if (cambio.cambio >= 5) {
            iconoGrande = '🚀'; // Subida grande
            cambioTexto = `<span class="text-success fw-bold small">🚀 ${cambio.cambio} posiciones</span>`;
          } else if (cambio.cambio >= 3) {
            iconoGrande = '⭐'; // Subida notable  
            cambioTexto = `<span class="text-success fw-bold small">⭐ ${cambio.cambio} posiciones</span>`;
          } else {
            iconoGrande = '⬆️'; // Subida pequeña
            cambioTexto = `<span class="text-success fw-bold small">⬆️ ${cambio.cambio} posiciones</span>`;
          }
        } else if (cambio.cambio < 0) {
          // Bajadas - iconos dependiendo de la magnitud
          const bajada = Math.abs(cambio.cambio);
          if (bajada >= 5) {
            iconoGrande = '💥'; // Bajada grande
            cambioTexto = `<span class="text-danger fw-bold small">💥 ${bajada} posiciones</span>`;
          } else if (bajada >= 3) {
            iconoGrande = '⚡'; // Bajada notable
            cambioTexto = `<span class="text-danger fw-bold small">⚡ ${bajada} posiciones</span>`;
          } else {
            iconoGrande = '⬇️'; // Bajada pequeña
            cambioTexto = `<span class="text-danger fw-bold small">⬇️ ${bajada} posiciones</span>`;
          }
        } else {
          iconoGrande = '⚖️';
          cambioTexto = `<span class="text-info fw-bold small">⚖️ Sin cambios</span>`;
        }
        
        // Formatear cambio de skill
        const skillTexto = cambio.cambio_skill !== undefined ? 
          `<div class="skill-change-text" style="font-size: 0.75rem;">
            <span class="text-info fw-bold">⚡ ${cambio.skill_actual.toFixed(1)}</span>
            ${cambio.cambio_skill > 0 ? 
              `<span class="text-success fw-bold"> (+${cambio.cambio_skill.toFixed(1)})</span>` : 
              cambio.cambio_skill < 0 ? 
                `<span class="text-danger fw-bold"> (${cambio.cambio_skill.toFixed(1)})</span>` : 
                `<span class="text-muted"> (sin cambio)</span>`
            }
          </div>` : '';

        return `
          <div class="col-lg-4 col-md-6 mb-2">
            <div class="ranking-change-item p-3 rounded border" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); min-height: 90px;">
              <div class="d-flex align-items-start justify-content-between">
                <div class="d-flex align-items-center">
                  <div class="ranking-icon me-3" style="font-size: 1.8rem;">${iconoGrande}</div>
                  <div>
                    <div class="fw-bold text-white mb-1" style="font-size: 1rem;">${cambio.jugador}</div>
                    <div class="text-light-emphasis" style="font-size: 0.8rem;">Posición #${cambio.posicion_actual}</div>
                    ${skillTexto}
                  </div>
                </div>
                <div class="text-end">
                  <div style="font-size: 0.85rem;">
                    ${cambioTexto}
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    return `
      <div class="col-12 mb-5">
        <div class="glass-effect rounded-3 p-5 border-top border-5 border-primary" style="box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);">
          <div class="d-flex align-items-center justify-content-between mb-4">
            <h3 class="text-primary fw-bold mb-0" style="font-size: 1.8rem;">
              <i class="bi bi-newspaper me-3"></i>📈 Últimas Actualizaciones
            </h3>
            <div class="text-light-emphasis" style="font-size: 1rem;">
              <i class="bi bi-clock me-2"></i>${fecha}
            </div>
          </div>
          
          ${rankingHtml ? `
            <div class="bg-primary bg-opacity-10 rounded-3 p-4 border border-primary border-opacity-25" style="box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);">
              <div class="d-flex align-items-center justify-content-between mb-4">
                <div>
                  <h5 class="text-primary fw-bold mb-1 cursor-pointer" onclick="irARankingSkill()" style="font-size: 1.3rem;">
                    📊 Cambios en el Ranking de Skill
                  </h5>
                  <small class="text-light-emphasis" style="font-size: 0.9rem;">${actualizaciones.cambios_ranking.length} jugadores participaron en el último partido</small>
                </div>
                <div class="text-primary" onclick="irARankingSkill()" style="cursor: pointer; font-size: 1.2rem;" title="Ver ranking completo">
                  <i class="bi bi-box-arrow-up-right"></i>
                </div>
              </div>
              <div class="ranking-changes-container">
                <div class="row g-3 justify-content-center">
                  ${rankingHtml}
                </div>
              </div>
              <div class="mt-3 pt-3 border-top border-primary border-opacity-25">
                <div class="text-center">
                  <div class="text-light-emphasis" style="font-size: 0.9rem;">
                    <div class="mb-1">
                      <span class="text-success fw-bold">🚀⭐⬆️</span> Subió en ranking • 
                      <span class="text-danger fw-bold">💥⚡⬇️</span> Bajó en ranking • 
                      <span class="text-info fw-bold">⚖️</span> Mantuvo posición
                    </div>
                    <div class="small">
                      <span class="text-muted">Skill = Rendimiento individual calculado por estadísticas del partido</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ` : ''}
          
          ${!rankingHtml ? `
            <div class="text-center py-5">
              <div class="text-light-emphasis" style="font-size: 1.1rem;">
                <i class="bi bi-info-circle me-2 fs-4"></i>
                <div class="mt-2">Registra más partidos para ver actualizaciones interesantes</div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  // --- Función para cargar historial de partidos ---
  async function cargarHistorialPartidos() {
    const container = document.getElementById('historial-partidos-container');
    if (!container) {
      console.error('❌ Container historial-partidos-container NO encontrado!');
      return;
    }
    
    try {
      // Mostrar loading
      container.innerHTML = `
        <div class="col-12 text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando...</span>
          </div>
          <p class="text-light-emphasis mt-2 mb-0">Buscando partidos...</p>
        </div>
      `;
      
      // Obtener temporada seleccionada para filtrar
      const selectorTemporada = document.getElementById('selector-temporada');
      const selectorTemporadaMobile = document.getElementById('selector-temporada-mobile');
      const temporadaSeleccionada = selectorTemporada?.value || selectorTemporadaMobile?.value || '';
      
      // Obtener cantidad de partidos a mostrar
      const cantidadElement = document.getElementById('cantidad-partidos');
      const cantidad = parseInt(cantidadElement?.value) || 5;
      
      // Construir consulta con filtro de temporada si está seleccionada
      let query = supabase
        .from('partidos')
        .select(`
          *,
          temporadas (
            id,
            nombre
          ),
          jugador_partido (
            jugador_id,
            equipo,
            goles,
            asistencias,
            cagadas,
            mvp,
            ace,
            atajadas,
            puntos,
            jugadores (
              id,
              nombre
            )
          ),
          goles (
            id,
            goleador_id,
            asistidor_id,
            equipo,
            minuto
          )
        `);
      
      // Aplicar filtro de temporada si está seleccionada
      if (temporadaSeleccionada && temporadaSeleccionada !== '') {
        console.log('🏆 Aplicando filtro de temporada:', temporadaSeleccionada);
        query = query.eq('temporada_id', temporadaSeleccionada);
      }
      
      // Aplicar orden y límite
      const { data: partidos, error } = await query
        .order('fecha', { ascending: false })
        .limit(cantidad);
      
      console.log('📊 Resultado consulta partidos:', { partidos, error });

      if (error) {
        console.warn('⚠️ Error al cargar partidos:', error);
        mostrarMensajeSinPartidos(container);
        return;
      }

      console.log('✅ Consulta exitosa, partidos encontrados:', partidos?.length || 0);
      
      if (!partidos || partidos.length === 0) {
        console.log('ℹ️ No hay partidos para mostrar');
        mostrarMensajeSinPartidos(container);
        return;
      }

      // Obtener IDs únicos de jugadores para buscar sus nombres
      const jugadorIds = new Set();
      partidos.forEach(partido => {
        partido.goles?.forEach(gol => {
          if (gol.goleador_id) jugadorIds.add(gol.goleador_id);
          if (gol.asistidor_id) jugadorIds.add(gol.asistidor_id);
        });
      });

      // Cargar datos de jugadores si hay goles
      let jugadoresMap = {};
      if (jugadorIds.size > 0) {
        const { data: jugadores } = await supabase
          .from('jugadores')
          .select('id, nombre')
          .in('id', Array.from(jugadorIds));
        
        if (jugadores) {
          jugadores.forEach(jugador => {
            jugadoresMap[jugador.id] = jugador;
          });
        }
      }

      // Agregar información de jugadores a los goles
      partidos.forEach(partido => {
        partido.goles?.forEach(gol => {
          if (gol.goleador_id && jugadoresMap[gol.goleador_id]) {
            gol.goleador = jugadoresMap[gol.goleador_id];
          }
          if (gol.asistidor_id && jugadoresMap[gol.asistidor_id]) {
            gol.asistidor = jugadoresMap[gol.asistidor_id];
          }
        });
      });

      console.log('🎯 Mostrando partidos en la interfaz...');
      
      // Guardar todos los partidos para el filtrado
      todosLosPartidos = partidos;
      
      // Aplicar filtro de búsqueda si existe
      const busqueda = document.getElementById('buscar-jugador')?.value?.toLowerCase().trim() || '';
      let partidosAMostrar = partidos;
      
      if (busqueda) {
        partidosAMostrar = partidos.filter(partido => {
          return partido.jugador_partido?.some(jp => 
            jp.jugadores?.nombre?.toLowerCase().includes(busqueda)
          );
        });
      }
      
      mostrarPartidosBasicos(container, partidosAMostrar);
      
    } catch (error) {
      console.warn('Error al cargar historial (esperado en versión simplificada):', error);
      mostrarMensajeSinPartidos(container);
    }
  }

  function mostrarMensajeSinPartidos(container) {
    container.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-calendar-x fs-1 text-muted mb-3"></i>
        <h5 class="text-muted">No hay partidos registrados</h5>
        <p class="text-light-emphasis mb-4">
          El historial de partidos aparecerá aquí cuando comiences a registrar partidos.<br>
          Arma tus equipos y registra tu primer partido para ver el historial.
        </p>
        <div class="alert alert-info d-inline-block mb-3">
          <i class="bi bi-info-circle me-2"></i>
          <strong>Tip:</strong> Usa la sección "Armado de Equipos" para formar equipos y luego registra partidos.
        </div>
        <div class="mt-4">
          <button onclick="crearPartidosDummy()" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-plus-circle me-2"></i>
            Crear Partidos de Prueba
          </button>
        </div>
      </div>
    `;
  }
  
  // Función para crear partidos dummy para testing
  async function crearPartidosDummy() {
    try {
      console.log('🧪 Creando partidos de prueba...');
      
      // Verificar si hay temporadas
      const { data: temporadas } = await supabase.from('temporadas').select('id').limit(1);
      let temporadaId = temporadas?.[0]?.id || null;
      
      if (!temporadaId) {
        // Crear una temporada si no existe
        const { data: nuevaTemporada } = await supabase
          .from('temporadas')
          .insert([{ nombre: 'Temporada de Prueba', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' }])
          .select()
          .single();
        temporadaId = nuevaTemporada?.id;
      }
      
      const partidosEjemplo = [
        {
          fecha: '2024-01-15',
          cancha: 'Cancha Central',
          resultado: '5-3',
          equipo_ganador: 1,
          temporada_id: temporadaId
        },
        {
          fecha: '2024-01-22',
          cancha: 'Cancha Norte',
          resultado: '2-4',
          equipo_ganador: 2,
          temporada_id: temporadaId
        },
        {
          fecha: '2024-01-29',
          cancha: 'Cancha Sur',
          resultado: '3-3',
          equipo_ganador: null,
          temporada_id: temporadaId
        }
      ];
      
      const { error } = await supabase
        .from('partidos')
        .insert(partidosEjemplo);
        
      if (error) {
        console.error('Error al crear partidos dummy:', error);
        showToast('Error al crear partidos de prueba: ' + error.message, 'error');
        return;
      }
      
      showToast('✅ Partidos de prueba creados exitosamente!', 'success');
      
      // Recargar el historial
      setTimeout(() => {
        cargarHistorialPartidos();
      }, 500);
      
    } catch (error) {
      console.error('Error creando partidos dummy:', error);
      showToast('Error inesperado al crear partidos de prueba', 'error');
    }
  }
  
  // Hacer la función global
  window.crearPartidosDummy = crearPartidosDummy;

  async function mostrarPartidosBasicos(container, partidos) {
    console.log('🎨 Mostrando partidos con detalles completos:', partidos);
    
    // Analizar actualizaciones y generar card
    const actualizaciones = await analizarUltimasActualizaciones(partidos);
    
    let html = '<div class="row g-4">';
    
    // Agregar card de actualizaciones al inicio
    html += renderizarCardActualizaciones(actualizaciones);
    
    // Continuar con los partidos
    partidos.forEach((partido, index) => {
      // Arreglar problema de zona horaria - agregar tiempo para evitar offset
      const fechaCorregida = new Date(partido.fecha + 'T12:00:00');
      const fecha = fechaCorregida.toLocaleDateString('es-ES', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      // Separar jugadores por equipo
      const equipo1 = partido.jugador_partido?.filter(jp => jp.equipo === 1) || [];
      const equipo2 = partido.jugador_partido?.filter(jp => jp.equipo === 2) || [];
      
      // Calcular marcador desde los goles registrados
      let golesEquipo1 = 0;
      let golesEquipo2 = 0;
      
      if (partido.goles && partido.goles.length > 0) {
        partido.goles.forEach(gol => {
          const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === gol.goleador_id);
          if (jugadorData) {
            // Determinar si es gol en contra comparando el equipo del gol con el equipo del jugador
            const esEnContra = gol.equipo !== jugadorData.equipo;
            
            if (esEnContra) {
              // Gol en contra suma al equipo contrario
              if (jugadorData.equipo === 1) golesEquipo2++;
              else golesEquipo1++;
            } else {
              // Gol normal suma al propio equipo
              if (jugadorData.equipo === 1) golesEquipo1++;
              else golesEquipo2++;
            }
          }
        });
      }
      
      // Determinar ganador y color del card
      let equipoGanador = '';
      let colorCard = 'border-secondary';
      let iconoResultado = '🤝';
      
      if (partido.equipo_ganador === 1) {
        equipoGanador = 'Equipo 1';
        colorCard = 'border-primary';
        iconoResultado = '🏆';
      } else if (partido.equipo_ganador === 2) {
        equipoGanador = 'Equipo 2';
        colorCard = 'border-danger';
        iconoResultado = '🏆';
      } else {
        equipoGanador = 'Empate';
        iconoResultado = '🤝';
      }
      
      // Obtener MVP y ACE
      const mvpData = partido.jugador_partido?.find(jp => jp.mvp);
      const aceData = partido.jugador_partido?.find(jp => jp.ace);
      
      // Calcular estadísticas totales
      const totalCagadas = partido.jugador_partido?.reduce((sum, jp) => sum + (jp.cagadas || 0), 0) || 0;
      const totalAtajadas = partido.jugador_partido?.reduce((sum, jp) => sum + (jp.atajadas || 0), 0) || 0;
      
      html += `
        <div class="col-lg-6 col-md-12">
          <div class="glass-effect rounded-3 p-4 h-100 border-top border-3 ${colorCard} partido-card" data-partido-id="${partido.id}">
            <!-- Header del partido -->
            <div class="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h5 class="text-white fw-bold mb-1">
                  ${iconoResultado} Partido #${partidos.length - index}
                </h5>
                <div class="text-light-emphasis small">
                  <i class="bi bi-calendar me-1"></i>${fecha}
                  ${partido.cancha ? `<span class="ms-2"><i class="bi bi-geo-alt me-1"></i>${partido.cancha}</span>` : ''}
                </div>
                ${partido.temporadas ? `<div class="badge bg-info mt-2">${partido.temporadas.nombre}</div>` : ''}
              </div>
              <div class="text-end">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <div class="badge bg-primary fs-5 px-3 py-2">
                    ${golesEquipo1} - ${golesEquipo2}
                  </div>
                  <button onclick="console.log('🖱️ CLICK detectado en botón editar'); editarPartido('${partido.id}')" class="btn btn-sm btn-outline-warning" title="Editar partido">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button onclick="eliminarPartido('${partido.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar partido">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
                ${equipoGanador !== 'Empate' ? `<div class="text-success small fw-bold">🏆 ${equipoGanador}</div>` : '<div class="text-warning small fw-bold">🤝 Empate</div>'}
              </div>
            </div>
            
            <!-- Equipos -->
            <div class="row g-3 mb-3">
              <div class="col-6">
                <div class="bg-primary bg-opacity-10 rounded-2 p-2">
                  <h6 class="text-primary fw-bold mb-2 small">🔵 Equipo 1 (${equipo1.length})</h6>
                  <div class="text-white small">
                    ${equipo1.map(jp => {
                      // Calcular goles y asistencias reales desde la tabla goles
                      const golesJugador = partido.goles?.filter(gol => gol.goleador_id === jp.jugador_id).length || 0;
                      const asistenciasJugador = partido.goles?.filter(gol => gol.asistidor_id === jp.jugador_id).length || 0;
                      
                      const stats = [];
                      if (golesJugador > 0) stats.push(`⚽${golesJugador}`);
                      if (asistenciasJugador > 0) stats.push(`🅰️${asistenciasJugador}`);
                      if (jp.atajadas > 0) stats.push(`🥅${jp.atajadas}`);
                      if (jp.cagadas > 0) stats.push(`💥${jp.cagadas}`);
                      
                      return `
                        <div class="mb-1 d-flex justify-content-between align-items-center">
                          <span>${jp.jugadores?.nombre || 'Jugador'}</span>
                          ${stats.length > 0 ? `<span class="text-light-emphasis small">${stats.join(' ')}</span>` : ''}
                        </div>
                      `;
                    }).join('')}
                    ${equipo1.length === 0 ? '<div class="text-muted">Sin jugadores registrados</div>' : ''}
                  </div>
                </div>
              </div>
              <div class="col-6">
                <div class="bg-danger bg-opacity-10 rounded-2 p-2">
                  <h6 class="text-danger fw-bold mb-2 small">🔴 Equipo 2 (${equipo2.length})</h6>
                  <div class="text-white small">
                    ${equipo2.map(jp => {
                      // Calcular goles y asistencias reales desde la tabla goles
                      const golesJugador = partido.goles?.filter(gol => gol.goleador_id === jp.jugador_id).length || 0;
                      const asistenciasJugador = partido.goles?.filter(gol => gol.asistidor_id === jp.jugador_id).length || 0;
                      
                      const stats = [];
                      if (golesJugador > 0) stats.push(`⚽${golesJugador}`);
                      if (asistenciasJugador > 0) stats.push(`🅰️${asistenciasJugador}`);
                      if (jp.atajadas > 0) stats.push(`🥅${jp.atajadas}`);
                      if (jp.cagadas > 0) stats.push(`💥${jp.cagadas}`);
                      
                      return `
                        <div class="mb-1 d-flex justify-content-between align-items-center">
                          <span>${jp.jugadores?.nombre || 'Jugador'}</span>
                          ${stats.length > 0 ? `<span class="text-light-emphasis small">${stats.join(' ')}</span>` : ''}
                        </div>
                      `;
                    }).join('')}
                    ${equipo2.length === 0 ? '<div class="text-muted">Sin jugadores registrados</div>' : ''}
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Reconocimientos y estadísticas -->
            <div class="row g-2 mb-3">
              ${mvpData ? `
                <div class="col-6">
                  <div class="badge bg-warning text-dark small w-100">
                    👑 MVP: ${mvpData.jugadores?.nombre || 'N/A'}
                  </div>
                </div>
              ` : ''}
              ${aceData ? `
                <div class="col-6">
                  <div class="badge bg-secondary small w-100">
                    ⭐ ACE: ${aceData.jugadores?.nombre || 'N/A'}
                  </div>
                </div>
              ` : ''}
              ${totalAtajadas > 0 ? `
                <div class="col-6">
                  <div class="badge bg-info small w-100">
                    🥅 Atajadas: ${totalAtajadas}
                  </div>
                </div>
              ` : ''}
              ${totalCagadas > 0 ? `
                <div class="col-6">
                  <div class="badge bg-danger small w-100">
                    ❌ Cagadas: ${totalCagadas}
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }

  // Función para ir a la pestaña de ranking desde el historial
  window.irARankingSkill = function() {
    // Cambiar a la pestaña de ranking
    const rankingTab = document.getElementById('ranking-skill-tab');
    const rankingTabContent = document.getElementById('ranking-skill-content');
    
    // Activar la pestaña
    rankingTab.click();
    
    // Cargar el ranking
    cargarRankingSkill();
  };

  // Función para cargar el ranking en la pestaña
  window.cargarRankingSkill = async function() {
    const container = document.getElementById('ranking-skill-container');
    
    try {
      // Mostrar loading
      container.innerHTML = `
        <div class="text-center py-4">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Cargando ranking...</span>
          </div>
          <p class="text-light-emphasis mt-2">Calculando posiciones...</p>
        </div>
      `;
      
      // Obtener estadísticas actuales
      let estadisticas = window.datosJugadores || [];
      if (estadisticas.length === 0) {
        container.innerHTML = `
          <div class="text-center py-4">
            <i class="bi bi-exclamation-triangle fs-1 text-warning mb-3"></i>
            <h5 class="text-white">No hay datos disponibles</h5>
            <p class="text-light-emphasis">Carga las estadísticas primero para ver el ranking.</p>
          </div>
        `;
        return;
      }
      
      // Aplicar filtro por cantidad mínima de partidos
      const filtroPartidos = parseInt(document.getElementById('filtro-partidos-ranking')?.value) || 0;
      if (filtroPartidos > 0) {
        estadisticas = estadisticas.filter(jugador => (jugador.pj || 0) >= filtroPartidos);
      }
      
      // Función para calcular rendimiento individual
      const calcularRendimiento = (jugador) => {
        const pj = jugador.pj || 1;
        
        // Rendimiento Ataque: (Goles P/P * 5) + (MVP P/P * 7) + (ACE P/P * 6) + (Asist P/P * 4) - (Cagadas P/P * 5) + (Puntos P/P * 2)
        const golesPP = (jugador.goles || 0) / pj;
        const mvpPP = (jugador.mvp_count || 0) / pj;
        const acePP = (jugador.ace_count || 0) / pj;
        const asistPP = (jugador.asistencias || 0) / pj;
        const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
        const puntosPP = (jugador.total_puntos || 0) / pj;
        const atajadasPP = (jugador.atajadas || 0) / pj;
        
        const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
        const rendArquero = atajadasPP * 1;
        
        return rendAtaque + rendArquero;
      };
      
      // Crear ranking ordenado por skill individual
      const ranking = [...estadisticas]
        .sort((a, b) => calcularRendimiento(b) - calcularRendimiento(a))
        .map((jugador, index) => ({
          posicion: index + 1,
          rendimiento: calcularRendimiento(jugador),
          ...jugador
        }));

      // Calcular min y max para el espectro de colores
      const skills = ranking.map(j => j.rendimiento);
      const minSkill = Math.min(...skills);
      const maxSkill = Math.max(...skills);
      
      // Función para obtener color según skill (igual que en tabla principal)
      const obtenerColorSkill = (skill) => {
        const normalizado = (skill - minSkill) / (maxSkill - minSkill || 1);
        
        if (normalizado >= 0.8) return 'skill-excellent'; // Verde brillante
        if (normalizado >= 0.6) return 'skill-good';      // Verde
        if (normalizado >= 0.4) return 'skill-average';   // Amarillo
        if (normalizado >= 0.2) return 'skill-below';     // Naranja
        return 'skill-poor';                              // Rojo
      };
      
      // Variables para ordenamiento del ranking
      let currentSortRanking = 'skill';
      let currentOrderRanking = 'desc';

      // Función para ordenar ranking
      const sortRanking = (rankings, field, order) => {
        return [...rankings].sort((a, b) => {
          let aVal, bVal;
          
          if (field === 'nombre') {
            aVal = a.jugadores?.nombre || '';
            bVal = b.jugadores?.nombre || '';
            return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          } else if (field === 'goles_asist') {
            aVal = (a.goles || 0) + (a.asistencias || 0);
            bVal = (b.goles || 0) + (b.asistencias || 0);
          } else if (field === 'ataque') {
            const pjA = a.pj || 1;
            const pjB = b.pj || 1;
            const ataqueA = ((a.goles || 0) / pjA * 5) + ((a.mvp_count || 0) / pjA * 7) + ((a.ace_count || 0) / pjA * 6) + ((a.asistencias || 0) / pjA * 4) - ((a.cagadas_en_gol || 0) / pjA * 5) + ((a.total_puntos || 0) / pjA * 2);
            const ataqueB = ((b.goles || 0) / pjB * 5) + ((b.mvp_count || 0) / pjB * 7) + ((b.ace_count || 0) / pjB * 6) + ((b.asistencias || 0) / pjB * 4) - ((b.cagadas_en_gol || 0) / pjB * 5) + ((b.total_puntos || 0) / pjB * 2);
            aVal = ataqueA;
            bVal = ataqueB;
          } else if (field === 'arquero') {
            const pjA = a.pj || 1;
            const pjB = b.pj || 1;
            aVal = (a.atajadas || 0) / pjA * 1;
            bVal = (b.atajadas || 0) / pjB * 1;
          } else if (field === 'mvp') {
            aVal = a.mvp_count || 0;
            bVal = b.mvp_count || 0;
          } else if (field === 'ace') {
            aVal = a.ace_count || 0;
            bVal = b.ace_count || 0;
          } else if (field === 'atajadas') {
            aVal = a.atajadas || 0;
            bVal = b.atajadas || 0;
          } else if (field === 'cagadas') {
            aVal = a.cagadas_en_gol || 0;
            bVal = b.cagadas_en_gol || 0;
          } else {
            aVal = a[field] || 0;
            bVal = b[field] || 0;
          }
          
          if (typeof aVal === 'string') aVal = parseFloat(aVal) || 0;
          if (typeof bVal === 'string') bVal = parseFloat(bVal) || 0;
          
          return order === 'asc' ? aVal - bVal : bVal - aVal;
        });
      };

      // Renderizar tabla del ranking
      let html = `
        <div class="table-responsive">
          <table class="table table-dark table-striped table-hover" id="ranking-table">
            <thead>
              <tr>
                <th class="text-center sortable-ranking" data-sort="posicion" style="width: 40px; cursor: pointer;"># <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="sortable-ranking" data-sort="nombre" style="width: 120px; cursor: pointer;">Jugador <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="pj" style="width: 40px; cursor: pointer;">PJ <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="skill" style="width: 60px; cursor: pointer;">Skill <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="ataque" style="width: 60px; cursor: pointer;">🎯 Ataque <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="arquero" style="width: 60px; cursor: pointer;">🥅 Arquero <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="goles_asist" style="width: 50px; cursor: pointer;">G+A <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="mvp" style="width: 40px; cursor: pointer;">MVP <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="ace" style="width: 40px; cursor: pointer;">ACE <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="atajadas" style="width: 40px; cursor: pointer;">🥅 <i class="bi bi-arrow-down-up ms-1"></i></th>
                <th class="text-center sortable-ranking" data-sort="cagadas" style="width: 40px; cursor: pointer;">💥 <i class="bi bi-arrow-down-up ms-1"></i></th>
              </tr>
            </thead>
            <tbody id="ranking-tbody">
      `;
      
      // Función para renderizar las filas del ranking
      const renderRankingRows = (rankings) => {
        let rowsHtml = '';
        rankings.forEach((jugador, index) => {
          const positionClass = (index + 1) <= 3 ? `position-${index + 1}` : 'position-other';
          const golesAsistencias = (jugador.goles || 0) + (jugador.asistencias || 0);
          const colorSkill = obtenerColorSkill(jugador.rendimiento);
          
          // Calcular rendimientos separados
          const pj = jugador.pj || 1;
          const golesPP = (jugador.goles || 0) / pj;
          const mvpPP = (jugador.mvp_count || 0) / pj;
          const acePP = (jugador.ace_count || 0) / pj;
          const asistPP = (jugador.asistencias || 0) / pj;
          const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
          const puntosPP = (jugador.total_puntos || 0) / pj;
          const atajadasPP = (jugador.atajadas || 0) / pj;
          
          const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
          const rendArquero = atajadasPP * 1;
          
          const tooltipContent = `Cálculo detallado (por partido):
ATAQUE:
• Goles: ${golesPP.toFixed(2)} × 5 = ${(golesPP * 5).toFixed(1)}
• MVP: ${mvpPP.toFixed(2)} × 7 = ${(mvpPP * 7).toFixed(1)}
• ACE: ${acePP.toFixed(2)} × 6 = ${(acePP * 6).toFixed(1)}
• Asistencias: ${asistPP.toFixed(2)} × 4 = ${(asistPP * 4).toFixed(1)}
• Cagadas: ${cagadasPP.toFixed(2)} × (-5) = ${(cagadasPP * -5).toFixed(1)}
• Puntos: ${puntosPP.toFixed(2)} × 2 = ${(puntosPP * 2).toFixed(1)}
Subtotal Ataque: ${rendAtaque.toFixed(1)}

ARQUERO:
• Atajadas: ${atajadasPP.toFixed(2)} × 1 = ${rendArquero.toFixed(1)}

TOTAL SKILL: ${jugador.rendimiento.toFixed(1)}`;
          
          rowsHtml += `
            <tr class="ranking-row" data-bs-toggle="tooltip" data-bs-placement="right" data-bs-title="${tooltipContent}">
              <td class="text-center">
                <span class="position-badge ${positionClass}">${index + 1}</span>
              </td>
              <td>
                <strong class="text-white">${jugador.jugadores?.nombre || 'Jugador'}</strong>
              </td>
              <td class="text-center text-light">${jugador.pj || 0}</td>
              <td class="text-center">
                <span class="badge ${colorSkill} fw-bold">${jugador.rendimiento.toFixed(1)}</span>
              </td>
              <td class="text-center">
                <span class="text-warning fw-bold">${rendAtaque.toFixed(1)}</span>
              </td>
              <td class="text-center">
                <span class="text-info fw-bold">${rendArquero.toFixed(1)}</span>
              </td>
              <td class="text-center text-success">${golesAsistencias}</td>
              <td class="text-center text-warning">${jugador.mvp_count || 0}</td>
              <td class="text-center text-info">${jugador.ace_count || 0}</td>
              <td class="text-center text-primary">${jugador.atajadas || 0}</td>
              <td class="text-center text-danger">${jugador.cagadas_en_gol || 0}</td>
            </tr>
          `;
        });
        return rowsHtml;
      };

      // Renderizar filas iniciales
      html += renderRankingRows(ranking);
      
      html += `
            </tbody>
          </table>
        </div>
        
        <div class="mt-3">
          <div class="row g-3 text-center">
            <div class="col-md-3">
              <div class="small text-light-emphasis">Total Jugadores</div>
              <div class="text-white fw-bold">${ranking.length}</div>
            </div>
            <div class="col-md-3">
              <div class="small text-light-emphasis">Líder en Skill</div>
              <div class="text-warning fw-bold">${ranking[0]?.jugadores?.nombre || 'N/A'}</div>
            </div>
            <div class="col-md-3">
              <div class="small text-light-emphasis">Skill Líder</div>
              <div class="text-warning fw-bold">${ranking[0]?.rendimiento?.toFixed(1) || '0.0'}</div>
            </div>
            <div class="col-md-3">
              <div class="small text-light-emphasis">Skill/Partido</div>
              <div class="text-info fw-bold">${ranking[0] ? (ranking[0].rendimiento / (ranking[0].pj || 1)).toFixed(1) : '0.0'}</div>
            </div>
          </div>
        </div>
      `;
      
      container.innerHTML = html;
      
      // Activar tooltips después de cargar el contenido
      setTimeout(() => {
        const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(tooltipTriggerEl => {
          new bootstrap.Tooltip(tooltipTriggerEl, {
            html: false,
            trigger: 'hover',
            customClass: 'skill-tooltip',
            template: '<div class="tooltip skill-tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner text-start" style="white-space: pre-line; max-width: 350px;"></div></div>'
          });
        });
      }, 100);

      // Event listeners para ordenamiento del ranking
      container.addEventListener('click', (e) => {
        if (e.target.matches('.sortable-ranking') || e.target.closest('.sortable-ranking')) {
          const sortField = e.target.dataset.sort || e.target.closest('.sortable-ranking').dataset.sort;
          if (sortField) {
            // Cambiar orden si es el mismo campo
            if (currentSortRanking === sortField) {
              currentOrderRanking = currentOrderRanking === 'asc' ? 'desc' : 'asc';
            } else {
              // Campo nuevo, orden descendente por defecto (excepto nombre)
              currentSortRanking = sortField;
              currentOrderRanking = sortField === 'nombre' ? 'asc' : 'desc';
            }
            
            // Reordenar y rerenderizar tabla
            const sortedRanking = sortRanking(ranking, currentSortRanking, currentOrderRanking);
            const tbody = container.querySelector('#ranking-tbody');
            if (tbody) {
              tbody.innerHTML = renderRankingRows(sortedRanking);
              
              // Reactivar tooltips
              setTimeout(() => {
                const newTooltips = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
                newTooltips.forEach(tooltipEl => {
                  new bootstrap.Tooltip(tooltipEl, {
                    html: false,
                    trigger: 'hover',
                    customClass: 'skill-tooltip',
                    template: '<div class="tooltip skill-tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner text-start" style="white-space: pre-line; max-width: 350px;"></div></div>'
                  });
                });
              }, 100);
            }
          }
        }
      });
      
    } catch (error) {
      console.error('Error al cargar ranking skill:', error);
      container.innerHTML = `
        <div class="text-center py-4">
          <i class="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
          <h5 class="text-white">Error al cargar ranking</h5>
          <p class="text-light-emphasis">Hubo un problema al obtener los datos del ranking.</p>
        </div>
      `;
    }
  };

  // Variable global para almacenar todos los partidos cargados
  let todosLosPartidos = [];

  // Función para filtrar partidos por nombre de jugador
  window.filtrarPartidosPorJugador = function() {
    const busqueda = document.getElementById('buscar-jugador')?.value?.toLowerCase().trim() || '';
    const container = document.getElementById('historial-partidos-container');
    
    if (!todosLosPartidos || todosLosPartidos.length === 0) {
      return; // No hay partidos para filtrar
    }
    
    let partidosFiltrados = todosLosPartidos;
    
    // Si hay búsqueda, filtrar por jugador
    if (busqueda) {
      partidosFiltrados = todosLosPartidos.filter(partido => {
        // Buscar en jugador_partido si algún jugador coincide con la búsqueda
        return partido.jugador_partido?.some(jp => 
          jp.jugadores?.nombre?.toLowerCase().includes(busqueda)
        );
      });
    }
    
    // Aplicar límite de cantidad
    const cantidad = parseInt(document.getElementById('cantidad-partidos')?.value) || 5;
    partidosFiltrados = partidosFiltrados.slice(0, cantidad);
    
    // Mostrar partidos filtrados
    mostrarPartidosBasicos(container, partidosFiltrados);
    
    // Mostrar mensaje si no hay resultados
    if (busqueda && partidosFiltrados.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-search fs-1 text-muted mb-3"></i>
          <h5 class="text-muted">No se encontraron partidos</h5>
          <p class="text-light-emphasis mb-4">
            No hay partidos donde participe "<strong>${busqueda}</strong>".<br>
            Intenta con otro nombre o revisa la ortografía.
          </p>
          <button onclick="document.getElementById('buscar-jugador').value=''; filtrarPartidosPorJugador();" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-x-circle me-2"></i>
            Limpiar búsqueda
          </button>
        </div>
      `;
    }
  };

  // Hacer las funciones globales
  window.cargarHistorialPartidos = cargarHistorialPartidos;
  window.eliminarPartido = async function(partidoId) {
    // Confirmación antes de eliminar
    const confirmacion = confirm('⚠️ ¿Estás seguro de que quieres eliminar este partido?\n\nEsta acción eliminará:\n• Los datos del partido\n• Todos los goles registrados\n• Todas las estadísticas de jugadores\n• Esta acción NO se puede deshacer');
    
    if (!confirmacion) {
      return;
    }

    try {
      // Mostrar loading
      showToast('Eliminando partido...', 'info');

      // 1. Eliminar goles del partido
      const { error: golesError } = await supabase
        .from('goles')
        .delete()
        .eq('partido_id', partidoId);

      if (golesError) {
        console.error('Error al eliminar goles:', golesError);
        throw new Error(`Error al eliminar goles: ${golesError.message}`);
      }

      // 2. Eliminar registros de jugador_partido
      const { error: jugadorPartidoError } = await supabase
        .from('jugador_partido')
        .delete()
        .eq('partido_id', partidoId);

      if (jugadorPartidoError) {
        console.error('Error al eliminar jugadores del partido:', jugadorPartidoError);
        throw new Error(`Error al eliminar jugadores del partido: ${jugadorPartidoError.message}`);
      }

      // 3. Finalmente, eliminar el partido
      const { error: partidoError } = await supabase
        .from('partidos')
        .delete()
        .eq('id', partidoId);

      if (partidoError) {
        console.error('Error al eliminar partido:', partidoError);
        throw new Error(`Error al eliminar partido: ${partidoError.message}`);
      }

      // Éxito
      showToast('🗑️ Partido eliminado exitosamente', 'success');
      
      // Recargar el historial para reflejar los cambios
      cargarHistorialPartidos();
      
      // Recargar estadísticas para actualizar los totales
      await cargarEstadisticas();

    } catch (error) {
      console.error('Error completo al eliminar partido:', error);
      showToast(`Error al eliminar el partido: ${error.message}`, 'error');
    }
  };

  // --- Inicialización de la app ---
  console.log('🚀 Inicializando aplicación...');
  
  // Cargar datos iniciales
  cargarTodosLosJugadores();
  cargarTemporadas();
  inicializarPosiciones();
  configurarFiltroPartidos();
  cargarEstadisticas();
  
  // Cargar historial de partidos automáticamente
  cargarHistorialPartidos();

  // Event listeners para el formulario de jugadores
  if (playerForm) {
    playerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nombre = document.getElementById('nombre').value.trim();
      const posicionPrimaria = document.getElementById('posicion-primaria').value;
      const posicionSecundaria = document.getElementById('posicion-secundaria').value;
      const pulmon = document.getElementById('pulmon').value;
      
      if (!nombre) {
        showToast('El nombre del jugador es obligatorio', 'error');
        return;
      }
      
      if (!posicionPrimaria) {
        showToast('La posición primaria es obligatoria', 'error');
        return;
      }
      
      try {
        if (jugadorEditando) {
          // Modo edición
          await editarJugador(jugadorEditando.id, nombre, posicionPrimaria, posicionSecundaria, pulmon);
          showToast(`${nombre} ha sido actualizado exitosamente`, 'success');
        } else {
          // Modo agregar
          await agregarJugador(nombre, posicionPrimaria, posicionSecundaria, pulmon);
          showToast(`${nombre} ha sido agregado exitosamente`, 'success');
        }
        
        // Cerrar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('playerModal'));
        modal.hide();
        
        // Recargar datos
        cargarEstadisticas();
        cargarTodosLosJugadores();
        
      } catch (error) {
        console.error('Error al procesar jugador:', error);
        showToast('Error al procesar el jugador: ' + error.message, 'error');
      }
    });
  }

  // Event listeners para cargar partido
  if (btnCargarPartido) {
    btnCargarPartido.addEventListener('click', cargarPartido);
  }

  // Event listeners para agregar gol
  if (btnAddGol) {
    btnAddGol.addEventListener('click', agregarEvento);
  }

  // Event listeners para ordenamiento de tabla
  document.addEventListener('click', (e) => {
    if (e.target.matches('.sortable') || e.target.closest('.sortable')) {
      const sortField = e.target.dataset.sort || e.target.closest('.sortable').dataset.sort;
      if (sortField) {
        handleSort(sortField);
      }
    }
  });

  // Event listener para la pestaña de ranking
  const rankingTab = document.getElementById('ranking-skill-tab');
  if (rankingTab) {
    rankingTab.addEventListener('shown.bs.tab', function (e) {
      // Cargar ranking cuando se muestra la pestaña
      cargarRankingSkill();
    });
  }

  console.log('✅ Aplicación inicializada correctamente');
};

// --- Inicializar cuando el DOM esté listo ---
document.addEventListener('DOMContentLoaded', initApp);
