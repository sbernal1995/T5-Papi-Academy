export const HISTORIAL_SCORE_MAX = 10;

const HISTORIAL_SCORE_EPSILON = 0.001;

export function obtenerMejorSkillHistorico(skills = []) {
  return (Array.isArray(skills) ? skills : [])
    .map(Number)
    .filter(Number.isFinite)
    .reduce((mejor, skill) => Math.max(mejor, skill), 0);
}

export function normalizarPuntajeHistorial(skill, mejorSkillHistorico) {
  const skillNumero = Number(skill);
  const mejorNumero = Number(mejorSkillHistorico);
  if (!Number.isFinite(skillNumero)) return null;
  if (!Number.isFinite(mejorNumero) || mejorNumero <= HISTORIAL_SCORE_EPSILON) return 0;

  return Math.min(HISTORIAL_SCORE_MAX, (skillNumero / mejorNumero) * HISTORIAL_SCORE_MAX);
}

export function calcularAnchoPuntajeHistorial(puntaje) {
  const numero = Number(puntaje);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, Math.min(100, (numero / HISTORIAL_SCORE_MAX) * 100));
}
