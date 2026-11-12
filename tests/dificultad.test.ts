import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RUBRICA, promptDeTanda, leeNiveles, acuerdo, reparto, sirveParaClasificar, costeEstimado, CRITERIO_ACUERDO, type Nivel,
} from '../app/lib/dificultad';

const mapa = (pares: [string, Nivel | null][]) => new Map(pares);

describe('el prompt', () => {
  it('lleva la rúbrica de docs/DIFICULTAD.md: los tres niveles y la regla de los plazos', () => {
    const doc = readFileSync(join(__dirname, '..', 'docs', 'DIFICULTAD.md'), 'utf-8');
    expect(doc).toContain('Un plazo o una pena concretos son de nivel 3');
    expect(RUBRICA).toContain('Un plazo o una pena concretos son de nivel 3');
    for (const n of ['NIVEL 1', 'NIVEL 2', 'NIVEL 3']) expect(RUBRICA).toContain(n);
  });

  it('numera las preguntas y marca la correcta', () => {
    const p = promptDeTanda([
      { n: 1, tema: 'Derecho', pregunta: '¿Cuál?', opciones: ['x', 'y', 'z'], correcta: 2 },
      { n: 2, tema: 'Tráfico', pregunta: '¿Cuánto?', opciones: ['1', '2', '3'], correcta: 0 },
    ]);
    expect(p).toContain('[1] Tema: Derecho');
    expect(p).toContain('[2] Tema: Tráfico');
    expect(p).toMatch(/C\) z {2}← correcta/);
    expect(p).toMatch(/A\) 1 {2}← correcta/);
    expect(p).not.toMatch(/A\) x {2}← correcta/);
  });
});

describe('leeNiveles: lo que devuelve el modelo no vale hasta que se comprueba', () => {
  it('lee un nivel por pregunta pedida', () => {
    const { niveles, invalidas } = leeNiveles([{ n: 1, nivel: 3 }, { n: 2, nivel: 1 }], [1, 2]);
    expect(niveles.get(1)).toBe(3);
    expect(niveles.get(2)).toBe(1);
    expect(invalidas).toBe(0);
  });

  it('lo que falta queda null, no 2', () => {
    const { niveles, invalidas } = leeNiveles([{ n: 1, nivel: 3 }], [1, 2]);
    expect(niveles.get(2)).toBeNull();
    expect(invalidas).toBe(1);
  });

  it('un nivel fuera de 1-3, o que no es un entero, es null', () => {
    const { niveles } = leeNiveles([{ n: 1, nivel: 0 }, { n: 2, nivel: 4 }, { n: 3, nivel: 2.5 }, { n: 4, nivel: '3' }], [1, 2, 3, 4]);
    expect([...niveles.values()]).toEqual([null, null, null, null]);
  });

  it('un número que no se pidió se ignora', () => {
    const { niveles } = leeNiveles([{ n: 99, nivel: 3 }], [1]);
    expect(niveles.size).toBe(1);
    expect(niveles.get(1)).toBeNull();
  });

  it('dos respuestas para la misma pregunta: no se elige una al azar', () => {
    const { niveles } = leeNiveles([{ n: 1, nivel: 1 }, { n: 1, nivel: 3 }], [1]);
    expect(niveles.get(1)).toBeNull();
  });

  it('basura entera, todo null', () => {
    for (const raw of [null, undefined, 'hola', {}, 7]) {
      expect(leeNiveles(raw, [1, 2]).invalidas).toBe(2);
    }
  });
});

describe('acuerdo', () => {
  it('cuenta coincidencias, diferencias de uno y de dos niveles', () => {
    const ref = mapa([['a', 1], ['b', 2], ['c', 3], ['d', 1]]);
    const mod = mapa([['a', 1], ['b', 3], ['c', 1], ['d', 1]]);
    const r = acuerdo(ref, mod);
    expect(r).toMatchObject({ comparadas: 4, coinciden: 2, diferenUno: 1, diferenDos: 1, porcentajeExacto: 50 });
    expect(r.matriz[0][0]).toBe(2);
    expect(r.matriz[1][2]).toBe(1);
    expect(r.matriz[2][0]).toBe(1);
  });

  it('una pregunta sin nivel en cualquiera de los dos lados no entra', () => {
    const r = acuerdo(mapa([['a', 1], ['b', null], ['c', 2]]), mapa([['a', 1], ['b', 3], ['c', null], ['d', 2]]));
    expect(r.comparadas).toBe(1);
  });

  it('el sesgo dice hacia dónde se equivoca el modelo', () => {
    const ref = mapa([['a', 1], ['b', 1], ['c', 2], ['d', 2]]);
    expect(acuerdo(ref, mapa([['a', 2], ['b', 2], ['c', 3], ['d', 3]])).sesgo).toBe(1);
    expect(acuerdo(ref, mapa([['a', 1], ['b', 1], ['c', 1], ['d', 1]])).sesgo).toBe(-0.5);
  });

  it('sin pares no hay porcentaje: null, no 0 (regla 8)', () => {
    const r = acuerdo(mapa([]), mapa([]));
    expect(r.porcentajeExacto).toBeNull();
    expect(r.sesgo).toBeNull();
  });
});

describe('reparto', () => {
  it('cuenta cada nivel y no cuenta los null', () => {
    expect(reparto([1, 2, 2, 3, 3, 3, null, undefined])).toEqual({ 1: 1, 2: 2, 3: 3 });
  });
});

describe('sirveParaClasificar: el criterio está puesto antes de ver los datos', () => {
  const buenos = (n: number, ok: number): [Map<string, Nivel>, Map<string, Nivel>] => {
    const r = new Map<string, Nivel>(), m = new Map<string, Nivel>();
    for (let i = 0; i < n; i++) { r.set(String(i), 2); m.set(String(i), i < ok ? 2 : 3); }
    return [r, m];
  };

  it('pasa con buen acuerdo y poco sesgo', () => {
    const [r, m] = buenos(150, 105); // 70 % y 30 % a un nivel: sesgo 0,3 exacto, no más
    expect(sirveParaClasificar(acuerdo(r, m)).ok).toBe(true);
  });

  it('no pasa con poco acuerdo, y dice por qué', () => {
    const [r, m] = buenos(150, 60);
    const v = sirveParaClasificar(acuerdo(r, m));
    expect(v.ok).toBe(false);
    expect(v.motivos.join(' ')).toMatch(/coincidencia exacta/);
  });

  it('no pasa con una muestra pequeña aunque coincida todo', () => {
    const [r, m] = buenos(20, 20);
    expect(sirveParaClasificar(acuerdo(r, m)).motivos.join(' ')).toMatch(/solo 20 comparadas/);
  });

  it('un modelo que se equivoca de fácil a difícil no pasa aunque acierte mucho', () => {
    const r = new Map<string, Nivel>(), m = new Map<string, Nivel>();
    for (let i = 0; i < 100; i++) { r.set(`o${i}`, 2); m.set(`o${i}`, 2); }
    for (let i = 0; i < 10; i++) { r.set(`x${i}`, 1); m.set(`x${i}`, 3); }
    expect(sirveParaClasificar(acuerdo(r, m)).motivos.join(' ')).toMatch(/dos niveles/);
  });

  it('el criterio no se ha tocado', () => {
    expect(CRITERIO_ACUERDO).toEqual({ exactoMinimo: 60, dosNivelesMaximo: 5, sesgoMaximo: 0.3, comparadasMinimo: 100 });
  });
});

describe('costeEstimado', () => {
  it('4.617 preguntas cuestan céntimos, no euros', () => {
    const c = costeEstimado(4617, 10);
    expect(c.llamadas).toBe(462);
    expect(c.coste).toBeGreaterThan(0);
    expect(c.coste).toBeLessThan(1);
  });

  it('sin preguntas, cero llamadas', () => {
    expect(costeEstimado(0, 10)).toEqual({ llamadas: 0, coste: 0 });
  });
});

// ---------------------------------------------------------------------------
// El preparador corrige la dificultad desde «Banco oficial» (regla 121)
// ---------------------------------------------------------------------------

import { origenDeDificultad, DIFFICULTY_SOURCE } from '../app/lib/questions';

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const codigo = (rel: string) => sinComentarios(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

describe('de quién es la dificultad', () => {
  it('cada origen se explica con palabras, y sin origen es «sin clasificar», no «media»', () => {
    expect(origenDeDificultad(DIFFICULTY_SOURCE.estimada)).toMatch(/IA/);
    expect(origenDeDificultad(DIFFICULTY_SOURCE.preparador)).toMatch(/preparador/);
    expect(origenDeDificultad(DIFFICULTY_SOURCE.medida)).toMatch(/alumnos/);
    expect(origenDeDificultad(null)).toMatch(/Sin clasificar/);
    expect(origenDeDificultad(undefined)).toMatch(/Sin clasificar/);
  });
});

describe('editar la dificultad: lo que pone una persona manda y se anota', () => {
  const accion = codigo('app/actions/moderation.ts');
  const cuerpo = accion.slice(accion.indexOf('export async function updateQuestion'), accion.indexOf('ALTA MANUAL'));
  const panel = codigo('app/components/Admin/components/AdminBank.tsx');

  it('un nivel que no es 1, 2 o 3 rechaza la edición entera', () => {
    expect(cuerpo).toMatch(/!\[1, 2, 3\]\.includes\(Number\(crudo\)\)/);
    expect(cuerpo).toMatch(/La dificultad tiene que ser 1, 2 o 3/);
  });

  it('al cambiar el nivel se anota `preparador`, y sin cambiarlo no se toca el origen', () => {
    expect(cuerpo).toMatch(/cambiaNivel \? \{ difficulty_level: Number\(crudo\), difficulty_source: DIFFICULTY_SOURCE\.preparador \} : \{\}/);
  });

  it('sigue acotada a la academia del admin (regla 75)', () => {
    expect(cuerpo).toMatch(/auth\.user\.role !== 'superadmin'\) query = query\.eq\('organization_id', auth\.user\.organizationId\)/);
  });

  it('el panel solo manda el nivel si el preparador lo ha cambiado', () => {
    expect(panel).toMatch(/const nivelCambiado = editNivel !== editingQ\.difficulty_level/);
    expect(panel).toMatch(/nivelCambiado \? \{ \.\.\.editForm, difficulty_level: editNivel \} : editForm/);
  });

  it('un fallo al guardar se enseña, no se calla', () => {
    expect(panel).toMatch(/setErrorGuardar\(res\.error/);
  });

  it('una pregunta con origen vacío se enseña «Sin clasificar», no «Media»', () => {
    expect(panel).toMatch(/if \(!q\.difficulty_source\) return <Dato>Sin clasificar<\/Dato>/);
  });

  it('el listado se puede filtrar por nivel, y solo un 1, 2 o 3 filtra', () => {
    const admin = codigo('app/actions/admin.ts');
    expect(admin).toMatch(/dificultad === 1 \|\| dificultad === 2 \|\| dificultad === 3\) query = query\.eq\('difficulty_level', dificultad\)/);
  });
});
