/**
 * QUÉ SE BORRA PARA DEJAR LA BASE DE DATOS SOLO DE ALPHAPOL (regla 81).
 *
 * La plataforma era «Atenea», para varias academias, y pasa a ser solo de
 * Alphapol, con la MISMA base de datos. El dueño confirmó (6 nov 2026) que no
 * hay ninguna persona real registrada: todas las cuentas son de prueba. Así
 * que se borran:
 *
 *   · Todas las CUENTAS menos las de `superadmin` (el dueño de la plataforma,
 *     que hace falta para dar de alta al admin de Alphapol) y las que se
 *     pidan conservar a mano. Con TODO lo suyo: respuestas, fichas, planes,
 *     pagos, membresías…
 *   · Todas las ACADEMIAS menos Alphapol (`atenea`, la demo…), con todo lo
 *     suyo: grupos, ajustes, banco privado.
 *   · De Alphapol, lo que solo tiene sentido con las cuentas de prueba: la
 *     lista de exentos (correos de prueba) y el registro de auditoría
 *     (acciones de admins de prueba).
 *
 * Y NO se toca: el temario, el banco común de preguntas y de fichas, la
 * academia Alphapol con su configuración (ajustes, convocatoria, tipos de
 * grupo, grupos y sus planes de físicas, profesores) y los interruptores.
 *
 * Módulo PURO (regla 21): decide QUÉ se borra; `scripts/operacion/
 * limpiar-para-alphapol.mjs` es quien habla con Supabase. Las listas de tablas
 * viven aquí para que un test las compare con `supabase/schema.json`: una
 * tabla nueva con `user_id` que nadie añadiera aquí se quedaría con filas de
 * cuentas borradas, y el test lo canta.
 */

/**
 * Tablas con filas de un usuario, por `user_id`. En orden: lo que apunta a
 * otra cosa, antes. Aun así el guion reintenta lo que falle por una clave
 * ajena, porque el esquema no declara todas.
 */
export const TABLAS_POR_USUARIO = [
  'chat_messages',
  'chat_conversations',
  'question_attempts',
  'question_notes',
  'question_votes',
  'question_reports',
  'flashcard_results',
  'flashcard_progress',
  'workout_logs',
  'training_plans',
  'profiles_physical',
  'profiles_biodata',
  'profiles_psych',
  'interview_reports',
  'curva_progreso',
  'ai_quota',
  'ai_usage',
  'class_members',
  'monthly_payments',
  'memberships',
  'academy_members',
] as const;

/** Tablas que cuelgan de un grupo (`class_id`): se borran antes que el grupo. */
export const TABLAS_POR_GRUPO = ['class_members', 'class_group_staff', 'group_training_plans'] as const;

/** Tablas que cuelgan de una pregunta (`question_id`): antes que la pregunta. */
export const TABLAS_POR_PREGUNTA = ['question_attempts', 'question_notes', 'question_votes', 'question_reports'] as const;

/**
 * Tablas con filas de una academia, por `organization_id`. `class_groups` y
 * `question_bank` van aparte (primero sus hijas). En orden de dependencia.
 */
export const TABLAS_POR_ACADEMIA = [
  'memberships',
  'monthly_payments',
  'membership_exemptions',
  'academy_staff',
  'group_kinds',
  'module_settings',
  'admin_audit_log',
  'academy_settings',
  'membership_settings',
  'academy_convocatoria',
] as const;

/** De la propia Alphapol, lo que solo tenía sentido con las cuentas de prueba. */
export const TABLAS_DE_PRUEBA_DE_LA_ACADEMIA = ['membership_exemptions', 'admin_audit_log'] as const;

export type CuentaLimpieza = { id: string; email: string | null; role: string | null };
export type AcademiaLimpieza = { id: string; slug: string; name: string };

export type PlanLimpieza = {
  /** La academia que se queda. `null` = no existe, y no se borra nada. */
  academia: AcademiaLimpieza | null;
  conservar: CuentaLimpieza[];
  borrarCuentas: CuentaLimpieza[];
  borrarAcademias: AcademiaLimpieza[];
  /** Por qué no se puede seguir, si no se puede. */
  error: string | null;
};

const normaliza = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();

/**
 * Decide qué cuentas y qué academias se borran.
 *
 * Se conservan los `superadmin` siempre: sin uno, nadie podría dar de alta al
 * admin de Alphapol después y la única salida sería el panel de Supabase.
 * Por eso, si no queda NINGUNA cuenta que conservar, el plan se niega.
 */
export function planLimpieza(params: {
  cuentas: CuentaLimpieza[];
  academias: AcademiaLimpieza[];
  academiaSlug: string;
  conservarEmails?: string[];
}): PlanLimpieza {
  const { cuentas, academias, academiaSlug } = params;
  const aMano = new Set((params.conservarEmails ?? []).map(normaliza).filter(Boolean));

  const academia = academias.find((a) => a.slug === academiaSlug) ?? null;
  const conservar = cuentas.filter((c) => c.role === 'superadmin' || aMano.has(normaliza(c.email)));
  const idsConservar = new Set(conservar.map((c) => c.id));
  const borrarCuentas = cuentas.filter((c) => !idsConservar.has(c.id));
  const borrarAcademias = academias.filter((a) => a.slug !== academiaSlug);

  let error: string | null = null;
  if (!academia) error = `No existe la academia «${academiaSlug}»: no se borra nada.`;
  else if (conservar.length === 0) error = 'No queda ninguna cuenta (ni superadmin ni conservada a mano): te quedarías sin acceso. No se borra nada.';

  return { academia, conservar, borrarCuentas, borrarAcademias, error };
}

/** Parte una lista en trozos: un `.in()` con miles de ids no cabe en una URL. */
export function trozos<T>(lista: readonly T[], tam = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}
