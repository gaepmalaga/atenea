/**
 * Lo que Supabase dice, dicho en cristiano.
 *
 * POR QUÉ EXISTE
 * La pantalla de entrada pintaba `err.message` tal cual, y `err.message` viene
 * de Supabase **en inglés**: un opositor que se equivocaba de contraseña leía
 * «Invalid login credentials». Es el primer texto que ve alguien que entra en
 * la plataforma, y estaba sin traducir.
 *
 * Y hay uno que importa más que los demás: `Email not confirmed`. El proyecto
 * tiene `Confirm email` ACTIVADO, así que quien se registra por la vía normal
 * no puede entrar hasta pulsar el enlace del correo. Con el mensaje en inglés
 * y sin explicación, eso se lee como «la plataforma no funciona».
 *
 * Es lógica pura y vive en `lib/` (regla 21): así se puede probar sin levantar
 * la aplicación ni hablar con Supabase.
 */

/**
 * Cada entrada es un trozo de lo que manda Supabase (en minúsculas) y lo que
 * se le enseña al usuario. Se compara por `includes` y no por igualdad: los
 * mensajes traen a veces un número o un sufijo (los segundos que faltan para
 * poder reintentar, por ejemplo).
 */
const TRADUCCIONES: ReadonlyArray<readonly [string, string]> = [
  [
    'invalid login credentials',
    'Correo o contraseña incorrectos. Revísalos y vuelve a intentarlo.',
  ],
  [
    'email not confirmed',
    'Tu cuenta existe, pero el correo aún no está confirmado. Busca el mensaje de Atenea en tu bandeja (mira también en spam) y pulsa el enlace.',
  ],
  [
    'user already registered',
    'Ya hay una cuenta con ese correo. Cambia a «Entrar» para iniciar sesión.',
  ],
  [
    'already been registered',
    'Ya hay una cuenta con ese correo. Cambia a «Entrar» para iniciar sesión.',
  ],
  [
    'password should be at least',
    'La contraseña es demasiado corta: necesita al menos 6 caracteres.',
  ],
  [
    'unable to validate email address',
    'Ese correo no tiene un formato válido.',
  ],
  [
    'for security purposes',
    'Has probado demasiadas veces seguidas. Espera unos segundos y vuelve a intentarlo.',
  ],
  [
    'email rate limit exceeded',
    'Se ha alcanzado el límite de correos de la plataforma. Prueba dentro de un rato.',
  ],
  [
    'over_request_rate_limit',
    'Has probado demasiadas veces seguidas. Espera unos segundos y vuelve a intentarlo.',
  ],
  [
    'signups not allowed',
    'El registro está cerrado. Pide a tu academia que te dé de alta.',
  ],
  // Fallo de red: `fetch` lanza esto cuando no hay conexión o el proyecto no
  // responde. Sin traducir se leía «Failed to fetch», que no dice qué hacer.
  ['failed to fetch', 'No se ha podido contactar con el servidor. Comprueba tu conexión.'],
  ['networkerror', 'No se ha podido contactar con el servidor. Comprueba tu conexión.'],
  ['network request failed', 'No se ha podido contactar con el servidor. Comprueba tu conexión.'],
];

/** Lo que se enseña cuando no se reconoce el error y tampoco hay texto útil. */
export const MENSAJE_GENERICO = 'No se ha podido completar la operación. Inténtalo de nuevo.';

/**
 * Traduce lo que sea que se haya lanzado.
 *
 * Acepta `unknown` a propósito: `catch` no garantiza que llegue un `Error`, y
 * leer `.message` sobre un `any` compilaba aunque llegara otra cosa — entonces
 * el usuario veía literalmente «undefined» como mensaje de error. Ya pasó.
 */
export function mensajeDeAuth(err: unknown): string {
  const bruto =
    err instanceof Error ? err.message
    : typeof err === 'string' ? err
    : '';

  if (!bruto.trim()) return MENSAJE_GENERICO;

  const aguja = bruto.toLowerCase();
  for (const [patron, traduccion] of TRADUCCIONES) {
    if (aguja.includes(patron)) return traduccion;
  }

  // Desconocido: se enseña tal cual en vez de tragárselo. Un mensaje en inglés
  // que nadie ha traducido todavía sigue siendo más útil que «error», y así se
  // ve en cuanto aparece y se puede añadir arriba.
  return bruto;
}
