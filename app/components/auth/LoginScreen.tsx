'use client'

import { useId, useState } from 'react';
import { ArrowRight, AlertTriangle, MailCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { TAP, cx } from '../ui';

/**
 * LA PUERTA DE ENTRADA.
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
 * Porque esta pantalla tiene un lenguaje visual propio y deliberado —plano,
 * bordes de 3px, sin degradados, sin sombras, sobre papel— y meterla en unos
 * primitivos redondeados con sombra índigo la convertiría en otra cosa. Es la
 * misma excepción que ya se acepta en el panel de administración, que es
 * oscuro pase lo que pase.
 *
 * Lo que NO se salta, que es lo que de verdad protege la regla 36:
 *   · el área táctil sale de `TAP`, no de un número escrito aquí;
 *   · los campos llevan `text-base` en móvil (Safari hace zoom por debajo de
 *     16px y descuadra la página);
 *   · la altura se mide en `dvh`, nunca en `vh`;
 *   · ningún tamaño de letra grande se queda sin escalón de móvil.
 * Y hay un test que lo fija: `tests/auth-messages.test.ts`.
 *
 * NO SIGUE EL TEMA CLARO/OSCURO, y es una decisión, no un olvido: el diseño
 * ES el papel. Un brutalista sobre hueso invertido a negro deja de ser el
 * mismo diseño. Por eso pinta su fondo explícitamente en vez de heredar el de
 * la aplicación.
 *
 * ES PRESENTACIONAL. Las llamadas a Supabase y el establecimiento de la sesión
 * se quedan en `page.tsx`: aquí no entra nada que decida quién eres.
 */

export type ModoAuth = 'login' | 'signup';

interface Props {
  modo: ModoAuth;
  onModo: (modo: ModoAuth) => void;
  onSubmit: (email: string, password: string) => void;
  cargando: boolean;
  /** Ya traducido con `mensajeDeAuth`. */
  error: string | null;
  aviso: string | null;
}

/** La paleta, en un solo sitio. Hueso, tinta y el rojo de la bandera. */
const C = {
  fondo: 'bg-[#f7f4ee]',
  tinta: 'text-[#111820]',
  tinta2: 'text-[#3d4a5a]',
  borde: 'border-[#111820]',
  rojo: 'bg-[#c60b1e]',
  rojoTx: 'text-[#c60b1e]',
} as const;

const CAMPO = cx(
  'w-full bg-transparent border-[3px] border-[#111820] px-4 outline-none',
  // 16px en móvil o Safari hace zoom al tocarlo y deja la página torcida.
  'text-base sm:text-lg font-semibold text-[#111820] placeholder:text-[#8d99a8]',
  'focus:border-[#c60b1e] transition-colors',
  TAP,
  'min-h-[56px]',
);

const ETIQUETA = 'block text-[11px] font-black uppercase tracking-[0.14em] text-[#3d4a5a] mb-2';

export default function LoginScreen({ modo, onModo, onSubmit, cargando, error, aviso }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);

  // `useId` y no un literal: dos `id="email"` en la misma página romperían la
  // asociación con la etiqueta y el lector de pantalla leería otro campo.
  const idEmail = useId();
  const idClave = useId();
  const esAlta = modo === 'signup';

  return (
    <main className={cx('min-h-dvh flex flex-col', C.fondo, C.tinta)}>

      {/* Cinta */}
      <div className="bg-[#111820] text-[#f7f4ee] px-5 py-3 flex justify-between items-center gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.16em]">Atenea Policial</span>
        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#ff5a68]">
          Policía Nacional
        </span>
      </div>

      {/* El filete de la bandera, en proporciones REALES (1:2:1). En tres
          franjas iguales la bandera canta, y una bandera mal puesta en una
          plataforma de oposiciones a policía se nota más que en ningún sitio. */}
      <div
        className="h-1.5 shrink-0"
        style={{
          background:
            'linear-gradient(to right,#c60b1e 0 22%,#ffc400 22% 78%,#c60b1e 78% 100%)',
        }}
        aria-hidden
      />

      <div className="flex-1 px-5 py-8 sm:py-10 flex flex-col max-w-md w-full mx-auto">

        {/* `text-5xl sm:text-6xl`: un tamaño SIN prefijo es el de móvil, y de
            60px hacia arriba no hay pantalla de 360px que lo aguante. */}
        <h1 className="text-5xl sm:text-6xl font-black uppercase leading-[0.88] tracking-[-0.045em]">
          {esAlta ? (
            <>Crea<br />tu <span className={cx(C.rojo, 'text-white px-2 -ml-2 inline-block')}>cuenta</span></>
          ) : (
            <>Entra<br />y <span className={cx(C.rojo, 'text-white px-2 -ml-2 inline-block')}>saca</span><br />tu plaza</>
          )}
        </h1>

        <p className={cx('mt-6 mb-8 pl-3.5 border-l-[5px] border-[#c60b1e] text-[15px] font-semibold leading-relaxed', C.tinta2)}>
          {esAlta
            ? 'Te enviaremos un correo para confirmar la cuenta. Hasta que pulses ese enlace no podrás entrar.'
            : 'El temario oficial completo, con tests que puntúan como la convocatoria: cada dos fallos, un acierto menos.'}
        </p>

        {error && (
          <div role="alert" className="flex items-start gap-3 p-3 mb-5 border-[3px] border-[#c60b1e] bg-[#c60b1e]/5">
            {/* Antes esto era `ShieldCheck` —un escudo con un VISTO— para
                anunciar un fallo. Decía lo contrario de lo que pasaba. */}
            <AlertTriangle size={19} className={cx('shrink-0 mt-0.5', C.rojoTx)} aria-hidden />
            <p className="text-sm font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        {aviso && (
          <div role="status" className="flex items-start gap-3 p-3 mb-5 border-[3px] border-[#111820] bg-[#ffc400]/25">
            <MailCheck size={19} className="shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm font-semibold leading-relaxed">{aviso}</p>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(email.trim(), password); }}
          className="space-y-5"
        >
          <div>
            <label htmlFor={idEmail} className={ETIQUETA}>Correo</label>
            <input
              id={idEmail}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@correo.com"
              className={CAMPO}
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

          <div>
            <label htmlFor={idClave} className={ETIQUETA}>Contraseña</label>
            <div className="relative">
              <input
                id={idClave}
                type={verClave ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className={cx(CAMPO, 'pr-14')}
                autoComplete={esAlta ? 'new-password' : 'current-password'}
                enterKeyHint="go"
                disabled={cargando}
              />
              <button
                type="button"
                onClick={() => setVerClave((v) => !v)}
                // El área táctil sale del sistema: un ojo de 20px suelto se
                // falla con el pulgar.
                className={cx('absolute inset-y-0 right-0 flex items-center justify-center px-4', TAP, C.tinta2)}
                aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                aria-pressed={verClave}
                tabIndex={-1}
              >
                {verClave ? <Eye size={20} aria-hidden /> : <EyeOff size={20} aria-hidden />}
              </button>
            </div>
            {esAlta && (
              <p className={cx('mt-2 text-xs font-semibold', C.tinta2)}>Mínimo 6 caracteres.</p>
            )}
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
            {cargando ? 'Un momento…' : esAlta ? 'Crear cuenta' : 'Entrar'}
            {cargando
              ? <Loader2 size={24} className="animate-spin shrink-0" aria-hidden />
              : <ArrowRight size={24} className="shrink-0" aria-hidden />}
          </button>
        </form>

        <p className="mt-auto pt-10 text-[13px] font-bold">
          {esAlta ? '¿Ya tienes cuenta?' : '¿Sin cuenta?'}{' '}
          <button
            type="button"
            onClick={() => onModo(esAlta ? 'login' : 'signup')}
            className={cx(C.rojo, 'text-white px-1.5 py-0.5 font-bold', TAP, 'inline-flex items-center')}
          >
            {esAlta ? 'Inicia sesión' : 'Regístrate aquí'}
          </button>
        </p>
      </div>
    </main>
  );
}
