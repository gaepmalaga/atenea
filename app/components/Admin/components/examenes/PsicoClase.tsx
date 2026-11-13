'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, FileDown, Loader2, Trash2 } from 'lucide-react';
import { borraPsicoClase, getDetallePsicoClase, getHojaPsicoExamen, getPsicoClases } from '@/actions';
import type { DetallePsicoClase, PsicoClaseResumen } from '@/app/actions/psico-clase';
import type { EstadoEntrega } from '@/app/lib/examen-clase';
import { TIPOS_PSICO, TIPO_PSICO_LABEL } from '@/app/lib/psico';
import { Hoja, BloqueTitulo, Aviso, Boton, EmptyState, Etiqueta, cx } from '../../../ui';
import { imprimeHojaPsico } from './hojaPsico';
import { confirmar } from '@/app/lib/dialogos';

const fechaCorta = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

const ESTADO: Record<EstadoEntrega, { texto: string; tono: 'ok' | 'aviso' | 'malo' | 'apagado' | 'neutro' }> = {
  entregado: { texto: 'Entregó', tono: 'ok' }, pendiente: { texto: 'Sin entregar', tono: 'aviso' },
  proximo: { texto: 'Aún no es el día', tono: 'apagado' }, ausente: { texto: 'No se presentó', tono: 'malo' }, cerrado: { texto: 'Plazo cerrado', tono: 'malo' },
};

/**
 * LOS PSICOTÉCNICOS EN CLASE (regla 127): el tercer paso, como en teoría. El
 * examen guardado, puesto a un turno, se hace en la pantalla (con el reloj del
 * servidor) o en papel (se imprime y el alumno pasa luego la hoja). Aquí se ve
 * quién lo ha hecho, su nota y dónde falla la clase.
 */
export default function PsicoClase({ abrirId, onAbierto }: { abrirId: string | null; onAbierto: () => void }) {
  const [examenes, setExamenes] = useState<PsicoClaseResumen[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(abrirId);

  const cargar = useCallback(async () => {
    const r = await getPsicoClases();
    if (!r.success) { setError(r.error); setExamenes([]); return; }
    setError(null); setExamenes(r.examenes);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (abrirId) { setAbierto(abrirId); onAbierto(); } }, [abrirId, onAbierto]);

  if (abierto) return <Detalle id={abierto} onVolver={() => { setAbierto(null); cargar(); }} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        Los psicotécnicos que has puesto a un turno: quién lo ha hecho, su nota y dónde falla la clase.
      </p>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {examenes === null && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
      {examenes?.length === 0 && !error && <EmptyState title="Todavía no has puesto ningún psicotécnico a un turno" hint="Prepáralo, guárdalo y ponlo a un turno desde «Guardados»." bordered />}
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
              {(e.tipos.length === TIPOS_PSICO.length ? ['Todos los tipos'] : e.tipos.length > 6 ? [`${e.tipos.length} tipos de pregunta`] : e.tipos.map((t) => TIPO_PSICO_LABEL[t])).map((t) => <Etiqueta key={t} tono="neutro">{t}</Etiqueta>)}
            </div>
            <Boton size="sm" variant="secondary" onClick={() => setAbierto(e.id)}>Abrir</Boton>
          </Hoja>
        ))}
      </div>
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
    const r = await getHojaPsicoExamen(d!.examen.examenId);
    if (!r.success) { setImprimiendo(false); setAviso(r.error); return; }
    const ok = await imprimeHojaPsico({ titulo: d!.examen.titulo, fecha: d!.examen.fecha, minutos: r.minutos, preguntas: r.preguntas });
    setImprimiendo(false);
    if (!ok) setAviso('El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes para esta página y vuelve a probar.');
  }
  async function borra() {
    if (!(await confirmar('¿Borrar este turno y las notas que ya tenga? El examen sigue guardado. No se puede deshacer.'))) return;
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
        <div className="flex flex-wrap gap-1">{(e.tipos.length === TIPOS_PSICO.length ? ['Todos los tipos'] : e.tipos.length > 6 ? [`${e.tipos.length} tipos de pregunta`] : e.tipos.map((t) => TIPO_PSICO_LABEL[t])).map((t) => <Etiqueta key={t} tono="neutro">{t}</Etiqueta>)}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.entregados}<span className="text-base text-slate-600 dark:text-slate-400"> / {d.resumen.participantes}</span></p><p className="text-xs text-slate-600 dark:text-slate-400">entregados</p></div>
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.notaMedia !== null ? num(d.resumen.notaMedia) : '—'}</p><p className="text-xs text-slate-600 dark:text-slate-400">nota media</p></div>
          <div><p className="font-titulo text-2xl font-bold tabular-nums">{d.resumen.participantes - d.resumen.entregados}</p><p className="text-xs text-slate-600 dark:text-slate-400">sin entregar</p></div>
        </div>
        {aviso && <Aviso tono="aviso">{aviso}</Aviso>}
        <div className="flex flex-wrap gap-2">
          <Boton size="sm" icon={<FileDown size={14} />} onClick={imprime} disabled={imprimiendo}>{imprimiendo ? 'Preparando…' : 'Imprimir la hoja'}</Boton>
          <Boton size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={borra} disabled={borrando}>Borrar este turno</Boton>
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
