'use client';

import { useMemo, useState } from 'react';
import { UsersRound, Download, Loader2, AlertTriangle } from 'lucide-react';
import { altaMasivaAlumnos } from '@/actions';
import {
  leeCorreos, csvDeAltas, ESTADO_ALTA, MAX_POR_CLAVE, MAX_POR_CORREO, type ModoAlta, type ResultadoAlta,
} from '@/app/lib/alta-masiva';
import { Card, SectionLabel, Button, TEXT, cx } from '../../ui';

/**
 * DAR DE ALTA A VARIOS ALUMNOS DE GOLPE (regla 83).
 *
 * Se pega la lista (de Excel, de un correo, como venga), se ve al momento qué
 * se ha leído —y qué líneas no traían correo, que no desaparecen en silencio
 * (regla 27)—, se elige cómo y en qué grupos, y se da el alta. Las contraseñas
 * provisionales se enseñan UNA vez y se descargan en un CSV para repartirlas:
 * no se guardan en ningún sitio más.
 */
export default function AltaMasiva({ grupos, onHecho }: { grupos: { id: string; name: string }[]; onHecho: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<ModoAlta>('clave');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoAlta[] | null>(null);
  const [sinProcesar, setSinProcesar] = useState(0);

  const lista = useMemo(() => leeCorreos(texto), [texto]);
  const tope = modo === 'correo' ? MAX_POR_CORREO : MAX_POR_CLAVE;
  const vanAhora = Math.min(lista.correos.length, tope);

  async function darDeAlta() {
    setEnCurso(true);
    setError(null);
    const res = await altaMasivaAlumnos({ texto, modo, classIds: elegidos });
    setEnCurso(false);
    if (!res.success) { setError(res.error); return; }
    setResultados(res.resultados);
    setSinProcesar(res.sinProcesar);
    // Lo ya dado de alta sale de la lista: si quedaba algo por el tope, se
    // puede volver a pulsar sin repetir a nadie.
    const hechos = new Set(res.resultados.filter((r) => r.estado !== 'error').map((r) => r.correo));
    setTexto(lista.correos.filter((c) => !hechos.has(c)).join('\n'));
    onHecho();
  }

  function descargar() {
    if (!resultados) return;
    const url = URL.createObjectURL(new Blob([csvDeAltas(resultados, window.location.origin)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `altas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const creadas = resultados?.filter((r) => r.estado === 'creada').length ?? 0;

  return (
    <Card tone="base" pad="md" className="space-y-3">
      <button onClick={() => setAbierta((x) => !x)} className="w-full min-h-[44px] text-left">
        <SectionLabel icon={<UsersRound size={12} />}>Dar de alta a varios alumnos</SectionLabel>
        <p className={cx(TEXT.muted)}>Pega la lista de correos (de Excel, de un correo…) y entran todos con acceso, de una vez.</p>
      </button>

      {abierta && (
        <div className="space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            placeholder={'ana.ruiz@gmail.com\nluis.perez@hotmail.com\n…'}
            className="w-full text-base sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono"
          />
          {texto.trim() && (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              <strong>{lista.correos.length}</strong> {lista.correos.length === 1 ? 'correo' : 'correos'}
              {lista.repetidos > 0 && ` · ${lista.repetidos} repetidos (se cuentan una vez)`}
              {lista.sinCorreo.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {' '}· {lista.sinCorreo.length} {lista.sinCorreo.length === 1 ? 'línea' : 'líneas'} sin correo (línea {lista.sinCorreo.slice(0, 5).map((l) => l.linea).join(', ')}{lista.sinCorreo.length > 5 ? '…' : ''})
                </span>
              )}
            </p>
          )}

          <fieldset className="space-y-1.5">
            <legend className={cx(TEXT.muted, 'mb-1')}>Cómo entran los que aún no tienen cuenta:</legend>
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="radio" name="modo-alta" className="mt-0.5" checked={modo === 'clave'} onChange={() => setModo('clave')} />
              <span>
                <strong>Con una contraseña provisional</strong> que tú les das (descargas la lista). No se manda ningún correo, así que no hay límite.
                Cada alumno la cambia en «Mi perfil».
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="radio" name="modo-alta" className="mt-0.5" checked={modo === 'correo'} onChange={() => setModo('correo')} />
              <span>
                <strong>Con un correo de invitación</strong>. Como mucho {MAX_POR_CORREO} cada vez: el sistema de correo deja 30 por hora.
              </span>
            </label>
          </fieldset>

          {grupos.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className={cx(TEXT.muted, 'w-full')}>Y meterlos en estos grupos (opcional):</span>
              {grupos.map((g) => (
                <label key={g.id} className="flex items-center gap-1.5 text-xs cursor-pointer text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={elegidos.includes(g.id)} onChange={(e) => setElegidos(e.target.checked ? [...elegidos, g.id] : elegidos.filter((x) => x !== g.id))} />
                  {g.name}
                </label>
              ))}
            </div>
          )}

          {lista.correos.length > tope && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              Van los {tope} primeros; los demás se quedan en la lista para la siguiente vez.
            </p>
          )}

          <Button size="sm" disabled={enCurso || vanAhora === 0} onClick={darDeAlta} icon={enCurso ? <Loader2 size={14} className="animate-spin" /> : <UsersRound size={14} />}>
            {enCurso ? 'Dando de alta…' : `Dar de alta ${vanAhora} ${vanAhora === 1 ? 'alumno' : 'alumnos'}`}
          </Button>
          {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}

          {resultados && (
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p className="text-xs text-slate-700 dark:text-slate-200">
                {Object.entries(ESTADO_ALTA).map(([estado, etiqueta]) => {
                  const n = resultados.filter((r) => r.estado === estado).length;
                  return n ? <span key={estado} className="mr-3"><strong>{n}</strong> {etiqueta.toLowerCase()}</span> : null;
                })}
                {sinProcesar > 0 && <span className="text-amber-700 dark:text-amber-400">· quedan {sinProcesar} en la lista</span>}
              </p>
              {creadas > 0 && (
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  Descarga la lista ahora: las contraseñas provisionales no se vuelven a enseñar.
                </p>
              )}
              <Button size="sm" variant="secondary" onClick={descargar} icon={<Download size={14} />}>Descargar la lista (Excel)</Button>
              <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {resultados.map((r) => (
                  <li key={r.correo} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="truncate text-slate-700 dark:text-slate-200">{r.correo}</span>
                    <span className={cx('shrink-0 font-mono', r.estado === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400')}>
                      {r.clave ?? (r.error ? `${ESTADO_ALTA[r.estado]}: ${r.error}` : ESTADO_ALTA[r.estado])}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
