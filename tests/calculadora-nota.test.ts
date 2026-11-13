import { describe, it, expect } from 'vitest';
import { calculaNota, MAX_PREGUNTAS_CALCULADORA } from '../app/lib/calculadora-nota';
import { scoreExam } from '../app/lib/scoring';

const ok = (r: ReturnType<typeof calculaNota>) => { if (r.estado !== 'ok') throw new Error(JSON.stringify(r)); return r; };

describe('calculaNota: la fórmula de la convocatoria (regla 22)', () => {
  it('el ejemplo de la documentación: 60 aciertos y 40 fallos de 100, con 3 alternativas, es un 4', () => {
    const r = ok(calculaNota({ preguntas: 100, aciertos: 60, fallos: 40, alternativas: 3 }));
    expect(r.nota).toBe(4);
    expect(r.neto).toBe(40);
    expect(r.porFallo).toBe(0.5);
  });

  it('con 4 alternativas la misma situación da 4,67: el fallo resta menos', () => {
    expect(ok(calculaNota({ preguntas: 100, aciertos: 60, fallos: 40, alternativas: 4 })).nota).toBe(4.67);
  });

  it('el caso de la plataforma anterior: 4 aciertos y 11 fallos de 15 se queda en 0, no en negativo', () => {
    const r = ok(calculaNota({ preguntas: 15, aciertos: 4, fallos: 11, alternativas: 3 }));
    expect(r.nota).toBe(0);
    expect(r.seQuedaEnCero).toBe(true);
    expect(r.neto).toBe(-1.5);
  });

  it('un blanco no resta: los que faltan hasta el total son blancos', () => {
    const r = ok(calculaNota({ preguntas: 100, aciertos: 50, fallos: 0, alternativas: 3 }));
    expect(r.nota).toBe(5);
    expect(r.blancos).toBe(50);
    expect(r.seQuedaEnCero).toBe(false);
  });

  it('da exactamente lo mismo que `scoreExam`: la fórmula no está duplicada', () => {
    for (const [p, a, f] of [[100, 73, 20], [25, 10, 9], [50, 0, 50], [100, 100, 0]] as const) {
      const hechas = [
        ...Array.from({ length: a }, () => ({ userAnswer: 'a', correctOptionId: 'a' })),
        ...Array.from({ length: f }, () => ({ userAnswer: 'b', correctOptionId: 'a' })),
        ...Array.from({ length: p - a - f }, () => ({ userAnswer: null, correctOptionId: 'a' })),
      ];
      expect(ok(calculaNota({ preguntas: p, aciertos: a, fallos: f, alternativas: 3 })).nota).toBe(scoreExam(hechas).score);
    }
  });

  it('«aprobado» solo existe con las alternativas de la convocatoria', () => {
    expect(ok(calculaNota({ preguntas: 100, aciertos: 60, fallos: 40, alternativas: 3 })).aprobado).toBe(true);
    expect(ok(calculaNota({ preguntas: 100, aciertos: 10, fallos: 0, alternativas: 3 })).aprobado).toBe(false);
    expect(ok(calculaNota({ preguntas: 100, aciertos: 60, fallos: 40, alternativas: 4 })).aprobado).toBeNull();
  });

  it('sin alternativas escritas, son las de la convocatoria (3)', () => {
    expect(ok(calculaNota({ preguntas: 100, aciertos: 60, fallos: 40, alternativas: '' })).nota).toBe(4);
  });

  it('acepta números escritos como texto', () => {
    expect(ok(calculaNota({ preguntas: ' 100 ', aciertos: '60', fallos: '40', alternativas: '3' })).nota).toBe(4);
  });
});

describe('calculaNota: lo que no es válido se dice, y lo que falta no es un error', () => {
  it('mientras falte un campo, «vacío»: no se grita al alumno que aún está escribiendo', () => {
    expect(calculaNota({ preguntas: 100, aciertos: '', fallos: 3, alternativas: 3 }).estado).toBe('vacio');
    expect(calculaNota({ preguntas: '', aciertos: 3, fallos: 3, alternativas: 3 }).estado).toBe('vacio');
  });

  it('un cero escrito es un dato, no «vacío» (regla 16)', () => {
    expect(ok(calculaNota({ preguntas: 100, aciertos: 0, fallos: 0, alternativas: 3 })).nota).toBe(0);
  });

  it('aciertos más fallos no pueden pasar del total', () => {
    const r = calculaNota({ preguntas: 25, aciertos: 20, fallos: 10, alternativas: 3 });
    expect(r).toMatchObject({ estado: 'error' });
    expect((r as { error: string }).error).toMatch(/suman 30/);
  });

  it('negativos, decimales y letras se rechazan', () => {
    for (const mal of [-1, 2.5, 'abc']) {
      expect(calculaNota({ preguntas: 100, aciertos: mal, fallos: 0, alternativas: 3 }).estado, String(mal)).toBe('error');
    }
  });

  it('el número de preguntas tiene tope', () => {
    expect(calculaNota({ preguntas: MAX_PREGUNTAS_CALCULADORA + 1, aciertos: 1, fallos: 0, alternativas: 3 }).estado).toBe('error');
    expect(calculaNota({ preguntas: 0, aciertos: 0, fallos: 0, alternativas: 3 }).estado).toBe('error');
  });

  it('las alternativas van de 2 a 6', () => {
    expect(calculaNota({ preguntas: 10, aciertos: 1, fallos: 1, alternativas: 1 }).estado).toBe('error');
    expect(calculaNota({ preguntas: 10, aciertos: 1, fallos: 1, alternativas: 7 }).estado).toBe('error');
  });
});
