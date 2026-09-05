'use server'

import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import {
  resumeGastoIA,
  type FilaGastoIA,
  type ResumenGastoIA,
  type GastoPorAlumno,
} from '../lib/ai-cost';

/**
 * EL PANEL DE CONSUMO DE IA (P6, la parte que se construye ya).
 *
 * `ai_usage` guarda una fila por llamada a Gemini. Esto la agrega para el
 * administrador: cuánto va gastado, en qué ruta, qué meses y qué alumnos pesan
 * más. Es de solo lectura — no cobra nada, no toca cuotas.
 *
 * Va con la clave de servicio, y aquí es lo correcto (regla 34/35): `ai_usage`
 * tiene RLS y CERO políticas porque es de administración; con el cliente de la
 * sesión devolvería una lista vacía. Lo que lo protege es `requireAdmin`.
 *
 * La aritmética no está aquí: vive en `lib/ai-cost.ts`, que se puede testear.
 */

/**
 * Tope de filas que se agregan de una vez. Igual que `getAcademyOverview` y
 * `getAdminUsersList`: el día que se pase de aquí, esto se convierte en una
 * vista agregada en SQL, no en un tope más grande. Con el gasto de un piloto
 * queda de sobra.
 */
const MAX_FILAS = 50_000;

export type AiCostOverview = Omit<ResumenGastoIA, 'porAlumno'> & {
  porAlumno: (GastoPorAlumno & { email: string | null })[];
};

export async function getAiCostOverview(): Promise<
  { success: true; data: AiCostOverview } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('ai_usage')
    .select('user_id, route, cost_usd, input_tokens, output_tokens, cached_tokens, created_at, subject_id')
    .order('created_at', { ascending: false })
    .limit(MAX_FILAS);

  if (error) {
    // No se traga (regla 4): un panel de gasto que enseña "$0.00" cuando la
    // consulta ha fallado es la mentira más cara posible.
    console.error('getAiCostOverview:', error.message);
    return { success: false as const, error: error.message };
  }

  const resumen = resumeGastoIA((data ?? []) as FilaGastoIA[]);

  // El correo se pone aquí y no se desnormaliza (regla 5): una lista de UUID no
  // le dice nada a nadie, pero guardar el correo en `ai_usage` lo dejaría
  // obsoleto en cuanto el alumno lo cambie.
  const ids = resumen.porAlumno.map((a) => a.userId);
  const correos = new Map<string, string>();
  if (ids.length) {
    const { data: perfiles } = await supabaseAdmin.from('profiles').select('id, email').in('id', ids);
    for (const p of perfiles ?? []) correos.set(p.id as string, (p.email as string) ?? '');
  }

  return {
    success: true as const,
    data: {
      ...resumen,
      porAlumno: resumen.porAlumno.map((a) => ({ ...a, email: correos.get(a.userId) ?? null })),
    },
  };
}
