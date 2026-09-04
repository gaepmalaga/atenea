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
const DIA = 24 * HORA;

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

/**
 * EL TOPE DIARIO. Es el que acota la factura; el de la hora solo acota la
 * rafaga.
 *
 * POR QUE HACIA FALTA
 * Con solo la ventana de una hora, 30 chats/hora son 720 al dia. A ~0,005 EUR
 * la pregunta —el chat manda el documento entero, regla 33— eso son 4 EUR/dia
 * y ~120 EUR al mes DE UN SOLO ALUMNO. Nadie estudia asi, pero el limite lo
 * consentia, y un limite que consiente lo que no puedes pagar no es un limite.
 *
 * Los numeros salen de lo que hace alguien que estudia de verdad, con holgura:
 * 60 preguntas al chat en un dia son muchas mas de las que nadie hace, y aun
 * asi acotan el gasto de ese alumno a ~0,30 EUR/dia.
 *
 * OJO: esto son LLAMADAS, no tokens, y no es la unidad correcta —una pregunta
 * sobre el tema 7 son 34.675 tokens y sobre el mas corto 1.419, o sea 25x, y
 * las dos cuentan como una. Es un tope provisional y deliberadamente
 * conservador para que no llegue una factura inesperada MIENTRAS se instrumenta
 * el gasto real. Cuando se cuenten tokens, esto se sustituye por un tope en la
 * unidad que de verdad cuesta.
 */
export const TOPES_DIARIOS = {
  chat: 60,
  flashcard: 80,
  question: 100,
  interview: 60,
  report: 10,
  plan: 4,
  seed: 40,
  index: 60,
} as const satisfies Record<QuotaNameBase, number>;

/** El nombre del contador diario de una ruta. `chat` -> `chat:dia`. */
export function bucketDiario(name: QuotaNameBase): string {
  return `${name}:dia`;
}

export type QuotaNameBase = keyof typeof QUOTAS;
export type QuotaName = QuotaNameBase;

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
  return consumeBucket(`${name}:${userId}`, quota.limit, quota.windowMs, now);
}

/**
 * La aritmetica, con la clave y el limite por parametro.
 *
 * Sale de `consume` para que el tope diario use EXACTAMENTE la misma, en vez
 * de una copia: dos contadores con dos aritmeticas es como se acaba teniendo
 * dos comportamientos distintos sin que nadie lo decida.
 */
export function consumeBucket(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const bucket = buckets.get(key);

  // Ventana fija: al expirar se empieza de cero. Mas simple de razonar que una
  // deslizante, y aqui no hace falta la precision.
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) return agotada(bucket.resetAt - now);

  bucket.count++;
  return { ok: true, remaining: limit - bucket.count };
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

  // EL TOPE DIARIO VA PRIMERO, y el orden importa: si se comprobara despues,
  // una peticion que el dia ya no admite habria consumido igualmente un hueco
  // de la hora. Contar de mas en el que corta es inofensivo; contar de mas en
  // el que no corta le quita al alumno peticiones que si podia hacer.
  const dia = await consumirTopeDiario(userId, name, now);
  if (!dia.ok) return dia;

  const enMemoria = consume(userId, name, now);
  // Ya agotada aqui: la BD solo puede ser mas permisiva, y no queremos eso.
  if (!enMemoria.ok) return enMemoria;

  return (await consumirEnBaseDeDatos(userId, name, now)) ?? enMemoria;
}

/**
 * El contador del dia, en la base de datos.
 *
 * Usa la MISMA funcion `consume_ai_quota` con otro `bucket` y otra ventana:
 * `ai_quota.bucket` es texto libre y el limite y la ventana son parametros, asi
 * que esto no ha necesitado ni una linea de SQL nueva — que en este repo es el
 * cuello de botella de todo lo demas.
 *
 * Si la base de datos no contesta, se cae al contador en memoria del dia. Es
 * mas debil (con varias instancias el limite real se multiplica) pero es lo
 * que sostiene el tope si la BD se cae a mitad de una ventana, y contar de
 * menos aqui es justo lo que no se quiere.
 */
async function consumirTopeDiario(
  userId: string,
  name: QuotaNameBase,
  now: number,
): Promise<RateLimitResult> {
  const limit = TOPES_DIARIOS[name];
  const bucket = bucketDiario(name);

  const enMemoria = consumeBucket(`${userId}:${bucket}`, limit, DIA, now);
  if (!enMemoria.ok) return enMemoria;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return enMemoria;

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { data, error } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_user_id: userId,
      p_bucket: bucket,
      p_limit: limit,
      p_window: `${DIA} milliseconds`,
    });
    if (error) {
      console.error('tope diario (se usa el contador en memoria):', error.message);
      return enMemoria;
    }
    const fila = (Array.isArray(data) ? data[0] : data) as FilaCuota | undefined;
    return fila ? interpretarCuota(fila, now) : enMemoria;
  } catch (e) {
    console.error('tope diario (se usa el contador en memoria):', e instanceof Error ? e.message : e);
    return enMemoria;
  }
}
