/**
 * PAGINAR POR ENCIMA DEL TOPE DE POSTGREST.
 *
 * PostgREST corta CUALQUIER `.limit()`/`.range()` al tope que tenga
 * configurado el proyecto de Supabase (`db-max-rows`, hoy 1.000 en este
 * proyecto) — no importa qué número le pida el código, nunca da más de eso
 * EN UNA SOLA PÁGINA. No es un error: responde `206 Partial Content` con la
 * cabecera `Content-Range` diciendo el total real, y ningún `.limit(30_000)`
 * del código lo detectaba.
 *
 * Encontrado el 14 sep 2026 en `academy.ts` (verificado contra la BD real:
 * `Content-Range: 0-999/1782`) y con el MISMO patrón en `exams.ts` — incluida
 * `getAdaptiveSession`, que calcula los cajones del entrenamiento adaptativo:
 * un alumno con más de 1.000 respuestas reales llevaba su motor adaptativo
 * calculado sobre un histórico incompleto, sin ningún aviso.
 *
 * Módulo PURO (regla 21): no importa Supabase, solo controla el bucle de
 * páginas — el propio caller inyecta cómo se pide cada página.
 */

export type ResultadoPagina<T> = { data: T[] | null; error: { message: string } | null };

export async function paginaCompleta<T>(
  pedirPagina: (desde: number, hasta: number) => Promise<ResultadoPagina<T>>,
  opciones?: { tamanioPagina?: number; maxFilas?: number },
): Promise<{ data: T[]; error: string | null }> {
  const TAMANIO = opciones?.tamanioPagina ?? 1_000;
  const TOPE = opciones?.maxFilas ?? 30_000;

  const todas: T[] = [];
  let desde = 0;
  while (desde < TOPE) {
    const { data, error } = await pedirPagina(desde, desde + TAMANIO - 1);
    if (error) return { data: todas, error: error.message };

    const fila = data ?? [];
    todas.push(...fila);
    // Menos de una página llena: no hay más que pedir.
    if (fila.length < TAMANIO) break;
    desde += TAMANIO;
  }
  return { data: todas, error: null };
}
