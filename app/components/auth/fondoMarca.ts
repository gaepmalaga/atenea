/**
 * EL FONDO DE LAS PANTALLAS DE MARCA (carga y entrada, reglas 87 y 90).
 *
 * El centro es EXACTAMENTE el marino del manifest (`MARCA.colores.marino`,
 * `#14295a`), que es el color con el que Android pinta su pantalla de arranque:
 * cuando el arranque se funde con la app no hay salto de color. El brillo va
 * arriba a la derecha, detrás de la «A», y abajo se oscurece un poco para que
 * el logotipo y el texto blanco ganen contraste.
 *
 * En un fichero aparte para que la pantalla de carga y la puerta de entrada no
 * puedan quedarse con dos marinos distintos.
 */
export const FONDO_MARINO =
  'radial-gradient(120% 75% at 82% 16%, #1f3f80 0%, #14295a 48%, #0d1d42 100%)';
