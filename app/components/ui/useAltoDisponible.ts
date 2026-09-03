'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Por debajo de esto una pantalla a pantalla completa deja de ser usable. */
const ALTO_MINIMO = 320;
/** Aire entre el final del modulo y la barra de abajo. */
const AIRE = 12;

/**
 * El alto que le queda a un elemento entre donde empieza y el pie de la
 * pantalla, descontando la barra de navegacion.
 *
 * **Existe porque la alternativa era un numero magico, y el numero estaba
 * mal.** El chat se daba `h-[calc(100dvh-140px)]` para "descontar la
 * cabecera y la barra". Medido en el banco de pruebas: la cabecera acaba en
 * el pixel 103 y la barra empieza en el 785, asi que lo que hay que
 * descontar son 162px, no 140. El resultado era que **el recuadro donde se
 * escribe la pregunta quedaba 22px por debajo de la barra de pestañas**: para
 * escribir en el chat habia que hacer scroll primero, en la unica pantalla de
 * la aplicacion en la que escribir ES la pantalla.
 *
 * Un numero a mano ademas caduca: cualquier cambio en la cabecera —una linea
 * mas, otro tamaño de letra— lo vuelve a descuadrar sin que nada lo cante.
 * Aqui se mide lo que hay.
 *
 * Se mide contra el **documento** (`top + scrollY`) y no contra la ventana:
 * si se midiera contra la ventana, fijar el alto cambiaria el alto de la
 * pagina, eso moveria el scroll, y la siguiente medida saldria distinta.
 *
 * Devuelve `null` mientras no se ha medido: el que lo use tiene que
 * distinguir "todavia no se" de un numero (regla 8), y no pintar una pantalla
 * de 0px durante el primer render.
 */
export default function useAltoDisponible(ref: RefObject<HTMLElement | null>): number | null {
  const [alto, setAlto] = useState<number | null>(null);

  const medir = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // La barra de abajo es `fixed`: no ocupa sitio en el flujo, se pinta
    // encima. En escritorio no esta (`md:hidden`), y entonces no descuenta.
    const barra = document.querySelector('[data-nav-inferior]');
    const estorbo =
      barra && getComputedStyle(barra).display !== 'none'
        ? barra.getBoundingClientRect().height
        : 0;

    const arriba = el.getBoundingClientRect().top + window.scrollY;
    setAlto(Math.max(ALTO_MINIMO, Math.round(window.innerHeight - arriba - estorbo - AIRE)));
  }, [ref]);

  useEffect(() => {
    medir();
    // `resize` cubre lo que importa en un movil: girar el telefono, plegar la
    // barra de direcciones y abrir el teclado. Con el teclado abierto la
    // ventana encoge, el chat encoge con ella y el recuadro de escribir sigue
    // a la vista, que es justo lo que se quiere.
    window.addEventListener('resize', medir);
    window.addEventListener('orientationchange', medir);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('orientationchange', medir);
    };
  }, [medir]);

  return alto;
}
