'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw, Brain, BookX, AlertTriangle, Eye,
  CheckCircle2, ChevronDown, Scale, Crosshair, HelpCircle, BookOpen, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getFailedQuestions, getArticulo } from '@/actions';
import type { ArticuloTemario } from '@/app/actions/temario';
import { indexToOptionId } from '@/app/lib/questions';
import { esAtascada, type FailedQuestion } from '@/app/lib/review';
import { ERROR_LABELS, ERROR_TYPES, type ErrorType } from '@/app/lib/stats';
import QuestionNote from '../../QuestionNote';
import SelectorTema from '../../SelectorTema';
import { Card, Button, SectionLabel, cx, TEXT } from '../../../ui';

/**
 * REPASO DE LO FALLADO.
 *
 * La plataforma sabe qué ha fallado cada alumno y —cuando consta— por qué. Esta
 * pantalla existe para volver a ello: repasar el fallo es el único momento en
 * que el error sirve de algo.
 *
 * El diseño va por PRIORIDAD, no por lista plana:
 *   1. Una foto de CÓMO fallas (la mezcla de tipos), que es lo que dice qué
 *      hacer: muchas lagunas → al temario; muchas de lectura → leer con calma.
 *   2. Las que se te RESISTEN (4+ fallos): repetirlas en tests no funciona.
 *   3. El resto, filtrable por tema, con el diagnóstico y la explicación al
 *      desplegar.
 */

/** Cómo se pinta cada tipo de error. */
const ESTILO_ERROR: Record<ErrorType, { label: string; icon: LucideIcon; punto: string; chip: string; barra: string; consejo: string }> = {
  olvido: {
    label: ERROR_LABELS.olvido,
    icon: Brain,
    punto: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300',
    barra: 'bg-sky-500',
    consejo: 'Lo sabías y no te salió. Repetir te funciona: sigue con los tests.',
  },
  desconocimiento: {
    label: ERROR_LABELS.desconocimiento,
    icon: BookX,
    punto: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
    barra: 'bg-rose-500',
    consejo: 'No lo habías estudiado. Toca volver al temario, no repetir el test.',
  },
  fallo_procesamiento: {
    label: ERROR_LABELS.fallo_procesamiento,
    icon: Eye,
    punto: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    barra: 'bg-amber-500',
    consejo: 'Leíste mal el enunciado. Suele ser prisa: en el examen, léelo dos veces.',
  },
  trampa: {
    label: ERROR_LABELS.trampa,
    icon: AlertTriangle,
    punto: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    barra: 'bg-violet-500',
    consejo: 'La pregunta te llevó donde quería. Fíjate en cómo está redactada.',
  },
};

interface FailedQuestionsProps {
  /** Ir a hacer un test. Opcional: la academia puede tener el módulo apagado (P4). */
  onHacerTest?: () => void;
}

export default function FailedQuestions({ onHacerTest }: FailedQuestionsProps) {
  const [items, setItems] = useState<FailedQuestion[] | null>(null);
  const [byTopic, setByTopic] = useState<{ topic: string; count: number }[]>([]);
  const [temaFiltrado, setTemaFiltrado] = useState<string>('');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const res = await getFailedQuestions();
    if (res.success) {
      setItems(res.items);
      setByTopic(res.byTopic);
    } else {
      setError(res.error);
      setItems([]);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => items ?? [], [items]);

  // La mezcla de tipos: es lo que dice qué hacer.
  const mezcla = useMemo(() => {
    const m = { olvido: 0, desconocimiento: 0, fallo_procesamiento: 0, trampa: 0, sin: 0 } as Record<ErrorType | 'sin', number>;
    for (const q of lista) m[q.lastErrorType ?? 'sin'] += 1;
    return m;
  }, [lista]);

  const clasificadas = lista.length - mezcla.sin;
  const dominante = useMemo<ErrorType | null>(() => {
    let best: ErrorType | null = null;
    let n = 0;
    for (const t of ERROR_TYPES) if (mezcla[t] > n) { n = mezcla[t]; best = t; }
    // Solo se llama «dominante» si de verdad manda: 3+ y más de un tercio de
    // las clasificadas. Si no, no hay un consejo honesto que dar.
    return best && n >= 3 && n >= clasificadas / 3 ? best : null;
  }, [mezcla, clasificadas]);

  const atascadas = useMemo(() => lista.filter(esAtascada), [lista]);
  const noAtascadas = useMemo(() => lista.filter((q) => !esAtascada(q)), [lista]);
  const resto = useMemo(
    () => (temaFiltrado ? noAtascadas.filter((q) => (q.topic || 'Sin tema') === temaFiltrado) : noAtascadas),
    [noAtascadas, temaFiltrado],
  );

  if (cargando) {
    return <div className="p-20 text-center animate-pulse text-slate-500 dark:text-slate-400">Recuperando fallos…</div>;
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center animate-in fade-in duration-150">
        <AlertTriangle className="mx-auto text-amber-500 mb-4" size={40} />
        <p className="font-black text-slate-900 dark:text-white mb-2">No se pudo cargar el repaso</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{error}</p>
        <Button onClick={cargar} icon={<RefreshCw size={16} />}>Reintentar</Button>
      </div>
    );
  }

  // «Sin datos» ≠ «cero» (regla 8): no haber fallado nunca no es no haber hecho
  // ningún test.
  if (lista.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 sm:py-24 animate-in fade-in duration-150">
        <CheckCircle2 className="mx-auto text-emerald-500 mb-6" size={56} />
        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-3">No hay nada que repasar</h2>
        <p className="text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
          Aquí aparecerán las preguntas que falles, con el diagnóstico y qué releer.
          Las que dejes en blanco no cuentan: no son fallos.
        </p>
        {onHacerTest && (
          <div className="mt-7 flex justify-center">
            <Button onClick={onHacerTest} icon={<Crosshair size={18} />}>Hacer un test</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-4 space-y-4 animate-in fade-in duration-150">

      {/* ───────── CÓMO FALLAS ───────── */}
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{lista.length}</p>
            <p className={cx(TEXT.muted, 'mt-1')}>
              {lista.length === 1 ? 'pregunta por repasar' : 'preguntas por repasar'}
            </p>
          </div>
          <button
            onClick={cargar}
            aria-label="Volver a cargar"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {clasificadas > 0 && (
          <>
            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 mb-3">
              {ERROR_TYPES.map((t) =>
                mezcla[t] > 0 ? (
                  <div
                    key={t}
                    className={ESTILO_ERROR[t].barra}
                    style={{ width: `${(mezcla[t] / lista.length) * 100}%` }}
                    title={`${mezcla[t]} · ${ESTILO_ERROR[t].label}`}
                  />
                ) : null,
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
              {ERROR_TYPES.map((t) =>
                mezcla[t] > 0 ? (
                  <span key={t} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <span className={cx('w-2 h-2 rounded-full', ESTILO_ERROR[t].punto)} />
                    {mezcla[t]} {ESTILO_ERROR[t].label.toLowerCase()}
                  </span>
                ) : null,
              )}
              {mezcla.sin > 0 && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                  {mezcla.sin} sin clasificar
                </span>
              )}
            </div>

            {dominante && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed flex items-start gap-2">
                <HelpCircle size={13} className="text-indigo-500 shrink-0 mt-0.5" />
                {ESTILO_ERROR[dominante].consejo}
              </p>
            )}
          </>
        )}
      </Card>

      {/* ───────── SE TE RESISTEN ───────── */}
      {atascadas.length > 0 && (
        <Card tone="sunken" className="border-amber-300/60 dark:border-amber-500/25">
          <SectionLabel icon={<AlertTriangle size={14} className="text-amber-500" />}>
            Se te resisten ({atascadas.length})
          </SectionLabel>
          <p className={cx(TEXT.muted, 'mb-3 -mt-2')}>
            Fallada{atascadas.length === 1 ? '' : 's'} 4 veces o más. Repetir el test no funciona: relee la fuente.
          </p>
          <div className="space-y-2">
            {atascadas.map((q) => (
              <Fila
                key={q.questionId}
                q={q}
                abierta={abierta === q.questionId}
                onToggle={() => setAbierta(abierta === q.questionId ? null : q.questionId)}
                resiste
              />
            ))}
          </div>
        </Card>
      )}

      {/* ───────── EL RESTO ───────── */}
      {(resto.length > 0 || temaFiltrado) && (
        <div className="space-y-3">
          {byTopic.length > 1 && (
            <SelectorTema
              label="Tema"
              value={temaFiltrado}
              onChange={setTemaFiltrado}
              placeholder={`Todos los temas (${noAtascadas.length})`}
              temas={[
                { valor: '', etiqueta: 'Todos los temas', cuenta: noAtascadas.length },
                ...byTopic.map(({ topic, count }) => ({ valor: topic, etiqueta: topic, cuenta: count })),
              ]}
            />
          )}

          {resto.length === 0 ? (
            <p className={cx(TEXT.muted, 'text-center py-8')}>
              Nada que repasar en este tema, fuera de las que se te resisten.
            </p>
          ) : (
            <div className="space-y-2">
              {resto.map((q) => (
                <Fila
                  key={q.questionId}
                  q={q}
                  abierta={abierta === q.questionId}
                  onToggle={() => setAbierta(abierta === q.questionId ? null : q.questionId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// UNA FILA
// ════════════════════════════════════════════════════════════

function Fila({ q, abierta, onToggle, resiste = false }: {
  q: FailedQuestion;
  abierta: boolean;
  onToggle: () => void;
  resiste?: boolean;
}) {
  const estilo = q.lastErrorType ? ESTILO_ERROR[q.lastErrorType] : null;
  const marcadas = q.chosenIndexes ?? [];
  const opciones = q.options ?? [];
  const insisteMismaOpcion = q.times > 1 && marcadas.length === 1;

  // LEER EL ARTÍCULO — la intervención de verdad. Para una atascada, repetir el
  // test no funciona: hay que ir a la fuente. Se pide al desplegar, no antes.
  const [articulo, setArticulo] = useState<ArticuloTemario | null | 'nada'>(null);
  const [cargandoArt, setCargandoArt] = useState(false);
  const verArticulo = async () => {
    if (articulo || cargandoArt) return;
    setCargandoArt(true);
    const res = await getArticulo({ topic: q.topic, legalReference: q.legalReference });
    setArticulo(res.success ? (res.articulo ?? 'nada') : 'nada');
    setCargandoArt(false);
  };

  return (
    <div className={cx(
      'bg-white dark:bg-slate-900 rounded-xl border overflow-hidden transition-colors',
      resiste ? 'border-amber-300/70 dark:border-amber-500/30' : 'border-slate-200 dark:border-slate-800',
    )}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {q.topic && (
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate mb-1">
              {q.topic}
            </p>
          )}
          <p className="text-sm font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
            {q.questionText || <span className="italic text-slate-400">Pregunta ya no disponible en el banco</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {q.times > 1 && (
              <span className={cx(
                'text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded',
                resiste
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
              )}>
                ×{q.times}
              </span>
            )}
            {estilo && (
              <span className={cx('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded', estilo.chip)}>
                <estilo.icon size={10} /> {estilo.label}
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={16} className={cx('text-slate-400 shrink-0 mt-0.5 transition-transform', abierta && 'rotate-180')} />
      </button>

      {abierta && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="space-y-1.5 mb-4">
            {opciones.map((texto, i) => {
              const esCorrecta = i === q.correctIndex;
              const laMarco = marcadas.includes(i);
              return (
                <div
                  key={i}
                  className={cx(
                    'p-3 rounded-lg border text-sm flex items-start gap-2.5',
                    esCorrecta
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300'
                      : laMarco
                        ? 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-900/10 text-rose-700 dark:text-rose-400'
                        : 'border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400',
                  )}
                >
                  <span className="font-black uppercase text-xs mt-0.5">{indexToOptionId(i)}</span>
                  <span className="flex-1">{texto}</span>
                  {esCorrecta && <CheckCircle2 size={15} className="shrink-0 mt-0.5" />}
                  {!esCorrecta && laMarco && (
                    <span className="text-[9px] font-black uppercase tracking-wider shrink-0 mt-1">la marcaste</span>
                  )}
                </div>
              );
            })}
            {opciones.length === 0 && (
              <p className={cx(TEXT.muted, 'italic')}>Las opciones ya no están disponibles.</p>
            )}
          </div>

          {q.explanation && (
            <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3.5 border border-slate-100 dark:border-slate-800 mb-3">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Por qué</p>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{q.explanation}</p>
              {q.legalReference && (
                <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                  <Scale size={12} /> {q.legalReference}
                </p>
              )}
            </div>
          )}

          {estilo && !resiste && (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2 leading-relaxed">
              <estilo.icon size={13} className="text-indigo-500 shrink-0 mt-0.5" />
              {estilo.consejo}
            </p>
          )}

          {insisteMismaOpcion && !resiste && (
            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2 leading-relaxed mt-2.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Has caído {q.times} veces en la misma opción: no es que no te la sepas, es que esa respuesta te convence.
            </p>
          )}

          {resiste && (
            <p className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2 leading-relaxed">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Llevas <strong>{q.times}</strong> fallos. Repetirla en los tests no está funcionando:{' '}
                {q.legalReference
                  ? <>léete el <strong>{q.legalReference}</strong> despacio</>
                  : <>relee esa parte del temario con calma</>}.
              </span>
            </p>
          )}

          {/* LEER EL ARTÍCULO. Solo si la pregunta sale de uno (los apuntes no
              tienen articulado). En una atascada es la acción principal. */}
          {q.legalReference && articulo !== 'nada' && (
            articulo ? (
              <div className="mt-3 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/10 p-3.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-1.5 flex items-center gap-1.5">
                  <BookOpen size={12} /> {articulo.reference}
                  {articulo.documento && <span className="font-medium text-slate-400 normal-case tracking-normal">· {articulo.documento}</span>}
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
                  {articulo.texto}
                </p>
              </div>
            ) : (
              <button
                onClick={verArticulo}
                disabled={cargandoArt}
                className={cx(
                  'mt-3 inline-flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-lg transition-colors',
                  resiste
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600',
                )}
              >
                {cargandoArt ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
                Leer el {q.legalReference}
              </button>
            )
          )}

          <QuestionNote questionId={q.questionId} />
        </div>
      )}
    </div>
  );
}
