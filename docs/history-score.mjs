export const HISTORIAL_SCORE_MAX = 10;
export const HISTORIAL_SCORE_PERCENTIL_TECHO = 0.95;

const HISTORIAL_SCORE_EPSILON = 0.001;

export function obtenerTechoSkillHistorico(skills = [], percentil = HISTORIAL_SCORE_PERCENTIL_TECHO) {
  const skillsPositivos = (Array.isArray(skills) ? skills : [])
    .map(Number)
    .filter(skill => Number.isFinite(skill) && skill > HISTORIAL_SCORE_EPSILON)
    .sort((a, b) => a - b);

  if (!skillsPositivos.length) return 0;

  const percentilNumero = Number(percentil);
  const percentilSeguro = Number.isFinite(percentilNumero)
    ? Math.max(0, Math.min(1, percentilNumero))
    : HISTORIAL_SCORE_PERCENTIL_TECHO;
  const indice = Math.max(0, Math.ceil(percentilSeguro * skillsPositivos.length) - 1);

  return skillsPositivos[indice];
}

export function normalizarPuntajeHistorial(skill, techoSkillHistorico) {
  const skillNumero = Number(skill);
  const techoNumero = Number(techoSkillHistorico);
  if (!Number.isFinite(skillNumero)) return null;
  if (!Number.isFinite(techoNumero) || techoNumero <= HISTORIAL_SCORE_EPSILON) return 0;

  return Math.max(0, Math.min(HISTORIAL_SCORE_MAX, (skillNumero / techoNumero) * HISTORIAL_SCORE_MAX));
}

export function calcularAnchoPuntajeHistorial(puntaje) {
  const numero = Number(puntaje);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, Math.min(100, (numero / HISTORIAL_SCORE_MAX) * 100));
}
