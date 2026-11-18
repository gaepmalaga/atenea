/**
 * EL ÚLTIMO ACCESO DE CADA USUARIO (regla 133).
 *
 * `auth.users.last_sign_in_at` solo cambia al iniciar sesión de verdad: quien
 * deja la sesión abierta (la app la renueva sola cada hora) salía «hace 4
 * días» estando conectado. La función `ultimo_acceso_usuarios`
 * (`docs/sql/ultimo-acceso.sql`) añade la última renovación de sus sesiones.
 * Aquí se combinan las dos fechas y se queda la MÁS RECIENTE. Sin la función
 * (aún sin crear en la base de datos) vale `last_sign_in_at` como antes.
 *
 * Módulo PURO (regla 21).
 */

export type FilaAcceso = { user_id: string; ultimo_acceso: string | null };

/** La más reciente de dos fechas ISO; `null` si no hay ninguna. */
export function masReciente(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = a ? Date.parse(a) : NaN;
  const tb = b ? Date.parse(b) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return null;
  if (Number.isNaN(tb) || ta >= tb) return a ?? null;
  return b ?? null;
}

/** Usuario → su último acceso, con lo que haya (inicios de sesión y, si existe, la función). */
export function combinaAccesos(
  usuarios: { id: string; last_sign_in_at?: string | null }[] | null | undefined,
  filas: FilaAcceso[] | null | undefined,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const u of usuarios ?? []) out.set(u.id, u.last_sign_in_at ?? null);
  for (const f of filas ?? []) out.set(f.user_id, masReciente(out.get(f.user_id) ?? null, f.ultimo_acceso));
  return out;
}
