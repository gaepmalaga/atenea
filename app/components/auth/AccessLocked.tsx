'use client';

import { LockKeyhole, LogOut } from 'lucide-react';
import MarcoEntrada from './MarcoEntrada';
import { TITULO, SUBTITULO, BOTON_SECUNDARIO } from './estilosEntrada';

/**
 * La pantalla que ve un alumno cuya cuenta no está activa (P6) o cuya
 * academia no se ha podido resolver (P11).
 *
 * Tres motivos, y el texto los distingue porque piden llamadas distintas:
 *   · `pending`     — se ha registrado y la academia todavía no le ha dado acceso.
 *   · `suspended`   — la academia le ha quitado el acceso (dejó de pagar, baja).
 *   · `no-academy`  — no se ha podido saber a qué academia pertenece (cuenta
 *     sin academia, o en varias sin que ninguna coincida con el enlace usado).
 *
 * No hay ningún botón que "arregle" esto desde aquí: el acceso lo da la
 * academia en persona. Solo cerrar sesión.
 *
 * Va dentro del mismo marco que la puerta de entrada (`MarcoEntrada`, regla
 * 90): quien la ve acaba de entrar, y cambiar de golpe a la paleta de la
 * aplicación parecería otra web.
 */
export default function AccessLocked({
  motivo,
  email,
  onLogout,
}: {
  motivo: 'pending' | 'suspended' | 'no-academy';
  email: string;
  onLogout: () => void;
}) {
  const titulo =
    motivo === 'pending'
      ? 'Tu cuenta está pendiente de activar'
      : motivo === 'suspended'
        ? 'Tu acceso no está activo'
        : 'No hemos encontrado tu academia';
  const texto =
    motivo === 'pending'
      ? 'Ya te has registrado. Habla con la academia para que te den acceso a la plataforma.'
      : motivo === 'suspended'
        ? 'La academia ha desactivado tu acceso. Si crees que es un error o quieres retomarlo, habla con ellos.'
        : 'Tu cuenta no está asociada a ninguna academia, o el enlace que has usado no es el de la tuya. Habla con tu academia.';

  return (
    <MarcoEntrada>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#c5a738]/15 text-[#8a6d14]">
        <LockKeyhole size={24} aria-hidden />
      </div>
      <h1 className={`${TITULO} mt-5`}>{titulo}</h1>
      <p className={SUBTITULO}>{texto}</p>
      <p className="mt-4 text-sm text-slate-500">{email}</p>
      <button onClick={onLogout} className={`${BOTON_SECUNDARIO} mt-8`}>
        <LogOut size={16} aria-hidden /> Cerrar sesión
      </button>
    </MarcoEntrada>
  );
}
