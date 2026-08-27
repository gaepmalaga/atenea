'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { getAdminUsersList } from '@/actions';
import type { AdminUser } from '@/app/actions/admin';

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
    <div className="space-y-6 animate-in fade-in">
        {/* KPI Rápido */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 w-full md:w-1/3">
          <div className="flex justify-between items-start mb-4">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><Users size={20} /></div>
            <span className="text-xs font-bold bg-blue-500 text-slate-900 px-2 py-0.5 rounded">TOTAL</span>
          </div>
          <p className="text-4xl font-black text-white">{users.length}</p>
          <p className="text-sm text-slate-500 font-medium">Usuarios Registrados</p>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-500">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4 text-center">Tests</th>
                <th className="px-6 py-4 text-center">Efectividad</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${u.role === 'admin' ? 'bg-yellow-500 text-black' : 'bg-slate-600 text-white'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono">{u.total_tests}</td>
                  <td className="px-6 py-4 text-center">
                    {/* Sin datos NO es lo mismo que 0 % de aciertos (regla 8):
                        antes ambos casos se pintaban igual, y en rojo. */}
                    {u.win_rate === null ? (
                      <span className="text-slate-500 font-mono text-xs">sin datos</span>
                    ) : (
                      <span className={`font-bold ${u.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                        {u.win_rate}%
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-green-400 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div> Activo
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">No se encontraron usuarios (¿Quizás RLS?).</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
}