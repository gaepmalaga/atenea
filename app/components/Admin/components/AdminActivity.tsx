'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, History, LogIn } from 'lucide-react';
import { getAdminAuditLog, getInicioSesiones } from '@/actions';
import type { AuditRow, SesionUsuario } from '@/app/actions/audit';
import { ACCION_LABEL, type AccionAuditada } from '@/app/lib/audit-labels';
import { Card, EmptyState, TEXT, cx } from '../../ui';

/**
 * "Logs & Auditoría": quién hizo qué.
 *
 * Dos cosas:
 *   · ÚLTIMO ACCESO de cada usuario (alumnos y admin) — de
 *     `auth.users.last_sign_in_at`. Aquí SÍ salen los admin, a diferencia de
 *     «Alumnos» (regla 54): esto audita quién entra, no a quién llamar.
 *   · El REGISTRO de acciones de administración (`admin_audit_log`): quién
 *     borró, publicó o apagó algo.
 */
export default function AdminActivity() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [usuarios, setUsuarios] = useState<SesionUsuario[]>([]);
  const [sinFechas, setSinFechas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tablaFalta, setTablaFalta] = useState(false);

  const cargar = useCallback(async () => {
    const [audit, sesiones] = await Promise.all([getAdminAuditLog(), getInicioSesiones()]);

    if (audit.success) {
      setRows(audit.rows);
      setError(null);
      setTablaFalta(false);
    } else {
      setError(audit.error);
      setTablaFalta(audit.tablaFalta ?? false);
    }

    if (sesiones.success) {
      setUsuarios(sesiones.usuarios);
      setSinFechas(sesiones.sinFechas);
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
            <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">Logs &amp; Auditoría</h3>
            <p className={cx(TEXT.muted, 'mt-0.5')}>
              Quién entra y cuándo, y quién ha borrado, publicado o apagado algo.
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

      {loading && (
        <div className="flex items-center gap-2 px-1 py-8 justify-center text-slate-500 dark:text-slate-400">
          <RefreshCw size={15} className="animate-spin" />
          <span className="text-xs font-bold">Cargando…</span>
        </div>
      )}

      {/* ───────── ÚLTIMO ACCESO POR USUARIO ───────── */}
      <div className="space-y-2" hidden={loading}>
        <div className="flex items-center gap-2 px-1">
          <LogIn size={13} className="text-slate-500 dark:text-slate-400" />
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Inicios de sesión
          </h4>
        </div>

        {sinFechas && (
          <Card tone="base" pad="md" className="border-amber-500/30 text-amber-800 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed">
              No se han podido leer las fechas de conexión de Supabase. La lista sale igual, pero sin el último acceso.
            </p>
          </Card>
        )}

        {!loading && usuarios.length === 0 ? (
          <EmptyState icon={<LogIn size={40} />} title="Ningún usuario todavía" bordered />
        ) : (
          <div className="space-y-2">
            {usuarios.map((u) => (
              <Card key={u.id} tone="sunken" pad="sm" className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug truncate">
                    {u.email ?? '(sin correo)'}
                    {u.rol === 'admin' && (
                      <span className="ml-2 text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 align-middle">
                        admin
                      </span>
                    )}
                  </p>
                  <p className={cx(TEXT.muted, 'mt-1')}>
                    {u.ultimoAcceso ? `Última vez: ${fechaCompleta(u.ultimoAcceso)}` : 'No ha entrado nunca'}
                  </p>
                </div>
                <span
                  className={cx(
                    'text-[11px] font-bold whitespace-nowrap shrink-0',
                    u.ultimoAcceso ? 'text-slate-600 dark:text-slate-300' : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {desdeCuando(u.ultimoAcceso)}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ───────── REGISTRO DE ACCIONES ───────── */}
      <div className="space-y-2 pt-2" hidden={loading}>
        <div className="flex items-center gap-2 px-1">
          <ShieldCheck size={13} className="text-slate-500 dark:text-slate-400" />
          <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Acciones de administración
          </h4>
        </div>

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
    </div>
  );
}

/** "Hace 2 h" / "Ayer" / "Hace 5 días" / "Nunca". */
function desdeCuando(iso: string | null): string {
  if (!iso) return 'Nunca';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'Ahora mismo';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'Ahora mismo';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  const meses = Math.floor(d / 30);
  return meses <= 1 ? 'Hace 1 mes' : `Hace ${meses} meses`;
}

/** "8 sep 2026, 14:32". */
function fechaCompleta(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
