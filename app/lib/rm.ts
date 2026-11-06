/**
 * EL 1RM Y LAS CARGAS EN PORCENTAJE (regla 89).
 *
 * El 1RM («una repetición máxima») es el peso máximo que alguien levanta UNA
 * vez en un ejercicio. El preparador pauta en porcentaje —«sentadilla 4 × 6 al
 * 75 %»— y a cada alumno le salen SUS kilos.
 *
 * No hace falta probar el máximo, que es donde está el riesgo de lesión: con un
 * peso que se levanta varias veces (2 a 12) se ESTIMA con la fórmula de Epley.
 * Por encima de 12 repeticiones la estimación ya no es fiable y no se acepta.
 *
 * Módulo PURO (regla 21).
 */

/** Los ejercicios que se sugieren al escribir; se puede poner cualquier otro. */
export const EJERCICIOS_FUERZA = [
  'Press de banca',
  'Sentadilla',
  'Peso muerto',
  'Dominada lastrada',
  'Press militar',
  'Remo con barra',
  'Hip thrust',
  'Fondos lastrados',
] as const;

export const MAX_REPS_ESTIMACION = 12;
export const MAX_CARGAS = 10;
/** Las cargas se redondean a lo que se puede montar en una barra. */
export const PASO_KG = 2.5;

/** «  press de BANCA » → «Press de banca». */
export function normalizaEjercicio(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** La clave para casar ejercicios: sin tildes, sin mayúsculas, sin espacios de más. */
export function claveEjercicio(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * El 1RM a partir de un peso y sus repeticiones (Epley: peso × (1 + reps/30)).
 * Con 1 repetición es el propio peso. `null` si no hay datos o pasan de 12.
 */
export function estima1RM(pesoKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (pesoKg === null || pesoKg === undefined || !Number.isFinite(pesoKg) || pesoKg <= 0) return null;
  const r = reps ?? 1;
  if (!Number.isInteger(r) || r < 1 || r > MAX_REPS_ESTIMACION) return null;
  return Math.round((r === 1 ? pesoKg : pesoKg * (1 + r / 30)) * 10) / 10;
}

/** Un peso escrito a mano («62,5», «62.5», «  80 ») a número; `null` si no es un peso válido. */
export function leeKg(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Redondea a 2,5 kg (lo que se puede montar con discos). */
export function redondeaCarga(kg: number, paso = PASO_KG): number {
  return Math.round(kg / paso) * paso;
}

/** Los kilos de una carga: el porcentaje del 1RM, redondeado a la barra. */
export function kgDeCarga(rm: number | null | undefined, porcentaje: number): number | null {
  if (rm === null || rm === undefined || !Number.isFinite(rm) || rm <= 0) return null;
  return redondeaCarga((rm * porcentaje) / 100);
}

export type Carga = { ejercicio: string; porcentaje: number; series: number | null; reps: number | null };

/**
 * Las cargas que escribe el preparador → las que se guardan. Las filas sin
 * ejercicio se descartan (son filas a medio rellenar); un porcentaje fuera de
 * 30-110 es un error y se dice. Vacío es `null`, nunca 0 (regla 16).
 */
export function normalizaCargas(raw: unknown): { ok: true; valor: Carga[] } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, valor: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'Las cargas no son válidas.' };
  const out: Carga[] = [];
  for (const fila of raw) {
    const f = (fila ?? {}) as Record<string, unknown>;
    const ejercicio = normalizaEjercicio(f.ejercicio);
    if (!ejercicio) continue;
    const pct = Number(String(f.porcentaje ?? '').replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 30 || pct > 110) return { ok: false, error: `«${ejercicio}»: el porcentaje del 1RM va de 30 a 110.` };
    const entero = (v: unknown, max: number): number | null | 'mal' => {
      if (v === null || v === undefined || String(v).trim() === '') return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= max ? n : 'mal';
    };
    const series = entero(f.series, 20);
    const reps = entero(f.reps, 50);
    if (series === 'mal' || reps === 'mal') return { ok: false, error: `«${ejercicio}»: las series y las repeticiones van en números enteros.` };
    if (out.length >= MAX_CARGAS) return { ok: false, error: `Como mucho ${MAX_CARGAS} cargas por sesión.` };
    out.push({ ejercicio, porcentaje: Math.round(pct), series, reps });
  }
  return { ok: true, valor: out };
}

/** Lo que se guarda en la base de datos, leído de vuelta (regla 17: se normaliza también al leer). */
export function leeCargas(raw: unknown): Carga[] {
  const r = normalizaCargas(raw);
  return r.ok ? r.valor : [];
}

export type MarcaRM = { id: string; ejercicio: string; pesoKg: number; reps: number; fecha: string; nota: string | null };

/** El 1RM de una marca (medido o estimado). */
export const rmDe = (m: Pick<MarcaRM, 'pesoKg' | 'reps'>) => estima1RM(m.pesoKg, m.reps);

/**
 * El 1RM VIGENTE de cada ejercicio: el de la marca más reciente (es la forma
 * de ahora, no la de hace meses). Por clave de ejercicio.
 */
export function rmVigentes(marcas: MarcaRM[]): Map<string, { ejercicio: string; rm: number; fecha: string }> {
  const out = new Map<string, { ejercicio: string; rm: number; fecha: string }>();
  for (const m of [...marcas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const rm = rmDe(m);
    if (rm === null) continue;
    out.set(claveEjercicio(m.ejercicio), { ejercicio: m.ejercicio, rm, fecha: m.fecha });
  }
  return out;
}

/** «4 × 6 al 75 %», «al 80 %». */
export function textoCarga(c: Carga): string {
  const sr = c.series && c.reps ? `${c.series} × ${c.reps} ` : c.series ? `${c.series} series ` : c.reps ? `${c.reps} reps ` : '';
  return `${sr}al ${c.porcentaje} %`;
}

/** «82,5 kg». */
export const formateaKg = (kg: number) => `${kg.toLocaleString('es-ES', { maximumFractionDigits: 1 })} kg`;
