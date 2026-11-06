'use client';

import { Weight } from 'lucide-react';
import { claveEjercicio, kgDeCarga, textoCarga, formateaKg, type Carga } from '@/app/lib/rm';
import type { RMVigente } from '@/app/actions/fisica';
import { TEXT, cx } from '../ui';

/**
 * LAS CARGAS DE UNA SESIÓN, CON LOS KILOS DE CADA UNO (regla 89).
 *
 * «Sentadilla · 4 × 6 al 75 % → 82,5 kg». Los kilos salen del 1RM vigente de
 * ese alumno para ese ejercicio. Sin 1RM no se inventan: se dice que falta.
 * Sin `rm` (un grupo entero) solo se dice que cada uno verá los suyos.
 */
export default function ListaCargas({ cargas, rm, quien }: {
  cargas: Carga[];
  rm: RMVigente | null;
  /** Para el texto de cuando falta el 1RM. */
  quien: 'alumno' | 'preparador';
}) {
  if (!cargas.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <p className="px-3 py-2 bg-slate-50 dark:bg-slate-950/40 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <Weight size={13} /> Cargas {rm ? (quien === 'alumno' ? 'con tus kilos' : 'con sus kilos') : '(% del 1RM)'}
      </p>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {cargas.map((c, i) => {
          const suyo = rm?.[claveEjercicio(c.ejercicio)];
          const kg = suyo ? kgDeCarga(suyo.rm, c.porcentaje) : null;
          return (
            <li key={i} className="px-3 py-2 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{c.ejercicio}</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">{textoCarga(c)}</span>
              </span>
              {rm && (kg !== null ? (
                <span className="shrink-0 text-right">
                  <span className="block text-base font-black text-slate-900 dark:text-white tabular-nums">{formateaKg(kg)}</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">de {formateaKg(suyo!.rm)}</span>
                </span>
              ) : (
                <span className={cx(TEXT.muted, 'shrink-0 max-w-[45%] text-right')}>
                  {quien === 'alumno' ? 'Apunta tu 1RM en «Mis marcas»' : 'Sin 1RM apuntado'}
                </span>
              ))}
            </li>
          );
        })}
      </ul>
      {!rm && <p className={cx(TEXT.muted, 'px-3 py-2 border-t border-slate-100 dark:border-slate-800')}>Cada alumno verá sus kilos según su 1RM.</p>}
    </div>
  );
}
