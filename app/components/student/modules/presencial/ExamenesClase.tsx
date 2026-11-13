'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, ClipboardCheck, Loader2, Pencil, TrendingDown, TrendingUp, X } from 'lucide-react';
import { entregaExamenClase, getMisExamenesClase, getRevisionExamenClase } from '@/actions';
import type { MiExamenClase, RevisionClase } from '@/app/actions/examenes-clase';
import {
  BLANCO, LETRAS_CLASE, OPCIONES_CLASE, parseaRespuestas, respuestasEnTexto, tendenciaDeNotas,
} from '@/app/lib/examen-clase';
import { Card, Button, SectionLabel, StatTile, EmptyState, TEXT, TAP, RADIUS, cx } from '../../../ui';
import CalculadoraNota from './CalculadoraNota';
import RankingClaseCard from './RankingClaseCard';

/**
 * EXÁMENES EN CLASE (regla 118): los exámenes en papel que se han puesto a mi
 * turno. Aquí meto lo que marqué —en el momento o al llegar a casa—, veo mi
 * nota con la solución y cómo evoluciono.
 *
 * Las respuestas las corrige el SERVIDOR; aquí no hay solución hasta que se
 * entrega, y se entrega una sola vez. Se puede teclear de dos maneras: tocando
 * A, B o C pregunta a pregunta, o escribiéndolas de seguido («abcb-ac…») que es
 * lo rápido cuando ya tienes la hoja delante.
 */

const fechaLarga = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

const clave = (id: string) => `atenea:clase:${id}`;
const leeBorrador = (id: string, total: number): number[] | null => {
  try {
    const v = JSON.parse(window.localStorage.getItem(clave(id)) ?? 'null');
    return Array.isArray(v) && v.length === total ? v.map((x) => (x === 0 || x === 1 || x === 2 ? x : BLANCO)) : null;
  } catch { return null; }
};
const guardaBorrador = (id: string, r: number[]) => { try { window.localStorage.setItem(clave(id), JSON.stringify(r)); } catch { /* sin almacenamiento: se escribe igual */ } };
const borraBorrador = (id: string) => { try { window.localStorage.removeItem(clave(id)); } catch { /* idem */ } };

/** Las notas de más antigua a más nueva, en una línea. */
function Evolucion({ notas }: { notas: { fecha: string; nota: number }[] }) {
  const W = 300, H = 90, X0 = 14, Y0 = 8;
  const x = (i: number) => X0 + (notas.length === 1 ? (W - 2 * X0) / 2 : (i * (W - 2 * X0)) / (notas.length - 1));
  const y = (n: number) => Y0 + (H - 2 * Y0) * (1 - n / 10);
  const puntos = notas.map((n, i) => `${x(i)},${y(n.nota)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full text-marino dark:text-oro-claro" role="img"
      aria-label={`Tus notas, de la más antigua a la más reciente: ${notas.map((n) => num(n.nota)).join(', ')}`}>
      {[0, 5, 10].map((g) => <line key={g} x1={X0} x2={W - X0} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity="0.15" />)}
      <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {notas.map((n, i) => <circle key={i} cx={x(i)} cy={y(n.nota)} r="3.4" fill="currentColor" />)}
    </svg>
  );
}

export default function ExamenesClase() {
  const [examenes, setExamenes] = useState<MiExamenClase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<MiExamenClase | null>(null);
  const [revision, setRevision] = useState<RevisionClase | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  const carga = useCallback(async () => {
    const res = await getMisExamenesClase();
    if (res.success) { setExamenes(res.examenes); setError(null); } else setError(res.error);
  }, []);
  useEffect(() => { carga(); }, [carga]);

  async function verRevision(id: string) {
    setAbriendo(id);
    const res = await getRevisionExamenClase(id);
    setAbriendo(null);
    if (res.success) { setRevision(res.revision); window.scrollTo(0, 0); } else setError(res.error);
  }

  if (entrando) {
    return (
      <Entrada
        examen={entrando}
        onCancelar={() => setEntrando(null)}
        onEntregado={(r) => { setEntrando(null); setRevision(r); window.scrollTo(0, 0); carga(); }}
      />
    );
  }
  if (revision) return <Revision revision={revision} onVolver={() => setRevision(null)} />;

  const lista = examenes ?? [];
  const porEntregar = lista.filter((e) => e.estado === 'pendiente');
  const proximos = lista.filter((e) => e.estado === 'proximo');
  const hechos = lista.filter((e) => e.estado === 'entregado' || e.estado === 'cerrado' || e.estado === 'ausente');
  const cronologicas = lista.filter((e) => e.nota !== null).slice().reverse().map((e) => ({ fecha: e.fecha, nota: e.nota as number }));
  const tendencia = tendenciaDeNotas(cronologicas.map((n) => n.nota));

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6 animate-in fade-in duration-150">
      <p className={cx(TEXT.body, 'text-slate-700 dark:text-slate-300')}>
        Los exámenes en papel que haces en clase. Cuando termines, o al llegar a casa, mete aquí lo que marcaste: te corrige, te enseña la solución y guarda tu nota.
      </p>

      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
      {examenes === null && !error && (
        <p className={cx(TEXT.muted, 'flex items-center gap-2')}><Loader2 size={14} className="animate-spin" aria-hidden /> Cargando…</p>
      )}

      {examenes !== null && lista.length === 0 && (
        <EmptyState icon={<ClipboardCheck size={40} />} title="Todavía no tienes exámenes en clase" hint="Cuando tu academia ponga uno a tu turno, aparecerá aquí." bordered />
      )}

      {porEntregar.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={<Pencil size={14} />}>Para meter tus respuestas</SectionLabel>
          {porEntregar.map((e) => (
            <Card key={e.aplicacionId} pad="lg" elevation="raised">
              <p className="font-titulo text-xl font-bold uppercase text-marino dark:text-oro-claro">{e.titulo}</p>
              <p className={cx(TEXT.muted, 'mt-0.5')}>{e.etiqueta} · {fechaLarga(e.fecha)} · {e.total} preguntas</p>
              {e.cierre && <p className={cx(TEXT.muted)}>Puedes meterlas hasta el {fechaLarga(e.cierre)}.</p>}
              <div className="mt-3"><Button onClick={() => setEntrando(e)} icon={<Pencil size={16} />}>Meter mis respuestas</Button></div>
            </Card>
          ))}
        </section>
      )}

      {proximos.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={<CalendarClock size={14} />}>Próximos</SectionLabel>
          {proximos.map((e) => (
            <Card key={e.aplicacionId}>
              <p className="font-bold text-slate-900 dark:text-white">{e.titulo}</p>
              <p className={cx(TEXT.muted)}>{e.etiqueta} · {fechaLarga(e.fecha)}</p>
            </Card>
          ))}
        </section>
      )}

      {cronologicas.length >= 2 && (
        <Card>
          <SectionLabel icon={tendencia === 'baja' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}>Mi evolución en clase</SectionLabel>
          <Evolucion notas={cronologicas} />
          <p className={cx(TEXT.muted)}>
            {cronologicas.length} exámenes
            {tendencia === 'sube' ? ' · vas a más' : tendencia === 'baja' ? ' · últimamente baja' : tendencia === 'estable' ? ' · estable' : ''}.
          </p>
        </Card>
      )}

      {hechos.length > 0 && (
        <section className="space-y-2">
          <SectionLabel icon={<ClipboardCheck size={14} />}>Mis exámenes</SectionLabel>
          {hechos.map((e) => (
            <Card key={e.aplicacionId}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900 dark:text-white">{e.titulo}</p>
                  <p className={cx(TEXT.muted)}>{e.etiqueta} · {fechaCorta(e.fecha)}</p>
                  {e.estado === 'entregado' && e.aciertos !== null && (
                    <p className={cx(TEXT.muted)}>{e.aciertos} aciertos · {e.fallos} fallos · {e.blancos} en blanco</p>
                  )}
                  {e.estado === 'ausente' && <p className={cx(TEXT.muted)}>No te presentaste.</p>}
                  {e.estado === 'cerrado' && <p className={cx(TEXT.muted)}>No metiste tus respuestas a tiempo.</p>}
                </div>
                {e.nota !== null ? (
                  <div className="shrink-0 text-right">
                    <p className={cx(TEXT.hud, 'text-2xl', e.nota >= 5 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{num(e.nota)}</p>
                    <p className={cx(TEXT.muted)}>{e.notaOficial ? 'nota oficial' : 'tu cuenta'}</p>
                  </div>
                ) : null}
              </div>
              {e.mediaTurno !== null && <p className={cx(TEXT.muted, 'mt-1')}>Media de tu turno: <strong>{num(e.mediaTurno)}</strong></p>}
              {e.estado === 'entregado' && (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <Button size="sm" variant="secondary" disabled={abriendo === e.aplicacionId} onClick={() => verRevision(e.aplicacionId)}>
                    {abriendo === e.aplicacionId ? 'Abriendo…' : 'Ver la solución'}
                  </Button>
                  {e.nota !== null && <RankingClaseCard aplicacionId={e.aplicacionId} />}
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      {/* Una herramienta suelta (regla 124): no guarda nada y sirve aunque no haya ningún examen puesto. */}
      {examenes !== null && <CalculadoraNota />}
    </div>
  );
}

// ───────────────────────── META LAS RESPUESTAS ─────────────────────────

function Entrada({ examen, onCancelar, onEntregado }: {
  examen: MiExamenClase; onCancelar: () => void; onEntregado: (r: RevisionClase) => void;
}) {
  const total = examen.total;
  const [respuestas, setRespuestas] = useState<number[]>(() => Array(total).fill(BLANCO));
  const [modo, setModo] = useState<'tocar' | 'escribir'>('tocar');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargado = useRef(false);

  // El borrador, por si se cierra la pestaña a medias (es solo de este dispositivo).
  useEffect(() => {
    const b = leeBorrador(examen.aplicacionId, total);
    if (b) setRespuestas(b);
    cargado.current = true;
  }, [examen.aplicacionId, total]);
  useEffect(() => { if (cargado.current) guardaBorrador(examen.aplicacionId, respuestas); }, [respuestas, examen.aplicacionId]);

  const contestadas = respuestas.filter((r) => r !== BLANCO).length;
  const lectura = useMemo(() => (modo === 'escribir' ? parseaRespuestas(texto, total) : null), [modo, texto, total]);

  function cambiaModo(m: 'tocar' | 'escribir') {
    if (m === 'escribir') setTexto(respuestasEnTexto(respuestas));
    setModo(m);
  }

  function escribe(v: string) {
    setTexto(v);
    const p = parseaRespuestas(v, total);
    if (p.ok) setRespuestas(p.respuestas);
  }

  async function entregar() {
    if (modo === 'escribir' && lectura && !lectura.ok) { setError(lectura.error); return; }
    const faltan = total - contestadas;
    if (!confirm(faltan
      ? `Te quedan ${faltan} en blanco. Solo se entrega una vez y no se puede cambiar. ¿Entregar?`
      : 'Solo se entrega una vez y no se puede cambiar. ¿Entregar?')) return;
    setEnviando(true);
    setError(null);
    const res = await entregaExamenClase({ aplicacionId: examen.aplicacionId, respuestas });
    setEnviando(false);
    if (!res.success) { setError(res.error); return; }
    borraBorrador(examen.aplicacionId);
    onEntregado(res.revision);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6 animate-in fade-in duration-150">
      <div>
        <p className="font-titulo text-2xl font-bold uppercase text-marino dark:text-oro-claro">{examen.titulo}</p>
        <p className={cx(TEXT.muted)}>{examen.total} preguntas · {contestadas} contestadas</p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Cómo meter las respuestas">
        {([['tocar', 'Tocar'], ['escribir', 'Escribir de seguido']] as const).map(([id, etiqueta]) => (
          <button key={id} role="tab" aria-selected={modo === id} onClick={() => cambiaModo(id)} type="button"
            className={cx(TAP, RADIUS.md, 'border-2 px-3 text-sm font-bold', modo === id ? 'border-indigo-600 bg-indigo-50 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200' : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300')}>
            {etiqueta}
          </button>
        ))}
      </div>

      {modo === 'tocar' ? (
        <Card>
          <p className={cx(TEXT.muted, 'mb-2')}>Toca la letra que marcaste. Si la dejaste en blanco, no toques nada; si te equivocas, vuelve a tocarla para quitarla.</p>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {respuestas.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-1.5">
                <span className={cx(TEXT.hud, 'w-9 shrink-0 text-right text-sm text-slate-600 dark:text-slate-400')}>{i + 1}</span>
                <div className="grid flex-1 grid-cols-3 gap-2">
                  {LETRAS_CLASE.map((l, k) => (
                    <button key={l} type="button" aria-pressed={r === k} aria-label={`Pregunta ${i + 1}, opción ${l}`}
                      onClick={() => setRespuestas((prev) => prev.map((x, j) => (j === i ? (x === k ? BLANCO : k) : x)))}
                      className={cx(TAP, RADIUS.sm, 'border-2 text-base font-bold', r === k ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200')}>
                      {l}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card>
          <p className={cx(TEXT.muted, 'mb-2')}>
            Escribe de seguido lo que marcaste, en orden: A, B o C, y un guion (<b>-</b>) para las que dejaste en blanco. Por ejemplo <b className="font-mono">abcb-ac</b>. Los espacios y las comas no importan.
          </p>
          <textarea
            value={texto}
            onChange={(e) => escribe(e.target.value)}
            rows={5}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label="Tus respuestas, de seguido"
            className={cx('w-full border-2 border-slate-300 bg-white p-3 font-mono text-base tracking-widest text-slate-900 outline-none focus:border-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white', RADIUS.md)}
          />
          {lectura && (
            <p role="status" className={cx('mt-2 flex items-center gap-1.5 text-sm font-semibold', lectura.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
              {lectura.ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
              {lectura.ok ? `${total} respuestas leídas.` : lectura.error}
            </p>
          )}
        </Card>
      )}

      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button onClick={entregar} disabled={enviando || (modo === 'escribir' && !!lectura && !lectura.ok)} icon={enviando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}>
          {enviando ? 'Corrigiendo…' : 'Entregar y corregir'}
        </Button>
        <Button variant="secondary" onClick={onCancelar} disabled={enviando}>Volver, sigo luego</Button>
      </div>
      <p className={cx(TEXT.muted)}>Lo que llevas se guarda en este dispositivo, así que puedes dejarlo y seguir más tarde.</p>
    </div>
  );
}

// ───────────────────────── LA SOLUCIÓN ─────────────────────────

function Revision({ revision, onVolver }: { revision: RevisionClase; onVolver: () => void }) {
  const [soloFalladas, setSoloFalladas] = useState(true);
  const visibles = revision.preguntas.filter((p) => !soloFalladas || p.flag !== 'ok');
  const nota = revision.nota;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6 animate-in fade-in duration-150">
      <Button variant="secondary" size="sm" onClick={onVolver}>← Mis exámenes</Button>

      <Card pad="lg" elevation="raised">
        <p className={cx(TEXT.label, 'text-slate-600 dark:text-slate-400')}>{revision.titulo}</p>
        {nota === null ? (
          <p className={cx(TEXT.muted)}>Sin nota.</p>
        ) : (
          <p className={cx(TEXT.display, nota >= 5 ? 'text-marino dark:text-oro-claro' : 'text-red-700 dark:text-red-300')}>{num(nota)}</p>
        )}
        <p className={cx(TEXT.muted)}>
          {revision.notaOficial
            ? 'Es la nota oficial que puso tu profesor.'
            : 'Es la nota que sale de las respuestas que metiste, con la fórmula de la convocatoria (cada dos fallos quitan un acierto). Si tu profesor pone la oficial, sustituye a esta.'}
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Aciertos" value={revision.aciertos} tone="success" />
        <StatTile label="Fallos" value={revision.fallos} tone={revision.fallos ? 'danger' : 'neutral'} />
        <StatTile label="En blanco" value={revision.blancos} />
      </div>

      <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
        <input type="checkbox" className="h-5 w-5" checked={soloFalladas} onChange={(e) => setSoloFalladas(e.target.checked)} />
        Ver solo las falladas y las que dejé en blanco ({revision.preguntas.filter((p) => p.flag !== 'ok').length})
      </label>

      {visibles.map((p) => (
        <Card key={p.n}>
          <p className={cx(TEXT.label, 'mb-2', p.flag === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : p.flag === 'blanco' ? 'text-slate-600 dark:text-slate-400' : 'text-red-700 dark:text-red-300')}>
            {p.n} · {p.tema} · {p.flag === 'ok' ? 'Acertada' : p.flag === 'blanco' ? 'En blanco' : 'Fallada'}
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-white">{p.enunciado}</p>
          <ul className="mt-3 space-y-2">
            {p.opciones.slice(0, OPCIONES_CLASE).map((o, k) => {
              const buena = k === p.correcta, mia = k === p.marcada;
              return (
                <li key={k} className={cx('flex items-start gap-2 border-2 px-3 py-2 text-sm', RADIUS.md,
                  buena ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : mia ? 'border-red-600 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-800')}>
                  <b className="shrink-0">{LETRAS_CLASE[k]})</b>
                  <span className="min-w-0 flex-1 text-slate-900 dark:text-white">{o}</span>
                  {buena && <Check size={16} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="Correcta" />}
                  {mia && !buena && <X size={16} className="mt-0.5 shrink-0 text-red-700 dark:text-red-300" aria-label="Tu respuesta" />}
                </li>
              );
            })}
          </ul>
          {(p.explicacion || p.referencia) && (
            <p className={cx(TEXT.body, 'mt-3 text-slate-700 dark:text-slate-300')}>
              {p.explicacion && <><strong>Por qué:</strong> {p.explicacion} </>}
              {p.referencia && <span className={cx(TEXT.muted)}>({p.referencia})</span>}
            </p>
          )}
        </Card>
      ))}
      {visibles.length === 0 && <p className={cx(TEXT.body, 'text-center text-slate-600 dark:text-slate-400')}>No hay ninguna fallada: examen limpio.</p>}
    </div>
  );
}
