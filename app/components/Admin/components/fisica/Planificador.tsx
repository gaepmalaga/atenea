'use client';

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Library, Copy, StickyNote, Loader2, MessageSquare, Check, X, Pencil, Trash2,
  ArrowLeft, Users, CopyPlus, History,
} from 'lucide-react';
import {
  getAlumnosFisica, getPlanificador, getPlantillas, moverSesion, saveSesion, copiarSemanaFisica, setNotaSemana,
  deletePlantilla, copiarAAlumnos,
} from '@/actions';
import type { ApunteConCorreo, NotaSemana, RMVigente, AlumnoFisica } from '@/app/actions/fisica';
import {
  TIPOS_SESION, ETIQUETA_TIPO, diasDeSemana, semanasDelMes, sumaMeses, mesDe, etiquetaMes, etiquetaSemana,
  etiquetaDia, porDia, resumenSemana, estadoSesion, formateaMinutos, formateaKm, lunesDe,
  type Destino, type Sesion, type Plantilla,
} from '@/app/lib/sesiones';
import { sumaDias } from '@/app/lib/asistencia';
import { agrupaAlumnos, estadoSemana, quienEs, diasEntre, type GrupoPlan, type ResumenSemanaAlumno } from '@/app/lib/planificar';
import { clasesPorDia, type ClaseFisica } from '@/app/lib/clases-fisica';
import { nombreCorto } from '@/app/lib/cuadrante';
import { ESTILO_TIPO } from '@/app/components/fisica/estiloTipo';
import TarjetaClase from '@/app/components/fisica/TarjetaClase';
import { Boton, EmptyState, Modal, CampoSelect, Campo, Filtros, FiltroChip, TEXT, cx } from '../../../ui';
import EditorSesion from './EditorSesion';
import { confirmar } from '@/app/lib/dialogos';

/**
 * «PLANIFICAR»: EL ENTRENO DE CADA ALUMNO (reglas 86 y 97).
 *
 * La vista principal es la LISTA DE ALUMNOS de física, por grupo y con
 * buscador: de un vistazo, a quién le falta la semana (esta y la siguiente) y
 * quién no ha apuntado lo que ha hecho. Se marcan varios y se les copia la
 * semana (o un día) de otro: cada uno recibe SU copia.
 *
 * Al entrar en un alumno, su calendario —una semana, dos o el mes— con sus
 * entrenos como tarjetas del color de su tipo, el «+» en cada día, la
 * biblioteca de plantillas y la nota de la semana; y, APARTE y en solo
 * lectura, las clases de su grupo (el cuadrante), para no duplicarlas.
 *
 * En el ordenador las tarjetas y las plantillas se ARRASTRAN a otro día (con
 * Alt o Ctrl, se copian). En el móvil los días se apilan y todo va con toques.
 *
 * El plan común de un GRUPO sin horario (el modelo de antes, regla 86) se
 * sigue pudiendo abrir desde abajo de la lista, si hay alguno.
 */

type Vista = 'semana' | '2semanas' | 'mes';
type Datos = {
  sesiones: Sesion[];
  clases: ClaseFisica[];
  apuntes: ApunteConCorreo[];
  miembros: { id: string; email: string }[];
  notas: NotaSemana[];
  nombresGrupo: Record<string, string>;
  rm: RMVigente;
  hoy: string;
};
type Lista = { lunes: string; hoy: string; grupos: GrupoPlan[]; alumnos: AlumnoFisica[] };
type Abierto = { destino: Destino; titulo: string };

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export default function Planificador() {
  const [lunes, setLunes] = useState(() => lunesDe(hoyLocal()));
  const [lista, setLista] = useState<Lista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Abierto | null>(null);

  // Se vuelve a pedir al cambiar de semana o al volver de un alumno (`vuelta`).
  const [vuelta, setVuelta] = useState(0);
  const cargar = useCallback(() => setVuelta((n) => n + 1), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await getAlumnosFisica({ lunes });
      if (!vivo) return;
      if (r.success) { setLista(r); setError(null); }
      else setError(r.error);
    })();
    return () => { vivo = false; };
  }, [lunes, vuelta]);

  if (abierto) {
    return (
      <CalendarioPlan
        destino={abierto.destino}
        titulo={abierto.titulo}
        alumnos={lista?.alumnos ?? []}
        grupos={lista?.grupos ?? []}
        onVolver={() => { setAbierto(null); cargar(); }}
      />
    );
  }
  if (error) return <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>;
  if (!lista) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  return <ListaAlumnos lista={lista} lunes={lunes} onLunes={setLunes} onAbrir={setAbierto} onCambio={cargar} />;
}

// ── La lista de alumnos ──

function textoSemana(r: ResumenSemanaAlumno): string {
  const e = estadoSemana(r);
  if (e === 'sin_planificar') return 'Sin planificar';
  const n = `${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'}`;
  if (e === 'planificada') return n;
  return `${n} · ${r.apuntadas}/${r.vencidas} apuntadas`;
}

/** El cuadradito de cada semana: color por estado, y un borde discontinuo si no hay nada planificado. */
const PUNTO_ESTADO = {
  sin_planificar: 'border-2 border-dashed border-amber-500 dark:border-amber-400',
  por_apuntar: 'bg-amber-400 dark:bg-amber-500',
  al_dia: 'bg-emerald-600 dark:bg-emerald-500',
  planificada: 'bg-indigo-500 dark:bg-indigo-400',
} as const;

type Filtro = 'todos' | 'esta' | 'siguiente';

function ListaAlumnos({ lista, lunes, onLunes, onAbrir, onCambio }: {
  lista: Lista;
  lunes: string;
  onLunes: (l: string) => void;
  onAbrir: (a: Abierto) => void;
  onCambio: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const visibles = useMemo(() => lista.alumnos.filter((a) =>
    filtro === 'todos' || estadoSemana(a.semanas[filtro === 'esta' ? 0 : 1]) === 'sin_planificar'), [lista.alumnos, filtro]);
  const secciones = useMemo(() => agrupaAlumnos(visibles, lista.grupos, busca), [visibles, lista.grupos, busca]);
  const faltan = (i: number) => lista.alumnos.filter((a) => estadoSemana(a.semanas[i]) === 'sin_planificar').length;
  const planesComunes = lista.grupos.filter((g) => !g.conHorario && !g.esMulti);
  const alterna = (id: string) => setMarcados((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const esEsta = lunes === lunesDe(hoyLocal());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => onLunes(sumaDias(lunes, -7))} aria-label="Semana anterior" className="w-11 h-11 flex items-center justify-center rounded-lg border border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
          <span className="px-2 text-sm font-bold text-slate-900 dark:text-white min-w-[150px] text-center">
            {esEsta ? 'Esta semana' : `Semana ${etiquetaSemana(lunes)}`} y la siguiente
          </span>
          <button onClick={() => onLunes(sumaDias(lunes, 7))} aria-label="Semana siguiente" className="w-11 h-11 flex items-center justify-center rounded-lg border border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          {!esEsta && <Boton variant="ghost" size="sm" onClick={() => onLunes(lunesDe(hoyLocal()))}>Hoy</Boton>}
        </div>
      </div>

      {lista.alumnos.length === 0 ? (
        <EmptyState icon={<Users size={36} />} title="Aún no hay alumnos en los grupos de física"
          hint="Se meten desde la ficha de cada alumno, en «Alumnos». En cuanto estén, aquí podrás planificarles el entreno." bordered />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0">
              <Campo label="Buscar alumno" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nombre o correo…" autoComplete="off" />
            </div>
            <Filtros etiqueta="Qué alumnos ver">
              {([['todos', 'Todos', lista.alumnos.length], ['esta', `Sin ${esEsta ? 'esta semana' : 'la 1.ª'}`, faltan(0)], ['siguiente', 'Sin la siguiente', faltan(1)]] as const).map(([v, t, n]) => (
                <FiltroChip key={v} activo={filtro === v} onClick={() => setFiltro(v)} cuenta={n}>{t}</FiltroChip>
              ))}
            </Filtros>
          </div>

          {marcados.size > 0 && (
            <div className="rounded-lg border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100 flex-1 min-w-[10rem]">
                {marcados.size} {marcados.size === 1 ? 'alumno marcado' : 'alumnos marcados'}
              </span>
              <Boton size="sm" icon={<CopyPlus size={14} />} onClick={() => setCopiando(true)}>Copiarles entrenos</Boton>
              <Boton size="sm" variant="ghost" onClick={() => setMarcados(new Set())}>Desmarcar</Boton>
            </div>
          )}
          {aviso && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Check size={14} /> {aviso}</p>}

          <p className={cx(TEXT.muted, 'flex flex-wrap items-center gap-x-4 gap-y-1')} aria-label="Leyenda de los cuadraditos">
            {([['al_dia', 'al día'], ['por_apuntar', 'faltan por apuntar'], ['planificada', 'planificada'], ['sin_planificar', 'sin planificar']] as const).map(([e, t]) => (
              <span key={e} className="inline-flex items-center gap-1.5"><span aria-hidden className={cx('h-3 w-3 rounded', PUNTO_ESTADO[e])} />{t}</span>
            ))}
            <span>· el número son las sesiones de la semana</span>
          </p>

          {secciones.length === 0 && <p className={cx(TEXT.muted, 'text-center py-6')}>Nadie coincide con eso.</p>}
          {secciones.map(({ grupo, alumnos }) => {
            const todos = alumnos.every((a) => marcados.has(a.id));
            return (
              <section key={grupo.id} className="rounded-lg border border-linea dark:border-noche-linea bg-white dark:bg-noche-2 overflow-hidden">
                <header className="flex items-center justify-between gap-2 px-3 py-1.5 bg-hundido dark:bg-noche-hondo/40 border-b border-slate-100 dark:border-slate-800">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {nombreCorto(grupo.nombre)} <span className="font-medium text-slate-600 dark:text-slate-400">· {alumnos.length} {alumnos.length === 1 ? 'alumno' : 'alumnos'}{!grupo.conHorario && !grupo.esMulti ? ' · plan común' : ''}</span>
                  </h4>
                  <span aria-hidden className="flex shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    <span className="w-11 text-right">{esEsta ? 'Esta' : etiquetaSemana(lunes)}</span>
                    <span className="w-11 text-right">Sig.</span>
                  </span>
                  <button onClick={() => setMarcados((prev) => { const n = new Set(prev); for (const a of alumnos) { if (todos) n.delete(a.id); else n.add(a.id); } return n; })}
                    className="min-h-[44px] px-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </header>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {alumnos.map((a) => (
                    <li key={a.id} className="flex items-stretch">
                      <label className="w-12 shrink-0 flex items-center justify-center cursor-pointer" aria-label={`Marcar a ${a.email}`}>
                        <input type="checkbox" className="w-5 h-5" checked={marcados.has(a.id)} onChange={() => alterna(a.id)} />
                      </label>
                      <button onClick={() => onAbrir({ destino: { tipo: 'alumno', id: a.id }, titulo: quienEs(a) })}
                        aria-label={`${quienEs(a)}. ${a.semanas.map((r, i) => `${i === 0 ? (esEsta ? 'Esta semana' : etiquetaSemana(r.lunes)) : 'La siguiente'}: ${textoSemana(r)}`).join('. ')}`}
                        className="flex-1 min-w-0 min-h-[44px] py-1 pr-3 text-left flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">{quienEs(a)}</span>
                          {a.nombre && <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">{a.email}</span>}
                        </span>
                        {a.semanas.map((r, i) => {
                          const e = estadoSemana(r);
                          return (
                            <span key={r.lunes} title={`${i === 0 ? 'Esta semana' : 'La siguiente'}: ${textoSemana(r)}`}
                              className="w-11 shrink-0 flex items-center justify-end gap-1.5 text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                              <span aria-hidden className={cx('h-3.5 w-3.5 rounded', PUNTO_ESTADO[e])} />
                              <span aria-hidden className="w-3 text-right">{r.sesiones || '–'}</span>
                            </span>
                          );
                        })}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {planesComunes.length > 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 space-y-2">
          <p className={cx('text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400')}>Plan común de un grupo sin horario</p>
          <p className={TEXT.muted}>El modelo de antes: lo que se escribe aquí lo ven todos los alumnos del grupo. Para las clases, el cuadrante; para cada alumno, su entreno.</p>
          <div className="flex flex-wrap gap-2">
            {planesComunes.map((g) => (
              <Boton key={g.id} size="sm" variant="secondary" onClick={() => onAbrir({ destino: { tipo: 'grupo', id: g.id }, titulo: g.nombre })}>{g.nombre}</Boton>
            ))}
          </div>
        </div>
      )}

      {copiando && (
        <CopiarAVarios alumnos={lista.alumnos} grupos={lista.grupos} lunes={lunes} origen={null} destinos={marcados}
          onCerrar={() => setCopiando(false)}
          onHecho={(texto) => { setCopiando(false); setMarcados(new Set()); setAviso(texto); onCambio(); }} />
      )}
    </div>
  );
}

// ── Copiar entrenos a varios alumnos ──

/**
 * Elige de quién (un alumno), qué (su semana o un día) y a quiénes. Cada
 * destinatario recibe su propia copia: cambiar la de uno no toca las demás.
 */
function CopiarAVarios({ alumnos, grupos, lunes, origen, destinos: iniciales, onCerrar, onHecho }: {
  alumnos: AlumnoFisica[];
  grupos: GrupoPlan[];
  lunes: string;
  /** El alumno de origen, si ya se sabe (desde su calendario). */
  origen: string | null;
  destinos: Set<string>;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [origenId, setOrigenId] = useState(origen ?? '');
  const [modo, setModo] = useState<'semana' | 'dia'>('semana');
  const [semana, setSemana] = useState(lunes);
  const [dia, setDia] = useState(lunes);
  const [aSemana, setASemana] = useState(lunes);
  const [aDia, setADia] = useState(lunes);
  const [destinos, setDestinos] = useState<Set<string>>(() => new Set([...iniciales].filter((id) => id !== origen)));
  const [busca, setBusca] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const semanas = [-7, 0, 7, 14].map((n) => sumaDias(lunes, n));
  const secciones = useMemo(() => agrupaAlumnos(alumnos.filter((a) => a.id !== origenId), grupos, busca), [alumnos, grupos, busca, origenId]);
  const nombre = (id: string) => alumnos.find((a) => a.id === id)?.email ?? '—';
  const desde = modo === 'semana' ? semana : dia;
  const hasta = modo === 'semana' ? sumaDias(semana, 6) : dia;
  const a = modo === 'semana' ? aSemana : aDia;
  const mismo = destinos.size === 0;

  async function copia() {
    setGuardando(true); setError(null);
    const r = await copiarAAlumnos({ origenId, desde, hasta, a, destinos: [...destinos] });
    setGuardando(false);
    if (!r.success) { setError(r.error); return; }
    onHecho(`Copiadas ${r.creadas} sesiones a ${r.alumnos} ${r.alumnos === 1 ? 'alumno' : 'alumnos'}. Cada uno tiene la suya.`);
  }

  return (
    <Modal title="Copiar entrenos a varios alumnos" subtitle="Cada uno recibe su copia: cambiar la de uno no cambia las demás" onClose={onCerrar} width="md"
      footer={
        <div className="flex gap-2 w-full">
          <div className="flex-1" />
          <Boton variant="secondary" disabled={guardando} onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={guardando || !origenId || mismo} onClick={copia}>
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Copiar{destinos.size ? ` a ${destinos.size}` : ''}
          </Boton>
        </div>
      }>
      <div className="space-y-4">
        {origen === null ? (
          <CampoSelect label="De quién" value={origenId} onChange={(e) => { setOrigenId(e.target.value); setDestinos((d) => { const n = new Set(d); n.delete(e.target.value); return n; }); }}>
            <option value="">— Elegir alumno —</option>
            {alumnos.map((x) => <option key={x.id} value={x.id}>{x.email}</option>)}
          </CampoSelect>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-200">De <b>{nombre(origen)}</b></p>
        )}

        <div className="flex gap-1 p-1 rounded-lg bg-hundido dark:bg-noche-hondo/60" role="group" aria-label="Qué copiar">
          {([['semana', 'Una semana entera'], ['dia', 'Un día']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setModo(v)} aria-pressed={modo === v}
              className={cx('flex-1 min-h-[44px] rounded-lg text-xs font-bold',
                modo === v ? 'bg-white dark:bg-noche-2 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400')}>
              {t}
            </button>
          ))}
        </div>

        {modo === 'semana' ? (
          <div className="grid sm:grid-cols-2 gap-3">
            <CampoSelect label="Su semana del" value={semana} onChange={(e) => setSemana(e.target.value)}>
              {semanas.map((l) => <option key={l} value={l}>{etiquetaSemana(l)}</option>)}
            </CampoSelect>
            <CampoSelect label="A la semana del" value={aSemana} onChange={(e) => setASemana(e.target.value)}>
              {semanas.map((l) => <option key={l} value={l}>{etiquetaSemana(l)}</option>)}
            </CampoSelect>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <CampoSelect label="Su día" value={dia} onChange={(e) => setDia(e.target.value)}>
              {semanas.flatMap(diasDeSemana).map((d) => <option key={d} value={d}>{etiquetaDia(d)}</option>)}
            </CampoSelect>
            <CampoSelect label="Al día" value={aDia} onChange={(e) => setADia(e.target.value)}>
              {semanas.flatMap(diasDeSemana).map((d) => <option key={d} value={d}>{etiquetaDia(d)}</option>)}
            </CampoSelect>
          </div>
        )}
        {diasEntre(desde, a) === 0 && <p className={TEXT.muted}>A los mismos días.</p>}

        <div className="space-y-2">
          <Campo label={`A quiénes (${destinos.size} ${destinos.size === 1 ? 'alumno' : 'alumnos'})`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nombre o correo…" autoComplete="off" />
          <div className="max-h-72 overflow-y-auto rounded-lg border border-linea dark:border-noche-linea divide-y divide-slate-100 dark:divide-slate-800">
            {secciones.map(({ grupo, alumnos: delGrupo }) => {
              const todos = delGrupo.every((x) => destinos.has(x.id));
              return (
                <div key={grupo.id}>
                  <button type="button" onClick={() => setDestinos((prev) => { const n = new Set(prev); for (const x of delGrupo) { if (todos) n.delete(x.id); else n.add(x.id); } return n; })}
                    className="w-full min-h-[44px] px-3 flex items-center justify-between bg-hundido dark:bg-noche-hondo/40 text-xs font-bold text-slate-700 dark:text-slate-200">
                    {nombreCorto(grupo.nombre)} · {delGrupo.length}
                    <span className="text-indigo-700 dark:text-indigo-300">{todos ? 'Quitar todos' : 'Todo el grupo'}</span>
                  </button>
                  {delGrupo.map((x) => (
                    <label key={x.id} className="flex items-center gap-3 min-h-[44px] px-3 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input type="checkbox" className="w-5 h-5 shrink-0" checked={destinos.has(x.id)}
                        onChange={() => setDestinos((prev) => { const n = new Set(prev); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />
                      <span className="truncate">{x.email}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        <p className={TEXT.muted}>Lo que ya tengan esos días se queda; lo copiado se añade. Las clases de grupo no se copian: son del cuadrante.</p>
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}

// ── El calendario de un alumno (o del plan común de un grupo) ──

function CalendarioPlan({ destino, titulo, alumnos, grupos, onVolver }: {
  destino: Destino;
  titulo: string;
  alumnos: AlumnoFisica[];
  grupos: GrupoPlan[];
  onVolver: () => void;
}) {
  // En el ordenador se empieza viendo dos semanas, como en la herramienta de
  // antes; en el móvil, una. El panel solo se pinta en el navegador.
  const [vista, setVista] = useState<Vista>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? '2semanas' : 'semana');
  const [ancla, setAncla] = useState(() => lunesDe(hoyLocal()));
  const [mes, setMes] = useState(() => mesDe(hoyLocal()));
  const [datos, setDatos] = useState<Datos | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ sesion: Sesion | null; fecha: string } | null>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  const [copiando, setCopiando] = useState(false);
  const [aVarios, setAVarios] = useState(false);
  const [plantillaPorColocar, setPlantillaPorColocar] = useState<Plantilla | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [copiandoAnterior, setCopiandoAnterior] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getPlantillas();
      if (p.success) setPlantillas(p.plantillas);
    })();
  }, []);

  const semanas = useMemo(
    () => (vista === 'mes' ? semanasDelMes(mes) : vista === '2semanas' ? [ancla, sumaDias(ancla, 7)] : [ancla]),
    [vista, mes, ancla],
  );
  const desde = semanas[0];
  const hasta = sumaDias(semanas[semanas.length - 1], 6);

  const cargar = useCallback(async () => {
    const res = await getPlanificador({ destino, desde, hasta });
    if (!res.success) { setError(res.error); return; }
    setError(null);
    setDatos(res);
  }, [destino, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  const recargarPlantillas = useCallback(async () => {
    const p = await getPlantillas();
    if (p.success) setPlantillas(p.plantillas);
  }, []);

  const tras = useCallback(() => { cargar(); recargarPlantillas(); }, [cargar, recargarPlantillas]);

  function mover(n: number) {
    if (vista === 'mes') setMes((m) => sumaMeses(m, n));
    else setAncla((a) => sumaDias(a, n * (vista === '2semanas' ? 14 : 7)));
  }
  function irAHoy() {
    const h = datos?.hoy ?? hoyLocal();
    setAncla(lunesDe(h));
    setMes(mesDe(h));
  }

  /** Su semana anterior a la primera que se ve: lo más rápido para la semana que viene. */
  async function copiaAnterior() {
    setCopiandoAnterior(true); setError(null); setAviso(null);
    const r = await copiarSemanaFisica({ destino, desde: sumaDias(desde, -7), a: desde });
    setCopiandoAnterior(false);
    if (!r.success) { setError(r.error); return; }
    setAviso(`Copiadas ${r.creadas} sesiones de su semana anterior a la del ${etiquetaSemana(desde)}.`);
    cargar();
  }

  const hoy = datos?.hoy ?? hoyLocal();
  const sesionesPorDia = useMemo(() => porDia(datos?.sesiones ?? []), [datos]);
  const clasesDelDia = useMemo(() => clasesPorDia(datos?.clases ?? []), [datos]);
  const idsMiembros = useMemo(() => (datos?.miembros ?? []).map((m) => m.id), [datos]);
  const esAlumno = destino.tipo === 'alumno';

  // ── Arrastrar (ordenador) ──
  function alSoltar(e: DragEvent, fecha: string) {
    e.preventDefault();
    setArrastrando(null);
    let carga: { tipo: string; id: string } | null = null;
    try { carga = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    if (!carga) return;
    if (carga.tipo === 'sesion') {
      const s = datos?.sesiones.find((x) => x.id === carga!.id);
      if (!s || (s.fecha === fecha && !(e.altKey || e.ctrlKey))) return;
      moverSesion({ id: s.id, fecha, copiar: e.altKey || e.ctrlKey }).then((r) => (r.success ? cargar() : setError(r.error ?? 'No se ha podido mover.')));
    } else if (carga.tipo === 'plantilla') {
      const p = plantillas.find((x) => x.id === carga!.id);
      if (p) colocarPlantilla(p, fecha);
    }
  }

  async function colocarPlantilla(p: Plantilla, fecha: string) {
    const r = await saveSesion({ destino, fecha, contenido: { ...p } });
    if (!r.success) setError(r.error);
    setPlantillaPorColocar(null);
    cargar();
  }

  return (
    <div className="space-y-3">
      {/* ── DE QUIÉN ── */}
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onVolver} aria-label="Volver a la lista de alumnos"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg border border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className={cx('text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400')}>{esAlumno ? 'Entreno de' : 'Plan común del grupo'}</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">{titulo}</p>
        </div>
      </div>
      <p className={TEXT.muted}>
        {esAlumno
          ? 'Sus entrenos son solo suyos. Sus clases de grupo salen aparte, con candado: se cambian en el cuadrante.'
          : 'Cada sesión la ven todos los alumnos del grupo.'}
      </p>

      {/* ── NAVEGAR Y HERRAMIENTAS ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} aria-label="Anterior" className="w-11 h-11 flex items-center justify-center rounded-lg border border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
          <span className="px-2 text-sm font-bold text-slate-900 dark:text-white min-w-[150px] text-center">
            {vista === 'mes' ? mayuscula(etiquetaMes(mes)) : semanas.map(etiquetaSemana).join(' · ')}
          </span>
          <button onClick={() => mover(1)} aria-label="Siguiente" className="w-11 h-11 flex items-center justify-center rounded-lg border border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          <Boton variant="ghost" size="sm" onClick={irAHoy}>Hoy</Boton>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-hundido dark:bg-noche-hondo/60">
          {([['semana', 'Semana'], ['2semanas', '2 semanas'], ['mes', 'Mes']] as const).map(([v, t]) => (
            <button key={v} onClick={() => setVista(v)} aria-pressed={vista === v}
              className={cx('min-h-[44px] px-3 rounded-lg text-xs font-bold',
                vista === v ? 'bg-white dark:bg-noche-2 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400')}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Boton variant="secondary" size="sm" onClick={() => setBiblioteca((b) => !b)} aria-pressed={biblioteca}>
            <Library size={15} /> Biblioteca{plantillas.length ? ` (${plantillas.length})` : ''}
          </Boton>
          {esAlumno && (
            <Boton variant="secondary" size="sm" disabled={copiandoAnterior} onClick={copiaAnterior}>
              {copiandoAnterior ? <Loader2 size={15} className="animate-spin" /> : <History size={15} />} Su semana anterior
            </Boton>
          )}
          <Boton variant="secondary" size="sm" onClick={() => setCopiando(true)}><Copy size={15} /> Copiar semana</Boton>
          {esAlumno && <Boton variant="secondary" size="sm" onClick={() => setAVarios(true)}><CopyPlus size={15} /> A otros alumnos</Boton>}
          <Boton size="sm" onClick={() => setEditor({ sesion: null, fecha: hoy >= desde && hoy <= hasta ? hoy : desde })}><Plus size={15} /> Sesión</Boton>
        </div>
      </div>

      {biblioteca && (
        <Biblioteca
          plantillas={plantillas}
          onColocar={(p) => setPlantillaPorColocar(p)}
          onCambio={recargarPlantillas}
          onArrastrar={() => setArrastrando('plantilla')}
        />
      )}

      {aviso && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Check size={14} /> {aviso}</p>}
      {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      {!datos && !error && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>}

      {datos && (
        <div className="space-y-3">
          {semanas.map((lunes) => {
            const dias = diasDeSemana(lunes);
            const deLaSemana = dias.flatMap((d) => sesionesPorDia.get(d) ?? []);
            const r = resumenSemana({
              sesiones: deLaSemana, apuntes: datos.apuntes, hoy,
              alumnos: destino.tipo === 'grupo' ? idsMiembros : undefined,
            });
            const nota = datos.notas.find((n) => n.weekStart === lunes
              && (destino.tipo === 'grupo' ? n.classId === destino.id : n.classId === null));
            return (
              <div key={lunes} className="rounded-lg border border-linea dark:border-noche-linea bg-white dark:bg-noche-2 overflow-hidden">
                <NotaSemanaBar destino={destino} lunes={lunes} nota={nota?.note ?? null} onCambio={cargar} />
                <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                  {dias.map((d) => {
                    const ses = sesionesPorDia.get(d) ?? [];
                    const cls = clasesDelDia.get(d) ?? [];
                    const fuera = vista === 'mes' && mesDe(d) !== mes;
                    return (
                      <div
                        key={d}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => alSoltar(e, d)}
                        className={cx(
                          'p-2 flex md:flex-col gap-2 md:min-h-[150px] min-w-0',
                          d === hoy && 'bg-indigo-50/50 dark:bg-indigo-900/10',
                          fuera && 'bg-hundido dark:bg-noche-hondo/40',
                          arrastrando && 'md:hover:bg-indigo-50 md:dark:hover:bg-indigo-900/20',
                        )}
                      >
                        <div className="w-16 md:w-auto shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-1 pt-1 md:pt-0">
                          <span className={cx('text-[11px] font-bold capitalize', d === hoy ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400')}>
                            {etiquetaDia(d).replace(/ \S+$/, '')}
                          </span>
                          {/* En el móvil, un «+» de 44 px bajo la fecha si el día ya tiene algo; en el ordenador, pequeño a la derecha. */}
                          <button onClick={() => setEditor({ sesion: null, fecha: d })} aria-label={`Añadir sesión el ${etiquetaDia(d)}`}
                            className={cx('items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                              'w-11 h-11 md:w-7 md:h-7 md:flex', ses.length || cls.length ? 'flex' : 'hidden')}>
                            <Plus size={15} />
                          </button>
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Sus clases de grupo, aparte y sin tocar: son del cuadrante. */}
                          {cls.map((c) => <TarjetaClase key={`${c.classId}|${c.fecha}`} clase={c} soloLectura compacta />)}
                          {ses.map((s) => (
                            <TarjetaCoach
                              key={s.id}
                              s={s}
                              destino={destino}
                              apuntes={datos.apuntes.filter((a) => a.sessionId === s.id)}
                              miembros={idsMiembros.length}
                              hoy={hoy}
                              nombreGrupo={s.classId ? datos.nombresGrupo[s.classId] ?? 'Grupo' : null}
                              onAbrir={() => setEditor({ sesion: s, fecha: s.fecha })}
                              onArrastrar={() => setArrastrando('sesion')}
                            />
                          ))}
                          {ses.length === 0 && (
                            <button onClick={() => setEditor({ sesion: null, fecha: d })}
                              className="md:hidden w-full min-h-[44px] rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center gap-1.5">
                              <Plus size={14} /> {esAlumno ? 'Añadir entreno' : 'Añadir sesión'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <ResumenFila r={r} grupo={destino.tipo === 'grupo'} />
              </div>
            );
          })}
          <p className={cx(TEXT.muted, 'hidden md:block text-right')}>Arrastra una sesión a otro día para moverla; con Alt o Ctrl, para copiarla.</p>
        </div>
      )}

      {editor && datos && (
        <EditorSesion
          destino={destino}
          fecha={editor.fecha}
          sesion={editor.sesion}
          plantillas={plantillas}
          apuntes={datos.apuntes}
          miembros={datos.miembros}
          hoy={hoy}
          rm={esAlumno ? datos.rm : null}
          nombreGrupo={editor.sesion?.classId ? datos.nombresGrupo[editor.sesion.classId] ?? null : destino.tipo === 'grupo' ? titulo : null}
          onCerrar={() => setEditor(null)}
          onCambio={tras}
        />
      )}

      {plantillaPorColocar && (
        <Modal title={`«${plantillaPorColocar.title}»`} subtitle="¿Qué día?" onClose={() => setPlantillaPorColocar(null)} width="sm">
          <div className="grid grid-cols-2 gap-2">
            {semanas.flatMap(diasDeSemana).filter((d) => vista !== 'mes' || mesDe(d) === mes).map((d) => (
              <Boton key={d} variant={d === hoy ? 'primary' : 'secondary'} size="sm" onClick={() => colocarPlantilla(plantillaPorColocar, d)}>
                <span className="capitalize">{etiquetaDia(d)}</span>
              </Boton>
            ))}
          </div>
        </Modal>
      )}

      {copiando && (
        <CopiarSemana destino={destino} semanas={semanas} onCerrar={() => setCopiando(false)} onHecho={() => { setCopiando(false); cargar(); }} />
      )}

      {aVarios && esAlumno && (
        <CopiarAVarios alumnos={alumnos} grupos={grupos} lunes={desde} origen={destino.id} destinos={new Set()}
          onCerrar={() => setAVarios(false)}
          onHecho={(texto) => { setAVarios(false); setAviso(texto); }} />
      )}
    </div>
  );
}

// ── Una sesión en el calendario del preparador ──

function TarjetaCoach({ s, destino, apuntes, miembros, hoy, nombreGrupo, onAbrir, onArrastrar }: {
  s: Sesion;
  destino: Destino;
  apuntes: ApunteConCorreo[];
  miembros: number;
  hoy: string;
  nombreGrupo: string | null;
  onAbrir: () => void;
  onArrastrar: () => void;
}) {
  const E = ESTILO_TIPO[s.kind];
  const Icono = E.icono;
  const deGrupoEnAlumno = destino.tipo === 'alumno' && !!s.classId;
  const meta = [formateaMinutos(s.durationMin), formateaKm(s.distanceKm)].filter(Boolean).join(' · ');
  const hechas = apuntes.filter((a) => a.status === 'hecha').length;
  const comentarios = apuntes.filter((a) => a.comment).length;
  const estadoAlumno = destino.tipo === 'alumno' ? estadoSesion(s.fecha, apuntes[0], hoy) : null;

  return (
    <button
      draggable={!deGrupoEnAlumno}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'sesion', id: s.id })); onArrastrar(); }}
      onClick={onAbrir}
      className={cx(
        'w-full min-h-[44px] text-left rounded-lg overflow-hidden flex border transition-colors hover:shadow-sm',
        deGrupoEnAlumno ? 'border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-noche-2' : 'border-linea dark:border-noche-linea bg-white dark:bg-noche-2',
      )}
    >
      <span className={cx('w-1 shrink-0', E.barra)} />
      <span className="flex-1 min-w-0 px-2 py-1.5">
        <span className="flex items-center gap-1.5 min-w-0">
          <Icono size={12} className={cx('shrink-0 rounded', E.chip)} />
          <span className="text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">{s.title}</span>
        </span>
        {s.cargas.length > 0 && (
          <span className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 mt-0.5">
            {s.cargas.length} {s.cargas.length === 1 ? 'carga' : 'cargas'} en % 1RM
          </span>
        )}
        {(meta || deGrupoEnAlumno) && (
          <span className="block text-[10px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
            {meta}{meta && deGrupoEnAlumno ? ' · ' : ''}{deGrupoEnAlumno ? nombreGrupo : ''}
          </span>
        )}
        {s.fecha <= hoy && s.kind !== 'descanso' && (
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-bold">
            {destino.tipo === 'grupo' ? (
              <span className={cx('px-1.5 py-0.5 rounded-md', hechas === miembros && miembros > 0
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                <Check size={9} strokeWidth={3} className="inline -mt-px" /> {hechas}/{miembros}
              </span>
            ) : estadoAlumno === 'hecha' ? (
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Hecha{apuntes[0]?.rpe != null && ` · ${apuntes[0].rpe}/10`}</span>
            ) : estadoAlumno === 'no_hecha' ? (
              <span className="px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"><X size={9} strokeWidth={3} className="inline -mt-px" /> No hecha</span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Sin apuntar</span>
            )}
            {comentarios > 0 && <span className="text-indigo-600 dark:text-indigo-300 flex items-center gap-0.5"><MessageSquare size={10} /> {comentarios}</span>}
          </span>
        )}
      </span>
    </button>
  );
}

function ResumenFila({ r, grupo }: { r: ReturnType<typeof resumenSemana>; grupo: boolean }) {
  const pct = r.posibles ? Math.round((r.hechas / r.posibles) * 100) : null;
  return (
    <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-hundido dark:bg-noche-hondo/40 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
      <span><b className="text-slate-900 dark:text-white">{r.sesiones}</b> {r.sesiones === 1 ? 'sesión' : 'sesiones'}</span>
      {formateaMinutos(r.minutos) && <span>{formateaMinutos(r.minutos)}</span>}
      {formateaKm(r.kilometros) && <span>{formateaKm(r.kilometros)}</span>}
      {pct !== null && <span>Cumplido <b className="text-slate-900 dark:text-white">{pct} %</b>{grupo && ` (${r.hechas}/${r.posibles})`}</span>}
      {r.rpeMedio !== null && <span>Esfuerzo medio <b className="text-slate-900 dark:text-white">{r.rpeMedio.toLocaleString('es-ES')}/10</b></span>}
    </div>
  );
}

function NotaSemanaBar({ destino, lunes, nota, onCambio }: { destino: Destino; lunes: string; nota: string | null; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota ?? '');
  const [guardando, setGuardando] = useState(false);

  if (editando) {
    return (
      <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-indigo-900/15 flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <Campo label={`Nota de la semana del ${etiquetaSemana(lunes)}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300}
            placeholder="Semana de carga · lo importante es…" autoFocus />
        </div>
        <Boton size="sm" disabled={guardando} onClick={async () => {
          setGuardando(true);
          const r = await setNotaSemana({ destino, weekStart: lunes, note: texto });
          setGuardando(false);
          if (r.success) { setEditando(false); onCambio(); }
        }}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar</Boton>
        <Boton size="sm" variant="ghost" onClick={() => { setEditando(false); setTexto(nota ?? ''); }}>Cancelar</Boton>
      </div>
    );
  }
  return (
    <button onClick={() => { setTexto(nota ?? ''); setEditando(true); }}
      className={cx('w-full min-h-[44px] px-3 py-1.5 text-left text-xs flex items-center gap-2 border-b border-slate-100 dark:border-slate-800',
        nota ? 'bg-indigo-50/70 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 font-semibold' : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600')}>
      <StickyNote size={13} className="shrink-0" />
      <span className="truncate">{nota ?? `Semana del ${etiquetaSemana(lunes)} · añadir una nota`}</span>
    </button>
  );
}

// ── La biblioteca de plantillas ──

function Biblioteca({ plantillas, onColocar, onCambio, onArrastrar }: {
  plantillas: Plantilla[];
  onColocar: (p: Plantilla) => void;
  onCambio: () => void;
  onArrastrar: () => void;
}) {
  if (!plantillas.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">La biblioteca está vacía</p>
        <p className={TEXT.muted}>Abre cualquier sesión y pulsa «Guardar como plantilla». Luego la podrás poner en cualquier día con un toque o arrastrándola.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-linea dark:border-noche-linea bg-white dark:bg-noche-2 p-3 space-y-2">
      <p className={TEXT.muted}>
        <span className="hidden md:inline">Arrastra una plantilla a un día, o </span>tócala para elegir el día.
      </p>
      {TIPOS_SESION.map((t) => {
        const deTipo = plantillas.filter((p) => p.kind === t);
        if (!deTipo.length) return null;
        const E = ESTILO_TIPO[t];
        const Icono = E.icono;
        return (
          <div key={t}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">{ETIQUETA_TIPO[t]}</p>
            <div className="flex flex-wrap gap-1.5">
              {deTipo.map((p) => (
                <span key={p.id} className={cx('inline-flex items-center rounded-lg overflow-hidden max-w-full', E.chip)}>
                  <button
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'plantilla', id: p.id })); onArrastrar(); }}
                    onClick={() => onColocar(p)}
                    className="min-h-[40px] pl-2.5 pr-2 inline-flex items-center gap-1.5 text-xs font-bold min-w-0"
                  >
                    <Icono size={13} className="shrink-0" /> <span className="truncate">{p.title}</span>
                  </button>
                  <button aria-label={`Borrar la plantilla ${p.title}`}
                    onClick={async () => { if ((await confirmar(`¿Borrar la plantilla «${p.title}»? Las sesiones ya puestas no cambian.`))) { const r = await deletePlantilla({ id: p.id }); if (r.success) onCambio(); } }}
                    className="min-h-[40px] px-2 opacity-60 hover:opacity-100">
                    <Trash2 size={13} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
      <p className={cx(TEXT.muted, 'flex items-center gap-1')}><Pencil size={11} /> Para cambiar una plantilla, ponla en un día, edítala y vuelve a guardarla como plantilla.</p>
    </div>
  );
}

// ── Copiar una semana ──

function CopiarSemana({ destino, semanas, onCerrar, onHecho }: {
  destino: Destino;
  semanas: string[];
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [origen, setOrigen] = useState(semanas[0]);
  const [saltos, setSaltos] = useState(1);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = sumaDias(origen, 7 * saltos);

  return (
    <Modal title="Copiar una semana" subtitle="Las mismas sesiones, el mismo día de la semana" onClose={onCerrar} width="sm"
      footer={
        <Boton disabled={guardando} onClick={async () => {
          setGuardando(true);
          const r = await copiarSemanaFisica({ destino, desde: origen, a });
          setGuardando(false);
          if (!r.success) { setError(r.error); return; }
          onHecho();
        }}>
          {guardando ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Copiar
        </Boton>
      }>
      <div className="space-y-3">
        <CampoSelect label="Copiar la semana del" value={origen} onChange={(e) => setOrigen(e.target.value)}>
          {semanas.map((l) => <option key={l} value={l}>{etiquetaSemana(l)}</option>)}
        </CampoSelect>
        <CampoSelect label="A la semana del" value={String(saltos)} onChange={(e) => setSaltos(Number(e.target.value))}>
          {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{etiquetaSemana(sumaDias(origen, 7 * n))}{n === 1 ? ' (la siguiente)' : ''}</option>
          ))}
        </CampoSelect>
        <p className={TEXT.muted}>Lo que ya haya en la semana de destino se queda; las copiadas se añaden.</p>
        {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
