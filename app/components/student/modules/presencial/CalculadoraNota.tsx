'use client';

import { useState } from 'react';
import { Calculator, ChevronDown } from 'lucide-react';
import { calculaNota, PREGUNTAS_OFICIAL } from '@/app/lib/calculadora-nota';
import { Card, TextField, cx, TEXT } from '../../../ui';

const num = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * LA CALCULADORA DE NOTA (regla 124): aciertos y fallos → nota, con la fórmula
 * de la convocatoria. Herramienta suelta: no guarda nada y no sustituye a meter
 * las respuestas de un examen en clase (de una nota suelta no se sabe qué
 * preguntas se fallan, ni nadie puede comprobarla).
 */
export default function CalculadoraNota() {
  const [abierta, setAbierta] = useState(false);
  const [preguntas, setPreguntas] = useState(String(PREGUNTAS_OFICIAL));
  const [aciertos, setAciertos] = useState('');
  const [fallos, setFallos] = useState('');
  const [alternativas, setAlternativas] = useState('3');

  const r = calculaNota({ preguntas, aciertos, fallos, alternativas });

  return (
    <Card pad="lg">
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2">
          <Calculator size={16} aria-hidden className="shrink-0 text-marino dark:text-oro-claro" />
          <span className={cx(TEXT.heading, 'text-slate-900 dark:text-white')}>Calculadora de nota</span>
        </span>
        <ChevronDown size={18} aria-hidden className={cx('shrink-0 transition-transform', abierta && 'rotate-180')} />
      </button>

      {abierta && (
        <div className="mt-3 space-y-4">
          <p className={cx(TEXT.muted)}>
            Pon cuántos aciertos y fallos has tenido y te dice la nota. Lo que dejes en blanco no cuenta. No se guarda: es solo para echar la cuenta.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <TextField label="Preguntas" inputMode="numeric" value={preguntas} onChange={(e) => setPreguntas(e.target.value)} />
            <TextField label="Aciertos" inputMode="numeric" placeholder="0" value={aciertos} onChange={(e) => setAciertos(e.target.value)} />
            <TextField label="Fallos" inputMode="numeric" placeholder="0" value={fallos} onChange={(e) => setFallos(e.target.value)} />
          </div>

          <div role="group" aria-label="Alternativas por pregunta" className="flex items-center gap-2">
            <span className={cx(TEXT.muted)}>Alternativas:</span>
            {['3', '4'].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={alternativas === n}
                onClick={() => setAlternativas(n)}
                className={cx(
                  'min-h-[44px] min-w-[44px] rounded-lg border-2 px-3 text-sm font-bold',
                  alternativas === n ? 'border-marino bg-marino text-white dark:border-oro-claro dark:bg-oro-claro dark:text-marino' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200',
                )}
              >
                {n}
              </button>
            ))}
            <span className={cx(TEXT.muted)}>{alternativas === '3' ? 'el examen de teoría' : 'psicotécnicos'}</span>
          </div>

          {r.estado === 'error' && <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">{r.error}</p>}

          {r.estado === 'ok' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-4 dark:bg-slate-900" aria-live="polite">
              <p className={cx(TEXT.label, 'text-slate-500 dark:text-slate-400')}>Tu nota</p>
              <p className={cx(TEXT.hud, 'text-4xl', r.aprobado === false ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300')}>
                {num(r.nota)} <span className="text-base font-semibold text-slate-500 dark:text-slate-400">/ 10</span>
              </p>
              {r.aprobado !== null && (
                <p className={cx(TEXT.body, 'font-semibold', r.aprobado ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                  {r.aprobado ? `Supera el mínimo de ${r.minimo}.` : `No llega al mínimo de ${r.minimo}.`}
                </p>
              )}
              <p className={cx(TEXT.muted)}>
                Cada fallo resta <strong>{num(r.porFallo)}</strong> aciertos: te quedan <strong>{num(r.neto)}</strong> aciertos netos
                {r.blancos > 0 ? `, y ${r.blancos} en blanco que no restan` : ''}.
                {r.seQuedaEnCero ? ' Los fallos te dejan por debajo de cero, y la nota se queda en 0.' : ''}
              </p>
              <p className={cx(TEXT.muted)}>Sin penalización habrías visto un {r.sinPenalizar} %.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
