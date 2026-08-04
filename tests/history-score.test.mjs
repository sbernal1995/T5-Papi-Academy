import assert from 'node:assert/strict';
import {
  calcularAnchoPuntajeHistorial,
  HISTORIAL_SCORE_PERCENTIL_TECHO,
  normalizarPuntajeHistorial,
  obtenerTechoSkillHistorico
} from '../docs/history-score.mjs';

const actuaciones = Array.from({ length: 19 }, (_, indice) => indice + 1).concat(100);
const techoHistorico = obtenerTechoSkillHistorico(actuaciones);

assert.equal(HISTORIAL_SCORE_PERCENTIL_TECHO, 0.95, 'el techo debe usar el percentil 95');
assert.equal(techoHistorico, 19, 'un valor extremo no debe definir por si solo toda la escala');
assert.equal(obtenerTechoSkillHistorico([-5, 0, Number.NaN]), 0, 'sin actuaciones positivas el techo debe ser 0');
assert.equal(normalizarPuntajeHistorial(0, techoHistorico), 0, 'no hacer nada debe valer 0');
assert.equal(normalizarPuntajeHistorial(techoHistorico, techoHistorico), 10, 'alcanzar el techo historico debe valer 10');
assert.equal(normalizarPuntajeHistorial(techoHistorico / 2, techoHistorico), 5, 'las actuaciones deben escalar linealmente desde 0');
assert.equal(normalizarPuntajeHistorial(-3, techoHistorico), 0, 'una actuacion negativa debe quedar limitada a 0');
assert.equal(normalizarPuntajeHistorial(100, techoHistorico), 10, 'el puntaje superior debe quedar limitado a 10');
assert.equal(calcularAnchoPuntajeHistorial(-1), 0, 'una actuacion negativa no debe dibujar una barra positiva');
assert.equal(calcularAnchoPuntajeHistorial(5), 50, 'la barra debe representar el nuevo puntaje normalizado');

console.log('history score tests passed');
