/**
 * LA MARCA DE ATENEA — la égida (el escudo de Atenea).
 *
 * Sustituye a la «A» suelta con corchetes y la curva amarilla, que el dueño
 * describió como irrisoria (7 sep 2026): la primera letra de mil cosas, sin
 * significado. La égida es el escudo de la diosa; lleva la bandera en la cimera
 * (rojo-oro-rojo, 1:2:1, la de verdad) y una «A» en negativo — se lee escudo
 * primero, letra después.
 *
 * UN SOLO SVG para el favicon, el icono PWA y el de iOS. Todo son rellenos
 * planos —ni `fill-rule`, ni gradientes, ni filtros— porque lo rasteriza Satori
 * dentro de `next/og` y su soporte de SVG es limitado. La «A» en negativo se
 * hace pintando la letra del color del fondo y devolviendo el contrapunto en
 * blanco, sin depender de `evenodd`.
 *
 * Zona segura del 12 % para el recorte circular «maskable» de Android: el
 * escudo va del 26 % al 79 %, dentro del 76 % central.
 */

const GROUND = '#0f172a'; // slate-950, el fondo de la app
const INK = '#f8fafc';
const RED = '#c60b1e'; // rojo de la bandera
const GOLD = '#ffc400'; // amarillo de la bandera

export function EscudoAtenea({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill={GROUND} />

      {/* el escudo */}
      <path
        fill={INK}
        d="M128 120 L384 120 L384 250 C384 326 344 380 256 412 C168 380 128 326 128 250 Z"
      />

      {/* la bandera en la cimera — 1:2:1 */}
      <path fill={RED} d="M128 120 H384 V134 H128 Z" />
      <path fill={GOLD} d="M128 134 H384 V162 H128 Z" />
      <path fill={RED} d="M128 162 H384 V176 H128 Z" />

      {/* la A: se pinta del color del fondo (recortada en el escudo) y se le
          devuelve el contrapunto en blanco. Sin `fill-rule`. */}
      <path
        fill={GROUND}
        d="M256 194 L186 366 L230 366 L244 318 L268 318 L282 366 L326 366 Z"
      />
      <path fill={INK} d="M256 236 L236 302 L276 302 Z" />
    </svg>
  );
}
