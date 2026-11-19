'use client';

import { useState } from 'react';
import { History, Undo2 } from 'lucide-react';
import { getHistorialPregunta, restauraPregunta } from '@/actions';
import type { CambioDePregunta } from '@/app/actions/moderation';
import type { CamposEditables } from '@/app/lib/preguntas-edicion';
import { Boton } from '../../ui';

const ORIGEN: Record<string, string> = { banco: 'Banco oficial', examen_papel: 'Examen en papel', restaurar: 'Volver atrás' };
const fechaCorta = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * EL HISTORIAL DE CAMBIOS DE UNA PREGUNTA (regla 135): quién la tocó, cuándo,
 * desde dónde y qué cambió, con «Volver a como estaba». Lo usan «Banco oficial»
 * y la revisión del examen en papel.
 */
export default function HistorialPregunta({
  preguntaId, onRestaurada, onError,
}: { preguntaId: string; onRestaurada: (campos: CamposEditables) => void; onError?: (m: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<CambioDePregunta[] | 'cargando' | string>('cargando');

  async function alterna() {
    if (abierto) { setAbierto(false); return; }
    setAbierto(true);
    setEstado('cargando');
    const res = await getHistorialPregunta(preguntaId);
    setEstado(res.success ? res.cambios : res.error);
  }

  async function vuelve(cambioId: string) {
    const res = await restauraPregunta(cambioId);
    if (!res.success) { onError?.(res.error); return; }
    setAbierto(false);
    onRestaurada(res.campos);
  }

  return (
    <div className="space-y-2">
      <Boton variant="ghost" onClick={alterna} icon={<History size={15} />}>{abierto ? 'Ocultar el historial' : 'Historial de cambios'}</Boton>
      {abierto && (
        <div className="rounded-lg bg-hundido p-3 dark:bg-noche-hondo">
          {estado === 'cargando' && <p className="text-sm text-slate-600 dark:text-slate-400">Cargando…</p>}
          {typeof estado === 'string' && estado !== 'cargando' && <p className="text-sm text-red-700 dark:text-red-300">{estado}</p>}
          {Array.isArray(estado) && estado.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">Esta pregunta no se ha editado nunca desde la plataforma.</p>}
          {Array.isArray(estado) && estado.length > 0 && (
            <ul className="space-y-2">
              {estado.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <b>{fechaCorta(c.fecha)}</b> · {ORIGEN[c.origen] ?? c.origen}{c.quien ? ` · ${c.quien}` : ''}
                    <span className="block text-slate-600 dark:text-slate-400">Cambió {c.cambios.join(', ') || 'algún detalle'}.</span>
                  </span>
                  <Boton variant="secondary" onClick={() => vuelve(c.id)} icon={<Undo2 size={14} />}>Volver a como estaba</Boton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
