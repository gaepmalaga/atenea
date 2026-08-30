import { describe, it, expect } from 'vitest';
import {
  summarizeResults,
  rankFor,
  nextRankAfter,
  progressToNextRank,
  readMaxPullups,
  RANKS,
  HESITATION_THRESHOLD,
} from '../app/lib/stats';

const row = (over: Record<string, unknown> = {}) => ({
  is_correct: true,
  response_time_ms: 10_000,
  option_changes: 1,
  error_type: null,
  ...over,
});

describe('summarizeResults', () => {
  it('cuenta aciertos y fallos', () => {
    const s = summarizeResults([row(), row({ is_correct: false }), row()]);
    expect(s).toMatchObject({ total: 3, correct: 2, wrong: 1, winRate: 67 });
  });

  it('sin resultados devuelve ceros, no NaN', () => {
    const s = summarizeResults([]);
    expect(s.winRate).toBe(0);
    expect(s.avgTimeMs).toBe(0);
    expect(s.uncertaintyIndex).toBe(0);
    expect(Number.isNaN(s.winRate)).toBe(false);
  });

  it('la media de tiempo ignora las respuestas sin medir', () => {
    // Las de modo examen guardaban 0 por un desajuste de nombres de campo
    // (fase 2.3): contarlas como "0 ms" hundiria la media a la mitad.
    const s = summarizeResults([
      row({ response_time_ms: 10_000 }),
      row({ response_time_ms: null }),
      row({ response_time_ms: 0 }),
      row({ response_time_ms: 20_000 }),
    ]);
    expect(s.avgTimeMs).toBe(15_000);
    expect(s.timedCount).toBe(2);
  });

  it('la incertidumbre usa la misma muestra en numerador y denominador', () => {
    // El calculo anterior sumaba los cambios de las 5 ultimas preguntas y
    // dividia entre el total de hasta 100.
    const s = summarizeResults([
      row({ option_changes: 2 }),
      row({ option_changes: 2 }),
      row({ option_changes: 2 }),
    ]);
    expect(s.uncertaintyIndex).toBe(100); // 2 cambios de media = maximo
    expect(summarizeResults([row({ option_changes: 0 })]).uncertaintyIndex).toBe(0);
    expect(summarizeResults([row({ option_changes: 1 })]).uncertaintyIndex).toBe(50);
  });

  it('la incertidumbre nunca pasa de 100', () => {
    expect(summarizeResults([row({ option_changes: 99 })]).uncertaintyIndex).toBe(100);
  });

  it('un 0 en cambios cuenta como dato, un null no', () => {
    expect(summarizeResults([row({ option_changes: 0 })]).changesCount).toBe(1);
    expect(summarizeResults([row({ option_changes: null })]).changesCount).toBe(0);
  });

  it('la taxonomia solo cuenta fallos etiquetados', () => {
    const s = summarizeResults([
      row({ is_correct: false, error_type: 'olvido' }),
      row({ is_correct: false, error_type: 'olvido' }),
      row({ is_correct: false, error_type: 'trampa' }),
      row({ is_correct: false, error_type: null }),
      row({ is_correct: true, error_type: 'olvido' }), // acierto: no cuenta
    ]);
    expect(s.errorBreakdown.olvido).toBe(2);
    expect(s.errorBreakdown.trampa).toBe(1);
    expect(s.taggedErrors).toBe(3);
  });

  it('ignora un error_type desconocido en vez de romper', () => {
    const s = summarizeResults([row({ is_correct: false, error_type: 'inventado' })]);
    expect(s.taggedErrors).toBe(0);
  });
});

describe('rangos', () => {
  it('asigna el rango segun el porcentaje de acierto', () => {
    expect(rankFor(0).id).toBe('cadet');
    expect(rankFor(39).id).toBe('cadet');
    expect(rankFor(40).id).toBe('officer');
    expect(rankFor(70).id).toBe('subinspector');
    expect(rankFor(100).id).toBe('inspector');
  });

  it('el ultimo rango no tiene siguiente', () => {
    expect(nextRankAfter(RANKS[RANKS.length - 1])).toBeNull();
  });

  it('el progreso mide el tramo entre el rango actual y el siguiente', () => {
    expect(progressToNextRank(0)).toBe(0);    // cadete recien empezado
    expect(progressToNextRank(20)).toBe(50);  // mitad de camino a Oficial (0 → 40)
    expect(progressToNextRank(40)).toBe(0);   // recien ascendido a Oficial
    expect(progressToNextRank(55)).toBe(50);  // mitad de Oficial (40) a Subinspector (70)
  });

  it('en el rango maximo el progreso es 100', () => {
    // Antes se calculaba `winRate / (min + 20)`: con min 90 el denominador era
    // 110, asi que ni con un 100% de acierto la barra llegaba al final.
    expect(progressToNextRank(90)).toBe(100);
    expect(progressToNextRank(100)).toBe(100);
  });

  it('nunca se sale de 0-100', () => {
    for (const wr of [-10, 0, 33, 89, 100, 150]) {
      const p = progressToNextRank(wr);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});

describe('readMaxPullups', () => {
  it('lee la ruta que escribe savePhysicalProfile', () => {
    expect(readMaxPullups({ baseline_metrics: { pullups_score: 12 } })).toBe(12);
  });

  it('acepta la ruta antigua por si hay filas historicas', () => {
    expect(readMaxPullups({ baseline_test: { pullups: 7 } })).toBe(7);
  });

  it('distingue "sin datos" de "cero dominadas"', () => {
    // El panel pintaba `|| 0` para ambos casos: un alumno que aun no ha hecho
    // el test veia lo mismo que uno que no logra ninguna dominada.
    expect(readMaxPullups({})).toBeNull();
    expect(readMaxPullups(null)).toBeNull();
    expect(readMaxPullups({ baseline_metrics: { pullups_score: 0 } })).toBe(0);
  });
});

describe('umbral de duda', () => {
  it('cualquier cambio real de opcion cuenta como duda', () => {
    // Desde la fase 2.3 `option_changes` cuenta cambios, no pulsaciones: la
    // primera respuesta ya no suma, asi que el umbral baja de 2 a 1.
    expect(HESITATION_THRESHOLD).toBe(1);
  });
});

/**
 * P3.4 — EL BLANCO DEJA DE CONTAR COMO FALLO EN LAS ESTADISTICAS.
 *
 * La nota del simulacro ya trataba el blanco como neutro, pero el resumen lo
 * metia en el denominador: el mismo examen daba dos verdades, y el porcentaje
 * de acierto castigaba no arriesgar — al reves de lo que enseña la formula.
 */
describe('un blanco no baja el porcentaje de acierto', () => {
  const acierto = { is_correct: true, selected_index: 1 };
  const fallo = { is_correct: false, selected_index: 2 };
  const blanco = { is_correct: false, selected_index: -1 };

  it('el porcentaje se calcula sobre las CONTESTADAS', () => {
    // 1 acierto, 1 fallo, 2 blancos. Antes: 1/4 = 25 %. Ahora: 1/2 = 50 %.
    const s = summarizeResults([acierto, fallo, blanco, blanco]);
    expect(s.winRate).toBe(50);
    expect(s.answered).toBe(2);
    expect(s.blank).toBe(2);
    expect(s.total).toBe(4);
  });

  it('los blancos no engordan la cuenta de fallos', () => {
    const s = summarizeResults([acierto, blanco, blanco]);
    expect(s.wrong).toBe(0);
    expect(s.correct).toBe(1);
  });

  it('dejar mas en blanco NO empeora el porcentaje', () => {
    // La comprobacion que importa: si esto se rompe, la plataforma vuelve a
    // empujar al alumno a contestar a ciegas.
    const pocos = summarizeResults([acierto, fallo, blanco]);
    const muchos = summarizeResults([acierto, fallo, blanco, blanco, blanco, blanco]);
    expect(muchos.winRate).toBe(pocos.winRate);
  });

  it('un examen entero en blanco no da NaN', () => {
    const s = summarizeResults([blanco, blanco]);
    expect(s.winRate).toBe(0);
    expect(s.answered).toBe(0);
    // "Sin datos" se distingue de "cero" mirando `answered` (regla 8).
    expect(s.blank).toBe(2);
  });

  it('un blanco no entra en el reparto de tipos de error', () => {
    // Si entrara, el diagnostico diria que el alumno tiene lagunas donde en
    // realidad decidio no contestar.
    const s = summarizeResults([
      { is_correct: false, selected_index: -1, error_type: 'olvido' },
      { is_correct: false, selected_index: 0, error_type: 'olvido' },
    ]);
    expect(s.errorBreakdown.olvido).toBe(1);
    expect(s.taggedErrors).toBe(1);
  });

  it('las filas historicas (sin selected_index) siguen contando como contestadas', () => {
    // Hasta P3.4 la columna estaba vacia TAMBIEN en las contestadas. Si null
    // se leyera como blanco, todo el historico se volveria invisible de golpe
    // y el porcentaje de acierto de cada alumno cambiaria solo.
    const s = summarizeResults([
      { is_correct: true },
      { is_correct: false },
      { is_correct: false, selected_index: null },
    ]);
    expect(s.blank).toBe(0);
    expect(s.answered).toBe(3);
    expect(s.winRate).toBe(33);
  });
});
