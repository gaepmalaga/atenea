'use client';

import { useEffect, useState } from 'react';
import { Loader2, Share2, Copy, AlertTriangle } from 'lucide-react';
import { getCuadranteTeoria } from '@/actions';
import { textoCuadranteTeoria, textoProfesores, type CuadranteTeoria } from '@/app/lib/cuadrante-teoria';
import { entregaImagenTeoria } from '@/app/components/fisica/cuadranteTeoriaImagen';
import { Boton, Aviso, PanelLateral, TEXT, cx } from '../../ui';

/**
 * El cuadrante semanal de teoría (regla 142): lo que Alphapol manda cada semana
 * por WhatsApp, generado desde lo programado en el Calendario. No guarda nada:
 * enseña la semana y la entrega como imagen (en el móvil, la hoja de compartir)
 * o como texto.
 */
export default function CuadranteTeoriaPanel({ lunes, onCerrar }: { lunes: string; onCerrar: () => void }) {
  const [c, setC] = useState<CuadranteTeoria | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const r = await getCuadranteTeoria({ lunes });
      if (!vivo) return;
      if (r.success) setC(r.cuadrante); else setError(r.error);
    })();
    return () => { vivo = false; };
  }, [lunes]);

  async function imagen() {
    if (!c) return;
    setOcupado(true); setMensaje(null);
    const r = await entregaImagenTeoria(c, `cuadrante-teoria-${c.lunes}.png`);
    setOcupado(false);
    setMensaje(r === 'compartida' ? 'Imagen compartida.' : r === 'descargada' ? 'Imagen descargada.' : 'No se pudo generar la imagen.');
  }

  async function texto() {
    if (!c) return;
    try { await navigator.clipboard.writeText(textoCuadranteTeoria(c)); setMensaje('Texto copiado: pégalo en WhatsApp.'); }
    catch { setMensaje('No se pudo copiar el texto.'); }
  }

  return (
    <PanelLateral titulo="Cuadrante semanal de clases" sub={c?.rango ?? 'Cargando…'} onCerrar={onCerrar}>
      {error && <Aviso tono="malo"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</Aviso>}
      {!c && !error && <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" size={20} /></div>}
      {c && (
        <div className="space-y-4">
          {c.sinPlanificar > 0 && (
            <Aviso><p>{c.sinPlanificar === 1 ? 'Hay 1 clase' : `Hay ${c.sinPlanificar} clases`} sin programar: saldrán como «Por programar». Se programan desde el Calendario.</p></Aviso>
          )}
          <div className="flex flex-wrap gap-2">
            <Boton onClick={imagen} disabled={ocupado} icon={ocupado ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}>Compartir la imagen</Boton>
            <Boton variant="secondary" onClick={texto} icon={<Copy size={15} />}>Copiar el texto</Boton>
          </div>
          {mensaje && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400" aria-live="polite">{mensaje}</p>}
          <div className="space-y-3">
            {c.dias.map((d) => (
              <div key={d.fecha} className="overflow-hidden rounded-xl border border-linea dark:border-noche-linea">
                <p className="bg-indigo-900 px-3 py-1.5 text-sm font-bold text-white">{d.titulo}</p>
                <div className="space-y-2 p-2">
                  {d.extras.map((x) => (
                    <p key={x.id} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-[13px] font-semibold text-amber-950">
                      {x.hora ? `${x.hora} · ` : ''}{x.titulo}{x.profesores.length ? ` (${textoProfesores(x.profesores)})` : ''}{x.externos ? ' · abierto a externos' : ''}
                    </p>
                  ))}
                  {d.clases.map((k) => (
                    <div key={k.id} className={cx('rounded-lg border px-3 py-2 text-[13px]', k.sinPlanificar && 'border-dashed')} style={{ backgroundColor: k.sinPlanificar ? undefined : k.color.fondo, borderColor: k.sinPlanificar ? undefined : k.color.borde }}>
                      <span className="mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: k.sinPlanificar ? '#94a3b8' : k.color.pastilla }}>{k.hora}</span>
                      <b className="text-slate-900">{k.sinPlanificar ? 'Por programar' : [k.nota, k.tema].filter(Boolean).join(' ') || 'Sin tema'}</b>
                      {k.profesores.length > 0 && <span className="text-slate-700"> — {textoProfesores(k.profesores)}</span>}
                      <span className="block text-[11px] text-slate-600">{k.grupo}</span>
                    </div>
                  ))}
                  {!d.clases.length && !d.extras.length && <p className={TEXT.muted}>Nada este día.</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PanelLateral>
  );
}
