const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'review_events_schema.sql'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260807000000_compilado_eventos.sql'),
  'utf8'
);

for (const sql of [schema, migration]) {
  assert(sql.includes('create table if not exists public.compilado_eventos'), 'debe crear la tabla de correlaciones');
  assert(sql.includes('review_evento_id uuid not null'), 'cada correlacion debe apuntar al evento de review');
  assert(sql.includes('minuto_partido numeric(8, 4)'), 'debe persistir el minuto del partido');
  assert(sql.includes('review_segundos integer not null'), 'debe persistir el segundo de la review');
  assert(sql.includes('compilado_segundos integer not null'), 'debe persistir el segundo exacto del compilado');
  assert(sql.includes('unique (review_evento_id)'), 'un evento debe tener una unica correlacion activa');
  assert(sql.includes('alter table public.compilado_eventos enable row level security'), 'la tabla debe usar RLS');
}

assert(app.includes("const COMPILADO_EVENTOS_TABLA = 'compilado_eventos'"));
assert(app.includes('crearFilasCorrelacionesCompilado(partidoId, reviewEventos, clips)'));
assert(app.includes(".upsert(filas, { onConflict: 'review_evento_id' })"));
assert(app.includes('reviewSandbox.compiladoGenerado = {'), 'la review debe retener el mapa producido al generar el archivo');
assert(app.includes('compiladoGenerado.clips'), 'al guardar el partido debe persistirse el mapa generado');
assert(app.includes('await anexarCorrelacionesCompilado(partidos)'), 'el historial debe cargar las correlaciones guardadas');
assert(html.includes('id="review-sync-existing-compilado"'), 'la review debe permitir recuperar un compilado anterior');
assert(app.includes('sincronizarCompiladoExistenteReviewSandbox'), 'debe existir el flujo de sincronizacion historica');
assert(app.includes(".select('id', { count: 'exact', head: true })"), 'la sincronizacion debe evitar eventos duplicados');
assert(app.includes('partido.compilado_youtube_link'), 'la sincronizacion debe exigir el compilado guardado');
assert(app.includes("codigo === '42P01' || codigo === 'PGRST205'"), 'los errores de constraint no deben confundirse con una tabla faltante');
assert(app.includes("tiposOmitidos: ['buena_jugada']"), 'la recuperacion debe conservar la linea de tiempo con esquemas historicos');

const prepararInicio = app.indexOf('function prepararLinksVideoHistorialPartido(partido)');
const prepararFin = app.indexOf('function renderizarClipsCompiladoHtml', prepararInicio);
const preparar = app.slice(prepararInicio, prepararFin);
assert(preparar.includes('correlacionesGuardadas.length > 0'));
assert(
  preparar.indexOf('correlacionesGuardadas.length > 0') < preparar.indexOf('const clips = construirClipsCompiladoDesdeEventos'),
  'el historial debe priorizar la tabla y reconstruir tiempos solo para partidos anteriores'
);
assert(preparar.includes("tipo: 'gol'"));
assert(preparar.includes("gol.video_origen = 'compilado'"));

console.log('Compilado correlation tests passed');
