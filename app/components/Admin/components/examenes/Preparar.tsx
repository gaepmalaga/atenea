'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, FileDown, ClipboardCheck, ListChecks, RefreshCw, Save } from 'lucide-react';
import { getExamenImprimible, getOfficialSyllabus, guardaExamen } from '@/actions';
import type { SyllabusBlock } from '@/app/actions/admin';
import type { DatosExamen } from '@/app/lib/examen-pdf';
import { Hoja, BloqueTitulo, Aviso, Boton, Campo, CampoSelect, Pulso, Etiqueta } from '../../../ui';
import { bajaPdf, type TipoPdf } from './descargas';

type Pregunta = { id: string; enunciado: string; opciones: string[]; correcta: number; tema: string; dificultad: number };
type Dificultad = 'easy' | 'medium' | 'hard';

/**
 * PREPARAR UN EXAMEN (regla 115 y 118): se eligen los temas —uno, varios, un
 * bloque entero o todo el temario—, la dificultad y el tamaño; sale un examen
 * del banco de la academia, se descarga y, si se quiere conservar, se guarda
 * para ponerlo a un turno.
 *
 * El examen vive en la memoria de esta pantalla hasta que se guarda: «Preparar
 * otro» saca uno distinto.
 */
export default function Preparar({ onGuardado }: { onGuardado: () => void }) {
  const [bloques, setBloques] = useState<SyllabusBlock[]>([]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [verTemas, setVerTemas] = useState(false);

  const [titulo, setTitulo] = useState('Global número 1');
  const [modelo, setModelo] = useState('A');
  const [cuantas, setCuantas] = useState(100);
  const [minutos, setMinutos] = useState(50);
  const [fecha, setFecha] = useState('');
  const [dificultad, setDificultad] = useState<Dificultad>('medium');
  const [evitar, setEvitar] = useState(true);

  const [preguntas, setPreguntas] = useState<Pregunta[] | null>(null);
  const [aviso, setAviso] = useState<{ corto: boolean; niveles: { facil: number; media: number; dificil: number }; repetidas: number } | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [descargando, setDescargando] = useState<TipoPdf | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getOfficialSyllabus().then((res) => { if (vivo && res.success && res.syllabus) setBloques(res.syllabus as SyllabusBlock[]); });
    return () => { vivo = false; };
  }, []);

  const idsDe = (b: SyllabusBlock) => b.subjects.map((s) => s.id);
  const bloqueEntero = (b: SyllabusBlock) => b.subjects.length > 0 && idsDe(b).every((id) => elegidos.has(id));
  function alternaBloque(b: SyllabusBlock) {
    setElegidos((prev) => {
      const n = new Set(prev);
      if (bloqueEntero(b)) idsDe(b).forEach((id) => n.delete(id)); else idsDe(b).forEach((id) => n.add(id));
      return n;
    });
  }
  function alternaTema(id: number) {
    setElegidos((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function cambiaCuantas(n: number) { setCuantas(n); setMinutos(Math.round(n / 2)); }

  async function preparar() {
    setPreparando(true);
    setError(null);
    setGuardado(false);
    const res = await getExamenImprimible({ preguntas: cuantas, temas: [...elegidos], dificultad, evitarRepetidas: evitar });
    setPreparando(false);
    if (!res.success) { setError(res.error); setPreguntas(null); return; }
    setPreguntas(res.preguntas);
    setAviso({ corto: res.corto, niveles: res.niveles, repetidas: res.repetidasEvitadas });
  }

  const datos: DatosExamen | null = useMemo(() => {
    if (!preguntas) return null;
    return {
      titulo: titulo.trim() || 'Simulacro',
      modelo: modelo.trim().slice(0, 1).toUpperCase() || 'A',
      minutos: Math.max(1, Math.min(199, Math.round(minutos) || 50)),
      fecha: fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
      preguntas: preguntas.map((q) => ({ enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta })),
    };
  }, [preguntas, titulo, modelo, minutos, fecha]);

  async function baja(que: TipoPdf) {
    if (!datos) return;
    setDescargando(que);
    setError(null);
    try { await bajaPdf(que, datos); } catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido crear el PDF.'); }
    setDescargando(null);
  }

  async function guarda() {
    if (!preguntas || !datos) return;
    setGuardando(true);
    setError(null);
    const res = await guardaExamen({
      titulo: datos.titulo, modelo: datos.modelo, minutos: datos.minutos, ids: preguntas.map((p) => p.id),
      filtros: { temas: [...elegidos], dificultad, evitarRepetidas: evitar },
    });
    setGuardando(false);
    if (!res.success) { setError(res.error); return; }
    setGuardado(true);
  }

  const porTema = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const q of preguntas ?? []) cuenta.set(q.tema, (cuenta.get(q.tema) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [preguntas]);

  const sinVariedad = aviso !== null && aviso.niveles.facil === 0 && aviso.niveles.dificil === 0;
  const resumenSeleccion = elegidos.size === 0
    ? 'Todo el temario'
    : `${elegidos.size} ${elegidos.size === 1 ? 'tema' : 'temas'}${bloques.filter(bloqueEntero).length ? ` (${bloques.filter(bloqueEntero).map((b) => b.name.toLowerCase()).join(', ')} enteros)` : ''}`;

  return (
    <div className="space-y-5">
      {error && <Aviso tono="malo">{error}</Aviso>}

      <Hoja pad="lg" className="space-y-5">
        <BloqueTitulo icon={<ClipboardCheck size={15} />}>1 · Qué examen</BloqueTitulo>

        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">Temas</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Temas del examen">
            <button type="button" onClick={() => setElegidos(new Set())} aria-pressed={elegidos.size === 0}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${elegidos.size === 0 ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-linea bg-white text-slate-800 dark:border-noche-linea dark:bg-noche dark:text-slate-200'}`}>
              Todo el temario
            </button>
            {bloques.map((b) => (
              <button key={b.id} type="button" onClick={() => alternaBloque(b)} aria-pressed={bloqueEntero(b)}
                className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${bloqueEntero(b) ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-linea bg-white text-slate-800 dark:border-noche-linea dark:bg-noche dark:text-slate-200'}`}>
                {b.name.charAt(0) + b.name.slice(1).toLowerCase()} <span className="opacity-70">· {b.subjects.length}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setVerTemas((v) => !v)} className="mt-2 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-indigo-900 underline underline-offset-4 dark:text-indigo-200">
            <ListChecks size={16} aria-hidden /> {resumenSeleccion} — {verTemas ? 'ocultar los temas' : 'elegir temas sueltos'}
          </button>
          {verTemas && (
            <div className="mt-1 max-h-80 space-y-3 overflow-y-auto rounded-lg border border-linea p-2 dark:border-noche-linea">
              {bloques.map((b) => (
                <div key={b.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md bg-hundido px-2 font-semibold dark:bg-noche-hondo">
                    <input type="checkbox" className="h-5 w-5 shrink-0" checked={bloqueEntero(b)} onChange={() => alternaBloque(b)} />
                    <span className="text-sm text-slate-900 dark:text-white">{b.name} <span className="font-normal text-slate-600 dark:text-slate-400">· marcar el bloque</span></span>
                  </label>
                  {b.subjects.map((t) => (
                    <label key={t.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 pl-5 hover:bg-black/5 dark:hover:bg-white/5">
                      <input type="checkbox" className="h-5 w-5 shrink-0" checked={elegidos.has(t.id)} onChange={() => alternaTema(t.id)} />
                      <span className="text-sm text-slate-900 dark:text-white"><b className="tabular-nums">{t.number}.</b> {t.title}</span>
                    </label>
                  ))}
                </div>
              ))}
              {bloques.length === 0 && <p className="px-2 py-3 text-sm text-slate-600 dark:text-slate-400">Cargando el temario…</p>}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CampoSelect label="Preguntas" value={cuantas} onChange={(e) => cambiaCuantas(Number(e.target.value))}>
            <option value={100}>100</option><option value={50}>50</option><option value={25}>25</option>
          </CampoSelect>
          <CampoSelect label="Dificultad" value={dificultad} onChange={(e) => setDificultad(e.target.value as Dificultad)}
            hint="Reparte fáciles, medias y difíciles. Si no hay de un nivel, rellena con las otras.">
            <option value="easy">Más fáciles</option><option value="medium">Equilibrada</option><option value="hard">Más difíciles</option>
          </CampoSelect>
          <Campo label="Minutos" type="number" inputMode="numeric" min={1} max={199} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} />
          <CampoSelect label="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {['A', 'B', 'C', 'D'].map((m) => <option key={m} value={m}>{m}</option>)}
          </CampoSelect>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre del examen" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={60} hint="Sale entre paréntesis en la portada." />
          <Campo label="Fecha (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} hint="Sale en la hoja de respuestas." />
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-5 w-5 shrink-0" checked={evitar} onChange={(e) => setEvitar(e.target.checked)} />
          <span className="text-sm text-slate-900 dark:text-white">No repetir preguntas de los exámenes que ya has guardado <span className="text-slate-600 dark:text-slate-400">(mientras queden bastantes)</span></span>
        </label>

        <Boton onClick={preparar} disabled={preparando} icon={<RefreshCw size={15} className={preparando ? 'animate-spin' : ''} />}>
          {preparando ? 'Preparando…' : preguntas ? 'Preparar otro examen distinto' : 'Preparar el examen'}
        </Boton>
      </Hoja>

      {datos && preguntas && aviso && (
        <Hoja pad="lg" className="space-y-5">
          <BloqueTitulo icon={<FileDown size={15} />}>2 · Guardar y descargar</BloqueTitulo>

          <Pulso cifras={[
            { valor: preguntas.length, etiqueta: 'preguntas' },
            { valor: porTema.length, etiqueta: porTema.length === 1 ? 'tema' : 'temas' },
            { valor: `${datos.minutos} min`, etiqueta: 'de examen' },
            { valor: datos.modelo, etiqueta: 'modelo' },
          ]} />

          {aviso.corto && <Aviso>El banco no tiene tantas preguntas de esos temas: el examen sale con {preguntas.length}.</Aviso>}
          {aviso.repetidas > 0 && evitar && <Aviso tono="info">Se han dejado fuera {aviso.repetidas} preguntas que ya salieron en exámenes guardados.</Aviso>}
          {sinVariedad && dificultad !== 'medium' && (
            <Aviso>
              El banco todavía no distingue dificultades: todas las preguntas están como «media», así que elegir «{dificultad === 'easy' ? 'más fáciles' : 'más difíciles'}» no cambia nada de momento.
            </Aviso>
          )}

          <div className="rounded-lg border border-linea p-4 dark:border-noche-linea">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Para ponerlo en clase y llevar las notas, guárdalo.</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Se guarda con sus preguntas tal como están: aunque luego se edite el banco, el examen que repartes no cambia.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Boton onClick={guarda} disabled={guardando || guardado} icon={guardado ? <Check size={15} /> : <Save size={15} />}>
                {guardado ? 'Guardado' : guardando ? 'Guardando…' : `Guardar «${datos.titulo}»`}
              </Boton>
              {guardado && <Boton variant="secondary" onClick={onGuardado}>Verlo en «Guardados» y ponerlo a un turno</Boton>}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Boton block onClick={() => baja('cuestionario')} disabled={!!descargando} icon={<FileDown size={15} />}>{descargando === 'cuestionario' ? 'Creando…' : 'Cuestionario'}</Boton>
            <Boton block variant="secondary" onClick={() => baja('hoja')} disabled={!!descargando} icon={<FileDown size={15} />}>{descargando === 'hoja' ? 'Creando…' : 'Hoja de respuestas'}</Boton>
            <Boton block variant="secondary" onClick={() => baja('plantilla')} disabled={!!descargando} icon={<ClipboardCheck size={15} />}>{descargando === 'plantilla' ? 'Creando…' : 'Plantilla de corrección'}</Boton>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Los tres salen de este mismo examen. Si no lo guardas y sales de esta pantalla, se pierde. Guardado, lo encuentras siempre en «Guardados».
          </p>

          <details className="rounded-lg border border-linea p-3 dark:border-noche-linea">
            <summary className="min-h-[44px] cursor-pointer text-sm font-semibold leading-[44px]">Cuántas preguntas hay de cada tema</summary>
            <ul className="mt-1 space-y-1 text-sm">
              {porTema.map(([tema, n]) => (
                <li key={tema} className="flex justify-between gap-3"><span className="min-w-0 truncate">{tema}</span><b className="tabular-nums">{n}</b></li>
              ))}
            </ul>
            <p className="mt-2"><Etiqueta tono="neutro">Dificultad de las candidatas</Etiqueta> <span className="text-xs text-slate-600 dark:text-slate-400">{aviso.niveles.facil} fáciles · {aviso.niveles.media} medias · {aviso.niveles.dificil} difíciles</span></p>
          </details>
        </Hoja>
      )}
    </div>
  );
}
