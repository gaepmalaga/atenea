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
  'class_absences',
  'class_session_joins',
  'training_session_logs',
  'training_sessions',
  'training_week_notes',
  'physical_marks',
  'rm_marks',
  'class_members',
  // Los cobros de una cuenta de prueba (regla 104). Los de un alumno de verdad
  // nunca se borran: su `user_id` se queda en nulo y el apunte sigue.
  'payment_entries',
  'monthly_payments',
  'memberships',
  'academy_members',
] as const;

/**
 * Tablas con `user_id` que NO se borran con la cuenta. `academy_staff.user_id`
 * es la cuenta con la que entra un profesor, si la tiene (regla 97): la clave
 * ajena es `on delete set null`, así que al borrar la cuenta el profesor se
 * queda como nombre sin cuenta, que es lo que era antes.
 */
export const TABLAS_CON_USUARIO_QUE_SE_CONSERVAN = ['academy_staff'] as const;

/** Tablas que cuelgan de un grupo (`class_id`): se borran antes que el grupo. */
export const TABLAS_POR_GRUPO = ['class_absences', 'class_session_joins', 'class_days_off', 'training_sessions', 'training_week_notes', 'class_members', 'class_group_staff'] as const;

/** Tablas que cuelgan de una pregunta (`question_id`): antes que la pregunta. */
export const TABLAS_POR_PREGUNTA = ['question_attempts', 'question_notes', 'question_votes', 'question_reports'] as const;

/**
 * Tablas con filas de una academia, por `organization_id`. `class_groups` y
 * `question_bank` van aparte (primero sus hijas). En orden de dependencia.
 */
export const TABLAS_POR_ACADEMIA = [
  'memberships',
  'payment_entries',
  'receipt_counters',
  'monthly_payments',
  'membership_exemptions',
  // Apuntan a `academy_staff` (regla 100): antes que él.
  'staff_activities',
  'staff_subjects',
  'academy_staff',
  'training_sessions',
  'training_week_notes',
  'class_days_off',
  'class_week_publications',
  'session_templates',
  'physical_marks',
  'rm_marks',
  // Los packs de precios (regla 102) nombran tipos de grupo: antes que ellos.
  'fee_packs',
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

// ============================================================
// EL BORRADO EN SQL (por la API de gestión de Supabase)
// ============================================================
//
// La limpieza se ejecuta como SQL, en UNA transacción: o se borra todo o no se
// borra nada. Con PostgREST eran decenas de peticiones sueltas, y una caída a
// mitad dejaba la base de datos a medias. Además `auth.users` se borra igual
// que cualquier otra tabla, sin la API de administración.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Una lista de ids lista para meter en un `in (...)`. Solo admite UUID: es lo
 * único que se interpola en el SQL, y un id con otra forma no puede ser de la
 * base de datos — se rechaza antes de construir nada.
 */
export function listaDeIds(ids: readonly string[]): string {
  for (const id of ids) {
    if (!UUID.test(id)) throw new Error(`Id no válido, no se construye el SQL: ${id}`);
  }
  return ids.map((id) => `'${id}'`).join(', ');
}

export type PasoSql = { etiqueta: string; tabla: string; donde: string };

const t = (tabla: string) => (tabla.includes('.') ? tabla : `public.${tabla}`);

/**
 * Los borrados, en orden. Cada paso es una tabla y su `WHERE`: el ensayo
 * cuenta con el MISMO `WHERE` que luego borra, así lo que se enseña es
 * exactamente lo que se borra.
 */
export function pasosLimpiezaSql(plan: PlanLimpieza): PasoSql[] {
  if (!plan.academia || plan.error) return [];
  const pasos: PasoSql[] = [];

  for (const a of plan.borrarAcademias) {
    const id = listaDeIds([a.id]);
    const grupos = `class_id in (select id from public.class_groups where organization_id = ${id})`;
    for (const tabla of TABLAS_POR_GRUPO) pasos.push({ etiqueta: `${a.slug} · grupos`, tabla: t(tabla), donde: grupos });
    pasos.push({ etiqueta: a.slug, tabla: t('class_groups'), donde: `organization_id = ${id}` });

    const preguntas = `question_id in (select id from public.question_bank where organization_id = ${id})`;
    for (const tabla of TABLAS_POR_PREGUNTA) pasos.push({ etiqueta: `${a.slug} · banco privado`, tabla: t(tabla), donde: preguntas });
    pasos.push({ etiqueta: `${a.slug} · banco privado`, tabla: t('question_bank'), donde: `organization_id = ${id}` });

    for (const tabla of TABLAS_POR_ACADEMIA) pasos.push({ etiqueta: a.slug, tabla: t(tabla), donde: `organization_id = ${id}` });
    // Los interruptores de físicas llevan el id de la academia dentro del
    // `module_id` (regla 68), no siempre en `organization_id`.
    pasos.push({ etiqueta: a.slug, tabla: t('module_settings'), donde: `module_id like '%:${a.id}'` });
    pasos.push({ etiqueta: a.slug, tabla: t('academy_members'), donde: `academy_id = ${id}` });
    pasos.push({ etiqueta: a.slug, tabla: t('academies'), donde: `id = ${id}` });
  }

  const alphapol = listaDeIds([plan.academia.id]);
  for (const tabla of TABLAS_DE_PRUEBA_DE_LA_ACADEMIA) {
    pasos.push({ etiqueta: `${plan.academia.slug} · de prueba`, tabla: t(tabla), donde: `organization_id = ${alphapol}` });
  }

  if (plan.borrarCuentas.length) {
    const ids = listaDeIds(plan.borrarCuentas.map((c) => c.id));
    for (const tabla of TABLAS_POR_USUARIO) pasos.push({ etiqueta: 'cuentas de prueba', tabla: t(tabla), donde: `user_id in (${ids})` });
    // Lo que hicieron como admin, también fuera de una academia (acciones
    // globales, `organization_id` nulo). `actor_id` es NOT NULL con la clave
    // ajena en «set null»: sin este paso, borrar la cuenta revienta la
    // transacción entera (pasó al ejecutarla de verdad, 6 nov 2026).
    pasos.push({ etiqueta: 'cuentas de prueba', tabla: t('admin_audit_log'), donde: `actor_id in (${ids})` });
    pasos.push({ etiqueta: 'cuentas de prueba', tabla: t('profiles'), donde: `id in (${ids})` });
    pasos.push({ etiqueta: 'cuentas de prueba', tabla: 'auth.users', donde: `id in (${ids})` });
  }
  return pasos;
}

/** Una sola consulta que cuenta las filas de cada paso (para el ensayo y la comprobación). */
export function sqlDeConteo(pasos: readonly PasoSql[]): string {
  return pasos
    .map((p, i) => `select ${i} as paso, count(*)::int as filas from ${p.tabla} where ${p.donde}`)
    .join('\nunion all\n');
}

/** El borrado entero, en una transacción. */
export function sqlDeBorrado(pasos: readonly PasoSql[]): string {
  return ['begin;', ...pasos.map((p) => `delete from ${p.tabla} where ${p.donde};`), 'commit;'].join('\n');
}
