'use client';

import { useState } from 'react';
import { Loader2, Medal } from 'lucide-react';
import { getRankingExamenClase, setMiRanking } from '@/actions';
import { TOPE_RANKING, type RankingClase } from '@/app/lib/ranking-clase';
import { Button, TEXT, cx } from '../../../ui';

const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

/**
 * El ranking de un examen en clase (regla 126), que se pide al abrirlo.
 *
 * Salen los primeros y, abajo, mi puesto: quien va último se ve a sí mismo,
 * no una lista donde es el último. Cada uno puede salirse; quien se sale no
 * aparece y tampoco lo ve.
 */
export default function RankingClaseCard({ aplicacionId }: { aplicacionId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<{ oculto: true } | { oculto: false; ranking: RankingClase | null } | null>(null);

  async function carga() {
    setCargando(true);
    setError(null);
    const r = await getRankingExamenClase(aplicacionId);
    setCargando(false);
    if (!r.success) { setError(r.error); return; }
    setEstado(r.oculto ? { oculto: true } : { oculto: false, ranking: r.ranking });
  }

  async function cambia(visible: boolean) {
    setCargando(true);
    setError(null);
    const r = await setMiRanking({ visible });
    if (!r.success) { setCargando(false); setError(r.error); return; }
    await carga();
  }

  if (!abierto) {
    return (
      <Button size="sm" variant="secondary" icon={<Medal size={14} />} onClick={() => { setAbierto(true); carga(); }}>
        Ver el ranking
      </Button>
    );
  }

  return (
    <div className="mt-1 w-full basis-full space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
      {cargando && !estado && <p className={cx(TEXT.muted, 'flex items-center gap-2')}><Loader2 size={14} className="animate-spin" aria-hidden /> Cargando…</p>}
      {error && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}

      {estado?.oculto && (
        <>
          <p className={TEXT.muted}>Has salido del ranking: no apareces y tampoco lo ves. Si vuelves, saldrás con tu nota de cada examen.</p>
          <Button size="sm" disabled={cargando} onClick={() => cambia(true)}>Volver al ranking</Button>
        </>
      )}

      {estado && !estado.oculto && !estado.ranking && (
        <>
          <p className={TEXT.muted}>Todavía no hay notas suficientes para un ranking (hacen falta al menos tres).</p>
          <Button size="sm" variant="ghost" disabled={cargando} onClick={() => cambia(false)}>Salir del ranking</Button>
        </>
      )}

      {estado && !estado.oculto && estado.ranking && (
        <>
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            Vas en el puesto {estado.ranking.miPuesto} de {estado.ranking.total} · {num(estado.ranking.miNota)}
          </p>
          <ol className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={`Los ${TOPE_RANKING} primeros`}>
            {estado.ranking.primeros.map((p) => (
              <li key={`${p.puesto}-${p.nombre}-${p.nota}-${p.soyYo}`} className={cx('flex items-center gap-3 py-1.5 text-sm', p.soyYo && 'font-bold text-marino dark:text-oro-claro')}>
                <span className={cx(TEXT.hud, 'w-6 text-right tabular-nums')}>{p.puesto}</span>
                <span className="min-w-0 flex-1 truncate">{p.nombre}{p.soyYo && ' (tú)'}</span>
                <span className={cx(TEXT.hud, 'tabular-nums')}>{num(p.nota)}</span>
              </li>
            ))}
          </ol>
          {estado.ranking.miPuesto > TOPE_RANKING && (
            <p className={TEXT.muted}>Estás fuera de los {TOPE_RANKING} primeros: tu puesto es el {estado.ranking.miPuesto} de {estado.ranking.total}.</p>
          )}
          <Button size="sm" variant="ghost" disabled={cargando} onClick={() => cambia(false)}>Salir del ranking</Button>
        </>
      )}
    </div>
  );
}
