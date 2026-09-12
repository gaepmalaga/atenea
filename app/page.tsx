/**
 * La entrada SIN academia en la URL. Funciona igual que antes de P11: si la
 * cuenta pertenece a una sola academia (el caso de hoy, todo el mundo por el
 * backfill del guion), `getSessionUser` la resuelve sola — no hace falta
 * pasar por `/<slug>` para que la sesión sepa de qué academia es.
 *
 * `AppShell` es la aplicación entera (regla 37); vive en su propio fichero
 * porque `/[academia]/page.tsx` (P11) renderiza la misma.
 */
export { default } from './components/AppShell';
