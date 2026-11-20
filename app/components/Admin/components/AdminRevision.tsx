'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, Loader2, Pencil, Save, Scale, SkipForward, Trash2, ExternalLink, ClipboardCheck, XCircle } from 'lucide-react';
import {
  getBandejaRevision, getParaRevisar, setSoloRevisadas, getPropuestas, aprobarPropuesta, rechazarPropuesta,
  marcarRevisada, approveQuestion, disableQuestion, updateQuestion, resolverAvisosLey, getOfficialSyllabus,
} from '@/actions';
import type { BandejaRevision, PreguntaParaRevisar } from '@/app/actions/revision';
import type { PropuestaParaRevisar } from '@/app/actions/moderation';
import type { SyllabusSubject } from '@/app/actions/admin';
import { PanelTitulo, Pestanas, Hoja, BloqueTitulo, Rotulo, Aviso, Boton, Etiqueta, CampoSelect, Conmutador, PanelLateral, EmptyState, Pulso, TEXT, cx } from '../../ui';
import EditorPregunta, { type FormPregunta } from './EditorPregunta';
import AdminModeration from './AdminModeration';
import { NOMBRE_ORIGEN, type OrigenPropuesta } from '@/app/lib/revision';
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
type Seccion = 'resumen' | 'revisar' | 'propuestas' | 'ley' | 'quejas';

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

export default function AdminRevision() {
  const [seccion, setSeccion] = useState<Seccion>('resumen');
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
      <PanelTitulo titulo="Revisión" sub="Todo lo que espera a un tutor. Nada llega a los alumnos sin vuestro visto bueno." />
      <Pestanas
        etiqueta="Qué revisar"
        activa={seccion}
        onCambia={setSeccion}
        items={[
          { id: 'resumen', etiqueta: 'Resumen' },
          { id: 'revisar', etiqueta: 'Revisar una a una', cuenta: b ? b.pendientes + b.sinRevisar : undefined },
          { id: 'propuestas', etiqueta: 'Cambios propuestos', cuenta: b?.propuestas },
          { id: 'ley', etiqueta: 'Cambios en la ley', cuenta: b?.avisosLey },
          { id: 'quejas', etiqueta: 'Quejas de alumnos', cuenta: b?.quejas },
        ]}
      />
      {error && <Aviso tono="malo"><p>{error}</p></Aviso>}
      {seccion === 'resumen' && <Resumen bandeja={b} onIr={setSeccion} onCambio={carga} />}
      {seccion === 'revisar' && <Revisor onCambio={carga} />}
      {seccion === 'propuestas' && <Propuestas onCambio={carga} />}
      {seccion === 'ley' && <AdminModeration soloTipo="ley" onCambio={carga} />}
      {seccion === 'quejas' && <AdminModeration soloTipo="quejas" onCambio={carga} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resumen y novedades
// ---------------------------------------------------------------------------

function Resumen({ bandeja, onIr, onCambio }: { bandeja: BandejaRevision | null; onIr: (s: Seccion) => void; onCambio: () => void }) {
  const [guardando, setGuardando] = useState(false);
  if (!bandeja) {
    return <div className="flex items-center gap-2 py-16 text-slate-600 dark:text-slate-400"><Loader2 className="animate-spin" size={18} /> Cargando la bandeja…</div>;
  }
  const b = bandeja;
  const totalBanco = b.revisadas + b.sinRevisar;
  const porcentaje = totalBanco ? Math.round((b.revisadas / totalBanco) * 100) : null;

  async function alternaSoloRevisadas() {
    const activar = !b.soloRevisadas;
    const aviso = activar
      ? `Los alumnos solo recibirán las ${b.revisadas} preguntas que ha revisado un tutor. Las ${b.sinRevisar} sin revisar dejan de servirse hasta que alguien las revise. ¿Activar?`
      : `Los alumnos volverán a recibir también las ${b.sinRevisar} preguntas que ningún tutor ha revisado. ¿Desactivar?`;
    if (!(await confirmar(aviso))) return;
    setGuardando(true);
    const r = await setSoloRevisadas(activar);
    setGuardando(false);
    if (!r.success) { void avisar(r.error); return; }
    onCambio();
  }

  return (
    <div className="space-y-5">
      <Pulso cifras={[
        { valor: b.pendientes, etiqueta: 'Pendientes de publicar', tono: b.pendientes ? 'aviso' : 'neutro' },
        { valor: b.sinRevisar, etiqueta: 'En el banco sin revisar', tono: b.sinRevisar ? 'aviso' : 'ok' },
        { valor: b.propuestas, etiqueta: 'Cambios propuestos', tono: b.propuestas ? 'aviso' : 'neutro' },
        { valor: b.avisosLey, etiqueta: 'Cambios en la ley', tono: b.avisosLey ? 'malo' : 'neutro' },
        { valor: b.quejas, etiqueta: 'Quejas de alumnos', tono: b.quejas ? 'aviso' : 'neutro' },
      ]} />

      <div className="flex flex-wrap gap-2">
        {(b.pendientes > 0 || b.sinRevisar > 0) && <Boton icon={<ClipboardCheck size={15} />} onClick={() => onIr('revisar')}>Empezar a revisar</Boton>}
        {b.propuestas > 0 && <Boton variant="secondary" onClick={() => onIr('propuestas')}>Ver los cambios propuestos</Boton>}
        {b.avisosLey > 0 && <Boton variant="secondary" onClick={() => onIr('ley')}>Ver los cambios en la ley</Boton>}
      </div>

      <Hoja pad="md" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white">Los alumnos solo reciben preguntas revisadas</p>
            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">
              {b.soloRevisadas
                ? `Activado: se sirven solo las ${b.revisadas} que ha revisado un tutor.`
                : `Desactivado: se sirven también las ${b.sinRevisar} que nadie ha revisado. Actívalo antes de que entren los alumnos.`}
            </p>
          </div>
          <Conmutador activo={b.soloRevisadas} etiqueta="Los alumnos solo reciben preguntas revisadas" disabled={guardando} onChange={alternaSoloRevisadas} />
        </div>
        {porcentaje !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-hundido dark:bg-noche-hondo" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Banco revisado">
              <div className="h-full bg-emerald-600" style={{ width: `${porcentaje}%` }} />
            </div>
            <p className={`${TEXT.muted} mt-1.5`}>{b.revisadas} de {totalBanco} preguntas del banco revisadas ({porcentaje} %).</p>
          </div>
        )}
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

function Revisor({ onCambio }: { onCambio: () => void }) {
  const [modo, setModo] = useState<'pendientes' | 'sin_revisar'>('pendientes');
  const [tema, setTema] = useState<number | null>(null);
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

  const siguiente = useCallback(async (despuesDe?: string) => {
    setCargando(true);
    setError(null);
    const r = await getParaRevisar({ modo, subjectId: tema ?? undefined, despuesDe });
    setCargando(false);
    if (!r.success) { setError(r.error); return; }
    setP(r.pregunta);
    setQuedan(r.quedan);
  }, [modo, tema]);
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
    // Corregirla con un aviso de la ley abierto ES la respuesta al aviso.
    if (p.avisosLey.length) await resolverAvisosLey(p.id);
    setTrabajando(false);
    setEditando(false);
    onCambio();
    // Una pendiente corregida sigue pendiente: se vuelve a enseñar ya corregida, para publicarla.
    if (p.status === 'candidate') { setP({ ...p, ...form, difficulty_level: cambiaNivel ? nivel : p.difficulty_level, avisosLey: [] }); return; }
    await siguiente(p.id);
  }

  const completa = p ? estaCompleta(p) : false;
  const bloqueada = !!p && (p.avisosLey.length > 0 || p.tienePropuesta);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoSelect aria-label="Qué revisar" value={modo} onChange={(e) => setModo(e.target.value as 'pendientes' | 'sin_revisar')}>
          <option value="pendientes">Pendientes de publicar</option>
          <option value="sin_revisar">Del banco, sin revisar</option>
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
        <EmptyState icon={<CheckCircle2 size={36} />} title={modo === 'pendientes' ? 'No queda ninguna pendiente.' : 'Todo el banco está revisado.'} hint={tema ? 'En este tema. Prueba con «Todos los temas».' : undefined} bordered />
      ) : (
        <Hoja pad="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Etiqueta tono={p.status === 'candidate' ? 'aviso' : 'neutro'}>{p.status === 'candidate' ? 'Pendiente' : 'En el banco'}</Etiqueta>
              {p.tema !== null && <Etiqueta tono="apagado">Tema {p.tema}</Etiqueta>}
            </span>
            {quedan !== null && <span className="text-[13px] text-slate-600 dark:text-slate-400">Quedan {quedan}</span>}
          </div>

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
          {p.tienePropuesta && <Aviso tono="info"><p>Tiene un cambio propuesto sin decidir: decídelo en «Cambios propuestos» antes de darla por buena.</p></Aviso>}
          {p.status === 'candidate' && !completa && <Aviso tono="info"><p>{textoFaltan(etiquetasQueFaltan(p))}: complétala con «Corregir» antes de publicarla.</p></Aviso>}

          <div className="flex flex-wrap gap-2 border-t border-linea pt-4 dark:border-noche-linea">
            <Boton onClick={darPorBuena} disabled={trabajando || bloqueada || (p.status === 'candidate' && !completa)}
              icon={trabajando ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}>
              {p.status === 'candidate' ? 'Está bien: publicar' : 'Está bien: revisada'}
            </Boton>
            <Boton variant="secondary" icon={<Pencil size={15} />} onClick={abreEditor} disabled={trabajando}>Corregir</Boton>
            {p.avisosLey.length > 0 && <Boton variant="secondary" icon={<Scale size={15} />} onClick={sigueVigente} disabled={trabajando}>Sigue vigente</Boton>}
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

function Propuestas({ onCambio }: { onCambio: () => void }) {
  const [lista, setLista] = useState<PropuestaParaRevisar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

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
  );
}
