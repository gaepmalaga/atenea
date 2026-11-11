/**
 * LOS FALLOS DEL SERVIDOR: QUÉ VE EL USUARIO Y DÓNDE QUEDA EL DETALLE (regla 108).
 *
 * POR QUÉ EXISTE
 * 128 acciones devolvían al navegador `error.message` tal cual lo escribe
 * Postgres: «column "x" of relation "y" does not exist», «violates foreign key
 * constraint …». Eso le enseña a cualquiera el nombre de las tablas y las
 * columnas, y al alumno no le dice nada que pueda usar. Y al revés: el detalle
 * que SÍ hace falta para arreglarlo solo vivía en el registro de Vercel, que
 * nadie mira y que caduca.
 *
 * Ahora cada fallo hace tres cosas:
 *   · al navegador va un mensaje corto y sin nada de la base de datos;
 *   · al registro del servidor va la línea entera, con prefijo `[fallo]`;
 *   · y se guarda en `admin_audit_log` con `action = 'error'`, para que salga
 *     en la pestaña «Logs» con quién, dónde y qué dijo la base de datos.
 *
 * No hace falta tabla nueva: `admin_audit_log` ya tiene quién (`actor_id`),
 * dónde (`target`), el detalle (`detail`) y la academia.
 *
 * Mismo patrón que `admin-audit.ts`: nunca lanza y no se espera. Registrar un
 * fallo no puede provocar otro.
 */

/** Lo que ve el usuario. No lleva nada de lo que dijo la base de datos. */
export const MENSAJE_FALLO =
  'No se ha podido completar. Vuelve a intentarlo; si sigue fallando, avisa a la academia.';

type ErrorDeBD = { message?: string; code?: string; details?: string | null; hint?: string | null } | Error;

/** Lo que se guarda de un error: texto y código, recortados. */
export function detalleDeFallo(error: unknown): { mensaje: string; codigo: string | null } {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown };
    return {
      mensaje: String(e.message ?? 'Error sin mensaje').slice(0, 500),
      codigo: typeof e.code === 'string' ? e.code : null,
    };
  }
  return { mensaje: String(error ?? 'Error sin mensaje').slice(0, 500), codigo: null };
}

/**
 * El mismo fallo repetido (un bucle, un alumno que pulsa veinte veces) se
 * guarda una vez por minuto y por instancia: el registro tiene que poder
 * leerse, y un fallo en bucle no puede llenar la tabla.
 */
const VENTANA_MS = 60_000;
const MAX_CLAVES = 500;
const vistos = new Map<string, number>();

export function yaRegistrado(clave: string, ahora: number): boolean {
  const hasta = vistos.get(clave);
  if (hasta && hasta > ahora) return true;
  if (vistos.size >= MAX_CLAVES) vistos.clear();
  vistos.set(clave, ahora + VENTANA_MS);
  return false;
}

/** Solo para los tests. */
export function olvidaFallos(): void {
  vistos.clear();
}

/**
 * Registra el fallo y devuelve lo que se le dice al usuario.
 *
 * Con `null`/`undefined` devuelve `undefined` y no registra nada: así sirve
 * donde antes ponía `error: error?.message`.
 *
 *   if (error) return { success: false as const, error: fallo('saveCelda', error) };
 *   return { success: !error, error: fallo('saveCelda', error) };
 */
export function fallo(donde: string, error: ErrorDeBD): string;
export function fallo(donde: string, error: ErrorDeBD | null | undefined): string | undefined;
export function fallo(donde: string, error: ErrorDeBD | null | undefined): string | undefined {
  if (!error) return undefined;
  const { mensaje, codigo } = detalleDeFallo(error);
  try {
    console.error(`[fallo] donde=${donde}${codigo ? ` codigo=${codigo}` : ''} ${mensaje}`);
  } catch {
    // Un registro que rompe la petición es peor que no tener registro.
  }
  if (!yaRegistrado(`${donde}|${mensaje}`, Date.now())) void persisteFallo(donde, mensaje, codigo);
  return MENSAJE_FALLO;
}

/**
 * El insert, aparte y sin esperar. Quién ha sido sale de la sesión, aquí y no
 * por parámetro: en el camino del fallo dos consultas de más no importan, y
 * así no hay que pasarle el usuario a cada una de las 128 llamadas. Sin sesión
 * no se guarda (`actor_id` es obligatorio): queda la línea del servidor.
 *
 * Import dinámico por lo mismo que `admin-audit.ts`: `auth` y `core` son
 * `server-only` y arrastran el cliente de Gemini.
 */
async function persisteFallo(donde: string, mensaje: string, codigo: string | null): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const [{ getSessionUser }, { supabaseAdmin }] = await Promise.all([
      import('./auth'),
      import('../actions/core'),
    ]);
    const user = await getSessionUser();
    if (!user) return;
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: user.id,
      action: 'error',
      target: donde,
      detail: { mensaje, codigo, rol: user.role },
      organization_id: user.organizationId,
    });
    if (error) console.error('[fallo] no se pudo guardar:', error.message);
  } catch (err) {
    console.error('[fallo] no se pudo guardar:', err instanceof Error ? err.message : err);
  }
}
