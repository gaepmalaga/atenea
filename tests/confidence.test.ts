import { describe, it, expect } from 'vitest';
import {
  resumeCalibracion,
  consejoCalibracion,
  CONFIDENCE,
  type ConfidenceAttempt,
} from '../app/lib/confidence';

/**
 * CALIBRACIÓN DE LA CONFIANZA (P10b · técnica 8).
 *
 * En un examen con penalización, «saber cuándo no lo sabes» es una habilidad
 * medible. Aquí se vigila la aritmética: la de siempre en este repo (regla 8 —
 * «sin datos» ≠ «cero» — y el blanco que no penaliza, regla 24).
 */

const r = (o: Partial<ConfidenceAttempt>): ConfidenceAttempt => ({ is_correct: true, selected_index: 0, ...o });

describe('resumeCalibracion', () => {
  it('sin ninguna marca de confianza → sinDatos, y los niveles a null (no a 0)', () => {
    const c = resumeCalibracion([r({ confidence: null }), r({ confidence: undefined }), r({})]);
    expect(c.sinDatos).toBe(true);
    for (const n of c.porNivel) expect(n.acierto).toBeNull();
  });

  it('reparte las contestadas por nivel y calcula el acierto de cada uno', () => {
    const c = resumeCalibracion([
      r({ confidence: CONFIDENCE.SEGURO, is_correct: true }),
      r({ confidence: CONFIDENCE.SEGURO, is_correct: true }),
      r({ confidence: CONFIDENCE.SEGURO, is_correct: false }),
      r({ confidence: CONFIDENCE.MEDIAS, is_correct: true }),
      r({ confidence: CONFIDENCE.CIEGAS, is_correct: false }),
    ]);
    expect(c.sinDatos).toBe(false);
    const seguro = c.porNivel.find((n) => n.nivel === CONFIDENCE.SEGURO)!;
    expect(seguro.total).toBe(3);
    expect(seguro.acierto).toBe(67);
    expect(c.seguroFallado).toBe(1);
  });

  it('un blanco NO cuenta como respuesta con marca (regla 24)', () => {
    const c = resumeCalibracion([
      r({ selected_index: -1, confidence: CONFIDENCE.CIEGAS }), // blanco
      r({ selected_index: 1, confidence: CONFIDENCE.SEGURO, is_correct: true }),
    ]);
    expect(c.blancos).toBe(1);
    expect(c.porNivel.find((n) => n.nivel === CONFIDENCE.CIEGAS)!.total).toBe(0);
  });

  it('el neto de adivinar: aciertos − fallos/2, y es negativo cuando adivinar resta', () => {
    // 2 aciertos, 6 fallos a ciegas → 2 − 3 = −1
    const c = resumeCalibracion([
      ...Array.from({ length: 2 }, () => r({ confidence: CONFIDENCE.CIEGAS, is_correct: true })),
      ...Array.from({ length: 6 }, () => r({ confidence: CONFIDENCE.CIEGAS, is_correct: false })),
    ]);
    expect(c.ciegasAciertos).toBe(2);
    expect(c.ciegasFallos).toBe(6);
    expect(c.netoDeAdivinar).toBe(-1);
  });

  it('sin ninguna «a ciegas», el neto es 0, no NaN', () => {
    const c = resumeCalibracion([r({ confidence: CONFIDENCE.SEGURO, is_correct: true })]);
    expect(c.netoDeAdivinar).toBe(0);
  });
});

describe('consejoCalibracion', () => {
  it('si adivinar restó, lo dice con el número', () => {
    const c = resumeCalibracion([
      ...Array.from({ length: 6 }, () => r({ confidence: CONFIDENCE.CIEGAS, is_correct: false })),
    ]);
    expect(consejoCalibracion(c)).toMatch(/blanco habría puntuado más/);
  });

  it('si falla muchas «seguras», avisa de que es lo más caro', () => {
    const c = resumeCalibracion(
      Array.from({ length: 4 }, () => r({ confidence: CONFIDENCE.SEGURO, is_correct: false })),
    );
    expect(consejoCalibracion(c)).toMatch(/dabas por seguras/);
  });

  it('sin datos → sin consejo', () => {
    expect(consejoCalibracion(resumeCalibracion([]))).toBeNull();
  });
});

describe('guarda: confidence.ts es puro y no escribe', () => {
  it('no importa React ni Supabase', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'confidence.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient|\.from\(/i);
  });
});
