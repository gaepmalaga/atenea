'use client';

import { useState } from 'react';
import { cx } from '../tokens';

const TAM = { sm: 'h-[26px] w-[26px] text-xs', md: 'h-[34px] w-[34px] text-[15px]', lg: 'h-14 w-14 text-2xl' } as const;

/**
 * Las iniciales dentro de un círculo azul suave; o la foto del alumno, si la
 * ha puesto (regla 114). Si la foto no carga, vuelven las iniciales.
 */
export default function Avatar({ iniciales, size = 'md', foto }: { iniciales: string; size?: keyof typeof TAM; foto?: string | null }) {
  const [rota, setRota] = useState(false);
  if (foto && !rota) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={foto} alt="" aria-hidden onError={() => setRota(true)} className={cx('shrink-0 rounded-full object-cover', TAM[size])} />
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-indigo-100 dark:bg-indigo-500/20 font-titulo font-semibold uppercase tracking-wide text-indigo-900 dark:text-indigo-200',
        TAM[size],
      )}
    >
      {iniciales}
    </span>
  );
}

/** Iniciales de un correo: «lucia.moreno@gmail.com» → «LM». */
export function inicialesDeCorreo(correo: string | null | undefined): string {
  const partes = (correo ?? '').split('@')[0].split(/[._\d]+/).filter(Boolean);
  if (!partes.length) return '?';
  return ((partes[0][0] ?? '') + (partes[1]?.[0] ?? partes[0][1] ?? '')).toUpperCase();
}

/** Iniciales de un nombre: «Elena Prieto» → «EP». */
export function inicialesDeNombre(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/** Un correo como nombre legible: «lucia.moreno@gmail.com» → «Lucia Moreno». */
export function nombreDeCorreo(correo: string | null | undefined): string {
  const partes = (correo ?? '').split('@')[0].split(/[._\d]+/).filter(Boolean);
  if (!partes.length) return correo ?? '';
  return partes.slice(0, 2).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
}
