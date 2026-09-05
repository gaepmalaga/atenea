'use server'
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { registraAccion } from '../lib/admin-audit';
import {
  normalizeAcademySettingsInput,
  normalizeStaffInput,
  rowToAcademySettings,
  rowToStaffMember,
  type AcademySettings,
  type StaffMember,
} from '../lib/academy-settings';

/**
 * LOS DATOS DE LA ACADEMIA: nombre, dirección, horario, contacto, quién da
 * clase. Va con la clave de servicio y `requireAdmin` (regla 34/35): esto es
 * administración pura, no del alumno.
 */

export async function getAcademySettings(): Promise<
  { success: true; settings: AcademySettings } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('academy_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  return { success: true, settings: rowToAcademySettings(data) };
}

export async function saveAcademySettings(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const clean = normalizeAcademySettingsInput((input ?? {}) as Record<string, unknown>);

  const { error } = await supabaseAdmin
    .from('academy_settings')
    .upsert({ id: 1, ...clean, updated_at: new Date().toISOString() });

  if (!error) registraAccion({ actorId: auth.user.id, action: 'save_academy_settings' });
  return { success: !error, error: error?.message };
}

export async function listStaff(): Promise<
  { success: true; staff: StaffMember[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const { data, error } = await supabaseAdmin
    .from('academy_staff')
    .select('*')
    .order('active', { ascending: false })
    .order('name', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, staff: (data ?? []).map(rowToStaffMember) };
}

/** Sin `id`, crea. Con `id`, actualiza — el mismo formulario sirve para las dos cosas. */
export async function saveStaff(input: unknown) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };

  const raw = (input ?? {}) as Record<string, unknown>;
  const clean = normalizeStaffInput(raw);
  if (!clean) return { success: false as const, error: 'Falta el nombre.' };

  const id = typeof raw.id === 'string' && raw.id ? raw.id : undefined;
  const payload: typeof clean & { id?: string } = { ...clean };
  if (id) payload.id = id;
  const { error } = await supabaseAdmin.from('academy_staff').upsert(payload);

  if (!error) registraAccion({ actorId: auth.user.id, action: 'save_staff', target: clean.name });
  return { success: !error, error: error?.message };
}

export async function deleteStaff(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  if (!id) return { success: false as const, error: 'Falta quién borrar.' };

  const { error } = await supabaseAdmin.from('academy_staff').delete().eq('id', id);
  if (!error) registraAccion({ actorId: auth.user.id, action: 'delete_staff', target: id });
  return { success: !error, error: error?.message };
}
