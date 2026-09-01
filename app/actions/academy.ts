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
} from '../lib/academy';
import type { ErrorType } from '../lib/stats';

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
  cobertura: CoberturaTema[];
  sospechosas: (PreguntaSospechosa & { texto: string | null; tema: string | null })[];
};

export async function getAcademyOverview(): Promise<
  { success: true; data: AcademyOverview } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const [perfilesRes, intentosRes, temasRes, bancoRes] = await Promise.all([
    supabaseAdmin.from('profiles').select('id, email, role, created_at'),
    supabaseAdmin
      .from('question_attempts')
      .select('user_id, topic, is_correct, error_type, created_at, question_id, selected_index')
      .limit(MAX_INTENTOS),
    supabaseAdmin.from('subjects').select('id, title').order('topic_number', { ascending: true }),
    supabaseAdmin.from('question_bank').select('subject_id').eq('status', QUESTION_STATUS.ACTIVE),
  ]);

  if (perfilesRes.error || intentosRes.error) {
    // No se traga: sin esto el panel diria que no hay alumnos, que es la
    // mentira mas tranquilizadora posible (regla 4).
    const mensaje = perfilesRes.error?.message ?? intentosRes.error?.message ?? 'error';
    console.error('getAcademyOverview:', mensaje);
    return { success: false as const, error: mensaje };
  }

  const intentos = (intentosRes.data ?? []) as IntentoAlumno[];
  const alumnos = resumeAlumnos(perfilesRes.data ?? [], intentos);

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
    data: { alumnos, porEstado: contarPorEstado(alumnos), cobertura, sospechosas: conTexto },
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
