'use client'

import { useState, useEffect, useMemo } from 'react';
import { getCurrentUser } from '@/actions';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';
import { mensajeDeAuth } from '@/app/lib/auth-messages';
import type { AuthUser } from '@/app/lib/auth';
import { Loader2 } from 'lucide-react';

import StudentDashboard from './student/StudentDashboard';
import AdminView from './Admin/AdminView';
import LoginScreen, { type ModoAuth } from './auth/LoginScreen';
import AccessLocked from './auth/AccessLocked';
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
      // El enlace de confirmación de correo (registro, P11j) y el de
      // invitación (`addAcademyAdmin`, regla 65) vuelven cada uno con una
      // forma distinta de sesión sin canjear en la URL, y nadie lo hacía: la
      // persona aterrizaba otra vez en el formulario de entrar, con el
      // código o el token colgando sin explicación.
      //
      // - REGISTRO propio (`signUp` desde `handleAuth`, más abajo): el
      //   cliente pide PKCE, así que el enlace vuelve con `?code=...` — se
      //   canjea con `exchangeCodeForSession` y ya tiene contraseña (la puso
      //   al registrarse), así que entra derecho al panel.
      // - INVITACIÓN (`inviteUserByEmail`, sin cliente de por medio): vuelve
      //   con `#access_token=...&refresh_token=...&type=invite` — un flujo
      //   distinto (implícito), y sin contraseña ninguna: quien la recibe
      //   nunca ha elegido una. Se establece la sesión con `setSession` y se
      //   le pide que ponga una antes de dejarla pasar (`SetPasswordScreen`);
      //   sin ese paso se quedaría sin forma de volver a entrar.
      const code = new URLSearchParams(window.location.search).get('code');
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
        } else if (tipo === 'invite') {
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
        cargando={authLoading}
        error={errorMsg}
        aviso={avisoMsg}
      />
    );
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
