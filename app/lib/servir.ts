import 'server-only';

import { supabaseAdmin } from '../actions/core';
import { fallo } from './fallos';

/**
 * ¿Los alumnos de esta academia solo reciben preguntas revisadas por un tutor?
 * (regla 138, `academy_settings.solo_preguntas_revisadas`).
 *
 * No es una Server Action (no lleva `'use server'`): la llaman las acciones
 * que sirven preguntas al alumno, con la academia ya resuelta por la sesión.
 *
 * Si no se puede leer el ajuste, se responde que SÍ: servir una pregunta que
 * nadie ha revisado es justo lo que el ajuste quiere evitar, y un fallo no
 * puede abrir esa puerta.
 */
export async function exigeRevision(organizationId: string | null): Promise<boolean> {
  if (!organizationId) return false;
  const { data, error } = await supabaseAdmin
    .from('academy_settings')
    .select('solo_preguntas_revisadas')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) {
    fallo('exigeRevision', error);
    return true;
  }
  return data?.solo_preguntas_revisadas === true;
}
