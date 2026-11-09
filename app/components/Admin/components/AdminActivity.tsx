'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle, LogIn } from 'lucide-react';
import { getAdminAuditLog, getInicioSesiones } from '@/actions';
import type { AuditRow, SesionUsuario } from '@/app/actions/audit';
import { ACCION_LABEL, type AccionAuditada } from '@/app/lib/audit-labels';
import { PanelTitulo, BloqueTitulo, Aviso, Boton, Filtros, FiltroChip, TablaDual, Avatar, Etiqueta, inicialesDeCorreo, EmptyState } from '../../ui';

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

  const [filtro, setFiltro] = useState<'todos' | 'alumnos' | 'admin'>('todos');
  const visibles = usuarios.filter((u) => filtro === 'todos' || (filtro === 'admin' ? u.rol === 'admin' : u.rol !== 'admin'));
  const cuenta = (f: 'alumnos' | 'admin') => usuarios.filter((u) => (f === 'admin' ? u.rol === 'admin' : u.rol !== 'admin')).length;

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Logs"
        sub="Quién entra y cuándo, y quién ha borrado, publicado o apagado algo."
        acciones={<Boton variant="secondary" onClick={recargar} icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}>Recargar</Boton>}
      />

      {loading && (
        <div className="flex items-center justify-center gap-2 px-1 py-8 text-slate-600 dark:text-slate-400">
          <RefreshCw size={15} className="animate-spin" />
          <span className="text-xs font-semibold">Cargando…</span>
        </div>
      )}

      {/* ───────── ÚLTIMO ACCESO POR USUARIO ───────── */}
      <section className="space-y-3" hidden={loading}>
        <BloqueTitulo icon={<LogIn size={15} />}>Inicios de sesión</BloqueTitulo>

        <Filtros etiqueta="Qué usuarios ver">
          <FiltroChip activo={filtro === 'todos'} onClick={() => setFiltro('todos')} cuenta={usuarios.length}>Todos</FiltroChip>
          <FiltroChip activo={filtro === 'alumnos'} onClick={() => setFiltro('alumnos')} cuenta={cuenta('alumnos')}>Alumnos</FiltroChip>
          <FiltroChip activo={filtro === 'admin'} onClick={() => setFiltro('admin')} cuenta={cuenta('admin')}>Administración</FiltroChip>
        </Filtros>

        {sinFechas && (
          <Aviso><AlertTriangle size={15} className="mt-0.5 shrink-0" /> No se han podido leer las fechas de conexión de Supabase. La lista sale igual, pero sin el último acceso.</Aviso>
        )}

        {!loading && usuarios.length === 0 ? (
          <EmptyState icon={<LogIn size={40} />} title="Ningún usuario todavía" bordered />
        ) : (
          <TablaDual
            soloLectura
            clave={(u) => u.id}
            filas={visibles}
            vacio="Ningún usuario de ese tipo."
            columnas={[
              { id: 'usuario', titulo: 'Usuario', celda: (u) => (
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar iniciales={inicialesDeCorreo(u.email)} />
                  <div className="min-w-0"><p className="truncate font-semibold text-slate-900 dark:text-white">{u.email ?? '(sin correo)'}</p></div>
                </div>
              ) },
              { id: 'rol', titulo: 'Rol', celda: (u) => <Etiqueta tono={u.rol === 'admin' ? 'oro' : 'apagado'}>{u.rol === 'admin' ? 'Administración' : 'Alumno'}</Etiqueta> },
              { id: 'ultimo', titulo: 'Último acceso', celda: (u) => (
                u.ultimoAcceso
                  ? <span><b className="font-semibold">{desdeCuando(u.ultimoAcceso)}</b> <span className="text-slate-600 dark:text-slate-400">· {fechaCompleta(u.ultimoAcceso)}</span></span>
                  : <span className="font-semibold text-amber-700 dark:text-amber-300">No ha entrado nunca</span>
              ) },
            ]}
          />
        )}
      </section>

      {/* ───────── REGISTRO DE ACCIONES ───────── */}
      <section className="space-y-3 pt-2" hidden={loading}>
        <BloqueTitulo icon={<ShieldCheck size={15} />}>Acciones de administración</BloqueTitulo>

        {tablaFalta && (
          <Aviso>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>
              Todavía no existe la tabla del registro. Hay que ejecutar{' '}
              <code className="rounded bg-black/10 px-1 font-mono dark:bg-white/10">docs/sql/admin-audit-log.sql</code>{' '}
              en el editor SQL de Supabase — mientras tanto no hay nada que enseñar aquí, pero nada se ha roto.
            </span>
          </Aviso>
        )}

        {error && !tablaFalta && <Aviso tono="malo">{error}</Aviso>}

        {!loading && !error && rows.length === 0 && (
          <EmptyState
            icon={<ShieldCheck size={40} />}
            title="Sin acciones registradas todavía"
            hint="En cuanto se borre un tema, se publiquen preguntas o se apague un módulo, aparecerá aquí."
            bordered
          />
        )}

        {rows.length > 0 && (
          <TablaDual
            soloLectura
            clave={(r) => r.id}
            filas={rows}
            columnas={[
              { id: 'cuando', titulo: 'Cuándo', celda: (r) => (
                <span className="font-semibold tabular-nums">{new Date(r.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              ) },
              { id: 'quien', titulo: 'Quién', celda: (r) => <span className="break-all">{r.actorEmail ?? 'admin'}</span> },
              { id: 'accion', titulo: 'Acción', celda: (r) => ACCION_LABEL[r.action as AccionAuditada] ?? r.action },
              { id: 'sobre', titulo: 'Sobre qué', celda: (r) => r.target ?? <span className="text-slate-600 dark:text-slate-400">—</span> },
            ]}
          />
        )}
      </section>
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
