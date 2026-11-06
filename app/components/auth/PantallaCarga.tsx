import type { CSSProperties } from 'react';
import { MARCA } from '@/app/lib/marca';
import { FONDO_MARINO } from './fondoMarca';

/**
 * LA PANTALLA DE CARGA (regla 87): lo primero que se ve al abrir la app,
 * mientras se comprueba la sesión.
 *
 * Es la propuesta «G · Monumental» del lienzo de diseño: la «A» del logo
 * enorme, saliéndose por la derecha, y el logotipo abajo a la izquierda. Las
 * otras dos que se quisieron guardar (A · Emblema y E · Claro) están en
 * `docs/disenos/pantalla-de-carga/`.
 *
 * La segunda versión (regla 87, «mejor»):
 *   · la «A» y el logotipo son SVG con el contorno vectorial (regla 88): antes,
 *     a este tamaño, eran el JPG de 400 px ampliado y se veían borrosos;
 *   · la «A» ya no pasa por detrás del logotipo: se mide con el ancho Y con el
 *     alto (`min(…, …dvh)`), así que en un móvil bajo no lo pisa, y ya no hace
 *     falta el velo oscuro que la volvía gris por abajo;
 *   · el fondo es el MISMO marino que el arranque de Android (el del manifest),
 *     con el brillo arriba a la derecha: al fundirse el arranque con esta
 *     pantalla no hay salto de color;
 *   · la «A» está entera desde el primer instante (solo se asienta): el
 *     arranque de Android ya hace su propio fundido, y uno encima del otro era
 *     el efecto fantasma de la captura del dueño.
 *
 * Como la puerta de entrada (regla 43), no sale de `ui/`: es una pantalla de
 * marca, oscura pase lo que pase. Las animaciones, en `app/pantalla-carga.css`.
 *
 * `<img>` y no `next/image`: son ficheros fijos de `public/` que tienen que
 * pintarse YA, sin pasar por el optimizador.
 */
export default function PantallaCarga() {
  // La máscara del brillo tiene la forma de la «A»: así el destello recorre
  // la letra y no el recuadro de la imagen.
  const forma: CSSProperties = {
    WebkitMaskImage: `url(${MARCA.isotipo})`,
    maskImage: `url(${MARCA.isotipo})`,
  };

  return (
    <div className="relative min-h-dvh overflow-hidden text-white" style={{ background: FONDO_MARINO }}>
      {/* El escenario mide lo que un móvil grande. En un ordenador la
          composición se queda en el centro en vez de estirarse. */}
      <div className="relative mx-auto min-h-dvh w-full max-w-[480px]">
        <div aria-hidden className="carga-a absolute left-[12%] top-[6%] w-[min(124%,58dvh)] aspect-[1065/1106]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MARCA.isotipo}
            alt=""
            width={1065}
            height={1106}
            fetchPriority="high"
            className="block h-full w-full drop-shadow-[0_24px_48px_rgba(4,10,28,0.45)]"
          />
          <div className="carga-destello absolute inset-0" style={forma} />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-9 px-8 pb-[max(3.5rem,calc(env(safe-area-inset-bottom)+2rem))]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={MARCA.logotipo}
            alt={`${MARCA.nombre}, ${MARCA.lema.toLowerCase()}`}
            width={1200}
            height={254}
            fetchPriority="high"
            className="carga-sube -ml-1 block h-auto w-[248px] max-w-full"
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
              <p className="text-xs font-medium text-white/75">Preparando tu sesión</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: MARCA.colores.doradoClaro }}>
                {MARCA.ciudad}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
