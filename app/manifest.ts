import type { MetadataRoute } from 'next';
import { MARCA } from './lib/marca';

/**
 * El manifest de PWA. Sin esto, al «instalar» la web en el móvil Android usaba
 * el `favicon.ico` por defecto (borroso) y el nombre largo del `<title>`.
 *
 * Los iconos son la «A» de Alphapol con «ALPHAPOL» debajo, lo más grandes que
 * deja cada sistema (regla 88). El «maskable» los lleva más pequeños a
 * propósito: Android puede recortar el icono en círculo y solo respeta el
 * círculo central, el 80 % del icono; con el tamaño del de iPhone se comería
 * la primera y la última letra del nombre.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${MARCA.nombre} · ${MARCA.lema}`,
    short_name: MARCA.nombre,
    description: MARCA.descripcion,
    start_url: '/',
    display: 'standalone',
    background_color: MARCA.colores.marino,
    theme_color: MARCA.colores.marino,
    lang: 'es',
    icons: [
      { src: '/marca/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/marca/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/marca/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
