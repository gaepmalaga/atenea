'use client';

import { useState, useEffect } from 'react';
import { CalendarClock, ShieldCheck, ShieldAlert, Users, Mail, Sun, Moon, Monitor } from 'lucide-react';
import { getMiPerfil } from '@/actions';
import type { MiPerfil as MiPerfilData } from '@/app/actions/perfil';
import { diasHasta, fechaLarga, textoCuentaAtras } from '@/app/lib/convocatoria';
import { leeTema, guardaTema, type Tema } from '@/app/lib/theme';
import { Card, SectionLabel, cx, TEXT, TAP } from '../../../ui';

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
