'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, FileDown, Loader2, Trash2 } from 'lucide-react';
import { borraPsicoClase, creaPsicoClase, getDetallePsicoClase, getGroups, getHojaPsicoClase, getPsicoClases } from '@/actions';
import type { DetallePsicoClase, PsicoClaseResumen } from '@/app/actions/psico-clase';
import type { GroupRow } from '@/app/actions/groups';
import type { EstadoEntrega } from '@/app/lib/examen-clase';
import { EJERCICIOS_PSICO, TIPOS_PSICO, TIPO_PSICO_LABEL, type NumeroEjercicio, type TipoPsico } from '@/app/lib/psico';
import { MAX_TOTAL_CLASE, MAX_MINUTOS_CLASE, TOTALES_CLASE, minutosPorDefecto } from '@/app/lib/psico-clase';
import { Hoja, BloqueTitulo, Aviso, Boton, Campo, EmptyState, Etiqueta, Filtros, FiltroChip, cx } from '../../../ui';
import { imprimeHojaPsico } from './hojaPsico';

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const masDias = (f: string, n: number) => { const d = new Date(`${f}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

const ESTADO: Record<EstadoEntrega, { texto: string; tono: 'ok' | 'aviso' | 'malo' | 'apagado' | 'neutro' }> = {
  entregado: { texto: 'Entregó', tono: 'ok' }, pendiente: { texto: 'Sin entregar', tono: 'aviso' },
  proximo: { texto: 'Aún no es el día', tono: 'apagado' }, ausente: { texto: 'No se presentó', tono: 'malo' }, cerrado: { texto: 'Plazo cerrado', tono: 'malo' },
};

/**
 * LOS PSICOTÉCNICOS EN CLASE (regla 127): el mismo examen para todo un turno,
 * filtrado por tipo de pregunta, que se hace en la pantalla (con el reloj del
 * servidor) o en papel (se imprime y el alumno pasa luego la hoja). Aquí se
 * pone, se imprime y se sigue quién lo ha hecho y dónde falla la clase.
 */
export default function PsicoClase() {
  const [examenes, setExamenes] = useState<PsicoClaseResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await getPsicoClases();
    if (!r.success) { setError(r.error); setExamenes([]); return; }
    setError(null); setExamenes(r.examenes);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (abierto) return <Detalle id={abierto} onVolver={() => { setAbierto(null); cargar(); }} />;
  if (creando) return <Crear onListo={(id) => { setCreando(false); setAbierto(id); }} onCancelar={() => setCreando(false)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-300">
          El mismo psicotécnico para todo un turno: tú eliges los tipos de pregunta, ellos lo hacen en la pantalla o en papel, y aquí ves la nota de cada uno y dónde falla la clase.
        </p>
        <Boton onClick={() => setCreando(true)}>Poner un psicotécnico</Boton>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {examenes === null && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
      {examenes?.length === 0 && !error && <EmptyState title="Todavía no has puesto ningún psicotécnico en clase" hint="Pulsa «Poner un psicotécnico»: eliges los tipos, el turno y el día." bordered />}
      <div className="grid gap-3">
        {examenes?.map((e) => (
          <Hoja key={e.id} pad="md" className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 dark:text-white">{e.titulo}</p>
                <p className="text-[13px] text-slate-600 dark:text-slate-400">
                  {fechaCorta(e.fecha)} · {e.total} preguntas · {e.minutos} min · {e.grupos.length ? e.grupos.join(', ') : 'toda la academia'}
                </p>
              </div>
              <div className="text-right text-[13px]">
                <p className="font-semibold tabular-nums">{e.entregados} de {e.participantes} entregados</p>
                <p className="text-slate-600 dark:text-slate-400">{e.notaMedia !== null ? `media ${num(e.notaMedia)}` : 'sin notas aún'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {(e.tipos.length === TIPOS_PSICO.length ? ['Todos los tipos'] : e.tipos.map((t) => TIPO_PSICO_LABEL[t])).map((t) => <Etiqueta key={t} tono="neutro">{t}</Etiqueta>)}
            </div>
            <Boton size="sm" variant="secondary" onClick={() => setAbierto(e.id)}>Abrir</Boton>
          </Hoja>
        ))}
      </div>
    </div>
  );
}

// ── Poner un psicotécnico ──

function Crear({ onListo, onCancelar }: { onListo: (id: string) => void; onCancelar: () => void }) {
  const [grupos, setGrupos] = useState<GroupRow[]>([]);
  const [ejercicio, setEjercicio] = useState<NumeroEjercicio | null>(null);
  const [tipos, setTipos] = useState<Set<TipoPsico>>(new Set(TIPOS_PSICO));
  const [total, setTotal] = useState('40');
  const [minutos, setMinutos] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [cierre, setCierre] = useState(masDias(hoyISO(), 7));
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [titulo, setTitulo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getGroups().then((r) => { if (r.success) setGrupos(r.groups); }); }, []);
  const conAlumnos = useMemo(() => grupos.filter((g) => g.miembros > 0), [grupos]);
  const alterna = (t: TipoPsico) => setTipos((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const totalNum = Number(total);
  const minutosAuto = Number.isInteger(totalNum) && totalNum > 0 ? minutosPorDefecto(totalNum) : null;

  async function pon() {
    setEnviando(true); setError(null);
    const r = await creaPsicoClase({ titulo, ejercicio, tipos: [...tipos], total: totalNum, minutos: minutos === '' ? null : Number(minutos), classIds: [...elegidos], fecha, cierre: cierre || null });
    setEnviando(false);
    if (!r.success) { setError(r.error); return; }
    onListo(r.id);
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onCancelar} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><ChevronLeft size={16} /> Psicotécnicos en clase</button>
      <Hoja pad="md" className="space-y-5">
        <BloqueTitulo>Poner un psicotécnico a un turno</BloqueTitulo>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué examen</p>
          <Filtros etiqueta="Qué examen">
            {([1, 2, 3] as const).map((n) => (
              <FiltroChip key={n} activo={ejercicio === n} onClick={() => setEjercicio(ejercicio === n ? null : n)}>
                {EJERCICIOS_PSICO[n].nombre} · {EJERCICIOS_PSICO[n].total} preguntas
              </FiltroChip>
            ))}
            <FiltroChip activo={ejercicio === null} onClick={() => setEjercicio(null)}>A mi manera</FiltroChip>
          </Filtros>
          {ejercicio && <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{EJERCICIOS_PSICO[ejercicio].nombre}: {EJERCICIOS_PSICO[ejercicio].descripcion}, {EJERCICIOS_PSICO[ejercicio].total} preguntas en {EJERCICIOS_PSICO[ejercicio].minutos} minutos, como en el examen.</p>}
        </div>

        {!ejercicio && (
          <>
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué tipos de pregunta <span className="font-normal text-slate-600 dark:text-slate-400">· {tipos.size} de {TIPOS_PSICO.length}</span></p>
                <div className="flex gap-2">
                  <Boton size="sm" variant="ghost" onClick={() => setTipos(new Set(TIPOS_PSICO))}>Todos</Boton>
                  <Boton size="sm" variant="ghost" onClick={() => setTipos(new Set())}>Ninguno</Boton>
                </div>
              </div>
              <Filtros etiqueta="Tipos de pregunta">
                {TIPOS_PSICO.map((t) => <FiltroChip key={t} activo={tipos.has(t)} onClick={() => alterna(t)}>{TIPO_PSICO_LABEL[t]}</FiltroChip>)}
              </Filtros>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Campo label="Cuántas preguntas" type="number" inputMode="numeric" min={1} max={MAX_TOTAL_CLASE} value={total} onChange={(e) => setTotal(e.target.value)} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">{TOTALES_CLASE.map((n) => <Boton key={n} size="sm" variant="ghost" onClick={() => setTotal(String(n))}>{n}</Boton>)}</div>
              </div>
              <Campo label="Minutos" type="number" inputMode="numeric" min={1} max={MAX_MINUTOS_CLASE} value={minutos} onChange={(e) => setMinutos(e.target.value)}
                placeholder={minutosAuto ? String(minutosAuto) : ''} hint="Vacío = unos 33 segundos por pregunta, como en el examen." />
            </div>
          </>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Día del examen" type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); if (cierre && cierre < e.target.value) setCierre(masDias(e.target.value, 7)); }} />
          <Campo label="Pueden entregarlo hasta" type="date" value={cierre} min={fecha} onChange={(e) => setCierre(e.target.value)} hint="Vacío = sin límite." />
        </div>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Qué grupos lo hacen</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-linea p-1 dark:border-noche-linea">
            {conAlumnos.length === 0 && <p className="p-2 text-sm text-slate-600 dark:text-slate-400">Todavía no hay grupos con alumnos: se pondrá a toda la academia.</p>}
            {conAlumnos.map((g) => (
              <label key={g.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-black/5 dark:hover:bg-white/5">
                <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegidos.has(g.id)}
                  onChange={() => setElegidos((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })} />
                <span className="min-w-0 flex-1 text-sm text-slate-900 dark:text-white">{g.name} <span className="text-slate-600 dark:text-slate-400">· {g.miembros} {g.miembros === 1 ? 'alumno' : 'alumnos'}{g.kindLabel ? ` · ${g.kindLabel}` : ''}</span></span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{elegidos.size === 0 ? 'Ninguno marcado: lo harán todos los alumnos de la academia.' : `${elegidos.size} ${elegidos.size === 1 ? 'grupo' : 'grupos'}.`}</p>
        </div>

        <Campo label="Nombre propio (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Si lo dejas vacío se llama por los tipos y el día" />

        {error && <Aviso tono="malo">{error}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton onClick={pon} disabled={enviando || (!ejercicio && tipos.size === 0)}>{enviando ? 'Poniéndolo…' : 'Poner el examen'}</Boton>
          <Boton variant="ghost" onClick={onCancelar}>Cancelar</Boton>
        </div>
      </Hoja>
    </div>
  );
}

// ── Un examen puesto ──

function Detalle({ id, onVolver }: { id: string; onVolver: () => void }) {
  const [d, setD] = useState<DetallePsicoClase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await getDetallePsicoClase(id);
    if (!r.success) { setError(r.error); return; }
    setError(null); setD(r.detalle);
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  async function imprime() {
    setImprimiendo(true); setAviso(null);
    const r = await getHojaPsicoClase(id);
    if (!r.success) { setImprimiendo(false); setAviso(r.error); return; }
    const ok = await imprimeHojaPsico({ titulo: r.titulo, fecha: r.fecha, minutos: r.minutos, preguntas: r.preguntas });
    setImprimiendo(false);
    if (!ok) setAviso('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para esta página y vuelve a probar.');
  }
  async function borra() {
    if (!confirm('¿Borrar este examen y todas las notas que ya tenga? No se puede deshacer.')) return;
    setBorrando(true);
    const r = await borraPsicoClase(id);
    if (!r.success) { setBorrando(false); setAviso(r.error ?? 'No se ha podido borrar.'); return; }
    onVolver();
  }

  if (error) return <div className="space-y-3"><button type="button" onClick={onVolver} className="text-sm font-semibold text-indigo-700">← Volver</button><Aviso tono="malo">{error}</Aviso></div>;
  if (!d) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  const e = d.examen;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onVolver} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300"><ChevronLeft size={16} /> Psicotécnicos en clase</button>
      <Hoja pad="md" className="space-y-3">
        <div>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{e.titulo}</p>
          <p className="text-[13px] text-slate-600 dark:text-slate-400">{fechaCorta(e.fecha)}{e.cierre ? ` · hasta el ${fechaCorta(e.cierre)}` : ''} · {e.total} preguntas · {e.minutos} min · {e.grupos.length ? e.grupos.join(', ') : 'toda la academia'}</p>
        </div>
        <div className="flex flex-wrap gap-1">{(e.tipos.length === TIPOS_PSICO.length ? ['Todos los tipos'] : e.tipos.map((t) => TIPO_PSICO_LABEL[t])).map((t) => <Etiqueta key={t} tono="neutro">{t}</Etiqueta>)}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.entregados}<span className="text-base text-slate-600 dark:text-slate-400"> / {d.resumen.participantes}</span></p><p className="text-xs text-slate-600 dark:text-slate-400">entregados</p></div>
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.notaMedia !== null ? num(d.resumen.notaMedia) : '—'}</p><p className="text-xs text-slate-600 dark:text-slate-400">nota media</p></div>
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.participantes - d.resumen.entregados}</p><p className="text-xs text-slate-600 dark:text-slate-400">sin entregar</p></div>
        </div>
        {aviso && <Aviso tono="aviso">{aviso}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton size="sm" icon={<FileDown size={14} />} onClick={imprime} disabled={imprimiendo}>{imprimiendo ? 'Preparando…' : 'Imprimir la hoja'}</Boton>
          <Boton size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={borra} disabled={borrando}>Borrar</Boton>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">La hoja trae las preguntas, la hoja de respuestas del alumno y, en otra página, el solucionario. Los alumnos que lo hagan en papel pasan sus respuestas desde «Psicotécnicos»; los demás lo hacen en la pantalla, con reloj.</p>
      </Hoja>

      {d.resumen.porTipo.length > 0 && (
        <Hoja pad="md" className="space-y-3">
          <BloqueTitulo>Dónde falla la clase</BloqueTitulo>
          <div className="space-y-2">
            {d.resumen.porTipo.map((t) => (
              <div key={t.tipo} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]">{TIPO_PSICO_LABEL[t.tipo]} <span className="text-slate-600 dark:text-slate-400">· {t.preguntas} respuestas</span></p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full border border-linea bg-hundido dark:border-noche-linea dark:bg-noche-hondo">
                    <div className={cx('h-full', t.acierto < 0.5 ? 'bg-amber-500' : 'bg-indigo-900 dark:bg-indigo-300')} style={{ width: `${Math.round(t.acierto * 100)}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{Math.round(t.acierto * 100)} %</span>
              </div>
            ))}
          </div>
        </Hoja>
      )}

      <Hoja pad="md" className="space-y-2">
        <BloqueTitulo>Alumnos</BloqueTitulo>
        {d.participantes.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Ese turno no tiene alumnos todavía.</p>}
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.participantes.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{p.nombre}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {p.aciertos !== null ? `${p.aciertos} aciertos · ${p.fallos} fallos · ${p.blancos} en blanco${p.via === 'hoja' ? ' · en papel' : ''}` : ESTADO[p.estado].texto}
                </p>
              </div>
              {p.nota !== null ? <span className={cx('text-lg font-bold tabular-nums', p.nota >= 5 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>{num(p.nota)}</span> : <Etiqueta tono={ESTADO[p.estado].tono}>{ESTADO[p.estado].texto}</Etiqueta>}
            </li>
          ))}
        </ul>
      </Hoja>
    </div>
  );
}
