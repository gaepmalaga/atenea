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
