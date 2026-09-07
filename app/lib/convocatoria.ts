/**
 * LA CONVOCATORIA — la fecha del examen y la cuenta atrás.
 *
 * Módulo puro (regla 21): la aritmética de días es lo único que se testea, y es
 * fácil equivocarse con los husos y el redondeo.
 */

export type Convocatoria = {
  escala: string | null;
  /** `YYYY-MM-DD`, o `null` si no hay convocatoria fijada. */
  fechaExamen: string | null;
  nota: string | null;
};

export const CONVOCATORIA_VACIA: Convocatoria = { escala: null, fechaExamen: null, nota: null };

/**
 * Días que faltan para `fechaExamen`, contando por días de calendario (no por
 * horas): hoy es 0, mañana es 1. Negativo si ya pasó. `null` sin fecha.
 */
export function diasHasta(fechaExamenISO: string | null | undefined, hoy: Date = new Date()): number | null {
  if (!fechaExamenISO) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaExamenISO);
  if (!m) return null;
  const examen = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((examen - hoyUTC) / 86_400_000);
}

/** `2027-05-18` → «18 de mayo de 2027». */
export function fechaLarga(fechaISO: string | null | undefined): string | null {
  if (!fechaISO) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaISO);
  if (!m) return null;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`;
}

/** El texto de la cuenta atrás. `null` si no hay fecha. */
export function textoCuentaAtras(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 0) return 'La convocatoria ya pasó';
  if (dias === 0) return 'El examen es HOY';
  if (dias === 1) return 'Falta 1 día';
  if (dias < 7) return `Faltan ${dias} días`;
  const semanas = Math.floor(dias / 7);
  if (dias < 60) return `Faltan ${dias} días (${semanas} ${semanas === 1 ? 'semana' : 'semanas'})`;
  const meses = Math.round(dias / 30);
  return `Faltan ${dias} días · unos ${meses} meses`;
}
