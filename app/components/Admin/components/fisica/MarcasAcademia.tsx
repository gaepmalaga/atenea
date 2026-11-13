'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { getMarcasAcademia, addMarca, deleteMarca, setSexoAlumno, addRM, deleteRM } from '@/actions';
import type { AlumnoConMarcas } from '@/app/actions/fisica';
import {
  INFO_PRUEBA, BAREMO_CNP, pruebasDe, puntosPrueba, notaFisica, formateaMarca, ultimaMarca,
  type Prueba,
} from '@/app/lib/baremo-fisico';
import { etiquetaDia } from '@/app/lib/sesiones';
import { quienEs } from '@/app/lib/planificar';
import { colorPuntos } from '@/app/components/fisica/estiloTipo';
import SeccionRM from '@/app/components/fisica/SeccionRM';
import { rmVigentes, formateaKg } from '@/app/lib/rm';
import { Boton, EmptyState, Modal, CampoSelect, Campo, TEXT, cx } from '../../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * LAS MARCAS DE LA ACADEMIA (regla 86).
 *
 * Una fila por alumno con su última marca en cada prueba oficial, sus puntos
 * según el baremo del BOE y la nota de la prueba física («si el examen fuera
 * hoy»). Se ordena por quién está peor: a quien hay que mirar primero.
 */

const numES = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

function resumen(a: AlumnoConMarcas) {
  if (!a.sexo) return { pruebas: pruebasDe(null), puntos: [] as (number | null)[], nota: notaFisica([]) };
  const pruebas = pruebasDe(a.sexo);
  const puntos = pruebas.map((p) => puntosPrueba(p, ultimaMarca(a.marcas, p)?.valor, a.sexo));
  return { pruebas, puntos, nota: notaFisica(puntos) };
}

export default function MarcasAcademia() {
  const [alumnos, setAlumnos] = useState<AlumnoConMarcas[] | null>(null);
  const [hoy, setHoy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await getMarcasAcademia();
    if (!r.success) { setError(r.error); return; }
    setError(null);
    setAlumnos(r.alumnos);
    setHoy(r.hoy);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>;
  if (!alumnos) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;
  if (!alumnos.length) return <EmptyState title="Aún no hay alumnos" hint="Dalos de alta en «Alumnos» y aquí podrás apuntar sus marcas." bordered />;

  // Primero los eliminados, luego por media de menos a más, y al final los que no tienen marcas.
  const orden = (a: AlumnoConMarcas) => {
    const { nota } = resumen(a);
    if (nota.eliminado) return -1;
    return nota.media ?? 99;
  };
  const lista = [...alumnos].sort((a, b) => orden(a) - orden(b) || quienEs(a).localeCompare(quienEs(b), 'es'));
  const actual = alumnos.find((a) => a.id === abierto) ?? null;

  return (
    <div className="space-y-3">
      <p className={TEXT.muted}>
        Puntos según el baremo de la convocatoria ({BAREMO_CNP.fuente}). La nota es la media de las tres pruebas; un 0 en cualquiera elimina («Eliminado») y hace falta un 5 para aprobar.
      </p>
      <div className="overflow-x-auto rounded-lg border border-linea dark:border-noche-linea bg-white dark:bg-noche-2">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              <th scope="col" className="px-3 py-2">Alumno</th>
              <th scope="col" className="px-2 py-2">Agilidad</th>
              <th scope="col" className="px-2 py-2">Fuerza</th>
              <th scope="col" className="px-2 py-2">1.000 m</th>
              <th scope="col" className="px-3 py-2 text-right">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lista.map((a) => {
              const { pruebas, puntos, nota } = resumen(a);
              const celda = (p: Prueba | undefined) => {
                if (!a.sexo || !p) return <span className="text-slate-400">—</span>;
                const u = ultimaMarca(a.marcas, p);
                const pts = puntos[pruebas.indexOf(p)] ?? null;
                if (!u) return <span className="text-slate-400">Sin marca</span>;
                return (
                  <span className={cx('inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold whitespace-nowrap', colorPuntos(pts))}>
                    {formateaMarca(p, u.valor)}{pts != null && ` · ${pts}`}
                  </span>
                );
              };
              const fuerza = pruebas.find((p) => p !== 'agilidad' && p !== 'carrera_1000');
              const rms = [...rmVigentes(a.rms).values()].slice(0, 3);
              return (
                <tr key={a.id} onClick={() => setAbierto(a.id)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 max-w-[14rem]">
                    <button type="button" onClick={() => setAbierto(a.id)} className="block w-full min-h-[44px] text-left">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{quienEs(a)}</span>
                      {!a.sexo
                        ? <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-300">Falta el sexo para puntuar</span>
                        : rms.length > 0 && <span className="block truncate text-[11px] text-slate-600 dark:text-slate-400">{rms.map((v) => `1RM ${v.ejercicio} ${formateaKg(v.rm)}`).join(' · ')}</span>}
                    </button>
                  </td>
                  <td className="px-2 py-2">{celda('agilidad')}</td>
                  <td className="px-2 py-2">{celda(fuerza)}</td>
                  <td className="px-2 py-2">{celda('carrera_1000')}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={cx('inline-block min-w-[3.5rem] rounded-lg px-2 py-1 text-center text-xs font-bold', nota.eliminado ? 'bg-red-600 text-white' : nota.media === null ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : nota.apto ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200')}>
                      {nota.eliminado ? 'Eliminado' : nota.media !== null ? numES(nota.media) : '—'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {actual && <FichaMarcas alumno={actual} hoy={hoy} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  );
}

function FichaMarcas({ alumno, hoy, onCerrar, onCambio }: { alumno: AlumnoConMarcas; hoy: string; onCerrar: () => void; onCambio: () => void }) {
  const pruebas = pruebasDe(alumno.sexo);
  const [prueba, setPrueba] = useState<Prueba>(pruebas[0]);
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await addMarca({ alumnoId: alumno.id, prueba, valor, fecha, nota });
    setGuardando(false);
    if (!r.success) { setError(r.error ?? 'No se ha podido guardar.'); return; }
    setValor('');
    setNota('');
    onCambio();
  }

  return (
    <Modal title={quienEs(alumno)}  subtitle="Marcas en las pruebas oficiales" onClose={onCerrar} width="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Sexo (decide la prueba de fuerza y el baremo):</span>
          {(['male', 'female'] as const).map((s) => (
            <button key={s} onClick={async () => { const r = await setSexoAlumno({ alumnoId: alumno.id, sexo: s }); if (r.success) onCambio(); }}
              aria-pressed={alumno.sexo === s}
              className={cx('min-h-[36px] px-3 rounded-lg text-xs font-bold border', alumno.sexo === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-linea dark:border-noche-linea text-slate-600 dark:text-slate-300')}>
              {s === 'male' ? 'Hombre' : 'Mujer'}
            </button>
          ))}
        </div>

        {pruebas.map((p) => {
          const de = alumno.marcas.filter((m) => m.prueba === p);
          return (
            <div key={p}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">{INFO_PRUEBA[p].nombre}</p>
              {de.length === 0 ? <p className={TEXT.muted}>Sin marcas.</p> : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {[...de].reverse().map((m) => {
                    const pts = puntosPrueba(p, m.valor, alumno.sexo);
                    return (
                      <li key={m.id} className="py-1 flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-slate-600 dark:text-slate-400">{etiquetaDia(m.fecha)}</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{formateaMarca(p, m.valor)}</span>
                        <span className={cx('px-1.5 py-0.5 rounded-md text-[10px] font-bold', colorPuntos(pts))}>{pts ?? '—'}</span>
                        <span className="flex-1 truncate text-slate-600 dark:text-slate-400">{m.nota}</span>
                        <button aria-label="Borrar la marca" onClick={async () => { if ((await confirmar('¿Borrar esta marca?'))) { const r = await deleteMarca({ id: m.id }); if (r.success) onCambio(); } }}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        <div className="border-t border-linea dark:border-noche-linea pt-3">
          <SeccionRM
            marcas={alumno.rms}
            hoy={hoy}
            quien="preparador"
            puedeBorrar={() => true}
            onApuntar={async (e) => { const r = await addRM({ alumnoId: alumno.id, ...e }); if (r.success) onCambio(); return r; }}
            onBorrar={async (id) => { const r = await deleteRM({ id }); if (r.success) onCambio(); return r; }}
          />
        </div>

        <div className="border-t border-linea dark:border-noche-linea pt-3 space-y-2">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Apuntar una marca de las pruebas</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <CampoSelect label="Prueba" value={prueba} onChange={(e) => setPrueba(e.target.value as Prueba)}>
              {pruebas.map((p) => <option key={p} value={p}>{INFO_PRUEBA[p].corto}</option>)}
            </CampoSelect>
            <Campo label={`Marca (${INFO_PRUEBA[prueba].unidad})`} value={valor} onChange={(e) => setValor(e.target.value)} placeholder={INFO_PRUEBA[prueba].ejemplo} />
            <Campo label="Fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
            <Campo label="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Simulacro" />
          </div>
          {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <Boton onClick={guardar} disabled={guardando || !valor.trim()}>
            {guardando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Guardar marca
          </Boton>
        </div>
      </div>
    </Modal>
  );
}
