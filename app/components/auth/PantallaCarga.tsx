import type { CSSProperties } from 'react';
import { MARCA } from '@/app/lib/marca';

/**
 * LA PANTALLA DE CARGA (regla 87): lo primero que se ve al abrir la app,
 * mientras se comprueba la sesión.
 *
 * Es la propuesta «G · Monumental» del lienzo de diseño: la «A» del logo
 * enorme, saliéndose por la derecha, y el logotipo abajo a la izquierda. Las
 * otras dos que se quisieron guardar (A · Emblema y E · Claro) están en
 * `docs/disenos/pantalla-de-carga/`.
 *
 * Antes era un spinner suelto con «Cargando Alphapol…» sobre fondo claro, y
 * en Android se veía gris: el sistema funde su pantalla de arranque (el marino
 * del manifest con el icono) con la primera pantalla de la app, y marino sobre
 * claro a medio fundido da gris. Esta es marina también, así que el paso del
 * arranque a la app ya no se nota.
 *
 * Como la puerta de entrada (regla 43), no sale de `ui/`: es una pantalla de
 * marca, oscura pase lo que pase. Las animaciones, en `app/pantalla-carga.css`.
 *
 * `<img>` y no `next/image`, como en `CintaMarca`: son dos ficheros fijos de
 * `public/` que tienen que pintarse YA, sin pasar por el optimizador.
 */
export default function PantallaCarga() {
  // La máscara del brillo tiene la forma de la «A»: así el destello recorre
  // la letra y no el recuadro de la imagen.
  const forma: CSSProperties = {
    WebkitMaskImage: `url(${MARCA.isotipo})`,
    maskImage: `url(${MARCA.isotipo})`,
  };

  return (
    <div
      className="relative min-h-dvh overflow-hidden text-white"
      style={{ background: 'radial-gradient(90% 60% at 80% 30%, #163470 0%, #0e204a 50%, #0a1630 100%)' }}
    >
      {/* El escenario mide lo que un móvil grande. En un ordenador la
          composición se queda en el centro en vez de estirarse. */}
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px]">
        <div aria-hidden className="carga-a absolute left-[10%] top-[8%] w-[133%] aspect-[1110/1146]">
          <img
            src={MARCA.isotipo}
            alt=""
            width={1110}
            height={1146}
            fetchPriority="high"
            className="block h-full w-full"
          />
          <div className="carga-destello absolute inset-0" style={forma} />
        </div>
      </div>

      {/* Oscurece la parte de abajo para que el logotipo y el texto se lean
          aunque la «A» pase por detrás. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,22,48,0) 38%, rgba(10,22,48,0.82) 66%, #0a1630 84%)',
        }}
      />

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-10 px-8 pb-[max(3.75rem,calc(env(safe-area-inset-bottom)+2rem))]">
          <img
            src={MARCA.logotipo}
            alt={`${MARCA.nombre}, ${MARCA.lema.toLowerCase()}`}
            width={1200}
            height={279}
            fetchPriority="high"
            className="carga-sube -ml-1.5 block h-auto w-[260px] max-w-full"
          />
          <div className="carga-sube-2 flex flex-col gap-3.5" role="status">
            <div className="relative h-0.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="carga-barra absolute inset-y-0 left-0 w-2/5 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(197,167,56,0) 0%, #e2c977 50%, rgba(197,167,56,0) 100%)',
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-medium text-white/70">Preparando tu sesión</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: MARCA.colores.dorado }}>
                {MARCA.ciudad}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
