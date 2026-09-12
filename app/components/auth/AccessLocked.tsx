'use client';

import { LockKeyhole, LogOut } from 'lucide-react';
import { Button } from '../ui';

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
    <div className="min-h-dvh flex flex-col items-center justify-center gap-6 p-6 text-center bg-slate-50 dark:bg-slate-950">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
        <LockKeyhole size={26} />
      </div>

      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{titulo}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{texto}</p>
        <p className="text-xs font-mono text-slate-400 pt-1">{email}</p>
      </div>

      <Button variant="ghost" onClick={onLogout} icon={<LogOut size={16} />}>
        Cerrar sesión
      </Button>
    </div>
  );
}
