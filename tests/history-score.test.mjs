import assert from 'node:assert/strict';
import {
  calcularAnchoPuntajeHistorial,
  normalizarPuntajeHistorial,
  obtenerMejorSkillHistorico
} from '../docs/history-score.mjs';

const mejorHistorico = obtenerMejorSkillHistorico([-5, 0, 12, 30, Number.NaN]);

assert.equal(mejorHistorico, 30, 'debe usar la mejor actuacion historica como referencia');
assert.equal(normalizarPuntajeHistorial(0, mejorHistorico), 0, 'no hacer nada debe valer 0');
assert.equal(normalizarPuntajeHistorial(mejorHistorico, mejorHistorico), 10, 'la mejor actuacion historica debe valer 10');
assert.equal(normalizarPuntajeHistorial(15, mejorHistorico), 5, 'las actuaciones deben escalar linealmente desde 0');
assert.equal(normalizarPuntajeHistorial(-3, mejorHistorico), -1, 'una actuacion negativa debe quedar debajo de 0');
assert.equal(normalizarPuntajeHistorial(40, mejorHistorico), 10, 'el puntaje superior debe quedar limitado a 10');
assert.equal(calcularAnchoPuntajeHistorial(-1), 0, 'una actuacion negativa no debe dibujar una barra positiva');
assert.equal(calcularAnchoPuntajeHistorial(5), 50, 'la barra debe representar el nuevo puntaje normalizado');

console.log('history score tests passed');
