'use client'

import { useId, useState } from 'react';
import { BookOpen, ArrowRight, AlertTriangle, MailCheck, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, Button, TextField, RADIUS, TAP, TEXT, cx } from '../ui';

/**
 * LA PUERTA DE ENTRADA.
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN `app/page.tsx`, QUE ES DE DONDE VIENE
 * `tests/design-system.test.ts` recorre `app/components/` y nada más. El login
 * vivía en `app/page.tsx`, o sea **fuera del alcance de la guarda**, y se nota
 * en lo que se encontró al mirarlo: campos sin `text-base` (zoom de Safari en
 * cada toque), `h-screen` en vez de `dvh`, etiquetas a `text-[10px]` fijo,
 * ningún `autoComplete` —así que ningún gestor de contraseñas ofrecía
 * rellenarlo— y tres clases decorativas (`glass-panel`, `animate-float`,
 * `animate-in zoom-in`) que NO EXISTEN en `globals.css` ni vienen de ningún
 * plugin instalado: no hacían nada desde el primer día.
 *
 * Moverla adentro es la mitad del arreglo. Un sistema de diseño protege lo que
 * alcanza, y ninguna pantalla debería quedarse fuera por estar en la raíz.
 *
 * ES PRESENTACIONAL A PROPÓSITO. Las llamadas a Supabase y el establecimiento
 * de la sesión se quedan en `page.tsx`: aquí no entra nada que decida quién
 * eres. Esto recoge lo que se escribe y lo entrega.
 */

export type ModoAuth = 'login' | 'signup';

interface Props {
  modo: ModoAuth;
  onModo: (modo: ModoAuth) => void;
  /** Se le entrega lo escrito. Quien decide qué hacer con ello es `page.tsx`. */
  onSubmit: (email: string, password: string) => void;
  cargando: boolean;
  /** Ya traducido con `mensajeDeAuth`. */
  error: string | null;
  /** El aviso de «revisa tu correo» tras registrarse. */
  aviso: string | null;
}

export default function LoginScreen({ modo, onModo, onSubmit, cargando, error, aviso }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);

  // `useId` en vez de un literal: si algún día hubiera dos formularios en la
  // misma página, dos `id="email"` romperían la asociación con la etiqueta y
  // el lector de pantalla leería el campo equivocado.
  const idEmail = useId();
  const idClave = useId();

  const esAlta = modo === 'signup';

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6 sm:space-y-8">

        {/* Marca */}
        <header className="text-center space-y-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto">
            <div
              className={cx(
                'absolute inset-0 bg-indigo-500/40 blur-xl',
                RADIUS.lg,
              )}
              aria-hidden
            />
            <div
              className={cx(
                'relative w-full h-full flex items-center justify-center',
                'bg-gradient-to-br from-blue-600 to-indigo-700 text-white',
                'border border-white/20 shadow-lg shadow-indigo-900/30',
                RADIUS.lg,
              )}
            >
              <BookOpen size={38} aria-hidden />
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-slate-900 dark:text-white">
              Atenea Policial
            </h1>
            <p className={cx(TEXT.muted, 'font-semibold')}>
              Preparación para Policía Nacional
            </p>
          </div>
        </header>

        <Card pad="md" elevation="raised" className="space-y-6">

          {/* Entrar / Crear cuenta.
              Antes esto era un enlace de 12px al pie de la tarjeta, debajo de
              una línea: en un móvil no se veía que hubiera dos modos, y el
              botón grande cambiaba de significado sin avisar. */}
          <div
            className={cx(
              'grid grid-cols-2 gap-1 p-1',
              RADIUS.md,
              'bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800',
            )}
          >
            {(['login', 'signup'] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={modo === m ? 'primary' : 'ghost'}
                onClick={() => onModo(m)}
                aria-pressed={modo === m}
              >
                {m === 'login' ? 'Entrar' : 'Crear cuenta'}
              </Button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className={cx(
                'flex items-start gap-3 p-3',
                RADIUS.md,
                'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900',
                'text-red-800 dark:text-red-200',
              )}
            >
              {/* El icono de antes era `ShieldCheck` —un escudo con un VISTO—
                  para anunciar un fallo. Decía lo contrario de lo que pasaba. */}
              <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm leading-relaxed">{error}</p>
            </div>
          )}

          {aviso && (
            <div
              role="status"
              className={cx(
                'flex items-start gap-3 p-3',
                RADIUS.md,
                'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900',
                'text-emerald-800 dark:text-emerald-200',
              )}
            >
              <MailCheck size={18} className="shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm leading-relaxed">{aviso}</p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(email.trim(), password);
            }}
            className="space-y-4"
          >
            <TextField
              id={idEmail}
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@correo.com"
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

            <TextField
              id={idClave}
              label="Contraseña"
              type={verClave ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete={esAlta ? 'new-password' : 'current-password'}
              enterKeyHint="go"
              disabled={cargando}
              hint={esAlta ? 'Mínimo 6 caracteres.' : undefined}
              trailing={
                <button
                  type="button"
                  onClick={() => setVerClave((v) => !v)}
                  // El área táctil es la del sistema (44px): un ojo de 18px
                  // suelto se falla con el pulgar.
                  className={cx(
                    'flex items-center justify-center px-3',
                    TAP,
                    RADIUS.sm,
                    'text-slate-500 dark:text-slate-400',
                    'hover:text-slate-900 dark:hover:text-white transition-colors',
                  )}
                  aria-label={verClave ? 'Ocultar la contraseña' : 'Ver la contraseña'}
                  aria-pressed={verClave}
                  tabIndex={-1}
                >
                  {verClave ? <Eye size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                </button>
              }
            />

            <Button
              type="submit"
              size="lg"
              block
              disabled={cargando}
              aria-busy={cargando}
              iconRight={cargando ? undefined : <ArrowRight size={18} aria-hidden />}
              icon={cargando ? <Loader2 size={18} className="animate-spin" aria-hidden /> : undefined}
              className="mt-2"
            >
              {cargando ? 'Un momento…' : esAlta ? 'Crear cuenta' : 'Entrar'}
            </Button>
          </form>
        </Card>

        {/* La plataforma tiene `Confirm email` activado. Decirlo ANTES de que
            alguien se registre evita el «me he registrado y no me deja
            entrar», que es exactamente lo que pasa si no lo lee. */}
        {esAlta && (
          <p className={cx(TEXT.muted, 'text-center px-4')}>
            Te enviaremos un correo para confirmar la cuenta. Hasta que pulses
            ese enlace no podrás entrar.
          </p>
        )}
      </div>
    </main>
  );
}
