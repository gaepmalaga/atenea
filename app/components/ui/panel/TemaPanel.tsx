'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { leeTema, guardaTema, type Tema } from '@/app/lib/theme';
import { cx } from '../tokens';

const OPCIONES: [Tema, string, typeof Sun][] = [
  ['sistema', 'Sistema', Monitor],
  ['claro', 'Claro', Sun],
  ['oscuro', 'Oscuro', Moon],
];

/**
 * El tema del panel: el mismo que elige el alumno en su perfil (misma clave,
 * `app/lib/theme.ts`). Vive en la barra marino, que no cambia con el tema
 * (regla 45), así que se pinta con colores fijos.
 */
export default function TemaPanel() {
  const [tema, setTema] = useState<Tema>('sistema');
  useEffect(() => { setTema(leeTema()); }, []);
  return (
    <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-lg border border-white/15 p-1">
      {OPCIONES.map(([id, etiqueta, Icono]) => (
        <button key={id} type="button" aria-pressed={tema === id} aria-label={etiqueta} title={etiqueta}
          onClick={() => { setTema(id); guardaTema(id); }}
          className={cx('grid min-h-[44px] place-items-center rounded-md', tema === id ? 'bg-white text-marino' : 'text-indigo-100 hover:bg-white/10')}>
          <Icono size={16} />
        </button>
      ))}
    </div>
  );
}
