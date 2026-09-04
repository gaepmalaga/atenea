/**
 * EL GASTO DE CADA LLAMADA A LA IA, EN TOKENS Y EN DINERO.
 *
 * POR QUÉ EXISTE
 * Los topes de `rate-limit.ts` cuentan LLAMADAS, y esa no es la unidad que
 * cuesta: una pregunta al chat sobre el tema 7 son 34.675 tokens de entrada y
 * sobre el tema más corto 1.419. Son 25×, y hoy las dos cuentan como «una».
 * Un tope en llamadas acota la ráfaga; no acota la factura.
 *
 * Y no se puede afinar lo que no se mide: `docs/PLAN-DE-TRABAJO.md` ya decía
 * «instrumentar el gasto por módulo ANTES de optimizar nada» y llevaba ahí sin
 * hacer desde el principio.
 *
 * ES LÓGICA PURA (regla 21): la aritmética se puede probar sin red y sin
 * levantar la aplicación. Quien la use se encarga de conseguir los números.
 */

/**
 * Precio de `gemini-2.5-flash`, en dólares por millón de tokens.
 *
 * Consultado en la página de precios de Google el 4 sep 2026. Va en un OBJETO
 * y no en dos constantes sueltas por lo mismo que las reglas del examen
 * (`CNP_SCORING`): el precio cambia, y poder pasar otro es lo único que evita
 * reescribir esto el día que cambie.
 *
 * OJO: es el precio del modelo que usa la plataforma HOY. Si se cambia
 * `TEXT_MODEL` en `actions/core.ts`, esto miente hasta que se actualice.
 */
export const PRECIO_FLASH = {
  modelo: 'gemini-2.5-flash',
  entradaPorMillon: 0.30,
  salidaPorMillon: 2.50,
  /** Consultado el mismo día, en la misma página. */
  revisadoEl: '2026-09-04',
} as const;

export type PrecioModelo = typeof PRECIO_FLASH;

/** Lo que devuelve el SDK. Los campos pueden faltar: no se da por hecho ninguno. */
export type UsoBruto = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
  /** Tokens servidos desde la caché, si el modelo la ha usado. */
  cachedContentTokenCount?: number | null;
};

export type Gasto = {
  entrada: number;
  salida: number;
  cacheados: number;
  /** En dólares. */
  coste: number;
};

/**
 * Convierte lo que devuelve el SDK en tokens y dinero.
 *
 * Un campo que falta cuenta como CERO, no como «no se sabe», y es deliberado:
 * este número se usa para vigilar el gasto, y un `undefined` propagándose
 * convierte la suma entera en `NaN` — con lo que el panel de gasto enseñaría
 * «NaN €» y nadie se enteraría de nada. Cero infravalora una llamada; `NaN`
 * ciega el contador entero.
 */
export function calculaGasto(uso: UsoBruto | null | undefined, precio: PrecioModelo = PRECIO_FLASH): Gasto {
  const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

  const entrada = n(uso?.promptTokenCount);
  const salida = n(uso?.candidatesTokenCount);
  const cacheados = n(uso?.cachedContentTokenCount);

  const coste =
    (entrada / 1_000_000) * precio.entradaPorMillon +
    (salida / 1_000_000) * precio.salidaPorMillon;

  return { entrada, salida, cacheados, coste };
}

/**
 * La línea que va al registro del servidor.
 *
 * Con un formato fijo y reconocible (`[gasto-ia]`) a propósito: así se puede
 * filtrar en los registros de Vercel y sumar sin tener nada montado todavía.
 * Es lo que permite tener números REALES esta semana, antes de que exista la
 * tabla.
 *
 * NO LLEVA EL CORREO DEL ALUMNO, solo su id. Un registro de servidor se mira
 * en sitios donde no hace falta saber de quién es cada consulta.
 */
export function lineaDeGasto(params: {
  ruta: string;
  userId: string;
  gasto: Gasto;
  /** El tema, cuando la llamada lo tiene. Es lo que explica por qué una costó 25× más. */
  detalle?: string;
}): string {
  const { ruta, userId, gasto, detalle } = params;
  const usd = gasto.coste.toFixed(6);
  return [
    '[gasto-ia]',
    `ruta=${ruta}`,
    `usuario=${userId}`,
    `entrada=${gasto.entrada}`,
    `salida=${gasto.salida}`,
    `cache=${gasto.cacheados}`,
    `usd=${usd}`,
    detalle ? `detalle=${detalle}` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Registra el gasto de una llamada: al log del servidor y a `ai_usage`.
 *
 * NUNCA LANZA, Y ESO ES LA MITAD DE SU VALOR. Esto se llama DESPUÉS de una
 * respuesta buena del modelo, así que un fallo del contador no puede llevarse
 * por delante una respuesta que el alumno ya tiene y que ya se ha pagado.
 *
 * NO SE ESPERA A QUE TERMINE EL INSERT. Devuelve el gasto en cuanto lo ha
 * calculado y la escritura viaja sola: hacer esperar al alumno a que se apunte
 * la contabilidad sería cobrarle en latencia una cosa que no le sirve de nada.
 * La contrapartida es que un insert que falle solo se ve en el log — por eso
 * el log se escribe SIEMPRE y primero, y no solo cuando la base de datos no
 * contesta.
 *
 * Va con la clave de servicio: `ai_usage` tiene RLS y CERO políticas a
 * propósito (es de administración), así que con el cliente de la sesión no
 * escribiría nada y, peor, no protestaría (regla 34).
 */
export function registraGasto(params: {
  ruta: string;
  userId: string;
  uso: UsoBruto | null | undefined;
  detalle?: string;
  /** El tema, cuando la llamada lo tiene. Es lo que explica el coste. */
  subjectId?: number | null;
}): Gasto {
  const gasto = calculaGasto(params.uso);

  try {
    console.log(lineaDeGasto({ ruta: params.ruta, userId: params.userId, gasto, detalle: params.detalle }));
  } catch {
    // Un registro que rompe la petición es peor que no tener registro.
  }

  // Una llamada sin gasto medible no se guarda: serían filas a cero que
  // ensucian la media sin aportar nada. El log ya la ha dejado anotada.
  if (gasto.entrada === 0 && gasto.salida === 0) return gasto;

  void persisteGasto(params.ruta, params.userId, gasto, params.subjectId ?? null);
  return gasto;
}

/**
 * El insert. Aparte y `async` para que `registraGasto` no tenga que serlo:
 * si lo fuera, cada sitio que la llama tendría que decidir si esperarla, y
 * alguno acabaría esperándola.
 *
 * El import de `actions/core` es DINÁMICO por lo mismo que en `rate-limit.ts`:
 * ese módulo es `server-only` y arrastra el cliente de Gemini, así que
 * cargarlo arriba obligaría a tener entorno de servidor solo para importar la
 * aritmética de costes — y esta la usan los tests.
 */
async function persisteGasto(
  route: string,
  userId: string,
  gasto: Gasto,
  subjectId: number | null,
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { error } = await supabaseAdmin.from('ai_usage').insert({
      user_id: userId,
      route,
      input_tokens: gasto.entrada,
      output_tokens: gasto.salida,
      cached_tokens: gasto.cacheados,
      cost_usd: gasto.coste,
      subject_id: subjectId,
    });
    // Se registra el fallo en vez de tragárselo: un contador de gasto que deja
    // de escribir en silencio es peor que no tenerlo, porque enseña un total
    // que parece bueno y está bajo.
    if (error) console.error('[gasto-ia] no se pudo guardar:', error.message);
  } catch (e) {
    console.error('[gasto-ia] no se pudo guardar:', e instanceof Error ? e.message : e);
  }
}
