'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileText, ListChecks, Printer, RefreshCw, ClipboardCheck } from 'lucide-react';
import { getExamenImprimible, getOfficialSyllabus } from '@/actions';
import type { DatosExamen, ImagenesExamen, PreguntaImpresa } from '@/app/lib/examen-pdf';
import { PanelTitulo, Hoja, BloqueTitulo, Aviso, Boton, Campo, CampoSelect, Pulso } from '../../ui';

/**
 * EXÁMENES EN PAPEL (regla 115).
 *
 * La academia saca del banco un examen con la forma del de verdad y descarga
 * tres PDF del MISMO examen: el cuadernillo, la hoja de respuestas en blanco y
 * la plantilla de corrección. El examen vive en la memoria de esta pantalla:
 * «Preparar otro» saca uno distinto.
 *
 * El generador de PDF se carga solo al descargar (regla 113): pesa, y quien
 * entra a mirar «Alumnos» no tiene por qué bajárselo.
 */

type Tema = { id: number; number: number; title: string };

async function bytes(ruta: string): Promise<Uint8Array> {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`No se ha podido cargar ${ruta}.`);
  return new Uint8Array(await r.arrayBuffer());
}

function descarga(nombre: string, datos: Uint8Array) {
  const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const nombreFichero = (titulo: string, que: string) =>
  `${que}-${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'examen'}.pdf`;

export default function AdminExamenes() {
  const [temas, setTemas] = useState<Tema[]>([]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [verTemas, setVerTemas] = useState(false);

  const [titulo, setTitulo] = useState('Global número 1');
  const [modelo, setModelo] = useState('A');
  const [cuantas, setCuantas] = useState(100);
  const [minutos, setMinutos] = useState(50);
  const [fecha, setFecha] = useState('');

  const [preguntas, setPreguntas] = useState<(PreguntaImpresa & { tema: string })[] | null>(null);
  const [corto, setCorto] = useState(false);
  const [preparando, setPreparando] = useState(false);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    getOfficialSyllabus().then((res) => {
      if (vivo && res.success && res.syllabus) setTemas(res.syllabus.flatMap((b) => b.subjects) as Tema[]);
    });
    return () => { vivo = false; };
  }, []);

  // Los minutos que tocan por el número de preguntas: 100 en 50, como el examen.
  function cambiaCuantas(n: number) {
    setCuantas(n);
    setMinutos(Math.round(n / 2));
  }

  async function preparar() {
    setPreparando(true);
    setError(null);
    const res = await getExamenImprimible({ preguntas: cuantas, temas: [...elegidos] });
    setPreparando(false);
    if (!res.success) { setError(res.error); setPreguntas(null); return; }
    setPreguntas(res.preguntas);
    setCorto(res.corto);
  }

  const datos: DatosExamen | null = useMemo(() => {
    if (!preguntas) return null;
    return {
      titulo: titulo.trim() || 'Simulacro',
      modelo: modelo.trim().slice(0, 1).toUpperCase() || 'A',
      minutos: Math.max(1, Math.min(199, Math.round(minutos) || 50)),
      fecha: fecha ? new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
      preguntas,
    };
  }, [preguntas, titulo, modelo, minutos, fecha]);

  async function baja(que: 'cuestionario' | 'hoja' | 'plantilla') {
    if (!datos) return;
    setDescargando(que);
    setError(null);
    try {
      const [pdf, escudo, logotipo, isotipo] = await Promise.all([
        import('@/app/lib/examen-pdf'),
        bytes('/examen/escudo-policia.png'),
        bytes('/examen/alphapol-logotipo.png'),
        bytes('/examen/alphapol-isotipo.png'),
      ]);
      const img: ImagenesExamen = { escudo, logotipo, isotipo };
      if (que === 'cuestionario') descarga(nombreFichero(datos.titulo, 'cuestionario'), await pdf.pdfCuestionario(datos, img));
      if (que === 'hoja') descarga(nombreFichero(datos.titulo, 'hoja-de-respuestas'), await pdf.pdfHojaRespuestas(datos, img));
      if (que === 'plantilla') descarga(nombreFichero(datos.titulo, 'plantilla-de-correccion'), await pdf.pdfHojaRespuestas(datos, img, { resuelta: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido crear el PDF.');
    }
    setDescargando(null);
  }

  const porTema = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const q of preguntas ?? []) cuenta.set(q.tema, (cuenta.get(q.tema) ?? 0) + 1);
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [preguntas]);

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Exámenes en papel"
        sub="Un simulacro con la forma del examen de verdad: cuadernillo, hoja de respuestas y plantilla para corregir."
      />

      {error && <Aviso tono="malo">{error}</Aviso>}

      <Hoja pad="lg" className="space-y-5">
        <BloqueTitulo icon={<FileText size={15} />}>1 · Cómo es el examen</BloqueTitulo>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="sm:col-span-2">
            <Campo label="Nombre del examen" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={40} hint="Sale entre paréntesis en la portada." />
          </div>
          <CampoSelect label="Preguntas" value={cuantas} onChange={(e) => cambiaCuantas(Number(e.target.value))}>
            <option value={100}>100</option>
            <option value={50}>50</option>
            <option value={25}>25</option>
          </CampoSelect>
          <Campo label="Minutos" type="number" inputMode="numeric" min={1} max={199} value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} />
          <CampoSelect label="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}>
            {['A', 'B', 'C', 'D'].map((m) => <option key={m} value={m}>{m}</option>)}
          </CampoSelect>
          <div className="sm:col-span-2">
            <Campo label="Fecha (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} hint="Sale en la hoja de respuestas." />
          </div>
        </div>

        <div>
          <button type="button" onClick={() => setVerTemas((v) => !v)} className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-indigo-900 underline underline-offset-4 dark:text-indigo-200">
            <ListChecks size={16} aria-hidden />
            {elegidos.size === 0 ? 'Todo el temario (tocar para elegir temas)' : `${elegidos.size} ${elegidos.size === 1 ? 'tema elegido' : 'temas elegidos'}`}
          </button>
          {verTemas && (
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-linea p-2 dark:border-noche-linea">
              {elegidos.size > 0 && (
                <button type="button" onClick={() => setElegidos(new Set())} className="min-h-[44px] px-2 text-sm font-semibold text-slate-700 underline dark:text-slate-300">Quitar todos: vuelve a todo el temario</button>
              )}
              {temas.map((t) => (
                <label key={t.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-black/5 dark:hover:bg-white/5">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0"
                    checked={elegidos.has(t.id)}
                    onChange={() => setElegidos((prev) => { const n = new Set(prev); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })}
                  />
                  <span className="text-sm text-slate-900 dark:text-white"><b className="tabular-nums">{t.number}.</b> {t.title}</span>
                </label>
              ))}
              {temas.length === 0 && <p className="px-2 py-3 text-sm text-slate-600 dark:text-slate-400">Cargando el temario…</p>}
            </div>
          )}
        </div>

        <Boton onClick={preparar} disabled={preparando} icon={<RefreshCw size={15} className={preparando ? 'animate-spin' : ''} />}>
          {preparando ? 'Preparando…' : preguntas ? 'Preparar otro examen distinto' : 'Preparar el examen'}
        </Boton>
      </Hoja>

      {datos && preguntas && (
        <Hoja pad="lg" className="space-y-5">
          <BloqueTitulo icon={<Printer size={15} />}>2 · Descargar e imprimir</BloqueTitulo>

          <Pulso
            cifras={[
              { valor: preguntas.length, etiqueta: 'preguntas' },
              { valor: porTema.length, etiqueta: porTema.length === 1 ? 'tema' : 'temas' },
              { valor: `${datos.minutos} min`, etiqueta: 'de examen' },
              { valor: datos.modelo, etiqueta: 'modelo' },
            ]}
          />

          {corto && (
            <Aviso>El banco no tiene tantas preguntas de esos temas: el examen sale con {preguntas.length}.</Aviso>
          )}
          {preguntas.length > 100 && <Aviso>La hoja de respuestas tiene sitio para 100 preguntas.</Aviso>}

          <div className="grid gap-3 sm:grid-cols-3">
            <Boton block onClick={() => baja('cuestionario')} disabled={!!descargando} icon={<FileDown size={15} />}>
              {descargando === 'cuestionario' ? 'Creando…' : 'Cuestionario'}
            </Boton>
            <Boton block variant="secondary" onClick={() => baja('hoja')} disabled={!!descargando} icon={<FileDown size={15} />}>
              {descargando === 'hoja' ? 'Creando…' : 'Hoja de respuestas'}
            </Boton>
            <Boton block variant="secondary" onClick={() => baja('plantilla')} disabled={!!descargando} icon={<ClipboardCheck size={15} />}>
              {descargando === 'plantilla' ? 'Creando…' : 'Plantilla de corrección'}
            </Boton>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Los tres salen de este mismo examen. Si cambias el nombre, el modelo o los minutos, vuelve a descargarlos. Si sales de esta pantalla, el examen se pierde: descarga los tres antes.
          </p>

          <details className="rounded-lg border border-linea p-3 dark:border-noche-linea">
            <summary className="min-h-[44px] cursor-pointer text-sm font-semibold leading-[44px]">Cuántas preguntas hay de cada tema</summary>
            <ul className="mt-1 space-y-1 text-sm">
              {porTema.map(([tema, n]) => (
                <li key={tema} className="flex justify-between gap-3"><span className="min-w-0 truncate">{tema}</span><b className="tabular-nums">{n}</b></li>
              ))}
            </ul>
          </details>
        </Hoja>
      )}
    </div>
  );
}
