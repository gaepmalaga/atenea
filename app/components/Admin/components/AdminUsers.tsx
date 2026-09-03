'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2, ShieldCheck } from 'lucide-react';
import { getAdminUsersList } from '@/actions';
import type { AdminUser } from '@/app/actions/admin';
import { EmptyState, cx, TEXT } from '../../ui';

/** El acierto, con el mismo criterio en móvil y en escritorio. */
function Efectividad({ winRate }: { winRate: number | null }) {
  // Sin datos NO es lo mismo que 0 % de aciertos (regla 8): antes ambos casos
  // se pintaban igual, y en rojo.
  if (winRate === null) return <span className="text-slate-500 font-mono text-xs">sin datos</span>;
  return (
    <span className={cx('font-bold tabular-nums', winRate >= 50 ? 'text-emerald-400' : 'text-red-400')}>
      {winRate}%
    </span>
  );
}

/** `profiles.role` puede llegar a null: la fila existe pero sin rol asignado. */
function RolBadge({ role }: { role: string | null }) {
  return (
    <span
      className={cx(
        'px-2 py-1 rounded text-[10px] font-black uppercase shrink-0',
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

      <div className="bg-slate-800 p-4 sm:p-6 rounded-2xl border border-slate-700 w-full md:w-1/3">
        <div className="flex justify-between items-start mb-3">
          <span className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Users size={20} /></span>
          <span className="text-[10px] font-black bg-blue-500 text-slate-900 px-2 py-0.5 rounded uppercase">Total</span>
        </div>
        <p className="text-3xl sm:text-4xl font-black text-white tabular-nums">{users.length}</p>
        <p className="text-sm text-slate-500 font-medium">Usuarios registrados</p>
      </div>

      {users.length === 0 ? (
        <div className="bg-slate-800 rounded-2xl border border-slate-700">
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
          <div className="md:hidden space-y-2">
            {users.map((u) => (
              <div key={u.id} className="bg-slate-800 rounded-2xl border border-slate-700 p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="font-medium text-white text-sm break-all min-w-0">{u.email}</p>
                  <RolBadge role={u.role} />
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">
                    Tests <span className="font-mono text-slate-300 tabular-nums">{u.total_tests}</span>
                  </span>
                  <span className="text-slate-500">
                    Efectividad <Efectividad winRate={u.win_rate} />
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ESCRITORIO: la tabla, que aquí sí cabe. */}
          <div className="hidden md:block bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-500">
                <tr>
                  <th className="px-6 py-4">Usuario</th>
                  <th className="px-6 py-4">Rol</th>
                  <th className="px-6 py-4 text-center">Tests</th>
                  <th className="px-6 py-4 text-center">Efectividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-white">{u.email}</td>
                    <td className="px-6 py-4"><RolBadge role={u.role} /></td>
                    <td className="px-6 py-4 text-center font-mono tabular-nums">{u.total_tests}</td>
                    <td className="px-6 py-4 text-center"><Efectividad winRate={u.win_rate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* La columna "Estado" pintaba un punto verde y la palabra "Activo" para
          TODOS los usuarios, siempre: no sale de ninguna columna, estaba escrita
          en el HTML. Un administrador podía leer ahí que una cuenta suspendida
          estaba activa. Se retira hasta que exista el dato de verdad. */}
      <p className={cx(TEXT.muted, 'flex items-center gap-2')}>
        <ShieldCheck size={13} className="shrink-0" />
        El acierto va sobre las preguntas contestadas, sin contar las dejadas en blanco.
      </p>
    </div>
  );
}
