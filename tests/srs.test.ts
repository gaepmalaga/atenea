import { describe, it, expect } from 'vitest';
import { scheduleCard, nextReviewDate, MAX_BOX } from '../app/lib/srs';

describe('scheduleCard', () => {
  it('un fallo devuelve la tarjeta a la caja 1 y la repite manana', () => {
    expect(scheduleCard(4, 'fail')).toEqual({ box: 1, days: 1 });
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

  it('una tarjeta nueva (sin caja) arranca en la caja 1', () => {
    expect(scheduleCard(undefined, 'easy').box).toBe(2);
  });

  // --- CARACTERIZACION DE FALLOS CONOCIDOS ---

  it('BUG: "Duda" y "Bien" son indistinguibles desde la caja 1', () => {
    // Ambos programan el repaso a 3 dias. El alumno pulsa "Duda" esperando
    // ver la tarjeta antes, y el sistema la trata igual que si la supiera.
    expect(scheduleCard(1, 'hard').days).toBe(scheduleCard(1, 'easy').days);
  });

  it('BUG: "Duda" nunca mueve de caja, asi que una tarjeta puede quedar atascada', () => {
    // Un alumno que siempre responda "Duda" repasa la misma tarjeta cada 3
    // dias de por vida: no progresa ni retrocede.
    let box = 1;
    for (let i = 0; i < 20; i++) box = scheduleCard(box, 'hard').box;
    expect(box).toBe(1);
  });

  it('BUG: "Duda" desde una caja alta acorta el intervalo pero mantiene la caja', () => {
    // Desde la caja 5 (30 dias) un "Duda" pasa a 3 dias sin bajar de caja:
    // el siguiente "Bien" vuelve a saltar a 30 dias de golpe.
    expect(scheduleCard(5, 'hard')).toEqual({ box: 5, days: 3 });
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
