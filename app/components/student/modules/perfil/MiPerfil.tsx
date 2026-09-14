'use client';

import { useState, useEffect } from 'react';
import { CalendarClock, ShieldCheck, ShieldAlert, Users, Mail, Sun, Moon, Monitor, ListChecks } from 'lucide-react';
import { getMiPerfil } from '@/actions';
import type { MiPerfil as MiPerfilData } from '@/app/actions/perfil';
import { diasHasta, fechaLarga, textoCuentaAtras } from '@/app/lib/convocatoria';
import { leeTema, guardaTema, type Tema } from '@/app/lib/theme';
import { Card, SectionLabel, cx, TEXT, TAP } from '../../../ui';

/** Lun, Mar, Mié… a partir de una fecha `YYYY-MM-DD`. Se parsea en LOCAL
 *  (no `new Date('YYYY-MM-DD')`, que Safari/Chrome interpretan como UTC medianoche
 *  y puede caer en el día de antes según el huso). */
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
function etiquetaDia(fecha: string, indice: number): string {
  if (indice === 0) return 'Hoy';
  if (indice === 1) return 'Mañana';
  const [y, m, d] = fecha.split('-').map(Number);
  return DIAS_SEMANA[new Date(y, m - 1, d).getDay()];
}

export default function MiPerfil({ user }: { user: { id: string; email?: string } }) {
  const [data, setData] = useState<MiPerfilData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tema, setTema] = useState<Tema>('sistema');

  useEffect(() => { setTema(leeTema()); }, []);

  useEffect(() => {
    getMiPerfil()
      .then((res) => { if (res.success) setData(res.perfil); })
      .finally(() => setCargando(false));
  }, [user.id]);

  const cambiarTema = (t: Tema) => {
    setTema(t);
    guardaTema(t);
  };

  const conv = data?.convocatoria;
  const dias = diasHasta(conv?.fechaExamen ?? null);
  const cuenta = textoCuentaAtras(dias);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">

      {/* ───────── LA CONVOCATORIA ───────── */}
      <Card pad="lg" elevation="raised" className="relative overflow-hidden">
        <SectionLabel icon={<CalendarClock size={14} />}>La convocatoria</SectionLabel>
        {cargando ? (
          <p className={cx(TEXT.muted)}>Cargando…</p>
        ) : conv?.fechaExamen && cuenta ? (
          <>
            <p className={cx(
              'text-3xl sm:text-4xl font-black tracking-tighter leading-none',
              dias !== null && dias < 0 ? 'text-slate-400' : 'text-indigo-600 dark:text-indigo-400',
            )}>
              {cuenta}
            </p>
            <p className={cx(TEXT.muted, 'mt-2')}>
              {conv.escala ? `${conv.escala} · ` : ''}Examen el <strong className="text-slate-700 dark:text-slate-200">{fechaLarga(conv.fechaExamen)}</strong>
            </p>
            {conv.nota && <p className="text-[11px] text-slate-400 mt-1">{conv.nota}</p>}
          </>
        ) : (
          <p className={cx(TEXT.muted)}>
            Tu academia todavía no ha fijado la fecha del examen. Cuando la ponga, aquí verás la cuenta atrás.
          </p>
        )}
      </Card>

      {/* ───────── LO QUE TE TOCA ─────────
          Hacer visible la programación, más allá de la frase pregunta a
          pregunta (`razonRepaso`/`porQueHoy` en ActiveTest). NO es una
          promesa de sesión: es cuántas preguntas VENCEN cada día, no cuántas
          va a repartir el entrenamiento — eso depende de los cupos y topes
          de `buildSmartSession`. */}
      {data && data.proyeccion.some((d) => d.vencen > 0) && (
        <Card>
          <SectionLabel icon={<ListChecks size={14} />}>Lo que te toca</SectionLabel>
          <div className="grid grid-cols-7 gap-1.5">
            {data.proyeccion.map((d, i) => (
              <div key={d.fecha} className="text-center">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                  {etiquetaDia(d.fecha, i)}
                </p>
                <div className={cx(
                  'rounded-xl py-2 text-sm font-black',
                  d.vencen > 0
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300'
                    : 'bg-slate-50 text-slate-300 dark:bg-slate-900/40 dark:text-slate-700',
                )}>
                  {d.vencen}
                </div>
              </div>
            ))}
          </div>
          <p className={cx(TEXT.muted, 'mt-3')}>
            Cada pregunta vuelve justo cuando tú empiezas a olvidarla, no en un calendario fijo — esto es lo que hay esperando, no cuántas verás de golpe: el entrenamiento reparte cuántas te trae cada vez.
          </p>
        </Card>
      )}

      {/* ───────── MI ACCESO ───────── */}
      {(data?.acceso || data?.pagoDelMes) && (
        <Card>
          <SectionLabel
            icon={data.acceso?.estado === 'suspended' ? <ShieldAlert size={14} className="text-red-500" /> : <ShieldCheck size={14} className="text-emerald-500" />}
          >
            Mi acceso
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {data.acceso && (
              <span className={cx(
                'text-xs font-bold px-2.5 py-1 rounded-lg',
                data.acceso.estado === 'active'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
              )}>
                {data.acceso.estado === 'active' ? 'Acceso activo' : 'Acceso suspendido'}
              </span>
            )}
            {data.pagoDelMes && (
              <span className={cx(
                'text-xs font-bold px-2.5 py-1 rounded-lg first-letter:uppercase',
                data.pagoDelMes.pagado
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
              )}>
                {data.pagoDelMes.pagado
                  ? `${data.pagoDelMes.periodo} pagado`
                  : `${data.pagoDelMes.periodo} sin pagar`}
              </span>
            )}
          </div>
          <p className={cx(TEXT.muted, 'mt-3')}>Lo gestiona tu academia. Si algo no cuadra, háblalo con ella.</p>
        </Card>
      )}

      {/* ───────── MIS GRUPOS ───────── */}
      {data && data.grupos.length > 0 && (
        <Card>
          <SectionLabel icon={<Users size={14} />}>Mis grupos</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {data.grupos.map((g, i) => (
              <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                {g.nombre} <span className="opacity-60 font-medium">· {g.tipo}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* ───────── MIS DATOS ───────── */}
      <Card>
        <SectionLabel icon={<Mail size={14} />}>Mis datos</SectionLabel>
        <p className="text-sm font-bold text-slate-900 dark:text-white break-all">{data?.email ?? user.email ?? '—'}</p>
        <p className={cx(TEXT.muted, 'mt-1')}>Para cambiar el correo o la contraseña, habla con tu academia.</p>
      </Card>

      {/* ───────── AJUSTES ───────── */}
      <Card>
        <SectionLabel icon={<Sun size={14} />}>Tema</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['sistema', 'Sistema', <Monitor key="i" size={14} />],
            ['claro', 'Claro', <Sun key="i" size={14} />],
            ['oscuro', 'Oscuro', <Moon key="i" size={14} />],
          ] as [Tema, string, React.ReactNode][]).map(([id, label, icon]) => (
            <button
              key={id}
              onClick={() => cambiarTema(id)}
              aria-pressed={tema === id}
              className={cx(
                'rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5',
                TAP,
                tema === id ? 'bg-indigo-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
