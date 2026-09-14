'use client';

import { useState, useEffect } from 'react';
import {
  Flame, Map as MapIcon, Layers, XCircle, TrendingUp, TrendingDown,
  Activity, Sparkles,
} from 'lucide-react';
import { getMiEvolucion } from '@/actions';
import type { MiEvolucion as MiEvolucionData, PuntoCurva } from '@/app/actions/evolucion';
import { CNP_SCORING } from '@/app/lib/scoring';
import { Card, SectionLabel, EmptyState, cx, TEXT } from '../../../ui';

interface MiEvolucionProps {
  user: { id: string };
}

const nota = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fechaCorta = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
};

/** Verde = dominado, índigo = en camino, ámbar = queda trabajo. Mismo umbral en el mapa y en la barra resumen. */
function colorTema(pct: number): { bg: string; bar: string; ink: string } {
  if (pct >= 70) return { bg: 'bg-emerald-50 dark:bg-emerald-900/15', bar: 'bg-emerald-500', ink: 'text-emerald-700 dark:text-emerald-400' };
  if (pct >= 40) return { bg: 'bg-indigo-50 dark:bg-indigo-900/15', bar: 'bg-indigo-500', ink: 'text-indigo-700 dark:text-indigo-400' };
  return { bg: 'bg-amber-50 dark:bg-amber-900/15', bar: 'bg-amber-500', ink: 'text-amber-700 dark:text-amber-400' };
}

/** La curva diaria, dibujada a mano en SVG: sin librería externa que pueda
 *  fallar en cargar, y es lo único que hace falta para dos trazos y un área. */
function CurvaSVG({ puntos }: { puntos: PuntoCurva[] }) {
  const W = 560, H = 170, padX = 4, padTop = 10, padBottom = 6;
  const max = Math.max(...puntos.map((p) => p.dominadas), 1);
  const stepX = puntos.length > 1 ? (W - padX * 2) / (puntos.length - 1) : 0;
  const pts = puntos.map((p, i): [number, number] => [
    padX + i * stepX,
    padTop + (H - padTop - padBottom) * (1 - p.dominadas / max),
  ]);
  const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const areaPath = last ? `${linePath} L${last[0].toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z` : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[170px] block" role="img" aria-label="Preguntas dominadas por día">
      <defs>
        <linearGradient id="curvaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity=".25" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
        </linearGradient>
      </defs>
      {last && <path d={areaPath} fill="url(#curvaFill)" />}
      <path d={linePath} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last[0]} cy={last[1]} r="5" className="fill-indigo-600 stroke-white dark:stroke-slate-900" strokeWidth="2.5" />}
    </svg>
  );
}

const INTENSIDAD = [
  'bg-slate-100 dark:bg-slate-800',
  'bg-indigo-200 dark:bg-indigo-900/60',
  'bg-indigo-400 dark:bg-indigo-700',
  'bg-indigo-600 dark:bg-indigo-500',
  'bg-indigo-800 dark:bg-indigo-300',
];
function nivelActividad(n: number): string {
  if (n === 0) return INTENSIDAD[0];
  if (n < 10) return INTENSIDAD[1];
  if (n < 25) return INTENSIDAD[2];
  if (n < 45) return INTENSIDAD[3];
  return INTENSIDAD[4];
}

export default function MiEvolucion({ user }: MiEvolucionProps) {
  const [data, setData] = useState<MiEvolucionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMiEvolucion()
      .then((res) => { if (res.success) setData(res.data); })
      .finally(() => setLoading(false));
  }, [user.id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-40 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
      </div>
    );
  }

  if (!data || !data.fechaInicio) {
    return (
      <EmptyState
        title="Todavía no hay nada que contar"
        hint="En cuanto entrenes tu primera pregunta, aquí empieza tu historia: qué dominas, cómo evolucionas y si aprobarías hoy."
        icon={<Sparkles size={32} />}
      />
    );
  }

  const actividadPorDia = new Map(data.actividad.map((a) => [a.fecha, a.respuestas]));
  const ultimoPunto = data.curva[data.curva.length - 1]?.dominadas ?? 0;
  const puntoHaceUnaSemana = data.curva.length > 7 ? data.curva[data.curva.length - 8].dominadas : data.curva[0]?.dominadas ?? 0;
  const deltaSemana = ultimoPunto - puntoHaceUnaSemana;

  const resumenSegmentos = [
    { valor: data.resumenBanco.dominadas, color: 'bg-emerald-500' },
    { valor: data.resumenBanco.enCamino, color: 'bg-indigo-500' },
    { valor: data.resumenBanco.vistasSinAsentar, color: 'bg-slate-300 dark:bg-slate-600' },
    { valor: data.resumenBanco.sinTocar, color: 'bg-slate-100 dark:bg-slate-800' },
  ];

  const { simulacros } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">

      {/* ───────── LA HISTORIA, DE UN VISTAZO ───────── */}
      <Card tone="brand" pad="lg" elevation="raised" className="relative overflow-hidden">
        <div className="absolute -top-24 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <p className={cx(TEXT.label, 'text-indigo-200')}>Tu evolución</p>
            {data.racha > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider bg-white/15 px-2 py-0.5 rounded-full">
                <Flame size={12} /> {data.racha} {data.racha === 1 ? 'día' : 'días'} seguidos
              </span>
            )}
          </div>
          <h2 className="text-2xl sm:text-3xl font-black leading-tight tracking-tight mb-1">
            Empezaste el {fechaCorta(data.fechaInicio)}
          </h2>
          <p className="text-indigo-100 text-sm font-medium mb-5">
            {data.diasEnOposicion} {data.diasEnOposicion === 1 ? 'día' : 'días'} en la oposición. El sistema ha registrado cada respuesta desde el primer día para construir esto.
          </p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <p className="text-xl sm:text-2xl font-black leading-none tabular-nums">{data.resumenBanco.total}</p>
              <p className="text-[10px] sm:text-[11px] text-indigo-100 font-semibold mt-1 leading-tight">a tu disposición</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <p className="text-xl sm:text-2xl font-black leading-none tabular-nums">{data.resumenBanco.total - data.resumenBanco.sinTocar}</p>
              <p className="text-[10px] sm:text-[11px] text-indigo-100 font-semibold mt-1 leading-tight">ya las has visto</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-2.5">
              <p className="text-xl sm:text-2xl font-black leading-none tabular-nums">{data.resumenBanco.dominadas}</p>
              <p className="text-[10px] sm:text-[11px] text-indigo-100 font-semibold mt-1 leading-tight">las tienes dominadas</p>
            </div>
          </div>
        </div>
      </Card>

      {/* ───────── EL MAPA DE TU TEMARIO ───────── */}
      <Card>
        <SectionLabel icon={<MapIcon size={14} />}>El mapa de tu temario</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-3')}>
          {data.resumenBanco.total} preguntas en total. Verde es tuyo, ámbar es donde tienes que meter horas.
        </p>
        <div className="flex h-2.5 rounded-full overflow-hidden mb-3">
          {resumenSegmentos.map((s, i) => (
            <div key={i} className={s.color} style={{ flexBasis: `${(s.valor / Math.max(1, data.resumenBanco.total)) * 100}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1.5" /><b className="text-slate-900 dark:text-white">{data.resumenBanco.dominadas}</b> dominadas</span>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className="inline-block w-2 h-2 rounded-sm bg-indigo-500 mr-1.5" /><b className="text-slate-900 dark:text-white">{data.resumenBanco.enCamino}</b> en camino</span>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className="inline-block w-2 h-2 rounded-sm bg-slate-300 dark:bg-slate-600 mr-1.5" /><b className="text-slate-900 dark:text-white">{data.resumenBanco.vistasSinAsentar}</b> vistas, sin asentar</span>
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300"><span className="inline-block w-2 h-2 rounded-sm bg-slate-100 dark:bg-slate-800 mr-1.5" /><b className="text-slate-900 dark:text-white">{data.resumenBanco.sinTocar}</b> sin tocar</span>
        </div>

        {data.mapaTemas.filter((t) => t.total > 0).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {data.mapaTemas.filter((t) => t.total > 0).map((t) => {
              const c = colorTema(t.progreso);
              return (
                <div key={t.topic} className={cx('relative overflow-hidden rounded-xl p-3', c.bg)}>
                  <div className={cx('absolute left-0 bottom-0 w-full opacity-20', c.bar)} style={{ height: `${t.progreso}%` }} />
                  <p className="relative text-[11px] font-bold text-slate-800 dark:text-slate-100 leading-snug mb-3 line-clamp-2 min-h-[28px]">{t.topic}</p>
                  <p className={cx('relative text-lg font-black', c.ink)}>{t.progreso}<span className="text-[10px] font-bold text-slate-400 ml-0.5">%</span></p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ───────── EL DESGLOSE, CON CONTEXTO ───────── */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-emerald-50 dark:bg-emerald-900/15 p-4">
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{data.desglose.dominadas}</p>
          <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mt-1.5">Dominadas</p>
          <p className={cx(TEXT.muted, 'mt-1.5')}>Te las puedes saltar en un examen real, hoy mismo.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-indigo-50 dark:bg-indigo-900/15 p-4">
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{data.desglose.enCamino}</p>
          <p className="text-[11px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-400 mt-1.5">En camino</p>
          <p className={cx(TEXT.muted, 'mt-1.5')}>A 1-2 aciertos seguidos de darlas por aprendidas.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/15 p-4">
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{data.desglose.seResisten}</p>
          <p className="text-[11px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400 mt-1.5">Se te resisten</p>
          <p className={cx(TEXT.muted, 'mt-1.5')}>
            {data.desglose.temaQueMasResiste
              ? <>{data.desglose.temaQueMasResiste.veces} son del mismo tema: <b className="text-slate-700 dark:text-slate-200">{data.desglose.temaQueMasResiste.topic}</b>. Ahí está tu techo.</>
              : 'Ninguna todavía — no hay ninguna que se resista de verdad.'}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-rose-50 dark:bg-rose-900/15 p-4">
          <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{data.desglose.evitas}</p>
          <p className="text-[11px] font-black uppercase tracking-wide text-rose-700 dark:text-rose-400 mt-1.5">Las evitas</p>
          <p className={cx(TEXT.muted, 'mt-1.5')}>Nunca te has atrevido a contestarlas. Por algo será.</p>
        </div>
      </div>

      {/* ───────── ¿APROBARÍA? ───────── */}
      <Card pad="lg" elevation="raised">
        <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1')}>¿Aprobaría?</p>
        <p className={cx(TEXT.muted, 'mb-4')}>
          Media de tus simulacros, con la nota de la convocatoria. Se aprueba con {CNP_SCORING.passMark}.
        </p>
        {simulacros.media !== null ? (
          <>
            <div className="flex items-end gap-4 flex-wrap">
              <p className={cx(
                'text-5xl font-black leading-none tracking-tighter',
                simulacros.media >= CNP_SCORING.passMark ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
              )}>
                {nota(simulacros.media)}
              </p>
              <span className="text-slate-400 dark:text-slate-500 text-lg font-black mb-1">/ {CNP_SCORING.scale}</span>
              {simulacros.tendencia && simulacros.tendencia !== 'estable' && (
                <span className={cx(
                  'inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2 py-1 rounded-full mb-1.5',
                  simulacros.tendencia === 'sube'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
                )}>
                  {simulacros.tendencia === 'sube' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {simulacros.tendencia === 'sube' ? 'subiendo' : 'bajando'}
                </span>
              )}
            </div>
            {simulacros.simulacros.length > 1 && (
              <div className="flex items-end gap-1 h-10 mt-4">
                {[...simulacros.simulacros].reverse().slice(-12).map((s) => (
                  <div
                    key={s.examId}
                    title={`${nota(s.nota)} · ${s.fecha ? new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : ''}`}
                    className={cx('flex-1 rounded-sm min-w-[6px]', s.aprobado ? 'bg-emerald-500' : 'bg-red-400')}
                    style={{ height: `${Math.max(12, (s.nota / CNP_SCORING.scale) * 100)}%` }}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 py-2">
            <XCircle size={20} className="text-slate-300 dark:text-slate-600 shrink-0" />
            <p className={cx(TEXT.muted)}>Aún no has hecho ningún simulacro. Cuando hagas uno, aquí verás si aprobarías.</p>
          </div>
        )}
      </Card>

      {/* ───────── CÓMO HAS CRECIDO ───────── */}
      <Card>
        <SectionLabel icon={<TrendingUp size={14} />}>Cómo has crecido</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-3')}>Preguntas dominadas de verdad, día a día, desde que empezaste.</p>
        <div className="relative">
          <div className="absolute top-0 right-0 text-right">
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none tabular-nums">{ultimoPunto}</p>
            {deltaSemana !== 0 && (
              <p className={cx('text-[11px] font-black', deltaSemana > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {deltaSemana > 0 ? '▲' : '▼'} {deltaSemana > 0 ? '+' : ''}{deltaSemana} esta semana
              </p>
            )}
          </div>
          <CurvaSVG puntos={data.curva} />
        </div>
        <div className="flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1">
          <span>{fechaCorta(data.curva[0].fecha)}</span>
          <span>Hoy</span>
        </div>
      </Card>

      {/* ───────── CADA DÍA QUE HAS ENTRADO ───────── */}
      <Card>
        <SectionLabel icon={<Activity size={14} />}>Cada día que has entrado</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-3')}>
          {data.diasEnOposicion} {data.diasEnOposicion === 1 ? 'día' : 'días'} desde tu primer test. Esto es constancia, no suerte.
        </p>
        <div className="overflow-x-auto pb-1">
          <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max">
            {data.curva.map((p) => (
              <div
                key={p.fecha}
                title={`${p.fecha}: ${actividadPorDia.get(p.fecha) ?? 0} preguntas`}
                className={cx('w-[13px] h-[13px] rounded-sm', nivelActividad(actividadPorDia.get(p.fecha) ?? 0))}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-slate-400 dark:text-slate-500">
          Menos {INTENSIDAD.map((c, i) => <span key={i} className={cx('w-2.5 h-2.5 rounded-sm', c)} />)} Más
        </div>
      </Card>

      {/* ───────── CIERRE DE CONFIANZA ───────── */}
      <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
          <Layers size={18} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <p className={cx(TEXT.muted, 'leading-relaxed')}>
          <strong className="text-slate-900 dark:text-white">El sistema sabe exactamente dónde estás</strong> y qué te falta para llegar. Cada sesión de hoy se elige pensando en {data.desglose.seResisten > 0 ? `las ${data.desglose.seResisten} que se te resisten y en ` : ''}las {data.desglose.enCamino} que están a un paso — no en repetir lo que ya dominas.
        </p>
      </div>
    </div>
  );
}
