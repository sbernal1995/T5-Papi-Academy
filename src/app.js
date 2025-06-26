// src/app.js

// Cargar variables de entorno desde .env (solo para desarrollo local, en producción usar variables de entorno del build)
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Tabla de estadísticas ---
async function cargarEstadisticas() {
  const { data, error } = await supabase.from('jugadores').select('*');
  if (error) {
    alert('Error al cargar estadísticas');
    return;
  }
  const tbody = document.getElementById('stats-table-body');
  tbody.innerHTML = '';
  data.forEach((jugador, idx) => {
    const tr = document.createElement('tr');
    if (idx % 2 === 1) tr.classList.add('bg-gray-50');
    tr.innerHTML = `
      <td>${jugador.nombre}</td>
      <td>${jugador.total_puntos ?? ''}</td>
      <td>${jugador.pj ?? ''}</td>
      <td>${jugador.pg ?? ''}</td>
      <td>${jugador.pe ?? ''}</td>
      <td>${jugador.pp ?? ''}</td>
      <td>${jugador.goles ?? ''}</td>
      <td>${jugador.asistencias ?? ''}</td>
      <td>${jugador.cagadas_en_gol ?? ''}</td>
      <td>${jugador.mvp ?? ''}</td>
      <td>${jugador.ace ?? ''}</td>
      <td>${jugador.atajadas ?? ''}</td>
      <td>${jugador.winrate ?? ''}%</td>
      <td>${jugador.capitan_defeat ?? ''}</td>
      <td>${jugador.bita_defeat ?? ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Formulario de partido ---
async function cargarJugadores() {
  const { data, error } = await supabase.from('jugadores').select('id, nombre');
  const select = document.getElementById('jugadores');
  select.innerHTML = '';
  if (error) return;
  data.forEach(j => {
    const option = document.createElement('option');
    option.value = j.id;
    option.textContent = j.nombre;
    select.appendChild(option);
  });
}

function actualizarTags() {
  const select = document.getElementById('jugadores');
  const tagsDiv = document.getElementById('jugadores-tags');
  tagsDiv.innerHTML = '';
  Array.from(select.selectedOptions).forEach(opt => {
    const tag = document.createElement('span');
    tag.className = 'badge badge-primary';
    tag.textContent = opt.textContent;
    tagsDiv.appendChild(tag);
  });
}

document.getElementById('jugadores').addEventListener('change', actualizarTags);

document.getElementById('match-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const fecha = form.fecha.value;
  const cancha = form.cancha.value.trim();
  const jugadores = Array.from(form.jugadores.selectedOptions).map(o => o.value);
  const resultado = form.resultado.value.trim();
  const equipo_ganador = form.equipo_ganador.value.trim();

  if (!fecha || !cancha || jugadores.length === 0 || !resultado || !equipo_ganador) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const { error } = await supabase.from('partidos').insert([
    { fecha, cancha, jugadores, resultado, equipo_ganador }
  ]);
  if (error) {
    alert('Error al cargar el partido');
  } else {
    alert('Partido cargado!');
    form.reset();
    actualizarTags();
    cargarEstadisticas();
  }
});

// Inicialización
cargarEstadisticas();
cargarJugadores(); 