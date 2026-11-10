/**
 * DATOS DE DEMOSTRACIÓN (regla 106): el generador.
 *
 * Inventa, de forma PURA y DETERMINISTA, una academia entera para poder ver la
 * aplicación llena: alumnos, grupos, cuadrante de física, entrenos, marcas,
 * asistencia, cobros… Mismos nombres y misma historia cada vez; lo único que
 * cambia son las FECHAS, que se cuentan desde el mes en curso en la hora de la
 * academia (`ahoraEnZona`, `periodoEnZona`): cargado en diciembre, todo es de
 * diciembre y de los meses anteriores.
 *
 * Cómo se consigue que sea determinista:
 *   · Nada de `Math.random()` ni de `Date.now()`: el «ahora» entra como
 *     parámetro (`cuando`) y el azar sale de un generador con SEMILLA
 *     (`crea`), una por alumno y por cosa. Así cada alumno tiene su historia
 *     aunque se genere por separado (la carga va por fases y por tandas).
 *   · La historia se cuenta en «días atrás», no en fechas: la semilla de un
 *     día es `alumno|d|<días atrás>`, nunca la fecha. Por eso cargar en
 *     noviembre y en diciembre da los mismos alumnos con las mismas respuestas
 *     (lo comprueba `tests/demo.test.ts`).
 *   · Los ids salen de `uuidDemo` (un hash de la clave de cada fila). Volver a
 *     lanzar una fase da los mismos ids, así que reintentar no duplica nada.
 *
 * Este módulo NO habla con la base de datos: decide QUÉ se crea. Quién lo crea,
 * qué apunta en el registro y cómo se deshace está en `demo-motor.ts`.
 *
 * Todo lo inventado es obviamente inventado: correos `@demo.alphapol.test`
 * (dominio reservado, no recibe correo), nada de nombres de personas reales de
 * la academia.
 */

import { ahoraEnZona, diaSemanaDe, sumaDias } from './asistencia';
import { cuotaDeAlumno, periodoEnZona, sumaMeses, centimos, type Tarifa } from './cuotas';
import { lunesDe, type TipoSesion } from './sesiones';
import { tipoDeTitulo } from './cuadrante';
import { agrupaHabituales, profesorSugerido } from './profesores';
import { ERROR_TYPES } from './stats';
import { DOMINIO_DEMO, EMAIL_ALUMNO_DEMO } from './demo-fases';

// ============================================================
// AZAR CON SEMILLA
// ============================================================

/** Un hash de 32 bits de un texto (xmur3). */
export function hash32(texto: string): number {
  let h = 1779033703 ^ texto.length;
  for (let i = 0; i < texto.length; i++) {
    h = Math.imul(h ^ texto.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export type Azar = () => number;

/** Un generador de números en [0, 1) que siempre da la misma serie para la misma semilla (mulberry32). */
export function crea(semilla: string): Azar {
  let a = hash32(semilla);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entre = (r: Azar, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const entreReal = (r: Azar, a: number, b: number) => a + r() * (b - a);
const elige = <T,>(r: Azar, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const prob = (r: Azar, p: number) => r() < p;
const acota = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Normal (media 0, desviación 1) por Box-Muller. */
const gauss = (r: Azar) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * Un uuid DETERMINISTA de la clave de la fila. Con la misma clave, el mismo id:
 * reintentar una fase no crea duplicados, y el registro puede apuntar la fila
 * antes de crearla porque ya sabe su clave primaria.
 */
export function uuidDemo(...partes: string[]): string {
  const s = ['demo', ...partes].join('|');
  const hex = [0, 1, 2, 3].map((i) => hash32(`${i}#${s}`).toString(16).padStart(8, '0')).join('');
  const variante = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variante}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

// ============================================================
// EL MOMENTO: todo se cuenta desde aquí
// ============================================================

/** El «ahora» de la carga, en la hora de la academia. Se fija al empezar y lo usan todas las fases. */
export type Cuando = {
  ahoraMs: number;
  /** `YYYY-MM-DD` de hoy. */
  hoy: string;
  /** Minutos transcurridos de hoy. */
  minutosHoy: number;
  /** `YYYY-MM` del mes en curso. */
  periodo: string;
  /** El lunes de la semana en curso. */
  lunes: string;
};

export function cuando(ahoraMs: number): Cuando {
  const a = ahoraEnZona(ahoraMs);
  return { ahoraMs, hoy: a.fecha, minutosHoy: a.minutos, periodo: periodoEnZona(ahoraMs), lunes: lunesDe(a.fecha) };
}

/**
 * El instante UTC (ISO) en que, en la hora de la academia, era `fecha` a las
 * `segundos` del día. Vercel corre en UTC y la academia en Madrid, con cambio
 * de hora: se ajusta por aproximaciones hasta que `ahoraEnZona` devuelva lo
 * que se pidió.
 */
export function instante(fecha: string, segundos: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(y, m - 1, d) + segundos * 1000;
  // El desfase con la hora de la academia solo cambia en una hora en punto: se calcula una vez por hora.
  const hora = Math.floor(segundos / 3600);
  const clave = `${fecha}|${hora}`;
  let ajuste = AJUSTES_HORARIOS.get(clave);
  if (ajuste === undefined) {
    const inicioHora = Date.UTC(y, m - 1, d) + hora * 3_600_000;
    let ms = inicioHora;
    for (let i = 0; i < 3; i++) {
      const a = ahoraEnZona(ms);
      const [ay, am, ad] = a.fecha.split('-').map(Number);
      const local = Date.UTC(ay, am - 1, ad) + a.minutos * 60_000;
      const falta = inicioHora - local;
      if (falta === 0) break;
      ms += falta;
    }
    ajuste = ms - inicioHora;
    AJUSTES_HORARIOS.set(clave, ajuste);
  }
  return new Date(objetivo + ajuste).toISOString();
}

const AJUSTES_HORARIOS = new Map<string, number>();

const minutosDeHora = (h: string | null): number | null => {
  const m = h ? /^(\d{1,2}):(\d{2})/.exec(h) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ============================================================
// LOS GRUPOS
// ============================================================

export { DOMINIO_DEMO, EMAIL_ALUMNO_DEMO };

/** Los grupos que la carga USA y no crea: ya existen en la academia (y no se tocan). */
export const GRUPO_TEORIA_43 = 'Promo 43';
export const GRUPO_KAPPA = 'Promo 44 · Kappa';
export const GRUPO_MULTI = 'Promo 44 · Multi';

/** Los dos grupos que la carga SÍ crea (si no existen ya con ese nombre). */
export type GrupoNuevoDemo = {
  nombre: string;
  tipo: 'teoria' | 'ingles';
  weekdays: number[];
  inicio: string;
  fin: string;
  aforo: number | null;
  /** El profesor, por su nombre (ya existe en la academia: la carga no crea profesores). */
  profesor: string | null;
};

export const GRUPOS_NUEVOS: GrupoNuevoDemo[] = [
  { nombre: 'Promo 44 · Teoría tarde', tipo: 'teoria', weekdays: [1, 3], inicio: '17:00', fin: '19:00', aforo: 30, profesor: 'Sofía' },
  { nombre: 'Inglés B1', tipo: 'ingles', weekdays: [2, 4], inicio: '19:00', fin: '20:00', aforo: null, profesor: null },
];
export const GRUPO_TEORIA_TARDE = GRUPOS_NUEVOS[0].nombre;
export const GRUPO_INGLES = GRUPOS_NUEVOS[1].nombre;

/** El tipo (`group_kinds.id`) de cada grupo que usa la demo, para calcular la cuota. */
export function tipoDeGrupoDemo(nombre: string): 'teoria' | 'fisicas' | 'ingles' {
  if (nombre === GRUPO_INGLES) return 'ingles';
  if (nombre === GRUPO_TEORIA_43 || nombre === GRUPO_TEORIA_TARDE) return 'teoria';
  return 'fisicas';
}

/** Los temas de teoría que se reparten dos profesores si no tienen ninguno (nº de tema del temario). */
export const TEMAS_PROFESORES_DEMO: { profesor: string; desde: number; hasta: number }[] = [
  { profesor: 'Sofía', desde: 1, hasta: 15 },
  { profesor: 'José Morato', desde: 16, hasta: 30 },
];

// ============================================================
// LOS ALUMNOS
// ============================================================

export type PerfilDemo = 'intensivo' | 'regular' | 'irregular' | 'abandonado' | 'nunca' | 'pendiente';
export type Sexo = 'male' | 'female';

export type AlumnoDemo = {
  /** `a00`…`a44`: estable, de ahí salen los ids. */
  clave: string;
  email: string;
  nombre: string;
  sexo: Sexo;
  perfil: PerfilDemo;
  acceso: 'active' | 'pending' | 'suspended';
  teoria: typeof GRUPO_TEORIA_43 | typeof GRUPO_TEORIA_TARDE | null;
  /** Su grupo de física (nombre completo), o `null`. */
  fisica: string | null;
  ingles: boolean;
  exento: boolean;
  propia: { eur: number; nota: string } | null;
  /** Hace cuántos meses empezó (0 = este mes): desde ahí tiene cuotas. */
  altaMeses: number;
  /** Hace cuántos días contestó por última vez (los que dejaron de venir). */
  ultimaActividadDias: number | null;
  /** Lo bien que va, de 0 a 1. */
  nivel: number;
  /** Tiene entreno individual (regla 97). */
  entreno: boolean;
  /** Tiene 1RM apuntados. */
  conRm: boolean;
  /** Una nota para la ficha (memberships.note). */
  nota: string | null;
};

type FilaRoster = {
  nombre: string; ap1: string; ap2: string; sexo: Sexo; perfil: PerfilDemo;
  teoria?: 'p43' | 'tarde'; fisica?: string; ingles?: boolean; extra?: Partial<Pick<AlumnoDemo, 'acceso' | 'exento' | 'propia' | 'altaMeses' | 'ultimaActividadDias' | 'entreno' | 'conRm' | 'nota'>>;
};

const K = 'Promo 44 · Kappa', A = 'Promo 44 · Alpha', Z = 'Promo 44 · Zetta', O = 'Promo 44 · Omega',
  S = 'Promo 44 · Sigma', B = 'Promo 44 · Betta', D = 'Promo 44 · Delta', M = GRUPO_MULTI;
const H: Sexo = 'male', F: Sexo = 'female';

/**
 * Los 45. Los grupos de física respetan el sexo de cada uno (Kappa, Sigma y
 * Betta son de chicas; Alpha, Zetta, Omega y Delta, de chicos: lo dice su
 * horario). Inglés solo en tres.
 */
const ROSTER: FilaRoster[] = [
  // Los que estudian a diario (0-7)
  { nombre: 'Alumno', ap1: 'Demo', ap2: '', sexo: F, perfil: 'intensivo', teoria: 'p43', fisica: K, extra: { entreno: true, conRm: true, altaMeses: 5, nota: 'La cuenta para ver la parte del alumno' } },
  { nombre: 'Álvaro', ap1: 'García', ap2: 'Pardo', sexo: H, perfil: 'intensivo', teoria: 'p43', fisica: A, extra: { entreno: true, conRm: true, altaMeses: 5 } },
  { nombre: 'Marta', ap1: 'Jiménez', ap2: 'Soler', sexo: F, perfil: 'intensivo', teoria: 'p43', fisica: S, extra: { entreno: true, conRm: true, altaMeses: 5 } },
  { nombre: 'Pablo', ap1: 'Ruiz', ap2: 'Lorente', sexo: H, perfil: 'intensivo', teoria: 'tarde', fisica: O, extra: { conRm: true, altaMeses: 5 } },
  { nombre: 'Laura', ap1: 'Sánchez', ap2: 'Vela', sexo: F, perfil: 'intensivo', teoria: 'tarde', fisica: B, extra: { entreno: true, conRm: true, altaMeses: 5 } },
  { nombre: 'Adrián', ap1: 'Moreno', ap2: 'Cano', sexo: H, perfil: 'intensivo', teoria: 'p43', fisica: D, extra: { entreno: true, conRm: true, altaMeses: 5 } },
  { nombre: 'Carmen', ap1: 'Díaz', ap2: 'Montero', sexo: F, perfil: 'intensivo', teoria: 'tarde', extra: { altaMeses: 5 } },
  { nombre: 'Javier', ap1: 'Gil', ap2: 'Prieto', sexo: H, perfil: 'intensivo', teoria: 'p43', fisica: Z, extra: { conRm: true, altaMeses: 5 } },
  // Regulares (8-24)
  { nombre: 'Sara', ap1: 'Muñoz', ap2: 'Iglesias', sexo: F, perfil: 'regular', teoria: 'p43', fisica: K, ingles: true, extra: { entreno: true, conRm: true, altaMeses: 5 } },
  { nombre: 'Sergio', ap1: 'Romero', ap2: 'Ibáñez', sexo: H, perfil: 'regular', teoria: 'p43', fisica: A, extra: { altaMeses: 5, conRm: true } },
  { nombre: 'Elena', ap1: 'Alonso', ap2: 'Bravo', sexo: F, perfil: 'regular', teoria: 'tarde', fisica: S, extra: { conRm: true, altaMeses: 5 } },
  { nombre: 'Carlos', ap1: 'Gutiérrez', ap2: 'Sanz', sexo: H, perfil: 'regular', teoria: 'p43', fisica: O, extra: { conRm: true, altaMeses: 5 } },
  { nombre: 'Lucía', ap1: 'Ortega', ap2: 'Vidal', sexo: F, perfil: 'regular', teoria: 'p43', fisica: B, extra: { altaMeses: 5 } },
  { nombre: 'Hugo', ap1: 'Navarro', ap2: 'Rey', sexo: H, perfil: 'regular', teoria: 'tarde', fisica: D, extra: { altaMeses: 5 } },
  { nombre: 'Cristina', ap1: 'Torres', ap2: 'Lara', sexo: F, perfil: 'regular', teoria: 'p43', extra: { altaMeses: 5 } },
  { nombre: 'Iván', ap1: 'Domínguez', ap2: 'Calvo', sexo: H, perfil: 'regular', teoria: 'p43', fisica: Z, extra: { altaMeses: 5 } },
  { nombre: 'Andrea', ap1: 'Vázquez', ap2: 'Mora', sexo: F, perfil: 'regular', teoria: 'tarde', fisica: K, extra: { altaMeses: 5 } },
  { nombre: 'Rubén', ap1: 'Ramos', ap2: 'Peña', sexo: H, perfil: 'regular', fisica: A, extra: { altaMeses: 5 } },
  { nombre: 'Irene', ap1: 'Serrano', ap2: 'Campos', sexo: F, perfil: 'regular', teoria: 'p43', fisica: S, ingles: true, extra: { altaMeses: 5 } },
  { nombre: 'Miguel', ap1: 'Blanco', ap2: 'Herrero', sexo: H, perfil: 'regular', teoria: 'p43', fisica: M, extra: { altaMeses: 5 } },
  { nombre: 'Claudia', ap1: 'Molina', ap2: 'Esteban', sexo: F, perfil: 'regular', teoria: 'tarde', fisica: M, extra: { altaMeses: 5 } },
  { nombre: 'Alejandro', ap1: 'Morales', ap2: 'Soto', sexo: H, perfil: 'regular', teoria: 'p43', ingles: true, extra: { altaMeses: 5 } },
  { nombre: 'Noelia', ap1: 'Suárez', ap2: 'Cruz', sexo: F, perfil: 'regular', fisica: B, extra: { altaMeses: 5 } },
  { nombre: 'David', ap1: 'Delgado', ap2: 'Marín', sexo: H, perfil: 'regular', teoria: 'p43', fisica: O, extra: { altaMeses: 5 } },
  { nombre: 'Patricia', ap1: 'Castro', ap2: 'Mena', sexo: F, perfil: 'regular', teoria: 'tarde', fisica: K, extra: { altaMeses: 5 } },
  // Irregulares (25-32): empezaron hace tres meses
  { nombre: 'Jorge', ap1: 'Ortiz', ap2: 'Lozano', sexo: H, perfil: 'irregular', teoria: 'p43', fisica: D, extra: { altaMeses: 3 } },
  { nombre: 'Alba', ap1: 'Rubio', ap2: 'Cabrera', sexo: F, perfil: 'irregular', teoria: 'p43', fisica: S, extra: { altaMeses: 3 } },
  { nombre: 'Marcos', ap1: 'Fernández', ap2: 'Gallego', sexo: H, perfil: 'irregular', teoria: 'tarde', fisica: M, extra: { altaMeses: 3 } },
  { nombre: 'Daniel', ap1: 'Ortega', ap2: 'Vidal', sexo: H, perfil: 'irregular', teoria: 'p43', fisica: A, extra: { altaMeses: 3, propia: { eur: 75, nota: 'Hermano de Lucía Ortega: 50 % de descuento' } } },
  { nombre: 'Raúl', ap1: 'Núñez', ap2: 'Ferrer', sexo: H, perfil: 'irregular', teoria: 'p43', fisica: Z, extra: { altaMeses: 3, propia: { eur: 90, nota: 'Beca de la academia' } } },
  { nombre: 'Inés', ap1: 'Garrido', ap2: 'Pérez', sexo: F, perfil: 'irregular', teoria: 'p43', fisica: B, extra: { altaMeses: 3, exento: true, nota: 'Hija de una colaboradora de la academia' } },
  { nombre: 'Víctor', ap1: 'Medina', ap2: 'Ríos', sexo: H, perfil: 'irregular', fisica: M, extra: { altaMeses: 3, exento: true, nota: 'Colaborador de la academia' } },
  { nombre: 'Rocío', ap1: 'Cortés', ap2: 'Aguilar', sexo: F, perfil: 'irregular', teoria: 'tarde', fisica: K, extra: { altaMeses: 3 } },
  // Los que llevan más de 14 días sin entrar (33-36)
  { nombre: 'Nicolás', ap1: 'Santos', ap2: 'Vega', sexo: H, perfil: 'abandonado', teoria: 'p43', fisica: A, extra: { altaMeses: 5, ultimaActividadDias: 16 } },
  { nombre: 'Beatriz', ap1: 'Parra', ap2: 'Luna', sexo: F, perfil: 'abandonado', teoria: 'p43', fisica: S, extra: { altaMeses: 5, ultimaActividadDias: 22 } },
  { nombre: 'Andrés', ap1: 'Cuesta', ap2: 'Roca', sexo: H, perfil: 'abandonado', teoria: 'tarde', extra: { altaMeses: 5, ultimaActividadDias: 29 } },
  { nombre: 'Natalia', ap1: 'Herrera', ap2: 'Bosch', sexo: F, perfil: 'abandonado', teoria: 'p43', fisica: B, extra: { altaMeses: 5, ultimaActividadDias: 38 } },
  // Los que nunca han entrado (37-39): se apuntaron este mes
  { nombre: 'Gonzalo', ap1: 'Pascual', ap2: 'Mas', sexo: H, perfil: 'nunca', teoria: 'tarde', fisica: O, extra: { altaMeses: 0 } },
  { nombre: 'Antonio', ap1: 'Lara', ap2: 'Quintero', sexo: H, perfil: 'nunca', teoria: 'p43', extra: { altaMeses: 0 } },
  { nombre: 'Paula', ap1: 'Rojas', ap2: 'Ferrer', sexo: F, perfil: 'nunca', teoria: 'p43', fisica: K, extra: { altaMeses: 0 } },
  // Suspendidos (40-41): dejaron de pagar
  { nombre: 'Mario', ap1: 'Vera', ap2: 'Colomer', sexo: H, perfil: 'abandonado', teoria: 'p43', fisica: Z, extra: { altaMeses: 5, acceso: 'suspended', ultimaActividadDias: 26, nota: 'Suspendido por impago' } },
  { nombre: 'Silvia', ap1: 'Campos', ap2: 'Blasco', sexo: F, perfil: 'abandonado', teoria: 'p43', fisica: S, extra: { altaMeses: 5, acceso: 'suspended', ultimaActividadDias: 44, nota: 'Suspendida por impago' } },
  // Solicitudes pendientes de aceptar (42-44)
  { nombre: 'Samuel', ap1: 'Navas', ap2: 'Roig', sexo: H, perfil: 'pendiente', extra: { acceso: 'pending', altaMeses: 0, nota: 'Se ha registrado desde la web' } },
  { nombre: 'Eva', ap1: 'Marín', ap2: 'Barrios', sexo: F, perfil: 'pendiente', extra: { acceso: 'pending', altaMeses: 0, nota: 'Se ha registrado desde la web' } },
  { nombre: 'Tomás', ap1: 'Bernal', ap2: 'Soria', sexo: H, perfil: 'pendiente', extra: { acceso: 'pending', altaMeses: 0, nota: 'Se ha registrado desde la web' } },
];

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Los alumnos de la demo: siempre los mismos, en el mismo orden. */
export function generaAlumnos(): AlumnoDemo[] {
  return ROSTER.map((f, i) => {
    const clave = `a${String(i).padStart(2, '0')}`;
    const nombre = [f.nombre, f.ap1, f.ap2].filter(Boolean).join(' ');
    const email = i === 0 ? EMAIL_ALUMNO_DEMO : `${[f.nombre, f.ap1, f.ap2].filter(Boolean).map(sinTildes).join('.')}@${DOMINIO_DEMO}`;
    const r = crea(`${clave}|nivel`);
    const nivel = i === 0 ? 0.72
      : f.perfil === 'intensivo' ? entreReal(r, 0.6, 0.95)
      : f.perfil === 'regular' ? entreReal(r, 0.35, 0.85)
      : f.perfil === 'irregular' ? entreReal(r, 0.2, 0.6)
      : entreReal(r, 0.2, 0.7);
    const e = f.extra ?? {};
    return {
      clave, email, nombre, sexo: f.sexo, perfil: f.perfil,
      acceso: e.acceso ?? 'active',
      teoria: f.teoria === 'p43' ? GRUPO_TEORIA_43 : f.teoria === 'tarde' ? GRUPO_TEORIA_TARDE : null,
      fisica: f.fisica ?? null,
      ingles: f.ingles === true,
      exento: e.exento === true,
      propia: e.propia ?? null,
      altaMeses: e.altaMeses ?? 5,
      ultimaActividadDias: e.ultimaActividadDias ?? null,
      nivel: Math.round(nivel * 1000) / 1000,
      entreno: e.entreno === true,
      conRm: e.conRm === true,
      nota: e.nota ?? null,
    };
  });
}

/** ¿Tiene respuestas inventadas? (los que nunca han entrado y los que esperan plaza, no). */
export const tieneRespuestas = (a: AlumnoDemo): boolean => RITMO[a.perfil] !== null;

/** Los alumnos que deben (`memberships.payment_status = 'debe'`): lo cuentan los cobros de abajo. */
export const DEUDORES_DEMO = ['a26', 'a33', 'a40', 'a41'] as const;

/** Los nombres de los grupos a los que pertenece. */
export const gruposDe = (a: AlumnoDemo): string[] => [a.teoria, a.fisica, a.ingles ? GRUPO_INGLES : null].filter((x): x is string => !!x);

// ============================================================
// RESPUESTAS (question_attempts)
// ============================================================

/** Una pregunta del banco (las respuestas de la demo se apoyan en preguntas que YA existen). */
export type PreguntaPool = { id: string; subjectId: number; correctIndex: number };
export type TemaPool = { subjectId: number; titulo: string };
export type IndicePool = { temas: TemaPool[]; porTema: Map<number, PreguntaPool[]>; todas: PreguntaPool[] };

/** Ordena el banco por id (lo que llega de la base de datos no garantiza orden) y lo agrupa por tema. */
export function indexaPool(pool: PreguntaPool[], temas: TemaPool[]): IndicePool {
  const todas = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const porTema = new Map<number, PreguntaPool[]>();
  for (const q of todas) porTema.set(q.subjectId, [...(porTema.get(q.subjectId) ?? []), q]);
  return { temas: temas.filter((t) => (porTema.get(t.subjectId)?.length ?? 0) > 0), porTema, todas };
}

/** Una fila de `question_attempts` sin el `user_id`. */
export type IntentoDemo = {
  id: string;
  question_id: string;
  topic: string;
  is_correct: boolean;
  selected_index: number;
  error_type: string | null;
  response_time_ms: number;
  option_changes: number;
  confidence: number | null;
  first_touch_ms: number | null;
  answer_path: number[] | null;
  exam_id: string | null;
  created_at: string;
};

type ParamsRitmo = { dias: number; preguntas: [number, number]; acierto: [number, number]; blanco: number; semanas: number; avance: number };
const RITMO: Record<PerfilDemo, ParamsRitmo | null> = {
  intensivo: { dias: 0.72, preguntas: [8, 14], acierto: [0.72, 0.9], blanco: 0.03, semanas: 8, avance: 36 },
  regular: { dias: 0.5, preguntas: [6, 12], acierto: [0.55, 0.78], blanco: 0.05, semanas: 7, avance: 24 },
  irregular: { dias: 0.22, preguntas: [5, 10], acierto: [0.42, 0.62], blanco: 0.08, semanas: 7, avance: 12 },
  abandonado: { dias: 0.45, preguntas: [6, 12], acierto: [0.45, 0.68], blanco: 0.07, semanas: 5, avance: 16 },
  nunca: null,
  pendiente: null,
};

/** Cuánto más difícil o fácil es un tema (para todos igual: salen «los temas más flojos» de la academia). */
const DIFICULTADES = new Map<number, number>();
const dificultadTema = (subjectId: number): number => {
  let d = DIFICULTADES.get(subjectId);
  if (d === undefined) { d = (crea(`tema|${subjectId}`)() - 0.55) * 0.26; DIFICULTADES.set(subjectId, d); }
  return d;
};

/** La hora del día a la que estudia cada uno (en minutos desde medianoche). */
const HORAS_HABITUALES = [7 * 60 + 30, 12 * 60 + 15, 17 * 60, 21 * 60 + 30];

/**
 * Las respuestas de entrenamiento de un alumno: de hace unas semanas hasta
 * hoy (o hasta que dejó de venir). Ritmos y aciertos distintos, algunos
 * blancos (`selected_index = -1`) y alguna dudosa (`confidence = 1`).
 */
export function generaRespuestas(a: AlumnoDemo, c: Cuando, idx: IndicePool): IntentoDemo[] {
  const p = RITMO[a.perfil];
  if (!p || idx.temas.length === 0) return [];
  const fin = a.ultimaActividadDias ?? 0;
  const dias = p.semanas * 7;
  const base = p.acierto[0] + a.nivel * (p.acierto[1] - p.acierto[0]);
  const msBase = Math.round(22000 - a.nivel * 11000);
  const hora = HORAS_HABITUALES[hash32(`${a.clave}|hora`) % HORAS_HABITUALES.length];
  const out: IntentoDemo[] = [];
  const flojos = new Map<number, number>();
  let n = 0;

  for (let atras = fin + dias; atras >= fin; atras--) {
    const rd = crea(`${a.clave}|d|${atras}`);
    // Los de ritmo alto no faltan en los últimos días: tienen racha.
    const estudia = (a.perfil === 'intensivo' && atras - fin <= 3) || prob(rd, p.dias);
    if (!estudia) continue;
    const fecha = sumaDias(c.hoy, -atras);
    const cuantas = entre(rd, p.preguntas[0], p.preguntas[1]);
    let seg = (hora + entre(rd, -40, 40)) * 60;
    const avanceDia = 1 - (atras - fin) / dias; // 0 al empezar, 1 al acabar
    const desbloqueados = Math.max(3, Math.round(3 + (Math.min(p.avance, idx.temas.length) - 3) * avanceDia));

    for (let i = 0; i < cuantas; i++) {
      const r = crea(`${a.clave}|q|${atras}|${i}`);
      // Un tema reciente casi siempre; de vez en cuando, repaso de uno anterior.
      const tope = Math.min(desbloqueados, idx.temas.length);
      const pos = prob(r, 0.65) ? Math.max(0, tope - 1 - Math.floor(r() * Math.min(6, tope))) : Math.floor(r() * tope);
      const tema = idx.temas[pos];
      const banco = idx.porTema.get(tema.subjectId) ?? idx.todas;
      const q = banco[Math.floor(r() * banco.length)];

      let flojo = flojos.get(tema.subjectId);
      if (flojo === undefined) { flojo = (crea(`${a.clave}|t|${tema.subjectId}`)() - 0.5) * 0.16; flojos.set(tema.subjectId, flojo); }
      const pAcierto = acota(base + 0.1 * avanceDia + dificultadTema(tema.subjectId) + flojo, 0.12, 0.97);
      const blanco = prob(r, p.blanco * (pAcierto < 0.55 ? 1.8 : 0.8));
      const acierta = !blanco && prob(r, pAcierto);
      const rt = Math.round(acota(msBase * Math.exp(gauss(r) * 0.45) * (acierta ? 1 : 1.25), 2500, 90000));

      let elegida: number;
      let camino: number[] | null;
      let cambios = 0;
      let toque: number | null;
      let confianza: number | null;
      let error: string | null = null;

      if (blanco) {
        elegida = -1;
        const porCalculo = prob(r, 0.3);
        camino = porCalculo ? [Math.floor(r() * 3)] : null;
        toque = porCalculo ? Math.round(rt * entreReal(r, 0.3, 0.7)) : null;
        confianza = prob(r, 0.25) ? 1 : null;
      } else {
        const falla = [0, 1, 2].filter((x) => x !== q.correctIndex);
        elegida = acierta ? q.correctIndex : elige(r, falla);
        const dudosa = prob(r, acierta ? 0.1 : 0.38);
        confianza = dudosa ? 1 : 2;
        cambios = prob(r, dudosa || !acierta ? 0.35 : 0.1) ? entre(r, 1, 2) : 0;
        const previo: number[] = [];
        for (let k = 0; k < cambios; k++) previo.push(elige(r, [0, 1, 2].filter((x) => x !== (previo[k - 1] ?? -1) && x !== elegida)));
        camino = [...previo, elegida];
        toque = Math.round(rt * entreReal(r, 0.35, 0.85));
        if (!acierta && prob(r, 0.5)) error = elige(r, ['desconocimiento', 'desconocimiento', 'olvido', 'trampa', 'fallo_procesamiento']);
      }
      if (error && !(ERROR_TYPES as readonly string[]).includes(error)) error = null;

      const t = instante(fecha, Math.round(seg));
      seg += rt / 1000 + entre(r, 2, 6);
      if (Date.parse(t) > c.ahoraMs) continue;
      out.push({
        id: uuidDemo('intento', a.clave, String(n++)),
        question_id: q.id,
        topic: tema.titulo,
        is_correct: acierta,
        selected_index: elegida,
        error_type: error,
        response_time_ms: rt,
        option_changes: cambios,
        confidence: confianza,
        first_touch_ms: toque,
        answer_path: camino,
        exam_id: null,
        created_at: t,
      });
    }
  }
  return out;
}

/** Cuántos simulacros (de `PREGUNTAS_SIMULACRO` preguntas) hace cada uno y hace cuántos días. */
export const PREGUNTAS_SIMULACRO = 40;
function simulacrosDe(a: AlumnoDemo): number[] {
  if (a.perfil === 'intensivo') return [29, 7];
  if (a.perfil === 'regular' && Number(a.clave.slice(1)) <= 12) return [14];
  return [];
}

/** Los simulacros (varias respuestas con el mismo `exam_id`, sin adaptar nada: regla 59). */
export function generaSimulacros(a: AlumnoDemo, c: Cuando, idx: IndicePool): IntentoDemo[] {
  const p = RITMO[a.perfil];
  if (!p || idx.todas.length === 0) return [];
  const out: IntentoDemo[] = [];
  simulacrosDe(a).forEach((atras, s) => {
    const examId = uuidDemo('simulacro', a.clave, String(s));
    const fecha = sumaDias(c.hoy, -atras);
    let seg = 10 * 3600 + 30 * 60;
    for (let i = 0; i < PREGUNTAS_SIMULACRO; i++) {
      const r = crea(`${a.clave}|sim|${s}|${i}`);
      const q = idx.todas[Math.floor(r() * idx.todas.length)];
      const tema = idx.temas.find((t) => t.subjectId === q.subjectId) ?? idx.temas[0];
      const pAcierto = acota(p.acierto[0] + a.nivel * (p.acierto[1] - p.acierto[0]) - 0.06 + dificultadTema(q.subjectId), 0.15, 0.95);
      const blanco = prob(r, 0.09);
      const acierta = !blanco && prob(r, pAcierto);
      const rt = Math.round(acota(55000 * Math.exp(gauss(r) * 0.35), 15000, 140000));
      const elegida = blanco ? -1 : acierta ? q.correctIndex : elige(r, [0, 1, 2].filter((x) => x !== q.correctIndex));
      const dudosa = !blanco && prob(r, acierta ? 0.12 : 0.4);
      out.push({
        id: uuidDemo('intento', a.clave, `sim${s}`, String(i)),
        question_id: q.id,
        topic: tema.titulo,
        is_correct: acierta,
        selected_index: elegida,
        error_type: null,
        response_time_ms: rt,
        option_changes: blanco ? 0 : prob(r, 0.2) ? 1 : 0,
        confidence: blanco ? null : dudosa ? 1 : 2,
        first_touch_ms: blanco ? null : Math.round(rt * entreReal(r, 0.4, 0.8)),
        answer_path: blanco ? null : [elegida],
        exam_id: examId,
        created_at: instante(fecha, Math.round(seg)),
      });
      seg += rt / 1000;
    }
  });
  return out;
}

// ============================================================
// FÍSICO: PERFIL, MARCAS DE LAS PRUEBAS OFICIALES Y 1RM
// ============================================================

export type PerfilFisicoDemo = { gender: Sexo; birth_year: number };

export function perfilFisico(a: AlumnoDemo, c: Cuando): PerfilFisicoDemo {
  const anio = Number(c.hoy.slice(0, 4));
  return { gender: a.sexo, birth_year: anio - entre(crea(`${a.clave}|edad`), 19, 31) };
}

export type PruebaDemo = 'agilidad' | 'dominadas' | 'suspension' | 'carrera_1000';
export type MarcaDemo = { id: string; test: PruebaDemo; value: number; measured_on: string; note: string | null; apuntadaPor: 'alumno' | 'preparador' };

const redondea1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Las marcas de las pruebas oficiales (agilidad en segundos, dominadas o
 * suspensión según el sexo, 1.000 m en segundos): cada uno mejora con el
 * tiempo a su ritmo. Los que nunca han entrado o esperan plaza, ninguna.
 */
export function generaMarcas(a: AlumnoDemo, c: Cuando): MarcaDemo[] {
  if (a.perfil === 'nunca' || a.perfil === 'pendiente') return [];
  const veces = a.perfil === 'intensivo' ? 4 : a.perfil === 'regular' ? 3 : a.perfil === 'irregular' ? 2 : 1;
  const fin = a.ultimaActividadDias ?? 0;
  const pruebas: PruebaDemo[] = ['agilidad', a.sexo === 'male' ? 'dominadas' : 'suspension', 'carrera_1000'];
  const out: MarcaDemo[] = [];
  for (const test of pruebas) {
    for (let v = 0; v < veces; v++) {
      const r = crea(`${a.clave}|marca|${test}|${v}`);
      // De la primera a la última medición mejora hasta un 14 %.
      const progreso = veces === 1 ? 1 : v / (veces - 1);
      const n = acota(a.nivel + 0.14 * progreso - 0.07 + (r() - 0.5) * 0.1, 0, 1);
      const value =
        test === 'agilidad' ? redondea1((a.sexo === 'male' ? 12.2 : 13.1) - n * 3.7)
        : test === 'dominadas' ? Math.max(0, Math.round(3 + n * 14))
        : test === 'suspension' ? Math.max(5, Math.round(22 + n * 68))
        : Math.round(332 - n * 112);
      // La última, hace unos días; las anteriores, cada tres semanas hacia atrás.
      const atras = fin + (veces - 1 - v) * 21 + entre(r, 1, 4);
      out.push({
        id: uuidDemo('marca', a.clave, test, String(v)),
        test,
        value,
        measured_on: sumaDias(c.hoy, -atras),
        note: v === veces - 1 && prob(r, 0.2) ? 'Mejor marca hasta hoy' : null,
        apuntadaPor: prob(r, 0.6) ? 'preparador' : 'alumno',
      });
    }
  }
  return out;
}

export type RmDemo = { id: string; exercise: string; weight_kg: number; reps: number; measured_on: string; note: string | null };

const EJERCICIOS_RM: { nombre: string; h: [number, number]; m: [number, number] }[] = [
  { nombre: 'Press de banca', h: [50, 60], m: [22, 25] },
  { nombre: 'Sentadilla', h: [70, 70], m: [40, 35] },
  { nombre: 'Peso muerto', h: [90, 80], m: [50, 40] },
  { nombre: 'Press militar', h: [35, 30], m: [17, 15] },
];

const aSerie = (kg: number) => Math.max(2.5, Math.round(kg / 2.5) * 2.5);

/** Los ejercicios con 1RM de un alumno (los usan también las cargas de su entreno). */
export function ejerciciosRm(a: AlumnoDemo): string[] {
  if (!a.conRm) return [];
  const desde = hash32(`${a.clave}|rm`) % EJERCICIOS_RM.length;
  return [0, 1, 2].map((i) => EJERCICIOS_RM[(desde + i) % EJERCICIOS_RM.length].nombre);
}

/** Dos mediciones de cada ejercicio (la segunda, mejor): pesos serios, pero de una persona normal. */
export function generaRm(a: AlumnoDemo, c: Cuando): RmDemo[] {
  const out: RmDemo[] = [];
  for (const nombre of ejerciciosRm(a)) {
    const e = EJERCICIOS_RM.find((x) => x.nombre === nombre)!;
    const [b0, k] = a.sexo === 'male' ? e.h : e.m;
    const r = crea(`${a.clave}|rm|${nombre}`);
    const rm1 = b0 + a.nivel * k;
    [0, 1].forEach((v) => {
      const reps = v === 0 ? entre(r, 3, 6) : entre(r, 1, 5);
      const peso = aSerie(rm1 * (v === 0 ? 0.9 : 1) * (1 - 0.03 * (reps - 1)));
      out.push({
        id: uuidDemo('rm', a.clave, nombre, String(v)),
        exercise: nombre,
        weight_kg: peso,
        reps,
        measured_on: sumaDias(c.hoy, v === 0 ? -(45 + entre(r, 0, 6)) : -(8 + entre(r, 0, 6))),
        note: v === 1 && prob(r, 0.3) ? 'Con buena técnica' : null,
      });
    });
  }
  return out;
}

// ============================================================
// ENTRENO INDIVIDUAL (training_sessions con user_id) Y SU REGISTRO
// ============================================================

export type CargaDemo = { ejercicio: string; porcentaje: number; series: number | null; reps: number | null };

export type SesionAlumnoDemo = {
  id: string;
  session_date: string;
  kind: TipoSesion;
  title: string;
  description: string | null;
  duration_min: number | null;
  distance_km: number | null;
  video: string | null;
  position: number;
  loads: CargaDemo[] | null;
};

export type RegistroDemo = {
  sessionId: string;
  status: 'hecha' | 'no_hecha';
  rpe: number | null;
  comment: string | null;
  duration_min: number | null;
  distance_km: number | null;
  coach_reply: string | null;
  /** El día (≤ hoy) en que contestó el preparador, si lo hizo. */
  respuestaEl: string | null;
};

export type NotaSemanaDemo = { id: string; week_start: string; note: string };

const COMENTARIOS_HECHA = ['Buenas sensaciones', 'Se me hizo largo el final', 'Me noté con fuerza', 'Con algo de sueño pero lo saqué', 'Mejor que la semana pasada', 'Un poco pesado de piernas', null, null, null];
const RESPUESTAS_PREPARADOR = ['Muy bien, sigue así.', 'Baja un poco el ritmo en las series largas.', 'Buen trabajo. Descansa bien esta noche.', 'Apunta la carga cuando puedas.', 'Perfecto, esta semana subimos un poco.'];

const SEMANA_TIPO: { dia: number; kind: TipoSesion; titulos: string[]; min: number; km?: [number, number]; desc: string[] }[] = [
  { dia: 1, kind: 'fuerza', titulos: ['Fuerza: tren superior', 'Fuerza: empuje y tracción'], min: 60, desc: ['Calentamiento 10′ · bloque principal con cargas del 1RM · R 2′ entre series · estiramientos', 'Press y remo en superserie · R 1′30″ · acabar con core 3 × 12'] },
  { dia: 2, kind: 'carrera', titulos: ['Series: 6 × 400 m', 'Series: 5 × 600 m', 'Fartlek 40′'], min: 55, km: [6, 8], desc: ['15′ calentamiento · series a ritmo de 1.000 m · R 1′30″ · 10′ suave', '10′ suave · series con trote de recuperación · 10′ para volver a la calma'] },
  { dia: 3, kind: 'agilidad', titulos: ['Circuito de agilidad', 'Circuito de agilidad: técnica'], min: 50, desc: ['Circuito oficial al 70 % · 6 vueltas · R 2′ · apoyos, giros y vallas', 'Solo técnica: salidas, giros y la última valla'] },
  { dia: 4, kind: 'fuerza', titulos: ['Fuerza: tren inferior', 'Fuerza: pierna y core'], min: 60, desc: ['Sentadilla y peso muerto con carga del 1RM · R 2′30″ · core al final', 'Prensa, zancadas y peso muerto rumano · R 2′'] },
  { dia: 5, kind: 'carrera', titulos: ['Rodaje suave 30′', 'Rodaje suave 35′ + progresivos'], min: 35, km: [5, 6], desc: ['30′ a ritmo cómodo + 4 progresivos', '35′ cómodo y 4 rectas de 80 m al final'] },
  { dia: 6, kind: 'otro', titulos: ['Simulacro de las tres pruebas', 'Dominadas y 1.000 m'], min: 75, desc: ['Agilidad (2 intentos) · R 10′ · dominadas o suspensión · R 10′ · 1.000 m', 'Series de dominadas + 1.000 m a ritmo de examen'] },
  { dia: 7, kind: 'descanso', titulos: ['Descanso'], min: 0, desc: ['Descanso. Camina 20′ y estira si lo necesitas.'] },
];

/**
 * El entreno individual de un alumno: de tres semanas antes a la semana que
 * viene, un día tras otro. Los de fuerza llevan cargas en % de SU 1RM (el
 * alumno las ve en kilos: regla 89). Lo que ya pasó lo apuntó, casi todo.
 */
export function generaEntreno(a: AlumnoDemo, c: Cuando): { sesiones: SesionAlumnoDemo[]; registros: RegistroDemo[]; notas: NotaSemanaDemo[] } {
  if (!a.entreno) return { sesiones: [], registros: [], notas: [] };
  const ejercicios = ejerciciosRm(a);
  const desde = sumaDias(c.lunes, -21);
  const sesiones: SesionAlumnoDemo[] = [];
  const registros: RegistroDemo[] = [];
  const notas: NotaSemanaDemo[] = [];

  for (let i = 0; i < 35; i++) {
    const fecha = sumaDias(desde, i);
    const tipo = SEMANA_TIPO[diaSemanaDe(fecha) - 1];
    const r = crea(`${a.clave}|entreno|${i}`);
    const titulo = elige(r, tipo.titulos);
    const id = uuidDemo('sesion', a.clave, String(i));
    const cargas: CargaDemo[] | null = tipo.kind === 'fuerza' && ejercicios.length
      ? ejercicios.slice(0, 2 + (i % 2)).map((ej, k) => ({ ejercicio: ej, porcentaje: 65 + 5 * ((i + k) % 4), series: 3 + (k % 2), reps: 5 + 2 * (k % 2) }))
      : null;
    sesiones.push({
      id,
      session_date: fecha,
      kind: tipo.kind,
      title: titulo,
      description: elige(r, tipo.desc),
      duration_min: tipo.min || null,
      distance_km: tipo.km ? redondea1(entreReal(r, tipo.km[0], tipo.km[1])) : null,
      video: null,
      position: 0,
      loads: cargas,
    });

    if (fecha > c.hoy || tipo.kind === 'descanso') continue;
    // Lo de hoy aún no se ha hecho; lo de ayer para atrás, casi siempre sí.
    if (fecha === c.hoy) continue;
    const hecha = prob(r, 0.86);
    const reply = prob(r, 0.3) ? elige(r, RESPUESTAS_PREPARADOR) : null;
    registros.push({
      sessionId: id,
      status: hecha ? 'hecha' : 'no_hecha',
      rpe: hecha ? entre(r, 5, 9) : null,
      comment: hecha ? elige(r, COMENTARIOS_HECHA) : prob(r, 0.6) ? 'No pude: trabajo hasta tarde' : null,
      duration_min: hecha && tipo.min ? tipo.min + entre(r, -8, 10) : null,
      distance_km: hecha && tipo.km ? redondea1(entreReal(r, tipo.km[0], tipo.km[1])) : null,
      coach_reply: hecha ? reply : null,
      respuestaEl: hecha && reply ? (sumaDias(fecha, 1) <= c.hoy ? sumaDias(fecha, 1) : fecha) : null,
    });
  }
  // Una nota para la semana pasada y otra para la actual.
  const NOTAS: [number, string, string][] = [
    [-7, 'pasada', 'Semana de carga: sube el volumen de carrera sin pasarte. Si te duele algo, avísame.'],
    [0, 'actual', 'Semana de afinar: más calidad que cantidad. El sábado, simulacro de las tres pruebas.'],
  ];
  for (const [desplazamiento, cual, texto] of NOTAS) {
    notas.push({ id: uuidDemo('nota-semana', a.clave, cual), week_start: sumaDias(c.lunes, desplazamiento), note: texto });
  }
  return { sesiones, registros, notas };
}

/** Las dos plantillas de sesión de la biblioteca. */
export const PLANTILLAS_DEMO: { clave: string; kind: TipoSesion; title: string; description: string; duration_min: number; distance_km: number | null }[] = [
  { clave: 'p1', kind: 'carrera', title: 'Series: 8 × 300 m', description: '15′ calentamiento\n8 × 300 m a ritmo de agilidad · R 1′\n10′ suave', duration_min: 50, distance_km: 6 },
  { clave: 'p2', kind: 'fuerza', title: 'Circuito de fuerza: cuerpo entero', description: 'Dominadas o suspensión · flexiones · sentadilla con salto · core\n4 vueltas · R 2′ entre vueltas', duration_min: 55, distance_km: null },
];

// ============================================================
// EL CUADRANTE DE FÍSICA
// ============================================================

/** Un grupo, tal y como lo necesita el cuadrante. */
export type GrupoRef = { nombre: string; weekdays: number[] | null; inicio: string | null; fin: string | null; esMulti: boolean };
export type HabitualRef = { actividad: string; profesor: string; prioridad: number };
/** Una clase que ya existe en la academia: ocupa a su profesor a esa hora. */
export type OcupadoRef = { fecha: string; inicio: string | null; profesor: string };

export const TITULOS_CUADRANTE = ['Boxeo', 'FLK 5.0', 'FLK 5.1', 'F.M + RDL', 'Jiujitsu'] as const;
/** Duración de una clase de física a efectos de choques (la de `cuadrante.ts`). */
const DURACION_CLASE_MIN = 60;

export type SesionGrupoDemo = {
  id: string;
  grupo: string;
  fecha: string;
  titulo: string;
  kind: TipoSesion;
  profesor: string | null;
  horaPropia: string | null;
};
export type FestivoDemo = { grupo: string; fecha: string; motivo: string };

export type PlanCuadrante = {
  sesiones: SesionGrupoDemo[];
  festivos: FestivoDemo[];
  /** Los lunes de las semanas que se publican (desde tres semanas antes hasta la actual). */
  semanasPublicadas: string[];
  /** La semana siguiente: con sesiones, pero en borrador. */
  semanaBorrador: string;
  /** El grupo al que se deja sin planificar la semana que viene. */
  sinPlanificar: { grupo: string; semana: string };
};

/**
 * Las clases de física de tres semanas antes a la semana que viene: para cada
 * grupo con horario y cada día de clase, un título del cuadrante (en
 * rotación) y el profesor habitual de esa clase que esté libre a esa hora.
 * Kappa se queda sin planificar la semana que viene, hay un festivo y Multi
 * tiene sesiones sueltas martes y jueves a las 18:30.
 *
 * Esto PROPONE: quien carga se salta lo que ya exista (regla 106).
 */
export function generaCuadrante(p: {
  c: Cuando;
  /** Los grupos de física, en su orden de alta (el del cuadrante). */
  grupos: GrupoRef[];
  habituales: HabitualRef[];
  /** Los profesores activos, por nombre. */
  profesores: string[];
  ocupados: OcupadoRef[];
}): PlanCuadrante {
  const { c } = p;
  const desde = sumaDias(c.lunes, -21);
  const hasta = sumaDias(c.lunes, 13);
  const semanaQueViene = sumaDias(c.lunes, 7);
  const activos = new Set(p.profesores);
  const habituales = agrupaHabituales(p.habituales.map((h) => ({ actividad: h.actividad, profesorId: h.profesor, prioridad: h.prioridad })));

  const conClase = p.grupos.filter((g) => !g.esMulti && g.weekdays?.length && g.inicio);
  const multi = p.grupos.find((g) => g.esMulti) ?? null;
  const kappa = conClase.find((g) => g.nombre.endsWith('Kappa')) ?? null;

  // El festivo: el miércoles de la semana pasada (publicada, a la vista).
  const fechaFestivo = sumaDias(c.lunes, -5);
  const festivos: FestivoDemo[] = conClase
    .filter((g) => g.weekdays!.includes(diaSemanaDe(fechaFestivo)))
    .map((g) => ({ grupo: g.nombre, fecha: fechaFestivo, motivo: 'Festivo local · la academia cierra' }));
  const esFestivo = new Set(festivos.map((f) => `${f.grupo}|${f.fecha}`));

  // Quién está ocupado a qué hora: lo que ya existe y lo que se va asignando.
  const reservas = new Map<string, { ini: number; profesor: string }[]>();
  const reserva = (fecha: string, inicio: string | null, profesor: string) => {
    const ini = minutosDeHora(inicio);
    if (ini === null) return;
    reservas.set(fecha, [...(reservas.get(fecha) ?? []), { ini, profesor }]);
  };
  const ocupadosA = (fecha: string, inicio: string | null): Set<string> => {
    const ini = minutosDeHora(inicio);
    const s = new Set<string>();
    if (ini === null) return s;
    for (const x of reservas.get(fecha) ?? []) if (ini < x.ini + DURACION_CLASE_MIN && x.ini < ini + DURACION_CLASE_MIN) s.add(x.profesor);
    return s;
  };
  for (const o of p.ocupados) reserva(o.fecha, o.inicio, o.profesor);

  const sesiones: SesionGrupoDemo[] = [];
  const pon = (g: GrupoRef, fecha: string, indice: number, horaPropia: string | null) => {
    const inicio = horaPropia ?? g.inicio;
    const arranque = (hash32(fecha) + indice * 2) % TITULOS_CUADRANTE.length;
    let elegido: { titulo: string; profesor: string | null } | null = null;
    for (let j = 0; j < TITULOS_CUADRANTE.length && !elegido; j++) {
      const titulo = TITULOS_CUADRANTE[(arranque + j) % TITULOS_CUADRANTE.length];
      const sug = profesorSugerido({ titulo, habituales, ocupados: ocupadosA(fecha, inicio), activos });
      if (sug && !ocupadosA(fecha, inicio).has(sug.profesorId)) elegido = { titulo, profesor: sug.profesorId };
    }
    // Si todos los habituales están ocupados, se deja el primer título sin profesor
    // (el imprevisto se pone a mano) en vez de duplicar a nadie.
    const final = elegido ?? { titulo: TITULOS_CUADRANTE[arranque], profesor: null };
    if (final.profesor) reserva(fecha, inicio, final.profesor);
    sesiones.push({
      id: uuidDemo('clase', g.nombre, fecha),
      grupo: g.nombre,
      fecha,
      titulo: final.titulo,
      kind: tipoDeTitulo(final.titulo),
      profesor: final.profesor,
      horaPropia,
    });
  };

  for (let fecha = desde; fecha <= hasta; fecha = sumaDias(fecha, 1)) {
    const dia = diaSemanaDe(fecha);
    conClase.forEach((g, i) => {
      if (!g.weekdays!.includes(dia) || esFestivo.has(`${g.nombre}|${fecha}`)) return;
      if (kappa && g.nombre === kappa.nombre && lunesDe(fecha) === semanaQueViene) return;
      pon(g, fecha, i, null);
    });
    // Multi: sueltas martes y jueves a las 18:30 (su hora propia).
    if (multi && (dia === 2 || dia === 4)) pon(multi, fecha, conClase.length, '18:30');
  }

  const semanasPublicadas = [0, 1, 2, 3].map((i) => sumaDias(c.lunes, -7 * (3 - i)));
  return { sesiones, festivos, semanasPublicadas, semanaBorrador: semanaQueViene, sinPlanificar: { grupo: kappa?.nombre ?? GRUPO_KAPPA, semana: semanaQueViene } };
}

// ============================================================
// ASISTENCIA: FALTAS AVISADAS Y MULTIS APUNTADOS
// ============================================================

export type FaltaDemo = { alumno: string; grupo: string; fecha: string };
export type UnionMultiDemo = { alumno: string; grupo: string; fecha: string };

/** Los días de clase de un grupo entre dos fechas, sin sus festivos. */
function diasDeClase(g: { weekdays: number[] | null }, desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta; f = sumaDias(f, 1)) if (g.weekdays?.includes(diaSemanaDe(f))) out.push(f);
  return out;
}

/**
 * Las faltas que los alumnos han avisado (algunas ya pasadas, otras de los
 * próximos días: así «Asistencia» tiene huecos que enseñar) y los multis que
 * se han apuntado a las clases de otros grupos.
 */
export function generaAsistencia(p: {
  c: Cuando;
  alumnos: AlumnoDemo[];
  /** Todos los grupos con horario (teoría y física). */
  grupos: GrupoRef[];
  festivos: FestivoDemo[];
  sinPlanificar: PlanCuadrante['sinPlanificar'];
}): { faltas: FaltaDemo[]; uniones: UnionMultiDemo[] } {
  const { c } = p;
  const porNombre = new Map(p.grupos.map((g) => [g.nombre, g]));
  const festivo = new Set(p.festivos.map((f) => `${f.grupo}|${f.fecha}`));
  const faltas: FaltaDemo[] = [];

  for (const a of p.alumnos) {
    if (a.acceso !== 'active' || a.perfil === 'nunca' || a.perfil === 'pendiente') continue;
    if (hash32(`${a.clave}|falta`) % 100 >= 28) continue;
    for (const nombre of [a.fisica, a.teoria]) {
      const g = nombre ? porNombre.get(nombre) : null;
      if (!g || g.esMulti || !g.weekdays?.length) continue;
      const r = crea(`${a.clave}|falta|${nombre}`);
      // Una ya pasada (historia) y una de los próximos días (para ver huecos).
      const pasadas = diasDeClase(g, sumaDias(c.hoy, -20), sumaDias(c.hoy, -1)).filter((f) => !festivo.has(`${g.nombre}|${f}`));
      const futuras = diasDeClase(g, c.hoy, sumaDias(c.hoy, 13)).filter((f) => !festivo.has(`${g.nombre}|${f}`) && !(g.nombre === p.sinPlanificar.grupo && lunesDe(f) === p.sinPlanificar.semana));
      if (pasadas.length && prob(r, 0.6)) faltas.push({ alumno: a.clave, grupo: g.nombre, fecha: elige(r, pasadas) });
      if (futuras.length) faltas.push({ alumno: a.clave, grupo: g.nombre, fecha: elige(r, futuras) });
    }
  }

  // Los multis: dos clases por semana a las que se apuntan, de dos semanas
  // antes a la que viene.
  const uniones: UnionMultiDemo[] = [];
  const destino = p.grupos.filter((g) => !g.esMulti && g.weekdays?.length && g.inicio && tipoDeGrupoDemo(g.nombre) === 'fisicas');
  for (const a of p.alumnos.filter((x) => x.fisica === GRUPO_MULTI && x.acceso === 'active')) {
    for (let semana = -2; semana <= 1; semana++) {
      const lunes = sumaDias(c.lunes, 7 * semana);
      const r = crea(`${a.clave}|multi|${semana}`);
      const hechos = new Set<string>();
      for (let k = 0; k < 2 && destino.length; k++) {
        const g = elige(r, destino);
        const dias = diasDeClase(g, lunes, sumaDias(lunes, 6)).filter((f) => !festivo.has(`${g.nombre}|${f}`) && !(g.nombre === p.sinPlanificar.grupo && semana === 1));
        if (!dias.length) continue;
        const fecha = elige(r, dias);
        const clave = `${g.nombre}|${fecha}`;
        if (hechos.has(clave)) continue;
        hechos.add(clave);
        uniones.push({ alumno: a.clave, grupo: g.nombre, fecha });
      }
    }
  }
  return { faltas, uniones };
}

// ============================================================
// COBROS
// ============================================================

export type MesDemo = { alumno: string; periodo: string; debido: number | null };
export type EventoCobroDemo =
  | { tipo: 'cobro'; ref: string; alumno: string; periodo: string; fecha: string; importe: number; metodo: 'efectivo' | 'bizum' | 'transferencia' }
  | { tipo: 'anula'; ref: string; alumno: string; periodo: string; fecha: string };

export type PlanCobros = {
  meses: MesDemo[];
  /** En orden cronológico: así los números de recibo siguen a las fechas. */
  eventos: EventoCobroDemo[];
  /** Cuota de cada alumno que tiene (la que sale de sus grupos). */
  cuotas: Map<string, number | null>;
  resumen: { actual: { previsto: number; cobrado: number } };
  /** Los alumnos con `memberships.payment_status = 'debe'`. */
  deudores: string[];
};

const METODOS: ('efectivo' | 'bizum' | 'transferencia')[] = ['efectivo', 'bizum', 'transferencia'];
const metodoDe = (clave: string): 'efectivo' | 'bizum' | 'transferencia' => {
  const x = hash32(`${clave}|metodo`) % 100;
  return x < 72 ? METODOS[0] : x < 90 ? METODOS[1] : METODOS[2];
};

/**
 * Las cuotas de los últimos cinco meses y del actual, con sus cobros.
 *
 * Casi todos al día; cuatro deben meses anteriores (dos de ellos, los
 * suspendidos); tres pagos a medias; un cobro anulado y vuelto a cobrar; y el
 * mes en curso, más o menos al 60 % cobrado. Sobre todo efectivo.
 */
export function generaCobros(p: { c: Cuando; alumnos: AlumnoDemo[]; tarifa: Tarifa }): PlanCobros {
  const { c } = p;
  const meses: MesDemo[] = [];
  const eventos: EventoCobroDemo[] = [];
  const cuotas = new Map<string, number | null>();
  const actual = c.periodo;
  const diaActual = Number(c.hoy.slice(8, 10));
  const clave = (n: number) => `a${String(n).padStart(2, '0')}`;

  // Los casos sueltos, por alumno (índice del roster).
  const DEBEN: Record<string, string[]> = {
    [clave(26)]: [sumaMeses(actual, -2)],
    [clave(33)]: [sumaMeses(actual, -2), sumaMeses(actual, -1)],
    [clave(40)]: [sumaMeses(actual, -2), sumaMeses(actual, -1)],
    [clave(41)]: [sumaMeses(actual, -1)],
  };
  if (Object.keys(DEBEN).join() !== DEUDORES_DEMO.join()) throw new Error('DEUDORES_DEMO no coincide con los que deben');
  const A_MEDIAS: Record<string, { periodo: string; fraccion: number }> = {
    [clave(12)]: { periodo: sumaMeses(actual, -1), fraccion: 0.66 },
    [clave(22)]: { periodo: sumaMeses(actual, -1), fraccion: 0.5 },
    [clave(5)]: { periodo: actual, fraccion: 0.55 },
  };
  const ANULADO = { alumno: clave(9), periodo: sumaMeses(actual, -2) };

  const fechaDe = (a: AlumnoDemo, periodo: string, k: number) => {
    const dia = 1 + (hash32(`${a.clave}|${periodo}|${k}|dia`) % 9);
    return `${periodo}-${String(periodo === actual ? Math.min(dia, diaActual) : dia).padStart(2, '0')}`;
  };

  const pagan: { a: AlumnoDemo; debido: number }[] = [];
  for (const a of p.alumnos) {
    if (a.exento || a.acceso === 'pending') continue;
    const cuota = cuotaDeAlumno({ tipos: gruposDe(a).map(tipoDeGrupoDemo), tarifa: p.tarifa, propia: a.propia?.eur ?? null, exento: false });
    cuotas.set(a.clave, cuota.importe);
    // Los suspendidos solo tienen meses hasta el que se les suspendió.
    const ultimo = a.acceso === 'suspended' ? sumaMeses(actual, -1) : actual;
    for (let m = a.altaMeses; m >= 0; m--) {
      const periodo = sumaMeses(actual, -m);
      if (periodo > ultimo) continue;
      meses.push({ alumno: a.clave, periodo, debido: cuota.importe });
    }
    if (cuota.importe !== null && a.acceso === 'active') pagan.push({ a, debido: cuota.importe });
  }

  // Los meses ya pasados.
  for (const m of meses) {
    const a = p.alumnos.find((x) => x.clave === m.alumno)!;
    if (m.periodo === actual || m.debido === null || m.debido <= 0) continue;
    if (DEBEN[a.clave]?.includes(m.periodo)) continue;
    const medias = A_MEDIAS[a.clave];
    if (medias && medias.periodo === m.periodo) {
      eventos.push({ tipo: 'cobro', ref: `${a.clave}|${m.periodo}|0`, alumno: a.clave, periodo: m.periodo, fecha: fechaDe(a, m.periodo, 0), importe: centimos(Math.floor((m.debido * medias.fraccion) / 5) * 5), metodo: 'efectivo' });
      continue;
    }
    if (a.clave === ANULADO.alumno && m.periodo === ANULADO.periodo) {
      const f = `${m.periodo}-03`;
      eventos.push({ tipo: 'cobro', ref: `${a.clave}|${m.periodo}|0`, alumno: a.clave, periodo: m.periodo, fecha: f, importe: m.debido, metodo: 'efectivo' });
      eventos.push({ tipo: 'anula', ref: `${a.clave}|${m.periodo}|0`, alumno: a.clave, periodo: m.periodo, fecha: `${m.periodo}-04` });
      eventos.push({ tipo: 'cobro', ref: `${a.clave}|${m.periodo}|1`, alumno: a.clave, periodo: m.periodo, fecha: `${m.periodo}-06`, importe: m.debido, metodo: 'bizum' });
      continue;
    }
    eventos.push({ tipo: 'cobro', ref: `${a.clave}|${m.periodo}|0`, alumno: a.clave, periodo: m.periodo, fecha: fechaDe(a, m.periodo, 0), importe: m.debido, metodo: metodoDe(`${a.clave}|${m.periodo}`) });
  }

  // El mes en curso: se cobra a los que salen primero en un orden fijo hasta
  // llegar al 60 % de lo previsto (contando el pago a medias).
  const previsto = centimos(pagan.reduce((s, x) => s + x.debido, 0));
  let cobrado = 0;
  const orden = [...pagan].sort((x, y) => hash32(`${x.a.clave}|${actual}|orden`) - hash32(`${y.a.clave}|${actual}|orden`));
  const mediaActual = Object.entries(A_MEDIAS).find(([, v]) => v.periodo === actual);
  if (mediaActual) {
    const a = p.alumnos.find((x) => x.clave === mediaActual[0])!;
    const debido = cuotas.get(a.clave)!;
    const importe = centimos(Math.floor((debido * mediaActual[1].fraccion) / 5) * 5);
    eventos.push({ tipo: 'cobro', ref: `${a.clave}|${actual}|0`, alumno: a.clave, periodo: actual, fecha: fechaDe(a, actual, 0), importe, metodo: 'efectivo' });
    cobrado += importe;
  }
  for (const { a, debido } of orden) {
    if (cobrado >= previsto * 0.6) break;
    if (a.clave === mediaActual?.[0] || DEBEN[a.clave] || a.perfil === 'nunca') continue;
    eventos.push({ tipo: 'cobro', ref: `${a.clave}|${actual}|0`, alumno: a.clave, periodo: actual, fecha: fechaDe(a, actual, 0), importe: debido, metodo: metodoDe(`${a.clave}|${actual}`) });
    cobrado += debido;
  }

  eventos.sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.tipo === y.tipo ? x.ref.localeCompare(y.ref) : x.tipo === 'cobro' ? -1 : 1));
  return {
    meses, eventos, cuotas,
    resumen: { actual: { previsto, cobrado: centimos(cobrado) } },
    deudores: Object.keys(DEBEN),
  };
}

// ============================================================
// MEMBRESÍAS
// ============================================================

/** `payment_status` histórico de cada membresía (lo lee «Alumnos» y el perfil). */
export const estadoPagoDe = (a: AlumnoDemo, deudores: string[]): 'al_dia' | 'debe' => (deudores.includes(a.clave) ? 'debe' : 'al_dia');

