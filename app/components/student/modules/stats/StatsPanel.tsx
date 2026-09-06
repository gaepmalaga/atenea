'use client';

import { useState, useEffect } from 'react';
import {
  Shield, Crown, Medal, Activity, RefreshCw, HeartPulse, Brain, Zap, MousePointer2, Gauge
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getUserStats, getPhysicalProfile, getMisCajones } from '@/actions';
import type { ResumenTema } from '@/app/lib/question-scheduler';
import { EmptyState } from '../../../ui';
import {
  rankFor,
  nextRankAfter,
  progressToNextRank,
  readMaxPullups,
  ERROR_TYPES,
  type StatsSummary,
  type TestResultRow,
  type PhysicalProfile,
  HESITATION_THRESHOLD,
  type Rank,
} from '@/app/lib/stats';

/** Fila del historial: lo que devuelve getUserStats tras aplanar el join. */
type RecentItem = TestResultRow & { created_at?: string | null };

type UserStats = StatsSummary & { lastItems: RecentItem[] };

interface StatsPanelProps {
  user: { id: string };
}

// Solo presentacion: los umbrales y el calculo de progreso viven en
// app/lib/stats.ts, donde se pueden testear.
const RANK_STYLE: Record<Rank['id'], { icon: LucideIcon; color: string; bg: string }> = {
  cadet:        { icon: Shield, color: 'text-slate-500 dark:text-slate-400',  bg: 'bg-slate-100 dark:bg-slate-800' },
  officer:      { icon: Medal,  color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  subinspector: { icon: Medal,  color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
  inspector:    { icon: Crown,  color: 'text-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
};

const ERROR_LABEL: Record<string, string> = {
  olvido: 'Olvido',
  trampa: 'Trampas',
  desconocimiento: 'Lagunas',
  fallo_procesamiento: 'Lectura',
};

export default function StatsPanel({ user }: StatsPanelProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [physProfile, setPhysProfile] = useState<PhysicalProfile | null>(null);
  const [cajones, setCajones] = useState<ResumenTema[] | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, physRes, cajonesRes] = await Promise.all([
        getUserStats(),
        getPhysicalProfile(),
        getMisCajones(),
      ]);
      if (statsRes.success) setStats(statsRes.stats);
      if (physRes.success) setPhysProfile(physRes.data);
      if (cajonesRes.success) setCajones(cajonesRes.temas);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user.id]);

  if (loading || !stats) return <div className="p-20 text-center animate-pulse text-slate-500">Sincronizando expediente...</div>;

  // Las metricas llegan ya agregadas del servidor, sobre la muestra completa.
  // Antes se calculaban aqui sobre las 5 ultimas preguntas y se dividian entre
  // el total de hasta 100: numerador y denominador de muestras distintas.
  const { winRate, answered, blank, avgTimeMs, timedCount, uncertaintyIndex, changesCount, errorBreakdown, taggedErrors } = stats;

  const currentRank = rankFor(winRate);
  const nextRank = nextRankAfter(currentRank);
  const rankStyle = RANK_STYLE[currentRank.id];
  const RankIcon = rankStyle.icon;
  const ascentProgress = progressToNextRank(winRate);

  const speedLabel = timedCount === 0
    ? 'Sin datos'
    : avgTimeMs < 10000 ? 'Francotirador' : avgTimeMs < 30000 ? 'Táctico' : 'Analista Lento';

  const maxPullups = readMaxPullups(physProfile);

  // El hueco para que MobileNav no tape el final ya lo reserva `<main>` en
  // StudentDashboard; un pb-20 aqui encima solo sumaba espacio en blanco de
  // mas al final de la pantalla.
  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-4 animate-in fade-in duration-700">
      
      {/* HEADER: RANGO Y STATUS QUO */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/*
          El icono de rango llevaba `w-40 h-40` (160px) y el titulo
          `text-5xl` (48px) fijos en todos los tamaños: pensados para el
          `md:flex-row` de escritorio, en movil (`flex-col`, apilado)
          ocupaban una fila entera cada uno solo por el tamaño. Se escala
          desde movil y crece a partir de `sm`/`md`.
        */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl relative overflow-hidden group">
            <div className={`absolute -right-20 -top-20 w-64 h-64 blur-[100px] opacity-20 rounded-full ${currentRank.id === 'inspector' ? 'bg-amber-500' : 'bg-indigo-600'}`}></div>

            <div className="flex flex-col md:flex-row items-center gap-5 sm:gap-8 md:gap-10 relative z-10">
                <div className={`w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-3xl flex items-center justify-center shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500 ${rankStyle.bg}`}>
                    <RankIcon size={44} className={`${rankStyle.color} drop-shadow-2xl sm:hidden`}/>
                    <RankIcon size={64} className={`${rankStyle.color} drop-shadow-2xl hidden sm:block md:hidden`}/>
                    <RankIcon size={80} className={`${rankStyle.color} drop-shadow-2xl hidden md:block`}/>
                </div>
                <div className="flex-1 text-center md:text-left">
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter mb-2 italic">
                        {currentRank.label.toUpperCase()}
                    </h2>
                    {/* El denominador es el MISMO del que sale el porcentaje
                        (regla 8). `winRate` pasó a calcularse sobre las
                        contestadas —un blanco ya no cuenta como fallo— y aquí
                        seguía pintándose sobre el total: dos muestras
                        distintas en la misma frase. Los blancos se dicen
                        aparte, que es donde significan algo. */}
                    <p className="text-slate-500 font-bold flex items-center justify-center md:justify-start gap-2 uppercase text-xs tracking-[0.2em]">
                        <Zap size={14} className="text-yellow-500"/> Efectividad: {winRate}% en {answered} {answered === 1 ? 'operación' : 'operaciones'}
                        {blank > 0 && (
                            <span className="text-slate-500 dark:text-slate-400 normal-case tracking-normal font-medium">
                                (+{blank} en blanco)
                            </span>
                        )}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black text-slate-500 border border-slate-200 dark:border-slate-700">
                            ID: {user.id.substring(0,8).toUpperCase()}
                        </div>
                        <div className="px-4 py-2 bg-indigo-500 text-white rounded-xl text-[10px] font-black shadow-lg shadow-indigo-500/20">
                            {nextRank
                              ? `PROGRESO A ${nextRank.label.toUpperCase()}: ${ascentProgress}%`
                              : 'RANGO MÁXIMO ALCANZADO'}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* MÉTRICA DE VELOCIDAD (EL "TIEMPO ES VIDA") */}
        <div className="bg-slate-900 text-white rounded-2xl sm:rounded-3xl p-6 sm:p-8 flex flex-col justify-center items-center text-center border-b-8 border-indigo-600 shadow-xl">
            <Gauge size={40} className="text-indigo-400 mb-4 animate-pulse" />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Perfil de Respuesta</p>
            <h4 className="text-2xl font-black mb-2">{speedLabel}</h4>
            <div className="text-3xl sm:text-4xl font-black text-indigo-400">
                {timedCount === 0
                  ? <span className="text-lg text-slate-500">Sin medir</span>
                  : <>{(avgTimeMs / 1000).toFixed(1)}<span className="text-lg text-white">s</span></>}
            </div>
        </div>
      </div>

      {/* SECCIÓN 2: EL "CEREBRO" (ATENEA MIND ANALYTICS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

          {/* INDICE DE INCERTIDUMBRE (DUDAS) */}
          <div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
              <div className="flex justify-between items-start mb-6">
                  <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MousePointer2 size={16} className="text-purple-500"/> Índice de Incertidumbre
                  </h3>
              </div>
              {/* Un MEDIDOR con marcador, no una barra que se rellena.
                  
                  Antes era un relleno de ancho `uncertaintyIndex`% sobre un
                  gradiente verde→rojo. Con índice 0 —que es el MEJOR valor— no se
                  pintaba nada y quedaba idéntica a "no hay datos", diciendo justo
                  lo contrario que el texto de debajo. La escala se ve siempre y el
                  marcador dice dónde estás. */}
              <div className="relative h-4 rounded-full mb-3 bg-gradient-to-r from-emerald-500 via-yellow-500 to-red-500">
                  {changesCount === 0 ? (
                      <div className="absolute inset-0 rounded-full bg-slate-100 dark:bg-slate-800" />
                  ) : (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white dark:bg-slate-900 border-[3px] border-slate-900 dark:border-white shadow-lg transition-all duration-1000"
                        style={{ left: `${Math.max(3, Math.min(97, uncertaintyIndex))}%` }}
                      />
                  )}
              </div>

              <div className="flex justify-between text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                  <span>Firme</span>
                  <span>Dudoso</span>
              </div>

              {changesCount > 0 && (
                  <p className="text-3xl font-black text-slate-900 dark:text-white mb-1 leading-none">
                      {uncertaintyIndex}
                      <span className="text-base text-slate-500 dark:text-slate-400">/100</span>
                  </p>
              )}

              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  {changesCount === 0
                    ? "Aún no hay datos de marcación. Se registran durante los tests."
                    : uncertaintyIndex < 20
                      ? `Decisión firme sobre ${changesCount} respuestas. Alta confianza al marcar.`
                      : `Inseguridad detectada en ${changesCount} respuestas. Tiendes a cambiar de opción antes de confirmar.`}
              </p>
          </div>

          {/* DIAGNÓSTICO DE ERRORES (TAXONOMÍA) */}
          <div className="bg-white dark:bg-slate-900 p-5 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6">
                  <Brain size={16} className="text-red-500"/> Origen de tus Fallos
              </h3>
              <div className="space-y-3">
                  {ERROR_TYPES.map(type => {
                      const count = errorBreakdown[type] ?? 0;
                      // Denominador: fallos ETIQUETADOS, que es lo que suma el
                      // desglose. Antes se dividia entre todos los fallos de las
                      // 5 ultimas y las barras no sumaban el 100%.
                      const percentage = taggedErrors === 0 ? 0 : (count / taggedErrors) * 100;
                      return (
                        <div key={type}>
                            <div className="flex justify-between text-[10px] font-black uppercase mb-1 text-slate-500">
                                <span>{ERROR_LABEL[type]}</span>
                                <span>{count}</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <div className="h-full bg-slate-900 dark:bg-white rounded-full transition-all duration-700" style={{ width: `${percentage}%` }}></div>
                            </div>
                        </div>
                      );
                  })}
                  {taggedErrors === 0 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-2">
                        Aún no has etiquetado ningún fallo. Se pide al fallar en modo entrenamiento.
                    </p>
                  )}
              </div>
          </div>

          {/* KPI FÍSICO RÁPIDO */}
          <div className="bg-indigo-600 text-white p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl flex flex-col justify-between">
              <div className="flex justify-between items-center">
                  <HeartPulse size={24}/>
                  <span className="text-[10px] font-black bg-white/20 px-2 py-1 rounded">ESTADO FÍSICO</span>
              </div>
              <div>
                  {maxPullups === null ? (
                    <>
                      <p className="text-2xl font-black mb-1 opacity-70">Sin datos</p>
                      <p className="text-xs font-bold opacity-80 uppercase">Haz el test en Prep. Física</p>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl sm:text-4xl font-black mb-1">{maxPullups}</p>
                      <p className="text-xs font-bold opacity-80 uppercase">Dominadas Máximas</p>
                    </>
                  )}
              </div>
          </div>
      </div>

      {/* DOMINIO DEL TEMARIO (P10): cuántas preguntas de cada tema tiene el
          alumno en cada cajón. Es la «curva de aprendizaje»: la barra crece a
          medida que las preguntas pasan de nuevas a dominadas. */}
      {cajones && cajones.some((t) => t.total > 0) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Gauge size={15} className="shrink-0" /> Dominio del temario
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              El entrenamiento reparte las preguntas según esto: repasa lo tierno, consolida lo que va cuajando.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {cajones.filter((t) => t.total > 0).map((t) => (
              <div key={t.topic} className="p-3 sm:p-4">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{t.topic}</p>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{t.progreso}%</span>
                </div>
                {/* Barra apilada: dominadas + consolidando + en aprendizaje sobre el total. */}
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width: `${(t.dominadas / t.total) * 100}%` }} />
                  <div className="h-full bg-sky-500" style={{ width: `${(t.consolidando / t.total) * 100}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${(t.aprendiendo / t.total) * 100}%` }} />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {t.dominadas > 0 && `${t.dominadas} dominadas · `}
                  {t.consolidando > 0 && `${t.consolidando} consolidando · `}
                  {t.aprendiendo > 0 && `${t.aprendiendo} en aprendizaje · `}
                  {t.nuevas > 0 && `${t.nuevas} sin empezar`}
                  {t.atascadas > 0 && ` · ${t.atascadas} atascadas`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECCIÓN 3: HISTORIAL */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2">
              <h3 className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 min-w-0">
                  <Activity size={15} className="shrink-0"/> <span className="truncate">Historial reciente</span>
              </h3>
              <button
                onClick={loadData}
                aria-label="Recargar"
                className="flex items-center justify-center w-11 h-11 -mr-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-all shrink-0"
              >
                  <RefreshCw size={14} className="text-slate-500 dark:text-slate-400" />
              </button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {stats.lastItems?.map((item: RecentItem, i: number) => (
                  <div key={i} className="p-3 sm:p-4 flex items-start gap-3">
                      {/* Un círculo de 12px en vez del recuadro de 48px: en el
                          móvil ese recuadro se llevaba una cuarta parte del
                          ancho de la fila y dejaba el enunciado en dos palabras. */}
                      <span
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${item.is_correct ? 'bg-emerald-500' : 'bg-red-500'}`}
                        title={item.is_correct ? 'Acertada' : 'Fallada'}
                      />

                      <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                              {(item.question_text ?? 'Pregunta no disponible').replace('[FLASHCARD] ', '')}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                              {/* Sin `truncate`: el tema estaba limitado al 60% de una
                                  fila estrecha y le faltaban 254px, o sea que de "El
                                  Derecho: concepto y acepciones. Norma juridica…" se
                                  leian tres palabras. La fila ya envuelve
                                  (`flex-wrap`), asi que dejarlo pasar a la linea
                                  siguiente no descoloca nada. */}
                              {item.topic && (
                                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{item.topic}</span>
                              )}
                              {(item.response_time_ms ?? 0) > 0 && (
                                  <span className="text-[10px] font-mono text-indigo-500 font-bold tabular-nums">{((item.response_time_ms ?? 0) / 1000).toFixed(1)}s</span>
                              )}
                              {(item.option_changes ?? 0) >= HESITATION_THRESHOLD && (
                                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 flex items-center gap-1">
                                      <MousePointer2 size={10}/> Dudó
                                  </span>
                              )}
                              {/* Antes aquí ponía "+10 XP" en cada acierto. No hay
                                  ningún sistema de puntos en la plataforma: ni
                                  columna, ni tabla, ni cálculo. Era un número
                                  inventado que sugería un progreso que no existe.
                                  La fecha sí es un dato. */}
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
      </div>
    </div>
  );
}