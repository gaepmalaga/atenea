import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resumeSimulacros, type IntentoSimulacro } from '../app/lib/simulacros';

/**
 * ¿APROBARÍA? — la media de los simulacros con la nota del BOE.
 *
 * Lo que se vigila: se agrupa por `exam_id`, el blanco no cuenta como fallo, la
 * nota sale de `scoreExam` (no de una fórmula copiada), y «sin simulacros» no es
 * «un 0».
 */

function examen(examId: string, opts: { aciertos: number; fallos: number; blancos: number; fecha: string }): IntentoSimulacro[] {
  const filas: IntentoSimulacro[] = [];
  for (let i = 0; i < opts.aciertos; i++) filas.push({ exam_id: examId, is_correct: true, selected_index: 0, created_at: opts.fecha });
  for (let i = 0; i < opts.fallos; i++) filas.push({ exam_id: examId, is_correct: false, selected_index: 1, created_at: opts.fecha });
  for (let i = 0; i < opts.blancos; i++) filas.push({ exam_id: examId, is_correct: false, selected_index: -1, created_at: opts.fecha });
  return filas;
}

describe('agrupación por examen', () => {
  it('junta las filas del mismo exam_id en un simulacro', () => {
    const rows = [
      ...examen('a', { aciertos: 15, fallos: 5, blancos: 0, fecha: '2026-09-01T10:00:00Z' }),
      ...examen('b', { aciertos: 10, fallos: 10, blancos: 0, fecha: '2026-09-05T10:00:00Z' }),
    ];
    const r = resumeSimulacros(rows);
    expect(r.simulacros).toHaveLength(2);
    // Más reciente primero.
    expect(r.simulacros[0].examId).toBe('b');
    expect(r.simulacros[0].total).toBe(20);
  });

  it('ignora las respuestas sin exam_id (son de entrenamiento)', () => {
    const rows: IntentoSimulacro[] = [
      { exam_id: null, is_correct: true, selected_index: 0, created_at: '2026-09-01T10:00:00Z' },
      ...examen('a', { aciertos: 10, fallos: 0, blancos: 0, fecha: '2026-09-01T10:00:00Z' }),
    ];
    const r = resumeSimulacros(rows);
    expect(r.simulacros).toHaveLength(1);
    expect(r.simulacros[0].total).toBe(10);
  });
});

describe('la nota', () => {
  it('es la del BOE: 15 aciertos y 5 fallos de 20 → no es un 75 %', () => {
    // net = 15 - 5/2 = 12.5 ; nota = 12.5 * 10 / 20 = 6.25
    const r = resumeSimulacros(examen('a', { aciertos: 15, fallos: 5, blancos: 0, fecha: '2026-09-01T10:00:00Z' }));
    expect(r.simulacros[0].nota).toBeCloseTo(6.25, 1);
    expect(r.simulacros[0].aprobado).toBe(true);
  });

  it('un blanco no resta: 10 aciertos, 0 fallos, 10 blancos → nota alta', () => {
    // net = 10 ; nota = 10 * 10 / 20 = 5
    const r = resumeSimulacros(examen('a', { aciertos: 10, fallos: 0, blancos: 10, fecha: '2026-09-01T10:00:00Z' }));
    expect(r.simulacros[0].nota).toBeCloseTo(5, 1);
    expect(r.simulacros[0].blancos).toBe(10);
    expect(r.simulacros[0].fallos).toBe(0);
  });

  it('suspende con muchos fallos: 8 aciertos, 12 fallos de 20', () => {
    // net = 8 - 12/2 = 2 ; nota = 2 * 10 / 20 = 1
    const r = resumeSimulacros(examen('a', { aciertos: 8, fallos: 12, blancos: 0, fecha: '2026-09-01T10:00:00Z' }));
    expect(r.simulacros[0].nota).toBeCloseTo(1, 1);
    expect(r.simulacros[0].aprobado).toBe(false);
  });
});

describe('media y tendencia', () => {
  it('sin simulacros: media null, no 0 (regla 8)', () => {
    const r = resumeSimulacros([]);
    expect(r.media).toBeNull();
    expect(r.mejor).toBeNull();
    expect(r.tendencia).toBeNull();
  });

  it('la media es la de todas las notas', () => {
    const rows = [
      ...examen('a', { aciertos: 20, fallos: 0, blancos: 0, fecha: '2026-09-01T10:00:00Z' }), // nota 10
      ...examen('b', { aciertos: 10, fallos: 10, blancos: 0, fecha: '2026-09-02T10:00:00Z' }), // net 5 → 2.5
    ];
    const r = resumeSimulacros(rows);
    expect(r.media).toBeCloseTo((10 + 2.5) / 2, 1);
    expect(r.mejor).toBeCloseTo(10, 1);
  });

  it('«sube» si los 3 últimos superan a los 3 anteriores', () => {
    const rows = [
      ...examen('f', { aciertos: 18, fallos: 2, blancos: 0, fecha: '2026-09-20T10:00:00Z' }),
      ...examen('e', { aciertos: 17, fallos: 3, blancos: 0, fecha: '2026-09-18T10:00:00Z' }),
      ...examen('d', { aciertos: 16, fallos: 4, blancos: 0, fecha: '2026-09-16T10:00:00Z' }),
      ...examen('c', { aciertos: 10, fallos: 10, blancos: 0, fecha: '2026-09-10T10:00:00Z' }),
      ...examen('b', { aciertos: 9, fallos: 11, blancos: 0, fecha: '2026-09-08T10:00:00Z' }),
      ...examen('a', { aciertos: 8, fallos: 12, blancos: 0, fecha: '2026-09-05T10:00:00Z' }),
    ];
    expect(resumeSimulacros(rows).tendencia).toBe('sube');
  });

  it('con menos de 4 no hay tendencia', () => {
    const rows = [
      ...examen('a', { aciertos: 15, fallos: 5, blancos: 0, fecha: '2026-09-01T10:00:00Z' }),
      ...examen('b', { aciertos: 10, fallos: 10, blancos: 0, fecha: '2026-09-05T10:00:00Z' }),
    ];
    expect(resumeSimulacros(rows).tendencia).toBeNull();
  });
});

describe('guarda: el módulo es puro', () => {
  it('no importa React ni Supabase', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'simulacros.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient/i);
  });

  it('la nota sale de scoreExam, no de una fórmula copiada', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'simulacros.ts'), 'utf-8');
    expect(src).toMatch(/scoreExam\(/);
  });
});
