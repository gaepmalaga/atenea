'use client';

import { useMemo, useState } from 'react';
import { Search, FileText, AlertTriangle } from 'lucide-react';
import { CHUNK_MAX_CHARS } from '@/app/lib/text';
import { Modal } from '../../ui';
import {
  groupChunksByReference,
  summarizeChunks,
  type DocumentChunkRow,
} from '@/app/lib/documents';

/**
 * Enseña QUE ha entendido la plataforma de un documento.
 *
 * POR QUE EXISTE
 * Hasta ahora subias un PDF y lo unico que veias era un numero: «177
 * fragmentos». Ni de que articulos salian, ni por donde se habia cortado, ni si
 * el texto habia llegado entero. Esa opacidad es el origen real de la
 * desconfianza con la ingesta —«me da miedo que los documentos se partan, se
 * pierda informacion»— y no se cura prometiendo que funciona, se cura
 * enseñandolo.
 *
 * NO PIDE LOS DATOS. Se los da el panel ya cargados, asi este componente no
 * necesita ningun efecto: se monta con lo que tiene que pintar.
 */
export default function DocumentChunksViewer({
  filename,
  chunks,
  onClose,
}: {
  filename: string;
  chunks: DocumentChunkRow[];
  onClose: () => void;
}) {
  const [filtro, setFiltro] = useState('');
  const [abierto, setAbierto] = useState<number | null>(chunks[0]?.id ?? null);

  const resumen = useMemo(() => summarizeChunks(chunks), [chunks]);

  const grupos = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    if (!texto) return groupChunksByReference(chunks);
    // Se filtra ANTES de agrupar: asi un articulo del que solo casa un
    // fragmento aparece con ese fragmento, no con los cinco.
    return groupChunksByReference(
      chunks.filter(
        (c) =>
          (c.reference ?? '').toLowerCase().includes(texto) ||
          c.content_chunk.toLowerCase().includes(texto)
      )
    );
  }, [chunks, filtro]);

  const fragmentosFiltrados = grupos.reduce((n, g) => n + g.chunks.length, 0);
  const seHaPasado = resumen.maxCaracteres > CHUNK_MAX_CHARS;

  return (
    <Modal
      title={filename}
      subtitle="Lo que ha entrado en el buscador"
      width="lg"
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* RESUMEN */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/50 rounded-2xl p-4">
          <Dato valor={resumen.total} etiqueta="Fragmentos" />
          <Dato
            valor={resumen.conReferencia}
            etiqueta="Con artículo"
            /* Cero es NORMAL en unos apuntes y GRAVE en un texto legal, asi que
               se enseña el numero y no un semaforo que mentiria en un caso. */
            pista={
              resumen.conReferencia === 0
                ? 'Ninguno sabe de qué artículo sale: o son apuntes, o no se ha detectado la estructura legal.'
                : undefined
            }
          />
          <Dato valor={resumen.referenciasDistintas} etiqueta="Artículos distintos" />
          <Dato
            valor={resumen.maxCaracteres}
            etiqueta="Fragmento más largo"
            alerta={seHaPasado}
            pista={seHaPasado ? `Supera el máximo de ${CHUNK_MAX_CHARS} caracteres.` : undefined}
          />
        </div>

        {/* BUSCADOR */}
        <div className="flex items-center gap-3 border border-slate-800 rounded-xl px-3 min-h-[44px]">
          <Search size={14} className="text-slate-600 flex-shrink-0" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por artículo o por texto…"
            className="flex-1 min-w-0 bg-transparent text-base sm:text-sm text-slate-200 outline-none placeholder:text-slate-600"
          />
          {filtro.trim() && (
            <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">
              {fragmentosFiltrados} de {resumen.total}
            </span>
          )}
        </div>

        {/* FRAGMENTOS */}
        <div className="space-y-3">
          {grupos.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-12">
              {resumen.total === 0
                ? 'Este documento no tiene ni un fragmento indexado: el chat no encuentra nada de él.'
                : 'Nada casa con la búsqueda.'}
            </p>
          )}

          {grupos.map((grupo, i) => (
            <div key={`${grupo.reference ?? 'sin'}-${i}`} className="border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-900 flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-200 truncate">
                  {grupo.reference ?? (
                    /* El preambulo, la exposicion de motivos… no salen de
                       ningun articulo, y decirlo es mas util que dejarlo vacio. */
                    <span className="text-slate-500 italic font-medium">Sin artículo (preámbulo o texto suelto)</span>
                  )}
                </span>
                <span className="text-[10px] font-mono text-slate-600 flex-shrink-0">
                  {grupo.chunks.length} frag.
                </span>
              </div>

              <div className="divide-y divide-slate-800/60">
                {grupo.chunks.map((chunk) => {
                  const estaAbierto = abierto === chunk.id;
                  return (
                    <button
                      key={chunk.id}
                      onClick={() => setAbierto(estaAbierto ? null : chunk.id)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-900/60 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <FileText size={12} className="text-slate-700 mt-1 flex-shrink-0" />
                        <p
                          className={`text-xs text-slate-400 leading-relaxed whitespace-pre-wrap ${
                            estaAbierto ? '' : 'line-clamp-2'
                          }`}
                        >
                          {chunk.content_chunk}
                        </p>
                      </div>
                      <span className="block text-[9px] font-mono text-slate-700 mt-2 ml-6">
                        {chunk.content_chunk.length} caracteres · {estaAbierto ? 'pulsa para plegar' : 'pulsa para leerlo entero'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Un numero del resumen, con su aviso si algo no cuadra. */
function Dato({
  valor,
  etiqueta,
  alerta,
  pista,
}: {
  valor: number;
  etiqueta: string;
  alerta?: boolean;
  pista?: string;
}) {
  return (
    <div title={pista}>
      <p className={`text-xl font-black ${alerta ? 'text-amber-400' : 'text-white'}`}>
        {valor.toLocaleString('es-ES')}
      </p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
        {alerta && <AlertTriangle size={10} className="text-amber-400" />}
        {etiqueta}
      </p>
    </div>
  );
}
