const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'review_events_schema.sql'), 'utf8');
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260801000000_add_gol_puskas.sql'),
  'utf8'
);

assert(html.includes('id="review-gol-puskas"'), 'La review debe permitir marcar un Gol Puskás');
assert(app.includes('data-review-toggle-puskas'), 'Cada gol de review debe permitir votar Puskás');
assert(app.includes('es_puskas: esGolPuskas(evento)'), 'El voto Puskás debe persistirse con el gol');
assert(app.includes('class="form-check-input gol-puskas"'), 'El historial debe permitir editar el voto Puskás de cada gol');
assert(app.includes('payload.es_puskas = update.es_puskas'), 'La edición del historial debe guardar el voto Puskás');
assert(app.includes("esErrorColumnaFaltante(error, 'es_puskas')"), 'La edición debe tolerar bases sin la migración de Puskás');
assert(app.includes("renderizarDistintivoPuskas('mt-1 mb-2')"), 'El perfil debe mostrar el distintivo Puskás');
assert(app.includes('mostrarSinVideoFn: esGolPuskas'), 'El perfil debe mostrar goles Puskás aunque no tengan video');
assert(schema.includes('add column if not exists es_puskas boolean not null default false'), 'El schema de review debe agregar goles.es_puskas');
assert(migration.includes('where es_puskas = true'), 'La migración debe indexar los goles Puskás');

console.log('Puskas feature tests passed');
