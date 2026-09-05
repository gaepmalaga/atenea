'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, History } from 'lucide-react';
import { getAdminAuditLog } from '@/actions';
import type { AuditRow } from '@/app/actions/audit';
import { ACCION_LABEL, type AccionAuditada } from '@/app/lib/audit-labels';
import { Card, EmptyState, TEXT, cx } from '../../ui';

/**
 * "Logs & Auditoría": quién hizo qué. Sustituye a lo que antes enseñaba esta
 * pestaña —las últimas 20 respuestas de cualquier alumno—, que no decía quién
 * había hecho qué y no servía para auditar nada (feedback del dueño de la
 * academia: "el modulo Logs no le veo mucho sentido, al menos como está
 * ahora").
 */
export default function AdminActivity() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablaFalta, setTablaFalta] = useState(false);

  const cargar = useCallback(async () => {
    const res = await getAdminAuditLog();
    if (res.success) {
      setRows(res.rows);
      setError(null);
      setTablaFalta(false);
    } else {
      setError(res.error);
      setTablaFalta(res.tablaFalta ?? false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function recargar() {
    setLoading(true);
    cargar();
  }

  return (
    <div className="space-y-4 animate-in fade-in pb-24">
      <Card tone="sunken" pad="md" className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-slate-700/10 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
            <History size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Auditoría</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>
              Quién ha borrado, publicado o apagado algo — no las respuestas de los alumnos, eso está en Academia.
            </p>
          </div>
        </div>
        <button
          onClick={recargar}
          className="w-11 h-11 shrink-0 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </Card>

      {tablaFalta && (
        <Card tone="base" pad="md" className="border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed">
            Todavía no existe la tabla del registro. Hay que ejecutar{' '}
            <code className="font-mono bg-black/10 dark:bg-white/10 px-1 rounded">docs/sql/admin-audit-log.sql</code>{' '}
            en el editor SQL de Supabase — mientras tanto no hay nada que enseñar aquí, pero nada se ha roto.
          </p>
        </Card>
      )}

      {error && !tablaFalta && (
        <Card tone="base" pad="md" className="border-red-500/30 text-red-700 dark:text-red-300">
          <p className="text-xs font-medium">{error}</p>
        </Card>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          icon={<ShieldCheck size={40} />}
          title="Sin acciones registradas todavía"
          hint="En cuanto se borre un tema, se publiquen preguntas o se apague un módulo, aparecerá aquí."
          bordered
        />
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.id} tone="sunken" pad="sm" className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                {ACCION_LABEL[r.action as AccionAuditada] ?? r.action}
              </p>
              <p className={cx(TEXT.muted, 'mt-1')}>
                {r.actorEmail ?? 'admin'}
                {r.target ? ` · ${r.target}` : ''}
              </p>
            </div>
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-mono whitespace-nowrap shrink-0">
              {new Date(r.createdAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
