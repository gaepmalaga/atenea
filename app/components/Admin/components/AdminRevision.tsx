'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Loader2, Pencil, Save, Scale, SkipForward, Trash2, ExternalLink, ClipboardCheck, XCircle } from 'lucide-react';
import {
  getBandejaRevision, getParaRevisar, setSoloRevisadas, getPropuestas, aprobarPropuesta, aprobarCambiosMecanicos, rechazarPropuesta,
  marcarRevisada, approveQuestion, disableQuestion, updateQuestion, resolverAvisosLey, getOfficialSyllabus, resolveReport,
} from '@/actions';
import type { BandejaRevision, PreguntaParaRevisar } from '@/app/actions/revision';
import type { PropuestaParaRevisar } from '@/app/actions/moderation';
import type { SyllabusSubject } from '@/app/actions/admin';
import { PanelTitulo, Pestanas, Hoja, BloqueTitulo, Rotulo, Aviso, Boton, Etiqueta, CampoSelect, Conmutador, PanelLateral, EmptyState, TEXT, cx } from '../../ui';
import EditorPregunta, { type FormPregunta } from './EditorPregunta';
import AdminModeration from './AdminModeration';
import { NOMBRE_ORIGEN, QUE_SE_REVISA, type OrigenPropuesta, type FuentePregunta } from '@/app/lib/revision';
/** Los bloques que se pueden elegir al revisar: las dos fuentes y lo publicado sin lectura individual. */
type Bloque = FuentePregunta | 'sin_leer';
import { separaEnlaceOficial } from '@/app/lib/normativa';
import { DIFFICULTY_LABEL, origenDeDificultad, type DifficultyLevel } from '@/app/lib/questions';
import { estaCompleta, textoFaltan, etiquetasQueFaltan } from '@/app/lib/preguntas-edicion';
import { avisar, confirmar, pedirTexto } from '@/app/lib/dialogos';

/**
 * «REVISIÓN»: TODO LO QUE ESPERA A UN TUTOR (regla 138).
 *
 * La última palabra sobre cada pregunta es de un tutor (hoy, cualquier admin).
 * Aquí está junto lo que hay que decidir —pendientes, preguntas del banco que
 * nadie ha revisado, cambios propuestos, cambios en la ley, quejas— y lo que
 * ha pasado («Novedades»), para que nadie se entere tarde de nada.
 */
type Seccion = 'resumen' | 'revisar' | 'propuestas' | 'ley' | 'ia' | 'quejas';
/** Las listas por tipo de aviso salen del resumen: el tutor trabaja desde «Revisar», que ya enseña cada aviso en su pregunta. */
const LISTAS_APARTE: Seccion[] = ['propuestas', 'ley', 'ia'];
/** Por dónde empieza «Revisar»: un tema y/o un bloque (los pone el resumen al pulsar un número). */
type Foco = { subjectId: number | null; fuente: Bloque | null };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default function AdminRevision() {
  const [seccion, setSeccion] = useState<Seccion>('resumen');
  const [foco, setFoco] = useState<Foco>({ subjectId: null, fuente: null });
  const [bandeja, setBandeja] = useState<BandejaRevision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carga = useCallback(async () => {
    const r = await getBandejaRevision();
    if (r.success) { setBandeja(r.data); setError(null); } else setError(r.error);
  }, []);
  useEffect(() => { carga(); }, [carga]);

  const b = bandeja;
  return (
    <div className="space-y-5 pb-24">
      <PanelTitulo titulo="Revisión" sub="Lo que ya ven los alumnos y lo que falta por revisar." />
      <Pestanas
        etiqueta="Qué revisar"
        activa={LISTAS_APARTE.includes(seccion) ? 'resumen' : seccion}
        onCambia={(s) => { if (s === 'revisar') setFoco({ subjectId: null, fuente: null }); setSeccion(s); }}
        items={[
          { id: 'resumen', etiqueta: 'Resumen' },
          { id: 'revisar', etiqueta: 'Revisar', cuenta: b ? b.resumen.publicadasPendientes + b.resumen.sinPublicar : undefined },
          { id: 'quejas', etiqueta: 'Quejas', cuenta: b?.quejas },
        ]}
      />
      {LISTAS_APARTE.includes(seccion) && <Boton variant="ghost" size="sm" onClick={() => setSeccion('resumen')}>← Volver al resumen</Boton>}
      {error && <Aviso tono="malo"><p>{error}</p></Aviso>}
      {seccion === 'resumen' && <Resumen bandeja={b} onIr={setSeccion} onRevisar={(f) => { setFoco(f); setSeccion('revisar'); }} onCambio={carga} />}
      {seccion === 'revisar' && <Revisor key={`${foco.subjectId}-${foco.fuente}`} inicial={foco} onCambio={carga} />}
      {seccion === 'propuestas' && <Propuestas onCambio={carga} total={b?.propuestas ?? 0} />}
      {seccion === 'ley' && <AdminModeration soloTipo="ley" onCambio={carga} />}
      {seccion === 'ia' && <AdminModeration soloTipo="ia" onCambio={carga} />}
      {seccion === 'quejas' && <AdminModeration soloTipo="quejas" onCambio={carga} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen y novedades
// ---------------------------------------------------------------------------

function Resumen({ bandeja, onIr, onRevisar, onCambio }: { bandeja: BandejaRevision | null; onIr: (s: Seccion) => void; onRevisar: (f: Foco) => void; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false);
  if (!bandeja) {
    return <div className="flex items-center gap-2 py-16 text-slate-600 dark:text-slate-400"><Loader2 className="animate-spin" size={18} /> Cargando la bandeja…</div>;
  }
  const b = bandeja;
  const r = b.resumen;
  const faltan = r.publicadasPendientes + r.sinPublicar;
  const totalBanco = r.revisadas + faltan + r.publicadasSinLeer;
  const porcentaje = totalBanco ? Math.round((r.revisadas / totalBanco) * 100) : null;

  async function alternaSoloRevisadas() {
    const activar = !b.soloRevisadas;
    const aviso = activar
      ? 'Los alumnos solo recibirán las preguntas revisadas, las de la academia y las publicadas sin leer. El resto de las escritas por la IA deja de servirse hasta que un tutor las revise. ¿Activar?'
      : `Los alumnos volverán a recibir también las ${b.resumen.porRevisar.ia} escritas por la IA que ningún tutor ha revisado. ¿Desactivar?`;
    if (!(await confirmar(aviso))) return;
    setGuardando(true);
    const r = await setSoloRevisadas(activar);
    setGuardando(false);
    if (!r.success) { void avisar(r.error); return; }
    onCambio();
  }

  return (
    <div className="space-y-5">
      <Hoja pad="md" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 rounded-xl border border-emerald-600/30 bg-emerald-50 p-4 dark:bg-emerald-500/10">
            <p className="font-titulo text-4xl font-black leading-none text-slate-900 dark:text-white">{r.publicadas.toLocaleString('es-ES')}</p>
            <p className="font-semibold text-slate-900 dark:text-white">Publicadas · los alumnos ya las ven</p>
            <p className={TEXT.muted}>
              <b>{r.revisadas.toLocaleString('es-ES')}</b> revisadas del todo
              {r.publicadasPendientes > 0 && <> · <b>{r.publicadasPendientes.toLocaleString('es-ES')}</b> de la academia con la explicación pendiente de revisar</>}
              {r.publicadasSinLeer > 0 && <> · <b>{r.publicadasSinLeer.toLocaleString('es-ES')}</b> escritas por la IA, publicadas sin leer una a una (no tienen avisos y llevan referencia legal)</>}.
            </p>
          </div>
          <div className="space-y-1.5 rounded-xl border border-amber-600/30 bg-amber-50 p-4 dark:bg-amber-500/10">
            <p className="font-titulo text-4xl font-black leading-none text-slate-900 dark:text-white">{r.sinPublicar.toLocaleString('es-ES')}</p>
            <p className="font-semibold text-slate-900 dark:text-white">Sin publicar · los alumnos aún no las ven</p>
            <p className={TEXT.muted}>Las escribió la IA. Se publican cuando un tutor las revisa enteras.</p>
          </div>
        </div>
        <p className="text-sm text-slate-900 dark:text-slate-100">
          <b>Lo que más urge ({faltan.toLocaleString('es-ES')}):</b> {r.publicadasPendientes.toLocaleString('es-ES')} explicaciones de preguntas ya publicadas y {r.sinPublicar.toLocaleString('es-ES')} preguntas sin publicar.
          {r.publicadasSinLeer > 0 && <> Además, <b>{r.publicadasSinLeer.toLocaleString('es-ES')}</b> publicadas sin leer: se miran si llega una queja de un alumno o cuando haya tiempo.</>}
        </p>
        {porcentaje !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-hundido dark:bg-noche-hondo" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Preguntas revisadas">
              <div className="h-full bg-emerald-600" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className={`${TEXT.muted} mt-1.5`}>{r.revisadas.toLocaleString('es-ES')} de {totalBanco.toLocaleString('es-ES')} revisadas del todo ({porcentaje} %).</p>
          </div>
        )}
        {faltan > 0 && <Boton icon={<ClipboardCheck size={15} />} onClick={() => onRevisar({ subjectId: null, fuente: null })}>Seguir revisando</Boton>}
      </Hoja>

      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo>Por tema</BloqueTitulo>
        <p className={TEXT.muted}>
          Pulsa un botón para revisar esas preguntas. <b>Explicaciones</b>: ya publicadas (de la academia), solo falta su explicación. <b>Sin publicar</b>: escritas por la IA; se publican al revisarlas enteras.
        </p>
        <ol className="divide-y divide-linea dark:divide-noche-linea">
          {r.porTema.map((t) => (
            <li key={t.subjectId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <div className="min-w-0 flex-1 basis-56">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">Tema {t.numero}: {t.titulo}</p>
                <p className="text-[12.5px] text-slate-600 dark:text-slate-400">
                  Publicadas {t.publicadas.toLocaleString('es-ES')} ({t.revisadas.toLocaleString('es-ES')} revisadas del todo{t.sinLeer > 0 ? `, ${t.sinLeer.toLocaleString('es-ES')} sin leer` : ''}) · Sin publicar {t.sinPublicar.toLocaleString('es-ES')}
                </p>
              </div>
              <div className="flex gap-2">
                {t.academia > 0 && <Boton size="sm" variant="secondary" onClick={() => onRevisar({ subjectId: t.subjectId, fuente: 'academia' })} title="Ya publicadas: solo falta revisar su explicación">Explicaciones · {t.academia}</Boton>}
                {t.ia > 0 && <Boton size="sm" variant="secondary" onClick={() => onRevisar({ subjectId: t.subjectId, fuente: 'ia' })} title="Escritas por la IA: se publican al revisarlas enteras">{b.soloRevisadas ? 'Sin publicar' : 'Escritas por la IA'} · {t.ia}</Boton>}
                {t.sinLeer > 0 && <Boton size="sm" variant="ghost" onClick={() => onRevisar({ subjectId: t.subjectId, fuente: 'sin_leer' })} title="Publicadas sin leer una a una">Sin leer · {t.sinLeer}</Boton>}
                {t.academia + t.ia + t.sinLeer === 0 && <Etiqueta tono="ok">Revisado</Etiqueta>}
              </div>
            </li>
          ))}
        </ol>
      </Hoja>

      {(b.propuestas > 0 || b.avisosLey > 0 || b.dudasIA > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={TEXT.muted}>Otras listas:</span>
          {b.propuestas > 0 && <Boton size="sm" variant="ghost" onClick={() => onIr('propuestas')}>Cambios propuestos · {b.propuestas.toLocaleString('es-ES')}</Boton>}
          {b.avisosLey > 0 && <Boton size="sm" variant="ghost" onClick={() => onIr('ley')}>Cambios en la ley · {b.avisosLey}</Boton>}
          {b.dudasIA > 0 && <Boton size="sm" variant="ghost" onClick={() => onIr('ia')}>La IA duda · {b.dudasIA}</Boton>}
        </div>
      )}

      <Hoja pad="md" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white">Los alumnos solo reciben preguntas revisadas</p>
            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
              {b.soloRevisadas
                ? 'Activado: los alumnos ven las revisadas por un tutor, las de la academia (aunque su explicación esté por revisar) y las que se publicaron sin leer una a una. El resto de las escritas por la IA no se ve hasta revisarlas.'
                : `Desactivado: los alumnos ven también las ${r.porRevisar.ia} escritas por la IA que nadie ha revisado. Actívalo antes de que entren los alumnos.`}
            </p>
          </div>
          <Conmutador activo={b.soloRevisadas} etiqueta="Los alumnos solo reciben preguntas revisadas" disabled={guardando} onChange={alternaSoloRevisadas} />
        </div>
      </Hoja>

      <Hoja pad="md" className="space-y-3">
        <BloqueTitulo>Novedades</BloqueTitulo>
        {b.novedades.length === 0 ? (
          <p className={TEXT.muted}>Nada en los últimos 45 días.</p>
        ) : (
          <ol className="divide-y divide-linea dark:divide-noche-linea">
            {b.novedades.map((n, i) => (
              <li key={i} className="flex gap-3 py-2.5">
                <span className="w-14 shrink-0 font-mono text-[11px] leading-5 text-slate-600 dark:text-slate-400">{fechaCorta(n.fecha)}<br />{horaCorta(n.fecha)}</span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 dark:text-slate-100">{n.titulo}{n.autor && <span className="text-slate-600 dark:text-slate-400"> · {n.autor}</span>}</p>
                  {n.detalle && <p className="break-words text-[13px] text-slate-600 dark:text-slate-400">{n.detalle}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Hoja>
    </div>
  );
}

// ---------------------------------------------------------------------------
// El revisor, una a una
// ---------------------------------------------------------------------------

function Revisor({ inicial, onCambio }: { inicial: Foco; onCambio: () => void }) {
  const [fuente, setFuente] = useState<Bloque | null>(inicial.fuente);
  const [tema, setTema] = useState<number | null>(inicial.subjectId);
  const [temas, setTemas] = useState<SyllabusSubject[]>([]);
  const [p, setP] = useState<PreguntaParaRevisar | null>(null);
  const [quedan, setQuedan] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormPregunta>({ question_text: '', options: ['', '', ''], correct_index: 0, explanation: '' });
  const [nivel, setNivel] = useState<DifficultyLevel | 0>(0);

  useEffect(() => {
    getOfficialSyllabus().then((r) => { if (r.success && r.syllabus) setTemas(r.syllabus.flatMap((bl) => bl.subjects)); });
  }, []);

  const siguiente = useCallback(async (despuesDe?: string, incluida = false) => {
    setCargando(true);
    setError(null);
    const r = await getParaRevisar({ fuente: fuente ?? undefined, subjectId: tema ?? undefined, despuesDe, incluida });
    setCargando(false);
    if (!r.success) { setError(r.error); return; }
    setP(r.pregunta);
    setQuedan(r.quedan);
  }, [fuente, tema]);
  useEffect(() => { siguiente(); }, [siguiente]);

  async function hecho(res: { success: boolean; error?: string }) {
    setTrabajando(false);
    if (!res.success) { setError(res.error ?? 'No se pudo guardar.'); return; }
    onCambio();
    await siguiente(p?.id);
  }

  async function darPorBuena() {
    if (!p) return;
    setTrabajando(true);
    await hecho(p.status === 'candidate' ? await approveQuestion(p.id) : await marcarRevisada(p.id));
  }
  /** «La IA se equivoca»: el tutor ha mirado la duda y la pregunta está bien. */
  async function iaSeEquivoca() {
    if (!p) return;
    setTrabajando(true);
    for (const d of p.dudasIA) {
      const r = await resolveReport(d.id);
      if (!r.success) { setTrabajando(false); setError(r.error ?? 'No se pudo archivar la duda.'); return; }
    }
    setTrabajando(false);
    setP({ ...p, dudasIA: [] });
    onCambio();
  }
  /** El cambio propuesto, decidido aquí mismo: aceptado, la pregunta se queda ya cambiada para darla por buena. */
  async function aceptaPropuesta() {
    if (!p?.propuesta) return;
    setTrabajando(true);
    const r = await aprobarPropuesta(p.propuesta.id);
    setTrabajando(false);
    onCambio();
    if (!r.success) {
      // Se vuelve a leer tal como está (si la propuesta ya no valía, se ha descartado sola) y se enseña por qué.
      await siguiente(p.id, true);
      setError(r.error ?? 'No se pudo aplicar el cambio.');
      return;
    }
    const d = p.propuesta.despues;
    const cambiaNivel = d.difficulty_level !== undefined && d.difficulty_level !== p.difficulty_level;
    setP({
      ...p, ...d, options: d.options ?? p.options,
      difficulty_source: cambiaNivel ? (p.propuesta.origen === 'dificultad' ? 'medida' : 'preparador') : p.difficulty_source,
      propuesta: null,
    });
  }
  async function rechazaPropuesta() {
    if (!p?.propuesta) return;
    const nota = await pedirTexto('¿Por qué no? (opcional: queda anotado)');
    if (nota === null) return;
    setTrabajando(true);
    const r = await rechazarPropuesta(p.propuesta.id, nota);
    setTrabajando(false);
    if (!r.success) { setError(r.error ?? 'No se pudo rechazar.'); return; }
    setP({ ...p, propuesta: null });
    onCambio();
  }
  async function sigueVigente() {
    if (!p) return;
    setTrabajando(true);
    const r = await resolverAvisosLey(p.id);
    setTrabajando(false);
    if (!r.success) { setError(r.error ?? 'No se pudo cerrar el aviso.'); return; }
    setP({ ...p, avisosLey: [] });
    onCambio();
  }
  async function descartar() {
    if (!p || !(await confirmar('¿Descartar esta pregunta? Deja de servirse a los alumnos. No se borra: se puede reactivar desde «Banco oficial».'))) return;
    setTrabajando(true);
    await hecho(await disableQuestion(p.id));
  }
  function abreEditor() {
    if (!p) return;
    setForm({ question_text: p.question_text, options: [...p.options], correct_index: p.correct_index, explanation: p.explanation ?? '' });
    setNivel(([1, 2, 3] as number[]).includes(p.difficulty_level ?? 0) ? (p.difficulty_level as DifficultyLevel) : 0);
    setEditando(true);
  }
  async function guardaEdicion() {
    if (!p) return;
    setTrabajando(true);
    const cambiaNivel = nivel !== 0 && nivel !== p.difficulty_level;
    const r = await updateQuestion(p.id, cambiaNivel ? { ...form, difficulty_level: nivel } : form);
    if (!r.success) { setTrabajando(false); setError(r.error ?? 'No se pudo guardar.'); return; }
    // Corregirla con un aviso de la ley o una duda de la IA abiertos ES la respuesta al aviso.
    if (p.avisosLey.length) await resolverAvisosLey(p.id);
    for (const d of p.dudasIA) await resolveReport(d.id);
    setTrabajando(false);
    setEditando(false);
    onCambio();
    // Una pendiente corregida sigue pendiente: se vuelve a enseñar ya corregida, para publicarla.
    if (p.status === 'candidate') { setP({ ...p, ...form, difficulty_level: cambiaNivel ? nivel : p.difficulty_level, avisosLey: [], dudasIA: [] }); return; }
    await siguiente(p.id);
  }

  const completa = p ? estaCompleta(p) : false;
  const bloqueada = !!p && (p.avisosLey.length > 0 || p.dudasIA.length > 0 || !!p.propuesta);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect aria-label="De quién son" value={fuente ?? ''} onChange={(e) => setFuente(e.target.value === 'academia' || e.target.value === 'ia' || e.target.value === 'sin_leer' ? e.target.value : null)}>
          <option value="">Lo que más urge</option>
          <option value="academia">Explicaciones (academia)</option>
          <option value="ia">Sin publicar (IA)</option>
          <option value="sin_leer">Publicadas sin leer (IA)</option>
        </CampoSelect>
        <CampoSelect aria-label="Tema" value={tema ?? ''} onChange={(e) => setTema(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Todos los temas</option>
          {temas.map((s) => <option key={s.id} value={s.id}>Tema {s.number}: {s.title.substring(0, 40)}</option>)}
        </CampoSelect>
      </div>

      {error && <Aviso tono="malo"><p>{error}</p></Aviso>}

      {cargando ? (
        <div className="flex items-center gap-2 py-16 text-slate-600 dark:text-slate-400"><Loader2 className="animate-spin" size={18} /> Buscando la siguiente…</div>
      ) : !p ? (
        <EmptyState icon={<CheckCircle2 size={36} />} title={tema || fuente ? 'No queda nada por revisar aquí.' : 'No queda nada por revisar. Todo está revisado.'} hint={tema || fuente ? 'Prueba con «Todos los temas» o con las dos clases de pregunta.' : undefined} bordered />
      ) : (
        <Hoja pad="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Etiqueta tono={p.fuente === 'academia' ? 'oro' : 'neutro'}>{QUE_SE_REVISA[p.fuente].etiqueta}</Etiqueta>
              <Etiqueta tono={p.publicada ? 'ok' : 'aviso'}>{p.sinLeer ? 'Publicada sin leer: los alumnos la ven' : p.publicada ? 'Publicada: los alumnos ya la ven' : 'Sin publicar: los alumnos aún no la ven'}</Etiqueta>
              {p.tema !== null && <Etiqueta tono="apagado">Tema {p.tema}</Etiqueta>}
            </span>
            {quedan !== null && <span className="text-[13px] text-slate-600 dark:text-slate-400">Quedan {quedan}</span>}
          </div>

          {p.fuente === 'academia'
            ? <Aviso tono="info"><p>Esta pregunta <b>ya está publicada</b>: los alumnos la ven. La pregunta y su respuesta son de la academia; solo falta que revises su <b>explicación</b> y la referencia.</p></Aviso>
            : p.sinLeer
              ? <Aviso tono="info"><p>Los alumnos <b>ya la ven</b>. Se publicó sin leerla una a una porque no tenía ningún aviso y lleva referencia legal. Ningún tutor la ha leído: revísala entera si quieres confirmarla, o si un alumno la reporta.</p></Aviso>
              : <Aviso tono="info"><p>{p.publicada ? 'Los alumnos ya la ven; falta que un tutor la revise entera.' : 'Los alumnos aún no la ven. Al darla por buena, se publica.'}</p></Aviso>}
          <p className="text-base font-medium leading-relaxed text-slate-900 dark:text-slate-100">{p.question_text}</p>

          <ol className="space-y-1.5">
            {p.options.map((o, i) => (
              <li key={i} className={cx('flex items-start gap-2 rounded-lg px-3 py-2 text-[14px]', i === p.correct_index
                ? 'bg-emerald-100 font-medium text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'bg-hundido text-slate-700 dark:bg-noche-hondo dark:text-slate-300')}>
                <b className="font-titulo text-base">{'ABC'[i]}</b> <span className="min-w-0">{o}</span>
                {i === p.correct_index && <CheckCircle2 size={15} className="ml-auto mt-0.5 shrink-0" aria-label="Correcta" />}
              </li>
            ))}
          </ol>

          <div className="space-y-1">
            <Rotulo>Explicación</Rotulo>
            <p className="text-[14px] leading-relaxed text-slate-800 dark:text-slate-200">{p.explanation || <span className="text-amber-800 dark:text-amber-300">Sin explicación</span>}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            <span><span className="text-slate-600 dark:text-slate-400">Referencia: </span>{p.legal_reference || <span className="text-amber-800 dark:text-amber-300">sin referencia legal</span>}</span>
            <span><span className="text-slate-600 dark:text-slate-400">Dificultad: </span>{[1, 2, 3].includes(p.difficulty_level ?? 0) ? DIFFICULTY_LABEL[p.difficulty_level as DifficultyLevel] : 'sin poner'} <span className="text-slate-600 dark:text-slate-400">· {origenDeDificultad(p.difficulty_source)}</span></span>
          </div>

          {p.avisosLey.map((a) => {
            const av = separaEnlaceOficial(a.message);
            return (
              <Aviso key={a.id}>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest">Cambio en la ley</p>
                  <p className="break-words">{av.texto}</p>
                  {av.url && <a href={av.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold underline underline-offset-2">Ver el texto en el {av.fuente} <ExternalLink size={13} /></a>}
                </div>
              </Aviso>
            );
          })}
          {p.dudasIA.map((a) => {
            const av = separaEnlaceOficial(a.message);
            return (
              <Aviso key={a.id} tono="malo">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest">La IA duda</p>
                  <p className="break-words">{av.texto}</p>
                  {av.url && <a href={av.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 font-semibold underline underline-offset-2">Ver el texto en el {av.fuente} <ExternalLink size={13} /></a>}
                </div>
              </Aviso>
            );
          })}
          {p.propuesta && (
            <div className="space-y-3 rounded-xl border border-oro/60 bg-oro/5 p-3 dark:bg-oro/10">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-slate-100">Cambio propuesto</p>
                <Etiqueta tono="oro">{NOMBRE_ORIGEN[p.propuesta.origen as OrigenPropuesta] ?? p.propuesta.origen}</Etiqueta>
              </div>
              {p.propuesta.motivo && <p className="text-[13.5px] text-slate-900 dark:text-slate-100">{p.propuesta.motivo}</p>}
              {!p.propuesta.vigente && <Aviso tono="malo"><p>La pregunta ha cambiado desde que se propuso: este cambio ya no vale. Recházalo.</p></Aviso>}
              {p.propuesta.cambios.map((c) => (
                <div key={c.campo} className="space-y-1">
                  <Rotulo>{c.nombre}</Rotulo>
                  <p className="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 line-through decoration-red-400/70 dark:bg-red-500/10 dark:text-red-200">{c.antes}</p>
                  <p className="whitespace-pre-line rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{c.despues}</p>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {p.propuesta.vigente && <Boton size="sm" icon={<CheckCircle2 size={14} />} onClick={aceptaPropuesta} disabled={trabajando}>Aceptar el cambio</Boton>}
                <Boton size="sm" variant="secondary" icon={<XCircle size={14} />} onClick={rechazaPropuesta} disabled={trabajando}>Rechazar el cambio</Boton>
              </div>
              <p className={TEXT.muted}>Decídelo antes de darla por buena. Aceptarlo cambia la pregunta, pero no la da por revisada: eso lo haces tú al verla entera.</p>
            </div>
          )}
          {p.status === 'candidate' && !completa && <Aviso tono="info"><p>{textoFaltan(etiquetasQueFaltan(p))}: complétala con «Corregir» antes de publicarla.</p></Aviso>}

          <div className="flex flex-wrap gap-2 border-t border-linea pt-4 dark:border-noche-linea">
            <Boton onClick={darPorBuena} disabled={trabajando || bloqueada || (p.status === 'candidate' && !completa)}
              icon={trabajando ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}>
              {p.status === 'candidate' ? 'Está bien: publicar' : p.sinLeer ? 'Está bien: revisada' : QUE_SE_REVISA[p.fuente].boton}
            </Boton>
            <Boton variant="secondary" icon={<Pencil size={15} />} onClick={abreEditor} disabled={trabajando}>Corregir</Boton>
            {p.avisosLey.length > 0 && <Boton variant="secondary" icon={<Scale size={15} />} onClick={sigueVigente} disabled={trabajando}>Sigue vigente</Boton>}
            {p.dudasIA.length > 0 && <Boton variant="secondary" icon={<XCircle size={15} />} onClick={iaSeEquivoca} disabled={trabajando} title="La has mirado y la pregunta está bien">La IA se equivoca</Boton>}
            <Boton variant="ghost" icon={<SkipForward size={15} />} onClick={() => siguiente(p.id)} disabled={trabajando}>Saltar</Boton>
            <Boton variant="danger" icon={<Trash2 size={15} />} onClick={descartar} disabled={trabajando}>Descartar</Boton>
          </div>
        </Hoja>
      )}

      {editando && p && (
        <PanelLateral titulo="Corregir la pregunta" sub={p.tema !== null ? `Tema ${p.tema}` : undefined} onCerrar={() => setEditando(false)}>
          <EditorPregunta form={form} onChange={setForm}
            avisosDeLaLey={p.avisosLey.length ? p.avisosLey.map((a) => separaEnlaceOficial(a.message)) : null} />
          <CampoSelect label="Dificultad" value={nivel} onChange={(e) => setNivel(Number(e.target.value) as DifficultyLevel | 0)}>
            {p.difficulty_level == null && <option value={0}>Sin poner</option>}
            {([1, 2, 3] as const).map((n) => <option key={n} value={n}>{DIFFICULTY_LABEL[n]}</option>)}
          </CampoSelect>
          <p className={TEXT.muted}>Al guardar queda revisada por ti{p.avisosLey.length ? ' y se cierra el aviso de la ley' : ''}.</p>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={guardaEdicion} disabled={trabajando} icon={trabajando ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}>{trabajando ? 'Guardando…' : 'Guardar'}</Boton>
            <Boton variant="ghost" onClick={() => setEditando(false)}>Cancelar</Boton>
          </div>
        </PanelLateral>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cambios propuestos
// ---------------------------------------------------------------------------

function Propuestas({ onCambio, total }: { onCambio: () => void; total: number }) {
  const [lista, setLista] = useState<PropuestaParaRevisar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [enBloque, setEnBloque] = useState<{ aprobadas: number; saltadas: number } | null>(null);

  const carga = useCallback(async () => {
    const r = await getPropuestas();
    if (r.success) setLista(r.propuestas); else setError(r.error);
  }, []);
  useEffect(() => { carga(); }, [carga]);

  async function aprueba(id: string) {
    setTrabajando(id);
    const r = await aprobarPropuesta(id);
    setTrabajando(null);
    if (!r.success) void avisar(r.error ?? 'No se pudo aplicar.');
    await carga();
    onCambio();
  }
  /** Acepta en bloque los cambios mecánicos de Claude, de 50 en 50, hasta que no queden. Lo decide el tutor (regla 138). */
  async function aceptaMecanicos() {
    if (!(await confirmar(`Vas a aceptar en bloque los cambios mecánicos de Claude (hasta ${total.toLocaleString('es-ES')}): quitar «según el texto proporcionado», completar la referencia legal y cambiar «la opción 1» por «la B» en las explicaciones. Cada uno se comprueba antes de aplicarlo y queda en el historial. No da ninguna pregunta por revisada. ¿Seguir?`))) return;
    let acum = { aprobadas: 0, saltadas: 0 };
    let despuesDe: string | undefined;
    setEnBloque(acum);
    for (;;) {
      const r = await aprobarCambiosMecanicos({ despuesDe });
      if (!r.success) { void avisar(r.error); break; }
      acum = { aprobadas: acum.aprobadas + r.aprobadas, saltadas: acum.saltadas + r.saltadas };
      setEnBloque(acum);
      if (r.fin || !r.ultimo) break;
      despuesDe = r.ultimo;
    }
    setEnBloque(null);
    void avisar(`Aceptados ${acum.aprobadas.toLocaleString('es-ES')} cambios.${acum.saltadas ? ` ${acum.saltadas.toLocaleString('es-ES')} se dejaron para decidir a mano (ya no valían o no eran mecánicos).` : ''}`);
    await carga();
    onCambio();
  }
  async function rechaza(id: string) {
    const nota = await pedirTexto('¿Por qué no? (opcional: queda anotado)');
    if (nota === null) return;
    setTrabajando(id);
    const r = await rechazarPropuesta(id, nota);
    setTrabajando(null);
    if (!r.success) void avisar(r.error ?? 'No se pudo rechazar.');
    await carga();
    onCambio();
  }

  if (error) return <Aviso tono="malo"><p>{error}</p></Aviso>;
  if (!lista) return <div className="flex items-center gap-2 py-16 text-slate-600 dark:text-slate-400"><Loader2 className="animate-spin" size={18} /> Cargando…</div>;
  if (lista.length === 0) return <EmptyState icon={<CheckCircle2 size={36} />} title="No hay cambios propuestos." hint="Cuando Claude, la IA o la medición de dificultad propongan algo, aparece aquí para que decidáis." bordered />;

  return (
    <div className="space-y-4">
    <Hoja pad="md" className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 basis-72 text-sm text-slate-900 dark:text-slate-100">
        <b>Cambios mecánicos de Claude:</b> quitar «según el texto proporcionado», completar la referencia legal y cambiar «la opción 1» por «la B». Puedes aceptarlos todos de una vez.
        {enBloque && <span className="block text-[13px] text-slate-600 dark:text-slate-400">Aceptando… {enBloque.aprobadas.toLocaleString('es-ES')} hechos{enBloque.saltadas ? `, ${enBloque.saltadas.toLocaleString('es-ES')} saltados` : ''}.</span>}
      </p>
      <Boton variant="secondary" disabled={!!enBloque || !!trabajando} onClick={aceptaMecanicos} icon={enBloque ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}>
        {enBloque ? 'Aceptando…' : 'Aceptar todos los mecánicos'}
      </Boton>
    </Hoja>
    <Aviso tono="info">
      <p>Aprobar aplica el cambio, pero no da la pregunta por revisada: eso se hace en «Revisar», viéndola entera (allí también aparece su cambio, para decidirlo junto).{total > lista.length ? ` Aquí salen los ${lista.length} más antiguos de ${total.toLocaleString('es-ES')}.` : ''}</p>
    </Aviso>
    <div className="grid gap-4 xl:grid-cols-2">
      {lista.map((x) => (
        <Hoja key={x.id} pad="md" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Etiqueta tono="oro">{NOMBRE_ORIGEN[x.origen as OrigenPropuesta] ?? x.origen}</Etiqueta>
              {x.pregunta.tema !== null && <Etiqueta tono="apagado">Tema {x.pregunta.tema}</Etiqueta>}
              <Etiqueta tono={x.pregunta.status === 'candidate' ? 'aviso' : 'neutro'}>{x.pregunta.status === 'candidate' ? 'Pendiente' : 'En el banco'}</Etiqueta>
            </span>
            <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400">{fechaCorta(x.creada)}</span>
          </div>
          <p className="text-sm font-medium leading-relaxed text-slate-900 dark:text-slate-100">“{x.pregunta.question_text}”</p>
          <div className="border-l-[3px] border-oro py-1 pl-3 text-[13.5px]">
            <small className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">Por qué</small>
            <p className="text-slate-900 dark:text-slate-100">{x.motivo}</p>
          </div>
          {!x.vigente && <Aviso tono="malo"><p>La pregunta ha cambiado desde que se propuso: este cambio ya no vale. Recházalo.</p></Aviso>}
          <div className="space-y-2.5">
            {x.cambios.map((c) => (
              <div key={c.campo} className="space-y-1">
                <Rotulo>{c.nombre}</Rotulo>
                <p className="whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-900 line-through decoration-red-400/70 dark:bg-red-500/10 dark:text-red-200">{c.antes}</p>
                <p className="whitespace-pre-line rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{c.despues}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-linea pt-3 dark:border-noche-linea">
            {x.vigente && (
              <Boton size="sm" icon={trabajando === x.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} disabled={!!trabajando} onClick={() => aprueba(x.id)}>
                Aprobar el cambio
              </Boton>
            )}
            <Boton size="sm" variant="secondary" icon={<XCircle size={14} />} disabled={!!trabajando} onClick={() => rechaza(x.id)}>Rechazar</Boton>
          </div>
        </Hoja>
      ))}
    </div>
    </div>
  );
}
