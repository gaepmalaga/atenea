/**
 * LA ÚLTIMA PALABRA ES DE LOS TUTORES (regla 138).
 *
 * Tres ideas, y este módulo (puro, regla 21) tiene la lógica de las tres:
 *
 * 1. Una pregunta está REVISADA cuando un tutor (hoy, cualquier admin) la ha
 *    leído y la ha dado por buena: al publicarla, al editarla o al marcarla
 *    desde el revisor. Las 4.617 que escribió la IA y se activaron en bloque
 *    no lo están, y por eso existe esta marca.
 *
 * 2. Nada cambia una pregunta por su cuenta: ni Claude, ni la IA, ni los
 *    procesos que miden la dificultad. Lo que proponen es una PROPUESTA con su
 *    foto de antes y de después, y solo se aplica si un tutor la aprueba.
 *    Si entre tanto alguien ha tocado la pregunta, la propuesta ya no vale
 *    (se pintaría sobre algo que el tutor no ha visto) y se descarta.
 *
 * 3. Los tutores se enteran de todo: lo que ha pasado sale en «Novedades».
 */

/** Los campos que una propuesta puede cambiar. `legal_reference` también: la mitad del trabajo pendiente es poner la referencia que falta. */
export const CAMPOS_PROPONIBLES = ['question_text', 'options', 'correct_index', 'explanation', 'difficulty_level', 'legal_reference'] as const;
export type CampoProponible = (typeof CAMPOS_PROPONIBLES)[number];

export type ValoresPregunta = {
  question_text?: string;
  options?: string[];
  correct_index?: number;
  explanation?: string | null;
  difficulty_level?: number | null;
  legal_reference?: string | null;
};

export const ORIGENES_PROPUESTA = ['claude', 'ia', 'dificultad', 'sistema'] as const;
export type OrigenPropuesta = (typeof ORIGENES_PROPUESTA)[number];

export const NOMBRE_ORIGEN: Record<OrigenPropuesta, string> = {
  claude: 'Claude',
  ia: 'La IA',
  dificultad: 'La medición de dificultad',
  sistema: 'La plataforma',
};

const NOMBRE_CAMPO: Record<CampoProponible, string> = {
  question_text: 'Enunciado',
  options: 'Opciones',
  correct_index: 'Respuesta correcta',
  explanation: 'Explicación',
  difficulty_level: 'Dificultad',
  legal_reference: 'Referencia legal',
};

const NIVEL: Record<number, string> = { 1: 'Fácil', 2: 'Media', 3: 'Difícil' };

/** Lo que trae una propuesta, ya comprobado: solo campos conocidos y con su tipo. */
export function leeValores(v: unknown): ValoresPregunta | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  const out: ValoresPregunta = {};
  for (const k of Object.keys(d)) {
    if (!(CAMPOS_PROPONIBLES as readonly string[]).includes(k)) return null;
  }
  if ('question_text' in d) {
    if (typeof d.question_text !== 'string' || !d.question_text.trim()) return null;
    out.question_text = d.question_text;
  }
  if ('options' in d) {
    if (!Array.isArray(d.options) || d.options.length !== 3 || d.options.some((o) => typeof o !== 'string')) return null;
    out.options = d.options as string[];
  }
  if ('correct_index' in d) {
    if (!Number.isInteger(d.correct_index) || (d.correct_index as number) < 0 || (d.correct_index as number) > 2) return null;
    out.correct_index = d.correct_index as number;
  }
  if ('explanation' in d) {
    if (d.explanation !== null && typeof d.explanation !== 'string') return null;
    out.explanation = d.explanation as string | null;
  }
  if ('difficulty_level' in d) {
    if (d.difficulty_level !== null && ![1, 2, 3].includes(d.difficulty_level as number)) return null;
    out.difficulty_level = d.difficulty_level as number | null;
  }
  if ('legal_reference' in d) {
    if (d.legal_reference !== null && typeof d.legal_reference !== 'string') return null;
    out.legal_reference = d.legal_reference as string | null;
  }
  return Object.keys(out).length ? out : null;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * ¿Sigue valiendo la propuesta? Solo si cada campo que cambia está hoy como
 * estaba cuando se propuso. Si un tutor la ha editado entre tanto, aplicarla
 * pisaría su cambio con algo pensado para otra versión.
 */
export function propuestaVigente(actual: ValoresPregunta, antes: ValoresPregunta, despues: ValoresPregunta): boolean {
  return (Object.keys(despues) as CampoProponible[]).every((k) => igual(actual[k], antes[k]));
}

/** ¿Cambia algo de verdad? Una propuesta que deja todo igual no se guarda. */
export function cambiaAlgo(antes: ValoresPregunta, despues: ValoresPregunta): boolean {
  return (Object.keys(despues) as CampoProponible[]).some((k) => !igual(antes[k], despues[k]));
}

/** Cómo se lee un valor en la pantalla del tutor. */
function legible(campo: CampoProponible, v: unknown, opciones?: string[]): string {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (campo === 'options' && Array.isArray(v)) return v.map((o, i) => `${'ABC'[i]}) ${o}`).join('\n');
  if (campo === 'correct_index' && typeof v === 'number') {
    const texto = opciones?.[v];
    return `${'ABC'[v] ?? '?'}${texto ? `) ${texto}` : ''}`;
  }
  if (campo === 'difficulty_level' && typeof v === 'number') return NIVEL[v] ?? String(v);
  return String(v);
}

export type CambioLegible = { campo: CampoProponible; nombre: string; antes: string; despues: string };

/** El «antes / después» de cada campo que cambia, como lo lee el tutor. */
export function cambiosLegibles(antes: ValoresPregunta, despues: ValoresPregunta): CambioLegible[] {
  return (CAMPOS_PROPONIBLES as readonly CampoProponible[])
    .filter((k) => k in despues && !igual(antes[k], despues[k]))
    .map((k) => ({
      campo: k,
      nombre: NOMBRE_CAMPO[k],
      antes: legible(k, antes[k], antes.options),
      despues: legible(k, despues[k], despues.options ?? antes.options),
    }));
}

// ---------------------------------------------------------------------------
// Novedades
// ---------------------------------------------------------------------------

/** Una línea de «Novedades»: lo que ha pasado o lo que ha decidido alguien. */
export type Novedad = { fecha: string; titulo: string; detalle?: string | null; autor?: string | null; tipo: string };

/**
 * Las decisiones de los tutores que se enseñan en «Novedades». Salen de
 * `admin_audit_log`: cada acción ya lleva quién y cuándo (regla 49).
 */
export const ACCIONES_DE_REVISION: Record<string, (d: Record<string, unknown> | null) => string> = {
  approve_questions: (d) => `Publicó ${Number(d?.cantidad ?? 1)} ${Number(d?.cantidad ?? 1) === 1 ? 'pregunta' : 'preguntas'}`,
  edit_question: () => 'Corrigió una pregunta',
  disable_question: () => 'Retiró una pregunta del banco',
  reactivate_question: () => 'Reactivó una pregunta',
  resolve_report: () => 'Archivó una queja o un aviso',
  resolve_vigencia: () => 'Cerró un aviso de cambio en la ley',
  review_question: () => 'Revisó una pregunta y la dio por buena',
  approve_proposal: () => 'Aprobó un cambio propuesto',
  reject_proposal: () => 'Rechazó un cambio propuesto',
  set_solo_revisadas: (d) => (d?.activo ? 'Activó «solo preguntas revisadas»' : 'Desactivó «solo preguntas revisadas»'),
};

/**
 * Junta las novedades del sistema y las decisiones de los tutores, de la más
 * reciente a la más antigua. Las decisiones repetidas seguidas de la misma
 * persona y el mismo tipo (revisar 40 preguntas en una tarde) se cuentan en
 * una sola línea: si no, la lista no se puede leer.
 */
export function juntaNovedades(
  sistema: { created_at: string; tipo: string; titulo: string; detalle: string | null; autor: string | null }[],
  decisiones: { created_at: string; action: string; detail: Record<string, unknown> | null; actor: string | null }[],
  max = 60,
): Novedad[] {
  const deSistema: Novedad[] = sistema.map((n) => ({ fecha: n.created_at, titulo: n.titulo, detalle: n.detalle, autor: n.autor, tipo: n.tipo }));
  const deTutores: Novedad[] = [];
  const ordenadas = [...decisiones].filter((d) => ACCIONES_DE_REVISION[d.action]).sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const d of ordenadas) {
    const titulo = ACCIONES_DE_REVISION[d.action](d.detail);
    const previa = deTutores.at(-1);
    const mismoDia = previa && previa.fecha.slice(0, 10) === d.created_at.slice(0, 10);
    if (previa && mismoDia && previa.autor === d.actor && previa.tipo === `decision:${d.action}` && d.action !== 'approve_questions' && d.action !== 'set_solo_revisadas') {
      const n = Number(/^(\d+) veces/.exec(previa.detalle ?? '')?.[1] ?? 1) + 1;
      previa.detalle = `${n} veces ese día`;
      continue;
    }
    deTutores.push({ fecha: d.created_at, titulo, autor: d.actor, tipo: `decision:${d.action}`, detalle: null });
  }
  return [...deSistema, ...deTutores].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, max);
}

// ---------------------------------------------------------------------------
// El resumen del tutor: qué ven ya los alumnos y qué falta por revisar (regla 139)
// ---------------------------------------------------------------------------

/**
 * De dónde viene una pregunta, que decide QUÉ se revisa de ella:
 * - `academia`: la envió la propia academia (enunciado y respuesta son suyos);
 *   nosotros añadimos la retroalimentación. El tutor revisa la explicación.
 * - `ia`: la escribió una IA (Gemini el banco global, Claude las del Tomo I).
 *   El tutor la revisa entera.
 */
export const FUENTE_PREGUNTA = { ACADEMIA: 'academia', IA: 'ia' } as const;
export type FuentePregunta = (typeof FUENTE_PREGUNTA)[keyof typeof FUENTE_PREGUNTA];

export function esFuente(v: unknown): v is FuentePregunta {
  return v === FUENTE_PREGUNTA.ACADEMIA || v === FUENTE_PREGUNTA.IA;
}

/**
 * Qué mira el tutor en cada bloque, y qué pasa al darlo por bueno:
 * - De la academia: ya está PUBLICADA (los alumnos la ven); falta revisar su explicación.
 * - De la IA: NO está publicada; al revisarla entera, se publica.
 */
export const QUE_SE_REVISA: Record<FuentePregunta, { etiqueta: string; corta: string; que: string; boton: string }> = {
  academia: { etiqueta: 'De la academia', corta: 'Explicaciones', que: 'Solo la explicación', boton: 'La explicación está bien' },
  ia: { etiqueta: 'Escrita por la IA', corta: 'Sin publicar', que: 'La pregunta entera', boton: 'Está bien: revisada y publicada' },
};

/**
 * En qué punto está una pregunta, con palabras que un tutor entienda:
 * - `publicada_revisada`: los alumnos la ven y un tutor ya la revisó.
 * - `publicada_pendiente`: los alumnos la ven y falta revisar algo (en las de la academia, la explicación).
 * - `publicada_sin_leer`: los alumnos la ven; el dueño la publicó sin lectura individual
 *   (sin avisos y con referencia legal) y ningún tutor la ha leído.
 * - `sin_publicar`: los alumnos NO la ven; hay que revisarla entera.
 * - `fuera`: ni publicada ni pendiente (archivada).
 */
export type EstadoDePregunta = 'publicada_revisada' | 'publicada_pendiente' | 'publicada_sin_leer' | 'sin_publicar' | 'fuera';

export type FilaParaResumen = { subject_id: number | null; fuente: string | null; status: string; reviewed_at: string | null; publicada_sin_leer_el?: string | null };
type Punto = Pick<FilaParaResumen, 'fuente' | 'status' | 'reviewed_at' | 'publicada_sin_leer_el'>;

/**
 * ¿La ven los alumnos? Con «solo revisadas» activado, las revisadas, las de la
 * academia y las publicadas sin leer (regla 139); sin él, todas las activas. Es
 * lo mismo que `FILTRO_SERVIBLE_REVISADO` (`questions.ts`) dice a la base de datos.
 */
export function laVenLosAlumnos(f: Punto, soloRevisadas: boolean): boolean {
  return f.status === 'active' && (!soloRevisadas || f.reviewed_at !== null || f.fuente === FUENTE_PREGUNTA.ACADEMIA || (f.publicada_sin_leer_el ?? null) !== null);
}

export function estadoDePregunta(f: Punto, soloRevisadas: boolean): EstadoDePregunta {
  if (f.status !== 'active' && f.status !== 'candidate') return 'fuera';
  if (!laVenLosAlumnos(f, soloRevisadas)) return 'sin_publicar';
  if (f.reviewed_at !== null) return 'publicada_revisada';
  return (f.publicada_sin_leer_el ?? null) !== null ? 'publicada_sin_leer' : 'publicada_pendiente';
}

export type TemaDelResumen = { subjectId: number; numero: number; titulo: string };
export type FilaDeTema = TemaDelResumen & {
  /** Publicadas: las que ya ven los alumnos. */
  publicadas: number;
  /** De las publicadas, las que ya revisó un tutor. */
  revisadas: number;
  /** Sin publicar: los alumnos no las ven hasta que un tutor las revise. */
  sinPublicar: number;
  /** Publicadas sin lectura individual (IA, sin avisos): ningún tutor las ha leído. */
  sinLeer: number;
  /** Por revisar, de la academia (solo su explicación). Es lo que abre el botón «Explicaciones». */
  academia: number;
  /** Por revisar, escritas por la IA y sin publicar (enteras). Es lo que abre el botón «Sin publicar». */
  ia: number;
};
export type ResumenDeRevision = {
  publicadas: number;
  /** De las publicadas, las ya revisadas por un tutor. */
  revisadas: number;
  /** Publicadas que aún esperan algo del tutor (la explicación, en las de la academia). */
  publicadasPendientes: number;
  /** Publicadas sin leer una a una (IA, sin avisos): se revisan si llega una queja o cuando haya tiempo. */
  publicadasSinLeer: number;
  sinPublicar: number;
  /** Por revisar por bloque (lo que el tutor ve en los botones). */
  porRevisar: { academia: number; ia: number; sinLeer: number };
  porTema: FilaDeTema[];
};

/**
 * Cuántas preguntas hay en cada punto, en total y por tema (regla 139). Lo que
 * le urge al tutor es `publicadasPendientes + sinPublicar`; las publicadas sin
 * leer van aparte (ya las ven los alumnos y no tienen avisos).
 */
export function resumenDeRevision(filas: readonly FilaParaResumen[], temas: readonly TemaDelResumen[], soloRevisadas: boolean): ResumenDeRevision {
  const porSubject = new Map<number, FilaDeTema>(temas.map((t) => [t.subjectId, { ...t, publicadas: 0, revisadas: 0, sinPublicar: 0, sinLeer: 0, academia: 0, ia: 0 }]));
  const total = { publicadas: 0, revisadas: 0, publicadasPendientes: 0, publicadasSinLeer: 0, sinPublicar: 0 };
  const porRevisar = { academia: 0, ia: 0, sinLeer: 0 };
  for (const f of filas) {
    const estado = estadoDePregunta(f, soloRevisadas);
    if (estado === 'fuera') continue;
    const fila = f.subject_id !== null ? porSubject.get(f.subject_id) : undefined;
    if (estado === 'sin_publicar') { total.sinPublicar++; if (fila) fila.sinPublicar++; }
    else {
      total.publicadas++; if (fila) fila.publicadas++;
      if (estado === 'publicada_revisada') { total.revisadas++; if (fila) fila.revisadas++; }
      else if (estado === 'publicada_sin_leer') total.publicadasSinLeer++;
      else total.publicadasPendientes++;
    }
    if (f.reviewed_at === null) {
      // Un bloque por pregunta: lo publicado sin leer va aparte de lo escrito por la IA sin publicar.
      const bloque: 'academia' | 'ia' | 'sinLeer' = estado === 'publicada_sin_leer' ? 'sinLeer' : f.fuente === FUENTE_PREGUNTA.ACADEMIA ? 'academia' : 'ia';
      porRevisar[bloque]++; if (fila) fila[bloque]++;
    }
  }
  const porTema = [...porSubject.values()].filter((t) => t.publicadas + t.sinPublicar > 0).sort((a, b) => a.numero - b.numero);
  return { ...total, porRevisar, porTema };
}
