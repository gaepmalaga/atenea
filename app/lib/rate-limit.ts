/**
 * Cuota por usuario para las rutas que llaman a Gemini.
 *
 * Cinco acciones distintas llamaban al modelo sin ningun control: cada mensaje
 * del chat, cada tarjeta, cada turno de la entrevista y cada plan es una llamada
 * de pago. Con la sesion de un solo alumno se podia dejar la factura en bucle.
 *
 * DOS CONTADORES, Y EL DE VERDAD ES EL DE LA BASE DE DATOS.
 *
 * El contador en memoria no basta: en un despliegue con varias instancias
 * (Vercel levanta y recicla procesos) cada una lleva su propia cuenta, asi que
 * el limite real seria el configurado multiplicado por el numero de instancias
 * vivas. Por eso `checkQuota` consulta `consume_ai_quota`, que incrementa la
 * fila de forma atomica en una sola sentencia (docs/sql/1.4-cuota-ia.sql).
 *
 * El de memoria se queda como RESPALDO: si la base de datos no responde, es
 * mejor limitar de mas que no limitar. Y si ya se agoto en memoria, no hace
 * falta ni preguntar.
 *
 * `consume` y `sweep` siguen siendo puros —el reloj entra por parametro— para
 * poder testear la aritmetica sin red.
 */

export type Quota = {
  /** Llamadas permitidas dentro de la ventana. */
  limit: number;
  /** Tamanio de la ventana, en milisegundos. */
  windowMs: number;
};

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * Cuota de cada ruta. Los numeros salen de lo que cuesta cada llamada y de que
 * un alumno normal no los roza: el chat es lo que mas se usa, sembrar el banco
 * es lo que mas cuesta.
 */
export const QUOTAS = {
  chat: { limit: 30, windowMs: HORA },
  flashcard: { limit: 40, windowMs: HORA },
  question: { limit: 60, windowMs: HORA },
  interview: { limit: 80, windowMs: HORA },
  report: { limit: 10, windowMs: HORA },
  plan: { limit: 6, windowMs: HORA },
  /** Sembrar y indexar son de admin, pero cuestan mucho por llamada. */
  seed: { limit: 10, windowMs: HORA },
  index: { limit: 20, windowMs: HORA },
} as const satisfies Record<string, Quota>;

export type QuotaName = keyof typeof QUOTAS;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number; error: string };

type Bucket = { count: number; resetAt: number };

/**
 * Almacen de contadores. Se expone para poder vaciarlo en los tests; en
 * produccion nadie lo toca desde fuera.
 */
export const buckets = new Map<string, Bucket>();

function minutos(ms: number): number {
  return Math.max(1, Math.ceil(ms / MINUTO));
}

/** La respuesta de cuota agotada. La comparten el contador en memoria y el de la BD. */
function agotada(retryAfterMs: number): RateLimitResult {
  const ms = Math.max(0, retryAfterMs);
  return {
    ok: false,
    retryAfterMs: ms,
    error: `Has agotado tu cuota de esta función. Vuelve a intentarlo en ${minutos(ms)} min.`,
  };
}

/**
 * Consume una unidad de cuota. Devuelve un resultado, no lanza: las Server
 * Actions redactan las excepciones en produccion (igual que `requireUser`).
 */
export function consume(
  userId: string,
  name: QuotaName,
  now = Date.now(),
): RateLimitResult {
  const quota = QUOTAS[name];
  const key = `${name}:${userId}`;
  const bucket = buckets.get(key);

  // Ventana fija: al expirar se empieza de cero. Mas simple de razonar que una
  // deslizante, y aqui no hace falta la precision.
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + quota.windowMs });
    return { ok: true, remaining: quota.limit - 1 };
  }

  if (bucket.count >= quota.limit) return agotada(bucket.resetAt - now);

  bucket.count++;
  return { ok: true, remaining: quota.limit - bucket.count };
}

/**
 * Tira las entradas ya expiradas.
 *
 * Sin esto el mapa crece con cada usuario que pasa por la aplicacion y no baja
 * nunca: una fuga de memoria lenta pero segura en un proceso de larga vida.
 */
export function sweep(now = Date.now()): number {
  let borradas = 0;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
      borradas++;
    }
  }
  return borradas;
}

/** Cada cuantas llamadas se hace limpieza. */
export const SWEEP_EVERY = 500;
let desdeUltimaLimpieza = 0;

/** Una fila de `consume_ai_quota`. */
export type FilaCuota = { allowed: boolean; remaining: number; reset_at: string };

/**
 * Traduce la respuesta de la funcion SQL al resultado que esperan las acciones.
 *
 * Separada y exportada para poder testear el mapeo sin base de datos: es donde
 * esta la unica logica de esta ruta.
 */
export function interpretarCuota(fila: FilaCuota, now = Date.now()): RateLimitResult {
  if (fila.allowed) return { ok: true, remaining: Math.max(0, fila.remaining) };

  // `reset_at` llega como texto desde PostgREST. Si no se puede leer, se cae a
  // la ventana completa antes que dar un retryAfter negativo o NaN.
  const reset = Date.parse(fila.reset_at);
  return agotada(Number.isFinite(reset) ? reset - now : HORA);
}

/**
 * Consume una unidad en la tabla `ai_quota`. `null` si no se pudo consultar.
 *
 * El import es dinamico a proposito: `actions/core` es `server-only` y arrastra
 * el cliente de Gemini. Cargarlo arriba obligaria a tener entorno de servidor
 * solo para importar este modulo, y los tests de la aritmetica no lo necesitan.
 */
async function consumirEnBaseDeDatos(
  userId: string,
  name: QuotaName,
  now: number,
): Promise<RateLimitResult | null> {
  // Sin clave de servicio no hay a donde llamar (tests, o entorno a medio
  // configurar). Se cae al contador en memoria sin hacer ruido.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { limit, windowMs } = QUOTAS[name];

    const { data, error } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_user_id: userId,
      p_bucket: name,
      p_limit: limit,
      p_window: `${windowMs} milliseconds`,
    });

    if (error) {
      console.error('checkQuota (se usa el contador en memoria):', error.message);
      return null;
    }

    const fila = (Array.isArray(data) ? data[0] : data) as FilaCuota | undefined;
    return fila ? interpretarCuota(fila, now) : null;
  } catch (e) {
    console.error('checkQuota (se usa el contador en memoria):', e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * La que usan las acciones. Cuota duradera con respaldo en memoria.
 *
 * Se consume SIEMPRE en memoria, tambien cuando la base de datos responde: es
 * lo que sostiene el limite si la BD deja de contestar a mitad de una ventana.
 * Contar de mas en ese caso es justo lo que se busca.
 */
export async function checkQuota(
  userId: string,
  name: QuotaName,
  now = Date.now(),
): Promise<RateLimitResult> {
  if (++desdeUltimaLimpieza >= SWEEP_EVERY) {
    desdeUltimaLimpieza = 0;
    sweep(now);
  }

  const enMemoria = consume(userId, name, now);
  // Ya agotada aqui: la BD solo puede ser mas permisiva, y no queremos eso.
  if (!enMemoria.ok) return enMemoria;

  return (await consumirEnBaseDeDatos(userId, name, now)) ?? enMemoria;
}
