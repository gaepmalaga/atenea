/**
 * MONTA UNA SESIÓN DE ENTRENAMIENTO ADAPTATIVO (P10).
 *
 * Con los cajones de cada pregunta (`question-scheduler.ts`) y el banco
 * disponible de los temas elegidos, arma la lista de preguntas de la sesión:
 * una cuota de cada cajón, calibrada para que el alumno acierte ~85 % (regla
 * del 85 %), e intercalando los temas.
 *
 * Módulo PURO (regla 21). Ver `docs/P10-entrenamiento-adaptativo.md`.
 */

import {
  estaVencida,
  diasDeRetraso,
  MAX_BOX,
  type QuestionState,
} from './question-scheduler.ts';
import { PESO_EXAMEN_REAL } from './exam-weight-data.ts';

// ============================================================
// LO QUE ENTRA
// ============================================================

/** Una pregunta del banco, candidata a entrar en la sesión. */
export type CandidataSesion = {
  questionId: string;
  topic: string;
  /** `question_bank.global_success_rate` (0-1) si está; si no, `null`. */
  globalSuccessRate?: number | null;
  /** `question_bank.difficulty_level` (1 fácil · 2 media · 3 alta). */
  difficultyLevel?: number | null;
  /**
   * `subjects.topic_number` (1-45), para mirar el peso real del examen
   * (`PESO_EXAMEN_REAL`, regla 73). `null`/ausente = sin dato, no pesa nada
   * de más ni de menos — es un criterio de desempate, no un filtro.
   */
  topicNumber?: number | null;
};

/**
 * Cuántas preguntas de los 5 exámenes oficiales reales (2021-2025) cayeron
 * en este tema — `0` si no hay dato, nunca un valor inventado.
 *
 * Es un DESEMPATE, no el criterio principal: la urgencia del repaso (días de
 * retraso, cuántas veces ha recaído) sigue mandando. Entre dos preguntas
 * igual de urgentes, se prefiere la del tema que de verdad ha salido más en
 * el examen real — es la diferencia entre "repasar lo que fallas" y
 * "repasar lo que fallas Y además cuenta más para aprobar".
 */
function pesoExamenReal(topicNumber: number | null | undefined): number {
  if (!topicNumber) return 0;
  return PESO_EXAMEN_REAL[topicNumber] ?? 0;
}

/**
 * Tasa global de acierto USABLE: un `0` (o `null`, o algo fuera de rango) no es
 * «todo el mundo la falla», es «no hay dato» — misma trampa de la regla 8. Solo
 * cuenta si es un valor plausible.
 */
function tasaUsable(v: number | null | undefined): number | null {
  return typeof v === 'number' && v > 0.05 && v <= 1 ? v : null;
}

export type Cubo = 'recaida' | 'repaso' | 'consolidar' | 'nueva' | 'refuerzo' | 'atascada';

/** Cuántas preguntas de cada cubo lleva la sesión. */
export type ResumenSesion = Record<Cubo, number>;

export type SesionAdaptativa = {
  questionIds: string[];
  resumen: ResumenSesion;
  /** Estimación del % de acierto de la mezcla (0-1). El objetivo es ~0,85. */
  aciertoEstimado: number;
  /** El banco no daba para `limit` preguntas. La pantalla ya avisa. */
  bancoCorto: boolean;
  /** Preguntas del alumno que están «atascadas» (falladas 4+ veces). */
  atascadasTotales: number;
  /**
   * De qué cubo salió cada pregunta de la sesión. La pantalla del test lo usa
   * junto con el estado (`question-scheduler.ts`) para decirle al alumno POR
   * QUÉ le toca hoy — el sistema ya calcula esta decisión; esto es solo
   * dejarla viajar hasta donde se pinta, en vez de perderla al aplanar la
   * sesión a una lista de ids.
   */
  cuboPorPregunta: Record<string, Cubo>;
};

// P(acierto) esperado de cada cubo. Alimenta la calibración al 85 %.
const P_ACIERTO: Record<Cubo, number> = {
  recaida: 0.55,
  repaso: 0.75,
  consolidar: 0.9,
  nueva: 0.5, // se ajusta con el global_success_rate de cada pregunta
  refuerzo: 0.72,
  atascada: 0.35,
};

/** Como mucho, tantas «atascadas» por sesión: más repeticiones no ayudan. */
const MAX_ATASCADAS_POR_SESION = 2;

/** Por debajo de tantas preguntas vistas, un tema se sirve en bloque, no mezclado. */
const MIN_VISTAS_TEMA = 3;

/** Ventana (días) para considerar que una pregunta se ha visto «hace poco». */
const RECIENTE_DIAS = 2;

// ============================================================
// EL MOTOR
// ============================================================

type ConEstado = CandidataSesion & { state: QuestionState | undefined; cubo: Cubo | null };

function clasifica(c: CandidataSesion, states: Map<string, QuestionState>, now: Date): Cubo | null {
  const s = states.get(c.questionId);

  if (!s || s.box === 0 || s.soloBlancos) return 'nueva';
  // Atascada de verdad (4+ fallos) o creencia fija (falla siempre la misma
  // opción errónea): las dos responden a lo mismo — parar de repetir y llevar a
  // la fuente. Van al mismo cubo, con el mismo tope.
  if (s.cajon === 'atascada') return 'atascada';
  if (s.distractorFijo !== null && s.respuestas - s.aciertos >= 2) return 'atascada';

  const vencida = estaVencida(s, now);
  if (vencida) {
    if (s.cajon === 'recaida') return 'recaida';
    if (s.cajon === 'aprendiendo') return 'repaso';
    // Consolidando y dominada vencida → un re-test ligero.
    if (s.cajon === 'consolidando' || s.cajon === 'dominada') return 'consolidar';
  }

  // No vencida pero vista hace poco y aún tierna → refuerzo (relleno).
  if (
    (s.cajon === 'recaida' || s.cajon === 'aprendiendo') &&
    s.lastAnsweredAt &&
    (now.getTime() - Date.parse(s.lastAnsweredAt)) / 86_400_000 <= RECIENTE_DIAS
  ) {
    return 'refuerzo';
  }

  // Dormida: se respeta el espaciado, no entra.
  return null;
}

function ordenaCubo(cubo: Cubo, items: ConEstado[], now: Date, dificultad: number | null): ConEstado[] {
  const arr = [...items];
  // La dificultad que eligió el alumno es una PREFERENCIA suave, no un filtro
  // (como en `getQuestionsFromBank`): a igualdad de todo lo demás, primero las
  // del nivel pedido. Solo se aplica a lo NUEVO y a los repasos, no a las
  // recaídas (esas van por urgencia, no por nivel).
  const preferido = (x: ConEstado) => (dificultad && x.difficultyLevel === dificultad ? 0 : 1);

  if (cubo === 'recaida') {
    arr.sort(
      (a, b) =>
        diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now) ||
        (b.state?.lapses ?? 0) - (a.state?.lapses ?? 0) ||
        pesoExamenReal(b.topicNumber) - pesoExamenReal(a.topicNumber),
    );
  } else if (cubo === 'repaso') {
    const acc = (x: ConEstado) => {
      const st = x.state;
      return st && st.respuestas > 0 ? st.aciertos / st.respuestas : 1;
    };
    arr.sort(
      (a, b) =>
        diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now) ||
        acc(a) - acc(b) ||
        pesoExamenReal(b.topicNumber) - pesoExamenReal(a.topicNumber) ||
        preferido(a) - preferido(b),
    );
  } else if (cubo === 'consolidar') {
    arr.sort(
      (a, b) =>
        diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now) ||
        pesoExamenReal(b.topicNumber) - pesoExamenReal(a.topicNumber),
    );
  } else if (cubo === 'nueva') {
    // Las que el alumno EVITA (solo blancos) primero. Luego el nivel pedido, y
    // luego las globalmente más fáciles (no hundir el acierto de la sesión).
    const facil = (x: ConEstado) => tasaUsable(x.globalSuccessRate) ?? 0.5;
    arr.sort(
      (a, b) =>
        Number(b.state?.soloBlancos ?? false) - Number(a.state?.soloBlancos ?? false) ||
        preferido(a) - preferido(b) ||
        facil(b) - facil(a),
    );
  } else if (cubo === 'refuerzo') {
    arr.sort((a, b) => (Date.parse(a.state?.lastAnsweredAt ?? '') || 0) - (Date.parse(b.state?.lastAnsweredAt ?? '') || 0));
  }
  // Re-hilar por tema respetando el orden de prioridad: entre preguntas de
  // prioridad parecida, alternan los temas, así al coger las N primeras del
  // cubo ya vienen repartidas (regla 15 + técnica 5).
  return entrelazaPorTema(arr);
}

/** Round-robin estable por tema: preserva el orden relativo dentro de cada tema. */
function entrelazaPorTema<T extends { topic: string }>(items: T[]): T[] {
  const colas = new Map<string, T[]>();
  for (const it of items) {
    const q = colas.get(it.topic) ?? [];
    q.push(it);
    colas.set(it.topic, q);
  }
  const temas = [...colas.keys()];
  const out: T[] = [];
  let restantes = items.length;
  let i = 0;
  while (restantes > 0 && i < items.length * (temas.length + 1)) {
    const cola = colas.get(temas[i % temas.length])!;
    if (cola.length) {
      out.push(cola.shift()!);
      restantes--;
    }
    i++;
  }
  for (const c of colas.values()) out.push(...c);
  return out;
}

/**
 * Intercala los temas: recorre en round-robin las colas por tema, para que dos
 * preguntas seguidas del mismo tema solo salgan si no queda otra (regla 15 +
 * técnica 5: intercalar ayuda a discriminar entre temas parecidos).
 */
function intercala(ids: { questionId: string; topic: string }[]): string[] {
  return entrelazaPorTema(ids).map((x) => x.questionId);
}

export function buildSmartSession(params: {
  states: Map<string, QuestionState>;
  disponibles: CandidataSesion[];
  limit: number;
  /** Nivel que eligió el alumno (1-3). Preferencia suave, no filtro. */
  dificultad?: number | null;
  now?: Date;
}): SesionAdaptativa {
  const now = params.now ?? new Date();
  const dificultad = params.dificultad && [1, 2, 3].includes(params.dificultad) ? params.dificultad : null;
  const limit = Math.max(0, Math.floor(params.limit));

  const vacio: SesionAdaptativa = {
    questionIds: [],
    resumen: { recaida: 0, repaso: 0, consolidar: 0, nueva: 0, refuerzo: 0, atascada: 0 },
    aciertoEstimado: 0,
    bancoCorto: limit > 0,
    atascadasTotales: 0,
    cuboPorPregunta: {},
  };
  if (limit === 0 || !params.disponibles?.length) return vacio;

  // 1. Clasificar todo el banco disponible.
  const conEstado: ConEstado[] = params.disponibles.map((c) => ({
    ...c,
    state: params.states.get(c.questionId),
    cubo: clasifica(c, params.states, now),
  }));

  const porCubo = new Map<Cubo, ConEstado[]>();
  for (const c of conEstado) {
    if (!c.cubo) continue;
    const l = porCubo.get(c.cubo) ?? [];
    l.push(c);
    porCubo.set(c.cubo, l);
  }
  for (const [cubo, items] of porCubo) porCubo.set(cubo, ordenaCubo(cubo, items, now, dificultad));

  const atascadasTotales = (porCubo.get('atascada') ?? []).length;

  // Cuánto del banco disponible ha tocado ya el alumno. El tope de material
  // nuevo ESCALA con esto: un principiante que ha visto el 3 % del banco
  // necesita mucho material nuevo; uno que ha visto el 80 % casi nada (si no,
  // se le acaban las preguntas y la sesión se llena de repaso prematuro).
  const vistas = params.disponibles.filter((c) => params.states.has(c.questionId)).length;
  const fraccionVista = params.disponibles.length ? vistas / params.disponibles.length : 0;
  const factorNueva =
    fraccionVista < 0.1 ? 0.6 : fraccionVista < 0.3 ? 0.45 : fraccionVista < 0.6 ? 0.32 : 0.22;

  // 2. Cupos base (regla del 85 %: el repaso pesa más que el material nuevo).
  const capNueva = Math.max(1, Math.ceil(limit * factorNueva));
  const capAtascada = Math.min(MAX_ATASCADAS_POR_SESION, atascadasTotales);
  const topes: Record<Cubo, number> = {
    recaida: limit, repaso: limit, consolidar: limit, refuerzo: limit,
    nueva: capNueva, atascada: capAtascada,
  };
  const cupos: Record<Cubo, number> = {
    recaida: Math.round(limit * 0.25),
    repaso: Math.round(limit * 0.2),
    consolidar: Math.round(limit * 0.18),
    nueva: Math.min(Math.round(limit * factorNueva), capNueva),
    // El refuerzo (material visto hace poco pero aún no vencido) NO tiene cupo
    // base: rompe el espaciado. Solo se usa como último relleno para un alumno
    // avanzado que no tiene nada vencido ni nada nuevo.
    refuerzo: 0,
    atascada: capAtascada,
  };

  const prioridad: Cubo[] = ['recaida', 'atascada', 'repaso', 'consolidar', 'nueva', 'refuerzo'];

  const elegidas = new Map<Cubo, ConEstado[]>();
  const usados = new Set<string>();
  let total = 0;
  const tomados = (cubo: Cubo) => (elegidas.get(cubo) ?? []).length;

  const coger = (cubo: Cubo, n: number) => {
    const cabe = Math.min(n, limit - total, topes[cubo] - tomados(cubo));
    if (cabe <= 0) return;
    const disp = (porCubo.get(cubo) ?? []).filter((c) => !usados.has(c.questionId));
    const toma = disp.slice(0, cabe);
    for (const t of toma) usados.add(t.questionId);
    elegidas.set(cubo, [...(elegidas.get(cubo) ?? []), ...toma]);
    total += toma.length;
  };

  // Fase 1: hasta el cupo base.
  for (const cubo of prioridad) coger(cubo, cupos[cubo]);

  // Fase 2: rellenar el hueco por prioridad, sin pasarse de los topes.
  let vueltas = 0;
  while (total < limit && vueltas < limit + 2) {
    const antes = total;
    for (const cubo of prioridad) {
      if (total >= limit) break;
      coger(cubo, 1);
    }
    if (total === antes) break;
    vueltas++;
  }

  // Último recurso (arranque en frío): si sigue corta y solo quedan nuevas, se
  // relaja su tope antes que devolver una sesión a medias.
  if (total < limit) {
    const dispNuevas = (porCubo.get('nueva') ?? []).filter((c) => !usados.has(c.questionId));
    for (const c of dispNuevas.slice(0, limit - total)) {
      usados.add(c.questionId);
      elegidas.set('nueva', [...(elegidas.get('nueva') ?? []), c]);
      total++;
    }
  }

  const bancoCorto = total < limit;

  // 4. Calibración ligera: una sola pasada.
  const contar = () => {
    const r: ResumenSesion = { recaida: 0, repaso: 0, consolidar: 0, nueva: 0, refuerzo: 0, atascada: 0 };
    for (const [cubo, items] of elegidas) r[cubo] = items.length;
    return r;
  };
  const estimar = (r: ResumenSesion) => {
    let suma = 0;
    let n = 0;
    for (const cubo of Object.keys(r) as Cubo[]) {
      const items = elegidas.get(cubo) ?? [];
      for (const it of items) {
        const p = cubo === 'nueva' ? (tasaUsable(it.globalSuccessRate) ?? P_ACIERTO.nueva) : P_ACIERTO[cubo];
        suma += p;
        n++;
      }
    }
    return n > 0 ? suma / n : 0;
  };

  let resumen = contar();
  let acierto = estimar(resumen);
  const margen = Math.ceil(limit * 0.15);

  const swap = (fuera: Cubo, dentro: Cubo, n: number) => {
    const cola = (porCubo.get(dentro) ?? []).filter((c) => !usados.has(c.questionId));
    const quitables = elegidas.get(fuera) ?? [];
    const k = Math.min(n, cola.length, quitables.length);
    for (let i = 0; i < k; i++) {
      const q = quitables.pop()!;
      usados.delete(q.questionId);
      const add = cola[i];
      usados.add(add.questionId);
      elegidas.set(dentro, [...(elegidas.get(dentro) ?? []), add]);
    }
    elegidas.set(fuera, quitables);
  };

  if (acierto > 0 && acierto < 0.8) {
    // Demasiado difícil: primero baja el material nuevo a favor de consolidación.
    swap('nueva', 'consolidar', margen);
    // Solo si SIGUE muy difícil Y las recaídas dominan la sesión (> 40 %), se
    // cambian algunas por repaso. Un alumno con muchas recaídas necesita verlas;
    // no se le quitan salvo que la sesión sea inasumible.
    if (estimar(contar()) < 0.75 && tomados('recaida') > limit * 0.4) {
      swap('recaida', 'repaso', margen);
    }
  } else if (acierto > 0.92) {
    // Demasiado fácil: mete más material nuevo / recaídas.
    swap('consolidar', 'nueva', margen);
  }
  resumen = contar();
  acierto = estimar(resumen);

  // 5. Ordenar.
  const seleccion: { questionId: string; topic: string }[] = [];
  const cuboPorPregunta: Record<string, Cubo> = {};
  for (const [cubo, items] of elegidas) {
    for (const it of items) {
      seleccion.push({ questionId: it.questionId, topic: it.topic });
      cuboPorPregunta[it.questionId] = cubo;
    }
  }

  // Un tema que el alumno APENAS ha tocado se sirve en BLOQUE al principio, no
  // intercalado: para aprender algo nuevo, primero práctica en bloque y después
  // a la mezcla (técnica 5, matiz de Hwang 2025). «Apenas tocado» = menos de
  // `MIN_VISTAS_TEMA` preguntas de ese tema con estado.
  const vistasPorTema = new Map<string, number>();
  for (const c of conEstado) {
    if (c.state) vistasPorTema.set(c.topic, (vistasPorTema.get(c.topic) ?? 0) + 1);
  }
  const esTemaNuevo = (t: string) => (vistasPorTema.get(t) ?? 0) < MIN_VISTAS_TEMA;

  const bloqueNuevo = seleccion.filter((s) => esTemaNuevo(s.topic));
  const resto = seleccion.filter((s) => !esTemaNuevo(s.topic));
  // El bloque solo tiene sentido si hay ADEMÁS temas conocidos en la sesión: es
  // «meter un tema nuevo en la mezcla». Si TODA la sesión es nueva (alumno que
  // empieza), se intercala con normalidad.
  const questionIds =
    resto.length === 0
      ? intercala(seleccion)
      : [
          ...[...bloqueNuevo].sort((a, b) => a.topic.localeCompare(b.topic, 'es')).map((s) => s.questionId),
          ...intercala(resto),
        ];

  return {
    questionIds,
    resumen,
    aciertoEstimado: Math.round(acierto * 100) / 100,
    bancoCorto,
    atascadasTotales,
    cuboPorPregunta,
  };
}

// ============================================================
// POR QUÉ LE TOCA HOY (hacer visible la programación al alumno)
// ============================================================

/**
 * Una frase corta de por qué el sistema ha elegido esta pregunta para hoy.
 *
 * El planificador ya sabe el motivo — de qué cubo salió, cuántos días de
 * retraso lleva, cuántas veces se le resiste—; hasta ahora esa decisión se
 * tomaba y se tiraba. Esto no añade ninguna inteligencia nueva: solo dice en
 * voz alta la que ya existe, para que «te estoy programando algo» deje de ser
 * una promesa y sea algo que el alumno puede leer.
 */
export function razonRepaso(cubo: Cubo | undefined, state: QuestionState | undefined): string {
  if (cubo === 'atascada') {
    return state?.distractorFijo != null
      ? 'Sueles marcar la misma opción cuando la fallas — hoy toca para acabar con esa confusión.'
      : `Se te resiste (la has fallado ${state?.lapses ?? 'varias'} veces) — repetirla no basta, por eso hoy no vuelve a repetirse sola.`;
  }
  if (cubo === 'recaida') {
    const dias = state ? diasDeRetraso(state) : 0;
    return dias > 0
      ? `La fallaste hace ${Math.round(dias)} día${Math.round(dias) === 1 ? '' : 's'}: toca repasarla ya.`
      : 'La fallaste la última vez: toca repasarla.';
  }
  if (cubo === 'repaso') return 'Está en aprendizaje y le tocaba su repaso.';
  if (cubo === 'consolidar') {
    return state?.box === MAX_BOX
      ? 'Ya la dominas — un acierto más y no la volverás a ver en semanas.'
      : 'Está casi consolidada: un repaso ligero para confirmarlo.';
  }
  if (cubo === 'refuerzo') return 'La viste hace poco: un repaso de refuerzo para que no se enfríe.';
  if (state?.soloBlancos) return 'Sueles dejarla en blanco — hoy toca intentarla.';
  return 'Todavía no la habías visto.';
}
