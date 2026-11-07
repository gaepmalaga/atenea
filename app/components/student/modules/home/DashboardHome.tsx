'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Play, Target, Clock, Dumbbell, Crosshair, Flame, ChevronRight, Check, Brain, Zap } from 'lucide-react';
import { getUserStats, getEntrenoDeHoy, getMisClases, getMiFisica } from '@/actions';
import { TabId } from '../../StudentDashboard';
import { ahoraEnZona } from '@/app/lib/asistencia';
import { claseDeHoy, fisicaDeHoy, type EntrenoDeHoy, type ClaseDeHoy, type FisicaDeHoy } from '@/app/lib/dia';
import { ETIQUETA_TIPO, type TipoSesion } from '@/app/lib/sesiones';
import { Card, Button, HeroMarino, Kicker, EmptyState, cx, TAP } from '../../../ui';

interface DashboardHomeProps {
  user: { id: string; email?: string };
  onNavigate: (tab: TabId) => void;
}

/** Lo que el Inicio sabe de hoy. `null` = no se pudo leer, que no es «no hay» (regla 8). */
type Hoy = {
  /** Cuántas respuestas lleva en total, y su racha. */
  answered: number | null;
  racha: number;
  entreno: EntrenoDeHoy | null;
  clase: ClaseDeHoy | null;
  fisica: FisicaDeHoy | null;
};

/**
 * INICIO = «QUÉ HAGO HOY» (reglas 63 y 94).
 *
 * Una línea de tiempo con lo que toca hoy: el entrenamiento, los fallos por
 * repasar, la clase y la física. Cada fila sale de su propia acción y SOLO se
 * pinta si hay algo que decir: sin clase hoy no hay fila de clase, y una
 * academia que no lleva la física aquí no ve fila de física. Las cifras de
 * «cómo voy» (acierto, en blanco) viven en «Mi evolución» y no se repiten.
 *
 * Cada lectura es independiente: si falla una, las demás se pintan igual.
 */
export default function DashboardHome({ user, onNavigate }: DashboardHomeProps) {
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [saludo, setSaludo] = useState('');

  useEffect(() => {
    const hora = new Date().getHours();
    setSaludo(hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches');

    let vivo = true;
    // La fecha de hoy es la de la academia, no la del servidor (regla 82).
    const fecha = ahoraEnZona(Date.now()).fecha;

    Promise.allSettled([getUserStats(), getEntrenoDeHoy(), getMisClases(), getMiFisica({ desde: fecha, hasta: fecha })])
      .then(([stats, entreno, clases, fisica]) => {
        if (!vivo) return;
        const s = stats.status === 'fulfilled' && stats.value.success ? stats.value.stats : null;
        const e = entreno.status === 'fulfilled' && entreno.value.success ? entreno.value.hoy : null;
        const c = clases.status === 'fulfilled' && clases.value.success ? claseDeHoy(clases.value.clases, fecha) : null;
        const f = fisica.status === 'fulfilled' && fisica.value.success ? fisicaDeHoy(fisica.value.sesiones, fisica.value.apuntes, fecha) : null;
        setHoy({ answered: s ? s.answered : null, racha: s?.racha ?? 0, entreno: e, clase: c, fisica: f });
      });
    return () => { vivo = false; };
  }, [user.id]);

  if (!hoy) {
    return (
      <div className="space-y-4 animate-pulse" aria-busy="true">
        <div className="h-48 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  const sinActividad = hoy.answered === 0;
  const { entreno } = hoy;
  const sinBanco = entreno !== null && entreno.disponibles === 0;

  return (
    <div className="max-w-3xl space-y-4 sm:space-y-5 pb-4">

      {/* LA RACHA: ánimo, no un dato más. */}
      {hoy.racha > 0 && (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-oro/15 text-oro-oscuro dark:text-oro-claro px-3 py-1.5 rounded-full">
          <Flame size={14} /> {hoy.racha} {hoy.racha === 1 ? 'día seguido' : 'días seguidos'}
        </span>
      )}

      <div className="relative space-y-3">
        {/* El hilo de la línea de tiempo, detrás de los nodos. */}
        <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />

        {/* 1 · EL ENTRENAMIENTO DEL DÍA */}
        <Hito icono={<Crosshair size={18} />} principal>
          <HeroMarino className="rounded-tl-none">
            <Kicker onMarino>{sinActividad ? saludo : 'Entrenamiento del día'}</Kicker>
            {sinBanco ? (
              <p className="mt-2 text-sm text-indigo-100 leading-relaxed">Todavía no hay preguntas en el banco. Habla con tu academia.</p>
            ) : (
              <>
                <h2 className="mt-1 font-titulo font-bold uppercase text-3xl sm:text-4xl leading-tight">
                  {sinActividad
                    ? 'Empieza hoy'
                    : entreno
                      ? `${entreno.propuestas} ${entreno.propuestas === 1 ? 'pregunta' : 'preguntas'}`
                      : 'A entrenar'}
                </h2>
                <p className="mt-2 text-sm sm:text-base text-indigo-100 leading-relaxed">
                  {sinActividad
                    ? 'Aún no has contestado ninguna pregunta. Empieza un entrenamiento y el sistema aprende de ti desde la primera.'
                    : entreno?.temaConMasFallos
                      ? <>Lo que toca repasar y lo nuevo. Donde más fallas ahora: <strong className="text-white">{(entreno.temaConMasFallos.tema ?? '').replace(/\.$/, '')}</strong></>
                      : 'Lo que toca repasar y lo nuevo, con medida.'}
                </p>
                <Button variant="oro" size="lg" className="mt-5" onClick={() => onNavigate('test')} icon={<Play size={18} fill="currentColor" />}>
                  Entrenar
                </Button>
              </>
            )}
          </HeroMarino>
        </Hito>

        {/* 2 · LOS FALLOS CON EL REPASO VENCIDO — solo si hay alguno. */}
        {entreno && entreno.porRepasar > 0 && (
          <Hito icono={<Target size={18} />}>
            <FilaDelDia
              onClick={() => onNavigate('review')}
              titulo="Repasar fallos"
              detalle={`${entreno.porRepasar} ${entreno.porRepasar === 1 ? 'pendiente' : 'pendientes'}, los urgentes primero`}
              aparte={<span className="font-titulo font-bold text-2xl text-marino dark:text-white">{entreno.porRepasar}</span>}
            />
          </Hito>
        )}

        {/* 3 · LA CLASE DE HOY — solo si tiene clase. */}
        {hoy.clase && (
          <Hito icono={<Clock size={18} />}>
            <FilaDelDia
              onClick={() => onNavigate('profile')}
              titulo="Clase en la academia"
              detalle={hoy.clase.falta ? `${hoy.clase.nombre} · has avisado de que faltas` : hoy.clase.nombre}
              aparte={hoy.clase.hora ? <span className="font-titulo font-bold text-xl text-marino dark:text-white">{hoy.clase.hora}</span> : undefined}
            />
          </Hito>
        )}

        {/* 4 · LA FÍSICA DE HOY — solo si el preparador ha puesto una sesión.
            Hay academias que aún no la llevan aquí: entonces no hay fila. */}
        {hoy.fisica && (
          <Hito icono={<Dumbbell size={18} />}>
            <FilaDelDia
              onClick={() => onNavigate('training')}
              titulo={hoy.fisica.titulo}
              detalle={[ETIQUETA_TIPO[hoy.fisica.tipo as TipoSesion] ?? hoy.fisica.tipo, hoy.fisica.minutos ? `${hoy.fisica.minutos} min` : null].filter(Boolean).join(' · ')}
              aparte={hoy.fisica.hecha ? <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><Check size={14} /> Hecha</span> : undefined}
            />
          </Hito>
        )}
      </div>

      {/* LO DE «CÓMO VOY» Y LO SUELTO: enlaces, no cifras. */}
      <div className="flex flex-wrap gap-x-5">
        {!sinActividad && (
          <button onClick={() => onNavigate('stats')} className={cx('inline-flex items-center gap-1.5 text-sm font-semibold text-marino dark:text-white', TAP)}>
            <Brain size={16} className="text-oro-oscuro dark:text-oro-claro" /> Ver mi evolución <ChevronRight size={16} className="text-oro-oscuro dark:text-oro-claro" />
          </button>
        )}
        <button onClick={() => onNavigate('cards')} className={cx('inline-flex items-center gap-1.5 text-sm font-semibold text-marino dark:text-white', TAP)}>
          <Zap size={16} className="text-oro-oscuro dark:text-oro-claro" /> Repaso rápido con fichas <ChevronRight size={16} className="text-oro-oscuro dark:text-oro-claro" />
        </button>
      </div>

      {/* Si no se pudo leer NADA de hoy, no se deja la pantalla muda. */}
      {entreno === null && hoy.answered === null && (
        <Card>
          <EmptyState title="No se ha podido cargar tu día" hint="Comprueba la conexión e inténtalo de nuevo." icon={<Crosshair size={32} />} />
        </Card>
      )}
    </div>
  );
}

/** Un punto de la línea de tiempo: el nodo a la izquierda y la fila a la derecha. */
function Hito({ icono, children, principal = false }: { icono: ReactNode; children: ReactNode; principal?: boolean }) {
  return (
    <div className="relative flex items-start gap-3">
      <span
        className={cx(
          'relative z-10 shrink-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-crema dark:border-slate-950',
          principal ? 'bg-marino text-oro-claro' : 'bg-white dark:bg-slate-900 text-marino dark:text-oro-claro ring-2 ring-oro',
        )}
        aria-hidden="true"
      >
        {icono}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Una fila clicable de la línea de tiempo. */
function FilaDelDia({ titulo, detalle, aparte, onClick }: { titulo: string; detalle: string; aparte?: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cx('w-full text-left group', TAP)}>
      <Card className="flex items-center gap-3 hover:border-oro transition-colors" pad="sm">
        <span className="flex-1 min-w-0">
          <span className="block font-bold text-base text-slate-900 dark:text-white truncate">{titulo}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">{detalle}</span>
        </span>
        {aparte}
        <ChevronRight size={18} className="shrink-0 text-oro-oscuro dark:text-oro-claro" />
      </Card>
    </button>
  );
}
