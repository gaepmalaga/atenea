/**
 * EL BAREMO OFICIAL DE LAS PRUEBAS FÍSICAS (regla 86).
 *
 * Fuente: BOE-A-2026-15055, base 6.1.2 y anexo II, B) Sistema de calificación.
 * Cada ejercicio se puntúa de 0 a 10; **un 0 en cualquiera elimina**; la nota de
 * la prueba es la MEDIA de los tres, y hace falta un 5 para aprobar.
 *
 *   1.º Circuito de agilidad (hombres y mujeres), segundos y décimas
 *   2.º Dominadas (hombres), repeticiones · Suspensión en barra (mujeres), segundos
 *   3.º Carrera de 1.000 m (hombres y mujeres), minutos y segundos
 *
 * Las tablas van en un objeto con su fuente y la fecha en que se comprobaron,
 * como `CNP_SCORING` y `TABLA_CARRERA_1000`: cambian entre convocatorias.
 *
 * Módulo PURO (regla 21).
 */

import { puntosCarrera1000, formatMinSeg, toNumberOrNull } from './physical.ts';

export type Sexo = 'male' | 'female';
export type Prueba = 'agilidad' | 'dominadas' | 'suspension' | 'carrera_1000';

export const PRUEBAS: readonly Prueba[] = ['agilidad', 'dominadas', 'suspension', 'carrera_1000'];

export const INFO_PRUEBA: Record<Prueba, { nombre: string; corto: string; unidad: string; ejemplo: string; menorEsMejor: boolean; soloSexo: Sexo | null }> = {
  agilidad: { nombre: 'Circuito de agilidad', corto: 'Agilidad', unidad: 'segundos', ejemplo: '9,4', menorEsMejor: true, soloSexo: null },
  dominadas: { nombre: 'Dominadas', corto: 'Dominadas', unidad: 'repeticiones', ejemplo: '12', menorEsMejor: false, soloSexo: 'male' },
  suspension: { nombre: 'Suspensión en barra', corto: 'Suspensión', unidad: 'segundos', ejemplo: '60', menorEsMejor: false, soloSexo: 'female' },
  carrera_1000: { nombre: 'Carrera de 1.000 m', corto: '1.000 m', unidad: 'min:seg', ejemplo: '3:35', menorEsMejor: true, soloSexo: null },
};

export const esPrueba = (v: unknown): v is Prueba => typeof v === 'string' && (PRUEBAS as readonly string[]).includes(v);

export const BAREMO_CNP = {
  fuente: 'BOE-A-2026-15055, anexo II',
  revisadoEl: '2026-11-06',
  /** Topes en segundos (con décimas) para 10, 9, 8 … 1 puntos. 11,7 s (h) o 12,8 s (m) o más = 0. */
  agilidad: {
    male: [8.2, 8.8, 9.3, 9.7, 10.1, 10.5, 10.9, 11.2, 11.4, 11.6],
    female: [9.3, 9.8, 10.3, 10.8, 11.2, 11.6, 12.0, 12.3, 12.5, 12.7],
  },
  /** Mínimo de dominadas para 10, 9, 8 … 1 puntos. De 0 a 4 = 0. */
  dominadas: [17, 16, 15, 14, 12, 10, 8, 7, 6, 5],
  /** Mínimo de segundos en suspensión para 10, 9, 8 … 1 puntos. De 0 a 35 s = 0. */
  suspension: [95, 86, 78, 70, 63, 57, 52, 46, 41, 36],
  /** Nota mínima de la prueba (media de los tres). */
  aprobado: 5,
} as const;

/** La prueba de fuerza que le toca según el sexo. Sin sexo, no se sabe. */
export function pruebaDeFuerza(sexo: Sexo | null | undefined): 'dominadas' | 'suspension' | null {
  return sexo === 'male' ? 'dominadas' : sexo === 'female' ? 'suspension' : null;
}

/** Las tres pruebas que hace esa persona, en el orden del examen. */
export function pruebasDe(sexo: Sexo | null | undefined): Prueba[] {
  const fuerza = pruebaDeFuerza(sexo);
  return fuerza ? ['agilidad', fuerza, 'carrera_1000'] : ['agilidad', 'dominadas', 'suspension', 'carrera_1000'];
}

/**
 * Puntos (0-10) de una marca. `null` si falta la marca o hace falta el sexo y
 * no se sabe: sin datos NO es un 0, porque un 0 elimina (regla 8).
 */
export function puntosPrueba(prueba: Prueba, valor: number | null | undefined, sexo: Sexo | null | undefined): number | null {
  const v = toNumberOrNull(valor);
  if (v === null || v < 0) return null;
  switch (prueba) {
    case 'agilidad': {
      if (!sexo || v === 0) return null;
      // Se mide en décimas: 9,44 se lee 9,4, como en el cronómetro del tribunal.
      const d = Math.round(v * 10) / 10;
      const topes = BAREMO_CNP.agilidad[sexo];
      for (let i = 0; i < topes.length; i++) if (d <= topes[i] + 1e-9) return 10 - i;
      return 0;
    }
    case 'dominadas': {
      const n = Math.floor(v);
      const min = BAREMO_CNP.dominadas;
      for (let i = 0; i < min.length; i++) if (n >= min[i]) return 10 - i;
      return 0;
    }
    case 'suspension': {
      const s = Math.floor(v);
      const min = BAREMO_CNP.suspension;
      for (let i = 0; i < min.length; i++) if (s >= min[i]) return 10 - i;
      return 0;
    }
    case 'carrera_1000':
      return puntosCarrera1000(v, sexo ?? null);
  }
}

/**
 * La nota de la prueba física con los tres ejercicios: media, si elimina, si
 * aprueba. Con alguno sin puntuar no hay media (no se inventa), pero un 0 ya
 * elimina aunque falten los demás.
 */
export function notaFisica(puntos: (number | null)[]): { media: number | null; eliminado: boolean; apto: boolean | null } {
  const eliminado = puntos.some((p) => p === 0);
  if (puntos.length === 0 || puntos.some((p) => p === null)) {
    return { media: null, eliminado, apto: eliminado ? false : null };
  }
  const nums = puntos as number[];
  const media = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
  return { media, eliminado, apto: !eliminado && media >= BAREMO_CNP.aprobado };
}

/** «9,4 s», «12», «58 s», «3:35». */
export function formateaMarca(prueba: Prueba, valor: number | null | undefined): string {
  const v = toNumberOrNull(valor);
  if (v === null) return '—';
  switch (prueba) {
    case 'agilidad':
      return `${v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
    case 'dominadas':
      return String(Math.floor(v));
    case 'suspension':
      return `${Math.floor(v)} s`;
    case 'carrera_1000':
      return formatMinSeg(v) ?? '—';
  }
}

/**
 * Lo que se teclea → el número que se guarda. Acepta coma decimal; la carrera,
 * «3:35» o los segundos a secas. Vacío o sin sentido es `null`, nunca 0.
 */
export function leeMarca(prueba: Prueba, texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).trim().replace(',', '.');
  if (!t) return null;
  if (prueba === 'carrera_1000') {
    const m = t.match(/^(\d{1,2})[:'´’](\d{1,2})$/);
    if (m) {
      const seg = Number(m[2]);
      return seg < 60 ? Number(m[1]) * 60 + seg : null;
    }
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return prueba === 'dominadas' && n === 0 ? 0 : null;
  if (prueba === 'dominadas') return Number.isInteger(n) ? n : null;
  if (prueba === 'agilidad') return n < 60 ? Math.round(n * 10) / 10 : null;
  if (prueba === 'suspension') return n < 600 ? Math.round(n) : null;
  return n < 1800 ? Math.round(n) : null;
}

export type Marca = { id: string; prueba: Prueba; valor: number; fecha: string; nota: string | null };

/** La mejor marca de una prueba (la menor en tiempo de carrera y agilidad, la mayor en las otras). */
export function mejorMarca(marcas: Marca[], prueba: Prueba): Marca | null {
  const de = marcas.filter((m) => m.prueba === prueba);
  if (!de.length) return null;
  const menor = INFO_PRUEBA[prueba].menorEsMejor;
  return de.reduce((a, b) => ((menor ? b.valor < a.valor : b.valor > a.valor) ? b : a));
}

/** La última marca de una prueba (por fecha; a igual fecha, la última de la lista). */
export function ultimaMarca(marcas: Marca[], prueba: Prueba): Marca | null {
  const de = marcas.filter((m) => m.prueba === prueba);
  if (!de.length) return null;
  return de.reduce((a, b) => (b.fecha >= a.fecha ? b : a));
}
