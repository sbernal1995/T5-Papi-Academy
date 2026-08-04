import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolverPremiosPortada } from '../docs/cover-awards.mjs';

const equipo1 = [
  { id: 'mvp', nombre: 'MVP real', mvp: true },
  { id: 'goleador', nombre: 'Goleador' }
];
const equipo2 = [
  { jugador_id: 'ace', jugadores: { id: 'ace', nombre: 'ACE real' }, ace: true },
  { id: 'arquero', nombre: 'Arquero' }
];

const premiosGuardados = resolverPremiosPortada({ equipo1, equipo2 });
assert.equal(premiosGuardados.mvp?.jugador.id, 'mvp', 'debe usar el MVP guardado en el partido');
assert.equal(premiosGuardados.mvp?.equipo, 1, 'debe conservar el equipo del MVP');
assert.equal(premiosGuardados.ace?.jugador.jugador_id, 'ace', 'debe usar el ACE guardado en el partido');
assert.equal(premiosGuardados.ace?.equipo, 2, 'debe conservar el equipo del ACE');

const premiosReview = resolverPremiosPortada({
  equipo1,
  equipo2,
  mvpId: 'goleador',
  aceId: 'arquero'
});
assert.equal(premiosReview.mvp?.jugador.id, 'goleador', 'la seleccion de REVIEW debe tener prioridad sobre los flags previos');
assert.equal(premiosReview.ace?.jugador.id, 'arquero', 'la seleccion de ACE de REVIEW debe tener prioridad');

const sinPremios = resolverPremiosPortada({ equipo1: [{ id: '1' }], equipo2: [{ id: '2' }] });
assert.equal(sinPremios.mvp, null, 'sin MVP debe permitir usar el respaldo por clips');
assert.equal(sinPremios.ace, null, 'sin ACE debe permitir usar el respaldo por clips');

const app = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
assert.match(app, /resolverPremiosPortada\(\{/, 'la portada debe resolver los premios antes de elegir los jugadores');
assert.match(app, /mvpId: obtenerValorReviewInput\('review-mvp'\)/, 'REVIEW debe enviar el MVP seleccionado a la portada');
assert.match(app, /aceId: obtenerValorReviewInput\('review-ace'\)/, 'REVIEW debe enviar el ACE seleccionado a la portada');
assert.match(app, /const mvp = jugadores\.find\(jp => jp\.mvp\)/, 'la portada del historial debe leer el MVP guardado');
assert.match(app, /const ace = jugadores\.find\(jp => jp\.ace\)/, 'la portada del historial debe leer el ACE guardado');

console.log('cover awards tests passed');
