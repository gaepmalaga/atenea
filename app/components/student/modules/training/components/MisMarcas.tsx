'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trophy, Trash2, Loader2, Plus } from 'lucide-react';
import { getMisMarcas, addMiMarca, deleteMiMarca, setMiSexo, addMiRM, deleteMiRM } from '@/actions';
import {
  INFO_PRUEBA, BAREMO_CNP, pruebasDe, puntosPrueba, notaFisica, formateaMarca, ultimaMarca, mejorMarca,
  type Prueba, type Sexo,
} from '@/app/lib/baremo-fisico';
import type { MarcaGuardada, MarcaRMGuardada } from '@/app/actions/fisica';
import SeccionRM from '@/app/components/fisica/SeccionRM';
import { etiquetaDia } from '@/app/lib/sesiones';
import { colorPuntos } from '@/app/components/fisica/estiloTipo';
import { Card, Button, TextField, SectionLabel, TEXT, cx } from '../../../../ui';

/**
 * MIS MARCAS EN LAS PRUEBAS OFICIALES (regla 86).
 *
 * Cada prueba con su última marca, sus puntos según el baremo del BOE y el
 * histórico; arriba, «si el examen fuera hoy»: la media de las tres y si
 * aprueba. Las marcas las apunta el alumno o su preparador; el alumno solo
 * borra las suyas.
 */

const numES = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

export default function MisMarcas() {
  const [datos, setDatos] = useState<{ sexo: Sexo | null; marcas: MarcaGuardada[]; rms: MarcaRMGuardada[]; hoy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const res = await getMisMarcas();
    if (!res.success) { setError(res.error); return; }
    setError(null);
    setDatos({ sexo: res.sexo, marcas: res.marcas, rms: res.rms, hoy: res.hoy });
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>;
  if (!datos) return <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>;

  const pruebas = pruebasDe(datos.sexo);
  const puntosUltimas = datos.sexo
    ? pruebas.map((p) => puntosPrueba(p, ultimaMarca(datos.marcas, p)?.valor, datos.sexo))
    : [];
  const nota = notaFisica(puntosUltimas);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-4 animate-in fade-in duration-150">
      {!datos.sexo ? (
        <Card>
          <p className="text-sm font-black text-slate-900 dark:text-white mb-1">¿Eres hombre o mujer?</p>
          <p className={cx(TEXT.muted, 'mb-3')}>Cambia la prueba de fuerza (dominadas o suspensión) y el baremo con el que se puntúan tus marcas.</p>
          <div className="grid grid-cols-2 gap-2">
            {(['male', 'female'] as const).map((s) => (
              <Button key={s} variant="secondary" onClick={async () => { const r = await setMiSexo({ sexo: s }); if (r.success) cargar(); }}>
                {s === 'male' ? 'Hombre' : 'Mujer'}
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <Card tone="brand">
          <p className={cx(TEXT.label, 'text-indigo-100 mb-1')}>Si el examen fuera hoy</p>
          {nota.media === null && !nota.eliminado ? (
            <p className="text-sm text-indigo-50">Apunta una marca de cada prueba y te decimos la nota con el baremo oficial.</p>
          ) : (
            <>
              <p className="text-3xl font-black tabular-nums">
                {nota.media !== null ? numES(nota.media) : '—'}
                <span className="text-base font-bold text-indigo-100"> / 10</span>
              </p>
              <p className="text-sm font-bold mt-1">
                {nota.eliminado ? 'Un 0 en una prueba elimina: hay que subirla.' : nota.apto ? 'Aprobarías la prueba física.' : 'Aún no llegas al 5 de media.'}
              </p>
            </>
          )}
          <p className="text-[11px] text-indigo-100 mt-2">Baremo de la convocatoria ({BAREMO_CNP.fuente}). Media de las tres; un 0 en cualquiera elimina.</p>
        </Card>
      )}

      {pruebas.map((p) => (
        <TarjetaPrueba
          key={p}
          prueba={p}
          sexo={datos.sexo}
          marcas={datos.marcas.filter((m) => m.prueba === p)}
          hoy={datos.hoy}
          onCambio={cargar}
        />
      ))}

      <Card>
        <SeccionRM
          marcas={datos.rms}
          hoy={datos.hoy}
          quien="alumno"
          puedeBorrar={(m) => datos.rms.find((x) => x.id === m.id)?.porMi ?? false}
          onApuntar={async (e) => { const r = await addMiRM(e); if (r.success) cargar(); return r; }}
          onBorrar={async (id) => { const r = await deleteMiRM({ id }); if (r.success) cargar(); return r; }}
        />
      </Card>
    </div>
  );
}

function TarjetaPrueba({ prueba, sexo, marcas, hoy, onCambio }: {
  prueba: Prueba;
  sexo: Sexo | null;
  marcas: MarcaGuardada[];
  hoy: string;
  onCambio: () => void;
}) {
  const info = INFO_PRUEBA[prueba];
  const ultima = ultimaMarca(marcas, prueba);
  const mejor = mejorMarca(marcas, prueba);
  const pts = puntosPrueba(prueba, ultima?.valor, sexo);
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);
    const r = await addMiMarca({ prueba, valor, fecha });
    setGuardando(false);
    if (!r.success) { setError(r.error ?? 'No se ha podido guardar.'); return; }
    setValor('');
    setAbierto(false);
    onCambio();
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel icon={<Trophy size={14} />}>{info.nombre}</SectionLabel>
          <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{ultima ? formateaMarca(prueba, ultima.valor) : '—'}</p>
          <p className={TEXT.muted}>
            {ultima ? `Última, ${etiquetaDia(ultima.fecha)}` : 'Aún sin marcas'}
            {mejor && ultima && mejor.id !== ultima.id && ` · mejor: ${formateaMarca(prueba, mejor.valor)}`}
          </p>
        </div>
        <span className={cx('shrink-0 min-w-[56px] text-center px-2 py-1.5 rounded-xl text-sm font-black', colorPuntos(pts))}>
          {pts === null ? '—' : pts}<span className="block text-[9px] font-bold opacity-80">puntos</span>
        </span>
      </div>

      {marcas.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
          {[...marcas].reverse().map((m) => (
            <li key={m.id} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-slate-500 dark:text-slate-400">{etiquetaDia(m.fecha)}</span>
              <span className="flex-1 font-mono font-bold text-slate-800 dark:text-slate-100">{formateaMarca(prueba, m.valor)}</span>
              <span className={cx('px-1.5 py-0.5 rounded-md text-[10px] font-black', colorPuntos(puntosPrueba(prueba, m.valor, sexo)))}>
                {puntosPrueba(prueba, m.valor, sexo) ?? '—'}
              </span>
              {m.porMi ? (
                <button aria-label="Borrar la marca" onClick={async () => { const r = await deleteMiMarca({ id: m.id }); if (r.success) onCambio(); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={14} />
                </button>
              ) : (
                <span className="w-9 text-center text-[9px] font-bold text-slate-400" title="La apuntó tu preparador">prep.</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierto ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <TextField label={`Marca (${info.unidad})`} value={valor} onChange={(e) => setValor(e.target.value)} placeholder={info.ejemplo}
              inputMode={prueba === 'carrera_1000' ? 'text' : 'decimal'} />
            <TextField label="Fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
          </div>
          {error && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={guardar} disabled={guardando || !valor.trim()}>
              {guardando && <Loader2 size={16} className="animate-spin" />} Guardar marca
            </Button>
            <Button variant="ghost" onClick={() => { setAbierto(false); setError(null); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setAbierto(true)}>
          <Plus size={14} /> Apuntar marca
        </Button>
      )}
    </Card>
  );
}
