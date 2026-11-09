'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarCheck, Loader2, Check, ChevronDown } from 'lucide-react';
import { getMiMulti, setMiUnion, setMiUnionSemana } from '@/actions';
import type { DiaMulti, SemanaGrupoMulti } from '@/app/actions/cuadrante';
import { etiquetaRango } from '@/app/lib/cuadrante';
import { sumaDias } from '@/app/lib/asistencia';
import { Card, SectionLabel, TEXT, cx } from '../../../../ui';

/**
 * MULTIDISCIPLINAR: A QUÉ CLASES VOY ESTA SEMANA (regla 96).
 *
 * Los alumnos de Multi no tienen grupo: cada semana eligen con cuáles
 * entrenan. Antes se lo decían al preparador por mensaje («esta semana voy
 * con OMEGA»); ahora se apuntan aquí y el preparador ve quién va a cada clase
 * y cuántas plazas quedan. Un toque apunta a TODA la semana de un grupo; debajo
 * se puede ajustar sesión a sesión.
 *
 * Las clases a las que va salen en su calendario, con su profesor (regla 97):
 * aquí solo se ELIGE. Por eso la lista sesión a sesión va plegada, para no
 * repetir lo que el calendario ya enseña.
 *
 * No se pinta si el alumno no es multi: no le diría nada.
 */
export default function MultiSemana() {
  const [dias, setDias] = useState<DiaMulti[] | null>(null);
  const [semanas, setSemanas] = useState<SemanaGrupoMulti[]>([]);
  const [esMulti, setEsMulti] = useState(false);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [detalle, setDetalle] = useState(false);
  // Cada cambio sube la versión: una carga que salió antes y llega después
  // traería el estado viejo y lo pisaría (el mismo fallo de «Mis clases»).
  const versionRef = useRef(0);

  const cargar = useCallback(async () => {
    const version = versionRef.current;
    const res = await getMiMulti();
    if (version !== versionRef.current) return;
    if (res.success && res.esMulti) { setEsMulti(true); setDias(res.dias); setSemanas(res.semanas); }
    else setEsMulti(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function alternaSesion(classId: string, fecha: string, unir: boolean) {
    versionRef.current += 1;
    setEnVuelo(`${classId}|${fecha}`); setError(null); setAviso(null);
    const res = await setMiUnion({ classId, fecha, unir });
    if (!res.success) setError(res.error);
    await cargar();
    setEnVuelo(null);
  }

  async function alternaSemana(s: SemanaGrupoMulti) {
    const unir = s.unidas < s.total;
    versionRef.current += 1;
    setEnVuelo(`${s.classId}|${s.lunes}`); setError(null); setAviso(null);
    const res = await setMiUnionSemana({ classId: s.classId, lunes: s.lunes, unir });
    if (!res.success) setError(res.error);
    else if (unir && res.completas > 0) setAviso(`${res.completas === 1 ? 'Una sesión estaba completa y no' : `${res.completas} sesiones estaban completas y no`} te he apuntado.`);
    await cargar();
    setEnVuelo(null);
  }

  if (!esMulti || !dias) return null;
  const lunesDeSemanas = [...new Set(semanas.map((s) => s.lunes))];

  return (
    <Card className="max-w-3xl mx-auto w-full">
      <SectionLabel icon={<CalendarCheck size={14} />}>Con qué grupo entreno</SectionLabel>
      <p className={cx(TEXT.muted, 'mb-3')}>
        Eres multidisciplinar: elige con qué grupo vas cada semana y tu preparador lo sabrá. Las clases a las que vas salen en tu calendario. Puedes cambiarlo hasta que empiece la clase.
      </p>
      {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">{error}</p>}
      {aviso && <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{aviso}</p>}

      {semanas.length === 0 ? (
        <p className={TEXT.muted}>Esta semana ya no quedan clases a las que apuntarse.</p>
      ) : (
        <div className="space-y-3 mb-4">
          {lunesDeSemanas.map((lunes) => (
            <div key={lunes}>
              <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-1.5')}>Semana {etiquetaRango(lunes, sumaDias(lunes, 6))}</p>
              <div className="flex flex-wrap gap-2">
                {semanas.filter((s) => s.lunes === lunes).map((s) => {
                  const todas = s.unidas === s.total;
                  const clave = `${s.classId}|${s.lunes}`;
                  return (
                    <button key={clave} onClick={() => alternaSemana(s)} disabled={enVuelo === clave} aria-pressed={todas}
                      className={cx('min-h-[44px] px-4 rounded-xl text-sm font-black border-2 flex items-center gap-1.5 transition-colors',
                        todas ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : s.unidas > 0 ? 'border-amber-400 text-slate-700 dark:text-slate-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400')}>
                      {enVuelo === clave ? <Loader2 size={14} className="animate-spin" /> : todas ? <Check size={14} /> : null}
                      {s.grupo}
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{s.unidas}/{s.total}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {dias.length > 0 && (
        <button type="button" onClick={() => setDetalle((v) => !v)} aria-expanded={detalle}
          className="min-h-[44px] w-full flex items-center justify-between gap-2 text-xs font-black text-slate-700 dark:text-slate-200 border-t border-slate-100 dark:border-slate-800 pt-2">
          Elegir sesión a sesión
          <ChevronDown size={16} className={cx('transition-transform', detalle && 'rotate-180')} />
        </button>
      )}
      {detalle && <ul className="space-y-3 mt-2">
        {dias.map((d) => (
          <li key={d.fecha}>
            <p className="text-xs font-black text-slate-900 dark:text-white capitalize mb-1">{d.etiqueta}</p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.sesiones.map((s) => {
                const clave = `${s.classId}|${s.fecha}`;
                return (
                  <li key={clave} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-black">{s.grupo}</span>
                      {s.hora && <span className="font-mono text-slate-500 dark:text-slate-400"> · {s.hora}</span>}
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {s.titulo ?? 'Aún sin publicar'}{s.profesor ? ` (${s.profesor})` : ''}
                        {s.libres !== null && ` · ${s.libres > 0 ? `${s.libres} plazas libres` : 'completa'}`}
                      </span>
                    </span>
                    {s.editable ? (
                      <button onClick={() => alternaSesion(s.classId, s.fecha, !s.unido)} disabled={enVuelo === clave || (s.llena && !s.unido)} aria-pressed={s.unido}
                        className={cx('min-h-[44px] min-w-[7.5rem] px-3 rounded-xl text-xs font-black border-2 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50',
                          s.unido ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400')}>
                        {enVuelo === clave && <Loader2 size={12} className="animate-spin" />}
                        {s.unido ? 'Voy · quitar' : s.llena ? 'Completa' : 'Apuntarme'}
                      </button>
                    ) : (
                      <span className={cx('text-xs font-bold', s.unido ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400')}>
                        {s.unido ? 'Ibas' : 'En curso'}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>}
    </Card>
  );
}
