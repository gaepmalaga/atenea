'use client'

import { useId, useState } from 'react';
import { ArrowRight, AlertTriangle, Eye, EyeOff, Loader2, ShieldCheck, LockKeyhole } from 'lucide-react';
import { TAP, cx } from '../ui';
import MarcoEntrada from './MarcoEntrada';
import { MIN_CLAVE, problemaDeClave } from '@/app/lib/clave';
import {
  ETIQUETA, campo, ICONO_CAMPO, BOTON_PRINCIPAL, AVISO_ERROR, TITULO, SUBTITULO,
} from './estilosEntrada';

/**
 * ELIGE TU CONTRASEÑA — el paso que faltaba tras aceptar una invitación.
 *
 * `inviteUserByEmail` (regla 65, `addAcademyAdmin`) crea la cuenta SIN
 * contraseña: quien la recibe pulsa el enlace y Supabase le da una sesión
 * temporal, pero nunca se le pedía que pusiera una de verdad. Sin esta
 * pantalla, esa persona entraba una vez con el enlace y se quedaba sin forma
 * de volver a entrar — `signInWithPassword` no tiene nada que comprobar.
 *
 * Mismo marco que `LoginScreen` (`MarcoEntrada`, regla 90) porque es la misma
 * familia de pantallas: quien la ve viene de pulsar un enlace de correo, no de
 * navegar la aplicación.
 */

interface Props {
  email: string | null;
  onSubmit: (password: string) => void;
  cargando: boolean;
  error: string | null;
  /**
   * Viene con la contraseña provisional del alta en bloque (regla 111), no de
   * un enlace de correo: cambia lo que se le explica, y se le deja salir.
   */
  provisional?: boolean;
  onLogout?: () => void;
}

export default function SetPasswordScreen({ email, onSubmit, cargando, error, provisional = false, onLogout }: Props) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const idClave = useId();
  const idConfirmacion = useId();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = problemaDeClave(password, confirmacion);
    if (problema) {
      setErrorLocal(problema);
      return;
    }
    setErrorLocal(null);
    onSubmit(password);
  }

  const errorVisible = errorLocal ?? error;

  return (
    <MarcoEntrada>
      <h1 className={TITULO}>Elige tu contraseña</h1>
      <p className={SUBTITULO}>
        {provisional
          ? <>Has entrado con la contraseña que te dio la academia{email ? <> como <span className="font-semibold text-slate-900">{email}</span></> : null}. Antes de seguir, pon una que solo sepas tú.</>
          : email
          ? <>Ya tienes acceso como <span className="font-semibold text-slate-900">{email}</span>. Pon una contraseña para poder volver a entrar.</>
          : 'Pon una contraseña para poder volver a entrar.'}
      </p>

      {errorVisible && (
        <div role="alert" className={cx(AVISO_ERROR, 'mt-6')}>
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
          <p className="text-sm font-medium leading-relaxed">{errorVisible}</p>
        </div>
      )}

      <form onSubmit={enviar} className="mt-6 space-y-5">
        <div>
          <label htmlFor={idClave} className={ETIQUETA}>Nueva contraseña</label>
          <div className="relative">
            <LockKeyhole size={18} className={ICONO_CAMPO} aria-hidden />
            <input
              id={idClave}
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={`Mínimo ${MIN_CLAVE} caracteres`}
              className={cx(campo(true), 'pr-14')}
              autoComplete="new-password"
              enterKeyHint="next"
              disabled={cargando}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              className={cx('absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800', TAP)}
              aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
              aria-pressed={verClave}
              tabIndex={-1}
            >
              {verClave ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor={idConfirmacion} className={ETIQUETA}>Repítela</label>
          <div className="relative">
            <LockKeyhole size={18} className={ICONO_CAMPO} aria-hidden />
            <input
              id={idConfirmacion}
              type={verClave ? 'text' : 'password'}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
              placeholder="La misma otra vez"
              className={campo(true)}
              autoComplete="new-password"
              enterKeyHint="go"
              disabled={cargando}
            />
          </div>
        </div>

        <button type="submit" disabled={cargando} aria-busy={cargando} className={cx(BOTON_PRINCIPAL, 'mt-2')}>
          {cargando ? 'Un momento…' : 'Guardar y entrar'}
          {cargando
            ? <Loader2 size={20} className="animate-spin shrink-0" aria-hidden />
            : <ArrowRight size={20} className="shrink-0" aria-hidden />}
        </button>
      </form>

      <p className="mt-8 flex items-start gap-2 border-t border-slate-200 pt-6 text-sm text-slate-600">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#14295a]" aria-hidden />
        Esta contraseña es solo tuya: nadie de tu academia puede verla.
      </p>

      {provisional && onLogout && (
        <button type="button" onClick={onLogout} className={cx('mt-2 w-full text-sm font-semibold text-slate-600 underline underline-offset-4 hover:text-slate-900', TAP)}>
          Salir sin cambiarla
        </button>
      )}
    </MarcoEntrada>
  );
}
