'use client'

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js'; 
import { getUserRole } from './actions'; // Asegúrate de que actions.ts esté en app/ o usa '../actions' si está fuera
import { BookOpen, User, Lock, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

// CORRECCIÓN AQUÍ: Nombre exacto y ruta relativa exacta
import StudentDashboard from './components/student/StudentDashboard';
import AdminView from './components/AdminView'; // Asegúrate de que este archivo exista también

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState<string>('student');
  const [loadingUser, setLoadingUser] = useState(true);
  
  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setUser(session.user);
        // Si getUserRole está en actions.ts al mismo nivel que page.tsx:
        const r = await getUserRole(session.user.id);
        setRole(r);
      }
      setLoadingUser(false);
    }
    checkSession();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    setRole('student');
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthLoading(true);
    setErrorMsg(null);
    
    try {
        if (authMode === 'login') {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (data.session) {
            setUser(data.session.user);
            const r = await getUserRole(data.session.user.id);
            setRole(r);
          }
        } else {
          const { data, error } = await supabase.auth.signUp({ email, password });
          if (error) throw error;
          alert("¡Cuenta creada! Revisa tu email o inicia sesión.");
          setAuthMode('login');
        }
    } catch (err: any) {
        setErrorMsg(err.message);
    } finally {
        setAuthLoading(false);
    }
  }

  if (loadingUser) return (
    <div className="h-screen bg-slate-950 flex flex-col items-center justify-center text-white gap-4">
        <Loader2 className="animate-spin text-blue-500" size={40}/>
        <p className="text-sm font-mono text-slate-400 animate-pulse">Cargando sistema Atenea...</p>
    </div>
  );

  // --- VISTA DE LOGIN ---
  if (!user) {
    return (
      <main className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
        {/* Fondo */}
        <div className="absolute inset-0 bg-slate-950 z-0">
            <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] animate-float"/>
            <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[120px] animate-float" style={{animationDelay: '2s'}}/>
        </div>

        <div className="glass-panel relative z-10 p-10 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-8 border border-white/10 backdrop-blur-xl animate-in zoom-in duration-500">
           
           <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 bg-blue-500 rounded-2xl blur-lg opacity-40 animate-pulse"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl w-full h-full flex items-center justify-center shadow-xl border border-white/20">
                  <BookOpen className="text-white drop-shadow-md" size={40}/>
              </div>
           </div>
           
           <div>
               <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 tracking-tight mb-2">Atenea Policial</h1>
               <p className="text-slate-400 text-sm font-medium">Plataforma de Alto Rendimiento</p>
           </div>

           {errorMsg && (
               <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg text-red-200 text-xs text-left flex items-center gap-2">
                   <ShieldCheck size={14}/> {errorMsg}
               </div>
           )}

           <form onSubmit={handleAuth} className="text-left space-y-5">
              <div className="group">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Email Oficial</label>
                 <div className="relative">
                     <User className="absolute left-4 top-3.5 text-slate-500" size={18}/>
                     <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full pl-12 p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 outline-none text-white" required placeholder="opositor@policia.es" />
                 </div>
              </div>
              <div className="group">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Contraseña</label>
                 <div className="relative">
                     <Lock className="absolute left-4 top-3.5 text-slate-500" size={18}/>
                     <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full pl-12 p-3.5 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 outline-none text-white" required placeholder="••••••••" />
                 </div>
              </div>

              <button disabled={authLoading} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3.5 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-2">
                 {authLoading ? <Loader2 className="animate-spin" size={20}/> : (authMode==='login' ? <>Ingresar <ArrowRight size={18}/></> : 'Crear Cuenta')}
              </button>
           </form>

           <div className="pt-4 border-t border-white/5">
                <button onClick={()=>{setAuthMode(authMode==='login'?'signup':'login'); setErrorMsg(null);}} className="text-xs text-slate-400 hover:text-white font-medium hover:underline">
                    {authMode==='login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}
                </button>
           </div>
        </div>
      </main>
    );
  }

  // --- RENDERIZADO CONDICIONAL ---
  return role === 'admin' 
    ? <AdminView user={user} onLogout={handleLogout} /> 
    // Ahora usamos el nombre correcto del componente
    : <StudentDashboard user={user} onLogout={handleLogout} />;
}