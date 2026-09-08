'use server'
import { supabaseAdmin } from './core';
import { requireUser } from '../lib/auth';
import { CONVOCATORIA_VACIA, type Convocatoria } from '../lib/convocatoria';
import { periodoActual, formateaPeriodo } from '../lib/payments';

/**
 * MI PERFIL — lo que un opositor necesita ver de sí mismo, en una sola llamada.
 *
 * La convocatoria, su acceso (pago) y sus grupos. Todo es contenido de
 * administración: se lee con la clave de servicio filtrando por el propio
 * usuario (regla 34), igual que `auth.ts` con `memberships`. Nada de esto lo
 * puede cambiar el alumno desde aquí.
 */

export type MiPerfil = {
  email: string;
  convocatoria: Convocatoria;
  /** `null` = el control de acceso está apagado o no hay fila de `memberships`. */
  acceso: { estado: 'active' | 'suspended' } | null;
  /** El pago del MES en curso — de `monthly_payments`, no del `payment_status`
   *  suelto de `memberships` (que P8 dejó de usar). */
  pagoDelMes: { periodo: string; pagado: boolean } | null;
  grupos: { nombre: string; tipo: string }[];
};

export async function getMiPerfil(): Promise<
  { success: true; perfil: MiPerfil } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const userId = auth.user.id;

  const periodo = periodoActual();
  const [convRes, memRes, gruposRes, kindsRes, pagoRes] = await Promise.all([
    supabaseAdmin.from('academy_convocatoria').select('escala, fecha_examen, nota').eq('id', 1).maybeSingle(),
    supabaseAdmin.from('memberships').select('access_status').eq('user_id', userId).maybeSingle(),
    supabaseAdmin.from('class_members').select('class_groups!inner(name, kind)').eq('user_id', userId),
    supabaseAdmin.from('group_kinds').select('id, label'),
    supabaseAdmin.from('monthly_payments').select('paid').eq('user_id', userId).eq('period', periodo).maybeSingle(),
  ]);

  const convocatoria: Convocatoria = convRes.error || !convRes.data
    ? CONVOCATORIA_VACIA
    : {
        escala: (convRes.data.escala as string) ?? null,
        fechaExamen: (convRes.data.fecha_examen as string) ?? null,
        nota: (convRes.data.nota as string) ?? null,
      };

  const etiquetaKind = new Map<string, string>();
  for (const k of kindsRes.data ?? []) etiquetaKind.set(k.id as string, (k.label as string) ?? (k.id as string));

  type FilaGrupo = { class_groups: { name: string; kind: string } | { name: string; kind: string }[] | null };
  const grupos = ((gruposRes.data as FilaGrupo[] | null) ?? [])
    .map((f) => (Array.isArray(f.class_groups) ? f.class_groups[0] : f.class_groups))
    .filter((g): g is { name: string; kind: string } => !!g)
    .map((g) => ({ nombre: g.name, tipo: etiquetaKind.get(g.kind) ?? g.kind }));

  const acceso = memRes.error || !memRes.data
    ? null
    : { estado: (memRes.data.access_status as 'active' | 'suspended') ?? 'active' };

  // Sin fila de `monthly_payments` para este mes = NO pagado (regla 53). Solo
  // se muestra si la academia lleva pagos (hay fila de acceso o de pago).
  const pagoDelMes = (acceso || (!pagoRes.error && pagoRes.data))
    ? { periodo: formateaPeriodo(periodo), pagado: !pagoRes.error && !!pagoRes.data?.paid }
    : null;

  return {
    success: true as const,
    perfil: { email: auth.user.email, convocatoria, acceso, pagoDelMes, grupos },
  };
}
