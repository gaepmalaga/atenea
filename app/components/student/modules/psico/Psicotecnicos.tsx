'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Flag, Play, RotateCcw, Shapes, X } from 'lucide-react';
import { empiezaPsico, entregaPsico, getMisPsico, getRevisionPsico, getMisPsicoClase, empiezaPsicoClase, entregaPsicoClase, getRevisionPsicoClase } from '@/actions';
import type { MiPsicoClase } from '@/app/actions/psico-clase';
import { parseaRespuestasPsico } from '@/app/lib/psico-clase';
import type { RevisionPsico, SesionPsico, SesionPsicoHecha } from '@/app/actions/psico';
import {
  TIPOS_PSICO, TIPO_PSICO_LABEL, TIPO_PSICO_DESC, TAMANOS_PSICO, MINUTOS_PSICO, EJERCICIOS_PSICO, opcionesDe, textoPenalizacion,
  type NumeroEjercicio,
  type OpcionPsico, type PreguntaPsicoPublica, type ResultadoPsico, type TipoPsico,
} from '@/app/lib/psico';
import { Card, Button, SectionLabel, StatTile, OptionCard, EmptyState, TEXT, TAP, RADIUS, cx } from '../../../ui';
import FiguraPsico, { FichaDomino, RejillaPsico, FilaSimbolos, TablaSimbolos, CubosPsico, DesarrolloPsico, AgujerosPsico, FiguraGiro } from './FiguraPsico';

/**
 * PSICOTÉCNICOS (regla 117): elegir, hacer contra el reloj, y repasar.
 *
 * Tres pantallas en una: la configuración (qué tipos y cuántas), la sesión
 * (una pregunta cada vez, con 4 o 3 opciones como el examen, el reloj arriba) y el resultado (la
 * nota, por tipo, y cada pregunta con su explicación).
 *
 * El reloj se DERIVA de cuándo empezó (regla 14), no cuenta intervalos: si el
 * móvil se duerme un minuto, al volver marca lo que toca. Al llegar a cero se
 * entrega solo. Entregar a mano pide confirmación y no está junto a
 * «Siguiente» (regla 26).
 */

const LETRAS = ['A', 'B', 'C', 'D', 'E'];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Opcion({ opcion, letra, estado, onClick }: {
  opcion: OpcionPsico; letra: string; estado: 'libre' | 'marcada' | 'buena' | 'mala'; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={estado === 'marcada'}
      className={cx(
        'flex w-full items-center gap-3 border-2 px-3 py-2 text-left transition-colors',
        RADIUS.md, TAP,
        estado === 'marcada' && 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20',
        estado === 'buena' && 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20',
        estado === 'mala' && 'border-red-600 bg-red-50 dark:bg-red-900/20',
        estado === 'libre' && 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
      )}
    >
      <span className={cx(TEXT.hud, 'grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-current text-sm')}>{letra}</span>
      {opcion.celda
        ? <FiguraPsico celda={opcion.celda} className="h-12 w-[72px] text-slate-900 dark:text-white" />
        : opcion.ficha
        ? <FichaDomino ficha={opcion.ficha} className="h-[4.5rem] w-10 text-slate-900 dark:text-white" />
        : opcion.rejilla
        ? <RejillaPsico rejilla={opcion.rejilla} className="h-14 w-14 text-slate-900 dark:text-white" />
        : opcion.fila
        ? <FilaSimbolos fila={opcion.fila} />
        : opcion.agujeros
        ? <AgujerosPsico agujeros={opcion.agujeros} className="h-[4.5rem] w-[4.5rem] text-slate-900 dark:text-white" />
        : opcion.figura
        ? <FiguraGiro figura={opcion.figura} className="h-[5rem] w-[5rem] text-slate-900 dark:text-white" />
        : <span className="text-base font-semibold text-slate-900 dark:text-white">{opcion.texto}</span>}
      {estado === 'buena' && <Check size={18} className="ml-auto shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="Correcta" />}
      {estado === 'mala' && <X size={18} className="ml-auto shrink-0 text-red-700 dark:text-red-300" aria-label="Tu respuesta, incorrecta" />}
    </button>
  );
}

function Enunciado({ q }: { q: PreguntaPsicoPublica }) {
  // Una tabla de datos alinea las cifras a la derecha; una de texto (las órdenes) va a la izquierda.
  const esNumerica = !!q.tabla && q.tabla.filas.every((f) => f.slice(1).every((c) => /^-?\d+$|^X$/.test(c)));
  return (
    <>
      <p className="text-base font-bold text-slate-900 dark:text-white sm:text-lg">{q.enunciado}</p>
      {q.lineas && (
        <div className={cx('mt-3 space-y-1 overflow-x-auto bg-slate-100 p-3 dark:bg-slate-800', RADIUS.md)}>
          {q.lineas.map((l, i) => (
            <p key={i} className="whitespace-pre-wrap break-words font-mono text-base font-bold tabular-nums text-slate-900 dark:text-white sm:text-lg">
              {q.lineas!.length > 1 ? `${i + 1}.  ` : ''}{l}
            </p>
          ))}
        </div>
      )}
      {q.fichas && (
        <div className="mt-3 flex items-end justify-center gap-2 overflow-x-auto py-1" role="group" aria-label="La serie de fichas">
          {q.fichas.map((f, i) => (
            <FichaDomino key={i} ficha={f} className={cx('h-24 w-[52px] shrink-0 text-slate-900 dark:text-white', !f && 'text-indigo-600 dark:text-indigo-300')} />
          ))}
        </div>
      )}
      {q.rejilla && (
        <div className="mt-3 flex justify-center">
          <RejillaPsico rejilla={q.rejilla} className="h-28 w-28 text-slate-900 dark:text-white" />
        </div>
      )}
      {q.leyenda && <TablaSimbolos leyenda={q.leyenda} />}
      {q.cubos && (
        <div className="mt-3 flex flex-wrap items-end justify-center gap-4" role="group" aria-label="Las figuras de cubos">
          {q.cubos.map((f, i) => (
            <figure key={i} className="grid justify-items-center gap-1">
              <CubosPsico alturas={f} className="h-28 w-auto max-w-[9.5rem] text-slate-900 dark:text-white" />
              {q.cubos!.length > 1 && <figcaption className={cx(TEXT.hud, 'text-sm')}>{'ABC'[i]}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {q.desarrollo && <div className="mt-3 flex justify-center"><DesarrolloPsico desarrollo={q.desarrollo} className="h-auto max-h-36 w-full max-w-[17rem] text-slate-900 dark:text-white" /></div>}
      {q.figura && <div className="mt-3 flex justify-center"><FiguraGiro figura={q.figura} className="h-32 w-32 text-slate-900 dark:text-white" /></div>}
      {q.tabla && (
        <div className={cx('mt-3 overflow-x-auto border border-slate-200 dark:border-slate-700', RADIUS.md)}>
          <table className="w-full min-w-[16rem] border-collapse text-left text-sm tabular-nums">
            <thead>
              <tr className={cx('bg-slate-100 dark:bg-slate-800', !q.tabla.cabecera.some(Boolean) && 'hidden')}>
                {q.tabla.cabecera.map((c, i) => <th key={i} scope="col" className={cx('px-3 py-2 font-bold text-slate-900 dark:text-white', i > 0 && esNumerica && 'text-right')}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {q.tabla.filas.map((fila, i) => (
                <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                  {fila.map((c, k) => k === 0
                    ? <th key={k} scope="row" className="px-3 py-2 text-left font-semibold text-slate-900 dark:text-white">{c}</th>
                    : <td key={k} className={cx('px-3 text-slate-800 dark:text-slate-200', esNumerica ? 'py-2 text-right' : 'py-1.5 text-left text-[13px] leading-snug')}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.matriz && (
        <div className="mx-auto mt-3 grid max-w-xs grid-cols-3 gap-1.5" role="group" aria-label="La tabla de figuras">
          {q.matriz.map((c, i) => (
            <div key={i} className={cx('grid aspect-[3/2] place-items-center border-2', RADIUS.sm, c ? 'border-slate-300 dark:border-slate-700' : 'border-dashed border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20')}>
              <FiguraPsico celda={c} className="h-full w-full text-slate-900 dark:text-white" />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function Psicotecnicos() {
  const [tipos, setTipos] = useState<Set<TipoPsico>>(new Set(TIPOS_PSICO));
  const [total, setTotal] = useState<number>(TAMANOS_PSICO[0]);
  const [historial, setHistorial] = useState<SesionPsicoHecha[]>([]);
  /** Los exámenes que la academia ha puesto a mi turno (regla 127). */
  const [clase, setClase] = useState<MiPsicoClase[]>([]);
  /** Si lo que se está haciendo es uno de esos exámenes, su id: la entrega va por otro camino. */
  const claseRef = useRef<string | null>(null);
  const [hoja, setHoja] = useState<MiPsicoClase | null>(null);

  const [sesion, setSesion] = useState<SesionPsico | null>(null);
  const [respuestas, setRespuestas] = useState<number[]>([]);
  const [actual, setActual] = useState(0);
  const [restante, setRestante] = useState(0);
  const inicio = useRef(0);

  const [resultado, setResultado] = useState<{ r: ResultadoPsico; revision: RevisionPsico; duracionMs: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargaHistorial = useCallback(async () => {
    const res = await getMisPsico();
    if (res.success) setHistorial(res.sesiones);
  }, []);
  useEffect(() => { cargaHistorial(); }, [cargaHistorial]);
  const cargaClase = useCallback(async () => {
    const res = await getMisPsicoClase();
    if (res.success) setClase(res.examenes);
  }, []);
  useEffect(() => { cargaClase(); }, [cargaClase]);

  /** Empezar (o seguir) un examen de mi clase en la pantalla: el reloj es el del servidor. */
  async function empezarClase(id: string) {
    setOcupado(true);
    setError(null);
    const res = await empiezaPsicoClase(id);
    setOcupado(false);
    if (!res.success) { setError(res.error); return; }
    claseRef.current = id;
    inicio.current = Date.now();
    setRespuestas(Array(res.sesion.preguntas.length).fill(-1));
    setActual(0);
    setRestante(res.sesion.minutos * 60_000);
    setResultado(null);
    setSesion(res.sesion);
    window.scrollTo(0, 0);
  }

  async function repasarClase(id: string) {
    setOcupado(true);
    setError(null);
    const res = await getRevisionPsicoClase(id);
    setOcupado(false);
    if (!res.success) { setError(res.error); return; }
    setResultado({ r: res.resultado, revision: res.revision, duracionMs: res.duracionMs });
    window.scrollTo(0, 0);
  }

  /** Repasar una sesión ya entregada: las mismas preguntas, lo que marcó y por qué. */
  async function repasar(id: string) {
    setOcupado(true);
    setError(null);
    const res = await getRevisionPsico({ id });
    setOcupado(false);
    if (!res.success) { setError(res.error); return; }
    setResultado({ r: res.resultado, revision: res.revision, duracionMs: res.duracionMs });
    window.scrollTo(0, 0);
  }

  /** Libre (los tipos y el tamaño que elija) o un ejercicio del examen (todo fijo, lo pone el servidor). */
  async function empezar(ejercicio?: NumeroEjercicio) {
    setOcupado(true);
    setError(null);
    const res = await empiezaPsico(ejercicio ? { ejercicio } : { tipos: [...tipos], total });
    setOcupado(false);
    if (!res.success) { setError(res.error); return; }
    inicio.current = Date.now();
    setRespuestas(Array(res.sesion.preguntas.length).fill(-1));
    setActual(0);
    setRestante(res.sesion.minutos * 60_000);
    setResultado(null);
    setSesion(res.sesion);
    window.scrollTo(0, 0);
  }

  // Lo último marcado, para entregar desde el reloj sin leer un estado viejo (regla 13).
  const respuestasRef = useRef<number[]>([]);
  useEffect(() => { respuestasRef.current = respuestas; }, [respuestas]);
  const entregando = useRef(false);

  const entregar = useCallback(async (id: string) => {
    if (entregando.current) return;
    entregando.current = true;
    setOcupado(true);
    setError(null);
    const res = claseRef.current
      ? await entregaPsicoClase({ id: claseRef.current, respuestas: respuestasRef.current })
      : await entregaPsico({ id, respuestas: respuestasRef.current });
    entregando.current = false;
    setOcupado(false);
    if (!res.success) { setError(res.error); return; }
    setResultado({ r: res.resultado, revision: res.revision, duracionMs: res.duracionMs });
    setSesion(null);
    window.scrollTo(0, 0);
    if (claseRef.current) { claseRef.current = null; cargaClase(); } else cargaHistorial();
  }, [cargaHistorial, cargaClase]);

  // El reloj: se deriva de cuándo empezó. A cero, se entrega solo.
  useEffect(() => {
    if (!sesion) return;
    const duracion = sesion.minutos * 60_000;
    const tic = () => {
      const queda = duracion - (Date.now() - inicio.current);
      setRestante(queda);
      if (queda <= 0) entregar(sesion.id);
    };
    const t = setInterval(tic, 500);
    return () => clearInterval(t);
  }, [sesion, entregar]);

  const contestadas = respuestas.filter((r) => r !== -1).length;

  // Al cambiar de pregunta, arriba: si no, la siguiente empieza a medio leer.
  useEffect(() => { if (sesion) window.scrollTo(0, 0); }, [actual, sesion]);

  // ───────────────────────── LA SESIÓN ─────────────────────────
  if (sesion) {
    const q = sesion.preguntas[actual];
    const ultima = actual === sesion.preguntas.length - 1;
    const pocoTiempo = restante < 60_000;
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-6">
        <div className={cx('sticky top-0 z-10 -mx-1 flex items-center justify-between gap-3 bg-crema px-1 py-2 dark:bg-slate-950')}>
          <span className={cx(TEXT.label, 'text-slate-600 dark:text-slate-400')}>{TIPO_PSICO_LABEL[q.tipo]} · {actual + 1} de {sesion.preguntas.length}</span>
          <span role="timer" aria-live="off" className={cx(TEXT.hud, 'inline-flex items-center gap-1.5 text-base', pocoTiempo ? 'text-red-700 dark:text-red-300' : 'text-slate-900 dark:text-white')}>
            <Clock size={16} aria-hidden /> {mmss(restante)}
          </span>
        </div>

        <Card pad="lg">
          <Enunciado q={q} />
          {/* Las figuras, de dos en dos: en una columna la tabla y las opciones no cabían en la pantalla. */}
          <div className={cx('mt-4 grid gap-2', q.matriz || q.fichas || q.rejilla || q.opciones.some((o) => o.agujeros || o.figura) ? 'grid-cols-2' : 'grid-cols-1')}>
            {q.opciones.map((o, i) => (
              <Opcion
                key={i}
                opcion={o}
                letra={LETRAS[i]}
                estado={respuestas[actual] === i ? 'marcada' : 'libre'}
                // Tocar la marcada la quita: así se deja en blanco (regla 24).
                onClick={() => setRespuestas((prev) => prev.map((r, k) => (k === actual ? (r === i ? -1 : i) : r)))}
              />
            ))}
          </div>
          <p className={cx(TEXT.muted, 'mt-3')}>{textoPenalizacion(sesion.preguntas.map((x) => x.opciones.length))} Si dudas entre todas, déjala en blanco: toca otra vez la que marcaste.</p>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" disabled={actual === 0} onClick={() => setActual((a) => a - 1)} icon={<ArrowLeft size={16} />}>Anterior</Button>
          {!ultima && <Button onClick={() => setActual((a) => a + 1)} iconRight={<ArrowRight size={16} />}>Siguiente</Button>}
        </div>

        {/* El mapa: de un vistazo, cuáles faltan; y se salta a cualquiera. */}
        <Card>
          <SectionLabel>Preguntas · {contestadas} contestadas</SectionLabel>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
            {sesion.preguntas.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActual(i)}
                aria-label={`Pregunta ${i + 1}${respuestas[i] === -1 ? ', sin contestar' : ', contestada'}`}
                aria-current={i === actual}
                className={cx(
                  TEXT.hud, TAP, RADIUS.sm, 'border-2 text-sm',
                  i === actual ? 'border-indigo-600' : 'border-transparent',
                  respuestas[i] === -1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' : 'bg-indigo-600 text-white',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </Card>

        {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}

        {/* Entregar, aparte y con confirmación (regla 26). */}
        <div className="pt-4">
          <Button
            variant="secondary"
            disabled={ocupado}
            icon={<Flag size={16} />}
            onClick={() => {
              const faltan = sesion.preguntas.length - contestadas;
              if (confirm(faltan ? `Te quedan ${faltan} sin contestar. ¿Entregar ya?` : '¿Entregar la sesión?')) entregar(sesion.id);
            }}
          >
            {ocupado ? 'Entregando…' : 'Entregar'}
          </Button>
        </div>
      </div>
    );
  }

  // ───────────────────────── EL RESULTADO ─────────────────────────
  if (resultado) {
    const { r, revision } = resultado;
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-6 animate-in fade-in duration-150">
        {/* Sin cabecera propia: la de la pestaña ya dice dónde se está. */}
        <Card pad="lg" elevation="raised">
          <p className={cx(TEXT.label, 'text-slate-600 dark:text-slate-400')}>Tu nota · {r.total} preguntas en {mmss(resultado.duracionMs)}</p>
          <p className={cx(TEXT.display, r.nota >= 5 ? 'text-marino dark:text-oro-claro' : 'text-red-700 dark:text-red-300')}>{r.nota.toLocaleString('es-ES')}</p>
          <p className={cx(TEXT.muted)}>Sobre 10, descontando los fallos. {textoPenalizacion(revision.map((x) => x.opciones.length))}</p>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Aciertos" value={r.aciertos} tone="success" />
          <StatTile label="Fallos" value={r.fallos} tone={r.fallos ? 'danger' : 'neutral'} />
          <StatTile label="En blanco" value={r.blancos} />
        </div>

        <Card>
          <SectionLabel>Por tipo</SectionLabel>
          <ul className="space-y-2">
            {TIPOS_PSICO.filter((t) => r.porTipo[t]).map((t) => {
              const p = r.porTipo[t]!;
              return (
                <li key={t} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-white">{TIPO_PSICO_LABEL[t]}</span>
                  <span className={cx(TEXT.hud, 'text-sm')}>{p.a} de {p.t}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Button onClick={() => setResultado(null)} icon={<RotateCcw size={16} />}>Volver y hacer otra</Button>

        <SectionLabel>Repaso, pregunta a pregunta</SectionLabel>
        {revision.map((q, i) => (
          <Card key={i}>
            <p className={cx(TEXT.label, 'mb-2', q.marcada === q.correcta ? 'text-emerald-700 dark:text-emerald-300' : q.marcada === -1 ? 'text-slate-600 dark:text-slate-400' : 'text-red-700 dark:text-red-300')}>
              {i + 1} · {TIPO_PSICO_LABEL[q.tipo]} · {q.marcada === q.correcta ? 'Acertada' : q.marcada === -1 ? 'En blanco' : 'Fallada'}
            </p>
            <Enunciado q={q} />
            <div className="mt-3 space-y-2">
              {q.opciones.map((o, k) => (
                <Opcion key={k} opcion={o} letra={LETRAS[k]} estado={k === q.correcta ? 'buena' : k === q.marcada ? 'mala' : 'libre'} />
              ))}
            </div>
            <p className={cx(TEXT.body, 'mt-3 text-slate-700 dark:text-slate-300')}><strong>Por qué:</strong> {q.explicacion}</p>
          </Card>
        ))}
      </div>
    );
  }

  // ───────────────────────── LA CONFIGURACIÓN ─────────────────────────
  return <Configuracion {...{ tipos, setTipos, total, setTotal, historial, empezar, ocupado, error, repasar, clase, empezarClase, repasarClase, hoja, setHoja, onHojaEntregada: (r: { r: ResultadoPsico; revision: RevisionPsico; duracionMs: number }) => { setHoja(null); setResultado(r); cargaClase(); window.scrollTo(0, 0); } }} />;
}

function Configuracion({ tipos, setTipos, total, setTotal, historial, empezar, ocupado, error, repasar, clase, empezarClase, repasarClase, hoja, setHoja, onHojaEntregada }: {
  tipos: Set<TipoPsico>; setTipos: (f: (prev: Set<TipoPsico>) => Set<TipoPsico>) => void;
  total: number; setTotal: (n: number) => void;
  historial: SesionPsicoHecha[]; empezar: (ejercicio?: NumeroEjercicio) => void; ocupado: boolean; error: string | null;
  repasar: (id: string) => void;
  clase: MiPsicoClase[]; empezarClase: (id: string) => void; repasarClase: (id: string) => void;
  hoja: MiPsicoClase | null; setHoja: (e: MiPsicoClase | null) => void;
  onHojaEntregada: (r: { r: ResultadoPsico; revision: RevisionPsico; duracionMs: number }) => void;
}) {
  // Cómo va en cada tipo, sumando sus últimas sesiones.
  const porTipo = useMemo(() => {
    const suma = new Map<TipoPsico, { a: number; t: number }>();
    for (const s of historial) {
      for (const t of TIPOS_PSICO) {
        const p = s.porTipo[t];
        if (!p) continue;
        const x = suma.get(t) ?? { a: 0, t: 0 };
        x.a += p.a; x.t += p.t;
        suma.set(t, x);
      }
    }
    return suma;
  }, [historial]);

  const [modo, setModo] = useState<'examen' | 'libre'>('examen');

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6 animate-in fade-in duration-150">
      {(clase.length > 0 || hoja) && (
        <Card pad="lg">
          <SectionLabel>Los exámenes de tu clase</SectionLabel>
          {error && <p role="alert" className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {clase.map((e) => (
              <li key={e.id} className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{e.titulo}</p>
                    <p className={TEXT.muted}>
                      {new Date(`${e.fecha}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })} · {e.total} preguntas · {e.minutos} min
                    </p>
                    {e.estado === 'entregado' && e.aciertos !== null && <p className={TEXT.muted}>{e.aciertos} aciertos · {e.fallos} fallos · {e.blancos} en blanco</p>}
                    {e.estado === 'proximo' && <p className={TEXT.muted}>Todavía no es el día.</p>}
                    {e.estado === 'cerrado' && <p className={TEXT.muted}>No lo entregaste a tiempo.</p>}
                    {e.estado === 'pendiente' && e.cierre && <p className={TEXT.muted}>Puedes entregarlo hasta el {new Date(`${e.cierre}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.</p>}
                  </div>
                  {e.nota !== null && <span className={cx(TEXT.hud, 'text-lg', e.nota >= 5 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{e.nota.toLocaleString('es-ES')}</span>}
                </div>
                {e.estado === 'pendiente' && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={ocupado} icon={<Play size={14} />} onClick={() => empezarClase(e.id)}>{e.empezado ? 'Seguir' : 'Hacerlo ahora'} ({e.minutos} min)</Button>
                    <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => setHoja(e)}>Ya lo hice en papel</Button>
                  </div>
                )}
                {e.estado === 'entregado' && <Button size="sm" variant="secondary" disabled={ocupado} onClick={() => repasarClase(e.id)}>Ver la solución</Button>}
              </li>
            ))}
          </ul>
          {hoja && <PasarHoja examen={hoja} onCancelar={() => setHoja(null)} onEntregada={onHojaEntregada} />}
        </Card>
      )}

      {/* Dos maneras de hacerlo, y se elige una: así no se mezclan en la pantalla. */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Cómo quieres hacerlo">
        <OptionCard title="Simulacro del examen" description="Los 3 ejercicios del cuadernillo, con su tiempo. Para medirte." selected={modo === 'examen'} onClick={() => setModo('examen')} />
        <OptionCard title="Entrenar por tipos" description="Tú eliges qué tipos y cuántas. Para practicar lo que peor llevas." selected={modo === 'libre'} onClick={() => setModo('libre')} />
      </div>

      {modo === 'examen' && (
      <Card pad="lg">
        <SectionLabel>Simulacro del examen</SectionLabel>
        <p className={cx(TEXT.muted, 'mb-3')}>Igual que el examen real: las mismas preguntas, el mismo tiempo y las mismas opciones. Las preguntas son nuevas cada vez. Cada ejercicio se hace por separado.</p>
        <div className="grid gap-2">
          {([1, 2, 3] as const).map((n) => {
            const e = EJERCICIOS_PSICO[n];
            return (
              <button key={n} type="button" disabled={ocupado} onClick={() => empezar(n)}
                className={cx('flex w-full items-center justify-between gap-3 border-2 border-slate-200 bg-white px-3 py-2 text-left dark:border-slate-800 dark:bg-slate-900', RADIUS.md, TAP)}>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{e.nombre} · {e.descripcion}</span>
                  <span className={cx(TEXT.muted, 'block')}>{e.total} preguntas · {e.minutos} min · {opcionesDe(e.tipos[0])} opciones</span>
                </span>
                <Play size={16} className="shrink-0 text-marino dark:text-oro-claro" aria-hidden />
              </button>
            );
          })}
        </div>
      </Card>
      )}

      {modo === 'libre' && (
      <Card pad="lg">
        <SectionLabel>Entrenar por tipos</SectionLabel>
        <p className={cx(TEXT.body, 'mb-4 text-slate-700 dark:text-slate-300')}>Eliges los tipos de pregunta y cuántas hacer; el tiempo se ajusta solo. Preguntas nuevas cada vez: no hay nada que memorizar.</p>
        <SectionLabel>Qué entrenar</SectionLabel>
        <div className="grid gap-2 sm:grid-cols-2">
          {TIPOS_PSICO.map((t) => {
            const p = porTipo.get(t);
            return (
              <OptionCard
                key={t}
                title={TIPO_PSICO_LABEL[t]}
                description={`${TIPO_PSICO_DESC[t]}${p && p.t ? ` Llevas un ${Math.round((p.a / p.t) * 100)} % de acierto.` : ''}`}
                selected={tipos.has(t)}
                onClick={() => setTipos((prev) => {
                  const n = new Set(prev);
                  if (n.has(t)) { if (n.size > 1) n.delete(t); } else n.add(t);
                  return n;
                })}
              />
            );
          })}
        </div>

        <div className="mt-5">
          <SectionLabel>Cuántas preguntas</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {TAMANOS_PSICO.map((n) => (
              <OptionCard key={n} title={String(n)} description={`${MINUTOS_PSICO[n]} min`} selected={total === n} onClick={() => setTotal(n)} />
            ))}
          </div>
        </div>

        {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}

        <div className="mt-5">
          <Button onClick={() => empezar()} disabled={ocupado} icon={<Play size={16} />}>{ocupado ? 'Preparando…' : 'Empezar'}</Button>
        </div>
        <p className={cx(TEXT.muted, 'mt-3')}>Cuatro opciones por pregunta, como en el examen. Cada fallo resta según las opciones; los blancos no restan.</p>
      </Card>
      )}

      <Card>
        <SectionLabel>Mis últimas sesiones</SectionLabel>
        {error && historial.length > 0 && <p role="alert" className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
        {historial.length === 0 ? (
          <EmptyState icon={<Shapes size={36} />} title="Todavía no has hecho ninguna" hint="Cuando entregues la primera, aquí verás tus notas." />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {historial.slice(0, 10).map((s) => {
              const nota = s.nota;
              return (
                <li key={s.id}>
                  <button type="button" disabled={ocupado} onClick={() => repasar(s.id)} aria-label={`Repasar la sesión del ${new Date(s.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`}
                    className={cx('flex w-full items-center justify-between gap-3 py-2.5 text-left', TAP)}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(s.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {s.total} preguntas
                    </p>
                    <p className={cx(TEXT.muted, 'truncate')}>{s.aciertos} aciertos · {s.fallos} fallos · {s.blancos} en blanco</p>
                  </div>
                  <span className={cx(TEXT.hud, 'text-lg', nota >= 5 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{nota.toLocaleString('es-ES')}</span>
                  <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}


/**
 * Pasar a la plataforma la hoja de respuestas que se hizo en papel: se escriben
 * de seguido («abcd-ab…», con `-` para el blanco). Si no salen EXACTAMENTE las
 * que son, no se corrige: un desfase de una lo descuadraría todo (regla 118).
 */
function PasarHoja({ examen, onCancelar, onEntregada }: {
  examen: MiPsicoClase; onCancelar: () => void;
  onEntregada: (r: { r: ResultadoPsico; revision: RevisionPsico; duracionMs: number }) => void;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const parseo = texto.trim() ? parseaRespuestasPsico(texto, examen.opciones) : null;

  async function entrega() {
    const p = parseaRespuestasPsico(texto, examen.opciones);
    if (!p.ok) { setError(p.error); return; }
    if (!confirm('¿Entregar estas respuestas? Solo se puede una vez.')) return;
    setEnviando(true);
    setError(null);
    const res = await entregaPsicoClase({ id: examen.id, respuestas: p.respuestas, via: 'hoja' });
    setEnviando(false);
    if (!res.success) { setError(res.error); return; }
    onEntregada({ r: res.resultado, revision: res.revision, duracionMs: res.duracionMs });
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="text-sm font-bold text-slate-900 dark:text-white">Tus respuestas de «{examen.titulo}»</p>
      <p className={TEXT.muted}>Escríbelas de seguido, una letra por pregunta, y un guion (-) para las que dejaste en blanco. Son {examen.total}: por ejemplo «abcd-ab…».</p>
      <textarea
        value={texto} onChange={(e) => { setTexto(e.target.value); setError(null); }} rows={3} spellCheck={false} autoCapitalize="none" autoCorrect="off"
        aria-label="Tus respuestas de la hoja"
        className={cx('w-full border-2 border-slate-300 bg-white p-3 font-mono text-base tracking-widest text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white', RADIUS.md)}
      />
      {parseo?.ok && <p className={cx(TEXT.muted, 'font-semibold text-emerald-700 dark:text-emerald-300')}>{parseo.respuestas.length} respuestas, {parseo.respuestas.filter((x) => x === -1).length} en blanco.</p>}
      {(error || (parseo && !parseo.ok)) && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error ?? (parseo && !parseo.ok ? parseo.error : '')}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={enviando || !parseo?.ok} onClick={entrega}>{enviando ? 'Entregando…' : 'Entregar'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </div>
  );
}
