import 'server-only';

import { cookies } from 'next/headers';
import { supabaseAdmin } from '../actions/core';
import { createSupabaseServerClient } from './supabase/server';
import { decideAccess, type AccessDecision, type MembershipRow } from './membership';
import { ACADEMIA_COOKIE } from './academies';

export type AuthUser = {
  id: string;
  email: string;
  role: 'admin' | 'student' | 'superadmin';
  /**
   * Si el alumno puede usar la plataforma (P6). `ok` salvo que el control de
   * acceso esté encendido y el administrador no lo haya activado (`pending`),
   * le haya quitado el acceso (`suspended`), o no se haya podido resolver a
   * qué academia pertenece (`no-academy`, P11). Un admin/superadmin es
   * siempre `ok`.
   */
  access: AccessDecision;
  /**
   * LA ACADEMIA ACTIVA DE LA SESIÓN (P11). Todo lo que un admin lee o escribe
   * en el panel se acota a esta academia — `null` solo puede pasarle a un
   * `superadmin` sin academia resuelta (ver `resolveOrganizationId`), nunca a
   * un `admin` ni a un `student` con acceso `ok`.
   */
  organizationId: string | null;
};

export const NOT_ACTIVE_MEMBER =
  'Tu acceso a la plataforma no está activo. Habla con la academia.';

export const NOT_IN_ACADEMY =
  'No hemos podido asociar tu cuenta a una academia. Habla con ella o revisa el enlace que usaste para entrar.';

/**
 * `membership_settings.required` en caché por instancia, POR ACADEMIA (P11):
 * la fila ahora es una por academia (`organization_id`), así que el valor de
 * una no sirve para otra.
 *
 * `getSessionUser` corre en cada Server Action, y el interruptor global cambia
 * una vez cada varios meses. Sin caché, cada llamada serían dos consultas de
 * más. Misma idea que `module-guard` (regla 20). La fila de cada alumno NO se
 * cachea: suspender a alguien tiene que notarse al momento.
 */
const REQUIRED_CACHE_MS = 30_000;
const requiredCache = new Map<string, { valor: boolean; hasta: number }>();

/** La llama la acción que cambia el interruptor, para verlo sin esperar. */
export function olvidaMembershipRequired(organizationId?: string | null): void {
  if (organizationId) requiredCache.delete(organizationId);
  else requiredCache.clear();
}

/**
 * LA ACADEMIA ACTIVA DE LA SESIÓN (P11).
 *
 * Si el usuario pertenece a una sola academia — el caso de HOY, todo el mundo
 * entró en la academia `principal` por el backfill del guion — es esa, sin
 * más vuelta. Si pertenece a varias (raro, decidido que puede pasar), se usa
 * la cookie que deja `middleware.ts` al visitar `/<slug>`; si no hay ninguna
 * coincidencia —cero academias, o la cookie no encaja con ninguna de las
 * suyas— `null`: mejor no adivinar y enseñarle los datos de la academia
 * equivocada que resolver algo (regla 34 — con la clave de servicio, nada más
 * que el código lo impide).
 */
async function resolveOrganizationId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('academy_members')
    .select('academy_id, academies(slug)')
    .eq('user_id', userId);

  if (error || !data || data.length === 0) return null;
  if (data.length === 1) return data[0].academy_id as string;

  type FilaMembresia = { academy_id: string; academies: { slug: string } | { slug: string }[] | null };
  const cookieStore = await cookies();
  const slug = cookieStore.get(ACADEMIA_COOKIE)?.value;
  if (!slug) return null;

  const match = (data as FilaMembresia[]).find((f) => {
    const a = Array.isArray(f.academies) ? f.academies[0] : f.academies;
    return a?.slug === slug;
  });
  return match ? match.academy_id : null;
}

/**
 * Resultado de una comprobacion de acceso.
 *
 * Se devuelve un resultado en vez de lanzar porque las Server Actions redactan
 * las excepciones en produccion: el usuario veria un error generico inutil.
 */
export type AuthCheck =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string };

export const NOT_AUTHENTICATED = 'Sesion no valida. Vuelve a iniciar sesion.';
export const NOT_ADMIN = 'Acceso denegado.';

/**
 * Devuelve el usuario autenticado, o null.
 *
 * Usa `getUser()`, que valida el token contra el servidor de Supabase.
 * `getSession()` NO sirve aqui: lee la cookie sin verificar la firma, asi que
 * un atacante podria fabricarla.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  // El rol vive en `profiles` y se consulta con la clave de servicio para que
  // una politica RLS mal puesta no pueda degradar a un admin en silencio.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const role: AuthUser['role'] =
    profile?.role === 'admin' ? 'admin' : profile?.role === 'superadmin' ? 'superadmin' : 'student';

  const organizationId = await resolveOrganizationId(data.user.id);
  const access = await checkAccess(data.user.id, role, organizationId);

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    role,
    organizationId,
    access,
  };
}

/**
 * Decide si el alumno tiene acceso (P6). Un admin/superadmin es siempre `ok` y
 * ni siquiera se consulta la base de datos.
 *
 * Si algo falla —la tabla aún no existe, la BD no contesta— se ABRE la puerta:
 * un fallo de lectura no puede dejar fuera a alumnos que sí han pagado (regla
 * 34, y ver `decideAccess`). La excepción es no tener academia resuelta
 * (P11): ahí no hay ninguna fila que mirar, así que se corta antes de tocar
 * la base de datos.
 */
async function checkAccess(
  userId: string,
  role: AuthUser['role'],
  organizationId: string | null,
): Promise<AccessDecision> {
  if (role !== 'student') return 'ok';
  if (organizationId === null) return 'no-academy';

  let required = false;
  let row: MembershipRow = null;
  let readOk = true;

  try {
    const cacheado = requiredCache.get(organizationId);
    if (cacheado && cacheado.hasta > Date.now()) {
      required = cacheado.valor;
    } else {
      const { data, error } = await supabaseAdmin
        .from('membership_settings')
        .select('required')
        .eq('organization_id', organizationId)
        .maybeSingle();
      if (error) throw error;
      required = data?.required === true;
      requiredCache.set(organizationId, { valor: required, hasta: Date.now() + REQUIRED_CACHE_MS });
    }

    // Solo se mira la fila del alumno si la puerta está cerrada: si no, da igual.
    if (required) {
      const { data, error } = await supabaseAdmin
        .from('memberships')
        .select('access_status, payment_status')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      row = data ?? null;
    }
  } catch (e) {
    console.error('checkAccess (se abre la puerta):', e instanceof Error ? e.message : e);
    readOk = false;
  }

  return decideAccess({ required, role, row, readOk });
}

/**
 * Exige un usuario autenticado Y con acceso activo (P6).
 *
 * El acceso se comprueba aquí y no solo en la pantalla: una Server Action es un
 * endpoint público, así que un alumno suspendido que conserve la sesión podría
 * seguir llamando a las acciones si la única barrera fuera la interfaz. Un admin
 * pasa siempre (`access` es `ok` para admin).
 */
export async function requireUser(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  if (user.access === 'no-academy') return { ok: false, error: NOT_IN_ACADEMY };
  if (user.access !== 'ok') return { ok: false, error: NOT_ACTIVE_MEMBER };
  return { ok: true, user };
}

/**
 * Exige un usuario autenticado con rol de administrador — `admin` o
 * `superadmin` (P11): el segundo puede todo lo que el primero, y además verá
 * el día de mañana el panel transversal de varias academias.
 *
 * Un `admin` SIN academia resuelta se rechaza aquí, no más abajo: cada
 * consulta de este panel se acota a `user.organizationId`, y dejar pasar un
 * `null` sería la mitad de las academias viendo los datos de todas (regla
 * 34 — con la clave de servicio, nada más que el código lo impide).
 */
export async function requireAdmin(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  if (user.role !== 'admin' && user.role !== 'superadmin') return { ok: false, error: NOT_ADMIN };
  if (user.role === 'admin' && user.organizationId === null) return { ok: false, error: NOT_IN_ACADEMY };
  return { ok: true, user };
}

/**
 * Exige `superadmin` (P11f/P11i): el panel transversal de varias academias —
 * comparativa de alumnos, rentabilidad, y dar de alta una academia nueva. Un
 * `admin` normal, por muy bien resuelta que tenga su academia, no pasa de
 * aquí: esto no es "más admin", es ver y decidir cosas de TODAS las academias
 * a la vez.
 */
export async function requireSuperadmin(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  if (user.role !== 'superadmin') return { ok: false, error: NOT_ADMIN };
  return { ok: true, user };
}
