'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { QUESTION_STATUS } from '../lib/questions';
import {
  resumeAlumnos,
  contarPorEstado,
  temasDelAlumno,
  erroresDelAlumno,
  preguntasSospechosas,
  coberturaTemario,
  type IntentoAlumno,
  type FilaAlumno,
  type EstadoAlumno,
  type TemaDelAlumno,
  type CoberturaTema,
  type PreguntaSospechosa,
  type GrupoDeAlumno,
} from '../lib/academy';
import type { ErrorType } from '../lib/stats';
import { periodoActual } from '../lib/payments';

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
};

export async function getAcademyOverview(): Promise<
  { success: true; data: AcademyOverview } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  // LA ULTIMA CONEXION SALE DE `auth.users`, no de las respuestas.
  //
  // `profiles` no la guarda —solo tiene id, email, role y created_at— y quien
  // si la tiene es Supabase, en `last_sign_in_at`. Sin cruzarla, «nunca ha
  // entrado» significaba en realidad «nunca ha contestado una pregunta», y un
  // alumno que entra a diario a leer el temario o a usar el chat encabezaba la
  // lista de a quien llamar. El profesor actua sobre esa lista: el dato falso
  // no era un numero feo, era una llamada de telefono equivocada.
  const periodo = periodoActual();
  const [perfilesRes, intentosRes, temasRes, bancoRes, sesionesRes, gruposRes, miembrosRes, membresiasRes, pagosRes, ajustesRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role, created_at'),
    supabaseAdmin
      .from('question_attempts')
      .select('user_id, topic, is_correct, error_type, created_at, question_id, selected_index')
      .limit(MAX_INTENTOS),
    supabaseAdmin.from('subjects').select('id, title').order('topic_number', { ascending: true }),
    supabaseAdmin.from('question_bank').select('subject_id').eq('status', QUESTION_STATUS.ACTIVE),
    // Si esto falla, se sigue: se pierde la fecha de conexion, no el panel.
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }).catch(() => null),
    supabaseAdmin.from('class_groups').select('id, name, kind').order('name'),
    supabaseAdmin.from('class_members').select('class_id, user_id'),
    supabaseAdmin.from('memberships').select('user_id, access_status'),
    supabaseAdmin.from('monthly_payments').select('user_id, paid').eq('period', periodo).eq('paid', true),
    supabaseAdmin.from('membership_settings').select('required').eq('id', 1).maybeSingle(),
  ]);

  if (perfilesRes.error || intentosRes.error) {
    // No se traga: sin esto el panel diria que no hay alumnos, que es la
    // mentira mas tranquilizadora posible (regla 4).
    const mensaje = perfilesRes.error?.message ?? intentosRes.error?.message ?? 'error';
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
    .filter((p) => p.role !== 'admin')
    .map((p) => ({
      ...p,
      last_sign_in_at: conexiones.get(p.id) ?? null,
    }));

  const alumnos = resumeAlumnos(perfilesConConexion, intentos);

  // Los grupos de cada alumno (P7). El grupo es de administración: se resuelve
  // aquí y se pega a la fila, no lo hace `resumeAlumnos` (que es puro).
  type FilaGrupo = { id: string; name: string; kind: string };
  const grupos = ((gruposRes.data as FilaGrupo[]) ?? []);
  const grupoPorId = new Map(grupos.map((g) => [g.id, g]));
  const gruposDeAlumno = new Map<string, GrupoDeAlumno[]>();
  for (const m of miembrosRes.data ?? []) {
    const g = grupoPorId.get(m.class_id as string);
    if (!g) continue;
    const lista = gruposDeAlumno.get(m.user_id as string) ?? [];
    lista.push({ id: g.id, name: g.name, kind: g.kind });
    gruposDeAlumno.set(m.user_id as string, lista);
  }
  // Acceso (P6) y pago del mes en curso (P8), pegados a cada fila.
  const accesoPorAlumno = new Map<string, 'active' | 'suspended'>();
  for (const m of membresiasRes.data ?? []) {
    accesoPorAlumno.set(m.user_id as string, m.access_status === 'suspended' ? 'suspended' : 'active');
  }
  const pagadoEsteMes = new Set((pagosRes.data ?? []).map((p) => p.user_id as string));

  for (const a of alumnos) {
    a.grupos = (gruposDeAlumno.get(a.id) ?? []).sort((x, y) => x.name.localeCompare(y.name, 'es'));
    a.acceso = accesoPorAlumno.get(a.id) ?? 'pending';
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

  return {
    success: true as const,
    data: {
      alumnos,
      porEstado: contarPorEstado(alumnos),
      grupos: grupos.map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
      membershipRequired: ajustesRes.data?.required === true,
      periodoActual: periodo,
      cobertura,
      sospechosas: conTexto,
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
  if (!studentId) return { success: false as const, error: 'Falta el alumno.' };

  const [perfilRes, intentosRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role, created_at').eq('id', studentId).maybeSingle(),
    supabaseAdmin
      .from('question_attempts')
      .select('user_id, topic, is_correct, error_type, created_at, question_id, selected_index')
      .eq('user_id', studentId)
      .limit(MAX_INTENTOS),
  ]);

  if (intentosRes.error) {
    console.error('getStudentDetail:', intentosRes.error.message);
    return { success: false as const, error: intentosRes.error.message };
  }

  const intentos = (intentosRes.data ?? []) as IntentoAlumno[];
  const alumno = perfilRes.data ? resumeAlumnos([perfilRes.data], intentos)[0] : null;

  return {
    success: true as const,
    data: { alumno, temas: temasDelAlumno(intentos), errores: erroresDelAlumno(intentos) },
  };
}
