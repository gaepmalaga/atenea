/**
 * El panel de la academia (P5): lo que un profesor necesita para dar clase.
 *
 * La lista de usuarios que habia daba nombre, rol, preguntas hechas y acierto.
 * Eso vale para administrar cuentas, no para dar clase. Lo que falta —y es lo
 * que pidio el dueño— es **quien ha abandonado**, en que falla cada uno y que
 * partes del temario no toca nadie.
 *
 * Modulo puro (regla 21): toda la aritmetica que se le ensena al profesor se
 * testea aqui. Es donde este repositorio se ha equivocado siempre — numerador y
 * denominador de muestras distintas, y ceros donde no habia datos (reglas 8
 * y 24).
 */

import { isBlankAnswer } from './exam-results';
import { ERROR_TYPES, type ErrorType } from './stats';

// ============================================================
// CUANDO SE DA POR PERDIDO A UN ALUMNO
// ============================================================

/**
 * Dias sin entrar a partir de los cuales conviene llamarle.
 *
 * El dueño lo dijo asi: *«un alumno que lleva dos semanas sin entrar es el dato
 * mas accionable que hay en una academia»*. Se parte en dos umbrales porque a
 * los catorce dias ya suele ser tarde: a la semana todavia se recupera solo.
 */
export const DIAS_EN_RIESGO = 7;
export const DIAS_ABANDONO = 14;

const UN_DIA = 24 * 60 * 60 * 1000;

export type EstadoAlumno = 'nunca_entro' | 'activo' | 'en_riesgo' | 'abandonado';

/** Como se llama cada estado delante del profesor. */
export const ESTADO_ALUMNO_LABEL: Record<EstadoAlumno, string> = {
  nunca_entro: 'Nunca ha entrado',
  activo: 'Activo',
  en_riesgo: 'En riesgo',
  abandonado: 'Abandonado',
};

/**
 * ENTRAR Y ESTUDIAR SON DOS COSAS DISTINTAS, y confundirlas era el fallo.
 *
 * `estado` responde a «¿viene?» y sale de la ULTIMA CONEXION.
 * `estudiando` responde a «¿hace algo cuando viene?» y sale de las respuestas.
 *
 * Separarlas no es un matiz: son dos problemas distintos y piden dos llamadas
 * distintas. Al que no viene se le pregunta si sigue interesado; al que viene
 * todos los dias y no contesta ni una pregunta se le pregunta si se ha
 * atascado, que es de los que MAS se pueden salvar y antes se pierden.
 */
export type Estudiando = 'nunca' | 'hace_tiempo' | 'al_dia';

export const ESTUDIANDO_LABEL: Record<Estudiando, string> = {
  nunca: 'Entra pero no hace tests',
  hace_tiempo: 'Sin tests hace tiempo',
  al_dia: 'Haciendo tests',
};

// ============================================================
// LO QUE ENTRA
// ============================================================

/** Una respuesta, tal y como la guarda `question_attempts`. */
export type IntentoAlumno = {
  user_id?: string | null;
  topic?: string | null;
  is_correct?: boolean | null;
  error_type?: string | null;
  created_at?: string | null;
  question_id?: string | null;
  selected_index?: number | null;
};

/**
 * Clase o promoción del alumno (P5f), texto libre. Vacío o solo espacios se
 * trata como «sin asignar» (`null`) — la cadena vacía sería un segundo «sin
 * asignar» que la UI tendría que distinguir en todos los sitios (reglas 8 y 16).
 */
export function normalizeClase(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio ? limpio.slice(0, 80) : null;
}

/** Una fila de `profiles`. */
export type PerfilAlumno = {
  id: string;
  email?: string | null;
  role?: string | null;
  created_at?: string | null;
  /** Clase o promoción (P5f). `null` = sin asignar. */
  class_group?: string | null;
  /**
   * La ULTIMA VEZ QUE ENTRO DE VERDAD, de `auth.users.last_sign_in_at`.
   *
   * Sin esto, «nunca ha entrado» era MENTIRA y de la peor clase: se deducia de
   * `question_attempts`, o sea de haber CONTESTADO PREGUNTAS. Un alumno que
   * entra cada dia a leer el temario, a repasar fichas o a preguntarle al chat
   * —pero que aun no ha hecho ningun test— salia en la lista como «nunca ha
   * entrado», el primero de la cola de a quien llamar.
   *
   * Y el profesor actua sobre esa lista. Un dato falso aqui no es un numero
   * feo: es una llamada de telefono a quien esta estudiando todos los dias.
   */
  last_sign_in_at?: string | null;
};

// ============================================================
// LA LISTA DE ALUMNOS
// ============================================================

export type FilaAlumno = {
  id: string;
  email: string | null;
  role: string | null;
  /** Clase o promoción (P5f). `null` = sin asignar. */
  clase: string | null;
  /** Respuestas CONTESTADAS. Los blancos van aparte (regla 24). */
  contestadas: number;
  blancos: number;
  aciertos: number;
  /** Sobre las contestadas. `null` si no ha contestado ninguna (regla 8). */
  winRate: number | null;
  /** ISO de la ultima RESPUESTA, o `null` si no ha contestado ninguna. */
  ultimaActividad: string | null;
  /** ISO de la ultima CONEXION. `null` si no ha entrado nunca de verdad. */
  ultimaConexion: string | null;
  /** Dias desde la ultima CONEXION. `null` si nunca entro. */
  diasSinEntrar: number | null;
  /** Dias desde la ultima RESPUESTA. `null` si nunca contesto. */
  diasSinEstudiar: number | null;
  estado: EstadoAlumno;
  estudiando: Estudiando;
};

function estadoDe(dias: number | null): EstadoAlumno {
  if (dias === null) return 'nunca_entro';
  if (dias >= DIAS_ABANDONO) return 'abandonado';
  if (dias >= DIAS_EN_RIESGO) return 'en_riesgo';
  return 'activo';
}

/** Fecha ISO -> milisegundos, o `null` si no se puede leer. */
function fecha(valor: unknown): number | null {
  if (typeof valor !== 'string' || !valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Los alumnos con lo que hace falta para decidir a quien llamar.
 *
 * ORDEN: primero quien necesita atencion. Los que nunca entraron, despues los
 * abandonados (de mas a menos tiempo fuera), y al final los activos. Una lista
 * ordenada por nombre obliga al profesor a leerla entera para encontrar lo
 * unico que iba a hacer con ella.
 *
 * El `winRate` se calcula sobre las CONTESTADAS, no sobre el total: un blanco
 * es una decision, no un fallo, y contarlo como respuesta castiga al alumno que
 * no arriesga — al reves de lo que ensena la formula del BOE (reglas 22 y 24).
 */
export function resumeAlumnos(
  perfiles: PerfilAlumno[],
  intentos: IntentoAlumno[],
  ahora: number = Date.now()
): FilaAlumno[] {
  const acumulado = new Map<
    string,
    { contestadas: number; blancos: number; aciertos: number; ultima: number | null }
  >();

  for (const intento of intentos ?? []) {
    const id = intento?.user_id;
    if (!id) continue;

    const acc = acumulado.get(id) ?? { contestadas: 0, blancos: 0, aciertos: 0, ultima: null };

    if (isBlankAnswer(intento.selected_index)) acc.blancos++;
    else {
      acc.contestadas++;
      if (intento.is_correct) acc.aciertos++;
    }

    const cuando = fecha(intento.created_at);
    // La ultima actividad cuenta TAMBIEN los blancos: dejar una en blanco es
    // haber entrado, y lo que se mide aqui es si el alumno sigue viniendo.
    if (cuando !== null && (acc.ultima === null || cuando > acc.ultima)) acc.ultima = cuando;

    acumulado.set(id, acc);
  }

  const filas: FilaAlumno[] = (perfiles ?? []).map((p) => {
    const acc = acumulado.get(p.id);
    const ultimaRespuesta = acc?.ultima ?? null;
    const conexion = fecha(p.last_sign_in_at);

    const diasSinEntrar = conexion === null ? null : Math.floor((ahora - conexion) / UN_DIA);
    const diasSinEstudiar =
      ultimaRespuesta === null ? null : Math.floor((ahora - ultimaRespuesta) / UN_DIA);

    // «¿Viene?» sale de la CONEXION. «¿Estudia?» sale de las respuestas.
    const estudiando: Estudiando =
      diasSinEstudiar === null ? 'nunca'
      : diasSinEstudiar >= DIAS_ABANDONO ? 'hace_tiempo'
      : 'al_dia';

    return {
      id: p.id,
      email: p.email ?? null,
      role: p.role ?? null,
      clase: normalizeClase(p.class_group),
      contestadas: acc?.contestadas ?? 0,
      blancos: acc?.blancos ?? 0,
      aciertos: acc?.aciertos ?? 0,
      winRate: acc && acc.contestadas > 0 ? Math.round((acc.aciertos / acc.contestadas) * 100) : null,
      ultimaActividad: ultimaRespuesta === null ? null : new Date(ultimaRespuesta).toISOString(),
      ultimaConexion: conexion === null ? null : new Date(conexion).toISOString(),
      diasSinEntrar,
      diasSinEstudiar,
      estado: estadoDe(diasSinEntrar),
      estudiando,
    };
  });

  const urgencia: Record<EstadoAlumno, number> = {
    nunca_entro: 0,
    abandonado: 1,
    en_riesgo: 2,
    activo: 3,
  };

  return filas.sort((a, b) => {
    if (urgencia[a.estado] !== urgencia[b.estado]) return urgencia[a.estado] - urgencia[b.estado];
    // Dentro del mismo estado, el que lleva mas tiempo fuera primero.
    return (b.diasSinEntrar ?? 0) - (a.diasSinEntrar ?? 0);
  });
}

/**
 * Las clases que existen, ordenadas alfabéticamente, para el filtro del panel.
 * Solo las que tienen a alguien: una clase vacía no es una opción real.
 */
export function clasesDe(filas: FilaAlumno[]): string[] {
  const vistas = new Set<string>();
  for (const f of filas ?? []) if (f.clase) vistas.add(f.clase);
  return [...vistas].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Cuantos alumnos hay en cada estado. Para los cuatro numeros de la cabecera. */
export function contarPorEstado(filas: FilaAlumno[]): Record<EstadoAlumno, number> {
  const cuenta: Record<EstadoAlumno, number> = {
    nunca_entro: 0,
    activo: 0,
    en_riesgo: 0,
    abandonado: 0,
  };
  for (const f of filas) cuenta[f.estado]++;
  return cuenta;
}

// ============================================================
// LA FICHA DE UN ALUMNO
// ============================================================

export type TemaDelAlumno = {
  topic: string;
  contestadas: number;
  aciertos: number;
  /** Sobre las contestadas. Nunca `null` aqui: el tema solo sale si respondio. */
  winRate: number;
};

/**
 * Como va el alumno tema a tema, del que peor lleva al que mejor.
 *
 * Solo entran los temas con respuestas CONTESTADAS: un tema donde solo dejo
 * blancos no dice nada de si lo sabe, y pintarlo al 0 % seria mentir.
 */
export function temasDelAlumno(intentos: IntentoAlumno[], minContestadas = 1): TemaDelAlumno[] {
  const porTema = new Map<string, { contestadas: number; aciertos: number }>();

  for (const intento of intentos ?? []) {
    if (isBlankAnswer(intento.selected_index)) continue;
    const topic = (intento.topic ?? '').trim() || 'Sin tema';
    const acc = porTema.get(topic) ?? { contestadas: 0, aciertos: 0 };
    acc.contestadas++;
    if (intento.is_correct) acc.aciertos++;
    porTema.set(topic, acc);
  }

  return [...porTema.entries()]
    .filter(([, a]) => a.contestadas >= minContestadas)
    .map(([topic, a]) => ({
      topic,
      contestadas: a.contestadas,
      aciertos: a.aciertos,
      winRate: Math.round((a.aciertos / a.contestadas) * 100),
    }))
    .sort((a, b) => a.winRate - b.winRate || b.contestadas - a.contestadas);
}

/**
 * Como se equivoca: el reparto de los diagnosticos que el propio alumno puso.
 *
 * Solo cuenta los fallos con diagnostico. Los que no lo tienen no se reparten
 * entre los demas ni se cuentan como un tipo mas: son fallos sin clasificar y
 * el numero se da aparte, porque «no lo sabemos» no es un tipo de error.
 */
export function erroresDelAlumno(intentos: IntentoAlumno[]): {
  porTipo: { tipo: ErrorType; veces: number }[];
  sinClasificar: number;
} {
  const cuenta = new Map<ErrorType, number>();
  let sinClasificar = 0;

  for (const intento of intentos ?? []) {
    if (intento.is_correct) continue;
    if (isBlankAnswer(intento.selected_index)) continue;

    const tipo = intento.error_type;
    if (typeof tipo === 'string' && (ERROR_TYPES as readonly string[]).includes(tipo)) {
      cuenta.set(tipo as ErrorType, (cuenta.get(tipo as ErrorType) ?? 0) + 1);
    } else {
      sinClasificar++;
    }
  }

  return {
    porTipo: [...cuenta.entries()]
      .map(([tipo, veces]) => ({ tipo, veces }))
      .sort((a, b) => b.veces - a.veces),
    sinClasificar,
  };
}

// ============================================================
// EL CONTENIDO
// ============================================================

export type PreguntaSospechosa = {
  questionId: string;
  veces: number;
  aciertos: number;
  winRate: number;
};

/**
 * Preguntas que falla casi todo el mundo.
 *
 * NO son «las dificiles»: con suficientes intentos, una pregunta que casi nadie
 * acierta suele estar MAL REDACTADA o tener marcada la opcion equivocada. Es
 * justo lo que el dueño describio al encontrarse 15 preguntas de Inteligencia
 * dentro de Constitucion: que haga falta un guion para descubrirlo es el
 * problema.
 *
 * El minimo de intentos no es cosmetico: sin el, una pregunta respondida una
 * vez y fallada sale al 0 % y encabeza la lista para siempre (regla 8).
 */
export function preguntasSospechosas(
  intentos: IntentoAlumno[],
  minIntentos = 5,
  maxWinRate = 25
): PreguntaSospechosa[] {
  const porPregunta = new Map<string, { veces: number; aciertos: number }>();

  for (const intento of intentos ?? []) {
    const id = intento?.question_id;
    if (!id) continue;
    if (isBlankAnswer(intento.selected_index)) continue;

    const acc = porPregunta.get(id) ?? { veces: 0, aciertos: 0 };
    acc.veces++;
    if (intento.is_correct) acc.aciertos++;
    porPregunta.set(id, acc);
  }

  return [...porPregunta.entries()]
    .filter(([, a]) => a.veces >= minIntentos)
    .map(([questionId, a]) => ({
      questionId,
      veces: a.veces,
      aciertos: a.aciertos,
      winRate: Math.round((a.aciertos / a.veces) * 100),
    }))
    .filter((p) => p.winRate <= maxWinRate)
    .sort((a, b) => a.winRate - b.winRate || b.veces - a.veces);
}

export type CoberturaTema = {
  subjectId: number;
  title: string;
  /** Preguntas activas en el banco. */
  preguntas: number;
  /** Cuantos alumnos distintos lo han tocado alguna vez. */
  alumnos: number;
};

/**
 * Que temas tienen banco y cuales no toca nadie.
 *
 * Las dos mitades importan y por motivos distintos: un tema **sin preguntas** no
 * se puede estudiar aunque el alumno quiera, y un tema **con preguntas que nadie
 * toca** es contenido preparado que no le sirve a nadie.
 *
 * Los intentos se cruzan por TITULO, no por id, porque `question_attempts`
 * guarda el titulo del tema (regla 7).
 */
export function coberturaTemario(
  temas: { id: number; title: string }[],
  preguntasPorTema: Map<number, number>,
  intentos: IntentoAlumno[]
): CoberturaTema[] {
  const alumnosPorTitulo = new Map<string, Set<string>>();
  for (const intento of intentos ?? []) {
    const topic = (intento.topic ?? '').trim();
    if (!topic || !intento.user_id) continue;
    const set = alumnosPorTitulo.get(topic) ?? new Set<string>();
    set.add(intento.user_id);
    alumnosPorTitulo.set(topic, set);
  }

  return (temas ?? [])
    .map((t) => ({
      subjectId: t.id,
      title: t.title,
      preguntas: preguntasPorTema.get(t.id) ?? 0,
      alumnos: alumnosPorTitulo.get(t.title.trim())?.size ?? 0,
    }))
    .sort((a, b) => a.preguntas - b.preguntas || a.title.localeCompare(b.title));
}
