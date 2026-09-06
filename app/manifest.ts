import type { MetadataRoute } from 'next';

/**
 * El manifest de PWA. Sin esto, al «instalar» la web en el móvil Android usaba
 * el `favicon.ico` por defecto (borroso) y el nombre largo del `<title>`.
 *
 * Un solo icono de 512 (lo genera `app/icon.tsx`), declarado también como 192:
 * el navegador lo baja de tamaño sin que se note, y así no hace falta mantener
 * dos ficheros.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Atenea Policial',
    short_name: 'Atenea',
    description: 'Preparación de oposiciones a Policía Nacional',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'es',
    icons: [
      { src: '/icon', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
