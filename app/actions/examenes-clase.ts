'use server'
import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { requireModule } from '../lib/module-guard';
import { registraAccion } from '../lib/admin-audit';
import { fallo } from '../lib/fallos';
import { paginaCompleta } from '../lib/pagination';
import { ahoraEnZona, esFecha } from '../lib/asistencia';
import { nombreVisible } from '../lib/perfil-alumno';
import { filtroBancoPorAcademia, QUESTION_STATUS } from '../lib/questions';
import {
  aNota, corrigeClase, distribucionNotas, esParticipante, estadisticasPorPregunta, estadoEntrega, leeNotaProfesor,
  mediaNotas, normalizaRespuestas, notaVigente, MIN_PARA_MEDIA,
  type EstadoEntrega, type FilaPregunta, type FiltrosExamen, type PreguntaGuardada,
  MAX_ETIQUETA, fechaCortaEs, nombreDeAplicacion, aplicacionesQueSeSolapan,
} from '../lib/examen-clase';

/**
 * LOS EXÁMENES EN CLASE (regla 118): guardar el examen, aplicarlo a un turno y
 * llevar la nota de cada alumno.
 *
 * Las tres tablas (`exam_papers`, `exam_sittings`, `exam_results`) solo las
 * toca la clave de servicio: RLS sin políticas. Cada consulta lleva la
 * academia de la sesión DENTRO (regla 65) y el alumno sale de la sesión
 * (regla 1), nunca de un parámetro.
 *
 * Las respuestas las mete el alumno y las corrige el servidor contra la COPIA
 * de preguntas que se guardó con el examen (regla 110); el profesor, si quiere,
 * pone encima la nota oficial del papel.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hoyAcademia = () => ahoraEnZona(Date.now()).fecha;
const SIN_ACADEMIA = 'No hay una academia seleccionada.';

/** Limpia un texto corto: sin controles (regla 71), sin espacios de más y con tope. */
function texto(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

type FilaPaper = {
  id: string; title: string; model: string; minutes: number; total: number;
  filters: unknown; created_at: string; questions?: unknown;
};

const comoPreguntas = (v: unknown): PreguntaGuardada[] => (Array.isArray(v) ? (v as PreguntaGuardada[]) : []);

/** Los alumnos de UNA academia: miembros que no son admin (regla 65). */
async function alumnosDe(organizationId: string): Promise<{ data: { id: string; email: string | null; nombre: string | null }[]; error: string | null }> {
  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId).order('user_id').range(d, h));
  if (miembros.error) return { data: [], error: miembros.error };
  const ids = miembros.data.map((m) => m.user_id);
  const out: { id: string; email: string | null; nombre: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id, email, role').in('id', ids.slice(i, i + 200));
    if (error) return { data: [], error: fallo('alumnosDe', error) };
    for (const p of data ?? []) if (p.role !== 'admin' && p.role !== 'superadmin') out.push({ id: p.id as string, email: (p.email as string) ?? null, nombre: null });
  }
  // El nombre de verdad (regla 114), aparte: si las columnas aún no existen, sale el del correo.
  for (let i = 0; i < out.length; i += 200) {
    const trozo = out.slice(i, i + 200);
    const { data, error } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', trozo.map((a) => a.id));
    if (error) { fallo('alumnosDe', error); break; }
    const nombres = new Map((data ?? []).map((p) => [p.id as string, (p.full_name as string) ?? null]));
    for (const a of trozo) a.nombre = nombres.get(a.id) ?? null;
  }
  return { data: out, error: null };
}

/** Quiénes son de una aplicación: los de sus grupos, o toda la academia si no lleva ninguno. */
async function participantesDe(organizationId: string, classIds: string[]): Promise<{ data: { id: string; email: string | null; nombre: string | null }[]; error: string | null }> {
  const alumnos = await alumnosDe(organizationId);
  if (alumnos.error || classIds.length === 0) return alumnos;
  const miembros = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('class_members').select('user_id').in('class_id', classIds).order('user_id').range(d, h));
  if (miembros.error) return { data: [], error: miembros.error };
  const suyos = new Set(miembros.data.map((m) => m.user_id));
  return { data: alumnos.data.filter((a) => suyos.has(a.id)), error: null };
}

// ===========================================================================
// LA ACADEMIA: guardar exámenes
// ===========================================================================

export type ExamenGuardado = {
  id: string; titulo: string; modelo: string; minutos: number; total: number;
  filtros: FiltrosExamen; creado: string; aplicaciones: number;
  /** A qué grupos y qué día se ha puesto ya: para avisar antes de repetir (regla 124). */
  puestos: { fecha: string; classIds: string[] }[];
};

const aFiltros = (v: unknown): FiltrosExamen => {
  const f = (v ?? {}) as Partial<FiltrosExamen>;
  return {
    temas: Array.isArray(f.temas) ? f.temas.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [],
    dificultad: f.dificultad === 'easy' || f.dificultad === 'hard' ? f.dificultad : 'medium',
    evitarRepetidas: f.evitarRepetidas !== false,
  };
};

export async function getExamenesGuardados(): Promise<{ success: true; examenes: ExamenGuardado[] } | { success: false; error: string; faltaGuion?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const { data, error } = await supabaseAdmin
    .from('exam_papers').select('id, title, model, minutes, total, filters, created_at')
    .eq('organization_id', org).order('created_at', { ascending: false }).limit(100);
  if (error) {
    fallo('getExamenesGuardados', error);
    return { success: false as const, error: 'Los exámenes guardados todavía no están activados: falta ejecutar docs/sql/examenes-clase.sql.', faltaGuion: true };
  }
  const filas = (data ?? []) as FilaPaper[];
  const cuenta = new Map<string, number>();
  const puestosDe = new Map<string, { fecha: string; classIds: string[] }[]>();
  if (filas.length) {
    const { data: aps, error: e2 } = await supabaseAdmin.from('exam_sittings').select('paper_id, sat_on, class_ids').eq('organization_id', org).in('paper_id', filas.map((f) => f.id)).limit(2000);
    if (e2) fallo('getExamenesGuardados', e2);
    for (const a of aps ?? []) {
      const pid = a.paper_id as string;
      cuenta.set(pid, (cuenta.get(pid) ?? 0) + 1);
      const l = puestosDe.get(pid) ?? [];
      l.push({ fecha: a.sat_on as string, classIds: (a.class_ids as string[]) ?? [] });
      puestosDe.set(pid, l);
    }
  }
  return {
    success: true as const,
    examenes: filas.map((f) => ({
      id: f.id, titulo: f.title, modelo: f.model, minutos: f.minutes, total: f.total,
      filtros: aFiltros(f.filters), creado: f.created_at, aplicaciones: cuenta.get(f.id) ?? 0, puestos: puestosDe.get(f.id) ?? [],
    })),
  };
}

/**
 * Guarda el examen que se acaba de preparar. Del navegador llegan SOLO los ids
 * de las preguntas y los datos de la portada: el contenido se lee del banco
 * aquí (regla 2), de las preguntas de ESTA academia (regla 75), y se guarda una
 * copia.
 */
export async function guardaExamen(input: unknown): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const d = (input ?? {}) as { titulo?: unknown; modelo?: unknown; minutos?: unknown; filtros?: unknown; ids?: unknown };
  const titulo = texto(d.titulo, 60);
  if (!titulo) return { success: false as const, error: 'Ponle un nombre al examen.' };
  const modelo = texto(d.modelo, 1).toUpperCase() || 'A';
  if (!/^[A-D]$/.test(modelo)) return { success: false as const, error: 'El modelo es A, B, C o D.' };
  const minutos = Math.round(Number(d.minutos));
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 199) return { success: false as const, error: 'Los minutos van de 1 a 199.' };
  const ids = Array.isArray(d.ids) ? [...new Set(d.ids.filter(esUuid))] : [];
  if (ids.length < 1 || ids.length > 100) return { success: false as const, error: 'El examen necesita entre 1 y 100 preguntas.' };

  // Las preguntas, del banco y en el orden pedido.
  const { data: temasDb, error: errTemas } = await supabaseAdmin.from('subjects').select('id, title');
  if (errTemas) return { success: false as const, error: fallo('guardaExamen', errTemas) };
  const tema = new Map(((temasDb ?? []) as { id: number; title: string }[]).map((s) => [s.id, s.title]));

  const porId = new Map<string, PreguntaGuardada>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabaseAdmin
      .from('question_bank')
      .select('id, subject_id, question_text, options, correct_index, explanation, legal_reference, difficulty_level')
      .eq('status', QUESTION_STATUS.ACTIVE)
      .or(filtroBancoPorAcademia(org))
      .in('id', ids.slice(i, i + 100));
    if (error) return { success: false as const, error: fallo('guardaExamen', error) };
    for (const f of data ?? []) {
      const opciones = Array.isArray(f.options) ? (f.options as unknown[]).map((o) => String(o ?? '')) : [];
      if (opciones.length < 2 || !Number.isInteger(f.correct_index)) continue;
      porId.set(f.id as string, {
        id: f.id as string, q: String(f.question_text ?? ''), o: opciones, c: f.correct_index as number,
        t: f.subject_id != null ? tema.get(f.subject_id as number) ?? 'Sin tema' : 'Sin tema',
        e: (f.explanation as string) ?? null, r: (f.legal_reference as string) ?? null,
        d: typeof f.difficulty_level === 'number' ? f.difficulty_level : 2,
      });
    }
  }
  const preguntas = ids.map((id) => porId.get(id)).filter((q): q is PreguntaGuardada => !!q);
  if (preguntas.length !== ids.length) {
    return { success: false as const, error: 'Alguna pregunta ya no está en el banco. Prepara el examen otra vez.' };
  }

  const { data: fila, error } = await supabaseAdmin
    .from('exam_papers')
    .insert({
      organization_id: org, title: titulo, model: modelo, minutes: minutos, filters: aFiltros(d.filtros),
      questions: preguntas, question_ids: ids, total: preguntas.length, created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error || !fila) return { success: false as const, error: fallo('guardaExamen', error ?? { message: 'sin fila' }) };
  registraAccion({ actorId: auth.user.id, action: 'save_exam_paper', target: titulo, detail: { preguntas: preguntas.length }, organizationId: org });
  return { success: true as const, id: fila.id as string };
}

/** Un examen guardado entero, con sus respuestas: para volver a descargar los PDF. */
export async function getExamenGuardado(id: unknown): Promise<
  { success: true; examen: ExamenGuardado; preguntas: PreguntaGuardada[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };
  const { data, error } = await supabaseAdmin
    .from('exam_papers').select('id, title, model, minutes, total, filters, created_at, questions')
    .eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getExamenGuardado', error) };
  if (!data) return { success: false as const, error: 'Ese examen no existe.' };
  const f = data as FilaPaper;
  return {
    success: true as const,
    examen: { id: f.id, titulo: f.title, modelo: f.model, minutos: f.minutes, total: f.total, filtros: aFiltros(f.filters), creado: f.created_at, aplicaciones: 0, puestos: [] },
    preguntas: comoPreguntas(f.questions),
  };
}

export async function borraExamen(id: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false, error: 'Datos no válidos.' };

  const { data: aps, error: leer } = await supabaseAdmin.from('exam_sittings').select('id').eq('organization_id', org).eq('paper_id', id).limit(1);
  if (leer) return { success: false, error: fallo('borraExamen', leer) };
  if (aps?.length) return { success: false, error: 'Este examen se ha puesto a un turno: borra primero el examen puesto en «Exámenes en clase».' };

  const { data, error } = await supabaseAdmin.from('exam_papers').delete().eq('organization_id', org).eq('id', id).select('title');
  if (error) return { success: false, error: fallo('borraExamen', error) };
  if (data?.length) registraAccion({ actorId: auth.user.id, action: 'delete_exam', target: String(data[0].title), organizationId: org });
  return { success: true };
}

// ===========================================================================
// LA ACADEMIA: aplicar a un turno y ver cómo ha ido
// ===========================================================================

export type Aplicacion = {
  id: string; paperId: string; titulo: string; etiqueta: string; fecha: string; cierre: string | null;
  grupos: string[]; participantes: number; entregados: number; ausentes: number;
  /** La media de las notas vigentes; `null` si no hay (regla 8). */
  media: number | null;
};

export async function aplicaExamen(input: unknown): Promise<{ success: true; id: string } | { success: false; error: string; yaPuesto?: string[] }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const d = (input ?? {}) as { paperId?: unknown; etiqueta?: unknown; fecha?: unknown; grupos?: unknown; cierre?: unknown; confirmaRepetido?: unknown };
  if (!esUuid(d.paperId)) return { success: false as const, error: 'Datos no válidos.' };
  if (!esFecha(d.fecha)) return { success: false as const, error: 'Falta el día del examen.' };
  const fecha = d.fecha as string;
  let cierre: string | null = null;
  if (d.cierre !== null && d.cierre !== undefined && String(d.cierre) !== '') {
    if (!esFecha(d.cierre)) return { success: false as const, error: 'El último día para entregar no es una fecha válida.' };
    cierre = d.cierre as string;
    if (cierre < fecha) return { success: false as const, error: 'El último día para entregar no puede ser anterior al examen.' };
  }
  const grupos = Array.isArray(d.grupos) ? [...new Set(d.grupos.filter(esUuid))] : [];

  const { data: paper, error: e1 } = await supabaseAdmin.from('exam_papers').select('id, title').eq('organization_id', org).eq('id', d.paperId).maybeSingle();
  if (e1) return { success: false as const, error: fallo('aplicaExamen', e1) };
  if (!paper) return { success: false as const, error: 'Ese examen no existe.' };

  const { data: todos, error: e2 } = await supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org);
  if (e2) return { success: false as const, error: fallo('aplicaExamen', e2) };
  const nombreGrupo = new Map((todos ?? []).map((g) => [g.id as string, g.name as string]));
  if (grupos.some((g) => !nombreGrupo.has(g))) return { success: false as const, error: 'Algún grupo no es de tu academia.' };

  // El mismo examen al mismo grupo dos veces duplica a esos alumnos (lo ven dos
  // veces y sus notas cuentan dos veces): solo se hace si se confirma (regla 124).
  const { data: previos, error: e3 } = await supabaseAdmin
    .from('exam_sittings').select('id, label, sat_on, class_ids').eq('organization_id', org).eq('paper_id', paper.id).limit(500);
  if (e3) return { success: false as const, error: fallo('aplicaExamen', e3) };
  const solapan = aplicacionesQueSeSolapan(
    (previos ?? []).map((p) => ({ id: p.id as string, fecha: p.sat_on as string, classIds: (p.class_ids as string[]) ?? [], etiqueta: p.label as string })),
    grupos,
  );
  if (solapan.length && d.confirmaRepetido !== true) {
    const cuales = solapan.map((p) => {
      const quien = p.classIds.length ? p.classIds.map((c) => nombreGrupo.get(c) ?? 'un grupo borrado').join(', ') : 'toda la academia';
      return `${quien} el ${fechaCortaEs(p.fecha)}`;
    });
    return {
      success: false as const,
      error: `Ya has puesto «${paper.title}» a ${cuales.join('; ')}. Si lo pones otra vez, esos alumnos lo verán dos veces y sus notas contarán dos veces.`,
      yaPuesto: cuales,
    };
  }

  // Sin nombre propio, se llama como lo que es: a quién y qué día.
  const propio = texto(d.etiqueta, MAX_ETIQUETA);
  const etiqueta = propio || nombreDeAplicacion(grupos.map((g) => nombreGrupo.get(g) ?? ''), fecha);

  const { data, error } = await supabaseAdmin
    .from('exam_sittings')
    .insert({ organization_id: org, paper_id: paper.id, label: etiqueta, sat_on: fecha, class_ids: grupos, closes_on: cierre, created_by: auth.user.id })
    .select('id').single();
  if (error || !data) return { success: false as const, error: fallo('aplicaExamen', error ?? { message: 'sin fila' }) };
  registraAccion({ actorId: auth.user.id, action: 'apply_exam', target: `${paper.title} · ${etiqueta}`, detail: { fecha, grupos: grupos.length, repetido: solapan.length > 0 }, organizationId: org });
  return { success: true as const, id: data.id as string };
}

export async function getAplicaciones(): Promise<{ success: true; aplicaciones: Aplicacion[] } | { success: false; error: string; faltaGuion?: boolean }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const { data: sits, error } = await supabaseAdmin
    .from('exam_sittings').select('id, paper_id, label, sat_on, closes_on, class_ids')
    .eq('organization_id', org).order('sat_on', { ascending: false }).limit(100);
  if (error) {
    fallo('getAplicaciones', error);
    return { success: false as const, error: 'Los exámenes en clase todavía no están activados: falta ejecutar docs/sql/examenes-clase.sql.', faltaGuion: true };
  }
  const filas = sits ?? [];
  if (!filas.length) return { success: true as const, aplicaciones: [] };

  const ids = filas.map((s) => s.id as string);
  const [papers, grupos, resultados, alumnos] = await Promise.all([
    supabaseAdmin.from('exam_papers').select('id, title').eq('organization_id', org).in('id', [...new Set(filas.map((s) => s.paper_id as string))]),
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    paginaCompleta<{ sitting_id: string; score: unknown; teacher_score: unknown; absent: boolean; submitted_at: string | null }>(async (d, h) => await
      supabaseAdmin.from('exam_results').select('sitting_id, user_id, score, teacher_score, absent, submitted_at')
        .eq('organization_id', org).in('sitting_id', ids).order('sitting_id').order('user_id').range(d, h)),
    alumnosDe(org),
  ]);
  const errorBase = papers.error ?? grupos.error;
  if (errorBase) return { success: false as const, error: fallo('getAplicaciones', errorBase) };
  if (resultados.error) return { success: false as const, error: resultados.error };
  if (alumnos.error) return { success: false as const, error: alumnos.error };

  const titulo = new Map((papers.data ?? []).map((p) => [p.id as string, p.title as string]));
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));

  // Cuántos alumnos tiene cada grupo (para contar los participantes).
  const todasLasClases = [...new Set(filas.flatMap((s) => (s.class_ids as string[]) ?? []))];
  const miembrosDe = new Map<string, Set<string>>();
  if (todasLasClases.length) {
    const m = await paginaCompleta<{ class_id: string; user_id: string }>(async (d, h) => await
      supabaseAdmin.from('class_members').select('class_id, user_id').in('class_id', todasLasClases).order('class_id').order('user_id').range(d, h));
    if (m.error) return { success: false as const, error: m.error };
    for (const x of m.data) { const s = miembrosDe.get(x.class_id) ?? new Set<string>(); s.add(x.user_id); miembrosDe.set(x.class_id, s); }
  }
  const soloAlumnos = new Set(alumnos.data.map((a) => a.id));

  const aplicaciones: Aplicacion[] = filas.map((s) => {
    const clases = (s.class_ids as string[]) ?? [];
    const gente = clases.length === 0
      ? soloAlumnos
      : new Set([...clases.flatMap((c) => [...(miembrosDe.get(c) ?? [])])].filter((u) => soloAlumnos.has(u)));
    const suyos = resultados.data.filter((r) => r.sitting_id === s.id);
    const notas = suyos.map((r) => notaVigente({ teacher_score: aNota(r.teacher_score), score: aNota(r.score) })).filter((n): n is number => n !== null);
    return {
      id: s.id as string, paperId: s.paper_id as string, titulo: titulo.get(s.paper_id as string) ?? '(examen borrado)',
      etiqueta: s.label as string, fecha: s.sat_on as string, cierre: (s.closes_on as string) ?? null,
      grupos: clases.map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
      participantes: gente.size, entregados: suyos.filter((r) => r.submitted_at).length, ausentes: suyos.filter((r) => r.absent).length,
      media: mediaNotas(notas),
    };
  });
  return { success: true as const, aplicaciones };
}

export type FilaParticipante = {
  id: string; nombre: string; email: string | null; estado: EstadoEntrega;
  /** La calculada con las respuestas que metió el alumno. */
  nota: number | null;
  /** La que puso el profesor desde el papel. */
  notaProfesor: number | null;
  aciertos: number | null; fallos: number | null; blancos: number | null;
};

export type DetalleAplicacion = {
  aplicacion: Omit<Aplicacion, 'media' | 'participantes' | 'entregados' | 'ausentes'> & { total: number; minutos: number };
  participantes: FilaParticipante[];
  resumen: { participantes: number; entregados: number; ausentes: number; pendientes: number; media: number | null; mediaProfesor: number | null; distribucion: number[] };
  preguntas: FilaPregunta[];
};

export async function getAplicacion(id: unknown): Promise<{ success: true; detalle: DetalleAplicacion } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: s, error } = await supabaseAdmin
    .from('exam_sittings').select('id, paper_id, label, sat_on, closes_on, class_ids').eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) return { success: false as const, error: fallo('getAplicacion', error) };
  if (!s) return { success: false as const, error: 'Ese examen puesto no existe.' };

  const [paper, grupos, resultados, gente] = await Promise.all([
    supabaseAdmin.from('exam_papers').select('title, minutes, total, questions').eq('organization_id', org).eq('id', s.paper_id as string).maybeSingle(),
    supabaseAdmin.from('class_groups').select('id, name').eq('organization_id', org),
    supabaseAdmin.from('exam_results').select('user_id, answers, correct, wrong, blank, score, teacher_score, absent, submitted_at').eq('organization_id', org).eq('sitting_id', id).limit(5000),
    participantesDe(org, (s.class_ids as string[]) ?? []),
  ]);
  const errorBase = paper.error ?? grupos.error ?? resultados.error;
  if (errorBase) return { success: false as const, error: fallo('getAplicacion', errorBase) };
  if (gente.error) return { success: false as const, error: gente.error };
  if (!paper.data) return { success: false as const, error: 'El examen de este turno ya no existe.' };

  const hoy = hoyAcademia();
  const nombreGrupo = new Map((grupos.data ?? []).map((g) => [g.id as string, g.name as string]));
  const porAlumno = new Map((resultados.data ?? []).map((r) => [r.user_id as string, r]));

  const participantes: FilaParticipante[] = gente.data.map((a) => {
    const r = porAlumno.get(a.id);
    return {
      id: a.id,
      nombre: nombreVisible(a.nombre, a.email) || 'Alumno',
      email: a.email,
      estado: estadoEntrega({ satOn: s.sat_on as string, closesOn: (s.closes_on as string) ?? null, hoy, absent: r?.absent === true, entregado: !!r?.submitted_at }),
      nota: aNota(r?.score), notaProfesor: aNota(r?.teacher_score),
      aciertos: (r?.correct as number) ?? null, fallos: (r?.wrong as number) ?? null, blancos: (r?.blank as number) ?? null,
    };
  });
  participantes.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const vigentes = participantes.map((p) => notaVigente({ teacher_score: p.notaProfesor, score: p.nota })).filter((n): n is number => n !== null);
  const delProfesor = participantes.map((p) => p.notaProfesor).filter((n): n is number => n !== null);
  const entregas = (resultados.data ?? []).filter((r) => r.submitted_at && Array.isArray(r.answers) && porAlumno.has(r.user_id as string)
    && gente.data.some((g) => g.id === r.user_id)).map((r) => r.answers as number[]);

  return {
    success: true as const,
    detalle: {
      aplicacion: {
        id: s.id as string, paperId: s.paper_id as string, titulo: paper.data.title as string, etiqueta: s.label as string,
        fecha: s.sat_on as string, cierre: (s.closes_on as string) ?? null,
        grupos: ((s.class_ids as string[]) ?? []).map((c) => nombreGrupo.get(c) ?? '(grupo borrado)'),
        total: paper.data.total as number, minutos: paper.data.minutes as number,
      },
      participantes,
      resumen: {
        participantes: participantes.length,
        entregados: participantes.filter((p) => p.estado === 'entregado').length,
        ausentes: participantes.filter((p) => p.estado === 'ausente').length,
        pendientes: participantes.filter((p) => p.estado === 'pendiente' || p.estado === 'proximo').length,
        media: mediaNotas(vigentes), mediaProfesor: mediaNotas(delProfesor), distribucion: distribucionNotas(vigentes),
      },
      preguntas: entregas.length ? estadisticasPorPregunta(comoPreguntas(paper.data.questions), entregas) : [],
    },
  };
}

/**
 * La nota oficial del papel y/o la ausencia de un alumno. Solo toca esos dos
 * campos: no pisa las respuestas que haya metido él.
 */
export async function setResultadoProfesor(input: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };

  const d = (input ?? {}) as { aplicacionId?: unknown; alumnoId?: unknown; nota?: unknown; ausente?: unknown };
  if (!esUuid(d.aplicacionId) || !esUuid(d.alumnoId)) return { success: false, error: 'Datos no válidos.' };
  const cambios: Record<string, unknown> = {};
  if ('nota' in d) {
    const n = leeNotaProfesor(d.nota);
    if (!n.ok) return { success: false, error: n.error };
    cambios.teacher_score = n.nota;
  }
  if ('ausente' in d) {
    if (typeof d.ausente !== 'boolean') return { success: false, error: 'Datos no válidos.' };
    cambios.absent = d.ausente;
  }
  if (!Object.keys(cambios).length) return { success: false, error: 'No hay nada que guardar.' };

  const { data: s, error } = await supabaseAdmin.from('exam_sittings').select('id, class_ids').eq('organization_id', org).eq('id', d.aplicacionId).maybeSingle();
  if (error) return { success: false, error: fallo('setResultadoProfesor', error) };
  if (!s) return { success: false, error: 'Ese examen puesto no existe.' };
  const gente = await participantesDe(org, (s.class_ids as string[]) ?? []);
  if (gente.error) return { success: false, error: gente.error };
  if (!gente.data.some((a) => a.id === d.alumnoId)) return { success: false, error: 'Ese alumno no es de este examen.' };

  const { error: e2 } = await supabaseAdmin
    .from('exam_results')
    .upsert({ sitting_id: s.id, organization_id: org, user_id: d.alumnoId, ...cambios, updated_at: new Date().toISOString() }, { onConflict: 'sitting_id,user_id' });
  if (e2) return { success: false, error: fallo('setResultadoProfesor', e2) };
  registraAccion({ actorId: auth.user.id, action: 'set_exam_result', target: d.alumnoId as string, detail: { ...cambios }, organizationId: org });
  return { success: true };
}

/** Cuántas notas se pueden guardar de una vez: una clase entera con holgura. */
const MAX_LOTE = 300;

/**
 * Guarda de golpe las notas oficiales que el profesor ha pegado (regla 124).
 *
 * TODO O NADA: si una fila no vale o un alumno no es de este examen, no se
 * guarda ninguna, y se dice cuál. Una nota a medias es peor que ninguna: el
 * profesor creería que la clase entera está puesta.
 *
 * Quien trae nota estuvo, así que se le quita la marca de «no se presentó»; y a
 * quien se marca ausente se le quita la nota oficial, que ya no puede tener.
 * Lo que el alumno entregó (sus respuestas y la nota calculada) no se toca.
 */
export async function setResultadosProfesor(input: unknown): Promise<{ success: true; guardadas: number } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: SIN_ACADEMIA };

  const d = (input ?? {}) as { aplicacionId?: unknown; filas?: unknown };
  if (!esUuid(d.aplicacionId) || !Array.isArray(d.filas)) return { success: false as const, error: 'Datos no válidos.' };
  if (d.filas.length === 0) return { success: false as const, error: 'No hay ninguna nota que guardar.' };
  if (d.filas.length > MAX_LOTE) return { success: false as const, error: `Demasiadas notas de una vez (máximo ${MAX_LOTE}).` };

  const filas = new Map<string, { teacher_score: number | null; absent: boolean }>();
  for (const f of d.filas) {
    const x = (f ?? {}) as { alumnoId?: unknown; nota?: unknown; ausente?: unknown };
    if (!esUuid(x.alumnoId)) return { success: false as const, error: 'Datos no válidos.' };
    if (x.ausente === true) { filas.set(x.alumnoId as string, { teacher_score: null, absent: true }); continue; }
    const n = leeNotaProfesor(x.nota);
    if (!n.ok) return { success: false as const, error: n.error };
    if (n.nota === null) return { success: false as const, error: 'Falta una nota.' };
    filas.set(x.alumnoId as string, { teacher_score: n.nota, absent: false });
  }

  const { data: s, error } = await supabaseAdmin.from('exam_sittings').select('id, class_ids').eq('organization_id', org).eq('id', d.aplicacionId).maybeSingle();
  if (error) return { success: false as const, error: fallo('setResultadosProfesor', error) };
  if (!s) return { success: false as const, error: 'Ese examen puesto no existe.' };
  const gente = await participantesDe(org, (s.class_ids as string[]) ?? []);
  if (gente.error) return { success: false as const, error: gente.error };
  const suyos = new Set(gente.data.map((a) => a.id));
  if ([...filas.keys()].some((id) => !suyos.has(id))) return { success: false as const, error: 'Algún alumno no es de este examen.' };

  const ahora = new Date().toISOString();
  const { error: e2 } = await supabaseAdmin
    .from('exam_results')
    .upsert([...filas].map(([alumnoId, v]) => ({ sitting_id: s.id, organization_id: org, user_id: alumnoId, ...v, updated_at: ahora })), { onConflict: 'sitting_id,user_id' });
  if (e2) return { success: false as const, error: fallo('setResultadosProfesor', e2) };
  registraAccion({ actorId: auth.user.id, action: 'set_exam_result', target: d.aplicacionId as string, detail: { lote: filas.size }, organizationId: org });
  return { success: true as const, guardadas: filas.size };
}

/** Que el alumno pueda volver a meter sus respuestas (se equivocó al teclearlas). */
export async function reiniciaEntrega(input: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  const d = (input ?? {}) as { aplicacionId?: unknown; alumnoId?: unknown };
  if (!esUuid(d.aplicacionId) || !esUuid(d.alumnoId)) return { success: false, error: 'Datos no válidos.' };

  const { error } = await supabaseAdmin
    .from('exam_results')
    .update({ answers: null, correct: null, wrong: null, blank: null, score: null, submitted_at: null, updated_at: new Date().toISOString() })
    .eq('organization_id', org).eq('sitting_id', d.aplicacionId).eq('user_id', d.alumnoId);
  if (error) return { success: false, error: fallo('reiniciaEntrega', error) };
  registraAccion({ actorId: auth.user.id, action: 'set_exam_result', target: d.alumnoId as string, detail: { reinicia: true }, organizationId: org });
  return { success: true };
}

/** Cambia el último día para entregar. `null` lo deja siempre abierto. */
export async function setCierreAplicacion(input: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  const d = (input ?? {}) as { aplicacionId?: unknown; cierre?: unknown };
  if (!esUuid(d.aplicacionId)) return { success: false, error: 'Datos no válidos.' };
  const cierre = d.cierre === null || d.cierre === '' ? null : esFecha(d.cierre) ? (d.cierre as string) : undefined;
  if (cierre === undefined) return { success: false, error: 'El último día para entregar no es una fecha válida.' };

  const { error } = await supabaseAdmin.from('exam_sittings').update({ closes_on: cierre }).eq('organization_id', org).eq('id', d.aplicacionId);
  if (error) return { success: false, error: fallo('setCierreAplicacion', error) };
  return { success: true };
}

export async function borraAplicacion(id: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false, error: SIN_ACADEMIA };
  if (!esUuid(id)) return { success: false, error: 'Datos no válidos.' };
  const { data, error } = await supabaseAdmin.from('exam_sittings').delete().eq('organization_id', org).eq('id', id).select('label');
  if (error) return { success: false, error: fallo('borraAplicacion', error) };
  if (data?.length) registraAccion({ actorId: auth.user.id, action: 'delete_exam', target: String(data[0].label), organizationId: org });
  return { success: true };
}

// ===========================================================================
// EL ALUMNO: meter sus respuestas y ver su nota
// ===========================================================================

export type MiExamenClase = {
  aplicacionId: string; titulo: string; etiqueta: string; fecha: string; cierre: string | null;
  total: number; minutos: number; estado: EstadoEntrega;
  /** La que vale: la del profesor si la puso; si no, la que salió de sus respuestas. */
  nota: number | null;
  notaOficial: boolean;
  aciertos: number | null; fallos: number | null; blancos: number | null;
  /** La media de su turno; solo si han entregado al menos tres (no señala a nadie). */
  mediaTurno: number | null;
};

async function misGrupos(organizationId: string, userId: string): Promise<{ data: string[]; error: string | null }> {
  const { data, error } = await supabaseAdmin
    .from('class_members').select('class_id, class_groups!inner(organization_id)')
    .eq('user_id', userId).eq('class_groups.organization_id', organizationId).limit(500);
  if (error) return { data: [], error: fallo('misGrupos', error) };
  return { data: (data ?? []).map((r) => r.class_id as string), error: null };
}

export async function getMisExamenesClase(): Promise<{ success: true; examenes: MiExamenClase[] } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('presencial', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hemos encontrado tu academia.' };

  const { data: sits, error } = await supabaseAdmin
    .from('exam_sittings').select('id, paper_id, label, sat_on, closes_on, class_ids')
    .eq('organization_id', org).order('sat_on', { ascending: false }).limit(200);
  if (error) {
    // Sin las tablas todavía, el módulo se abre igual: simplemente no hay exámenes.
    fallo('getMisExamenesClase', error);
    return { success: true as const, examenes: [] };
  }
  const grupos = await misGrupos(org, auth.user.id);
  if (grupos.error) return { success: false as const, error: grupos.error };
  const mias = (sits ?? []).filter((s) => esParticipante((s.class_ids as string[]) ?? [], grupos.data));
  if (!mias.length) return { success: true as const, examenes: [] };

  const ids = mias.map((s) => s.id as string);
  const [papers, suyos, todos] = await Promise.all([
    supabaseAdmin.from('exam_papers').select('id, title, minutes, total').eq('organization_id', org).in('id', [...new Set(mias.map((s) => s.paper_id as string))]),
    supabaseAdmin.from('exam_results').select('sitting_id, correct, wrong, blank, score, teacher_score, absent, submitted_at').eq('organization_id', org).eq('user_id', auth.user.id).in('sitting_id', ids),
    // Solo las notas, sin quién: para la media del turno (nunca se devuelven ids de otros).
    paginaCompleta<{ sitting_id: string; score: unknown; teacher_score: unknown }>(async (d, h) => await
      supabaseAdmin.from('exam_results').select('sitting_id, user_id, score, teacher_score').eq('organization_id', org).in('sitting_id', ids).eq('absent', false).order('sitting_id').order('user_id').range(d, h)),
  ]);
  const errorBase = papers.error ?? suyos.error;
  if (errorBase) return { success: false as const, error: fallo('getMisExamenesClase', errorBase) };
  if (todos.error) return { success: false as const, error: todos.error };

  const paper = new Map((papers.data ?? []).map((p) => [p.id as string, p]));
  const mio = new Map((suyos.data ?? []).map((r) => [r.sitting_id as string, r]));
  const hoy = hoyAcademia();

  const examenes: MiExamenClase[] = mias.map((s) => {
    const r = mio.get(s.id as string);
    const p = paper.get(s.paper_id as string);
    const notas = todos.data.filter((x) => x.sitting_id === s.id)
      .map((x) => notaVigente({ teacher_score: aNota(x.teacher_score), score: aNota(x.score) })).filter((n): n is number => n !== null);
    const profesor = aNota(r?.teacher_score);
    return {
      aplicacionId: s.id as string, titulo: (p?.title as string) ?? '(examen borrado)', etiqueta: s.label as string,
      fecha: s.sat_on as string, cierre: (s.closes_on as string) ?? null, total: (p?.total as number) ?? 0, minutos: (p?.minutes as number) ?? 0,
      estado: estadoEntrega({ satOn: s.sat_on as string, closesOn: (s.closes_on as string) ?? null, hoy, absent: r?.absent === true, entregado: !!r?.submitted_at }),
      nota: notaVigente({ teacher_score: profesor, score: aNota(r?.score) }), notaOficial: profesor !== null,
      aciertos: (r?.correct as number) ?? null, fallos: (r?.wrong as number) ?? null, blancos: (r?.blank as number) ?? null,
      mediaTurno: notas.length >= MIN_PARA_MEDIA ? mediaNotas(notas) : null,
    };
  });
  return { success: true as const, examenes };
}

export type RevisionClase = {
  titulo: string; nota: number | null; notaOficial: boolean;
  aciertos: number; fallos: number; blancos: number;
  preguntas: { n: number; tema: string; enunciado: string; opciones: string[]; correcta: number; marcada: number; explicacion: string | null; referencia: string | null; flag: 'ok' | 'mal' | 'blanco' }[];
};

/**
 * Entrega: el servidor corrige contra la copia guardada del examen. Una sola
 * vez, y solo dentro del plazo: lo que no se puede es corregir, ver la
 * solución y volver a entregar.
 */
export async function entregaExamenClase(input: unknown): Promise<{ success: true; revision: RevisionClase } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('presencial', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hemos encontrado tu academia.' };

  const d = (input ?? {}) as { aplicacionId?: unknown; respuestas?: unknown };
  if (!esUuid(d.aplicacionId)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: s, error } = await supabaseAdmin
    .from('exam_sittings').select('id, paper_id, sat_on, closes_on, class_ids').eq('organization_id', org).eq('id', d.aplicacionId).maybeSingle();
  if (error) return { success: false as const, error: fallo('entregaExamenClase', error) };
  if (!s) return { success: false as const, error: 'Ese examen no existe.' };

  const grupos = await misGrupos(org, auth.user.id);
  if (grupos.error) return { success: false as const, error: grupos.error };
  if (!esParticipante((s.class_ids as string[]) ?? [], grupos.data)) return { success: false as const, error: 'Ese examen no es de tu turno.' };

  const [paper, previo] = await Promise.all([
    supabaseAdmin.from('exam_papers').select('title, total, questions').eq('organization_id', org).eq('id', s.paper_id as string).maybeSingle(),
    supabaseAdmin.from('exam_results').select('id, absent, submitted_at, teacher_score').eq('organization_id', org).eq('sitting_id', s.id as string).eq('user_id', auth.user.id).maybeSingle(),
  ]);
  const errorBase = paper.error ?? previo.error;
  if (errorBase) return { success: false as const, error: fallo('entregaExamenClase', errorBase) };
  if (!paper.data) return { success: false as const, error: 'Ese examen ya no existe.' };

  const estado = estadoEntrega({
    satOn: s.sat_on as string, closesOn: (s.closes_on as string) ?? null, hoy: hoyAcademia(),
    absent: previo.data?.absent === true, entregado: !!previo.data?.submitted_at,
  });
  if (estado === 'entregado') return { success: false as const, error: 'Ya entregaste este examen. Si te equivocaste, díselo a tu profesor.' };
  if (estado === 'proximo') return { success: false as const, error: 'Todavía no es el día del examen.' };
  if (estado === 'cerrado') return { success: false as const, error: 'Ya pasó el plazo para meter tus respuestas.' };
  if (estado === 'ausente') return { success: false as const, error: 'Tu profesor te marcó como no presentado.' };

  const preguntas = comoPreguntas(paper.data.questions);
  const respuestas = normalizaRespuestas(d.respuestas, preguntas.length);
  const c = corrigeClase(preguntas, respuestas);
  const fila = {
    answers: respuestas, correct: c.correct, wrong: c.wrong, blank: c.blank, score: c.score,
    submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  // Una sola vez: `submitted_at is null` va EN la escritura, así que un doble toque no la repite.
  if (previo.data) {
    const { data, error: e } = await supabaseAdmin.from('exam_results').update(fila).eq('organization_id', org).eq('id', previo.data.id as string).is('submitted_at', null).select('id');
    if (e) return { success: false as const, error: fallo('entregaExamenClase', e) };
    if (!data?.length) return { success: false as const, error: 'Ya entregaste este examen.' };
  } else {
    const { error: e } = await supabaseAdmin.from('exam_results').insert({ sitting_id: s.id, organization_id: org, user_id: auth.user.id, ...fila });
    if (e) return { success: false as const, error: fallo('entregaExamenClase', e) };
  }

  const profesor = aNota(previo.data?.teacher_score);
  return { success: true as const, revision: aRevision(paper.data.title as string, preguntas, respuestas, c, profesor) };
}

function aRevision(titulo: string, preguntas: PreguntaGuardada[], respuestas: number[], c: ReturnType<typeof corrigeClase>, profesor: number | null): RevisionClase {
  return {
    titulo, nota: notaVigente({ teacher_score: profesor, score: c.score }), notaOficial: profesor !== null,
    aciertos: c.correct, fallos: c.wrong, blancos: c.blank,
    preguntas: preguntas.map((q, i) => ({
      n: i + 1, tema: q.t, enunciado: q.q, opciones: q.o, correcta: q.c, marcada: respuestas[i],
      explicacion: q.e, referencia: q.r, flag: c.flags[i],
    })),
  };
}

/** La revisión de un examen YA entregado: sus respuestas, las correctas y el porqué. */
export async function getRevisionExamenClase(aplicacionId: unknown): Promise<{ success: true; revision: RevisionClase } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const modulo = await requireModule('presencial', auth.user.organizationId);
  if (!modulo.ok) return { success: false as const, error: modulo.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hemos encontrado tu academia.' };
  if (!esUuid(aplicacionId)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: r, error } = await supabaseAdmin
    .from('exam_results').select('sitting_id, answers, teacher_score, submitted_at')
    .eq('organization_id', org).eq('user_id', auth.user.id).eq('sitting_id', aplicacionId).maybeSingle();
  if (error) return { success: false as const, error: fallo('getRevisionExamenClase', error) };
  // Sin entregar no se enseña nada: la revisión lleva las respuestas correctas.
  if (!r || !r.submitted_at || !Array.isArray(r.answers)) return { success: false as const, error: 'Todavía no has entregado este examen.' };

  const { data: s } = await supabaseAdmin.from('exam_sittings').select('paper_id').eq('organization_id', org).eq('id', aplicacionId).maybeSingle();
  if (!s) return { success: false as const, error: 'Ese examen no existe.' };
  const { data: paper, error: e2 } = await supabaseAdmin.from('exam_papers').select('title, questions').eq('organization_id', org).eq('id', s.paper_id as string).maybeSingle();
  if (e2) return { success: false as const, error: fallo('getRevisionExamenClase', e2) };
  if (!paper) return { success: false as const, error: 'Ese examen ya no existe.' };

  const preguntas = comoPreguntas(paper.questions);
  const respuestas = normalizaRespuestas(r.answers, preguntas.length);
  return { success: true as const, revision: aRevision(paper.title as string, preguntas, respuestas, corrigeClase(preguntas, respuestas), aNota(r.teacher_score)) };
}
