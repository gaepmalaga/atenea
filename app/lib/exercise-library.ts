/**
 * BIBLIOTECA DE EJERCICIOS PARA EL PLAN DEL PREPARADOR.
 *
 * El editor del plan de físicas (`PlanEntrenadorEditor`) dejó de ser siete
 * `textarea` con sintaxis `nombre; series; reps; descanso`: ahora son filas con
 * campos de verdad. Esta lista es lo que ofrece el desplegable de cada fila —
 * texto libre SIEMPRE permitido, pero teniendo los nombres a mano se escriben
 * igual una semana y otra, y el plan que ve el alumno no queda con
 * «Dominadas» / «dominadas» / «Dominadas » como tres ejercicios distintos.
 *
 * `kind` decide QUÉ CAMPOS tiene la fila: una serie de 200 m no se mide en
 * «series y repeticiones», y una prueba se mide por marca. Se guarda en
 * `Exercise.metric_type`, una columna que ya existía en el plan y que hasta
 * ahora no escribía nadie.
 *
 * Pura y testeada (`tests/exercise-library.test.ts`). Sin red, sin estado.
 */

export type EjercicioKind = 'fuerza' | 'carrera' | 'circuito' | 'general';

export type EjercicioLib = {
  /** Nombre tal cual se guarda y se le enseña al alumno. */
  nombre: string;
  kind: EjercicioKind;
  /** Grupo para el desplegable. */
  grupo: string;
};

/**
 * Las tres pruebas de la Escala Básica del CNP van primero — son las que el
 * preparador va a poner más veces. Después, material general de preparación.
 */
export const BIBLIOTECA_EJERCICIOS: EjercicioLib[] = [
  // — Pruebas oficiales —
  { nombre: 'Circuito de agilidad', kind: 'circuito', grupo: 'Pruebas del CNP' },
  { nombre: 'Dominadas', kind: 'fuerza', grupo: 'Pruebas del CNP' },
  { nombre: 'Suspensión isométrica en barra', kind: 'fuerza', grupo: 'Pruebas del CNP' },
  { nombre: 'Carrera de 1000 m', kind: 'carrera', grupo: 'Pruebas del CNP' },

  // — Fuerza —
  { nombre: 'Dominadas asistidas (goma)', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Remo con goma', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Jalón al pecho', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Flexiones', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Fondos en paralelas', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Press banca', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Press militar', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Sentadilla', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Peso muerto', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Zancadas', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Hip thrust', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Plancha', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Abdominales', kind: 'fuerza', grupo: 'Fuerza' },
  { nombre: 'Burpees', kind: 'fuerza', grupo: 'Fuerza' },

  // — Carrera —
  { nombre: 'Rodaje suave', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Series de 100 m', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Series de 200 m', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Series de 400 m', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Series de 1000 m', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Course-navette (Léger)', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Fartlek', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Cuestas', kind: 'carrera', grupo: 'Carrera' },
  { nombre: 'Progresivos', kind: 'carrera', grupo: 'Carrera' },

  // — Agilidad / circuito —
  { nombre: 'Circuito de conos', kind: 'circuito', grupo: 'Agilidad' },
  { nombre: 'Escalera de agilidad', kind: 'circuito', grupo: 'Agilidad' },
  { nombre: 'Trabajo de salidas y giros', kind: 'circuito', grupo: 'Agilidad' },

  // — General —
  { nombre: 'Calentamiento', kind: 'general', grupo: 'General' },
  { nombre: 'Movilidad articular', kind: 'general', grupo: 'General' },
  { nombre: 'Estiramientos', kind: 'general', grupo: 'General' },
  { nombre: 'Vuelta a la calma', kind: 'general', grupo: 'General' },
];

const POR_NOMBRE = new Map(
  BIBLIOTECA_EJERCICIOS.map((e) => [normaliza(e.nombre), e] as const),
);

function normaliza(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Palabras que delatan el tipo cuando el ejercicio es texto libre. */
const PISTAS: Array<[RegExp, EjercicioKind]> = [
  [/\b(circuito|agilidad|conos|slalom)\b/, 'circuito'],
  [/(\bcarrera\b|correr|\brodaje\b|sprint|navette|fartlek|cuestas|progresivos|\d+\s?(m|km|metros)\b)/, 'carrera'],
  [/\b(calentamiento|movilidad|estiramientos?|vuelta a la calma)\b/, 'general'],
];

/**
 * El `kind` de un ejercicio por su nombre: primero la biblioteca, luego unas
 * pistas por palabra («200 m» → carrera, «circuito» → circuito), y si nada
 * encaja, `'fuerza'` — es lo más común y sus campos (series / reps / descanso)
 * son los que un preparador espera por defecto.
 */
export function kindDeEjercicio(nombre: string): EjercicioKind {
  const enBib = POR_NOMBRE.get(normaliza(nombre))?.kind;
  if (enBib) return enBib;
  const n = normaliza(nombre);
  for (const [re, kind] of PISTAS) if (re.test(n)) return kind;
  return 'fuerza';
}

/** ¿Está en la biblioteca (para el sello «de la lista» en la fila)? */
export function estaEnBiblioteca(nombre: string): boolean {
  return POR_NOMBRE.has(normaliza(nombre));
}

/**
 * Las etiquetas de los tres campos de medida de una fila, según el `kind`.
 * `null` = ese campo no se enseña para este tipo de ejercicio.
 *
 * Los tres campos van a `Exercise.sets` / `.reps` / `.rest` respectivamente —
 * los nombres internos se quedan («sets» para una serie de carrera no es
 * bonito, pero cambiar el esquema del plan sí rompería cosas). Lo que cambia es
 * lo que ve el preparador.
 */
export function camposDeKind(kind: EjercicioKind): {
  campo1: { label: string; ejemplo: string } | null;
  campo2: { label: string; ejemplo: string } | null;
  campo3: { label: string; ejemplo: string } | null;
} {
  switch (kind) {
    case 'carrera':
      return {
        campo1: { label: 'repeticiones', ejemplo: '6' },
        campo2: { label: 'distancia / tiempo', ejemplo: '200 m' },
        campo3: { label: 'recuperación', ejemplo: '90 s' },
      };
    case 'circuito':
      return {
        campo1: { label: 'vueltas', ejemplo: '3' },
        campo2: { label: 'objetivo', ejemplo: '< 45 s' },
        campo3: { label: 'descanso', ejemplo: '2 min' },
      };
    case 'general':
      return {
        campo1: null,
        campo2: { label: 'duración', ejemplo: '10 min' },
        campo3: null,
      };
    case 'fuerza':
    default:
      return {
        campo1: { label: 'series', ejemplo: '4' },
        campo2: { label: 'repeticiones', ejemplo: '8-10' },
        campo3: { label: 'descanso', ejemplo: '90 s' },
      };
  }
}

export const KIND_LABEL: Record<EjercicioKind, string> = {
  fuerza: 'Fuerza',
  carrera: 'Carrera',
  circuito: 'Circuito / agilidad',
  general: 'General',
};

/** Un renglón para la tira-resumen de la semana. */
export function resumeDia(numEjercicios: number, entreno: boolean): string {
  if (!entreno) return 'Descanso';
  if (numEjercicios === 0) return 'Sin ejercicios';
  return `${numEjercicios} ${numEjercicios === 1 ? 'ejercicio' : 'ejercicios'}`;
}
