'use client';

import { useState } from 'react';
import { CalendarDays, Trophy } from 'lucide-react';
import { cx } from '../../../../ui';
import CalendarioFisica from './CalendarioFisica';
import MisMarcas from './MisMarcas';

/**
 * LA FÍSICA DE QUIEN TIENE PREPARADOR (reglas 57 y 86): su calendario de
 * sesiones y sus marcas en las pruebas oficiales. Nada de lo que rodea al plan
 * generado por IA.
 */
export default function FisicaAlumno() {
  const [vista, setVista] = useState<'calendario' | 'marcas'>('calendario');
  const pestaña = (id: typeof vista, texto: string, Icono: typeof CalendarDays) => (
    <button
      onClick={() => setVista(id)}
      aria-pressed={vista === id}
      className={cx(
        'flex-1 min-h-[44px] rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors',
        vista === id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400',
      )}
    >
      <Icono size={16} /> {texto}
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="max-w-3xl mx-auto flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60">
        {pestaña('calendario', 'Calendario', CalendarDays)}
        {pestaña('marcas', 'Mis marcas', Trophy)}
      </div>
      {vista === 'calendario' ? <CalendarioFisica /> : <MisMarcas />}
    </div>
  );
}
