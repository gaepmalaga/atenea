'use client';

import { useSyncExternalStore } from 'react';
import { cx, TEXT } from '../../ui';
import { MARCA } from '@/app/lib/marca';

interface HeaderProps {
  title: string;
  activeTab: string;
}

/**
 * LA CABECERA DE CADA PANTALLA.
 *
 * Arriba, la fecha de hoy y el nombre de la academia; debajo, el nombre de la
 * pantalla, igual que en el menú. Nada más.
 *
 * Aquí hubo un reloj «ZULU» —la hora de Greenwich, en jerga militar— y un
 * «Sistema online» parpadeando: tono heredado de Atenea. En Málaga enseñaba una
 * hora menos que la del móvil y parecía un fallo (regla 85).
 */
const sinSuscripcion = () => () => {};
const fechaDeHoy = () => new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Header({ title }: HeaderProps) {
  // La fecha se lee del navegador, no del servidor (UTC, que cerca de
  // medianoche es otro día), y sin efecto: es una capacidad del navegador, no
  // estado de React (regla 13). En el servidor no se pinta nada.
  const fecha = useSyncExternalStore(sinSuscripcion, fechaDeHoy, () => '');

  return (
    <header className="mb-5 sm:mb-8 select-none min-w-0 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-1 min-w-0')}>
          {fecha && (
            <>
              <span className="truncate">{fecha}</span>
              <span className="w-1 h-1 rounded-full bg-oro shrink-0" />
            </>
          )}
          <span className="shrink-0">{MARCA.nombre}</span>
        </p>

        {/* Este es el título de la pantalla. Los módulos NO repiten otro debajo:
            en el examen había dos cabeceras seguidas, y entre las dos se comían
            media pantalla de móvil antes del primer control. En la tipografía
            de la marca, con el punto dorado (regla 94). */}
        <h1 className="font-titulo uppercase font-bold text-4xl sm:text-5xl leading-none text-marino dark:text-white truncate">
          {title}<span className="text-oro">.</span>
        </h1>
      </div>
      {/* El logo, siempre presente: la «A» de Alphapol. */}
      {/* Sobre un cuadrado marino, como el icono de la app: la «A» lleva partes
          claras que sobre el crema desaparecen. */}
      <span className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-marino flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARCA.isotipo} alt={MARCA.nombre} className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
      </span>
    </header>
  );
}
