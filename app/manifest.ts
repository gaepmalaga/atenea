import type { MetadataRoute } from 'next';
import { MARCA } from './lib/marca';

/**
 * El manifest de PWA. Sin esto, al «instalar» la web en el móvil Android usaba
 * el `favicon.ico` por defecto (borroso) y el nombre largo del `<title>`.
 *
 * Los iconos salen del logo de Alphapol (`public/marca/`, regla 81). El
 * «maskable» lleva el logo con margen sobre el marino: Android recorta el icono
 * en círculo y, sin margen, se comería «CENTRO DE FORMACIÓN».
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
