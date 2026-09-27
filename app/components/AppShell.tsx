'use client'

import { useState, useEffect, useMemo } from 'react';
import { getCurrentUser, getMisAcademias } from '@/actions';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';
import { mensajeDeAuth } from '@/app/lib/auth-messages';
import type { AuthUser } from '@/app/lib/auth';
import { Loader2 } from 'lucide-react';

import StudentDashboard from './student/StudentDashboard';
import AdminView from './Admin/AdminView';
import LoginScreen, { type ModoAuth } from './auth/LoginScreen';
import AccessLocked from './auth/AccessLocked';
import SelectAcademyScreen from './auth/SelectAcademyScreen';
import SetPasswordScreen from './auth/SetPasswordScreen';

/**
 * LA APLICACIÓN ENTERA (regla 37), independiente de por qué ruta se entró.
 *
 * `app/page.tsx` (sin academia en la URL) y `app/[academia]/page.tsx` (P11,
 * `/alphapol`, `/depol`…) renderizan esto. La academia de una SESIÓN YA
 * ABIERTA no es una prop de este componente: la resuelve el servidor en
 * `getSessionUser` (cookie que deja `middleware.ts` + `academy_members`), así
 * que `LoginScreen` no cambia una línea entre `/alphapol` y `/depol`.
 *
 * `academiaSlug` es la ÚNICA excepción, y solo para el REGISTRO (P11j): un
 * alta nueva no tiene todavía ninguna fila en `academy_members` que
 * `resolveOrganizationId` pueda mirar, así que hace falta decir por qué
 * academia se está registrando en el momento mismo del `signUp` — se manda
 * como metadata (`options.data.academia_slug`), y un disparador de Postgres
 * (`docs/sql/P11j-asignar-academia-en-registro.sql`) la lee para dar de alta
 * la membresía. Sin slug (registro por `/`), el disparador cae al mismo
 * criterio que `resolveOrganizationId`: si solo hay una academia en toda la
 * plataforma, es esa.
 */
export default function AppShell({ academiaSlug }: { academiaSlug?: string } = {}) {
  // Cliente con sesion en COOKIES: es lo que permite que las Server Actions
  // verifiquen quien llama. Con el cliente por defecto la sesion vivia en
  // localStorage y el servidor no podia verla.
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<string>('student');
  const [loadingUser, setLoadingUser] = useState(true);
  // P11h: solo se rellena si hace falta — cuando `access` sale `no-academy`.
  // `null` = todavía no se ha mirado; `[]` = mirado, y de verdad no hay
  // ninguna (el caso que sí es un callejón sin salida real).
  const [academiasDisponibles, setAcademiasDisponibles] = useState<{ slug: string; name: string }[] | null>(null);

  const [authMode, setAuthMode] = useState<ModoAuth>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [avisoMsg, setAvisoMsg] = useState<string | null>(null);

  // Alguien que acaba de aceptar una invitación (`addAcademyAdmin`, regla 65)
  // tiene sesión pero NUNCA ha puesto contraseña — `inviteUserByEmail` no la
  // pide. Sin este paso, entraba una vez con el enlace y se quedaba sin forma
  // de volver a entrar: `signInWithPassword` no tenía nada que comprobar.
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      // El enlace de confirmación de correo (registro, P11j), el de
      // invitación (`addAcademyAdmin`, regla 65) y el de recuperar
      // contraseña vuelven cada uno con una forma distinta de sesión sin
      // canjear en la URL, y nadie lo hacía: la persona aterrizaba otra vez
      // en el formulario de entrar, con el código o el token colgando sin
      // explicación.
      //
      // - REGISTRO propio (`signUp` desde `handleAuth`, más abajo): el
      //   cliente pide PKCE, así que el enlace vuelve con `?code=...` — se
      //   canjea con `exchangeCodeForSession` y ya tiene contraseña (la puso
      //   al registrarse), así que entra derecho al panel.
      // - INVITACIÓN (`inviteUserByEmail`, sin cliente de por medio) o
      //   RECUPERACIÓN (`resetPasswordForEmail` / un enlace de recuperación
      //   generado a mano): vuelven con
      //   `#access_token=...&refresh_token=...&type=invite|recovery` — un
      //   flujo distinto (implícito). En los dos casos no hay contraseña
      //   utilizable todavía —la invitación nunca la pidió, y quien recupera
      //   está aquí precisamente porque la suya no sirve—, así que los dos se
      //   tratan igual: se establece la sesión con `setSession` y se le pide
      //   que ponga una antes de dejarla pasar (`SetPasswordScreen`); sin ese
      //   paso se quedaría otra vez sin forma de volver a entrar.
      // `?alta` abre directamente el formulario de REGISTRO. Lo usa el botón
      // «Crear mi cuenta» de `/fundadores`: quien llega de Instagram buscando
      // registrarse no tiene que encontrar el enlace «Regístrate aquí» al
      // final de la pantalla de entrar.
      const busqueda = new URLSearchParams(window.location.search);
      if (busqueda.has('alta')) {
        setAuthMode('signup');
        busqueda.delete('alta');
        const resto = busqueda.toString();
        window.history.replaceState({}, '', window.location.pathname + (resto ? `?${resto}` : ''));
      }

      const code = busqueda.get('code');
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      if (code) {
        // Se limpia de la URL pase lo que pase: un código ya usado (recargar
        // la página, volver a pulsar el enlace) no puede quedarse ahí para
        // siempre intentando canjearse en cada visita.
        window.history.replaceState({}, '', window.location.pathname);
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // La cuenta probablemente ya quedó confirmada en el servidor
          // aunque el canje falle aquí (enlace reutilizado, sesión ya
          // canjeada en otra pestaña): se le pide que entre a mano en vez de
          // enseñar un error técnico sobre un código que ya no importa.
          setAvisoMsg('Tu cuenta ya debería estar confirmada. Inicia sesión con tu correo y tu contraseña.');
        }
      } else if (accessToken && refreshToken) {
        window.history.replaceState({}, '', window.location.pathname);
        const tipo = hash.get('type');
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          setAvisoMsg('Ese enlace ya no es válido. Inicia sesión con tu correo y tu contraseña.');
        } else if (tipo === 'invite' || tipo === 'recovery') {
          setNeedsPassword(true);
        }
      }

      // El rol lo decide el servidor a partir de la cookie de sesion; el
      // cliente ya no envia ningun id.
      //
      // El try/catch no es decorativo: sin el, cualquier fallo del servidor
      // dejaba `loadingUser` en true para siempre y la pantalla se quedaba en
      // "Cargando sistema Atenea..." sin salida ni forma de iniciar sesion.
      try {
        const current = await getCurrentUser();
        if (current) {
          setUser(current);
          setRole(current.role);
          await cargaAcademiasSiHaceFalta(current);
        }
      } catch (e) {
        console.error('checkSession:', e);
        setErrorMsg('No se ha podido comprobar la sesión. Puedes iniciarla de nuevo.');
      } finally {
        setLoadingUser(false);
      }
    }
    checkSession();
  }, [supabase]);

  /**
   * P11h: solo consulta si hace falta.
   *
   * Dos casos tienen `organizationId: null` sin ser ambiguos — un `student`
   * o `admin` de verdad sin academia (`access: 'no-academy'`) y un
   * `superadmin`, que NUNCA queda ligado a ninguna a propósito (regla 65) —
   * y uno que SÍ lo es: un `admin` en más de una academia, sin que la cookie
   * dijera cuál. Ese último es indistinguible del primero solo con
   * `access` (`requireAdmin` no tiene su propio estado de acceso, siempre es
   * `ok`), así que hace falta la lista real para saber cuál es cuál.
   */
  async function cargaAcademiasSiHaceFalta(current: AuthUser) {
    const podriaSerAmbiguo =
      current.access === 'no-academy' || (current.role === 'admin' && current.organizationId === null);
    if (!podriaSerAmbiguo) return;
    const res = await getMisAcademias();
    setAcademiasDisponibles(res.success ? res.academias : []);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRole('student');
  }

  async function handleSetPassword(password: string) {
    setPasswordLoading(true);
    setPasswordError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // La sesión de la invitación ya era válida (`setSession` en
      // `checkSession`), y `user`/`role` ya se cargaron con ella: no hace
      // falta pedirle nada más, solo dejar de tapar el panel.
      setNeedsPassword(false);
    } catch (err: unknown) {
      setPasswordError(mensajeDeAuth(err));
    } finally {
      setPasswordLoading(false);
    }
  }

  function cambiarModo(modo: ModoAuth) {
    setAuthMode(modo);
    setErrorMsg(null);
    setAvisoMsg(null);
  }

  /**
   * «¿Olvidaste tu contraseña?» — mismo enlace implícito que una invitación
   * (regla 67): vuelve con `type=recovery`, y `checkSession` ya sabe
   * enseñarle `SetPasswordScreen` en cuanto establece la sesión.
   *
   * Supabase no dice si el correo existe o no — ni aquí conviene decirlo: un
   * mensaje que confirmara «esa cuenta no existe» serviría para averiguar qué
   * correos están dados de alta.
   */
  async function handleForgotPassword(email: string) {
    setErrorMsg(null);
    setAvisoMsg(null);
    if (!email) {
      setErrorMsg('Escribe primero tu correo, arriba.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setAvisoMsg(`Si existe una cuenta con ${email}, te hemos enviado un correo para elegir una contraseña nueva.`);
    } catch (err: unknown) {
      setErrorMsg(mensajeDeAuth(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAuth(email: string, password: string) {
    setAuthLoading(true);
    setErrorMsg(null);
    setAvisoMsg(null);

    try {
      if (authMode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session) {
          const current = await getCurrentUser();
          if (!current) throw new Error('No se pudo establecer la sesión.');
          setUser(current);
          setRole(current.role);
          await cargaAcademiasSiHaceFalta(current);
        }
      } else {
        // P11j: el slug viaja como metadata del propio alta — el disparador
        // de Postgres la lee para dar de alta la membresía (docs/sql/P11j-
        // asignar-academia-en-registro.sql). Sin slug (registro por `/`), cae
        // al mismo criterio que `resolveOrganizationId`: si solo hay una
        // academia en toda la plataforma, es esa.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          ...(academiaSlug ? { options: { data: { academia_slug: academiaSlug } } } : {}),
        });
        if (error) throw error;
        // Antes esto era un `alert()` del navegador que decia "Revisa tu email
        // o inicia sesion". La "o" era falsa: con `Confirm email` activado NO
        // se puede iniciar sesion hasta pulsar el enlace, asi que la mitad de
        // la frase mandaba a la gente a chocarse con "Email not confirmed".
        setAuthMode('login');
        setAvisoMsg(
          `Cuenta creada. Te hemos enviado un correo a ${email}: pulsa el enlace para confirmarla y ya podrás entrar.`,
        );
      }
    } catch (err: unknown) {
      // Traducido en `lib/auth-messages.ts`. Lo que llega de Supabase viene en
      // ingles, y era lo primero que leia quien se equivocaba de contrasena.
      setErrorMsg(mensajeDeAuth(err));
    } finally {
      setAuthLoading(false);
    }
  }

  if (loadingUser) {
    return (
      // `min-h-dvh`, no `h-screen`: `100vh` es la altura CON la barra de
      // direcciones plegada, asi que en un movil recien abierto esto se salia
      // por abajo (regla 36).
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="animate-spin text-indigo-500" size={40} aria-hidden />
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          Cargando Atenea…
        </p>
      </div>
    );
  }

  // Sesión de invitación sin contraseña todavía: se le pide ANTES de dejarla
  // pasar, incluso aunque `user` ya se haya cargado con esa misma sesión
  // (regla 65 — `addAcademyAdmin` invita sin pedir contraseña ninguna).
  if (needsPassword) {
    return (
      <SetPasswordScreen
        email={user?.email ?? null}
        onSubmit={handleSetPassword}
        cargando={passwordLoading}
        error={passwordError}
      />
    );
  }

  if (!user) {
    return (
      <LoginScreen
        modo={authMode}
        onModo={cambiarModo}
        onSubmit={handleAuth}
        onOlvido={handleForgotPassword}
        cargando={authLoading}
        error={errorMsg}
        aviso={avisoMsg}
      />
    );
  }

  // P11h: `no-academy` (o un `admin` con `organizationId: null` sin ser
  // superadmin) con MÁS DE UNA academia real detrás no es un callejón sin
  // salida — es que la cookie de `middleware.ts` no decía cuál usar. Se le
  // ofrece elegir en vez de mandarlo a "habla con tu academia" (regla 56: no
  // se pregunta lo deducible, pero esto NO es deducible — nadie más que la
  // persona sabe con cuál quiere entrar).
  const esAdminAmbiguo = user.role === 'admin' && user.organizationId === null;
  if ((user.access === 'no-academy' || esAdminAmbiguo) && academiasDisponibles && academiasDisponibles.length > 1) {
    return <SelectAcademyScreen academias={academiasDisponibles} email={user.email} onLogout={handleLogout} />;
  }

  // P6: si la academia ha cerrado el acceso y este alumno no está activo, no ve
  // el dashboard — ve por qué y a quién dirigirse. Un admin/superadmin siempre
  // es `ok`.
  if (user.access !== 'ok') {
    return <AccessLocked motivo={user.access} email={user.email} onLogout={handleLogout} />;
  }

  // P11: `superadmin` administra igual que `admin` (con la academia resuelta
  // de su sesión); el panel transversal de varias academias es trabajo aparte
  // (P11f), sin construir todavía.
  return role === 'admin' || role === 'superadmin'
    ? <AdminView user={user} onLogout={handleLogout} />
    : <StudentDashboard user={user} onLogout={handleLogout} />;
}
