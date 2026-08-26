'use server'

import { supabaseAdmin } from './core';
import { getSessionUser, requireUser, type AuthUser } from '../lib/auth';

/**
 * Devuelve el usuario de la sesion actual, o null si no hay sesion.
 *
 * Sustituye al antiguo `getUserRole(userId)`, que aceptaba un id del cliente y
 * se lo creia: bastaba con enviar el UUID de un administrador para que la UI
 * pintara el panel de administracion.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  return getSessionUser();
}

// --- ESTADISTICAS ---
export async function getUserStats() {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  try {
    const { data } = await supabaseAdmin
      .from('test_results')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!data || data.length === 0) {
      return { success: true as const, stats: { total: 0, winRate: 0, lastItems: [] } };
    }

    const correct = data.filter((r: any) => r.is_correct).length;

    return {
      success: true as const,
      stats: {
        total: data.length,
        winRate: Math.round((correct / data.length) * 100),
        lastItems: data.slice(0, 5),
      },
    };
  } catch {
    return { success: false as const, error: 'Error al calcular estadisticas.' };
  }
}
