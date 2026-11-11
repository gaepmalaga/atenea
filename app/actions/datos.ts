'use server'
import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { fallo } from '../lib/fallos';
import { paginaCompleta } from '../lib/pagination';
import { DATOS_VACIOS, limpiaNombre, limpiaTelefono, leeFoto, type DatosAlumno } from '../lib/perfil-alumno';

/**
 * LOS DATOS DEL ALUMNO (regla 114): nombre, teléfono y foto.
 *
 * `profiles` es de las tablas que solo toca la clave de servicio (regla 34):
 * el alumno NO la escribe con su sesión. Cada escritura lleva el id de la
 * sesión —nunca uno que venga por parámetro (regla 1)— y solo las columnas de
 * la lista blanca (regla 2).
 *
 * Las lecturas van en una consulta APARTE de las del resto del perfil: si las
 * columnas todavía no existen (`docs/sql/perfil-alumno.sql` sin ejecutar), se
 * quedan vacías y las pantallas siguen funcionando.
 */

/** El cubo de las fotos en el almacenamiento de Supabase (no es una tabla). */
const CUBO_FOTOS = 'avatars';

type FilaDatos = { id: string; full_name: string | null; phone: string | null; avatar_url: string | null };

const aDatos = (f: Partial<FilaDatos> | null | undefined): DatosAlumno => ({
  nombre: f?.full_name ?? null,
  telefono: f?.phone ?? null,
  fotoUrl: f?.avatar_url ?? null,
});

export async function getMisDatos(): Promise<{ success: true; datos: DatosAlumno } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const { data, error } = await supabaseAdmin
    .from('profiles').select('id, full_name, phone, avatar_url').eq('id', auth.user.id).maybeSingle();
  if (error) {
    fallo('getMisDatos', error);
    return { success: true as const, datos: DATOS_VACIOS };
  }
  return { success: true as const, datos: aDatos(data as FilaDatos | null) };
}

export async function saveMisDatos(input: unknown): Promise<{ success: true; datos: DatosAlumno } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const d = (input ?? {}) as { nombre?: unknown; telefono?: unknown };
  const nombre = limpiaNombre(d.nombre);
  if (!nombre.ok) return { success: false as const, error: nombre.error };
  const telefono = limpiaTelefono(d.telefono);
  if (!telefono.ok) return { success: false as const, error: telefono.error };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: nombre.valor, phone: telefono.valor })
    .eq('id', auth.user.id)
    .select('id, full_name, phone, avatar_url')
    .maybeSingle();
  if (error) return { success: false as const, error: fallo('saveMisDatos', error) };
  return { success: true as const, datos: aDatos(data as FilaDatos | null) };
}

/**
 * La foto: llega ya recortada y reducida a un JPEG pequeño. El fichero se
 * llama como el id del alumno, así que subir otra sustituye a la anterior. La
 * dirección lleva `?v=` para que el navegador no enseñe la vieja.
 */
export async function saveMiFoto(dataUrl: unknown): Promise<{ success: true; fotoUrl: string } | { success: false; error: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const foto = leeFoto(dataUrl);
  if (!foto.ok) return { success: false as const, error: foto.error };

  const ruta = `${auth.user.id}.jpg`;
  const { error: subir } = await supabaseAdmin.storage
    .from(CUBO_FOTOS)
    .upload(ruta, foto.valor, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
  if (subir) return { success: false as const, error: fallo('saveMiFoto', subir) };

  const { data: pub } = supabaseAdmin.storage.from(CUBO_FOTOS).getPublicUrl(ruta);
  const fotoUrl = `${pub.publicUrl}?v=${Date.now()}`;
  const { error } = await supabaseAdmin.from('profiles').update({ avatar_url: fotoUrl }).eq('id', auth.user.id);
  if (error) return { success: false as const, error: fallo('saveMiFoto', error) };
  return { success: true as const, fotoUrl };
}

export async function quitaMiFoto(): Promise<{ success: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { success: false, error: auth.error };
  const { error } = await supabaseAdmin.from('profiles').update({ avatar_url: null }).eq('id', auth.user.id);
  if (error) return { success: false, error: fallo('quitaMiFoto', error) };
  // El fichero se borra después: si falla, queda un fichero suelto, no un perfil roto.
  const { error: borrar } = await supabaseAdmin.storage.from(CUBO_FOTOS).remove([`${auth.user.id}.jpg`]);
  if (borrar) fallo('quitaMiFoto', borrar);
  return { success: true };
}

/** Los ids de los miembros de UNA academia (regla 65). */
async function miembrosDe(organizationId: string): Promise<{ ids: string[]; error: string | null }> {
  const r = await paginaCompleta<{ user_id: string }>(async (d, h) => await
    supabaseAdmin.from('academy_members').select('user_id').eq('academy_id', organizationId).order('user_id').range(d, h));
  return { ids: r.data.map((m) => m.user_id), error: r.error };
}

/**
 * Los datos de TODOS los alumnos de la academia, por id: lo usan «Alumnos»,
 * «Pagos» y el informe para enseñar el nombre y la foto de verdad en vez del
 * nombre deducido del correo.
 */
export async function getDatosAlumnos(): Promise<
  { success: true; datos: Record<string, DatosAlumno> } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: true as const, datos: {} };

  const miembros = await miembrosDe(organizationId);
  if (miembros.error) return { success: false as const, error: miembros.error };

  const datos: Record<string, DatosAlumno> = {};
  // De 200 en 200: los ids van en la URL.
  for (let i = 0; i < miembros.ids.length; i += 200) {
    const { data, error } = await supabaseAdmin
      .from('profiles').select('id, full_name, phone, avatar_url').in('id', miembros.ids.slice(i, i + 200));
    if (error) {
      fallo('getDatosAlumnos', error);
      return { success: true as const, datos: {} };
    }
    for (const f of (data ?? []) as FilaDatos[]) {
      if (f.full_name || f.phone || f.avatar_url) datos[f.id] = aDatos(f);
    }
  }
  return { success: true as const, datos };
}

/** La academia corrige el nombre o el teléfono de un alumno SUYO. La foto es cosa del alumno. */
export async function setDatosAlumno(input: unknown): Promise<{ success: true; datos: DatosAlumno } | { success: false; error: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const organizationId = auth.user.organizationId;
  if (!organizationId) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const d = (input ?? {}) as { alumnoId?: unknown; nombre?: unknown; telefono?: unknown };
  if (typeof d.alumnoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(d.alumnoId)) {
    return { success: false as const, error: 'Datos no válidos.' };
  }
  const nombre = limpiaNombre(d.nombre);
  if (!nombre.ok) return { success: false as const, error: nombre.error };
  const telefono = limpiaTelefono(d.telefono);
  if (!telefono.ok) return { success: false as const, error: telefono.error };

  // Que el alumno sea de ESTA academia, dentro de la consulta (regla 65).
  const { data: miembro, error: leer } = await supabaseAdmin
    .from('academy_members').select('user_id').eq('academy_id', organizationId).eq('user_id', d.alumnoId).maybeSingle();
  if (leer) return { success: false as const, error: fallo('setDatosAlumno', leer) };
  if (!miembro) return { success: false as const, error: 'Ese alumno no es de tu academia.' };

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ full_name: nombre.valor, phone: telefono.valor })
    .eq('id', d.alumnoId)
    .select('id, full_name, phone, avatar_url')
    .maybeSingle();
  if (error) return { success: false as const, error: fallo('setDatosAlumno', error) };
  return { success: true as const, datos: aDatos(data as FilaDatos | null) };
}
