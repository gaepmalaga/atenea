import { describe, it, expect } from 'vitest';
import {
  scheduleCard,
  nextReviewDate,
  intervalForBox,
  BOX_INTERVALS,
  MAX_BOX,
  type SrsRating,
} from '../app/lib/srs';

describe('intervalForBox', () => {
  it('cada caja tiene su intervalo', () => {
    expect(BOX_INTERVALS).toEqual([1, 3, 7, 15, 30]);
    expect(intervalForBox(1)).toBe(1);
    expect(intervalForBox(MAX_BOX)).toBe(30);
  });

  it('los intervalos crecen', () => {
    for (let i = 1; i < BOX_INTERVALS.length; i++) {
      expect(BOX_INTERVALS[i]).toBeGreaterThan(BOX_INTERVALS[i - 1]);
    }
  });

  it('acota los valores fuera de rango en vez de devolver undefined', () => {
    expect(intervalForBox(0)).toBe(1);
    expect(intervalForBox(99)).toBe(30);
  });
});

describe('scheduleCard', () => {
  it('un fallo devuelve la tarjeta a la caja 1 y la repite manana', () => {
    expect(scheduleCard(4, 'fail')).toEqual({ box: 1, days: 1 });
    expect(scheduleCard(MAX_BOX, 'fail')).toEqual({ box: 1, days: 1 });
  });

  it('un acierto sube de caja y alarga el intervalo', () => {
    expect(scheduleCard(1, 'easy')).toEqual({ box: 2, days: 3 });
    expect(scheduleCard(2, 'easy')).toEqual({ box: 3, days: 7 });
    expect(scheduleCard(3, 'easy')).toEqual({ box: 4, days: 15 });
    expect(scheduleCard(4, 'easy')).toEqual({ box: 5, days: 30 });
  });

  it('la caja tiene techo', () => {
    expect(scheduleCard(MAX_BOX, 'easy')).toEqual({ box: MAX_BOX, days: 30 });
  });

  it('una tarjeta nueva arranca en la caja 1', () => {
    expect(scheduleCard(undefined, 'easy')).toEqual({ box: 2, days: 3 });
    expect(scheduleCard(undefined, 'fail')).toEqual({ box: 1, days: 1 });
  });

  it('el intervalo depende solo de la caja', () => {
    // Antes se calculaba por separado para cada valoración, y de ahí venía que
    // dos valoraciones distintas acabaran dando el mismo resultado.
    for (const rating of ['fail', 'hard', 'easy'] as SrsRating[]) {
      const { box, days } = scheduleCard(3, rating);
      expect(days).toBe(intervalForBox(box));
    }
  });

  // --- LAS TRES RAREZAS QUE TENIA LA VERSION ANTERIOR ---
  // Estos tres tests estaban marcados `BUG:` y describian el comportamiento
  // roto. Al corregirlo en la fase 4, dos fallaron y el tercero pasaba por el
  // motivo equivocado. Ahora afirman lo correcto.

  it('"Duda" y "Bien" ya no son lo mismo desde la caja 1', () => {
    // Antes: ambas daban 3 días, así que el alumno pulsaba "Duda" esperando ver
    // la tarjeta antes y el sistema la trataba igual que si la supiera.
    const duda = scheduleCard(1, 'hard');
    const bien = scheduleCard(1, 'easy');
    expect(duda.days).toBeLessThan(bien.days);
    expect(duda).toEqual({ box: 1, days: 1 });
  });

  it('"Duda" baja de caja, así que una tarjeta difícil se repasa más', () => {
    // Antes "Duda" no movía de caja: una tarjeta se quedaba atascada de por
    // vida en la misma, repasándose cada 3 días pasara lo que pasara.
    expect(scheduleCard(5, 'hard')).toEqual({ box: 4, days: 15 });
    expect(scheduleCard(3, 'hard')).toEqual({ box: 2, days: 3 });
  });

  it('dudar repetidamente converge a repaso diario, no a un limbo', () => {
    let box: number = MAX_BOX;
    let days = 0;
    for (let i = 0; i < 10; i++) ({ box, days } = scheduleCard(box, 'hard'));
    // Suelo en la caja 1: una tarjeta que nunca sale se repasa cada día. Antes
    // el suelo era "la caja en la que estuvieras" con 3 días fijos.
    expect(box).toBe(1);
    expect(days).toBe(1);
  });

  it('desde la caja alta ya no se salta de 3 a 30 días de golpe', () => {
    // Antes: "Duda" en caja 5 daba 3 días manteniendo la caja, y el siguiente
    // "Bien" volvía a 30. Ahora la progresión es continua.
    const trasDuda = scheduleCard(5, 'hard');
    const trasBien = scheduleCard(trasDuda.box, 'easy');
    expect(trasDuda.days).toBe(15);
    expect(trasBien.days).toBe(30);
  });

  it('nunca se sale del rango de cajas', () => {
    for (const from of [-5, 0, 1, 3, 5, 99, undefined]) {
      for (const rating of ['fail', 'hard', 'easy'] as SrsRating[]) {
        const { box } = scheduleCard(from as number | undefined, rating);
        expect(box).toBeGreaterThanOrEqual(1);
        expect(box).toBeLessThanOrEqual(MAX_BOX);
      }
    }
  });
});

describe('nextReviewDate', () => {
  it('suma los dias indicados sin mutar la fecha original', () => {
    const base = new Date('2026-01-30T10:00:00Z');
    const next = nextReviewDate(base, 3);
    expect(next.toISOString().slice(0, 10)).toBe('2026-02-02');
    expect(base.toISOString()).toBe('2026-01-30T10:00:00.000Z');
  });

  it('cruza correctamente el cambio de anio', () => {
    expect(nextReviewDate(new Date('2026-12-30T00:00:00Z'), 7).toISOString().slice(0, 10)).toBe(
      '2027-01-06'
    );
  });
});
