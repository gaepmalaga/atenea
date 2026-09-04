'use client'

import { useState, useEffect, useMemo } from 'react';
import { getCurrentUser } from '@/actions';
import { createSupabaseBrowserClient } from '@/app/lib/supabase/client';
import { mensajeDeAuth } from '@/app/lib/auth-messages';
import type { AuthUser } from '@/app/lib/auth';
import { Loader2 } from 'lucide-react';

import StudentDashboard from './components/student/StudentDashboard';
import AdminView from './components/Admin/AdminView';
import LoginScreen, { type ModoAuth } from './components/auth/LoginScreen';

export default function Home() {
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

  useEffect(() => {
    async function checkSession() {
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
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRole('student');
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
        const { error } = await supabase.auth.signUp({ email, password });
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

  return role === 'admin'
    ? <AdminView user={user} onLogout={handleLogout} />
    : <StudentDashboard user={user} onLogout={handleLogout} />;
}
