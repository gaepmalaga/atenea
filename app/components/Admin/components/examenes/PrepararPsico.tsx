'use client';

import { useState } from 'react';
import { guardaPsicoExamen } from '@/actions';
import { EJERCICIOS_PSICO, TIPOS_PSICO, TIPO_PSICO_LABEL, type NumeroEjercicio, type TipoPsico } from '@/app/lib/psico';
import { MAX_TOTAL_CLASE, MAX_MINUTOS_CLASE, TOTALES_CLASE, minutosPorDefecto } from '@/app/lib/psico-clase';
import { Hoja, Aviso, Boton, Campo, Filtros, FiltroChip } from '../../../ui';

/**
 * PREPARAR UN PSICOTÉCNICO (regla 127): el mismo primer paso que el examen de
 * teoría. Se elige el examen del cuadernillo real (ejercicio 1, 2 o 3) o se
 * monta a mano filtrando por tipo, preguntas y minutos; se GUARDA, y luego se
 * pone a un turno desde «Guardados».
 */
export default function PrepararPsico({ onGuardado }: { onGuardado: () => void }) {
  const [ejercicio, setEjercicio] = useState<NumeroEjercicio | null>(null);
  const [tipos, setTipos] = useState<Set<TipoPsico>>(new Set(TIPOS_PSICO));
  const [total, setTotal] = useState('40');
  const [minutos, setMinutos] = useState('');
  const [titulo, setTitulo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alterna = (t: TipoPsico) => setTipos((prev) => { const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const totalNum = Number(total);
  const minutosAuto = Number.isInteger(totalNum) && totalNum > 0 ? minutosPorDefecto(totalNum) : null;

  async function guarda() {
    setEnviando(true); setError(null);
    const r = await guardaPsicoExamen({ titulo, ejercicio, tipos: [...tipos], total: totalNum, minutos: minutos === '' ? null : Number(minutos) });
    setEnviando(false);
    if (!r.success) { setError(r.error); return; }
    onGuardado();
  }

  return (
    <Hoja pad="md" className="space-y-5">
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

      <Campo label="Nombre propio (opcional)" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={80} placeholder="Si lo dejas vacío se llama por los tipos y el día" />
      <p className="text-xs text-slate-600 dark:text-slate-400">Al guardarlo se fija el examen: las mismas preguntas para todos. Después lo pones a un turno desde «Guardados» y puedes imprimirlo.</p>

      {error && <Aviso tono="malo">{error}</Aviso>}
      <Boton onClick={guarda} disabled={enviando || (!ejercicio && tipos.size === 0)}>{enviando ? 'Guardando…' : 'Guardar el examen'}</Boton>
    </Hoja>
  );
}
