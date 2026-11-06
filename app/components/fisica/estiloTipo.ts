import { Dumbbell, Footprints, Zap, Repeat, PersonStanding, BedDouble, CircleDot, type LucideIcon } from 'lucide-react';
import type { TipoSesion } from '@/app/lib/sesiones';

/**
 * EL COLOR Y EL ICONO DE CADA TIPO DE SESIÓN (regla 86).
 *
 * Es lo primero que se lee del calendario, en el del alumno y en el del
 * preparador: de un vistazo se sabe qué toca cada día sin leer el título. Un
 * solo mapa para los dos lados, para que «carrera» sea naranja en los dos.
 * Cada par lleva su versión oscura (regla 45).
 */
export const ESTILO_TIPO: Record<TipoSesion, { icono: LucideIcon; chip: string; barra: string; punto: string }> = {
  fuerza: {
    icono: Dumbbell,
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
    barra: 'bg-sky-500',
    punto: 'bg-sky-500',
  },
  carrera: {
    icono: Footprints,
    chip: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    barra: 'bg-orange-500',
    punto: 'bg-orange-500',
  },
  agilidad: {
    icono: Zap,
    chip: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    barra: 'bg-violet-500',
    punto: 'bg-violet-500',
  },
  circuito: {
    icono: Repeat,
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    barra: 'bg-amber-500',
    punto: 'bg-amber-500',
  },
  movilidad: {
    icono: PersonStanding,
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    barra: 'bg-emerald-500',
    punto: 'bg-emerald-500',
  },
  descanso: {
    icono: BedDouble,
    chip: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    barra: 'bg-slate-400',
    punto: 'bg-slate-400',
  },
  otro: {
    icono: CircleDot,
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    barra: 'bg-rose-500',
    punto: 'bg-rose-500',
  },
};

/** El color de unos puntos del baremo: 0 elimina (rojo), menos de 5 no llega (ámbar), 5 o más (verde). Sin puntos, gris. */
export const colorPuntos = (p: number | null) =>
  p === null ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
    : p === 0 ? 'bg-red-600 text-white'
      : p < 5 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
