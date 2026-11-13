/**
 * PSICOTÉCNICOS EN CLASE (regla 127): la lógica pura (regla 21).
 *
 * El mismo examen para todo un turno, con los tipos que elija la academia. El
 * examen no guarda preguntas, guarda la SEMILLA: con ella, los tipos y el total
 * se regenera idéntico (`generaSesion`), igual que una sesión de práctica.
 */
import {
  EJERCICIOS_PSICO, TIPOS_PSICO, TAMANOS_PSICO, MINUTOS_PSICO, esEjercicio, esTipoPsico, notaDeSesionGuardada,
  type NumeroEjercicio, type ResultadoPsico, type TipoPsico, TIPO_PSICO_LABEL,
} from './psico';

/** Cuántas preguntas se pueden poner en clase, como mucho (el tope de la tabla). */
export const MAX_TOTAL_CLASE = 100;
/** Cuántos minutos, como mucho (el tope de la tabla). */
export const MAX_MINUTOS_CLASE = 120;
/** Por defecto, medio minuto por pregunta, como en el examen. */
export const SEGUNDOS_POR_PREGUNTA = 33;

export type EntradaExamen = { titulo: unknown; ejercicio: unknown; tipos: unknown; total: unknown; minutos: unknown; hoy: string };
export type ExamenValido = { titulo: string; tipos: TipoPsico[]; total: number; minutos: number; ejercicio: NumeroEjercicio | null };

/** Una fecha que existe de verdad: el 31 de febrero no (V8 lo «arregla» a marzo, y aquí no se arregla nada). */
export const esFecha = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
};
const esUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
// eslint-disable-next-line no-control-regex
const limpia = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/** Los minutos que se dan a un examen de `total` preguntas si no se dice otra cosa. */
export function minutosPorDefecto(total: number): number {
  const tabla = MINUTOS_PSICO[total];
  return tabla ?? Math.max(1, Math.min(MAX_MINUTOS_CLASE, Math.round((total * SEGUNDOS_POR_PREGUNTA) / 60)));
}

/** Un nombre para el examen si no se le pone: «Psicotécnico · Problemas y cubos · 13 nov». */
export function tituloAutomatico(tipos: readonly TipoPsico[], total: number, fecha: string, ejercicio: NumeroEjercicio | null): string {
  const dia = new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (ejercicio) return `Psicotécnico · ${EJERCICIOS_PSICO[ejercicio].nombre} · ${dia}`;
  const nombres = tipos.length === TIPOS_PSICO.length ? 'todos los tipos' : tipos.length <= 2 ? tipos.map((t) => TIPO_PSICO_LABEL[t]).join(' y ') : `${tipos.length} tipos`;
  return `Psicotécnico · ${nombres} · ${total} preguntas · ${dia}`;
}

/**
 * EL EXAMEN que se prepara (regla 27): los tipos elegidos (el filtro), el total
 * y los minutos. Un ejercicio del examen lleva sus tipos, preguntas y minutos
 * fijos, aunque el navegador mande otros. En libre, al menos un tipo y el total
 * y los minutos dentro de los topes. Devuelve el error en castellano.
 */
export function validaExamenPsico(d: EntradaExamen): { ok: true; valor: ExamenValido } | { ok: false; error: string } {
  const ejercicio = esEjercicio(d.ejercicio) ? d.ejercicio : null;
  const tiposPedidos = Array.isArray(d.tipos) ? d.tipos.filter(esTipoPsico) : [];
  const tipos = ejercicio ? [...EJERCICIOS_PSICO[ejercicio].tipos] : TIPOS_PSICO.filter((t) => tiposPedidos.includes(t));
  if (tipos.length === 0) return { ok: false, error: 'Elige al menos un tipo de pregunta.' };
  const totalPedido = Number(d.total);
  const total = ejercicio ? EJERCICIOS_PSICO[ejercicio].total : Number.isInteger(totalPedido) ? totalPedido : NaN;
  if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL_CLASE) return { ok: false, error: `El número de preguntas va de 1 a ${MAX_TOTAL_CLASE}.` };
  const minPedidos = d.minutos === undefined || d.minutos === null || d.minutos === '' ? null : Number(d.minutos);
  const minutos = ejercicio ? EJERCICIOS_PSICO[ejercicio].minutos : minPedidos === null ? minutosPorDefecto(total) : minPedidos;
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > MAX_MINUTOS_CLASE) return { ok: false, error: `Los minutos van de 1 a ${MAX_MINUTOS_CLASE}.` };
  const titulo = limpia(d.titulo, 80) || tituloAutomatico(tipos, total, d.hoy, ejercicio);
  return { ok: true, valor: { titulo, tipos, total, minutos, ejercicio } };
}

export type EntradaAplicacion = { etiqueta: unknown; fecha: unknown; cierre: unknown; classIds: unknown };
export type AplicacionValida = { etiqueta: string | null; fecha: string; cierre: string | null; classIds: string[] };

/** PONERLO A UN TURNO: el día, el plazo y los grupos (vacío = toda la academia). */
export function validaAplicacion(d: EntradaAplicacion): { ok: true; valor: AplicacionValida } | { ok: false; error: string } {
  if (!esFecha(d.fecha)) return { ok: false, error: 'Elige el día del examen.' };
  const cierre = d.cierre === undefined || d.cierre === null || d.cierre === '' ? null : d.cierre;
  if (cierre !== null && (!esFecha(cierre) || cierre < d.fecha)) return { ok: false, error: 'El último día para entregarlo no puede ser anterior al del examen.' };
  const classIds = Array.isArray(d.classIds) ? [...new Set(d.classIds.filter(esUuid))].slice(0, 100) : [];
  return { ok: true, valor: { etiqueta: limpia(d.etiqueta, 80) || null, fecha: d.fecha, cierre, classIds } };
}

/** Las respuestas escritas de seguido («abcd-ab…»; `-` es blanco), contra cuántas opciones tiene cada pregunta. */
export function parseaRespuestasPsico(texto: string, opciones: readonly number[]): { ok: true; respuestas: number[] } | { ok: false; error: string } {
  const limpio = texto.toLowerCase().replace(/[\s,;.\-–—_]+/g, (m) => (/[-–—_]/.test(m) ? '-' : '')).replace(/[^a-e-]/g, '');
  if (limpio.length !== opciones.length) {
    return { ok: false, error: `Has escrito ${limpio.length} respuestas y el examen tiene ${opciones.length}. Si no se ajusta EXACTAMENTE no se corrige: un desfase de una lo descuadraría todo.` };
  }
  const respuestas: number[] = [];
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (c === '-') { respuestas.push(-1); continue; }
    const n = c.charCodeAt(0) - 97;
    if (n >= opciones[i]) return { ok: false, error: `La pregunta ${i + 1} solo tiene ${opciones[i]} opciones (${'abcde'.slice(0, opciones[i]).toUpperCase().split('').join(', ')}); has puesto la ${c.toUpperCase()}.` };
    respuestas.push(n);
  }
  return { ok: true, respuestas };
}

export type FilaResultado = {
  userId: string; entregado: boolean; version: number; total: number; aciertos: number; fallos: number; blancos: number; porTipo: ResultadoPsico['porTipo'];
};

/** Lo que dice un examen de clase: cuántos entregaron, la nota media y dónde falla la clase por tipo. */
export function resumenDeClase(filas: readonly FilaResultado[], participantes: number): {
  participantes: number; entregados: number; notaMedia: number | null;
  porTipo: { tipo: TipoPsico; acierto: number; preguntas: number }[];
} {
  const hechas = filas.filter((f) => f.entregado);
  const notas = hechas.map((f) => notaDeSesionGuardada({ version: f.version, total: f.total, aciertos: f.aciertos, fallos: f.fallos, porTipo: f.porTipo }));
  const suma = new Map<TipoPsico, { a: number; t: number }>();
  for (const f of hechas) for (const [tipo, v] of Object.entries(f.porTipo) as [TipoPsico, { a: number; t: number }][]) {
    const x = suma.get(tipo) ?? { a: 0, t: 0 }; x.a += v.a; x.t += v.t; suma.set(tipo, x);
  }
  return {
    participantes, entregados: hechas.length,
    notaMedia: notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100 : null,
    porTipo: [...suma.entries()].filter(([, v]) => v.t > 0).map(([tipo, v]) => ({ tipo, acierto: v.a / v.t, preguntas: v.t })).sort((a, b) => a.acierto - b.acierto),
  };
}

/** Los totales que se ofrecen como botones además de los de cada ejercicio. */
export const TOTALES_CLASE = [...TAMANOS_PSICO, 50, 60] as const;
