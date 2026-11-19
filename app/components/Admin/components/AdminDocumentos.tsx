'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  Loader2, FolderPlus, Upload, Download, Pencil, Trash2, Folder, FolderOpen, Search, FileText, FileSpreadsheet,
  Presentation, Image as ImagenIcono, File as ArchivoIcono, Check, X,
} from 'lucide-react';
import {
  getDocumentos, crearCarpetaDocs, renombrarCarpetaDocs, borrarCarpetaDocs, subirDocumento, renombrarDocumento,
  borrarDocumento, urlDocumento,
} from '@/actions';
import type { CarpetaDoc, DocumentoAdmin } from '@/app/actions/documentos';
import { ACEPTA_INPUT, LISTA_FORMATOS, MAX_BYTES_DOCUMENTO, etiquetaTamano, validaPrevia } from '@/app/lib/documentos';
import { MARCA } from '@/app/lib/marca';
import { Hoja, Boton, Modal, Campo, EmptyState, TEXT, cx, PanelTitulo, Aviso } from '../../ui';
import { confirmar } from '@/app/lib/dialogos';

/**
 * DOCUMENTOS (regla 134): la carpeta compartida de los admin. Carpetas con
 * nombre, archivos con quién los subió y cuándo. Cualquier admin sube, renombra
 * y borra. Las imágenes salen en miniatura; todo lo demás, con su icono.
 */

const cuando = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: MARCA.zonaHoraria });

function IconoDe({ ext }: { ext: string }) {
  const p = { size: 28, strokeWidth: 1.7 };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <FileSpreadsheet {...p} />;
  if (['ppt', 'pptx'].includes(ext)) return <Presentation {...p} />;
  if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) return <ImagenIcono {...p} />;
  if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return <FileText {...p} />;
  return <ArchivoIcono {...p} />;
}

type Subida = { clave: string; nombre: string; estado: 'espera' | 'subiendo' | 'ok' | 'error'; error?: string };
type Dialogo = { tipo: 'nueva' } | { tipo: 'renombrarCarpeta'; carpeta: CarpetaDoc } | { tipo: 'renombrarDoc'; doc: DocumentoAdmin };

export default function AdminDocumentos() {
  const [carpetas, setCarpetas] = useState<CarpetaDoc[] | null>(null);
  const [docs, setDocs] = useState<DocumentoAdmin[]>([]);
  const [carpetaId, setCarpetaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [subidas, setSubidas] = useState<Subida[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await getDocumentos();
    if (!r.success) { setError(r.error); setCarpetas((c) => c ?? []); return; }
    setError(null);
    setCarpetas(r.carpetas);
    setDocs(r.documentos);
    setCarpetaId((actual) => (actual && r.carpetas.some((c) => c.id === actual) ? actual : r.carpetas[0]?.id ?? null));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const carpeta = carpetas?.find((c) => c.id === carpetaId) ?? null;
  const q = busca.trim().toLowerCase();
  const visibles = useMemo(
    () => docs.filter((d) => (q ? d.nombre.toLowerCase().includes(q) : d.carpetaId === carpetaId)),
    [docs, q, carpetaId],
  );
  const nombreCarpeta = (id: string) => carpetas?.find((c) => c.id === id)?.nombre ?? '';

  async function suben(archivos: File[]) {
    if (!carpeta || !archivos.length) return;
    setError(null); setAviso(null);
    const lista: Subida[] = archivos.map((f, i) => ({ clave: `${Date.now()}-${i}`, nombre: f.name, estado: 'espera' }));
    setSubidas(lista);
    let buenos = 0;
    for (let i = 0; i < archivos.length; i++) {
      const f = archivos[i];
      const poner = (cambio: Partial<Subida>) => setSubidas((s) => s.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
      // Se avisa antes de mandar nada si no vale (formato o tamaño).
      const previo = validaPrevia({ nombre: f.name, tamano: f.size });
      if (!previo.ok) { poner({ estado: 'error', error: previo.error }); continue; }
      poner({ estado: 'subiendo' });
      const datos = new FormData();
      datos.append('carpetaId', carpeta.id);
      datos.append('archivo', f);
      const r = await subirDocumento(datos);
      if (r.success) { buenos++; poner({ estado: 'ok' }); } else poner({ estado: 'error', error: r.error });
    }
    await cargar();
    if (buenos) setAviso(buenos === 1 ? 'Documento subido.' : `${buenos} documentos subidos.`);
    if (entrada.current) entrada.current.value = '';
  }

  const alSoltar = (e: DragEvent) => { e.preventDefault(); setArrastrando(false); suben([...e.dataTransfer.files]); };

  async function descarga(d: DocumentoAdmin) {
    setError(null);
    const r = await urlDocumento({ id: d.id });
    if (!r.success) { setError(r.error); return; }
    window.location.href = r.url;
  }

  async function borra(d: DocumentoAdmin) {
    if (!(await confirmar(`¿Borrar «${d.nombre}»? No se puede deshacer.`))) return;
    setError(null); setAviso(null);
    const r = await borrarDocumento({ id: d.id });
    if (!r.success) { setError(r.error); return; }
    setAviso('Documento borrado.');
    await cargar();
  }

  async function borraCarpeta(c: CarpetaDoc) {
    if (!(await confirmar(`¿Borrar la carpeta «${c.nombre}»?`))) return;
    setError(null); setAviso(null);
    const r = await borrarCarpetaDocs({ id: c.id });
    if (!r.success) { setError(r.error); return; }
    setAviso('Carpeta borrada.');
    await cargar();
  }

  async function guardaDialogo() {
    if (!dialogo) return;
    setOcupado(true); setError(null);
    const r = dialogo.tipo === 'nueva' ? await crearCarpetaDocs({ nombre: texto })
      : dialogo.tipo === 'renombrarCarpeta' ? await renombrarCarpetaDocs({ id: dialogo.carpeta.id, nombre: texto })
      : await renombrarDocumento({ id: dialogo.doc.id, nombre: texto });
    setOcupado(false);
    if (!r.success) { setError(r.error); return; }
    if (dialogo.tipo === 'nueva' && 'id' in r) setCarpetaId(r.id as string);
    setDialogo(null);
    await cargar();
  }
  const abre = (d: Dialogo, inicial: string) => { setTexto(inicial); setError(null); setDialogo(d); };

  return (
    <div className="space-y-5 animate-in fade-in pb-24">
      <PanelTitulo
        titulo="Documentos"
        sub="La carpeta compartida de los admin: logos, contratos, horarios, material… Cualquier admin puede subir y borrar."
        acciones={<Boton icon={<FolderPlus size={15} />} onClick={() => abre({ tipo: 'nueva' }, '')}>Nueva carpeta</Boton>}
      />

      {error && !dialogo && <Aviso tono="malo">{error}</Aviso>}
      {aviso && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><Check size={14} /> {aviso}</p>}

      {carpetas === null ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-500" /></div>
      ) : carpetas.length === 0 ? (
        <EmptyState icon={<Folder size={40} />} title="Todavía no hay carpetas" hint="Crea la primera con «Nueva carpeta» y sube ahí los documentos." bordered />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          {/* Carpetas: lista en escritorio, fila deslizable en el móvil */}
          <Hoja pad="sm" className="space-y-1 lg:sticky lg:top-4">
            <Campo value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un documento…" aria-label="Buscar un documento"
              trailing={<Search size={15} className="mr-2 text-slate-500" aria-hidden />} />
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {carpetas.map((c) => (
                <button key={c.id} type="button" onClick={() => { setCarpetaId(c.id); setBusca(''); }}
                  className={cx('flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold',
                    c.id === carpetaId && !q ? 'bg-indigo-900 text-white dark:bg-indigo-300 dark:text-marino-hondo' : 'text-slate-800 hover:bg-hundido dark:text-slate-200 dark:hover:bg-noche-hondo')}>
                  {c.id === carpetaId && !q ? <FolderOpen size={17} /> : <Folder size={17} />}
                  <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
                  <span className="text-xs font-bold tabular-nums opacity-70">{c.documentos}</span>
                </button>
              ))}
            </div>
          </Hoja>

          <div className="min-w-0 space-y-3">
            {q ? (
              <p className={TEXT.muted}>{visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'} para «{busca}» en todas las carpetas.</p>
            ) : carpeta && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-titulo text-xl font-bold uppercase leading-tight tracking-wide text-slate-900 dark:text-white">{carpeta.nombre}</h3>
                <div className="flex gap-1">
                  <Boton size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => abre({ tipo: 'renombrarCarpeta', carpeta }, carpeta.nombre)}>Renombrar</Boton>
                  <Boton size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => borraCarpeta(carpeta)}>Borrar</Boton>
                </div>
              </div>
            )}

            {!q && carpeta && (
              <div onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }} onDragLeave={() => setArrastrando(false)} onDrop={alSoltar}
                className={cx('rounded-xl border-2 border-dashed p-4 text-center', arrastrando ? 'border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-300 dark:border-slate-700')}>
                <input ref={entrada} type="file" multiple accept={ACEPTA_INPUT} className="hidden" aria-label="Elegir archivos"
                  onChange={(e) => suben([...(e.target.files ?? [])])} />
                <Boton icon={<Upload size={15} />} onClick={() => entrada.current?.click()}>Subir archivos</Boton>
                <p className={cx(TEXT.muted, 'mt-2')}>o arrástralos aquí. Hasta {etiquetaTamano(MAX_BYTES_DOCUMENTO)} cada uno · {LISTA_FORMATOS}.</p>
              </div>
            )}

            {subidas.length > 0 && (
              <Hoja tone="sunken" pad="sm" className="space-y-1">
                {subidas.map((s) => (
                  <div key={s.clave} className="flex items-center gap-2 text-sm">
                    {s.estado === 'subiendo' || s.estado === 'espera' ? <Loader2 size={14} className={cx('shrink-0', s.estado === 'subiendo' && 'animate-spin')} />
                      : s.estado === 'ok' ? <Check size={14} className="shrink-0 text-emerald-600" /> : <X size={14} className="shrink-0 text-red-600" />}
                    <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                    {s.error && <span className="text-xs font-medium text-red-700 dark:text-red-300">{s.error}</span>}
                  </div>
                ))}
              </Hoja>
            )}

            {visibles.length === 0 ? (
              <EmptyState icon={<Folder size={36} />} title={q ? 'No hay nada con ese nombre' : 'Carpeta vacía'}
                hint={q ? 'Prueba con otra palabra.' : 'Sube el primer documento con el botón de arriba.'} bordered />
            ) : (
              <div className="grid gap-3 sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
                {visibles.map((d) => (
                  <Hoja key={d.id} pad="sm" className="flex min-w-0 flex-col gap-2">
                    <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-hundido text-slate-500 dark:bg-noche-hondo dark:text-slate-400">
                      {d.miniatura
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={d.miniatura} alt={d.nombre} className="max-h-full max-w-full object-contain p-2" loading="lazy" />
                        : <div className="flex flex-col items-center gap-1"><IconoDe ext={d.ext} /><span className="text-[11px] font-bold uppercase tracking-widest">{d.ext}</span></div>}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={d.nombre}>{d.nombre}</p>
                      <p className={cx(TEXT.muted, 'truncate text-xs')}>
                        {etiquetaTamano(d.tamano)} · {cuando(d.fecha)}{q ? ` · ${nombreCarpeta(d.carpetaId)}` : ''}
                      </p>
                      <p className={cx(TEXT.muted, 'truncate text-xs')}>{d.subidoPor ?? '—'}</p>
                    </div>
                    <div className="flex gap-1">
                      <Boton size="sm" variant="secondary" className="flex-1" icon={<Download size={14} />} onClick={() => descarga(d)}>Descargar</Boton>
                      <Boton size="sm" variant="ghost" aria-label={`Renombrar ${d.nombre}`} icon={<Pencil size={14} />} onClick={() => abre({ tipo: 'renombrarDoc', doc: d }, d.nombre)} />
                      <Boton size="sm" variant="ghost" aria-label={`Borrar ${d.nombre}`} icon={<Trash2 size={14} />} onClick={() => borra(d)} />
                    </div>
                  </Hoja>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {dialogo && (
        <Modal width="sm" onClose={() => setDialogo(null)}
          title={dialogo.tipo === 'nueva' ? 'Nueva carpeta' : dialogo.tipo === 'renombrarCarpeta' ? 'Renombrar carpeta' : 'Renombrar documento'}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Boton variant="secondary" onClick={() => setDialogo(null)}>Cancelar</Boton>
              <Boton disabled={ocupado || !texto.trim()} icon={ocupado ? <Loader2 size={14} className="animate-spin" /> : undefined} onClick={guardaDialogo}>Guardar</Boton>
            </div>
          }>
          <div className="space-y-3">
            <Campo label="Nombre" value={texto} maxLength={dialogo.tipo === 'renombrarDoc' ? 120 : 60} autoFocus
              onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && texto.trim()) guardaDialogo(); }} />
            {error && <p className="text-xs font-medium text-red-700 dark:text-red-300">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
