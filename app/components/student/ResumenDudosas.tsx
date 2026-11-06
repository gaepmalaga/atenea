'use client';

import { HelpCircle } from 'lucide-react';
import { Card, StatTile, cx, TEXT } from '../ui';
import { fraseDudosas, umbralEnTexto, netoEnTexto, porcentajeEnTexto, type ResumenDudosas as Resumen } from '@/app/lib/dudosas';

/**
 * LO QUE LE DAN LAS DUDOSAS AL ALUMNO (regla 80).
 *
 * Dos lecturas de lo mismo:
 *  · `examen`    — un simulacro recién entregado: un hecho, «hoy contestarlas
 *                  te ha sumado / restado tanto». No necesita muestra mínima.
 *  · `historico` — todo lo que ha marcado: ahí sí cabe un veredicto («te
 *                  compensa contestarlas»), y solo con muestra suficiente.
 *
 * No se pinta si no hay nada que contar: una tarjeta vacía en los resultados
 * es ruido, y «no has marcado ninguna» no es un dato que el alumno necesite.
 */
export default function ResumenDudosas({ resumen, ambito }: { resumen: Resumen; ambito: 'examen' | 'historico' }) {
  if (resumen.sinDatos || resumen.marcadas === 0) return null;

  const neto = resumen.netoAciertos;
  const netoTexto = netoEnTexto(neto);

  const veredicto =
    ambito === 'historico'
      ? fraseDudosas(resumen)
      : resumen.contestadas === 0
        ? 'Las dejaste todas en blanco: no te han restado nada.'
        : neto > 0
          ? 'Contestarlas te ha compensado hoy.'
          : neto < 0
            ? 'Hoy te habría salido mejor dejarlas en blanco.'
            : 'Contestarlas no te ha sumado ni restado nada.';

  return (
    <Card pad="sm" className="mb-4 text-left">
      <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5')}>
        <HelpCircle size={13} className="text-amber-500" />
        {ambito === 'examen' ? 'Tus dudosas en este simulacro' : 'Tus dudosas'}
      </p>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <StatTile label="Marcadas" value={resumen.marcadas} tone="warning" />
        <StatTile
          label="Acierto"
          value={resumen.acierto === null ? null : resumen.acierto.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
          suffix={resumen.acierto === null ? undefined : '%'}
          tone="brand"
        />
        <StatTile label="Netos" value={resumen.contestadas ? netoTexto : null} tone={neto < 0 ? 'danger' : 'success'} />
      </div>

      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
        Contestaste {resumen.contestadas}
        {resumen.contestadas > 0 && ` (acertaste ${resumen.aciertos}, fallaste ${resumen.fallos})`}
        {resumen.enBlanco > 0 && ` y dejaste ${resumen.enBlanco} en blanco`}.
        {' '}Con la penalización, contestar compensa si aciertas más del {umbralEnTexto(resumen.umbral)}.
      </p>

      {ambito === 'historico' && resumen.noDudosas.acierto !== null && resumen.acierto !== null && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1.5">
          En las que contestas sin dudar aciertas el {porcentajeEnTexto(resumen.noDudosas.acierto)}.
        </p>
      )}

      {veredicto && (
        <p
          className={cx(
            'text-[11px] font-bold leading-relaxed mt-2',
            (ambito === 'historico' ? resumen.compensa === false : neto < 0)
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-700 dark:text-slate-200',
          )}
        >
          {veredicto}
        </p>
      )}
    </Card>
  );
}
