'use server'
import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  normalizeAcademySettingsInput,
  normalizeStaffInput,
  rowToAcademySettings,
  rowToStaffMember,
  type AcademySettings,
  type StaffMember,
} from '../lib/academy-settings';
import { CONVOCATORIA_VACIA, type Convocatoria } from '../lib/convocatoria';
import { fallo } from '../lib/fallos';

/**
 * LOS DATOS DE LA ACADEMIA: nombre, dirección, horario, contacto, quién da
 * clase. Va con la clave de servicio y `requireAdmin` (regla 34/35): esto es
 * administración pura, no del alumno.
 */

export async function getAcademySettings(): Promise<
  { success: true; settings: AcademySettings; slug: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!auth.user.organizationId) return { success: false, error: 'No hay una academia seleccionada.' };

  const [settingsRes, academyRes] = await Promise.all([
    supabaseAdmin
      .from('academy_settings')
      .select('*')
      .eq('organization_id', auth.user.organizationId)
      .maybeSingle(),
    // El slug (el enlace de registro/entrada de la academia, `/alphapol`) vive
    // en `academies`, no en `academy_settings` — sin esto, el propio admin de
    // una academia no tenía forma de ver en ningún sitio cuál es su enlace.
    supabaseAdmin.from('academies').select('slug').eq('id', auth.user.organizationId).maybeSingle(),
  ]);

  if (settingsRes.error) return { success: false, error: fallo('getAcademySettings', settingsRes.error) };
  return {
    success: true,
    settings: rowToAcademySettings(settingsRes.data),
    slug: (academyRes.data?.slug as string) ?? '',
  };
}

export async function saveAcademySettings(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const clean = normalizeAcademySettingsInput((input ?? {}) as Record<string, unknown>);

  const { error } = await supabaseAdmin
    .from('academy_settings')
    .upsert({ organization_id: auth.user.organizationId, ...clean, updated_at: new Date().toISOString() });

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'save_academy_settings', organizationId: auth.user.organizationId });
  }
  return { success: !error, error: fallo('saveAcademySettings', error) };
}

/**
 * LA CONVOCATORIA — la fecha del examen. La pone el admin, la lee el alumno
 * (cuenta atrás en «Mi perfil»). Contenido compartido de solo lectura para el
 * alumno: clave de servicio + `requireUser` (regla 34).
 *
 * Si `academy_convocatoria` todavía no existe (guion sin ejecutar) NO es un
 * error para nadie: se devuelve la convocatoria vacía y la pantalla lo dice.
 */
export async function getConvocatoria(): Promise<
  { success: true; convocatoria: Convocatoria; tablaFalta?: boolean } | { success: false; error: string }
> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  // Un admin/superadmin sin academia resuelta no debería llegar aquí (P11:
  // `requireUser` ya lo habría cortado para un student vía `access`), pero un
  // admin SÍ puede pedirla — sin fila `organization_id` que mirar, se
  // devuelve vacía en vez de reventar.
  if (!auth.user.organizationId) return { success: true as const, convocatoria: CONVOCATORIA_VACIA };

  const { data, error } = await supabaseAdmin
    .from('academy_convocatoria')
    .select('escala, fecha_examen, nota')
    .eq('organization_id', auth.user.organizationId)
    .maybeSingle();

  if (error) {
    if (/could not find the table/i.test(error.message)) {
      return { success: true as const, convocatoria: CONVOCATORIA_VACIA, tablaFalta: true };
    }
    return { success: false as const, error: fallo('getConvocatoria', error) };
  }

  return {
    success: true as const,
    convocatoria: {
      escala: (data?.escala as string) ?? null,
      fechaExamen: (data?.fecha_examen as string) ?? null,
      nota: (data?.nota as string) ?? null,
    },
  };
}

export async function saveConvocatoria(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const raw = (input ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || null;
  };
  // Una fecha vacía es `null`, no `''` (regla 16): «todavía sin convocar».
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.fechaExamen ?? '')) ? String(raw.fechaExamen) : null;

  const { error } = await supabaseAdmin
    .from('academy_convocatoria')
    .upsert({
      organization_id: auth.user.organizationId,
      escala: texto(raw.escala),
      fecha_examen: fecha,
      nota: texto(raw.nota),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    const tablaFalta = /could not find the table/i.test(error.message);
    return { success: false as const, error: fallo('saveConvocatoria', error), tablaFalta };
  }
  registraAccion({ actorId: auth.user.id, action: 'save_convocatoria', organizationId: auth.user.organizationId });
  return { success: true as const };
}

export async function listStaff(): Promise<
  { success: true; staff: StaffMember[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!auth.user.organizationId) return { success: true, staff: [] };

  const { data, error } = await supabaseAdmin
    .from('academy_staff')
    .select('*')
    .eq('organization_id', auth.user.organizationId)
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) return { success: false, error: fallo('listStaff', error) };
  return { success: true, staff: (data ?? []).map(rowToStaffMember) };
}

/** Sin `id`, crea. Con `id`, actualiza — el mismo formulario sirve para las dos cosas. */
export async function saveStaff(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const raw = (input ?? {}) as Record<string, unknown>;
  const clean = normalizeStaffInput(raw);
  if (!clean) return { success: false as const, error: 'Falta el nombre.' };

  // La cuenta enlazada (regla 97) tiene que ser de esta academia: con la
  // clave de servicio nada más lo impide (regla 34).
  if (clean.user_id) {
    const { data: socio } = await supabaseAdmin.from('academy_members').select('user_id')
      .eq('academy_id', auth.user.organizationId).eq('user_id', clean.user_id).maybeSingle();
    if (!socio) return { success: false as const, error: 'Esa cuenta no es de tu academia.' };
  }

  const id = typeof raw.id === 'string' && raw.id ? raw.id : undefined;
  const payload: typeof clean & { id?: string; organization_id: string } = {
    ...clean,
    organization_id: auth.user.organizationId,
  };
  if (id) payload.id = id;
  const { error } = await supabaseAdmin.from('academy_staff').upsert(payload);

  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'save_staff', target: clean.name, organizationId: auth.user.organizationId });
  }
  // El índice único (una cuenta, un profesor por academia) habla en inglés.
  const yaTiene = error && /academy_staff_una_cuenta|duplicate key/i.test(error.message);
  return { success: !error, error: yaTiene ? 'Esa cuenta ya es de otro profesor.' : fallo('saveStaff', error) };
}

/**
 * Las cuentas de la academia, para enlazar un profesor con la suya (regla 97).
 * Primero las de administración, que es lo normal en quien da clase.
 */
export async function listCuentasAcademia(): Promise<
  { success: true; cuentas: { id: string; email: string; role: string }[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: true as const, cuentas: [] };
  const { data: socios, error } = await supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', org);
  if (error) return { success: false as const, error: fallo('listCuentasAcademia', error) };
  const ids = (socios ?? []).map((x) => x.user_id as string);
  if (!ids.length) return { success: true as const, cuentas: [] };
  const { data: perfiles, error: e2 } = await supabaseAdmin.from('profiles').select('id, email, role').in('id', ids);
  if (e2) return { success: false as const, error: fallo('listCuentasAcademia', e2) };
  const peso = (r: string) => (r === 'admin' ? 0 : r === 'superadmin' ? 1 : 2);
  return {
    success: true as const,
    cuentas: (perfiles ?? [])
      .map((p) => ({ id: p.id as string, email: (p.email as string | null) ?? '—', role: (p.role as string | null) ?? 'student' }))
      .sort((a, b) => peso(a.role) - peso(b.role) || a.email.localeCompare(b.email)),
  };
}

export async function deleteStaff(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!auth.user.organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };
  if (!id) return { success: false as const, error: 'Falta quién borrar.' };

  const { error } = await supabaseAdmin
    .from('academy_staff')
    .delete()
    .eq('id', id)
    .eq('organization_id', auth.user.organizationId);
  if (!error) {
    registraAccion({ actorId: auth.user.id, action: 'delete_staff', target: id, organizationId: auth.user.organizationId });
  }
  return { success: !error, error: fallo('deleteStaff', error) };
}
