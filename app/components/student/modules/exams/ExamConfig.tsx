'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getStudentSyllabus, getRecuentoEntrenamiento } from '@/actions';
import type { TemaAlcance } from '@/app/actions/admin';
import { ExamSettings } from './ExamManager';
import { Crosshair, Check } from 'lucide-react';
import { Button, Kicker, HeroMarino, Fichas, Interruptor, EmptyState, cx, TEXT, TAP } from '../../../ui';
import SelectorTema from '../../SelectorTema';

interface ExamConfigProps {
  initialSettings: ExamSettings;
  onStart: (s: ExamSettings) => void;
}

const DIFICULTADES = [
  { id: 'easy', label: 'Básica' },
  { id: 'medium', label: 'Estándar' },
  { id: 'hard', label: 'Extrema' },
] as const;

/** Presets del simulacro. Cerrados a propósito: dos simulacros solo son
 *  comparables si tienen el mismo tamaño. El de 100 es el de la convocatoria. */
const PRESETS_SIMULACRO = [25, 50, 100] as const;

type Alcance = 'uno' | 'bloques' | 'todo';
type Bloque = { id: number; nombre: string; temas: TemaAlcance[] };

export default function ExamConfig({ initialSettings, onStart }: ExamConfigProps) {
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [cargando, setCargando] = useState(true);
  const [settings, setSettings] = useState<ExamSettings>(initialSettings);

  // «Todo» es el camino natural: es donde el motor adaptativo compara
  // urgencia entre TODOS los temas, no solo dentro de uno. Restringir a un
  // tema sigue siendo legítimo (repasar justo lo que acabas de estudiar),
  // pero es la excepción que elige el alumno, no el punto de partida.
  const [alcance, setAlcance] = useState<Alcance>('todo');
  const [temaUnico, setTemaUnico] = useState<string>('');
  const [bloquesElegidos, setBloquesElegidos] = useState<Set<number>>(new Set());

  /** «Hoy te tocan N» — lo que el sistema propone para el entrenamiento. */
  const [propuesta, setPropuesta] = useState<number | null>(null);

  const todosLosTemas = useMemo(
    () => bloques.flatMap((b) => b.temas.map((t) => t.titulo)),
    [bloques],
  );

  useEffect(() => {
    getStudentSyllabus().then((res) => {
      if (res.success) {
        setBloques(res.bloques);
        const primer = res.bloques[0]?.temas[0]?.titulo;
        if (primer) setTemaUnico((t) => t || primer);
      }
      setCargando(false);
    });
  }, []);

  // Los bloques y sus temas, en la forma que espera `SelectorTema`.
  const gruposSelector = useMemo(
    () => bloques.map((b) => ({
      nombre: b.nombre,
      temas: b.temas.map((t) => ({ valor: t.titulo, etiqueta: t.titulo, numero: t.numero })),
    })),
    [bloques],
  );

  // Los temas seleccionados salen del alcance: un tema suelto, la unión de los
  // bloques marcados, o todo el temario.
  const temasSeleccionados = useMemo(() => {
    if (alcance === 'uno') return temaUnico ? [temaUnico] : [];
    if (alcance === 'todo') return todosLosTemas;
    const set = new Set<string>();
    for (const b of bloques) if (bloquesElegidos.has(b.id)) b.temas.forEach((t) => set.add(t.titulo));
    return [...set];
  }, [alcance, temaUnico, todosLosTemas, bloques, bloquesElegidos]);

  // Reflejar la selección en `settings` (es lo que viaja al servidor).
  useEffect(() => {
    setSettings((s) => ({ ...s, selectedTopics: temasSeleccionados }));
  }, [temasSeleccionados]);

  // «Hoy te tocan N»: solo en entrenamiento, y con un respiro tras cambiar la
  // selección para no consultar en cada clic.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (settings.mode !== 'practice' || temasSeleccionados.length === 0) {
      setPropuesta(null);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    const temas = temasSeleccionados;
    debounce.current = setTimeout(() => {
      getRecuentoEntrenamiento(temas).then((res) => {
        if (res.success) {
          setPropuesta(res.propuestas);
          setSettings((s) => (s.mode === 'practice' ? { ...s, questionCount: res.propuestas } : s));
        }
      });
    }, 450);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.mode, temasSeleccionados.join('|')]);

  const setModo = (mode: ExamSettings['mode']) => {
    setSettings((s) => ({
      ...s,
      mode,
      // Al pasar a simulacro, el número salta al preset más cercano.
      questionCount:
        mode === 'exam'
          ? PRESETS_SIMULACRO.reduce((a, b) => (Math.abs(b - s.questionCount) < Math.abs(a - s.questionCount) ? b : a))
          : s.questionCount,
    }));
  };

  const toggleBloque = (id: number) => {
    setBloquesElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sinTema = temasSeleccionados.length === 0;
  const esEntreno = settings.mode === 'practice';

  if (cargando) {
    return <p className={cx(TEXT.muted, 'p-8 text-center max-w-5xl mx-auto')}>Cargando temario…</p>;
  }
  if (bloques.length === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <EmptyState
          title="Sin temas disponibles"
          hint="Todavía no hay preguntas en el banco. Habla con tu academia."
        />
      </div>
    );
  }

  const nMin = Math.round((settings.questionCount * 30) / 60);

  return (
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-6 animate-in fade-in duration-150">

      {/* MODO */}
      <Interruptor
        etiqueta="Modo"
        valor={settings.mode}
        onChange={setModo}
        opciones={[{ valor: 'practice', etiqueta: 'Entrenamiento' }, { valor: 'exam', etiqueta: 'Simulacro' }]}
      />

      {/* LO QUE VAS A HACER, en grande. */}
      <HeroMarino>
        {esEntreno ? (
          <>
            <Kicker onMarino>Hoy te tocan</Kicker>
            <div className="flex items-baseline gap-3">
              <span className="font-titulo font-bold text-5xl sm:text-7xl leading-none tabular-nums">{propuesta ?? '—'}</span>
              <span className="font-titulo font-semibold text-xl sm:text-2xl uppercase">{propuesta === 1 ? 'pregunta' : 'preguntas'}</span>
            </div>
            <p className="mt-2 text-sm sm:text-base text-indigo-100 leading-relaxed">
              El sistema te da lo que toca repasar y lo nuevo con medida. Corrección al momento, sin reloj ni nota.
            </p>
          </>
        ) : (
          <>
            <Kicker onMarino>Como el examen</Kicker>
            <div className="flex items-baseline gap-x-4 gap-y-1 flex-wrap">
              <span className="font-titulo font-bold text-5xl sm:text-7xl leading-none tabular-nums">{nMin}<span className="text-2xl sm:text-3xl text-oro-claro"> min</span></span>
              <span className="font-titulo font-semibold text-xl sm:text-2xl uppercase text-indigo-100">{settings.questionCount} preguntas</span>
            </div>
            <p className="mt-2 text-sm sm:text-base text-indigo-100 leading-relaxed">
              Con reloj y sin correcciones. La nota es la de la convocatoria: cada dos fallos, un acierto menos.
            </p>
          </>
        )}
      </HeroMarino>

      {/* TAMAÑO — solo simulacro; en entrenamiento va más abajo, con el deslizador. */}
      {settings.mode === 'exam' && (
        <section>
          <Kicker className="mb-2">Tamaño</Kicker>
          <Fichas
            etiqueta="Número de preguntas del simulacro"
            valor={String(settings.questionCount)}
            onChange={(v) => setSettings({ ...settings, questionCount: Number(v) })}
            opciones={PRESETS_SIMULACRO.map((n) => ({ valor: String(n), etiqueta: String(n), nota: n === 100 ? 'examen real' : undefined }))}
          />
        </section>
      )}

      {/* DIFICULTAD — solo simulacro (en entrenamiento la decide el método). */}
      {settings.mode === 'exam' && (
        <section>
          <Kicker className="mb-2">Dificultad</Kicker>
          <Fichas
            etiqueta="Dificultad"
            valor={settings.difficulty}
            onChange={(v) => setSettings({ ...settings, difficulty: v })}
            opciones={DIFICULTADES.map((d) => ({ valor: d.id, etiqueta: d.label }))}
          />
        </section>
      )}

      {/* ALCANCE */}
      <section>
        <Kicker className="mb-2">Qué estudiar</Kicker>
        <Fichas
          etiqueta="Alcance"
          valor={alcance}
          onChange={setAlcance}
          opciones={[{ valor: 'uno', etiqueta: 'Un tema' }, { valor: 'bloques', etiqueta: 'Por bloques' }, { valor: 'todo', etiqueta: 'Todo' }]}
        />

        <div className="mt-3">
          {alcance === 'uno' && (
            <>
              <SelectorTema
                value={temaUnico}
                onChange={setTemaUnico}
                grupos={gruposSelector}
                ayuda="El número es el del temario oficial"
              />
              {esEntreno && (
                <p className={cx(TEXT.muted, 'mt-3')}>
                  Solo vas a ver preguntas de este tema — el sistema sigue priorizando por urgencia, pero solo dentro de él. Lo que toque en otros temas espera hasta que elijas «Todo».
                </p>
              )}
            </>
          )}

          {alcance === 'bloques' && (
            <div className="space-y-1.5">
              {bloques.map((b) => {
                const on = bloquesElegidos.has(b.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => toggleBloque(b.id)}
                    aria-pressed={on}
                    className={cx(
                      'w-full text-left px-3 py-2.5 rounded-sm border flex items-center gap-3 transition-colors bg-white dark:bg-slate-900',
                      TAP,
                      on
                        ? 'border-marino dark:border-oro-claro border-2'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
                    )}
                  >
                    <span
                      className={cx(
                        'w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center',
                        on ? 'border-marino bg-marino text-oro-claro' : 'border-slate-300 dark:border-slate-600',
                      )}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">{b.nombre}</span>
                      <span className={cx(TEXT.muted, 'block')}>{b.temas.length} {b.temas.length === 1 ? 'tema' : 'temas'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {alcance === 'todo' && (
            <p className={cx(TEXT.muted)}>
              {todosLosTemas.length} temas del temario. {esEntreno
                ? 'Lo recomendable: se elige lo que más te toca de entre todos.'
                : 'El simulacro reparte las preguntas como la convocatoria.'}
            </p>
          )}
        </div>
      </section>

      {/* CUÁNTAS — entrenamiento. */}
      {esEntreno && (
        <section>
          <div className="flex items-baseline justify-between mb-1">
            <Kicker>Cuántas</Kicker>
            <span className="font-titulo font-bold text-3xl text-marino dark:text-white tabular-nums leading-none">{settings.questionCount}</span>
          </div>
          <input
            type="range"
            min={3}
            max={40}
            value={settings.questionCount}
            onChange={(e) => setSettings({ ...settings, questionCount: parseInt(e.target.value) })}
            aria-label="Número de preguntas"
            style={{ touchAction: 'none' }}
            className="w-full h-2 box-content py-4 bg-slate-200 dark:bg-slate-800 bg-clip-content rounded-lg appearance-none cursor-pointer accent-marino dark:accent-oro"
          />
          {propuesta !== null && propuesta !== settings.questionCount && (
            <p className={cx(TEXT.muted, 'mt-1')}>
              Hoy te tocan <strong className="text-slate-900 dark:text-white">{propuesta}</strong>.
              <button
                onClick={() => setSettings({ ...settings, questionCount: propuesta })}
                className="ml-2 text-marino dark:text-oro-claro font-bold underline"
              >
                usar {propuesta}
              </button>
            </p>
          )}
        </section>
      )}

      <Button
        variant="oro"
        block
        size="lg"
        disabled={sinTema}
        onClick={() => onStart({ ...settings, selectedTopics: temasSeleccionados })}
        iconRight={<Crosshair size={20} />}
      >
        {sinTema
          ? (alcance === 'bloques' ? 'Elige un bloque' : 'Elige un tema')
          : esEntreno ? 'Empezar entrenamiento' : 'Empezar simulacro'}
      </Button>
    </div>
  );
}
