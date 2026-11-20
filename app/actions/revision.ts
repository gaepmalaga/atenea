'use server'

/**
 * LA BANDEJA DE LOS TUTORES (regla 138).
 *
 * Todo lo que espera a un tutor, junto y con su número: preguntas pendientes,
 * preguntas del banco que nadie ha revisado, cambios propuestos, avisos de
 * cambio en la ley y quejas de alumnos. Y «Novedades»: lo que ha pasado (el
 * vigilante, los lotes nuevos, las propuestas) y lo que ha decidido cada
 * tutor (de `admin_audit_log`, con quién y cuándo).
 *
 * Todo con la clave de servicio y acotado a la academia DENTRO de cada
 * consulta (reglas 34, 65 y 75).
 */

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { fallo } from '../lib/fallos';
import { registraAccion } from '../lib/admin-audit';
import { QUESTION_STATUS, filtroBancoPorAcademia } from '../lib/questions';
import { filtroEscrituraBanco, UNA_SOLA_ACADEMIA } from '../lib/permisos-banco';
import { TIPO_REPORTE_VIGENCIA } from '../lib/normativa';
import { TIPO_REPORTE_REVISION_IA } from '../lib/verificacion';
import { juntaNovedades, ACCIONES_DE_REVISION, leeValores, propuestaVigente, cambiosLegibles, resumenDeRevision, esFuente, estadoDePregunta, type Novedad, type CambioLegible, type ValoresPregunta, type FuentePregunta, type ResumenDeRevision, type FilaParaResumen } from '../lib/revision';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';

export type BandejaRevision = {
  pendientes: number;
  sinRevisar: number;
  revisadas: number;
  propuestas: number;
  avisosLey: number;
  /** Avisos del repaso contra la ley: la IA duda de la pregunta. */
  dudasIA: number;
  quejas: number;
  soloRevisadas: boolean;
  novedades: Novedad[];
  /** Lo primero que ve un tutor al entrar (regla 139): lo que ya reciben los alumnos, lo que falta por bloque y por tema. */
  resumen: ResumenDeRevision;
};

type Usuario = { id: string; email: string; role: string; organizationId: string | null };

/** El alcance de lectura de una tabla con `organization_id` propio (reglas 75 y 123). */
function alcanceOrg(user: Usuario): string | null {
  if (user.role === 'superadmin') return null;
  return UNA_SOLA_ACADEMIA
    ? `organization_id.is.null,organization_id.eq.${user.organizationId}`
    : `organization_id.eq.${user.organizationId}`;
}

/** Cuántas preguntas cumplen un filtro, dentro de lo que este tutor ve. */
async function cuenta(user: Usuario, filtro: (q: ReturnType<typeof baseBanco>) => ReturnType<typeof baseBanco>) {
  let q = filtro(baseBanco());
  if (user.role !== 'superadmin') q = q.or(filtroBancoPorAcademia(user.organizationId));
  const { count, error } = await q;
  return { n: count ?? 0, error };
}
const baseBanco = () => supabaseAdmin.from('question_bank').select('id', { count: 'exact', head: true });

/**
 * Los reportes abiertos de un tipo, por la academia de la PREGUNTA (los
 * reportes no llevan academia propia, P11e). Dos consultas y no un `.or`
 * sobre la tabla embebida: es la forma que ya funciona en `getModerationQueue`.
 */
async function reportesAbiertos(user: Usuario, tipo: 'ley' | 'ia' | 'quejas') {
  const base = () => {
    const q = supabaseAdmin.from('question_reports').select('id, question:question_bank!inner(organization_id)').eq('status', 'open');
    if (tipo === 'ley') return q.eq('report_type', TIPO_REPORTE_VIGENCIA);
    if (tipo === 'ia') return q.eq('report_type', TIPO_REPORTE_REVISION_IA);
    // `neq` deja fuera las filas con el tipo vacío: una queja sin tipo también es una queja.
    return q.or(`report_type.is.null,and(report_type.neq.${TIPO_REPORTE_VIGENCIA},report_type.neq.${TIPO_REPORTE_REVISION_IA})`);
  };
  const consultas = [];
  if (user.role === 'superadmin' || UNA_SOLA_ACADEMIA) consultas.push(base().is('question.organization_id', null));
  if (user.role !== 'superadmin') consultas.push(base().eq('question.organization_id', user.organizationId));
  const res = await Promise.all(consultas);
  const error = res.find((r) => r.error)?.error ?? null;
  return { n: res.reduce((s, r) => s + (r.data?.length ?? 0), 0), error };
}

/**
 * ¿Los alumnos solo reciben preguntas revisadas? Para el PANEL del tutor.
 * Un admin lee el de su academia. El superadmin no pertenece a ninguna (regla
 * 65): lee el de las academias, y basta que una lo exija para contarlo así
 * (esta instalación es de una sola, regla 123). Si no se puede leer, se cierra
 * (se supone que sí), como en `exigeRevision`.
 */
async function ajusteSoloRevisadas(user: Usuario): Promise<{ valor: boolean; error: unknown }> {
  if (user.organizationId) {
    const { data, error } = await supabaseAdmin.from('academy_settings').select('solo_preguntas_revisadas').eq('organization_id', user.organizationId).maybeSingle();
    return { valor: error ? true : (data as { solo_preguntas_revisadas?: boolean } | null)?.solo_preguntas_revisadas === true, error };
  }
  const { data, error } = await supabaseAdmin.from('academy_settings').select('solo_preguntas_revisadas');
  return { valor: error ? true : (data ?? []).some((r) => (r as { solo_preguntas_revisadas?: boolean }).solo_preguntas_revisadas === true), error };
}

export async function getBandejaRevision(): Promise<{ success: true; data: BandejaRevision } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const user = auth.user as Usuario;
  const hace45 = new Date(Date.now() - 45 * 86_400_000).toISOString();

  let novedadesSistema = supabaseAdmin
    .from('novedades')
    .select('created_at, tipo, titulo, detalle, autor')
    .gte('created_at', hace45)
    .order('created_at', { ascending: false })
    .limit(80);
  const alcance = alcanceOrg(user);
  if (alcance) novedadesSistema = novedadesSistema.or(alcance);
  let propuestas = supabaseAdmin.from('question_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  if (alcance) propuestas = propuestas.or(alcance);

  const [pend, sinRev, rev, prop, ley, ia, quejas, ajuste, nov, decisiones, filas, temasBd] = await Promise.all([
    cuenta(user, (q) => q.eq('status', QUESTION_STATUS.CANDIDATE)),
    cuenta(user, (q) => q.eq('status', QUESTION_STATUS.ACTIVE).is('reviewed_at', null)),
    cuenta(user, (q) => q.eq('status', QUESTION_STATUS.ACTIVE).not('reviewed_at', 'is', null)),
    propuestas,
    reportesAbiertos(user, 'ley'),
    reportesAbiertos(user, 'ia'),
    reportesAbiertos(user, 'quejas'),
    ajusteSoloRevisadas(user),
    novedadesSistema,
    supabaseAdmin
      .from('admin_audit_log')
      .select('created_at, action, detail, actor_id')
      .in('action', Object.keys(ACCIONES_DE_REVISION))
      .gte('created_at', hace45)
      .order('created_at', { ascending: false })
      .limit(400),
    // Una fila corta por pregunta: de ahí salen las cuentas por tema y por bloque.
    // Se pagina (regla 74): son más de 6.000 y PostgREST corta a 1.000 sin avisar.
    paginaCompleta<FilaParaResumen>((desde, hasta) => {
      let q = supabaseAdmin.from('question_bank').select('subject_id, fuente, status, reviewed_at')
        .in('status', [QUESTION_STATUS.ACTIVE, QUESTION_STATUS.CANDIDATE]).order('id').range(desde, hasta);
      if (user.role !== 'superadmin') q = q.or(filtroBancoPorAcademia(user.organizationId));
      return Promise.resolve(q) as unknown as Promise<ResultadoPagina<FilaParaResumen>>;
    }),
    supabaseAdmin.from('subjects').select('id, topic_number, title').order('topic_number'),
  ]);
  const error = pend.error ?? sinRev.error ?? rev.error ?? prop.error ?? ley.error ?? ia.error ?? quejas.error ?? ajuste.error ?? nov.error ?? decisiones.error ?? temasBd.error;
  if (filas.error) return { success: false as const, error: filas.error };
  if (error) return { success: false as const, error: fallo('getBandejaRevision', error) ?? 'No se pudo leer la bandeja.' };

  // Quién decidió: el correo del perfil, no un uuid (regla 49).
  const actores = [...new Set((decisiones.data ?? []).map((d) => d.actor_id as string).filter(Boolean))];
  const correoDe = new Map<string, string>();
  if (actores.length) {
    const { data: perfiles } = await supabaseAdmin.from('profiles').select('id, email, full_name').in('id', actores);
    for (const p of perfiles ?? []) correoDe.set(p.id as string, ((p.full_name as string | null) || (p.email as string | null) || 'Un admin'));
  }

  const novedades = juntaNovedades(
    (nov.data ?? []) as { created_at: string; tipo: string; titulo: string; detalle: string | null; autor: string | null }[],
    (decisiones.data ?? []).map((d) => ({
      created_at: d.created_at as string,
      action: d.action as string,
      detail: (d.detail as Record<string, unknown> | null) ?? null,
      actor: correoDe.get(d.actor_id as string) ?? null,
    })),
  );

  const soloRevisadas = ajuste.valor;
  return {
    success: true as const,
    data: {
      pendientes: pend.n,
      sinRevisar: sinRev.n,
      revisadas: rev.n,
      propuestas: prop.count ?? 0,
      avisosLey: ley.n,
      dudasIA: ia.n,
      quejas: quejas.n,
      soloRevisadas,
      novedades,
      resumen: resumenDeRevision(
        filas.data,
        (temasBd.data ?? []).map((t) => ({ subjectId: t.id as number, numero: t.topic_number as number, titulo: t.title as string })),
        soloRevisadas,
      ),
    },
  };
}

/** Una pregunta para el revisor, con lo que el tutor necesita para decidir. */
export type PreguntaParaRevisar = {
  id: string;
  status: string;
  /** De dónde viene, que decide qué se revisa de ella (regla 139). */
  fuente: FuentePregunta;
  /** ¿Los alumnos ya la ven? Las de la academia sí, aunque falte revisar su explicación. */
  publicada: boolean;
  question_text: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  legal_reference: string | null;
  difficulty_level: number | null;
  difficulty_source: string | null;
  tema: number | null;
  temaTitulo: string | null;
  avisosLey: { id: string; message: string | null }[];
  /** Avisos del repaso contra la ley: la IA duda. */
  dudasIA: { id: string; message: string | null }[];
  /** El cambio propuesto que espera a un tutor (solo hay uno por pregunta), para decidirlo aquí mismo. */
  propuesta: PropuestaEnLinea | null;
};

export type PropuestaEnLinea = {
  id: string;
  origen: string;
  motivo: string;
  /** La pregunta sigue como cuando se propuso: si no, ya no vale. */
  vigente: boolean;
  cambios: CambioLegible[];
  /** Los valores nuevos, para enseñar la pregunta ya cambiada al aceptarlo. */
  despues: ValoresPregunta;
};

/**
 * La siguiente pregunta que revisar, una a una: las pendientes (que se
 * publican) o las del banco que nadie ha revisado (que se dan por buenas). Por
 * id, para que «Saltar» siga avanzando sin repetir. Con lo que queda por
 * delante, para que el tutor sepa cuánto le falta.
 */
export async function getParaRevisar(input: unknown): Promise<
  { success: true; pregunta: PreguntaParaRevisar | null; quedan: number } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const d = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  // Una sola cola (regla 139): las pendientes y las del banco que nadie ha leído. Se acota por tema y por bloque.
  const fuente = esFuente(d.fuente) ? d.fuente : null;
  const subjectId = Number.isInteger(d.subjectId) ? (d.subjectId as number) : null;
  const despuesDe = typeof d.despuesDe === 'string' && /^[0-9a-f-]{36}$/i.test(d.despuesDe) ? d.despuesDe : null;
  // «Otra vez la misma»: tras decidir algo sobre ella, se vuelve a leer tal como ha quedado.
  const incluida = d.incluida === true;

  // Lo que este tutor puede tocar (regla 123): va a decidir sobre ella.
  const alcance = filtroEscrituraBanco(auth.user);
  const columnas = 'id, status, fuente, question_text, options, correct_index, explanation, legal_reference, difficulty_level, difficulty_source, subjects(topic_number, title)';
  const sinRevisar = [QUESTION_STATUS.ACTIVE, QUESTION_STATUS.CANDIDATE];
  let siguiente = supabaseAdmin.from('question_bank').select(columnas).in('status', sinRevisar).is('reviewed_at', null).order('id', { ascending: true }).limit(1);
  let total = supabaseAdmin.from('question_bank').select('id', { count: 'exact', head: true }).in('status', sinRevisar).is('reviewed_at', null);
  if (fuente) { siguiente = siguiente.eq('fuente', fuente); total = total.eq('fuente', fuente); }
  if (subjectId) { siguiente = siguiente.eq('subject_id', subjectId); total = total.eq('subject_id', subjectId); }
  if (alcance) { siguiente = siguiente.or(alcance); total = total.or(alcance); }
  if (despuesDe) siguiente = incluida ? siguiente.gte('id', despuesDe) : siguiente.gt('id', despuesDe);
  const [{ data: filas, error }, { count, error: errCount }] = await Promise.all([
    siguiente,
    total,
  ]);
  if (error || errCount) return { success: false as const, error: fallo('getParaRevisar', (error ?? errCount)!) };

  const f = (filas ?? [])[0] as unknown as (Omit<PreguntaParaRevisar, 'tema' | 'temaTitulo' | 'avisosLey' | 'dudasIA' | 'propuesta' | 'fuente' | 'publicada'> & { fuente: string | null; subjects?: { topic_number: number; title: string } | null }) | undefined;
  if (!f) return { success: true as const, pregunta: null, quedan: count ?? 0 };
  const soloRevisadas = (await ajusteSoloRevisadas(auth.user as Usuario)).valor;

  const [{ data: avisos, error: errAv }, { data: props, error: errPr }] = await Promise.all([
    supabaseAdmin.from('question_reports').select('id, message, report_type').eq('question_id', f.id).in('report_type', [TIPO_REPORTE_VIGENCIA, TIPO_REPORTE_REVISION_IA]).eq('status', 'open'),
    supabaseAdmin.from('question_proposals').select('id, source, reason, before, after').eq('question_id', f.id).eq('status', 'pending').limit(1),
  ]);
  if (errAv || errPr) return { success: false as const, error: fallo('getParaRevisar', (errAv ?? errPr)!) };

  const actual: ValoresPregunta = {
    question_text: f.question_text, options: Array.isArray(f.options) ? f.options : [], correct_index: f.correct_index,
    explanation: f.explanation ?? null, difficulty_level: f.difficulty_level ?? null, legal_reference: f.legal_reference ?? null,
  };
  const pr = (props ?? [])[0];
  const antes = pr ? leeValores(pr.before) : null;
  const despues = pr ? leeValores(pr.after) : null;
  const propuesta: PropuestaEnLinea | null = pr && antes && despues ? {
    id: pr.id as string, origen: pr.source as string, motivo: (pr.reason as string | null) ?? '',
    vigente: propuestaVigente(actual, antes, despues), cambios: cambiosLegibles(actual, despues), despues,
  } : null;

  return {
    success: true as const,
    quedan: count ?? 0,
    pregunta: {
      id: f.id, status: f.status, fuente: f.fuente === 'academia' ? 'academia' : 'ia',
      publicada: estadoDePregunta({ fuente: f.fuente, status: f.status, reviewed_at: null }, soloRevisadas).startsWith('publicada'),
      question_text: f.question_text,
      options: Array.isArray(f.options) ? f.options : [], correct_index: f.correct_index,
      explanation: f.explanation ?? null, legal_reference: f.legal_reference ?? null,
      difficulty_level: f.difficulty_level ?? null, difficulty_source: f.difficulty_source ?? null,
      tema: f.subjects?.topic_number ?? null, temaTitulo: f.subjects?.title ?? null,
      avisosLey: (avisos ?? []).filter((a) => a.report_type === TIPO_REPORTE_VIGENCIA).map((a) => ({ id: a.id as string, message: (a.message as string | null) ?? null })),
      dudasIA: (avisos ?? []).filter((a) => a.report_type === TIPO_REPORTE_REVISION_IA).map((a) => ({ id: a.id as string, message: (a.message as string | null) ?? null })),
      propuesta,
    },
  };
}

/**
 * El interruptor «los alumnos solo reciben preguntas revisadas por un tutor»
 * (regla 138). Es de la academia del admin (regla 109); el superadmin no
 * administra ninguna (regla 65).
 */
export async function setSoloRevisadas(activo: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (typeof activo !== 'boolean') return { success: false as const, error: 'Falta decir si se activa o no.' };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'Esto se ajusta desde la cuenta de la academia.' };

  const { error } = await supabaseAdmin
    .from('academy_settings')
    .upsert({ organization_id: org, solo_preguntas_revisadas: activo, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' });
  if (error) return { success: false as const, error: fallo('setSoloRevisadas', error) };
  registraAccion({ actorId: auth.user.id, action: 'set_solo_revisadas', organizationId: org, detail: { activo } });
  return { success: true as const };
}

/**
 * Lo que espera a un tutor, en un número: pendientes de publicar, cambios
 * propuestos, avisos de la ley y quejas de alumnos. Es el contador de
 * «Revisión» en el menú; las del banco sin revisar no entran (son el trabajo
 * de fondo, no lo que acaba de llegar).
 */
export async function getPorRevisar(): Promise<{ success: true; n: number } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const user = auth.user as Usuario;
  let propuestas = supabaseAdmin.from('question_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending');
  const alcance = alcanceOrg(user);
  if (alcance) propuestas = propuestas.or(alcance);
  const [pend, prop, ley, ia, quejas] = await Promise.all([
    cuenta(user, (q) => q.eq('status', QUESTION_STATUS.CANDIDATE)),
    propuestas,
    reportesAbiertos(user, 'ley'),
    reportesAbiertos(user, 'ia'),
    reportesAbiertos(user, 'quejas'),
  ]);
  const error = pend.error ?? prop.error ?? ley.error ?? ia.error ?? quejas.error;
  if (error) return { success: false as const, error: fallo('getPorRevisar', error) ?? 'No se pudo contar.' };
  return { success: true as const, n: pend.n + (prop.count ?? 0) + ley.n + ia.n + quejas.n };
}
