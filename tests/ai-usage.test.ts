import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculaGasto, lineaDeGasto, registraGasto, PRECIO_FLASH } from '../app/lib/ai-usage';

/**
 * LOS TOPES CUENTAN LLAMADAS Y ESA NO ES LA UNIDAD QUE CUESTA.
 *
 * Una pregunta al chat sobre el tema 7 son 34.675 tokens de entrada; sobre el
 * tema mas corto, 1.419. Son 25x y las dos cuentan como "una". Sin medir
 * tokens no se pueden poner topes correctos ni saber si la cache compensa, y
 * `docs/PLAN-DE-TRABAJO.md` lo pedia desde el principio.
 */
describe('el gasto de una llamada', () => {
  it('calcula el coste con el precio de Google', () => {
    // 1M de entrada + 1M de salida = 0,30 + 2,50
    const g = calculaGasto({ promptTokenCount: 1_000_000, candidatesTokenCount: 1_000_000 });
    expect(g.coste).toBeCloseTo(2.8, 6);
  });

  it('una pregunta cara y una barata NO cuestan lo mismo', () => {
    // Es el numero que justifica todo esto.
    const cara = calculaGasto({ promptTokenCount: 34_675, candidatesTokenCount: 400 });
    const barata = calculaGasto({ promptTokenCount: 1_419, candidatesTokenCount: 400 });
    expect(cara.coste).toBeGreaterThan(barata.coste * 3);
  });

  it('un campo que falta cuenta CERO, nunca NaN', () => {
    // Un `undefined` propagandose convierte la suma entera en NaN, y entonces
    // el contador de gasto ensena "NaN" y ciega la vigilancia. Cero
    // infravalora una llamada; NaN ciega el contador entero.
    for (const uso of [null, undefined, {}, { promptTokenCount: null }, { candidatesTokenCount: NaN }]) {
      const g = calculaGasto(uso as never);
      expect(Number.isFinite(g.coste)).toBe(true);
      expect(Number.isFinite(g.entrada)).toBe(true);
      expect(g.coste).toBeGreaterThanOrEqual(0);
    }
  });

  it('un recuento negativo o absurdo no baja el coste', () => {
    // Los numeros vienen de fuera: un negativo restando gasto seria la forma
    // mas tonta de cegar un contador.
    const g = calculaGasto({ promptTokenCount: -5000, candidatesTokenCount: -1 });
    expect(g.entrada).toBe(0);
    expect(g.coste).toBe(0);
  });

  it('la linea del registro es filtrable y lleva el detalle que explica el coste', () => {
    const linea = lineaDeGasto({
      ruta: 'chat',
      userId: 'u-1',
      gasto: calculaGasto({ promptTokenCount: 100, candidatesTokenCount: 10 }),
      detalle: 'tema=7',
    });
    expect(linea).toMatch(/^\[gasto-ia\]/);
    expect(linea).toMatch(/ruta=chat/);
    expect(linea).toMatch(/entrada=100/);
    expect(linea).toMatch(/detalle=tema=7/);
  });

  it('registrar el gasto NUNCA lanza', () => {
    // Se llama DESPUES de una respuesta buena del modelo: un fallo aqui no
    // puede llevarse por delante una respuesta que el alumno ya tiene y que ya
    // se ha pagado.
    expect(() => registraGasto({ ruta: 'chat', userId: 'u', uso: undefined })).not.toThrow();
    expect(() => registraGasto({ ruta: 'chat', userId: 'u', uso: {} as never })).not.toThrow();
  });

  it('el precio lleva anotado cuando se comprobo', () => {
    // Un precio sin fecha es un precio que nadie sabe si sigue vigente.
    expect(PRECIO_FLASH.revisadoEl).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(PRECIO_FLASH.modelo).toBe('gemini-2.5-flash');
  });
});

describe('todas las llamadas de pago quedan registradas', () => {
  const leer = (r: string) =>
    readFileSync(join(__dirname, '..', r), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('no queda ningun `generateContent` sin su `registraGasto`', () => {
    // La guarda que importa: es facil anadir una llamada nueva y olvidarse del
    // contador, y entonces el gasto se va por un sitio que nadie mira.
    const sinRegistrar: string[] = [];
    for (const f of ['app/actions/chat.ts', 'app/actions/exams.ts', 'app/actions/flashcards.ts']) {
      const src = leer(f);
      const llamadas = (src.match(/\.generateContent\(/g) ?? []).length;
      const registros = (src.match(/registraGasto\(/g) ?? []).length;
      if (llamadas > registros) sinRegistrar.push(`${f}: ${llamadas} llamadas, ${registros} registradas`);
    }
    expect(sinRegistrar).toEqual([]);
  });

  it('el registro lleva el id de quien lo gasta', () => {
    // Un contador sin dueno solo sirve para el total, no para ver que un
    // alumno concreto se ha disparado — que es lo que hay que poder ver.
    const src = leer('app/actions/chat.ts');
    expect(src).toMatch(/registraGasto\(\{[\s\S]{0,200}userId:/);
  });
});
