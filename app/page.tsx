import AppShell from './components/AppShell';

/**
 * Lo que dura como mucho una Server Action llamada desde esta pantalla (60 s,
 * el tope de Vercel Hobby). Hace falta para «Datos de demostración» (regla
 * 106): cada fase de la carga es una llamada larga. El resto de acciones
 * siguen tardando lo que tardaban.
 */
export const maxDuration = 60;

/**
 * La entrada SIN academia en la URL. Funciona igual que antes de P11: si la
 * cuenta pertenece a una sola academia (el caso de hoy, todo el mundo por el
 * backfill del guion), `getSessionUser` la resuelve sola — no hace falta
 * pasar por `/<slug>` para que la sesión sepa de qué academia es.
 *
 * `AppShell` es la aplicación entera (regla 37); vive en su propio fichero
 * porque `/[academia]/page.tsx` (P11) renderiza la misma. No se reexporta
 * directamente (`export { default } from ...`): Next exige que el export por
 * defecto de un `page.tsx` case en la forma `PageProps`, y `AppShell` acepta
 * `academiaSlug` (P11j) — este envoltorio es lo que desacopla las dos cosas.
 */
export default function Home() {
  return <AppShell />;
}
