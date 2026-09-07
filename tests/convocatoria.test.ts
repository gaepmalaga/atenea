import { describe, it, expect } from 'vitest';
import { diasHasta, fechaLarga, textoCuentaAtras } from '../app/lib/convocatoria';

/**
 * LA CUENTA ATRÁS DE LA CONVOCATORIA.
 *
 * Se cuenta por días de calendario, no por horas: si el examen es mañana,
 * «falta 1 día» diga lo que diga el reloj.
 */

describe('diasHasta', () => {
  const hoy = new Date('2026-09-08T15:00:00');

  it('sin fecha es null (regla 8)', () => {
    expect(diasHasta(null, hoy)).toBeNull();
    expect(diasHasta('', hoy)).toBeNull();
  });

  it('hoy es 0, mañana es 1', () => {
    expect(diasHasta('2026-09-08', hoy)).toBe(0);
    expect(diasHasta('2026-09-09', hoy)).toBe(1);
  });

  it('cuenta por días de calendario, no por 24 h exactas', () => {
    // A las 15:00 de hoy, «mañana» sigue siendo 1 día, no 0.
    expect(diasHasta('2026-09-09', new Date('2026-09-08T23:30:00'))).toBe(1);
  });

  it('negativo si ya pasó', () => {
    expect(diasHasta('2026-09-01', hoy)).toBe(-7);
  });

  it('cuenta larga', () => {
    expect(diasHasta('2027-05-18', hoy)).toBe(252);
  });
});

describe('fechaLarga', () => {
  it('formatea en español', () => {
    expect(fechaLarga('2027-05-18')).toBe('18 de mayo de 2027');
  });
  it('null si no hay', () => {
    expect(fechaLarga(null)).toBeNull();
  });
});

describe('textoCuentaAtras', () => {
  it('null sin fecha', () => {
    expect(textoCuentaAtras(null)).toBeNull();
  });
  it('hoy, mañana, esta semana', () => {
    expect(textoCuentaAtras(0)).toMatch(/HOY/);
    expect(textoCuentaAtras(1)).toBe('Falta 1 día');
    expect(textoCuentaAtras(4)).toBe('Faltan 4 días');
  });
  it('semanas y meses', () => {
    expect(textoCuentaAtras(21)).toMatch(/3 semanas/);
    expect(textoCuentaAtras(200)).toMatch(/meses/);
  });
  it('ya pasó', () => {
    expect(textoCuentaAtras(-3)).toMatch(/pasó/);
  });
});
