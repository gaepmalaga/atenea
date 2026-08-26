/**
 * Cuota por usuario para las rutas que llaman a Gemini.
 *
 * Cinco acciones distintas llamaban al modelo sin ningun control: cada mensaje
 * del chat, cada tarjeta, cada turno de la entrevista y cada plan es una llamada
 * de pago. Con la sesion de un solo alumno se podia dejar la factura en bucle.
 *
 * LIMITACION CONOCIDA, y es importante: el contador vive en memoria del proceso.
 * En un despliegue con varias instancias (Vercel levanta y recicla procesos)
 * cada una lleva su propia cuenta, asi que el limite real es el configurado
 * multiplicado por el numero de instancias vivas. Sirve para lo que mas duele
 * —un bucle desde una pestania, un script tonto contra una accion— y NO sirve
 * como control de gasto exacto. La version duradera necesita una tabla; el SQL
 * esta en `docs/sql/1.4-cuota-ia.sql`.
 *
 * Modulo puro a proposito: el reloj entra por parametro para poder testearlo.
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

  if (bucket.count >= quota.limit) {
    const retryAfterMs = bucket.resetAt - now;
    return {
      ok: false,
      retryAfterMs,
      error: `Has agotado tu cuota de esta función. Vuelve a intentarlo en ${minutos(retryAfterMs)} min.`,
    };
  }

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

/**
 * `consume` con limpieza periodica. Es la que usan las acciones.
 *
 * Es `async` aunque hoy no espere nada: la version duradera consulta la base de
 * datos (`docs/sql/1.4-cuota-ia.sql`), y teniendo ya el `await` puesto en las
 * ocho acciones, ese cambio se queda dentro de este fichero.
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
  return consume(userId, name, now);
}
