/**
 * Los datos de la academia: nombre, dirección, horario, contacto, y quién da
 * clase. Lógica pura (regla 21): normalización y listas blancas, probables
 * sin levantar la aplicación.
 */

export type AcademySettings = {
  name: string | null;
  address: string | null;
  schedule: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  updatedAt: string | null;
};

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  /**
   * La cuenta con la que entra, si la tiene (regla 97). Los profesores son
   * NOMBRES sin cuenta (regla 96) y lo siguen pudiendo ser: es opcional.
   */
  userId: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un campo en blanco es `null`, nunca cadena vacía (misma familia que regla 16). */
function textoONull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Lista blanca de lo que se puede escribir en `academy_settings`.
 *
 * Es una Server Action pública: sin lista blanca, un objeto con más campos de
 * los esperados sobrescribiría columnas que no debería tocar (regla 2).
 */
export function normalizeAcademySettingsInput(raw: Record<string, unknown>): {
  name: string | null;
  address: string | null;
  schedule: string | null;
  contact_email: string | null;
  contact_phone: string | null;
} {
  return {
    name: textoONull(raw.name),
    address: textoONull(raw.address),
    schedule: textoONull(raw.schedule),
    contact_email: textoONull(raw.contactEmail),
    contact_phone: textoONull(raw.contactPhone),
  };
}

export function rowToAcademySettings(row: Record<string, unknown> | null): AcademySettings {
  if (!row) {
    return { name: null, address: null, schedule: null, contactEmail: null, contactPhone: null, updatedAt: null };
  }
  return {
    name: textoONull(row.name),
    address: textoONull(row.address),
    schedule: textoONull(row.schedule),
    contactEmail: textoONull(row.contact_email),
    contactPhone: textoONull(row.contact_phone),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

/**
 * Lista blanca de un miembro del personal. `role` cae a 'profesor' si llega
 * vacío: un puesto sin nombre no es un dato ausente, es un formulario a
 * medio rellenar, y 'profesor' es el caso más común.
 */
export function normalizeStaffInput(raw: Record<string, unknown>): {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  user_id: string | null;
} | null {
  const name = textoONull(raw.name);
  if (!name) return null; // un profesor sin nombre no se puede pintar
  // La cuenta: un id o nada. Algo que no es un id no se guarda (regla 27).
  const userId = typeof raw.userId === 'string' && UUID.test(raw.userId.trim()) ? raw.userId.trim() : null;
  return {
    name,
    role: textoONull(raw.role) ?? 'profesor',
    email: textoONull(raw.email),
    phone: textoONull(raw.phone),
    active: raw.active !== false,
    user_id: userId,
  };
}

export function rowToStaffMember(row: Record<string, unknown>): StaffMember {
  return {
    id: row.id as string,
    name: (row.name as string) ?? '',
    role: (row.role as string) ?? 'profesor',
    email: textoONull(row.email),
    phone: textoONull(row.phone),
    active: row.active !== false,
    userId: typeof row.user_id === 'string' ? row.user_id : null,
  };
}
