'use client'

import { useId, useState } from 'react';
import { ArrowRight, AlertTriangle, MailCheck, Eye, EyeOff, Loader2, Mail, LockKeyhole } from 'lucide-react';
import { TAP, cx } from '../ui';
import MarcoEntrada from './MarcoEntrada';
import { MIN_CLAVE } from '@/app/lib/clave';
import {
  ETIQUETA, campo, ICONO_CAMPO, BOTON_PRINCIPAL, ENLACE, AVISO_ERROR, AVISO_INFO, TITULO, SUBTITULO,
} from './estilosEntrada';

/**
 * LA PUERTA DE ENTRADA (reglas 43 y 90).
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN `app/page.tsx`, QUE ES DE DONDE VIENE
 * `tests/design-system.test.ts` recorre `app/components/` y nada más. El login
 * vivía en `app/page.tsx`, o sea **fuera del alcance de la guarda**, y por eso
 * fue la única pantalla que nunca se migró: campos sin `text-base` (zoom de
 * Safari en cada toque), `h-screen` en vez de `dvh`, ningún `autoComplete`
 * —así que ningún gestor de contraseñas ofrecía rellenarlo— y tres clases
 * decorativas que NO EXISTEN en `globals.css` ni vienen de ningún plugin
 * instalado.
 *
 * POR QUÉ NO SALE DE `Card` Y `Button`, QUE ES LA REGLA 36
 * Porque es una pantalla de marca, con su propio papel: sigue a la pantalla de
 * carga (el marino, la «A» monumental) y no al tema de la aplicación. Lo que
 * NO se salta, que es lo que de verdad protege la regla 36:
 *   · el área táctil sale de `TAP`, no de un número escrito aquí;
 *   · los campos llevan `text-base` en móvil (Safari hace zoom por debajo de
 *     16px y descuadra la página);
 *   · la altura se mide en `dvh` (en `MarcoEntrada`), nunca en `vh`;
 *   · ningún tamaño de letra grande se queda sin escalón de móvil.
 * Y hay un test que lo fija: `tests/auth-messages.test.ts`.
 *
 * ES PRESENTACIONAL. Las llamadas a Supabase y el establecimiento de la sesión
 * se quedan en `AppShell`: aquí no entra nada que decida quién eres.
 */

export type ModoAuth = 'login' | 'signup';

interface Props {
  modo: ModoAuth;
  onModo: (modo: ModoAuth) => void;
  onSubmit: (email: string, password: string) => void;
  /** «¿Olvidaste tu contraseña?» — solo en modo `login`. Recibe el correo ya escrito. */
  onOlvido: (email: string) => void;
  cargando: boolean;
  /** Ya traducido con `mensajeDeAuth`. */
  error: string | null;
  aviso: string | null;
}

export default function LoginScreen({ modo, onModo, onSubmit, onOlvido, cargando, error, aviso }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);

  // `useId` y no un literal: dos `id="email"` en la misma página romperían la
  // asociación con la etiqueta y el lector de pantalla leería otro campo.
  const idEmail = useId();
  const idClave = useId();
  const esAlta = modo === 'signup';

  return (
    <MarcoEntrada>
      <h1 className={TITULO}>
        {esAlta ? 'Crea tu cuenta' : (
          <>
            {/* En el móvil este es el titular; en el ordenador el titular
                grande está en la columna de la marca y aquí basta con decir
                qué se hace. */}
            <span className="lg:hidden">
              Entra y saca <span className="underline decoration-[#c5a738] decoration-4 underline-offset-[6px]">tu plaza</span>.
            </span>
            <span className="hidden lg:inline">Inicia sesión</span>
          </>
        )}
      </h1>
      <p className={SUBTITULO}>
        {esAlta
          ? 'Te enviaremos un correo para confirmar la cuenta. Después la academia revisa tu solicitud y te avisa por correo en cuanto tengas acceso.'
          : 'Accede al campus de la academia con tu correo y tu contraseña.'}
      </p>

      <div className="mt-6 space-y-3 empty:hidden">
        {error && (
          <div role="alert" className={AVISO_ERROR}>
            {/* Antes esto era `ShieldCheck` —un escudo con un VISTO— para
                anunciar un fallo. Decía lo contrario de lo que pasaba. */}
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-600" aria-hidden />
            <p className="text-sm font-medium leading-relaxed">{error}</p>
          </div>
        )}
        {aviso && (
          <div role="status" className={AVISO_INFO}>
            <MailCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
            <p className="text-sm font-medium leading-relaxed">{aviso}</p>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(email.trim(), password); }}
        className="mt-6 space-y-5"
      >
        <div>
          <label htmlFor={idEmail} className={ETIQUETA}>Correo electrónico</label>
          <div className="relative">
            <Mail size={18} className={ICONO_CAMPO} aria-hidden />
            <input
              id={idEmail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@correo.com"
              className={campo(true)}
              // Sin esto NINGÚN gestor de contraseñas ofrece rellenar el
              // formulario, que en un móvil es la diferencia entre entrar de
              // un toque y teclear una contraseña larga con el pulgar.
              autoComplete="email"
              // Android e iOS ponen mayúscula a la primera letra por defecto:
              // el correo entraba como «Gaepmalaga@…» y el login fallaba sin
              // que se viera por qué.
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="next"
              disabled={cargando}
            />
          </div>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <label htmlFor={idClave} className={ETIQUETA}>Contraseña</label>
            {!esAlta && (
              <button
                type="button"
                onClick={() => onOlvido(email.trim())}
                disabled={cargando}
                className={cx(ENLACE, 'text-sm -mb-1.5')}
              >
                ¿La has olvidado?
              </button>
            )}
          </div>
          <div className="relative">
            <LockKeyhole size={18} className={ICONO_CAMPO} aria-hidden />
            <input
              id={idClave}
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={esAlta ? `Mínimo ${MIN_CLAVE} caracteres` : 'Tu contraseña'}
              minLength={esAlta ? MIN_CLAVE : undefined}
              className={cx(campo(true), 'pr-14')}
              autoComplete={esAlta ? 'new-password' : 'current-password'}
              enterKeyHint="go"
              disabled={cargando}
            />
            <button
              type="button"
              onClick={() => setVerClave((v) => !v)}
              // El área táctil sale del sistema: un ojo de 20px suelto se
              // falla con el pulgar.
              className={cx('absolute inset-y-0 right-0 flex w-14 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800', TAP)}
              aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
              aria-pressed={verClave}
              tabIndex={-1}
            >
              {verClave ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={cargando} aria-busy={cargando} className={cx(BOTON_PRINCIPAL, 'mt-2')}>
          {cargando ? 'Un momento…' : esAlta ? 'Crear cuenta' : 'Entrar'}
          {cargando
            ? <Loader2 size={20} className="animate-spin shrink-0" aria-hidden />
            : <ArrowRight size={20} className="shrink-0" aria-hidden />}
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1.5 border-t border-slate-200 pt-6 text-sm text-slate-600">
        {esAlta ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}
        <button type="button" onClick={() => onModo(esAlta ? 'login' : 'signup')} className={ENLACE}>
          {esAlta ? 'Inicia sesión' : 'Solicita tu acceso'}
        </button>
      </div>
    </MarcoEntrada>
  );
}
