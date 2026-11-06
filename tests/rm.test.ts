import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estima1RM, redondeaCarga, kgDeCarga, normalizaCargas, leeCargas, normalizaEjercicio, claveEjercicio,
  rmVigentes, textoCarga, formateaKg, leeKg, MAX_CARGAS, type MarcaRM,
} from '../app/lib/rm';
import { normalizaContenido, copiaSemana, type Sesion } from '../app/lib/sesiones';

/**
 * EL 1RM Y LAS CARGAS EN PORCENTAJE (regla 87).
 */

describe('estimar el 1RM', () => {
  it('con 1 repetición es el propio peso; con más, Epley', () => {
    expect(estima1RM(100, 1)).toBe(100);
    expect(estima1RM(80, 5)).toBe(93.3);   // 80 × (1 + 5/30)
    expect(estima1RM(60, 10)).toBe(80);    // 60 × (1 + 10/30)
  });

  it('más de 12 repeticiones no es fiable, y sin peso no hay 1RM (no es 0, regla 8)', () => {
    expect(estima1RM(50, 13)).toBeNull();
    expect(estima1RM(0, 1)).toBeNull();
    expect(estima1RM(null, 1)).toBeNull();
    expect(estima1RM(80, 2.5)).toBeNull();
  });
});

describe('leer un peso escrito a mano', () => {
  it('admite coma o punto y espacios; vacío o no positivo es null, no 0 (regla 16)', () => {
    expect(leeKg('62,5')).toBe(62.5);
    expect(leeKg(' 80 ')).toBe(80);
    expect(leeKg('82.5')).toBe(82.5);
    expect(leeKg('')).toBeNull();
    expect(leeKg('0')).toBeNull();
    expect(leeKg('-5')).toBeNull();
    expect(leeKg('ochenta')).toBeNull();
    expect(leeKg(undefined)).toBeNull();
  });
});

describe('los kilos de una carga', () => {
  it('se redondean a 2,5 kg, lo que se puede montar con discos', () => {
    expect(redondeaCarga(83.1)).toBe(82.5);
    expect(redondeaCarga(83.8)).toBe(85);
    expect(kgDeCarga(110, 75)).toBe(82.5);
    expect(kgDeCarga(100, 80)).toBe(80);
  });

  it('sin 1RM no hay kilos: no se inventan', () => {
    expect(kgDeCarga(null, 75)).toBeNull();
    expect(kgDeCarga(0, 75)).toBeNull();
  });

  it('el texto: «4 × 6 al 75 %», «al 80 %»', () => {
    expect(textoCarga({ ejercicio: 'Sentadilla', porcentaje: 75, series: 4, reps: 6 })).toBe('4 × 6 al 75 %');
    expect(textoCarga({ ejercicio: 'Sentadilla', porcentaje: 80, series: null, reps: null })).toBe('al 80 %');
    expect(formateaKg(82.5)).toBe('82,5 kg');
  });
});

describe('las cargas que escribe el preparador', () => {
  it('se limpian; las filas sin ejercicio se descartan', () => {
    expect(normalizaCargas([
      { ejercicio: '  sentadilla ', porcentaje: '75', series: '4', reps: '6' },
      { ejercicio: '', porcentaje: '80' },
      { ejercicio: 'PRESS DE BANCA', porcentaje: '72,5', series: '', reps: '' },
    ])).toEqual({ ok: true, valor: [
      { ejercicio: 'Sentadilla', porcentaje: 75, series: 4, reps: 6 },
      { ejercicio: 'Press de banca', porcentaje: 73, series: null, reps: null },
    ] });
  });

  it('un porcentaje imposible o unas series que no son números se dicen, no se tragan', () => {
    expect(normalizaCargas([{ ejercicio: 'Sentadilla', porcentaje: '150' }]).ok).toBe(false);
    expect(normalizaCargas([{ ejercicio: 'Sentadilla', porcentaje: '75', series: 'muchas' }]).ok).toBe(false);
    expect(normalizaCargas(Array.from({ length: MAX_CARGAS + 1 }, () => ({ ejercicio: 'X', porcentaje: 70 }))).ok).toBe(false);
    expect(normalizaCargas('basura').ok).toBe(false);
  });

  it('al releer de la base de datos, lo que no sirve se queda en nada (regla 17)', () => {
    expect(leeCargas(null)).toEqual([]);
    expect(leeCargas([{ ejercicio: 'Sentadilla', porcentaje: 999 }])).toEqual([]);
  });

  it('una sesión lleva sus cargas, y copiar la semana las copia', () => {
    const c = normalizaContenido({ kind: 'fuerza', title: 'Fuerza', cargas: [{ ejercicio: 'Sentadilla', porcentaje: 75 }] });
    expect(c.ok && c.valor.cargas).toEqual([{ ejercicio: 'Sentadilla', porcentaje: 75, series: null, reps: null }]);
    expect(normalizaContenido({ kind: 'fuerza', title: 'X', cargas: [{ ejercicio: 'S', porcentaje: 5 }] }).ok).toBe(false);
    const s: Sesion = { id: 'a', fecha: '2026-11-02', kind: 'fuerza', title: 'F', description: null, durationMin: null, distanceKm: null, video: null,
      classId: 'g', userId: null, position: 0, cargas: [{ ejercicio: 'Sentadilla', porcentaje: 75, series: 4, reps: 6 }] };
    expect(copiaSemana([s], '2026-11-02', '2026-11-09')[0].cargas).toEqual(s.cargas);
  });
});

describe('el 1RM vigente de cada ejercicio', () => {
  const m = (id: string, ejercicio: string, pesoKg: number, reps: number, fecha: string): MarcaRM => ({ id, ejercicio, pesoKg, reps, fecha, nota: null });

  it('es el de la marca más reciente, casando el nombre sin tildes ni mayúsculas', () => {
    const v = rmVigentes([
      m('1', 'Sentadilla', 100, 1, '2026-10-01'),
      m('2', 'sentadilla', 90, 5, '2026-11-01'),
      m('3', 'Press de banca', 70, 1, '2026-10-15'),
    ]);
    expect(v.get('sentadilla')?.rm).toBe(105);
    expect(v.get(claveEjercicio('PRÉSS  de banca'))?.rm).toBe(70);
  });

  it('nombres de ejercicio limpios', () => {
    expect(normalizaEjercicio('  dominada   LASTRADA ')).toBe('Dominada lastrada');
    expect(normalizaEjercicio('   ')).toBeNull();
  });
});

describe('guardas de las acciones del 1RM', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'fisica.ts'), 'utf-8');
  const cuerpo = (n: string) => {
    const i = src.indexOf(`export async function ${n}(`);
    expect(i, n).toBeGreaterThan(-1);
    const j = src.indexOf('\nexport async function ', i + 10);
    return src.slice(i, j < 0 ? undefined : j);
  };

  it('el preparador: admin y su academia', () => {
    for (const n of ['addRM', 'deleteRM']) {
      expect(cuerpo(n), n).toContain('requireAdmin()');
      expect(cuerpo(n), n).toMatch(/organization_id|esAlumnoDe/);
    }
  });

  it('el alumno: solo lo suyo, y solo borra lo que apuntó él', () => {
    expect(cuerpo('addMiRM')).toContain('requireUser()');
    expect(cuerpo('addMiRM')).toMatch(/user_id: auth\.user\.id, exercise:/);
    expect(cuerpo('deleteMiRM')).toMatch(/\.eq\('user_id', auth\.user\.id\)\.eq\('recorded_by', auth\.user\.id\)/);
  });
});
