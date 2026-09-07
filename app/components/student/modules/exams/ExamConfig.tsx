'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getStudentSyllabus, getRecuentoEntrenamiento } from '@/actions';
import type { TemaAlcance } from '@/app/actions/admin';
import { ExamSettings } from './ExamManager';
import { Crosshair, BookOpen, Clock, AlertTriangle, Layers, ChevronDown, Check } from 'lucide-react';
import { Card, Button, SectionLabel, OptionCard, OptionGroup, EmptyState, Modal, cx, TEXT, TAP } from '../../../ui';

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

  const [alcance, setAlcance] = useState<Alcance>('uno');
  const [temaUnico, setTemaUnico] = useState<string>('');
  const [bloquesElegidos, setBloquesElegidos] = useState<Set<number>>(new Set());

  /** El selector de tema es una hoja modal, no un `<select>` nativo: 45 temas en
   *  el picker de Android son una lista infinita sin número ni bloque. */
  const [pickerAbierto, setPickerAbierto] = useState(false);

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

  // El tema elegido, con su número, para pintarlo en el botón que abre el picker.
  const temaElegido = useMemo(
    () => bloques.flatMap((b) => b.temas).find((t) => t.titulo === temaUnico) ?? null,
    [bloques, temaUnico],
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

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-500">

      {/* MODO */}
      <Card>
        <SectionLabel icon={<Layers size={14} />}>Modo</SectionLabel>
        <OptionGroup cols={2}>
          <OptionCard
            title="Entrenamiento"
            description="El sistema te da lo que toca repasar y lo nuevo con medida. Corrección al momento, sin reloj ni nota."
            selected={esEntreno}
            onClick={() => setModo('practice')}
          />
          <OptionCard
            title="Simulacro"
            description="Fiel al examen: reloj, sin correcciones, y la nota con penalización de la convocatoria."
            selected={settings.mode === 'exam'}
            onClick={() => setModo('exam')}
          />
        </OptionGroup>
      </Card>

      {/* ALCANCE */}
      <Card>
        <SectionLabel icon={<BookOpen size={14} />}>Alcance</SectionLabel>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {([
            ['uno', 'Un tema'],
            ['bloques', 'Por bloques'],
            ['todo', 'Todo'],
          ] as [Alcance, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAlcance(id)}
              aria-pressed={alcance === id}
              className={cx(
                'rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors',
                TAP,
                alcance === id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {alcance === 'uno' && (
          <button
            onClick={() => setPickerAbierto(true)}
            className={cx(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors',
              TAP,
              'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-slate-950',
            )}
          >
            <span className="w-8 h-8 shrink-0 rounded-lg bg-indigo-600 text-white text-xs font-black flex items-center justify-center tabular-nums">
              {temaElegido?.numero ?? '·'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Tema</span>
              <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">
                {temaElegido?.titulo ?? 'Elige un tema'}
              </span>
            </span>
            <ChevronDown size={16} className="shrink-0 text-slate-400" />
          </button>
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
                    'w-full text-left px-3 py-2.5 rounded-xl border flex items-center gap-3 transition-colors',
                    TAP,
                    on
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700',
                  )}
                >
                  <span
                    className={cx(
                      'w-4 h-4 shrink-0 rounded border flex items-center justify-center',
                      on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600',
                    )}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-slate-900 dark:text-white">{b.nombre}</span>
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
              ? 'El sistema reparte por lo que más te conviene.'
              : 'El simulacro reparte las preguntas como la convocatoria.'}
          </p>
        )}
      </Card>

      {/* DIFICULTAD — solo simulacro (en entrenamiento la decide el método). */}
      {settings.mode === 'exam' && (
        <Card>
          <SectionLabel icon={<AlertTriangle size={14} />}>Dificultad</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {DIFICULTADES.map((d) => {
              const activa = settings.difficulty === d.id;
              const color =
                d.id === 'hard'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                  : d.id === 'medium'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
              return (
                <button
                  key={d.id}
                  onClick={() => setSettings({ ...settings, difficulty: d.id })}
                  aria-pressed={activa}
                  className={cx(
                    'rounded-xl text-[11px] font-black uppercase tracking-wider transition-colors',
                    TAP,
                    activa ? color : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* PREGUNTAS */}
      <Card>
        <SectionLabel
          icon={<Clock size={14} />}
          aside={
            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none">
              {settings.questionCount}
            </span>
          }
        >
          Preguntas
        </SectionLabel>

        {settings.mode === 'exam' ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS_SIMULACRO.map((n) => (
                <button
                  key={n}
                  onClick={() => setSettings({ ...settings, questionCount: n })}
                  aria-pressed={settings.questionCount === n}
                  className={cx(
                    'rounded-xl text-sm font-black tabular-nums transition-colors',
                    TAP,
                    settings.questionCount === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className={cx(TEXT.muted, 'mt-3')}>
              {Math.round((settings.questionCount * 30) / 60)} min de reloj: 30 s por pregunta, el ritmo del BOE.
              El de 100 es el examen real.
            </p>
          </>
        ) : (
          <>
            <input
              type="range"
              min={3}
              max={40}
              value={settings.questionCount}
              onChange={(e) => setSettings({ ...settings, questionCount: parseInt(e.target.value) })}
              aria-label="Número de preguntas"
              style={{ touchAction: 'none' }}
              className="w-full h-2 box-content py-4 bg-slate-200 dark:bg-slate-800 bg-clip-content rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            {propuesta !== null && (
              <p className={cx(TEXT.muted, 'mt-1')}>
                Hoy te tocan <strong className="text-slate-900 dark:text-white">{propuesta}</strong>.
                {propuesta !== settings.questionCount && (
                  <button
                    onClick={() => setSettings({ ...settings, questionCount: propuesta })}
                    className="ml-2 text-indigo-600 dark:text-indigo-400 font-bold underline"
                  >
                    usar {propuesta}
                  </button>
                )}
              </p>
            )}
          </>
        )}
      </Card>

      <Button
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

      {/* EL PICKER DE TEMA — hoja modal con los bloques y el número de cada tema. */}
      {pickerAbierto && (
        <Modal
          title="Elige un tema"
          subtitle="El número es el del temario oficial"
          width="sm"
          onClose={() => setPickerAbierto(false)}
        >
          <div className="space-y-5">
            {bloques.map((b) => (
              <div key={b.id}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                  {b.nombre}
                </p>
                <div className="space-y-1">
                  {b.temas.map((t) => {
                    const activo = t.titulo === temaUnico;
                    return (
                      <button
                        key={t.numero}
                        onClick={() => { setTemaUnico(t.titulo); setPickerAbierto(false); }}
                        className={cx(
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                          activo
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
                        )}
                      >
                        <span
                          className={cx(
                            'w-7 h-7 shrink-0 rounded-lg text-xs font-black flex items-center justify-center tabular-nums',
                            activo ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
                          )}
                        >
                          {t.numero}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-bold leading-snug">{t.titulo}</span>
                        {activo && <Check size={16} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
