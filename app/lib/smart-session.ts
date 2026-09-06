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
  type QuestionState,
} from './question-scheduler.ts';

// ============================================================
// LO QUE ENTRA
// ============================================================

/** Una pregunta del banco, candidata a entrar en la sesión. */
export type CandidataSesion = {
  questionId: string;
  topic: string;
  /** `question_bank.global_success_rate` (0-1) si está; si no, `null`. */
  globalSuccessRate?: number | null;
};

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
  if (s.cajon === 'atascada') return 'atascada';

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

function ordenaCubo(cubo: Cubo, items: ConEstado[], now: Date): ConEstado[] {
  const arr = [...items];
  if (cubo === 'recaida') {
    arr.sort(
      (a, b) =>
        diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now) ||
        (b.state?.lapses ?? 0) - (a.state?.lapses ?? 0),
    );
  } else if (cubo === 'repaso') {
    const acc = (x: ConEstado) => {
      const st = x.state;
      return st && st.respuestas > 0 ? st.aciertos / st.respuestas : 1;
    };
    arr.sort((a, b) => diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now) || acc(a) - acc(b));
  } else if (cubo === 'consolidar') {
    arr.sort((a, b) => diasDeRetraso(b.state, now) - diasDeRetraso(a.state, now));
  } else if (cubo === 'nueva') {
    // Las que el alumno EVITA (solo blancos) primero. Luego las globalmente más
    // fáciles, para no hundir el acierto de la sesión por debajo del punto dulce.
    const facil = (x: ConEstado) => tasaUsable(x.globalSuccessRate) ?? 0.5;
    arr.sort(
      (a, b) =>
        Number(b.state?.soloBlancos ?? false) - Number(a.state?.soloBlancos ?? false) ||
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
  now?: Date;
}): SesionAdaptativa {
  const now = params.now ?? new Date();
  const limit = Math.max(0, Math.floor(params.limit));

  const vacio: SesionAdaptativa = {
    questionIds: [],
    resumen: { recaida: 0, repaso: 0, consolidar: 0, nueva: 0, refuerzo: 0, atascada: 0 },
    aciertoEstimado: 0,
    bancoCorto: limit > 0,
    atascadasTotales: 0,
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
  for (const [cubo, items] of porCubo) porCubo.set(cubo, ordenaCubo(cubo, items, now));

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
  for (const items of elegidas.values()) {
    for (const it of items) seleccion.push({ questionId: it.questionId, topic: it.topic });
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

  return { questionIds, resumen, aciertoEstimado: Math.round(acierto * 100) / 100, bancoCorto, atascadasTotales };
}
