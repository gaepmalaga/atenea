'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { QUESTION_STATUS, filtroBancoPorAcademia } from '../lib/questions';
import {
  resumeAlumnos,
  contarPorEstado,
  temasDelAlumno,
  erroresDelAlumno,
  preguntasSospechosas,
  coberturaTemario,
  progresoSemanalAcademia,
  type IntentoAlumno,
  type FilaAlumno,
  type EstadoAlumno,
  type TemaDelAlumno,
  type CoberturaTema,
  type PreguntaSospechosa,
  type GrupoDeAlumno,
  type ProgresoAcademia,
} from '../lib/academy';
import type { ErrorType } from '../lib/stats';
import { periodoActual } from '../lib/payments';
import { detectaConfusion, type ParConfuso } from '../lib/question-confusion';
import { isBlankAnswer } from '../lib/exam-results';
import { paginaCompleta } from '../lib/pagination';

/**
 * El panel de la academia (P5).
 *
 * La lista de usuarios que ya habia sirve para administrar cuentas. Esto es
 * otra cosa: es lo que un profesor necesita para DAR CLASE — a quien llamar
 * porque lleva dos semanas sin entrar, en que falla cada uno, y que partes del
 * temario no toca nadie.
 *
 * TODO va con la clave de servicio, y aqui si es lo correcto: un profesor
 * mirando a sus alumnos no esta cubierto por ninguna politica de propietario,
 * asi que con el cliente de la sesion veria una lista vacia (regla 34). Lo que
 * lo protege es `requireAdmin`.
 *
 * La aritmetica no esta aqui: vive en `lib/academy.ts`, que es donde se puede
 * testear. Es la regla 8, y en este panel duele mas que en ninguno — con estos
 * numeros se decide a quien se llama por telefono.
 */

/**
 * Tope de respuestas que se agregan.
 *
 * Igual que en `getAdminUsersList`: se traen dos o tres columnas de una tabla
 * que crece. El dia que se pase de aqui, esto se convierte en una vista
 * agregada en SQL, no en un tope mas grande.
 */
const MAX_INTENTOS = 20_000;

/**
 * Trae TODOS los intentos de estos alumnos, paginando por encima del tope de
 * PostgREST (`paginaCompleta`, `app/lib/pagination.ts` — encontrado y
 * verificado el 14 sep 2026 contra la BD real: `Content-Range: 0-999/1782`).
 * `userIds` con un solo elemento sirve igual para un alumno suelto
 * (`getStudentDetail`) que para toda una academia (`getAcademyOverview`).
 */
async function fetchTodosLosIntentos(
  userIds: string[]
): Promise<{ data: IntentoAlumno[]; error: string | null }> {
  if (!userIds.length) return { data: [], error: null };

  return paginaCompleta<IntentoAlumno>(
    (desde, hasta) =>
      supabaseAdmin
        .from('question_attempts')
        .select('user_id, topic, is_correct, error_type, created_at, question_id, selected_index')
        .in('user_id', userIds)
        .range(desde, hasta) as unknown as Promise<{ data: IntentoAlumno[] | null; error: { message: string } | null }>,
    { maxFilas: MAX_INTENTOS },
  );
}

export type AcademyOverview = {
  alumnos: FilaAlumno[];
  porEstado: Record<EstadoAlumno, number>;
  /** Los grupos que existen, para el filtro y las casillas del alumno (P7/P8). */
  grupos: { id: string; name: string; kind: string }[];
  /** El interruptor global de acceso (P6). */
  membershipRequired: boolean;
  /** El mes en curso, `YYYY-MM`, para la columna de pago. */
  periodoActual: string;
  cobertura: CoberturaTema[];
  sospechosas: (PreguntaSospechosa & { texto: string | null; tema: string | null })[];
  /**
   * Pares de preguntas que se confunden entre sí — descubierto de los datos,
   * sin que nadie las etiquete (regla 73, `detectaConfusion`). No dice POR
   * QUÉ se confunden: señala dónde mirar. Suele ser la misma distinción mal
   * explicada, o dos preguntas casi duplicadas.
   */
  confusas: (ParConfuso & { textoA: string | null; textoB: string | null })[];
  /**
   * El motor adaptativo, de un vistazo (regla 76): cuánto ha aprendido la
   * academia esta semana. Es la prueba de que está pasando algo, no una
   * frase de ánimo — se calcula igual que `progresoSemanal` del alumno, solo
   * que agregado.
   */
  progresoSemanal: ProgresoAcademia;
};

export async function getAcademyOverview(): Promise<
  { success: true; data: AcademyOverview } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  const organizationId = auth.user.organizationId;

  // QUIÉN PERTENECE A ESTA ACADEMIA (P11): `profiles` no lleva
  // `organization_id` —la pertenencia va por `academy_members`—, así que el
  // roster de alumnos sale de cruzar las dos. Sin este filtro, el panel de
  // una academia enseñaría a los alumnos de todas.
  const { data: miembros, error: miembrosErr } = await supabaseAdmin
    .from('academy_members')
    .select('user_id')
    .eq('academy_id', organizationId);
  if (miembrosErr) return { success: false as const, error: miembrosErr.message };
  const idsAcademia = (miembros ?? []).map((m) => m.user_id as string);

  // LA ULTIMA CONEXION SALE DE `auth.users`, no de las respuestas.
  //
  // `profiles` no la guarda —solo tiene id, email, role y created_at— y quien
  // si la tiene es Supabase, en `last_sign_in_at`. Sin cruzarla, «nunca ha
  // entrado» significaba en realidad «nunca ha contestado una pregunta», y un
  // alumno que entra a diario a leer el temario o a usar el chat encabezaba la
  // lista de a quien llamar. El profesor actua sobre esa lista: el dato falso
  // no era un numero feo, era una llamada de telefono equivocada.
  const periodo = periodoActual();
  const [perfilesRes, intentosRes, temasRes, bancoRes, sesionesRes, gruposRes, miembrosGrupoRes, membresiasRes, pagosRes, ajustesRes] = await Promise.all([
    idsAcademia.length
      ? supabaseAdmin.from('profiles').select('id, email, role, created_at').in('id', idsAcademia)
      : Promise.resolve({ data: [], error: null }),
    // Paginado por encima del tope de PostgREST (ver `fetchTodosLosIntentos`):
    // sin esto, una academia con más de 1.000 intentos reales se quedaba con
    // solo los primeros 1.000, sin ningún aviso.
    fetchTodosLosIntentos(idsAcademia),
    supabaseAdmin.from('subjects').select('id, title').order('topic_number', { ascending: true }),
    supabaseAdmin
      .from('question_bank')
      .select('subject_id')
      .eq('status', QUESTION_STATUS.ACTIVE)
      .or(filtroBancoPorAcademia(organizationId)),
    // Si esto falla, se sigue: se pierde la fecha de conexion, no el panel.
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }).catch(() => null),
    supabaseAdmin.from('class_groups').select('id, name, kind').eq('organization_id', organizationId).order('name'),
    supabaseAdmin.from('class_members').select('class_id, user_id'),
    supabaseAdmin.from('memberships').select('user_id, access_status, exempt').eq('organization_id', organizationId),
    supabaseAdmin.from('monthly_payments').select('user_id, paid').eq('organization_id', organizationId).eq('period', periodo).eq('paid', true),
    supabaseAdmin.from('membership_settings').select('required').eq('organization_id', organizationId).maybeSingle(),
  ]);

  if (perfilesRes.error || intentosRes.error) {
    // No se traga: sin esto el panel diria que no hay alumnos, que es la
    // mentira mas tranquilizadora posible (regla 4).
    const mensaje = perfilesRes.error?.message ?? intentosRes.error ?? 'error';
    console.error('getAcademyOverview:', mensaje);
    return { success: false as const, error: mensaje };
  }

  const intentos = (intentosRes.data ?? []) as IntentoAlumno[];

  const conexiones = new Map<string, string | null>();
  for (const u of sesionesRes?.data?.users ?? []) {
    conexiones.set(u.id, u.last_sign_in_at ?? null);
  }

  // Los admin NO son alumnos: fuera de la lista, de los cuadros y del filtro.
  // Un profesor mirando «a quién llamar» no se llama a sí mismo.
  const perfilesConConexion = (perfilesRes.data ?? [])
    .filter((p) => p.role !== 'admin' && p.role !== 'superadmin')
    .map((p) => ({
      ...p,
      last_sign_in_at: conexiones.get(p.id) ?? null,
    }));

  const alumnos = resumeAlumnos(perfilesConConexion, intentos);

  // Solo los ALUMNOS cuentan para el progreso de la academia (regla 54: los
  // admin no son alumnos) — sin este filtro, la generación de contenido de
  // un admin en Temario & IA podría colarse en la cuenta.
  const idsAlumnos = new Set(perfilesConConexion.map((p) => p.id));
  const progresoSemanalDeLaAcademia = progresoSemanalAcademia(
    intentos.filter((i) => i.user_id && idsAlumnos.has(i.user_id)),
  );

  // Los grupos de cada alumno (P7). El grupo es de administración: se resuelve
  // aquí y se pega a la fila, no lo hace `resumeAlumnos` (que es puro).
  type FilaGrupo = { id: string; name: string; kind: string };
  const grupos = ((gruposRes.data as FilaGrupo[]) ?? []);
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const gruposDeAlumno = new Map<string, GrupoDeAlumno[]>();
  for (const m of miembrosGrupoRes.data ?? []) {
    const g = grupoPorId.get(m.class_id as string);
    if (!g) continue;
    const lista = gruposDeAlumno.get(m.user_id as string) ?? [];
    lista.push({ id: g.id, name: g.name, kind: g.kind });
    gruposDeAlumno.set(m.user_id as string, lista);
  }
  // Acceso (P6/P12) y pago del mes en curso (P8), pegados a cada fila.
  const accesoPorAlumno = new Map<string, 'active' | 'suspended' | 'pending'>();
  const exentoPorAlumno = new Set<string>();
  for (const m of membresiasRes.data ?? []) {
    const estado = m.access_status as string;
    accesoPorAlumno.set(
      m.user_id as string,
      estado === 'suspended' ? 'suspended' : estado === 'pending' ? 'pending' : 'active',
    );
    if (m.exempt === true) exentoPorAlumno.add(m.user_id as string);
  }
  const pagadoEsteMes = new Set((pagosRes.data ?? []).map((p) => p.user_id as string));

  for (const a of alumnos) {
    a.grupos = (gruposDeAlumno.get(a.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, 'es'));
    a.acceso = accesoPorAlumno.get(a.id) ?? 'pending';
    a.exento = exentoPorAlumno.has(a.id);
    a.pagadoMesActual = pagadoEsteMes.has(a.id);
  }

  // Cuantas preguntas activas tiene cada tema.
  const preguntasPorTema = new Map<number, number>();
  for (const fila of (bancoRes.data ?? []) as { subject_id: number | null }[]) {
    if (fila.subject_id === null) continue;
    preguntasPorTema.set(fila.subject_id, (preguntasPorTema.get(fila.subject_id) ?? 0) + 1);
  }

  const cobertura = coberturaTemario(
    ((temasRes.data ?? []) as { id: number; title: string }[]),
    preguntasPorTema,
    intentos
  );

  // Las sospechosas se enriquecen con su enunciado: una lista de UUID no le
  // dice nada a nadie. El texto viene por consulta aparte y no desnormalizado
  // (regla 5): si un admin corrige la pregunta, aqui se ve la corregida.
  const sospechosas = preguntasSospechosas(intentos);
  let conTexto: AcademyOverview['sospechosas'] = sospechosas.map((p) => ({ ...p, texto: null, tema: null }));

  if (sospechosas.length) {
    const { data: preguntas } = await supabaseAdmin
      .from('question_bank')
      .select('id, question_text, subject:subjects(title)')
      .in('id', sospechosas.map((p) => p.questionId));

    type FilaPregunta = { id: string; question_text: string | null; subject: { title: string | null } | null };
    const porId = new Map<string, FilaPregunta>();
    for (const q of ((preguntas as unknown as FilaPregunta[]) ?? [])) porId.set(q.id, q);

    conTexto = sospechosas.map((p) => {
      const q = porId.get(p.questionId);
      const subject = Array.isArray(q?.subject) ? q?.subject[0] : q?.subject;
      return { ...p, texto: q?.question_text ?? null, tema: subject?.title ?? null };
    });
  }

  // PARES QUE SE CONFUNDEN (regla 73, `detectaConfusion`) — mismo patrón que
  // las sospechosas: se calcula de los intentos ya en memoria (sin consulta
  // nueva) y se enriquece con el enunciado de las dos preguntas después. Los
  // blancos se descartan antes: dejar una pregunta sin contestar no es una
  // creencia falsa, es no arriesgar (regla 24), y contarlo aquí ensuciaría la
  // señal con abstenciones.
  const paraConfusion = intentos
    .filter((i) => i.question_id && i.user_id && !isBlankAnswer(i.selected_index))
    .map((i) => ({
      questionId: i.question_id as string,
      userId: i.user_id as string,
      isCorrect: Boolean(i.is_correct),
      topic: i.topic ?? '',
    }));
  const confusasCrudas = detectaConfusion(paraConfusion).slice(0, 10);

  let confusas: AcademyOverview['confusas'] = confusasCrudas.map((p) => ({ ...p, textoA: null, textoB: null }));
  if (confusasCrudas.length) {
    const idsConfusas = [...new Set(confusasCrudas.flatMap((p) => [p.a, p.b]))];
    const { data: preguntasConfusas } = await supabaseAdmin
      .from('question_bank')
      .select('id, question_text')
      .in('id', idsConfusas);
    const textoPorId = new Map(
      ((preguntasConfusas ?? []) as { id: string; question_text: string | null }[]).map((q) => [q.id, q.question_text]),
    );
    confusas = confusasCrudas.map((p) => ({
      ...p,
      textoA: textoPorId.get(p.a) ?? null,
      textoB: textoPorId.get(p.b) ?? null,
    }));
  }

  return {
    success: true as const,
    data: {
      alumnos,
      porEstado: contarPorEstado(alumnos),
      grupos: grupos.map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
      // P12: sin fila, el interruptor se lee ENCENDIDO por defecto (norma
      // global nueva) — tiene que coincidir con lo que de verdad aplica
      // `checkAccess` (auth.ts), o el panel mentiría sobre su propio estado.
      membershipRequired: ajustesRes.data?.required !== false,
      periodoActual: periodo,
      cobertura,
      sospechosas: conTexto,
      confusas,
      progresoSemanal: progresoSemanalDeLaAcademia,
    },
  };
}

export type StudentDetail = {
  alumno: FilaAlumno | null;
  temas: TemaDelAlumno[];
  errores: { porTipo: { tipo: ErrorType; veces: number }[]; sinClasificar: number };
};

/**
 * La ficha de UN alumno.
 *
 * Acepta un `studentId`, y no contradice la regla 1: no es «los datos del
 * usuario que dice ser», es un administrador —comprobado con `requireAdmin`—
 * mirando a un alumno concreto. La diferencia esta en de donde sale el permiso,
 * no en si hay un id en la firma.
 */
export async function getStudentDetail(
  studentId: string
): Promise<{ success: true; data: StudentDetail } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  // El alumno tiene que ser de ESTA academia (P11): sin esto, un admin podría
  // pedir la ficha de cualquier `studentId` de cualquier otra.
  const { data: esMiembro } = await supabaseAdmin
    .from('academy_members')
    .select('user_id')
    .eq('academy_id', auth.user.organizationId)
    .eq('user_id', studentId)
    .maybeSingle();
  if (!esMiembro) return { success: false as const, error: 'Ese alumno no pertenece a tu academia.' };

  const [perfilRes, intentosRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role, created_at').eq('id', studentId).maybeSingle(),
    // Paginado, mismo motivo que en `getAcademyOverview`: un alumno con más
    // de 1.000 intentos reales (varios ya los tienen) se quedaba con la
    // ficha calculada sobre los primeros 1.000, sin ningún aviso.
    fetchTodosLosIntentos([studentId]),
  ]);

  if (intentosRes.error) {
    console.error('getStudentDetail:', intentosRes.error);
    return { success: false as const, error: intentosRes.error };
  }

  const intentos = (intentosRes.data ?? []) as IntentoAlumno[];
  const alumno = perfilRes.data ? resumeAlumnos([perfilRes.data], intentos)[0] : null;

  return {
    success: true as const,
    data: { alumno, temas: temasDelAlumno(intentos), errores: erroresDelAlumno(intentos) },
  };
}
