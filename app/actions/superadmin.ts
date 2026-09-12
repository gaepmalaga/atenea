'use server'

import { supabaseAdmin } from './core';
import { requireSuperadmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  normalizeAcademyInput,
  resumeAcademias,
  type AcademyStats,
} from '../lib/academies';
import { periodoActual } from '../lib/payments';

/**
 * EL PANEL TRANSVERSAL DEL SUPERADMIN (P11f) Y EL ALTA DE ACADEMIAS (P11i).
 *
 * Todo con `requireSuperadmin`, no `requireAdmin`: esto no es «más admin», es
 * ver y decidir cosas de TODAS las academias a la vez — exactamente lo que un
 * `admin` normal no puede hacer (regla 65). Va con la clave de servicio por
 * lo mismo de siempre (regla 34/35): estas tablas no tienen política que deje
 * pasar a nadie con su propia sesión.
 *
 * La aritmética de la comparativa vive en `lib/academies.ts`
 * (`resumeAcademias`), no aquí (regla 21).
 */

const MAX_FILAS_GASTO = 50_000;
const MAX_PERFILES = 5_000;

export async function getAcademiesOverview(): Promise<
  { success: true; data: AcademyStats[] } | { success: false; error: string }
> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const periodo = periodoActual();
  const [academiasRes, miembrosRes, perfilesRes, gastoRes, pagosRes] = await Promise.all([
    supabaseAdmin.from('academies').select('id, slug, name').order('name'),
    supabaseAdmin.from('academy_members').select('academy_id, user_id'),
    supabaseAdmin.from('profiles').select('id, role').limit(MAX_PERFILES),
    supabaseAdmin.from('ai_usage').select('user_id, cost_usd').limit(MAX_FILAS_GASTO),
    supabaseAdmin.from('monthly_payments').select('organization_id, amount_eur, paid').eq('period', periodo),
  ]);

  if (academiasRes.error) {
    console.error('getAcademiesOverview:', academiasRes.error.message);
    return { success: false as const, error: academiasRes.error.message };
  }

  const roles = new Map<string, string>();
  for (const p of perfilesRes.data ?? []) roles.set(p.id as string, (p.role as string) ?? 'student');

  // `cost_usd` es `numeric` en Postgres: PostgREST lo sirve como CADENA
  // (regla del panel de consumo de IA, `lib/ai-cost.ts`). Sumarlo sin
  // `parseFloat` daría 0 y la comparativa mentiría diciendo que todo es gratis.
  const costePorUsuario = new Map<string, number>();
  for (const f of gastoRes.data ?? []) {
    const uid = f.user_id as string | null;
    if (!uid) continue;
    const raw = f.cost_usd as number | string | null;
    const coste = typeof raw === 'string' ? Number.parseFloat(raw) : typeof raw === 'number' ? raw : 0;
    if (!Number.isFinite(coste) || coste <= 0) continue;
    costePorUsuario.set(uid, (costePorUsuario.get(uid) ?? 0) + coste);
  }

  const data = resumeAcademias(
    (academiasRes.data ?? []) as { id: string; slug: string; name: string }[],
    (miembrosRes.data ?? []) as { academy_id: string; user_id: string }[],
    roles,
    costePorUsuario,
    (pagosRes.data ?? []) as { organization_id: string | null; amount_eur: number | null; paid: boolean }[],
  );

  return { success: true as const, data };
}

/**
 * Da de alta una academia (P11i). No es un guion de línea de comandos ni un
 * flujo de autorregistro (decidido): el `superadmin` ya es quien controla el
 * banco global y ve todas las academias, así que dar de alta una nueva es una
 * pantalla más de su panel.
 *
 * No hace falta sembrar nada más: `academy_settings`, `membership_settings` y
 * `academy_convocatoria` no tienen fila hasta que un admin de esa academia
 * guarda algo por primera vez, y las acciones que las leen ya degradan con
 * gracia sin ella (regla 8). `membership_settings.required` sin fila se lee
 * como `false` — la academia nace abierta, como el resto (regla 52).
 */
export async function createAcademy(
  input: unknown,
): Promise<{ success: true; id: string; slug: string } | { success: false; error: string }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeAcademyInput((input ?? {}) as Record<string, unknown>);
  if (!clean) return { success: false as const, error: 'Falta el nombre, o el slug no es válido.' };

  const { data, error } = await supabaseAdmin
    .from('academies')
    .insert({ slug: clean.slug, name: clean.name })
    .select('id')
    .single();

  if (error) {
    const duplicada = /duplicate key|unique/i.test(error.message);
    return { success: false as const, error: duplicada ? `Ya existe una academia con el enlace «${clean.slug}».` : error.message };
  }

  registraAccion({ actorId: auth.user.id, action: 'create_academy', target: clean.name, detail: { slug: clean.slug } });
  return { success: true as const, id: data.id as string, slug: clean.slug };
}

/**
 * Añade a alguien como admin de una academia, por su correo.
 *
 * Una academia recién creada no tiene a nadie que pueda administrarla — sin
 * esto, darla de alta sería un callejón sin salida. Busca una cuenta YA
 * EXISTENTE (no crea usuarios desde aquí, eso sigue siendo el registro
 * normal): si es `student`, la sube a `admin`; si ya es `admin` o
 * `superadmin`, se deja el rol como está. `ignoreDuplicates` en
 * `academy_members`: añadir dos veces al mismo no es un error.
 */
export async function addAcademyAdmin(
  academyId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireSuperadmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!academyId || !email) return { success: false, error: 'Falta la academia o el correo.' };

  const correo = email.trim().toLowerCase();
  if (!correo) return { success: false, error: 'Falta el correo.' };

  const { data: perfil, error: leer } = await supabaseAdmin
    .from('profiles')
    .select('id, role')
    .ilike('email', correo)
    .maybeSingle();
  if (leer) return { success: false, error: leer.message };
  if (!perfil) return { success: false, error: 'No hay ninguna cuenta con ese correo. Tiene que registrarse antes.' };

  if (perfil.role === 'student') {
    const { error: rolErr } = await supabaseAdmin.from('profiles').update({ role: 'admin' }).eq('id', perfil.id);
    if (rolErr) return { success: false, error: rolErr.message };
  }

  const { error } = await supabaseAdmin
    .from('academy_members')
    .upsert({ academy_id: academyId, user_id: perfil.id }, { onConflict: 'academy_id,user_id', ignoreDuplicates: true });

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'add_academy_admin', target: correo, detail: { academyId } });
  }
  return { success: !error, error: error?.message };
}
