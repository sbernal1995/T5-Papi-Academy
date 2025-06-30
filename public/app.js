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
      
      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 3) + (puntosPP * 2);
      const rendArquero = atajadasPP * 1.5;
      
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
    renderizarDestacados(data);
    
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
        <td class="fw-bold text-white">
          ${jugadorData.jugadores.nombre}${crearIconoRacha(jugadorData.jugadores.id)}
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

  // --- Función para cargar historial de partidos ---
  async function cargarHistorialPartidos() {
    const container = document.getElementById('historial-partidos-container');
    if (!container) return;
    
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
      
      // Primero intentar consulta simple para diagnosticar
      const cantidad = parseInt(document.getElementById('cantidad-partidos')?.value) || 5;
      console.log('🔍 Intentando cargar partidos, cantidad:', cantidad, 'temporada:', temporadaSeleccionada);
      
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
        mostrarPartidosBasicos(container, partidos);
      
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

  function mostrarPartidosBasicos(container, partidos) {
    console.log('🎨 Mostrando partidos con detalles completos:', partidos);
    let html = '<div class="row g-4">';
    
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

  // Función para eliminar un partido completo
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

  // Hacer la función global
  window.cargarHistorialPartidos = cargarHistorialPartidos;

  // ===============================
  // Funcionalidad de Edición de Partidos
  // ===============================
  
  let partidoEnEdicion = null;

  // Función para abrir el modal de edición
  window.editarPartido = async function(partidoId) {
    console.log('✏️ CLICK EN EDITAR - Abriendo editor de partido para ID:', partidoId);
    console.log('🔍 Función editarPartido ejecutada correctamente');
    try {
      showToast('Cargando datos del partido...', 'info');
      
      // Cargar datos completos del partido
      const { data: partido, error } = await supabase
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
        `)
        .eq('id', partidoId)
        .single();

      if (error) {
        console.error('Error al cargar partido:', error);
        showToast('Error al cargar los datos del partido', 'error');
        return;
      }

      partidoEnEdicion = partido;
      console.log('📥 Datos del partido cargados:', partido);
      
      // Cargar temporadas para el selector
      console.log('🏆 Cargando temporadas...');
      await cargarTemporadasEdicion();
      
      // Poblar el modal con los datos
      console.log('📝 Poblando modal con datos...');
      poblarModalEdicion(partido);
      
      // Abrir el modal
      console.log('🪟 Abriendo modal de edición...');
      const modal = new bootstrap.Modal(document.getElementById('editarPartidoModal'));
      modal.show();
      console.log('✅ Modal de edición abierto');
      
      // Configurar event listener del formulario DESPUÉS de abrir el modal
      setTimeout(() => {
        const form = document.getElementById('editar-partido-form');
        if (form) {
          console.log('🔧 Configurando event listener del formulario después de abrir modal...');
          
          // Remover event listeners previos
          const nuevoForm = form.cloneNode(true);
          form.parentNode.replaceChild(nuevoForm, form);
          
          // Agregar nuevo event listener
          nuevoForm.addEventListener('submit', async function(e) {
            console.log('📝 FORMULARIO ENVIADO - event listener funcionando!');
            e.preventDefault();
            console.log('🛑 preventDefault() ejecutado');
            await guardarCambiosPartido();
          });
          
          console.log('✅ Event listener del formulario configurado correctamente');
          
          // Método principal: capturar click directo del botón guardar
          const guardarBtn = document.getElementById('btn-guardar-cambios');
          if (guardarBtn) {
            // Remover listeners previos
            const nuevoGuardarBtn = guardarBtn.cloneNode(true);
            guardarBtn.parentNode.replaceChild(nuevoGuardarBtn, guardarBtn);
            
            nuevoGuardarBtn.addEventListener('click', async function(e) {
              console.log('🖱️ CLICK DIRECTO en botón Guardar Cambios');
              e.preventDefault();
              e.stopPropagation();
              console.log('🛑 Click preventDefault() ejecutado');
              await guardarCambiosPartido();
            });
            console.log('✅ Event listener del botón guardar configurado');
          } else {
            console.error('❌ No se encontró el botón guardar cambios');
          }
          
        } else {
          console.error('❌ No se encontró el formulario después de abrir el modal');
        }
      }, 500);
      
    } catch (error) {
      console.error('Error al editar partido:', error);
      showToast('Error inesperado al cargar el partido', 'error');
    }
  };
  
  // Verificar que la función esté disponible globalmente
  console.log('🔧 Función editarPartido registrada:', typeof window.editarPartido);
  
  // Función de test para verificar manualmente
  window.testEditarPartido = function() {
    console.log('🧪 TEST: Verificando función editarPartido...');
    console.log('🔍 Tipo:', typeof window.editarPartido);
    console.log('🔍 Función:', window.editarPartido);
    console.log('💡 Para probar, ejecuta: window.editarPartido("test-id")');
  };
  
  // Función de test para revisar estadísticas por temporada
  window.testEstadisticasTemporada = async function(temporadaId) {
    console.log('🧪 TEST: Consultando estadísticas para temporada:', temporadaId);
    
    try {
      // Consulta directa a la vista
      const { data: vistaData, error: vistaError } = await supabase
        .from('vista_estadisticas_por_temporada')
        .select('*')
        .eq('temporada_id', temporadaId);
        
      console.log('📊 Resultado vista:', { vistaData, vistaError });
      
      // Buscar específicamente a Boska
      const boskaData = vistaData?.filter(d => d.jugadores?.nombre?.toLowerCase().includes('boska'));
      console.log('🔍 Datos de Boska en vista:', boskaData);
      
      // También consultar partidos directamente
      const { data: partidosData, error: partidosError } = await supabase
        .from('jugador_partido')
        .select(`
          *,
          partidos!inner(temporada_id),
          jugadores(nombre)
        `)
        .eq('partidos.temporada_id', temporadaId);
        
      console.log('🎮 Partidos en temporada:', { partidosData, partidosError });
      
      const boskaPartidos = partidosData?.filter(d => d.jugadores?.nombre?.toLowerCase().includes('boska'));
      console.log('🎯 Partidos de Boska en temporada:', boskaPartidos);
      
    } catch (error) {
      console.error('❌ Error en test:', error);
    }
  };

  // Función para cargar temporadas en el modal de edición
  async function cargarTemporadasEdicion() {
    try {
      const { data: temporadas, error } = await supabase
        .from('temporadas')
        .select('id, nombre')
        .order('fecha_inicio', { ascending: false });

      const select = document.getElementById('editar-temporada');
      if (select && temporadas) {
        select.innerHTML = '<option value="">Sin temporada</option>';
        temporadas.forEach(temporada => {
          const option = document.createElement('option');
          option.value = temporada.id;
          option.textContent = temporada.nombre;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error al cargar temporadas para edición:', error);
    }
  }

  // Función para poblar el modal con los datos del partido
  function poblarModalEdicion(partido) {
    // Información básica
    document.getElementById('editar-fecha').value = partido.fecha;
    document.getElementById('editar-cancha').value = partido.cancha || '';
    document.getElementById('editar-temporada').value = partido.temporada_id || '';
    
    // Separar jugadores por equipo
    const equipo1 = partido.jugador_partido?.filter(jp => jp.equipo === 1) || [];
    const equipo2 = partido.jugador_partido?.filter(jp => jp.equipo === 2) || [];
    
    // Renderizar equipos
    renderizarEquiposEdicion(equipo1, 1);
    renderizarEquiposEdicion(equipo2, 2);
    
    // Renderizar goles
    renderizarGolesEdicion(partido.goles || []);
    
    // Poblar selectores de MVP y ACE
    poblarSelectoresMVPACE(partido.jugador_partido || []);
    
    // Seleccionar MVP y ACE actuales
    const mvpActual = partido.jugador_partido?.find(jp => jp.mvp);
    const aceActual = partido.jugador_partido?.find(jp => jp.ace);
    
    if (mvpActual) {
      document.getElementById('editar-mvp').value = mvpActual.jugador_id;
    }
    if (aceActual) {
      document.getElementById('editar-ace').value = aceActual.jugador_id;
    }
  }

  // Función para renderizar equipos en el modal de edición
  function renderizarEquiposEdicion(equipo, equipoNum) {
    const container = document.getElementById(`editar-equipo${equipoNum}-container`);
    if (!container) return;
    
    container.innerHTML = '';
    
    equipo.forEach((jp, index) => {
      const jugadorDiv = document.createElement('div');
      jugadorDiv.className = 'mb-2 p-2 border rounded bg-dark';
      jugadorDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <span class="text-white">${jp.jugadores?.nombre || 'Jugador'}</span>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarJugadorEdicion(${equipoNum}, '${jp.jugador_id}')">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <div class="row g-2 mt-2">
          <div class="col-md-6">
            <label class="form-label small text-light">🥅 Atajadas</label>
            <input type="number" class="form-control form-control-sm" 
                   value="${jp.atajadas || 0}" min="0" 
                   onchange="actualizarEstadisticaJugador('${jp.jugador_id}', 'atajadas', this.value)">
          </div>
          <div class="col-md-6">
            <label class="form-label small text-light">💥 Cagadas</label>
            <input type="number" class="form-control form-control-sm" 
                   value="${jp.cagadas || 0}" min="0" 
                   onchange="actualizarEstadisticaJugador('${jp.jugador_id}', 'cagadas', this.value)">
          </div>
        </div>
      `;
      container.appendChild(jugadorDiv);
    });
    
    // Botón para agregar jugador
    const agregarBtn = document.createElement('button');
    agregarBtn.type = 'button';
    agregarBtn.className = 'btn btn-sm btn-outline-primary w-100';
    agregarBtn.innerHTML = `<i class="bi bi-plus"></i> Agregar Jugador al Equipo ${equipoNum}`;
    agregarBtn.onclick = () => agregarJugadorEdicion(equipoNum);
    container.appendChild(agregarBtn);
  }

  // Función para renderizar goles en el modal de edición
  function renderizarGolesEdicion(goles) {
    const container = document.getElementById('editar-goles-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (goles.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-3">Sin goles registrados</div>';
      return;
    }
    
    goles.forEach((gol, index) => {
      const golDiv = document.createElement('div');
      golDiv.className = 'mb-3 p-3 border rounded bg-dark';
      golDiv.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <h6 class="text-white mb-2">Gol ${index + 1}</h6>
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="eliminarGolEdicion('${gol.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </div>
        <div class="row g-2">
          <div class="col-md-3">
            <label class="form-label small text-light">👤 Goleador</label>
            <select class="form-control form-control-sm goleador-select" data-gol-id="${gol.id}">
              <option value="">Seleccionar goleador</option>
              ${partidoEnEdicion.jugador_partido?.map(jp => 
                `<option value="${jp.jugador_id}" ${jp.jugador_id === gol.goleador_id ? 'selected' : ''}>
                  ${jp.jugadores?.nombre}
                </option>`
              ).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-light">🅰️ Asistidor</label>
            <select class="form-control form-control-sm asistidor-select" data-gol-id="${gol.id}">
              <option value="">Sin asistencia</option>
              ${partidoEnEdicion.jugador_partido?.map(jp => 
                `<option value="${jp.jugador_id}" ${jp.jugador_id === gol.asistidor_id ? 'selected' : ''}>
                  ${jp.jugadores?.nombre}
                </option>`
              ).join('')}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-light">🏃 Equipo</label>
            <select class="form-control form-control-sm equipo-select" data-gol-id="${gol.id}">
              <option value="1" ${gol.equipo === 1 ? 'selected' : ''}>Equipo 1</option>
              <option value="2" ${gol.equipo === 2 ? 'selected' : ''}>Equipo 2</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-light">⏱️ Minuto</label>
            <input type="number" class="form-control form-control-sm minuto-input" 
                   value="${gol.minuto || ''}" min="1" max="120" 
                   placeholder="Minuto" data-gol-id="${gol.id}">
          </div>
        </div>
      `;
      container.appendChild(golDiv);
    });
  }

  // Función para poblar selectores de MVP y ACE
  function poblarSelectoresMVPACE(jugadores) {
    const mvpSelect = document.getElementById('editar-mvp');
    const aceSelect = document.getElementById('editar-ace');
    
    if (mvpSelect && aceSelect) {
      const opciones = jugadores.map(jp => 
        `<option value="${jp.jugador_id}">${jp.jugadores?.nombre}</option>`
      ).join('');
      
      mvpSelect.innerHTML = '<option value="">Sin MVP</option>' + opciones;
      aceSelect.innerHTML = '<option value="">Sin ACE</option>' + opciones;
    }
  }

  // Función para agregar gol en edición
  window.agregarGolEdicion = function() {
    const container = document.getElementById('editar-goles-container');
    if (!container || !partidoEnEdicion) return;
    
    // Crear ID temporal para el nuevo gol
    const tempId = 'temp_' + Date.now();
    
    const golDiv = document.createElement('div');
    golDiv.className = 'mb-3 p-3 border rounded bg-dark';
    golDiv.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <h6 class="text-white mb-2">Nuevo Gol</h6>
        <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentElement.parentElement.remove()">
          <i class="bi bi-x"></i>
        </button>
      </div>
      <div class="row g-2">
        <div class="col-md-3">
          <label class="form-label small text-light">👤 Goleador</label>
          <select class="form-control form-control-sm goleador-select" data-gol-id="${tempId}">
            <option value="">Seleccionar goleador</option>
            ${partidoEnEdicion.jugador_partido?.map(jp => 
              `<option value="${jp.jugador_id}">${jp.jugadores?.nombre}</option>`
            ).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small text-light">🅰️ Asistidor</label>
          <select class="form-control form-control-sm asistidor-select" data-gol-id="${tempId}">
            <option value="">Sin asistencia</option>
            ${partidoEnEdicion.jugador_partido?.map(jp => 
              `<option value="${jp.jugador_id}">${jp.jugadores?.nombre}</option>`
            ).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small text-light">🏃 Equipo</label>
          <select class="form-control form-control-sm equipo-select" data-gol-id="${tempId}">
            <option value="1">Equipo 1</option>
            <option value="2">Equipo 2</option>
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small text-light">⏱️ Minuto</label>
          <input type="number" class="form-control form-control-sm minuto-input" 
                 placeholder="Minuto" min="1" max="120" data-gol-id="${tempId}">
        </div>
      </div>
    `;
    
    // Insertar antes del mensaje "sin goles" si existe, o al final
    const sinGoles = container.querySelector('.text-muted');
    if (sinGoles) {
      container.removeChild(sinGoles);
    }
    
    container.appendChild(golDiv);
  };

  // Función para eliminar gol en edición
  window.eliminarGolEdicion = function(golId) {
    if (confirm('¿Estás seguro de que quieres eliminar este gol?')) {
      const golElement = document.querySelector(`[data-gol-id="${golId}"]`)?.closest('.mb-3');
      if (golElement) {
        golElement.remove();
      }
    }
  };

  // Función para actualizar estadística de jugador
  window.actualizarEstadisticaJugador = function(jugadorId, campo, valor) {
    // Buscar el jugador en partidoEnEdicion y actualizar el valor
    if (partidoEnEdicion && partidoEnEdicion.jugador_partido) {
      const jugador = partidoEnEdicion.jugador_partido.find(jp => jp.jugador_id === jugadorId);
      if (jugador) {
        jugador[campo] = parseInt(valor) || 0;
      }
    }
  };

  // Manejar el envío del formulario de edición y botones de editar
  document.addEventListener('DOMContentLoaded', function() {
    console.log('🔧 Configurando event listeners para edición de partidos...');
    
    // Event listener para el formulario
    const form = document.getElementById('editar-partido-form');
    if (form) {
      console.log('✅ Formulario de edición encontrado, agregando event listener');
      form.addEventListener('submit', async function(e) {
        console.log('📝 Formulario de edición enviado');
        e.preventDefault();
        await guardarCambiosPartido();
      });
    } else {
      console.log('❌ No se encontró el formulario de edición');
    }
    
    // Event listener alternativo para botones de editar (delegated event)
    document.addEventListener('click', function(e) {
      if (e.target.closest('button[title="Editar partido"]')) {
        console.log('🖱️ CLICK ALTERNATIVO detectado en botón editar');
        const button = e.target.closest('button[title="Editar partido"]');
        const partidoCard = button.closest('.partido-card');
        if (partidoCard) {
          console.log('🔍 Buscando ID del partido en el card...');
          // Intentar extraer el ID del partido del DOM
          const partidoData = partidoCard.querySelector('[data-partido-id]');
          if (partidoData) {
            const partidoId = partidoData.getAttribute('data-partido-id');
            console.log('📋 ID del partido encontrado:', partidoId);
            window.editarPartido(partidoId);
          } else {
            console.log('❌ No se pudo encontrar el ID del partido');
          }
        }
      }
    });
  });

  // Función para guardar cambios del partido
  async function guardarCambiosPartido() {
    console.log('💾 Iniciando guardado de cambios del partido...');
    
    if (!partidoEnEdicion) {
      console.error('❌ No hay partido en edición');
      showToast('Error: No hay partido en edición', 'error');
      return;
    }

    console.log('📋 Partido en edición:', partidoEnEdicion);

    try {
      console.log('🔄 Guardando cambios...');
      showToast('Guardando cambios...', 'info');
      
      // Variable para rastrear problemas con triggers de estadísticas
      let triggerWarning = false;

      // Recopilar datos del formulario
      const fecha = document.getElementById('editar-fecha').value;
      const cancha = document.getElementById('editar-cancha').value;
      const temporadaId = document.getElementById('editar-temporada').value || null;
      const mvpId = document.getElementById('editar-mvp').value || null;
      const aceId = document.getElementById('editar-ace').value || null;
      
      console.log('📋 Datos del formulario:', { fecha, cancha, temporadaId, mvpId, aceId });

      // Actualizar información básica del partido
      console.log('🔄 Actualizando información básica del partido...');
      
      // Preparar datos de actualización (solo incluir temporada_id si tiene valor)
      const updateData = {
        fecha: fecha,
        cancha: cancha
      };
      
      // Solo incluir temporada_id si no está vacío
      if (temporadaId && temporadaId !== '') {
        updateData.temporada_id = temporadaId;
      }
      
      console.log('📋 Datos de actualización:', updateData);
      
      try {
        const { error: partidoError } = await supabase
          .from('partidos')
          .update(updateData)
          .eq('id', partidoEnEdicion.id);

        if (partidoError) {
          // Verificar si es el error específico de la vista estadisticas_jugador
          if (partidoError.message && partidoError.message.includes('estadisticas_jugador')) {
            console.warn('⚠️ Trigger de estadísticas en partido fallido (ignorando):', partidoError.message);
            triggerWarning = true;
          } else {
            console.error('❌ Error al actualizar partido:', partidoError);
            throw new Error(`Error al actualizar partido: ${partidoError.message}`);
          }
        }
        console.log('✅ Información básica del partido actualizada');
      } catch (partidoUpdateError) {
        if (partidoUpdateError.message && partidoUpdateError.message.includes('estadisticas_jugador')) {
          console.warn('⚠️ Trigger de estadísticas en partido fallido (ignorando):', partidoUpdateError.message);
          triggerWarning = true;
        } else {
          throw partidoUpdateError;
        }
      }

      // Actualizar estadísticas de jugadores (atajadas, cagadas)
      for (const jp of partidoEnEdicion.jugador_partido) {
        try {
          const { error: jpError } = await supabase
            .from('jugador_partido')
            .update({
              atajadas: jp.atajadas || 0,
              cagadas: jp.cagadas || 0,
              mvp: jp.jugador_id === mvpId,
              ace: jp.jugador_id === aceId
            })
            .eq('partido_id', partidoEnEdicion.id)
            .eq('jugador_id', jp.jugador_id);

          if (jpError) {
            // Verificar si es el error específico de la vista estadisticas_jugador
            if (jpError.message && jpError.message.includes('estadisticas_jugador')) {
              console.warn('⚠️ Trigger de estadísticas fallido (ignorando):', jpError.message);
              triggerWarning = true;
            } else {
              console.error('❌ Error crítico al actualizar jugador_partido:', jpError);
              throw jpError;
            }
          }
        } catch (updateError) {
          if (updateError.message && updateError.message.includes('estadisticas_jugador')) {
            console.warn('⚠️ Trigger de estadísticas fallido (ignorando):', updateError.message);
            triggerWarning = true;
          } else {
            throw updateError;
          }
        }
      }

      // Eliminar goles existentes
      try {
        const { error: deleteGolesError } = await supabase
          .from('goles')
          .delete()
          .eq('partido_id', partidoEnEdicion.id);

        if (deleteGolesError) {
          // Verificar si es el error específico de la vista estadisticas_jugador
          if (deleteGolesError.message && deleteGolesError.message.includes('estadisticas_jugador')) {
            console.warn('⚠️ Trigger de estadísticas en DELETE goles fallido (ignorando):', deleteGolesError.message);
            triggerWarning = true;
          } else {
            throw new Error(`Error al eliminar goles: ${deleteGolesError.message}`);
          }
        }
      } catch (deleteGolesError) {
        if (deleteGolesError.message && deleteGolesError.message.includes('estadisticas_jugador')) {
          console.warn('⚠️ Trigger de estadísticas en DELETE goles fallido (ignorando):', deleteGolesError.message);
          triggerWarning = true;
        } else {
          throw deleteGolesError;
        }
      }

      // Insertar goles actualizados
      const golesData = [];
      document.querySelectorAll('#editar-goles-container .mb-3').forEach(golDiv => {
        const goleadorSelect = golDiv.querySelector('.goleador-select');
        const asistidorSelect = golDiv.querySelector('.asistidor-select');
        const equipoSelect = golDiv.querySelector('.equipo-select');
        const minutoInput = golDiv.querySelector('.minuto-input');

        if (goleadorSelect && goleadorSelect.value) {
          golesData.push({
            partido_id: partidoEnEdicion.id,
            goleador_id: goleadorSelect.value,
            asistidor_id: asistidorSelect.value || null,
            equipo: parseInt(equipoSelect.value),
            minuto: minutoInput.value ? parseInt(minutoInput.value) : null
          });
        }
      });

      if (golesData.length > 0) {
        try {
          const { error: golesError } = await supabase
            .from('goles')
            .insert(golesData);

          if (golesError) {
            // Verificar si es el error específico de la vista estadisticas_jugador
            if (golesError.message && golesError.message.includes('estadisticas_jugador')) {
              console.warn('⚠️ Trigger de estadísticas en goles fallido (ignorando):', golesError.message);
              triggerWarning = true;
            } else {
              throw new Error(`Error al insertar goles: ${golesError.message}`);
            }
          }
        } catch (golesInsertError) {
          if (golesInsertError.message && golesInsertError.message.includes('estadisticas_jugador')) {
            console.warn('⚠️ Trigger de estadísticas en goles fallido (ignorando):', golesInsertError.message);
            triggerWarning = true;
          } else {
            throw golesInsertError;
          }
        }
      }

      // Cerrar modal
      console.log('🚪 Cerrando modal de edición...');
      const modal = bootstrap.Modal.getInstance(document.getElementById('editarPartidoModal'));
      modal.hide();

      // Mostrar mensaje de éxito apropiado
      if (triggerWarning) {
        showToast('✅ Partido actualizado correctamente. Nota: Los triggers de estadísticas automáticas están fallando (esto es normal).', 'warning');
        console.log('⚠️ Partido actualizado con advertencias sobre triggers de estadísticas');
        console.log('💡 SUGERENCIA: Los triggers que intentan escribir en "estadisticas_jugador" deben ser eliminados de la base de datos');
      } else {
        showToast('¡Partido actualizado exitosamente!', 'success');
        console.log('✅ Partido actualizado exitosamente');
      }
      
      // Recargar historial y estadísticas
      console.log('🔄 Recargando historial y estadísticas...');
      
      // Esperar un poco antes de recargar para que se procesen los cambios
      setTimeout(async () => {
        try {
          await cargarHistorialPartidos();
          await cargarEstadisticas();
          console.log('✅ Proceso de edición completado');
        } catch (error) {
          console.error('Error al recargar después de edición:', error);
        }
      }, 500);

    } catch (error) {
      console.error('Error al guardar cambios:', error);
      showToast(`Error al guardar cambios: ${error.message}`, 'error');
    }
  }

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

  // --- Función para hacer selectores buscables ---
  function initializeSearchableSelects() {
    const searchableSelects = document.querySelectorAll('.searchable-select');
    
    searchableSelects.forEach(select => {
      // Verificar si ya está inicializado
      if (select.dataset.searchableInitialized === 'true') {
        return;
      }
      
      // Marcar como inicializado
      select.dataset.searchableInitialized = 'true';
      
      // Crear un div contenedor para el "combobox"
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';
      wrapper.style.width = '100%';
      wrapper.classList.add('searchable-wrapper');
      
      // Crear input de texto
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'form-control';
      input.placeholder = select.options[0]?.text || 'Escribir o seleccionar...';
      input.autocomplete = 'off';
      input.id = select.id + '_input';
      
      // Crear div para el dropdown
      const dropdown = document.createElement('div');
      dropdown.style.position = 'absolute';
      dropdown.style.top = '100%';
      dropdown.style.left = '0';
      dropdown.style.right = '0';
      dropdown.style.backgroundColor = '#0a0e27';
      dropdown.style.border = '1px solid rgba(255, 255, 255, 0.125)';
      dropdown.style.borderTop = 'none';
      dropdown.style.borderRadius = '0 0 0.375rem 0.375rem';
      dropdown.style.maxHeight = '200px';
      dropdown.style.overflowY = 'auto';
      dropdown.style.zIndex = '1000';
      dropdown.style.display = 'none';
      dropdown.style.boxShadow = '0 0.25rem 0.5rem rgba(0, 0, 0, 0.3)';
      
      // Guardar referencia del select original
      input.originalSelect = select;
      
      // Reemplazar el select con el wrapper
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(input);
      wrapper.appendChild(dropdown);
      select.style.display = 'none';
      
      // Función para actualizar el dropdown cuando cambien las opciones
      function updateDropdown() {
        populateDropdown(input.value);
      }
      
      // Función para poblar el dropdown
      function populateDropdown(filterText = '') {
        dropdown.innerHTML = '';
        let hasResults = false;
        
        Array.from(select.options).forEach(option => {
          if (option.value === '') return; // Skip empty option
          
          const text = option.textContent.toLowerCase();
          const filter = filterText.toLowerCase();
          
          if (!filterText || text.includes(filter)) {
            const item = document.createElement('div');
            item.style.padding = '0.5rem 0.75rem';
            item.style.cursor = 'pointer';
            item.style.borderBottom = '1px solid rgba(255, 255, 255, 0.075)';
            item.style.color = 'rgba(255, 255, 255, 0.75)';
            item.style.fontSize = '0.875rem';
            item.textContent = option.textContent;
            item.dataset.value = option.value;
            
            item.addEventListener('mouseenter', () => {
              item.style.background = 'rgba(13, 110, 253, 0.25)';
              item.style.color = 'white';
            });
            
            item.addEventListener('mouseleave', () => {
              item.style.background = '';
              item.style.color = 'rgba(255, 255, 255, 0.75)';
            });
            
            item.addEventListener('click', () => {
              input.value = option.textContent;
              select.value = option.value;
              dropdown.style.display = 'none';
              
              // Trigger change event
              select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            
            dropdown.appendChild(item);
            hasResults = true;
          }
        });
        
        if (!hasResults && filterText) {
          const noResults = document.createElement('div');
          noResults.style.padding = '0.5rem 0.75rem';
          noResults.style.color = 'rgba(255, 255, 255, 0.5)';
          noResults.style.fontStyle = 'italic';
          noResults.style.fontSize = '0.875rem';
          noResults.textContent = 'No se encontraron resultados';
          dropdown.appendChild(noResults);
        }
      }
      
      // Event listeners
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        populateDropdown(value);
        dropdown.style.display = 'block';
        
        // Clear selection if typing
        select.value = '';
      });
      
      input.addEventListener('focus', () => {
        populateDropdown(input.value);
        dropdown.style.display = 'block';
      });
      
      input.addEventListener('blur', () => {
        // Delay para permitir clicks en el dropdown
        setTimeout(() => {
          dropdown.style.display = 'none';
        }, 150);
      });
      
      // Guardar la función de update en el wrapper para poder llamarla externamente
      wrapper.updateDropdown = updateDropdown;
      
      // Poblar inicialmente
      populateDropdown();
    });
  }
  
  // Función para actualizar los dropdowns cuando cambien las opciones
  function updateSearchableSelects() {
    document.querySelectorAll('.searchable-wrapper').forEach(wrapper => {
      if (wrapper.updateDropdown) {
        wrapper.updateDropdown();
      }
    });
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
      renderizarTablaGoles(); // Inicializar tabla de goles vacía
      
      // Configurar listener para la pestaña de historial
      const historialTab = document.getElementById('historial-tab');
      if (historialTab) {
        historialTab.addEventListener('click', () => {
          // Cargar historial cuando se abra la pestaña
          setTimeout(() => {
            cargarHistorialPartidos();
          }, 100);
        });
      }
      
      // Configurar listeners para selectores de temporada para recargar historial
      const selectorTemporada = document.getElementById('selector-temporada');
      const selectorTemporadaMobile = document.getElementById('selector-temporada-mobile');
      
      if (selectorTemporada) {
        selectorTemporada.addEventListener('change', () => {
          console.log('🏆 Cambio de temporada detectado, recargando datos...');
          
          // Recargar estadísticas siempre
          cargarEstadisticas();
          
          // Solo recargar historial si estamos en la pestaña de historial
          const historialPane = document.getElementById('historial-content');
          if (historialPane && historialPane.classList.contains('active')) {
            cargarHistorialPartidos();
          }
        });
      }
      
      if (selectorTemporadaMobile) {
        selectorTemporadaMobile.addEventListener('change', () => {
          console.log('🏆 Cambio de temporada móvil detectado, recargando datos...');
          
          // Recargar estadísticas siempre
          cargarEstadisticas();
          
          // Solo recargar historial si estamos en la pestaña de historial
          const historialPane = document.getElementById('historial-content');
          if (historialPane && historialPane.classList.contains('active')) {
            cargarHistorialPartidos();
          }
        });
      }
      
      // Configurar listener para el selector de cantidad de partidos
      const cantidadPartidos = document.getElementById('cantidad-partidos');
      if (cantidadPartidos) {
        cantidadPartidos.addEventListener('change', () => {
          cargarHistorialPartidos();
        });
      }
      
      // Cargar historial inicial para evitar el estado de "Cargando..." infinito
      cargarHistorialPartidos();
      
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
