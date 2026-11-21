import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error módulo .mjs sin tipos (es un guion de operación)
import { lineaDeTiempo, CUENTA_ATRAS } from '../scripts/reels/linea.mjs';

/**
 * Regla 147: los reels salen de una plantilla y de la MISMA línea de tiempo
 * para imagen y sonido; solo se hacen con preguntas de la academia o revisadas
 * por un tutor.
 */
const P = { pregunta: 'El Senado es la Cámara de representación:', explicacion: 'El Senado es la Cámara de representación territorial.', dificultad: 2 };

describe('línea de tiempo del reel', () => {
  it('las fases van en orden y no se pisan', () => {
    const L = lineaDeTiempo(P);
    const orden = [L.q0, L.cards0, L.cdStart, L.reveal, L.trans, L.expl0, L.ref0, L.end0, L.total];
    for (let i = 1; i < orden.length; i++) expect(orden[i]).toBeGreaterThan(orden[i - 1]);
  });
  it('la cuenta atrás depende de la dificultad: más difícil, más tiempo', () => {
    expect(CUENTA_ATRAS[1]).toBeLessThan(CUENTA_ATRAS[2]);
    expect(CUENTA_ATRAS[2]).toBeLessThan(CUENTA_ATRAS[3]);
    expect(lineaDeTiempo({ ...P, dificultad: 3 }).cdDur).toBe(CUENTA_ATRAS[3]);
  });
  it('el desvelado cae justo cuando acaba la cuenta (un tic de margen, no más)', () => {
    const L = lineaDeTiempo(P);
    expect(L.reveal - (L.cdStart + L.cdDur)).toBeGreaterThan(0);
    expect(L.reveal - (L.cdStart + L.cdDur)).toBeLessThan(.6);
  });
  it('un reel normal cabe en 30 s, y una explicación más larga lo alarga', () => {
    expect(lineaDeTiempo(P).total).toBeLessThan(30);
    const larga = lineaDeTiempo({ ...P, explicacion: 'palabra '.repeat(40).trim() });
    expect(larga.total).toBeGreaterThan(lineaDeTiempo(P).total);
  });
});

describe('los ejemplos', () => {
  const ej = JSON.parse(readFileSync(join(__dirname, '..', 'scripts', 'reels', 'ejemplos.json'), 'utf-8')) as {
    opciones: string[]; correcta: number; dificultad: number; referencia?: string;
  }[];
  it('tienen tres opciones, una correcta que existe y su referencia legal', () => {
    for (const e of ej) {
      expect(e.opciones).toHaveLength(3);
      expect(e.correcta).toBeGreaterThanOrEqual(0);
      expect(e.correcta).toBeLessThan(3);
      expect([1, 2, 3]).toContain(e.dificultad);
      expect((e.referencia ?? '').length).toBeGreaterThan(3);
    }
  });
  it('la letra correcta varía entre los ejemplos (no es siempre la misma)', () => {
    expect(new Set(ej.map((e) => e.correcta)).size).toBeGreaterThan(1);
  });
});
