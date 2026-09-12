'use client'

import { useId, useState } from 'react';
import { ArrowRight, AlertTriangle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { TAP, cx } from '../ui';

/**
 * ELIGE TU CONTRASEÑA — el paso que faltaba tras aceptar una invitación.
 *
 * `inviteUserByEmail` (regla 65, `addAcademyAdmin`) crea la cuenta SIN
 * contraseña: quien la recibe pulsa el enlace y Supabase le da una sesión
 * temporal, pero nunca se le pedía que pusiera una de verdad. Sin esta
 * pantalla, esa persona entraba una vez con el enlace y se quedaba sin forma
 * de volver a entrar — `signInWithPassword` no tiene nada que comprobar.
 *
 * Mismo lenguaje visual que `LoginScreen` (regla 43: plano, sin `Card`/
 * `Button`, papel y tinta) porque es la misma familia de pantallas — quien la
 * ve viene de pulsar un enlace de correo, no de navegar la aplicación.
 */

interface Props {
  email: string | null;
  onSubmit: (password: string) => void;
  cargando: boolean;
  error: string | null;
}

const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  rojo: 'bg-[#c60b1e]',
  rojoTx: 'text-[#c60b1e]',
} as const;

const CAMPO = cx(
  'w-full bg-transparent border-[3px] border-[#111820] px-4 outline-none',
  'text-base sm:text-lg font-semibold text-[#111820] placeholder:text-[#8d99a8]',
  'focus:border-[#c60b1e] transition-colors',
  TAP,
  'min-h-[56px]',
);

const ETIQUETA = 'block text-[11px] font-black uppercase tracking-[0.14em] text-[#3d4a5a] mb-2';

export default function SetPasswordScreen({ email, onSubmit, cargando, error }: Props) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const idClave = useId();
  const idConfirmacion = useId();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setErrorLocal('La contraseña es demasiado corta: necesita al menos 6 caracteres.');
      return;
    }
    if (password !== confirmacion) {
      setErrorLocal('Las dos contraseñas no coinciden.');
      return;
    }
    setErrorLocal(null);
    onSubmit(password);
  }

  const errorVisible = errorLocal ?? error;

  return (
    <main className={cx('min-h-dvh flex flex-col', C.fondo, C.tinta)}>
      <div className="bg-[#111820] text-[#f7f4ee] px-5 py-3 flex justify-between items-center gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.16em]">Atenea Policial</span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a68]">
          Policía Nacional
        </span>
      </div>

      <div
        className="h-1.5 shrink-0"
        style={{
          background:
            'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)',
        }}
        aria-hidden
      />

      <div className="flex-1 px-5 py-8 sm:py-10 flex flex-col max-w-md w-full mx-auto">
        <h1 className="text-5xl sm:text-6xl font-black uppercase leading-[0.88] tracking-[-0.045em]">
          Elige<br />tu <span className={cx(C.rojo, 'text-white px-2 -ml-2 inline-block')}>clave</span>
        </h1>

        <p className={cx('mt-6 mb-8 pl-3.5 border-l-[5px] border-[#c60b1e] text-[15px] font-semibold leading-relaxed', C.tinta2)}>
          {email
            ? <>Ya tienes acceso como <span className="font-black">{email}</span>. Pon una contraseña para poder volver a entrar.</>
            : 'Pon una contraseña para poder volver a entrar.'}
        </p>

        {errorVisible && (
          <div role="alert" className="flex items-start gap-3 p-3 mb-5 border-[3px] border-[#c60b1e] bg-[#c60b1e]/5">
            <AlertTriangle size={19} className={cx('shrink-0 mt-0.5', C.rojoTx)} aria-hidden />
            <p className="text-sm font-semibold leading-relaxed">{errorVisible}</p>
          </div>
        )}

        <form onSubmit={enviar} className="space-y-5">
          <div>
            <label htmlFor={idClave} className={ETIQUETA}>Nueva contraseña</label>
            <div className="relative">
              <input
                id={idClave}
                type={verClave ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={cx(CAMPO, 'pr-14')}
                autoComplete="new-password"
                enterKeyHint="next"
                disabled={cargando}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                className={cx('absolute inset-y-0 right-0 flex items-center justify-center px-4', TAP, C.tinta2)}
                aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                aria-pressed={verClave}
                tabIndex={-1}
              >
                {verClave ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
              </button>
            </div>
            <p className={cx('mt-2 text-xs font-semibold', C.tinta2)}>Mínimo 6 caracteres.</p>
          </div>

          <div>
            <label htmlFor={idConfirmacion} className={ETIQUETA}>Repítela</label>
            <input
              id={idConfirmacion}
              type={verClave ? 'text' : 'password'}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
              placeholder="••••••••"
              className={CAMPO}
              autoComplete="new-password"
              enterKeyHint="go"
              disabled={cargando}
            />
          </div>

          <button
            type="submit"
            disabled={cargando}
            aria-busy={cargando}
            className={cx(
              'w-full min-h-[62px] bg-[#111820] text-[#f7f4ee] px-5',
              'flex items-center justify-between gap-3',
              'text-[17px] font-black uppercase tracking-[0.05em]',
              'disabled:opacity-60 disabled:cursor-not-allowed active:translate-y-px transition-transform',
            )}
          >
            {cargando ? 'Un momento…' : 'Entrar'}
            {cargando
              ? <Loader2 size={24} className="animate-spin shrink-0" aria-hidden />
              : <ArrowRight size={24} className="shrink-0" aria-hidden />}
          </button>
        </form>

        <p className={cx('mt-auto pt-10 flex items-start gap-2 text-[13px] font-semibold', C.tinta2)}>
          <ShieldCheck size={16} className="shrink-0 mt-0.5" aria-hidden />
          Esta contraseña es solo tuya: nadie de tu academia puede verla.
        </p>
      </div>
    </main>
  );
}
