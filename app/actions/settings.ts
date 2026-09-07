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

  const { data, error } = await supabaseAdmin
    .from('academy_convocatoria')
    .select('escala, fecha_examen, nota')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    if (/could not find the table/i.test(error.message)) {
      return { success: true as const, convocatoria: CONVOCATORIA_VACIA, tablaFalta: true };
    }
    return { success: false as const, error: error.message };
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
      id: 1,
      escala: texto(raw.escala),
      fecha_examen: fecha,
      nota: texto(raw.nota),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    const tablaFalta = /could not find the table/i.test(error.message);
    return { success: false as const, error: error.message, tablaFalta };
  }
  registraAccion({ actorId: auth.user.id, action: 'save_convocatoria' });
  return { success: true as const };
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
