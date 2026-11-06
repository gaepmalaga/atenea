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
    <header className="mb-5 sm:mb-8 select-none min-w-0">
      <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 flex items-center gap-2 mb-1 min-w-0')}>
        {fecha && (
          <>
            <span className="truncate">{fecha}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0" />
          </>
        )}
        <span className="shrink-0">{MARCA.nombre}</span>
      </p>

      {/* Este es el título de la pantalla. Los módulos NO repiten otro debajo:
          en el examen había dos cabeceras seguidas, y entre las dos se comían
          media pantalla de móvil antes del primer control. */}
      <h1 className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight truncate">
        {title}
      </h1>
    </header>
  );
}
