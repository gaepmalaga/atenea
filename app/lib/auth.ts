import 'server-only';

import { supabaseAdmin } from '../actions/core';
import { createSupabaseServerClient } from './supabase/server';

export type AuthUser = {
  id: string;
  email: string;
  role: 'admin' | 'student';
};

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

  return {
    id: data.user.id,
    email: data.user.email ?? '',
    role: profile?.role === 'admin' ? 'admin' : 'student',
  };
}

/** Exige un usuario autenticado. */
export async function requireUser(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  return { ok: true, user };
}

/** Exige un usuario autenticado con rol de administrador. */
export async function requireAdmin(): Promise<AuthCheck> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: NOT_AUTHENTICATED };
  if (user.role !== 'admin') return { ok: false, error: NOT_ADMIN };
  return { ok: true, user };
}
