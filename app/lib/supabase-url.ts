/**
 * La URL del proyecto de Supabase, normalizada.
 *
 * `createClient` quiere la URL BASE (`https://xxx.supabase.co`) y le añade él
 * los caminos. Pero el panel de Supabase, en la pantalla de API, enseña bien
 * visible la del endpoint REST — `https://xxx.supabase.co/rest/v1/` — y es la
 * que se copia. Con esa, el cliente pide `/rest/v1/rest/v1/subjects` y Supabase
 * contesta «Invalid path specified in request URL», que no dice en absoluto lo
 * que ha pasado.
 *
 * Pasó de verdad, configurando el guion de siembra. La respuesta no es
 * acordarse de recortarla: es que el programa aguante las dos formas, porque
 * las dos son razonables de copiar.
 */

/** Los caminos que el cliente añade solo, y que sobran si vienen pegados. */
const SUFIJOS = ['/rest/v1', '/auth/v1', '/storage/v1', '/functions/v1', '/realtime/v1'];

export function normalizeSupabaseUrl(bruta: string | undefined | null): string {
  if (!bruta) return '';
  let url = bruta.trim().replace(/\/+$/, '');
  for (const sufijo of SUFIJOS) {
    if (url.toLowerCase().endsWith(sufijo)) {
      url = url.slice(0, -sufijo.length).replace(/\/+$/, '');
      break;
    }
  }
  return url;
}
