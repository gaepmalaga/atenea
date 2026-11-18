'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Copy, Check, BookOpen, Trash2, CalendarX2 } from 'lucide-react';
import { getTeoria, saveClaseTeoria, copiarSemanaTeoria } from '@/actions';
import type { DatosTeoria } from '@/app/actions/teoria';
import {
  clasesDeTeoria, sinRellenar, choquesDeTeoria, temasDeAsignaciones, avanceDeGrupo, leeTemas, textoTemas, horasDeTeoria,
  type ClaseTeoria,
} from '@/app/lib/teoria';
import { lunesDe } from '@/app/lib/sesiones';
import { sumaDias, DIAS_SEMANA, diaSemanaDe } from '@/app/lib/asistencia';
import { etiquetaRango } from '@/app/lib/cuadrante';
import { nombrePila } from '@/app/lib/cuadrante';
import { Hoja, Boton, Modal, Campo, CampoSelect, EmptyState, TEXT, cx } from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * CUADRANTE DE TEORÍA (regla 131): cada clase de cada grupo sale vacía y se
 * apunta quién va (uno) y qué tema da. Programable con antelación y editable.
 * Segunda vista: el avance del temario de cada grupo.
 */

function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const clave = (c: { classId: string; fecha: string }) => `${c.classId}|${c.fecha}`;
const diaLargo = (fecha: string) => `${DIAS_SEMANA[diaSemanaDe(fecha) - 1].largo} ${Number(fecha.slice(8, 10))}`;

type Edicion = { clase: ClaseTeoria; profesorId: string; temas: string; nota: string };

export default function AdminTeoria() {
  const [vista, setVista] = useState<'semana' | 'avance'>('semana');
  const [lunes, setLunes] = useState(() => lunesDe(hoyLocal()));
  const [datos, setDatos] = useState<DatosTeoria | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [edicion, setEdicion] = useState<Edicion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [grupoAvance, setGrupoAvance] = useState<string | null>(null);

  const cargar = useCallback(async (l: string) => {
    setCargando(true);
    const res = await getTeoria({ lunes: l });
    if (res.success) { setDatos(res.datos); setError(null); } else setError(res.error);
    setCargando(false);
  }, []);
  useEffect(() => { cargar(lunes); }, [lunes, cargar]);

  const nombres = useMemo(() => new Map((datos?.profesores ?? []).map((p) => [p.id, p.nombre])), [datos]);
  const choques = useMemo(() => (datos ? choquesDeTeoria(datos.clases, nombres) : new Map<string, string>()), [datos, nombres]);
  const porDia = useMemo(() => {
    const m = new Map<string, ClaseTeoria[]>();
    for (const c of datos?.clases ?? []) m.set(c.fecha, [...(m.get(c.fecha) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [datos]);
  const vacias = datos ? sinRellenar(datos.clases) : 0;

  async function copiaAnterior() {
    setOcupado(true); setError(null); setAviso(null);
    const r = await copiarSemanaTeoria({ desde: sumaDias(lunes, -7), a: lunes });
    if (r.success) {
      setAviso(r.creadas ? `Copiadas ${r.creadas} clases de la semana anterior${r.omitidas ? ` (${r.omitidas} ya estaban)` : ''}.` : 'No había nada que copiar.');
      await cargar(lunes);
    } else setError(r.error);
    setOcupado(false);
  }

  function abre(c: ClaseTeoria) {
    setEdicion({ clase: c, profesorId: c.profesorId ?? '', temas: c.temas.join(', '), nota: c.nota ?? '' });
  }

  async function guarda(vaciar = false) {
    if (!edicion) return;
    setOcupado(true); setError(null);
    const r = await saveClaseTeoria({
      classId: edicion.clase.classId, fecha: edicion.clase.fecha,
      profesorId: vaciar ? null : edicion.profesorId || null,
      temas: vaciar ? [] : leeTemas(edicion.temas),
      nota: vaciar ? null : edicion.nota,
    });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    setEdicion(null);
    setAviso(r.borrada ? 'Clase vaciada.' : 'Clase guardada.');
    await cargar(lunes);
  }

  const fin = sumaDias(lunes, 6);
  const hayGrupos = !!datos?.grupos.length;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['semana', 'avance'] as const).map((v) => (
          <Boton key={v} size="sm" variant={vista === v ? 'primary' : 'secondary'} onClick={() => setVista(v)}>
            {v === 'semana' ? 'Cuadrante' : 'Temas dados'}
          </Boton>
        ))}
      </div>

      {vista === 'semana' && (
        <Hoja tone="base" pad="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setLunes(sumaDias(lunes, -7))} aria-label="Semana anterior"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-linea text-slate-700 hover:border-indigo-700 dark:border-noche-linea dark:text-slate-300">
              <ChevronLeft size={20} />
            </button>
            <div className="min-w-0 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">Semana</p>
              <p className="font-titulo text-xl font-bold uppercase leading-tight tracking-wide text-slate-900 dark:text-white sm:text-2xl">{etiquetaRango(lunes, fin)}</p>
              {lunes !== lunesDe(hoyLocal()) && (
                <button onClick={() => setLunes(lunesDe(hoyLocal()))} className="min-h-[44px] px-2 text-xs font-semibold text-indigo-900 underline dark:text-indigo-200">Ir a esta semana</button>
              )}
            </div>
            <button onClick={() => setLunes(sumaDias(lunes, 7))} aria-label="Semana siguiente"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-linea text-slate-700 hover:border-indigo-700 dark:border-noche-linea dark:text-slate-300">
              <ChevronRight size={20} />
            </button>
          </div>
          {datos && hayGrupos && (
            <p className={cx('text-xs font-semibold', vacias ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-300')}>
              {vacias ? `${vacias} ${vacias === 1 ? 'clase sin rellenar' : 'clases sin rellenar'} esta semana.` : 'Todas las clases de la semana tienen profesor y tema.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Boton size="sm" variant="secondary" disabled={!hayGrupos || ocupado}
              icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />} onClick={copiaAnterior}>
              Copiar semana anterior
            </Boton>
          </div>
          {aviso && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><Check size={14} /> {aviso}</p>}
          {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
        </Hoja>
      )}

      {cargando && !datos ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      ) : !hayGrupos ? (
        <EmptyState icon={<BookOpen size={40} />} title="No hay grupos de teoría con horario"
          hint="Crea los grupos en la pestaña «Grupos» con el tipo «Teoría» y sus días de clase: aquí saldrán solos." bordered />
      ) : vista === 'semana' ? (
        <>
          {porDia.length === 0 && <p className={cx(TEXT.muted, 'py-6 text-center')}>Esta semana no hay clases de teoría.</p>}
          <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
            {porDia.map(([fecha, clases]) => (
              <Hoja key={fecha} tone="base" pad="md" className="space-y-2">
                <p className="font-titulo text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-white">{diaLargo(fecha)}</p>
                {clases.map((c) => {
                  const choque = choques.get(clave(c));
                  const pasada = fecha < (datos?.hoy ?? '');
                  return (
                    <button key={clave(c)} type="button" onClick={() => abre(c)}
                      className={cx('block min-h-[44px] w-full rounded-lg border px-3 py-2 text-left',
                        c.vacia ? 'border-dashed border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/10' : 'border-linea bg-white dark:border-noche-linea dark:bg-slate-900',
                        pasada && 'opacity-75')}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{c.grupo}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-400">{c.inicio ?? ''}{c.fin ? `–${c.fin}` : ''}</span>
                      </span>
                      {c.vacia ? (
                        <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">Sin rellenar · toca para apuntar</span>
                      ) : (
                        <span className="block text-sm text-slate-800 dark:text-slate-200">
                          {c.profesorId ? nombrePila(nombres.get(c.profesorId) ?? 'Profesor') : <i className="text-amber-800 dark:text-amber-200">Sin profesor</i>}
                          {c.temas.length > 0 ? <> · <b>Tema {textoTemas(c.temas)}</b></> : <> · <i className="text-amber-800 dark:text-amber-200">sin tema</i></>}
                        </span>
                      )}
                      {c.nota && <span className="block text-xs text-slate-600 dark:text-slate-400">{c.nota}</span>}
                      {choque && <span className="block text-xs font-semibold text-red-700 dark:text-red-300">{choque}</span>}
                    </button>
                  );
                })}
              </Hoja>
            ))}
          </div>
          {datos && datos.sinClase.length > 0 && (
            <p className={cx(TEXT.muted, 'flex items-center gap-1.5 text-xs')}>
              <CalendarX2 size={14} /> {datos.sinClase.length} {datos.sinClase.length === 1 ? 'clase marcada' : 'clases marcadas'} «sin clase» esta semana (se cambia en «Asistencia»).
            </p>
          )}
          {datos && (
            <Hoja tone="sunken" pad="md" className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600 dark:text-slate-400">Horas de esta semana</p>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-800 dark:text-slate-200">
                {datos.profesores.map((p) => (
                  <li key={p.id}><b>{nombrePila(p.nombre)}</b> {Math.round(horasDeTeoria(datos.clases, p.id) * 10) / 10} h</li>
                ))}
              </ul>
            </Hoja>
          )}
        </>
      ) : (
        datos && <Avance datos={datos} grupoId={grupoAvance ?? datos.grupos[0].id} onGrupo={setGrupoAvance} nombres={nombres} />
      )}

      {edicion && (
        <Modal title={edicion.clase.grupo} subtitle={`${diaLargo(edicion.clase.fecha)} · ${edicion.clase.inicio ?? ''}`} width="sm" onClose={() => setEdicion(null)}
          footer={
            <div className="flex w-full gap-2">
              {!edicion.clase.vacia && (
                <Boton variant="ghost" icon={<Trash2 size={14} />} disabled={ocupado}
                  onClick={async () => { if (await confirmar('¿Dejar esta clase sin asignar?')) guarda(true); }}>Vaciar</Boton>
              )}
              <div className="flex-1" />
              <Boton variant="secondary" onClick={() => setEdicion(null)}>Cancelar</Boton>
              <Boton disabled={ocupado} icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : undefined} onClick={() => guarda()}>Guardar</Boton>
            </div>
          }>
          <div className="space-y-4">
            <CampoSelect label="Quién da la clase" value={edicion.profesorId} onChange={(e) => setEdicion({ ...edicion, profesorId: e.target.value })}>
              <option value="">— Sin asignar —</option>
              {(datos?.profesores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </CampoSelect>
            <Campo label="Tema (o temas)" inputMode="text" value={edicion.temas} placeholder="8  ·  8, 9  ·  1-3"
              onChange={(e) => setEdicion({ ...edicion, temas: e.target.value })}
              hint={datos ? `Números del temario (1–${Math.max(...datos.temario.map((t) => t.numero), 1)}). ${leeTemas(edicion.temas).map((n) => datos.temario.find((t) => t.numero === n)?.titulo ?? `Tema ${n}`).join(' · ')}` : undefined} />
            <Campo label="Nota (opcional)" value={edicion.nota} maxLength={200} onChange={(e) => setEdicion({ ...edicion, nota: e.target.value })} />
            {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** El temario de un grupo: dado, programado y pendiente. */
function Avance({ datos, grupoId, onGrupo, nombres }: {
  datos: DatosTeoria; grupoId: string; onGrupo: (id: string) => void; nombres: Map<string, string>;
}) {
  const temario = datos.temario.map((t) => t.numero);
  const dados = useMemo(() => temasDeAsignaciones(datos.historico), [datos.historico]);
  const av = avanceDeGrupo(dados, grupoId, temario, datos.hoy);
  const info = new Map(dados.filter((d) => d.classId === grupoId).map((d) => [d.tema, d]));
  const dado = new Set(av.dado.map((d) => d.tema));
  const prog = new Set(av.programado.map((d) => d.tema));
  return (
    <div className="space-y-3">
      <CampoSelect label="Grupo" value={grupoId} onChange={(e) => onGrupo(e.target.value)}>
        {datos.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
      </CampoSelect>
      <p className="text-sm text-slate-800 dark:text-slate-200">
        <b>{av.dado.length}</b> de {temario.length} temas dados · <b>{av.programado.length}</b> programados · <b>{av.pendientes.length}</b> pendientes
      </p>
      <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
        {datos.temario.map((t) => {
          const d = info.get(t.numero);
          const estado = dado.has(t.numero) ? 'dado' : prog.has(t.numero) ? 'prog' : 'pend';
          return (
            <div key={t.numero} className={cx('rounded-lg border px-3 py-2 text-sm',
              estado === 'dado' && 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20',
              estado === 'prog' && 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-900/20',
              estado === 'pend' && 'border-linea bg-white dark:border-noche-linea dark:bg-slate-900')}>
              <p className="font-bold text-slate-900 dark:text-white">Tema {t.numero}</p>
              <p className="truncate text-xs text-slate-600 dark:text-slate-400" title={t.titulo}>{t.titulo}</p>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {d ? `${estado === 'dado' ? 'Dado' : 'Programado'} el ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}${d.profesorId ? ` · ${nombrePila(nombres.get(d.profesorId) ?? '')}` : ''}` : 'Pendiente'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
