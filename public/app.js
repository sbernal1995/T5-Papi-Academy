// src/app.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Cargar variables de entorno desde .env (solo para desarrollo local, en producción usar variables de entorno del build)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

// Crear cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  let equipo1 = [];
  let equipo2 = [];
  let eventos = [];
  let jugadorEditando = null; // Para saber si estamos editando o agregando

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

  // --- Lógica de carga de datos ---
  async function cargarTodosLosJugadores() {
    const { data, error } = await supabase.from('jugadores').select(`
      id, 
      nombre,
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
      const conteo = {};
      
      // Inicializar conteo con todas las posiciones conocidas
      todasLasPosiciones.forEach(pos => {
        conteo[pos.id] = 0;
      });
      
      equipo.forEach(jugador => {
        if (jugador.jugador_posicion && jugador.jugador_posicion.length > 0) {
          const primaria = jugador.jugador_posicion.find(jp => jp.es_primaria);
          if (primaria) {
            conteo[primaria.posicion_id] = (conteo[primaria.posicion_id] || 0) + 1;
          }
        }
      });
      
      return conteo;
    };

    const mostrarDistribucion = (conteo) => {
      let html = '<div class="mt-2 pt-2 border-top border-secondary"><small class="text-muted d-block mb-1">Distribución:</small>';
      
      // Mostrar iconos repetidos según la cantidad
      Object.entries(conteo).forEach(([posicionId, cantidad]) => {
        if (cantidad > 0) {
          const icono = iconosPosiciones[posicionId];
          const nombre = nombresPosiciones[posicionId];
          html += `<div class="d-inline-block me-2">`;
          for (let i = 0; i < cantidad; i++) {
            html += `<span class="me-1" title="${nombre}">${icono}</span>`;
          }
          html += `</div>`;
        }
      });
      
      html += '</div>';
      return html;
    };

    const renderEquipo = (equipo, containerId, colorClass) => {
      const container = document.getElementById(containerId);
      const conteo = contarPosiciones(equipo);
      
      container.innerHTML = ''; // Limpiar siempre antes de renderizar

      if (equipo.length === 0) {
        container.innerHTML = `
          <div class="text-center text-light-emphasis py-4 d-flex flex-column align-items-center justify-content-center h-100">
            <i class="bi bi-people fs-1 text-secondary mb-3"></i>
            <p class="fw-medium mt-2 mb-1">Aún no hay jugadores.</p>
            <p class="small text-muted">Usa el campo de arriba para agregarlos.</p>
          </div>
        `;
      } else {
        // Lista de jugadores
        const jugadoresDiv = document.createElement('div');
        jugadoresDiv.className = 'mb-3';
        
        equipo.forEach((jugador, index) => {
          const playerEl = document.createElement('div');
          playerEl.className = `player-item d-flex justify-content-between align-items-center p-2 mb-2 rounded`;
          playerEl.innerHTML = `
            <div class="d-flex align-items-center">
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
        
        // Distribución de posiciones
        const distribucionEl = document.createElement('div');
        distribucionEl.innerHTML = mostrarDistribucion(conteo);
        container.appendChild(distribucionEl);
      }
    };

    renderEquipo(equipo1, 'equipo1-jugadores', 'primary');
    renderEquipo(equipo2, 'equipo2-jugadores', 'danger');
    
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
          showToast(`${jugadorRemovido.nombre} removido del Equipo 1`, 'info');
      } else {
          const jugadorRemovido = equipo2[index];
          equipo2.splice(index, 1);
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
    
    // Agregar el jugador al equipo
    if (equipo === 'equipo1') {
      equipo1.push(jugadorExistente);
      showToast(`${jugadorExistente.nombre} agregado al Equipo 1`, 'success');
    } else {
      equipo2.push(jugadorExistente);
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
    const { data, error } = await supabase.from('jugadores').select(`
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
    if (error) {
      console.error('Error al cargar estadísticas:', error);
      showToast('Error al cargar estadísticas', 'error');
      return;
    }
    const tbody = document.getElementById('stats-table-body');
    tbody.innerHTML = '';
    data.forEach((jugador, idx) => {
      const tr = document.createElement('tr');
      
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
      
      tr.innerHTML = `
        <td class="fw-bold text-white">${jugador.nombre}</td>
        <td>${mostrarPosiciones(jugador.jugador_posicion)}</td>
        <td class="text-center">${createBadge(jugador.total_puntos, 'points')}</td>
        <td class="text-center"><span class="badge bg-outline-light">${jugador.pj ?? 0}</span></td>
        <td class="text-center"><span class="badge bg-success">${jugador.pg ?? 0}</span></td>
        <td class="text-center"><span class="badge bg-warning">${jugador.pe ?? 0}</span></td>
        <td class="text-center"><span class="badge bg-danger">${jugador.pp ?? 0}</span></td>
        <td class="text-center fw-semibold text-success">${jugador.goles ?? 0}</td>
        <td class="text-center fw-semibold text-info">${jugador.asistencias ?? 0}</td>
        <td class="text-center fw-semibold text-danger">${jugador.cagadas_en_gol ?? 0}</td>
        <td class="text-center"><span class="badge bg-primary">${jugador.mvp ?? 0}</span></td>
        <td class="text-center"><span class="badge bg-secondary">${jugador.ace ?? 0}</span></td>
        <td class="text-center fw-semibold text-warning">${jugador.atajadas ?? 0}</td>
        <td class="text-center">${createBadge(jugador.winrate, 'winrate')}%</td>
        <td class="text-center fw-semibold text-light">${jugador.capitan_defeat ?? 0}</td>
        <td class="text-center fw-semibold text-light">${jugador.bita_defeat ?? 0}</td>
        <td class="text-center">
          <div class="btn-group" role="group">
            <button onclick="abrirModalEditar('${jugador.id}')" class="btn btn-sm btn-outline-primary" title="Editar jugador">
              <i class="bi bi-pencil"></i>
            </button>
            <button onclick="eliminarJugador('${jugador.id}', '${jugador.nombre}')" class="btn btn-sm btn-outline-danger" title="Eliminar jugador">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
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
        await editarJugador(jugadorEditando.id, nombre, posicionPrimaria, posicionSecundaria);
        showToast('Jugador actualizado exitosamente!', 'success');
      } else {
        // MODO AGREGAR
        await agregarJugador(nombre, posicionPrimaria, posicionSecundaria);
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
  async function agregarJugador(nombre, posicionPrimaria, posicionSecundaria) {
    // Insertar el jugador
    const { data: jugadorData, error: jugadorError } = await supabase
      .from('jugadores')
      .insert([{ nombre: nombre }])
      .select();
    
    if (jugadorError) {
      throw jugadorError;
    }

    const jugadorId = jugadorData[0].id;
    await asignarPosicionesJugador(jugadorId, posicionPrimaria, posicionSecundaria);
  }

  // Función para editar un jugador existente
  async function editarJugador(jugadorId, nombre, posicionPrimaria, posicionSecundaria) {
    // Actualizar nombre del jugador
    const { error: jugadorError } = await supabase
      .from('jugadores')
      .update({ nombre: nombre })
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

  // --- Inicialización ---
  console.log('Initializing app...');
  inicializarPosiciones(); // Crear posiciones si no existen
  cargarEstadisticas();
  cargarTodosLosJugadores(); // Cargar la lista de jugadores para validación
  renderizarEquipos(); // Inicializar equipos vacíos
  console.log('App initialized');
};

// --- Iniciar la aplicación ---
document.addEventListener('DOMContentLoaded', initApp);
