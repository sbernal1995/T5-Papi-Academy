const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'docs', 'app.js'), 'utf8');
const helperStart = app.indexOf('function normalizarMinutoPartido');
const helperEnd = app.indexOf('function crearChipEventoHistorial', helperStart);

assert(helperStart >= 0 && helperEnd > helperStart, 'Deben existir los helpers de minuto del partido');

const helpers = Function(`
  ${app.slice(helperStart, helperEnd)}
  return { normalizarMinutoPartido, formatearMinutoPartidoNormalizado };
`)();

assert.equal(helpers.normalizarMinutoPartido(65), 65, 'el minuto 65 debe conservarse');
assert.equal(helpers.normalizarMinutoPartido(65.5), 65.5, 'los segundos posteriores al minuto 65 deben conservarse');
assert.equal(helpers.normalizarMinutoPartido(125), 125, 'los minutos largos no deben reiniciarse cada hora');
assert.equal(helpers.formatearMinutoPartidoNormalizado(65), "65'", 'el minuto 65 debe mostrarse como 65');
assert.equal(helpers.formatearMinutoPartidoNormalizado(65.5), '65:30', 'el minuto 65:30 debe mostrarse completo');

console.log('Review minute tests passed');
