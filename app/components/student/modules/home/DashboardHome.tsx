'use client';

import { useState, useEffect } from 'react';
import { Play, Target, Zap, ArrowRight, Activity, Crosshair } from 'lucide-react';
import { getUserStats } from '@/actions';
import { TabId } from '../../StudentDashboard';
import { ERROR_LABELS, type StatsSummary, type TestResultRow, type ErrorType } from '@/app/lib/stats';
import { Card, Button, StatTile, SectionLabel, EmptyState, cx, TEXT, TAP } from '../../../ui';

type RecentItem = TestResultRow & { created_at?: string | null };
type UserStats = StatsSummary & { lastItems: RecentItem[] };

interface DashboardHomeProps {
  user: { id: string; email?: string };
  onNavigate: (tab: TabId) => void;
}

/**
 * El fallo que más se repite, de los que el alumno ha etiquetado.
 *
 * Es lo ÚNICO que la plataforma sabe de verdad sobre "en qué tienes que
 * mejorar". Devuelve `null` si no hay ninguno etiquetado — que no es lo mismo
 * que no tener fallos (regla 8).
 */
function falloDominante(breakdown: Record<ErrorType, number>, taggedErrors: number): ErrorType | null {
  if (taggedErrors === 0) return null;
  const entradas = Object.entries(breakdown) as Array<[ErrorType, number]>;
  const mejor = entradas.reduce((a, b) => (b[1] > a[1] ? b : a));
  return mejor[1] > 0 ? mejor[0] : null;
}

export default function DashboardHome({ user, onNavigate }: DashboardHomeProps) {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saludo, setSaludo] = useState('');

  useEffect(() => {
    const hora = new Date().getHours();
    setSaludo(hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches');

    getUserStats()
      .then((res) => setStats(res.success ? res.stats : null))
      .catch((e) => console.error('Error cargando el centro de mando:', e))
      .finally(() => setLoading(false));
  }, [user.id]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const sinActividad = !stats || stats.answered === 0;
  const fallo = stats ? falloDominante(stats.errorBreakdown, stats.taggedErrors) : null;

  return (
    <div className="space-y-4 sm:space-y-6 pb-4">

      {/* INFORME DIARIO
          Antes esta tarjeta decía: "El sistema detecta una oportunidad de
          mejora en Derecho Penal. Su rendimiento táctico ha aumentado un 12%
          esta semana", con el 12% y el tema escritos a mano en el HTML. Nada
          lo calculaba: era un dato inventado presentado como análisis, y el
          alumno podía decidir qué estudiar a partir de él. Ahora, o sale de
          `getUserStats`, o se dice que no hay dato. */}
      <Card tone="brand" pad="lg" elevation="raised" className="relative overflow-hidden">
        <div className="absolute -top-24 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <p className={cx(TEXT.label, 'text-indigo-200 mb-2')}>Informe diario</p>
          <h2 className="text-2xl sm:text-4xl font-black mb-3 leading-tight tracking-tight">
            {saludo}, agente.
          </h2>

          <p className="text-indigo-100 text-sm sm:text-base font-medium max-w-xl mb-6 leading-relaxed">
            {sinActividad ? (
              <>Aún no has contestado ninguna pregunta. En cuanto hagas el primer test, aquí verás tu acierto real y en qué tipo de fallo se te va la nota.</>
            ) : (
              <>
                Llevas <strong className="text-white">{stats.answered}</strong>{' '}
                {stats.answered === 1 ? 'pregunta contestada' : 'preguntas contestadas'} con un{' '}
                <strong className="text-white">{stats.winRate} %</strong> de acierto.
                {fallo ? (
                  <> Tu fallo más frecuente es <strong className="text-white">{ERROR_LABELS[fallo].toLowerCase()}</strong>.</>
                ) : (
                  <> Etiqueta tus fallos al corregir y te diré de qué tipo son.</>
                )}
              </>
            )}
          </p>

          <button
            onClick={() => onNavigate('test')}
            className={cx(
              'bg-white text-indigo-600 px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest',
              'flex items-center gap-3 active:scale-[0.98] transition-transform',
              TAP,
            )}
          >
            <Play size={18} fill="currentColor" />
            Empezar un test
          </button>
        </div>
      </Card>

      {/* LOS DATOS, TODOS REALES.
          `null` cuando no hay muestra: StatTile lo pinta como "—" y no como 0,
          que es un alumno que va mal (regla 8). */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatTile
          label="Acierto"
          value={sinActividad ? null : stats.winRate}
          suffix="%"
          tone="brand"
          icon={<Target size={12} />}
        />
        <StatTile
          label="Contestadas"
          value={sinActividad ? null : stats.answered}
          tone="neutral"
        />
        <StatTile
          label="En blanco"
          value={stats ? stats.blank : null}
          tone="warning"
        />
      </div>

      <button
        onClick={() => onNavigate('cards')}
        className="w-full text-left group"
      >
        <Card className="flex items-center justify-between gap-4 hover:border-purple-400 dark:hover:border-purple-500/50 transition-colors">
          <span className="flex items-center gap-3 min-w-0">
            <span className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-2xl shrink-0">
              <Zap size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-black text-slate-900 dark:text-white">Repaso rápido</span>
              {/* Antes ponía "5 Flashcards pendientes", con el 5 escrito a mano. */}
              <span className={cx(TEXT.muted, 'block')}>Tarjetas de memoria por temas</span>
            </span>
          </span>
          <ArrowRight size={18} className="text-slate-400 group-hover:text-purple-600 transition-colors shrink-0" />
        </Card>
      </button>

      {/* ACTIVIDAD RECIENTE */}
      <Card pad="none">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <SectionLabel icon={<Activity size={14} />} className="mb-0">Actividad reciente</SectionLabel>
        </div>

        {stats && stats.lastItems.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {stats.lastItems.map((item: RecentItem, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 sm:p-4">
                <span
                  className={cx(
                    'w-2 h-2 rounded-full shrink-0',
                    item.is_correct ? 'bg-emerald-500' : 'bg-red-500',
                  )}
                />
                <p className="flex-1 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-1">
                  {(item.question_text ?? 'Pregunta no disponible').replace('[FLASHCARD] ', '')}
                </p>
                <span className={cx(TEXT.hud, 'text-slate-400 shrink-0')}>
                  {item.created_at ? new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Sin actividad todavía"
            hint="Lo que contestes aparecerá aquí, con el tema y si acertaste."
            icon={<Crosshair size={32} />}
            action={<Button size="sm" onClick={() => onNavigate('test')}>Hacer el primero</Button>}
          />
        )}
      </Card>
    </div>
  );
}
