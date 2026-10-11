/**
 * Perfil fisico del alumno: forma de los datos y normalizacion.
 *
 * Los formularios de HTML devuelven SIEMPRE cadenas. El asistente guardaba
 * `height`, `weight` y `birth_year` tal cual, asi que a columnas numericas les
 * llegaba `"180"` o, peor, `""` cuando el campo se dejaba en blanco. Y como
 * `savePhysicalProfile` no se comprobaba, la pantalla avanzaba igual y el alumno
 * creia que sus datos estaban guardados.
 */

/** Resultados de las pruebas de referencia. */
export type BaselineMetrics = {
  /** Dominadas: repeticiones, o segundos si se mide en suspension. */
  pullups_score?: number | null;
  pullups_method?: 'reps' | 'suspension' | null;
  /**
   * Segundos en la carrera de 1.000 m, la prueba de resistencia de la
   * convocatoria. Sustituye al test de Cooper (12 minutos), que NO es la prueba
   * oficial: la app lo presentaba como «calibración oficial CNP» y el plan
   * entrenaba para la prueba equivocada.
   */
  run_1000_seconds?: number | null;
  /** Segundos en el circuito de agilidad. */
  agility_time?: number | null;
  /** Nombre antiguo de `pullups_score`. Solo lectura. */
  pullups?: number | string | null;
};

export type PhysicalProfile = {
  height?: number | null;
  weight?: number | null;
  birth_year?: number | null;
  gender?: 'male' | 'female' | null;
  /** Dias de entrenamiento por semana. */
  availability?: number | null;
  equipment?: 'gym' | 'calisthenics' | null;
  injuries?: string | null;
  baseline_metrics?: BaselineMetrics | null;
  /**
   * Formato antiguo. No lo escribe nadie desde la fase 2.7; se conserva la
   * lectura por si quedan filas historicas.
   */
  baseline_test?: { pullups?: number | string | null } | null;
};

export type TestId = 'force' | 'carrera' | 'agility';

/** Campo de `baseline_metrics` que escribe cada prueba. */
export const TEST_METRIC_FIELD: Record<TestId, keyof BaselineMetrics> = {
  force: 'pullups_score',
  carrera: 'run_1000_seconds',
  agility: 'agility_time',
};

/** Campos biometricos que el asistente rellena. */
export const NUMERIC_PROFILE_FIELDS = ['height', 'weight', 'birth_year', 'availability'] as const;

/**
 * Convierte a numero, o a null.
 *
 * `null` y no `0`: un campo en blanco significa "sin dato", que no es lo mismo
 * que "pesa cero". Y `Number('')` es 0, que es justo la confusion que hay que
 * evitar aqui.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza lo que sale del formulario antes de mandarlo al servidor. */
export function normalizeProfileInput(raw: Record<string, unknown>): PhysicalProfile {
  const out: PhysicalProfile = {};

  for (const field of NUMERIC_PROFILE_FIELDS) {
    if (field in raw) out[field] = toNumberOrNull(raw[field]);
  }

  if (typeof raw.gender === 'string') out.gender = raw.gender === 'female' ? 'female' : 'male';
  if (typeof raw.equipment === 'string') out.equipment = raw.equipment === 'calisthenics' ? 'calisthenics' : 'gym';
  if (typeof raw.injuries === 'string') out.injuries = raw.injuries.trim() || null;

  return out;
}

/** Normaliza el resultado de una prueba antes de guardarlo. */
export function normalizeMetrics(raw: Record<string, unknown>): BaselineMetrics {
  const out: BaselineMetrics = {};

  if ('pullups_score' in raw) out.pullups_score = toNumberOrNull(raw.pullups_score);
  if ('run_1000_seconds' in raw) out.run_1000_seconds = toNumberOrNull(raw.run_1000_seconds);
  if ('agility_time' in raw) out.agility_time = toNumberOrNull(raw.agility_time);
  if (raw.pullups_method === 'reps' || raw.pullups_method === 'suspension') {
    out.pullups_method = raw.pullups_method;
  }

  return out;
}

/**
 * Maximo de dominadas del perfil.
 *
 * Distingue "sin datos" (null) de "cero dominadas" (0): para un alumno que aun
 * no ha hecho el test no es lo mismo que para uno que no logra ninguna.
 */
export function readMaxPullups(profile: PhysicalProfile | null | undefined): number | null {
  // Rutas antiguas al final: solo se leen si la actual no tiene dato.
  const candidatas = [
    profile?.baseline_metrics?.pullups_score,
    profile?.baseline_metrics?.pullups,
    profile?.baseline_test?.pullups,
  ];
  for (const v of candidatas) {
    const n = toNumberOrNull(v);
    if (n !== null && n >= 0) return n;
  }
  return null;
}

/** ¿Se ha registrado ya el resultado de una prueba? */
export function isTestDone(metrics: BaselineMetrics | null | undefined, testId: TestId): boolean {
  if (testId === 'force') return readMaxPullups({ baseline_metrics: metrics }) !== null;
  if (testId === 'carrera') return toNumberOrNull(metrics?.run_1000_seconds) !== null;
  return toNumberOrNull(metrics?.agility_time) !== null;
}

/** ¿Ha completado el alumno los datos biometricos minimos? */
export function hasBiometrics(profile: PhysicalProfile | null | undefined): boolean {
  return toNumberOrNull(profile?.height) !== null;
}

/**
 * Lo que se le manda al preparador (Gemini), y solo eso.
 *
 * `athleteBrief` hacia `JSON.stringify(profile)` sobre la fila entera de la
 * base de datos: incluia `user_id`, las columnas internas y el texto libre de
 * `injuries`, que es informacion de salud. El plan necesita las medidas y las
 * marcas, no la identidad de quien las tiene.
 */
export type CoachProfile = {
  altura_cm?: number;
  peso_kg?: number;
  edad?: number;
  sexo?: 'male' | 'female';
  dias_por_semana?: number;
  material?: 'gym' | 'calisthenics';
  lesiones?: string;
  marcas?: {
    dominadas?: number;
    dominadas_metodo?: 'reps' | 'suspension';
    carrera_1000m_segundos?: number;
    agilidad_segundos?: number;
  };
};

/** Recorte del texto libre de lesiones. */
export const MAX_INJURIES_CHARS = 300;

export function buildCoachProfile(
  profile: PhysicalProfile | null | undefined,
  today = new Date(),
): CoachProfile {
  const out: CoachProfile = {};
  if (!profile) return out;

  const altura = toNumberOrNull(profile.height);
  const peso = toNumberOrNull(profile.weight);
  const nacimiento = toNumberOrNull(profile.birth_year);
  const dias = toNumberOrNull(profile.availability);

  if (altura !== null) out.altura_cm = altura;
  if (peso !== null) out.peso_kg = peso;
  // Se manda la EDAD, no el año de nacimiento: es lo que usa el plan y
  // identifica menos.
  if (nacimiento !== null) out.edad = today.getFullYear() - nacimiento;
  if (profile.gender) out.sexo = profile.gender;
  if (dias !== null) out.dias_por_semana = dias;
  if (profile.equipment) out.material = profile.equipment;
  if (typeof profile.injuries === 'string' && profile.injuries.trim()) {
    out.lesiones = profile.injuries.trim().slice(0, MAX_INJURIES_CHARS);
  }

  const dominadas = readMaxPullups(profile);
  const carrera = toNumberOrNull(profile.baseline_metrics?.run_1000_seconds);
  const agilidad = toNumberOrNull(profile.baseline_metrics?.agility_time);
  const marcas: NonNullable<CoachProfile['marcas']> = {};
  if (dominadas !== null) marcas.dominadas = dominadas;
  if (profile.baseline_metrics?.pullups_method) marcas.dominadas_metodo = profile.baseline_metrics.pullups_method;
  if (carrera !== null) marcas.carrera_1000m_segundos = carrera;
  if (agilidad !== null) marcas.agilidad_segundos = agilidad;
  if (Object.keys(marcas).length) out.marcas = marcas;

  return out;
}

/**
 * Puntuación OFICIAL de la carrera de 1.000 m (0 a 10).
 *
 * Fuente: BOE-A-2026-15055, anexo II, B) Sistema de calificación, tercer
 * ejercicio. Cada número es el TOPE en segundos de ese tramo: con 3:35 (215 s)
 * un hombre saca 3 puntos (tramo 3:36 a 3:31). Por encima del último tope, 0
 * — y un 0 en cualquier ejercicio elimina.
 *
 * Va en un objeto con la fecha en que se comprobó, como `CNP_SCORING`: las
 * tablas cambian entre convocatorias.
 */
export const TABLA_CARRERA_1000 = {
  fuente: 'BOE-A-2026-15055, anexo II',
  revisadoEl: '2026-10-11',
  /** Topes (en segundos) para 10, 9, 8 … 1 puntos. */
  male: [174, 180, 186, 192, 198, 204, 210, 216, 222, 228],
  female: [204, 213, 222, 231, 240, 249, 258, 267, 276, 285],
} as const;

/** Puntos de la carrera de 1.000 m. `null` si falta el tiempo o el sexo (no es un 0). */
export function puntosCarrera1000(
  segundos: number | null | undefined,
  sexo: 'male' | 'female' | null | undefined,
): number | null {
  const s = toNumberOrNull(segundos);
  if (s === null || s <= 0 || !sexo) return null;
  const topes = TABLA_CARRERA_1000[sexo];
  for (let i = 0; i < topes.length; i++) {
    if (s <= topes[i]) return 10 - i;
  }
  return 0;
}

/** «3:35» a partir de segundos. Para la carrera, que el BOE mide en minutos y segundos. */
export function formatMinSeg(segundos: number | null | undefined): string | null {
  const s = toNumberOrNull(segundos);
  if (s === null || s < 0) return null;
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Minutos y segundos tecleados por separado → segundos. Vacío es `null`, no 0. */
export function minSegASegundos(min: unknown, seg: unknown): number | null {
  const m = toNumberOrNull(min);
  const s = toNumberOrNull(seg);
  if (m === null && s === null) return null;
  const mm = m ?? 0;
  const ss = s ?? 0;
  if (mm < 0 || ss < 0 || ss >= 60) return null;
  return mm * 60 + ss;
}
