'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Activity, RefreshCw, HeartPulse, Gauge, XCircle,
  TrendingUp, TrendingDown, Clock, MousePointer2,
} from 'lucide-react';
import { getUserStats, getPhysicalProfile, getMisCajones, getTrainingSwitches, getSimulacros, getActiveTrainingPlan } from '@/actions';
import type { ResumenTema } from '@/app/lib/question-scheduler';
import type { ResumenSimulacros } from '@/app/lib/simulacros';
import { CNP_SCORING } from '@/app/lib/scoring';
import { Card, StatTile, SectionLabel, EmptyState, cx, TEXT } from '../../../ui';
import {
  readMaxPullups,
  type StatsSummary,
  type TestResultRow,
  type PhysicalProfile,
  HESITATION_THRESHOLD,
} from '@/app/lib/stats';

type RecentItem = TestResultRow & { created_at?: string | null };
type UserStats = StatsSummary & { lastItems: RecentItem[] };

interface StatsPanelProps {
  user: { id: string };
}

const nota = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const seg = (ms: number | null) => {
  if (!ms || ms <= 0) return null;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} s` : `${Math.round(s)} s`;
};

export default function StatsPanel({ user }: StatsPanelProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [physProfile, setPhysProfile] = useState<PhysicalProfile | null>(null);
  const [cajones, setCajones] = useState<ResumenTema[] | null>(null);
  const [simulacros, setSimulacros] = useState<ResumenSimulacros | null>(null);
  // El KPI físico solo tiene sentido si el alumno lleva las físicas CON IA: si
  // la academia apagó el interruptor, o si tiene un plan de un preparador (de
  // grupo o individual), no mete marcas para el modelo. `true` por defecto.
  const [fisicoIA, setFisicoIA] = useState(true);
  const [planEsDePersona, setPlanEsDePersona] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, physRes, cajonesRes, switchesRes, simRes, planRes] = await Promise.all([
        getUserStats(),
        getPhysicalProfile(),
        getMisCajones(),
        getTrainingSwitches(),
        getSimulacros(),
        getActiveTrainingPlan(),
      ]);
      if (statsRes.success) setStats(statsRes.stats);
      if (physRes.success) setPhysProfile(physRes.data);
      if (cajonesRes.success) setCajones(cajonesRes.temas);
      if (switchesRes.success) setFisicoIA(switchesRes.switches.ai);
      if (simRes.success) setSimulacros(simRes.data);
      if (planRes.success && planRes.plan) {
        setPlanEsDePersona(planRes.plan.origen === 'grupo' || planRes.plan.plan_data?.source === 'entrenador');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user.id]);

  // Cuánto del temario tiene tocado, ponderado por caja.
  const dominioGlobal = useMemo(() => {
    const conBanco = (cajones ?? []).filter((t) => t.total > 0);
    if (conBanco.length === 0) return null;
    const total = conBanco.reduce((a, t) => a + t.total, 0);
    const ponderado = conBanco.reduce((a, t) => a + (t.progreso / 100) * t.total, 0);
    return total > 0 ? Math.round((ponderado / total) * 100) : null;
  }, [cajones]);

  if (loading || !stats) {
    return <div className="p-20 text-center animate-pulse text-slate-500 dark:text-slate-400">Sincronizando expediente…</div>;
  }

  const { winRate, answered, blank, firmeza } = stats;
  const contestadasFirmeza = firmeza.firmes + firmeza.titubeantes + firmeza.normales;
  const mostrarFisico = fisicoIA && !planEsDePersona;
  const maxPullups = readMaxPullups(physProfile);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">

      {/* ───────── ¿APROBARÍA? ───────── */}
      <Card pad="lg" elevation="raised" className="relative overflow-hidden">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1')}>¿Aprobaría?</p>
            <p className={cx(TEXT.muted)}>
              Media de tus simulacros, con la nota de la convocatoria. Se aprueba con {CNP_SCORING.passMark}.
            </p>
          </div>
          <button
            onClick={loadData}
            aria-label="Recargar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {simulacros && simulacros.media !== null ? (
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

            <div className="grid grid-cols-3 gap-2 mt-5">
              <StatTile label="Simulacros" value={simulacros.simulacros.length} tone="neutral" />
              <StatTile label="Mejor nota" value={simulacros.mejor} tone="success" />
              <StatTile
                label="Último"
                value={simulacros.simulacros[0] ? Math.round(simulacros.simulacros[0].nota * 100) / 100 : null}
                tone={simulacros.simulacros[0]?.aprobado ? 'success' : 'danger'}
              />
            </div>

            {/* Racha de simulacros: verde aprobado, rojo suspenso. El más reciente a la derecha. */}
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
            <p className={cx(TEXT.muted)}>
              Aún no has hecho ningún simulacro. Cuando hagas uno, aquí verás si aprobarías y si vas mejorando.
            </p>
          </div>
        )}
      </Card>

      {/* ───────── DOMINIO DEL TEMARIO ───────── */}
      {cajones && cajones.some((t) => t.total - t.nuevas > 0) && (
        <Card pad="none">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
            <div>
              <SectionLabel icon={<Gauge size={14} />} className="mb-1">Dominio del temario</SectionLabel>
              <p className={cx(TEXT.muted)}>
                El entrenamiento reparte según esto: repasa lo tierno, consolida lo que cuaja.
              </p>
            </div>
            {dominioGlobal !== null && (
              <div className="text-right shrink-0">
                <p className="text-2xl font-black text-slate-900 dark:text-white leading-none tabular-nums">{dominioGlobal}%</p>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">dominado</p>
              </div>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {cajones.filter((t) => t.total - t.nuevas > 0).map((t) => (
              <div key={t.topic} className="p-3 sm:p-4">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{t.topic}</p>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">{t.progreso}%</span>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(t.dominadas / t.total) * 100}%` }} />
                  <div className="h-full bg-sky-500" style={{ width: `${(t.consolidando / t.total) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${(t.aprendiendo / t.total) * 100}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {[
                    t.dominadas > 0 && `${t.dominadas} ${t.dominadas === 1 ? 'dominada' : 'dominadas'}`,
                    t.consolidando > 0 && `${t.consolidando} consolidando`,
                    t.aprendiendo > 0 && `${t.aprendiendo} en aprendizaje`,
                    t.nuevas > 0 && `${t.nuevas} sin empezar`,
                    t.atascadas > 0 && `${t.atascadas} ${t.atascadas === 1 ? 'atascada' : 'atascadas'}`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ───────── CÓMO RESPONDES + FÍSICO ───────── */}
      <div className={cx('grid grid-cols-1 gap-4', mostrarFisico && 'md:grid-cols-2')}>
        <Card>
          <SectionLabel icon={<MousePointer2 size={14} />}>Cómo respondes</SectionLabel>
          {contestadasFirmeza === 0 ? (
            <p className={cx(TEXT.muted)}>
              Se calcula durante los tests, con el tiempo que tardas y si cambias de opción.
            </p>
          ) : (
            <>
              <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3">
                <div className="bg-emerald-500" style={{ width: `${(firmeza.firmes / contestadasFirmeza) * 100}%` }} title={`${firmeza.firmes} firmes`} />
                <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${(firmeza.normales / contestadasFirmeza) * 100}%` }} title={`${firmeza.normales} normales`} />
                <div className="bg-amber-500" style={{ width: `${(firmeza.titubeantes / contestadasFirmeza) * 100}%` }} title={`${firmeza.titubeantes} titubeantes`} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />{firmeza.firmes} firmes</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />{firmeza.normales} normales</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />{firmeza.titubeantes} titubeantes</span>
              </div>
              {seg(firmeza.medianaMs) && (
                <p className={cx(TEXT.muted, 'mt-3 flex items-center gap-1.5')}>
                  <Clock size={12} /> Tu tiempo habitual por pregunta: <strong className="text-slate-700 dark:text-slate-200">{seg(firmeza.medianaMs)}</strong>
                </p>
              )}
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-2">
                Un acierto titubeante no cuenta como dominio: el método lo repasa antes.
              </p>
            </>
          )}
        </Card>

        {/* KPI físico — solo con plan de IA. */}
        {mostrarFisico && (
          <div className="bg-indigo-600 text-white p-5 sm:p-6 rounded-2xl shadow-xl flex flex-col justify-between">
            <div className="flex justify-between items-center">
              <HeartPulse size={22} />
              <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded">Estado físico</span>
            </div>
            <div className="mt-4">
              {maxPullups === null ? (
                <>
                  <p className="text-xl font-black mb-1 opacity-70">Sin datos</p>
                  <p className="text-xs font-bold opacity-80 uppercase">Haz el test en Prep. Física</p>
                </>
              ) : (
                <>
                  <p className="text-3xl sm:text-4xl font-black mb-1 tabular-nums">{maxPullups}</p>
                  <p className="text-xs font-bold opacity-80 uppercase">Dominadas máximas</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ───────── ACIERTO + HISTORIAL ───────── */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Acierto" value={answered === 0 ? null : winRate} suffix="%" tone="brand" />
        <StatTile label="Contestadas" value={answered === 0 ? null : answered} tone="neutral" />
        <StatTile label="En blanco" value={blank} tone="warning" />
      </div>

      <Card pad="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SectionLabel icon={<Activity size={14} />} className="mb-0">Historial reciente</SectionLabel>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {stats.lastItems?.map((item, i) => (
            <div key={i} className="p-3 sm:p-4 flex items-start gap-3">
              <span
                className={cx('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0', item.is_correct ? 'bg-emerald-500' : 'bg-red-500')}
                title={item.is_correct ? 'Acertada' : 'Fallada'}
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                  {(item.question_text ?? 'Pregunta no disponible').replace('[FLASHCARD] ', '')}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  {item.topic && (
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{item.topic}</span>
                  )}
                  {(item.response_time_ms ?? 0) > 0 && (
                    <span className="text-[10px] font-mono text-indigo-500 font-bold tabular-nums">{((item.response_time_ms ?? 0) / 1000).toFixed(1)}s</span>
                  )}
                  {(item.option_changes ?? 0) >= HESITATION_THRESHOLD && (
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1">
                      <MousePointer2 size={10} /> Dudó
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums ml-auto shrink-0">
                    {item.created_at ? new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {(!stats.lastItems || stats.lastItems.length === 0) && (
            <EmptyState
              title="Sin historial"
              hint="Aquí aparecerá cada pregunta que contestes, con el tiempo que te costó."
              icon={<Activity size={30} />}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
