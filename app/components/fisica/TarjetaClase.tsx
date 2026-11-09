'use client';

import type { ReactNode } from 'react';
import { Users, Lock } from 'lucide-react';
import { colorDeGrupo } from '@/app/lib/cuadrante';
import type { ClaseFisica } from '@/app/lib/clases-fisica';
import { cx } from '../ui';

/**
 * UNA CLASE DE GRUPO (regla 97): la del cuadrante, no un entreno.
 *
 * Se distingue del entreno a la primera: la franja es del COLOR DEL GRUPO (el
 * de la imagen del cuadrante que ya conocen), y lleva la hora y el profesor.
 * Un entreno lleva el color de su TIPO (fuerza, carrera…) y no tiene hora.
 *
 * La usan el calendario del alumno y la vista de un alumno en «Planificar»,
 * donde sale en solo lectura (`soloLectura`): ahí no se cambia.
 */
export default function TarjetaClase({ clase, onAbrir, soloLectura = false, compacta = false, children }: {
  clase: ClaseFisica;
  onAbrir?: () => void;
  soloLectura?: boolean;
  compacta?: boolean;
  /** Los botones de la clase (avisar de que falta, quitarse si es multi). */
  children?: ReactNode;
}) {
  const col = colorDeGrupo(clase.grupo);
  const titulo = clase.sinClase ? 'Sin clase' : clase.sesion?.title ?? 'Clase de grupo';
  const detalle = clase.sinClase
    ? clase.motivo ?? 'Este día no hay clase'
    : [clase.sesion ? null : 'aún sin publicar qué toca', clase.profesor ? `con ${clase.profesor}` : null].filter(Boolean).join(' · ');
  const abrible = !!onAbrir && !!clase.sesion && !clase.sinClase;

  const cuerpo = (
    <>
      <span className="w-1.5 shrink-0" style={{ background: col.fondo }} />
      <span className={cx('flex-1 min-w-0 flex items-start gap-3', compacta ? 'px-2 py-1.5' : 'p-3')}>
        {!compacta && (
          <span className="w-12 shrink-0 text-center">
            <span className="block font-titulo font-bold text-lg leading-none text-marino dark:text-white tabular-nums">{clase.hora ?? '—'}</span>
            {/* El nombre en gris oscuro y el color en un punto: el amarillo de
                Betta sobre blanco no se lee como texto. */}
            <span className="mt-1 flex items-center justify-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.fondo }} />{clase.grupo}
            </span>
          </span>
        )}
        <span className="flex-1 min-w-0">
          <span className={cx('flex items-center gap-1.5 font-black text-slate-900 dark:text-white leading-snug', compacta ? 'text-xs' : 'text-sm', clase.sinClase && 'text-slate-500 dark:text-slate-400')}>
            {compacta && <span className="tabular-nums">{clase.hora ?? ''}</span>}
            <span className="truncate">{compacta ? `${clase.grupo} · ${titulo}` : titulo}</span>
            {soloLectura && <Lock size={11} className="shrink-0 text-slate-400" aria-label="Solo lectura" />}
          </span>
          {detalle && <span className={cx('block text-slate-500 dark:text-slate-400 mt-0.5 break-words', compacta ? 'text-[10px]' : 'text-[11px]')}>{detalle}</span>}
          {!compacta && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-black">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <Users size={10} /> {clase.origen === 'multi' ? 'Te has apuntado' : 'Clase de tu grupo'}
              </span>
              {clase.falta && <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">Avisaste: no vas</span>}
            </span>
          )}
        </span>
      </span>
    </>
  );

  return (
    <div className={cx('rounded-2xl border overflow-hidden bg-white dark:bg-slate-900',
      clase.sinClase ? 'border-dashed border-slate-300 dark:border-slate-700' : 'border-slate-200 dark:border-slate-800')}>
      {abrible ? (
        <button onClick={onAbrir} className="w-full text-left flex hover:bg-slate-50 dark:hover:bg-slate-800/40 min-h-[44px]">{cuerpo}</button>
      ) : (
        <div className="flex">{cuerpo}</div>
      )}
      {children && <div className="px-3 pb-3 flex flex-wrap gap-2 justify-end">{children}</div>}
    </div>
  );
}
