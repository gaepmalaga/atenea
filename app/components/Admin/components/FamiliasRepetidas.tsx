'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { getFamiliasRepetidas, quedarseConUna } from '@/actions';
import type { MiembroDeFamilia } from '@/app/lib/familias';
import { DIFFICULTY_LABEL, type DifficultyLevel } from '@/app/lib/questions';
import { PanelTitulo, Aviso, Boton, Hoja, Atras, Dato, Etiqueta, EmptyState, TEXT } from '../../ui';

type Familia = { id: string; miembros: MiembroDeFamilia[] };
type Pagina = { familias: Familia[]; totalFamilias: number; sobran: number; pagina: number; paginas: number };

const LETRAS = ['A', 'B', 'C'];

/**
 * PREGUNTAS REPETIDAS (regla 119): cada familia es un mismo hecho preguntado
 * con otras palabras. El superadmin elige con cuál quedarse y el resto se
 * descarta (no se borra). Las familias ya resueltas no vuelven a salir.
 */
export default function FamiliasRepetidas({ onVolver }: { onVolver: () => void }) {
  const [datos, setDatos] = useState<Pagina | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const carga = useCallback(async (page: number) => {
    setCargando(true);
    const res = await getFamiliasRepetidas({ page });
    if (res.success) { setDatos(res); setError(null); }
    else setError(res.error ?? 'No se pudieron cargar las repetidas.');
    setCargando(false);
  }, []);

  useEffect(() => { carga(1); }, [carga]);

  async function quedarme(f: Familia, keep: MiembroDeFamilia) {
    const otras = f.miembros.length - 1;
    if (!confirm(`Te quedas con esta pregunta y se descartan las otras ${otras}.\nDejan de servirse a los alumnos. No se borran, pero este panel no las recupera.`)) return;
    setTrabajando(f.id);
    const res = await quedarseConUna({ familyId: f.id, keepId: keep.id });
    setTrabajando(null);
    if (!res.success) { setError(res.error ?? 'No se pudo descartar.'); return; }
    setError(null);
    await carga(datos?.pagina ?? 1);
  }

  return (
    <div className="space-y-5 pb-24 animate-in fade-in">
      <Atras onClick={onVolver}>Volver al banco</Atras>
      <PanelTitulo
        titulo="Preguntas repetidas"
        sub={datos ? `${datos.totalFamilias} ${datos.totalFamilias === 1 ? 'familia' : 'familias'} · ${datos.sobran} ${datos.sobran === 1 ? 'pregunta de más' : 'preguntas de más'}` : 'Cargando…'}
      />
      <Aviso tono="info">
        <p>Cada bloque es un mismo hecho preguntado con otras palabras. Elige cuál conservar. Los exámenes ya evitan meter dos de la misma familia; descartar las que sobran además limpia el banco.</p>
      </Aviso>
      {error && <Aviso tono="malo"><p>{error}</p></Aviso>}

      {cargando && !datos ? (
        <div className="flex justify-center py-24 text-slate-600 dark:text-slate-400"><Loader2 className="animate-spin" size={26} /></div>
      ) : datos && datos.familias.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={36} />} title="No quedan preguntas repetidas." hint="Cuando entren preguntas nuevas, vuelve a agrupar con «npm run familias»." bordered />
      ) : (
        <div className={cargando ? 'space-y-4 opacity-60' : 'space-y-4'}>
          {datos?.familias.map((f) => (
            <Hoja key={f.id} pad="md" className="space-y-3">
              <p className={TEXT.muted}>{f.miembros.length} preguntas del mismo hecho</p>
              <ul className="space-y-3">
                {f.miembros.map((m) => {
                  const opciones = Array.isArray(m.options) ? (m.options as unknown[]).map(String) : [];
                  const nivel = m.difficulty_level;
                  return (
                    <li key={m.id} className="rounded-lg border border-linea p-3 dark:border-noche-linea">
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <Dato>Tema {m.tema ?? '—'}</Dato>
                        {m.difficulty_source && (nivel === 1 || nivel === 2 || nivel === 3) && (
                          <Etiqueta tono={nivel === 1 ? 'ok' : nivel === 3 ? 'malo' : 'aviso'}>{DIFFICULTY_LABEL[nivel as DifficultyLevel]}</Etiqueta>
                        )}
                        {m.legal_reference && <Dato>{m.legal_reference}</Dato>}
                      </div>
                      <p className="mb-2 text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">{m.question_text}</p>
                      <ol className="mb-3 space-y-1 text-[13px] text-slate-700 dark:text-slate-300">
                        {opciones.map((o, i) => (
                          <li key={i} className={i === m.correct_index ? 'font-semibold text-emerald-800 dark:text-emerald-300' : ''}>
                            {LETRAS[i] ?? i + 1}) {o}{i === m.correct_index ? ' ✓' : ''}
                          </li>
                        ))}
                      </ol>
                      <Boton size="sm" variant="secondary" disabled={trabajando === f.id} onClick={() => quedarme(f, m)}
                        icon={trabajando === f.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}>
                        Quedarme con esta
                      </Boton>
                    </li>
                  );
                })}
              </ul>
            </Hoja>
          ))}
        </div>
      )}

      {datos && datos.paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Boton variant="secondary" size="sm" icon={<ChevronLeft size={16} />} disabled={datos.pagina === 1 || cargando}
            onClick={() => { carga(datos.pagina - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Anterior</Boton>
          <span className="font-mono text-sm tabular-nums text-slate-700 dark:text-slate-300">{datos.pagina} / {datos.paginas}</span>
          <Boton variant="secondary" size="sm" iconRight={<ChevronRight size={16} />} disabled={datos.pagina === datos.paginas || cargando}
            onClick={() => { carga(datos.pagina + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Siguiente</Boton>
        </div>
      )}
    </div>
  );
}
