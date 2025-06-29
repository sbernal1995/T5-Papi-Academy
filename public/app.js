// src/app.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Cargar variables de entorno desde .env (solo para desarrollo local, en producción usar variables de entorno del build)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Crear cliente de Supabase
console.log('Configurando Supabase:', { SUPABASE_URL, SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? 'PRESENTE' : 'FALTANTE' });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  const btnAddEvento = document.getElementById('btn-add-evento');
  const tablaEventos = document.getElementById('tabla-eventos');
  const btnCargarPartido = document.getElementById('btn-cargar-partido');

  // Estado de la aplicación
  let todosLosJugadores = [];
  let todasLasPosiciones = [];
  let todasLasTemporadas = [];
  let temporadaSeleccionada = null; // null = todas las temporadas
  let filtroPartidosMinimos = 0; // filtro de partidos mínimos
  let equipo1 = [];
  let equipo2 = [];
  
  // Hacer los equipos disponibles globalmente para el tooltip
  window.equipo1 = equipo1;
  window.equipo2 = equipo2;
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

  function handleSort(field) {
    if (currentSortField === field) {
      // Si es el mismo campo, cambiar orden
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // Si es campo diferente, usar orden descendente por defecto
      currentSortField = field;
      currentSortOrder = field === 'nombre' ? 'asc' : 'desc';
    }
    
    renderizarTablaOrdenada();
  }

  function renderizarTablaOrdenada() {
    if (datosJugadores.length === 0) return;
    
    aplicarFiltros();
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
    
    const selectors = [selector, selectorMobile].filter(s => s);
    
    selectors.forEach(sel => {
      // Limpiar opciones existentes (excepto la primera)
      sel.innerHTML = '<option value="">Todas las temporadas</option>';
      
      // Agregar opciones dinámicamente
      todasLasTemporadas.forEach(temporada => {
        const option = `<option value="${temporada.id}">${temporada.nombre}</option>`;
        sel.innerHTML += option;
      });
      
      // Agregar event listener para cambio de temporada
      sel.addEventListener('change', (e) => {
        temporadaSeleccionada = e.target.value || null;
        
        // Sincronizar ambos selectores
        selectors.forEach(otherSel => {
          if (otherSel !== e.target) {
            otherSel.value = e.target.value;
          }
        });
        
        cargarEstadisticas();
      });
    });
  }

  function configurarFiltroPartidos() {
    const filtroInput = document.getElementById('filtro-partidos');
    if (!filtroInput) return;
    
    // Event listener para cambio en el filtro
    filtroInput.addEventListener('input', (e) => {
      filtroPartidosMinimos = parseInt(e.target.value) || 0;
      aplicarFiltros();
    });
    
    // Event listener para Enter
    filtroInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        filtroPartidosMinimos = parseInt(e.target.value) || 0;
        aplicarFiltros();
      }
    });
  }

  function aplicarFiltros() {
    if (datosJugadores.length === 0) return;
    
    // Filtrar por partidos mínimos
    const datosFiltrados = datosJugadores.filter(jugador => 
      (jugador.pj || 0) >= filtroPartidosMinimos
    );
    
    // Aplicar ordenamiento a los datos filtrados
    const sortedData = sortData(datosFiltrados, currentSortField, currentSortOrder);
    renderizarTablaConDatos(sortedData);
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
    
    // Actualizar selects de eventos (goleador, asistencia)
    const jugadoresDelPartido = [...equipo1, ...equipo2];
    const goleadorSelect = document.getElementById('goleador');
    const asistenciaSelect = document.getElementById('asistencia');
    goleadorSelect.innerHTML = '<option disabled selected>Seleccionar</option>';
    asistenciaSelect.innerHTML = '<option disabled selected>Seleccionar</option><option value="nadie">Nadie</option>';
    jugadoresDelPartido.forEach(j => {
        const option = `<option value="${j.id}">${j.nombre}</option>`;
        goleadorSelect.innerHTML += option;
        asistenciaSelect.innerHTML += option;
    });
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
      
      // Rendimiento Ataque: (Goles P/P * 5) + (MVP P/P * 7) + (ACE P/P * 6) + (Asist P/P * 4) - (Cagadas P/P * 3) + (Puntos P/P * 2)
      const golesPP = (jugador.goles || 0) / pj;
      const mvpPP = (jugador.mvp_count || 0) / pj;
      const acePP = (jugador.ace_count || 0) / pj;
      const asistPP = (jugador.asistencias || 0) / pj;
      const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
      const puntosPP = (jugador.total_puntos || 0) / pj;
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 3) + (puntosPP * 2);
      
      // Rendimiento Arquero: atajadas por partido * 1.5
      const atajadasPP = (jugador.atajadas || 0) / pj;
      const rendArquero = atajadasPP * 1.5;
      
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
      if (jugador.winrate !== null && jugador.winrate !== undefined) {
        totalWinrate += jugador.winrate;
        jugadoresConDatos++;
      }
      if (jugador.goles !== null && jugador.goles !== undefined) {
        totalGoles += jugador.goles;
      }
      if (jugador.atajadas !== null && jugador.atajadas !== undefined) {
        totalAtajadas += jugador.atajadas;
      }
      if (jugador.cagadas_en_gol !== null && jugador.cagadas_en_gol !== undefined) {
        totalCagadas += jugador.cagadas_en_gol;
      }
      if (jugador.pj !== null && jugador.pj !== undefined) {
        totalPartidos += jugador.pj;
      }
      
      // Calcular rendimiento de cada jugador
      const pj = jugador.pj || 1;
      const golesPP = (jugador.goles || 0) / pj;
      const mvpPP = (jugador.mvp_count || 0) / pj;
      const acePP = (jugador.ace_count || 0) / pj;
      const asistPP = (jugador.asistencias || 0) / pj;
      const cagadasPP = (jugador.cagadas_en_gol || 0) / pj;
      const puntosPP = (jugador.total_puntos || 0) / pj;
      const atajadasPP = (jugador.atajadas || 0) / pj;
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 3) + (puntosPP * 2);
      const rendArquero = atajadasPP * 1.5;
      
      rendimientoTotalEquipo += rendAtaque + rendArquero;
      
      // Pulmón
      if (jugador.pulmon !== null && jugador.pulmon !== undefined) {
        totalPulmon += jugador.pulmon;
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

    // Filtrar jugadores con un mínimo de partidos para estadísticas más significativas
    const jugadoresConMinPartidos = equipo.filter(j => (j.pj || 0) >= 3); // Mínimo más bajo para radar

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
      const tieneGoles = (j.goles || 0) > 0;
      const tieneAsistencias = (j.asistencias || 0) > 0;
      return tieneGoles || tieneAsistencias; // Cualquiera que contribuya ofensivamente
    });
    
    // Variables globales para ataque ponderado
    const atacantesPrincipalesCompleto = [
      ...atacantesPrincipales,
      ...mediocampistasPrincipales, 
      ...mediocampistasSecundarios
    ].filter(jugador => {
      const tieneGoles = (jugador.goles || 0) > 0;
      const tieneAsistencias = (jugador.asistencias || 0) > 0;
      return tieneGoles || tieneAsistencias; // Solo los que contribuyen ofensivamente
    });
    
    const contribuyentesResto = contribuyentesOfensivos.filter(jugador => {
      const posicionPrimaria = obtenerPosicionPrimaria(jugador);
      const puedeJugarMedio = puedeJugarEn(jugador, 'Mediocampo');
      // Excluir atacantes y mediocampistas (primarios y secundarios)
      return posicionPrimaria !== 'Atacante' && posicionPrimaria !== 'Mediocampo' && !puedeJugarMedio;
    });

    console.log('👥 Distribución de jugadores por contribución:', {
      arqueros: arqueros.map(j => `${j.nombre} (${j.atajadas || 0} atajadas)`),
      defensoresPrincipales: defensoresPrincipales.map(j => `${j.nombre} Main (${j.winrate || 0}% wr)`),
      defensoresSecundarios: defensoresSecundarios.map(j => `${j.nombre} 65% (${j.winrate || 0}% wr)`),
      mediocampistasPrincipales: mediocampistasPrincipales.map(j => `${j.nombre} Main (${j.goles || 0}G + ${j.asistencias || 0}A)`),
      mediocampistasSecundarios: mediocampistasSecundarios.map(j => `${j.nombre} 65% (${j.goles || 0}G + ${j.asistencias || 0}A)`),
      atacantesPrincipales: atacantesPrincipales.map(j => `${j.nombre} Main (${j.goles || 0}G + ${j.asistencias || 0}A)`),
      atacantesPrincipalesCompleto: atacantesPrincipalesCompleto.map(j => `${j.nombre} 80% (${j.goles || 0}G + ${j.asistencias || 0}A)`),
      contribuyentesResto: contribuyentesResto.map(j => `${j.nombre} 20% (${j.goles || 0}G + ${j.asistencias || 0}A)`)
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
        // Calcular puntuación de cada arquero
        const puntuacionesArqueros = arqueros.map(jugador => {
          const pj = jugador.pj || 1;
          const winrate = jugador.winrate || 0;
          const atajadasPorPartido = (jugador.atajadas || 0) / pj;
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
        const pj = jugador.pj || 1;
        const winrate = jugador.winrate || 0;
        const cagadasPorPartido = (jugador.cagadas_en_gol || 0) / pj;
        const puntuacion = winrate - (cagadasPorPartido * 10);
        puntuacionDefensor += puntuacion;
        contadorDefensor += 1;
      });
      
      // Secundarios (65% contribución)
      defensoresSecundarios.forEach(jugador => {
        const pj = jugador.pj || 1;
        const winrate = jugador.winrate || 0;
        const cagadasPorPartido = (jugador.cagadas_en_gol || 0) / pj;
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
        const pj = jugador.pj || 1;
        const golesPorPartido = (jugador.goles || 0) / pj;
        const asistPorPartido = (jugador.asistencias || 0) / pj;
        const winrate = jugador.winrate || 0;
        const puntuacion = (golesPorPartido + asistPorPartido) * 24 + winrate * 0.7; // Winrate pesa 70%
        puntuacionMediocampo += puntuacion;
        contadorMediocampo += 1;
      });
      
      // Secundarios (65% contribución)
      mediocampistasSecundarios.forEach(jugador => {
        const pj = jugador.pj || 1;
        const golesPorPartido = (jugador.goles || 0) / pj;
        const asistPorPartido = (jugador.asistencias || 0) / pj;
        const winrate = jugador.winrate || 0;
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
          const pj = jugador.pj || 1;
          const golesPorPartido = (jugador.goles || 0) / pj;
          const asistPorPartido = (jugador.asistencias || 0) / pj;
          const winrate = jugador.winrate || 0;
          puntuacionPrincipales += (golesPorPartido + asistPorPartido) * 27 + winrate * 1.0;
        });
        puntuacionPrincipales = puntuacionPrincipales / atacantesPrincipalesCompleto.length;
      }
      
      // Calcular puntuación promedio de contribuyentes
      let puntuacionContribuyentes = 0;
      if (contribuyentesResto.length > 0) {
        contribuyentesResto.forEach(jugador => {
          const pj = jugador.pj || 1;
          const golesAsistPorPartido = ((jugador.goles || 0) + (jugador.asistencias || 0)) / pj;
          const winrate = jugador.winrate || 0;
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

    console.log('📊 Scores calculados:', {
      arquero: scoreArquero,
      defensor: scoreDefensor,
      mediocampo: scoreMediocampo,
      atacante: scoreAtacante
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


  
  function renderizarEventos() {
    tablaEventos.innerHTML = '';
    eventos.forEach((evento, index) => {
        const goleador = todosLosJugadores.find(j => j.id == evento.goleador_id)?.nombre || 'N/A';
        const asistencia = todosLosJugadores.find(j => j.id == evento.asistencia_id)?.nombre || 'N/A';
        tablaEventos.innerHTML += `
            <tr>
                <td>${evento.minuto}'</td>
                <td>${goleador}</td>
                <td>${asistencia}</td>
                <td><span class="badge ${evento.equipo === 'azul' ? 'bg-primary' : 'bg-danger'}">${evento.equipo === 'azul' ? 'Azul' : 'Rojo'}</span></td>
                <td><button onclick="quitarEvento(${index})" class="btn btn-sm btn-outline-danger"><i class="bi bi-trash"></i></button></td>
            </tr>
        `;
    });
  }


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
      renderizarEventos();
  }

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
      const minuto = document.getElementById('minuto').value;
      const goleador_id = document.getElementById('goleador').value;
      const asistencia_id = document.getElementById('asistencia').value;
      const equipo = document.getElementById('equipo-evento').value;

      if (!minuto || !goleador_id) {
          showToast('El minuto y el goleador son obligatorios.', 'warning');
          return;
      }
      eventos.push({ minuto, goleador_id, asistencia_id, equipo });
      const goleadorNombre = todosLosJugadores.find(j => j.id == goleador_id)?.nombre || 'N/A';
      showToast(`Gol agregado: ${goleadorNombre} (${minuto}')`, 'success');
      renderizarEventos();
      // Resetear inputs
      document.getElementById('minuto').value = '';
      document.getElementById('goleador').selectedIndex = 0;
      document.getElementById('asistencia').selectedIndex = 0;
  }

  async function cargarPartido() {
      const fecha = document.getElementById('fecha-partido').value;
      const cancha = document.getElementById('cancha-partido').value;
      const resultado = document.getElementById('resultado-final').value;
      const equipo_ganador = document.querySelector('input[name="equipo_ganador"]:checked').value;

      if (!fecha || !cancha || !resultado) {
          showToast('Completa los datos del partido (fecha, cancha, resultado).', 'warning');
          return;
      }

      const jugadores_partido = [...equipo1.map(j => j.id), ...equipo2.map(j => j.id)];

      // TODO: Aquí iría la lógica para guardar en Supabase.
      // Por ahora, solo mostraremos los datos en consola.
      const dataPartido = {
          fecha,
          cancha,
          resultado,
          equipo_ganador,
          equipo_azul: equipo1.map(j => j.id),
          equipo_rojo: equipo2.map(j => j.id),
          eventos
      };

      console.log('Partido a cargar:', dataPartido);
      showToast('Partido listo para cargar! Revisa la consola para ver los datos.', 'success');
      
      // Aquí iría la llamada a Supabase, por ejemplo:
      // const { data, error } = await supabase.from('partidos').insert([dataPartido]);
      // if (error) ...
      // else ...
  }
  
  async function cargarEstadisticas() {
    // Intentar usar la vista primero, si falla usar la tabla jugadores como fallback
    let data, error;
    
    if (todasLasTemporadas.length > 0) {
      // Si hay temporadas, usar la vista directamente
      let query = supabase
        .from('vista_estadisticas_por_temporada')
        .select('*');
      
      // Filtrar por temporada si está seleccionada
      if (temporadaSeleccionada) {
        query = query.eq('temporada_id', temporadaSeleccionada);
      }
      
      const result = await query;
      
      if (result.data && result.data.length > 0) {
        // Necesitamos obtener los datos de jugadores por separado para las posiciones
        const jugadorIds = result.data.map(stat => stat.jugador_id);
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
        
        if (!jugadoresError && jugadoresData) {
          // Combinar datos de estadísticas con datos de jugadores
          data = result.data.map(stat => ({
            ...stat,
            jugadores: jugadoresData.find(j => j.id === stat.jugador_id)
          }));
          error = null;
        } else {
          data = result.data;
          error = result.error;
        }
      } else {
        data = result.data;
        error = result.error;
      }
    }
    
    if (error || todasLasTemporadas.length === 0) {
      // Fallback: usar tabla jugadores directamente
      console.log('Usando tabla jugadores como fallback...');
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
        temporada_id: 1, // Temporada por defecto
        total_puntos: jugador.total_puntos || 0,
        pj: jugador.pj || 0,
        pg: jugador.pg || 0,
        pe: jugador.pe || 0,
        pp: jugador.pp || 0,
        goles: jugador.goles || 0,
        asistencias: jugador.asistencias || 0,
        cagadas_en_gol: jugador.cagadas_en_gol || 0,
        mvp_count: jugador.mvp || 0,
        ace_count: jugador.ace || 0,
        atajadas: jugador.atajadas || 0,
        winrate: jugador.winrate || 0,
        capitan_defeat: jugador.capitan_defeat || 0,
        bita_defeat: jugador.bita_defeat || 0,
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
    // Agrupar datos por jugador si hay múltiples temporadas
    const jugadoresAgrupados = {};
    data.forEach(estadistica => {
      const jugadorId = estadistica.jugador_id;
      if (!jugadoresAgrupados[jugadorId]) {
        jugadoresAgrupados[jugadorId] = {
          jugador: estadistica.jugadores,
          estadisticas: []
        };
      }
      jugadoresAgrupados[jugadorId].estadisticas.push(estadistica);
    });
    
    // Procesar datos para el ordenamiento
    datosJugadores = Object.values(jugadoresAgrupados).map((jugadorData) => {
      
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
      
      // Sumar estadísticas si hay múltiples temporadas
      const stats = jugadorData.estadisticas.reduce((acc, est) => {
        acc.total_puntos += est.total_puntos || 0;
        acc.pj += est.pj || 0;
        acc.pg += est.pg || 0;
        acc.pe += est.pe || 0;
        acc.pp += est.pp || 0;
        acc.goles += est.goles || 0;
        acc.asistencias += est.asistencias || 0;
        acc.cagadas_en_gol += est.cagadas_en_gol || 0;
        acc.mvp_count += est.mvp_count || 0;
        acc.ace_count += est.ace_count || 0;
        acc.atajadas += est.atajadas || 0;
        acc.capitan_defeat += est.capitan_defeat || 0;
        acc.bita_defeat += est.bita_defeat || 0;
        
        // Para rendimientos, tomamos la última temporada o promediamos si hay varias
        if (est.rendimiento_total !== null) acc.rendimiento_total = est.rendimiento_total;
        if (est.rendimiento_ataque !== null) acc.rendimiento_ataque = est.rendimiento_ataque;
        if (est.rendimiento_arquero !== null) acc.rendimiento_arquero = est.rendimiento_arquero;
        
        return acc;
      }, {
        total_puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, goles: 0, asistencias: 0,
        cagadas_en_gol: 0, mvp_count: 0, ace_count: 0, atajadas: 0, 
        capitan_defeat: 0, bita_defeat: 0, rendimiento_total: null,
        rendimiento_ataque: null, rendimiento_arquero: null
      });
      
      // Calcular winrate (puntos obtenidos / puntos totales disputados)
      // Ganado = 3 puntos, Empatado = 1 punto, Perdido = 0 puntos
      const puntosObtenidos = (stats.pg * 3) + (stats.pe * 1);
      const puntosTotalesDisputados = stats.pj * 3;
      const winrate = puntosTotalesDisputados > 0 ? Math.round((puntosObtenidos / puntosTotalesDisputados) * 100) : 0;
      
      // Retornar objeto con todos los datos necesarios
      return {
        ...stats,
        winrate,
        jugadores: jugadorData.jugador,
        // Campos para ordenamiento
        nombre: jugadorData.jugador.nombre
      };
    });
    
    // Renderizar tabla ordenada
    renderizarTablaOrdenada();
  }

  function renderizarDestacados(data) {
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
        icon: '🔥',
        jugador: mejorWinrate,
        valor: mejorWinrate ? mejorWinrate.winrate || 0 : 0,
        sufijo: '%',
        clase: 'winrate',
        requisito: '(min. 10 PJ)'
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
            <div class="destacado-nombre text-white">${destacado.jugador.jugadores?.nombre || destacado.jugador.nombre}</div>
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

  function renderizarTablaConDatos(data) {
    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    
    // Renderizar destacados primero (con datos filtrados)
    renderizarDestacados(data);
    
    // Renderizar mejores por puesto
    renderizarMejoresPorPuesto(data);
    
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

    data.forEach((jugadorData, index) => {
      const tr = document.createElement('tr');
      
      // Crear badge de posición
      const posicion = index + 1;
      let positionClass = 'position-other';
      if (posicion === 1) positionClass = 'position-1';
      else if (posicion === 2) positionClass = 'position-2';
      else if (posicion === 3) positionClass = 'position-3';
      
      tr.innerHTML = `
        <td class="text-center">
          <div class="position-badge ${positionClass}">${posicion}</div>
        </td>
        <td class="fw-bold text-white">${jugadorData.jugadores.nombre}</td>
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
  btnAddEvento.addEventListener('click', agregarEvento);
  btnCargarPartido.addEventListener('click', cargarPartido);

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

  // --- Función para crear jugadores dummy (simplificada) ---
  async function crearJugadoresDummy() {
    const jugadoresDummy = [
      {
        nombre: 'Leo Messi',
        posicion_primaria: 'Atacante',
        posicion_secundaria: 'Mediocampo',
        stats: {
          winrate: 85,
          goles: 45,
          asistencias: 23,
          atajadas: 0,
          pj: 50,
          pg: 42,
          pe: 5,
          pp: 3,
          total_puntos: 180,
          cagadas_en_gol: 2,
          mvp: 15,
          ace: 8,
          capitan_defeat: 1,
          bita_defeat: 0
        }
      },
      {
        nombre: 'Sergio Ramos',
        posicion_primaria: 'Defensor',
        posicion_secundaria: null,
        stats: {
          winrate: 78,
          goles: 8,
          asistencias: 12,
          atajadas: 0,
          pj: 48,
          pg: 35,
          pe: 8,
          pp: 5,
          total_puntos: 145,
          cagadas_en_gol: 5,
          mvp: 8,
          ace: 3,
          capitan_defeat: 2,
          bita_defeat: 1
        }
      },
      {
        nombre: 'Thibaut Courtois',
        posicion_primaria: 'Arquero',
        posicion_secundaria: null,
        stats: {
          winrate: 72,
          goles: 0,
          asistencias: 2,
          atajadas: 89,
          pj: 45,
          pg: 32,
          pe: 8,
          pp: 5,
          total_puntos: 125,
          cagadas_en_gol: 8,
          mvp: 12,
          ace: 2,
          capitan_defeat: 0,
          bita_defeat: 2
        }
      },
      {
        nombre: 'Luka Modric',
        posicion_primaria: 'Mediocampo',
        posicion_secundaria: 'Atacante',
        stats: {
          winrate: 80,
          goles: 12,
          asistencias: 35,
          atajadas: 0,
          pj: 52,
          pg: 40,
          pe: 7,
          pp: 5,
          total_puntos: 165,
          cagadas_en_gol: 3,
          mvp: 10,
          ace: 6,
          capitan_defeat: 1,
          bita_defeat: 0
        }
      },
      {
        nombre: 'Virgil van Dijk',
        posicion_primaria: 'Defensor',
        posicion_secundaria: null,
        stats: {
          winrate: 83,
          goles: 6,
          asistencias: 4,
          atajadas: 0,
          pj: 46,
          pg: 38,
          pe: 5,
          pp: 3,
          total_puntos: 155,
          cagadas_en_gol: 1,
          mvp: 9,
          ace: 4,
          capitan_defeat: 0,
          bita_defeat: 0
        }
      },
      {
        nombre: 'Kevin De Bruyne',
        posicion_primaria: 'Mediocampo',
        posicion_secundaria: 'Atacante',
        stats: {
          winrate: 77,
          goles: 18,
          asistencias: 42,
          atajadas: 0,
          pj: 49,
          pg: 35,
          pe: 9,
          pp: 5,
          total_puntos: 170,
          cagadas_en_gol: 4,
          mvp: 11,
          ace: 7,
          capitan_defeat: 1,
          bita_defeat: 1
        }
      }
    ];

    try {
      showToast('Creando jugadores dummy...', 'info');
      
      for (const jugadorData of jugadoresDummy) {
        // Crear el jugador con solo el nombre primero
        const { data: jugadorCreado, error: errorJugador } = await supabase
          .from('jugadores')
          .insert([{ nombre: jugadorData.nombre }])
          .select();

        if (errorJugador) {
          console.error(`Error al crear ${jugadorData.nombre}:`, errorJugador);
          continue;
        }

        const jugadorId = jugadorCreado[0].id;

        // Actualizar con estadísticas básicas (solo las que sabemos que existen)
        const statsBasicas = {
          winrate: jugadorData.stats.winrate,
          goles: jugadorData.stats.goles,
          atajadas: jugadorData.stats.atajadas,
          pj: jugadorData.stats.pj,
          pg: jugadorData.stats.pg,
          pe: jugadorData.stats.pe,
          pp: jugadorData.stats.pp,
          total_puntos: jugadorData.stats.total_puntos
        };

        const { error: errorUpdate } = await supabase
          .from('jugadores')
          .update(statsBasicas)
          .eq('id', jugadorId);

        if (errorUpdate) {
          console.error(`Error al actualizar estadísticas de ${jugadorData.nombre}:`, errorUpdate);
          console.error('Detalles del error:', errorUpdate);
          continue;
        }

        // Asignar posiciones
        const posicionPrimaria = posicionesIds[jugadorData.posicion_primaria];
        const posicionSecundaria = jugadorData.posicion_secundaria ? posicionesIds[jugadorData.posicion_secundaria] : null;

        if (posicionPrimaria) {
          await asignarPosicionesJugador(jugadorId, posicionPrimaria, posicionSecundaria);
        }
      }

      showToast('¡Jugadores dummy creados exitosamente!', 'success');
      
      // Recargar datos
      await cargarTodosLosJugadores();
      await cargarEstadisticas();
      renderizarEquipos();
      
    } catch (error) {
      console.error('Error al crear jugadores dummy:', error);
      showToast('Error al crear jugadores dummy', 'error');
    }
  }

  // Hacer la función global para poder llamarla desde la consola
  window.crearJugadoresDummy = crearJugadoresDummy;

  // --- Función simplificada para crear jugadores dummy ---
  async function crearJugadoresSimples() {
    const jugadores = [
      { nombre: 'Leo Messi', posicion: 'Atacante', winrate: 85, goles: 45, atajadas: 0 },
      { nombre: 'Sergio Ramos', posicion: 'Defensor', winrate: 78, goles: 8, atajadas: 0 },
      { nombre: 'Thibaut Courtois', posicion: 'Arquero', winrate: 72, goles: 0, atajadas: 89 },
      { nombre: 'Luka Modric', posicion: 'Mediocampo', winrate: 80, goles: 12, atajadas: 0 }
    ];

    try {
      showToast('Creando jugadores simples...', 'info');
      
      for (const jugador of jugadores) {
        // Crear jugador solo con nombre
        const { data: jugadorCreado, error: errorJugador } = await supabase
          .from('jugadores')
          .insert([{ nombre: jugador.nombre }])
          .select();

        if (errorJugador) {
          console.error(`Error al crear ${jugador.nombre}:`, errorJugador);
          continue;
        }

        const jugadorId = jugadorCreado[0].id;

        // Actualizar con estadísticas básicas
        const { error: errorUpdate } = await supabase
          .from('jugadores')
          .update({
            winrate: jugador.winrate,
            goles: jugador.goles,
            atajadas: jugador.atajadas,
            pj: 50,
            pg: Math.floor(50 * jugador.winrate / 100),
            pe: 5,
            pp: 50 - Math.floor(50 * jugador.winrate / 100) - 5,
            total_puntos: jugador.winrate * 2
          })
          .eq('id', jugadorId);

        if (errorUpdate) {
          console.error(`Error al actualizar ${jugador.nombre}:`, errorUpdate);
          continue;
        }

        // Asignar posición
        const posicionId = posicionesIds[jugador.posicion];
        if (posicionId) {
          await asignarPosicionesJugador(jugadorId, posicionId, null);
        }
      }

      showToast('¡Jugadores simples creados exitosamente!', 'success');
      await cargarTodosLosJugadores();
      await cargarEstadisticas();
      renderizarEquipos();
      
    } catch (error) {
      console.error('Error al crear jugadores simples:', error);
      showToast('Error al crear jugadores simples', 'error');
    }
  }

  // Hacer ambas funciones globales
  window.crearJugadoresSimples = crearJugadoresSimples;

  // --- Función para crear temporadas dummy ---
  async function crearTemporadasDummy() {
    const temporadas = [
      {
        nombre: "Temporada 1 - Primera División",
        fecha_inicio: "2024-01-01",
        fecha_fin: "2024-06-30"
      },
      {
        nombre: "Temporada 2 - Copa de Verano",
        fecha_inicio: "2024-07-01",
        fecha_fin: "2024-12-31"
      }
    ];

    try {
      showToast('Creando temporadas dummy...', 'info');
      
      for (const temporada of temporadas) {
        const { error } = await supabase
          .from('temporadas')
          .insert([temporada]);

        if (error) {
          console.error(`Error al crear temporada ${temporada.nombre}:`, error);
          continue;
        }
      }

      showToast('¡Temporadas dummy creadas exitosamente!', 'success');
      await cargarTemporadas();
      
    } catch (error) {
      console.error('Error al crear temporadas dummy:', error);
      showToast('Error al crear temporadas dummy', 'error');
    }
  }

  window.crearTemporadasDummy = crearTemporadasDummy;

  // --- Función para crear datos completos de prueba ---
  async function crearDatosCompletos() {
    try {
      showToast('Creando datos completos de prueba...', 'info');
      
      // 1. Crear temporadas si no existen
      await crearTemporadasDummy();
      
      // 2. Crear jugadores simples
      await crearJugadoresSimples();
      
      // 3. Crear algunos datos en estadisticas_temporada
      const jugadores = await supabase.from('jugadores').select('id').limit(3);
      if (jugadores.data && jugadores.data.length > 0) {
        for (const jugador of jugadores.data) {
          const statsData = {
            temporada_id: 1,
            jugador_id: jugador.id,
            total_puntos: Math.floor(Math.random() * 100) + 50,
            pj: Math.floor(Math.random() * 20) + 10,
            pg: Math.floor(Math.random() * 10) + 5,
            pe: Math.floor(Math.random() * 3),
            pp: Math.floor(Math.random() * 5),
            goles: Math.floor(Math.random() * 15),
            asistencias: Math.floor(Math.random() * 10),
            cagadas_en_gol: Math.floor(Math.random() * 3),
            mvp_count: Math.floor(Math.random() * 5),
            ace_count: Math.floor(Math.random() * 3),
            atajadas: Math.floor(Math.random() * 20),
            winrate: Math.floor(Math.random() * 40) + 50,
            capitan_defeat: Math.floor(Math.random() * 2),
            bita_defeat: Math.floor(Math.random() * 2)
          };
          
          await supabase.from('estadisticas_temporada').upsert([statsData]);
        }
      }
      
      showToast('¡Datos completos creados! Recarga la página.', 'success');
      
    } catch (error) {
      console.error('Error al crear datos completos:', error);
      showToast('Error al crear datos completos', 'error');
    }
  }

  window.crearDatosCompletos = crearDatosCompletos;

  // --- Función para scroll a equipos ---
  window.scrollToTeams = () => {
    const teamsSection = document.querySelector('section[style*="animation-delay: 0.3s"]');
    if (teamsSection) {
      teamsSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  };

  // --- Test de conexión a Supabase ---
  async function testSupabaseConnection() {
    try {
      console.log('Probando conexión a Supabase...');
      const { data, error } = await supabase.from('posicion').select('count').limit(1);
      if (error) {
        console.error('Error de conexión a Supabase:', error);
        showToast('Error de conexión a Supabase: ' + error.message, 'error');
        return false;
      }
      console.log('✅ Conexión a Supabase exitosa');
      return true;
    } catch (error) {
      console.error('Error al probar conexión:', error);
      showToast('Error al conectar con la base de datos', 'error');
      return false;
    }
  }

  // --- Inicialización ---
  console.log('Initializing app...');
  
  // Cargar todo de forma secuencial para evitar problemas de timing
  const inicializar = async () => {
    try {
      // Probar conexión primero
      const conexionOk = await testSupabaseConnection();
      if (!conexionOk) {
        console.error('No se pudo establecer conexión con Supabase');
        return;
      }
      
      await inicializarPosiciones(); // Cargar posiciones primero
      await cargarTemporadas(); // Cargar temporadas
      await cargarTodosLosJugadores(); // Cargar la lista de jugadores
      await cargarEstadisticas(); // Cargar estadísticas después de posiciones
      configurarFiltroPartidos(); // Configurar filtro de partidos
      renderizarEquipos(); // Inicializar equipos vacíos
      console.log('App initialized successfully');
      console.log('💡 Tip: Ejecuta crearJugadoresDummy() en la consola para crear jugadores de prueba');
    } catch (error) {
      console.error('Error during initialization:', error);
      showToast('Error al inicializar la aplicación', 'error');
    }
  };
  
  inicializar();
  
  // Agregar event listeners para ordenamiento
  setTimeout(() => {
    document.querySelectorAll('.sortable').forEach(header => {
      header.addEventListener('click', () => {
        const field = header.dataset.sort;
        if (field) {
          handleSort(field);
        }
      });
    });
  }, 1000); // Esperar a que se cargue el DOM
};

// --- Iniciar la aplicación ---
document.addEventListener('DOMContentLoaded', initApp);
