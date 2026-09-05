import 'server-only';

import { supabaseAdmin } from '../actions/core';
import { createSupabaseServerClient } from './supabase/server';
import { decideAccess, type AccessDecision, type MembershipRow } from './membership';

export type AuthUser = {
  id: string;
  email: string;
  role: 'admin' | 'student';
  /**
   * Si el alumno puede usar la plataforma (P6). `ok` salvo que el control de
   * acceso esté encendido y el administrador no lo haya activado (`pending`) o
   * le haya quitado el acceso (`suspended`). Un admin es siempre `ok`.
   */
  access: AccessDecision;
};

export const NOT_ACTIVE_MEMBER =
  'Tu acceso a la plataforma no está activo. Habla con la academia.';

/**
 * `membership_settings.required` en caché por instancia.
 *
 * `getSessionUser` corre en cada Server Action, y el interruptor global cambia
 * una vez cada varios meses. Sin caché, cada llamada serían dos consultas de
 * más. Misma idea que `module-guard` (regla 20). La fila de cada alumno NO se
 * cachea: suspender a alguien tiene que notarse al momento.
 */
const REQUIRED_CACHE_MS = 30_000;
let requiredCache: { valor: boolean; hasta: number } | null = null;

/** La llama la acción que cambia el interruptor, para verlo sin esperar. */
export function olvidaMembershipRequired(): void {
  requiredCache = null;
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

  const role: 'admin' | 'student' = profile?.role === 'admin' ? 'admin' : 'student';
  const access = await checkAccess(data.user.id, role);

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    role,
    access,
  };
}

/**
 * Decide si el alumno tiene acceso (P6). Un admin es siempre `ok` y ni siquiera
 * se consulta la base de datos.
 *
 * Si algo falla —la tabla aún no existe, la BD no contesta— se ABRE la puerta:
 * un fallo de lectura no puede dejar fuera a alumnos que sí han pagado (regla
 * 34, y ver `decideAccess`).
 */
async function checkAccess(userId: string, role: 'admin' | 'student'): Promise<AccessDecision> {
  if (role === 'admin') return 'ok';

  let required = false;
  let row: MembershipRow = null;
  let readOk = true;

  try {
    if (requiredCache && requiredCache.hasta > Date.now()) {
      required = requiredCache.valor;
    } else {
      const { data, error } = await supabaseAdmin
        .from('membership_settings')
        .select('required')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      required = data?.required === true;
      requiredCache = { valor: required, hasta: Date.now() + REQUIRED_CACHE_MS };
    }

    // Solo se mira la fila del alumno si la puerta está cerrada: si no, da igual.
    if (required) {
      const { data, error } = await supabaseAdmin
        .from('memberships')
        .select('access_status, payment_status')
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
  if (user.access !== 'ok') return { ok: false, error: NOT_ACTIVE_MEMBER };
  return { ok: true, user };
}

/** Exige un usuario autenticado con rol de administrador. */
export async function requireAdmin(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  if (user.role !== 'admin') return { ok: false, error: NOT_ADMIN };
  return { ok: true, user };
}
