'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, ShieldCheck } from 'lucide-react';
import { getAdminUsersList } from '@/actions';
import type { AdminUser } from '@/app/actions/admin';
import { EmptyState, cx, TEXT } from '../../ui';

/** `profiles.role` puede llegar a null: la fila existe pero sin rol asignado. */
function RolBadge({ role }: { role: string | null }) {
  return (
    <span
      className={cx(
        'px-2 py-1 rounded text-[10px] font-black uppercase shrink-0',
        // `slate-600` es oscuro en los dos temas, asi que el texto se queda BLANCO:
        // el tematizado automatico le puso `text-slate-900` en claro y el rol
        // quedaba a 2,4:1 sobre su propia pastilla.
        role === 'admin' ? 'bg-amber-500 text-black' : 'bg-slate-600 text-white',
      )}
    >
      {role ?? 'sin rol'}
    </span>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Sin `setLoading(true)` dentro: `loading` ya arranca en true, y un setState
  // sincrono en un efecto dispara un render en cascada.
  const load = useCallback(async () => {
    const res = await getAdminUsersList();
    if (res.success) setUsers(res.users ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-indigo-500"/></div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in">

      <div className="bg-slate-100 dark:bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-300 dark:border-slate-700 w-full md:w-1/3">
        <div className="flex justify-between items-start mb-3">
          <span className="p-2 bg-blue-500/10 rounded-lg text-blue-700 dark:text-blue-400"><Users size={20} /></span>
          <span className="text-[10px] font-black bg-blue-500 text-slate-900 px-2 py-0.5 rounded uppercase">Total</span>
        </div>
        <p className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tabular-nums">{users.length}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Usuarios registrados</p>
      </div>

      {users.length === 0 ? (
        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700">
          <EmptyState
            title="No se encontraron usuarios"
            hint="Si esperabas ver alguno, comprueba las políticas RLS de `profiles`: con la sesión equivocada la consulta devuelve cero filas sin dar error."
            icon={<Users size={32} />}
          />
        </div>
      ) : (
        <>
          {/* MÓVIL: una ficha por usuario.
              Aquí había una tabla de cinco columnas dentro de un contenedor con
              `overflow-hidden` —no `overflow-x-auto`—, así que en un teléfono
              las columnas que no cabían quedaban CORTADAS y no había forma de
              llegar a ellas: la efectividad, que es el dato por el que se mira
              esta pantalla, era invisible en móvil. */}
          {/* Solo la CUENTA: correo y rol. El progreso —tests, acierto, a quién
              llamar, grupos— vive en «Academia», que lo enseña ordenado por
              urgencia (P7g). Aquí duplicarlo era leer la misma lista dos veces. */}
          <div className="md:hidden space-y-2">
            {users.map((u) => (
              <div key={u.id} className="bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 p-4 flex items-center justify-between gap-3">
                <p className="font-medium text-slate-900 dark:text-white text-sm break-all min-w-0">{u.email}</p>
                <RolBadge role={u.role} />
              </div>
            ))}
          </div>

          <div className="hidden md:block bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-500 dark:text-slate-400">
              <thead className="bg-slate-100/50 dark:bg-slate-900/50 text-xs uppercase font-bold text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Rol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-300/50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{u.email}</td>
                    <td className="px-6 py-4"><RolBadge role={u.role} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className={cx(TEXT.muted, 'flex items-center gap-2')}>
        <ShieldCheck size={13} className="shrink-0" />
        El progreso de cada alumno —tests, acierto, grupos, a quién llamar— está en «Academia».
        El acceso y los pagos, en «Acceso &amp; Pagos».
      </p>
    </div>
  );
}
