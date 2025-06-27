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
  let equipo1 = [];
  let equipo2 = [];
  let eventos = [];

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
    const { data, error } = await supabase.from('jugadores').select('id, nombre');
    if (error) {
      console.error('Error al cargar jugadores:', error);
      showToast('Error al cargar la lista de jugadores', 'error');
      return [];
    }
    todosLosJugadores = data || [];
    return todosLosJugadores;
  }

  // --- Lógica de renderizado ---

  function renderizarEquipos() {
    const renderEquipo = (equipo, containerId, colorClass) => {
      const container = document.getElementById(containerId);
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
        equipo.forEach((jugador, index) => {
          const playerEl = document.createElement('div');
          playerEl.className = `player-item d-flex justify-content-between align-items-center p-2 mb-2 rounded`;
          playerEl.innerHTML = `
            <span class="text-white fw-medium">${jugador.nombre}</span>
            <button onclick="quitarJugador('${containerId.includes('1') ? 'equipo1' : 'equipo2'}', ${index})" class="btn btn-sm btn-outline-danger">
              <i class="bi bi-x"></i>
            </button>
          `;
          container.appendChild(playerEl);
        });
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
    const { data, error } = await supabase.from('jugadores').select('*');
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
      
      tr.innerHTML = `
        <td class="fw-bold text-white">${jugador.nombre}</td>
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

    if (!nombre) {
      showToast('Por favor ingresa el nombre del jugador.', 'warning');
      return;
    }

    const { error } = await supabase.from('jugadores').insert([
      { nombre: nombre }
    ]);
    
    if (error) {
      console.error('Error al agregar jugador:', error);
      showToast('Error al agregar el jugador: ' + error.message, 'error');
    } else {
      // Cerrar modal usando Bootstrap
      const modal = bootstrap.Modal.getInstance(document.getElementById('playerModal'));
      if (modal) {
        modal.hide();
      }
      form.reset();
      cargarEstadisticas();
      cargarTodosLosJugadores(); // Actualizar lista de jugadores
      renderizarEquipos(); // Inicializar equipos vacíos
      showToast('Jugador agregado exitosamente!');
    }
  });

  // --- Inicialización ---
  console.log('Initializing app...');
  cargarEstadisticas();
  cargarTodosLosJugadores(); // Cargar la lista de jugadores para validación
  renderizarEquipos(); // Inicializar equipos vacíos
  console.log('App initialized');
};

// --- Iniciar la aplicación ---
document.addEventListener('DOMContentLoaded', initApp);
