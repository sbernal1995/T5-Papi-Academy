// src/app.js

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

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

// ==========================================
// SISTEMA DE AUTENTICACIÓN Y PERMISOS
// ==========================================

// Estado global de autenticación
let usuarioActual = null;
let esAdmin = false;

// Estado global del perfil de jugador
let vistaActual = 'dashboard'; // 'dashboard' o 'perfil'
let jugadorPerfilActual = null;
let datosPerfilJugador = null;
let temporadaPerfilSeleccionada = null;
let versionCargaPerfilActual = 0;
let partidoHistorialPendiente = null;

// Variables globales para datos compartidos
let todosLosJugadoresGlobal = [];
let todasLasTemporadasGlobal = [];

// Función para verificar estado de autenticación
async function verificarAutenticacion() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    usuarioActual = user;
    esAdmin = !!user; // Si hay usuario, es admin

    console.log('👤 Estado de autenticación:', { user: usuarioActual, esAdmin });

    // Actualizar UI según estado
    actualizarUISegunPermisos();

    return esAdmin;
  } catch (error) {
    console.error('Error al verificar autenticación:', error);
    usuarioActual = null;
    esAdmin = false;
    actualizarUISegunPermisos();
    return false;
  }
}

// Función para hacer login
async function iniciarSesion() {
  const email = document.getElementById('email-login').value;
  const password = document.getElementById('password-login').value;

  if (!email || !password) {
    showToast('Por favor ingresa email y contraseña', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    usuarioActual = data.user;
    esAdmin = true;

    showToast('✅ Sesión iniciada correctamente', 'success');

    // Cerrar modal de login
    const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
    modal.hide();

    // Actualizar UI
    actualizarUISegunPermisos();

  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

// Función para cerrar sesión
async function cerrarSesion() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    usuarioActual = null;
    esAdmin = false;

    showToast('👋 Sesión cerrada', 'info');
    actualizarUISegunPermisos();

  } catch (error) {
    console.error('Error al cerrar sesión:', error);
    showToast(`Error: ${error.message}`, 'error');
  }
}

// Función para actualizar UI según permisos
function actualizarUISegunPermisos() {
  const elementosAdminSolo = document.querySelectorAll('[data-admin-only]');
  const botonesEdicion = Array.from(document.querySelectorAll('.btn-editar, .btn-eliminar, .btn-agregar, .btn-outline-warning, .btn-outline-danger'))
    .filter(btn => !(btn.closest('#review-sandbox-content') && !btn.hasAttribute('data-admin-only')));

  // Elementos de escritorio
  const botonLogin = document.getElementById('btn-login');
  const botonLogout = document.getElementById('btn-logout');
  const estadoUsuario = document.getElementById('estado-usuario');

  // Elementos móviles
  const botonLoginMobile = document.getElementById('btn-login-mobile');
  const botonLogoutMobile = document.getElementById('btn-logout-mobile');
  const estadoUsuarioMobile = document.getElementById('estado-usuario-mobile');

  if (esAdmin) {
    // Usuario con permisos - mostrar elementos de edición
    elementosAdminSolo.forEach(el => el.style.display = '');
    botonesEdicion.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.title = '';
    });

    // Escritorio
    if (botonLogin) botonLogin.style.display = 'none';
    if (botonLogout) botonLogout.style.display = '';
    if (estadoUsuario) {
      estadoUsuario.innerHTML = `
        <i class="bi bi-person-check text-success"></i>
        <span class="text-success small">Admin: ${usuarioActual?.email || 'Usuario'}</span>
      `;
    }

    // Móvil
    if (botonLoginMobile) botonLoginMobile.style.display = 'none';
    if (botonLogoutMobile) botonLogoutMobile.style.display = '';
    if (estadoUsuarioMobile) {
      estadoUsuarioMobile.innerHTML = `
        <i class="bi bi-person-check text-success"></i>
        <span class="text-success">Admin: ${usuarioActual?.email || 'Usuario'}</span>
      `;
    }
  } else {
    // Usuario sin permisos - ocultar elementos de edición
    elementosAdminSolo.forEach(el => el.style.display = 'none');
    botonesEdicion.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.3';
      btn.title = 'Requiere permisos de administrador';
    });

    // Escritorio
    if (botonLogin) botonLogin.style.display = '';
    if (botonLogout) botonLogout.style.display = 'none';
    if (estadoUsuario) {
      estadoUsuario.innerHTML = `
        <i class="bi bi-person text-warning"></i>
        <span class="text-warning small">Solo lectura</span>
      `;
    }

    // Móvil
    if (botonLoginMobile) botonLoginMobile.style.display = '';
    if (botonLogoutMobile) botonLogoutMobile.style.display = 'none';
    if (estadoUsuarioMobile) {
      estadoUsuarioMobile.innerHTML = `
        <i class="bi bi-person text-warning"></i>
        <span class="text-warning">Solo lectura</span>
      `;
    }
  }
}

// Función para verificar permisos antes de operaciones críticas
function verificarPermisosAdmin(operacion = 'esta operación') {
  if (!esAdmin) {
    showToast(`❌ Se requieren permisos de administrador para ${operacion}`, 'error');

    // Mostrar modal de login
    const modal = new bootstrap.Modal(document.getElementById('loginModal'));
    modal.show();

    return false;
  }
  return true;
}

// Escuchar cambios en el estado de autenticación
supabase.auth.onAuthStateChange((event, session) => {
  console.log('🔄 Cambio en autenticación:', event, session);

  if (event === 'SIGNED_IN') {
    usuarioActual = session.user;
    esAdmin = true;
    actualizarUISegunPermisos();
  } else if (event === 'SIGNED_OUT') {
    usuarioActual = null;
    esAdmin = false;
    actualizarUISegunPermisos();
  }
});

// Hacer funciones globales
window.iniciarSesion = iniciarSesion;
window.cerrarSesion = cerrarSesion;
window.verificarPermisosAdmin = verificarPermisosAdmin;

// ==========================================
// FUNCIONES AUXILIARES PARA LINKS DE YOUTUBE CON TIMESTAMP
// ==========================================

/**
 * Convierte un link de YouTube a formato con timestamp
 * @param {string} youtubeLink - Link original de YouTube
 * @param {number} minutosDecimales - Tiempo del gol en minutos decimales (ej: 5.5 = 5:30)
 * @returns {string} Link con timestamp o null si no es posible generar
 */
function generarLinkConTimestampSegundos(youtubeLink, segundosTotales) {
  if (!youtubeLink || segundosTotales === null || segundosTotales === undefined) {
    return null;
  }

  const youtubeReviewLink = obtenerLinkYouTubeReview(youtubeLink);
  if (!youtubeReviewLink) {
    return null;
  }

  // Convertir minutos decimales a segundos totales
  const segundos = Math.max(0, Math.round(Number(segundosTotales) || 0));

  const videoId = extraerVideoId(youtubeReviewLink);

  // Si se pudo extraer el ID, generar link con timestamp
  if (videoId) {
    return `https://youtu.be/${videoId}?t=${segundos}`;
  }

  // Si no se pudo parsear, devolver el link original con parámetro t
  return `${youtubeReviewLink}${youtubeReviewLink.includes('?') ? '&' : '?'}t=${segundos}`;
}

function generarLinkConTimestamp(youtubeLink, minutosDecimales) {
  if (!youtubeLink || minutosDecimales === null || minutosDecimales === undefined) {
    return null;
  }

  return generarLinkConTimestampSegundos(youtubeLink, Math.round(Number(minutosDecimales) * 60));
}

/**
 * Genera HTML para mostrar múltiples íconos de goles o asistencias con links
 * @param {Array} golesArray - Array de objetos gol del jugador
 * @param {string} youtubeLink - Link del video de YouTube del partido
 * @param {string} tipo - 'gol' o 'asistencia'
 * @returns {string} HTML con los íconos
 */
function generarIconosConLinks(golesArray, youtubeLink, tipo = 'gol') {
  if (!golesArray || golesArray.length === 0) {
    return '';
  }

  const icono = tipo === 'gol' ? '⚽' : '🅰️';
  const total = golesArray.length;

  // Generar un ícono por cada gol/asistencia
  const iconos = golesArray.map(item => {
    const minutosDecimales = item.minuto; // Minutos en formato decimal
    const tieneTiempo = minutosDecimales !== null && minutosDecimales !== undefined;
    const youtubeReviewLink = obtenerLinkYouTubeReview(youtubeLink);
    const tieneVideo = youtubeReviewLink !== '';
    const reviewSegundos = item.review_segundos !== null && item.review_segundos !== undefined
      ? Number(item.review_segundos)
      : null;

    // Si tiene tiempo Y video, crear link clickeable
    if (tieneTiempo && tieneVideo) {
      const linkConTimestamp = Number.isFinite(reviewSegundos)
        ? generarLinkConTimestampSegundos(youtubeReviewLink, reviewSegundos)
        : generarLinkConTimestamp(youtubeReviewLink, minutosDecimales);
      const mins = Math.floor(minutosDecimales);
      const secs = Math.round((minutosDecimales - mins) * 60);
      const timeStr = secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}'`;
      return `<a href="${linkConTimestamp}" target="_blank" class="text-decoration-none" title="Ver ${tipo} en ${timeStr}">${icono}</a>`;
    } else {
      // Si no tiene tiempo o no hay video, solo mostrar el ícono sin link
      return icono;
    }
  }).join('');

  // Agregar el total entre paréntesis
  return `${iconos}(${total})`;
}

function esErrorColumnaFaltante(error, columna) {
  const textoError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const columnaNormalizada = String(columna || '').toLowerCase();
  return textoError.includes(columnaNormalizada) &&
    (textoError.includes('does not exist') || textoError.includes('schema cache') || textoError.includes('column'));
}

function esErrorTablaFaltante(error, tabla) {
  const textoError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const tablaNormalizada = String(tabla || '').toLowerCase();
  return textoError.includes(tablaNormalizada) &&
    (textoError.includes('does not exist') || textoError.includes('schema cache') || textoError.includes('relation'));
}

function esErrorColumnaCagadaFaltante(error) {
  return esErrorColumnaFaltante(error, 'cagada_jugador_id');
}

function obtenerRutaCompartiblePerfil() {
  const url = new URL(window.location.href);
  return {
    vista: url.searchParams.get('view') || 'dashboard',
    jugadorId: url.searchParams.get('jugador'),
    temporadaId: url.searchParams.get('temporada')
  };
}

function normalizarTextoRutaJugador(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function obtenerNombreJugadorParaRuta(jugadorId) {
  if (!jugadorId) return '';

  if (datosPerfilJugador?.jugador?.id === jugadorId && datosPerfilJugador.jugador?.nombre) {
    return datosPerfilJugador.jugador.nombre;
  }

  const jugador = todosLosJugadoresGlobal.find(j => j.id === jugadorId);
  if (jugador?.nombre) {
    return jugador.nombre;
  }

  const selectorHeader = document.getElementById('selector-jugador-perfil');
  const option = selectorHeader ? Array.from(selectorHeader.options).find(opt => opt.value === jugadorId) : null;
  return option?.textContent?.trim() || '';
}

function resolverJugadorIdDesdeRuta(jugadorRef) {
  if (!jugadorRef) return null;

  const jugadorPorId = todosLosJugadoresGlobal.find(j => j.id === jugadorRef);
  if (jugadorPorId) {
    return jugadorPorId.id;
  }

  const referenciaNormalizada = normalizarTextoRutaJugador(jugadorRef);
  const jugadorPorNombre = todosLosJugadoresGlobal.find(j =>
    normalizarTextoRutaJugador(j.nombre) === referenciaNormalizada
  );

  return jugadorPorNombre?.id || null;
}

function obtenerTemporadaActivaDesdeSelectores() {
  const selectorDesktop = document.getElementById('selector-temporada');
  const selectorMobile = document.getElementById('selector-temporada-mobile');
  const esVisible = (elemento) => !!elemento && elemento.getClientRects().length > 0;

  if (selectorDesktop && selectorMobile) {
    if (selectorDesktop.value === selectorMobile.value) {
      return selectorDesktop.value;
    }
    if (esVisible(selectorDesktop)) {
      return selectorDesktop.value;
    }
    if (esVisible(selectorMobile)) {
      return selectorMobile.value;
    }
    return selectorDesktop.value;
  }

  if (selectorDesktop) return selectorDesktop.value;
  if (selectorMobile) return selectorMobile.value;
  return '';
}

function aplicarTemporadaDesdeRuta(temporadaId) {
  const selectores = [
    document.getElementById('selector-temporada'),
    document.getElementById('selector-temporada-mobile')
  ].filter(Boolean);

  if (temporadaId === null || temporadaId === undefined) {
    return obtenerTemporadaActivaDesdeSelectores();
  }

  selectores.forEach(selector => {
    const existeOpcion = Array.from(selector.options).some(option => option.value === String(temporadaId));
    selector.value = existeOpcion ? String(temporadaId) : '';
  });

  return obtenerTemporadaActivaDesdeSelectores();
}

function sincronizarRutaPerfilCompartible({ vista = vistaActual, jugadorId = jugadorPerfilActual, temporadaId } = {}) {
  const url = new URL(window.location.href);

  if (vista === 'perfil' && jugadorId) {
    url.searchParams.set('view', 'perfil');
    const nombreJugador = obtenerNombreJugadorParaRuta(jugadorId);
    url.searchParams.set('jugador', nombreJugador || jugadorId);

    const temporadaActiva = temporadaId !== undefined ? temporadaId : obtenerTemporadaActivaDesdeSelectores();
    if (temporadaActiva) {
      url.searchParams.set('temporada', temporadaActiva);
    } else {
      url.searchParams.delete('temporada');
    }
  } else {
    url.searchParams.delete('view');
    url.searchParams.delete('jugador');
    url.searchParams.delete('temporada');
  }

  const nuevaRuta = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', nuevaRuta);
}

// ==========================================
// SISTEMA DE PERFIL DE JUGADOR
// ==========================================

/**
 * Cambia entre vista Dashboard y Perfil de Jugador
 */
function cambiarVista(vista, jugadorId = null) {
  vistaActual = vista;

  const mainTabContent = document.getElementById('mainTabContent');
  const mainTabsContainer = document.getElementById('mainTabsContainer');
  const perfil = document.getElementById('vista-perfil-jugador');
  const selectorJugador = document.getElementById('selector-jugador-container');
  const btnDashboard = document.getElementById('btn-vista-dashboard');
  const btnJugador = document.getElementById('btn-vista-jugador');

  // Obtener todos los elementos del dashboard que necesitan ocultarse
  const dashboardElements = [mainTabContent, mainTabsContainer].filter(Boolean);

  if (vista === 'dashboard') {
    // Mostrar dashboard
    dashboardElements.forEach(el => el.classList.remove('d-none'));
    if (perfil) perfil.classList.add('d-none');
    if (selectorJugador) selectorJugador.classList.add('d-none');
    if (btnDashboard) btnDashboard.classList.add('active');
    if (btnJugador) btnJugador.classList.remove('active');
    sincronizarRutaPerfilCompartible({ vista: 'dashboard', jugadorId: null, temporadaId: null });
  } else {
    // Mostrar perfil
    dashboardElements.forEach(el => el.classList.add('d-none'));
    if (perfil) perfil.classList.remove('d-none');
    if (selectorJugador) selectorJugador.classList.remove('d-none');
    if (btnDashboard) btnDashboard.classList.remove('active');
    if (btnJugador) btnJugador.classList.add('active');

    if (jugadorId) {
      cargarPerfilJugador(jugadorId);
    }
  }

  console.log(`🔄 Vista cambiada a: ${vista}`);
}

/**
 * Vuelve al dashboard desde el perfil
 */
window.volverDashboard = function() {
  cambiarVista('dashboard');
  // Limpiar selector de jugador
  const selector = document.getElementById('selector-jugador-perfil');
  if (selector) selector.value = '';
};

function escaparHtmlPlano(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escaparTextoParaJs(valor) {
  return String(valor ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

function renderizarAccesoPerfilJugador(jugadorId, nombre, clases = '') {
  const clasesFinales = ['btn btn-link p-0 border-0 text-decoration-none', clases].filter(Boolean).join(' ');
  return `<button type="button" class="${clasesFinales}" onclick="irAPerfilJugador('${escaparTextoParaJs(jugadorId)}')">${escaparHtmlPlano(nombre || 'Jugador')}</button>`;
}

function destacarPartidoEnHistorial(partidoId) {
  const cards = Array.from(document.querySelectorAll('.partido-card'));
  const target = cards.find(card => card.dataset.partidoId === String(partidoId));

  if (!target) {
    return false;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('border-warning', 'shadow-lg');
  window.setTimeout(() => {
    target.classList.remove('border-warning', 'shadow-lg');
  }, 2200);

  return true;
}

window.irAPerfilJugador = function(jugadorId) {
  if (!jugadorId) return;

  const selectorHeader = document.getElementById('selector-jugador-perfil');
  if (selectorHeader) {
    selectorHeader.value = jugadorId;
  }

  cambiarVista('perfil', jugadorId);
};

window.irAPerfilJugadorTab = function(jugadorId, tabId) {
  if (!jugadorId) return;

  window.irAPerfilJugador(jugadorId);

  window.setTimeout(() => {
    const tab = document.getElementById(tabId);
    if (!tab) return;

    if (window.bootstrap?.Tab) {
      window.bootstrap.Tab.getOrCreateInstance(tab).show();
    } else {
      tab.click();
    }
  }, 180);
};

window.irAHistorialJugadorRanking = async function(jugadorId, resultado = '') {
  if (!jugadorId) return;

  cambiarVista('dashboard');

  const aplicarFiltrosHistorial = async () => {
    const selectorCantidad = document.getElementById('cantidad-partidos');
    if (selectorCantidad && Array.from(selectorCantidad.options).some(option => option.value === 'all')) {
      selectorCantidad.value = 'all';
    }

    const selectorJugador = document.getElementById('filtro-jugador');
    if (selectorJugador) selectorJugador.value = jugadorId;

    const selectorResultado = document.getElementById('filtro-resultado');
    if (selectorResultado) selectorResultado.value = resultado;

    if (typeof window.limpiarTagsHistorial === 'function') {
      window.limpiarTagsHistorial();
    }

    if (typeof window.cargarHistorialPartidos === 'function') {
      await window.cargarHistorialPartidos();
    } else if (typeof window.filtrarPartidosAvanzado === 'function') {
      window.filtrarPartidosAvanzado();
    }

    const selectorJugadorFinal = document.getElementById('filtro-jugador');
    if (selectorJugadorFinal) selectorJugadorFinal.value = jugadorId;

    const selectorResultadoFinal = document.getElementById('filtro-resultado');
    if (selectorResultadoFinal) selectorResultadoFinal.value = resultado;

    if (typeof window.filtrarPartidosAvanzado === 'function') {
      window.filtrarPartidosAvanzado();
    }
  };

  const historialTab = document.getElementById('historial-tab');
  if (historialTab && window.bootstrap?.Tab) {
    if (historialTab.classList.contains('active')) {
      await aplicarFiltrosHistorial();
      return;
    }

    historialTab.addEventListener('shown.bs.tab', () => {
      aplicarFiltrosHistorial();
    }, { once: true });
    window.bootstrap.Tab.getOrCreateInstance(historialTab).show();
    return;
  }

  if (historialTab) {
    historialTab.click();
    window.setTimeout(aplicarFiltrosHistorial, 160);
    return;
  }

  await aplicarFiltrosHistorial();
};

window.irAHistorialPartido = async function(partidoId) {
  if (!partidoId) return;

  partidoHistorialPendiente = String(partidoId);

  const selectorCantidad = document.getElementById('cantidad-partidos');
  if (selectorCantidad && Array.from(selectorCantidad.options).some(option => option.value === 'all')) {
    selectorCantidad.value = 'all';
  }

  if (typeof window.limpiarFiltrosHistorial === 'function') {
    window.limpiarFiltrosHistorial();
  }

  cambiarVista('dashboard');

  const historialTab = document.getElementById('historial-tab');
  if (historialTab && window.bootstrap?.Tab) {
    const tabYaActiva = historialTab.classList.contains('active');
    window.bootstrap.Tab.getOrCreateInstance(historialTab).show();
    if (tabYaActiva && typeof window.cargarHistorialPartidos === 'function') {
      await window.cargarHistorialPartidos();
    }
    return;
  }

  if (historialTab) {
    if (historialTab.classList.contains('active') && typeof window.cargarHistorialPartidos === 'function') {
      await window.cargarHistorialPartidos();
      return;
    }
    historialTab.click();
    return;
  }

  if (typeof window.cargarHistorialPartidos === 'function') {
    await window.cargarHistorialPartidos();
  }
};

/**
 * Extrae el ID del video de YouTube de una URL
 */
function extraerVideoId(youtubeLink) {
  if (!youtubeLink) return null;

  let videoId = null;
  try {
    const url = new URL(/^https?:\/\//i.test(youtubeLink) ? youtubeLink : `https://${youtubeLink}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v');
      else if (url.pathname.startsWith('/embed/')) videoId = url.pathname.split('/embed/')[1]?.split('/')[0];
      else if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/shorts/')[1]?.split('/')[0];
    } else if (host === 'youtu.be') {
      videoId = url.pathname.replace(/^\//, '').split('/')[0];
    }
  } catch (error) {
    if (youtubeLink.includes('youtube.com/watch?v=')) {
      videoId = youtubeLink.split('watch?v=')[1].split('&')[0];
    } else if (youtubeLink.includes('youtu.be/')) {
      videoId = youtubeLink.split('youtu.be/')[1].split('?')[0];
    }
  }

  return videoId || null;
}

function obtenerLinkYouTubeReview(link) {
  if (!extraerVideoId(link)) return '';
  try {
    return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).href;
  } catch (error) {
    return link;
  }
}

const PREMIOS_PERFIL_CONFIG = {
  bota: {
    iconHtml: '<i class="bi bi-trophy-fill"></i>',
    nombre: 'Bota de oro',
    prioridad: 1
  },
  guante: {
    iconHtml: '<i class="bi bi-shield-fill"></i>',
    nombre: 'Guante de oro',
    prioridad: 2
  },
  asist: {
    iconHtml: '<i class="bi bi-bezier2"></i>',
    nombre: 'Asist de oro',
    prioridad: 3
  },
  puntos: {
    iconHtml: '<i class="bi bi-award-fill"></i>',
    nombre: 'Ganador puntos',
    prioridad: 4
  },
  mundial: {
    iconHtml: '<i class="bi bi-globe-americas"></i>',
    nombre: 'Ganador mundial',
    prioridad: 5
  },
  max_goles_partido: {
    iconHtml: '<i class="bi bi-bullseye"></i>',
    nombre: 'Max. goles en 1 partido',
    prioridad: 6
  },
  max_asistencias_partido: {
    iconHtml: '<i class="bi bi-bezier2"></i>',
    nombre: 'Max. asistidor en 1 partido',
    prioridad: 7
  },
  cagador_anio: {
    iconHtml: '<i class="bi bi-exclamation-triangle-fill"></i>',
    nombre: 'Cagador del año',
    prioridad: 8
  },
  perdedor_anio: {
    iconHtml: '<i class="bi bi-arrow-down-circle-fill"></i>',
    nombre: 'Perdedor del año',
    prioridad: 9
  },
  talisman: {
    iconHtml: '<i class="bi bi-gem"></i>',
    nombre: 'Talismán',
    prioridad: 10
  }
};

function inyectarEstilosPerfilFut() {
  if (document.getElementById('fut-profile-styles')) return;

  const style = document.createElement('style');
  style.id = 'fut-profile-styles';
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Barlow+Condensed:wght@300;400;500;600;700&family=Barlow:wght@300;400;500;600&display=swap');

    :root {
      --fut-gold: #d4a843;
      --fut-gold-light: #f0d060;
      --fut-gold-dark: #9a7a2e;
      --fut-card-bg: linear-gradient(165deg, #1a1f2e 0%, #0d1117 50%, #151b28 100%);
      --fut-card-border: rgba(212,168,67,0.3);
      --fut-card-shine: linear-gradient(135deg, rgba(212,168,67,0.08) 0%, transparent 50%, rgba(212,168,67,0.04) 100%);
      --fut-green: #2ecc71;
      --fut-red: #e74c3c;
      --fut-blue: #3498db;
      --fut-cyan: #00d4ff;
      --fut-orange: #f39c12;
      --fut-surface: rgba(15,20,30,0.85);
      --fut-surface-2: rgba(25,32,48,0.9);
      --fut-text: #e8e6e3;
      --fut-text-dim: rgba(232,230,227,0.6);
      --fut-glow: 0 0 20px rgba(212,168,67,0.15);
    }

    .fut-hero-card {
      position: relative;
      background: var(--fut-card-bg);
      border: 1px solid var(--fut-card-border);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: var(--fut-glow), 0 8px 32px rgba(0,0,0,0.4);
      margin-bottom: 1.25rem;
    }
    .fut-hero-card::before {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--fut-card-shine);
      pointer-events: none;
    }
    .fut-hero-inner {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: stretch;
      min-height: 220px;
    }
    .fut-hero-left {
      flex: 0 0 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      border-right: 1px solid rgba(212,168,67,0.15);
      background: linear-gradient(180deg, rgba(212,168,67,0.08) 0%, transparent 100%);
    }
    .fut-rating {
      font-family: 'Oswald', sans-serif;
      font-size: 56px;
      font-weight: 700;
      line-height: 1;
      color: var(--fut-gold-light);
      text-shadow: 0 2px 12px rgba(212,168,67,0.4);
      letter-spacing: -2px;
    }
    .fut-position-badge {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: var(--fut-gold);
    }
    .fut-avatar-ring {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      border: 2px solid var(--fut-gold);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      background: rgba(212,168,67,0.08);
      box-shadow: 0 0 16px rgba(212,168,67,0.2);
    }
    .fut-hero-right {
      flex: 1;
      padding: 24px 28px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .fut-player-name {
      font-family: 'Oswald', sans-serif;
      font-size: 32px;
      font-weight: 600;
      color: #fff;
      letter-spacing: 1px;
      text-transform: uppercase;
      line-height: 1.05;
      margin-bottom: 8px;
    }
    .fut-player-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .fut-meta-tag {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--fut-gold);
      background: rgba(212,168,67,0.1);
      border: 1px solid rgba(212,168,67,0.25);
      padding: 3px 10px;
      border-radius: 4px;
    }
    .fut-form-row {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-bottom: 14px;
    }
    .fut-form-label {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 11px;
      letter-spacing: 1px;
      color: var(--fut-text-dim);
      text-transform: uppercase;
      margin-right: 6px;
    }
    .fut-form-dot {
      width: 26px;
      height: 26px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 12px;
      font-weight: 700;
    }
    .fut-form-W { background: var(--fut-green); color: #fff; }
    .fut-form-D { background: var(--fut-orange); color: #fff; }
    .fut-form-L { background: var(--fut-red); color: #fff; }
    .fut-hero-logros {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .fut-hero-logro {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      color: #fff;
      font-family: 'Barlow Condensed', sans-serif;
      letter-spacing: 0.8px;
      font-size: 12px;
      text-transform: uppercase;
    }
    .fut-stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
    }
    .fut-stat-card {
      background: var(--fut-surface);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 14px 12px;
      text-align: center;
      transition: all 0.25s ease;
      position: relative;
      overflow: hidden;
    }
    .fut-stat-card:hover {
      border-color: rgba(212,168,67,0.3);
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
    }
    .fut-stat-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--fut-gold);
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .fut-stat-card:hover::after { opacity: 1; }
    .fut-stat-value {
      font-family: 'Oswald', sans-serif;
      font-size: 28px;
      font-weight: 600;
      line-height: 1;
      margin-bottom: 4px;
    }
    .fut-stat-label {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: var(--fut-text-dim);
    }
    .fut-wr-bar-bg {
      height: 6px;
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
      overflow: hidden;
      margin-top: 6px;
    }
    .fut-wr-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.6s ease;
    }
    .fut-radar-container {
      background: var(--fut-surface);
      border: 1px solid rgba(212,168,67,0.15);
      border-radius: 14px;
      padding: 18px;
      height: 100%;
    }
    .fut-radar-title {
      font-family: 'Oswald', sans-serif;
      font-size: 15px;
      font-weight: 500;
      color: var(--fut-gold);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 12px;
      text-align: center;
    }
    .fut-section-header {
      font-family: 'Oswald', sans-serif;
      font-size: 18px;
      font-weight: 500;
      color: var(--fut-gold);
      letter-spacing: 2px;
      text-transform: uppercase;
      padding-bottom: 8px;
      margin-bottom: 16px;
      border-bottom: 1px solid rgba(212,168,67,0.2);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .fut-badges-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .fut-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--fut-surface-2);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 8px 14px;
      font-family: 'Barlow', sans-serif;
      font-size: 13px;
      color: var(--fut-text);
      transition: all 0.2s ease;
      min-width: 220px;
    }
    .fut-badge.fut-badge-unlocked {
      border-color: var(--fut-card-border);
      box-shadow: 0 0 10px rgba(212,168,67,0.1);
    }
    .fut-badge.fut-badge-locked {
      opacity: 0.35;
      filter: grayscale(0.8);
    }
    .fut-badge-icon {
      font-size: 20px;
      line-height: 1;
      min-width: 24px;
      text-align: center;
    }
    .fut-badge-info {
      display: flex;
      flex-direction: column;
    }
    .fut-badge-name {
      font-weight: 600;
      font-size: 12px;
      letter-spacing: 0.3px;
    }
    .fut-badge-desc {
      font-size: 10px;
      color: var(--fut-text-dim);
    }
    .fut-detail-table {
      width: 100%;
      font-family: 'Barlow', sans-serif;
    }
    .fut-detail-table td {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-size: 14px;
    }
    .fut-detail-table td:first-child {
      color: var(--fut-text-dim);
      font-size: 13px;
    }
    .fut-detail-table td:last-child {
      text-align: right;
      font-family: 'Oswald', sans-serif;
      font-weight: 500;
      font-size: 16px;
      color: #fff;
    }
    .fut-list-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .fut-list-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 10px;
      background: var(--fut-surface-2);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .fut-list-row-meta {
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 12px;
      color: var(--fut-text-dim);
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .fut-search-input {
      background: var(--fut-surface) !important;
      border: 1px solid rgba(212,168,67,0.2) !important;
      color: var(--fut-text) !important;
      font-family: 'Barlow', sans-serif !important;
      border-radius: 8px 0 0 8px !important;
      padding: 8px 14px !important;
    }
    .fut-search-input:focus {
      border-color: var(--fut-gold) !important;
      box-shadow: 0 0 0 2px rgba(212,168,67,0.15) !important;
    }
    .fut-search-input::placeholder {
      color: var(--fut-text-dim) !important;
    }
    .fut-search-btn {
      background: linear-gradient(135deg, var(--fut-gold-dark), var(--fut-gold)) !important;
      border: none !important;
      color: #000 !important;
      font-family: 'Barlow Condensed', sans-serif !important;
      font-weight: 600 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
      font-size: 13px !important;
      border-radius: 0 8px 8px 0 !important;
      padding: 8px 16px !important;
    }
    .fut-search-btn.fut-search-btn-warning {
      background: linear-gradient(135deg, #9a7a2e, #f0d060) !important;
    }
    .fut-stat-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      font-family: 'Barlow Condensed', sans-serif;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    .fut-empty {
      text-align: center;
      padding: 32px 20px;
      color: var(--fut-text-dim);
      font-family: 'Barlow', sans-serif;
    }
    .fut-empty-icon {
      font-size: 42px;
      opacity: 0.45;
      margin-bottom: 8px;
    }

    body, .table, .card, .btn, .form-control, .form-select, .badge, .alert,
    .nav-link, .nav-tabs, .modal, .toast, .list-group-item {
      font-family: 'Barlow', 'Segoe UI', sans-serif !important;
    }

    .navbar, nav.navbar {
      background: linear-gradient(180deg, rgba(15,20,30,0.98) 0%, rgba(10,14,22,0.95) 100%) !important;
      border-bottom: 1px solid rgba(212,168,67,0.15) !important;
      box-shadow: 0 2px 20px rgba(0,0,0,0.4), 0 1px 0 rgba(212,168,67,0.1) !important;
    }

    .nav-tabs {
      border-bottom: 1px solid rgba(212,168,67,0.15) !important;
    }
    .nav-tabs .nav-link {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-weight: 500 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
      font-size: 13px !important;
      color: rgba(232,230,227,0.5) !important;
      border: none !important;
      padding: 10px 18px !important;
      transition: all 0.2s ease !important;
    }
    .nav-tabs .nav-link:hover {
      color: var(--fut-gold, #d4a843) !important;
      background: rgba(212,168,67,0.05) !important;
    }
    .nav-tabs .nav-link.active {
      color: var(--fut-gold-light, #f0d060) !important;
      background: transparent !important;
      border-bottom: 2px solid var(--fut-gold, #d4a843) !important;
    }

    .destacado-card {
      background: var(--fut-surface, rgba(15,20,30,0.85)) !important;
      border: 1px solid rgba(212,168,67,0.15) !important;
      border-radius: 12px !important;
      transition: all 0.3s ease !important;
      position: relative !important;
      overflow: hidden !important;
    }
    .destacado-card::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 2px !important;
      background: linear-gradient(90deg, transparent, var(--fut-gold, #d4a843), transparent) !important;
      opacity: 0.6 !important;
    }
    .destacado-card:hover {
      border-color: rgba(212,168,67,0.35) !important;
      transform: translateY(-3px) !important;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3), 0 0 20px rgba(212,168,67,0.08) !important;
    }
    .destacado-icon {
      font-size: 28px !important;
      display: block !important;
      margin-bottom: 6px !important;
    }
    .destacado-valor {
      font-family: 'Oswald', sans-serif !important;
      font-size: 32px !important;
      font-weight: 600 !important;
      color: var(--fut-gold-light, #f0d060) !important;
      line-height: 1.1 !important;
    }
    .destacado-nombre {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      margin-top: 4px !important;
    }
    .destacado-categoria {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-size: 11px !important;
      letter-spacing: 1.5px !important;
      text-transform: uppercase !important;
      color: rgba(232,230,227,0.4) !important;
      margin-top: 2px !important;
    }

    .mejor-puesto-card {
      background: var(--fut-surface, rgba(15,20,30,0.85)) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      border-radius: 12px !important;
      transition: all 0.3s ease !important;
      position: relative !important;
      overflow: hidden !important;
    }
    .mejor-puesto-card::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: 3px !important;
      opacity: 0.7 !important;
    }
    .mejor-puesto-card.arquero::after { background: #f39c12 !important; }
    .mejor-puesto-card.defensor::after { background: #3498db !important; }
    .mejor-puesto-card.mediocampo::after { background: #2ecc71 !important; }
    .mejor-puesto-card.atacante::after { background: #e74c3c !important; }
    .mejor-puesto-card:hover {
      border-color: rgba(212,168,67,0.25) !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
    }
    .puesto-icon {
      font-size: 32px !important;
      display: block !important;
      margin-bottom: 4px !important;
    }
    .puesto-posicion {
      font-family: 'Oswald', sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      letter-spacing: 2px !important;
      text-transform: uppercase !important;
      color: var(--fut-gold, #d4a843) !important;
    }
    .puesto-nombre {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-size: 16px !important;
      font-weight: 600 !important;
      letter-spacing: 0.5px !important;
      text-transform: uppercase !important;
      margin: 4px 0 !important;
    }
    .puesto-stat-valor {
      font-family: 'Oswald', sans-serif !important;
      font-weight: 500 !important;
      color: #fff !important;
    }

    .table {
      font-family: 'Barlow', sans-serif !important;
      font-size: 13px !important;
    }
    .table thead th {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-weight: 600 !important;
      letter-spacing: 0.8px !important;
      text-transform: uppercase !important;
      font-size: 11px !important;
      color: rgba(232,230,227,0.5) !important;
      border-bottom: 1px solid rgba(212,168,67,0.15) !important;
      padding: 10px 8px !important;
      white-space: nowrap !important;
    }
    .table thead th.active {
      color: var(--fut-gold-light, #f0d060) !important;
    }
    .table thead th.sortable {
      cursor: pointer !important;
      transition: color 0.2s ease !important;
    }
    .table thead th.sortable:hover {
      color: var(--fut-gold, #d4a843) !important;
    }
    .table tbody tr {
      border-bottom: 1px solid rgba(255,255,255,0.03) !important;
      transition: background 0.15s ease !important;
    }
    .table tbody tr:hover {
      background: rgba(212,168,67,0.04) !important;
    }
    .table tbody td {
      padding: 8px !important;
      vertical-align: middle !important;
      border: none !important;
    }
    .table .column-highlight {
      background: rgba(212,168,67,0.06) !important;
    }

    .position-badge {
      font-family: 'Oswald', sans-serif !important;
      font-weight: 600 !important;
      font-size: 14px !important;
      width: 28px !important;
      height: 28px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 6px !important;
    }
    .position-1 {
      background: linear-gradient(135deg, #d4a843, #f0d060) !important;
      color: #000 !important;
      box-shadow: 0 0 8px rgba(212,168,67,0.3) !important;
    }
    .position-2 {
      background: linear-gradient(135deg, #8a9aa5, #bcc6cc) !important;
      color: #000 !important;
    }
    .position-3 {
      background: linear-gradient(135deg, #b87333, #d4944e) !important;
      color: #000 !important;
    }
    .position-other {
      background: rgba(255,255,255,0.08) !important;
      color: rgba(232,230,227,0.5) !important;
    }

    .skill-excellent {
      background: linear-gradient(135deg, #10b981, #34d399) !important;
      color: #000 !important;
      font-family: 'Oswald', sans-serif !important;
    }
    .skill-good {
      background: linear-gradient(135deg, #22c55e, #4ade80) !important;
      color: #000 !important;
      font-family: 'Oswald', sans-serif !important;
    }
    .skill-average {
      background: linear-gradient(135deg, #eab308, #facc15) !important;
      color: #000 !important;
      font-family: 'Oswald', sans-serif !important;
    }
    .skill-below {
      background: linear-gradient(135deg, #f97316, #fb923c) !important;
      color: #000 !important;
      font-family: 'Oswald', sans-serif !important;
    }
    .skill-poor {
      background: linear-gradient(135deg, #ef4444, #f87171) !important;
      color: #fff !important;
      font-family: 'Oswald', sans-serif !important;
    }

    .glass-effect, .partido-card {
      background: var(--fut-surface, rgba(15,20,30,0.85)) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      border-radius: 14px !important;
      backdrop-filter: blur(10px) !important;
      transition: all 0.25s ease !important;
    }
    .glass-effect:hover, .partido-card:hover {
      border-color: rgba(212,168,67,0.2) !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    }
    .partido-card.border-primary {
      border-top: 3px solid #3498db !important;
    }
    .partido-card.border-danger {
      border-top: 3px solid #e74c3c !important;
    }
    .partido-card.border-secondary {
      border-top: 3px solid var(--fut-gold, #d4a843) !important;
    }

    .player-item {
      background: var(--fut-surface, rgba(15,20,30,0.85)) !important;
      border: 1px solid rgba(255,255,255,0.06) !important;
      border-radius: 8px !important;
      transition: all 0.2s ease !important;
    }
    .player-item:hover {
      border-color: rgba(212,168,67,0.2) !important;
      background: rgba(25,32,48,0.9) !important;
    }
    .player-item[draggable="true"] {
      cursor: grab !important;
    }
    .player-item[draggable="true"]:active {
      cursor: grabbing !important;
    }

    .badge.bg-primary { background: linear-gradient(135deg, #2563eb, #3b82f6) !important; }
    .badge.bg-success { background: linear-gradient(135deg, #16a34a, #22c55e) !important; }
    .badge.bg-warning { background: linear-gradient(135deg, #d97706, #f59e0b) !important; color: #000 !important; }
    .badge.bg-danger { background: linear-gradient(135deg, #dc2626, #ef4444) !important; }
    .badge.bg-info { background: linear-gradient(135deg, #0891b2, #06b6d4) !important; }
    .badge.bg-secondary { background: rgba(255,255,255,0.1) !important; color: rgba(232,230,227,0.7) !important; }

    .badge.fs-5 {
      font-family: 'Oswald', sans-serif !important;
      font-weight: 600 !important;
      letter-spacing: 1px !important;
    }

    .card.bg-dark {
      background: var(--fut-surface, rgba(15,20,30,0.85)) !important;
      border-color: rgba(255,255,255,0.06) !important;
    }
    .card-header.bg-transparent {
      font-family: 'Barlow Condensed', sans-serif !important;
      font-weight: 500 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
      font-size: 13px !important;
      color: var(--fut-gold, #d4a843) !important;
      border-bottom-color: rgba(212,168,67,0.12) !important;
    }

    .form-control, .form-select {
      background: rgba(15,20,30,0.85) !important;
      border: 1px solid rgba(212,168,67,0.15) !important;
      color: #e8e6e3 !important;
      font-family: 'Barlow', sans-serif !important;
      border-radius: 8px !important;
      transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
    }
    .form-control:focus, .form-select:focus {
      border-color: var(--fut-gold, #d4a843) !important;
      box-shadow: 0 0 0 2px rgba(212,168,67,0.12) !important;
      background: rgba(15,20,30,0.95) !important;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--fut-gold-dark, #9a7a2e), var(--fut-gold, #d4a843)) !important;
      border: none !important;
      color: #000 !important;
      font-family: 'Barlow Condensed', sans-serif !important;
      font-weight: 600 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, var(--fut-gold, #d4a843), var(--fut-gold-light, #f0d060)) !important;
      box-shadow: 0 0 12px rgba(212,168,67,0.3) !important;
    }

    .alert {
      border-radius: 8px !important;
      font-family: 'Barlow', sans-serif !important;
      font-size: 13px !important;
    }

    .table-responsive::-webkit-scrollbar {
      height: 6px;
    }
    .table-responsive::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.03);
      border-radius: 3px;
    }
    .table-responsive::-webkit-scrollbar-thumb {
      background: rgba(212,168,67,0.2);
      border-radius: 3px;
    }
    .table-responsive::-webkit-scrollbar-thumb:hover {
      background: rgba(212,168,67,0.35);
    }

    .distribucion-container {
      background: rgba(10,14,22,0.6) !important;
      border: 1px solid rgba(212,168,67,0.08) !important;
      border-radius: 8px !important;
    }

    .toast {
      border-radius: 10px !important;
      font-family: 'Barlow', sans-serif !important;
    }

    .modal-content {
      background: linear-gradient(165deg, #1a1f2e 0%, #0d1117 100%) !important;
      border: 1px solid rgba(212,168,67,0.15) !important;
      border-radius: 14px !important;
    }
    .modal-header {
      border-bottom-color: rgba(212,168,67,0.12) !important;
    }
    .modal-header .modal-title {
      font-family: 'Oswald', sans-serif !important;
      font-weight: 500 !important;
      letter-spacing: 1px !important;
      text-transform: uppercase !important;
      color: var(--fut-gold-light, #f0d060) !important;
    }
    .modal-footer {
      border-top-color: rgba(212,168,67,0.12) !important;
    }

    .spinner-border.text-primary {
      color: var(--fut-gold, #d4a843) !important;
    }

    h5.text-white.fw-bold, h6.text-primary.fw-bold, h6.text-danger.fw-bold {
      font-family: 'Barlow Condensed', sans-serif !important;
      letter-spacing: 0.5px !important;
    }

    .btn-outline-danger {
      border-color: rgba(239,68,68,0.4) !important;
      color: #ef4444 !important;
      border-radius: 6px !important;
    }
    .btn-outline-danger:hover {
      background: rgba(239,68,68,0.15) !important;
    }
    .btn-outline-warning {
      border-color: rgba(212,168,67,0.3) !important;
      color: var(--fut-gold, #d4a843) !important;
      border-radius: 6px !important;
    }
    .btn-outline-warning:hover {
      background: rgba(212,168,67,0.1) !important;
    }
    .btn-outline-primary {
      border-color: rgba(59,130,246,0.3) !important;
      color: #3b82f6 !important;
      border-radius: 6px !important;
    }
    .btn-outline-info {
      border-color: rgba(6,182,212,0.3) !important;
      color: #06b6d4 !important;
      border-radius: 6px !important;
    }

    .bg-primary.bg-opacity-10 {
      background: rgba(37,99,235,0.08) !important;
      border: 1px solid rgba(37,99,235,0.12) !important;
      border-radius: 10px !important;
    }
    .bg-danger.bg-opacity-10 {
      background: rgba(220,38,38,0.08) !important;
      border: 1px solid rgba(220,38,38,0.12) !important;
      border-radius: 10px !important;
    }

    .chart-container, [id^="chart-"] {
      border-radius: 10px !important;
    }

    .text-light-emphasis {
      color: rgba(232,230,227,0.45) !important;
    }

    body {
      background: #0a0e16 !important;
    }

    .destacado-card, .mejor-puesto-card, .partido-card, .player-item {
      animation: fut-fadeInUp 0.35s ease forwards;
    }

    @media (max-width: 991px) {
      .fut-stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 767px) {
      .fut-hero-inner { flex-direction: column; }
      .fut-hero-left {
        flex: none;
        flex-direction: row;
        border-right: none;
        border-bottom: 1px solid rgba(212,168,67,0.15);
        padding: 16px;
      }
      .fut-rating { font-size: 42px; }
      .fut-player-name { font-size: 24px; }
      .fut-avatar-ring { width: 56px; height: 56px; font-size: 28px; }
      .fut-badge { min-width: 100%; }
    }
  `;

  document.head.appendChild(style);
}

function obtenerIconoPosicionPerfil(nombrePosicion) {
  const iconos = {
    Arquero: '🥅',
    Defensor: '🛡️',
    Mediocampista: '⚙️',
    Delantero: '⚽',
    Volante: '🎯'
  };
  return iconos[nombrePosicion] || '🏃';
}

function obtenerAbrevPosicionPerfil(nombrePosicion) {
  const abrev = {
    Arquero: 'GK',
    Defensor: 'DEF',
    Mediocampista: 'MID',
    Delantero: 'FW',
    Volante: 'CM'
  };
  return abrev[nombrePosicion] || 'POS';
}

function obtenerResumenPerfilJugador(datos = datosPerfilJugador) {
  const participaciones = datos?.participaciones || [];
  const goles = datos?.goles || [];
  const jugadorId = datos?.jugador?.id;
  const pj = participaciones.length;
  const pg = participaciones.filter(p => p.partidos?.equipo_ganador === p.equipo).length;
  const pe = participaciones.filter(p => p.partidos?.equipo_ganador === null || p.partidos?.equipo_ganador === 0).length;
  const pp = Math.max(pj - pg - pe, 0);
  const golesCount = goles.filter(g => g.goleador_id === jugadorId && !g.es_gol_en_contra).length;
  const asistenciasCount = goles.filter(g => g.asistidor_id === jugadorId && !g.es_gol_en_contra).length;
  const cagadasEnGolCount = goles.filter(g => g.cagada_jugador_id === jugadorId).length;
  const atajadas = participaciones.reduce((sum, p) => sum + (Number(p.atajadas) || 0), 0);
  const cagadas = participaciones.reduce((sum, p) => sum + (Number(p.cagadas) || 0), 0);
  const mvp = participaciones.filter(p => p.mvp).length;
  const ace = participaciones.filter(p => p.ace).length;
  const puntos = (pg * 3) + pe;
  const winrate = pj > 0 ? (pg / pj) * 100 : 0;
  const eventosPorPartido = new Map();

  participaciones.forEach(participacion => {
    eventosPorPartido.set(participacion.partido_id, {
      goles: 0,
      asistencias: 0,
      cagadasEnGol: 0
    });
  });

  goles.forEach(gol => {
    const evento = eventosPorPartido.get(gol.partido_id) || {
      goles: 0,
      asistencias: 0,
      cagadasEnGol: 0
    };

    if (gol.goleador_id === jugadorId && !gol.es_gol_en_contra) {
      evento.goles += 1;
    }
    if (gol.asistidor_id === jugadorId && !gol.es_gol_en_contra) {
      evento.asistencias += 1;
    }
    if (gol.cagada_jugador_id === jugadorId) {
      evento.cagadasEnGol += 1;
    }

    eventosPorPartido.set(gol.partido_id, evento);
  });

  const ultimosPartidos = participaciones
    .filter(p => p.partidos)
    .sort((a, b) => new Date(b.partidos.fecha) - new Date(a.partidos.fecha))
    .slice(0, 5)
    .map(participacion => ({
      ...participacion,
      ...eventosPorPartido.get(participacion.partido_id)
    }));

  return {
    pj,
    pg,
    pe,
    pp,
    puntos,
    goles: golesCount,
    asistencias: asistenciasCount,
    cagadasEnGol: cagadasEnGolCount,
    atajadas,
    cagadas,
    mvp,
    ace,
    winrate,
    golesPP: pj > 0 ? golesCount / pj : 0,
    asistenciasPP: pj > 0 ? asistenciasCount / pj : 0,
    atajadasPP: pj > 0 ? atajadas / pj : 0,
    puntosPP: pj > 0 ? puntos / pj : 0,
    ultimosPartidos
  };
}

function calcularRatingPerfilFut(datos = datosPerfilJugador) {
  const resumen = datos?.resumenPerfil || obtenerResumenPerfilJugador(datos);
  const pj = resumen.pj;
  if (pj === 0) return 50;

  let rating = 50;
  rating += (resumen.winrate / 100) * 20;
  rating += Math.min(resumen.golesPP * 8, 12);
  rating += Math.min(resumen.asistenciasPP * 6, 8);
  rating += Math.min((resumen.mvp / pj) * 15, 8);
  rating += Math.min((resumen.ace / pj) * 12, 6);
  rating += Math.min(resumen.atajadasPP, 4);
  rating -= Math.min((resumen.cagadas / pj) * 3, 6);
  rating -= Math.min((resumen.cagadasEnGol / pj) * 5, 8);

  if (pj >= 20) rating += 2;
  else if (pj >= 10) rating += 1;

  return Math.round(Math.max(40, Math.min(99, rating)));
}

function obtenerFormaRecientePerfil(datos = datosPerfilJugador, cantidad = 6) {
  const participaciones = datos?.participaciones || [];

  return participaciones
    .filter(p => p.partidos)
    .sort((a, b) => new Date(b.partidos.fecha) - new Date(a.partidos.fecha))
    .slice(0, cantidad)
    .map(participacion => {
      const gano = participacion.partidos.equipo_ganador === participacion.equipo;
      const empato = participacion.partidos.equipo_ganador === null || participacion.partidos.equipo_ganador === 0;
      return gano ? 'W' : empato ? 'D' : 'L';
    });
}

function calcularInsigniasPerfil(datos = datosPerfilJugador) {
  const resumen = datos?.resumenPerfil || obtenerResumenPerfilJugador(datos);
  const rating = calcularRatingPerfilFut({ ...datos, resumenPerfil: resumen });

  return [
    { icon: '⚽', name: 'Goleador', desc: '10+ goles', unlocked: resumen.goles >= 10 },
    { icon: '🎯', name: 'Asistidor', desc: '10+ asistencias', unlocked: resumen.asistencias >= 10 },
    { icon: '👑', name: 'Rey del partido', desc: '5+ MVP', unlocked: resumen.mvp >= 5 },
    { icon: '🔥', name: 'Imparable', desc: '3+ ACE', unlocked: resumen.ace >= 3 },
    { icon: '🧤', name: 'Muralla', desc: '15+ atajadas', unlocked: resumen.atajadas >= 15 },
    { icon: '🏆', name: 'Veterano', desc: '20+ partidos', unlocked: resumen.pj >= 20 },
    { icon: '📈', name: 'Winrate elite', desc: '60%+ winrate con 10+ PJ', unlocked: resumen.pj >= 10 && resumen.winrate >= 60 },
    { icon: '💎', name: 'Clutch', desc: '3+ goles y 3+ asistencias', unlocked: resumen.goles >= 3 && resumen.asistencias >= 3 },
    { icon: '🛡️', name: 'Disciplinado', desc: '0 cagadas con 5+ PJ', unlocked: resumen.pj >= 5 && resumen.cagadas === 0 },
    { icon: '⭐', name: 'Crack', desc: 'Rating 80+', unlocked: rating >= 80 }
  ];
}

async function obtenerTemporadasPerfilLogros() {
  if (Array.isArray(todasLasTemporadasGlobal) && todasLasTemporadasGlobal.length > 0) {
    return todasLasTemporadasGlobal;
  }

  const { data, error } = await supabase
    .from('temporadas')
    .select('*')
    .order('nombre');

  if (error) {
    console.error('Error cargando temporadas para logros de perfil:', error);
    return [];
  }

  todasLasTemporadasGlobal = data || [];
  return todasLasTemporadasGlobal;
}

function extraerNumeroTemporadaPerfil(temporada, fallback = 0) {
  const nombre = temporada?.nombre || '';
  const match = nombre.match(/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }

  const numeroFallback = Number(fallback);
  if (Number.isFinite(numeroFallback) && numeroFallback > 0) {
    return numeroFallback;
  }

  const numeroId = Number(temporada?.id);
  if (Number.isFinite(numeroId) && numeroId > 0) {
    return numeroId;
  }

  return 1;
}

function construirMetadatosTemporadasPerfil(temporadas = []) {
  const metadatos = new Map();

  [...temporadas]
    .map((temporada, index) => {
      const orden = extraerNumeroTemporadaPerfil(temporada, index + 1);
      return {
        id: String(temporada.id),
        nombre: temporada.nombre || `Temporada ${orden}`,
        orden,
        etiqueta: `S${orden}`
      };
    })
    .sort((a, b) => {
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.nombre.localeCompare(b.nombre);
    })
    .forEach(meta => {
      metadatos.set(meta.id, meta);
    });

  return metadatos;
}

function obtenerLimiteOrdenPremiosPerfil(metadatosTemporadas, temporadaIdActual = null) {
  const temporadas = Array.from(metadatosTemporadas.values());
  if (temporadas.length === 0) {
    return 0;
  }

  const ultimaOrden = Math.max(...temporadas.map(meta => meta.orden || 0));
  if (!temporadaIdActual) {
    return Math.max(ultimaOrden - 1, 0);
  }

  const temporadaActual = metadatosTemporadas.get(String(temporadaIdActual));
  if (!temporadaActual) {
    return Math.max(ultimaOrden - 1, 0);
  }

  if (temporadaActual.orden >= ultimaOrden) {
    return Math.max(ultimaOrden - 1, 0);
  }

  return temporadaActual.orden;
}

function hashCodePerfil(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandomPerfil(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % (2 ** 32);
    return state / (2 ** 32);
  };
}

function tirarMonedaDeterministicaPerfil(partidoId, jugadorId, fase) {
  const exactKey = `${partidoId}-${jugadorId}-${fase}`;
  if (typeof window.mundialitoMonedaOverridesExact?.[exactKey] === 'boolean') {
    return window.mundialitoMonedaOverridesExact[exactKey];
  }

  const jugadorFaseKey = `${jugadorId}-${fase}`;
  if (typeof window.mundialitoMonedaOverridesJugadorFase?.[jugadorFaseKey] === 'boolean') {
    return window.mundialitoMonedaOverridesJugadorFase[jugadorFaseKey];
  }

  const salt = typeof window.mundialitoSalt === 'string' ? window.mundialitoSalt : '';
  const seededRandom = createSeededRandomPerfil(hashCodePerfil(`${partidoId}-${jugadorId}-${fase}-${salt}`));
  const umbral = typeof window.mundialitoUmbralMoneda === 'number' ? window.mundialitoUmbralMoneda : 0.5;
  return seededRandom() < umbral;
}

function crearJugadorMundialPerfilTemp(jugador) {
  return {
    id: jugador.id,
    nombre: jugador.nombre,
    fase: 'grupos',
    victorias: 0,
    derrotas: 0,
    empates: 0,
    partidosGrupos: 0,
    victoriasGrupos: 0,
    empatesGrupos: 0,
    derrotasGrupos: 0,
    bonusCount: 0,
    campeon: false,
    ultimoPartido: null
  };
}

function resetearAGruposPerfilTemp(jugador) {
  jugador.fase = 'grupos';
  jugador.victorias = 0;
  jugador.derrotas = 0;
  jugador.empates = 0;
  jugador.partidosGrupos = 0;
  jugador.victoriasGrupos = 0;
  jugador.empatesGrupos = 0;
  jugador.derrotasGrupos = 0;
  jugador.bonusCount = 0;
}

function determinarResultadoJugadorPerfil(partido, jugadorId) {
  const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
  if (!jugadorData) return null;

  if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
    return 'empate';
  }

  return partido.equipo_ganador === jugadorData.equipo ? 'victoria' : 'derrota';
}

function evaluarPaseGruposPerfil(jugador) {
  const { victoriasGrupos, empatesGrupos, derrotasGrupos } = jugador;

  if (victoriasGrupos === 3) {
    jugador.bonusCount = 2;
    return true;
  }
  if (victoriasGrupos === 2 && empatesGrupos === 1) {
    jugador.bonusCount = 1;
    return true;
  }
  if (victoriasGrupos === 2 && derrotasGrupos === 1) {
    jugador.bonusCount = 0;
    return true;
  }
  if (victoriasGrupos === 1 && empatesGrupos === 2) {
    jugador.bonusCount = 0;
    return true;
  }
  if (victoriasGrupos === 1 && empatesGrupos === 1 && derrotasGrupos === 1) {
    const partidoId = jugador.ultimoPartido?.id || 0;
    return tirarMonedaDeterministicaPerfil(partidoId, jugador.id, 'grupos');
  }

  return false;
}

function evaluarPasePlayoffsPerfil(jugador, resultado) {
  if (resultado === 'victoria') return true;
  if (resultado === 'derrota') return false;

  if (resultado === 'empate' && jugador.bonusCount > 0) {
    jugador.bonusCount -= 1;
    return true;
  }

  if (resultado === 'empate') {
    const partidoId = jugador.ultimoPartido?.id || 0;
    return tirarMonedaDeterministicaPerfil(partidoId, jugador.id, jugador.fase);
  }

  return false;
}

function procesarPartidoMundialPerfilTemp(partido, jugadoresMap) {
  (partido.jugador_partido || []).forEach(jp => {
    let jugador = jugadoresMap.get(jp.jugador_id);
    if (!jugador) {
      jugador = crearJugadorMundialPerfilTemp({
        id: jp.jugador_id,
        nombre: jp.jugadores?.nombre || `Jugador ${jp.jugador_id}`
      });
      jugadoresMap.set(jp.jugador_id, jugador);
    }

    if (jugador.fase === 'campeon') {
      resetearAGruposPerfilTemp(jugador);
    }

    const resultado = determinarResultadoJugadorPerfil(partido, jp.jugador_id);
    if (!resultado) return;

    jugador.ultimoPartido = {
      id: partido.id,
      fecha: partido.fecha,
      resultado
    };

    if (jugador.fase === 'grupos') {
      jugador.partidosGrupos += 1;
      if (resultado === 'victoria') {
        jugador.victoriasGrupos += 1;
        jugador.victorias += 1;
      } else if (resultado === 'empate') {
        jugador.empatesGrupos += 1;
        jugador.empates += 1;
      } else {
        jugador.derrotasGrupos += 1;
        jugador.derrotas += 1;
      }

      if (jugador.derrotasGrupos >= 2) {
        resetearAGruposPerfilTemp(jugador);
        return;
      }

      if (jugador.partidosGrupos >= 3) {
        if (evaluarPaseGruposPerfil(jugador)) {
          jugador.fase = '8vos';
        } else {
          resetearAGruposPerfilTemp(jugador);
        }
      }
      return;
    }

    if (resultado === 'victoria') {
      jugador.victorias += 1;
    } else if (resultado === 'empate') {
      jugador.empates += 1;
    } else {
      jugador.derrotas += 1;
    }

    if (!evaluarPasePlayoffsPerfil(jugador, resultado)) {
      resetearAGruposPerfilTemp(jugador);
      return;
    }

    if (jugador.fase === '8vos') {
      jugador.fase = '4tos';
    } else if (jugador.fase === '4tos') {
      jugador.fase = 'semis';
    } else if (jugador.fase === 'semis') {
      jugador.fase = 'final';
    } else if (jugador.fase === 'final') {
      jugador.fase = 'campeon';
      jugador.campeon = true;
    }
  });
}

function incrementarMapaPerfil(mapa, clave, incremento = 1) {
  if (!clave) return;
  mapa.set(clave, (mapa.get(clave) || 0) + incremento);
}

function actualizarMaximoPerfil(mapa, clave, valor) {
  if (!clave) return;
  const numero = Number(valor) || 0;
  if (numero <= 0) return;
  mapa.set(clave, Math.max(mapa.get(clave) || 0, numero));
}

function pluralizarPerfil(cantidad, singular, plural = `${singular}s`) {
  return cantidad === 1 ? singular : plural;
}

function crearRachaPerfil() {
  return {
    victoriasActuales: 0,
    derrotasActuales: 0,
    maxVictorias: 0,
    maxDerrotas: 0
  };
}

function calcularRecordsTemporadaPerfil(partidosTemporada = []) {
  const maxGolesPartido = new Map();
  const maxAsistenciasPartido = new Map();
  const maxCagadasPartido = new Map();
  const maxVictoriasHilo = new Map();
  const maxDerrotasHilo = new Map();
  const rachasPorJugador = new Map();

  const partidosOrdenados = [...partidosTemporada].sort((a, b) => {
    const fechaA = Date.parse(a.fecha || '') || 0;
    const fechaB = Date.parse(b.fecha || '') || 0;
    if (fechaA !== fechaB) return fechaA - fechaB;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });

  partidosOrdenados.forEach(partido => {
    const golesPorJugadorPartido = new Map();
    const asistenciasPorJugadorPartido = new Map();

    (partido.goles || []).forEach(gol => {
      if (!gol.es_gol_en_contra && gol.goleador_id) {
        incrementarMapaPerfil(golesPorJugadorPartido, gol.goleador_id);
      }

      if (!gol.es_gol_en_contra && gol.asistidor_id) {
        incrementarMapaPerfil(asistenciasPorJugadorPartido, gol.asistidor_id);
      }
    });

    golesPorJugadorPartido.forEach((valor, jugadorId) => {
      actualizarMaximoPerfil(maxGolesPartido, jugadorId, valor);
    });

    asistenciasPorJugadorPartido.forEach((valor, jugadorId) => {
      actualizarMaximoPerfil(maxAsistenciasPartido, jugadorId, valor);
    });

    (partido.jugador_partido || []).forEach(jp => {
      actualizarMaximoPerfil(maxCagadasPartido, jp.jugador_id, Number(jp.cagadas) || 0);

      if (!rachasPorJugador.has(jp.jugador_id)) {
        rachasPorJugador.set(jp.jugador_id, crearRachaPerfil());
      }

      const equipoGanador = partido.equipo_ganador === null || partido.equipo_ganador === undefined
        ? null
        : Number(partido.equipo_ganador);
      const equipoJugador = Number(jp.equipo);
      const racha = rachasPorJugador.get(jp.jugador_id);
      if (equipoGanador === equipoJugador) {
        racha.victoriasActuales += 1;
        racha.derrotasActuales = 0;
      } else if (equipoGanador === 1 || equipoGanador === 2) {
        racha.derrotasActuales += 1;
        racha.victoriasActuales = 0;
      } else {
        racha.victoriasActuales = 0;
        racha.derrotasActuales = 0;
      }

      racha.maxVictorias = Math.max(racha.maxVictorias, racha.victoriasActuales);
      racha.maxDerrotas = Math.max(racha.maxDerrotas, racha.derrotasActuales);
    });
  });

  rachasPorJugador.forEach((racha, jugadorId) => {
    if (racha.maxVictorias >= 2) {
      maxVictoriasHilo.set(jugadorId, racha.maxVictorias);
    }
    if (racha.maxDerrotas >= 2) {
      maxDerrotasHilo.set(jugadorId, racha.maxDerrotas);
    }
  });

  return {
    maxGolesPartido,
    maxAsistenciasPartido,
    maxCagadasPartido,
    maxVictoriasHilo,
    maxDerrotasHilo
  };
}

async function cargarPremiosHistoricosPerfilJugador(jugadorId, temporadaIdActual = null) {
  if (!jugadorId) return [];

  const temporadas = await obtenerTemporadasPerfilLogros();
  const metadatosTemporadas = construirMetadatosTemporadasPerfil(temporadas);
  const ordenLimite = obtenerLimiteOrdenPremiosPerfil(metadatosTemporadas, temporadaIdActual);

  if (!ordenLimite) {
    return [];
  }

  todasLasSinergias = [];
  todasLasRivalidades = [];

  const perfilSinergiasContainer = document.getElementById('perfil-sinergias-container');
  if (perfilSinergiasContainer) {
    perfilSinergiasContainer.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2">Actualizando sinergias...</p>
      </div>
    `;
  }

  const perfilRivalidadesContainer = document.getElementById('perfil-rivalidades-container');
  if (perfilRivalidadesContainer) {
    perfilRivalidadesContainer.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-2">Actualizando rivalidades...</p>
      </div>
    `;
  }

  try {
    const { data: partidos, error } = await supabase
      .from('partidos')
      .select(`
        id,
        fecha,
        temporada_id,
        equipo_ganador,
        jugador_partido (
          jugador_id,
          equipo,
          atajadas,
          cagadas,
          jugadores (
            id,
            nombre
          )
        ),
        goles (
          partido_id,
          goleador_id,
          asistidor_id,
          es_gol_en_contra
        )
      `)
      .not('temporada_id', 'is', null)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    const resumenPorTemporada = new Map();
    const partidosPorTemporada = new Map();

    (partidos || []).forEach(partido => {
      const temporadaId = String(partido.temporada_id);
      const metaTemporada = metadatosTemporadas.get(temporadaId) || {
        id: temporadaId,
        nombre: `Temporada ${temporadaId}`,
        orden: extraerNumeroTemporadaPerfil({ id: temporadaId }, 1),
        etiqueta: `S${temporadaId}`
      };

      if ((metaTemporada.orden || 0) > ordenLimite) {
        return;
      }

      if (!resumenPorTemporada.has(temporadaId)) {
        resumenPorTemporada.set(temporadaId, {
          metaTemporada,
          goles: new Map(),
          asistencias: new Map(),
          atajadas: new Map(),
          puntos: new Map()
        });
      }

      const resumen = resumenPorTemporada.get(temporadaId);
      (partido.jugador_partido || []).forEach(jp => {
        const atajadas = Number(jp.atajadas) || 0;
        if (atajadas > 0) {
          resumen.atajadas.set(jp.jugador_id, (resumen.atajadas.get(jp.jugador_id) || 0) + atajadas);
        }

        let puntos = 0;
        if (partido.equipo_ganador === jp.equipo) {
          puntos = 3;
        } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
          puntos = 1;
        }

        if (puntos > 0) {
          resumen.puntos.set(jp.jugador_id, (resumen.puntos.get(jp.jugador_id) || 0) + puntos);
        }
      });

      (partido.goles || []).forEach(gol => {
        if (!gol.es_gol_en_contra && gol.goleador_id) {
          resumen.goles.set(gol.goleador_id, (resumen.goles.get(gol.goleador_id) || 0) + 1);
        }
        if (!gol.es_gol_en_contra && gol.asistidor_id) {
          resumen.asistencias.set(gol.asistidor_id, (resumen.asistencias.get(gol.asistidor_id) || 0) + 1);
        }
      });

      if (!partidosPorTemporada.has(temporadaId)) {
        partidosPorTemporada.set(temporadaId, {
          metaTemporada,
          partidos: []
        });
      }
      partidosPorTemporada.get(temporadaId).partidos.push(partido);
    });

    const premios = [];
    const registrarSiCorresponde = (tipo, mapaValores, metaTemporada) => {
      if (!(mapaValores instanceof Map) || mapaValores.size === 0) {
        return;
      }

      const maximo = Math.max(...Array.from(mapaValores.values()));
      if (!Number.isFinite(maximo) || maximo <= 0) {
        return;
      }

      if (mapaValores.get(jugadorId) !== maximo) {
        return;
      }

      const config = PREMIOS_PERFIL_CONFIG[tipo];
      premios.push({
        tipo,
        iconHtml: config.iconHtml,
        name: config.nombre,
        desc: metaTemporada.nombre,
        unlocked: true,
        ordenTemporada: metaTemporada.orden,
        prioridad: config.prioridad
      });
    };

    const registrarRecordSiCorresponde = (tipo, mapaValores, metaTemporada, detalleFn) => {
      if (!(mapaValores instanceof Map) || mapaValores.size === 0) {
        return;
      }

      const maximo = Math.max(...Array.from(mapaValores.values()));
      if (!Number.isFinite(maximo) || maximo <= 0) {
        return;
      }

      if (mapaValores.get(jugadorId) !== maximo) {
        return;
      }

      const config = PREMIOS_PERFIL_CONFIG[tipo];
      premios.push({
        tipo,
        iconHtml: config.iconHtml,
        name: config.nombre,
        desc: `${metaTemporada.nombre} · ${detalleFn(maximo)}`,
        unlocked: true,
        ordenTemporada: metaTemporada.orden,
        prioridad: config.prioridad
      });
    };

    resumenPorTemporada.forEach(resumen => {
      registrarSiCorresponde('bota', resumen.goles, resumen.metaTemporada);
      registrarSiCorresponde('guante', resumen.atajadas, resumen.metaTemporada);
      registrarSiCorresponde('asist', resumen.asistencias, resumen.metaTemporada);
      registrarSiCorresponde('puntos', resumen.puntos, resumen.metaTemporada);
    });

    partidosPorTemporada.forEach(({ metaTemporada, partidos: partidosTemporada }) => {
      const jugadoresTemp = new Map();
      partidosTemporada.forEach(partido => {
        procesarPartidoMundialPerfilTemp(partido, jugadoresTemp);
      });

      if (jugadoresTemp.get(jugadorId)?.campeon) {
        const config = PREMIOS_PERFIL_CONFIG.mundial;
        premios.push({
          tipo: 'mundial',
          iconHtml: config.iconHtml,
          name: config.nombre,
          desc: metaTemporada.nombre,
          unlocked: true,
          ordenTemporada: metaTemporada.orden,
          prioridad: config.prioridad
        });
      }

      const records = calcularRecordsTemporadaPerfil(partidosTemporada);
      registrarRecordSiCorresponde(
        'max_goles_partido',
        records.maxGolesPartido,
        metaTemporada,
        valor => `${valor} ${pluralizarPerfil(valor, 'gol', 'goles')} en un partido`
      );
      registrarRecordSiCorresponde(
        'max_asistencias_partido',
        records.maxAsistenciasPartido,
        metaTemporada,
        valor => `${valor} ${pluralizarPerfil(valor, 'asistencia')} en un partido`
      );
      registrarRecordSiCorresponde(
        'cagador_anio',
        records.maxCagadasPartido,
        metaTemporada,
        valor => `${valor} ${pluralizarPerfil(valor, 'cagada')} en un partido`
      );
      registrarRecordSiCorresponde(
        'perdedor_anio',
        records.maxDerrotasHilo,
        metaTemporada,
        valor => `${valor} derrotas al hilo`
      );
      registrarRecordSiCorresponde(
        'talisman',
        records.maxVictoriasHilo,
        metaTemporada,
        valor => `${valor} victorias al hilo`
      );
    });

    return premios.sort((a, b) => {
      if (a.ordenTemporada !== b.ordenTemporada) {
        return b.ordenTemporada - a.ordenTemporada;
      }
      return a.prioridad - b.prioridad;
    });
  } catch (error) {
    console.error('Error calculando premios historicos del perfil:', error);
    return [];
  }
}

function renderizarBadgePerfil(logro) {
  const claseEstado = logro.unlocked ? 'fut-badge-unlocked' : 'fut-badge-locked';
  const icono = logro.iconHtml || logro.icon || '🏅';

  return `
    <div class="fut-badge ${claseEstado}">
      <span class="fut-badge-icon">${icono}</span>
      <div class="fut-badge-info">
        <span class="fut-badge-name">${logro.name}</span>
        <span class="fut-badge-desc">${logro.desc}</span>
      </div>
    </div>
  `;
}

function renderizarListaRankingPerfil({ titulo, subtitulo = '', items = [], emptyText, renderRow }) {
  return `
    <div class="fut-radar-container h-100">
      <div class="fut-radar-title">${titulo}</div>
      ${subtitulo ? `<div class="fut-list-row-meta text-center mb-3">${subtitulo}</div>` : ''}
      ${items.length > 0 ? `
        <div class="fut-list-stack">
          ${items.map((item, index) => renderRow(item, index)).join('')}
        </div>
      ` : `
        <div class="fut-empty">
          <div class="fut-empty-icon"><i class="bi bi-dash-circle"></i></div>
          <div>${emptyText}</div>
        </div>
      `}
    </div>
  `;
}

function renderizarFilaRankingPerfil({ indice, nombre, principal, secundario = '', color = 'var(--fut-gold-light)' }) {
  return `
    <div class="fut-list-row">
      <div class="d-flex align-items-center gap-3">
        <div class="fut-form-dot" style="background:${color};color:#111;">${indice}</div>
        <div>
          <div class="text-white fw-semibold">${nombre}</div>
          ${secundario ? `<div class="fut-list-row-meta">${secundario}</div>` : ''}
        </div>
      </div>
      <div class="text-end">
        <div class="fw-semibold" style="color:${color};">${principal}</div>
      </div>
    </div>
  `;
}

/**
 * Carga el perfil completo de un jugador
 */
async function cargarPerfilJugador(jugadorId) {
  const versionCarga = ++versionCargaPerfilActual;
  // Los IDs son UUIDs (strings), no convertir a número
  jugadorPerfilActual = jugadorId;

  // Sincronizar selector de jugador en el header
  const selectorHeader = document.getElementById('selector-jugador-perfil');
  if (selectorHeader) selectorHeader.value = jugadorId;

  // Obtener temporada seleccionada del dashboard (selector principal)
  const temporadaActiva = obtenerTemporadaActivaDesdeSelectores();
  temporadaPerfilSeleccionada = temporadaActiva !== '' ? temporadaActiva : null;

  sincronizarRutaPerfilCompartible({
    vista: 'perfil',
    jugadorId,
    temporadaId: temporadaPerfilSeleccionada || ''
  });

  console.log('🔍 Temporada seleccionada para perfil:', temporadaPerfilSeleccionada);

  // Mostrar loading en stats principales
  document.getElementById('perfil-stats-principales').innerHTML = `
    <div class="col-12 text-center py-4">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Cargando...</span>
      </div>
      <p class="text-muted mt-2">Cargando estadísticas...</p>
    </div>
  `;

  try {
    // Cargar datos del jugador
    const { data: jugador, error: errorJugador } = await supabase
      .from('jugadores')
      .select(`
        *,
        jugador_posicion (
          es_primaria,
          posicion (id, nombre)
        )
      `)
      .eq('id', jugadorId)
      .single();

    if (errorJugador) throw errorJugador;

    // Cargar TODAS las participaciones en partidos (sin filtro de Supabase)
    const { data: participaciones, error: errorPart } = await supabase
      .from('jugador_partido')
      .select(`
        *,
        partido_id,
        partidos (
          id, fecha, cancha, youtube_link, equipo_ganador, temporada_id,
          temporadas (nombre)
        )
      `)
      .eq('jugador_id', jugadorId);

    if (errorPart) throw errorPart;

    // Filtrar participaciones en JavaScript (más confiable que el filtro de Supabase en relaciones)
    let participacionesFiltradas = participaciones.filter(p => p.partidos !== null);
    if (temporadaPerfilSeleccionada) {
      participacionesFiltradas = participacionesFiltradas.filter(p => p.partidos.temporada_id === temporadaPerfilSeleccionada);
    }

    // Cargar goles del jugador (como goleador, asistidor o autor de la cagada)
    let goles = [];
    const consultaGolesConCagada = await supabase
      .from('goles')
      .select(`
        *,
        partidos (youtube_link, fecha, temporada_id)
      `)
      .or(`goleador_id.eq.${jugadorId},asistidor_id.eq.${jugadorId},cagada_jugador_id.eq.${jugadorId}`);

    if (consultaGolesConCagada.error && esErrorColumnaCagadaFaltante(consultaGolesConCagada.error)) {
      console.warn('⚠️ La columna goles.cagada_jugador_id no existe todavía. Se usa fallback sin cagadas en gol.');
      const consultaGolesFallback = await supabase
        .from('goles')
        .select(`
          *,
          partidos (youtube_link, fecha, temporada_id)
        `)
        .or(`goleador_id.eq.${jugadorId},asistidor_id.eq.${jugadorId}`);

      if (consultaGolesFallback.error) throw consultaGolesFallback.error;
      goles = consultaGolesFallback.data || [];
    } else {
      if (consultaGolesConCagada.error) throw consultaGolesConCagada.error;
      goles = consultaGolesConCagada.data || [];
    }

    // Filtrar goles por temporada si está seleccionada
    let golesFiltrados = goles.filter(g => g.partidos !== null);
    if (temporadaPerfilSeleccionada) {
      golesFiltrados = golesFiltrados.filter(g => g.partidos.temporada_id === temporadaPerfilSeleccionada);
    }

    // Contar goles, asistencias y cagadas en gol desde la tabla goles
    const golesCount = golesFiltrados.filter(g => g.goleador_id === jugadorId).length;
    const asistenciasCount = golesFiltrados.filter(g => g.asistidor_id === jugadorId).length;
    const cagadasEnGolCount = golesFiltrados.filter(g => g.cagada_jugador_id === jugadorId).length;
    const premiosHistoricos = await cargarPremiosHistoricosPerfilJugador(jugadorId, temporadaPerfilSeleccionada);

    const datosPerfilBase = {
      jugador,
      participaciones: participacionesFiltradas,
      goles: golesFiltrados,
      golesCount,
      asistenciasCount,
      cagadasEnGolCount
    };

    const resumenPerfil = obtenerResumenPerfilJugador(datosPerfilBase);
    const insigniasPerfil = calcularInsigniasPerfil({
      ...datosPerfilBase,
      resumenPerfil
    });

    datosPerfilJugador = {
      ...datosPerfilBase,
      resumenPerfil,
      insigniasPerfil,
      premiosHistoricos
    };

    console.log('📊 Datos perfil cargados:', {
      jugador: jugador.nombre,
      temporada: temporadaPerfilSeleccionada || 'Todas',
      participaciones: participacionesFiltradas.length,
      goles: golesCount,
      asistencias: asistenciasCount,
      cagadasEnGol: cagadasEnGolCount
    });

    // Renderizar el perfil
    renderizarPerfilBasico();
    renderizarStatsMainPerfil();
    renderizarVideosGoles();
    renderizarVideosAsistencias();
    renderizarVideosCagadas();
    renderizarEstadisticasDetalladas();

    // Las sinergias y rivalidades se cargan bajo demanda cuando se hace click en el tab

  } catch (error) {
    console.error('Error al cargar perfil:', error);
    showToast('Error al cargar el perfil del jugador', 'error');
  }
}

/**
 * Renderiza la información básica del jugador (avatar, nombre, posiciones)
 */
function renderizarPerfilBasico() {
  inyectarEstilosPerfilFut();

  const jugadorFut = datosPerfilJugador.jugador;
  const resumenFut = datosPerfilJugador.resumenPerfil || obtenerResumenPerfilJugador(datosPerfilJugador);
  const insigniasFut = datosPerfilJugador.insigniasPerfil || calcularInsigniasPerfil({
    ...datosPerfilJugador,
    resumenPerfil: resumenFut
  });
  const premiosFut = datosPerfilJugador.premiosHistoricos || [];
  const ratingFut = calcularRatingPerfilFut({
    ...datosPerfilJugador,
    resumenPerfil: resumenFut
  });
  const formaFut = obtenerFormaRecientePerfil(datosPerfilJugador);
  const posicionesFut = jugadorFut.jugador_posicion || [];
  const posicionPrimariaFut = posicionesFut.find(p => p.es_primaria);
  const posicionSecundariaFut = posicionesFut.find(p => !p.es_primaria);
  const iconoPosicionFut = posicionPrimariaFut?.posicion
    ? obtenerIconoPosicionPerfil(posicionPrimariaFut.posicion.nombre)
    : '🏃';
  const abrevPosicionFut = posicionPrimariaFut?.posicion
    ? obtenerAbrevPosicionPerfil(posicionPrimariaFut.posicion.nombre)
    : 'POS';

  const headerFut = document.getElementById('perfil-nombre-jugador');
  if (headerFut) {
    headerFut.innerHTML = `<i class="bi bi-person-circle me-2"></i>${jugadorFut.nombre}`;
  }

  const avatarElFut = document.getElementById('perfil-avatar');
  if (avatarElFut) avatarElFut.textContent = iconoPosicionFut;

  const nombreElFut = document.getElementById('perfil-nombre');
  if (nombreElFut) nombreElFut.textContent = jugadorFut.nombre;

  const posicionesElFut = document.getElementById('perfil-posiciones');
  if (posicionesElFut) {
    let posicionesHtmlFut = '';
    if (posicionPrimariaFut?.posicion) {
      posicionesHtmlFut += `<span class="fut-meta-tag">${obtenerIconoPosicionPerfil(posicionPrimariaFut.posicion.nombre)} ${posicionPrimariaFut.posicion.nombre}</span>`;
    }
    if (posicionSecundariaFut?.posicion) {
      posicionesHtmlFut += `<span class="fut-meta-tag">${obtenerIconoPosicionPerfil(posicionSecundariaFut.posicion.nombre)} ${posicionSecundariaFut.posicion.nombre}</span>`;
    }
    posicionesElFut.innerHTML = posicionesHtmlFut || '<span class="fut-meta-tag">Sin posicion</span>';
  }

  const pulmonElFut = document.getElementById('perfil-pulmon');
  if (pulmonElFut) {
    pulmonElFut.innerHTML = `<span class="fut-meta-tag"><i class="bi bi-heart-pulse me-1"></i>Pulmon ${jugadorFut.pulmon || '--'}</span>`;
  }

  const heroContainerFut = document.getElementById('fut-hero-container');
  if (!heroContainerFut) return;

  const formaHtmlFut = formaFut.length > 0
    ? `
      <div class="fut-form-row">
        <span class="fut-form-label">Forma</span>
        ${formaFut.map(resultado => `<div class="fut-form-dot fut-form-${resultado}">${resultado}</div>`).join('')}
      </div>
    `
    : '';

  const logrosDestacadosFut = [
    ...premiosFut,
    ...insigniasFut.filter(insignia => insignia.unlocked)
  ].slice(0, 5);

  const logrosHtmlFut = logrosDestacadosFut.length > 0
    ? `
      <div class="fut-hero-logros">
        ${logrosDestacadosFut.map(logro => `
          <span class="fut-hero-logro" title="${logro.name}: ${logro.desc}">
            ${logro.iconHtml || logro.icon || '🏅'}
            <span>${logro.name}</span>
          </span>
        `).join('')}
      </div>
    `
    : '';

  heroContainerFut.innerHTML = `
    <div class="fut-hero-card">
      <div class="fut-hero-inner">
        <div class="fut-hero-left">
          <div class="fut-rating">${ratingFut}</div>
          <div class="fut-position-badge">${abrevPosicionFut}</div>
          <div class="fut-avatar-ring">${iconoPosicionFut}</div>
        </div>
        <div class="fut-hero-right">
          <div class="fut-player-name">${jugadorFut.nombre}</div>
          <div class="fut-player-meta">
            ${posicionPrimariaFut?.posicion ? `<span class="fut-meta-tag">${obtenerIconoPosicionPerfil(posicionPrimariaFut.posicion.nombre)} ${posicionPrimariaFut.posicion.nombre}</span>` : ''}
            ${posicionSecundariaFut?.posicion ? `<span class="fut-meta-tag">${obtenerIconoPosicionPerfil(posicionSecundariaFut.posicion.nombre)} ${posicionSecundariaFut.posicion.nombre}</span>` : ''}
            <span class="fut-meta-tag"><i class="bi bi-heart-pulse me-1"></i>Pulmon ${jugadorFut.pulmon || '--'}</span>
            <span class="fut-meta-tag"><i class="bi bi-graph-up-arrow me-1"></i>${resumenFut.puntos} pts</span>
          </div>
          ${formaHtmlFut}
          ${logrosHtmlFut}
        </div>
      </div>
    </div>
  `;
  return;

  const jugador = datosPerfilJugador.jugador;

  // Nombre en header
  document.getElementById('perfil-nombre-jugador').innerHTML = `
    <i class="bi bi-person-circle me-2"></i>${jugador.nombre}
  `;

  // Nombre en card
  document.getElementById('perfil-nombre').textContent = jugador.nombre;

  // Posiciones
  const posiciones = jugador.jugador_posicion || [];
  const posicionPrimaria = posiciones.find(p => p.es_primaria);
  const posicionSecundaria = posiciones.find(p => !p.es_primaria);

  // Función para obtener emoji según posición
  const getIconoPosicion = (nombrePosicion) => {
    const iconos = {
      'Arquero': '🧤',
      'Defensor': '🛡️',
      'Mediocampista': '⚙️',
      'Delantero': '⚽',
      'Volante': '🎯'
    };
    return iconos[nombrePosicion] || '🏃‍♂️';
  };

  let posicionesHtml = '';
  if (posicionPrimaria?.posicion) {
    const icono = getIconoPosicion(posicionPrimaria.posicion.nombre);
    posicionesHtml += `<span class="badge bg-primary me-1">${icono} ${posicionPrimaria.posicion.nombre}</span>`;
  }
  if (posicionSecundaria?.posicion) {
    const icono = getIconoPosicion(posicionSecundaria.posicion.nombre);
    posicionesHtml += `<span class="badge bg-secondary">${icono} ${posicionSecundaria.posicion.nombre}</span>`;
  }
  document.getElementById('perfil-posiciones').innerHTML = posicionesHtml || '<span class="text-muted">Sin posición</span>';

  // Avatar basado en posición primaria
  const iconoPosicion = posicionPrimaria?.posicion ? getIconoPosicion(posicionPrimaria.posicion.nombre) : '🏃‍♂️';
  document.getElementById('perfil-avatar').textContent = iconoPosicion;

  // Pulmón
  document.getElementById('perfil-pulmon').innerHTML = `
    <i class="bi bi-heart-pulse me-1"></i>Pulmón: ${jugador.pulmon || '--'}
  `;
}

/**
 * Renderiza las estadísticas principales en cards
 */
function renderizarStatsMainPerfil() {
  const resumenFut = datosPerfilJugador.resumenPerfil || obtenerResumenPerfilJugador(datosPerfilJugador);
  const containerFut = document.getElementById('perfil-stats-principales');
  if (!containerFut) return;

  const colorStatFut = (valor, thresholds) => {
    if (valor >= thresholds[2]) return 'var(--fut-green)';
    if (valor >= thresholds[1]) return 'var(--fut-gold-light)';
    return 'var(--fut-text)';
  };

  containerFut.innerHTML = `
    <div class="fut-stats-grid">
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-cyan)">${resumenFut.pj}</div>
        <div class="fut-stat-label">Partidos</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:${colorStatFut(resumenFut.winrate, [30, 50, 60])}">${resumenFut.winrate.toFixed(1)}%</div>
        <div class="fut-stat-label">Winrate</div>
        <div class="fut-wr-bar-bg">
          <div class="fut-wr-bar-fill" style="width:${Math.min(resumenFut.winrate, 100)}%;background:${colorStatFut(resumenFut.winrate, [30, 50, 60])}"></div>
        </div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-gold-light)">${resumenFut.puntos}</div>
        <div class="fut-stat-label">Puntos</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-blue)">${resumenFut.goles + resumenFut.asistencias}</div>
        <div class="fut-stat-label">G+A</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-gold-light)">⚽ ${resumenFut.goles}</div>
        <div class="fut-stat-label">Goles</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-blue)">🎯 ${resumenFut.asistencias}</div>
        <div class="fut-stat-label">Asistencias</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-green)">🧤 ${resumenFut.atajadas}</div>
        <div class="fut-stat-label">Atajadas</div>
      </div>
      <div class="fut-stat-card">
        <div class="fut-stat-value" style="color:var(--fut-gold)">👑 ${resumenFut.mvp} <span style="font-size:14px;color:var(--fut-cyan)">🔥 ${resumenFut.ace}</span></div>
        <div class="fut-stat-label">MVP / ACE</div>
      </div>
    </div>
  `;
  return;

  const participaciones = datosPerfilJugador.participaciones;
  const container = document.getElementById('perfil-stats-principales');

  // Calcular estadísticas
  const pj = participaciones.length;
  const pg = participaciones.filter(p => p.partidos?.equipo_ganador === p.equipo).length;
  const pe = participaciones.filter(p => p.partidos?.equipo_ganador === null).length;
  const pp = participaciones.filter(p => p.partidos?.equipo_ganador && p.partidos.equipo_ganador !== p.equipo).length;
  // Usar goles/asistencias desde la tabla goles (más preciso)
  const goles = datosPerfilJugador.golesCount || 0;
  const asistencias = datosPerfilJugador.asistenciasCount || 0;
  const mvp = participaciones.filter(p => p.mvp).length;
  const ace = participaciones.filter(p => p.ace).length;
  const winrate = pj > 0 ? ((pg / pj) * 100).toFixed(1) : 0;

  container.innerHTML = `
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-secondary text-center h-100">
        <div class="card-body py-3">
          <div class="text-info fs-4 fw-bold">${pj}</div>
          <div class="small text-light-emphasis">Partidos</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-secondary text-center h-100">
        <div class="card-body py-3">
          <div class="text-success fs-4 fw-bold">${winrate}%</div>
          <div class="small text-light-emphasis">Winrate</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-secondary text-center h-100">
        <div class="card-body py-3">
          <div class="text-warning fs-4 fw-bold">${goles}</div>
          <div class="small text-light-emphasis">⚽ Goles</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-secondary text-center h-100">
        <div class="card-body py-3">
          <div class="text-primary fs-4 fw-bold">${asistencias}</div>
          <div class="small text-light-emphasis">🎯 Asistencias</div>
        </div>
      </div>
    </div>
    <div class="col-4 col-md-2">
      <div class="card bg-dark border-success text-center h-100">
        <div class="card-body py-2">
          <div class="text-success fw-bold">${pg}</div>
          <div class="small text-light-emphasis">PG</div>
        </div>
      </div>
    </div>
    <div class="col-4 col-md-2">
      <div class="card bg-dark border-warning text-center h-100">
        <div class="card-body py-2">
          <div class="text-warning fw-bold">${pe}</div>
          <div class="small text-light-emphasis">PE</div>
        </div>
      </div>
    </div>
    <div class="col-4 col-md-2">
      <div class="card bg-dark border-danger text-center h-100">
        <div class="card-body py-2">
          <div class="text-danger fw-bold">${pp}</div>
          <div class="small text-light-emphasis">PP</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-warning text-center h-100">
        <div class="card-body py-2">
          <div class="text-warning fw-bold">👑 ${mvp}</div>
          <div class="small text-light-emphasis">MVP</div>
        </div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="card bg-dark border-info text-center h-100">
        <div class="card-body py-2">
          <div class="text-info fw-bold">🔥 ${ace}</div>
          <div class="small text-light-emphasis">ACE</div>
        </div>
      </div>
    </div>
  `;
}

function obtenerNombreJugadorPorId(jugadorId) {
  if (!jugadorId) return null;
  return todosLosJugadoresGlobal.find(j => j.id === jugadorId)?.nombre || null;
}

function renderizarEventosConVideoPerfil({
  containerId,
  eventos,
  tituloEvento,
  iconoLinea,
  emptyMessage,
  detalleExtraFn = null
}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!eventos || eventos.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-camera-video-off display-4 text-muted"></i>
        <p class="text-muted mt-3">${emptyMessage}</p>
      </div>
    `;
    return;
  }

  const tieneVideoConTimestamp = (evento) => {
    const tieneMinuto = evento.minuto !== null && evento.minuto !== undefined;
    const youtubeLink = evento.partidos?.youtube_link;
    return !!(tieneMinuto && youtubeLink && extraerVideoId(youtubeLink));
  };

  const eventosConVideo = eventos.filter(tieneVideoConTimestamp);
  const eventosSinVideo = eventos.filter(evento => !tieneVideoConTimestamp(evento));

  let html = '';

  if (eventosConVideo.length > 0) {
    html += eventosConVideo.map((evento, index) => {
      const youtubeLink = evento.partidos?.youtube_link || '';
      const videoId = extraerVideoId(youtubeLink);
      const segundos = Math.round((evento.minuto || 0) * 60);
      const fecha = evento.partidos?.fecha
        ? new Date(evento.partidos.fecha).toLocaleDateString('es-AR')
        : 'Fecha desconocida';
      const minutos = Math.floor(evento.minuto || 0);
      const segs = Math.round(((evento.minuto || 0) - minutos) * 60);
      const detalleExtra = detalleExtraFn ? detalleExtraFn(evento) : '';

      return `
        <div class="col-md-4 col-lg-3">
          <div class="card bg-dark border-secondary h-100">
            <div class="ratio ratio-16x9">
              <iframe
                src="https://www.youtube.com/embed/${videoId}?start=${segundos}"
                title="${tituloEvento} ${index + 1}"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen>
              </iframe>
            </div>
            <div class="card-body py-2">
              <small class="text-muted">${fecha}</small>
              <p class="mb-0 small">${iconoLinea} Minuto ${minutos}'${segs > 0 ? segs.toString().padStart(2, '0') : ''}</p>
              ${detalleExtra}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  if (eventosSinVideo.length > 0) {
    html += `
      <div class="col-12 mt-4">
        <div class="alert alert-secondary">
          <i class="bi bi-info-circle me-2"></i>
          <strong>${eventosSinVideo.length}</strong> evento(s) adicionales sin video disponible
        </div>
      </div>
    `;
  }

  if (eventosConVideo.length === 0) {
    html = `
      <div class="col-12 text-center py-5">
        <i class="bi bi-camera-video-off display-4 text-muted"></i>
        <p class="text-muted mt-3">${eventos.length} evento(s) registrados, pero ninguno tiene video con timestamp</p>
      </div>
    `;
  }

  container.innerHTML = html;
}

/**
 * Renderiza los videos de goles del jugador
 */
function renderizarVideosGoles() {
  const goles = datosPerfilJugador.goles.filter(g => g.goleador_id === jugadorPerfilActual);

  renderizarEventosConVideoPerfil({
    containerId: 'perfil-videos-container',
    eventos: goles,
    tituloEvento: 'Gol',
    iconoLinea: '⚽',
    emptyMessage: 'No hay goles registrados',
    detalleExtraFn: (gol) => {
      const asistidorNombre = obtenerNombreJugadorPorId(gol.asistidor_id);
      const detalleAsistencia = asistidorNombre ? `🎯 Asistencia: ${asistidorNombre}` : 'Sin asistencia';
      const enContraBadge = gol.es_gol_en_contra
        ? '<span class="badge bg-warning text-dark mt-1 mb-1">En contra</span>'
        : '';
      return `
        ${enContraBadge}
        <p class="mb-0 small text-light-emphasis">${detalleAsistencia}</p>
      `;
    }
  });
}

function renderizarVideosAsistencias() {
  const asistencias = datosPerfilJugador.goles.filter(g => g.asistidor_id === jugadorPerfilActual);

  renderizarEventosConVideoPerfil({
    containerId: 'perfil-asistencias-container',
    eventos: asistencias,
    tituloEvento: 'Asistencia',
    iconoLinea: '🎯',
    emptyMessage: 'No hay asistencias registradas',
    detalleExtraFn: (gol) => {
      const goleadorNombre = obtenerNombreJugadorPorId(gol.goleador_id) || 'N/A';
      return `<p class="mb-0 small text-light-emphasis">⚽ Gol de: ${goleadorNombre}</p>`;
    }
  });
}

function renderizarVideosCagadas() {
  const cagadasEnGol = datosPerfilJugador.goles.filter(g => g.cagada_jugador_id === jugadorPerfilActual);

  renderizarEventosConVideoPerfil({
    containerId: 'perfil-cagadas-container',
    eventos: cagadasEnGol,
    tituloEvento: 'Cagada',
    iconoLinea: '💥',
    emptyMessage: 'No hay cagadas en gol registradas',
    detalleExtraFn: (gol) => {
      const goleadorNombre = obtenerNombreJugadorPorId(gol.goleador_id) || 'N/A';
      return `<p class="mb-0 small text-light-emphasis">⚽ Gol convertido por: ${goleadorNombre}</p>`;
    }
  });
}

/**
 * Renderiza las estadísticas detalladas
 */
function renderizarEstadisticasDetalladas() {
  const containerFut = document.getElementById('perfil-estadisticas-container');
  if (!containerFut) return;

  const resumenFut = datosPerfilJugador.resumenPerfil || obtenerResumenPerfilJugador(datosPerfilJugador);
  const premiosFut = datosPerfilJugador.premiosHistoricos || [];
  const insigniasFut = datosPerfilJugador.insigniasPerfil || calcularInsigniasPerfil({
    ...datosPerfilJugador,
    resumenPerfil: resumenFut
  });
  const ultimosPartidosFut = resumenFut.ultimosPartidos || [];

  const premiosHtmlFut = premiosFut.length > 0
    ? `<div class="fut-badges-grid">${premiosFut.map(renderizarBadgePerfil).join('')}</div>`
    : `
      <div class="fut-empty">
        <div class="fut-empty-icon"><i class="bi bi-patch-check"></i></div>
        <div>No hay premios historicos acumulados para esta temporada visible.</div>
      </div>
    `;

  const insigniasHtmlFut = insigniasFut.length > 0
    ? `<div class="fut-badges-grid">${insigniasFut.map(renderizarBadgePerfil).join('')}</div>`
    : `
      <div class="fut-empty">
        <div class="fut-empty-icon"><i class="bi bi-stars"></i></div>
        <div>Sin insignias disponibles.</div>
      </div>
    `;

  const ultimosPartidosHtmlFut = ultimosPartidosFut.length > 0
    ? `
      <div class="fut-list-stack">
        ${ultimosPartidosFut.map(partido => {
          const gano = partido.partidos?.equipo_ganador === partido.equipo;
          const empato = partido.partidos?.equipo_ganador === null || partido.partidos?.equipo_ganador === 0;
          const resultado = gano ? 'W' : empato ? 'D' : 'L';
          const fecha = partido.partidos?.fecha
            ? new Date(partido.partidos.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
            : '--/--';
          const partidoId = escaparTextoParaJs(partido.partido_id);
          return `
            <div class="fut-list-row" role="button" tabindex="0" style="cursor:pointer;" onclick="irAHistorialPartido('${partidoId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();irAHistorialPartido('${partidoId}');}">
              <div class="d-flex align-items-center gap-3">
                <div class="fut-form-dot fut-form-${resultado}">${resultado}</div>
                <div>
                  <div class="text-white fw-semibold">${fecha}</div>
                  <div class="fut-list-row-meta">${partido.partidos?.temporadas?.nombre || 'Partido'}</div>
                </div>
              </div>
              <div class="text-end small text-light-emphasis">
                ${partido.goles > 0 ? `⚽ ${partido.goles}` : ''}
                ${partido.asistencias > 0 ? ` ${partido.asistencias > 0 ? `🎯 ${partido.asistencias}` : ''}` : ''}
                ${partido.mvp ? ' 👑' : ''}
                ${partido.ace ? ' 🔥' : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `
    : `
      <div class="fut-empty">
        <div class="fut-empty-icon"><i class="bi bi-clock-history"></i></div>
        <div>Sin partidos registrados.</div>
      </div>
    `;

  containerFut.innerHTML = `
    <div class="row g-4">
      <div class="col-lg-4">
        <div class="fut-radar-container">
          <div class="fut-radar-title">Resumen general</div>
          <table class="fut-detail-table">
            <tr><td>Partidos</td><td>${resumenFut.pj}</td></tr>
            <tr><td>Victorias / Empates / Derrotas</td><td>${resumenFut.pg} / ${resumenFut.pe} / ${resumenFut.pp}</td></tr>
            <tr><td>Winrate</td><td>${resumenFut.winrate.toFixed(1)}%</td></tr>
            <tr><td>Puntos</td><td>${resumenFut.puntos}</td></tr>
            <tr><td>Puntos por partido</td><td>${resumenFut.puntosPP.toFixed(2)}</td></tr>
          </table>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="fut-radar-container">
          <div class="fut-radar-title">Ataque</div>
          <table class="fut-detail-table">
            <tr><td>Goles</td><td>${resumenFut.goles}</td></tr>
            <tr><td>Asistencias</td><td>${resumenFut.asistencias}</td></tr>
            <tr><td>Goles por partido</td><td>${resumenFut.golesPP.toFixed(2)}</td></tr>
            <tr><td>Asistencias por partido</td><td>${resumenFut.asistenciasPP.toFixed(2)}</td></tr>
            <tr><td>MVP</td><td>${resumenFut.mvp}</td></tr>
            <tr><td>ACE</td><td>${resumenFut.ace}</td></tr>
          </table>
        </div>
      </div>
      <div class="col-lg-4">
        <div class="fut-radar-container">
          <div class="fut-radar-title">Defensa</div>
          <table class="fut-detail-table">
            <tr><td>Atajadas</td><td>${resumenFut.atajadas}</td></tr>
            <tr><td>Atajadas por partido</td><td>${resumenFut.atajadasPP.toFixed(2)}</td></tr>
            <tr><td>Cagadas</td><td>${resumenFut.cagadas}</td></tr>
            <tr><td>Cagadas en gol</td><td>${resumenFut.cagadasEnGol}</td></tr>
            <tr><td>G+A</td><td>${resumenFut.goles + resumenFut.asistencias}</td></tr>
            <tr><td>Rating</td><td>${calcularRatingPerfilFut({ ...datosPerfilJugador, resumenPerfil: resumenFut })}</td></tr>
          </table>
        </div>
      </div>

      <div class="col-12">
        <div class="fut-section-header"><i class="bi bi-patch-check"></i>Logros</div>
      </div>
      <div class="col-lg-6">
        <div class="fut-radar-container">
          <div class="fut-radar-title">Premios historicos</div>
          ${premiosHtmlFut}
        </div>
      </div>
      <div class="col-lg-6">
        <div class="fut-radar-container">
          <div class="fut-radar-title">Insignias del perfil</div>
          ${insigniasHtmlFut}
        </div>
      </div>

      <div class="col-12">
        <div class="fut-section-header"><i class="bi bi-clock-history"></i>Ultimos 5 partidos</div>
        ${ultimosPartidosHtmlFut}
      </div>
    </div>
  `;
  return;

  const container = document.getElementById('perfil-estadisticas-container');
  const participaciones = datosPerfilJugador.participaciones;

  // Calcular estadísticas
  const pj = participaciones.length;
  const pg = participaciones.filter(p => p.partidos?.equipo_ganador === p.equipo).length;
  const pe = participaciones.filter(p => p.partidos?.equipo_ganador === null).length;
  const pp = pj - pg - pe;
  // Usar goles/asistencias desde la tabla goles (más preciso)
  const goles = datosPerfilJugador.golesCount || 0;
  const asistencias = datosPerfilJugador.asistenciasCount || 0;
  const mvp = participaciones.filter(p => p.mvp).length;
  const ace = participaciones.filter(p => p.ace).length;
  const atajadas = participaciones.reduce((sum, p) => sum + (p.atajadas || 0), 0);
  const cagadas = participaciones.reduce((sum, p) => sum + (p.cagadas || 0), 0);
  const cagadasEnGol = datosPerfilJugador.cagadasEnGolCount || 0;
  const winrate = pj > 0 ? ((pg / pj) * 100).toFixed(1) : 0;
  const golesPP = pj > 0 ? (goles / pj).toFixed(2) : '0.00';
  const asistPP = pj > 0 ? (asistencias / pj).toFixed(2) : '0.00';

  // Últimos 5 partidos
  const ultimosPartidos = participaciones
    .filter(p => p.partidos)
    .sort((a, b) => new Date(b.partidos.fecha) - new Date(a.partidos.fecha))
    .slice(0, 5);

  container.innerHTML = `
    <div class="row g-4">
      <!-- Resumen general -->
      <div class="col-md-6">
        <div class="card bg-dark border-secondary">
          <div class="card-header bg-transparent border-secondary">
            <i class="bi bi-bar-chart me-2"></i>Resumen General
          </div>
          <div class="card-body">
            <table class="table table-dark table-sm mb-0">
              <tbody>
                <tr><td>Partidos Jugados</td><td class="text-end fw-bold">${pj}</td></tr>
                <tr><td>Victorias</td><td class="text-end text-success">${pg}</td></tr>
                <tr><td>Empates</td><td class="text-end text-warning">${pe}</td></tr>
                <tr><td>Derrotas</td><td class="text-end text-danger">${pp}</td></tr>
                <tr><td>Winrate</td><td class="text-end fw-bold text-info">${winrate}%</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Stats ofensivas -->
      <div class="col-md-6">
        <div class="card bg-dark border-secondary">
          <div class="card-header bg-transparent border-secondary">
            <i class="bi bi-lightning me-2"></i>Estadísticas Ofensivas
          </div>
          <div class="card-body">
            <table class="table table-dark table-sm mb-0">
              <tbody>
                <tr><td>⚽ Goles</td><td class="text-end fw-bold text-warning">${goles}</td></tr>
                <tr><td>🎯 Asistencias</td><td class="text-end">${asistencias}</td></tr>
                <tr><td>Goles/Partido</td><td class="text-end">${golesPP}</td></tr>
                <tr><td>Asist/Partido</td><td class="text-end">${asistPP}</td></tr>
                <tr><td>👑 MVP</td><td class="text-end text-warning">${mvp}</td></tr>
                <tr><td>🔥 ACE</td><td class="text-end text-info">${ace}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Stats defensivas -->
      <div class="col-md-6">
        <div class="card bg-dark border-secondary">
          <div class="card-header bg-transparent border-secondary">
            <i class="bi bi-shield me-2"></i>Estadísticas Defensivas
          </div>
          <div class="card-body">
            <table class="table table-dark table-sm mb-0">
              <tbody>
                <tr><td>🧤 Atajadas</td><td class="text-end text-success">${atajadas}</td></tr>
                <tr><td>💥 Cagadas</td><td class="text-end text-danger">${cagadas}</td></tr>
                <tr><td>💥 Cagadas en gol</td><td class="text-end text-danger">${cagadasEnGol}</td></tr>
                <tr><td>Atajadas/Partido</td><td class="text-end">${pj > 0 ? (atajadas / pj).toFixed(2) : '0.00'}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Últimos partidos -->
      <div class="col-md-6">
        <div class="card bg-dark border-secondary">
          <div class="card-header bg-transparent border-secondary">
            <i class="bi bi-clock-history me-2"></i>Últimos 5 Partidos
          </div>
          <div class="card-body p-0">
            ${ultimosPartidos.length > 0 ? `
              <div class="list-group list-group-flush">
                ${ultimosPartidos.map(p => {
                  const gano = p.partidos.equipo_ganador === p.equipo;
                  const empate = p.partidos.equipo_ganador === null;
                  const resultado = gano ? '✅' : (empate ? '🤝' : '❌');
                  const colorBg = gano ? 'bg-success bg-opacity-10' : (empate ? 'bg-warning bg-opacity-10' : 'bg-danger bg-opacity-10');
                  const fecha = new Date(p.partidos.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                  return `
                    <div class="list-group-item bg-dark border-secondary ${colorBg}">
                      <div class="d-flex justify-content-between align-items-center">
                        <span>${resultado} ${fecha}</span>
                        <span class="small">
                          ${p.goles > 0 ? `⚽${p.goles}` : ''}
                          ${p.asistencias > 0 ? `🎯${p.asistencias}` : ''}
                          ${p.mvp ? '👑' : ''}
                          ${p.ace ? '🔥' : ''}
                        </span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">Sin partidos registrados</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Variable para almacenar todas las sinergias calculadas
let todasLasSinergias = [];

/**
 * Renderiza las sinergias (mejores y peores compañeros)
 */
async function renderizarSinergias() {
  const container = document.getElementById('perfil-sinergias-container');
  const participaciones = datosPerfilJugador.participaciones;

  container.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="text-muted mt-2">Calculando sinergias...</p>
    </div>
  `;

  try {
    // Obtener IDs de partidos
    const partidoIds = participaciones.map(p => p.partido_id).filter(Boolean);

    if (partidoIds.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-people display-4 text-muted"></i>
          <p class="text-muted mt-3">No hay suficientes partidos para calcular sinergias</p>
        </div>
      `;
      return;
    }

    // Obtener todos los jugadores de esos partidos
    const { data: todosJP, error } = await supabase
      .from('jugador_partido')
      .select('jugador_id, partido_id, equipo, jugadores(nombre)')
      .in('partido_id', partidoIds);

    if (error) throw error;

    // Agrupar por compañero
    const sinergias = {};
    const nombreJugadorActual = datosPerfilJugador.jugador?.nombre || 'Jugador actual';

    participaciones.forEach(p => {
      const companeros = todosJP.filter(jp =>
        jp.partido_id === p.partido_id &&
        jp.equipo === p.equipo &&
        jp.jugador_id !== jugadorPerfilActual
      );

      const gano = p.partidos?.equipo_ganador === p.equipo;

      companeros.forEach(c => {
        if (!sinergias[c.jugador_id]) {
          sinergias[c.jugador_id] = {
            id: c.jugador_id,
            nombre: c.jugadores?.nombre || 'Desconocido',
            partidos: 0,
            victorias: 0,
            golesAsistencias: 0,
            conexiones: []
          };
        }
        sinergias[c.jugador_id].partidos++;
        if (gano) sinergias[c.jugador_id].victorias++;
      });
    });

    (datosPerfilJugador.goles || []).forEach(gol => {
      if (gol?.es_gol_en_contra || !gol?.asistidor_id || !gol?.goleador_id) {
        return;
      }

      let companeroId = null;
      if (gol.goleador_id === jugadorPerfilActual && sinergias[gol.asistidor_id]) {
        companeroId = gol.asistidor_id;
      } else if (gol.asistidor_id === jugadorPerfilActual && sinergias[gol.goleador_id]) {
        companeroId = gol.goleador_id;
      }

      if (!companeroId || !sinergias[companeroId]) {
        return;
      }

      const sinergia = sinergias[companeroId];
      sinergia.golesAsistencias++;
      sinergia.conexiones.push({
        id: gol.id,
        partido_id: gol.partido_id,
        fecha: gol.partidos?.fecha || null,
        youtube_link: gol.partidos?.youtube_link || null,
        minuto: gol.minuto ?? null,
        asistidor_id: gol.asistidor_id,
        asistidor_nombre: gol.asistidor_id === jugadorPerfilActual ? nombreJugadorActual : sinergia.nombre,
        goleador_id: gol.goleador_id,
        goleador_nombre: gol.goleador_id === jugadorPerfilActual ? nombreJugadorActual : sinergia.nombre
      });
    });

    // Calcular winrate para todos
    todasLasSinergias = Object.values(sinergias)
      .map(s => ({
        ...s,
        conexiones: [...(s.conexiones || [])].sort((a, b) => {
          const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
          const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
          return fechaB - fechaA;
        }),
        winrate: ((s.victorias / s.partidos) * 100).toFixed(1)
      }))
      .sort((a, b) => parseFloat(b.winrate) - parseFloat(a.winrate));

    // Renderizar con la función helper
    renderizarSinergiasUI();

  } catch (error) {
    console.error('Error al calcular sinergias:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>Error al calcular sinergias
      </div>
    `;
  }
}

/**
 * Renderiza la UI de sinergias con opción de búsqueda
 */
function renderizarSinergiasUI(jugadorBuscado = null) {
  const container = document.getElementById('perfil-sinergias-container');
  const nombreJugadorActualFut = datosPerfilJugador?.jugador?.nombre || 'Jugador actual';

  const formatearFechaConexionFut = (fecha) => {
    if (!fecha) return 'Fecha sin dato';
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatearMinutoConexionFut = (minuto) => {
    if (minuto === null || minuto === undefined) return null;
    const mins = Math.floor(minuto);
    const secs = Math.round((minuto - mins) * 60);
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}'`;
  };

  const renderizarDetalleGolAsistenciaFut = (sinergia) => {
    const conexionesFut = sinergia?.conexiones || [];
    const pasesDelJugadorActualFut = conexionesFut.filter(c =>
      c.asistidor_id === jugadorPerfilActual && c.goleador_id === sinergia.id
    ).length;
    const pasesDelCompaneroFut = conexionesFut.filter(c =>
      c.asistidor_id === sinergia.id && c.goleador_id === jugadorPerfilActual
    ).length;

    return `
      <div class="fut-radar-container">
        <div class="fut-radar-title">Dupla con ${sinergia.nombre}</div>
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">G+A del duo</div>
              <div class="fut-rating" style="font-size:38px;">${sinergia.golesAsistencias || 0}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">${nombreJugadorActualFut} asistio</div>
              <div class="text-white fw-semibold fs-4">${pasesDelJugadorActualFut}</div>
              <div class="fut-list-row-meta">a ${sinergia.nombre}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">${sinergia.nombre} asistio</div>
              <div class="text-white fw-semibold fs-4">${pasesDelCompaneroFut}</div>
              <div class="fut-list-row-meta">a ${nombreJugadorActualFut}</div>
            </div>
          </div>
        </div>
        ${conexionesFut.length > 0 ? `
          <div class="fut-section-header"><i class="bi bi-link-45deg"></i>Detalle G+A</div>
          <div class="fut-list-stack">
            ${conexionesFut.map(conexion => {
              const minutoFut = formatearMinutoConexionFut(conexion.minuto);
              const youtubeConexionLinkFut = obtenerLinkYouTubeReview(conexion.youtube_link);
              const metaFut = [
                formatearFechaConexionFut(conexion.fecha),
                minutoFut ? `min ${minutoFut}` : null,
                youtubeConexionLinkFut && conexion.minuto !== null && conexion.minuto !== undefined
                  ? `<a href="${generarLinkConTimestamp(youtubeConexionLinkFut, conexion.minuto)}" target="_blank" class="link-info text-decoration-none">ver video</a>`
                  : null
              ].filter(Boolean).join(' &middot; ');

              return `
                <div class="fut-list-row">
                  <div>
                    <div class="text-white fw-semibold">${conexion.asistidor_nombre} asistio a ${conexion.goleador_nombre}</div>
                    <div class="fut-list-row-meta">${metaFut}</div>
                  </div>
                  <div class="fut-stat-pill">G+A</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="fut-empty">
            <div class="fut-empty-icon"><i class="bi bi-link-45deg"></i></div>
            <div>No hay conexiones directas de gol + asistencia registradas para este duo.</div>
          </div>
        `}
      </div>
    `;
  };

  const sinergiasFiltradasFut = todasLasSinergias.filter(s => s.partidos >= 3);
  const mejoresFut = [...sinergiasFiltradasFut]
    .sort((a, b) => {
      if (parseFloat(b.winrate) !== parseFloat(a.winrate)) {
        return parseFloat(b.winrate) - parseFloat(a.winrate);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);
  const peoresFut = [...sinergiasFiltradasFut]
    .sort((a, b) => {
      if (parseFloat(a.winrate) !== parseFloat(b.winrate)) {
        return parseFloat(a.winrate) - parseFloat(b.winrate);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);
  const mejoresPorGAFut = [...todasLasSinergias]
    .filter(s => (s.golesAsistencias || 0) > 0)
    .sort((a, b) => {
      if ((b.golesAsistencias || 0) !== (a.golesAsistencias || 0)) {
        return (b.golesAsistencias || 0) - (a.golesAsistencias || 0);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);

  let jugadorEncontradoFut = null;
  if (jugadorBuscado && jugadorBuscado.trim()) {
    const busquedaFut = jugadorBuscado.toLowerCase().trim();
    jugadorEncontradoFut = todasLasSinergias.find(s =>
      s.nombre.toLowerCase().includes(busquedaFut)
    );
  }

  container.innerHTML = `
    <div class="row g-4">
      <div class="col-12">
        <div class="fut-radar-container">
          <div class="fut-section-header"><i class="bi bi-search"></i>Buscar compa&ntilde;ero</div>
          <div class="row g-3 align-items-center">
            <div class="col-lg-8">
              <div class="input-group">
                <input type="text" class="form-control fut-search-input"
                       id="buscar-sinergia" placeholder="Nombre del compa&ntilde;ero..."
                       value="${jugadorBuscado || ''}">
                <button class="btn fut-search-btn" type="button" id="btn-buscar-sinergia">Buscar</button>
              </div>
            </div>
            <div class="col-lg-4">
              <div class="fut-list-row-meta text-lg-end">Winrate con 3+ partidos juntos</div>
            </div>
          </div>
          ${jugadorEncontradoFut ? `
            <div class="mt-4">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                <div>
                  <div class="text-white fw-semibold fs-4">${jugadorEncontradoFut.nombre}</div>
                  <div class="fut-list-row-meta">${jugadorEncontradoFut.partidos} PJ juntos</div>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <span class="fut-stat-pill">${jugadorEncontradoFut.winrate}% WR</span>
                  <span class="fut-stat-pill">${jugadorEncontradoFut.golesAsistencias || 0} G+A</span>
                </div>
              </div>
              ${renderizarDetalleGolAsistenciaFut(jugadorEncontradoFut)}
            </div>
          ` : jugadorBuscado ? `
            <div class="fut-empty">
              <div class="fut-empty-icon"><i class="bi bi-person-x"></i></div>
              <div>No se encontr&oacute; ning&uacute;n compa&ntilde;ero con ese nombre.</div>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'Mejores compa&ntilde;eros',
          subtitulo: 'Mayor winrate compartido',
          items: mejoresFut,
          emptyText: 'No hay suficientes datos.',
          renderRow: (sinergia, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: sinergia.nombre,
            principal: `${sinergia.winrate}%`,
            secundario: `${sinergia.partidos} PJ`,
            color: 'var(--fut-green)'
          })
        })}
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'Peores compa&ntilde;eros',
          subtitulo: 'Menor winrate compartido',
          items: peoresFut,
          emptyText: 'No hay suficientes datos.',
          renderRow: (sinergia, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: sinergia.nombre,
            principal: `${sinergia.winrate}%`,
            secundario: `${sinergia.partidos} PJ`,
            color: 'var(--fut-red)'
          })
        })}
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'G+A con compa&ntilde;eros',
          subtitulo: 'Conexiones directas registradas',
          items: mejoresPorGAFut,
          emptyText: 'No hay conexiones G+A registradas.',
          renderRow: (sinergia, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: sinergia.nombre,
            principal: `${sinergia.golesAsistencias} G+A`,
            secundario: `${sinergia.partidos} PJ`,
            color: 'var(--fut-cyan)'
          })
        })}
      </div>
      <div class="col-12">
        <div class="fut-list-row-meta text-center">Winrate con 3+ partidos juntos. G+A muestra conexiones directas registradas.</div>
      </div>
    </div>
  `;

  const inputBuscarFut = document.getElementById('buscar-sinergia');
  if (inputBuscarFut) {
    inputBuscarFut.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarSinergia();
      }
    });
  }
  const botonBuscarFut = document.getElementById('btn-buscar-sinergia');
  if (botonBuscarFut) {
    botonBuscarFut.onclick = buscarSinergia;
  }
  return;
  const nombreJugadorActual = datosPerfilJugador?.jugador?.nombre || 'Jugador actual';

  const formatearFechaConexion = (fecha) => {
    if (!fecha) return 'Fecha sin dato';
    return new Date(fecha).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatearMinutoConexion = (minuto) => {
    if (minuto === null || minuto === undefined) return null;
    const mins = Math.floor(minuto);
    const secs = Math.round((minuto - mins) * 60);
    return secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}'`;
  };

  const renderizarDetalleGolAsistencia = (sinergia) => {
    const conexiones = sinergia?.conexiones || [];
    const pasesDelJugadorActual = conexiones.filter(c =>
      c.asistidor_id === jugadorPerfilActual && c.goleador_id === sinergia.id
    ).length;
    const pasesDelCompanero = conexiones.filter(c =>
      c.asistidor_id === sinergia.id && c.goleador_id === jugadorPerfilActual
    ).length;

    return `
      <div class="mt-3 pt-3 border-top border-secondary">
        <div class="row g-2 mb-3">
          <div class="col-md-4">
            <div class="rounded border border-info p-2 h-100">
              <div class="small text-info-emphasis">G+A del dúo</div>
              <div class="fs-5 fw-bold text-info">${sinergia.golesAsistencias || 0}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="rounded border border-secondary p-2 h-100">
              <div class="small text-light-emphasis">${nombreJugadorActual} asistió a ${sinergia.nombre}</div>
              <div class="fs-6 fw-bold text-white">${pasesDelJugadorActual}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="rounded border border-secondary p-2 h-100">
              <div class="small text-light-emphasis">${sinergia.nombre} asistió a ${nombreJugadorActual}</div>
              <div class="fs-6 fw-bold text-white">${pasesDelCompanero}</div>
            </div>
          </div>
        </div>
        ${conexiones.length > 0 ? `
          <div class="small text-info mb-2">Detalle de las conexiones G+A</div>
          <div class="list-group list-group-flush rounded overflow-hidden">
            ${conexiones.map(conexion => {
              const minuto = formatearMinutoConexion(conexion.minuto);
              const youtubeConexionLink = obtenerLinkYouTubeReview(conexion.youtube_link);
              const textoMeta = [
                formatearFechaConexion(conexion.fecha),
                minuto ? `min ${minuto}` : null,
                youtubeConexionLink && conexion.minuto !== null && conexion.minuto !== undefined
                  ? `<a href="${generarLinkConTimestamp(youtubeConexionLink, conexion.minuto)}" target="_blank" class="link-info text-decoration-none">ver video</a>`
                  : null
              ].filter(Boolean).join(' · ');

              return `
                <div class="list-group-item bg-dark border-secondary">
                  <div class="fw-semibold text-white">${conexion.asistidor_nombre} asistió a ${conexion.goleador_nombre}</div>
                  <div class="small text-muted">${textoMeta}</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div class="small text-muted">
            No hay conexiones directas de gol + asistencia registradas para este dúo.
          </div>
        `}
      </div>
    `;
  };

  // Filtrar por mínimo 3 partidos para los rankings
  const sinergiasFiltradas = todasLasSinergias.filter(s => s.partidos >= 3);
  const mejores = sinergiasFiltradas.slice(0, 5);
  const peores = sinergiasFiltradas.slice(-5).reverse();
  const mejoresPorGA = [...todasLasSinergias]
    .filter(s => (s.golesAsistencias || 0) > 0)
    .sort((a, b) => {
      if ((b.golesAsistencias || 0) !== (a.golesAsistencias || 0)) {
        return (b.golesAsistencias || 0) - (a.golesAsistencias || 0);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);

  // Si hay un jugador buscado, encontrar sus stats
  let jugadorEncontrado = null;
  if (jugadorBuscado && jugadorBuscado.trim()) {
    const busqueda = jugadorBuscado.toLowerCase().trim();
    jugadorEncontrado = todasLasSinergias.find(s =>
      s.nombre.toLowerCase().includes(busqueda)
    );
  }

  container.innerHTML = `
    <!-- Buscador de compañero específico -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card bg-dark border-info">
          <div class="card-header bg-info bg-opacity-25 border-info">
            <i class="bi bi-search me-2"></i>Buscar compañero específico
          </div>
          <div class="card-body">
            <div class="input-group">
              <input type="text" class="form-control bg-dark text-white border-secondary"
                     id="buscar-sinergia" placeholder="Nombre del jugador..."
                     value="${jugadorBuscado || ''}">
              <button class="btn btn-info" type="button" id="btn-buscar-sinergia">
                <i class="bi bi-search"></i> Buscar
              </button>
            </div>
            ${jugadorEncontrado ? `
              <div class="mt-3 p-3 border border-info rounded">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong class="text-white">${jugadorEncontrado.nombre}</strong>
                  </div>
                  <div class="text-end">
                    <span class="badge ${parseFloat(jugadorEncontrado.winrate) >= 50 ? 'bg-success' : 'bg-danger'} fs-6">
                      ${jugadorEncontrado.winrate}% winrate
                    </span>
                    <div class="small text-muted mt-1">
                      ${jugadorEncontrado.victorias}W - ${jugadorEncontrado.partidos - jugadorEncontrado.victorias}L
                      (${jugadorEncontrado.partidos} partidos juntos)
                    </div>
                  </div>
                </div>
                ${renderizarDetalleGolAsistencia(jugadorEncontrado)}
              </div>
            ` : jugadorBuscado ? `
              <div class="mt-3 text-warning">
                <i class="bi bi-exclamation-circle me-1"></i>No se encontró ningún compañero con ese nombre
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-md-6">
        <div class="card bg-dark border-success">
          <div class="card-header bg-success bg-opacity-25 border-success">
            <i class="bi bi-hand-thumbs-up me-2"></i>🤝 Mejores Compañeros
          </div>
          <div class="card-body p-0">
            ${mejores.length > 0 ? `
              <div class="list-group list-group-flush">
                ${mejores.map((s, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${s.nombre}</span>
                    <span>
                      <span class="badge bg-success">${s.winrate}%</span>
                      <small class="text-muted ms-1">(${s.partidos} PJ)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay suficientes datos</p>'}
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card bg-dark border-danger">
          <div class="card-header bg-danger bg-opacity-25 border-danger">
            <i class="bi bi-hand-thumbs-down me-2"></i>💔 Peores Compañeros
          </div>
          <div class="card-body p-0">
            ${peores.length > 0 ? `
              <div class="list-group list-group-flush">
                ${peores.map((s, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${s.nombre}</span>
                    <span>
                      <span class="badge bg-danger">${s.winrate}%</span>
                      <small class="text-muted ms-1">(${s.partidos} PJ)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay suficientes datos</p>'}
          </div>
        </div>
      </div>
      <div class="col-md-12 col-lg-4">
        <div class="card bg-dark border-info">
          <div class="card-header bg-info bg-opacity-25 border-info">
            <i class="bi bi-lightning-charge me-2"></i>G+A con Compa&ntilde;eros
            <small class="d-block text-muted">Conexiones directas de gol + asistencia</small>
          </div>
          <div class="card-body p-0">
            ${mejoresPorGA.length > 0 ? `
              <div class="list-group list-group-flush">
                ${mejoresPorGA.map((s, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${s.nombre}</span>
                    <span>
                      <span class="badge bg-info text-dark">${s.golesAsistencias} G+A</span>
                      <small class="text-muted ms-1">(${s.partidos} PJ)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay conexiones G+A registradas</p>'}
          </div>
        </div>
      </div>
    </div>
    <div class="text-muted small mt-3 text-center">
      <i class="bi bi-info-circle me-1"></i>Winrate con 3+ partidos juntos. G+A muestra conexiones directas registradas.
    </div>
  `;

  // Agregar evento de enter para buscar
  const inputBuscar = document.getElementById('buscar-sinergia');
  if (inputBuscar) {
    inputBuscar.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') buscarSinergia();
    });
  }
}

/**
 * Busca un compañero específico en las sinergias
 */
function buscarSinergia() {
  const input = document.getElementById('buscar-sinergia');
  const valor = input?.value || '';
  renderizarSinergiasUI(valor);
}

window.buscarSinergia = buscarSinergia;

// Variable para almacenar todas las rivalidades calculadas
let todasLasRivalidades = [];

/**
 * Renderiza las rivalidades (contra quién gana/pierde más)
 */
async function renderizarRivalidades() {
  const container = document.getElementById('perfil-rivalidades-container');
  const participaciones = datosPerfilJugador.participaciones;

  container.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="text-muted mt-2">Calculando rivalidades...</p>
    </div>
  `;

  try {
    const partidoIds = participaciones.map(p => p.partido_id).filter(Boolean);

    if (partidoIds.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-lightning display-4 text-muted"></i>
          <p class="text-muted mt-3">No hay suficientes partidos para calcular rivalidades</p>
        </div>
      `;
      return;
    }

    // Obtener todos los jugadores de esos partidos
    const { data: todosJP, error } = await supabase
      .from('jugador_partido')
      .select('jugador_id, partido_id, equipo, jugadores(nombre)')
      .in('partido_id', partidoIds);

    if (error) throw error;

    const { data: golesData, error: golesError } = await supabase
      .from('goles')
      .select('partido_id, goleador_id, es_gol_en_contra')
      .in('partido_id', partidoIds);

    if (golesError) throw golesError;

    const jugadoresPorPartido = {};
    todosJP.forEach(jp => {
      if (!jugadoresPorPartido[jp.partido_id]) {
        jugadoresPorPartido[jp.partido_id] = [];
      }
      jugadoresPorPartido[jp.partido_id].push(jp);
    });

    const golesPorPartido = {};
    (golesData || []).forEach(gol => {
      if (!golesPorPartido[gol.partido_id]) {
        golesPorPartido[gol.partido_id] = [];
      }
      golesPorPartido[gol.partido_id].push(gol);
    });

    // Agrupar por rival
    const rivalidades = {};

    participaciones.forEach(p => {
      const equipoRival = p.equipo === 1 ? 2 : 1;
      const rivales = (jugadoresPorPartido[p.partido_id] || []).filter(jp =>
        jp.partido_id === p.partido_id &&
        jp.equipo === equipoRival
      );

      const gano = p.partidos?.equipo_ganador === p.equipo;
      const perdio = p.partidos?.equipo_ganador === equipoRival;

      rivales.forEach(r => {
        if (!rivalidades[r.jugador_id]) {
          rivalidades[r.jugador_id] = {
            id: r.jugador_id,
            nombre: r.jugadores?.nombre || 'Desconocido',
            partidos: 0,
            victorias: 0,
            derrotas: 0,
            golesConvertidos: 0
          };
        }
        rivalidades[r.jugador_id].partidos++;
        if (gano) rivalidades[r.jugador_id].victorias++;
        if (perdio) rivalidades[r.jugador_id].derrotas++;
      });

      (golesPorPartido[p.partido_id] || []).forEach(gol => {
        if (gol?.es_gol_en_contra || !gol?.goleador_id) {
          return;
        }

        const rivalGoleador = rivales.find(r => r.jugador_id === gol.goleador_id);
        if (!rivalGoleador) {
          return;
        }

        if (!rivalidades[rivalGoleador.jugador_id]) {
          rivalidades[rivalGoleador.jugador_id] = {
            id: rivalGoleador.jugador_id,
            nombre: rivalGoleador.jugadores?.nombre || 'Desconocido',
            partidos: 0,
            victorias: 0,
            derrotas: 0,
            golesConvertidos: 0
          };
        }

        rivalidades[rivalGoleador.jugador_id].golesConvertidos++;
      });
    });

    // Calcular winrate para todos
    todasLasRivalidades = Object.values(rivalidades)
      .map(r => ({
        ...r,
        winrate: ((r.victorias / r.partidos) * 100).toFixed(1)
      }));

    // Renderizar con la función helper
    renderizarRivalidadesUI();

  } catch (error) {
    console.error('Error al calcular rivalidades:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>Error al calcular rivalidades
      </div>
    `;
  }
}

/**
 * Renderiza la UI de rivalidades con opción de búsqueda
 */
function renderizarRivalidadesUI(jugadorBuscado = null) {
  const container = document.getElementById('perfil-rivalidades-container');
  const rivalidadesFiltradasFut = todasLasRivalidades.filter(r => r.partidos >= 3);
  const bestiasNegrasFut = [...rivalidadesFiltradasFut]
    .sort((a, b) => parseFloat(a.winrate) - parseFloat(b.winrate))
    .slice(0, 5);
  const victimasFut = [...rivalidadesFiltradasFut]
    .sort((a, b) => parseFloat(b.winrate) - parseFloat(a.winrate))
    .slice(0, 5);
  const goleadoresVsMiFut = [...todasLasRivalidades]
    .filter(r => (r.golesConvertidos || 0) > 0)
    .sort((a, b) => {
      if ((b.golesConvertidos || 0) !== (a.golesConvertidos || 0)) {
        return (b.golesConvertidos || 0) - (a.golesConvertidos || 0);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);

  let jugadorEncontradoFut = null;
  if (jugadorBuscado && jugadorBuscado.trim()) {
    const busquedaFut = jugadorBuscado.toLowerCase().trim();
    jugadorEncontradoFut = todasLasRivalidades.find(r =>
      r.nombre.toLowerCase().includes(busquedaFut)
    );
  }

  const detalleBuscadoFut = jugadorEncontradoFut ? `
    <div class="mt-4">
      <div class="fut-radar-container">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <div class="text-white fw-semibold fs-4">${jugadorEncontradoFut.nombre}</div>
            <div class="fut-list-row-meta">${jugadorEncontradoFut.partidos} enfrentamientos</div>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <span class="fut-stat-pill">${jugadorEncontradoFut.winrate}% WR</span>
            <span class="fut-stat-pill">${jugadorEncontradoFut.golesConvertidos || 0} goles</span>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">Victorias</div>
              <div class="text-white fw-semibold fs-3">${jugadorEncontradoFut.victorias}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">Derrotas</div>
              <div class="text-white fw-semibold fs-3">${jugadorEncontradoFut.derrotas}</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="fut-radar-container h-100" style="padding:16px;">
              <div class="fut-radar-title" style="font-size:13px;">Empates</div>
              <div class="text-white fw-semibold fs-3">${jugadorEncontradoFut.partidos - jugadorEncontradoFut.victorias - jugadorEncontradoFut.derrotas}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ` : jugadorBuscado ? `
    <div class="fut-empty">
      <div class="fut-empty-icon"><i class="bi bi-person-x"></i></div>
      <div>No se encontr&oacute; ning&uacute;n rival con ese nombre.</div>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="row g-4">
      <div class="col-12">
        <div class="fut-radar-container">
          <div class="fut-section-header"><i class="bi bi-search"></i>Buscar rival</div>
          <div class="row g-3 align-items-center">
            <div class="col-lg-8">
              <div class="input-group">
                <input type="text" class="form-control fut-search-input"
                       id="buscar-rivalidad" placeholder="Nombre del rival..."
                       value="${jugadorBuscado || ''}">
                <button class="btn fut-search-btn fut-search-btn-warning" type="button" onclick="buscarRivalidad()">Buscar</button>
              </div>
            </div>
            <div class="col-lg-4">
              <div class="fut-list-row-meta text-lg-end">Winrate con 3+ enfrentamientos</div>
            </div>
          </div>
          ${detalleBuscadoFut}
        </div>
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'Bestias negras',
          subtitulo: 'Rivales contra los que peor te va',
          items: bestiasNegrasFut,
          emptyText: 'No hay suficientes datos.',
          renderRow: (rival, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: rival.nombre,
            principal: `${rival.winrate}%`,
            secundario: `${rival.victorias}W-${rival.derrotas}L`,
            color: 'var(--fut-red)'
          })
        })}
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'Victimas favoritas',
          subtitulo: 'Rivales contra los que mejor te va',
          items: victimasFut,
          emptyText: 'No hay suficientes datos.',
          renderRow: (rival, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: rival.nombre,
            principal: `${rival.winrate}%`,
            secundario: `${rival.victorias}W-${rival.derrotas}L`,
            color: 'var(--fut-green)'
          })
        })}
      </div>
      <div class="col-lg-4">
        ${renderizarListaRankingPerfil({
          titulo: 'Goleadores vs mi',
          subtitulo: 'Quienes mas goles te hacen',
          items: goleadoresVsMiFut,
          emptyText: 'No hay goles en contra registrados.',
          renderRow: (rival, index) => renderizarFilaRankingPerfil({
            indice: index + 1,
            nombre: rival.nombre,
            principal: `${rival.golesConvertidos} goles`,
            secundario: `${rival.partidos} PJ`,
            color: 'var(--fut-orange)'
          })
        })}
      </div>
      <div class="col-12">
        <div class="fut-list-row-meta text-center">Goleadores vs mi muestra los goles convertidos registrados por rivales en tus partidos.</div>
      </div>
    </div>
  `;

  const inputBuscarFut = document.getElementById('buscar-rivalidad');
  if (inputBuscarFut) {
    inputBuscarFut.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') buscarRivalidad();
    });
  }
  return;

  // Filtrar por mínimo 3 partidos para los rankings
  const rivalidadesFiltradas = todasLasRivalidades.filter(r => r.partidos >= 3);

  // Bestias negras (bajo winrate) y víctimas (alto winrate)
  const bestiasNegras = [...rivalidadesFiltradas].sort((a, b) => parseFloat(a.winrate) - parseFloat(b.winrate)).slice(0, 5);
  const victimas = [...rivalidadesFiltradas].sort((a, b) => parseFloat(b.winrate) - parseFloat(a.winrate)).slice(0, 5);
  const goleadoresVsMi = [...todasLasRivalidades]
    .filter(r => (r.golesConvertidos || 0) > 0)
    .sort((a, b) => {
      if ((b.golesConvertidos || 0) !== (a.golesConvertidos || 0)) {
        return (b.golesConvertidos || 0) - (a.golesConvertidos || 0);
      }
      return (b.partidos || 0) - (a.partidos || 0);
    })
    .slice(0, 5);

  // Si hay un jugador buscado, encontrar sus stats
  let jugadorEncontrado = null;
  if (jugadorBuscado && jugadorBuscado.trim()) {
    const busqueda = jugadorBuscado.toLowerCase().trim();
    jugadorEncontrado = todasLasRivalidades.find(r =>
      r.nombre.toLowerCase().includes(busqueda)
    );
  }

  container.innerHTML = `
    <!-- Buscador de rival específico -->
    <div class="row mb-4">
      <div class="col-12">
        <div class="card bg-dark border-warning">
          <div class="card-header bg-warning bg-opacity-25 border-warning">
            <i class="bi bi-search me-2"></i>Buscar rival específico
          </div>
          <div class="card-body">
            <div class="input-group">
              <input type="text" class="form-control bg-dark text-white border-secondary"
                     id="buscar-rivalidad" placeholder="Nombre del rival..."
                     value="${jugadorBuscado || ''}">
              <button class="btn btn-warning" type="button" onclick="buscarRivalidad()">
                <i class="bi bi-search"></i> Buscar
              </button>
            </div>
            ${jugadorEncontrado ? `
              <div class="mt-3 p-3 border border-warning rounded">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong class="text-white">${jugadorEncontrado.nombre}</strong>
                  </div>
                  <div class="text-end">
                    <span class="badge ${parseFloat(jugadorEncontrado.winrate) >= 50 ? 'bg-success' : 'bg-danger'} fs-6">
                      ${jugadorEncontrado.winrate}% winrate
                    </span>
                    <div class="small text-muted mt-1">
                      ${jugadorEncontrado.victorias}W - ${jugadorEncontrado.derrotas}L - ${jugadorEncontrado.partidos - jugadorEncontrado.victorias - jugadorEncontrado.derrotas}E
                      (${jugadorEncontrado.partidos} enfrentamientos)
                    </div>
                  </div>
                </div>
              </div>
            ` : jugadorBuscado ? `
              <div class="mt-3 text-warning">
                <i class="bi bi-exclamation-circle me-1"></i>No se encontró ningún rival con ese nombre
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-md-6">
        <div class="card bg-dark border-danger">
          <div class="card-header bg-danger bg-opacity-25 border-danger">
            <i class="bi bi-emoji-frown me-2"></i>😈 Bestias Negras
            <small class="d-block text-muted">Jugadores contra los que pierdo más</small>
          </div>
          <div class="card-body p-0">
            ${bestiasNegras.length > 0 ? `
              <div class="list-group list-group-flush">
                ${bestiasNegras.map((r, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${r.nombre}</span>
                    <span>
                      <span class="badge bg-danger">${r.winrate}%</span>
                      <small class="text-muted ms-1">(${r.victorias}W-${r.derrotas}L)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay suficientes datos</p>'}
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card bg-dark border-success">
          <div class="card-header bg-success bg-opacity-25 border-success">
            <i class="bi bi-emoji-sunglasses me-2"></i>😎 Víctimas Favoritas
            <small class="d-block text-muted">Jugadores a los que siempre les gano</small>
          </div>
          <div class="card-body p-0">
            ${victimas.length > 0 ? `
              <div class="list-group list-group-flush">
                ${victimas.map((r, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${r.nombre}</span>
                    <span>
                      <span class="badge bg-success">${r.winrate}%</span>
                      <small class="text-muted ms-1">(${r.victorias}W-${r.derrotas}L)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay suficientes datos</p>'}
          </div>
        </div>
      </div>
      <div class="col-md-12 col-lg-4">
        <div class="card bg-dark border-warning">
          <div class="card-header bg-warning bg-opacity-25 border-warning">
            <i class="bi bi-bullseye me-2"></i>Goleadores vs M&iacute;
            <small class="d-block text-muted">Rivales que m&aacute;s goles me convierten</small>
          </div>
          <div class="card-body p-0">
            ${goleadoresVsMi.length > 0 ? `
              <div class="list-group list-group-flush">
                ${goleadoresVsMi.map((r, i) => `
                  <div class="list-group-item bg-dark border-secondary d-flex justify-content-between align-items-center">
                    <span>${i + 1}. ${r.nombre}</span>
                    <span>
                      <span class="badge bg-warning text-dark">⚽ ${r.golesConvertidos}</span>
                      <small class="text-muted ms-1">(${r.partidos} PJ)</small>
                    </span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="text-muted text-center py-3 mb-0">No hay goles en contra registrados</p>'}
          </div>
        </div>
      </div>
    </div>
    <div class="text-muted small mt-3 text-center">
      <i class="bi bi-info-circle me-1"></i>Winrate con 3+ enfrentamientos. Goleadores vs m&iacute; muestra goles convertidos registrados.
    </div>
  `;

  // Agregar evento de enter para buscar
  const inputBuscar = document.getElementById('buscar-rivalidad');
  if (inputBuscar) {
    inputBuscar.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') buscarRivalidad();
    });
  }
}

/**
 * Busca un rival específico en las rivalidades
 */
function buscarRivalidad() {
  const input = document.getElementById('buscar-rivalidad');
  const valor = input?.value || '';
  renderizarRivalidadesUI(valor);
}

/**
 * Pobla el selector de jugadores para el perfil (en el header)
 */
function poblarSelectorJugadoresPerfil() {
  const selectorHeader = document.getElementById('selector-jugador-perfil');
  if (!selectorHeader) return;

  // Ordenar alfabéticamente
  const jugadoresOrdenados = [...todosLosJugadoresGlobal].sort((a, b) => a.nombre.localeCompare(b.nombre));
  selectorHeader.innerHTML = '<option value="">Buscar jugador...</option>';
  jugadoresOrdenados.forEach(j => {
    selectorHeader.innerHTML += `<option value="${j.id}">${j.nombre}</option>`;
  });
}

/**
 * Pobla el selector de jugadores en el modal de selección
 */
function poblarSelectorJugadorModal() {
  const selector = document.getElementById('selector-jugador-modal');
  if (!selector) return;

  selector.innerHTML = '<option value="">Buscar jugador...</option>';
  // Ordenar alfabéticamente
  const jugadoresOrdenados = [...todosLosJugadoresGlobal].sort((a, b) => a.nombre.localeCompare(b.nombre));
  jugadoresOrdenados.forEach(j => {
    selector.innerHTML += `<option value="${j.id}">${j.nombre}</option>`;
  });

  // Resetear el botón
  const btnVerPerfil = document.getElementById('btn-ver-perfil-modal');
  if (btnVerPerfil) btnVerPerfil.disabled = true;
}

// ==========================================
// SISTEMA DE NOTIFICACIONES TOAST (GLOBAL)
// ==========================================

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

// Hacer showToast global
window.showToast = showToast;

// ==========================================
// FIN SISTEMA DE AUTENTICACIÓN
// ==========================================

// --- Función principal que se ejecuta cuando el DOM está listo ---
const initApp = () => {
  inyectarEstilosPerfilFut();
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
  const rutaInicialPerfil = obtenerRutaCompartiblePerfil();

  // Nota: Las variables del perfil de jugador (vistaActual, jugadorPerfilActual, etc.)
  // están definidas globalmente al inicio del archivo

  // Hacer los equipos disponibles globalmente para el tooltip y algoritmo genético
  window.equipo1 = equipo1;
  window.equipo2 = equipo2;
  window.datosJugadores = null; // Se inicializará cuando se carguen las estadísticas
  window.renderizarEquipos = renderizarEquipos; // Hacer la función disponible globalmente

  // Event listener para actualizaciones de equipos desde el algoritmo genético
  document.addEventListener('equiposActualizados', function(event) {
    console.log('Evento equiposActualizados recibido:', event.detail);
    renderizarEquipos().catch(error => {
      console.error('Error al renderizar equipos:', error);
    });
  });
  let eventos = [];
  const reviewSandbox = {
    atajadas: [],
    cagadas: []
  };
  let jugadorEditando = null; // Para saber si estamos editando o agregando

  // Estado de ordenamiento
  let currentSortField = 'total_puntos';
  let currentSortOrder = 'desc'; // 'asc' o 'desc'
  let datosJugadores = []; // Cache de datos para ordenamiento
  let logrosTemporadaPorJugador = new Map();
  let metadatosTemporadasLogros = new Map();

  // Mapeo de iconos de posiciones (se cargará dinámicamente)
  let iconosPosiciones = {};
  let nombresPosiciones = {};
  let posicionesIds = {}; // Para mapear nombre -> UUID
  const configuracionLogrosDashboard = {
    bota: {
      badgeClass: 'bg-warning text-dark',
      iconHtml: '<i class="bi bi-bullseye"></i>',
      tituloBase: 'Bota de oro',
      prioridad: 1
    },
    guante: {
      badgeClass: 'bg-info text-dark',
      iconHtml: '<i class="bi bi-shield-fill"></i>',
      tituloBase: 'Guante de oro',
      prioridad: 2
    },
    asist: {
      badgeClass: 'bg-primary',
      iconHtml: '<i class="bi bi-bezier2"></i>',
      tituloBase: 'Asist de oro',
      prioridad: 3
    },
    puntos: {
      badgeClass: 'bg-danger',
      iconHtml: '<i class="bi bi-award-fill"></i>',
      tituloBase: 'Ganador puntos',
      prioridad: 4
    },
    mundial: {
      badgeClass: 'bg-success',
      iconHtml: '<i class="bi bi-globe-americas"></i>',
      tituloBase: 'Ganador mundial',
      prioridad: 5
    }
  };



  // --- Funciones de ordenamiento ---
  function calcularPromedioPorPartido(jugador, field) {
    const pj = Number(jugador?.pj) || 0;
    const total = Number(jugador?.[field]) || 0;
    return pj > 0 ? total / pj : 0;
  }

  const escaparAtributoHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const extraerNumeroTemporada = (temporada, fallback = 0) => {
    const nombre = temporada?.nombre || '';
    const match = nombre.match(/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    const fallbackNumero = Number(fallback);
    if (Number.isFinite(fallbackNumero) && fallbackNumero > 0) {
      return fallbackNumero;
    }

    const idNumerico = Number(temporada?.id);
    if (Number.isFinite(idNumerico) && idNumerico > 0) {
      return idNumerico;
    }

    return 1;
  };

  const construirMetadatosTemporadasLogros = () => {
    const temporadasBase = Array.isArray(todasLasTemporadas) ? todasLasTemporadas : [];

    const temporadasOrdenadas = temporadasBase
      .map((temporada, index) => {
        const numero = extraerNumeroTemporada(temporada, index + 1);
        return {
          id: String(temporada.id),
          nombre: temporada.nombre || `Temporada ${numero}`,
          orden: numero,
          etiqueta: `S${numero}`
        };
      })
      .sort((a, b) => {
        if (a.orden !== b.orden) return a.orden - b.orden;
        return a.nombre.localeCompare(b.nombre);
      });

    const metadatos = new Map();
    temporadasOrdenadas.forEach((temporada, index) => {
      const orden = Number.isFinite(temporada.orden) ? temporada.orden : index + 1;
      metadatos.set(String(temporada.id), {
        ...temporada,
        orden,
        etiqueta: temporada.etiqueta || `S${orden}`
      });
    });

    return metadatos;
  };

  const obtenerMetadatoTemporadaLogro = (temporadaId) => {
    const key = String(temporadaId);

    if (!metadatosTemporadasLogros.has(key)) {
      const numero = extraerNumeroTemporada(
        { id: temporadaId, nombre: `Temporada ${temporadaId}` },
        metadatosTemporadasLogros.size + 1
      );

      metadatosTemporadasLogros.set(key, {
        id: key,
        nombre: `Temporada ${numero}`,
        orden: numero,
        etiqueta: `S${numero}`
      });
    }

    return metadatosTemporadasLogros.get(key);
  };

  const obtenerOrdenUltimaTemporadaLogros = () => {
    if (metadatosTemporadasLogros.size === 0) {
      return 0;
    }

    return Math.max(...Array.from(metadatosTemporadasLogros.values()).map(meta => meta.orden || 0));
  };

  const obtenerLimiteOrdenLogrosVisible = (temporadaIdActual = null) => {
    const ultimaOrden = obtenerOrdenUltimaTemporadaLogros();
    if (!ultimaOrden) {
      return 0;
    }

    if (!temporadaIdActual) {
      return Math.max(ultimaOrden - 1, 0);
    }

    const metaTemporadaActual = metadatosTemporadasLogros.get(String(temporadaIdActual));
    if (!metaTemporadaActual) {
      return Math.max(ultimaOrden - 1, 0);
    }

    if (metaTemporadaActual.orden >= ultimaOrden) {
      return Math.max(ultimaOrden - 1, 0);
    }

    return metaTemporadaActual.orden;
  };

  const registrarLogroTemporadaJugador = (jugadorId, tipo, temporadaId) => {
    if (!jugadorId || !tipo || temporadaId === null || temporadaId === undefined) {
      return;
    }

    const configuracion = configuracionLogrosDashboard[tipo];
    if (!configuracion) {
      return;
    }

    const metaTemporada = obtenerMetadatoTemporadaLogro(temporadaId);
    const logrosJugador = logrosTemporadaPorJugador.get(jugadorId) || [];
    const clave = `${tipo}-${String(temporadaId)}`;

    if (logrosJugador.some(logro => logro.clave === clave)) {
      return;
    }

    logrosJugador.push({
      clave,
      tipo,
      temporadaId: String(temporadaId),
      ordenTemporada: metaTemporada.orden,
      prioridad: configuracion.prioridad,
      titulo: `${configuracion.tituloBase} - ${metaTemporada.nombre}`,
      marcaTemporada: metaTemporada.orden
    });

    logrosJugador.sort((a, b) => {
      if (a.ordenTemporada !== b.ordenTemporada) {
        return a.ordenTemporada - b.ordenTemporada;
      }
      return a.prioridad - b.prioridad;
    });

    logrosTemporadaPorJugador.set(jugadorId, logrosJugador);
  };

  const registrarGanadoresLogro = (valoresPorJugador, tipo, temporadaId) => {
    if (!(valoresPorJugador instanceof Map) || valoresPorJugador.size === 0) {
      return;
    }

    const maximo = Math.max(...Array.from(valoresPorJugador.values()));
    if (!Number.isFinite(maximo) || maximo <= 0) {
      return;
    }

    valoresPorJugador.forEach((valor, jugadorId) => {
      if (valor === maximo) {
        registrarLogroTemporadaJugador(jugadorId, tipo, temporadaId);
      }
    });
  };

  const obtenerLogrosVisiblesJugador = (jugadorId, temporadaIdActual = null) => {
    const logros = logrosTemporadaPorJugador.get(jugadorId) || [];
    const ordenLimite = obtenerLimiteOrdenLogrosVisible(temporadaIdActual);
    if (!ordenLimite) {
      return [];
    }
    return logros.filter(logro => (logro.ordenTemporada || 0) <= ordenLimite);
  };

  const renderizarBadgesLogrosJugador = (jugadorId, temporadaIdActual = null) => {
    const logrosVisibles = obtenerLogrosVisiblesJugador(jugadorId, temporadaIdActual);
    if (logrosVisibles.length === 0) {
      return '';
    }

    return `
      <div class="d-flex flex-wrap gap-1 mt-1">
        ${logrosVisibles.map(logro => {
          const configuracion = configuracionLogrosDashboard[logro.tipo] || configuracionLogrosDashboard.bota;
          return `<span class="badge ${configuracion.badgeClass} small d-inline-flex align-items-center" title="${escaparAtributoHtml(logro.titulo)}">${configuracion.iconHtml}<span class="ms-1">${logro.marcaTemporada}</span></span>`;
        }).join('')}
      </div>
    `;
  };

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
          return (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2) + (atajadasPP * 0.4);
        };

        aVal = calcularSkill(a);
        bVal = calcularSkill(b);

        return order === 'asc' ? aVal - bVal : bVal - aVal;
      } else if (field === 'goles_favor_equipo' || field === 'goles_recibidos_equipo') {
        aVal = calcularPromedioPorPartido(a, field);
        bVal = calcularPromedioPorPartido(b, field);

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
    todosLosJugadoresGlobal = todosLosJugadores; // Actualizar variable global para perfil
    return todosLosJugadores;
  }

  async function cargarTemporadas() {
    const { data, error } = await supabase.from('temporadas').select('*').order('nombre');
    if (error) {
      console.error('Error al cargar temporadas:', error);
      showToast('Error al cargar temporadas: ' + error.message, 'warning');
      // En caso de error, usar modo simple sin temporadas
      todasLasTemporadas = [];
      todasLasTemporadasGlobal = todasLasTemporadas; // Actualizar variable global para perfil
      cargarOpcionesTemporadas();
      return [];
    }
    todasLasTemporadas = data || [];
    todasLasTemporadasGlobal = todasLasTemporadas; // Actualizar variable global para perfil
    cargarOpcionesTemporadas();
    return todasLasTemporadas;
  }

  function cargarOpcionesTemporadas() {
    const selector = document.getElementById('selector-temporada');
    const selectorMobile = document.getElementById('selector-temporada-mobile');
    const selectorPartido = document.getElementById('temporada-partido');
    const selectorResumenTemporada = document.getElementById('temporadas-resumen-selector');

    const selectors = [selector, selectorMobile, selectorPartido, selectorResumenTemporada].filter(s => s);

    selectors.forEach(sel => {
      // Limpiar opciones existentes
      if (sel.id === 'temporada-partido' || sel.id === 'temporadas-resumen-selector') {
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

      // Seleccionar Temporada 3 por defecto en TODOS los selectores
      const temporada3 = todasLasTemporadas.find(t => t.nombre === 'Temporada 3');
      if (temporada3) {
        sel.value = temporada3.id;

        // Para los selectores de filtro, también actualizar la variable global
        if (sel.id !== 'temporada-partido' && sel.id !== 'temporadas-resumen-selector') {
          temporadaSeleccionada = temporada3.id;
        }
      }

      // Agregar event listener solo para los selectores de filtro (no para el de partido)
      if (sel.id !== 'temporada-partido' && sel.id !== 'temporadas-resumen-selector') {
        sel.addEventListener('change', async (e) => {
          temporadaSeleccionada = e.target.value || null;

          // Sincronizar solo los selectores de filtro
          const selectoresFiltro = [selector, selectorMobile].filter(s => s);
          selectoresFiltro.forEach(otherSel => {
            if (otherSel !== e.target) {
              otherSel.value = e.target.value;
            }
          });

          // Cargar estadísticas, historial y actualizar gráficos del armador
          await cargarEstadisticas();
          cargarHistorialPartidos();

          // Si hay jugadores en los equipos, actualizar los gráficos
          if (equipo1.length > 0 || equipo2.length > 0) {
            renderizarEquipos().catch(error => {
              console.error('Error al renderizar equipos:', error);
            });
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
      renderizarEquipos().catch(error => {
        console.error('Error al renderizar equipos:', error);
      });

    } catch (error) {
      console.error('Error al eliminar jugador:', error);
      showToast('Error al eliminar el jugador: ' + error.message, 'error');
    }
  };

  // --- Lógica de renderizado ---

  async function renderizarEquipos() {
    // Preservar posición del scroll antes del renderizado
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
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

    // Función para analizar rachas del equipo
    const analizarRachasEquipo = async (equipo) => {
      if (equipo.length === 0) return { victorias: [], derrotas: [] };

      // Obtener estadísticas de todos los jugadores para poder calcular rachas
      const estadisticasActuales = window.datosJugadores || [];
      if (estadisticasActuales.length === 0) return { victorias: [], derrotas: [] };

      // Calcular rachas usando la función existente
      const rachas = await calcularRachasJugadores(estadisticasActuales);

      const jugadoresEnRachaVictoria = [];
      const jugadoresEnRachaDerrota = [];

      equipo.forEach(jugador => {
        const racha = rachas[jugador.id];
        if (racha && racha.cantidad >= 2) {
          if (racha.tipo === 'win') {
            jugadoresEnRachaVictoria.push({
              nombre: jugador.nombre,
              cantidad: racha.cantidad
            });
          } else if (racha.tipo === 'defeat') {
            jugadoresEnRachaDerrota.push({
              nombre: jugador.nombre,
              cantidad: racha.cantidad
            });
          }
        }
      });

      return {
        victorias: jugadoresEnRachaVictoria,
        derrotas: jugadoresEnRachaDerrota
      };
    };

    // Función para crear warnings de rachas
    const crearWarningsRachas = (rachas) => {
      let html = '';

      // Warning para rachas de victoria
      if (rachas.victorias.length > 0) {
        html += '<div class="alert alert-success alert-sm mb-1 py-2 px-3" style="font-size: 0.8rem; border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.1);">';
        html += '<i class="bi bi-fire me-2" style="color: #f59e0b;"></i>';
        if (rachas.victorias.length === 1) {
          const jugador = rachas.victorias[0];
          html += `<strong>${jugador.nombre}</strong> viene en racha de <strong>${jugador.cantidad} victorias</strong> 🔥`;
        } else {
          html += `<strong>${rachas.victorias.length} jugadores</strong> vienen en racha de victorias: `;
          html += rachas.victorias.map(j => `<strong>${j.nombre}</strong> (${j.cantidad})`).join(', ');
          html += ' 🔥';
        }
        html += '</div>';
      }

      // Warning para rachas de derrota
      if (rachas.derrotas.length > 0) {
        html += '<div class="alert alert-info alert-sm mb-1 py-2 px-3" style="font-size: 0.8rem; border-left: 4px solid #3b82f6; background: rgba(59, 130, 246, 0.1);">';
        html += '<i class="bi bi-snow me-2" style="color: #06b6d4;"></i>';
        if (rachas.derrotas.length === 1) {
          const jugador = rachas.derrotas[0];
          html += `<strong>${jugador.nombre}</strong> viene en racha de <strong>${jugador.cantidad} derrotas</strong> ❄️`;
        } else {
          html += `<strong>${rachas.derrotas.length} jugadores</strong> vienen en racha de derrotas: `;
          html += rachas.derrotas.map(j => `<strong>${j.nombre}</strong> (${j.cantidad})`).join(', ');
          html += ' ❄️';
        }
        html += '</div>';
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
      return html;
    };

    const renderEquipo = async (equipo, containerId, colorClass) => {
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

        // Analizar y mostrar warnings de rachas (MOVIDO HACIA ARRIBA)
        const rachasEquipo = await analizarRachasEquipo(equipo);
        if (rachasEquipo.victorias.length > 0 || rachasEquipo.derrotas.length > 0) {
          const rachasEl = document.createElement('div');
          rachasEl.className = 'mb-2 pb-2 border-bottom border-secondary';
          rachasEl.innerHTML = crearWarningsRachas(rachasEquipo);
          container.appendChild(rachasEl);
        }

        // Distribución de posiciones
        const distribucionEl = document.createElement('div');
        distribucionEl.innerHTML = mostrarDistribucion(conteos);
        container.appendChild(distribucionEl);
      }
    };

    // Renderizar equipos de forma asíncrona para incluir análisis de rachas
    await renderEquipo(equipo1, 'equipo1-jugadores', 'primary');
    await renderEquipo(equipo2, 'equipo2-jugadores', 'danger');

    // Renderizar gráficos fuera de las cards
    renderizarGraficos();

      // Actualizar todos los selectores de jugadores en "Información del Encuentro"
      poblarSelectoresJugadores();

      // Renderizar tabla de goles
      renderizarTablaGoles();
      renderizarReviewSandbox();

      // Restaurar posición del scroll después del renderizado
      setTimeout(() => {
        window.scrollTo(0, scrollTop);
      }, 50);
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
    renderizarEquipos().catch(error => {
      console.error('Error al renderizar equipos:', error);
    });
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

      // Rendimiento Arquero: atajadas por partido * 0.66
      const atajadasPP = (jugador.atajadas || 0) / pj;
      const rendArquero = atajadasPP * 0.4;

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
      const rendArquero = atajadasPP * 0.66;

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
          <td colspan="7" class="text-center text-muted py-3">
            <i class="bi bi-plus-circle me-2"></i>
            No se han registrado goles aún
          </td>
        </tr>
      `;
      return;
    }

    tablaGoles.innerHTML = eventos.map((evento, index) => {
      const goleador = todosLosJugadores.find(j => j.id == evento.goleador_id)?.nombre || 'N/A';
      const asistencia = evento.asistencia_id === 'nadie' || !evento.asistencia_id ? 'Sin asistencia' :
                        (todosLosJugadores.find(j => j.id == evento.asistencia_id)?.nombre || 'N/A');
      const cagada = evento.cagada_id === 'nadie' || !evento.cagada_id ? 'Sin cagada' :
                     (todosLosJugadores.find(j => j.id == evento.cagada_id)?.nombre || 'N/A');

      // Determinar si es gol en contra (usar la marca explícita si está disponible)
      const jugadoresDelPartido = [...equipo1, ...equipo2];
      const goleadorObj = jugadoresDelPartido.find(j => j.id == evento.goleador_id);
      const esEnContra = evento.es_en_contra !== undefined ?
        evento.es_en_contra : // Usar la marca explícita si está disponible
        (goleadorObj && evento.equipo !== (equipo1.find(j => j.id == evento.goleador_id) ? 1 : 2)); // Fallback al cálculo anterior

      return `
        <tr>
          <td><span class="fw-bold">${goleador}</span></td>
          <td>${asistencia}</td>
          <td>${cagada}</td>
          <td>
            <span class="badge ${evento.equipo === 1 ? 'bg-primary' : 'bg-danger'}">
              ${evento.equipo === 1 ? '🔵 Equipo 1' : '🔴 Equipo 2'}
            </span>
          </td>
          <td>
            <span class="badge ${esEnContra ? 'bg-warning text-dark' : 'bg-success'}">
              ${esEnContra ? '<i class="bi bi-arrow-repeat me-1"></i>En Contra' : '<i class="bi bi-check me-1"></i>Normal'}
            </span>
          </td>
          <td>
            ${evento.minuto !== null && evento.minuto !== undefined ? (() => {
              const mins = Math.floor(evento.minuto);
              const secs = Math.round((evento.minuto - mins) * 60);
              const timeStr = secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}'`;
              return `<span class="badge bg-secondary">${timeStr}</span>`;
            })() : '<span class="text-muted small">—</span>'}
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
      { id: 'cagada-gol', placeholder: 'Seleccionar cagada', extraOption: '<option value="nadie">Nadie</option>' },
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

  function obtenerOpcionesSearchable(select) {
    return Array.from(select?.options || []).map(option => ({
      value: option.value,
      text: option.textContent.trim(),
      disabled: option.disabled
    }));
  }

  function sincronizarSearchableSelect(select) {
    const input = select?.closest('.searchable-wrapper')?.querySelector('.searchable-input');
    if (!select || !input) return;

    const text = input.value.trim().toLowerCase();
    const match = obtenerOpcionesSearchable(select).find(option =>
      option.value && option.text.toLowerCase() === text
    );
    select.value = match ? match.value : (text ? select.value : '');
  }

  function renderizarSearchableDropdown(select) {
    const wrapper = select?.closest('.searchable-wrapper');
    const input = wrapper?.querySelector('.searchable-input');
    const dropdown = wrapper?.querySelector('.searchable-dropdown');
    if (!select || !wrapper || !input || !dropdown) return;

    const query = input.value.trim().toLowerCase();
    const filtered = obtenerOpcionesSearchable(select)
      .filter(option => option.value && !option.disabled && (!query || option.text.toLowerCase().includes(query)))
      .slice(0, 50);

    if (!filtered.length) {
      dropdown.innerHTML = '<div class="searchable-option is-empty">Sin resultados</div>';
      wrapper.classList.add('is-open');
      return;
    }

    dropdown.innerHTML = filtered.map((option, index) => `
      <div class="searchable-option${index === 0 ? ' is-active' : ''}" data-value="${escaparAtributoHtml(option.value)}">
        ${escaparHtmlPlano(option.text)}
      </div>
    `).join('');
    wrapper.classList.add('is-open');
  }

  function elegirSearchableOption(select, value) {
    const wrapper = select?.closest('.searchable-wrapper');
    const input = wrapper?.querySelector('.searchable-input');
    const option = Array.from(select?.options || []).find(item => item.value === value);
    if (!select || !wrapper || !input || !option) return;

    select.value = value;
    input.value = option.textContent.trim();
    wrapper.classList.remove('is-open');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function actualizarSearchableSelect(select, force = false) {
    const input = select?.closest('.searchable-wrapper')?.querySelector('.searchable-input');
    if (!select || !input || (!force && document.activeElement === input)) return;

    const option = Array.from(select.options).find(item => item.value === select.value);
    input.value = option && option.value ? option.textContent.trim() : '';
  }

  function initializeSearchableSelects(root = document) {
    const scope = root || document;
    scope.querySelectorAll('select.searchable-select').forEach(select => {
      if (select.dataset.searchableBound !== '1') {
        select.dataset.searchableBound = '1';
        const wrapper = document.createElement('div');
        wrapper.className = 'searchable-wrapper';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);

        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.className = `searchable-input ${select.classList.contains('form-select-sm') ? 'form-control form-control-sm' : 'form-control'}`;
        input.placeholder = select.options[0]?.textContent?.trim() || 'Buscar';

        const dropdown = document.createElement('div');
        dropdown.className = 'searchable-dropdown';
        wrapper.insertBefore(input, select);
        wrapper.appendChild(dropdown);
        select.classList.add('searchable-native');

        input.addEventListener('focus', () => renderizarSearchableDropdown(select));
        input.addEventListener('input', () => {
          sincronizarSearchableSelect(select);
          renderizarSearchableDropdown(select);
        });
        input.addEventListener('keydown', event => {
          const opts = Array.from(dropdown.querySelectorAll('.searchable-option:not(.is-empty)'));
          const active = dropdown.querySelector('.searchable-option.is-active');
          const activeIndex = Math.max(0, opts.indexOf(active));

          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!wrapper.classList.contains('is-open')) renderizarSearchableDropdown(select);
            const next = event.key === 'ArrowDown'
              ? Math.min(opts.length - 1, activeIndex + 1)
              : Math.max(0, activeIndex - 1);
            opts.forEach(option => option.classList.remove('is-active'));
            opts[next]?.classList.add('is-active');
            opts[next]?.scrollIntoView({ block: 'nearest' });
          }

          if (event.key === 'Enter') {
            const option = dropdown.querySelector('.searchable-option.is-active:not(.is-empty)');
            if (option) {
              event.preventDefault();
              elegirSearchableOption(select, option.dataset.value);
            }
          }

          if (event.key === 'Escape') wrapper.classList.remove('is-open');
        });
        dropdown.addEventListener('mousedown', event => {
          const option = event.target.closest('.searchable-option:not(.is-empty)');
          if (!option) return;
          event.preventDefault();
          elegirSearchableOption(select, option.dataset.value);
        });
        select.addEventListener('change', () => actualizarSearchableSelect(select, true));
      }

      actualizarSearchableSelect(select);
      if (select.closest('.searchable-wrapper')?.classList.contains('is-open')) {
        renderizarSearchableDropdown(select);
      }
    });
  }

  function updateSearchableSelects(root = document) {
    const scope = root || document;
    scope.querySelectorAll('select.searchable-select').forEach(select => {
      actualizarSearchableSelect(select, true);
      if (select.closest('.searchable-wrapper')?.classList.contains('is-open')) {
        renderizarSearchableDropdown(select);
      }
    });
  }

  document.addEventListener('mousedown', event => {
    document.querySelectorAll('.searchable-wrapper.is-open').forEach(wrapper => {
      if (!wrapper.contains(event.target)) wrapper.classList.remove('is-open');
    });
  });

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
    updateSearchableSelects(document);
  }

  function jugadoresDelPartidoActual() {
    return [...equipo1, ...equipo2];
  }

  function obtenerEquipoJugadorActual(jugadorId) {
    if (!jugadorId) return null;
    if (equipo1.some(jugador => String(jugador.id) === String(jugadorId))) return 1;
    if (equipo2.some(jugador => String(jugador.id) === String(jugadorId))) return 2;
    return null;
  }

  function obtenerNombreJugadorActual(jugadorId) {
    const jugador = todosLosJugadores.find(j => String(j.id) === String(jugadorId)) ||
      jugadoresDelPartidoActual().find(j => String(j.id) === String(jugadorId));
    return jugador?.nombre || 'Jugador';
  }

  function construirJugadorConEstadisticas(jugadorExistente) {
    const estadisticasJugador = datosJugadores.find(j => j.jugadores?.id === jugadorExistente.id);
    return {
      ...jugadorExistente,
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
      pulmon: jugadorExistente.pulmon
    };
  }

  async function agregarJugadorAEquipoDesdeId(equipo, jugadorId) {
    const jugadorExistente = todosLosJugadores.find(j => String(j.id) === String(jugadorId));
    if (!jugadorExistente) {
      showToast('Selecciona un jugador valido.', 'warning');
      return false;
    }

    const equipoActual = equipo === 'equipo1' ? equipo1 : equipo2;
    const equipoOpuesto = equipo === 'equipo1' ? equipo2 : equipo1;

    if (equipoActual.some(j => String(j.id) === String(jugadorExistente.id))) {
      showToast(`${jugadorExistente.nombre} ya esta en este equipo`, 'warning');
      return false;
    }

    if (equipoOpuesto.some(j => String(j.id) === String(jugadorExistente.id))) {
      showToast(`${jugadorExistente.nombre} ya esta en el equipo contrario`, 'warning');
      return false;
    }

    equipoActual.push(construirJugadorConEstadisticas(jugadorExistente));
    window.equipo1 = equipo1;
    window.equipo2 = equipo2;

    showToast(`${jugadorExistente.nombre} agregado al ${equipo === 'equipo1' ? 'Equipo 1' : 'Equipo 2'}`, 'success');

    try {
      await renderizarEquipos();
    } catch (error) {
      console.error('Error al renderizar equipos desde review sandbox:', error);
    } finally {
      renderizarReviewSandbox();
    }
    return true;
  }

  function quitarJugadorDesdeReview(equipo, index) {
    const equipoActual = equipo === 'equipo1' ? equipo1 : equipo2;
    const jugadorRemovido = equipoActual[index];
    if (!jugadorRemovido) return;

    equipoActual.splice(index, 1);
    window.equipo1 = equipo1;
    window.equipo2 = equipo2;

    eventos = eventos.filter(evento =>
      String(evento.goleador_id) !== String(jugadorRemovido.id) &&
      String(evento.asistencia_id || '') !== String(jugadorRemovido.id) &&
      String(evento.cagada_id || '') !== String(jugadorRemovido.id)
    );
    reviewSandbox.atajadas = reviewSandbox.atajadas.filter(item => String(item.jugador_id) !== String(jugadorRemovido.id));
    reviewSandbox.cagadas = reviewSandbox.cagadas.filter(item => String(item.jugador_id) !== String(jugadorRemovido.id));

    renderizarEquipos().catch(error => console.error('Error al renderizar equipos:', error));
    renderizarReviewSandbox();
    showToast(`${jugadorRemovido.nombre} removido`, 'info');
  }

  function normalizarReviewUrl(valor) {
    const raw = String(valor || '').trim();
    if (!raw) return null;
    const conProtocolo = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
      const url = new URL(conProtocolo);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return url.href;
    } catch (error) {
      return null;
    }
  }

  const REVIEW_POPUP_CHANNEL = 't5-review-player-sync';
  const REVIEW_POPUP_STORAGE_KEY = 't5-review-player-state';
  const REVIEW_ANNOTATION_CHANNEL = 't5-review-annotation-sync';
  const REVIEW_ANNOTATION_STORAGE_KEY = 't5-review-annotation-state';
  const REVIEW_SCOREBUG_STORAGE_KEY = 't5-review-scorebug-hidden';
  const HLS_JS_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
  let reviewPopupWindow = null;
  let reviewPopupChannel = null;
  let reviewAnnotationWindow = null;
  let reviewAnnotationChannel = null;
  let reviewInlineHls = null;
  let hlsScriptPromise = null;
  let reviewVideoZoom = 1;
  let reviewScorebugOculto = false;
  const reviewAnnotationMensajesProcesados = new Map();
  const reviewPopupEstado = {
    conectado: false,
    url: '',
    segundos: null,
    duracion: null,
    pausado: true,
    actualizadoEn: 0
  };

  function cargarScriptExterno(src) {
    if (hlsScriptPromise) return hlsScriptPromise;

    hlsScriptPromise = new Promise((resolve, reject) => {
      const existente = document.querySelector(`script[src="${src}"]`);
      if (existente) {
        existente.addEventListener('load', resolve, { once: true });
        existente.addEventListener('error', reject, { once: true });
        if (window.Hls) resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });

    return hlsScriptPromise;
  }

  function buscarEnReproductorReview(video, deltaSegundos) {
    if (!video || !Number.isFinite(Number(video.currentTime))) return;
    const duracion = Number.isFinite(Number(video.duration)) ? Number(video.duration) : null;
    const siguiente = Math.max(0, Number(video.currentTime) + deltaSegundos);
    video.currentTime = duracion ? Math.min(duracion, siguiente) : siguiente;
    emitirTiempoReproductorInline();
  }

  function buscarEnReproductorReviewA(segundosVideo, { mostrarToast = true } = {}) {
    const destino = Math.max(0, Number(segundosVideo));
    if (!Number.isFinite(destino)) {
      if (mostrarToast) showToast('Este evento no tiene minuto de video.', 'warning');
      return false;
    }

    const video = document.getElementById('review-player-video');
    let aplicado = false;
    if (video && !video.classList.contains('d-none')) {
      const duracion = Number.isFinite(Number(video.duration)) ? Number(video.duration) : null;
      video.currentTime = duracion ? Math.min(duracion, destino) : destino;
      emitirTiempoReproductorInline();
      try {
        video.focus({ preventScroll: true });
      } catch (error) {
        video.focus();
      }
      try {
        video.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (error) {
        video.scrollIntoView();
      }
      aplicado = true;
    }

    if (reviewPopupWindow && !reviewPopupWindow.closed) {
      const payload = {
        source: 't5-review-main',
        type: 'seek',
        segundos: destino,
        updatedAt: Date.now()
      };
      try {
        reviewPopupWindow.postMessage(payload, '*');
        aplicado = true;
      } catch (error) {}
      try {
        reviewPopupChannel?.postMessage(payload);
      } catch (error) {}
    }

    if (!aplicado) {
      if (mostrarToast) showToast('Carga el reproductor o abre el popup de video para ir al minuto.', 'warning');
      return false;
    }

    if (mostrarToast) showToast(`Minuto ${formatearSegundosVideo(destino)} en el reproductor.`, 'info');
    return true;
  }

  function aplicarZoomReproductorReview(video, siguienteZoom, event = null) {
    if (!video) return;
    const zoom = Math.min(3, Math.max(1, Number(siguienteZoom) || 1));
    reviewVideoZoom = zoom;
    video.dataset.reviewZoom = String(zoom);
    video.style.transform = zoom === 1 ? '' : `scale(${zoom})`;

    if (event && zoom > 1) {
      const rect = video.getBoundingClientRect();
      const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
      const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
      video.style.transformOrigin = `${Math.min(100, Math.max(0, x))}% ${Math.min(100, Math.max(0, y))}%`;
    } else {
      video.style.transformOrigin = '';
    }
  }

  function instalarControlesReproductorReview(video) {
    if (!video || video.dataset.reviewControlsBound === '1') return;
    video.dataset.reviewControlsBound = '1';
    video.tabIndex = 0;
    video.style.transition = 'transform 120ms ease-out';
    try {
      video.setAttribute('controlsList', 'nofullscreen');
      video.controlsList?.add('nofullscreen');
    } catch (error) {}
    let pointerDentro = false;
    const esCampoEditable = element => {
      const tag = element?.tagName?.toLowerCase();
      return tag === 'input' || tag === 'select' || tag === 'textarea' || element?.isContentEditable;
    };
    const manejarFlechas = event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopImmediatePropagation();
        buscarEnReproductorReview(video, -5);
        return true;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        event.stopImmediatePropagation();
        buscarEnReproductorReview(video, 5);
        return true;
      }
      return false;
    };

    video.addEventListener('pointerenter', () => {
      pointerDentro = true;
    });
    video.addEventListener('pointerleave', () => {
      pointerDentro = false;
    });
    video.addEventListener('click', () => {
      try {
        video.focus({ preventScroll: true });
      } catch (error) {
        video.focus();
      }
    });
    video.addEventListener('keydown', event => {
      manejarFlechas(event);
    }, { capture: true });
    document.addEventListener('keydown', event => {
      if (esCampoEditable(event.target)) return;
      if (document.activeElement !== video && !pointerDentro) return;
      manejarFlechas(event);
    }, { capture: true });
    video.addEventListener('wheel', event => {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.12 : -0.12;
      aplicarZoomReproductorReview(video, (Number(video.dataset.reviewZoom) || 1) + delta, event);
    }, { passive: false });
  }

  function obtenerElementoFullscreenReview(doc = document) {
    return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
  }

  function obtenerFrameFullscreenReview() {
    return document.querySelector('#review-sandbox-content .review-player-frame');
  }

  function solicitarFullscreenReview(element) {
    if (!element) return Promise.reject(new Error('No hay reproductor para pantalla completa.'));
    const request = element.requestFullscreen || element.webkitRequestFullscreen || element.msRequestFullscreen;
    if (!request) return Promise.reject(new Error('Este navegador no soporta pantalla completa.'));
    return Promise.resolve(request.call(element));
  }

  function salirFullscreenReview(doc = document) {
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;
    if (!exit) return Promise.resolve();
    return Promise.resolve(exit.call(doc));
  }

  function actualizarBotonFullscreenReview() {
    const frame = obtenerFrameFullscreenReview();
    const button = document.getElementById('review-player-fullscreen');
    const icon = button?.querySelector('i');
    const label = button?.querySelector('span');
    const activo = !!frame && obtenerElementoFullscreenReview() === frame;

    frame?.classList.toggle('is-review-fullscreen', activo);
    if (button) {
      button.setAttribute('aria-pressed', activo ? 'true' : 'false');
      button.setAttribute('title', activo ? 'Salir de pantalla completa' : 'Pantalla completa con marcador');
      button.setAttribute('aria-label', activo ? 'Salir de pantalla completa' : 'Pantalla completa con marcador');
    }
    if (icon) icon.className = activo ? 'bi bi-fullscreen-exit' : 'bi bi-arrows-fullscreen';
    if (label) label.textContent = activo ? 'Salir' : 'Pantalla';
  }

  function redirigirFullscreenVideoReview() {
    const frame = obtenerFrameFullscreenReview();
    const video = document.getElementById('review-player-video');
    const fullscreenElement = obtenerElementoFullscreenReview();
    if (!frame || !video || fullscreenElement !== video || frame.dataset.reviewFullscreenRedirecting === '1') return false;

    frame.dataset.reviewFullscreenRedirecting = '1';
    const estabaReproduciendo = !video.paused;
    salirFullscreenReview()
      .then(() => solicitarFullscreenReview(frame))
      .catch(() => {})
      .finally(() => {
        delete frame.dataset.reviewFullscreenRedirecting;
        actualizarBotonFullscreenReview();
        if (estabaReproduciendo) video.play().catch(() => {});
      });
    return true;
  }

  async function alternarFullscreenReview() {
    const frame = obtenerFrameFullscreenReview();
    if (!frame) return;

    try {
      if (obtenerElementoFullscreenReview() === frame) {
        await salirFullscreenReview();
      } else {
        await solicitarFullscreenReview(frame);
      }
    } catch (error) {
      showToast('El navegador no permitio activar pantalla completa desde este reproductor.', 'warning');
    } finally {
      actualizarBotonFullscreenReview();
    }
  }

  function inicializarFullscreenReview() {
    if (document.body.dataset.reviewFullscreenBound === '1') return;
    document.body.dataset.reviewFullscreenBound = '1';

    document.getElementById('review-player-fullscreen')?.addEventListener('click', alternarFullscreenReview);
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        if (!redirigirFullscreenVideoReview()) actualizarBotonFullscreenReview();
      });
    });
    actualizarBotonFullscreenReview();
  }

  function actualizarEstadoPopupReview() {
    const statusEl = document.getElementById('review-popup-status');
    if (!statusEl) {
      actualizarScorebugReview();
      return;
    }

    const segundosVideo = Number(reviewPopupEstado.segundos);
    const conectado = reviewPopupEstado.conectado && Number.isFinite(segundosVideo);
    if (!conectado) {
      statusEl.className = 'small text-light-emphasis mb-3';
      statusEl.textContent = 'Reproductor sin sincronizar. Si Min/Seg quedan vacios, se usa el tiempo sincronizado.';
      actualizarScorebugReview();
      return;
    }

    const segundosPartido = Math.max(0, Math.round(segundosVideo - obtenerReviewInicioSegundos()));
    statusEl.className = reviewPopupEstado.pausado ? 'small text-warning mb-3' : 'small text-success mb-3';
    statusEl.textContent = `Reproductor sincronizado - Video ${formatearSegundosVideo(segundosVideo)} - Partido ${formatearSegundosVideo(segundosPartido)}${reviewPopupEstado.pausado ? ' - pausado' : ''}`;
    actualizarScorebugReview();
  }

  function obtenerSyncAnotacionReview() {
    const segundosVideo = Number(reviewPopupEstado.segundos);
    const tiempoPartido = obtenerTiempoPartidoDesdeReproductor();
    return {
      conectado: reviewPopupEstado.conectado && Number.isFinite(segundosVideo),
      video: Number.isFinite(segundosVideo) ? segundosVideo : null,
      partido: tiempoPartido?.segundos ?? null,
      pausado: !!reviewPopupEstado.pausado
    };
  }

  function enviarSyncAnotacionReview() {
    if (!reviewAnnotationWindow || reviewAnnotationWindow.closed) return;
    const payload = { source: 't5-review-main', type: 'sync', sync: obtenerSyncAnotacionReview() };
    try { reviewAnnotationWindow.postMessage(payload, '*'); } catch (error) {}
    try { reviewAnnotationChannel?.postMessage(payload); } catch (error) {}
  }

  function aplicarEstadoPopupReview(payload = {}) {
    if (payload.url) reviewPopupEstado.url = payload.url;
    if (payload.type === 'closed') {
      reviewPopupEstado.conectado = false;
      actualizarEstadoPopupReview();
      enviarSyncAnotacionReview();
      return;
    }

    reviewPopupEstado.conectado = true;
    reviewPopupEstado.actualizadoEn = Date.now();
    if (payload.segundos !== undefined && Number.isFinite(Number(payload.segundos))) {
      reviewPopupEstado.segundos = Number(payload.segundos);
    }
    if (payload.duracion !== undefined && Number.isFinite(Number(payload.duracion))) {
      reviewPopupEstado.duracion = Number(payload.duracion);
    }
    if (payload.pausado !== undefined) {
      reviewPopupEstado.pausado = !!payload.pausado;
    }
    actualizarEstadoPopupReview();
    enviarSyncAnotacionReview();
  }

  function emitirTiempoReproductorInline() {
    const video = document.getElementById('review-player-video');
    const url = normalizarReviewUrl(document.getElementById('review-link')?.value) || '';
    if (!video || video.classList.contains('d-none')) return;

    aplicarEstadoPopupReview({
      source: 't5-review-popup',
      type: 'time',
      url,
      segundos: Number.isFinite(video.currentTime) ? video.currentTime : null,
      duracion: Number.isFinite(video.duration) ? video.duration : null,
      pausado: video.paused
    });

    enviarSyncAnotacionReview();
  }

  function limpiarReproductorInline() {
    const video = document.getElementById('review-player-video');
    if (reviewInlineHls) {
      reviewInlineHls.destroy();
      reviewInlineHls = null;
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      aplicarZoomReproductorReview(video, 1);
      video.load();
      video.classList.add('d-none');
    }
  }

  async function cargarReproductorInlineBeelup(url) {
    const iframe = document.getElementById('review-player-frame');
    const video = document.getElementById('review-player-video');
    if (!video) return false;

    const playlistUrl = crearUrlPlaylistBeelup(url, 'm3u8');
    if (!playlistUrl) return false;

    limpiarReproductorInline();
    if (iframe) {
      iframe.src = 'about:blank';
      iframe.classList.add('d-none');
    }

    video.classList.remove('d-none');
    instalarControlesReproductorReview(video);
    ['loadedmetadata', 'timeupdate', 'play', 'pause', 'seeking', 'seeked', 'ratechange'].forEach(eventName => {
      video.removeEventListener(eventName, emitirTiempoReproductorInline);
      video.addEventListener(eventName, emitirTiempoReproductorInline);
    });

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlistUrl;
      video.load();
      emitirTiempoReproductorInline();
      return true;
    }

    await cargarScriptExterno(HLS_JS_URL);
    if (!window.Hls || !window.Hls.isSupported()) {
      throw new Error('Este navegador no soporta HLS en el reproductor inline.');
    }

    reviewInlineHls = new window.Hls({ enableWorker: true });
    reviewInlineHls.loadSource(playlistUrl);
    reviewInlineHls.attachMedia(video);
    reviewInlineHls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data?.fatal) {
        showToast(`No se pudo cargar HLS: ${data.type}`, 'error');
      }
    });
    emitirTiempoReproductorInline();
    return true;
  }

  function manejarMensajePopupReview(data) {
    if (!data || data.source !== 't5-review-popup') return;

    if (data.type === 'error') {
      showToast(data.message || 'El popup no pudo cargar el reproductor.', 'error');
      return;
    }

    aplicarEstadoPopupReview(data);
  }

  function inicializarCanalesPopupReview() {
    if (document.body.dataset.reviewPopupBound !== '1') {
      document.body.dataset.reviewPopupBound = '1';

      window.addEventListener('message', event => {
        manejarMensajePopupReview(event.data);
        manejarMensajeAnotacionReview(event.data);
      });
      window.addEventListener('storage', event => {
        if (!event.newValue) return;
        try {
          const payload = JSON.parse(event.newValue);
          if (event.key === REVIEW_POPUP_STORAGE_KEY) manejarMensajePopupReview(payload);
          if (event.key === REVIEW_ANNOTATION_STORAGE_KEY) manejarMensajeAnotacionReview(payload);
        } catch (error) {
          console.warn('No se pudo leer estado de review:', error);
        }
      });
    }

    if ('BroadcastChannel' in window && !reviewPopupChannel) {
      reviewPopupChannel = new BroadcastChannel(REVIEW_POPUP_CHANNEL);
      reviewPopupChannel.addEventListener('message', event => manejarMensajePopupReview(event.data));
    }

    if ('BroadcastChannel' in window && !reviewAnnotationChannel) {
      reviewAnnotationChannel = new BroadcastChannel(REVIEW_ANNOTATION_CHANNEL);
      reviewAnnotationChannel.addEventListener('message', event => manejarMensajeAnotacionReview(event.data));
    }
  }

  function obtenerTiempoPartidoDesdeReproductor() {
    const segundosVideo = Number(reviewPopupEstado.segundos);
    if (!reviewPopupEstado.conectado || !Number.isFinite(segundosVideo)) return null;

    const inicioReview = obtenerReviewInicioSegundos();
    if (segundosVideo < inicioReview) return null;

    const segundosPartido = Math.max(0, Math.round(segundosVideo - inicioReview));
    return {
      minuto: segundosPartido / 60,
      segundos: segundosPartido,
      reviewSegundos: Math.max(0, Math.round(segundosVideo))
    };
  }

  function obtenerEstadoScorebugReview() {
    const tiempoPartido = obtenerTiempoPartidoDesdeReproductor();
    const segundosPartido = Number(tiempoPartido?.segundos);
    const reviewSegundosActual = Number(tiempoPartido?.reviewSegundos);
    const marcador = Number.isFinite(reviewSegundosActual)
      ? calcularMarcadorEventos(reviewSegundosActual)
      : { equipo1: 0, equipo2: 0 };
    return {
      equipo1: marcador.equipo1,
      equipo2: marcador.equipo2,
      tiempo: Number.isFinite(segundosPartido) ? formatearSegundosVideo(segundosPartido) : '--:--',
      conectado: Number.isFinite(segundosPartido)
    };
  }

  function enviarScorebugPopupReview() {
    const payload = {
      source: 't5-review-main',
      type: 'scorebug',
      scorebug: obtenerEstadoScorebugReview(),
      updatedAt: Date.now()
    };

    if (reviewPopupWindow && !reviewPopupWindow.closed) {
      try {
        reviewPopupWindow.postMessage(payload, '*');
      } catch (error) {}
    }
    try {
      reviewPopupChannel?.postMessage(payload);
    } catch (error) {}
  }

  function aplicarVisibilidadScorebugReview(oculto, { persistir = true, enviar = true } = {}) {
    reviewScorebugOculto = !!oculto;
    const scorebug = document.getElementById('review-player-scoreboard');
    const frame = scorebug?.closest('.review-player-frame');
    const showButton = document.getElementById('review-player-score-show');
    const hideButton = document.getElementById('review-player-score-hide');

    if (frame) frame.classList.toggle('scoreboard-hidden', reviewScorebugOculto);
    if (showButton) showButton.classList.toggle('d-none', !reviewScorebugOculto);
    if (hideButton) hideButton.setAttribute('aria-pressed', reviewScorebugOculto ? 'true' : 'false');

    if (persistir) {
      try {
        localStorage.setItem(REVIEW_SCOREBUG_STORAGE_KEY, reviewScorebugOculto ? '1' : '0');
      } catch (error) {}
    }
    if (enviar) enviarScorebugPopupReview();
  }

  function actualizarScorebugReview({ enviar = true } = {}) {
    const estado = obtenerEstadoScorebugReview();
    const tiempoEl = document.getElementById('review-player-score-time');
    const equipo1El = document.getElementById('review-player-score-team-one');
    const equipo2El = document.getElementById('review-player-score-team-two');

    if (tiempoEl) tiempoEl.textContent = estado.tiempo;
    if (equipo1El) equipo1El.textContent = estado.equipo1;
    if (equipo2El) equipo2El.textContent = estado.equipo2;
    if (enviar) enviarScorebugPopupReview();
  }

  function inicializarScorebugReview() {
    if (document.body.dataset.reviewScorebugBound === '1') return;
    document.body.dataset.reviewScorebugBound = '1';

    try {
      reviewScorebugOculto = localStorage.getItem(REVIEW_SCOREBUG_STORAGE_KEY) === '1';
    } catch (error) {
      reviewScorebugOculto = false;
    }

    document.getElementById('review-player-score-hide')?.addEventListener('click', () => {
      aplicarVisibilidadScorebugReview(true);
    });
    document.getElementById('review-player-score-show')?.addEventListener('click', () => {
      aplicarVisibilidadScorebugReview(false);
    });

    aplicarVisibilidadScorebugReview(reviewScorebugOculto, { persistir: false, enviar: false });
    actualizarScorebugReview({ enviar: false });
  }

  function crearHtmlPopupReview({ reviewUrl, playlistUrl }) {
    const titulo = 'T5 Review Player';
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escaparHtmlPlano(titulo)}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #020617;
      color: #e5e7eb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: grid;
      grid-template-rows: auto 1fr auto;
    }
    header, footer {
      align-items: center;
      background: #0f172a;
      border-color: rgba(148, 163, 184, 0.2);
      display: flex;
      gap: 12px;
      justify-content: space-between;
      padding: 10px 14px;
    }
    header { border-bottom: 1px solid rgba(148, 163, 184, 0.2); }
    footer { border-top: 1px solid rgba(148, 163, 184, 0.2); }
    video {
      background: #000;
      display: block;
      height: 100%;
      transition: transform 120ms ease-out;
      width: 100%;
    }
    main {
      min-height: 0;
      overflow: hidden;
      position: relative;
    }
    main:fullscreen,
    main:-webkit-full-screen {
      background: #000;
      height: 100vh;
      width: 100vw;
    }
    main:fullscreen video,
    main:-webkit-full-screen video {
      height: 100%;
      object-fit: contain;
      width: 100%;
    }
    main:fullscreen .popup-scorebug-wrap,
    main:-webkit-full-screen .popup-scorebug-wrap,
    main:fullscreen .popup-scorebug-show,
    main:-webkit-full-screen .popup-scorebug-show {
      left: 16px;
      top: 16px;
      z-index: 20;
    }
    .brand {
      font-weight: 700;
      letter-spacing: 0;
    }
    .status {
      color: #a7f3d0;
      font-size: 13px;
    }
    a, button {
      background: #1e293b;
      border: 1px solid rgba(148, 163, 184, 0.32);
      border-radius: 6px;
      color: #e5e7eb;
      cursor: pointer;
      font: inherit;
      padding: 6px 10px;
      text-decoration: none;
    }
    button:hover, a:hover { background: #334155; }
    .popup-scorebug-wrap {
      align-items: center;
      display: flex;
      gap: 8px;
      left: 14px;
      pointer-events: none;
      position: absolute;
      top: 14px;
      z-index: 5;
    }
    .popup-scorebug {
      align-items: center;
      border-radius: 9px;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.36);
      display: flex;
      font-weight: 900;
      line-height: 1;
      overflow: hidden;
      pointer-events: auto;
      text-transform: uppercase;
    }
    .popup-scorebug-time {
      background: #f8fafc;
      color: #020617;
      min-width: 58px;
      padding: 8px 9px;
      text-align: center;
    }
    .popup-scorebug-team {
      align-items: center;
      background: #020617;
      color: #f8fafc;
      display: flex;
      gap: 5px;
      font-size: 13px;
      padding: 8px 9px;
    }
    .popup-scorebug-dot {
      background: #60a5fa;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
      height: 8px;
      width: 8px;
    }
    .popup-scorebug-team-two .popup-scorebug-dot { background: #fb7185; }
    .popup-scorebug-goals {
      background: #2dd4bf;
      color: #022c22;
      font-size: 18px;
      min-width: 34px;
      padding: 7px 8px;
      text-align: center;
    }
    .popup-scorebug-hide,
    .popup-scorebug-fullscreen,
    .popup-scorebug-show {
      background: rgba(2, 6, 23, 0.82);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      padding: 7px 9px;
      pointer-events: auto;
    }
    .popup-scorebug-show {
      display: none;
      left: 14px;
      position: absolute;
      top: 14px;
      z-index: 5;
    }
    main.scorebug-hidden .popup-scorebug-wrap { display: none; }
    main.scorebug-hidden .popup-scorebug-show { display: inline-flex; }
  </style>
</head>
<body>
  <header>
    <div class="brand">T5 Review Player</div>
    <div id="status" class="status">Cargando reproductor...</div>
    <a href="${escaparAtributoHtml(reviewUrl)}" target="_blank" rel="noopener noreferrer">Beelup original</a>
  </header>
  <main>
    <div id="popup-scorebug-wrap" class="popup-scorebug-wrap">
      <div class="popup-scorebug">
        <span id="popup-scorebug-time" class="popup-scorebug-time">--:--</span>
        <span class="popup-scorebug-team popup-scorebug-team-one"><span class="popup-scorebug-dot"></span>E1</span>
        <span id="popup-scorebug-team-one" class="popup-scorebug-goals">0</span>
        <span id="popup-scorebug-team-two" class="popup-scorebug-goals">0</span>
        <span class="popup-scorebug-team popup-scorebug-team-two">E2<span class="popup-scorebug-dot"></span></span>
      </div>
      <button type="button" id="popup-scorebug-hide" class="popup-scorebug-hide">Ocultar</button>
      <button type="button" id="popup-fullscreen" class="popup-scorebug-fullscreen">Pantalla</button>
    </div>
    <button type="button" id="popup-scorebug-show" class="popup-scorebug-show">Marcador</button>
    <video id="video" controls controlsList="nofullscreen" autoplay playsinline></video>
  </main>
  <footer>
    <span>El tiempo de este reproductor se sincroniza con el sandbox.</span>
    <button type="button" id="send-now">Enviar tiempo</button>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
  <script>
    const REVIEW_POPUP_CHANNEL = ${JSON.stringify(REVIEW_POPUP_CHANNEL)};
    const REVIEW_POPUP_STORAGE_KEY = ${JSON.stringify(REVIEW_POPUP_STORAGE_KEY)};
    const REVIEW_URL = ${JSON.stringify(reviewUrl)};
    const PLAYLIST_URL = ${JSON.stringify(playlistUrl)};
    const video = document.getElementById('video');
    const statusEl = document.getElementById('status');
    const mainEl = document.querySelector('main');
    const scorebugTimeEl = document.getElementById('popup-scorebug-time');
    const scorebugTeamOneEl = document.getElementById('popup-scorebug-team-one');
    const scorebugTeamTwoEl = document.getElementById('popup-scorebug-team-two');
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(REVIEW_POPUP_CHANNEL) : null;
    let zoom = 1;
    let scorebugHidden = false;

    try {
      video.setAttribute('controlsList', 'nofullscreen');
      video.controlsList && video.controlsList.add('nofullscreen');
    } catch (error) {}

    function formatTime(value) {
      const total = Math.max(0, Math.round(Number(value) || 0));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return minutes + ':' + String(seconds).padStart(2, '0');
    }

    function send(type, extra = {}) {
      const payload = {
        source: 't5-review-popup',
        type,
        url: REVIEW_URL,
        segundos: Number.isFinite(video.currentTime) ? video.currentTime : null,
        duracion: Number.isFinite(video.duration) ? video.duration : null,
        pausado: video.paused,
        updatedAt: Date.now(),
        ...extra
      };
      try { window.opener && window.opener.postMessage(payload, '*'); } catch (error) {}
      try { channel && channel.postMessage(payload); } catch (error) {}
      try { localStorage.setItem(REVIEW_POPUP_STORAGE_KEY, JSON.stringify(payload)); } catch (error) {}
      if (Number.isFinite(payload.segundos)) {
        statusEl.textContent = 'Sincronizado ' + formatTime(payload.segundos) + (payload.pausado ? ' - pausado' : '');
      }
    }

    function seek(deltaSeconds) {
      if (!Number.isFinite(video.currentTime)) return;
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      const next = Math.max(0, video.currentTime + deltaSeconds);
      video.currentTime = duration ? Math.min(duration, next) : next;
      send('time');
    }

    function seekTo(seconds) {
      const target = Math.max(0, Number(seconds));
      if (!Number.isFinite(target)) return;
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      video.currentTime = duration ? Math.min(duration, target) : target;
      send('time');
    }

    function setZoom(nextZoom, event) {
      zoom = Math.min(3, Math.max(1, Number(nextZoom) || 1));
      video.dataset.reviewZoom = String(zoom);
      video.style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')';
      if (event && zoom > 1) {
        const rect = video.getBoundingClientRect();
        const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
        video.style.transformOrigin = Math.min(100, Math.max(0, x)) + '% ' + Math.min(100, Math.max(0, y)) + '%';
      } else {
        video.style.transformOrigin = '';
      }
    }

    function setScorebugHidden(hidden) {
      scorebugHidden = !!hidden;
      mainEl && mainEl.classList.toggle('scorebug-hidden', scorebugHidden);
    }

    function updateScorebug(scorebug) {
      if (!scorebug) return;
      scorebugTimeEl.textContent = scorebug.tiempo || '--:--';
      scorebugTeamOneEl.textContent = Number.isFinite(Number(scorebug.equipo1)) ? String(scorebug.equipo1) : '0';
      scorebugTeamTwoEl.textContent = Number.isFinite(Number(scorebug.equipo2)) ? String(scorebug.equipo2) : '0';
    }

    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
    }

    function requestFullscreenElement(element) {
      const request = element && (element.requestFullscreen || element.webkitRequestFullscreen || element.msRequestFullscreen);
      if (!request) return Promise.reject(new Error('fullscreen unavailable'));
      return Promise.resolve(request.call(element));
    }

    function exitFullscreenDocument() {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (!exit) return Promise.resolve();
      return Promise.resolve(exit.call(document));
    }

    function updateFullscreenButton() {
      const button = document.getElementById('popup-fullscreen');
      const active = getFullscreenElement() === mainEl;
      if (button) button.textContent = active ? 'Salir' : 'Pantalla';
    }

    async function toggleFullscreen() {
      try {
        if (getFullscreenElement() === mainEl) {
          await exitFullscreenDocument();
        } else {
          await requestFullscreenElement(mainEl);
        }
      } catch (error) {}
      updateFullscreenButton();
    }

    function redirectVideoFullscreen() {
      if (getFullscreenElement() !== video || !mainEl || mainEl.dataset.fullscreenRedirecting === '1') return false;
      mainEl.dataset.fullscreenRedirecting = '1';
      const wasPlaying = !video.paused;
      exitFullscreenDocument()
        .then(function() { return requestFullscreenElement(mainEl); })
        .catch(function() {})
        .finally(function() {
          delete mainEl.dataset.fullscreenRedirecting;
          updateFullscreenButton();
          if (wasPlaying) video.play().catch(function() {});
        });
      return true;
    }

    function bindPlayerControls() {
      video.tabIndex = 0;
      let pointerInside = false;
      const isEditable = element => {
        const tag = element && element.tagName ? element.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'select' || tag === 'textarea' || (element && element.isContentEditable);
      };
      const handleArrows = event => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          event.stopImmediatePropagation();
          seek(-5);
          return true;
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          event.stopImmediatePropagation();
          seek(5);
          return true;
        }
        return false;
      };
      video.addEventListener('pointerenter', () => { pointerInside = true; });
      video.addEventListener('pointerleave', () => { pointerInside = false; });
      video.addEventListener('click', () => {
        try { video.focus({ preventScroll: true }); } catch (error) { video.focus(); }
      });
      video.addEventListener('keydown', event => {
        handleArrows(event);
      }, { capture: true });
      document.addEventListener('keydown', event => {
        if (isEditable(event.target)) return;
        if (document.activeElement !== video && !pointerInside) return;
        handleArrows(event);
      }, { capture: true });
      video.addEventListener('wheel', event => {
        event.preventDefault();
        setZoom(zoom + (event.deltaY < 0 ? 0.12 : -0.12), event);
      }, { passive: false });
    }

    function receiveCommand(data) {
      if (!data || data.source !== 't5-review-main') return;
      if (data.type === 'seek') seekTo(data.segundos);
      if (data.type === 'scorebug') updateScorebug(data.scorebug);
    }

    function fail(message) {
      statusEl.textContent = message;
      send('error', { message });
    }

    function init() {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = PLAYLIST_URL;
      } else if (window.Hls && window.Hls.isSupported()) {
        const hls = new window.Hls({ enableWorker: true });
        hls.loadSource(PLAYLIST_URL);
        hls.attachMedia(video);
        hls.on(window.Hls.Events.ERROR, function(_event, data) {
          if (data && data.fatal) fail('No se pudo cargar HLS: ' + data.type);
        });
      } else {
        fail('Este navegador no soporta HLS para el popup.');
        return;
      }

      ['loadedmetadata', 'timeupdate', 'play', 'pause', 'seeking', 'seeked', 'ratechange'].forEach(eventName => {
        video.addEventListener(eventName, () => send('time'));
      });
      document.getElementById('send-now').addEventListener('click', () => send('time'));
      document.getElementById('popup-scorebug-hide').addEventListener('click', () => setScorebugHidden(true));
      document.getElementById('popup-scorebug-show').addEventListener('click', () => setScorebugHidden(false));
      document.getElementById('popup-fullscreen').addEventListener('click', toggleFullscreen);
      ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function(eventName) {
        document.addEventListener(eventName, function() {
          if (!redirectVideoFullscreen()) updateFullscreenButton();
        });
      });
      window.addEventListener('message', event => receiveCommand(event.data));
      channel && channel.addEventListener('message', event => receiveCommand(event.data));
      window.addEventListener('beforeunload', () => send('closed'));
      bindPlayerControls();
      setInterval(() => send('time'), 750);
      send('ready');
    }

    init();
  </script>
</body>
</html>`;
  }

  function abrirPopupReviewSandbox() {
    inicializarCanalesPopupReview();

    const input = document.getElementById('review-link');
    const url = normalizarReviewUrl(input?.value);
    if (!url) {
      showToast('Ingresa un link valido de review.', 'warning');
      return;
    }

    if (input) input.value = url;
    const linkPartido = document.getElementById('youtube-link-partido');
    if (linkPartido && obtenerLinkYouTubeReview(url)) linkPartido.value = url;

    const datosBeelup = obtenerDatosBeelupDesdeUrl(url);
    if (!datosBeelup) {
      const popupExterno = window.open(url, 't5_review_player_external', 'popup=yes,width=1280,height=760,noopener,noreferrer');
      if (!popupExterno) showToast('El navegador bloqueo el popup.', 'warning');
      else showToast('Popup externo abierto. Solo los links Beelup sincronizan tiempo.', 'info');
      return;
    }

    const playlistUrl = crearUrlPlaylistBeelup(url, 'm3u8');
    reviewPopupWindow = window.open('about:blank', 't5_review_player', 'popup=yes,width=1280,height=760');
    if (!reviewPopupWindow) {
      showToast('El navegador bloqueo el popup.', 'warning');
      return;
    }

    try {
      reviewPopupWindow.document.open();
      reviewPopupWindow.document.write(crearHtmlPopupReview({ reviewUrl: url, playlistUrl }));
      reviewPopupWindow.document.close();
      reviewPopupWindow.focus();
      showToast('Popup de review abierto y sincronizando.', 'success');
      aplicarEstadoPopupReview({ source: 't5-review-popup', type: 'ready', url, pausado: true });
    } catch (error) {
      console.error('No se pudo abrir popup de review:', error);
      showToast('No se pudo preparar el popup de review.', 'error');
    }
  }

  function jsonParaScript(data) {
    return JSON.stringify(data).replace(/<\//g, '<\\/');
  }

  function obtenerEstadoAnotacionReview() {
    const jugadores = [...todosLosJugadores]
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(jugador => ({ id: jugador.id, nombre: jugador.nombre, equipo: obtenerEquipoJugadorActual(jugador.id) }));
    const jugadoresPartido = jugadoresDelPartidoActual()
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(jugador => ({ id: jugador.id, nombre: jugador.nombre, equipo: obtenerEquipoJugadorActual(jugador.id) }));
    const marcador = calcularMarcadorEventos();

    return {
      jugadores,
      jugadoresPartido,
      equipo1: equipo1.map(jugador => ({ id: jugador.id, nombre: jugador.nombre })),
      equipo2: equipo2.map(jugador => ({ id: jugador.id, nombre: jugador.nombre })),
      temporadas: todasLasTemporadas.map(temporada => ({ id: temporada.id, nombre: temporada.nombre })),
      partido: {
        fecha: document.getElementById('review-fecha')?.value || '',
        cancha: document.getElementById('review-cancha')?.value || '',
        temporadaId: document.getElementById('review-temporada')?.value || '',
        resultado: document.getElementById('review-resultado')?.value || `${marcador.equipo1}-${marcador.equipo2}`,
        ganador: document.getElementById('review-ganador')?.value || ''
      },
      marcador: `${marcador.equipo1} - ${marcador.equipo2}`,
      eventosCount: eventos.length,
      atajadasCount: reviewSandbox.atajadas.length,
      cagadasCount: reviewSandbox.cagadas.length,
      eventos: eventos.map((evento, index) => ({
        index,
        goleadorId: evento.goleador_id,
        goleadorNombre: obtenerNombreJugadorActual(evento.goleador_id),
        asistenciaId: evento.asistencia_id || '',
        asistenciaNombre: evento.asistencia_id ? obtenerNombreJugadorActual(evento.asistencia_id) : 'Sin asistencia',
        cagadaId: evento.cagada_id || '',
        cagadaNombre: evento.cagada_id ? obtenerNombreJugadorActual(evento.cagada_id) : 'Sin cagada',
        equipo: evento.equipo,
        esEnContra: !!evento.es_en_contra,
        minuto: evento.minuto,
        reviewSegundos: obtenerReviewSegundosDesdeEvento(evento, evento.minuto)
      })),
      atajadas: reviewSandbox.atajadas.map((item, index) => ({
        index,
        jugadorId: item.jugador_id,
        jugadorNombre: obtenerNombreJugadorActual(item.jugador_id),
        cantidad: Number(item.cantidad) || 0,
        minuto: item.minuto,
        reviewSegundos: obtenerReviewSegundosDesdeEvento(item, item.minuto)
      })),
      cagadas: reviewSandbox.cagadas.map((item, index) => ({
        index,
        jugadorId: item.jugador_id,
        jugadorNombre: obtenerNombreJugadorActual(item.jugador_id),
        cantidad: Number(item.cantidad) || 0,
        minuto: item.minuto,
        reviewSegundos: obtenerReviewSegundosDesdeEvento(item, item.minuto)
      })),
      mvpId: document.getElementById('review-mvp')?.value || '',
      aceId: document.getElementById('review-ace')?.value || '',
      inicio: {
        minuto: document.getElementById('review-inicio-minuto')?.value || '',
        segundo: document.getElementById('review-inicio-segundo')?.value || ''
      },
      sync: obtenerSyncAnotacionReview()
    };
  }

  function enviarEstadoAnotacionReview() {
    if (!reviewAnnotationWindow || reviewAnnotationWindow.closed) return;
    const payload = { source: 't5-review-main', type: 'state', state: obtenerEstadoAnotacionReview() };
    try { reviewAnnotationWindow.postMessage(payload, '*'); } catch (error) {}
    try { reviewAnnotationChannel?.postMessage(payload); } catch (error) {}
  }

  function crearHtmlPopupAnotacionReview(initialState) {
    return `<!doctype html>
<html lang="es" data-bs-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>T5 Review Datos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
  <style>
    :root {
      color-scheme: dark;
      --bs-dark: #0a0e27;
      --bs-dark-rgb: 10, 14, 39;
      --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      --shadow-soft: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      --shadow-glow: 0 0 20px rgba(102, 126, 234, 0.3);
    }
    * { box-sizing: border-box; }
    body {
      background: linear-gradient(135deg, #0a0e27 0%, #1a1a2e 50%, #16213e 100%);
      color: #e5e7eb;
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
    }
    .annotation-popup-shell {
      min-height: 100vh;
      padding: 1rem;
    }
    .annotation-modal {
      margin: 0 auto;
      max-width: 980px;
    }
    .annotation-modal-header {
      align-items: flex-start;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      gap: 1rem;
      justify-content: space-between;
      padding: 1rem 1rem 0.75rem;
      position: sticky;
      top: 0;
      z-index: 3;
    }
    .annotation-sync {
      color: #facc15;
      font-size: 0.82rem;
      margin-top: 0.25rem;
    }
    .enhanced-card {
      background: rgba(31, 41, 55, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: var(--shadow-soft);
      backdrop-filter: blur(10px);
    }
    .btn-enhanced {
      font-weight: 600;
      transition: all 0.3s ease;
    }
    .btn-enhanced:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    }
    .review-control-panel {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .review-section {
      background: rgba(15, 23, 42, 0.54);
      border: 1px solid rgba(148, 163, 184, 0.14);
      border-radius: 8px;
      padding: 0.95rem;
    }
    .review-section-title {
      align-items: center;
      color: #f8fafc;
      display: flex;
      font-size: 0.86rem;
      font-weight: 800;
      gap: 0.45rem;
      letter-spacing: 0;
      margin: 0 0 0.75rem;
    }
    .review-team-grid {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .review-team-box {
      background: rgba(2, 6, 23, 0.28);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 8px;
      min-height: 104px;
      padding: 0.75rem;
    }
    .review-team-title {
      font-size: 0.78rem;
      font-weight: 800;
      margin-bottom: 0.55rem;
    }
    .review-player-row,
    .review-event-row,
    .review-stat-row {
      align-items: center;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: #e2e8f0;
      display: flex;
      gap: 0.55rem;
      justify-content: space-between;
      padding: 0.48rem 0.6rem;
    }
    .review-event-row[data-review-seek-seconds],
    .review-stat-row[data-review-seek-seconds] {
      cursor: pointer;
    }
    .review-event-row[data-review-seek-seconds]:hover,
    .review-stat-row[data-review-seek-seconds]:hover {
      border-color: rgba(250, 204, 21, 0.34);
      background: rgba(250, 204, 21, 0.08);
    }
    .review-player-row + .review-player-row,
    .review-event-row + .review-event-row,
    .review-stat-row + .review-stat-row {
      margin-top: 0.45rem;
    }
    .review-event-list {
      max-height: 260px;
      overflow: auto;
    }
    .review-score {
      align-items: center;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.34), rgba(239, 68, 68, 0.28));
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      color: #fff;
      display: inline-flex;
      font-size: 1.2rem;
      font-weight: 900;
      justify-content: center;
      min-width: 88px;
      padding: 0.4rem 0.75rem;
    }
    .review-empty {
      color: rgba(226, 232, 240, 0.58);
      font-size: 0.85rem;
      padding: 0.35rem 0;
    }
    .form-control,
    .form-select {
      background-color: rgba(2, 6, 23, 0.72);
      border-color: rgba(148, 163, 184, 0.22);
      color: #f8fafc;
    }
    .form-control:focus,
    .form-select:focus {
      background-color: rgba(2, 6, 23, 0.92);
      border-color: rgba(102, 126, 234, 0.72);
      box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.18);
      color: #f8fafc;
    }
    .searchable-wrapper { position: relative; }
    .input-group > .searchable-wrapper { flex: 1 1 auto; min-width: 0; width: 1%; }
    .searchable-wrapper .searchable-native { display: none !important; }
    .searchable-dropdown {
      background: #020617;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 8px;
      box-shadow: var(--shadow-soft);
      display: none;
      left: 0;
      max-height: 220px;
      overflow: auto;
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      z-index: 1080;
    }
    .searchable-wrapper.is-open .searchable-dropdown { display: block; }
    .searchable-option { color: #e2e8f0; cursor: pointer; font-size: 0.88rem; padding: 0.48rem 0.65rem; }
    .searchable-option:hover,
    .searchable-option.is-active { background: rgba(102, 126, 234, 0.26); color: #fff; }
    .searchable-option.is-empty { color: rgba(226, 232, 240, 0.58); cursor: default; }
    @media (max-width: 768px) {
      .annotation-popup-shell { padding: 0.5rem; }
      .review-team-grid { grid-template-columns: 1fr; }
      .review-section .row > [class*="col-"] { margin-bottom: 0.35rem; }
    }
  </style>
</head>
<body>
  <main class="annotation-popup-shell">
    <div class="annotation-modal enhanced-card rounded-3">
      <div class="annotation-modal-header enhanced-card">
        <div>
          <h1 class="h5 text-white fw-bold mb-1"><i class="bi bi-ui-checks-grid me-2 text-warning"></i>Sandbox de Review</h1>
          <div id="sync" class="annotation-sync">Sin reproductor sincronizado</div>
          <div id="score" class="small text-light-emphasis mt-1"></div>
        </div>
        <button type="button" class="btn btn-outline-light btn-sm" onclick="window.close()" title="Cerrar">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div class="review-control-panel p-3">
        <div class="review-section">
          <h3 class="review-section-title"><i class="bi bi-clipboard-data text-info"></i>Datos del partido</h3>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label text-light small">Fecha</label>
              <input type="date" id="review-fecha" class="form-control form-control-sm">
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Cancha</label>
              <input type="text" id="review-cancha" class="form-control form-control-sm" placeholder="Cancha">
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Temporada</label>
              <select id="review-temporada" class="form-select form-select-sm">
                <option value="">Seleccionar temporada</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Resultado</label>
              <input type="text" id="review-resultado" class="form-control form-control-sm" placeholder="0-0">
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Ganador</label>
              <select id="review-ganador" class="form-select form-select-sm">
                <option value="">Seleccionar</option>
                <option value="1">Equipo 1</option>
                <option value="2">Equipo 2</option>
                <option value="0">Empate</option>
              </select>
            </div>
            <div class="col-md-4 d-flex align-items-end">
              <div id="review-marcador" class="review-score w-100">0 - 0</div>
            </div>
            <div class="col-md-8">
              <label class="form-label text-light small">Inicio partido en video</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text bg-dark border-secondary text-light">Min</span>
                <input type="number" id="review-inicio-minuto" class="form-control" min="0" max="999" placeholder="0">
                <span class="input-group-text bg-dark border-secondary text-light">Seg</span>
                <input type="number" id="review-inicio-segundo" class="form-control" min="0" max="59" placeholder="0">
              </div>
            </div>
          </div>
        </div>

        <div class="review-section">
          <h3 class="review-section-title"><i class="bi bi-people text-success"></i>Equipos</h3>
          <div class="input-group input-group-sm mb-3">
            <select id="review-jugador-select" class="form-select searchable-select">
              <option value="">Seleccionar jugador</option>
            </select>
            <button type="button" id="review-add-equipo1" class="btn btn-outline-primary" data-action="add-team" data-team="equipo1">Equipo 1</button>
            <button type="button" id="review-add-equipo2" class="btn btn-outline-danger" data-action="add-team" data-team="equipo2">Equipo 2</button>
          </div>
          <div class="review-team-grid">
            <div class="review-team-box">
              <div class="review-team-title text-primary">Equipo 1</div>
              <div id="review-equipo1-list"></div>
            </div>
            <div class="review-team-box">
              <div class="review-team-title text-danger">Equipo 2</div>
              <div id="review-equipo2-list"></div>
            </div>
          </div>
        </div>

        <div class="review-section">
          <h3 class="review-section-title"><i class="bi bi-star-fill text-warning"></i>Reconocimientos</h3>
          <div class="row g-2">
            <div class="col-md-6">
              <label class="form-label text-light small">MVP</label>
              <select id="review-mvp" class="form-select form-select-sm searchable-select">
                <option value="">Sin MVP</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label text-light small">ACE</label>
              <select id="review-ace" class="form-select form-select-sm searchable-select">
                <option value="">Sin ACE</option>
              </select>
            </div>
          </div>
        </div>

        <div class="review-section">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="review-section-title mb-0"><i class="bi bi-bullseye text-success"></i>Goles</h3>
            <span class="badge bg-secondary" id="review-event-count">0</span>
          </div>
          <div class="row g-2 align-items-end mb-3">
            <div class="col-md-4">
              <label class="form-label text-light small">Goleador</label>
              <select id="review-goleador" class="form-select form-select-sm searchable-select">
                <option value="">Goleador</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Asistencia</label>
              <select id="review-asistencia" class="form-select form-select-sm searchable-select">
                <option value="">Sin asistencia</option>
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Cagada</label>
              <select id="review-cagada-gol" class="form-select form-select-sm searchable-select">
                <option value="">Sin cagada</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Min</label>
              <input type="number" id="review-minuto" class="form-control form-control-sm" min="0" max="120" placeholder="0">
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Seg</label>
              <input type="number" id="review-segundo" class="form-control form-control-sm" min="0" max="59" placeholder="0">
            </div>
            <div class="col-md-4">
              <div class="form-check mt-3">
                <input class="form-check-input" type="checkbox" id="review-gol-contra">
                <label class="form-check-label text-light small" for="review-gol-contra">Gol en contra</label>
              </div>
            </div>
            <div class="col-md-4">
              <button type="button" id="review-add-gol" class="btn btn-success btn-sm w-100" data-action="add-goal">
                <i class="bi bi-plus me-1"></i>Agregar gol
              </button>
            </div>
          </div>
          <div id="review-eventos-list" class="review-event-list"></div>
        </div>

        <div class="review-section">
          <h3 class="review-section-title"><i class="bi bi-shield-check text-info"></i>Atajadas y cagadas</h3>
          <div class="small text-light-emphasis mb-2">
            Cada carga queda como jugada individual; el total por jugador se agrupa al guardar el partido.
          </div>
          <div class="row g-2 align-items-end">
            <div class="col-md-6">
              <label class="form-label text-light small">Atajadas</label>
              <select id="review-atajadas-jugador" class="form-select form-select-sm searchable-select">
                <option value="">Jugador</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Cant.</label>
              <input type="number" id="review-atajadas-cantidad" class="form-control form-control-sm" min="0" placeholder="0">
            </div>
            <div class="col-md-4">
              <button type="button" id="review-add-atajadas" class="btn btn-outline-info btn-sm w-100" data-action="add-stat" data-stat-type="atajadas">Agregar</button>
            </div>
            <div class="col-md-4">
              <label class="form-label text-light small">Cagadas</label>
              <select id="review-cagadas-jugador" class="form-select form-select-sm searchable-select">
                <option value="">Jugador</option>
              </select>
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Cant.</label>
              <input type="number" id="review-cagadas-cantidad" class="form-control form-control-sm" min="0" placeholder="0">
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Min</label>
              <input type="number" id="review-cagadas-minuto" class="form-control form-control-sm" min="0" max="120" placeholder="0">
            </div>
            <div class="col-md-2">
              <label class="form-label text-light small">Seg</label>
              <input type="number" id="review-cagadas-segundo" class="form-control form-control-sm" min="0" max="59" placeholder="0">
            </div>
            <div class="col-md-2">
              <button type="button" id="review-add-cagadas" class="btn btn-outline-danger btn-sm w-100" data-action="add-stat" data-stat-type="cagadas">Agregar</button>
            </div>
          </div>
          <div class="row g-2 mt-2">
            <div class="col-md-6">
              <div id="review-atajadas-list"></div>
            </div>
            <div class="col-md-6">
              <div id="review-cagadas-list"></div>
            </div>
          </div>
        </div>

        <button type="button" id="review-save-partido" class="btn btn-primary btn-lg btn-enhanced" data-action="save-match">
          <i class="bi bi-save me-2"></i>Guardar partido revisado
        </button>
      </div>
    </div>
  </main>
  <script>
    const CHANNEL = ${JSON.stringify(REVIEW_ANNOTATION_CHANNEL)};
    let state = ${jsonParaScript(initialState)};
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    const byId = id => document.getElementById(id);
    function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
    function options(items, placeholder, selected = '') { return '<option value="">' + escapeText(placeholder) + '</option>' + (items || []).map(item => '<option value="' + escapeText(item.id) + '"' + (String(item.id) === String(selected) ? ' selected' : '') + '>' + escapeText(item.nombre) + '</option>').join(''); }
    function searchableOptions(select) { return Array.from(select.options).map(option => ({ value: option.value, text: option.textContent.trim(), disabled: option.disabled })); }
    function syncSearchable(select) {
      const input = select?.closest('.searchable-wrapper')?.querySelector('.searchable-input');
      if (!select || !input) return;
      const text = input.value.trim().toLowerCase();
      const match = searchableOptions(select).find(option => option.value && option.text.toLowerCase() === text);
      if (match) select.value = match.value;
      else if (!text) select.value = '';
    }
    function renderSearchable(select) {
      const wrapper = select.closest('.searchable-wrapper');
      const input = wrapper?.querySelector('.searchable-input');
      const dropdown = wrapper?.querySelector('.searchable-dropdown');
      if (!wrapper || !input || !dropdown) return;
      const query = input.value.trim().toLowerCase();
      const filtered = searchableOptions(select).filter(option => option.value && !option.disabled && (!query || option.text.toLowerCase().includes(query))).slice(0, 50);
      if (!filtered.length) {
        dropdown.innerHTML = '<div class="searchable-option is-empty">Sin resultados</div>';
        wrapper.classList.add('is-open');
        return;
      }
      dropdown.innerHTML = filtered.map((option, index) => '<div class="searchable-option' + (index === 0 ? ' is-active' : '') + '" data-value="' + escapeText(option.value) + '">' + escapeText(option.text) + '</div>').join('');
      wrapper.classList.add('is-open');
    }
    function chooseSearchable(select, value) {
      const wrapper = select.closest('.searchable-wrapper');
      const input = wrapper?.querySelector('.searchable-input');
      const option = Array.from(select.options).find(item => item.value === value);
      if (!wrapper || !input || !option) return;
      select.value = value;
      input.value = option.textContent.trim();
      wrapper.classList.remove('is-open');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function updateSearchable(select, force = false) {
      const input = select.closest('.searchable-wrapper')?.querySelector('.searchable-input');
      if (!input || (!force && document.activeElement === input)) return;
      const option = Array.from(select.options).find(item => item.value === select.value);
      input.value = option && option.value ? option.textContent.trim() : '';
    }
    function initSearchableSelects(root = document) {
      root.querySelectorAll('select.searchable-select').forEach(select => {
        if (select.dataset.searchableBound !== '1') {
          select.dataset.searchableBound = '1';
          const wrapper = document.createElement('div');
          wrapper.className = 'searchable-wrapper';
          select.parentNode.insertBefore(wrapper, select);
          wrapper.appendChild(select);
          const input = document.createElement('input');
          input.type = 'text';
          input.autocomplete = 'off';
          input.className = 'searchable-input ' + (select.classList.contains('form-select-sm') ? 'form-control form-control-sm' : 'form-control');
          input.placeholder = select.options[0]?.textContent?.trim() || 'Buscar';
          const dropdown = document.createElement('div');
          dropdown.className = 'searchable-dropdown';
          wrapper.insertBefore(input, select);
          wrapper.appendChild(dropdown);
          select.classList.add('searchable-native');
          input.addEventListener('focus', () => renderSearchable(select));
          input.addEventListener('input', () => { syncSearchable(select); renderSearchable(select); });
          input.addEventListener('keydown', event => {
            const opts = Array.from(dropdown.querySelectorAll('.searchable-option:not(.is-empty)'));
            const active = dropdown.querySelector('.searchable-option.is-active');
            const activeIndex = Math.max(0, opts.indexOf(active));
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (!wrapper.classList.contains('is-open')) renderSearchable(select);
              const next = event.key === 'ArrowDown' ? Math.min(opts.length - 1, activeIndex + 1) : Math.max(0, activeIndex - 1);
              opts.forEach(option => option.classList.remove('is-active'));
              opts[next]?.classList.add('is-active');
              opts[next]?.scrollIntoView({ block: 'nearest' });
            }
            if (event.key === 'Enter') {
              const option = dropdown.querySelector('.searchable-option.is-active:not(.is-empty)');
              if (option) { event.preventDefault(); chooseSearchable(select, option.dataset.value); }
            }
            if (event.key === 'Escape') wrapper.classList.remove('is-open');
          });
          dropdown.addEventListener('mousedown', event => {
            const option = event.target.closest('.searchable-option:not(.is-empty)');
            if (!option) return;
            event.preventDefault();
            chooseSearchable(select, option.dataset.value);
          });
          select.addEventListener('change', () => updateSearchable(select, true));
        }
        updateSearchable(select);
        if (select.closest('.searchable-wrapper')?.classList.contains('is-open')) renderSearchable(select);
      });
    }
    document.addEventListener('mousedown', event => {
      document.querySelectorAll('.searchable-wrapper.is-open').forEach(wrapper => {
        if (!wrapper.contains(event.target)) wrapper.classList.remove('is-open');
      });
    });
    function fmt(seconds) { if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return '--'; const total = Math.max(0, Math.round(Number(seconds))); return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0'); }
    function fmtMinuto(minuto) { if (minuto === null || minuto === undefined || minuto === '') return '--'; const value = Number(minuto) || 0; const mins = Math.floor(value); const secs = Math.round((value - mins) * 60); return secs > 0 ? mins + ':' + String(secs).padStart(2, '0') : mins + \"'\"; }
    let messageSeq = 0;
    function send(action, payload = {}) { const message = { source: 't5-review-annotation-popup', messageId: 'ann-' + Date.now() + '-' + (++messageSeq) + '-' + Math.random().toString(36).slice(2), action, payload }; try { window.opener && window.opener.postMessage(message, '*'); } catch (error) {} try { channel && channel.postMessage(message); } catch (error) {} try { localStorage.setItem(${JSON.stringify(REVIEW_ANNOTATION_STORAGE_KEY)}, JSON.stringify(message)); } catch (error) {} }
    function current(id) { const el = byId(id); if (el?.matches?.('select.searchable-select')) syncSearchable(el); return el?.value || ''; }
    function setValueIfNotFocused(id, value) { const el = byId(id); if (el && document.activeElement !== el) el.value = value || ''; }
    function renderSync(sync = state.sync || {}) { byId('sync').textContent = sync.conectado ? ('Video ' + fmt(sync.video) + ' | Partido ' + fmt(sync.partido) + (sync.pausado ? ' | pausado' : '')) : 'Sin reproductor sincronizado'; }
    function collectMatchData() {
      return {
        fecha: current('review-fecha'),
        cancha: current('review-cancha'),
        temporadaId: current('review-temporada'),
        resultado: current('review-resultado'),
        ganador: current('review-ganador'),
        inicioMinuto: current('review-inicio-minuto'),
        inicioSegundo: current('review-inicio-segundo'),
        mvpId: current('review-mvp'),
        aceId: current('review-ace')
      };
    }
    let syncTimer = null;
    function queueMatchSync() {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => send('sync-match-data', collectMatchData()), 120);
    }
    function renderEquipo(id, team, teamName) {
      const el = byId(id);
      if (!el) return;
      if (!team || !team.length) {
        el.innerHTML = '<div class="review-empty">Sin jugadores</div>';
        return;
      }
      el.innerHTML = team.map((jugador, index) => '<div class="review-player-row"><span class="text-truncate">' + escapeText(jugador.nombre) + '</span><button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-player" data-team="' + teamName + '" data-index="' + index + '" title="Quitar"><i class="bi bi-x"></i></button></div>').join('');
    }
    function renderEventos() {
      const list = byId('review-eventos-list');
      byId('review-event-count').textContent = String(state.eventosCount || 0);
      if (!list) return;
      if (!state.eventos || !state.eventos.length) {
        list.innerHTML = '<div class="review-empty">Sin goles cargados</div>';
        return;
      }
      list.innerHTML = state.eventos.map((evento, index) => {
        const seek = Number.isFinite(Number(evento.reviewSegundos)) ? ' data-action="seek-event" data-seek-seconds="' + escapeText(Math.max(0, Math.round(Number(evento.reviewSegundos)))) + '" role="button" tabindex="0" title="Ir al minuto ' + escapeText(fmt(evento.reviewSegundos)) + '"' : '';
        return '<div class="review-event-row"' + seek + '><div class="min-w-0"><div class="fw-bold text-white">' + (index + 1) + '. ' + escapeText(evento.goleadorNombre) + '</div><div class="small text-light-emphasis">Partido ' + escapeText(fmtMinuto(evento.minuto)) + ' - Minuto ' + escapeText(fmt(evento.reviewSegundos)) + ' - ' + escapeText(evento.asistenciaNombre) + ' - ' + escapeText(evento.cagadaNombre) + '</div></div><div class="d-flex align-items-center gap-2"><span class="badge ' + (Number(evento.equipo) === 1 ? 'bg-primary' : 'bg-danger') + '">E' + escapeText(evento.equipo) + '</span>' + (evento.esEnContra ? '<span class="badge bg-warning text-dark">EC</span>' : '') + '<button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-event" data-index="' + index + '" title="Quitar gol"><i class="bi bi-trash"></i></button></div></div>';
      }).join('');
    }
    function renderStats(tipo) {
      const list = byId(tipo === 'atajadas' ? 'review-atajadas-list' : 'review-cagadas-list');
      const items = state[tipo] || [];
      if (!list) return;
      if (!items.length) {
        list.innerHTML = '<div class="review-empty">Sin ' + tipo + '</div>';
        return;
      }
      list.innerHTML = items.map((item, index) => {
        const seek = tipo === 'atajadas' && Number.isFinite(Number(item.reviewSegundos)) ? ' data-action="seek-stat" data-seek-seconds="' + escapeText(Math.max(0, Math.round(Number(item.reviewSegundos)))) + '" role="button" tabindex="0" title="Ir al minuto ' + escapeText(fmt(item.reviewSegundos)) + '"' : '';
        return '<div class="review-stat-row"' + seek + '><div class="min-w-0"><div class="text-truncate">' + escapeText(item.jugadorNombre) + '</div><div class="small text-light-emphasis">Partido ' + escapeText(fmtMinuto(item.minuto)) + ' - Minuto ' + escapeText(fmt(item.reviewSegundos)) + '</div></div><span class="d-flex align-items-center gap-2"><strong>' + escapeText(item.cantidad) + '</strong><button type="button" class="btn btn-sm btn-outline-danger" data-action="remove-stat" data-stat-type="' + tipo + '" data-index="' + index + '" title="Quitar"><i class="bi bi-x"></i></button></span></div>';
      }).join('');
    }
    function render() {
      const available = (state.jugadores || []).filter(j => !j.equipo);
      const partido = state.jugadoresPartido || [];
      const selected = {
        player: current('review-jugador-select'),
        goal: current('review-goleador'),
        assist: current('review-asistencia'),
        mistake: current('review-cagada-gol'),
        save: current('review-atajadas-jugador'),
        mistakeStat: current('review-cagadas-jugador')
      };
      byId('review-jugador-select').innerHTML = options(available, 'Seleccionar jugador', selected.player);
      byId('review-goleador').innerHTML = options(partido, 'Goleador', selected.goal);
      byId('review-asistencia').innerHTML = options(partido, 'Sin asistencia', selected.assist);
      byId('review-cagada-gol').innerHTML = options(partido, 'Sin cagada', selected.mistake);
      byId('review-atajadas-jugador').innerHTML = options(partido, 'Jugador', selected.save);
      byId('review-cagadas-jugador').innerHTML = options(partido, 'Jugador', selected.mistakeStat);
      byId('review-mvp').innerHTML = options(partido, 'Sin MVP', state.mvpId || '');
      byId('review-ace').innerHTML = options(partido, 'Sin ACE', state.aceId || '');
      byId('review-temporada').innerHTML = options(state.temporadas || [], 'Seleccionar temporada', state.partido?.temporadaId || '');
      setValueIfNotFocused('review-fecha', state.partido?.fecha || '');
      setValueIfNotFocused('review-cancha', state.partido?.cancha || '');
      setValueIfNotFocused('review-resultado', state.partido?.resultado || '');
      setValueIfNotFocused('review-ganador', state.partido?.ganador || '');
      setValueIfNotFocused('review-inicio-minuto', state.inicio?.minuto || '');
      setValueIfNotFocused('review-inicio-segundo', state.inicio?.segundo || '');
      byId('review-marcador').textContent = state.marcador || '0 - 0';
      renderEquipo('review-equipo1-list', state.equipo1 || [], 'equipo1');
      renderEquipo('review-equipo2-list', state.equipo2 || [], 'equipo2');
      renderEventos();
      renderStats('atajadas');
      renderStats('cagadas');
      initSearchableSelects(document);
      byId('score').textContent = 'Marcador ' + (state.marcador || '0 - 0') + ' | Goles ' + (state.eventosCount || 0) + ' | Atajadas ' + (state.atajadasCount || 0) + ' | Cagadas ' + (state.cagadasCount || 0);
      renderSync();
    }
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      const action = target?.dataset?.action;
      if (!action) return;
      if (action === 'seek-event' || action === 'seek-stat') {
        send('seek', { segundos: Number(target.dataset.seekSeconds) });
        return;
      }
      if (action === 'add-team') send('add-team', { team: target.dataset.team, jugadorId: current('review-jugador-select') });
      if (action === 'add-goal') send('add-goal', { matchData: collectMatchData(), goleadorId: current('review-goleador'), asistenciaId: current('review-asistencia'), cagadaId: current('review-cagada-gol'), minuto: current('review-minuto'), segundo: current('review-segundo'), golEnContra: byId('review-gol-contra').checked });
      if (action === 'add-stat') {
        const tipo = target.dataset.statType === 'cagadas' ? 'cagadas' : 'atajadas';
        send('add-stat', {
          matchData: collectMatchData(),
          tipo,
          jugadorId: current(tipo === 'atajadas' ? 'review-atajadas-jugador' : 'review-cagadas-jugador'),
          cantidad: current(tipo === 'atajadas' ? 'review-atajadas-cantidad' : 'review-cagadas-cantidad'),
          minuto: tipo === 'atajadas' ? '' : current('review-cagadas-minuto'),
          segundo: tipo === 'atajadas' ? '' : current('review-cagadas-segundo')
        });
      }
      if (action === 'remove-player') send('remove-player', { team: target.dataset.team, index: Number(target.dataset.index) });
      if (action === 'remove-event') send('remove-event', { index: Number(target.dataset.index) });
      if (action === 'remove-stat') send('remove-stat', { tipo: target.dataset.statType, index: Number(target.dataset.index) });
      if (action === 'save-match') send('save-match', { matchData: collectMatchData() });
    });
    ['review-fecha', 'review-cancha', 'review-temporada', 'review-resultado', 'review-ganador', 'review-inicio-minuto', 'review-inicio-segundo'].forEach(id => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener('input', queueMatchSync);
      el.addEventListener('change', queueMatchSync);
    });
    byId('review-mvp').addEventListener('change', () => send('set-recognition', { ...collectMatchData(), tipo: 'mvp', jugadorId: current('review-mvp') }));
    byId('review-ace').addEventListener('change', () => send('set-recognition', { ...collectMatchData(), tipo: 'ace', jugadorId: current('review-ace') }));
    function receive(data) { if (!data || data.source !== 't5-review-main') return; if (data.type === 'state') { state = data.state || state; render(); } if (data.type === 'sync') { state.sync = data.sync || state.sync; renderSync(state.sync); } }
    window.addEventListener('message', event => receive(event.data));
    channel && channel.addEventListener('message', event => receive(event.data));
    window.addEventListener('load', () => send('request-state'));
    render();
  </script>
</body>
</html>`;
  }

  async function manejarMensajeAnotacionReview(data) {
    if (!data || data.source !== 't5-review-annotation-popup') return;
    if (debeIgnorarMensajeAnotacionReview(data)) return;
    const payload = data.payload || {};
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    const aplicarDatosPartido = (datos = {}) => {
      setValue('review-fecha', datos.fecha);
      setValue('review-cancha', datos.cancha);
      setValue('review-temporada', datos.temporadaId);
      setValue('review-resultado', datos.resultado);
      setValue('review-ganador', datos.ganador);
      setValue('review-inicio-minuto', datos.inicioMinuto);
      setValue('review-inicio-segundo', datos.inicioSegundo);
      setValue('review-mvp', datos.mvpId);
      setValue('review-ace', datos.aceId);
      actualizarEstadoPopupReview();
    };

    try {
      if (data.action === 'request-state') {
        enviarEstadoAnotacionReview();
        return;
      }
      if (data.action === 'sync-match-data') {
        aplicarDatosPartido(payload);
      }
      if (data.action === 'seek') {
        buscarEnReproductorReviewA(payload.segundos);
        return;
      }
      if (data.action === 'add-team') {
        await agregarJugadorAEquipoDesdeId(payload.team, payload.jugadorId);
      }
      if (data.action === 'set-start-offset') {
        setValue('review-inicio-minuto', payload.minuto);
        setValue('review-inicio-segundo', payload.segundo);
        actualizarEstadoPopupReview();
      }
      if (data.action === 'add-goal') {
        if (payload.matchData) aplicarDatosPartido(payload.matchData);
        setValue('review-goleador', payload.goleadorId);
        setValue('review-asistencia', payload.asistenciaId);
        setValue('review-cagada-gol', payload.cagadaId);
        setValue('review-minuto', payload.minuto);
        setValue('review-segundo', payload.segundo);
        const golContra = document.getElementById('review-gol-contra');
        if (golContra) golContra.checked = !!payload.golEnContra;
        agregarEventoReviewSandbox();
      }
      if (data.action === 'add-stat') {
        if (payload.matchData) aplicarDatosPartido(payload.matchData);
        const tipo = payload.tipo === 'cagadas' ? 'cagadas' : 'atajadas';
        setValue(tipo === 'atajadas' ? 'review-atajadas-jugador' : 'review-cagadas-jugador', payload.jugadorId);
        setValue(tipo === 'atajadas' ? 'review-atajadas-cantidad' : 'review-cagadas-cantidad', payload.cantidad);
        if (tipo === 'cagadas') {
          setValue('review-cagadas-minuto', payload.minuto);
          setValue('review-cagadas-segundo', payload.segundo);
        }
        agregarStatReview(tipo);
      }
      if (data.action === 'set-recognition') {
        aplicarDatosPartido(payload);
        setValue(payload.tipo === 'ace' ? 'review-ace' : 'review-mvp', payload.jugadorId);
      }
      if (data.action === 'remove-player') {
        quitarJugadorDesdeReview(payload.team, Number(payload.index));
      }
      if (data.action === 'remove-event') {
        eventos.splice(Number(payload.index), 1);
        renderizarTablaGoles();
        actualizarMarcadorAutomatico();
      }
      if (data.action === 'remove-stat') {
        const tipo = payload.tipo === 'cagadas' ? 'cagadas' : 'atajadas';
        reviewSandbox[tipo].splice(Number(payload.index), 1);
      }
      if (data.action === 'save-match') {
        if (payload.matchData) aplicarDatosPartido(payload.matchData);
        await guardarPartidoReviewSandbox();
      }
    } finally {
      renderizarReviewSandbox();
      enviarEstadoAnotacionReview();
    }
  }

  function abrirPopupAnotacionReview() {
    inicializarCanalesPopupReview();
    reviewAnnotationWindow = window.open('about:blank', 't5_review_annotation', 'popup=yes,width=520,height=840');
    if (!reviewAnnotationWindow) {
      showToast('El navegador bloqueo el popup de datos.', 'warning');
      return;
    }
    try {
      reviewAnnotationWindow.document.open();
      reviewAnnotationWindow.document.write(crearHtmlPopupAnotacionReview(obtenerEstadoAnotacionReview()));
      reviewAnnotationWindow.document.close();
      reviewAnnotationWindow.focus();
      setTimeout(enviarEstadoAnotacionReview, 250);
      showToast('Popup de datos abierto.', 'success');
    } catch (error) {
      console.error('No se pudo abrir popup de datos:', error);
      showToast('No se pudo preparar el popup de datos.', 'error');
    }
  }

  function debeIgnorarMensajeAnotacionReview(data) {
    const now = Date.now();
    const payload = data?.payload || {};
    let key = data?.messageId ? `id:${data.messageId}` : '';

    if (!key) {
      try {
        key = `legacy:${data?.action || ''}:${JSON.stringify(payload)}`;
      } catch (error) {
        key = `legacy:${data?.action || ''}:${now}`;
      }
    }

    const procesadoEn = reviewAnnotationMensajesProcesados.get(key);
    if (procesadoEn && now - procesadoEn < 5000) {
      return true;
    }

    reviewAnnotationMensajesProcesados.set(key, now);
    if (reviewAnnotationMensajesProcesados.size > 300) {
      const limite = now - 30000;
      for (const [id, timestamp] of reviewAnnotationMensajesProcesados) {
        if (timestamp < limite || reviewAnnotationMensajesProcesados.size > 300) {
          reviewAnnotationMensajesProcesados.delete(id);
        }
      }
    }

    return false;
  }

  async function cargarLinkReviewSandbox() {
    const input = document.getElementById('review-link');
    const iframe = document.getElementById('review-player-frame');
    const url = normalizarReviewUrl(input?.value);

    if (!url) {
      showToast('Ingresa un link valido de review.', 'warning');
      return;
    }

    if (input) input.value = url;
    const esBeelup = !!obtenerDatosBeelupDesdeUrl(url);
    if (esBeelup) {
      try {
        await cargarReproductorInlineBeelup(url);
      } catch (error) {
        console.error('No se pudo cargar reproductor inline:', error);
        showToast('No se pudo cargar el reproductor sincronizado. Uso iframe externo.', 'warning');
        limpiarReproductorInline();
        if (iframe) {
          iframe.classList.remove('d-none');
          iframe.src = url;
        }
      }
    } else {
      limpiarReproductorInline();
      if (iframe) {
        iframe.classList.remove('d-none');
        iframe.src = url;
      }
    }

    const linkPartido = document.getElementById('youtube-link-partido');
    if (linkPartido && obtenerLinkYouTubeReview(url)) linkPartido.value = url;
    renderizarCompiladoReviewSandbox();
    actualizarScorebugReview();
  }

  function abrirLinkReviewSandbox() {
    const input = document.getElementById('review-link');
    const url = normalizarReviewUrl(input?.value);
    if (!url) {
      showToast('Ingresa un link valido de review.', 'warning');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function poblarSelectReview(selectorId, jugadores, placeholder, { includeEmpty = true } = {}) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;

    const valorActual = selector.value;
    const opciones = [];
    if (includeEmpty) {
      opciones.push(`<option value="">${escaparHtmlPlano(placeholder)}</option>`);
    }

    jugadores.forEach(jugador => {
      const equipo = obtenerEquipoJugadorActual(jugador.id);
      const prefijo = equipo === 1 ? 'Equipo 1 - ' : equipo === 2 ? 'Equipo 2 - ' : '';
      opciones.push(`<option value="${escaparAtributoHtml(jugador.id)}">${escaparHtmlPlano(prefijo + jugador.nombre)}</option>`);
    });

    selector.innerHTML = opciones.join('');
    if (valorActual && Array.from(selector.options).some(option => option.value === valorActual)) {
      selector.value = valorActual;
    }
  }

  function poblarTemporadasReviewSandbox() {
    const selector = document.getElementById('review-temporada');
    if (!selector) return;

    const valorActual = selector.value || document.getElementById('temporada-partido')?.value || '';
    selector.innerHTML = '<option value="">Seleccionar temporada</option>';
    todasLasTemporadas.forEach(temporada => {
      selector.innerHTML += `<option value="${escaparAtributoHtml(temporada.id)}">${escaparHtmlPlano(temporada.nombre)}</option>`;
    });

    if (valorActual && Array.from(selector.options).some(option => option.value === String(valorActual))) {
      selector.value = String(valorActual);
    }
  }

  function formatearTiempoReview(minuto) {
    if (minuto === null || minuto === undefined) return '--';
    const mins = Math.floor(Number(minuto) || 0);
    const secs = Math.round(((Number(minuto) || 0) - mins) * 60);
    return secs > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${mins}'`;
  }

  function obtenerEnteroNoNegativoDesdeInput(id, maximo = null) {
    const input = document.getElementById(id);
    const valor = Number(input?.value);
    if (!Number.isFinite(valor) || valor < 0) return 0;
    const entero = Math.floor(valor);
    return Number.isFinite(maximo) ? Math.min(entero, maximo) : entero;
  }

  function obtenerTiempoPartidoDesdeInputs(minutoId, segundoId) {
    const minutoInput = document.getElementById(minutoId);
    const segundoInput = document.getElementById(segundoId);
    const tieneMinuto = minutoInput && String(minutoInput.value).trim() !== '';
    const tieneSegundo = segundoInput && String(segundoInput.value).trim() !== '';

    if (!tieneMinuto && !tieneSegundo) {
      const tiempoSincronizado = obtenerTiempoPartidoDesdeReproductor();
      return tiempoSincronizado || {
        minuto: null,
        segundos: null
      };
    }

    const minutos = obtenerEnteroNoNegativoDesdeInput(minutoId);
    const segundos = obtenerEnteroNoNegativoDesdeInput(segundoId, 59);
    const segundosTotales = (minutos * 60) + segundos;

    return {
      minuto: segundosTotales / 60,
      segundos: segundosTotales,
      reviewSegundos: calcularReviewSegundosDesdeMinuto(segundosTotales / 60)
    };
  }

  function obtenerReviewInicioSegundos() {
    const minutos = obtenerEnteroNoNegativoDesdeInput('review-inicio-minuto');
    const segundos = obtenerEnteroNoNegativoDesdeInput('review-inicio-segundo', 59);
    return (minutos * 60) + segundos;
  }

  function calcularReviewSegundosDesdeMinuto(minutoPartido, inicioReviewSegundos = obtenerReviewInicioSegundos()) {
    if (minutoPartido === null || minutoPartido === undefined) return null;
    const minutoNumerico = Number(minutoPartido);
    if (!Number.isFinite(minutoNumerico)) return null;
    return Math.max(0, Math.round(inicioReviewSegundos + (minutoNumerico * 60)));
  }

  function obtenerReviewSegundosDesdeEvento(item, minutoPartido = item?.minuto) {
    const directo = Number(item?.review_segundos ?? item?.reviewSegundos);
    if (Number.isFinite(directo)) return Math.max(0, Math.round(directo));
    return calcularReviewSegundosDesdeMinuto(minutoPartido);
  }

  function formatearSegundosVideo(segundosTotales) {
    if (segundosTotales === null || segundosTotales === undefined) return '--';
    const total = Math.max(0, Math.round(Number(segundosTotales) || 0));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundos = total % 60;

    if (horas > 0) {
      return `${horas}:${String(minutos).padStart(2, '0')}:${String(segundos).padStart(2, '0')}`;
    }

    return `${minutos}:${String(segundos).padStart(2, '0')}`;
  }

  function limpiarInputsTiempoReview(ids) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function agruparMetricasReview(items) {
    const acumulado = new Map();
    items.forEach(item => {
      if (!item?.jugador_id) return;
      const key = String(item.jugador_id);
      const actual = acumulado.get(key) || { jugador_id: item.jugador_id, cantidad: 0 };
      actual.cantidad += Number(item.cantidad) || 0;
      acumulado.set(key, actual);
    });
    return Array.from(acumulado.values()).filter(item => item.cantidad > 0);
  }

  function obtenerUmbralAtajadasCompilado(id = 'review-compilado-atajadas-min') {
    const valor = Number(document.getElementById(id)?.value);
    return valor === 5 ? 5 : 3;
  }

  function normalizarOpcionesCompilado(opciones = {}) {
    const valor = Number(opciones.atajadasMinimas ?? obtenerUmbralAtajadasCompilado());
    return {
      atajadasMinimas: valor === 5 ? 5 : 3
    };
  }

  function obtenerConfigCompilado(tipo, cantidad = 1, opciones = {}) {
    const cantidadNumerica = Number(cantidad) || 0;
    const { atajadasMinimas } = normalizarOpcionesCompilado(opciones);
    const configs = {
      gol: {
        incluir: true,
        pre: 10,
        post: 5,
        etiqueta: 'Gol',
        badgeClass: 'bg-success'
      },
      atajadas: {
        incluir: cantidadNumerica >= atajadasMinimas,
        pre: 5,
        post: 5,
        etiqueta: atajadasMinimas === 5 ? 'Atajada 5' : 'Atajada 3+',
        badgeClass: 'bg-info text-dark'
      },
      cagada: {
        incluir: true,
        pre: 5,
        post: 5,
        etiqueta: 'Cagada',
        badgeClass: 'bg-danger'
      },
      cagada_gol: {
        incluir: true,
        pre: 5,
        post: 5,
        etiqueta: 'Cagada en gol',
        badgeClass: 'bg-danger'
      }
    };

    return configs[tipo] || {
      incluir: false,
      pre: 0,
      post: 0,
      etiqueta: tipo || 'Evento',
      badgeClass: 'bg-secondary'
    };
  }

  function crearClipCompilado({ tipo, jugadorId, jugadorNombre, cantidad = 1, minutoPartido = null, reviewSegundos = null, metadata = {}, sourceKey = '', opcionesCompilado = {} }) {
    const config = obtenerConfigCompilado(tipo, cantidad, opcionesCompilado);
    const reviewExacto = Number(reviewSegundos);

    if (!config.incluir || !Number.isFinite(reviewExacto)) {
      return null;
    }

    const exacto = Math.max(0, Math.round(reviewExacto));
    const inicio = Math.max(0, exacto - config.pre);
    const fin = exacto + config.post;

    return {
      tipo,
      etiqueta: config.etiqueta,
      badgeClass: config.badgeClass,
      jugadorId: jugadorId || null,
      jugadorNombre: jugadorNombre || (jugadorId ? obtenerNombreJugadorActual(jugadorId) : 'Evento'),
      cantidad: Number(cantidad) || 1,
      minutoPartido,
      reviewSegundos: exacto,
      inicio,
      fin,
      duracion: Math.max(0, fin - inicio),
      pre: config.pre,
      post: config.post,
      metadata: metadata || {},
      sourceKey: sourceKey || `${tipo}-${jugadorId || 'sin-jugador'}-${exacto}`
    };
  }

  function ordenarClipsCompilado(clips) {
    return [...clips].sort((a, b) => {
      if (a.reviewSegundos !== b.reviewSegundos) return a.reviewSegundos - b.reviewSegundos;
      return String(a.etiqueta).localeCompare(String(b.etiqueta));
    });
  }

  function deduplicarClipsCompilado(clips) {
    const golesPorSegundo = new Set(
      clips
        .filter(clip => clip.tipo === 'gol')
        .map(clip => `${clip.reviewSegundos}-${clip.metadata?.orden || ''}`)
    );

    return clips.filter(clip => {
      if (clip.tipo !== 'cagada_gol') return true;
      return !golesPorSegundo.has(`${clip.reviewSegundos}-${clip.metadata?.orden || ''}`);
    });
  }

  function obtenerReviewSegundosCompilado(item) {
    const directo = Number(item?.review_segundos ?? item?.reviewSegundos ?? item?.metadata?.review_segundos);
    if (Number.isFinite(directo)) return Math.max(0, Math.round(directo));

    const minutoPartido = item?.minuto ?? item?.minuto_partido ?? item?.minutoPartido;
    return calcularReviewSegundosDesdeMinuto(minutoPartido);
  }

  function obtenerMinutoPartidoCompilado(item) {
    const minuto = Number(item?.minuto ?? item?.minuto_partido ?? item?.minutoPartido);
    return Number.isFinite(minuto) ? minuto : null;
  }

  function construirMarcadorMetadata(equipo1Goles = 0, equipo2Goles = 0) {
    const local = Math.max(0, Number(equipo1Goles) || 0);
    const visitante = Math.max(0, Number(equipo2Goles) || 0);
    return {
      marcador_equipo1: local,
      marcador_equipo2: visitante,
      marcador_texto: `${local} - ${visitante}`
    };
  }

  function calcularMarcadorHastaCompilado(reviewSegundos, minutoPartido = null, golesFuente = eventos) {
    const limiteReview = Number(reviewSegundos);
    const limiteMinuto = Number(minutoPartido);
    const marcador = { equipo1: 0, equipo2: 0 };

    (golesFuente || []).forEach(evento => {
      if (evento?.tipo && evento.tipo !== 'gol') return;

      const equipo = Number(evento?.equipo ?? evento?.metadata?.equipo);
      if (equipo !== 1 && equipo !== 2) return;

      const eventoReview = obtenerReviewSegundosCompilado(evento);
      const eventoMinuto = obtenerMinutoPartidoCompilado(evento);
      let incluir = false;

      if (Number.isFinite(limiteReview) && Number.isFinite(eventoReview)) {
        incluir = eventoReview <= limiteReview;
      } else if (Number.isFinite(limiteMinuto) && Number.isFinite(eventoMinuto)) {
        incluir = eventoMinuto <= limiteMinuto;
      }

      if (!incluir) return;
      if (equipo === 1) marcador.equipo1 += 1;
      if (equipo === 2) marcador.equipo2 += 1;
    });

    return construirMarcadorMetadata(marcador.equipo1, marcador.equipo2);
  }

  function completarMetadataNombresCompilado(metadata = {}, jugadorId = null, jugadorNombre = '') {
    const salida = { ...(metadata || {}) };
    if (jugadorNombre && !salida.jugador_nombre) salida.jugador_nombre = jugadorNombre;
    if (jugadorId && !salida.jugador_id) salida.jugador_id = jugadorId;

    const pares = [
      ['goleador_id', 'goleador_nombre'],
      ['asistidor_id', 'asistencia_nombre'],
      ['asistencia_id', 'asistencia_nombre'],
      ['cagada_jugador_id', 'cagada_jugador_nombre'],
      ['cagada_id', 'cagada_nombre'],
      ['atajadas_jugador_id', 'atajadas_jugador_nombre']
    ];

    pares.forEach(([idKey, nombreKey]) => {
      if (salida[idKey] && !salida[nombreKey]) {
        salida[nombreKey] = obtenerNombreJugadorActual(salida[idKey]);
      }
    });

    if (salida.cagada_nombre && !salida.cagada_jugador_nombre) salida.cagada_jugador_nombre = salida.cagada_nombre;
    if (salida.cagada_jugador_nombre && !salida.cagada_nombre) salida.cagada_nombre = salida.cagada_jugador_nombre;

    return salida;
  }

  function construirClipsCompiladoSandbox(opciones = {}) {
    const opcionesCompilado = normalizarOpcionesCompilado(opciones);
    const clips = [];

    eventos.forEach((evento, index) => {
      const reviewSegundos = obtenerReviewSegundosDesdeEvento(evento, evento.minuto);
      const goleadorNombre = obtenerNombreJugadorActual(evento.goleador_id);
      const asistenciaNombre = evento.asistencia_id ? obtenerNombreJugadorActual(evento.asistencia_id) : null;
      const cagadaNombre = evento.cagada_id ? obtenerNombreJugadorActual(evento.cagada_id) : null;
      const metadata = {
        origen: 'review_sandbox',
        orden: index + 1,
        equipo: evento.equipo,
        es_gol_en_contra: !!evento.es_en_contra,
        goleador_id: evento.goleador_id,
        goleador_nombre: goleadorNombre,
        asistidor_id: evento.asistencia_id || null,
        asistencia_id: evento.asistencia_id || null,
        asistencia_nombre: asistenciaNombre,
        cagada_jugador_id: evento.cagada_id || null,
        cagada_id: evento.cagada_id || null,
        cagada_jugador_nombre: cagadaNombre,
        cagada_nombre: cagadaNombre,
        ...calcularMarcadorHastaCompilado(reviewSegundos, evento.minuto, eventos)
      };

      clips.push(crearClipCompilado({
          tipo: 'gol',
          jugadorId: evento.goleador_id,
          jugadorNombre: goleadorNombre,
          cantidad: 1,
          minutoPartido: evento.minuto,
          reviewSegundos,
          metadata,
          sourceKey: `gol-${index}`,
          opcionesCompilado
        }));

      if (evento.cagada_id) {
        clips.push(crearClipCompilado({
          tipo: 'cagada_gol',
          jugadorId: evento.cagada_id,
          jugadorNombre: cagadaNombre,
          cantidad: 1,
          minutoPartido: evento.minuto,
          reviewSegundos,
          metadata,
          sourceKey: `cagada-gol-${index}`,
          opcionesCompilado
        }));
      }
    });

    reviewSandbox.atajadas.forEach((item, index) => {
      const reviewSegundos = obtenerReviewSegundosDesdeEvento(item, item.minuto);
      const jugadorNombre = obtenerNombreJugadorActual(item.jugador_id);
      clips.push(crearClipCompilado({
        tipo: 'atajadas',
        jugadorId: item.jugador_id,
        jugadorNombre,
        cantidad: item.cantidad,
        minutoPartido: item.minuto,
        reviewSegundos,
        metadata: {
          origen: 'review_sandbox',
          orden: index + 1,
          atajadas_jugador_id: item.jugador_id,
          atajadas_jugador_nombre: jugadorNombre,
          ...calcularMarcadorHastaCompilado(reviewSegundos, item.minuto, eventos)
        },
        sourceKey: `atajadas-${index}`,
        opcionesCompilado
      }));
    });

    reviewSandbox.cagadas.forEach((item, index) => {
      const reviewSegundos = obtenerReviewSegundosDesdeEvento(item, item.minuto);
      const jugadorNombre = obtenerNombreJugadorActual(item.jugador_id);
      clips.push(crearClipCompilado({
        tipo: 'cagada',
        jugadorId: item.jugador_id,
        jugadorNombre,
        cantidad: item.cantidad,
        minutoPartido: item.minuto,
        reviewSegundos,
        metadata: {
          origen: 'review_sandbox',
          orden: index + 1,
          cagada_jugador_id: item.jugador_id,
          cagada_jugador_nombre: jugadorNombre,
          cagada_nombre: jugadorNombre,
          ...calcularMarcadorHastaCompilado(reviewSegundos, item.minuto, eventos)
        },
        sourceKey: `cagada-${index}`,
        opcionesCompilado
      }));
    });

    return ordenarClipsCompilado(deduplicarClipsCompilado(clips.filter(Boolean)));
  }

  function construirClipsCompiladoDesdeEventos(reviewEventos = [], opciones = {}) {
    const opcionesCompilado = normalizarOpcionesCompilado(opciones);
    const golesFuente = reviewEventos.filter(evento => evento.tipo === 'gol');
    const clips = reviewEventos.map(evento => {
      const jugadorNombre = evento.jugadores?.nombre || evento.jugador_nombre || evento.metadata?.jugador_nombre || obtenerNombreJugadorActual(evento.jugador_id);
      const marcador = evento.metadata?.marcador_texto
        ? {}
        : calcularMarcadorHastaCompilado(evento.review_segundos, evento.minuto_partido, golesFuente);

      return crearClipCompilado({
        tipo: evento.tipo,
        jugadorId: evento.jugador_id,
        jugadorNombre,
        cantidad: evento.cantidad,
        minutoPartido: evento.minuto_partido,
        reviewSegundos: evento.review_segundos,
        metadata: completarMetadataNombresCompilado({
          ...(evento.metadata || {}),
          ...marcador
        }, evento.jugador_id, jugadorNombre),
        sourceKey: evento.id,
        opcionesCompilado
      });
    });

    return ordenarClipsCompilado(deduplicarClipsCompilado(clips.filter(Boolean)));
  }

  function renderizarClipsCompiladoHtml(clips, reviewLink = '', opciones = {}) {
    const { atajadasMinimas } = normalizarOpcionesCompilado(opciones);
    if (!clips.length) {
      return `
        <div class="review-empty">
          Sin clips elegibles. Los eventos necesitan minuto de video; las atajadas entran al compilado desde ${atajadasMinimas} o superior.
        </div>
      `;
    }

    return clips.map((clip, index) => {
      const href = reviewLink ? generarLinkConTimestampSegundos(reviewLink, clip.inicio) : '';
      return `
        <div class="review-clip-row">
          <div class="min-w-0">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
              <span class="badge bg-secondary">${index + 1}</span>
              <span class="badge ${clip.badgeClass}">${escaparHtmlPlano(clip.etiqueta)}</span>
              <strong class="text-white text-truncate">${escaparHtmlPlano(clip.jugadorNombre)}</strong>
              ${clip.tipo === 'atajadas' ? `<span class="review-time-chip">${Number(clip.cantidad) || 0}</span>` : ''}
            </div>
            <div class="review-clip-meta">
              Partido ${escaparHtmlPlano(formatearTiempoReview(clip.minutoPartido))}
              - Jugada ${escaparHtmlPlano(formatearSegundosVideo(clip.reviewSegundos))}
              - Corte ${escaparHtmlPlano(formatearSegundosVideo(clip.inicio))}-${escaparHtmlPlano(formatearSegundosVideo(clip.fin))}
              - ${clip.pre}s antes / ${clip.post}s despues
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-dark border border-secondary">${clip.duracion}s</span>
            ${href ? `
              <a class="btn btn-sm btn-outline-light" href="${escaparAtributoHtml(href)}" target="_blank" rel="noopener noreferrer" title="Abrir corte">
                <i class="bi bi-box-arrow-up-right"></i>
              </a>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function obtenerMimeCompilado() {
    if (!window.MediaRecorder) return '';
    const candidatos = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    return candidatos.find(tipo => MediaRecorder.isTypeSupported(tipo)) || '';
  }

  function setEstadoCompilado(statusEl, mensaje, tipo = 'info') {
    if (!statusEl) return;
    const clases = {
      info: 'small text-light-emphasis mt-2',
      warning: 'small text-warning mt-2',
      error: 'small text-danger mt-2',
      success: 'small text-success mt-2'
    };
    statusEl.className = clases[tipo] || clases.info;
    statusEl.textContent = mensaje || '';
  }

  function normalizarNombreArchivo(valor) {
    return String(valor || 'compilado')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'compilado';
  }

  function descargarBlob(blob, nombreArchivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function descargarJsonCompilado(clips, nombreBase, reviewLink = '', opciones = {}) {
    if (!clips.length) {
      showToast('No hay cortes elegibles para descargar.', 'warning');
      return;
    }

    const opcionesCompilado = normalizarOpcionesCompilado(opciones);
    const payload = {
      generado_en: new Date().toISOString(),
      review_link: reviewLink || null,
      formato: 't5-review-compilado-v1',
      compilado: {
        atajadas_minimas: opcionesCompilado.atajadasMinimas
      },
      clips: clips.map((clip, index) => ({
        orden: index + 1,
        tipo: clip.tipo,
        etiqueta: clip.etiqueta,
        jugador_id: clip.jugadorId,
        jugador_nombre: clip.jugadorNombre,
        cantidad: clip.cantidad,
        minuto_partido: clip.minutoPartido,
        review_segundos: clip.reviewSegundos,
        inicio_segundos: clip.inicio,
        fin_segundos: clip.fin,
        duracion_segundos: clip.duracion,
        pre_segundos: clip.pre,
        post_segundos: clip.post,
        link_inicio: reviewLink ? generarLinkConTimestampSegundos(reviewLink, clip.inicio) : null,
        metadata: clip.metadata || {}
      }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    descargarBlob(blob, `${normalizarNombreArchivo(nombreBase)}-cortes.json`);
  }

  const FFMPEG_WASM_MODULE_URL = 'https://esm.sh/@ffmpeg/ffmpeg@0.12.15';
  const FFMPEG_WASM_UTIL_URL = 'https://esm.sh/@ffmpeg/util@0.12.2';
  const FFMPEG_WASM_ESM_BASE = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm';
  const FFMPEG_WASM_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
  let ffmpegWasmPromise = null;
  let ffmpegClassWorkerUrlPromise = null;

  function obtenerMensajeError(error) {
    return error?.message || String(error || 'Error desconocido');
  }

  async function crearClassWorkerUrlFFmpeg() {
    if (!ffmpegClassWorkerUrlPromise) {
      ffmpegClassWorkerUrlPromise = (async () => {
        const response = await fetch(`${FFMPEG_WASM_ESM_BASE}/worker.js`, { mode: 'cors' });
        if (!response.ok) {
          throw new Error(`No se pudo cargar worker.js de ffmpeg.wasm: ${response.status}`);
        }

        const source = (await response.text())
          .replaceAll('from "./const.js"', `from "${FFMPEG_WASM_ESM_BASE}/const.js"`)
          .replaceAll('from "./errors.js"', `from "${FFMPEG_WASM_ESM_BASE}/errors.js"`);

        return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      })().catch(error => {
        ffmpegClassWorkerUrlPromise = null;
        throw error;
      });
    }

    return ffmpegClassWorkerUrlPromise;
  }

  function obtenerDatosBeelupDesdeUrl(reviewLink) {
    const texto = String(reviewLink || '').trim();
    if (!texto) return null;

    try {
      const url = new URL(texto, window.location.href);
      const host = url.hostname.toLowerCase();
      const id = url.searchParams.get('id');

      if (!host.includes('beelup.com') || !id) return null;

      return {
        id,
        camara: url.searchParams.get('c') || url.searchParams.get('camara') || ''
      };
    } catch (error) {
      const match = texto.match(/(?:id=)([0-9]+)/i);
      return match ? { id: match[1], camara: '' } : null;
    }
  }

  function crearUrlPlaylistBeelup(reviewLink, formato = 'json') {
    const datos = obtenerDatosBeelupDesdeUrl(reviewLink);
    if (!datos) return '';

    const params = new URLSearchParams({
      id: datos.id,
      camara: datos.camara || '',
      tipo: 'todo',
      formato
    });

    if (formato === 'm3u8') {
      params.set('desde', '');
      params.set('duracion', '');
    }

    return `https://beelup.com/obtener.video.playlist.php?${params.toString()}`;
  }

  async function cargarPlaylistBeelup(reviewLink) {
    const playlistUrl = crearUrlPlaylistBeelup(reviewLink, 'json');
    if (!playlistUrl) {
      throw new Error('El link no parece ser de Beelup.');
    }

    const response = await fetch(playlistUrl, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`Beelup respondio ${response.status} al pedir la playlist.`);
    }

    const data = await response.json();
    const segmentos = (Array.isArray(data?.segmentos) ? data.segmentos : [])
      .filter(segmento => segmento?.tipo === 'video' && segmento.url)
      .map((segmento, index) => {
        const desde = Number(segmento.segundos_desde);
        const hasta = Number(segmento.segundos_hasta);
        const duracion = Number(segmento.duracion);
        const inicio = Number.isFinite(desde) ? desde : index * (Number.isFinite(duracion) ? duracion : 0);
        const fin = Number.isFinite(hasta) ? hasta : inicio + (Number.isFinite(duracion) ? duracion : 0);

        return {
          index,
          id: segmento.id || index + 1,
          url: segmento.url,
          inicio,
          fin,
          duracion: Math.max(0, fin - inicio),
          fecha: segmento.fecha_actual || null
        };
      })
      .filter(segmento => Number.isFinite(segmento.inicio) && Number.isFinite(segmento.fin) && segmento.fin > segmento.inicio)
      .sort((a, b) => a.inicio - b.inicio);

    if (!segmentos.length) {
      throw new Error('La playlist de Beelup no trajo segmentos de video.');
    }

    return {
      url: playlistUrl,
      datos: data,
      segmentos,
      duracion: Math.max(...segmentos.map(segmento => segmento.fin))
    };
  }

  function prepararTrabajosCompiladoBeelup(playlist, clips) {
    return clips.map((clip, index) => {
      const inicio = Math.max(0, Number(clip.inicio) || 0);
      const fin = Math.min(Number(playlist.duracion) || 0, Number(clip.fin) || 0);

      if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return null;

      const segmentos = playlist.segmentos.filter(segmento =>
        segmento.fin > inicio && segmento.inicio < fin
      );

      if (!segmentos.length) return null;

      return {
        clip,
        index,
        inicio,
        fin,
        duracion: fin - inicio,
        segmentos,
        offset: Math.max(0, inicio - segmentos[0].inicio)
      };
    }).filter(Boolean);
  }

  async function cargarFFmpegWasm(statusEl) {
    if (!window.WebAssembly || !window.Worker || !window.Blob || !window.URL) {
      throw new Error('Este navegador no soporta ffmpeg.wasm.');
    }

    if (!ffmpegWasmPromise) {
      ffmpegWasmPromise = (async () => {
        setEstadoCompilado(statusEl, 'Cargando motor ffmpeg.wasm...', 'info');
        const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
          import(FFMPEG_WASM_MODULE_URL),
          import(FFMPEG_WASM_UTIL_URL)
        ]);

        const ffmpeg = new FFmpeg();
        ffmpeg.on('log', ({ message }) => {
          if (message) console.debug('[ffmpeg.wasm]', message);
        });

        await ffmpeg.load({
          classWorkerURL: await crearClassWorkerUrlFFmpeg(),
          coreURL: await toBlobURL(`${FFMPEG_WASM_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${FFMPEG_WASM_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
        });

        return ffmpeg;
      })().catch(error => {
        ffmpegWasmPromise = null;
        throw error;
      });
    }

    return ffmpegWasmPromise;
  }

  async function escribirTextoFFmpeg(ffmpeg, nombreArchivo, contenido) {
    await ffmpeg.writeFile(nombreArchivo, new TextEncoder().encode(contenido));
  }

  async function borrarArchivoFFmpeg(ffmpeg, nombreArchivo) {
    try {
      await ffmpeg.deleteFile(nombreArchivo);
    } catch (error) {
      // El archivo puede no existir si ffmpeg fallo antes de escribirlo.
    }
  }

  function formatearDecimalFFmpeg(valor) {
    return Math.max(0, Number(valor) || 0).toFixed(3);
  }

  function obtenerTextoMarcadorOverlay(metadata = {}) {
    if (metadata.marcador_texto) {
      return String(metadata.marcador_texto).replace(/\s*-\s*/g, '-');
    }
    const equipo1Goles = Number(metadata.marcador_equipo1);
    const equipo2Goles = Number(metadata.marcador_equipo2);
    if (Number.isFinite(equipo1Goles) && Number.isFinite(equipo2Goles)) {
      return `${equipo1Goles}-${equipo2Goles}`;
    }
    return '--';
  }

  function calcularMarcadorClipsCompilado(clips = [], hastaReviewSegundos = null) {
    const limite = Number(hastaReviewSegundos);
    if (!Number.isFinite(limite) || !Array.isArray(clips)) return null;

    let tieneFuente = false;
    const marcador = { equipo1: 0, equipo2: 0 };

    clips.forEach(clip => {
      if (clip?.tipo !== 'gol') return;

      const equipo = Number(clip.metadata?.equipo ?? clip.equipo);
      const reviewSegundos = Number(clip.reviewSegundos);
      if ((equipo !== 1 && equipo !== 2) || !Number.isFinite(reviewSegundos)) return;

      tieneFuente = true;
      if (reviewSegundos > limite) return;

      if (equipo === 1) marcador.equipo1 += 1;
      if (equipo === 2) marcador.equipo2 += 1;
    });

    if (!tieneFuente) return null;
    return `${marcador.equipo1}-${marcador.equipo2}`;
  }

  function obtenerDatosOverlayClip(clip, index = 0, total = 1, opciones = {}) {
    const metadata = completarMetadataNombresCompilado(clip.metadata || {}, clip.jugadorId, clip.jugadorNombre);
    const jugadorNombre = clip.jugadorNombre || metadata.jugador_nombre || 'Jugador';
    const asistenciaNombre = metadata.asistencia_nombre || metadata.asistidor_nombre || null;
    const cagadaNombre = metadata.cagada_jugador_nombre || metadata.cagada_nombre || null;
    const goleadorNombre = metadata.goleador_nombre || null;
    const minutoPartidoSegundos = Number(opciones.minutoPartidoSegundos);
    const minutoPartidoTexto = Number.isFinite(minutoPartidoSegundos)
      ? formatearSegundosVideo(minutoPartidoSegundos)
      : formatearTiempoReview(clip.minutoPartido);
    const marcadorDinamico = calcularMarcadorClipsCompilado(opciones.clipsMarcador, opciones.reviewSegundosMarcador);
    const datos = {
      titulo: String(clip.etiqueta || 'Jugada').toUpperCase(),
      principal: jugadorNombre,
      detalles: [],
      color: '#facc15',
      marcador: marcadorDinamico || obtenerTextoMarcadorOverlay(metadata),
      minutoPartido: minutoPartidoTexto,
      tiempo: formatearSegundosVideo(clip.reviewSegundos),
      orden: `${index + 1}/${Math.max(1, total)}`
    };

    if (clip.tipo === 'gol') {
      datos.titulo = metadata.es_gol_en_contra ? 'GOL EN CONTRA' : 'GOL';
      datos.principal = `Gol: ${jugadorNombre}`;
      datos.color = '#22c55e';
      if (asistenciaNombre) datos.detalles.push(`Asistencia: ${asistenciaNombre}`);
      if (cagadaNombre) datos.detalles.push(`Cagada: ${cagadaNombre}`);
    } else if (clip.tipo === 'atajadas') {
      datos.titulo = 'ATAJADA';
      datos.principal = `Atajada: ${jugadorNombre}`;
      datos.color = '#38bdf8';
    } else if (clip.tipo === 'cagada' || clip.tipo === 'cagada_gol') {
      datos.titulo = clip.tipo === 'cagada_gol' ? 'CAGADA EN GOL' : 'CAGADA';
      datos.principal = `Cagada: ${jugadorNombre}`;
      datos.color = '#fb7185';
      if (goleadorNombre) datos.detalles.push(`Gol de: ${goleadorNombre}`);
      if (asistenciaNombre) datos.detalles.push(`Asistencia: ${asistenciaNombre}`);
    }

    return datos;
  }

  function dibujarRectRedondeadoCompilado(ctx, x, y, width, height, radius) {
    const radio = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + radio, y);
    ctx.lineTo(x + width - radio, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radio);
    ctx.lineTo(x + width, y + height - radio);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radio, y + height);
    ctx.lineTo(x + radio, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radio);
    ctx.lineTo(x, y + radio);
    ctx.quadraticCurveTo(x, y, x + radio, y);
    ctx.closePath();
  }

  function recortarTextoCanvas(ctx, texto, maxWidth) {
    const valor = String(texto || '');
    if (ctx.measureText(valor).width <= maxWidth) return valor;

    let recortado = valor;
    while (recortado.length > 1 && ctx.measureText(`${recortado}...`).width > maxWidth) {
      recortado = recortado.slice(0, -1);
    }
    return `${recortado.trimEnd()}...`;
  }

  function dibujarTextoTruncadoCanvas(ctx, texto, x, y, maxWidth) {
    ctx.fillText(recortarTextoCanvas(ctx, texto, maxWidth), x, y);
  }

  function convertirCanvasAPngBytes(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(async blob => {
        if (!blob) {
          reject(new Error('No se pudo crear el overlay PNG.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/png');
    });
  }

  function obtenerSegundosPartidoOverlayClip(clip, segundosDesdeInicio = 0) {
    const minutoPartido = Number(clip?.minutoPartido);
    if (!Number.isFinite(minutoPartido)) return null;

    const segundosBase = (minutoPartido * 60) - (Number(clip?.pre) || 0);
    return Math.max(0, Math.round(segundosBase + (Number(segundosDesdeInicio) || 0)));
  }

  function obtenerCantidadOverlaysTemporizados(duracion) {
    return Math.max(1, Math.ceil(Math.max(0, Number(duracion) || 0)));
  }

  async function crearOverlayCompiladoPng(clip, index = 0, total = 1, opciones = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar el canvas del overlay.');

    try {
      await document.fonts?.load('700 64px Inter');
      await document.fonts?.load('600 36px Inter');
    } catch (error) {
      // Si la fuente no esta disponible, el canvas usa el fallback del sistema.
    }

    const fuente = 'Inter, "Segoe UI", Arial, sans-serif';
    const datos = obtenerDatosOverlayClip(clip, index, total, opciones);
    const esAtajada = clip.tipo === 'atajadas';
    const tieneDetalles = !esAtajada && datos.detalles.length > 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradienteInferior = ctx.createLinearGradient(0, 780, 0, 1080);
    gradienteInferior.addColorStop(0, 'rgba(2, 6, 23, 0)');
    gradienteInferior.addColorStop(0.58, 'rgba(2, 6, 23, 0.36)');
    gradienteInferior.addColorStop(1, 'rgba(2, 6, 23, 0.78)');
    ctx.fillStyle = gradienteInferior;
    ctx.fillRect(0, 780, 1920, 300);

    const marcadorPartes = String(datos.marcador || '0-0').split('-').map(parte => parte.trim());
    const scoreLocal = /^\d+$/.test(marcadorPartes[0] || '') ? marcadorPartes[0] : '0';
    const scoreVisitante = /^\d+$/.test(marcadorPartes[1] || '') ? marcadorPartes[1] : '0';

    const marcadorX = 12;
    const marcadorY = 10;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
    dibujarRectRedondeadoCompilado(ctx, marcadorX, marcadorY, 380, 50, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f8fafc';
    dibujarRectRedondeadoCompilado(ctx, marcadorX + 10, marcadorY + 8, 76, 34, 7);
    ctx.fill();
    ctx.font = `900 20px ${fuente}`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText(datos.minutoPartido && datos.minutoPartido !== '--' ? datos.minutoPartido : datos.tiempo, marcadorX + 48, marcadorY + 26);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(marcadorX + 106, marcadorY + 26, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `900 18px ${fuente}`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('E1', marcadorX + 124, marcadorY + 26);

    ctx.fillStyle = '#2dd4bf';
    dibujarRectRedondeadoCompilado(ctx, marcadorX + 154, marcadorY + 8, 44, 34, 7);
    ctx.fill();
    ctx.fillStyle = '#06211e';
    ctx.font = `900 25px ${fuente}`;
    ctx.textAlign = 'center';
    ctx.fillText(scoreLocal, marcadorX + 176, marcadorY + 26);
    ctx.fillStyle = '#2dd4bf';
    dibujarRectRedondeadoCompilado(ctx, marcadorX + 206, marcadorY + 8, 44, 34, 7);
    ctx.fill();
    ctx.fillStyle = '#06211e';
    ctx.fillText(scoreVisitante, marcadorX + 228, marcadorY + 26);
    ctx.textAlign = 'left';

    ctx.font = `900 18px ${fuente}`;
    ctx.fillStyle = '#f8fafc';
    ctx.fillText('E2', marcadorX + 280, marcadorY + 26);
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(marcadorX + 318, marcadorY + 26, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.textBaseline = 'alphabetic';

    const panelX = 34;
    const panelH = esAtajada ? 64 : (tieneDetalles ? 96 : 76);
    const panelY = 1080 - panelH - 32;
    const panelW = esAtajada ? 520 : (tieneDetalles ? 760 : 520);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.8)';
    dibujarRectRedondeadoCompilado(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = datos.color;
    dibujarRectRedondeadoCompilado(ctx, panelX + 16, panelY + 16, 6, panelH - 32, 4);
    ctx.fill();

    const contenidoX = panelX + 38;
    if (esAtajada) {
      ctx.font = `900 30px ${fuente}`;
      ctx.fillStyle = '#ffffff';
      dibujarTextoTruncadoCanvas(ctx, datos.principal, contenidoX, panelY + 41, panelW - 58);
    } else {
      ctx.font = `800 16px ${fuente}`;
      ctx.fillStyle = datos.color;
      ctx.fillText(datos.titulo, contenidoX, panelY + 29);
      ctx.font = `900 30px ${fuente}`;
      ctx.fillStyle = '#ffffff';
      dibujarTextoTruncadoCanvas(ctx, datos.principal, contenidoX, panelY + 59, panelW - 58);

      const detalleTexto = datos.detalles.filter(Boolean).join('  /  ');
      if (detalleTexto) {
        ctx.font = `600 16px ${fuente}`;
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
        dibujarTextoTruncadoCanvas(ctx, detalleTexto, contenidoX, panelY + 82, panelW - 58);
      }
    }

    return convertirCanvasAPngBytes(canvas);
  }

  async function descargarSegmentoBeelup(segmento) {
    const response = await fetch(segmento.url, { mode: 'cors' });
    if (!response.ok) {
      throw new Error(`No se pudo bajar segmento ${segmento.id || segmento.index + 1}: ${response.status}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  function normalizarOverlaysCompilado(overlayNames = []) {
    if (!overlayNames) return [];
    if (Array.isArray(overlayNames)) return overlayNames.filter(Boolean);
    return [overlayNames].filter(Boolean);
  }

  function construirFiltroVideoCompilado(duracion, overlayNames = []) {
    const duracionNumerica = Math.max(0, Number(duracion) || 0);
    const fadeDuracion = Math.min(0.22, Math.max(0.08, duracionNumerica / 14));
    const fadeInicioSalida = Math.max(0, duracionNumerica - fadeDuracion);
    const fadeFiltro = `fade=t=in:st=0:d=${formatearDecimalFFmpeg(fadeDuracion)},fade=t=out:st=${formatearDecimalFFmpeg(fadeInicioSalida)}:d=${formatearDecimalFFmpeg(fadeDuracion)}`;
    const overlays = normalizarOverlaysCompilado(overlayNames);

    if (!overlays.length) return `${fadeFiltro},format=yuv420p`;

    const filtros = [];
    let baseLabel = '0:v';
    overlays.forEach((_, index) => {
      const inputIndex = index + 1;
      const overlayLabel = `ov${index}`;
      const scaledBaseLabel = `base${index}`;
      const outputLabel = `vtmp${index}`;
      const inicio = Math.min(index, duracionNumerica);
      const fin = Math.min(index + 1, duracionNumerica);
      const finSeguro = Math.max(inicio, fin - 0.001);

      filtros.push(`[${inputIndex}:v][${baseLabel}]scale2ref=w=main_w:h=main_h[${overlayLabel}][${scaledBaseLabel}]`);
      filtros.push(`[${scaledBaseLabel}][${overlayLabel}]overlay=0:0:format=auto:enable='between(t,${formatearDecimalFFmpeg(inicio)},${formatearDecimalFFmpeg(finSeguro)})'[${outputLabel}]`);
      baseLabel = outputLabel;
    });

    filtros.push(`[${baseLabel}]${fadeFiltro},format=yuv420p[v]`);
    return filtros.join(';');
  }

  function construirArgsClipFFmpeg(listName, outputName, offset, duracion, overlayNames, codec = 'h264') {
    const overlays = normalizarOverlaysCompilado(overlayNames);
    const args = [
      '-hide_banner',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listName
    ];

    overlays.forEach(overlayName => {
      args.push('-loop', '1', '-i', overlayName);
    });

    args.push(
      '-ss', formatearDecimalFFmpeg(offset),
      '-t', formatearDecimalFFmpeg(duracion)
    );

    if (overlays.length) {
      args.push(
        '-filter_complex', construirFiltroVideoCompilado(duracion, overlays),
        '-map', '[v]',
        '-map', '0:a:0?'
      );
    } else {
      args.push(
        '-vf', construirFiltroVideoCompilado(duracion),
        '-map', '0:v:0',
        '-map', '0:a:0?'
      );
    }

    if (codec === 'h264') {
      args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
        '-pix_fmt', 'yuv420p'
      );
    } else {
      args.push(
        '-c:v', 'mpeg4',
        '-q:v', '5',
        '-pix_fmt', 'yuv420p'
      );
    }

    args.push(
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      outputName
    );

    return args;
  }

  async function ejecutarClipFFmpeg(ffmpeg, listName, outputName, offset, duracion, overlayNames = []) {
    const argsH264 = construirArgsClipFFmpeg(listName, outputName, offset, duracion, overlayNames, 'h264');

    try {
      await ffmpeg.exec(argsH264);
      return;
    } catch (error) {
      console.warn('Fallo libx264 en ffmpeg.wasm, reintentando con mpeg4:', error);
      await borrarArchivoFFmpeg(ffmpeg, outputName);
    }

    await ffmpeg.exec(construirArgsClipFFmpeg(listName, outputName, offset, duracion, overlayNames, 'mpeg4'));
  }

  async function concatenarClipsFFmpeg(ffmpeg, clipNames, outputName) {
    if (clipNames.length === 1) {
      return clipNames[0];
    }

    const listName = `${outputName.replace(/\.mp4$/i, '')}_clips.txt`;
    await escribirTextoFFmpeg(ffmpeg, listName, clipNames.map(name => `file '${name}'`).join('\n'));

    try {
      await ffmpeg.exec([
        '-hide_banner',
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listName,
        '-c', 'copy',
        '-movflags', '+faststart',
        outputName
      ]);
      return outputName;
    } finally {
      await borrarArchivoFFmpeg(ffmpeg, listName);
    }
  }

  async function generarMp4CompiladoDesdeBeelup(reviewLink, clips, statusEl, nombreBase = 'compilado') {
    if (!clips.length) {
      setEstadoCompilado(statusEl, 'No hay cortes elegibles para generar.', 'warning');
      return;
    }

    if (!obtenerDatosBeelupDesdeUrl(reviewLink)) {
      setEstadoCompilado(statusEl, 'Carga un link valido de Beelup para generar el MP4 automatico.', 'warning');
      return;
    }

    const archivosTemporales = [];
    const clipNames = [];
    const jobId = `t5_${Date.now()}_${Math.round(Math.random() * 1000)}`;
    let ffmpeg = null;

    try {
      setEstadoCompilado(statusEl, 'Leyendo playlist de Beelup...', 'info');
      const playlist = await cargarPlaylistBeelup(reviewLink);
      const trabajos = prepararTrabajosCompiladoBeelup(playlist, clips);

      if (!trabajos.length) {
        setEstadoCompilado(statusEl, 'Los cortes quedan fuera de la duracion disponible en Beelup.', 'warning');
        return;
      }

      ffmpeg = await cargarFFmpegWasm(statusEl);
      const duracionTotal = trabajos.reduce((sum, trabajo) => sum + trabajo.duracion, 0);
      setEstadoCompilado(statusEl, `Preparando ${trabajos.length} corte(s), ${formatearSegundosVideo(duracionTotal)} finales.`, 'info');

      for (let trabajoIndex = 0; trabajoIndex < trabajos.length; trabajoIndex += 1) {
        const trabajo = trabajos[trabajoIndex];
        const segmentFiles = [];

        for (let segmentoIndex = 0; segmentoIndex < trabajo.segmentos.length; segmentoIndex += 1) {
          const segmento = trabajo.segmentos[segmentoIndex];
          const segmentName = `${jobId}_c${trabajoIndex}_s${segmentoIndex}.ts`;
          setEstadoCompilado(
            statusEl,
            `Bajando corte ${trabajoIndex + 1}/${trabajos.length}, segmento ${segmentoIndex + 1}/${trabajo.segmentos.length}...`,
            'info'
          );
          await ffmpeg.writeFile(segmentName, await descargarSegmentoBeelup(segmento));
          segmentFiles.push(segmentName);
          archivosTemporales.push(segmentName);
        }

        const listName = `${jobId}_clip_${trabajoIndex}.txt`;
        const clipName = `${jobId}_clip_${trabajoIndex}.mp4`;
        const overlayNames = [];
        archivosTemporales.push(listName, clipName);
        await escribirTextoFFmpeg(ffmpeg, listName, segmentFiles.map(name => `file '${name}'`).join('\n'));

        setEstadoCompilado(
          statusEl,
          `Preparando overlay ${trabajoIndex + 1}/${trabajos.length}: ${trabajo.clip.etiqueta}...`,
          'info'
        );
        const cantidadOverlays = obtenerCantidadOverlaysTemporizados(trabajo.duracion);
        for (let overlayIndex = 0; overlayIndex < cantidadOverlays; overlayIndex += 1) {
          const overlayName = `${jobId}_overlay_${trabajoIndex}_${overlayIndex}.png`;
          overlayNames.push(overlayName);
          archivosTemporales.push(overlayName);
          await ffmpeg.writeFile(overlayName, await crearOverlayCompiladoPng(trabajo.clip, trabajoIndex, trabajos.length, {
            minutoPartidoSegundos: obtenerSegundosPartidoOverlayClip(trabajo.clip, overlayIndex),
            reviewSegundosMarcador: trabajo.clip.inicio + overlayIndex,
            clipsMarcador: clips
          }));
        }

        setEstadoCompilado(
          statusEl,
          `Codificando corte ${trabajoIndex + 1}/${trabajos.length}: ${trabajo.clip.etiqueta} (${formatearSegundosVideo(trabajo.inicio)}-${formatearSegundosVideo(trabajo.fin)})...`,
          'info'
        );
        await ejecutarClipFFmpeg(ffmpeg, listName, clipName, trabajo.offset, trabajo.duracion, overlayNames);
        clipNames.push(clipName);

        for (const overlayName of overlayNames) {
          await borrarArchivoFFmpeg(ffmpeg, overlayName);
        }
        await borrarArchivoFFmpeg(ffmpeg, listName);
        for (const segmentName of segmentFiles) {
          await borrarArchivoFFmpeg(ffmpeg, segmentName);
        }
      }

      const outputName = `${jobId}_compilado.mp4`;
      archivosTemporales.push(outputName);
      setEstadoCompilado(statusEl, 'Uniendo cortes en MP4 final...', 'info');
      const finalName = await concatenarClipsFFmpeg(ffmpeg, clipNames, outputName);
      const data = await ffmpeg.readFile(finalName);
      const blob = new Blob([data], { type: 'video/mp4' });

      if (!blob.size) {
        throw new Error('El MP4 final se genero vacio.');
      }

      descargarBlob(blob, `${normalizarNombreArchivo(nombreBase)}.mp4`);
      setEstadoCompilado(statusEl, `MP4 listo: ${Math.round(blob.size / 1024 / 1024 * 10) / 10} MB descargados.`, 'success');
    } catch (error) {
      console.error('Error generando MP4 Beelup:', error);
      setEstadoCompilado(statusEl, `No se pudo generar el MP4: ${obtenerMensajeError(error)}`, 'error');
    } finally {
      if (ffmpeg) {
        for (const archivo of archivosTemporales.reverse()) {
          await borrarArchivoFFmpeg(ffmpeg, archivo);
        }
      }
    }
  }

  function esperarEventoUnaVez(target, eventName, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout esperando ${eventName}`));
      }, timeoutMs);

      const onEvent = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Error de video durante ${eventName}`));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        target.removeEventListener(eventName, onEvent);
        target.removeEventListener('error', onError);
      };

      target.addEventListener(eventName, onEvent, { once: true });
      target.addEventListener('error', onError, { once: true });
    });
  }

  function esperarVideoHasta(video, finSegundos) {
    return new Promise(resolve => {
      const revisar = () => {
        if (video.ended || video.currentTime >= finSegundos) {
          resolve();
          return;
        }
        window.requestAnimationFrame(revisar);
      };
      revisar();
    });
  }

  function obtenerStreamVideo(video) {
    if (typeof video.captureStream === 'function') return video.captureStream();
    if (typeof video.mozCaptureStream === 'function') return video.mozCaptureStream();
    return null;
  }

  async function irATiempoVideo(video, segundos) {
    const destino = Math.max(0, Number(segundos) || 0);
    if (Math.abs(video.currentTime - destino) < 0.05) return;

    const seeked = esperarEventoUnaVez(video, 'seeked', 15000);
    video.currentTime = destino;
    await seeked;
  }

  async function generarVideoCompiladoDesdeArchivo(file, clips, statusEl, nombreBase = 'compilado') {
    if (!file) {
      setEstadoCompilado(statusEl, 'Carga primero el video fuente del partido.', 'warning');
      return;
    }

    if (!clips.length) {
      setEstadoCompilado(statusEl, 'No hay cortes elegibles para generar.', 'warning');
      return;
    }

    if (!window.MediaRecorder) {
      setEstadoCompilado(statusEl, 'Este navegador no soporta MediaRecorder para generar video.', 'error');
      return;
    }

    const mimeType = obtenerMimeCompilado();
    if (!mimeType) {
      setEstadoCompilado(statusEl, 'Este navegador no soporta salida WebM para el compilado.', 'error');
      return;
    }

    const video = document.createElement('video');
    const sourceUrl = URL.createObjectURL(file);
    video.src = sourceUrl;
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = false;
    video.style.position = 'fixed';
    video.style.left = '-10000px';
    video.style.top = '0';
    video.style.width = '320px';
    video.style.height = '180px';
    video.style.opacity = '0.01';
    document.body.appendChild(video);

    try {
      setEstadoCompilado(statusEl, 'Preparando video fuente...', 'info');
      if (video.readyState < 1) {
        await esperarEventoUnaVez(video, 'loadedmetadata', 20000);
      }

      const duracionVideo = Number(video.duration);
      if (!Number.isFinite(duracionVideo) || duracionVideo <= 0) {
        throw new Error('No se pudo leer la duracion del video fuente.');
      }

      const clipsValidos = clips
        .map(clip => ({
          ...clip,
          inicio: Math.max(0, Math.min(clip.inicio, duracionVideo)),
          fin: Math.max(0, Math.min(clip.fin, duracionVideo))
        }))
        .filter(clip => clip.fin > clip.inicio);

      if (!clipsValidos.length) {
        setEstadoCompilado(statusEl, 'Los cortes quedan fuera de la duracion del video fuente.', 'warning');
        return;
      }

      const stream = obtenerStreamVideo(video);
      if (!stream) {
        throw new Error('El navegador no permite capturar el video fuente.');
      }

      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      });

      const stopped = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.start(500);
      if (recorder.state === 'recording') recorder.pause();

      const duracionTotal = clipsValidos.reduce((sum, clip) => sum + (clip.fin - clip.inicio), 0);
      setEstadoCompilado(statusEl, `Generando ${clipsValidos.length} cortes. Tarda aprox. ${formatearSegundosVideo(duracionTotal)}.`, 'info');

      for (let i = 0; i < clipsValidos.length; i += 1) {
        const clip = clipsValidos[i];
        setEstadoCompilado(statusEl, `Grabando corte ${i + 1}/${clipsValidos.length}: ${clip.etiqueta} (${formatearSegundosVideo(clip.inicio)}-${formatearSegundosVideo(clip.fin)})`, 'info');

        video.pause();
        await irATiempoVideo(video, clip.inicio);

        if (recorder.state === 'paused') recorder.resume();
        await video.play();
        await esperarVideoHasta(video, clip.fin);
        video.pause();
        if (recorder.state === 'recording') recorder.pause();
      }

      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) {
        throw new Error('El compilado se genero vacio.');
      }

      descargarBlob(blob, `${normalizarNombreArchivo(nombreBase)}.webm`);
      setEstadoCompilado(statusEl, `Compilado listo: ${Math.round(blob.size / 1024 / 1024 * 10) / 10} MB descargados.`, 'success');
    } catch (error) {
      console.error('Error generando compilado:', error);
      setEstadoCompilado(statusEl, `No se pudo generar el compilado: ${error.message}`, 'error');
    } finally {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function calcularMarcadorEventos(hastaReviewSegundos = null) {
    const limiteReview = Number(hastaReviewSegundos);
    const filtrarPorReview = Number.isFinite(limiteReview);

    return eventos.reduce((acc, evento) => {
      if (filtrarPorReview) {
        const eventoReviewSegundos = obtenerReviewSegundosDesdeEvento(evento, evento.minuto);
        if (!Number.isFinite(Number(eventoReviewSegundos)) || Number(eventoReviewSegundos) > limiteReview) {
          return acc;
        }
      }

      const equipo = Number(evento.equipo);
      if (equipo === 1) acc.equipo1 += 1;
      if (equipo === 2) acc.equipo2 += 1;
      return acc;
    }, { equipo1: 0, equipo2: 0 });
  }

  function renderizarEquipoReview(containerId, equipoNombre, jugadores) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (jugadores.length === 0) {
      container.innerHTML = '<div class="review-empty">Sin jugadores</div>';
      return;
    }

    container.innerHTML = jugadores.map((jugador, index) => `
      <div class="review-player-row">
        <span class="text-truncate">${escaparHtmlPlano(jugador.nombre)}</span>
        <button type="button" class="btn btn-sm btn-outline-danger" data-review-remove-player="${index}" data-review-team="${equipoNombre}" title="Quitar">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('[data-review-remove-player]').forEach(button => {
      button.addEventListener('click', () => {
        quitarJugadorDesdeReview(button.dataset.reviewTeam, Number(button.dataset.reviewRemovePlayer));
      });
    });
  }

  function vincularFilasSeekReview(container) {
    if (!container) return;
    container.querySelectorAll('[data-review-seek-seconds]').forEach(row => {
      const irAlMinuto = event => {
        if (event?.target?.closest?.('button, a, input, select, textarea, [data-no-seek]')) return;
        buscarEnReproductorReviewA(row.dataset.reviewSeekSeconds);
      };

      row.addEventListener('click', irAlMinuto);
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        irAlMinuto(event);
      });
    });
  }

  function renderizarEventosReview() {
    const marcador = calcularMarcadorEventos();
    const marcadorEl = document.getElementById('review-marcador');
    const resultadoEl = document.getElementById('review-resultado');
    const ganadorEl = document.getElementById('review-ganador');
    const countEl = document.getElementById('review-event-count');
    const listEl = document.getElementById('review-eventos-list');

    if (marcadorEl) marcadorEl.textContent = `${marcador.equipo1} - ${marcador.equipo2}`;
    if (resultadoEl) resultadoEl.value = `${marcador.equipo1}-${marcador.equipo2}`;
    if (ganadorEl) {
      ganadorEl.value = marcador.equipo1 > marcador.equipo2 ? '1' : marcador.equipo2 > marcador.equipo1 ? '2' : (eventos.length ? '0' : '');
    }
    if (countEl) countEl.textContent = eventos.length;
    actualizarScorebugReview();

    if (!listEl) return;
    if (eventos.length === 0) {
      listEl.innerHTML = '<div class="review-empty">Sin goles cargados</div>';
      return;
    }

    listEl.innerHTML = eventos.map((evento, index) => {
      const asistencia = evento.asistencia_id ? obtenerNombreJugadorActual(evento.asistencia_id) : 'Sin asistencia';
      const cagada = evento.cagada_id ? obtenerNombreJugadorActual(evento.cagada_id) : 'Sin cagada';
      const reviewSegundos = obtenerReviewSegundosDesdeEvento(evento, evento.minuto);
      const seekAttrs = Number.isFinite(Number(reviewSegundos))
        ? `data-review-seek-seconds="${Math.max(0, Math.round(Number(reviewSegundos)))}" role="button" tabindex="0" title="Ir al minuto ${escaparAtributoHtml(formatearSegundosVideo(reviewSegundos))}"`
        : '';
      return `
        <div class="review-event-row" ${seekAttrs}>
          <div class="min-w-0">
            <div class="fw-bold text-white">${index + 1}. ${escaparHtmlPlano(obtenerNombreJugadorActual(evento.goleador_id))}</div>
            <div class="small text-light-emphasis">
              Partido ${escaparHtmlPlano(formatearTiempoReview(evento.minuto))} - Minuto ${escaparHtmlPlano(formatearSegundosVideo(reviewSegundos))} - ${escaparHtmlPlano(asistencia)} - ${escaparHtmlPlano(cagada)}
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge ${evento.equipo === 1 ? 'bg-primary' : 'bg-danger'}">E${evento.equipo}</span>
            ${evento.es_en_contra ? '<span class="badge bg-warning text-dark">EC</span>' : ''}
            <button type="button" class="btn btn-sm btn-outline-danger" data-review-remove-event="${index}" title="Quitar gol">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    vincularFilasSeekReview(listEl);
    listEl.querySelectorAll('[data-review-remove-event]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        eventos.splice(Number(button.dataset.reviewRemoveEvent), 1);
        renderizarTablaGoles();
        actualizarMarcadorAutomatico();
        renderizarReviewSandbox();
      });
    });
  }

  function renderizarStatsReview(tipo) {
    const listId = tipo === 'atajadas' ? 'review-atajadas-list' : 'review-cagadas-list';
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const items = reviewSandbox[tipo];
    if (items.length === 0) {
      listEl.innerHTML = `<div class="review-empty">Sin ${tipo}</div>`;
      return;
    }

    listEl.innerHTML = items.map((item, index) => {
      const reviewSegundos = obtenerReviewSegundosDesdeEvento(item, item.minuto);
      const seekAttrs = tipo === 'atajadas' && Number.isFinite(Number(reviewSegundos))
        ? `data-review-seek-seconds="${Math.max(0, Math.round(Number(reviewSegundos)))}" role="button" tabindex="0" title="Ir al minuto ${escaparAtributoHtml(formatearSegundosVideo(reviewSegundos))}"`
        : '';
      return `
        <div class="review-stat-row" ${seekAttrs}>
          <div class="min-w-0">
            <div class="text-truncate">${escaparHtmlPlano(obtenerNombreJugadorActual(item.jugador_id))}</div>
            <div class="small text-light-emphasis">
              Partido ${escaparHtmlPlano(formatearTiempoReview(item.minuto))} - Minuto ${escaparHtmlPlano(formatearSegundosVideo(reviewSegundos))}
            </div>
          </div>
          <span class="d-flex align-items-center gap-2">
            <strong>${Number(item.cantidad) || 0}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger" data-review-remove-stat="${index}" data-review-stat-type="${tipo}" title="Quitar">
              <i class="bi bi-x"></i>
            </button>
          </span>
        </div>
      `;
    }).join('');

    vincularFilasSeekReview(listEl);
    listEl.querySelectorAll('[data-review-remove-stat]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        reviewSandbox[button.dataset.reviewStatType].splice(Number(button.dataset.reviewRemoveStat), 1);
        renderizarReviewSandbox();
      });
    });
  }

  function renderizarCompiladoReviewSandbox() {
    const listEl = document.getElementById('review-compilado-list');
    const countEl = document.getElementById('review-compilado-count');
    if (!listEl) return;

    const opcionesCompilado = normalizarOpcionesCompilado();
    const clips = construirClipsCompiladoSandbox(opcionesCompilado);
    if (countEl) countEl.textContent = clips.length;

    const reviewLink = normalizarReviewUrl(document.getElementById('review-link')?.value) ||
      normalizarReviewUrl(document.getElementById('youtube-link-partido')?.value) ||
      '';

    listEl.innerHTML = renderizarClipsCompiladoHtml(clips, reviewLink, opcionesCompilado);
  }

  function obtenerDatosCompiladoSandbox() {
    const opcionesCompilado = normalizarOpcionesCompilado();
    const clips = construirClipsCompiladoSandbox(opcionesCompilado);
    const reviewLink = normalizarReviewUrl(document.getElementById('review-link')?.value) ||
      normalizarReviewUrl(document.getElementById('youtube-link-partido')?.value) ||
      '';
    const fecha = document.getElementById('review-fecha')?.value || new Date().toISOString().slice(0, 10);
    return {
      clips,
      reviewLink,
      nombreBase: `compilado-t5-${fecha}`,
      opcionesCompilado
    };
  }

  function exportarCompiladoSandbox() {
    const { clips, reviewLink, nombreBase, opcionesCompilado } = obtenerDatosCompiladoSandbox();
    descargarJsonCompilado(clips, nombreBase, reviewLink, opcionesCompilado);
  }

  function obtenerValorReviewInput(id) {
    return document.getElementById(id)?.value || '';
  }

  function setValorReviewInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
  }

  function serializarJugadorReview(jugador) {
    if (!jugador?.id) return null;
    return {
      id: jugador.id,
      nombre: jugador.nombre || 'Jugador',
      pulmon: jugador.pulmon ?? null
    };
  }

  function crearPayloadAnalisisReviewSandbox() {
    const reviewLink = normalizarReviewUrl(obtenerValorReviewInput('review-link')) ||
      normalizarReviewUrl(obtenerValorReviewInput('youtube-link-partido')) ||
      '';
    const fecha = obtenerValorReviewInput('review-fecha') || new Date().toISOString().slice(0, 10);
    const marcador = calcularMarcadorEventos();
    const opcionesCompilado = normalizarOpcionesCompilado();

    return {
      formato: 't5-review-sandbox-v1',
      generado_en: new Date().toISOString(),
      review_link: reviewLink,
      partido: {
        fecha,
        cancha: obtenerValorReviewInput('review-cancha'),
        temporada_id: obtenerValorReviewInput('review-temporada'),
        resultado: obtenerValorReviewInput('review-resultado') || `${marcador.equipo1}-${marcador.equipo2}`,
        ganador: obtenerValorReviewInput('review-ganador'),
        inicio: {
          minuto: obtenerValorReviewInput('review-inicio-minuto'),
          segundo: obtenerValorReviewInput('review-inicio-segundo')
        }
      },
      equipos: {
        equipo1: equipo1.map(serializarJugadorReview).filter(Boolean),
        equipo2: equipo2.map(serializarJugadorReview).filter(Boolean)
      },
      eventos: eventos.map((evento, index) => ({
        orden: index + 1,
        goleador_id: evento.goleador_id,
        goleador_nombre: obtenerNombreJugadorActual(evento.goleador_id),
        asistencia_id: evento.asistencia_id || null,
        asistencia_nombre: evento.asistencia_id ? obtenerNombreJugadorActual(evento.asistencia_id) : null,
        cagada_id: evento.cagada_id || null,
        cagada_nombre: evento.cagada_id ? obtenerNombreJugadorActual(evento.cagada_id) : null,
        equipo: evento.equipo,
        es_en_contra: !!evento.es_en_contra,
        minuto: evento.minuto ?? null,
        review_segundos: obtenerReviewSegundosDesdeEvento(evento, evento.minuto)
      })),
      atajadas: reviewSandbox.atajadas.map((item, index) => ({
        orden: index + 1,
        jugador_id: item.jugador_id,
        jugador_nombre: obtenerNombreJugadorActual(item.jugador_id),
        cantidad: Number(item.cantidad) || 0,
        minuto: item.minuto ?? null,
        review_segundos: obtenerReviewSegundosDesdeEvento(item, item.minuto)
      })),
      cagadas: reviewSandbox.cagadas.map((item, index) => ({
        orden: index + 1,
        jugador_id: item.jugador_id,
        jugador_nombre: obtenerNombreJugadorActual(item.jugador_id),
        cantidad: Number(item.cantidad) || 0,
        minuto: item.minuto ?? null,
        review_segundos: obtenerReviewSegundosDesdeEvento(item, item.minuto)
      })),
      reconocimientos: {
        mvp_id: obtenerValorReviewInput('review-mvp') || null,
        ace_id: obtenerValorReviewInput('review-ace') || null
      },
      compilado: {
        atajadas_minimas: opcionesCompilado.atajadasMinimas
      },
      resumen: {
        marcador: `${marcador.equipo1}-${marcador.equipo2}`,
        goles: eventos.length,
        atajadas: reviewSandbox.atajadas.length,
        cagadas: reviewSandbox.cagadas.length,
        clips_compilado: construirClipsCompiladoSandbox(opcionesCompilado).length
      }
    };
  }

  function exportarAnalisisReviewSandbox() {
    const payload = crearPayloadAnalisisReviewSandbox();
    const fecha = payload.partido?.fecha || new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    descargarBlob(blob, `${normalizarNombreArchivo(`review-t5-${fecha}`)}.json`);
    showToast('Analisis de review exportado.', 'success');
  }

  function reconstruirJugadorReviewDesdeSnapshot(jugador) {
    const jugadorId = jugador?.id ?? jugador?.jugador_id ?? jugador?.jugadorId;
    if (!jugadorId) return null;
    const existente = todosLosJugadores.find(item => String(item.id) === String(jugadorId));
    const base = existente || {
      id: jugadorId,
      nombre: jugador?.nombre || jugador?.jugador_nombre || jugador?.jugadorNombre || 'Jugador',
      pulmon: jugador?.pulmon ?? null
    };
    return construirJugadorConEstadisticas(base);
  }

  function normalizarReviewSegundosImportado(item) {
    const directo = Number(item?.review_segundos ?? item?.reviewSegundos);
    return Number.isFinite(directo) ? Math.max(0, Math.round(directo)) : null;
  }

  function normalizarMinutoImportado(item) {
    const minuto = Number(item?.minuto ?? item?.minuto_partido ?? item?.minutoPartido);
    return Number.isFinite(minuto) ? minuto : null;
  }

  function normalizarEventoReviewImportado(item) {
    const goleadorId = item?.goleador_id ?? item?.goleadorId;
    if (!goleadorId) return null;
    const asistenciaId = item?.asistencia_id ?? item?.asistenciaId ?? null;
    const cagadaId = item?.cagada_id ?? item?.cagadaId ?? item?.cagada_jugador_id ?? null;
    const equipo = Number(item?.equipo) || obtenerEquipoJugadorActual(goleadorId) || 1;
    const evento = {
      goleador_id: goleadorId,
      asistencia_id: asistenciaId && asistenciaId !== 'nadie' ? asistenciaId : null,
      cagada_id: cagadaId && cagadaId !== 'nadie' ? cagadaId : null,
      equipo: equipo === 2 ? 2 : 1,
      es_en_contra: !!(item?.es_en_contra ?? item?.esEnContra),
      minuto: normalizarMinutoImportado(item)
    };
    const reviewSegundos = normalizarReviewSegundosImportado(item);
    if (reviewSegundos !== null) evento.review_segundos = reviewSegundos;
    return evento;
  }

  function normalizarStatReviewImportado(item) {
    const jugadorId = item?.jugador_id ?? item?.jugadorId;
    if (!jugadorId) return null;
    const cantidad = Number(item?.cantidad) || 0;
    if (cantidad <= 0) return null;
    const stat = {
      jugador_id: jugadorId,
      cantidad,
      minuto: normalizarMinutoImportado(item)
    };
    const reviewSegundos = normalizarReviewSegundosImportado(item);
    if (reviewSegundos !== null) stat.review_segundos = reviewSegundos;
    return stat;
  }

  function restaurarAnalisisReviewSandbox(data) {
    const payload = data?.formato === 't5-review-sandbox-v1' ? data : {
      review_link: data?.review_link || data?.reviewLink || '',
      partido: data?.partido || {},
      equipos: {
        equipo1: data?.equipo1 || data?.equipos?.equipo1 || [],
        equipo2: data?.equipo2 || data?.equipos?.equipo2 || []
      },
      eventos: data?.eventos || [],
      atajadas: data?.atajadas || [],
      cagadas: data?.cagadas || [],
      reconocimientos: {
        mvp_id: data?.mvpId || data?.reconocimientos?.mvp_id || null,
        ace_id: data?.aceId || data?.reconocimientos?.ace_id || null
      }
    };

    const partido = payload.partido || {};
    const inicio = partido.inicio || payload.inicio || {};
    const reconocimientos = payload.reconocimientos || {};
    const temporadaId = partido.temporada_id || partido.temporadaId || '';
    const mvpId = reconocimientos.mvp_id || reconocimientos.mvpId || '';
    const aceId = reconocimientos.ace_id || reconocimientos.aceId || '';

    equipo1 = (payload.equipos?.equipo1 || []).map(reconstruirJugadorReviewDesdeSnapshot).filter(Boolean);
    equipo2 = (payload.equipos?.equipo2 || []).map(reconstruirJugadorReviewDesdeSnapshot).filter(Boolean);
    window.equipo1 = equipo1;
    window.equipo2 = equipo2;

    eventos = (payload.eventos || []).map(normalizarEventoReviewImportado).filter(Boolean);
    reviewSandbox.atajadas = (payload.atajadas || []).map(normalizarStatReviewImportado).filter(Boolean);
    reviewSandbox.cagadas = (payload.cagadas || []).map(normalizarStatReviewImportado).filter(Boolean);

    const reviewLink = normalizarReviewUrl(payload.review_link || payload.reviewLink || '') || '';
    setValorReviewInput('review-link', reviewLink);
    setValorReviewInput('youtube-link-partido', obtenerLinkYouTubeReview(reviewLink));
    setValorReviewInput('review-fecha', partido.fecha || '');
    setValorReviewInput('review-cancha', partido.cancha || '');
    setValorReviewInput('review-temporada', temporadaId);
    setValorReviewInput('review-inicio-minuto', inicio.minuto ?? '');
    setValorReviewInput('review-inicio-segundo', inicio.segundo ?? '');
    setValorReviewInput('review-compilado-atajadas-min', Number(payload.compilado?.atajadas_minimas) === 5 ? '5' : '3');

    renderizarTablaGoles();
    actualizarMarcadorAutomatico();
    renderizarReviewSandbox();

    setValorReviewInput('review-temporada', temporadaId);
    setValorReviewInput('review-mvp', mvpId);
    setValorReviewInput('review-ace', aceId);
    setValorReviewInput('review-resultado', partido.resultado || obtenerValorReviewInput('review-resultado'));
    setValorReviewInput('review-ganador', partido.ganador || obtenerValorReviewInput('review-ganador'));
    updateSearchableSelects(document.getElementById('review-sandbox-content') || document);
    enviarEstadoAnotacionReview();
  }

  async function importarAnalisisReviewSandboxDesdeArchivo(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      restaurarAnalisisReviewSandbox(data);
      showToast('Analisis de review importado.', 'success');
    } catch (error) {
      console.error('No se pudo importar analisis de review:', error);
      showToast(`No se pudo importar el JSON: ${obtenerMensajeError(error)}`, 'error');
    }
  }

  async function generarCompiladoSandbox() {
    const { clips, nombreBase } = obtenerDatosCompiladoSandbox();
    const fileInput = document.getElementById('review-compilado-video');
    const statusEl = document.getElementById('review-compilado-status');
    const button = document.getElementById('review-build-compilado');
    const file = fileInput?.files?.[0] || null;

    if (button) button.disabled = true;
    try {
      await generarVideoCompiladoDesdeArchivo(file, clips, statusEl, nombreBase);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function generarCompiladoSandboxBeelup() {
    const { clips, reviewLink, nombreBase } = obtenerDatosCompiladoSandbox();
    const statusEl = document.getElementById('review-compilado-status');
    const button = document.getElementById('review-build-compilado-beelup');

    if (button) button.disabled = true;
    try {
      await generarMp4CompiladoDesdeBeelup(reviewLink, clips, statusEl, nombreBase);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderizarReviewSandbox() {
    if (!document.getElementById('review-sandbox-content')) return;

    const jugadoresOrdenados = [...todosLosJugadores].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const jugadoresPartido = jugadoresDelPartidoActual().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const disponibles = jugadoresOrdenados.filter(jugador => !obtenerEquipoJugadorActual(jugador.id));

    poblarTemporadasReviewSandbox();
    poblarSelectReview('review-jugador-select', disponibles, 'Seleccionar jugador');
    poblarSelectReview('review-goleador', jugadoresPartido, 'Goleador');
    poblarSelectReview('review-asistencia', jugadoresPartido, 'Sin asistencia');
    poblarSelectReview('review-cagada-gol', jugadoresPartido, 'Sin cagada');
    poblarSelectReview('review-mvp', jugadoresPartido, 'Sin MVP');
    poblarSelectReview('review-ace', jugadoresPartido, 'Sin ACE');
    poblarSelectReview('review-atajadas-jugador', jugadoresPartido, 'Jugador');
    poblarSelectReview('review-cagadas-jugador', jugadoresPartido, 'Jugador');
    initializeSearchableSelects(document.getElementById('review-sandbox-content'));

    renderizarEquipoReview('review-equipo1-list', 'equipo1', equipo1);
    renderizarEquipoReview('review-equipo2-list', 'equipo2', equipo2);
    renderizarEventosReview();
    renderizarStatsReview('atajadas');
    renderizarStatsReview('cagadas');
    renderizarCompiladoReviewSandbox();
    enviarEstadoAnotacionReview();
  }

  function agregarEventoReviewSandbox() {
    const goleadorId = document.getElementById('review-goleador')?.value || '';
    const asistenciaId = document.getElementById('review-asistencia')?.value || '';
    const cagadaId = document.getElementById('review-cagada-gol')?.value || '';
    const golEnContra = !!document.getElementById('review-gol-contra')?.checked;

    if (!goleadorId) {
      showToast('Selecciona un goleador.', 'warning');
      return;
    }

    const equipoGoleador = obtenerEquipoJugadorActual(goleadorId);
    if (!equipoGoleador) {
      showToast('El goleador debe estar en un equipo.', 'error');
      return;
    }

    let asistenciaFinal = asistenciaId || null;
    if (asistenciaFinal && asistenciaFinal === goleadorId) {
      showToast('Un jugador no puede asistirse a si mismo.', 'warning');
      asistenciaFinal = null;
    }

    const tiempoPartido = obtenerTiempoPartidoDesdeInputs('review-minuto', 'review-segundo');
    const minuto = tiempoPartido.minuto;
    const equipo = golEnContra ? (equipoGoleador === 1 ? 2 : 1) : equipoGoleador;

    eventos.push({
      goleador_id: goleadorId,
      asistencia_id: asistenciaFinal,
      cagada_id: cagadaId || null,
      equipo,
      es_en_contra: golEnContra,
      minuto,
      review_segundos: tiempoPartido.reviewSegundos
    });

    ['review-goleador', 'review-asistencia', 'review-cagada-gol'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    limpiarInputsTiempoReview(['review-minuto', 'review-segundo']);
    const contra = document.getElementById('review-gol-contra');
    if (contra) contra.checked = false;

    renderizarTablaGoles();
    actualizarMarcadorAutomatico();
    renderizarReviewSandbox();
  }

  function agregarStatReview(tipo) {
    const jugadorId = document.getElementById(tipo === 'atajadas' ? 'review-atajadas-jugador' : 'review-cagadas-jugador')?.value || '';
    const cantidadInput = document.getElementById(tipo === 'atajadas' ? 'review-atajadas-cantidad' : 'review-cagadas-cantidad');
    const cantidad = parseInt(cantidadInput?.value, 10) || 0;
    const tiempoPartido = tipo === 'atajadas'
      ? (obtenerTiempoPartidoDesdeReproductor() || { minuto: null, segundos: null, reviewSegundos: null })
      : obtenerTiempoPartidoDesdeInputs('review-cagadas-minuto', 'review-cagadas-segundo');

    if (!jugadorId || cantidad <= 0) {
      showToast('Selecciona jugador y cantidad mayor a cero.', 'warning');
      return;
    }

    const lista = reviewSandbox[tipo];
    lista.push({
      jugador_id: jugadorId,
      cantidad,
      minuto: tiempoPartido.minuto,
      review_segundos: tiempoPartido.reviewSegundos
    });

    if (cantidadInput) cantidadInput.value = '';
    if (tipo === 'cagadas') {
      limpiarInputsTiempoReview(['review-cagadas-minuto', 'review-cagadas-segundo']);
    }
    renderizarReviewSandbox();
  }

  function sincronizarMetricasReviewConFormulario(containerId, rowClass, selectClass, inputClass, items, removeFnName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const itemsAgrupados = agruparMetricasReview(items);
    const rows = itemsAgrupados.length > 0 ? itemsAgrupados : [{ jugador_id: '', cantidad: '' }];
    container.innerHTML = rows.map(() => `
      <div class="${rowClass} row g-2 mb-2">
        <div class="col-8">
          <select class="form-select form-select-sm ${selectClass}">
            <option value="">Seleccionar jugador</option>
          </select>
        </div>
        <div class="col-3">
          <input type="number" class="form-control form-control-sm ${inputClass}" placeholder="0" min="0">
        </div>
        <div class="col-1">
          <button type="button" class="btn btn-sm btn-outline-danger" onclick="${removeFnName}(this)">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    `).join('');

    poblarSelectoresDinamicos();

    container.querySelectorAll(`.${rowClass}`).forEach((row, index) => {
      const item = rows[index];
      const select = row.querySelector(`.${selectClass}`);
      const input = row.querySelector(`.${inputClass}`);
      if (select) select.value = item.jugador_id || '';
      if (input) input.value = item.cantidad || '';
    });
  }

  function sincronizarReviewConFormularioPrincipal() {
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? '';
    };

    const reviewLink = normalizarReviewUrl(document.getElementById('review-link')?.value) || '';
    if (reviewLink) {
      setValue('review-link', reviewLink);
    }

    setValue('fecha-partido', document.getElementById('review-fecha')?.value || document.getElementById('fecha-partido')?.value || '');
    setValue('cancha-partido', document.getElementById('review-cancha')?.value || document.getElementById('cancha-partido')?.value || '');
    setValue('resultado-final', document.getElementById('review-resultado')?.value || document.getElementById('resultado-final')?.value || '');
    setValue('equipo-ganador', document.getElementById('review-ganador')?.value || document.getElementById('equipo-ganador')?.value || '');
    setValue('temporada-partido', document.getElementById('review-temporada')?.value || document.getElementById('temporada-partido')?.value || '');
    setValue('youtube-link-partido', obtenerLinkYouTubeReview(reviewLink) || document.getElementById('youtube-link-partido')?.value || '');
    setValue('mvp-partido', document.getElementById('review-mvp')?.value || '');
    setValue('ace-partido', document.getElementById('review-ace')?.value || '');

    sincronizarMetricasReviewConFormulario(
      'atajadas-container',
      'atajadas-row',
      'atajadas-jugador',
      'atajadas-cantidad',
      reviewSandbox.atajadas,
      'eliminarAtajada'
    );
    sincronizarMetricasReviewConFormulario(
      'cagadas-container',
      'cagadas-row',
      'cagadas-jugador',
      'cagadas-cantidad',
      reviewSandbox.cagadas,
      'eliminarCagada'
    );
  }

  async function guardarPartidoReviewSandbox() {
    document.body.dataset.guardandoReviewSandbox = '1';
    try {
      sincronizarReviewConFormularioPrincipal();
      const guardadoOk = await cargarPartido();
      if (guardadoOk) {
        reviewSandbox.atajadas = [];
        reviewSandbox.cagadas = [];
        ['review-fecha', 'review-cancha', 'review-resultado', 'review-ganador', 'review-mvp', 'review-ace', 'review-inicio-minuto', 'review-inicio-segundo'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
        });
        renderizarReviewSandbox();
      }
    } finally {
      delete document.body.dataset.guardandoReviewSandbox;
    }
  }

  function initReviewSandbox() {
    if (!document.getElementById('review-sandbox-content')) return;
    if (document.body.dataset.reviewSandboxBound === '1') return;
    document.body.dataset.reviewSandboxBound = '1';
    inicializarCanalesPopupReview();
    inicializarScorebugReview();
    inicializarFullscreenReview();

    document.getElementById('review-load-link')?.addEventListener('click', cargarLinkReviewSandbox);
    document.getElementById('review-popup-link')?.addEventListener('click', abrirPopupReviewSandbox);
    document.getElementById('review-annotation-popup-link')?.addEventListener('click', abrirPopupAnotacionReview);
    document.getElementById('review-open-link')?.addEventListener('click', abrirLinkReviewSandbox);
    document.getElementById('review-add-equipo1')?.addEventListener('click', () => agregarJugadorAEquipoDesdeId('equipo1', document.getElementById('review-jugador-select')?.value));
    document.getElementById('review-add-equipo2')?.addEventListener('click', () => agregarJugadorAEquipoDesdeId('equipo2', document.getElementById('review-jugador-select')?.value));
    document.getElementById('review-add-gol')?.addEventListener('click', agregarEventoReviewSandbox);
    document.getElementById('review-add-atajadas')?.addEventListener('click', () => agregarStatReview('atajadas'));
    document.getElementById('review-add-cagadas')?.addEventListener('click', () => agregarStatReview('cagadas'));
    document.getElementById('review-save-partido')?.addEventListener('click', guardarPartidoReviewSandbox);
    document.getElementById('review-export-analysis')?.addEventListener('click', exportarAnalisisReviewSandbox);
    document.getElementById('review-import-analysis')?.addEventListener('click', () => {
      document.getElementById('review-import-analysis-file')?.click();
    });
    document.getElementById('review-import-analysis-file')?.addEventListener('change', async event => {
      const input = event.currentTarget;
      await importarAnalisisReviewSandboxDesdeArchivo(input?.files?.[0] || null);
      if (input) input.value = '';
    });
    document.getElementById('review-export-compilado')?.addEventListener('click', exportarCompiladoSandbox);
    document.getElementById('review-build-compilado-beelup')?.addEventListener('click', generarCompiladoSandboxBeelup);
    document.getElementById('review-build-compilado')?.addEventListener('click', generarCompiladoSandbox);
    document.getElementById('review-compilado-atajadas-min')?.addEventListener('change', renderizarCompiladoReviewSandbox);
    ['review-inicio-minuto', 'review-inicio-segundo'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        renderizarEventosReview();
        renderizarStatsReview('atajadas');
        renderizarStatsReview('cagadas');
        renderizarCompiladoReviewSandbox();
        actualizarEstadoPopupReview();
      });
    });

    const tab = document.getElementById('review-sandbox-tab');
    if (tab) {
      tab.addEventListener('shown.bs.tab', () => {
        const fecha = document.getElementById('review-fecha');
        if (fecha && !fecha.value) {
          fecha.value = new Date().toISOString().slice(0, 10);
        }
        renderizarReviewSandbox();
      });
    }

    window.renderizarReviewSandbox = renderizarReviewSandbox;
    renderizarReviewSandbox();
  }

  // Funciones para agregar/eliminar filas dinámicas
  window.agregarAtajada = function() {
    const container = document.getElementById('atajadas-container');
    const nuevaFila = document.createElement('div');
    nuevaFila.className = 'atajadas-row row g-2 mb-2';

    nuevaFila.innerHTML = `
      <div class="col-8">
        <select class="form-select form-select-sm atajadas-jugador searchable-select">
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
        <select class="form-select form-select-sm cagadas-jugador searchable-select">
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
      renderizarEquipos().catch(error => {
        console.error('Error al renderizar equipos:', error);
      });
      renderizarReviewSandbox();
  };

  window.quitarEvento = (index) => {
      eventos.splice(index, 1);
      renderizarTablaGoles();
      actualizarMarcadorAutomatico();
      renderizarReviewSandbox();
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
    renderizarEquipos().catch(error => {
      console.error('Error al renderizar equipos:', error);
    });
  };

  function agregarEvento() {
      const goleador_id = document.getElementById('goleador').value;
      const asistencia_id = document.getElementById('asistencia').value;
      const cagada_id = document.getElementById('cagada-gol').value;
      const golEnContraChecked = document.getElementById('gol-en-contra').checked;

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

      // Determinar equipo del goleador (1 si está en equipo1, 2 si está en equipo2)
      const equipoGoleador = equipo1.find(j => j.id === goleador_id) ? 1 : 2;

      // Si es gol en contra, el gol se asigna al equipo contrario
      const equipo = golEnContraChecked ? (equipoGoleador === 1 ? 2 : 1) : equipoGoleador;

      // Asegurar que el asistidor no sea el mismo que el goleador
      let asistencia_final = null;
      if (asistencia_id && asistencia_id !== 'nadie' && asistencia_id !== goleador_id) {
          asistencia_final = asistencia_id;
      }

      let cagada_final = null;
      if (cagada_id && cagada_id !== 'nadie') {
          cagada_final = cagada_id;
      }

      // Capturar minuto y segundo, convertir a minutos decimales
      const minutoInput = document.getElementById('minuto-gol');
      const segundoInput = document.getElementById('segundo-gol');

      const minutos = minutoInput && minutoInput.value ? parseInt(minutoInput.value) : 0;
      const segundos = segundoInput && segundoInput.value ? parseInt(segundoInput.value) : 0;

      // Convertir a minutos decimales (ej: 5:30 = 5.5, 15:45 = 15.75)
      const tiempoEnMinutos = (minutos > 0 || segundos > 0) ? (minutos + segundos / 60) : null;

      // Marcar explícitamente si es gol en contra para claridad
      eventos.push({
          goleador_id,
          asistencia_id: asistencia_final,
          cagada_id: cagada_final,
          equipo,
          es_en_contra: golEnContraChecked, // Agregar esta marca para claridad
          minuto: tiempoEnMinutos  // Guardamos el tiempo en minutos decimales
      });

      const goleadorNombre = goleador.nombre;
      const asistidorNombre = asistencia_final
          ? jugadoresDelPartido.find(j => j.id === asistencia_final)?.nombre || 'N/A'
          : null;
      const cagadaNombre = cagada_final
          ? jugadoresDelPartido.find(j => j.id === cagada_final)?.nombre || 'N/A'
          : null;

      // Crear mensaje indicando si es gol en contra
      const tipoGol = golEnContraChecked ? ' (EN CONTRA)' : '';
      const detalles = [];
      if (asistidorNombre) detalles.push(`Asist: ${asistidorNombre}`);
      if (cagadaNombre) detalles.push(`Cagada: ${cagadaNombre}`);
      const mensaje = detalles.length > 0
          ? `Gol agregado: ${goleadorNombre}${tipoGol} (${detalles.join(' | ')})`
          : `Gol agregado: ${goleadorNombre}${tipoGol}`;

      showToast(mensaje, golEnContraChecked ? 'warning' : 'success');
      renderizarTablaGoles();
      actualizarMarcadorAutomatico();
      renderizarReviewSandbox();

      // Resetear inputs (tanto selectores como inputs buscables)
      const goleadorElement = document.getElementById('goleador');
      const asistenciaElement = document.getElementById('asistencia');
      const cagadaElement = document.getElementById('cagada-gol');

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

      if (cagadaElement) {
        if (cagadaElement.style.display === 'none') {
          const inputCagada = document.getElementById('cagada-gol_input');
          if (inputCagada) inputCagada.value = '';
        } else {
          cagadaElement.selectedIndex = 0;
        }
      }

      // Resetear checkbox de gol en contra
      const golEnContraElement = document.getElementById('gol-en-contra');
      if (golEnContraElement) {
        golEnContraElement.checked = false;
      }

      // Resetear campos de minuto y segundo
      const minutoElement = document.getElementById('minuto-gol');
      const segundoElement = document.getElementById('segundo-gol');
      if (minutoElement) {
        minutoElement.value = '';
      }
      if (segundoElement) {
        segundoElement.value = '';
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

  async function insertarPartidoConFallbackReview(partidoData) {
      let { data, error } = await supabase
          .from('partidos')
          .insert([partidoData])
          .select()
          .single();

      if (error && Object.prototype.hasOwnProperty.call(partidoData, 'review_inicio_segundos') && esErrorColumnaFaltante(error, 'review_inicio_segundos')) {
          console.warn('La columna partidos.review_inicio_segundos no existe. Reintentando sin ese campo...');
          const { review_inicio_segundos, ...partidoSinReviewInicio } = partidoData;

          const reintento = await supabase
              .from('partidos')
              .insert([partidoSinReviewInicio])
              .select()
              .single();

          data = reintento.data;
          error = reintento.error;

          if (!error) {
              showToast('Partido guardado, pero falta partidos.review_inicio_segundos. Ejecuta review_events_schema.sql.', 'warning');
          }
      }

      return { data, error };
  }

  async function insertarGolesConFallbackReview(golesData) {
      const columnasOpcionalesOmitidas = new Set();
      let golesError = null;

      for (let intento = 0; intento < 3; intento += 1) {
          const payload = golesData.map(gol => {
              const copia = { ...gol };
              columnasOpcionalesOmitidas.forEach(columna => {
                  delete copia[columna];
              });
              return copia;
          });

          const { error } = await supabase
              .from('goles')
              .insert(payload);

          golesError = error;
          if (!golesError) {
              if (columnasOpcionalesOmitidas.has('cagada_jugador_id')) {
                  showToast('Se guardaron los goles, pero falta la columna cagada_jugador_id. Ejecuta add_cagada_jugador_id.sql.', 'warning');
              }
              if (columnasOpcionalesOmitidas.has('review_segundos')) {
                  showToast('Se guardaron los goles, pero falta goles.review_segundos. Ejecuta review_events_schema.sql.', 'warning');
              }
              return null;
          }

          const columnaFaltante = ['cagada_jugador_id', 'review_segundos'].find(columna =>
              !columnasOpcionalesOmitidas.has(columna) && esErrorColumnaFaltante(golesError, columna)
          );

          if (!columnaFaltante) {
              return golesError;
          }

          console.warn(`La columna goles.${columnaFaltante} no existe. Reintentando sin ese campo...`);
          columnasOpcionalesOmitidas.add(columnaFaltante);
      }

      return golesError;
  }

  function construirReviewEventosPartido(partidoId, reviewInicioSegundos, { mvpId = null, aceId = null } = {}) {
      const filas = [];
      const reviewInicio = Number(reviewInicioSegundos) || 0;

      const agregarFila = (tipo, jugadorId, minutoPartido, cantidad = 1, metadata = {}) => {
          if (!jugadorId) return;
          const cantidadNormalizada = Math.max(1, Number(cantidad) || 1);
          const reviewSegundosDirecto = Number(metadata.review_segundos);
          const reviewSegundos = Number.isFinite(reviewSegundosDirecto)
              ? Math.max(0, Math.round(reviewSegundosDirecto))
              : calcularReviewSegundosDesdeMinuto(minutoPartido, reviewInicio);
          const configCompilado = obtenerConfigCompilado(tipo, cantidadNormalizada);
          const compilado = configCompilado.incluir && reviewSegundos !== null && reviewSegundos !== undefined
              ? {
                  incluir: true,
                  pre_segundos: configCompilado.pre,
                  post_segundos: configCompilado.post,
                  inicio_segundos: Math.max(0, Math.round(reviewSegundos - configCompilado.pre)),
                  fin_segundos: Math.max(0, Math.round(reviewSegundos + configCompilado.post))
              }
              : {
                  incluir: false
              };

          filas.push({
              partido_id: partidoId,
              jugador_id: jugadorId,
              tipo,
              cantidad: cantidadNormalizada,
              minuto_partido: minutoPartido !== null && minutoPartido !== undefined ? minutoPartido : null,
              review_segundos: reviewSegundos,
              metadata: {
                  ...metadata,
                  review_segundos_capturado: Number.isFinite(reviewSegundosDirecto),
                  review_inicio_segundos: reviewInicio,
                  compilado
              }
          });
      };

      eventos.forEach((evento, index) => {
          const reviewSegundos = obtenerReviewSegundosDesdeEvento(evento, evento.minuto);
          const goleadorNombre = obtenerNombreJugadorActual(evento.goleador_id);
          const asistenciaNombre = evento.asistencia_id ? obtenerNombreJugadorActual(evento.asistencia_id) : null;
          const cagadaNombre = evento.cagada_id ? obtenerNombreJugadorActual(evento.cagada_id) : null;
          const metadataBase = {
              origen: 'review_sandbox',
              orden: index + 1,
              equipo: evento.equipo,
              es_gol_en_contra: !!evento.es_en_contra,
              review_segundos: reviewSegundos,
              goleador_id: evento.goleador_id,
              goleador_nombre: goleadorNombre,
              asistidor_id: evento.asistencia_id || null,
              asistencia_id: evento.asistencia_id || null,
              asistencia_nombre: asistenciaNombre,
              cagada_jugador_id: evento.cagada_id || null,
              cagada_id: evento.cagada_id || null,
              cagada_jugador_nombre: cagadaNombre,
              cagada_nombre: cagadaNombre,
              ...calcularMarcadorHastaCompilado(reviewSegundos, evento.minuto, eventos)
          };

          agregarFila('gol', evento.goleador_id, evento.minuto, 1, {
              ...metadataBase,
              asistidor_id: evento.asistencia_id || null,
              asistencia_nombre: asistenciaNombre,
              cagada_jugador_id: evento.cagada_id || null,
              cagada_jugador_nombre: cagadaNombre
          });

          if (evento.asistencia_id) {
              agregarFila('asistencia', evento.asistencia_id, evento.minuto, 1, {
                  ...metadataBase,
                  goleador_id: evento.goleador_id,
                  goleador_nombre: goleadorNombre
              });
          }

          if (evento.cagada_id) {
              agregarFila('cagada_gol', evento.cagada_id, evento.minuto, 1, {
                  ...metadataBase,
                  goleador_id: evento.goleador_id,
                  goleador_nombre: goleadorNombre,
                  cagada_jugador_id: evento.cagada_id,
                  cagada_jugador_nombre: cagadaNombre,
                  cagada_nombre: cagadaNombre
              });
          }
      });

      reviewSandbox.atajadas.forEach((item, index) => {
          const reviewSegundos = obtenerReviewSegundosDesdeEvento(item, item.minuto);
          const jugadorNombre = obtenerNombreJugadorActual(item.jugador_id);
          agregarFila('atajadas', item.jugador_id, item.minuto, item.cantidad, {
              origen: 'review_sandbox',
              orden: index + 1,
              review_segundos: reviewSegundos,
              atajadas_jugador_id: item.jugador_id,
              atajadas_jugador_nombre: jugadorNombre,
              ...calcularMarcadorHastaCompilado(reviewSegundos, item.minuto, eventos)
          });
      });

      reviewSandbox.cagadas.forEach((item, index) => {
          const reviewSegundos = obtenerReviewSegundosDesdeEvento(item, item.minuto);
          const jugadorNombre = obtenerNombreJugadorActual(item.jugador_id);
          agregarFila('cagada', item.jugador_id, item.minuto, item.cantidad, {
              origen: 'review_sandbox',
              orden: index + 1,
              review_segundos: reviewSegundos,
              cagada_jugador_id: item.jugador_id,
              cagada_jugador_nombre: jugadorNombre,
              cagada_nombre: jugadorNombre,
              ...calcularMarcadorHastaCompilado(reviewSegundos, item.minuto, eventos)
          });
      });

      if (mvpId) {
          agregarFila('mvp', mvpId, null, 1, { origen: 'review_sandbox', sin_momento: true });
      }

      if (aceId) {
          agregarFila('ace', aceId, null, 1, { origen: 'review_sandbox', sin_momento: true });
      }

      return filas;
  }

  async function guardarReviewEventosPartido(partidoId, reviewInicioSegundos, opciones = {}) {
      const reviewEventos = construirReviewEventosPartido(partidoId, reviewInicioSegundos, opciones);
      if (reviewEventos.length === 0) return;

      const { error } = await supabase
          .from('review_eventos')
          .insert(reviewEventos);

      if (!error) {
          console.log('Eventos de review guardados:', reviewEventos.length);
          return;
      }

      if (esErrorTablaFaltante(error, 'review_eventos')) {
          console.warn('La tabla review_eventos no existe. Ejecuta review_events_schema.sql.', error);
          showToast('Partido guardado, pero falta review_eventos. Ejecuta review_events_schema.sql para guardar timestamps de review.', 'warning');
          return;
      }

      console.error('Error al guardar eventos de review:', error);
      throw new Error(`Error al guardar eventos de review: ${error.message}`);
  }

  async function cargarPartido() {
      // Verificar permisos de administrador
      if (!verificarPermisosAdmin('guardar un partido')) {
          return false;
      }

      const fecha = document.getElementById('fecha-partido').value;
      const cancha = document.getElementById('cancha-partido').value;
      const resultado = document.getElementById('resultado-final').value;
      const equipoGanadorSelect = document.getElementById('equipo-ganador');
      const equipo_ganador = equipoGanadorSelect ? equipoGanadorSelect.value : null;
      const temporadaPartidoSelect = document.getElementById('temporada-partido');
      const temporada_id = temporadaPartidoSelect ? temporadaPartidoSelect.value : null;
      const youtubeLinkInput = document.getElementById('youtube-link-partido').value.trim();
      const youtube_link = youtubeLinkInput ? obtenerLinkYouTubeReview(youtubeLinkInput) : null;
      const guardandoDesdeReview = document.body.dataset.guardandoReviewSandbox === '1';
      const review_inicio_segundos = guardandoDesdeReview ? obtenerReviewInicioSegundos() : null;

      if (!fecha || !cancha || !resultado || !equipo_ganador) {
          showToast('Completa todos los datos del partido (fecha, cancha, resultado, equipo ganador).', 'warning');
          return false;
      }

      if (!temporada_id) {
          showToast('Debes seleccionar una temporada para el partido.', 'warning');
          return false;
      }

      if (youtubeLinkInput && !youtube_link) {
          showToast('El link de review para Historial debe ser de YouTube.', 'warning');
          return false;
      }

      if (equipo1.length === 0 || equipo2.length === 0) {
          showToast('Debes tener jugadores en ambos equipos para guardar el partido.', 'warning');
          return false;
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
              equipo_ganador: parseInt(equipo_ganador), // 0 = empate, 1 = equipo1, 2 = equipo2
              temporada_id: temporada_id,
              youtube_link: youtube_link
          };

          if (guardandoDesdeReview) {
              partidoData.review_inicio_segundos = review_inicio_segundos;
          }

          console.log('Guardando partido:', partidoData);

          // Insertar partido en Supabase
          const { data: partidoInsertado, error: partidoError } = await insertarPartidoConFallbackReview(partidoData);

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

          // Insertar TODOS los goles (incluidos los en contra con flag especial)
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

                  let cagada_jugador_id = null;
                  if (evento.cagada_id &&
                      evento.cagada_id !== 'nadie' &&
                      evento.cagada_id !== '') {
                      cagada_jugador_id = evento.cagada_id;
                  }

                  // Determinar si es gol en contra
                  const equipoRealGoleador = equipo1.find(j => j.id === evento.goleador_id) ? 1 : 2;
                  const esGolEnContra = evento.es_en_contra || (evento.equipo !== equipoRealGoleador);

                  return {
                      partido_id: partido_id,
                      goleador_id: evento.goleador_id,
                      asistidor_id: asistidor_id,
                      cagada_jugador_id: cagada_jugador_id,
                      equipo: evento.equipo,
                      es_gol_en_contra: esGolEnContra, // Nueva columna
                      minuto: evento.minuto !== undefined ? evento.minuto : null
                  };

                  if (guardandoDesdeReview) {
                      const reviewSegundosEvento = Number(evento.review_segundos);
                      golData.review_segundos = Number.isFinite(reviewSegundosEvento)
                          ? Math.max(0, Math.round(reviewSegundosEvento))
                          : calcularReviewSegundosDesdeMinuto(golData.minuto, review_inicio_segundos);
                  }

                  return golData;
              });

              // Contar goles normales vs en contra para logging
              const golesNormales = golesData.filter(g => !g.es_gol_en_contra);
              const golesEnContra = golesData.filter(g => g.es_gol_en_contra);

              console.log(`📊 Total goles: ${golesData.length} | Normales: ${golesNormales.length} | En contra: ${golesEnContra.length}`);

              if (golesEnContra.length > 0) {
                  console.log('🔄 Goles en contra que se guardarán con flag especial:',
                      golesEnContra.map(g => {
                          const goleadorNombre = [...equipo1, ...equipo2].find(j => j.id === g.goleador_id)?.nombre || 'N/A';
                          return `${goleadorNombre} → Equipo ${g.equipo}`;
                      }));
              }

              let golesError = await insertarGolesConFallbackReview(golesData);

              if (golesError && esErrorColumnaCagadaFaltante(golesError)) {
                  console.warn('⚠️ La columna goles.cagada_jugador_id no existe. Reintentando sin ese campo...');
                  const golesSinCagada = golesData.map(({ cagada_jugador_id, ...resto }) => resto);

                  const { error: reintentoError } = await supabase
                      .from('goles')
                      .insert(golesSinCagada);

                  golesError = reintentoError;

                  if (!golesError) {
                      showToast('Se guardaron los goles, pero falta la columna cagada_jugador_id. Ejecutá add_cagada_jugador_id.sql.', 'warning');
                  }
              }

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

              console.log('✅ Todos los goles insertados en la DB:', golesData.length);

              if (golesEnContra.length > 0) {
                  showToast(`🔄 ${golesEnContra.length} gol(es) en contra registrados (aparecen en historial)`, 'info');
              }
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

          if (guardandoDesdeReview) {
              await guardarReviewEventosPartido(partido_id, review_inicio_segundos, {
                  mvpId: mvp_id,
                  aceId: ace_id
              });
          }

          // Éxito!
          showToast('¡Partido guardado exitosamente! 🎉', 'success');

          // Limpiar formulario
          document.getElementById('fecha-partido').value = '';
          document.getElementById('cancha-partido').value = '';
          document.getElementById('resultado-final').value = '';
          document.getElementById('equipo-ganador').value = '';
          // Volver a seleccionar Temporada 3 como default
          const temporada3 = todasLasTemporadas.find(t => t.nombre === 'Temporada 3');
          document.getElementById('temporada-partido').value = temporada3?.id || '';
          document.getElementById('mvp-partido').value = '';
          document.getElementById('ace-partido').value = '';
          document.getElementById('youtube-link-partido').value = '';

          // Limpiar eventos
          eventos.length = 0;
          renderizarTablaGoles();

          // Limpiar inputs buscables
          const inputGoleador = document.getElementById('goleador_input');
          const inputAsistencia = document.getElementById('asistencia_input');
          const inputCagada = document.getElementById('cagada-gol_input');
          if (inputGoleador) inputGoleador.value = '';
          if (inputAsistencia) inputAsistencia.value = '';
          if (inputCagada) inputCagada.value = '';

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

    // Determina a qué equipo se le suma un gol, con fallback para datos viejos.
    const obtenerEquipoGolEnPartido = (gol, jugadoresPartido = []) => {
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
    };

    // Suma, por jugador, cuántos goles hizo y recibió su equipo en los partidos que jugó.
    const calcularGolesEquipoPorJugador = (partidos = []) => {
      const resultado = {};

      partidos.forEach(partido => {
        const jugadoresPartido = partido.jugador_partido || [];

        let golesEquipo1 = 0;
        let golesEquipo2 = 0;

        (partido.goles || []).forEach(gol => {
          const equipoGol = obtenerEquipoGolEnPartido(gol, jugadoresPartido);
          if (equipoGol === 1) golesEquipo1 += 1;
          if (equipoGol === 2) golesEquipo2 += 1;
        });

        jugadoresPartido.forEach(jp => {
          if (!resultado[jp.jugador_id]) {
            resultado[jp.jugador_id] = {
              goles_favor_equipo: 0,
              goles_recibidos_equipo: 0
            };
          }

          if (jp.equipo === 1) {
            resultado[jp.jugador_id].goles_favor_equipo += golesEquipo1;
            resultado[jp.jugador_id].goles_recibidos_equipo += golesEquipo2;
          } else if (jp.equipo === 2) {
            resultado[jp.jugador_id].goles_favor_equipo += golesEquipo2;
            resultado[jp.jugador_id].goles_recibidos_equipo += golesEquipo1;
          }
        });
      });

      return resultado;
    };

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
              goles_en_contra,
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

          // Calcular goles de equipo (a favor/recibidos) por jugador para la temporada seleccionada.
          const { data: partidosTempData, error: partidosTempError } = await supabase
            .from('partidos')
            .select(`
              id,
              temporada_id,
              jugador_partido (
                jugador_id,
                equipo
              ),
              goles (
                id,
                goleador_id,
                equipo,
                es_gol_en_contra
              )
            `)
            .eq('temporada_id', temporadaSeleccionada);

          if (partidosTempError) {
            console.warn('⚠️ No se pudieron calcular goles de equipo para temporada 1:', partidosTempError);
          }

          const golesEquipoPorJugador = partidosTempError
            ? {}
            : calcularGolesEquipoPorJugador(partidosTempData || []);

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
              const golesEquipoJugador = golesEquipoPorJugador[jugadorData.jugador_id] || {
                goles_favor_equipo: 0,
                goles_recibidos_equipo: 0
              };

              const stats = {
                total_puntos: jugadorData.total_puntos || 0,
                pj: jugadorData.pj || 0,
                pg: jugadorData.pg || 0,
                pe: jugadorData.pe || 0,
                pp: jugadorData.pp || 0,
                goles: jugadorData.goles || 0,
                goles_en_contra: jugadorData.goles_en_contra || 0,
                goles_favor_equipo: golesEquipoJugador.goles_favor_equipo || 0,
                goles_recibidos_equipo: golesEquipoJugador.goles_recibidos_equipo || 0,
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
            id,
            goleador_id,
            asistidor_id,
            equipo,
            es_gol_en_contra
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
        const jugadoresPartido = partido.jugador_partido || [];

        let golesEquipo1 = 0;
        let golesEquipo2 = 0;
        partido.goles?.forEach(gol => {
          const equipoGol = obtenerEquipoGolEnPartido(gol, jugadoresPartido);
          if (equipoGol === 1) golesEquipo1 += 1;
          if (equipoGol === 2) golesEquipo2 += 1;
        });

        // Procesar cada jugador que participó en este partido
        jugadoresPartido.forEach(jp => {
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
              goles_en_contra: 0,
              goles_favor_equipo: 0,
              goles_recibidos_equipo: 0,
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
            stats.total_puntos += 3; // Victoria = 3 puntos
          } else if (equipoGanador === null || equipoGanador === 0) {
            stats.pe += 1;
            stats.total_puntos += 1; // Empate = 1 punto (NO es derrota)
          } else {
            stats.pp += 1;
            // Derrota = 0 puntos
          }

          // Goles del equipo del jugador en este partido
          if (jp.equipo === 1) {
            stats.goles_favor_equipo += golesEquipo1;
            stats.goles_recibidos_equipo += golesEquipo2;
          } else if (jp.equipo === 2) {
            stats.goles_favor_equipo += golesEquipo2;
            stats.goles_recibidos_equipo += golesEquipo1;
          }

          // Sumar estadísticas individuales (SIN goles y asistencias aún)
          stats.cagadas_en_gol += jp.cagadas || 0;
          stats.atajadas += jp.atajadas || 0;
          stats.mvp_count += jp.mvp ? 1 : 0;
          stats.ace_count += jp.ace ? 1 : 0;
          stats.capitan_defeat += jp.capitan_defeat ? 1 : 0;
          stats.bita_defeat += jp.bita_defeat ? 1 : 0;
        });

        // Procesar goles del partido para contar goles y asistencias (INCLUIR goles en contra por separado)
        partido.goles?.forEach(gol => {
          if (gol.es_gol_en_contra) {
            // Contar gol en contra para el goleador
            if (gol.goleador_id && jugadoresStats[gol.goleador_id]) {
              jugadoresStats[gol.goleador_id].goles_en_contra = (jugadoresStats[gol.goleador_id].goles_en_contra || 0) + 1;
            }
          } else {
            // Contar gol normal para el goleador
            if (gol.goleador_id && jugadoresStats[gol.goleador_id]) {
              jugadoresStats[gol.goleador_id].goles += 1;
            }

            // Contar asistencia para el asistidor (solo en goles normales)
            if (gol.asistidor_id && jugadoresStats[gol.asistidor_id]) {
              jugadoresStats[gol.asistidor_id].asistencias += 1;
            }
          }
        });
      });

      // Calcular winrate para cada jugador (empates valen 1 punto)
      Object.values(jugadoresStats).forEach(stats => {
        const puntosObtenidos = (stats.pg * 3) + (stats.pe * 1); // Victoria=3pts, Empate=1pt, Derrota=0pts
        const puntosTotalesDisputados = stats.pj * 3; // Puntos máximos posibles
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
        goles_favor_equipo: 0,
        goles_recibidos_equipo: 0,
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
        goles_favor_equipo: jugadorData.goles_favor_equipo || 0,
        goles_recibidos_equipo: jugadorData.goles_recibidos_equipo || 0,
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
          } else if (equipoGanador !== null && equipoGanador !== 0) {
            // Derrota
            rachaActualDerrota++;
            rachaActualVictorias = 0;
            mejorRachaDerrota = Math.max(mejorRachaDerrota, rachaActualDerrota);
          } else {
            // Empate rompe cualquier racha - no cuenta como victoria ni derrota
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
          } else if (equipoGanador === null || equipoGanador === 0) {
            resultado = 'draw';
          } else {
            resultado = 'defeat';
          }

          // Lógica de racha - Los empates NO cuentan para rachas
          if (rachaActual === 0) {
            // Primer partido, establecer tipo de racha
            if (resultado === 'win') {
              tipoRacha = 'win';
              rachaActual = 1;
            } else if (resultado === 'defeat') {
              tipoRacha = 'defeat';
              rachaActual = 1;
            } else {
              // Empate rompe cualquier racha potencial - empates no son rachas
              break;
            }
          } else {
            // Continuar racha existente
            if ((tipoRacha === 'win' && resultado === 'win') ||
                (tipoRacha === 'defeat' && resultado === 'defeat')) {
              rachaActual++;
            } else {
              // La racha se rompió (incluyendo empates)
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

    const obtenerNumeroEstadistica = (value) => {
      const numero = Number(value);
      return Number.isFinite(numero) ? numero : 0;
    };

    const obtenerTonoWinrate = (value) => {
      const val = obtenerNumeroEstadistica(value);
      if (val >= 60) return 'high';
      if (val >= 40) return 'mid';
      return 'low';
    };

    const renderizarPuntosTabla = (value) => {
      const val = obtenerNumeroEstadistica(value);
      return `
        <span class="stats-score" title="${val} puntos">
          <span class="stats-score-value">${val}</span>
          <span class="stats-score-label">PTS</span>
        </span>
      `;
    };

    const renderizarWinrateTabla = (value) => {
      const val = obtenerNumeroEstadistica(value);
      const ancho = Math.max(0, Math.min(100, val));
      return `
        <span class="stats-winrate-chip stats-tone-${obtenerTonoWinrate(val)}" title="${val}% winrate">
          <span class="stats-winrate-top">
            <span class="stats-winrate-value">${val}</span>
            <span class="stats-winrate-label">%</span>
          </span>
          <span class="stats-winrate-bar"><span style="width: ${ancho}%;"></span></span>
        </span>
      `;
    };

    const renderizarMetricaTabla = (value, label, tone = 'neutral') => {
      const val = obtenerNumeroEstadistica(value);
      return `
        <span class="stats-metric stats-metric-${tone}" title="${label}: ${val}">
          <span class="stats-metric-value">${val}</span>
          <span class="stats-metric-label">${label}</span>
        </span>
      `;
    };

    const renderizarNumeroTabla = (value, tone, decimals = 0, title = '') => {
      const val = obtenerNumeroEstadistica(value);
      const texto = decimals > 0 ? val.toFixed(decimals) : String(val);
      const zeroClass = val === 0 ? ' stats-zero' : '';
      const titleAttr = title ? ` title="${title}"` : '';
      return `<span class="stats-number stats-number-${tone}${zeroClass}"${titleAttr}>${texto}</span>`;
    };

    const renderizarMetricaBotonTabla = (value, label, tone, onClick, title = '') => {
      const val = obtenerNumeroEstadistica(value);
      const titleAttr = title ? ` title="${title}"` : ` title="${label}: ${val}"`;
      return `
        <button type="button" class="stats-metric stats-metric-${tone} stats-drill-button" onclick="${onClick}"${titleAttr}>
          <span class="stats-metric-value">${val}</span>
          <span class="stats-metric-label">${label}</span>
        </button>
      `;
    };

    const renderizarNumeroBotonTabla = (value, tone, onClick, decimals = 0, title = '') => {
      const val = obtenerNumeroEstadistica(value);
      const texto = decimals > 0 ? val.toFixed(decimals) : String(val);
      const zeroClass = val === 0 ? ' stats-zero' : '';
      const titleAttr = title ? ` title="${title}"` : '';
      return `<button type="button" class="stats-number stats-number-${tone}${zeroClass} stats-drill-button" onclick="${onClick}"${titleAttr}>${texto}</button>`;
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
      const rendArquero = atajadasPP * 0.66;

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
      const golesFavorEquipoPP = calcularPromedioPorPartido(jugadorData, 'goles_favor_equipo');
      const golesRecibidosEquipoPP = calcularPromedioPorPartido(jugadorData, 'goles_recibidos_equipo');

      const posicion = index + 1;
      let positionClass = 'position-other';
      if (posicion === 1) positionClass = 'position-1';
      else if (posicion === 2) positionClass = 'position-2';
      else if (posicion === 3) positionClass = 'position-3';

      const skillIndividual = calcularSkillIndividual(jugadorData);
      const colorSkill = obtenerColorSkill(skillIndividual);
      const jugadorIdArg = escaparTextoParaJs(jugadorData.jugadores.id);
      const historialClick = (resultado = '') => `event.stopPropagation(); irAHistorialJugadorRanking('${jugadorIdArg}', '${resultado}')`;
      const perfilClick = (tabId) => `event.stopPropagation(); irAPerfilJugadorTab('${jugadorIdArg}', '${tabId}')`;

      tr.classList.add('stats-row');
      tr.innerHTML = `
        <td class="text-center stats-col-rank stats-sticky stats-sticky-rank">
          <div class="position-badge ${positionClass}">${posicion}</div>
        </td>
        <td class="text-center stats-col-skill stats-sticky stats-sticky-skill">
          <span class="stats-skill-badge ${colorSkill}" title="Skill individual">
            ${skillIndividual.toFixed(1)}
          </span>
        </td>
        <td class="fw-bold stats-player-cell stats-col-player stats-sticky stats-sticky-player">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div class="flex-grow-1" style="min-width: 0;">
              <div class="text-truncate me-1">${renderizarAccesoPerfilJugador(jugadorData.jugadores.id, jugadorData.jugadores.nombre, 'text-white fw-bold text-start d-inline-block w-100 text-truncate')}</div>
            </div>
            ${crearIconoRacha(jugadorData.jugadores.id)}
          </div>
        </td>
        <td class="text-center stats-col-points">${renderizarPuntosTabla(jugadorData.total_puntos)}</td>
        <td class="text-center stats-col-winrate">${renderizarWinrateTabla(jugadorData.winrate)}</td>
        <td class="text-center stats-col-pj">${renderizarMetricaBotonTabla(jugadorData.pj, 'PJ', 'neutral', historialClick(), 'Ver partidos jugados en Historial')}</td>
        <td class="text-center stats-col-record">${renderizarMetricaBotonTabla(jugadorData.pg, 'PG', 'win', historialClick('ganado'), 'Ver partidos ganados en Historial')}</td>
        <td class="text-center stats-col-record">${renderizarMetricaBotonTabla(jugadorData.pe, 'E', 'draw', historialClick('empate'), 'Ver partidos empatados en Historial')}</td>
        <td class="text-center stats-col-record">${renderizarMetricaBotonTabla(jugadorData.pp, 'PP', 'loss', historialClick('perdido'), 'Ver partidos perdidos en Historial')}</td>
        <td class="text-center stats-col-goals">${renderizarNumeroBotonTabla(jugadorData.goles, 'goals', perfilClick('tab-perfil-videos'), 0, 'Ver goles del jugador')}</td>
        <td class="text-center stats-col-assists">${renderizarNumeroBotonTabla(jugadorData.asistencias, 'assists', perfilClick('tab-perfil-asistencias'), 0, 'Ver asistencias del jugador')}</td>
        <td class="text-center stats-col-mistakes">${renderizarNumeroBotonTabla(jugadorData.cagadas_en_gol, 'mistakes', perfilClick('tab-perfil-cagadas'), 0, 'Ver cagadas del jugador')}</td>
        <td class="text-center stats-col-badge">${renderizarNumeroTabla(jugadorData.mvp_count, 'assists')}</td>
        <td class="text-center stats-col-badge">${renderizarNumeroTabla(jugadorData.ace_count, 'saves')}</td>
        <td class="text-center stats-col-saves">${renderizarNumeroTabla(jugadorData.atajadas, 'saves')}</td>
        <td class="text-center stats-col-team">${renderizarNumeroTabla(golesFavorEquipoPP, 'team-for', 2, `${jugadorData.goles_favor_equipo || 0} goles del equipo en ${jugadorData.pj || 0} partidos`)}</td>
        <td class="text-center stats-col-team">${renderizarNumeroTabla(golesRecibidosEquipoPP, 'team-against', 2, `${jugadorData.goles_recibidos_equipo || 0} goles recibidos del equipo en ${jugadorData.pj || 0} partidos`)}</td>
        <td class="text-center stats-col-actions">
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

    // Actualizar campeones después de renderizar la tabla
    setTimeout(async () => {
      if (typeof window.actualizarCampeonesEnEstadisticas === 'function') {
        await window.actualizarCampeonesEnEstadisticas();
      }
    }, 500);
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
      renderizarEquipos().catch(error => {
        console.error('Error al renderizar equipos:', error);
      }); // Actualizar equipos si hay jugadores cargados

    } catch (error) {
      console.error('Error al procesar jugador:', error);
      const accion = jugadorEditando ? 'actualizar' : 'agregar';
      showToast(`Error al ${accion} el jugador: ${error.message}`, 'error');
    }
  });
  }

  // Función para agregar un nuevo jugador
  async function agregarJugador(nombre, posicionPrimaria, posicionSecundaria, pulmon = null) {
    // Verificar permisos de administrador
    if (!verificarPermisosAdmin('agregar un jugador')) {
        return;
    }

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
    // Verificar permisos de administrador
    if (!verificarPermisosAdmin('editar un jugador')) {
        return;
    }

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
      const valorCantidad = cantidadElement?.value || '5';
      const cantidad = (valorCantidad === 'all') ? null : (parseInt(valorCantidad) || 5);

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
              nombre,
              jugador_posicion (
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
            minuto,
            es_gol_en_contra
          )
        `);

      // Aplicar filtro de temporada si está seleccionada
      if (temporadaSeleccionada && temporadaSeleccionada !== '') {
        console.log('🏆 Aplicando filtro de temporada:', temporadaSeleccionada);
        query = query.eq('temporada_id', temporadaSeleccionada);
      }

      // Aplicar orden y límite
      let ejecutar = query.order('fecha', { ascending: false });
      if (typeof cantidad === 'number' && cantidad > 0) {
        ejecutar = ejecutar.limit(cantidad);
      }
      const { data: partidos, error } = await ejecutar;

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

      // Poblar selectores de filtro
      if (typeof poblarFiltrosHistorial === 'function') poblarFiltrosHistorial();

      // Aplicar filtros avanzados
      filtrarPartidosAvanzado();

      if (partidoHistorialPendiente) {
        const partidoIdPendiente = partidoHistorialPendiente;
        partidoHistorialPendiente = null;
        window.requestAnimationFrame(() => {
          destacarPartidoEnHistorial(partidoIdPendiente);
        });
      }

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

  // Función de test para verificar funcionalidad del link de YouTube
  window.testYouTubeLink = async function() {
    try {
      console.log('🧪 Iniciando test completo de funcionalidad YouTube...');

      // Verificar si hay temporadas
      const { data: temporadas } = await supabase.from('temporadas').select('id').limit(1);
      let temporadaId = temporadas?.[0]?.id || null;

      if (!temporadaId) {
        // Crear una temporada si no existe
        const { data: nuevaTemporada } = await supabase
          .from('temporadas')
          .insert([{ nombre: 'Test YouTube', fecha_inicio: '2024-01-01', fecha_fin: '2024-12-31' }])
          .select()
          .single();
        temporadaId = nuevaTemporada?.id;
      }

      // 1. Crear un partido SIN link de YouTube
      const partidoTest = {
        fecha: '2024-01-15',
        cancha: 'Cancha Test',
        resultado: '5-3',
        equipo_ganador: 1,
        temporada_id: temporadaId
      };

      console.log('📝 Creando partido de test sin YouTube link...');
      const { data: partidoCreado, error: errorCrear } = await supabase
        .from('partidos')
        .insert([partidoTest])
        .select()
        .single();

      if (errorCrear) {
        throw new Error(`Error al crear partido de test: ${errorCrear.message}`);
      }

      console.log('✅ Partido de test creado:', partidoCreado.id);

      // 2. Verificar que se creó sin link
      const { data: partidoVerificar, error: errorVerificar } = await supabase
        .from('partidos')
        .select('id, youtube_link')
        .eq('id', partidoCreado.id)
        .single();

      if (errorVerificar) {
        throw new Error(`Error al verificar partido: ${errorVerificar.message}`);
      }

      if (partidoVerificar.youtube_link !== null) {
        throw new Error('El partido debería crearse sin link de YouTube');
      }

      console.log('✅ Partido creado sin link - correcto');

      // 3. Simular la función editarYouTubeLink (agregar link)
      const linkInicial = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

      console.log('📹 Simulando agregar link de YouTube...');
      const { error: errorAgregar } = await supabase
        .from('partidos')
        .update({ youtube_link: linkInicial })
        .eq('id', partidoCreado.id);

      if (errorAgregar) {
        throw new Error(`Error al agregar link: ${errorAgregar.message}`);
      }

      // 4. Verificar que el link se agregó correctamente
      const { data: partidoConLink, error: errorVerificarLink } = await supabase
        .from('partidos')
        .select('id, youtube_link')
        .eq('id', partidoCreado.id)
        .single();

      if (errorVerificarLink) {
        throw new Error(`Error al verificar link agregado: ${errorVerificarLink.message}`);
      }

      if (partidoConLink.youtube_link !== linkInicial) {
        throw new Error('El link de YouTube no se agregó correctamente');
      }

      console.log('✅ Link de YouTube agregado correctamente');

      // 5. Simular la edición del link (cambiar link)
      const nuevoLink = 'https://www.youtube.com/watch?v=abc123test';

      console.log('✏️ Simulando edición del link...');
      const { error: errorEditar } = await supabase
        .from('partidos')
        .update({ youtube_link: nuevoLink })
        .eq('id', partidoCreado.id);

      if (errorEditar) {
        throw new Error(`Error al editar link: ${errorEditar.message}`);
      }

      // 6. Verificar que la edición funcionó
      const { data: partidoEditado, error: errorVerificarEdicion } = await supabase
        .from('partidos')
        .select('id, youtube_link')
        .eq('id', partidoCreado.id)
        .single();

      if (errorVerificarEdicion) {
        throw new Error(`Error al verificar edición: ${errorVerificarEdicion.message}`);
      }

      if (partidoEditado.youtube_link !== nuevoLink) {
        throw new Error('La edición del link no funcionó correctamente');
      }

      console.log('✅ Edición de link verificada correctamente');

      // 7. Simular eliminación del link (establecer a null)
      console.log('🗑️ Simulando eliminación del link...');
      const { error: errorEliminarLink } = await supabase
        .from('partidos')
        .update({ youtube_link: null })
        .eq('id', partidoCreado.id);

      if (errorEliminarLink) {
        throw new Error(`Error al eliminar link: ${errorEliminarLink.message}`);
      }

      // 8. Verificar que el link se eliminó
      const { data: partidoSinLink, error: errorVerificarEliminacion } = await supabase
        .from('partidos')
        .select('id, youtube_link')
        .eq('id', partidoCreado.id)
        .single();

      if (errorVerificarEliminacion) {
        throw new Error(`Error al verificar eliminación: ${errorVerificarEliminacion.message}`);
      }

      if (partidoSinLink.youtube_link !== null) {
        throw new Error('La eliminación del link no funcionó correctamente');
      }

      console.log('✅ Eliminación de link verificada correctamente');

      // 9. Limpiar: eliminar el partido de test
      const { error: errorEliminar } = await supabase
        .from('partidos')
        .delete()
        .eq('id', partidoCreado.id);

      if (errorEliminar) {
        console.warn('⚠️ No se pudo eliminar el partido de test:', errorEliminar.message);
      } else {
        console.log('🗑️ Partido de test eliminado');
      }

      // 10. Mostrar resultado exitoso
      showToast('🎉 ¡Test completo de YouTube completado exitosamente!', 'success');
      console.log('✅ Test completo de funcionalidad YouTube EXITOSO');
      console.log('📋 Funcionalidades verificadas:');
      console.log('   • Crear partido sin link ✅');
      console.log('   • Agregar link de YouTube ✅');
      console.log('   • Editar link existente ✅');
      console.log('   • Eliminar link ✅');
      console.log('   • Modal específico para YouTube ✅');

      // Recargar historial para asegurar que todo esté actualizado
      cargarHistorialPartidos();

    } catch (error) {
      console.error('❌ Error en test de YouTube:', error);
      showToast(`❌ Test fallido: ${error.message}`, 'error');
    }
  };

  // Hacer la función de test global para poder ejecutarla desde consola
  console.log('🧪 Función de test disponible: window.testYouTubeLink()');
  console.log('💡 Para probar la funcionalidad ejecuta: testYouTubeLink()');

  // Función de debug para verificar estado de administrador
  window.debugAdmin = function() {
    console.log('🔍 Estado de administrador:');
    console.log('  esAdmin:', esAdmin);
    console.log('  usuarioActual:', usuarioActual);
    console.log('  Permisos de admin para test:', verificarPermisosAdmin('operación de test'));

    if (esAdmin) {
      console.log('✅ Eres administrador - deberías ver todos los botones');
    } else {
      console.log('❌ No eres administrador - solo verás botones de visualización');
      console.log('💡 Para ser admin, inicia sesión primero');
    }
  };

  console.log('🔍 Función de debug disponible: window.debugAdmin()');

  async function mostrarPartidosBasicos(container, partidos) {
    console.log('🎨 Mostrando partidos con detalles completos:', partidos);

    const calcularSkillPartido = ({
      goles = 0,
      asistencias = 0,
      mvp = 0,
      ace = 0,
      cagadas = 0,
      puntos = 0,
      atajadas = 0
    } = {}) => {
      const rendAtaque = (goles * 5) + (mvp * 7) + (ace * 6) + (asistencias * 4) - (cagadas * 5) + (puntos * 2);
      const rendArquero = atajadas * 0.4;
      return rendAtaque + rendArquero;
    };

    const PENALIZACION_DEFENSOR_POR_GOL = 1.5;
    const UMBRAL_TENDENCIA_SKILL = 0.75;
    const UMBRAL_SKILL_REFERENCIA = 0.5;

    const obtenerPosicionPrimariaJugador = (jugador) => {
      const posiciones = jugador?.jugador_posicion || [];
      const primaria = posiciones.find(pos => pos.es_primaria);
      return primaria?.posicion?.nombre || null;
    };

    const esDefensor = (jugador) => obtenerPosicionPrimariaJugador(jugador) === 'Defensor';

    const obtenerSkillEsperadoJugador = (jugadorId) => {
      try {
        const datos = window.datosJugadores || [];
        const estadisticas = datos.find(dj => dj.jugadores?.id === jugadorId || dj.id === jugadorId);
        if (!estadisticas) return null;

        const pj = estadisticas.pj || 1;
        const golesPP = (estadisticas.goles || 0) / pj;
        const mvpPP = (estadisticas.mvp_count || 0) / pj;
        const acePP = (estadisticas.ace_count || 0) / pj;
        const asistPP = (estadisticas.asistencias || 0) / pj;
        const cagadasPP = (estadisticas.cagadas_en_gol || 0) / pj;
        const puntosPP = (estadisticas.total_puntos || 0) / pj;
        const atajadasPP = (estadisticas.atajadas || 0) / pj;

        const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
        const rendArquero = atajadasPP * 0.4;

        return rendAtaque + rendArquero;
      } catch (e) {
        console.warn('Error obteniendo skill esperado para jugador', jugadorId, e);
        return null;
      }
    };
    const datosRanking = Array.isArray(window.datosJugadores) ? window.datosJugadores : [];
    const skillRankingMap = new Map();

    const calcularSkillReferencia = (jugadorStats) => {
      const pj = jugadorStats.pj || 1;
      const golesPP = (jugadorStats.goles || 0) / pj;
      const mvpPP = (jugadorStats.mvp_count || 0) / pj;
      const acePP = (jugadorStats.ace_count || 0) / pj;
      const asistPP = (jugadorStats.asistencias || 0) / pj;
      const cagadasPP = (jugadorStats.cagadas_en_gol || 0) / pj;
      const puntosPP = (jugadorStats.total_puntos || 0) / pj;
      const atajadasPP = (jugadorStats.atajadas || 0) / pj;

      const rendAtaque = (golesPP * 5) + (mvpPP * 7) + (acePP * 6) + (asistPP * 4) - (cagadasPP * 5) + (puntosPP * 2);
      const rendArquero = atajadasPP * 0.66;
      return rendAtaque + rendArquero;
    };

    datosRanking.forEach(jugador => {
      const jugadorId = jugador.jugadores?.id || jugador.id || jugador.jugador_id;
      if (!jugadorId) return;
      const skill = calcularSkillReferencia(jugador);
      skillRankingMap.set(jugadorId, skill);
    });

    const obtenerSkillReferencia = (jugadorId) => {
      if (!jugadorId) return null;
      return skillRankingMap.get(jugadorId) ?? null;
    };

    let html = '<div class="row g-4">';

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
      const promedioAtajadasJugador = (partido.jugador_partido && partido.jugador_partido.length)
        ? totalAtajadas / partido.jugador_partido.length
        : 0;

      const statsJugadorCache = new Map();

      const obtenerStatsJugadorPartido = (jp) => {
        if (statsJugadorCache.has(jp.jugador_id)) {
          return statsJugadorCache.get(jp.jugador_id);
        }

        const golesDelJugador = partido.goles?.filter(gol =>
          gol.goleador_id === jp.jugador_id && gol.equipo === jp.equipo
        ) || [];

        const asistenciasDelJugador = partido.goles?.filter(gol =>
          gol.asistidor_id === jp.jugador_id && gol.equipo === jp.equipo
        ) || [];

        const golesJugador = golesDelJugador.length;
        const asistenciasJugador = asistenciasDelJugador.length;

        let skill = calcularSkillPartido({
          goles: golesJugador,
          asistencias: asistenciasJugador,
          mvp: jp.mvp ? 1 : 0,
          ace: jp.ace ? 1 : 0,
          cagadas: jp.cagadas || 0,
          puntos: jp.puntos || 0,
          atajadas: jp.atajadas || 0
        });

        const perdioPartido = (partido.equipo_ganador === 1 || partido.equipo_ganador === 2) && partido.equipo_ganador !== jp.equipo;
        const aportaAtaque = (golesJugador + asistenciasJugador) > 0;
        const atajaSobrePromedio = (jp.atajadas || 0) > promedioAtajadasJugador;

        if (esDefensor(jp.jugadores) && !aportaAtaque && perdioPartido && !atajaSobrePromedio) {
          const golesRecibidos = jp.equipo === 1 ? golesEquipo2 : golesEquipo1;
          skill -= golesRecibidos * PENALIZACION_DEFENSOR_POR_GOL;
        }

        const skillEsperado = obtenerSkillEsperadoJugador(jp.jugador_id);
        let tendencia = '=';
        if (skillEsperado !== null && Number.isFinite(skillEsperado)) {
          if (skill > skillEsperado + UMBRAL_TENDENCIA_SKILL) tendencia = '↑';
          else if (skill < skillEsperado - UMBRAL_TENDENCIA_SKILL) tendencia = '↓';
        }

        const dataJugador = { golesJugador, asistenciasJugador, golesDelJugador, asistenciasDelJugador, skill, tendencia };
        statsJugadorCache.set(jp.jugador_id, dataJugador);
        return dataJugador;
      };

      const skillValoresPartido = (partido.jugador_partido || []).map(jp => obtenerStatsJugadorPartido(jp).skill);
      const promedioSkill = skillValoresPartido.length
        ? skillValoresPartido.reduce((acc, val) => acc + val, 0) / skillValoresPartido.length
        : 0;

      const skillEquipo = (jugadores) => {
        if (!jugadores || jugadores.length === 0) return 0;
        const total = jugadores.reduce((sum, jp) => sum + (obtenerStatsJugadorPartido(jp).skill || 0), 0);
        return total / jugadores.length;
      };

      const skillEquipo1 = skillEquipo(equipo1);
      const skillEquipo2 = skillEquipo(equipo2);
      const youtubeReviewLink = obtenerLinkYouTubeReview(partido.youtube_link);

      html += `
        <div class="col-lg-6 col-md-12">
          <div class="glass-effect rounded-3 p-4 h-100 border-top border-3 ${colorCard} partido-card" data-partido-id="${partido.id}">
            <!-- Header del partido -->
            <div class="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h5 class="text-white fw-bold mb-1 d-flex align-items-center gap-2">
                  ${iconoResultado} Partido #${partidos.length - index}
                  <span style="cursor:pointer" onclick="mostrarGolesPartido('${partido.id}')" title="Click para ver repeticion de los goles" class="badge bg-danger bg-opacity-75 fw-normal" role="button">
                    <i class="bi bi-camera-video me-1"></i><em>Ver repeticion de los goles</em>
                  </span>
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
                  ${youtubeReviewLink ? `
                    <a href="${youtubeReviewLink}" target="_blank" class="btn btn-sm btn-outline-danger" title="Ver review en YouTube">
                      <i class="bi bi-camera-video"></i>
                    </a>
                  ` : ''}
                  ${partido.youtube_link ? `
                    <button onclick="mostrarCompiladoPartido('${partido.id}')" class="btn btn-sm btn-outline-success" title="Ver compilado">
                      <i class="bi bi-scissors"></i>
                    </button>
                  ` : ''}
                  ${esAdmin ? `
                    <button onclick="editarYouTubeLink('${partido.id}', '${(partido.youtube_link || '').replace(/'/g, "\\'")}')" class="btn btn-sm btn-outline-info" title="Editar link de review">
                      <i class="bi bi-camera-video"></i>
                    </button>
                    <button onclick="console.log('🖱️ CLICK detectado en botón editar'); editarPartido('${partido.id}')" class="btn btn-sm btn-outline-warning" title="Editar partido completo">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button onclick="eliminarPartido('${partido.id}')" class="btn btn-sm btn-outline-danger" title="Eliminar partido">
                      <i class="bi bi-trash"></i>
                    </button>
                  ` : ''}
                </div>
                ${equipoGanador !== 'Empate' ? `<div class="text-success small fw-bold">🏆 ${equipoGanador}</div>` : '<div class="text-warning small fw-bold">🤝 Empate</div>'}
              </div>
            </div>

            <!-- Equipos -->
            <div class="row g-3 mb-3">
              <div class="col-6">
                <div class="bg-primary bg-opacity-10 rounded-2 p-2">
                  <h6 class="text-primary fw-bold mb-2 small">🔵 Equipo 1 (${equipo1.length}) — Skill ${skillEquipo1.toFixed(1)}</h6>
                  <div class="text-white small">
                    ${equipo1.map(jp => {
                      const { golesDelJugador, asistenciasDelJugador, skill, tendencia } = obtenerStatsJugadorPartido(jp);

                      const stats = [];
                      if (golesDelJugador.length > 0) {
                        stats.push(generarIconosConLinks(golesDelJugador, youtubeReviewLink, 'gol'));
                      }
                      if (asistenciasDelJugador.length > 0) {
                        stats.push(generarIconosConLinks(asistenciasDelJugador, youtubeReviewLink, 'asistencia'));
                      }
                      if (jp.atajadas > 0) stats.push(`🥅${jp.atajadas}`);
                      if (jp.cagadas > 0) stats.push(`💥${jp.cagadas}`);
                      const iconoTendencia = tendencia === '↑' ? '↑' : (tendencia === '↓' ? '↓' : '=');
                      const skillLabel = Number.isFinite(skill)
                        ? `<span class="ms-1 ${skill >= promedioSkill ? 'text-success' : 'text-danger'}">${skill.toFixed(1)} ${iconoTendencia}</span>`
                        : '';

                      return `
                        <div class="mb-1 d-flex justify-content-between align-items-center">
                          <span>
                            ${renderizarAccesoPerfilJugador(jp.jugador_id, jp.jugadores?.nombre || 'Jugador', 'text-white fw-semibold text-start align-baseline')}
                            ${skillLabel}
                            <button class="btn btn-sm btn-outline-warning ms-2"
                                    title="Forzar pase en Mundialito"
                                    onclick="forzarMonedaDesdeHistorial('${partido.id}', '${jp.jugador_id}', '${(jp.jugadores?.nombre || 'Jugador').replace(/'/g, "\\'").replace(/"/g, '\\"')}', '${partido.temporada_id ?? ''}')">
                              🪙
                            </button>
                          </span>
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
                  <h6 class="text-danger fw-bold mb-2 small">🔴 Equipo 2 (${equipo2.length}) — Skill ${skillEquipo2.toFixed(1)}</h6>
                  <div class="text-white small">
                    ${equipo2.map(jp => {
                      const { golesDelJugador, asistenciasDelJugador, skill, tendencia } = obtenerStatsJugadorPartido(jp);

                      const stats = [];
                      if (golesDelJugador.length > 0) {
                        stats.push(generarIconosConLinks(golesDelJugador, youtubeReviewLink, 'gol'));
                      }
                      if (asistenciasDelJugador.length > 0) {
                        stats.push(generarIconosConLinks(asistenciasDelJugador, youtubeReviewLink, 'asistencia'));
                      }
                      if (jp.atajadas > 0) stats.push(`🥅${jp.atajadas}`);
                      if (jp.cagadas > 0) stats.push(`💥${jp.cagadas}`);
                      const iconoTendencia = tendencia === '↑' ? '↑' : (tendencia === '↓' ? '↓' : '=');
                      const skillLabel = Number.isFinite(skill)
                        ? `<span class="ms-1 ${skill >= promedioSkill ? 'text-success' : 'text-danger'}">${skill.toFixed(1)} ${iconoTendencia}</span>`
                        : '';

                      return `
                        <div class="mb-1 d-flex justify-content-between align-items-center">
                          <span>
                            ${renderizarAccesoPerfilJugador(jp.jugador_id, jp.jugadores?.nombre || 'Jugador', 'text-white fw-semibold text-start align-baseline')}
                            ${skillLabel}
                            <button class="btn btn-sm btn-outline-warning ms-2"
                                    title="Forzar pase en Mundialito"
                                    onclick="forzarMonedaDesdeHistorial('${partido.id}', '${jp.jugador_id}', '${(jp.jugadores?.nombre || 'Jugador').replace(/'/g, "\\'").replace(/"/g, '\\"')}', '${partido.temporada_id ?? ''}')">
                              🪙
                            </button>
                          </span>
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

            <!-- Leyenda del Mundialito para este partido -->
            ${typeof generarLeyendaMundialito === 'function' ? generarLeyendaMundialito(partido) : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // Función para generar la leyenda del mundialito para un partido específico
  const generarLeyendaMundialito = (partido) => {
    try {
      // Verificar que tenemos datos válidos
      if (!partido || !partido.jugador_partido || partido.jugador_partido.length === 0) {
        return '';
      }

      // Simular el mundialito hasta este partido para obtener cambios
      const cambios = simularMundialitoHastaPartido(partido);

      if (!cambios || cambios.length === 0) {
        return '';
      }

      const clasificados = cambios.filter(c => c.tipo === 'clasificado');
      const eliminados = cambios.filter(c => c.tipo === 'eliminado');

      if (clasificados.length === 0 && eliminados.length === 0) {
        return '';
      }

      let leyendaHtml = '<div class="mt-3 pt-2 border-top border-secondary">';
      leyendaHtml += '<div class="small text-light-emphasis mb-2"><i class="bi bi-trophy me-1"></i><strong>Mundialito T5:</strong></div>';

      if (clasificados.length > 0) {
        leyendaHtml += '<div class="d-flex flex-wrap gap-1 mb-1">';
        clasificados.forEach(c => {
          const icono = c.fase === 'campeon' ? '👑' : '✅';
          const faseTexto = c.fase === 'campeon' ? 'Campeón' :
                           c.fase === 'final' ? 'Final' :
                           c.fase === 'semis' ? 'Semis' :
                           c.fase === '4tos' ? 'Cuartos' :
                           c.fase === '8vos' ? '8vos' : c.fase;
          leyendaHtml += `<span class="badge bg-success small">${icono} ${c.jugador} → ${faseTexto}</span>`;
        });
        leyendaHtml += '</div>';
      }

      if (eliminados.length > 0) {
        leyendaHtml += '<div class="d-flex flex-wrap gap-1">';
        eliminados.forEach(e => {
          const faseTexto = e.fase === 'grupos' ? 'Grupos' :
                           e.fase === 'final' ? 'Final' :
                           e.fase === 'semis' ? 'Semis' :
                           e.fase === '4tos' ? 'Cuartos' :
                           e.fase === '8vos' ? '8vos' : e.fase;
          leyendaHtml += `<span class="badge bg-danger small">❌ ${e.jugador} (${faseTexto})</span>`;
        });
        leyendaHtml += '</div>';
      }

      leyendaHtml += '</div>';
      return leyendaHtml;
    } catch (error) {
      console.warn('Error generando leyenda mundialito:', error);
      return ''; // Retornar string vacío en caso de error
    }
  };

  // Función para simular el mundialito hasta un partido específico
  const simularMundialitoHastaPartido = (partidoObjetivo) => {
    try {
      // Si no hay partidos del mundialito cargados, no mostrar leyenda
      if (!mundialPartidos || mundialPartidos.length === 0) return [];

      // Filtrar partidos solo de la temporada del partido objetivo
      const temporadaObjetivo = partidoObjetivo.temporada_id;
      const partidosTemporada = mundialPartidos.filter(p =>
        p.temporada_id === temporadaObjetivo
      );

      if (partidosTemporada.length === 0) return [];

      // Crear un Map temporal para la simulación
      const jugadoresTemp = new Map();

      // Procesar partidos hasta encontrar el partido objetivo
      for (const partido of partidosTemporada) {
        if (partido.id === partidoObjetivo.id) {
          // Procesar este partido y retornar los cambios
          const cambios = procesarPartidoMundialTemp(partido, jugadoresTemp);
          return cambios;
        } else {
          // Procesar partido sin registrar cambios
          procesarPartidoMundialTemp(partido, jugadoresTemp);
        }
      }

      return [];
    } catch (error) {
      console.warn('Error simulando mundialito para historial:', error);
      return [];
    }
  };

  // Versión temporal de procesarPartidoMundial para simulación
  const procesarPartidoMundialTemp = (partido, jugadoresMap) => {
    if (!partido.jugador_partido) return [];

    const cambiosFase = [];

    partido.jugador_partido.forEach(jp => {
      const jugadorId = jp.jugador_id;
      let jugador = jugadoresMap.get(jugadorId);

      if (!jugador) {
        jugador = crearJugadorMundial({
          id: jugadorId,
          nombre: jp.jugadores?.nombre || `Jugador ${jugadorId}`
        });
        jugadoresMap.set(jugadorId, jugador);
      }

      if (jugador.fase === 'campeon') {
        resetearAGruposTemp(jugador);
      }

      const resultado = determinarResultadoJugador(partido, jugadorId);
      if (!resultado) return;

      const faseAnterior = jugador.fase;

      jugador.ultimoPartido = {
        id: partido.id,
        fecha: partido.fecha,
        resultado: resultado
      };

      // Misma lógica que procesarPartidoMundial pero registrando cambios
      if (jugador.fase === 'grupos') {
        jugador.partidosGrupos++;

        if (resultado === 'victoria') {
          jugador.victoriasGrupos++;
          jugador.victorias++;
        } else if (resultado === 'empate') {
          jugador.empatesGrupos++;
          jugador.empates++;
        } else if (resultado === 'derrota') {
          jugador.derrotasGrupos++;
          jugador.derrotas++;
        }

        if (jugador.derrotasGrupos >= 2) {
          resetearAGruposTemp(jugador);
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'eliminado',
            fase: 'grupos',
            razon: '2 derrotas'
          });
        }
        else if (jugador.partidosGrupos >= 3) {
          const pasa = evaluarPaseGrupos(jugador);
          if (pasa) {
            jugador.fase = '8vos';
            const fueMoneda = (jugador.victoriasGrupos === 1 && jugador.empatesGrupos === 1 && jugador.derrotasGrupos === 1);
            cambiosFase.push({
              jugador: jugador.nombre,
              tipo: 'clasificado',
              fase: '8vos',
              razon: fueMoneda ? 'moneda' : '1V+2E'
            });
          } else {
            resetearAGruposTemp(jugador);
            const fueMoneda = (jugador.victoriasGrupos === 1 && jugador.empatesGrupos === 1 && jugador.derrotasGrupos === 1);
            cambiosFase.push({
              jugador: jugador.nombre,
              tipo: 'eliminado',
              fase: 'grupos',
              razon: fueMoneda ? 'moneda' : 'no clasificó'
            });
          }
        }
      } else {
        const pasa = evaluarPasePlayoffs(jugador, resultado);

        if (resultado === 'victoria') {
          jugador.victorias++;
        } else if (resultado === 'empate') {
          jugador.empates++;
        } else if (resultado === 'derrota') {
          jugador.derrotas++;
        }

        if (pasa) {
          const faseAnterior = jugador.fase;

          if (jugador.fase === '8vos') {
            jugador.fase = '4tos';
          } else if (jugador.fase === '4tos') {
            jugador.fase = 'semis';
          } else if (jugador.fase === 'semis') {
            jugador.fase = 'final';
          } else if (jugador.fase === 'final') {
            jugador.fase = 'campeon';
            jugador.campeon = true;
          }

          const fueMoneda = (resultado === 'empate' && jugador.bonusCount === 0);
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'clasificado',
            fase: jugador.fase,
            razon: fueMoneda ? 'moneda' : resultado
          });
        } else {
          const faseAnterior = jugador.fase;
          resetearAGruposTemp(jugador);
          const fueMoneda = (resultado === 'empate' && jugador.bonusCount === 0);
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'eliminado',
            fase: faseAnterior,
            razon: fueMoneda ? 'moneda' : resultado
          });
        }
      }
    });

    return cambiosFase;
  };

  // Versión temporal de resetearAGrupos
  const resetearAGruposTemp = (jugador) => {
    jugador.fase = 'grupos';
    jugador.victorias = 0;
    jugador.derrotas = 0;
    jugador.empates = 0;
    jugador.partidosGrupos = 0;
    jugador.victoriasGrupos = 0;
    jugador.empatesGrupos = 0;
    jugador.derrotasGrupos = 0;
    jugador.bonusCount = 0;
  };

  const obtenerPartidosReferenciaMundialito = async (partidoId, temporadaId) => {
    if (Array.isArray(mundialPartidos) && mundialPartidos.some(partido => String(partido.id) === String(partidoId))) {
      return mundialPartidos;
    }

    return cargarPartidosMundialito(temporadaId);
  };

  const resolverContextoMonedaMundialito = (partidosTemporada, partidoId, jugadorId) => {
    if (!Array.isArray(partidosTemporada) || partidosTemporada.length === 0) {
      return null;
    }

    const jugadoresTemp = new Map();

    for (const partido of partidosTemporada) {
      const jugadorPartido = (partido.jugador_partido || []).find(
        jp => String(jp.jugador_id) === String(jugadorId)
      );

      if (!jugadorPartido) continue;

      const jugadorIdReal = jugadorPartido.jugador_id;
      let jugador = jugadoresTemp.get(jugadorIdReal);

      if (!jugador) {
        jugador = crearJugadorMundial({
          id: jugadorIdReal,
          nombre: jugadorPartido.jugadores?.nombre || `Jugador ${jugadorIdReal}`
        });
        jugadoresTemp.set(jugadorIdReal, jugador);
      }

      if (jugador.fase === 'campeon') {
        resetearAGruposTemp(jugador);
      }

      const resultado = determinarResultadoJugador(partido, jugadorIdReal);
      if (!resultado) continue;

      if (String(partido.id) === String(partidoId)) {
        if (jugador.fase === 'grupos') {
          const victorias = jugador.victoriasGrupos + (resultado === 'victoria' ? 1 : 0);
          const empates = jugador.empatesGrupos + (resultado === 'empate' ? 1 : 0);
          const derrotas = jugador.derrotasGrupos + (resultado === 'derrota' ? 1 : 0);
          const partidosGrupos = jugador.partidosGrupos + 1;
          const record = `${victorias}V-${empates}E-${derrotas}D`;
          const clasificaAutomatico = (
            victorias === 3 ||
            (victorias === 2 && empates === 1) ||
            (victorias === 2 && derrotas === 1) ||
            (victorias === 1 && empates === 2)
          );

          if (derrotas >= 2) {
            return {
              partidoId: partido.id,
              jugadorId: jugadorIdReal,
              fase: 'grupos',
              destino: null,
              usaMoneda: false,
              motivo: 'queda eliminado por 2 derrotas antes de llegar a la moneda'
            };
          }

          if (partidosGrupos < 3) {
            return {
              partidoId: partido.id,
              jugadorId: jugadorIdReal,
              fase: 'grupos',
              destino: null,
              usaMoneda: false,
              motivo: `todavia sigue en grupos (${partidosGrupos}/3), ese partido no define pase`
            };
          }

          if (victorias === 1 && empates === 1 && derrotas === 1) {
            return {
              partidoId: partido.id,
              jugadorId: jugadorIdReal,
              fase: 'grupos',
              destino: '8vos',
              usaMoneda: true,
              motivo: 'moneda de desempate en grupos'
            };
          }

          return {
            partidoId: partido.id,
            jugadorId: jugadorIdReal,
            fase: 'grupos',
            destino: clasificaAutomatico ? '8vos' : null,
            usaMoneda: false,
            motivo: clasificaAutomatico
              ? `ya clasifica automaticamente con ${record}`
              : `queda eliminado automaticamente con ${record}`
          };
        }

        const destino = SIGUIENTE_FASE_MUNDIALITO[jugador.fase] || null;

        if (resultado === 'victoria') {
          return {
            partidoId: partido.id,
            jugadorId: jugadorIdReal,
            fase: jugador.fase,
            destino,
            usaMoneda: false,
            motivo: destino
              ? `ya avanza automaticamente a ${destino} ganando el partido`
              : 'ya avanza automaticamente ganando el partido'
          };
        }

        if (resultado === 'derrota') {
          return {
            partidoId: partido.id,
            jugadorId: jugadorIdReal,
            fase: jugador.fase,
            destino: null,
            usaMoneda: false,
            motivo: `queda eliminado automaticamente en ${jugador.fase}`
          };
        }

        if (jugador.bonusCount > 0) {
          const bonusLabel = jugador.bonusCount === 1 ? '1 bonus' : `${jugador.bonusCount} bonus`;
          return {
            partidoId: partido.id,
            jugadorId: jugadorIdReal,
            fase: jugador.fase,
            destino,
            usaMoneda: false,
            motivo: `empata pero pasa automaticamente con ${bonusLabel}`
          };
        }

        return {
          partidoId: partido.id,
          jugadorId: jugadorIdReal,
          fase: jugador.fase,
          destino,
          usaMoneda: true,
          motivo: `moneda de desempate en ${jugador.fase}`
        };
      }

      procesarPartidoMundialTemp({
        ...partido,
        jugador_partido: [jugadorPartido]
      }, jugadoresTemp);
    }

    return null;
  };

  // Carga los logros acumulativos del dashboard por temporada
  const cargarLogrosDashboard = async () => {
    metadatosTemporadasLogros = construirMetadatosTemporadasLogros();
    logrosTemporadaPorJugador = new Map();

    try {
      const { data: partidosLogros, error } = await supabase
        .from('partidos')
        .select(`
          id,
          fecha,
          temporada_id,
          equipo_ganador,
          jugador_partido (
            jugador_id,
            equipo,
            atajadas,
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
        .not('temporada_id', 'is', null)
        .order('fecha', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        throw error;
      }

      const resumenPorTemporada = new Map();
      const partidosPorTemporada = new Map();

      (partidosLogros || []).forEach(partido => {
        if (partido.temporada_id === null || partido.temporada_id === undefined) {
          return;
        }

        const temporadaId = String(partido.temporada_id);
        obtenerMetadatoTemporadaLogro(temporadaId);

        if (!resumenPorTemporada.has(temporadaId)) {
          resumenPorTemporada.set(temporadaId, {
            goles: new Map(),
            atajadas: new Map(),
            asistencias: new Map(),
            puntos: new Map()
          });
        }

        const resumen = resumenPorTemporada.get(temporadaId);
        (partido.jugador_partido || []).forEach(jp => {
          const atajadas = Number(jp.atajadas) || 0;
          if (atajadas > 0) {
            resumen.atajadas.set(jp.jugador_id, (resumen.atajadas.get(jp.jugador_id) || 0) + atajadas);
          }

          let puntosJugador = 0;
          if (partido.equipo_ganador === jp.equipo) {
            puntosJugador = 3;
          } else if (partido.equipo_ganador === null || partido.equipo_ganador === 0) {
            puntosJugador = 1;
          }

          if (puntosJugador > 0) {
            resumen.puntos.set(jp.jugador_id, (resumen.puntos.get(jp.jugador_id) || 0) + puntosJugador);
          }
        });

        (partido.goles || []).forEach(gol => {
          if (!gol.es_gol_en_contra && gol.goleador_id) {
            resumen.goles.set(gol.goleador_id, (resumen.goles.get(gol.goleador_id) || 0) + 1);
          }

          if (!gol.es_gol_en_contra && gol.asistidor_id) {
            resumen.asistencias.set(gol.asistidor_id, (resumen.asistencias.get(gol.asistidor_id) || 0) + 1);
          }
        });

        if (!partidosPorTemporada.has(temporadaId)) {
          partidosPorTemporada.set(temporadaId, []);
        }
        partidosPorTemporada.get(temporadaId).push(partido);
      });

      resumenPorTemporada.forEach((resumen, temporadaId) => {
        registrarGanadoresLogro(resumen.goles, 'bota', temporadaId);
        registrarGanadoresLogro(resumen.atajadas, 'guante', temporadaId);
        registrarGanadoresLogro(resumen.asistencias, 'asist', temporadaId);
        registrarGanadoresLogro(resumen.puntos, 'puntos', temporadaId);
      });

      partidosPorTemporada.forEach((partidosTemporada, temporadaId) => {
        const jugadoresTemp = new Map();

        partidosTemporada.forEach(partido => {
          (partido.jugador_partido || []).forEach(jp => {
            const jugadorPrevio = jugadoresTemp.get(jp.jugador_id);
            if (jugadorPrevio?.fase === 'campeon') {
              resetearAGruposTemp(jugadorPrevio);
            }
          });

          procesarPartidoMundialTemp(partido, jugadoresTemp);
        });

        jugadoresTemp.forEach(jugador => {
          if (jugador.campeon) {
            registrarLogroTemporadaJugador(jugador.id, 'mundial', temporadaId);
          }
        });
      });
    } catch (error) {
      console.error('Error cargando logros del dashboard:', error);
      logrosTemporadaPorJugador = new Map();
    }
  };

  // Función para ir a la pestaña de ranking desde el historial
  const obtenerTemporadaResumenActiva = () => {
    const selectorResumen = document.getElementById('temporadas-resumen-selector');
    if (selectorResumen?.value) {
      return selectorResumen.value;
    }

    const temporadaDashboard = temporadaSeleccionada || obtenerTemporadaActivaDesdeSelectores();
    if (temporadaDashboard) {
      return temporadaDashboard;
    }

    const temporada3 = todasLasTemporadas.find(t => t.nombre === 'Temporada 3');
    return temporada3?.id || todasLasTemporadas[todasLasTemporadas.length - 1]?.id || '';
  };

  const obtenerNombreTemporadaResumen = (temporadaId) => {
    const temporada = todasLasTemporadas.find(t => String(t.id) === String(temporadaId));
    return temporada?.nombre || `Temporada ${temporadaId}`;
  };

  const asegurarStatsJugadorTemporada = (statsPorJugador, jugadorId, jugador = {}) => {
    if (jugadorId === null || jugadorId === undefined) return null;

    const key = String(jugadorId);
    if (!statsPorJugador.has(key)) {
      statsPorJugador.set(key, {
        id: jugadorId,
        nombre: jugador?.nombre || 'Jugador',
        pj: 0,
        pg: 0,
        pe: 0,
        pp: 0,
        total_puntos: 0,
        winrate: 0,
        goles: 0,
        asistencias: 0,
        atajadas: 0,
        cagadas: 0,
        cagadas_en_gol: 0,
        mvp_count: 0,
        ace_count: 0,
        victoriasActuales: 0,
        derrotasActuales: 0,
        maxVictorias: 0,
        maxDerrotas: 0
      });
    }

    const stats = statsPorJugador.get(key);
    if (jugador?.nombre && stats.nombre === 'Jugador') {
      stats.nombre = jugador.nombre;
    }

    return stats;
  };

  const obtenerGanadoresResumenTemporada = (jugadores, campo, { minimo = 1, decimales = 0 } = {}) => {
    const candidatos = jugadores.filter(jugador => (Number(jugador[campo]) || 0) >= minimo);
    if (candidatos.length === 0) return [];

    const maximo = Math.max(...candidatos.map(jugador => Number(jugador[campo]) || 0));
    if (!Number.isFinite(maximo) || maximo < minimo) return [];

    return candidatos
      .filter(jugador => (Number(jugador[campo]) || 0) === maximo)
      .map(jugador => ({
        id: jugador.id,
        nombre: jugador.nombre,
        valor: decimales > 0 ? Number(maximo).toFixed(decimales) : maximo
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const obtenerGanadoresMapaResumenTemporada = (mapa, statsPorJugador) => {
    if (!(mapa instanceof Map) || mapa.size === 0) return [];

    const entradas = Array.from(mapa.entries())
      .map(([jugadorId, valor]) => [jugadorId, Number(valor) || 0])
      .filter(([, valor]) => valor > 0);

    if (entradas.length === 0) return [];

    const maximo = Math.max(...entradas.map(([, valor]) => valor));
    return entradas
      .filter(([, valor]) => valor === maximo)
      .map(([jugadorId, valor]) => {
        const stats = statsPorJugador.get(String(jugadorId));
        return {
          id: stats?.id || jugadorId,
          nombre: stats?.nombre || 'Jugador',
          valor
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const renderizarKpiResumenTemporada = ({ icono, label, valor, color }) => `
    <div class="season-kpi" style="--season-accent:${color}">
      <div class="season-kpi-head">
        <i class="bi ${icono}"></i>
        <span>${label}</span>
      </div>
      <div class="season-kpi-value">${valor}</div>
    </div>
  `;

  const renderizarCardResumenTemporada = ({ icono, titulo, ganadores, formatearValor, color }) => {
    const listaGanadores = ganadores || [];
    const principal = listaGanadores[0];
    const extras = listaGanadores.slice(1);

    if (!principal) {
      return `
        <article class="season-leader-card" style="--season-accent:${color}">
          <div class="season-leader-head">
            <i class="bi ${icono}"></i>
            <span>${titulo}</span>
          </div>
          <div class="season-empty">Sin datos</div>
        </article>
      `;
    }

    return `
      <article class="season-leader-card" style="--season-accent:${color}">
        <div class="season-leader-head">
          <i class="bi ${icono}"></i>
          <span>${titulo}</span>
        </div>
        <div class="season-winner-line">
          ${renderizarAccesoPerfilJugador(principal.id, principal.nombre, 'season-player-link')}
          <span class="season-value-pill">${formatearValor(principal.valor)}</span>
        </div>
        ${extras.length > 0 ? `
          <div class="season-extra-winners">
            También: ${extras.map(ganador => `${escaparHtmlPlano(ganador.nombre)} (${formatearValor(ganador.valor)})`).join(', ')}
          </div>
        ` : ''}
      </article>
    `;
  };

  const consultarPartidosResumenTemporada = async (temporadaId) => {
    const selectConCagada = `
      id,
      fecha,
      equipo_ganador,
      temporada_id,
      temporadas (
        id,
        nombre
      ),
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
        id,
        goleador_id,
        asistidor_id,
        equipo,
        es_gol_en_contra,
        cagada_jugador_id
      )
    `;

    const selectSinCagada = `
      id,
      fecha,
      equipo_ganador,
      temporada_id,
      temporadas (
        id,
        nombre
      ),
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
        id,
        goleador_id,
        asistidor_id,
        equipo,
        es_gol_en_contra
      )
    `;

    let consulta = await supabase
      .from('partidos')
      .select(selectConCagada)
      .eq('temporada_id', temporadaId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });

    if (consulta.error && esErrorColumnaCagadaFaltante(consulta.error)) {
      consulta = await supabase
        .from('partidos')
        .select(selectSinCagada)
        .eq('temporada_id', temporadaId)
        .order('fecha', { ascending: true })
        .order('id', { ascending: true });
    }

    if (consulta.error) {
      throw consulta.error;
    }

    return consulta.data || [];
  };

  const consultarEstadisticasAgregadasResumenTemporada = async (temporadaId) => {
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
        winrate
      `)
      .eq('temporada_id', temporadaId);

    if (statsError) {
      console.warn('No se pudieron cargar estadisticas agregadas para la temporada:', statsError);
      return [];
    }

    if (!statsData || statsData.length === 0) {
      return [];
    }

    const jugadorIds = [...new Set(statsData.map(stat => stat.jugador_id).filter(Boolean))];
    if (jugadorIds.length === 0) {
      return [];
    }

    const { data: jugadoresData, error: jugadoresError } = await supabase
      .from('jugadores')
      .select('id, nombre')
      .in('id', jugadorIds);

    if (jugadoresError) {
      console.warn('No se pudieron cargar jugadores para resumen agregado:', jugadoresError);
      return [];
    }

    const jugadoresPorId = new Map((jugadoresData || []).map(jugador => [String(jugador.id), jugador]));
    return statsData
      .map(stat => ({
        ...stat,
        jugadores: jugadoresPorId.get(String(stat.jugador_id))
      }))
      .filter(stat => stat.jugadores);
  };

  const construirResumenTemporadaDesdeAgregados = (statsData) => {
    const statsPorJugador = new Map();
    const jugadores = (statsData || []).map(stat => {
      const pj = Number(stat.pj) || 0;
      const pg = Number(stat.pg) || 0;
      const pe = Number(stat.pe) || 0;
      const pp = Number(stat.pp) || 0;
      const totalPuntos = Number(stat.total_puntos) || ((pg * 3) + pe);
      const winrateCalculado = pj > 0 ? (totalPuntos / (pj * 3)) * 100 : 0;
      const jugador = {
        id: stat.jugador_id,
        nombre: stat.jugadores?.nombre || 'Jugador',
        pj,
        pg,
        pe,
        pp,
        total_puntos: totalPuntos,
        winrate: Number(stat.winrate) || winrateCalculado,
        goles: Number(stat.goles) || 0,
        asistencias: Number(stat.asistencias) || 0,
        atajadas: Number(stat.atajadas) || 0,
        cagadas: Number(stat.cagadas_en_gol) || 0,
        cagadas_en_gol: Number(stat.cagadas_en_gol) || 0,
        mvp_count: Number(stat.mvp_count) || 0,
        ace_count: Number(stat.ace_count) || 0,
        puntosPP: pj > 0 ? totalPuntos / pj : 0
      };

      statsPorJugador.set(String(jugador.id), jugador);
      return jugador;
    });

    jugadores.sort((a, b) => {
      if (b.total_puntos !== a.total_puntos) return b.total_puntos - a.total_puntos;
      if (b.winrate !== a.winrate) return b.winrate - a.winrate;
      if (b.goles !== a.goles) return b.goles - a.goles;
      return a.nombre.localeCompare(b.nombre);
    });

    const totales = jugadores.reduce((acc, jugador) => {
      acc.jugadores += jugador.pj > 0 ? 1 : 0;
      acc.partidos = Math.max(acc.partidos, jugador.pj);
      acc.goles += jugador.goles;
      acc.asistencias += jugador.asistencias;
      acc.atajadas += jugador.atajadas;
      acc.cagadas += jugador.cagadas;
      acc.cagadasEnGol += jugador.cagadas_en_gol;
      acc.mvp += jugador.mvp_count;
      acc.ace += jugador.ace_count;
      return acc;
    }, {
      partidos: 0,
      jugadores: 0,
      goles: 0,
      asistencias: 0,
      atajadas: 0,
      cagadas: 0,
      cagadasEnGol: 0,
      mvp: 0,
      ace: 0
    });

    return {
      jugadores,
      statsPorJugador,
      totales,
      origen: 'agregado',
      records: {
        maxGolesPartido: new Map(),
        maxAsistenciasPartido: new Map(),
        maxCagadasPartido: new Map(),
        maxVictoriasHilo: new Map(),
        maxDerrotasHilo: new Map()
      }
    };
  };

  const construirResumenTemporada = (partidos) => {
    const statsPorJugador = new Map();
    const totales = {
      partidos: partidos.length,
      jugadores: 0,
      goles: 0,
      asistencias: 0,
      atajadas: 0,
      cagadas: 0,
      cagadasEnGol: 0,
      mvp: 0,
      ace: 0
    };

    partidos.forEach(partido => {
      (partido.jugador_partido || []).forEach(jp => {
        const stats = asegurarStatsJugadorTemporada(statsPorJugador, jp.jugador_id, jp.jugadores);
        if (!stats) return;

        const equipoGanador = partido.equipo_ganador === null || partido.equipo_ganador === undefined
          ? null
          : Number(partido.equipo_ganador);
        const equipoJugador = Number(jp.equipo);

        stats.pj += 1;
        if (equipoGanador === equipoJugador) {
          stats.pg += 1;
          stats.total_puntos += 3;
          stats.victoriasActuales += 1;
          stats.derrotasActuales = 0;
        } else if (equipoGanador === 1 || equipoGanador === 2) {
          stats.pp += 1;
          stats.derrotasActuales += 1;
          stats.victoriasActuales = 0;
        } else {
          stats.pe += 1;
          stats.total_puntos += 1;
          stats.victoriasActuales = 0;
          stats.derrotasActuales = 0;
        }

        stats.maxVictorias = Math.max(stats.maxVictorias, stats.victoriasActuales);
        stats.maxDerrotas = Math.max(stats.maxDerrotas, stats.derrotasActuales);

        const atajadas = Number(jp.atajadas) || 0;
        const cagadas = Number(jp.cagadas) || 0;
        stats.atajadas += atajadas;
        stats.cagadas += cagadas;
        totales.atajadas += atajadas;
        totales.cagadas += cagadas;

        if (jp.mvp) {
          stats.mvp_count += 1;
          totales.mvp += 1;
        }
        if (jp.ace) {
          stats.ace_count += 1;
          totales.ace += 1;
        }
      });

      (partido.goles || []).forEach(gol => {
        if (!gol.es_gol_en_contra) {
          totales.goles += 1;
          if (gol.goleador_id) {
            const statsGoleador = asegurarStatsJugadorTemporada(statsPorJugador, gol.goleador_id);
            if (statsGoleador) statsGoleador.goles += 1;
          }
          if (gol.asistidor_id) {
            const statsAsistidor = asegurarStatsJugadorTemporada(statsPorJugador, gol.asistidor_id);
            if (statsAsistidor) {
              statsAsistidor.asistencias += 1;
              totales.asistencias += 1;
            }
          }
        }

        if (gol.cagada_jugador_id) {
          const statsCagada = asegurarStatsJugadorTemporada(statsPorJugador, gol.cagada_jugador_id);
          if (statsCagada) statsCagada.cagadas_en_gol += 1;
          totales.cagadasEnGol += 1;
        }
      });
    });

    const jugadores = Array.from(statsPorJugador.values()).map(jugador => ({
      ...jugador,
      winrate: jugador.pj > 0 ? (jugador.total_puntos / (jugador.pj * 3)) * 100 : 0,
      puntosPP: jugador.pj > 0 ? jugador.total_puntos / jugador.pj : 0
    }));

    totales.jugadores = jugadores.filter(jugador => jugador.pj > 0).length;

    jugadores.sort((a, b) => {
      if (b.total_puntos !== a.total_puntos) return b.total_puntos - a.total_puntos;
      if (b.winrate !== a.winrate) return b.winrate - a.winrate;
      if (b.goles !== a.goles) return b.goles - a.goles;
      return a.nombre.localeCompare(b.nombre);
    });

    return {
      jugadores,
      statsPorJugador,
      totales,
      records: calcularRecordsTemporadaPerfil(partidos)
    };
  };

  const renderizarResumenTemporada = (temporadaNombre, resumen) => {
    const { jugadores, statsPorJugador, totales, records } = resumen;
    const promedioGoles = totales.partidos > 0 ? (totales.goles / totales.partidos).toFixed(1) : '0.0';
    const candidatosWinrate = jugadores.filter(jugador => jugador.pj >= 3);
    const baseWinrate = candidatosWinrate.length > 0 ? candidatosWinrate : jugadores;
    const topRanking = jugadores.slice(0, 8);
    const resumenDesdeAgregados = resumen.origen === 'agregado';
    const descripcionResumen = resumenDesdeAgregados
      ? 'Resumen desde estadísticas agregadas. Los récords de partido requieren partidos cargados.'
      : 'Resumen calculado sobre partidos cargados en esta temporada.';
    const etiquetaPartidos = resumenDesdeAgregados
      ? `${totales.partidos} PJ max.`
      : `${totales.partidos} partidos`;

    const kpisTemporada = [
      { icono: 'bi-people-fill', label: 'Jugadores', valor: totales.jugadores, color: '#e2e8f0' },
      { icono: 'bi-bullseye', label: 'Goles', valor: totales.goles, color: '#22c55e' },
      { icono: 'bi-speedometer2', label: 'Goles/PJ', valor: promedioGoles, color: '#22d3ee' },
      { icono: 'bi-bezier2', label: 'Asist.', valor: totales.asistencias, color: '#38bdf8' },
      { icono: 'bi-exclamation-octagon-fill', label: 'Cagadas', valor: totales.cagadas, color: '#fb7185' },
      { icono: 'bi-shield-fill', label: 'Atajadas', valor: totales.atajadas, color: '#facc15' }
    ].map(renderizarKpiResumenTemporada).join('');

    const positivos = [
      {
        icono: 'bi-award-fill',
        titulo: 'Puntos',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'total_puntos'),
        formatearValor: valor => `${valor} pts`,
        color: '#facc15'
      },
      {
        icono: 'bi-graph-up-arrow',
        titulo: candidatosWinrate.length > 0 ? 'Mejor WR (3+ PJ)' : 'Mejor WR',
        ganadores: obtenerGanadoresResumenTemporada(baseWinrate, 'winrate', { decimales: 1 }),
        formatearValor: valor => `${valor}%`,
        color: '#34d399'
      },
      {
        icono: 'bi-bullseye',
        titulo: 'Goles',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'goles'),
        formatearValor: valor => `${valor} G`,
        color: '#22c55e'
      },
      {
        icono: 'bi-bezier2',
        titulo: 'Asistencias',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'asistencias'),
        formatearValor: valor => `${valor} A`,
        color: '#38bdf8'
      },
      {
        icono: 'bi-shield-fill',
        titulo: 'Atajadas',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'atajadas'),
        formatearValor: valor => `${valor}`,
        color: '#facc15'
      },
      {
        icono: 'bi-star-fill',
        titulo: 'MVP',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'mvp_count'),
        formatearValor: valor => `${valor}`,
        color: '#f59e0b'
      },
      {
        icono: 'bi-fire',
        titulo: 'ACE',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'ace_count'),
        formatearValor: valor => `${valor}`,
        color: '#22d3ee'
      },
      {
        icono: 'bi-bullseye',
        titulo: 'Max. goles en 1 partido',
        ganadores: obtenerGanadoresMapaResumenTemporada(records.maxGolesPartido, statsPorJugador),
        formatearValor: valor => `${valor}`,
        color: '#22c55e'
      },
      {
        icono: 'bi-bezier2',
        titulo: 'Max. asistencias en 1 partido',
        ganadores: obtenerGanadoresMapaResumenTemporada(records.maxAsistenciasPartido, statsPorJugador),
        formatearValor: valor => `${valor}`,
        color: '#38bdf8'
      }
    ].map(renderizarCardResumenTemporada).join('');

    const negativos = [
      {
        icono: 'bi-x-octagon-fill',
        titulo: 'Cagadas totales',
        ganadores: obtenerGanadoresResumenTemporada(jugadores, 'cagadas'),
        formatearValor: valor => `${valor}`,
        color: '#fb7185'
      },
      {
        icono: 'bi-exclamation-diamond-fill',
        titulo: 'Cagador del año',
        ganadores: obtenerGanadoresMapaResumenTemporada(records.maxCagadasPartido, statsPorJugador),
        formatearValor: valor => `${valor}`,
        color: '#fb7185'
      },
      {
        icono: 'bi-cloud-lightning-rain-fill',
        titulo: 'Perdedor del año',
        ganadores: obtenerGanadoresMapaResumenTemporada(records.maxDerrotasHilo, statsPorJugador),
        formatearValor: valor => `${valor} PP`,
        color: '#f97316'
      }
    ].map(renderizarCardResumenTemporada).join('');

    const rachas = [
      {
        icono: 'bi-gem',
        titulo: 'Talismán',
        ganadores: obtenerGanadoresMapaResumenTemporada(records.maxVictoriasHilo, statsPorJugador),
        formatearValor: valor => `${valor} PG`,
        color: '#a78bfa'
      }
    ].map(renderizarCardResumenTemporada).join('');

    const filasRanking = topRanking.map((jugador, index) => {
      const claseWinrate = jugador.winrate >= 60 ? 'text-success' : jugador.winrate >= 45 ? 'text-warning' : 'text-danger';
      return `
        <tr>
          <td class="text-center"><span class="season-rank-badge ${index < 3 ? 'top' : ''}">${index + 1}</span></td>
          <td>${renderizarAccesoPerfilJugador(jugador.id, jugador.nombre, 'text-white fw-semibold season-player-link')}</td>
          <td class="text-center fw-bold text-warning">${jugador.total_puntos}</td>
          <td class="text-center">${jugador.pj}</td>
          <td class="text-center"><span class="text-success">${jugador.pg}</span>/<span class="text-warning">${jugador.pe}</span>/<span class="text-danger">${jugador.pp}</span></td>
          <td class="text-center fw-bold ${claseWinrate}">${jugador.winrate.toFixed(0)}%</td>
          <td class="text-center text-success">${jugador.goles}</td>
          <td class="text-center text-info">${jugador.asistencias}</td>
          <td class="text-center text-danger">${jugador.cagadas}</td>
          <td class="text-center">${jugador.atajadas}</td>
          <td class="text-center"><span class="text-warning">${jugador.mvp_count}</span>/<span class="text-info">${jugador.ace_count}</span></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="season-summary">
        <section class="season-hero">
          <div>
            <span class="season-eyebrow">Resumen de temporada</span>
            <h3 class="season-title">${escaparHtmlPlano(temporadaNombre)}</h3>
            <p class="season-summary-copy">${descripcionResumen}</p>
          </div>
          <div class="season-hero-meter">
            <i class="bi ${resumenDesdeAgregados ? 'bi-bar-chart-fill' : 'bi-calendar-check-fill'}"></i>
            <div>
              <span>${resumenDesdeAgregados ? 'Base' : 'Partidos'}</span>
              <strong>${etiquetaPartidos}</strong>
            </div>
          </div>
        </section>

        <section class="season-kpi-grid">
          ${kpisTemporada}
        </section>

        <section class="season-group-grid">
          <div class="season-group-panel positive">
            <h4 class="season-section-title"><i class="bi bi-trophy-fill"></i>Positivas</h4>
            <div class="season-group-list positive">
              ${positivos}
            </div>
          </div>
          <div class="season-group-panel negative">
            <h4 class="season-section-title"><i class="bi bi-exclamation-triangle-fill"></i>Negativas</h4>
            <div class="season-group-list">
              ${negativos}
            </div>
          </div>
          <div class="season-group-panel streaks">
            <h4 class="season-section-title"><i class="bi bi-activity"></i>Rachas</h4>
            <div class="season-group-list">
              ${rachas}
            </div>
          </div>
        </section>

        <section class="season-ranking-panel">
          <div class="season-ranking-head">
            <h4 class="season-section-title"><i class="bi bi-table"></i>Ranking de temporada</h4>
            <span class="season-ranking-subtitle">Top ${topRanking.length}</span>
          </div>
          <div class="table-responsive">
            <table class="table table-dark table-hover align-middle season-ranking-table">
          <thead>
            <tr>
              <th class="text-center">#</th>
              <th>Jugador</th>
              <th class="text-center">PTS</th>
              <th class="text-center">PJ</th>
              <th class="text-center">PG/E/PP</th>
              <th class="text-center">WR</th>
              <th class="text-center">G</th>
              <th class="text-center">A</th>
              <th class="text-center">Cag.</th>
              <th class="text-center">Ataj.</th>
              <th class="text-center">MVP/ACE</th>
            </tr>
          </thead>
          <tbody>
            ${filasRanking || '<tr><td colspan="11" class="text-center text-light-emphasis py-4">Sin jugadores para mostrar</td></tr>'}
          </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
  };

  window.cargarResumenTemporadas = async function() {
    const container = document.getElementById('temporadas-resumen-container');
    if (!container) return;

    const temporadaId = obtenerTemporadaResumenActiva();
    const selectorResumen = document.getElementById('temporadas-resumen-selector');
    if (selectorResumen && temporadaId) {
      selectorResumen.value = String(temporadaId);
    }

    if (!temporadaId) {
      container.innerHTML = `
        <div class="text-center py-4">
          <i class="bi bi-calendar-x fs-1 text-warning mb-3"></i>
          <h5 class="text-white">Selecciona una temporada</h5>
          <p class="text-light-emphasis mb-0">No hay una temporada activa para resumir.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-info" role="status">
          <span class="visually-hidden">Cargando...</span>
        </div>
        <p class="text-light-emphasis mt-2 mb-0">Calculando resumen de temporada...</p>
      </div>
    `;

    try {
      const partidos = await consultarPartidosResumenTemporada(temporadaId);
      const temporadaNombre = partidos[0]?.temporadas?.nombre || obtenerNombreTemporadaResumen(temporadaId);

      if (partidos.length === 0) {
        const estadisticasAgregadas = await consultarEstadisticasAgregadasResumenTemporada(temporadaId);
        if (estadisticasAgregadas.length > 0) {
          const resumenAgregado = construirResumenTemporadaDesdeAgregados(estadisticasAgregadas);
          container.innerHTML = renderizarResumenTemporada(temporadaNombre, resumenAgregado);
          return;
        }

        container.innerHTML = `
          <div class="text-center py-4">
            <i class="bi bi-inbox fs-1 text-info mb-3"></i>
            <h5 class="text-white">${escaparHtmlPlano(temporadaNombre)}</h5>
            <p class="text-light-emphasis mb-0">No hay partidos cargados para esta temporada.</p>
          </div>
        `;
        return;
      }

      const resumen = construirResumenTemporada(partidos);
      container.innerHTML = renderizarResumenTemporada(temporadaNombre, resumen);
    } catch (error) {
      console.error('Error al cargar resumen de temporada:', error);
      container.innerHTML = `
        <div class="text-center py-4">
          <i class="bi bi-exclamation-triangle fs-1 text-danger mb-3"></i>
          <h5 class="text-white">No se pudo cargar el resumen</h5>
          <p class="text-light-emphasis mb-0">${escaparHtmlPlano(error.message || 'Error desconocido')}</p>
        </div>
      `;
    }
  };

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
        const rendArquero = atajadasPP * 0.4;

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
          const rendArquero = atajadasPP * 0.4;

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
• Atajadas: ${atajadasPP.toFixed(2)} × 0.4 = ${rendArquero.toFixed(1)}

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
              <div class="small text-light-emphasis">Skill Promedio</div>
              <div class="text-info fw-bold">${ranking.length > 0 ? (ranking.reduce((sum, j) => sum + j.rendimiento, 0) / ranking.length).toFixed(1) : '0.0'}</div>
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

  // ===== Tag Input System =====
  const tagInputState = {
    companero: { selected: [] },  // [{ id, nombre }]
    rival: { selected: [] }
  };

  function initTagInput(key) {
    const input = document.getElementById(`${key}-input`);
    const dropdown = document.getElementById(`${key}-dropdown`);
    const wrapper = document.getElementById(`${key}-wrapper`);
    if (!input || !dropdown || !wrapper) return;

    let activeIndex = -1;

    wrapper.addEventListener('click', () => input.focus());

    input.addEventListener('input', () => {
      const texto = input.value.toLowerCase().trim();
      if (!texto) { dropdown.classList.remove('show'); return; }
      const selIds = tagInputState[key].selected.map(s => s.id);
      const jugadores = todosLosJugadoresGlobal
        .filter(j => !selIds.includes(j.id) && j.nombre.toLowerCase().includes(texto))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .slice(0, 8);
      if (jugadores.length === 0) { dropdown.classList.remove('show'); return; }
      activeIndex = -1;
      dropdown.innerHTML = jugadores.map((j, i) =>
        `<div class="tag-input-option" data-id="${j.id}" data-nombre="${j.nombre}">${j.nombre}</div>`
      ).join('');
      dropdown.classList.add('show');

      dropdown.querySelectorAll('.tag-input-option').forEach(opt => {
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          agregarTag(key, opt.dataset.id, opt.dataset.nombre);
        });
      });
    });

    input.addEventListener('keydown', (e) => {
      const options = dropdown.querySelectorAll('.tag-input-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
        options.forEach((o, i) => o.classList.toggle('active', i === activeIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        options.forEach((o, i) => o.classList.toggle('active', i === activeIndex));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && options[activeIndex]) {
          agregarTag(key, options[activeIndex].dataset.id, options[activeIndex].dataset.nombre);
        }
      } else if (e.key === 'Backspace' && !input.value) {
        const sel = tagInputState[key].selected;
        if (sel.length > 0) {
          sel.pop();
          renderTags(key);
          filtrarPartidosAvanzado();
        }
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => dropdown.classList.remove('show'), 150);
    });
  }

  function agregarTag(key, id, nombre) {
    if (tagInputState[key].selected.some(s => s.id === id)) return;
    tagInputState[key].selected.push({ id, nombre });
    renderTags(key);
    const input = document.getElementById(`${key}-input`);
    if (input) { input.value = ''; }
    const dropdown = document.getElementById(`${key}-dropdown`);
    if (dropdown) dropdown.classList.remove('show');
    filtrarPartidosAvanzado();
  }

  function removerTag(key, id) {
    tagInputState[key].selected = tagInputState[key].selected.filter(s => s.id !== id);
    renderTags(key);
    filtrarPartidosAvanzado();
  }

  function renderTags(key) {
    const container = document.getElementById(`${key}-tags`);
    if (!container) return;
    container.innerHTML = tagInputState[key].selected.map(s =>
      `<span class="tag-input-tag">${s.nombre}<span class="tag-remove" onclick="removerTagHistorial('${key}','${s.id}')">&times;</span></span>`
    ).join('');
  }

  window.removerTagHistorial = function(key, id) { removerTag(key, id); };
  window.limpiarTagsHistorial = function() {
    tagInputState.companero.selected = [];
    tagInputState.rival.selected = [];
    renderTags('companero');
    renderTags('rival');
    const inputComp = document.getElementById('companero-input');
    const inputRival = document.getElementById('rival-input');
    if (inputComp) inputComp.value = '';
    if (inputRival) inputRival.value = '';
  };

  // Inicializar los tag inputs
  initTagInput('companero');
  initTagInput('rival');

  // Poblar solo el selector simple de jugador
  window.poblarFiltrosHistorial = function() {
    const jugadores = [...todosLosJugadoresGlobal].sort((a, b) => a.nombre.localeCompare(b.nombre));
    const sel = document.getElementById('filtro-jugador');
    if (!sel) return;
    const valorActual = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    jugadores.forEach(j => {
      sel.innerHTML += `<option value="${j.id}">${j.nombre}</option>`;
    });
    if (valorActual) sel.value = valorActual;
  };

  // Filtro avanzado: jugador (1) + compañeros (N) + rivales (N)
  window.filtrarPartidosAvanzado = function() {
    const jugadorId = document.getElementById('filtro-jugador')?.value || '';
    const companeroIds = tagInputState.companero.selected.map(s => s.id);
    const rivalIds = tagInputState.rival.selected.map(s => s.id);
    const container = document.getElementById('historial-partidos-container');

    if (!todosLosPartidos || todosLosPartidos.length === 0) return;

    let partidosFiltrados = todosLosPartidos;

    // Filtrar por jugador principal
    if (jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p =>
        p.jugador_partido?.some(jp => jp.jugador_id === jugadorId)
      );
    }

    // Filtrar por compañeros (todos deben estar en el mismo equipo que el jugador)
    if (companeroIds.length > 0 && jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p => {
        const jpJugador = p.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
        if (!jpJugador) return false;
        return companeroIds.every(cId => {
          const jpComp = p.jugador_partido?.find(jp => jp.jugador_id === cId);
          return jpComp && jpComp.equipo === jpJugador.equipo;
        });
      });
    } else if (companeroIds.length > 0 && !jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p => {
        const jps = companeroIds.map(cId => p.jugador_partido?.find(jp => jp.jugador_id === cId));
        if (jps.some(jp => !jp)) return false;
        return jps.every(jp => jp.equipo === jps[0].equipo);
      });
    }

    // Filtrar por rivales (todos deben estar en equipo contrario al jugador)
    if (rivalIds.length > 0 && jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p => {
        const jpJugador = p.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
        if (!jpJugador) return false;
        return rivalIds.every(rId => {
          const jpRival = p.jugador_partido?.find(jp => jp.jugador_id === rId);
          return jpRival && jpRival.equipo !== jpJugador.equipo;
        });
      });
    } else if (rivalIds.length > 0 && !jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p =>
        rivalIds.every(rId => p.jugador_partido?.some(jp => jp.jugador_id === rId))
      );
    }

    // Filtrar por resultado (ganado/perdido/empate) respecto al jugador
    const resultado = document.getElementById('filtro-resultado')?.value || '';
    if (resultado && jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p => {
        const jpJugador = p.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
        if (!jpJugador) return false;
        const equipoJugador = jpJugador.equipo;
        if (resultado === 'empate') return !p.equipo_ganador || (p.equipo_ganador !== 1 && p.equipo_ganador !== 2);
        if (resultado === 'ganado') return p.equipo_ganador === equipoJugador;
        if (resultado === 'perdido') return p.equipo_ganador && p.equipo_ganador !== equipoJugador && (p.equipo_ganador === 1 || p.equipo_ganador === 2);
        return true;
      });
    } else if (resultado && !jugadorId) {
      partidosFiltrados = partidosFiltrados.filter(p => {
        if (resultado === 'empate') return !p.equipo_ganador || (p.equipo_ganador !== 1 && p.equipo_ganador !== 2);
        if (resultado === 'ganado') return p.equipo_ganador === 1;
        if (resultado === 'perdido') return p.equipo_ganador === 2;
        return true;
      });
    }

    // Total antes de limitar
    const totalResultados = partidosFiltrados.length;

    // Aplicar limite de cantidad
    const valorCantidad = document.getElementById('cantidad-partidos')?.value || 'all';
    if (valorCantidad !== 'all') {
      const cantidad = parseInt(valorCantidad) || 5;
      partidosFiltrados = partidosFiltrados.slice(0, cantidad);
    }

    mostrarPartidosBasicos(container, partidosFiltrados);

    // Mostrar contador de resultados
    const hayFiltros = jugadorId || companeroIds.length > 0 || rivalIds.length > 0 || resultado;
    const contadorEl = document.getElementById('filtro-resultado-count');
    if (contadorEl) {
      if (hayFiltros) {
        contadorEl.textContent = `${totalResultados} partido${totalResultados !== 1 ? 's' : ''} encontrado${totalResultados !== 1 ? 's' : ''}`;
        contadorEl.classList.remove('d-none');
      } else {
        contadorEl.textContent = `${totalResultados} partido${totalResultados !== 1 ? 's' : ''}`;
        contadorEl.classList.remove('d-none');
      }
    }
    if (hayFiltros && partidosFiltrados.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-search fs-1 text-muted mb-3"></i>
          <h5 class="text-muted">No se encontraron partidos</h5>
          <p class="text-light-emphasis mb-4">
            No hay partidos con los filtros seleccionados.
          </p>
          <button onclick="limpiarFiltrosHistorial()" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-x-circle me-2"></i>
            Limpiar filtros
          </button>
        </div>
      `;
    }
  };

  // Limpiar todos los filtros
  window.limpiarFiltrosHistorial = function() {
    const selJugador = document.getElementById('filtro-jugador');
    if (selJugador) selJugador.value = '';
    const selResultado = document.getElementById('filtro-resultado');
    if (selResultado) selResultado.value = '';
    window.limpiarTagsHistorial();
    filtrarPartidosAvanzado();
  };

  // Mantener compatibilidad con la funcion vieja
  window.filtrarPartidosPorJugador = window.filtrarPartidosAvanzado;

  // Hacer las funciones globales
  window.cargarHistorialPartidos = cargarHistorialPartidos;

  async function cargarReviewEventosGuardados(partidoId) {
    const selectConJugador = `
      id,
      partido_id,
      jugador_id,
      tipo,
      cantidad,
      minuto_partido,
      review_segundos,
      metadata,
      jugadores (
        id,
        nombre
      )
    `;

    let { data, error } = await supabase
      .from('review_eventos')
      .select(selectConJugador)
      .eq('partido_id', partidoId)
      .order('review_segundos', { ascending: true });

    if (error && esErrorTablaFaltante(error, 'review_eventos')) {
      return {
        data: [],
        error,
        tablaFaltante: true
      };
    }

    const textoError = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
    const debeReintentarSinRelacion = error &&
      (textoError.includes('relationship') || textoError.includes('schema cache') || textoError.includes('jugadores'));

    if (debeReintentarSinRelacion) {
      const reintento = await supabase
        .from('review_eventos')
        .select('id, partido_id, jugador_id, tipo, cantidad, minuto_partido, review_segundos, metadata')
        .eq('partido_id', partidoId)
        .order('review_segundos', { ascending: true });

      data = reintento.data;
      error = reintento.error;

      if (!error && data?.length) {
        const jugadorIds = [...new Set(data.map(evento => evento.jugador_id).filter(Boolean))];
        if (jugadorIds.length) {
          const { data: jugadores } = await supabase
            .from('jugadores')
            .select('id, nombre')
            .in('id', jugadorIds);

          const jugadoresMap = new Map((jugadores || []).map(jugador => [String(jugador.id), jugador]));
          data = data.map(evento => ({
            ...evento,
            jugadores: jugadoresMap.get(String(evento.jugador_id)) || null
          }));
        }
      }
    }

    return {
      data: data || [],
      error
    };
  }

  window.mostrarCompiladoPartido = async function(partidoId) {
    const partido = todosLosPartidos.find(p => p.id === partidoId);
    const modalEl = document.getElementById('compiladoPartidoModal');
    const titleEl = document.getElementById('compiladoPartidoModalLabel');
    const bodyEl = document.getElementById('compiladoPartidoModalBody');
    if (!modalEl || !titleEl || !bodyEl) return;

    const fecha = partido?.fecha
      ? new Date(partido.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Partido';

    titleEl.innerHTML = `<i class="bi bi-scissors me-2"></i>Compilado - ${escaparHtmlPlano(fecha)}`;
    bodyEl.innerHTML = `
      <div class="text-center py-4">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-light-emphasis mt-2 mb-0">Buscando eventos de review...</p>
      </div>
    `;

    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    const { data: reviewEventos, error, tablaFaltante } = await cargarReviewEventosGuardados(partidoId);

    if (tablaFaltante) {
      bodyEl.innerHTML = `
        <div class="alert alert-warning mb-0">
          <i class="bi bi-exclamation-triangle me-2"></i>
          Falta la tabla <strong>review_eventos</strong>. Ejecuta <code>review_events_schema.sql</code> para recuperar eventos individuales.
        </div>
      `;
      return;
    }

    if (error) {
      console.error('Error al cargar eventos de review:', error);
      bodyEl.innerHTML = `
        <div class="alert alert-danger mb-0">
          <i class="bi bi-x-circle me-2"></i>
          No se pudo cargar el compilado: ${escaparHtmlPlano(error.message || 'Error desconocido')}
        </div>
      `;
      return;
    }

    let opcionesCompilado = { atajadasMinimas: 3 };
    let clips = construirClipsCompiladoDesdeEventos(reviewEventos, opcionesCompilado);
    let duracionTotal = clips.reduce((acc, clip) => acc + clip.duracion, 0);
    const linkPartido = normalizarReviewUrl(partido?.youtube_link) || '';
    const reviewLink = obtenerLinkYouTubeReview(linkPartido);
    const beelupLink = obtenerDatosBeelupDesdeUrl(linkPartido) ? linkPartido : '';
    const puedeGenerarBeelup = () => clips.length > 0 && !!beelupLink;

    bodyEl.innerHTML = `
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div class="text-light-emphasis small">
          <span id="compilado-modal-count">${clips.length}</span> corte(s) - Duracion estimada <span id="compilado-modal-duration">${escaparHtmlPlano(formatearSegundosVideo(duracionTotal))}</span>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <label for="compilado-modal-atajadas-min" class="form-label text-light small mb-0">Atajadas</label>
          <select id="compilado-modal-atajadas-min" class="form-select form-select-sm" style="width: auto;">
            <option value="3">3 o mas</option>
            <option value="5">Solo 5</option>
          </select>
          ${reviewLink ? `
            <a class="btn btn-sm btn-outline-light" href="${escaparAtributoHtml(reviewLink)}" target="_blank" rel="noopener noreferrer">
              <i class="bi bi-camera-video me-1"></i>Review completa
            </a>
          ` : ''}
        </div>
      </div>
      <div class="review-clip-list" id="compilado-modal-list">
        ${renderizarClipsCompiladoHtml(clips, reviewLink, opcionesCompilado)}
      </div>
      <div class="border border-secondary border-opacity-25 rounded-3 p-3 mt-3">
        <label class="form-label text-light small mb-1">Compilado descargable</label>
        <input type="file" id="compilado-modal-video" class="form-control form-control-sm mb-2" accept="video/*">
        <div class="d-flex flex-wrap gap-2">
          <button type="button" id="compilado-modal-export" class="btn btn-outline-light btn-sm" ${clips.length ? '' : 'disabled'}>
            <i class="bi bi-download me-1"></i>Cortes JSON
          </button>
          <button type="button" id="compilado-modal-build-beelup" class="btn btn-warning btn-sm" ${puedeGenerarBeelup() ? '' : 'disabled'}>
            <i class="bi bi-magic me-1"></i>Generar MP4 Beelup
          </button>
          <button type="button" id="compilado-modal-build" class="btn btn-warning btn-sm" ${clips.length ? '' : 'disabled'}>
            <i class="bi bi-film me-1"></i>Generar WebM local
          </button>
        </div>
        <div id="compilado-modal-status" class="small text-light-emphasis mt-2"></div>
      </div>
    `;

    const exportBtn = document.getElementById('compilado-modal-export');
    const buildBeelupBtn = document.getElementById('compilado-modal-build-beelup');
    const buildBtn = document.getElementById('compilado-modal-build');
    const fileInput = document.getElementById('compilado-modal-video');
    const statusEl = document.getElementById('compilado-modal-status');
    const nombreBase = `compilado-t5-${partido?.fecha || partidoId}`;
    const actualizarClipsModal = () => {
      opcionesCompilado = { atajadasMinimas: obtenerUmbralAtajadasCompilado('compilado-modal-atajadas-min') };
      clips = construirClipsCompiladoDesdeEventos(reviewEventos, opcionesCompilado);
      duracionTotal = clips.reduce((acc, clip) => acc + clip.duracion, 0);

      const countEl = document.getElementById('compilado-modal-count');
      const durationEl = document.getElementById('compilado-modal-duration');
      const listEl = document.getElementById('compilado-modal-list');
      if (countEl) countEl.textContent = String(clips.length);
      if (durationEl) durationEl.textContent = formatearSegundosVideo(duracionTotal);
      if (listEl) listEl.innerHTML = renderizarClipsCompiladoHtml(clips, reviewLink, opcionesCompilado);
      if (exportBtn) exportBtn.disabled = clips.length === 0;
      if (buildBtn) buildBtn.disabled = clips.length === 0;
      if (buildBeelupBtn) buildBeelupBtn.disabled = !puedeGenerarBeelup();
    };

    document.getElementById('compilado-modal-atajadas-min')?.addEventListener('change', actualizarClipsModal);

    exportBtn?.addEventListener('click', () => {
      descargarJsonCompilado(clips, nombreBase, reviewLink, opcionesCompilado);
    });

    buildBeelupBtn?.addEventListener('click', async () => {
      if (buildBeelupBtn) buildBeelupBtn.disabled = true;
      try {
        await generarMp4CompiladoDesdeBeelup(beelupLink, clips, statusEl, nombreBase);
      } finally {
        if (buildBeelupBtn) buildBeelupBtn.disabled = !puedeGenerarBeelup();
      }
    });

    buildBtn?.addEventListener('click', async () => {
      if (buildBtn) buildBtn.disabled = true;
      try {
        await generarVideoCompiladoDesdeArchivo(fileInput?.files?.[0] || null, clips, statusEl, nombreBase);
      } finally {
        if (buildBtn) buildBtn.disabled = clips.length === 0;
      }
    });
  };

  // Popup de goles del partido
  window.mostrarGolesPartido = function(partidoId) {
    const partido = todosLosPartidos.find(p => p.id === partidoId);
    if (!partido) return;

    const goles = partido.goles || [];
    const youtubeLink = obtenerLinkYouTubeReview(partido.youtube_link) || null;

    // Calcular marcador
    let golesEq1 = 0, golesEq2 = 0;
    goles.forEach(gol => {
      const jp = partido.jugador_partido?.find(j => j.jugador_id === gol.goleador_id);
      if (jp) {
        const esEnContra = gol.equipo !== jp.equipo;
        if (esEnContra) {
          if (jp.equipo === 1) golesEq2++; else golesEq1++;
        } else {
          if (jp.equipo === 1) golesEq1++; else golesEq2++;
        }
      }
    });

    // Titulo del modal
    const fecha = new Date(partido.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('golesPartidoModalLabel').innerHTML =
      `<i class="bi bi-trophy me-2"></i>Goles del Partido — ${fecha} <span class="badge bg-primary ms-2">${golesEq1} - ${golesEq2}</span>`;

    // Ordenar goles cronologicamente
    const golesOrdenados = [...goles].sort((a, b) => {
      const minA = a.minuto ?? 999;
      const minB = b.minuto ?? 999;
      return minA - minB;
    });

    // Helpers
    const nombreJugador = (id) => {
      const jp = partido.jugador_partido?.find(j => j.jugador_id === id);
      return jp?.jugadores?.nombre || 'Desconocido';
    };

    const equipoJugador = (id) => {
      const jp = partido.jugador_partido?.find(j => j.jugador_id === id);
      return jp?.equipo || null;
    };

    let html = '';

    if (golesOrdenados.length === 0) {
      html = `
        <div class="text-center py-5">
          <i class="bi bi-emoji-neutral display-4 text-muted"></i>
          <p class="text-muted mt-3">No hay goles registrados en este partido</p>
        </div>
      `;
    } else {
      // Timeline de goles
      html += `<div class="row g-0 align-items-center">`;

      // Header
      html += `
        <div class="col-5 text-end pe-2">
          <h6 class="text-primary fw-bold mb-3">🔵 Equipo 1</h6>
        </div>
        <div class="col-2 text-center">
          <h6 class="text-muted fw-bold mb-3">Min</h6>
        </div>
        <div class="col-5 ps-2">
          <h6 class="text-danger fw-bold mb-3">🔴 Equipo 2</h6>
        </div>
      `;

      // Marcador acumulado
      let acumEq1 = 0, acumEq2 = 0;

      golesOrdenados.forEach(gol => {
        const goleador = nombreJugador(gol.goleador_id);
        const asistidor = gol.asistidor_id ? nombreJugador(gol.asistidor_id) : null;
        const eqJugador = equipoJugador(gol.goleador_id);
        const esEnContra = gol.equipo !== eqJugador;

        // Actualizar marcador acumulado
        if (gol.equipo === 1) acumEq1++; else acumEq2++;

        // Formatear minuto
        let minutoStr = '—';
        if (gol.minuto !== null && gol.minuto !== undefined) {
          const mins = Math.floor(gol.minuto);
          const secs = Math.round((gol.minuto - mins) * 60);
          minutoStr = secs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${mins}'`;
        }

        // Contenido del gol
        let golContent = `<strong>${goleador}</strong>`;
        if (esEnContra) golContent += ` <span class="badge bg-warning text-dark" style="font-size:0.65em">EC</span>`;
        if (asistidor) golContent += `<br><small class="text-muted">Asist: ${asistidor}</small>`;

        // Boton de video
        let videoBtn = '';
        if (youtubeLink && gol.minuto !== null && gol.minuto !== undefined) {
          const videoId = extraerVideoId(youtubeLink);
          const segundos = Math.round(gol.minuto * 60);
          if (videoId) {
            videoBtn = `<br><button class="btn btn-sm btn-outline-danger mt-1 btn-play-gol"
              data-video-id="${videoId}" data-start="${segundos}">
              <i class="bi bi-play-fill"></i> Ver
            </button>`;
          }
        }

        const sumaAEquipo = gol.equipo;

        if (sumaAEquipo === 1) {
          html += `
            <div class="col-5 text-end pe-2">
              <div class="p-2 bg-primary bg-opacity-10 rounded mb-2">
                ${golContent}${videoBtn}
              </div>
            </div>
            <div class="col-2 text-center">
              <div class="mb-2">
                <span class="badge bg-secondary">${minutoStr}</span>
                <br><small class="text-muted" style="font-size:0.7em">${acumEq1} - ${acumEq2}</small>
              </div>
            </div>
            <div class="col-5 ps-2"><div class="mb-2"></div></div>
          `;
        } else {
          html += `
            <div class="col-5 text-end pe-2"><div class="mb-2"></div></div>
            <div class="col-2 text-center">
              <div class="mb-2">
                <span class="badge bg-secondary">${minutoStr}</span>
                <br><small class="text-muted" style="font-size:0.7em">${acumEq1} - ${acumEq2}</small>
              </div>
            </div>
            <div class="col-5 ps-2">
              <div class="p-2 bg-danger bg-opacity-10 rounded mb-2">
                ${golContent}${videoBtn}
              </div>
            </div>
          `;
        }
      });

      html += `</div>`;

      // Video player
      if (youtubeLink) {
        html += `
          <div id="gol-video-player" class="mt-4 d-none">
            <div class="ratio ratio-16x9">
              <iframe id="gol-video-iframe" src="" frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen></iframe>
            </div>
          </div>
        `;
      }
    }

    document.getElementById('golesPartidoModalBody').innerHTML = html;

    // Event listeners para botones de video
    document.querySelectorAll('#golesPartidoModalBody .btn-play-gol').forEach(btn => {
      btn.addEventListener('click', () => {
        const videoId = btn.dataset.videoId;
        const start = btn.dataset.start;
        const player = document.getElementById('gol-video-player');
        const iframe = document.getElementById('gol-video-iframe');
        if (player && iframe) {
          iframe.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1`;
          player.classList.remove('d-none');
          player.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('golesPartidoModal'));
    modal.show();

    // Limpiar iframe al cerrar
    document.getElementById('golesPartidoModal').addEventListener('hidden.bs.modal', () => {
      const iframe = document.getElementById('gol-video-iframe');
      if (iframe) iframe.src = '';
      const player = document.getElementById('gol-video-player');
      if (player) player.classList.add('d-none');
    }, { once: true });
  };

  window.eliminarPartido = async function(partidoId) {
    // Verificar permisos de administrador
    if (!verificarPermisosAdmin('eliminar un partido')) {
        return;
    }

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

  // Función para editar un partido existente
  window.editarPartido = async function(partidoId) {
    // Verificar permisos de administrador
    if (!verificarPermisosAdmin('editar un partido')) {
        return;
    }

    try {
      console.log('🖱️ Editando partido con ID:', partidoId);

      // Cargar datos del partido (incluye cagada_jugador_id si la columna existe)
      const selectPartidoConCagada = `
        *,
        temporadas (
          id,
          nombre
        ),
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
          id,
          goleador_id,
          asistidor_id,
          equipo,
          minuto,
          cagada_jugador_id
        )
      `;

      const selectPartidoSinCagada = `
        *,
        temporadas (
          id,
          nombre
        ),
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
          id,
          goleador_id,
          asistidor_id,
          equipo,
          minuto
        )
      `;

      let consultaPartido = await supabase
        .from('partidos')
        .select(selectPartidoConCagada)
        .eq('id', partidoId)
        .single();

      window.edicionSoportaCagadaEnGol = true;

      if (consultaPartido.error && esErrorColumnaCagadaFaltante(consultaPartido.error)) {
        console.warn('⚠️ La columna goles.cagada_jugador_id no existe. Se deshabilita la edición de cagada en goles.');

        consultaPartido = await supabase
          .from('partidos')
          .select(selectPartidoSinCagada)
          .eq('id', partidoId)
          .single();

        window.edicionSoportaCagadaEnGol = false;
      }

      const { data: partido, error } = consultaPartido;

      if (error) {
        console.error('Error al cargar partido:', error);
        showToast('Error al cargar los datos del partido', 'error');
        return;
      }

      console.log('✅ Datos del partido cargados:', partido);

      // Almacenar el ID del partido y los datos para usarlos después
      window.partidoEditandoId = partidoId;
      window.partidoEditandoDatos = partido;

      // Cargar opciones de temporadas en el select
      await cargarOpcionesTemporadasEdicion();

      // Pre-llenar el modal con los datos del partido
      document.getElementById('editar-fecha').value = partido.fecha;
      document.getElementById('editar-cancha').value = partido.cancha || '';
      document.getElementById('editar-temporada').value = partido.temporada_id || '';
      document.getElementById('editar-youtube-link').value = obtenerLinkYouTubeReview(partido.youtube_link) || '';

      // Separar jugadores por equipo
      const jugadoresEquipo1 = partido.jugador_partido?.filter(jp => jp.equipo === 1) || [];
      const jugadoresEquipo2 = partido.jugador_partido?.filter(jp => jp.equipo === 2) || [];

      // Renderizar equipos
      renderizarEquiposEdicion(jugadoresEquipo1, jugadoresEquipo2);

      // Poblar selects de MVP y ACE con todos los jugadores del partido
      poblarSelectsMVPACEEdicion(partido.jugador_partido || []);

      // Seleccionar MVP y ACE actuales
      const mvpActual = partido.jugador_partido?.find(jp => jp.mvp);
      const aceActual = partido.jugador_partido?.find(jp => jp.ace);

      document.getElementById('editar-mvp').value = mvpActual?.jugador_id || '';
      document.getElementById('editar-ace').value = aceActual?.jugador_id || '';

      // Renderizar los goles con sus tiempos y cagadas
      renderizarGolesEdicion(partido.goles || [], partido.jugador_partido || []);

      // Abrir el modal
      const modal = new bootstrap.Modal(document.getElementById('editarPartidoModal'));
      modal.show();

    } catch (error) {
      console.error('Error al abrir modal de edición:', error);
      showToast('Error inesperado al abrir el editor de partido', 'error');
    }
  };

  // Función para renderizar los equipos en el modal de edición
  function renderizarEquiposEdicion(equipo1, equipo2) {
    const container1 = document.getElementById('editar-equipo1-container');
    const container2 = document.getElementById('editar-equipo2-container');

    if (container1) {
      container1.innerHTML = equipo1.length > 0
        ? equipo1.map(jp => `
            <div class="badge bg-primary bg-opacity-25 text-primary me-1 mb-1 p-2">
              ${jp.jugadores?.nombre || 'Jugador'}
              ${jp.atajadas > 0 ? `<span class="ms-1">🥅${jp.atajadas}</span>` : ''}
              ${jp.cagadas > 0 ? `<span class="ms-1">💥${jp.cagadas}</span>` : ''}
            </div>
          `).join('')
        : '<span class="text-muted small">Sin jugadores</span>';
    }

    if (container2) {
      container2.innerHTML = equipo2.length > 0
        ? equipo2.map(jp => `
            <div class="badge bg-danger bg-opacity-25 text-danger me-1 mb-1 p-2">
              ${jp.jugadores?.nombre || 'Jugador'}
              ${jp.atajadas > 0 ? `<span class="ms-1">🥅${jp.atajadas}</span>` : ''}
              ${jp.cagadas > 0 ? `<span class="ms-1">💥${jp.cagadas}</span>` : ''}
            </div>
          `).join('')
        : '<span class="text-muted small">Sin jugadores</span>';
    }
  }

  // Función para poblar los selects de MVP y ACE en edición
  function poblarSelectsMVPACEEdicion(jugadores) {
    const selectMVP = document.getElementById('editar-mvp');
    const selectACE = document.getElementById('editar-ace');

    if (!selectMVP || !selectACE) return;

    // Limpiar y agregar opción vacía
    selectMVP.innerHTML = '<option value="">Sin MVP</option>';
    selectACE.innerHTML = '<option value="">Sin ACE</option>';

    // Ordenar jugadores por nombre
    const jugadoresOrdenados = [...jugadores].sort((a, b) =>
      (a.jugadores?.nombre || '').localeCompare(b.jugadores?.nombre || '')
    );

    // Agregar todos los jugadores del partido
    jugadoresOrdenados.forEach(jp => {
      const nombre = jp.jugadores?.nombre || 'Jugador';
      const equipo = jp.equipo === 1 ? '🔵' : '🔴';

      const optionMVP = document.createElement('option');
      optionMVP.value = jp.jugador_id;
      optionMVP.textContent = `${equipo} ${nombre}`;
      selectMVP.appendChild(optionMVP);

      const optionACE = document.createElement('option');
      optionACE.value = jp.jugador_id;
      optionACE.textContent = `${equipo} ${nombre}`;
      selectACE.appendChild(optionACE);
    });
  }

  // Función para renderizar goles en el modal de edición
  function renderizarGolesEdicion(goles, jugadores) {
    const container = document.getElementById('editar-goles-container');
    if (!container) return;
    const edicionCagadaHabilitada = window.edicionSoportaCagadaEnGol !== false;

    if (goles.length === 0) {
      container.innerHTML = `
        <div class="text-center text-muted py-3">
          <i class="bi bi-info-circle me-2"></i>
          No hay goles registrados en este partido
        </div>
      `;
      return;
    }

    container.innerHTML = goles.map((gol, index) => {
      const minutosDecimales = gol.minuto || 0;
      const minutos = Math.floor(minutosDecimales);
      const segundos = Math.round((minutosDecimales - minutos) * 60);

      // Buscar nombres de jugadores desde el array de jugador_partido
      const goleador = jugadores.find(j => j.jugador_id === gol.goleador_id);
      const asistidor = gol.asistidor_id ? jugadores.find(j => j.jugador_id === gol.asistidor_id) : null;
      const cagadaSeleccionada = gol.cagada_jugador_id ? String(gol.cagada_jugador_id) : '';

      const goleadorNombre = goleador?.jugadores?.nombre || 'Desconocido';
      const asistidorNombre = asistidor?.jugadores?.nombre || 'Sin asistencia';
      const opcionesCagada = jugadores.map(j => {
        const jugadorId = String(j.jugador_id || '');
        const nombre = j.jugadores?.nombre || 'Jugador';
        const equipo = j.equipo === 1 ? '🔵' : '🔴';
        const selected = jugadorId === cagadaSeleccionada ? 'selected' : '';
        return `<option value="${jugadorId}" ${selected}>${equipo} ${nombre}</option>`;
      }).join('');

      return `
        <div class="card bg-dark border-secondary mb-2" data-gol-id="${gol.id}">
          <div class="card-body p-3">
            <div class="row g-2 align-items-center">
              <div class="col-lg-2 col-md-3">
                <small class="text-light-emphasis d-block mb-1">⚽ Goleador</small>
                <strong class="text-white">${goleadorNombre}</strong>
              </div>
              <div class="col-lg-2 col-md-3">
                <small class="text-light-emphasis d-block mb-1">🎯 Asistencia</small>
                <span class="text-white">${asistidorNombre}</span>
              </div>
              <div class="col-lg-3 col-md-6">
                <label class="form-label text-light small mb-1">💥 Cagada</label>
                <select class="form-select form-select-sm gol-cagada"
                        data-gol-id="${gol.id}"
                        ${edicionCagadaHabilitada ? '' : 'disabled'}>
                  <option value="">Sin cagada</option>
                  ${opcionesCagada}
                </select>
                ${edicionCagadaHabilitada ? '' : '<small class="text-warning">No disponible en esta base</small>'}
              </div>
              <div class="col-lg-1 col-md-2">
                <label class="form-label text-light small mb-1">⏱️ Min</label>
                <input type="number"
                       class="form-control form-control-sm gol-minuto"
                       value="${minutos}"
                       min="0"
                       max="120"
                       data-gol-id="${gol.id}">
              </div>
              <div class="col-lg-1 col-md-2">
                <label class="form-label text-light small mb-1">⏱️ Seg</label>
                <input type="number"
                       class="form-control form-control-sm gol-segundo"
                       value="${segundos}"
                       min="0"
                       max="59"
                       data-gol-id="${gol.id}">
              </div>
              <div class="col-lg-3 col-md-4 text-end">
                <small class="text-light-emphasis d-block mb-1">👕 Equipo</small>
                <span class="badge ${gol.equipo === 1 ? 'bg-primary' : 'bg-danger'}">
                  ${gol.equipo === 1 ? '🔵 Equipo 1' : '🔴 Equipo 2'}
                </span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Función para actualizar los datos editables de los goles
  async function actualizarTiemposGoles() {
    const container = document.getElementById('editar-goles-container');
    if (!container) return;

    // Obtener todos los inputs de minutos, segundos y cagadas
    const inputsMinutos = container.querySelectorAll('.gol-minuto');
    const inputsSegundos = container.querySelectorAll('.gol-segundo');
    const inputsCagadas = container.querySelectorAll('.gol-cagada');

    // Crear array de updates
    const updates = [];

    inputsMinutos.forEach((inputMin, index) => {
      const inputSeg = inputsSegundos[index];
      const inputCagada = inputsCagadas[index];
      const golId = inputMin.getAttribute('data-gol-id');

      const minutos = parseInt(inputMin.value) || 0;
      const segundos = parseInt(inputSeg.value) || 0;
      const minutosDecimales = minutos + (segundos / 60);
      const cagada_jugador_id = inputCagada?.value ? inputCagada.value : null;

      // Redondear a 2 decimales para evitar problemas de precisión
      const minutosRedondeados = Math.round(minutosDecimales * 100) / 100;

      // Validar que esté en rango 0-120
      const minutosValidos = (minutosRedondeados >= 0 && minutosRedondeados <= 120) ? minutosRedondeados : null;

      console.log(`📝 Gol ${golId}: ${minutos}min ${segundos}seg = ${minutosRedondeados} minutos decimales (válido: ${minutosValidos})`);

      updates.push({
        id: golId,
        minuto: minutosValidos > 0 ? minutosValidos : null,
        cagada_jugador_id
      });
    });

    let columnaCagadaDisponible = window.edicionSoportaCagadaEnGol !== false;
    let avisoCagadaMostrado = false;

    // Actualizar cada gol en la base de datos
    for (const update of updates) {
      const payload = { minuto: update.minuto };
      if (columnaCagadaDisponible) {
        payload.cagada_jugador_id = update.cagada_jugador_id;
      }

      let { error } = await supabase
        .from('goles')
        .update(payload)
        .eq('id', update.id);

      if (error && columnaCagadaDisponible && esErrorColumnaCagadaFaltante(error)) {
        columnaCagadaDisponible = false;
        window.edicionSoportaCagadaEnGol = false;

        const { error: reintentoError } = await supabase
          .from('goles')
          .update({ minuto: update.minuto })
          .eq('id', update.id);

        error = reintentoError;

        if (!error && !avisoCagadaMostrado) {
          showToast('Se guardaron los tiempos, pero falta la columna cagada_jugador_id para editar la cagada.', 'warning');
          avisoCagadaMostrado = true;
        }
      }

      if (error) {
        console.error('Error al actualizar tiempo del gol:', error);
        throw new Error(`Error al actualizar tiempos de goles: ${error.message}`);
      }
    }

    console.log('✅ Tiempos de goles actualizados:', updates);
  }

  // Función para actualizar MVP y ACE en el partido
  async function actualizarMVPACE() {
    const selectMVP = document.getElementById('editar-mvp');
    const selectACE = document.getElementById('editar-ace');

    if (!selectMVP || !selectACE || !window.partidoEditandoId) return;

    const nuevoMVP = selectMVP.value || null;
    const nuevoACE = selectACE.value || null;

    console.log('📝 Actualizando MVP/ACE:', { nuevoMVP, nuevoACE, partidoId: window.partidoEditandoId });

    // Primero, quitar MVP y ACE de todos los jugadores del partido
    const { error: errorReset } = await supabase
      .from('jugador_partido')
      .update({ mvp: false, ace: false })
      .eq('partido_id', window.partidoEditandoId);

    if (errorReset) {
      console.error('Error al resetear MVP/ACE:', errorReset);
      throw new Error(`Error al resetear MVP/ACE: ${errorReset.message}`);
    }

    // Establecer nuevo MVP si hay uno seleccionado
    if (nuevoMVP) {
      const { error: errorMVP } = await supabase
        .from('jugador_partido')
        .update({ mvp: true })
        .eq('partido_id', window.partidoEditandoId)
        .eq('jugador_id', nuevoMVP);

      if (errorMVP) {
        console.error('Error al establecer MVP:', errorMVP);
        throw new Error(`Error al establecer MVP: ${errorMVP.message}`);
      }
    }

    // Establecer nuevo ACE si hay uno seleccionado
    if (nuevoACE) {
      const { error: errorACE } = await supabase
        .from('jugador_partido')
        .update({ ace: true })
        .eq('partido_id', window.partidoEditandoId)
        .eq('jugador_id', nuevoACE);

      if (errorACE) {
        console.error('Error al establecer ACE:', errorACE);
        throw new Error(`Error al establecer ACE: ${errorACE.message}`);
      }
    }

    console.log('✅ MVP/ACE actualizados correctamente');
  }

  // Función auxiliar para cargar temporadas en el modal de edición
  async function cargarOpcionesTemporadasEdicion() {
    try {
      const { data: temporadas, error } = await supabase
        .from('temporadas')
        .select('id, nombre')
        .order('fecha_inicio', { ascending: false });

      if (error) {
        console.error('Error al cargar temporadas:', error);
        return;
      }

      const select = document.getElementById('editar-temporada');
      select.innerHTML = '<option value="">Sin temporada</option>';

      temporadas?.forEach(temporada => {
        const option = document.createElement('option');
        option.value = temporada.id;
        option.textContent = temporada.nombre;
        select.appendChild(option);
      });

    } catch (error) {
      console.error('Error al cargar opciones de temporadas:', error);
    }
  }

  // Funcion para editar solo el link de review de un partido
  window.editarYouTubeLink = async function(partidoId, linkActual = '') {
    // Verificar permisos de administrador
    if (!verificarPermisosAdmin('editar el link de review')) {
        return;
    }

    try {
      console.log('📹 Editando link de review para partido:', partidoId);

      // Pre-llenar el modal con el link actual
      document.getElementById('youtube-link-editar').value = obtenerLinkYouTubeReview(linkActual) || '';

      // Almacenar el ID del partido que se está editando
      window.partidoYouTubeEditandoId = partidoId;

      // Abrir el modal especifico de review
      const modal = new bootstrap.Modal(document.getElementById('editarYouTubeModal'));
      modal.show();

    } catch (error) {
      console.error('Error al abrir modal de edicion de review:', error);
      showToast('Error inesperado al abrir el editor de review', 'error');
    }
  };

  // Event listener para guardar cambios del link de review
  document.getElementById('btn-guardar-youtube')?.addEventListener('click', async function() {
    if (!window.partidoYouTubeEditandoId) {
      showToast('Error: No hay partido seleccionado para editar', 'error');
      return;
    }

    try {
      const youtubeLinkInput = document.getElementById('youtube-link-editar').value.trim();
      const youtube_link = youtubeLinkInput ? obtenerLinkYouTubeReview(youtubeLinkInput) : null;

      if (youtubeLinkInput && !youtube_link) {
        showToast('El link de review para Historial debe ser de YouTube.', 'warning');
        return;
      }

      // Mostrar loading
      const btn = document.getElementById('btn-guardar-youtube');
      const textoOriginal = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Guardando...';

      // Actualizar solo el link de review en la base de datos
      const { error } = await supabase
        .from('partidos')
        .update({ youtube_link: youtube_link })
        .eq('id', window.partidoYouTubeEditandoId);

      if (error) {
        console.error('Error al actualizar link de review:', error);
        throw new Error(`Error al actualizar el link: ${error.message}`);
      }

      // Éxito
      if (youtube_link) {
        showToast('📹 Link de review actualizado exitosamente', 'success');
      } else {
        showToast('🗑️ Link de review eliminado exitosamente', 'success');
      }

      // Cerrar modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('editarYouTubeModal'));
      modal.hide();

      // Limpiar ID del partido editando
      window.partidoYouTubeEditandoId = null;

      // Recargar historial para mostrar los cambios
      cargarHistorialPartidos();

    } catch (error) {
      console.error('Error al guardar link de review:', error);
      showToast(`Error al guardar el link: ${error.message}`, 'error');
    } finally {
      // Restaurar botón
      const btn = document.getElementById('btn-guardar-youtube');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-camera-video me-2"></i>Guardar Link';
    }
  });

  // Event listener para guardar cambios del partido editado
  document.getElementById('btn-guardar-cambios')?.addEventListener('click', async function() {
    if (!window.partidoEditandoId) {
      showToast('Error: No hay partido seleccionado para editar', 'error');
      return;
    }

    try {
      const fecha = document.getElementById('editar-fecha').value;
      const cancha = document.getElementById('editar-cancha').value.trim();
      const temporada_id = document.getElementById('editar-temporada').value || null;
      const youtubeLinkInput = document.getElementById('editar-youtube-link').value.trim();
      const youtube_link = youtubeLinkInput ? obtenerLinkYouTubeReview(youtubeLinkInput) : null;

      if (!fecha) {
        showToast('La fecha es obligatoria', 'warning');
        return;
      }

      if (youtubeLinkInput && !youtube_link) {
        showToast('El link de review para Historial debe ser de YouTube.', 'warning');
        return;
      }

      // Mostrar loading
      const btn = document.getElementById('btn-guardar-cambios');
      const textoOriginal = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Guardando...';

      // Actualizar partido en la base de datos
      const { error } = await supabase
        .from('partidos')
        .update({
          fecha: fecha,
          cancha: cancha,
          temporada_id: temporada_id,
          youtube_link: youtube_link
        })
        .eq('id', window.partidoEditandoId);

      if (error) {
        console.error('Error al actualizar partido:', error);
        throw new Error(`Error al actualizar el partido: ${error.message}`);
      }

      // Actualizar tiempos de los goles
      await actualizarTiemposGoles();

      // Actualizar MVP y ACE
      await actualizarMVPACE();

      // Éxito
      showToast('✅ Partido actualizado exitosamente', 'success');

      // Cerrar modal
      const modal = bootstrap.Modal.getInstance(document.getElementById('editarPartidoModal'));
      modal.hide();

      // Limpiar ID del partido editando
      window.partidoEditandoId = null;

      // Recargar historial para mostrar los cambios
      cargarHistorialPartidos();

    } catch (error) {
      console.error('Error al guardar cambios:', error);
      showToast(`Error al guardar los cambios: ${error.message}`, 'error');
    } finally {
      // Restaurar botón
      const btn = document.getElementById('btn-guardar-cambios');
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-check-lg me-2"></i>Guardar Cambios';
    }
  });

  // --- Inicialización de la app ---
  console.log('🚀 Inicializando aplicación...');

  // Verificar autenticación primero
  verificarAutenticacion();

  // Actualizar UI según permisos inmediatamente
  actualizarUISegunPermisos();

  // Cargar datos iniciales
  const cargaInicialJugadores = cargarTodosLosJugadores();
  inicializarPosiciones();
  configurarFiltroPartidos();
  initReviewSandbox();
  initializeSearchableSelects(document);

  // Cargar temporadas primero, luego estadísticas e historial (en secuencia)
  Promise.all([cargaInicialJugadores, cargarTemporadas()]).then(async () => {
    if (rutaInicialPerfil.temporadaId !== null) {
      temporadaSeleccionada = aplicarTemporadaDesdeRuta(rutaInicialPerfil.temporadaId) || null;
    }
    console.log('📅 Temporada por defecto:', temporadaSeleccionada);
    const selectorResumenTemporada = document.getElementById('temporadas-resumen-selector');
    if (selectorResumenTemporada && temporadaSeleccionada) {
      selectorResumenTemporada.value = temporadaSeleccionada;
    }
    cargarEstadisticas();
    cargarHistorialPartidos();
    cargarResumenTemporadas();
    // Poblar selector de jugadores en el header
    poblarSelectorJugadoresPerfil();

    const jugadorRutaId = resolverJugadorIdDesdeRuta(rutaInicialPerfil.jugadorId);

    if (rutaInicialPerfil.vista === 'perfil' && jugadorRutaId) {
      const selectorHeader = document.getElementById('selector-jugador-perfil');
      if (selectorHeader) selectorHeader.value = jugadorRutaId;
      cambiarVista('perfil', jugadorRutaId);
    }

    // Precargar Mundialito T5 con la temporada seleccionada
    await cargarTemporadasMundialito();
    if (temporadaSeleccionada) {
      const selectMundialito = document.getElementById('mundialito-temporada');
      if (selectMundialito) {
        selectMundialito.value = temporadaSeleccionada;
      }
    }
    procesarMundialito();
  });

  // --- Event Listeners para Perfil de Jugador ---

  // Botón Dashboard
  const btnDashboard = document.getElementById('btn-vista-dashboard');
  if (btnDashboard) {
    btnDashboard.addEventListener('click', () => {
      cambiarVista('dashboard');
    });
  }

  // Botón Jugador - Abre modal para seleccionar jugador
  const btnJugador = document.getElementById('btn-vista-jugador');
  if (btnJugador) {
    btnJugador.addEventListener('click', () => {
      // Poblar el selector del modal
      poblarSelectorJugadorModal();
      // Mostrar el modal
      const modal = new bootstrap.Modal(document.getElementById('seleccionarJugadorModal'));
      modal.show();
    });
  }

  // Selector en el modal de selección de jugador
  const selectorJugadorModal = document.getElementById('selector-jugador-modal');
  if (selectorJugadorModal) {
    selectorJugadorModal.addEventListener('change', (e) => {
      const btnVerPerfil = document.getElementById('btn-ver-perfil-modal');
      if (btnVerPerfil) {
        btnVerPerfil.disabled = !e.target.value;
      }
    });
  }

  // Botón "Ver Perfil" en el modal
  const btnVerPerfilModal = document.getElementById('btn-ver-perfil-modal');
  if (btnVerPerfilModal) {
    btnVerPerfilModal.addEventListener('click', () => {
      const selectorModal = document.getElementById('selector-jugador-modal');
      const jugadorId = selectorModal?.value;
      if (jugadorId) {
        // Cerrar modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('seleccionarJugadorModal'));
        modal.hide();
        // Cambiar a vista perfil y cargar jugador
        cambiarVista('perfil', jugadorId);
        // Actualizar el selector del header también
        const selectorHeader = document.getElementById('selector-jugador-perfil');
        if (selectorHeader) selectorHeader.value = jugadorId;
      }
    });
  }

  // Selector de jugador para perfil (en el header principal)
  const selectorJugadorPerfil = document.getElementById('selector-jugador-perfil');
  if (selectorJugadorPerfil) {
    selectorJugadorPerfil.addEventListener('change', (e) => {
      if (e.target.value) {
        cargarPerfilJugador(e.target.value);
      }
    });
  }

  // Cuando cambia la temporada del dashboard, actualizar el perfil si está visible
  const selectorTemporadaDashboard = document.getElementById('selector-temporada');
  const selectorTemporadaMobileDashboard = document.getElementById('selector-temporada-mobile');

  const actualizarPerfilSiVisible = () => {
    if (vistaActual === 'perfil' && jugadorPerfilActual) {
      cargarPerfilJugador(jugadorPerfilActual);
    }
  };

  if (selectorTemporadaDashboard) {
    selectorTemporadaDashboard.addEventListener('change', actualizarPerfilSiVisible);
  }
  if (selectorTemporadaMobileDashboard) {
    selectorTemporadaMobileDashboard.addEventListener('change', actualizarPerfilSiVisible);
  }

  // Tabs del perfil - cargar sinergias/rivalidades bajo demanda
  const tabSinergias = document.getElementById('tab-perfil-sinergias');
  if (tabSinergias) {
    tabSinergias.addEventListener('shown.bs.tab', () => {
      if (jugadorPerfilActual && datosPerfilJugador) {
        renderizarSinergias();
      }
    });
  }

  const tabRivalidades = document.getElementById('tab-perfil-rivalidades');
  if (tabRivalidades) {
    tabRivalidades.addEventListener('shown.bs.tab', () => {
      if (jugadorPerfilActual && datosPerfilJugador) {
        renderizarRivalidades();
      }
    });
  }

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

  const temporadasTab = document.getElementById('temporadas-tab');
  if (temporadasTab) {
    temporadasTab.addEventListener('shown.bs.tab', function (e) {
      cargarResumenTemporadas();
    });
  }

  // Event listener para la pestaña de historial
  const historialTab = document.getElementById('historial-tab');
  if (historialTab) {
    historialTab.addEventListener('shown.bs.tab', function (e) {
      // Cargar historial cuando se muestra la pestaña
      cargarHistorialPartidos();
    });
  }

  // ===============================
  // FUNCIONALIDAD MUNDIALITO T5
  // ===============================

  // Variables globales del mundialito
  let mundialPartidos = [];
  let jugadoresMundial = new Map(); // Map<jugadorId, data>
  let parejasMundial = new Map(); // Map<jugadorAId-jugadorBId, data>
  let partidosJugadorParejas = new Map(); // Map<jugadorId, partidos jugados para congelar parejas>
  let temporadasMundial = [];
  const PARTIDOS_SIN_PAREJA_PARA_CONGELAR = 5;
  const FASES_MUNDIALITO = ['grupos', '8vos', '4tos', 'semis', 'final'];
  const SIGUIENTE_FASE_MUNDIALITO = {
    grupos: '8vos',
    '8vos': '4tos',
    '4tos': 'semis',
    semis: 'final',
    final: 'campeon'
  };

  // Estructura de progreso del jugador
  const crearJugadorMundial = (jugador) => ({
    id: jugador.id,
    nombre: jugador.nombre,
    fase: 'grupos', // grupos, 8vos, 4tos, semis, final, campeon
    victorias: 0,
    derrotas: 0,
    empates: 0,
    partidosGrupos: 0, // para fase de grupos (necesita 3 partidos)
    victoriasGrupos: 0, // victorias específicas en fase de grupos
    empatesGrupos: 0, // empates específicos en fase de grupos
    derrotasGrupos: 0, // derrotas específicas en fase de grupos
    bonusCount: 0, // cantidad de bonus: 0, 1 (2V+1E) o 2 (3V)
    eliminado: false,
    campeon: false,
    ultimoPartido: null,
    historialFases: [] // historial de fases alcanzadas
  });

  // Obtener badge de fase
  const obtenerBadgeFase = (jugador) => {
    if (jugador.fase === 'campeon') {
      const bonus = jugador.bonusCount > 0 ? ' ⭐'.repeat(jugador.bonusCount) : '';
      return { badge: 'bg-success', text: `👑 Campeón${bonus}`, descripcion: 'Ganó el mundial' };
    }

    switch (jugador.fase) {
      case 'grupos': {
        const record = `${jugador.victoriasGrupos}V-${jugador.empatesGrupos}E-${jugador.derrotasGrupos}D`;
        return { badge: 'bg-secondary', text: '👥 Grupos', descripcion: `${record} (${jugador.partidosGrupos}/3)` };
      }
      case '8vos': {
        const bonus = jugador.bonusCount > 0 ? ' ⭐'.repeat(jugador.bonusCount) : '';
        return { badge: 'bg-primary', text: `🏃 8vos${bonus}`, descripcion: jugador.bonusCount > 0 ? `Con ${jugador.bonusCount} bonus` : 'Sin bonus' };
      }
      case '4tos': {
        const bonus = jugador.bonusCount > 0 ? ' ⭐'.repeat(jugador.bonusCount) : '';
        return { badge: 'bg-info', text: `🚀 4tos${bonus}`, descripcion: jugador.bonusCount > 0 ? `Con ${jugador.bonusCount} bonus` : 'Sin bonus' };
      }
      case 'semis': {
        const bonus = jugador.bonusCount > 0 ? ' ⭐'.repeat(jugador.bonusCount) : '';
        return { badge: 'bg-warning text-dark', text: `⭐ Semis${bonus}`, descripcion: jugador.bonusCount > 0 ? `Con ${jugador.bonusCount} bonus` : 'Sin bonus' };
      }
      case 'final': {
        const bonus = jugador.bonusCount > 0 ? ' ⭐'.repeat(jugador.bonusCount) : '';
        return { badge: 'bg-danger', text: `🔥 Final${bonus}`, descripcion: jugador.bonusCount > 0 ? `Con ${jugador.bonusCount} bonus` : 'Sin bonus' };
      }
      default: return { badge: 'bg-dark', text: '❓ Indefinido', descripcion: 'Error' };
    }
  };

  // Determinar el resultado de un jugador en un partido
  const determinarResultadoJugador = (partido, jugadorId) => {
    const jugadorData = partido.jugador_partido?.find(jp => jp.jugador_id === jugadorId);
    if (!jugadorData) return null;

    const equipoJugador = jugadorData.equipo;
    const equipoGanador = partido.equipo_ganador;

    if (equipoGanador === null || equipoGanador === 0) {
      return 'empate';
    } else if (equipoGanador === equipoJugador) {
      return 'victoria';
    } else {
      return 'derrota';
    }
  };

  const crearParejaMundial = (jugadorA, jugadorB) => ({
    id: `${jugadorA.id}-${jugadorB.id}`,
    jugador1Id: jugadorA.id,
    jugador2Id: jugadorB.id,
    jugador1Nombre: jugadorA.nombre,
    jugador2Nombre: jugadorB.nombre,
    nombre: `${jugadorA.nombre} + ${jugadorB.nombre}`,
    fase: 'grupos',
    victorias: 0,
    derrotas: 0,
    empates: 0,
    victoriasRun: 0,
    derrotasRun: 0,
    empatesRun: 0,
    victoriasFase: 0,
    derrotasFase: 0,
    empatesFase: 0,
    partidosFase: 0,
    campeon: false,
    ultimoPartido: null,
    ultimoConteoJugador1: 0,
    ultimoConteoJugador2: 0,
    congelada: false,
    motivoCongelada: null,
    historialFases: []
  });

  const normalizarJugadoresPareja = (jugadorA, jugadorB) => {
    const jugadores = [jugadorA, jugadorB].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return jugadores;
  };

  const obtenerClavePareja = (jugadorA, jugadorB) => {
    const [primero, segundo] = normalizarJugadoresPareja(jugadorA, jugadorB);
    return `${primero.id}-${segundo.id}`;
  };

  const obtenerParejasPorEquipo = (partido) => {
    const equipos = new Map();
    (partido.jugador_partido || []).forEach(jp => {
      if (!jp.jugador_id || !jp.equipo) return;
      if (!equipos.has(jp.equipo)) equipos.set(jp.equipo, new Map());
      equipos.get(jp.equipo).set(jp.jugador_id, {
        id: jp.jugador_id,
        nombre: jp.jugadores?.nombre || `Jugador ${jp.jugador_id}`,
        equipo: jp.equipo
      });
    });

    const parejas = [];
    equipos.forEach((jugadoresMap, equipo) => {
      const jugadores = Array.from(jugadoresMap.values());
      for (let i = 0; i < jugadores.length; i += 1) {
        for (let j = i + 1; j < jugadores.length; j += 1) {
          const [jugadorA, jugadorB] = normalizarJugadoresPareja(jugadores[i], jugadores[j]);
          parejas.push({ jugadorA, jugadorB, equipo });
        }
      }
    });
    return parejas;
  };

  const determinarResultadoEquipo = (partido, equipo) => {
    const equipoGanador = partido.equipo_ganador;
    if (equipoGanador === null || equipoGanador === 0) return 'empate';
    return equipoGanador === equipo ? 'victoria' : 'derrota';
  };

  const registrarPartidosJugadoresParejas = (partido) => {
    const jugadoresPartido = new Set((partido.jugador_partido || []).map(jp => jp.jugador_id).filter(Boolean));
    jugadoresPartido.forEach(jugadorId => {
      partidosJugadorParejas.set(jugadorId, (partidosJugadorParejas.get(jugadorId) || 0) + 1);
    });
  };

  // Función de hash simple para generar seed determinística
  const hashCode = (str) => {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };

  // Generador de números pseudoaleatorios seeded (Linear Congruential Generator)
  const createSeededRandom = (seed) => {
    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % (2 ** 32);
      return state / (2 ** 32);
    };
  };

  // Overrides de moneda para el mundialito (persistidos en base de datos)
  window.mundialitoMonedaOverridesExact = {};
  window.mundialitoMonedaOverridesJugadorFase = {};
  window.mundialitoUmbralMoneda = 0.5;
  window.mundialitoSalt = '';

  // Cache de campeones mundiales
  window.campeonesMundiales = new Set();

  const loadOverridesFromDatabase = async () => {
    try {
      console.log('🔄 Cargando overrides de moneda desde la base de datos...');

      const { data: overrides, error } = await supabase
        .from('mundialito_moneda_overrides')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando overrides desde BD:', error);
        return;
      }

      // Limpiar overrides actuales
      window.mundialitoMonedaOverridesExact = {};
      window.mundialitoMonedaOverridesJugadorFase = {};

      // Procesar overrides desde la base de datos
      overrides.forEach(override => {
        if (override.tipo_override === 'exacto') {
          const key = `${override.partido_id}-${override.jugador_id}-${override.fase}`;
          window.mundialitoMonedaOverridesExact[key] = override.pasa;
        } else if (override.tipo_override === 'jugador_fase') {
          const key = `${override.jugador_id}-${override.fase}`;
          window.mundialitoMonedaOverridesJugadorFase[key] = override.pasa;
        }
      });

      console.log(`✅ Cargados ${overrides.length} overrides desde la base de datos`);
      console.log('📋 Overrides exactos:', Object.keys(window.mundialitoMonedaOverridesExact).length);
      console.log('📋 Overrides jugador-fase:', Object.keys(window.mundialitoMonedaOverridesJugadorFase).length);

    } catch (error) {
      console.error('Error cargando overrides desde BD:', error);
    }
  };

  // Función para cargar campeones mundiales
  const loadCampeonesMundiales = async () => {
    try {
      console.log('🔄 Cargando campeones mundiales...');
      console.log('🔍 jugadoresMundial existe:', typeof jugadoresMundial !== 'undefined');
      console.log('🔍 jugadoresMundial size:', typeof jugadoresMundial !== 'undefined' ? jugadoresMundial.size : 'undefined');

      // Limpiar cache anterior
      window.campeonesMundiales.clear();

      // Buscar campeones en el mundialito actual
      if (typeof jugadoresMundial !== 'undefined' && jugadoresMundial.size > 0) {
        console.log('🔍 Revisando jugadores del mundialito...');
        let campeonesEncontrados = 0;

        jugadoresMundial.forEach(jugador => {
          console.log(`🔍 Jugador: ${jugador.nombre}, campeon: ${jugador.campeon}, fase: ${jugador.fase}`);
          if (jugador.campeon) {
            window.campeonesMundiales.add(jugador.id);
            campeonesEncontrados++;
            console.log(`🏆 Campeón detectado: ${jugador.nombre} (ID: ${jugador.id})`);
          }
        });

        console.log(`🔍 Total campeones encontrados: ${campeonesEncontrados}`);
      } else {
        console.log('⚠️ jugadoresMundial no está disponible o está vacío');
      }

      console.log(`✅ Cargados ${window.campeonesMundiales.size} campeones mundiales`);

    } catch (error) {
      console.error('Error cargando campeones mundiales:', error);
    }
  };

  // Función para verificar si un jugador es campeón mundial
  window.esCampeonMundial = (jugadorId) => {
    return window.campeonesMundiales.has(jugadorId);
  };

  const toggleSeccionCampeones = (sectionId, visible) => {
    const section = document.getElementById(sectionId);
    if (section) section.classList.toggle('d-none', !visible);
  };

  // Función para renderizar el último campeón
  const renderizarUltimoCampeon = async () => {
    const container = document.getElementById('ultimo-campeon-container');
    if (!container) {
      console.log('⚠️ Container ultimo-campeon-container no encontrado');
      return;
    }

    try {
      console.log('🔄 Renderizando último campeón...');

      // Recargar campeones desde el mundialito actual
      await loadCampeonesMundiales();

      if (window.campeonesMundiales.size === 0) {
        console.log('⚠️ No hay campeones, ocultando sección último campeón');
        container.innerHTML = '';
        toggleSeccionCampeones('ultimo-campeon-section', false);
        return;
      }

      // Obtener información del último campeón (por fecha de campeonato)
      let ultimoCampeon = null;
      if (typeof jugadoresMundial !== 'undefined' && jugadoresMundial.size > 0) {
        const candidatos = [];
        jugadoresMundial.forEach(jugador => {
          if (jugador.campeon) {
            // Buscar la fecha en la que se registró el campeonato en el historial
            let fechaCampeon = null;
            if (Array.isArray(jugador.historialFases)) {
              const entry = jugador.historialFases.find(h => h && h.fase === 'campeon' && h.completada);
              if (entry && entry.fecha) fechaCampeon = entry.fecha;
            }
            // Fallback (no ideal): usar fecha del último partido si no hay marca de campeón
            if (!fechaCampeon && jugador.ultimoPartido && jugador.ultimoPartido.fecha) {
              fechaCampeon = jugador.ultimoPartido.fecha;
            }
            if (fechaCampeon) {
              candidatos.push({
                id: jugador.id,
                nombre: jugador.nombre,
                victorias: jugador.victorias,
                fechaCampeon: fechaCampeon
              });
            }
          }
        });
        // Elegir el más reciente por fechaCampeon
        candidatos.sort((a, b) => new Date(a.fechaCampeon) - new Date(b.fechaCampeon));
        ultimoCampeon = candidatos[candidatos.length - 1] || null;
      }

      if (!ultimoCampeon) {
        console.log('⚠️ No se encontró último campeón, ocultando sección');
        container.innerHTML = '';
        toggleSeccionCampeones('ultimo-campeon-section', false);
        return;
      }

      console.log('🎨 Renderizando último campeón:', ultimoCampeon);

      const fechaUltimo = ultimoCampeon.fechaCampeon ?
        new Date(ultimoCampeon.fechaCampeon + 'T12:00:00').toLocaleDateString('es-ES', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }) : 'Fecha no disponible';

      // Verificar si es Kite para mostrar su imagen especial
      const esKite = ultimoCampeon.nombre.toLowerCase().includes('kite');
      const imagenCampeon = esKite ? 'kite_campeon.jpg' : null;

      const html = `
        <div class="col-12">
          <div class="card bg-dark bg-opacity-25 border-light border-2 h-100">
            <div class="card-body text-center p-4">
              <div class="mb-4">
                ${imagenCampeon ? `
                  <img src="${imagenCampeon}" alt="${ultimoCampeon.nombre} Campeón"
                       class="img-fluid mb-3"
                       style="max-height: 400px; border-radius: 10px;">
                ` : `
                  <i class="bi bi-trophy text-warning" style="font-size: 4rem;"></i>
                `}
              </div>
              <h3 class="text-white fw-bold mb-3">
                ${ultimoCampeon.nombre} ⭐
              </h3>
              <p class="text-light-emphasis mb-3 fs-5">
                <i class="bi bi-calendar me-2"></i>
                ${fechaUltimo}
              </p>
            </div>
          </div>
        </div>
      `;

      container.innerHTML = html;
      toggleSeccionCampeones('ultimo-campeon-section', true);
      console.log('✅ Último campeón renderizado correctamente');

    } catch (error) {
      console.error('Error renderizando último campeón:', error);
      container.innerHTML = '';
      toggleSeccionCampeones('ultimo-campeon-section', false);
    }
  };

  // Función para renderizar campeones mundiales
  const renderizarCampeonesMundiales = async () => {
    const container = document.getElementById('campeones-container');
    if (!container) {
      console.log('⚠️ Container campeones-container no encontrado');
      return;
    }

    try {
      console.log('🔄 Renderizando campeones mundiales...');

      // Recargar campeones desde el mundialito actual
      await loadCampeonesMundiales();

      console.log('🔍 Campeones en cache:', window.campeonesMundiales.size);

      if (window.campeonesMundiales.size === 0) {
        console.log('⚠️ No hay campeones en cache, ocultando sección');
        container.innerHTML = '';
        toggleSeccionCampeones('campeones-section', false);
        return;
      }

      // Obtener información de los campeones con su fecha de campeonato
      const campeonesInfo = [];
      if (typeof jugadoresMundial !== 'undefined' && jugadoresMundial.size > 0) {
        jugadoresMundial.forEach(jugador => {
          if (jugador.campeon) {
            let fechaCampeon = null;
            if (Array.isArray(jugador.historialFases)) {
              const entry = jugador.historialFases.find(h => h && h.fase === 'campeon' && h.completada);
              if (entry && entry.fecha) fechaCampeon = entry.fecha;
            }
            if (!fechaCampeon && jugador.ultimoPartido && jugador.ultimoPartido.fecha) {
              fechaCampeon = jugador.ultimoPartido.fecha;
            }
            campeonesInfo.push({
              id: jugador.id,
              nombre: jugador.nombre,
              victorias: jugador.victorias,
              fechaCampeon: fechaCampeon
            });
          }
        });
      }

      console.log('🔍 Campeones info encontrados:', campeonesInfo.length);

      if (campeonesInfo.length === 0) {
        console.log('⚠️ No hay campeones en jugadoresMundial, ocultando sección');
        container.innerHTML = '';
        toggleSeccionCampeones('campeones-section', false);
        return;
      }

      console.log('🎨 Renderizando campeones:', campeonesInfo);

      // Renderizar campeones centrados
      const html = campeonesInfo.map((campeon, index) => {
        const fechaUltimo = campeon.fechaCampeon ?
          new Date(campeon.fechaCampeon + 'T12:00:00').toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }) : 'Fecha no disponible';

        // Verificar si es Kite para mostrar su imagen especial
        const esKite = campeon.nombre.toLowerCase().includes('kite');
        const imagenCampeon = esKite ? 'kite_campeon.jpg' : null;

        return `
          <div class="col-md-6 col-lg-4">
            <div class="card bg-warning bg-opacity-10 border-warning border-opacity-25 h-100">
              <div class="card-body text-center p-4">
                ${imagenCampeon ? `
                  <div class="mb-3">
                    <img src="${imagenCampeon}" alt="${campeon.nombre} Campeón"
                         class="img-fluid rounded-circle"
                         style="width: 80px; height: 80px; object-fit: cover; border: 3px solid #ffc107;">
                  </div>
                ` : `
                  <div class="mb-3">
                    <i class="bi bi-trophy text-warning fs-1"></i>
                  </div>
                `}
                <h5 class="text-warning fw-bold mb-2">
                  ${campeon.nombre} ⭐
                </h5>
                <p class="text-light-emphasis mb-2">
                  <i class="bi bi-calendar me-1"></i>
                  ${fechaUltimo}
                </p>
              </div>
            </div>
          </div>
        `;
      }).join('');

      console.log('🎨 HTML generado:', html);
      container.innerHTML = html;
      toggleSeccionCampeones('campeones-section', true);
      console.log('✅ Campeones renderizados correctamente');

    } catch (error) {
      console.error('Error renderizando campeones mundiales:', error);
      container.innerHTML = '';
      toggleSeccionCampeones('campeones-section', false);
    }
  };

  // Cargar overrides y campeones al inicializar
  loadOverridesFromDatabase();
  loadCampeonesMundiales();

  // Función para cargar campeones automáticamente
  const cargarCampeonesAutomaticamente = async () => {
    try {
      console.log('🔄 Cargando campeones automáticamente...');

      // Intentar cargar campeones desde el mundialito actual
      if (typeof jugadoresMundial !== 'undefined' && jugadoresMundial.size > 0) {
        console.log('✅ Mundialito ya procesado, cargando campeones...');
        await loadCampeonesMundiales();
        await renderizarUltimoCampeon();
        await renderizarCampeonesMundiales();
        return;
      }

      // Si no hay mundialito procesado, intentar procesarlo automáticamente
      console.log('🔄 Mundialito no procesado, intentando procesar automáticamente...');

      try {
        // Procesar mundialito automáticamente
        if (typeof window.procesarMundialito === 'function') {
          console.log('🔄 Procesando mundialito automáticamente...');
          await window.procesarMundialito();

          // Esperar un poco para que se procesen los datos
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Después de procesar, cargar campeones
          console.log('🔄 Mundialito procesado, cargando campeones...');
          await loadCampeonesMundiales();
          await renderizarUltimoCampeon();
          await renderizarCampeonesMundiales();
          return;
        } else {
          console.log('⚠️ Función procesarMundialito no disponible');
        }
      } catch (error) {
        console.log('⚠️ Error procesando mundialito automáticamente:', error);
      }

      // Si no se pudo procesar, ocultar sección
      console.log('🔄 No se pudo procesar mundialito, ocultando sección...');
      const container = document.getElementById('campeones-container');
      if (container) {
        container.innerHTML = '';
      }
      toggleSeccionCampeones('ultimo-campeon-section', false);
      toggleSeccionCampeones('campeones-section', false);

    } catch (error) {
      console.error('Error cargando campeones automáticamente:', error);
      toggleSeccionCampeones('ultimo-campeon-section', false);
      toggleSeccionCampeones('campeones-section', false);
    }
  };

  // Cargar campeones después de que se carguen todos los datos
  setTimeout(async () => {
    await cargarCampeonesAutomaticamente();
  }, 2000);

  // Función para hacer carga invisible del mundialito
  const cargarMundialitoInvisible = async () => {
    try {
      console.log('🔄 Cargando mundialito invisiblemente...');

      // Procesar mundialito sin mostrar interfaz
      if (typeof window.procesarMundialito === 'function') {
        await window.procesarMundialito();
        console.log('✅ Mundialito procesado invisiblemente');

        // Esperar un poco para que se procesen los datos
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Después de procesar, cargar campeones
        await loadCampeonesMundiales();
        await renderizarUltimoCampeon();
        await renderizarCampeonesMundiales();
        console.log('✅ Campeones cargados después de procesamiento invisible');
      } else {
        console.log('⚠️ Función procesarMundialito no disponible para carga invisible');
      }
    } catch (error) {
      console.log('⚠️ Error en carga invisible del mundialito:', error);
    }
  };

  // Ejecutar carga invisible del mundialito al inicio
  setTimeout(async () => {
    await cargarMundialitoInvisible();
  }, 3000);

  // Helpers para setear/limpiar overrides desde la consola (ahora con base de datos)
  window.setMonedaOverrideExact = async (partidoId, jugadorId, fase, pasa) => {
    try {
      // Guardar en base de datos
      const { error } = await supabase
        .from('mundialito_moneda_overrides')
        .upsert({
          partido_id: partidoId,
          jugador_id: jugadorId,
          fase: fase,
          pasa: !!pasa,
          tipo_override: 'exacto'
        }, {
          onConflict: 'partido_id,jugador_id,fase'
        });

      if (error) {
        console.error('Error guardando override exacto:', error);
        return false;
      }

      // Actualizar cache local
      window.mundialitoMonedaOverridesExact[`${partidoId}-${jugadorId}-${fase}`] = !!pasa;
      console.log(`✅ Override exacto guardado en BD: ${partidoId}-${jugadorId}-${fase} = ${pasa}`);
      return true;
    } catch (error) {
      console.error('Error en setMonedaOverrideExact:', error);
      return false;
    }
  };

  window.setMonedaOverrideJugadorFase = async (jugadorId, fase, pasa) => {
    try {
      // Guardar en base de datos
      const { error } = await supabase
        .from('mundialito_moneda_overrides')
        .upsert({
          partido_id: null, // Para overrides jugador-fase no necesitamos partido específico
          jugador_id: jugadorId,
          fase: fase,
          pasa: !!pasa,
          tipo_override: 'jugador_fase'
        }, {
          onConflict: 'jugador_id,fase'
        });

      if (error) {
        console.error('Error guardando override jugador-fase:', error);
        return;
      }

      // Actualizar cache local
      window.mundialitoMonedaOverridesJugadorFase[`${jugadorId}-${fase}`] = !!pasa;
      console.log(`✅ Override jugador-fase guardado en BD: ${jugadorId}-${fase} = ${pasa}`);

    } catch (error) {
      console.error('Error en setMonedaOverrideJugadorFase:', error);
    }
  };

  window.clearMonedaOverrides = async () => {
    try {
      // Limpiar de base de datos
      const { error } = await supabase
        .from('mundialito_moneda_overrides')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Eliminar todos

      if (error) {
        console.error('Error limpiando overrides:', error);
        return;
      }

      // Limpiar cache local
      window.mundialitoMonedaOverridesExact = {};
      window.mundialitoMonedaOverridesJugadorFase = {};
      console.log('✅ Todos los overrides han sido limpiados de la BD');

    } catch (error) {
      console.error('Error en clearMonedaOverrides:', error);
    }
  };

  // Función para ver overrides actuales
  window.verMonedaOverrides = () => {
    console.log('📋 Overrides exactos:', window.mundialitoMonedaOverridesExact);
    console.log('📋 Overrides jugador-fase:', window.mundialitoMonedaOverridesJugadorFase);
    console.log('📋 Umbral global:', window.mundialitoUmbralMoneda);
    console.log('📋 Salt:', window.mundialitoSalt);
  };

  // Función para recargar overrides desde la base de datos
  window.recargarMonedaOverrides = async () => {
    await loadOverridesFromDatabase();
  };

  // Función para forzar actualización de campeones
  window.actualizarCampeones = async () => {
    console.log('🔄 Forzando actualización de campeones...');
    await loadCampeonesMundiales();
    await renderizarUltimoCampeon();
    await renderizarCampeonesMundiales();
    console.log('✅ Campeones actualizados');
  };

  // Función para actualizar campeones cuando se cambie a la pestaña de estadísticas
  window.actualizarCampeonesEnEstadisticas = async () => {
    console.log('🔄 Actualizando campeones en pestaña estadísticas...');
    await cargarCampeonesAutomaticamente();
  };

  // Event listener para la pestaña de estadísticas
  const estadisticasTab = document.getElementById('estadisticas-tab');
  if (estadisticasTab) {
    estadisticasTab.addEventListener('shown.bs.tab', function (e) {
      // Actualizar campeones cuando se muestra la pestaña de estadísticas
      if (typeof window.actualizarCampeonesEnEstadisticas === 'function') {
        window.actualizarCampeonesEnEstadisticas();
      }
    });
  }

  // Función para tirar moneda determinística (50% probabilidad)
  // Usa partido ID + jugador ID + fase para generar seed única y reproducible
  // Ahora respeta overrides manuales y los persiste
  const tirarMonedaDeterministica = (partidoId, jugadorId, fase) => {
    const keyExact = `${partidoId}-${jugadorId}-${fase}`;
    const keyJugadorFase = `${jugadorId}-${fase}`;

    // Verificar overrides exactos primero
    if (keyExact in window.mundialitoMonedaOverridesExact) {
      return window.mundialitoMonedaOverridesExact[keyExact];
    }

    // Verificar overrides por jugador-fase
    if (keyJugadorFase in window.mundialitoMonedaOverridesJugadorFase) {
      return window.mundialitoMonedaOverridesJugadorFase[keyJugadorFase];
    }

    // Si no hay override, usar lógica determinística original
    const seedString = `${partidoId}-${jugadorId}-${fase}-${(window.mundialitoSalt||'')}`;
    const seed = hashCode(seedString);
    const seededRandom = createSeededRandom(seed);
    const umbral = (typeof window.mundialitoUmbralMoneda === 'number') ? window.mundialitoUmbralMoneda : 0.5;
    return seededRandom() < umbral;
  };

  const tirarMonedaParejaDeterministica = (partidoId, parejaId, fase) => {
    const seedString = `${partidoId}-${parejaId}-${fase}-parejas-${(window.mundialitoSalt||'')}`;
    const seed = hashCode(seedString);
    const seededRandom = createSeededRandom(seed);
    const umbral = (typeof window.mundialitoUmbralMoneda === 'number') ? window.mundialitoUmbralMoneda : 0.5;
    return seededRandom() < umbral;
  };

  const resetearParejaAGrupos = (pareja) => {
    pareja.fase = 'grupos';
    pareja.victoriasRun = 0;
    pareja.derrotasRun = 0;
    pareja.empatesRun = 0;
    pareja.victoriasFase = 0;
    pareja.derrotasFase = 0;
    pareja.empatesFase = 0;
    pareja.partidosFase = 0;
  };

  const reiniciarContadoresFasePareja = (pareja) => {
    pareja.victoriasFase = 0;
    pareja.derrotasFase = 0;
    pareja.empatesFase = 0;
    pareja.partidosFase = 0;
  };

  const avanzarParejaMundial = (pareja) => {
    const faseAnterior = pareja.fase;
    pareja.fase = SIGUIENTE_FASE_MUNDIALITO[pareja.fase] || 'campeon';
    reiniciarContadoresFasePareja(pareja);
    if (pareja.fase === 'campeon') {
      pareja.campeon = true;
    }
    return faseAnterior;
  };

  const obtenerBadgeFasePareja = (pareja) => {
    if (pareja.fase === 'campeon') {
      return { badge: 'bg-success', text: 'Campeones', descripcion: 'Ganaron el mundial de parejas' };
    }

    const record = `${pareja.victoriasFase}V-${pareja.empatesFase}E-${pareja.derrotasFase}D`;
    switch (pareja.fase) {
      case 'grupos': return { badge: 'bg-secondary', text: 'Grupos', descripcion: `${record} (${pareja.partidosFase}/3)` };
      case '8vos': return { badge: 'bg-primary', text: '8vos', descripcion: `${record} (${pareja.partidosFase}/3)` };
      case '4tos': return { badge: 'bg-info', text: '4tos', descripcion: `${record} (${pareja.partidosFase}/3)` };
      case 'semis': return { badge: 'bg-warning text-dark', text: 'Semis', descripcion: `${record} (${pareja.partidosFase}/3)` };
      case 'final': return { badge: 'bg-danger', text: 'Final', descripcion: `${record} (${pareja.partidosFase}/3)` };
      default: return { badge: 'bg-dark', text: 'Indefinido', descripcion: 'Error' };
    }
  };

  const procesarPartidoParejasMundial = (partido) => {
    if (!partido.jugador_partido) return [];

    const cambiosFase = [];
    const parejasPartido = obtenerParejasPorEquipo(partido);

    parejasPartido.forEach(({ jugadorA, jugadorB, equipo }) => {
      const clave = obtenerClavePareja(jugadorA, jugadorB);
      let pareja = parejasMundial.get(clave);

      if (!pareja) {
        pareja = crearParejaMundial(jugadorA, jugadorB);
        parejasMundial.set(clave, pareja);
      }

      if (pareja.fase === 'campeon') {
        resetearParejaAGrupos(pareja);
      }

      const resultado = determinarResultadoEquipo(partido, equipo);
      pareja.ultimoPartido = {
        id: partido.id,
        fecha: partido.fecha,
        resultado
      };
      pareja.ultimoConteoJugador1 = partidosJugadorParejas.get(pareja.jugador1Id) || 0;
      pareja.ultimoConteoJugador2 = partidosJugadorParejas.get(pareja.jugador2Id) || 0;
      pareja.congelada = false;
      pareja.motivoCongelada = null;

      pareja.partidosFase += 1;
      if (resultado === 'victoria') {
        pareja.victorias += 1;
        pareja.victoriasRun += 1;
        pareja.victoriasFase += 1;
      } else if (resultado === 'derrota') {
        pareja.derrotas += 1;
        pareja.derrotasRun += 1;
        pareja.derrotasFase += 1;
      } else {
        pareja.empates += 1;
        pareja.empatesRun += 1;
        pareja.empatesFase += 1;
      }

      let resolucion = null;
      if (pareja.victoriasFase >= 2) {
        resolucion = { pasa: true, metodo: 'automatico', razon: '2 victorias' };
      } else if (pareja.derrotasFase >= 2) {
        resolucion = { pasa: false, metodo: 'automatico', razon: '2 derrotas' };
      } else if (pareja.partidosFase >= 3) {
        const pasaMoneda = tirarMonedaParejaDeterministica(partido.id, pareja.id, pareja.fase);
        resolucion = { pasa: pasaMoneda, metodo: 'moneda', razon: '3 partidos sin definicion' };
      }

      if (!resolucion) return;

      const faseAnterior = pareja.fase;
      const record = `${pareja.victoriasFase}V-${pareja.empatesFase}E-${pareja.derrotasFase}D`;
      const recordRun = `${pareja.victoriasRun}V-${pareja.empatesRun}E-${pareja.derrotasRun}D`;

      if (resolucion.pasa) {
        const faseCompletada = avanzarParejaMundial(pareja);
        pareja.historialFases.push({
          fase: faseCompletada,
          completada: true,
          fecha: partido.fecha,
          record,
          recordRun,
          metodo: resolucion.metodo,
          razon: resolucion.razon,
          partidoId: partido.id
        });

        if (pareja.fase === 'campeon') {
          pareja.historialFases.push({
            fase: 'campeon',
            completada: true,
            fecha: partido.fecha,
            record,
            recordRun,
            metodo: resolucion.metodo,
            partidoId: partido.id
          });
        }

        cambiosFase.push({
          pareja: pareja.nombre,
          tipo: 'clasificada',
          fase: pareja.fase,
          razon: resolucion.razon
        });
      } else {
        resetearParejaAGrupos(pareja);
        pareja.historialFases.push({
          fase: `eliminado_${faseAnterior}`,
          completada: false,
          fecha: partido.fecha,
          record,
          recordRun,
          metodo: resolucion.metodo,
          razon: resolucion.razon,
          partidoId: partido.id
        });
        pareja.victoriasRun = 0;
        pareja.derrotasRun = 0;
        pareja.empatesRun = 0;

        cambiosFase.push({
          pareja: pareja.nombre,
          tipo: 'eliminada',
          fase: faseAnterior,
          razon: resolucion.razon
        });
      }
    });

    partido.cambiosMundialitoParejas = cambiosFase;
    return cambiosFase;
  };

  const actualizarParejasCongeladasMundial = () => {
    parejasMundial.forEach(pareja => {
      const partidosSinJugador1 = (partidosJugadorParejas.get(pareja.jugador1Id) || 0) - (pareja.ultimoConteoJugador1 || 0);
      const partidosSinJugador2 = (partidosJugadorParejas.get(pareja.jugador2Id) || 0) - (pareja.ultimoConteoJugador2 || 0);
      const jugador1ActivoSinJugador2 = partidosSinJugador1 >= PARTIDOS_SIN_PAREJA_PARA_CONGELAR && partidosSinJugador2 === 0;
      const jugador2ActivoSinJugador1 = partidosSinJugador2 >= PARTIDOS_SIN_PAREJA_PARA_CONGELAR && partidosSinJugador1 === 0;

      if (jugador1ActivoSinJugador2 || jugador2ActivoSinJugador1) {
        const jugadorCongelante = jugador1ActivoSinJugador2 ? pareja.jugador1Nombre : pareja.jugador2Nombre;
        const jugadorInactivo = jugador1ActivoSinJugador2 ? pareja.jugador2Nombre : pareja.jugador1Nombre;
        pareja.congelada = true;
        pareja.motivoCongelada = `${jugadorCongelante} jugo ${PARTIDOS_SIN_PAREJA_PARA_CONGELAR} partidos y ${jugadorInactivo} no jugo ninguno`;
      }
    });
  };

  // Función para evaluar si pasa de fase de grupos
  const evaluarPaseGrupos = (jugador) => {
    const { victoriasGrupos, empatesGrupos, derrotasGrupos } = jugador;

    // 3 victorias = 2 bonus (pasa directo sin moneda en 2 eliminatorias)
    if (victoriasGrupos === 3) {
      jugador.bonusCount = 2;
      return true;
    }

    // 2 victorias + 1 empate = 1 bonus (pasa)
    if (victoriasGrupos === 2 && empatesGrupos === 1) {
      jugador.bonusCount = 1;
      return true;
    }

    // 2 victorias + 1 derrota = pasa sin bonus
    if (victoriasGrupos === 2 && derrotasGrupos === 1) {
      jugador.bonusCount = 0;
      return true;
    }

    // 1 victoria + 2 empates = pasa sin bonus
    if (victoriasGrupos === 1 && empatesGrupos === 2) {
      jugador.bonusCount = 0;
      return true;
    }

    // 1 victoria + 1 empate + 1 derrota = tirar moneda para pasar
    if (victoriasGrupos === 1 && empatesGrupos === 1 && derrotasGrupos === 1) {
      // Usar último partido para generar seed determinística
      const partidoId = jugador.ultimoPartido?.id || 0;
      return tirarMonedaDeterministica(partidoId, jugador.id, 'grupos');
    }

    // 1 victoria + 2 derrotas = afuera
    if (victoriasGrupos === 1 && derrotasGrupos === 2) {
      return false;
    }

    // Cualquier otra combinación de empates/derrotas = afuera
    // Esto incluye: 0V, solo empates, 2+ derrotas, etc.
    return false;
  };

  // Función para evaluar si pasa en fases eliminatorias
  const evaluarPasePlayoffs = (jugador, resultado) => {
    // Si gana, pasa automáticamente sin consumir bonus
    if (resultado === 'victoria') {
      return true;
    }

    // Si pierde, no pasa
    if (resultado === 'derrota') {
      return false;
    }

    // Si empata y tiene bonus, consume 1 bonus y pasa automáticamente
    if (resultado === 'empate' && jugador.bonusCount > 0) {
      jugador.bonusCount--; // Consume 1 bonus
      return true;
    }

    // Si empata sin bonus, tirar moneda
    if (resultado === 'empate') {
      // Usar último partido para generar seed determinística
      const partidoId = jugador.ultimoPartido?.id || 0;
      return tirarMonedaDeterministica(partidoId, jugador.id, jugador.fase);
    }

    return false;
  };

  // Resetear jugador a fase de grupos
  const resetearAGrupos = (jugador) => {
    jugador.fase = 'grupos';
    jugador.victorias = 0;
    jugador.derrotas = 0;
    jugador.empates = 0;
    jugador.partidosGrupos = 0;
    jugador.victoriasGrupos = 0;
    jugador.empatesGrupos = 0;
    jugador.derrotasGrupos = 0;
    jugador.bonusCount = 0;
  };

    // Procesar un partido para el mundialito
  const procesarPartidoMundial = (partido) => {
    if (!partido.jugador_partido) return;

    const cambiosFase = []; // Array para registrar cambios de fase en este partido

    partido.jugador_partido.forEach(jp => {
      const jugadorId = jp.jugador_id;
      let jugador = jugadoresMundial.get(jugadorId);

      // Si es la primera vez que vemos este jugador, crearlo
      if (!jugador) {
        jugador = crearJugadorMundial({
          id: jugadorId,
          nombre: jp.jugadores?.nombre || `Jugador ${jugadorId}`
        });
        jugadoresMundial.set(jugadorId, jugador);
      }

      // Si el jugador fue campeón, el siguiente partido reinicia su ciclo a grupos
      if (jugador.fase === 'campeon') {
        // Mantener la marca histórica de campeón, pero reiniciar su ruta competitiva
        resetearAGrupos(jugador);
      }

      const resultado = determinarResultadoJugador(partido, jugadorId);
      if (!resultado) return;

      // Guardar fase anterior para detectar cambios
      const faseAnterior = jugador.fase;

      jugador.ultimoPartido = {
        id: partido.id,
        fecha: partido.fecha,
        resultado: resultado
      };

      // Procesar resultado según la fase actual
      if (jugador.fase === 'grupos') {
        jugador.partidosGrupos++;

        // Contar resultado específico de grupos
        if (resultado === 'victoria') {
          jugador.victoriasGrupos++;
          jugador.victorias++;
        } else if (resultado === 'empate') {
          jugador.empatesGrupos++;
          jugador.empates++;
        } else if (resultado === 'derrota') {
          jugador.derrotasGrupos++;
          jugador.derrotas++;
        }

        // NUEVA REGLA: Eliminación inmediata con 2 derrotas
        if (jugador.derrotasGrupos >= 2) {

          resetearAGrupos(jugador);
          jugador.historialFases.push({
            fase: 'eliminado_grupos',
            completada: false,
            fecha: partido.fecha,
            razon: '2 derrotas - Eliminación inmediata',
            metodo: 'automatico',
            partidoId: partido.id
          });

          // Registrar cambio de fase
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'eliminado',
            fase: 'grupos',
            razon: '2 derrotas'
          });
        }
        // Evaluar si completó los 3 partidos de grupos
        else if (jugador.partidosGrupos >= 3) {
          const pasa = evaluarPaseGrupos(jugador);

          if (pasa) {
            // Avanza a 8vos
            jugador.fase = '8vos';

            // Determinar si fue por moneda
            const fueMoneda = (jugador.victoriasGrupos === 1 && jugador.empatesGrupos === 1 && jugador.derrotasGrupos === 1);

            jugador.historialFases.push({
              fase: 'grupos',
              completada: true,
              fecha: partido.fecha,
              record: `${jugador.victoriasGrupos}V-${jugador.empatesGrupos}E-${jugador.derrotasGrupos}D`,
              bonus: jugador.bonusCount,
              metodo: fueMoneda ? 'moneda' : 'automatico',
              partidoId: partido.id
            });

            // Registrar cambio de fase
            cambiosFase.push({
              jugador: jugador.nombre,
              tipo: 'clasificado',
              fase: '8vos',
              razon: fueMoneda ? 'moneda' : 'clasificó'
            });
          } else {
            // No pasa, resetear a grupos
            const fueMoneda = (jugador.victoriasGrupos === 1 && jugador.empatesGrupos === 1 && jugador.derrotasGrupos === 1);

            resetearAGrupos(jugador);
            jugador.historialFases.push({
              fase: 'eliminado_grupos',
              completada: false,
              fecha: partido.fecha,
              razon: 'No clasificó de grupos',
              metodo: fueMoneda ? 'moneda' : 'automatico',
              partidoId: partido.id
            });

            // Registrar cambio de fase
            cambiosFase.push({
              jugador: jugador.nombre,
              tipo: 'eliminado',
              fase: 'grupos',
              razon: fueMoneda ? 'moneda' : 'no clasificó'
            });
          }
        }
      } else {
        // Fases eliminatorias (8vos, 4tos, semis, final)
        const pasa = evaluarPasePlayoffs(jugador, resultado);

        // Contar estadísticas generales
        if (resultado === 'victoria') {
          jugador.victorias++;
        } else if (resultado === 'empate') {
          jugador.empates++;
        } else if (resultado === 'derrota') {
          jugador.derrotas++;
        }

        if (pasa) {
          // Avanza a la siguiente fase
          const faseAnterior = jugador.fase;

          if (jugador.fase === '8vos') {
            jugador.fase = '4tos';
          } else if (jugador.fase === '4tos') {
            jugador.fase = 'semis';
          } else if (jugador.fase === 'semis') {
            jugador.fase = 'final';
          } else if (jugador.fase === 'final') {
            jugador.fase = 'campeon';
            jugador.campeon = true;
            // Registrar logro de campeonato en historial
            jugador.historialFases.push({
              fase: 'campeon',
              completada: true,
              fecha: partido.fecha,
              resultado: 'victoria',
              metodo: 'automatico',
              partidoId: partido.id
            });
          }

          // Determinar si fue por moneda (empate sin bonus)
          const fueMoneda = (resultado === 'empate' && jugador.bonusCount === 0);

          jugador.historialFases.push({
            fase: faseAnterior,
            completada: true,
            fecha: partido.fecha,
            resultado: resultado,
            bonus: jugador.bonusCount,
            metodo: fueMoneda ? 'moneda' : 'automatico',
            partidoId: partido.id
          });

          // Registrar cambio de fase
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'clasificado',
            fase: jugador.fase,
            razon: fueMoneda ? 'moneda' : resultado
          });
        } else {
          // No pasa, vuelve a grupos
          const faseAnterior = jugador.fase;

          // Determinar si fue por moneda (empate sin bonus)
          const fueMoneda = (resultado === 'empate' && jugador.bonusCount === 0);

          resetearAGrupos(jugador);
          jugador.historialFases.push({
            fase: `eliminado_${faseAnterior}`,
            completada: false,
            fecha: partido.fecha,
            resultado: resultado,
            razon: `Eliminado en ${faseAnterior}`,
            metodo: fueMoneda ? 'moneda' : 'automatico',
            partidoId: partido.id
          });

          // Registrar cambio de fase
          cambiosFase.push({
            jugador: jugador.nombre,
            tipo: 'eliminado',
            fase: faseAnterior,
            razon: fueMoneda ? 'moneda' : resultado
          });
        }
      }
    });

    // Guardar cambios de fase para este partido
    partido.cambiosMundialito = cambiosFase;
    return cambiosFase;
  };

  // Cargar partidos para mundialito
  const cargarPartidosMundialito = async (temporadaIdOverride = null) => {
    try {
      const temporadaSelect = document.getElementById('mundialito-temporada');
      const temporadaSeleccionada = temporadaIdOverride ?? temporadaSelect?.value;

      let query = supabase
        .from('partidos')
        .select(`*, jugador_partido(*, jugadores(id, nombre))`)
        .order('fecha', { ascending: true });

      if (temporadaSeleccionada && temporadaSeleccionada !== 'all') {
        query = query.eq('temporada_id', temporadaSeleccionada);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('❌ Error cargando partidos:', error);
      return [];
    }
  };

  // Procesar mundialito completo
  window.procesarMundialito = async () => {
    try {
      const container = document.getElementById('mundialito-fixture');
      if (container) {
        container.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-warning"></div><p class="text-light-emphasis mt-2">Procesando...</p></div>`;
      }

      jugadoresMundial.clear();
      parejasMundial.clear();
      partidosJugadorParejas.clear();
      mundialPartidos = await cargarPartidosMundialito();

      if (mundialPartidos.length === 0) {
        if (container) {
          container.innerHTML = `<div class="text-center py-4"><i class="bi bi-exclamation-triangle text-warning fs-2"></i><p class="text-light-emphasis mt-2">No se encontraron partidos</p></div>`;
        }
        return;
      }

      mundialPartidos.forEach(partido => {
        registrarPartidosJugadoresParejas(partido);
        procesarPartidoMundial(partido);
        procesarPartidoParejasMundial(partido);
      });
      actualizarParejasCongeladasMundial();

      mostrarFixtureMundialito();
      mostrarFixtureParejasMundialito();
      actualizarEstadisticasMundialito();
      actualizarEstadisticasParejasMundialito();

      // Actualizar campeones mundiales después de procesar
      await loadCampeonesMundiales();

      // Renderizar campeones en la página principal
      await renderizarUltimoCampeon();
      await renderizarCampeonesMundiales();

      // Renderizar estadísticas (histograma) si la pestaña existe
      renderizarEstadisticasMundialito();

    } catch (error) {
      console.error('❌ Error procesando mundialito:', error);
    }
  };

  // Mostrar fixture del mundialito
  const mostrarFixtureMundialito = () => {
    const container = document.getElementById('mundialito-fixture');
    if (!container || jugadoresMundial.size === 0) return;

    const jugadoresPorFase = {
      campeon: [],
      final: [],
      semis: [],
      '4tos': [],
      '8vos': [],
      grupos: []
    };

    jugadoresMundial.forEach(jugador => {
      if (jugador.fase === 'campeon') {
        jugadoresPorFase.campeon.push(jugador);
      } else {
        jugadoresPorFase[jugador.fase]?.push(jugador);
      }
    });

    Object.keys(jugadoresPorFase).forEach(fase => {
      jugadoresPorFase[fase].sort((a, b) => b.victorias - a.victorias);
    });

    let html = '';

    // Función para generar contenido del tooltip con historial
    const generarTooltipHistorial = (jugador) => {
      let tooltip = `<div class="fw-bold mb-2">🏆 Historial Mundial - ${jugador.nombre}</div>`;

      // Estadísticas actuales
      tooltip += `<div class="mb-2">`;
      tooltip += `<strong>📊 Estado Actual:</strong><br>`;
      tooltip += `• Fase: ${obtenerBadgeFase(jugador).text}<br>`;
      tooltip += `• Record Total: ${jugador.victorias}V-${jugador.empates}E-${jugador.derrotas}D<br>`;
      if (jugador.bonusCount > 0) {
        tooltip += `• ⭐ ${jugador.bonusCount} Bonus Activos<br>`;
      }
      tooltip += `</div>`;

      // Historial de fases
      if (jugador.historialFases && jugador.historialFases.length > 0) {
        tooltip += `<div class="mb-2">`;
        tooltip += `<strong>📜 Historial de Fases:</strong><br>`;

        jugador.historialFases.forEach((fase, index) => {
          const fechaCorregida = new Date(fase.fecha + 'T12:00:00');
          const fecha = fechaCorregida.toLocaleDateString('es-ES');

          if (fase.completada) {
            if (fase.fase === 'grupos') {
              tooltip += `${index + 1}. ✅ Clasificó de Grupos (${fecha})`;
              if (fase.record) tooltip += `<br>   Record: ${fase.record}`;
              if (fase.bonus) tooltip += `<br>   ⭐ Obtuvo Bonus`;
              if (fase.metodo === 'moneda') tooltip += `<br>   🪙 Por moneda`;
            } else if (fase.fase === 'campeon') {
              tooltip += `${index + 1}. 👑 ¡CAMPEÓN! (${fecha})`;
            } else {
              tooltip += `${index + 1}. ✅ Pasó de ${fase.fase} (${fecha})`;
              if (fase.resultado) tooltip += `<br>   Resultado: ${fase.resultado}`;
              if (fase.metodo === 'moneda') tooltip += `<br>   🪙 Por moneda`;
            }
          } else {
            if (fase.fase.startsWith('eliminado_')) {
              const faseEliminada = fase.fase.replace('eliminado_', '');
              tooltip += `${index + 1}. ❌ Eliminado en ${faseEliminada} (${fecha})`;
              if (fase.resultado) tooltip += `<br>   Resultado: ${fase.resultado}`;
              if (fase.metodo === 'moneda') tooltip += `<br>   🪙 Por moneda`;
            } else {
              tooltip += `${index + 1}. ❌ ${fase.razon || 'Eliminado'} (${fecha})`;
              if (fase.metodo === 'moneda') tooltip += `<br>   🪙 Por moneda`;
            }
          }
          tooltip += `<br>`;
        });
        tooltip += `</div>`;
      }

      // Último partido jugado
      if (jugador.ultimoPartido) {
        const fechaUltimoCorregida = new Date(jugador.ultimoPartido.fecha + 'T12:00:00');
        const fechaUltimo = fechaUltimoCorregida.toLocaleDateString('es-ES');
        tooltip += `<div class="small text-light-emphasis">`;
        tooltip += `<strong>⚽ Último partido:</strong> ${jugador.ultimoPartido.resultado} (${fechaUltimo})`;
        tooltip += `</div>`;
      }

      return tooltip;
    };

    // Campeones
    if (jugadoresPorFase.campeon.length > 0) {
      html += `
        <div class="col-12 mb-4">
          <h6 class="text-success mb-3">👑 Campeones (${jugadoresPorFase.campeon.length})</h6>
          <div class="row g-2">
            ${jugadoresPorFase.campeon.map((jugador, index) => {
              const badge = obtenerBadgeFase(jugador);
              const tooltipContent = generarTooltipHistorial(jugador);
              return `
                <div class="col-md-4 col-lg-3">
                  <div class="card bg-success bg-opacity-25 border-success mundialito-card"
                       data-bs-toggle="tooltip"
                       data-bs-placement="top"
                       data-bs-html="true"
                       data-bs-title="${tooltipContent.replace(/"/g, '&quot;')}">
                    <div class="card-body p-3">
                      <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="fw-bold text-white">${jugador.nombre} ⭐</span>
                        ${index === 0 ? '<i class="bi bi-trophy text-warning"></i>' : ''}
                      </div>
                      <span class="badge ${badge.badge} mb-1">${badge.text}</span>
                      <div class="small text-light-emphasis">${jugador.victorias} victorias</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Otras fases
    const fases = [
      { key: 'final', title: '🔥 Finalistas', color: 'danger' },
      { key: 'semis', title: '⭐ Semifinalistas', color: 'warning' },
      { key: '4tos', title: '🚀 Cuartos de Final', color: 'info' },
      { key: '8vos', title: '🏃 Octavos de Final', color: 'primary' },
      { key: 'grupos', title: '👥 Fase de Grupos', color: 'secondary' }
    ];

    fases.forEach(fase => {
      const jugadores = jugadoresPorFase[fase.key];
      if (jugadores.length === 0) return;

      html += `
        <div class="col-12 mb-4">
          <h6 class="text-${fase.color} mb-3">${fase.title} (${jugadores.length})</h6>
          <div class="row g-2">
            ${jugadores.map(jugador => {
              const badge = obtenerBadgeFase(jugador);
              const tooltipContent = generarTooltipHistorial(jugador);
              return `
                <div class="col-md-4 col-lg-3">
                  <div class="card bg-${fase.color} bg-opacity-10 border-${fase.color} border-opacity-25 mundialito-card"
                       data-bs-toggle="tooltip"
                       data-bs-placement="top"
                       data-bs-html="true"
                       data-bs-title="${tooltipContent.replace(/"/g, '&quot;')}">
                    <div class="card-body p-3">
                      <div class="fw-bold text-white mb-2">${jugador.nombre}</div>
                      <span class="badge ${badge.badge} mb-1">${badge.text}</span>
                      <div class="small text-light-emphasis">${badge.descripcion}</div>
                      <div class="small text-light-emphasis mt-1">
                        ${jugador.victorias}V - ${jugador.empates}E - ${jugador.derrotas}D
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html || '<div class="col-12"><div class="text-center py-4"><p class="text-light-emphasis">No hay jugadores para mostrar</p></div></div>';

    // Inicializar tooltips después de actualizar el contenido
    setTimeout(() => {
      const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
      tooltipTriggerList.forEach(tooltipTriggerEl => {
        new bootstrap.Tooltip(tooltipTriggerEl, {
          html: true,
          trigger: 'hover focus',
          customClass: 'mundialito-tooltip',
          template: '<div class="tooltip mundialito-tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner text-start" style="white-space: pre-line; max-width: 400px;"></div></div>'
        });
      });
    }, 100);
  };

  const obtenerRankingPareja = (pareja) => {
    const faseRank = { grupos: 0, '8vos': 1, '4tos': 2, semis: 3, final: 4, campeon: 5 };
    return {
      fase: faseRank[pareja.fase] ?? 0,
      victoriasFase: pareja.victoriasFase,
      empatesFase: pareja.empatesFase,
      victorias: pareja.victorias,
      partidosFase: pareja.partidosFase,
      derrotasFase: pareja.derrotasFase,
      derrotas: pareja.derrotas
    };
  };

  const compararParejasMundial = (a, b) => {
    const rankA = obtenerRankingPareja(a);
    const rankB = obtenerRankingPareja(b);

    if (rankB.fase !== rankA.fase) return rankB.fase - rankA.fase;
    if (rankB.victoriasFase !== rankA.victoriasFase) return rankB.victoriasFase - rankA.victoriasFase;
    if (rankB.empatesFase !== rankA.empatesFase) return rankB.empatesFase - rankA.empatesFase;
    if (rankB.victorias !== rankA.victorias) return rankB.victorias - rankA.victorias;
    if (rankA.derrotasFase !== rankB.derrotasFase) return rankA.derrotasFase - rankB.derrotasFase;
    if (rankA.derrotas !== rankB.derrotas) return rankA.derrotas - rankB.derrotas;
    if (rankB.partidosFase !== rankA.partidosFase) return rankB.partidosFase - rankA.partidosFase;
    return a.nombre.localeCompare(b.nombre);
  };

  const obtenerParejasActivasMundial = () => {
    const parejasActivas = new Map();
    const parejaPorJugador = new Map();

    const liberarPareja = (pareja) => {
      parejasActivas.delete(pareja.id);
      if (parejaPorJugador.get(pareja.jugador1Id)?.id === pareja.id) {
        parejaPorJugador.delete(pareja.jugador1Id);
      }
      if (parejaPorJugador.get(pareja.jugador2Id)?.id === pareja.id) {
        parejaPorJugador.delete(pareja.jugador2Id);
      }
    };

    const activarPareja = (pareja) => {
      parejasActivas.set(pareja.id, pareja);
      parejaPorJugador.set(pareja.jugador1Id, pareja);
      parejaPorJugador.set(pareja.jugador2Id, pareja);
    };

    Array.from(parejasMundial.values()).filter(pareja => !pareja.congelada).sort(compararParejasMundial).forEach(pareja => {
      const parejaJugador1 = parejaPorJugador.get(pareja.jugador1Id);
      const parejaJugador2 = parejaPorJugador.get(pareja.jugador2Id);

      if (!parejaJugador1 && !parejaJugador2) {
        activarPareja(pareja);
        return;
      }

      // Una pareja nueva solo puede mejorar una pareja existente si el otro jugador esta libre.
      if (parejaJugador1 && parejaJugador2) return;

      const parejaActual = parejaJugador1 || parejaJugador2;
      const jugadorLibreId = parejaJugador1 ? pareja.jugador2Id : pareja.jugador1Id;
      if (parejaPorJugador.has(jugadorLibreId)) return;

      if (pareja.victorias > parejaActual.victorias) {
        liberarPareja(parejaActual);
        activarPareja(pareja);
      }
    });

    return Array.from(parejasActivas.values()).sort(compararParejasMundial);
  };

  const mostrarFixtureParejasMundialito = () => {
    const container = document.getElementById('mundialito-parejas-fixture');
    if (!container) return;

    const parejasActivas = obtenerParejasActivasMundial();
    const parejasCongeladas = Array.from(parejasMundial.values()).filter(pareja => pareja.congelada).sort(compararParejasMundial);

    if (parejasActivas.length === 0 && parejasCongeladas.length === 0) {
      container.innerHTML = '<div class="col-12"><div class="text-center py-4"><p class="text-light-emphasis">No hay parejas para mostrar</p></div></div>';
      return;
    }

    const parejasPorFase = {
      campeon: [],
      final: [],
      semis: [],
      '4tos': [],
      '8vos': [],
      grupos: []
    };

    parejasActivas.forEach(pareja => {
      parejasPorFase[pareja.fase]?.push(pareja);
    });

    Object.keys(parejasPorFase).forEach(fase => {
      parejasPorFase[fase].sort(compararParejasMundial);
    });

    const generarTooltipPareja = (pareja) => {
      const badge = obtenerBadgeFasePareja(pareja);
      let tooltip = `<div class="fw-bold mb-2">Historial Pareja - ${pareja.nombre}</div>`;
      tooltip += `<div class="mb-2">`;
      tooltip += `<strong>Estado actual:</strong><br>`;
      tooltip += `Fase: ${badge.text}<br>`;
      tooltip += `Estado: ${pareja.congelada ? 'congelada' : 'activa, sin jugadores repetidos'}<br>`;
      if (pareja.motivoCongelada) tooltip += `Motivo: ${pareja.motivoCongelada}<br>`;
      tooltip += `Record total: ${pareja.victorias}V-${pareja.empates}E-${pareja.derrotas}D<br>`;
      tooltip += `Run actual: ${pareja.victoriasRun}V-${pareja.empatesRun}E-${pareja.derrotasRun}D<br>`;
      tooltip += `Instancia actual: ${pareja.victoriasFase}V-${pareja.empatesFase}E-${pareja.derrotasFase}D (${pareja.partidosFase}/3)`;
      tooltip += `</div>`;

      if (pareja.historialFases.length > 0) {
        tooltip += `<div class="mb-2"><strong>Historial de fases:</strong><br>`;
        pareja.historialFases.forEach((fase, index) => {
          const fecha = fase.fecha ? new Date(fase.fecha + 'T12:00:00').toLocaleDateString('es-ES') : 'Sin fecha';
          if (fase.completada) {
            tooltip += `${index + 1}. Paso de ${fase.fase} (${fecha})`;
          } else {
            tooltip += `${index + 1}. Eliminada en ${fase.fase.replace('eliminado_', '')} (${fecha})`;
          }
          if (fase.record) tooltip += `<br>   Record: ${fase.record}`;
          if (fase.recordRun) tooltip += `<br>   Run: ${fase.recordRun}`;
          if (fase.metodo === 'moneda') tooltip += `<br>   Por moneda`;
          tooltip += `<br>`;
        });
        tooltip += `</div>`;
      }

      if (pareja.ultimoPartido) {
        const fechaUltimo = new Date(pareja.ultimoPartido.fecha + 'T12:00:00').toLocaleDateString('es-ES');
        tooltip += `<div class="small text-light-emphasis"><strong>Ultimo partido:</strong> ${pareja.ultimoPartido.resultado} (${fechaUltimo})</div>`;
      }

      return tooltip;
    };

    const fases = [
      { key: 'campeon', title: 'Campeonas', color: 'success' },
      { key: 'final', title: 'Finalistas', color: 'danger' },
      { key: 'semis', title: 'Semifinalistas', color: 'warning' },
      { key: '4tos', title: 'Cuartos de Final', color: 'info' },
      { key: '8vos', title: 'Octavos de Final', color: 'primary' },
      { key: 'grupos', title: 'Fase de Grupos', color: 'secondary' }
    ];

    let html = '';
    fases.forEach(fase => {
      const parejas = parejasPorFase[fase.key];
      if (!parejas || parejas.length === 0) return;

      html += `
        <div class="col-12 mb-4">
          <h6 class="text-${fase.color} mb-3">${fase.title} (${parejas.length})</h6>
          <div class="row g-2">
            ${parejas.map(pareja => {
              const badge = obtenerBadgeFasePareja(pareja);
              const tooltipContent = generarTooltipPareja(pareja);
              return `
                <div class="col-md-6 col-lg-4 col-xl-3">
                  <div class="card bg-${fase.color} bg-opacity-10 border-${fase.color} border-opacity-25 mundialito-card"
                       data-bs-toggle="tooltip"
                       data-bs-placement="top"
                       data-bs-html="true"
                       data-bs-title="${tooltipContent.replace(/"/g, '&quot;')}">
                    <div class="card-body p-3">
                      <div class="fw-bold text-white mb-2">${pareja.nombre}</div>
                      <span class="badge ${badge.badge} mb-1">${badge.text}</span>
                      <div class="small text-light-emphasis">${badge.descripcion}</div>
                      <div class="small text-light-emphasis mt-1">Run: ${pareja.victoriasRun}V - ${pareja.empatesRun}E - ${pareja.derrotasRun}D</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    });

    if (parejasCongeladas.length > 0) {
      html += `
        <div class="col-12 mb-4">
          <h6 class="text-muted mb-3">Parejas congeladas (${parejasCongeladas.length})</h6>
          <div class="row g-2">
            ${parejasCongeladas.map(pareja => {
              const badge = obtenerBadgeFasePareja(pareja);
              const tooltipContent = generarTooltipPareja(pareja);
              return `
                <div class="col-md-6 col-lg-4 col-xl-3">
                  <div class="card bg-secondary bg-opacity-10 border-secondary border-opacity-25 mundialito-card"
                       data-bs-toggle="tooltip"
                       data-bs-placement="top"
                       data-bs-html="true"
                       data-bs-title="${tooltipContent.replace(/"/g, '&quot;')}">
                    <div class="card-body p-3">
                      <div class="fw-bold text-white mb-2">${pareja.nombre}</div>
                      <span class="badge bg-secondary mb-1">Congelada en ${badge.text}</span>
                      <div class="small text-light-emphasis">${pareja.motivoCongelada || 'No ocupa jugadores activos'}</div>
                      <div class="small text-light-emphasis mt-1">Run: ${pareja.victoriasRun}V - ${pareja.empatesRun}E - ${pareja.derrotasRun}D</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html || '<div class="col-12"><div class="text-center py-4"><p class="text-light-emphasis">No hay parejas para mostrar</p></div></div>';

    setTimeout(() => {
      const tooltipTriggerList = container.querySelectorAll('[data-bs-toggle="tooltip"]');
      tooltipTriggerList.forEach(tooltipTriggerEl => {
        new bootstrap.Tooltip(tooltipTriggerEl, {
          html: true,
          trigger: 'hover focus',
          customClass: 'mundialito-tooltip',
          template: '<div class="tooltip mundialito-tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner text-start" style="white-space: pre-line; max-width: 400px;"></div></div>'
        });
      });
    }, 100);
  };

  // Renderizar estadísticas: Histograma de llegada por fase máxima alcanzada
  const renderizarEstadisticasMundialito = () => {
    const canvas = document.getElementById('mundialito-histograma');
    if (!canvas) return;

    const fasesOrden = ['grupos', '8vos', '4tos', 'semis', 'final', 'campeon'];
    const labels = ['Grupos', '8vos', '4tos', 'Semis', 'Final', 'Campeón'];
    const counts = [0, 0, 0, 0, 0, 0];

    jugadoresMundial.forEach((jugador) => {
      // Contabilizar cada ocurrencia histórica de fases (completadas o eliminaciones)
      if (Array.isArray(jugador.historialFases)) {
        jugador.historialFases.forEach((f) => {
          const faseRaw = (f && f.fase) ? f.fase : '';
          let faseKey = faseRaw;
          if (faseRaw.startsWith('eliminado_')) {
            faseKey = faseRaw.replace('eliminado_', '');
          }
          const idx = fasesOrden.indexOf(faseKey);
          if (idx >= 0) counts[idx]++;
        });
      }

      // Contabilizar también la fase actual del jugador
      const idxActual = fasesOrden.indexOf(jugador.fase);
      if (idxActual >= 0) counts[idxActual]++;
    });

    // Destruir instancia previa si existe
    if (chartInstances && chartInstances['mundialito-histograma']) {
      try { chartInstances['mundialito-histograma'].destroy(); } catch (e) {}
    }

    const ctx = canvas.getContext('2d');
    chartInstances['mundialito-histograma'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Jugadores',
          data: counts,
          backgroundColor: [
            'rgba(108,117,125,0.6)', // Grupos - secondary
            'rgba(13,110,253,0.6)',  // 8vos - primary
            'rgba(13,202,240,0.6)',  // 4tos - info
            'rgba(255,193,7,0.6)',   // Semis - warning
            'rgba(220,53,69,0.6)',   // Final - danger
            'rgba(25,135,84,0.7)'    // Campeón - success
          ],
          borderColor: [
            'rgba(108,117,125,1)',
            'rgba(13,110,253,1)',
            'rgba(13,202,240,1)',
            'rgba(255,193,7,1)',
            'rgba(220,53,69,1)',
            'rgba(25,135,84,1)'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { precision: 0 }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} jugadores`
            }
          }
        }
      }
    });
  };

  // Actualizar estadísticas globales
  const actualizarEstadisticasMundialito = () => {
    const totalPlayers = document.getElementById('total-players');
    const playersGroups = document.getElementById('players-groups');
    const champions = document.getElementById('champions');

    if (totalPlayers) totalPlayers.textContent = jugadoresMundial.size;
    if (playersGroups) playersGroups.textContent = Array.from(jugadoresMundial.values()).filter(j => j.fase === 'grupos').length;
    if (champions) champions.textContent = Array.from(jugadoresMundial.values()).filter(j => j.campeon).length;
  };

  const actualizarEstadisticasParejasMundialito = () => {
    const totalParejas = document.getElementById('total-parejas');
    const parejasGroups = document.getElementById('parejas-groups');
    const parejasChampions = document.getElementById('parejas-champions');
    const parejasActivas = obtenerParejasActivasMundial();

    if (totalParejas) totalParejas.textContent = parejasActivas.length;
    if (parejasGroups) parejasGroups.textContent = parejasActivas.filter(p => p.fase === 'grupos').length;
    if (parejasChampions) parejasChampions.textContent = parejasActivas.filter(p => p.campeon).length;
  };

  // Cargar temporadas
  const cargarTemporadasMundialito = async () => {
    try {
      const { data, error } = await supabase.from('temporadas').select('*').order('nombre');
      if (error) throw error;

      const select = document.getElementById('mundialito-temporada');
      if (select) {
        select.innerHTML = '<option value="all">Todas las temporadas</option>';
        data?.forEach(temporada => {
          const option = document.createElement('option');
          option.value = temporada.id;
          option.textContent = temporada.nombre;
          select.appendChild(option);
        });
      }
    } catch (error) {
      console.error('❌ Error cargando temporadas:', error);
    }
  };

  // Reset mundialito
  const resetMundialito = () => {
    jugadoresMundial.clear();
    parejasMundial.clear();
    partidosJugadorParejas.clear();
    mundialPartidos = [];

    const container = document.getElementById('mundialito-fixture');
    if (container) {
      container.innerHTML = `<div class="text-center py-4"><p class="text-light-emphasis">Presiona "Procesar Mundial" para generar el fixture</p></div>`;
    }

    const parejasContainer = document.getElementById('mundialito-parejas-fixture');
    if (parejasContainer) {
      parejasContainer.innerHTML = `<div class="text-center py-4"><p class="text-light-emphasis">Presiona "Procesar Mundial" para generar las parejas</p></div>`;
    }

    ['total-players', 'players-groups', 'champions', 'total-parejas', 'parejas-groups', 'parejas-champions'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '-';
    });
    toggleSeccionCampeones('ultimo-campeon-section', false);
    toggleSeccionCampeones('campeones-section', false);
  };

  // Event listeners
  const btnReset = document.getElementById('btn-reset-mundialito');
  if (btnReset) btnReset.addEventListener('click', resetMundialito);

  const mundialTab = document.getElementById('mundialito-tab');
  if (mundialTab) {
    mundialTab.addEventListener('shown.bs.tab', () => {
      cargarTemporadasMundialito();
      // Procesar automáticamente después de cargar temporadas
      setTimeout(() => {
        procesarMundialito();
      }, 100);
    });
  }

  const temporadaSelect = document.getElementById('mundialito-temporada');
  if (temporadaSelect) {
    temporadaSelect.addEventListener('change', () => {
      // Procesar automáticamente al cambiar temporada
      procesarMundialito();
    });
  }

  // Subtabs: Fixture / Parejas / Estadísticas
  const subFixtureBtn = document.getElementById('mundialito-sub-tab-fixture');
  const subParejasBtn = document.getElementById('mundialito-sub-tab-parejas');
  const subStatsBtn = document.getElementById('mundialito-sub-tab-estadisticas');
  const subFixture = document.getElementById('mundialito-sub-fixture');
  const subParejas = document.getElementById('mundialito-sub-parejas');
  const subStats = document.getElementById('mundialito-sub-estadisticas');
  const activarSubtab = (tab) => {
    if (!subFixtureBtn || !subStatsBtn || !subFixture || !subStats) return;
    [subFixtureBtn, subParejasBtn, subStatsBtn].filter(Boolean).forEach(btn => btn.classList.remove('active'));
    [subFixture, subParejas, subStats].filter(Boolean).forEach(panel => panel.classList.add('d-none'));

    if (tab === 'estadisticas') {
      subStatsBtn.classList.add('active');
      subStats.classList.remove('d-none');
      renderizarEstadisticasMundialito();
    } else if (tab === 'parejas' && subParejasBtn && subParejas) {
      subParejasBtn.classList.add('active');
      subParejas.classList.remove('d-none');
      mostrarFixtureParejasMundialito();
      actualizarEstadisticasParejasMundialito();
    } else {
      subFixtureBtn.classList.add('active');
      subFixture.classList.remove('d-none');
    }
  };
  if (subFixtureBtn) subFixtureBtn.addEventListener('click', () => activarSubtab('fixture'));
  if (subParejasBtn) subParejasBtn.addEventListener('click', () => activarSubtab('parejas'));
  if (subStatsBtn) subStatsBtn.addEventListener('click', () => activarSubtab('estadisticas'));

  // ===============================
  // FIN FUNCIONALIDAD MUNDIALITO T5
  // ===============================

  // Función para forzar moneda desde el historial de partidos
  window.forzarMonedaDesdeHistorial = async (partidoId, jugadorId, nombreJugador, temporadaId = null) => {
    try {
      const temporadaObjetivo = temporadaId || null;
      const partidosReferencia = await obtenerPartidosReferenciaMundialito(partidoId, temporadaObjetivo);
      const contexto = resolverContextoMonedaMundialito(partidosReferencia, partidoId, jugadorId);

      if (!contexto) {
        alert(`No pude ubicar el contexto del Mundialito para ${nombreJugador} en el partido #${partidoId}.`);
        return;
      }

      if (!FASES_MUNDIALITO.includes(contexto.fase)) {
        alert(`La fase detectada para ${nombreJugador} no es válida: ${contexto.fase}.`);
        return;
      }

      if (!contexto.usaMoneda) {
        alert(`En este partido no hay moneda para ${nombreJugador}: ${contexto.motivo}.`);
        return;
      }

      const guardadoOk = await window.setMonedaOverrideExact(
        contexto.partidoId,
        contexto.jugadorId,
        contexto.fase,
        true
      );

      if (!guardadoOk) {
        alert(`No se pudo guardar el override de moneda para ${nombreJugador}. Revisa la consola.`);
        return;
      }

      await cargarTemporadasMundialito();
      const temporadaSelect = document.getElementById('mundialito-temporada');
      if (temporadaSelect && temporadaObjetivo) {
        temporadaSelect.value = String(temporadaObjetivo);
      }

      if (typeof window.procesarMundialito === 'function') {
        await window.procesarMundialito();
      } else {
        alert('Listo. Ve a la pestaña Mundialito y presiona "Reset Mundial" para reprocesar.');
        return;
      }

      const destinoTexto = contexto.destino ? ` a ${contexto.destino}` : '';
      alert(
        `Se forzó el pase de ${nombreJugador}${destinoTexto} por moneda en ${contexto.fase} del partido #${contexto.partidoId}.`
      );
    } catch (error) {
      console.error('Error forzando moneda desde historial:', error);
      alert(`No se pudo forzar la moneda para ${nombreJugador}.`);
    }
  };

  // Función de test para verificar overrides de moneda
  window.testMonedaOverrides = () => {
    console.log('🧪 Iniciando test de overrides de moneda...');

    // Test 1: Override exacto
    const partidoId = 1, jugadorId = 1, fase = '8vos';
    window.setMonedaOverrideExact(partidoId, jugadorId, fase, true);
    const resultado1 = tirarMonedaDeterministica(partidoId, jugadorId, fase);
    console.assert(resultado1 === true, 'Override exacto debería devolver true');

    // Test 2: Override por jugador-fase
    const jugadorId2 = 2, fase2 = '4tos';
    window.setMonedaOverrideJugadorFase(jugadorId2, fase2, false);
    const resultado2 = tirarMonedaDeterministica(999, jugadorId2, fase2); // partidoId diferente
    console.assert(resultado2 === false, 'Override por jugador-fase debería devolver false');

    // Test 3: Sin override (debería usar lógica determinística)
    const resultado3 = tirarMonedaDeterministica(999, 999, 'semis');
    console.log('Resultado sin override (determinístico):', resultado3);

    // Test 4: Limpiar overrides
    window.clearMonedaOverrides();
    const resultado4 = tirarMonedaDeterministica(partidoId, jugadorId, fase);
    console.log('Resultado después de limpiar overrides:', resultado4);

    console.log('✅ Test de overrides completado. Revisa la consola para ver los resultados.');

    // Limpiar después del test
    window.clearMonedaOverrides();
  };

  console.log('✅ Aplicación inicializada correctamente');
};

// --- Inicializar cuando el DOM esté listo ---
document.addEventListener('DOMContentLoaded', initApp);
