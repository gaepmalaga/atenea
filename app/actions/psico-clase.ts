'use server'
import { randomInt } from 'node:crypto';
import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { fallo } from '../lib/fallos';
import { ahoraEnZona } from '../lib/asistencia';
import { estadoEntrega, esParticipante, type EstadoEntrega } from '../lib/examen-clase';
import { nombreVisible } from '../lib/perfil-alumno';
import { participantesDe, misGrupos } from '../lib/participantes-clase';
import { validaExamenClase, resumenDeClase, type ExamenValido, type FilaResultado } from '../lib/psico-clase';
import {
  VERSION_PSICO, aPublica, corrigeSesion, generaSesion, normalizaRespuesta, tiposValidos, notaDeSesionGuardada, esVersionPsico,
  type PreguntaPsico, type ResultadoPsico, type TipoPsico,
} from '../lib/psico';
import type { SesionPsico, RevisionPsico } from './psico';

/**
 * PSICOTÉCNICOS EN CLASE (regla 127): el mismo examen para un turno.
 *
 * Las dos tablas (`psico_clase`, `psico_clase_resultados`) tienen RLS y ninguna
 * política: solo las toca la clave de servicio, y cada consulta lleva
 * `organization_id` y el usuario de la sesión (reglas 1, 34 y 65). El examen no
 * guarda preguntas, guarda la semilla: se regenera idéntico, y el alumno nunca
 * recibe la respuesta hasta que entrega (regla 110).
 */

const SIN_ACADEMIA = 'No hay una academia seleccionada.';
const FALTA_GUION = 'Los psicotécnicos en clase todavía no están activados. Avisa al administrador de la plataforma.';
const UUID = /^[0-9a-f-]{36}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hoyAcademia = () => ahoraEnZona(Date.now()).fecha;

type FilaClase = {
  id: string; title: string; seed: number; version: number; kinds: string[]; total: number; minutes: number;
  class_ids: string[] | null; sat_on: string; closes_on: string | null;
};
const COLS_CLASE = 'id, title, seed, version, kinds, total, minutes, class_ids, sat_on, closes_on';

/** Las preguntas de un examen de clase, regeneradas con su semilla y la versión que tenía. */
function preguntasDe(f: Pick<FilaClase, 'seed' | 'kinds' | 'total' | 'version'>): PreguntaPsico[] | null {
  if (!esVersionPsico(f.version)) return null;
  return generaSesion(Number(f.seed), tiposValidos(f.kinds) as TipoPsico[], f.total, f.version);
}

// ===========================================================================
// LA ACADEMIA
// ===========================================================================

export type PsicoClaseResumen = {
  id: string; titulo: string; fecha: string; cierre: string | null; total: number; minutos: number;
  tipos: TipoPsico[]; grupos: string[]; participantes: number; entregados: number; notaMedia: number | null;
};

export async function getPsicoClases(): Promise<{ success: true; examenes: PsicoClaseResumen[] } | { success: false; error: string; faltaGuion?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const { data: filas, error } = await supabaseAdmin
    .from('psico_clase').select(COLS_CLASE).eq('organization_id', org).order('sat_on', { ascending: false }).order('created_at', { ascending: false }).limit(200);
  if (error) { fallo('getPsicoClases', error); return { success: false as const, error: FALTA_GUION, faltaGuion: true }; }
  const examenes = (filas ?? []) as FilaClase[];
  if (!examenes.length) return { success: true as const, examenes: [] };

  const [grupos, resultados] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    supabaseAdmin.from('psico_clase_resultados')
      .select('psico_clase_id, user_id, finished_at, correct, wrong, blank, by_kind')
      .eq('organization_id', org).in('psico_clase_id', examenes.map((e) => e.id)).limit(5000),
  ]);
  const base = grupos.error ?? resultados.error;
  if (base) return { success: false as const, error: fallo('getPsicoClases', base) };
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));

  const out: PsicoClaseResumen[] = [];
  for (const e of examenes) {
    const gente = await participantesDe(org, e.class_ids ?? []);
    if (gente.error) return { success: false as const, error: gente.error };
    const suyos = (resultados.data ?? []).filter((r) => r.psico_clase_id === e.id);
    const filasRes: FilaResultado[] = suyos.map((r) => ({
      userId: r.user_id as string, entregado: !!r.finished_at, version: e.version, total: e.total,
      aciertos: (r.correct as number) ?? 0, fallos: (r.wrong as number) ?? 0, blancos: (r.blank as number) ?? 0,
      porTipo: (r.by_kind as ResultadoPsico['porTipo']) ?? {},
    }));
    const resumen = resumenDeClase(filasRes, gente.data.length);
    out.push({
      id: e.id, titulo: e.title, fecha: e.sat_on, cierre: e.closes_on, total: e.total, minutos: e.minutes,
      tipos: tiposValidos(e.kinds), grupos: (e.class_ids ?? []).map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
      participantes: resumen.participantes, entregados: resumen.entregados, notaMedia: resumen.notaMedia,
    });
  }
  return { success: true as const, examenes: out };
}

/** Pone un psicotécnico en clase: la semilla la elige el servidor y es la misma para todo el turno. */
export async function creaPsicoClase(input: unknown): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const v = validaExamenClase((input ?? {}) as Parameters<typeof validaExamenClase>[0]);
  if (!v.ok) return { success: false as const, error: v.error };
  const e: ExamenValido = v.valor;

  // Los grupos tienen que ser de ESTA academia (regla 65): un id de otra no vale.
  if (e.classIds.length) {
    const { data, error } = await supabaseAdmin.from('class_groups').select('id').eq('organization_id', org).in('id', e.classIds);
    if (error) return { success: false as const, error: fallo('creaPsicoClase', error) };
    if ((data ?? []).length !== e.classIds.length) return { success: false as const, error: 'Alguno de los grupos no es de tu academia.' };
  }

  const { data, error } = await supabaseAdmin.from('psico_clase').insert({
    organization_id: org, title: e.titulo, seed: randomInt(1, 2 ** 31 - 1), version: VERSION_PSICO, kinds: e.tipos, total: e.total, minutes: e.minutos,
    class_ids: e.classIds, sat_on: e.fecha, closes_on: e.cierre, created_by: auth.user.id,
  }).select('id').single();
  if (error || !data) { fallo('creaPsicoClase', error ?? { message: 'sin fila' }); return { success: false as const, error: FALTA_GUION }; }
  return { success: true as const, id: data.id as string };
}

export type ParticipantePsico = {
  id: string; nombre: string; email: string | null; estado: EstadoEntrega; via: 'app' | 'hoja' | null;
  nota: number | null; aciertos: number | null; fallos: number | null; blancos: number | null;
};
export type DetallePsicoClase = {
  examen: Omit<PsicoClaseResumen, 'participantes' | 'entregados' | 'notaMedia'>;
  participantes: ParticipantePsico[];
  resumen: ReturnType<typeof resumenDeClase>;
};

export async function getDetallePsicoClase(id: unknown): Promise<{ success: true; detalle: DetallePsicoClase } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: e, error } = await supabaseAdmin.from('psico_clase').select(COLS_CLASE).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getDetallePsicoClase', error) };
  if (!e) return { success: false as const, error: 'Ese examen no existe.' };
  const f = e as FilaClase;

  const [grupos, resultados, gente] = await Promise.all([
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    supabaseAdmin.from('psico_clase_resultados').select('user_id, finished_at, correct, wrong, blank, by_kind, via').eq('organization_id', org).eq('psico_clase_id', id).limit(5000),
    participantesDe(org, f.class_ids ?? []),
  ]);
  const base = grupos.error ?? resultados.error;
  if (base) return { success: false as const, error: fallo('getDetallePsicoClase', base) };
  if (gente.error) return { success: false as const, error: gente.error };

  const hoy = hoyAcademia();
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));
  const porAlumno = new Map((resultados.data ?? []).map((r) => [r.user_id as string, r]));
  const participantes: ParticipantePsico[] = gente.data.map((a) => {
    const r = porAlumno.get(a.id);
    const entregado = !!r?.finished_at;
    const porTipo = (r?.by_kind as ResultadoPsico['porTipo']) ?? {};
    return {
      id: a.id, nombre: nombreVisible(a.nombre, a.email) || 'Alumno', email: a.email,
      estado: estadoEntrega({ satOn: f.sat_on, closesOn: f.closes_on, hoy, absent: false, entregado }),
      via: entregado ? ((r?.via as 'app' | 'hoja') ?? 'app') : null,
      nota: entregado ? notaDeSesionGuardada({ version: f.version, total: f.total, aciertos: (r?.correct as number) ?? 0, fallos: (r?.wrong as number) ?? 0, porTipo }) : null,
      aciertos: entregado ? ((r?.correct as number) ?? 0) : null, fallos: entregado ? ((r?.wrong as number) ?? 0) : null, blancos: entregado ? ((r?.blank as number) ?? 0) : null,
    };
  });
  participantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const filasRes: FilaResultado[] = (resultados.data ?? []).filter((r) => gente.data.some((g) => g.id === r.user_id)).map((r) => ({
    userId: r.user_id as string, entregado: !!r.finished_at, version: f.version, total: f.total,
    aciertos: (r.correct as number) ?? 0, fallos: (r.wrong as number) ?? 0, blancos: (r.blank as number) ?? 0, porTipo: (r.by_kind as ResultadoPsico['porTipo']) ?? {},
  }));
  return {
    success: true as const,
    detalle: {
      examen: {
        id: f.id, titulo: f.title, fecha: f.sat_on, cierre: f.closes_on, total: f.total, minutos: f.minutes,
        tipos: tiposValidos(f.kinds), grupos: (f.class_ids ?? []).map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
      },
      participantes,
      resumen: resumenDeClase(filasRes, gente.data.length),
    },
  };
}

export async function borraPsicoClase(id: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false, error: 'Datos no válidos.' };
  const { error } = await supabaseAdmin.from('psico_clase').delete().eq('organization_id', org).eq('id', id);
  if (error) return { success: false, error: fallo('borraPsicoClase', error) };
  return { success: true };
}

/** El examen entero para IMPRIMIRLO: preguntas con respuesta y explicación (solo el admin las ve). */
export async function getHojaPsicoClase(id: unknown): Promise<
  { success: true; titulo: string; fecha: string; minutos: number; preguntas: PreguntaPsico[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };
  const { data: e, error } = await supabaseAdmin.from('psico_clase').select(COLS_CLASE).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getHojaPsicoClase', error) };
  if (!e) return { success: false as const, error: 'Ese examen no existe.' };
  const preguntas = preguntasDe(e as FilaClase);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede imprimir.' };
  const f = e as FilaClase;
  return { success: true as const, titulo: f.title, fecha: f.sat_on, minutos: f.minutes, preguntas };
}

// ===========================================================================
// EL ALUMNO
// ===========================================================================

export type MiPsicoClase = {
  id: string; titulo: string; fecha: string; cierre: string | null; total: number; minutos: number; tipos: TipoPsico[];
  estado: EstadoEntrega; empezado: boolean;
  nota: number | null; aciertos: number | null; fallos: number | null; blancos: number | null;
  /** Cuántas opciones tiene cada pregunta, para pasar la hoja en papel sin ver las preguntas. */
  opciones: number[];
};

async function acotado(org: string | null, userId: string, id: unknown): Promise<{ ok: true; org: string; fila: FilaClase } | { ok: false; error: string }> {
  if (!org) return { ok: false, error: 'No hemos encontrado tu academia.' };
  if (!esUuid(id)) return { ok: false, error: 'Datos no válidos.' };
  const { data: e, error } = await supabaseAdmin.from('psico_clase').select(COLS_CLASE).eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { ok: false, error: fallo('psico-clase', error) };
  if (!e) return { ok: false, error: 'Ese examen no existe.' };
  const grupos = await misGrupos(org, userId);
  if (grupos.error) return { ok: false, error: grupos.error };
  if (!esParticipante((e as FilaClase).class_ids ?? [], grupos.data)) return { ok: false, error: 'Ese examen no es de tu turno.' };
  return { ok: true, org, fila: e as FilaClase };
}

export async function getMisPsicoClase(): Promise<{ success: true; examenes: MiPsicoClase[] } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hemos encontrado tu academia.' };

  const { data, error } = await supabaseAdmin.from('psico_clase').select(COLS_CLASE).eq('organization_id', org).order('sat_on', { ascending: false }).limit(100);
  if (error) {
    // Sin las tablas todavía, el módulo se abre igual: simplemente no hay exámenes de clase.
    fallo('getMisPsicoClase', error);
    return { success: true as const, examenes: [] };
  }
  const grupos = await misGrupos(org, auth.user.id);
  if (grupos.error) return { success: false as const, error: grupos.error };
  const mios = ((data ?? []) as FilaClase[]).filter((e) => esParticipante(e.class_ids ?? [], grupos.data));
  if (!mios.length) return { success: true as const, examenes: [] };

  const { data: res, error: eR } = await supabaseAdmin.from('psico_clase_resultados')
    .select('psico_clase_id, finished_at, correct, wrong, blank, by_kind').eq('organization_id', org).eq('user_id', auth.user.id).in('psico_clase_id', mios.map((e) => e.id));
  if (eR) return { success: false as const, error: fallo('getMisPsicoClase', eR) };
  const mio = new Map((res ?? []).map((r) => [r.psico_clase_id as string, r]));
  const hoy = hoyAcademia();

  return {
    success: true as const,
    examenes: mios.map((e) => {
      const r = mio.get(e.id);
      const entregado = !!r?.finished_at;
      const preguntas = preguntasDe(e);
      return {
        id: e.id, titulo: e.title, fecha: e.sat_on, cierre: e.closes_on, total: e.total, minutos: e.minutes, tipos: tiposValidos(e.kinds),
        estado: estadoEntrega({ satOn: e.sat_on, closesOn: e.closes_on, hoy, absent: false, entregado }),
        empezado: !!r && !entregado,
        nota: entregado ? notaDeSesionGuardada({ version: e.version, total: e.total, aciertos: (r!.correct as number) ?? 0, fallos: (r!.wrong as number) ?? 0, porTipo: (r!.by_kind as ResultadoPsico['porTipo']) ?? {} }) : null,
        aciertos: entregado ? ((r!.correct as number) ?? 0) : null, fallos: entregado ? ((r!.wrong as number) ?? 0) : null, blancos: entregado ? ((r!.blank as number) ?? 0) : null,
        opciones: (preguntas ?? []).map((q) => q.opciones.length),
      };
    }),
  };
}

/**
 * Empezar el examen en la pantalla. El reloj es el del servidor: la fila se crea
 * ahora y, si se vuelve a abrir, el tiempo que queda sale de ahí (regla 14). Solo
 * el día del examen o después, y dentro del plazo; una sola vez.
 */
export async function empiezaPsicoClase(id: unknown): Promise<{ success: true; sesion: SesionPsico } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const c = await acotado(auth.user.organizationId, auth.user.id, id);
  if (!c.ok) return { success: false as const, error: c.error };

  const hoy = hoyAcademia();
  if (hoy < c.fila.sat_on) return { success: false as const, error: 'Este examen todavía no se puede hacer: es el día indicado.' };
  if (c.fila.closes_on && hoy > c.fila.closes_on) return { success: false as const, error: 'El plazo para hacer este examen ha terminado.' };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede hacer.' };

  const { data: previo, error: eP } = await supabaseAdmin.from('psico_clase_resultados').select('id, started_at, finished_at')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (eP) return { success: false as const, error: fallo('empiezaPsicoClase', eP) };
  if (previo?.finished_at) return { success: false as const, error: 'Ya has entregado este examen.' };

  let empezado = previo ? new Date(previo.started_at as string).getTime() : Date.now();
  if (!previo) {
    const { error } = await supabaseAdmin.from('psico_clase_resultados').insert({
      organization_id: c.org, psico_clase_id: c.fila.id, user_id: auth.user.id, via: 'app',
    });
    if (error) return { success: false as const, error: fallo('empiezaPsicoClase', error) };
    empezado = Date.now();
  }
  const quedaMs = Math.max(0, c.fila.minutes * 60_000 - (Date.now() - empezado));
  if (quedaMs <= 0) return { success: false as const, error: 'Se te ha acabado el tiempo de este examen. Pídele a tu profesor que lo revise.' };
  return { success: true as const, sesion: { id: c.fila.id, minutos: Math.max(1, Math.ceil(quedaMs / 60_000)), preguntas: preguntas.map(aPublica) } };
}

/**
 * Entregar: con las respuestas de la pantalla (`via: 'app'`) o las que pasa el
 * alumno desde la hoja en papel (`via: 'hoja'`, sin reloj pero dentro del plazo).
 * El servidor regenera el examen y corrige (regla 110); se entrega una sola vez.
 */
export async function entregaPsicoClase(input: unknown): Promise<
  { success: true; resultado: ResultadoPsico; revision: RevisionPsico; duracionMs: number } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const d = (input ?? {}) as { id?: unknown; respuestas?: unknown; via?: unknown };
  const c = await acotado(auth.user.organizationId, auth.user.id, d.id);
  if (!c.ok) return { success: false as const, error: c.error };
  const via = d.via === 'hoja' ? 'hoja' : 'app';

  const hoy = hoyAcademia();
  if (hoy < c.fila.sat_on) return { success: false as const, error: 'Este examen todavía no se puede entregar: es el día indicado.' };
  if (c.fila.closes_on && hoy > c.fila.closes_on) return { success: false as const, error: 'El plazo para entregar este examen ha terminado.' };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede corregir.' };

  const { data: previo, error: eP } = await supabaseAdmin.from('psico_clase_resultados').select('id, started_at, finished_at')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (eP) return { success: false as const, error: fallo('entregaPsicoClase', eP) };
  if (previo?.finished_at) return { success: false as const, error: 'Ya has entregado este examen.' };
  if (via === 'app' && !previo) return { success: false as const, error: 'Empieza el examen antes de entregarlo.' };

  const respuestas = preguntas.map((q, i) => normalizaRespuesta(Array.isArray(d.respuestas) ? d.respuestas[i] : -1, q.opciones.length));
  const resultado = corrigeSesion(preguntas, respuestas);
  const tope = c.fila.minutes * 60_000;
  const duracionMs = via === 'app' && previo ? Math.max(0, Math.min(tope, Date.now() - new Date(previo.started_at as string).getTime())) : 0;
  const cambios = {
    finished_at: new Date().toISOString(), correct: resultado.aciertos, wrong: resultado.fallos, blank: resultado.blancos,
    score: resultado.nota, duration_ms: duracionMs, by_kind: resultado.porTipo, answers: respuestas, via,
  };

  // Una sola vez: `finished_at is null` va en la propia escritura (un doble toque no la reescribe).
  if (previo) {
    const { data, error } = await supabaseAdmin.from('psico_clase_resultados').update(cambios)
      .eq('organization_id', c.org).eq('id', previo.id as string).is('finished_at', null).select('id');
    if (error) return { success: false as const, error: fallo('entregaPsicoClase', error) };
    if (!data?.length) return { success: false as const, error: 'Ya has entregado este examen.' };
  } else {
    const { error } = await supabaseAdmin.from('psico_clase_resultados').insert({ organization_id: c.org, psico_clase_id: c.fila.id, user_id: auth.user.id, ...cambios });
    if (error) return { success: false as const, error: fallo('entregaPsicoClase', error) };
  }
  return { success: true as const, resultado, revision: preguntas.map((q, i) => ({ ...q, marcada: respuestas[i] })), duracionMs };
}

/** El repaso de un examen de clase ya entregado: las mismas preguntas, lo que marcó y por qué. */
export async function getRevisionPsicoClase(id: unknown): Promise<
  { success: true; revision: RevisionPsico; resultado: ResultadoPsico; duracionMs: number; titulo: string } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('psico', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const c = await acotado(auth.user.organizationId, auth.user.id, id);
  if (!c.ok) return { success: false as const, error: c.error };
  const preguntas = preguntasDe(c.fila);
  if (!preguntas) return { success: false as const, error: 'Este examen es de una versión anterior y ya no se puede repasar.' };

  const { data: r, error } = await supabaseAdmin.from('psico_clase_resultados').select('finished_at, answers, duration_ms')
    .eq('organization_id', c.org).eq('psico_clase_id', c.fila.id).eq('user_id', auth.user.id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getRevisionPsicoClase', error) };
  // La solución no se enseña hasta entregar.
  if (!r?.finished_at) return { success: false as const, error: 'La solución se ve cuando entregas el examen.' };
  const guardadas = Array.isArray(r.answers) ? r.answers : [];
  const respuestas = preguntas.map((q, i) => normalizaRespuesta(guardadas[i], q.opciones.length));
  return {
    success: true as const, titulo: c.fila.title,
    revision: preguntas.map((q, i) => ({ ...q, marcada: respuestas[i] })),
    resultado: corrigeSesion(preguntas, respuestas), duracionMs: (r.duration_ms as number) ?? 0,
  };
}
