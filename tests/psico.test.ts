import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generaSesion, corrigeSesion, notaPsico, normalizaRespuesta, aPublica, tiposValidos, azarDe,
  TIPOS_PSICO, OPCIONES_PSICO, VERSION_PSICO, opcionesDe, notaDeSesionGuardada, textoPenalizacion, EJERCICIOS_PSICO, aplicaOrdenes, leyendaDe, carasDelDesarrollo, agujerosAlAbrir, giraFigura, espejoFigura, totalDeCubos, DESARROLLOS, parentesco, NOMBRES_SIMBOLOS, SINONIMOS, ANTONIMOS, ABECEDARIO, girar, type PreguntaPsico, type TipoPsico,
} from '../app/lib/psico';

/** Regla 117 · psicotécnicos generados por código. */

const SEMILLAS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);
const deTipo = (tipo: TipoPsico, n = 400, version: number = VERSION_PSICO): PreguntaPsico[] => SEMILLAS.slice(0, n).flatMap((s) => generaSesion(s, [tipo], 3, version));
const clave = (q: PreguntaPsico) => q.opciones.map((o) => o.texto ?? JSON.stringify(o.celda ?? o.ficha ?? o.rejilla ?? o.fila ?? o.agujeros ?? o.figura));

describe('la semilla', () => {
  it('la misma semilla da siempre la misma sesión', () => {
    expect(generaSesion(12345, [...TIPOS_PSICO], 25)).toEqual(generaSesion(12345, [...TIPOS_PSICO], 25));
  });

  it('otra semilla da otra sesión', () => {
    expect(generaSesion(1, [...TIPOS_PSICO], 25)).not.toEqual(generaSesion(2, [...TIPOS_PSICO], 25));
  });

  it('el azar no sale de cero a uno', () => {
    const r = azarDe(99);
    for (let i = 0; i < 2000; i++) { const x = r(); expect(x >= 0 && x < 1).toBe(true); }
  });

  it('los tipos se reparten por igual', () => {
    const cuenta = new Map<string, number>();
    for (const q of generaSesion(7, [...TIPOS_PSICO], 3 * TIPOS_PSICO.length)) cuenta.set(q.tipo, (cuenta.get(q.tipo) ?? 0) + 1);
    expect([...cuenta.values()]).toEqual(TIPOS_PSICO.map(() => 3));
  });

  it('sin tipos válidos entran todos; los inventados se ignoran', () => {
    expect(tiposValidos(['series', 'inventado'])).toEqual(['series']);
    expect(tiposValidos([])).toEqual([...TIPOS_PSICO]);
    expect(tiposValidos('series')).toEqual([...TIPOS_PSICO]);
  });
});

describe('toda pregunta se puede contestar', () => {
  for (const tipo of TIPOS_PSICO) {
    it(`${tipo}: las opciones del examen (4, o 3 en los ejercicios 2 y 3), distintas y una sola correcta`, () => {
      const n = opcionesDe(tipo);
      expect(n).toBe(tipo === 'simbolos' || tipo === 'ordenes' ? 3 : 4);
      for (const q of deTipo(tipo)) {
        expect(q.opciones).toHaveLength(n);
        expect(new Set(clave(q)).size, `${q.enunciado} ${q.lineas?.join(' | ')} → ${clave(q).join(', ')}`).toBe(n);
        expect(q.correcta >= 0 && q.correcta < n).toBe(true);
        expect(q.explicacion.length).toBeGreaterThan(5);
        expect(q.enunciado).not.toMatch(/NaN|undefined|Infinity/);
        expect(clave(q).join(' ')).not.toMatch(/NaN|undefined|Infinity/);
      }
    });
  }

  it('series: la respuesta es un entero, y la serie no trae decimales', () => {
    for (const q of deTipo('series')) {
      expect(q.opciones[q.correcta].texto).toMatch(/^-?\d+$/);
      expect(q.lineas![0]).not.toMatch(/\d\.\d/);
    }
  });

  it('cálculo: todas las opciones son enteros', () => {
    for (const q of deTipo('calculo')) for (const o of q.opciones) expect(o.texto).toMatch(/^-?\d+$/);
  });

  it('cálculo: la cuenta del enunciado da la respuesta', () => {
    for (const q of deTipo('calculo')) {
      const m = /¿Cuánto es (\d+) × (\d+) ([+−]) (\d+)\?/.exec(q.enunciado);
      if (m) {
        const esperado = Number(m[1]) * Number(m[2]) + (m[3] === '+' ? 1 : -1) * Number(m[4]);
        expect(q.opciones[q.correcta].texto).toBe(String(esperado));
      }
      const p = /¿Cuánto es el (\d+) % de (\d+)\?/.exec(q.enunciado);
      if (p) expect(q.opciones[q.correcta].texto).toBe(String((Number(p[1]) * Number(p[2])) / 100));
      const par = /¿Cuánto es \((\d+) \+ (\d+)\) × (\d+)\?/.exec(q.enunciado);
      if (par) expect(q.opciones[q.correcta].texto).toBe(String((Number(par[1]) + Number(par[2])) * Number(par[3])));
    }
  });

  it('letras: la serie y las opciones son letras del abecedario español', () => {
    for (const q of deTipo('letras')) {
      for (const o of q.opciones) expect(ABECEDARIO).toContain(o.texto!);
      expect(q.lineas![0].replace(/[·? ]/g, '')).toMatch(new RegExp(`^[${ABECEDARIO}]+$`));
    }
  });

  it('atención: la respuesta es el número de parejas que de verdad son iguales', () => {
    for (const q of deTipo('atencion')) {
      const iguales = q.lineas!.filter((l) => { const [a, b] = l.trim().split(/\s+/); return a === b; }).length;
      const t = q.opciones[q.correcta].texto;
      expect(t === 'Ninguna' ? 0 : Number(t)).toBe(iguales);
      expect(q.lineas).toHaveLength(4);
      // Las que no son iguales difieren de verdad, y solo un poco.
      for (const l of q.lineas!) { const [a, b] = l.trim().split(/\s+/); expect(a.length).toBe(b.length); }
    }
  });

  it('figuras: falta solo la última casilla, y la correcta completa las tres reglas', () => {
    for (const q of deTipo('figuras', 200)) {
      expect(q.matriz).toHaveLength(9);
      expect(q.matriz!.filter((c) => c === null)).toHaveLength(1);
      expect(q.matriz![8]).toBeNull();
      const buena = q.opciones[q.correcta].celda!;
      // En cada fila y en cada columna, cada rasgo o se repite o no se repite nunca.
      const filas = [[0, 1, 2], [3, 4, 5], [6, 7, 8]], cols = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
      const m = q.matriz!.map((c) => c ?? buena);
      for (const linea of [...filas, ...cols]) {
        for (const rasgo of ['forma', 'n', 'relleno'] as const) {
          const distintos = new Set(linea.map((i) => m[i][rasgo])).size;
          expect(distintos === 1 || distintos === 3, `${rasgo} en ${linea}`).toBe(true);
        }
      }
      // Ninguna otra opción cumple lo mismo: la respuesta es única.
      q.opciones.forEach((o, k) => {
        if (k === q.correcta) return;
        const otra = q.matriz!.map((c) => c ?? o.celda!);
        const cumple = [...filas, ...cols].every((linea) => (['forma', 'n', 'relleno'] as const).every((rasgo) => {
          const d = new Set(linea.map((i) => otra[i][rasgo])).size;
          return d === 1 || d === 3;
        }));
        expect(cumple, 'un distractor también completa la tabla').toBe(false);
      });
    }
  });

  it('verbal: ninguna respuesta vale para dos preguntas', () => {
    for (const lista of [SINONIMOS, ANTONIMOS]) {
      const respuestas = lista.map((p) => p[1]);
      expect(new Set(respuestas).size).toBe(respuestas.length);
      const palabras = lista.map((p) => p[0]);
      expect(new Set(palabras).size).toBe(palabras.length);
      // Una palabra de la lista no puede salir de distractor de sí misma.
      for (const [palabra, respuesta] of lista) expect(palabra).not.toBe(respuesta);
    }
  });
});

describe('los tipos añadidos el 13 nov', () => {
  it('van al final de la lista: una sesión vieja se regenera igual', () => {
    expect(TIPOS_PSICO.slice(0, 6)).toEqual(['series', 'letras', 'calculo', 'verbal', 'atencion', 'figuras']);
    // La huella de 300 sesiones de los seis tipos de antes, calculada con el código de antes de añadir los nuevos.
    // Si esto falla, un generador antiguo ha cambiado: una sesión empezada antes del despliegue se corregiría
    // contra otras preguntas, y hay que subir `VERSION_PSICO` (regla 117).
    const huella = createHash('sha256')
      .update(JSON.stringify(Array.from({ length: 300 }, (_, i) => generaSesion(i * 7919 + 13, TIPOS_PSICO.slice(0, 6), 25, 1))))
      .digest('hex');
    expect(huella).toBe('3bdeaea1e7d7a4f452f1369fa22c9206440aad5f47769418b7565883bcbbf939');
  });

  it('dominós: la ficha buena sigue la regla de cada mitad, y ninguna mala es la misma ficha dada la vuelta', () => {
    for (const q of deTipo('dominos')) {
      const f = q.fichas!;
      expect(f).toHaveLength(5);
      expect(f[4]).toBeNull();
      const dado = f.slice(0, 4) as [number, number][];
      const paso = (k: 0 | 1) => (((dado[1][k] - dado[0][k]) % 7) + 7) % 7;
      for (let i = 1; i < 4; i++) for (const k of [0, 1] as const) expect((((dado[i][k] - dado[i - 1][k]) % 7) + 7) % 7).toBe(paso(k));
      const esperada = [(dado[3][0] + paso(0)) % 7, (dado[3][1] + paso(1)) % 7];
      expect(q.opciones[q.correcta].ficha).toEqual(esperada);
      const llaves = q.opciones.map((o) => [...o.ficha!].sort().join('-'));
      expect(new Set(llaves).size).toBe(q.opciones.length);
      for (const o of q.opciones) for (const n of o.ficha!) expect(n >= 0 && n <= 6 && Number.isInteger(n)).toBe(true);
    }
  });

  it('rotaciones: la correcta es el giro que dice el enunciado, y las 8 versiones de la figura son distintas', () => {
    for (const q of deTipo('rotaciones')) {
      const grados = Number(/gira (\d+)°/.exec(q.enunciado)![1]);
      const esperada = JSON.stringify(girar(q.rejilla!, grados));
      expect(JSON.stringify(q.opciones[q.correcta].rejilla)).toBe(esperada);
      expect(q.opciones.filter((o) => JSON.stringify(o.rejilla) === esperada)).toHaveLength(1);
      expect(q.rejilla!.flat().filter(Boolean)).toHaveLength(5);
      const todas = [0, 90, 180, 270].flatMap((d) => { const g = girar(q.rejilla!, d); return [JSON.stringify(g), JSON.stringify(g.map((f) => [...f].reverse()))]; });
      expect(new Set(todas).size).toBe(8);
    }
  });

  it('girar: cuatro giros de 90° devuelven la figura, y 180° son dos de 90°', () => {
    const g = [[true, false, false], [true, true, false], [false, true, true]];
    expect(girar(girar(girar(girar(g, 90), 90), 90), 90)).toEqual(g);
    expect(girar(g, 180)).toEqual(girar(girar(g, 90), 90));
    expect(girar(g, 90)[0][2]).toBe(g[0][0]); // la esquina de arriba a la izquierda pasa a arriba a la derecha
  });

  it('tablas: números enteros y la cuenta de la explicación da la respuesta', () => {
    for (const q of deTipo('tablas')) {
      expect(q.tabla!.filas).toHaveLength(4);
      for (const fila of q.tabla!.filas) for (const c of fila.slice(1)) expect(Number.isInteger(Number(c))).toBe(true);
      const resultado = Number(/= (\d+)\.$/.exec(q.explicacion)![1]);
      expect(q.opciones[q.correcta].texto).toBe(String(resultado));
    }
  });

  it('tablas: la suma de una columna sale de la tabla que se enseña', () => {
    let vistas = 0;
    for (const q of deTipo('tablas')) {
      const m = /Suma de (\w+): (.+) = (\d+)\./.exec(q.explicacion);
      if (!m || !/hubo entre los cuatro meses/.test(q.enunciado)) continue;
      const k = q.tabla!.cabecera.findIndex((c) => c.toLowerCase() === m[1]);
      expect(k).toBeGreaterThan(0);
      expect(q.tabla!.filas.map((f) => f[k]).join(' + ')).toBe(m[2]);
      vistas++;
    }
    expect(vistas).toBeGreaterThan(20);
  });

  it('tablas: la media sale entera de la tabla', () => {
    let vistas = 0;
    for (const q of deTipo('tablas')) {
      if (!/media mensual/.test(q.enunciado)) continue;
      const col = q.tabla!.cabecera.findIndex((c) => q.enunciado.toLowerCase().includes(c.toLowerCase()));
      const suma = q.tabla!.filas.reduce((a, f) => a + Number(f[col]), 0);
      expect(suma % 4).toBe(0);
      expect(q.opciones[q.correcta].texto).toBe(String(suma / 4));
      vistas++;
    }
    expect(vistas).toBeGreaterThan(20);
  });

  it('lo que viaja al navegador lleva la figura y la tabla, pero no la respuesta', () => {
    for (const tipo of ['dominos', 'rotaciones', 'tablas'] as const) {
      const q = generaSesion(5, [tipo], 1)[0];
      const p = aPublica(q) as Record<string, unknown>;
      expect(p.fichas ?? p.rejilla ?? p.tabla).toBeDefined();
      expect(p.correcta).toBeUndefined();
      expect(p.explicacion).toBeUndefined();
    }
  });
});

describe('los ejercicios del examen real (13 nov)', () => {
  const nums = (t: string) => (t.match(/-?\d+/g) ?? []).map(Number);

  it('v1 sigue con 5 opciones y v2 con 4 (o 3)', () => {
    for (const tipo of ['series', 'calculo', 'figuras'] as const) {
      expect(deTipo(tipo, 30, 1).every((q) => q.opciones.length === 5)).toBe(true);
      expect(deTipo(tipo, 30, 2).every((q) => q.opciones.length === 4)).toBe(true);
    }
    expect(deTipo('ordenes', 30, 2).every((q) => q.opciones.length === 3)).toBe(true);
    expect(deTipo('simbolos', 30, 2).every((q) => q.opciones.length === 3)).toBe(true);
  });

  it('los tres ejercicios tienen las preguntas y los minutos del examen', () => {
    expect(EJERCICIOS_PSICO[1]).toMatchObject({ total: 40, minutos: 23 });
    expect(EJERCICIOS_PSICO[2]).toMatchObject({ total: 34, minutos: 18, tipos: ['simbolos'] });
    expect(EJERCICIOS_PSICO[3]).toMatchObject({ total: 30, minutos: 18, tipos: ['ordenes'] });
    expect(EJERCICIOS_PSICO[1].tipos).not.toContain('atencion');
    for (const e of [1, 2, 3] as const) {
      const sesion = generaSesion(11, [...EJERCICIOS_PSICO[e].tipos], EJERCICIOS_PSICO[e].total);
      expect(sesion).toHaveLength(EJERCICIOS_PSICO[e].total);
    }
  });

  it('conteo: la respuesta es la cuenta de verdad', () => {
    let vistas = 0;
    for (const q of deTipo('conteo')) {
      let m = /del (\d+) al (\d+), ambos incluidos, sin contar los que acaban en ([\d, y]+)\?/.exec(q.enunciado);
      let cuenta: number | null = null;
      if (m) {
        const finales = nums(m[3]);
        cuenta = 0; for (let n = +m[1]; n <= +m[2]; n++) if (!finales.includes(n % 10)) cuenta++;
      } else if ((m = /divisibles por (\d+) hay entre el (\d+) y el (\d+), ambos exclusive/.exec(q.enunciado))) {
        cuenta = 0; for (let n = +m[2] + 1; n < +m[3]; n++) if (n % +m[1] === 0) cuenta++;
      } else if ((m = /del (\d+) al (\d+), ambos inclusive, sin contar los números (pares|impares) de 2 cifras/.exec(q.enunciado))) {
        cuenta = 0; for (let n = +m[1]; n <= +m[2]; n++) if (!(n >= 10 && n <= 99 && (m[3] === 'pares' ? n % 2 === 0 : n % 2 === 1))) cuenta++;
      }
      expect(cuenta, q.enunciado).not.toBeNull();
      expect(Number(q.opciones[q.correcta].texto), q.enunciado).toBe(cuenta);
      vistas++;
    }
    expect(vistas).toBe(1200);
  });

  it('dobles: son dos series aritméticas entrelazadas y la correcta continúa la de los lugares impares', () => {
    for (const q of deTipo('dobles')) {
      const t = nums(q.lineas![0]);
      expect(t).toHaveLength(8);
      const imp = [t[0], t[2], t[4], t[6]], par = [t[1], t[3], t[5], t[7]];
      const dif = (x: number[]) => new Set([x[1] - x[0], x[2] - x[1], x[3] - x[2]]);
      expect(dif(imp).size).toBe(1); expect(dif(par).size).toBe(1);
      expect(Number(q.opciones[q.correcta].texto)).toBe(imp[3] + (imp[1] - imp[0]));
      expect(t.every((n) => n >= 0)).toBe(true);
    }
  });

  it('problemas: números enteros, y la cuenta de la explicación da la respuesta', () => {
    for (const q of deTipo('problemas')) {
      const m = /= (\d+)\.$/.exec(q.explicacion) ?? /= (\d+)\.?$/.exec(q.explicacion);
      expect(m, q.explicacion).not.toBeNull();
      expect(parseInt(q.opciones[q.correcta].texto!, 10), q.enunciado).toBe(Number(m![1]));
      expect(q.opciones.every((o) => /^\d+( €| horas| minutos| años)?$/.test(o.texto!))).toBe(true);
    }
  });

  it('problemas: el del aceite (media del precio) se comprueba contra el enunciado', () => {
    let vistas = 0;
    for (const q of deTipo('problemas')) {
      const m = /^Compro (\d+) litros a (\d+) € el litro, otros (\d+) litros a (\d+) € el litro y otros (\d+) litros a (\d+) € el litro\./.exec(q.enunciado);
      if (!m) continue;
      const [l1, p1, l2, p2, l3, p3] = m.slice(1).map(Number);
      const media = (l1 * p1 + l2 * p2 + l3 * p3) / (l1 + l2 + l3);
      expect(Number.isInteger(media)).toBe(true);
      expect(parseInt(q.opciones[q.correcta].texto!, 10)).toBe(media);
      vistas++;
    }
    expect(vistas).toBeGreaterThan(20);
  });

  it('problemas: el de la cuenta del bar y el del precio X salen bien', () => {
    let bar = 0, equis = 0;
    for (const q of deTipo('problemas')) {
      let m = /^(\d+) amigos toman algo en un bar y la cuenta es de (\d+) €\. (Uno|Dos) de ellos/.exec(q.enunciado);
      if (m) {
        const n = +m[1], cuenta = +m[2], fuera = m[3] === 'Uno' ? 1 : 2;
        expect(cuenta % n).toBe(0); expect(cuenta % (n - fuera)).toBe(0);
        const cada = cuenta / (n - fuera);
        const pide = /cuánto más/i.test(q.enunciado) ? cada - cuenta / n : cada;
        expect(parseInt(q.opciones[q.correcta].texto!, 10)).toBe(pide);
        bar++;
      }
      m = /^Compro (\d+) litros de aceite a (\d+) € el litro y otros (\d+) litros a (\d+) € el litro\. Después compro (\d+) litros más, a X € el litro, y el precio medio de todo el aceite sale a (\d+) €/.exec(q.enunciado);
      if (m) {
        const [l1, p1, l2, p2, l3, media] = m.slice(1).map(Number);
        const x = (media * (l1 + l2 + l3) - l1 * p1 - l2 * p2) / l3;
        expect(Number.isInteger(x) && x > 0).toBe(true);
        expect(parseInt(q.opciones[q.correcta].texto!, 10)).toBe(x);
        equis++;
      }
    }
    expect(bar).toBeGreaterThan(20); expect(equis).toBeGreaterThan(20);
  });

  it('abecedario: las cuatro variantes dan la respuesta que dicen', () => {
    const ABC = 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
    const visto = [0, 0, 0, 0];
    for (const q of deTipo('abecedario')) {
      const r = q.opciones[q.correcta].texto!;
      let m = /^Eliminando del abecedario las letras que forman la palabra (\w+), ¿qué letra ocupa el lugar (\d+)\?/.exec(q.enunciado);
      if (m) { const quedan = [...ABC].filter((l) => !m![1].includes(l)); expect(r).toBe(quedan[+m[2] - 1]); visto[0]++; continue; }
      m = /posición de la (\S) por la de la (\S) y dividir el resultado entre la posición de la (\S)\?/.exec(q.enunciado);
      if (m) { const p = (l: string) => ABC.indexOf(l) + 1; const v = (p(m[1]) * p(m[2])) / p(m[3]); expect(Number.isInteger(v)).toBe(true); expect(Number(r)).toBe(v); visto[1]++; continue; }
      m = /^Ordena alfabéticamente estas palabras: (.+)\. ¿Qué letra ocupa el lugar (\d+) de la (\w+) palabra\?/.exec(q.enunciado);
      if (m) {
        const orden = m[1].split(', ').sort((a, b) => a.localeCompare(b, 'es'));
        const j = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta'].indexOf(m[3]);
        const letra = orden[j].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()[+m[2] - 1];
        expect(r).toBe(letra); visto[2]++; continue;
      }
      m = /cada letra vale su posición en el abecedario (más|menos) (\d+) .+ ¿Cuánto vale \((\S) − (\S)\) × (\S)\?/.exec(q.enunciado);
      if (m) {
        const k = (m[1] === 'más' ? 1 : -1) * +m[2]; const val = (l: string) => ABC.indexOf(l) + 1 + k;
        expect(Number(r)).toBe((val(m[3]) - val(m[4])) * val(m[5])); visto[3]++; continue;
      }
      throw new Error(`sin reconocer: ${q.enunciado}`);
    }
    for (const v of visto) expect(v).toBeGreaterThan(100);
  });

  it('lógica: la estatura se deduce de las frases y los silogismos se comprueban con todos los mundos posibles', async () => {
    const { TRIPLES } = await import('../app/lib/psico-nuevos');
    let est = 0, sil = 0;
    for (const q of deTipo('logica')) {
      const correcta = q.opciones[q.correcta].texto!;
      if (/más alto|menos alto/.test(q.enunciado)) {
        const frases = q.enunciado.split('. ').slice(0, 3);
        const mayor: [string, string][] = frases.map((f) => { const a = /^(\w+) es más alto que (\w+)/.exec(f); const b = /^(\w+) es menos alto que (\w+)/.exec(f); return a ? [a[1], a[2]] : [b![2], b![1]]; });
        const gente = [...new Set(mayor.flat())];
        const alto = gente.find((g) => mayor.every(([, menor]) => menor !== g))!;
        const bajo = gente.find((g) => mayor.every(([m]) => m !== g))!;
        const segundo = mayor.find(([m]) => m === alto)![1];
        const quien = /el más alto/.test(q.enunciado) ? alto : /el más bajo/.test(q.enunciado) ? bajo : segundo;
        expect(correcta).toBe(quien); est++;
        continue;
      }
      // Silogismo: se enumeran los mundos de 3 conjuntos sobre 4 individuos.
      const nombres = new Map<string, number>();
      for (const [a, b, c] of TRIPLES) for (const [i, [pl, sg]] of [a, b, c].entries()) { void i; nombres.set(pl, 0); nombres.set(sg, 0); }
      const tripleDe = (txt: string) => TRIPLES.find((t) => t.some(([pl, sg]) => new RegExp(`\\b(${pl}|${sg})\\b`).test(txt)))!;
      const t = tripleDe(q.enunciado);
      const id = (palabra: string) => t.findIndex(([pl, sg]) => palabra === pl || palabra === sg);
      type Fr = { k: 'todos' | 'ninguno' | 'algunos' | 'algunos-no'; a: number; b: number };
      const lee = (f: string): Fr => {
        let m = /^Todos los (\S+) son (\S+?)\.?$/.exec(f); if (m) return { k: 'todos', a: id(m[1]), b: id(m[2]) };
        m = /^Ningún (\S+) es (\S+?)\.?$/.exec(f); if (m) return { k: 'ninguno', a: id(m[1]), b: id(m[2]) };
        m = /^Algunos (\S+) no son (\S+?)\.?$/.exec(f); if (m) return { k: 'algunos-no', a: id(m[1]), b: id(m[2]) };
        m = /^Algunos (\S+) son (\S+?)\.?$/.exec(f); if (m) return { k: 'algunos', a: id(m[1]), b: id(m[2]) };
        throw new Error(f);
      };
      const premisas = q.enunciado.split('afirmaciones? ')[1].split(/(?<=\.) /).map(lee);
      const verdad = (f: Fr, w: number[][]) => {
        const A = w[f.a], B = w[f.b];
        if (f.k === 'todos') return A.every((x) => B.includes(x));
        if (f.k === 'ninguno') return A.every((x) => !B.includes(x));
        if (f.k === 'algunos') return A.some((x) => B.includes(x));
        return A.some((x) => !B.includes(x));
      };
      const mundos: number[][][] = [];
      for (let a = 0; a < 16; a++) for (let b = 0; b < 16; b++) for (let c = 0; c < 16; c++) {
        const sub = (m: number) => [0, 1, 2, 3].filter((i) => m & (1 << i));
        mundos.push([sub(a), sub(b), sub(c)]);
      }
      const posibles = mundos.filter((w) => premisas.every((p) => verdad(p, w)));
      expect(posibles.length).toBeGreaterThan(0);
      q.opciones.forEach((o, i) => {
        const vale = posibles.every((w) => verdad(lee(o.texto!), w));
        expect(vale, `${o.texto} (${q.enunciado})`).toBe(i === q.correcta);
      });
      sil++;
    }
    expect(est).toBeGreaterThan(50); expect(sil).toBeGreaterThan(50);
  });

  it('cuadros: la X sale de la regla que cumplen las otras filas', () => {
    const reglas: ((a: number, b: number) => number)[] = [(a, b) => a + b, (a, b) => a - b, (a, b) => a * b, (a, b) => 2 * a + b];
    for (const q of deTipo('cuadros')) {
      const f = q.tabla!.filas;
      expect(f).toHaveLength(3);
      const num = (x: string) => Number(x);
      const consistentes = reglas.filter((g) => [0, 1].every((i) => g(num(f[i][0]), num(f[i][1])) === num(f[i][2])));
      expect(consistentes.length).toBeGreaterThanOrEqual(1);
      const k = f[2].indexOf('X');
      const respuestas = consistentes.map((g) => {
        if (k === 2) return g(num(f[2][0]), num(f[2][1]));
        for (let x = 0; x < 400; x++) { const fila = f[2].map((c, i) => (i === k ? x : num(c))); if (g(fila[0], fila[1]) === fila[2]) return x; }
        return -1;
      });
      expect(respuestas).toContain(Number(q.opciones[q.correcta].texto));
    }
  });

  it('cifrado: la palabra nueva es un anagrama de la dada y se escribe con los mismos símbolos', () => {
    for (const q of deTipo('cifrado')) {
      const m = /^(\w+) se escribe así: (.+)\. ¿Cómo se escribe (\w+)\?$/.exec(q.enunciado)!;
      const [, w1, g1, w2] = m;
      expect([...w1].sort().join('')).toBe([...w2].sort().join(''));
      expect(w2).not.toBe(w1);
      const glifos = g1.split(' ');
      expect(glifos).toHaveLength(w1.length);
      const mapa = new Map<string, string>();
      [...w1].forEach((l, i) => { if (mapa.has(l)) expect(mapa.get(l)).toBe(glifos[i]); mapa.set(l, glifos[i]); });
      expect(new Set(mapa.values()).size).toBe(mapa.size); // letra distinta, símbolo distinto
      expect(q.opciones[q.correcta].texto).toBe([...w2].map((l) => mapa.get(l)).join(' '));
    }
  });

  it('órdenes: aplicar las órdenes en cadena a la frase da la opción correcta, y la tabla es la de las 8 órdenes', () => {
    for (const q of deTipo('ordenes')) {
      const claves = /órdenes ([A-H](?:-[A-H])+),/.exec(q.enunciado)![1].split('-');
      const frase = /«(.+)»/.exec(q.lineas![0])![1];
      const res = aplicaOrdenes(frase, claves)!;
      expect(res).not.toBeNull();
      expect(q.opciones[q.correcta].texto).toBe(res.final);
      expect(res.final).not.toBe(frase);
      expect(q.tabla!.filas.map((f) => f[0])).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    }
  });

  it('órdenes: cada orden hace lo que dice', () => {
    const f = 'uno dos tres cuatro cinco seis siete';
    expect(aplicaOrdenes(f, ['A'])!.final).toBe('dos tres cuatro cinco seis siete uno');
    expect(aplicaOrdenes(f, ['B'])!.final).toBe('siete dos tres cuatro cinco seis uno');
    expect(aplicaOrdenes(f, ['C'])!.final).toBe('uno dos seis cuatro cinco tres siete');
    expect(aplicaOrdenes(f, ['D'])!.final).toBe('cinco dos tres cuatro uno seis siete');
    expect(aplicaOrdenes(f, ['E'])!.final).toBe('uno dos tres cinco seis siete');
    expect(aplicaOrdenes(f, ['F'])!.final).toBe('uno dos tres cuatro cinco seis siete cuatro');
    expect(aplicaOrdenes(f, ['G'])!.final).toBe('uno doss tress cuatro cinco seiss siete');
    expect(aplicaOrdenes(f, ['H'])!.final).toBe('dos tres cuatro cinco seis siete');
    expect(aplicaOrdenes('a b c', ['C'])).toBeNull(); // faltan palabras: no se inventa nada
  });

  it('símbolos: 20 nombres y 20 símbolos distintos, la misma tabla en toda la sesión y una sola fila ordenada', () => {
    const l = leyendaDe(99);
    expect(l).toHaveLength(20);
    expect(new Set(l.map((x) => x.nombre)).size).toBe(20);
    expect(new Set(l.map((x) => x.simbolo)).size).toBe(20);
    expect(l.map((x) => x.simbolo).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(NOMBRES_SIMBOLOS).toHaveLength(20);
    expect(leyendaDe(99)).toEqual(l);
    expect(leyendaDe(100)).not.toEqual(l);
    const sesion = generaSesion(99, ['simbolos'], 34);
    for (const q of sesion) {
      expect(q.leyenda).toEqual(l);
      const nombreDe = new Map(l.map((x) => [x.simbolo, x.nombre]));
      const ordenada = (f: number[]) => { const n = f.map((x) => nombreDe.get(x)!); return n.every((x, i) => i === 0 || x.localeCompare(n[i - 1], 'es') > 0); };
      const buenas = q.opciones.map((o) => ordenada(o.fila!));
      expect(buenas.filter(Boolean)).toHaveLength(1);
      expect(buenas.indexOf(true)).toBe(q.correcta);
      for (const o of q.opciones) { expect(new Set(o.fila).size).toBe(o.fila!.length); expect(o.fila!.length).toBeGreaterThanOrEqual(3); }
    }
  });

  it('símbolos: sacar la tabla no gasta números del azar de la sesión (las demás preguntas no cambian)', () => {
    const solo = generaSesion(5, ['series'], 10);
    expect(solo).toEqual(generaSesion(5, ['series'], 10));
  });

  it('la nota usa las opciones de cada pregunta: con 3 opciones un fallo vale medio acierto', () => {
    const preguntas = generaSesion(3, ['ordenes'], 4);
    const mal = preguntas.map((q) => (q.correcta + 1) % 3);
    const r = corrigeSesion(preguntas, [preguntas[0].correcta, preguntas[1].correcta, mal[2], mal[3]]);
    expect(r.aciertos).toBe(2); expect(r.fallos).toBe(2);
    expect(r.nota).toBe(notaPsico(2, 2, 4, 3));
    expect(notaPsico(2, 2, 4, 3)).toBe(2.5);
    expect(notaPsico(2, 2, 4, 5)).toBe(3.75);
    expect(r.porTipo.ordenes).toEqual({ a: 2, t: 4, f: 2 });
  });

  it('una respuesta de una opción que la pregunta no tiene es un blanco', () => {
    const preguntas = generaSesion(3, ['ordenes'], 3);
    const r = corrigeSesion(preguntas, [3, 4, 9]);
    expect(r.blancos).toBe(3); expect(r.fallos).toBe(0);
  });

  it('la nota de una sesión guardada: la v1 con 5 opciones como siempre, la v2 con las de cada tipo', () => {
    expect(notaDeSesionGuardada({ version: 1, total: 20, aciertos: 10, fallos: 4, porTipo: { series: { a: 10, t: 20 } } })).toBe(4.5);
    expect(notaDeSesionGuardada({ version: 2, total: 4, aciertos: 2, fallos: 2, porTipo: { ordenes: { a: 2, t: 4, f: 2 } } })).toBe(2.5);
    expect(notaDeSesionGuardada({ version: 2, total: 6, aciertos: 3, fallos: 3, porTipo: { series: { a: 3, t: 3, f: 0 }, ordenes: { a: 0, t: 3, f: 3 } } })).toBe(2.5);
    // Sin los fallos por tipo (una sesión antigua) no se inventa nada: se usa la fórmula de siempre.
    expect(notaDeSesionGuardada({ version: 2, total: 20, aciertos: 10, fallos: 4, porTipo: { series: { a: 10, t: 20 } } })).toBe(4.5);
  });

  it('el texto de la penalización dice lo que es', () => {
    expect(textoPenalizacion([4, 4])).toBe('Cada 3 fallos quitan un acierto; los blancos no restan.');
    expect(textoPenalizacion([3])).toBe('Cada 2 fallos quitan un acierto; los blancos no restan.');
    expect(textoPenalizacion([4, 3])).toContain('según las opciones');
  });
});

describe('los tipos visuales y los parentescos (13 nov)', () => {
  it('cubos: las columnas bajan hacia el observador (se ven todas) y la respuesta es la suma que dice el enunciado', () => {
    for (const q of deTipo('cubos')) {
      const n = q.cubos!.map(totalDeCubos);
      for (const f of q.cubos!) for (let y = 0; y < f.length; y++) for (let x = 0; x < f[0].length; x++) {
        if (y > 0) expect(f[y][x]).toBeLessThanOrEqual(f[y - 1][x]);
        if (x > 0) expect(f[y][x]).toBeLessThanOrEqual(f[y][x - 1]);
        expect(f[y][x] >= 0 && f[y][x] <= 4).toBe(true);
      }
      const esperado = /A \+ B − C/.test(q.enunciado) ? n[0] + n[1] - n[2] : /A \+ B/.test(q.enunciado) ? n[0] + n[1] : n[0];
      expect(Number(q.opciones[q.correcta].texto), q.enunciado).toBe(esperado);
      expect(q.cubos!.length).toBe(/A \+ B − C/.test(q.enunciado) ? 3 : /A \+ B/.test(q.enunciado) ? 2 : 1);
      expect(esperado).toBeGreaterThan(0);
    }
  });

  it('desarrollos: todos los desarrollos se pliegan en un cubo, y lo comprobamos sin rodar nada', () => {
    expect(DESARROLLOS.length).toBe(18);
    for (const red of DESARROLLOS) {
      const cara = carasDelDesarrollo(red)!;
      expect(cara, JSON.stringify(red)).not.toBeNull();
      expect(new Set(cara).size).toBe(6);
      const op = (i: number, j: number) => Math.floor(cara[i] / 2) === Math.floor(cara[j] / 2);
      // En los desarrollos 1-4-1 (la fila de cuatro con una casilla encima y otra debajo) las opuestas se leen a ojo:
      const fila = red.slice(0, 4);
      if (red.slice(0, 4).every(([, y]) => y === 1) && red.length === 6 && fila.map(([x]) => x).join() === '0,1,2,3') {
        expect(op(0, 2)).toBe(true); expect(op(1, 3)).toBe(true);
        expect(op(4, 5)).toBe(true); // la de encima y la de debajo son las tapas
        expect(op(0, 1)).toBe(false);
      }
    }
    // Lo que no es un desarrollo de cubo no se pliega: un bloque de 2×3, o una cruz con dos casillas en el mismo sitio.
    expect(carasDelDesarrollo([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]])).toBeNull();
    expect(carasDelDesarrollo([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]])).toBeNull();
  });

  it('desarrollos: lo que se pregunta (la opuesta, o el grupo imposible) sale de las caras opuestas del cubo', () => {
    const cara = (q: PreguntaPsico) => {
      const red = q.desarrollo!.map((c) => [c.x, c.y] as [number, number]);
      const etiquetas = carasDelDesarrollo(red)!;
      const simboloDe = new Map<string, number>(q.desarrollo!.map((c, i) => [c.s, etiquetas[i]]));
      expect(simboloDe.size).toBe(6);
      return simboloDe;
    };
    let uno = 0, dos = 0;
    for (const q of deTipo('desarrollos')) {
      const m = cara(q);
      const opuestas = (a: string, b: string) => Math.floor(m.get(a)! / 2) === Math.floor(m.get(b)! / 2) && a !== b;
      const d = /opuesta a la (\S+)\?/.exec(q.enunciado);
      if (d) {
        const buena = q.opciones[q.correcta].texto!;
        expect(opuestas(d[1], buena)).toBe(true);
        expect(q.opciones.filter((o) => opuestas(d[1], o.texto!))).toHaveLength(1);
        uno++;
      } else {
        const tiene = (t: string) => { const c = t.split('   '); return c.some((a, i) => c.some((b, k) => i < k && opuestas(a, b))); };
        q.opciones.forEach((o, i) => expect(tiene(o.texto!), q.enunciado).toBe(i === q.correcta));
        dos++;
      }
    }
    expect(uno).toBeGreaterThan(100); expect(dos).toBeGreaterThan(100);
  });

  it('plegados: el papel abierto coincide con apilar las capas de verdad', () => {
    const pliegaCapas = (n: number, pliegues: string[], hx: number, hy: number) => {
      // Cada casilla del papel doblado guarda las casillas originales apiladas en ella.
      let capas: [number, number][][][] = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => [[x, y] as [number, number]]));
      for (const p of pliegues) {
        const h = capas.length, w = capas[0].length;
        if (p.startsWith('izquierda') || p.startsWith('derecha')) {
          const medio = w / 2;
          const izq = capas.map((f) => f.slice(0, medio)), der = capas.map((f) => f.slice(medio));
          const mover = p.startsWith('izquierda') ? izq : der, quieto = p.startsWith('izquierda') ? der : izq;
          capas = quieto.map((f, y) => f.map((c, x) => [...c, ...mover[y][medio - 1 - x]]));
        } else {
          const medio = h / 2;
          const arr = capas.slice(0, medio), aba = capas.slice(medio);
          const mover = p.startsWith('arriba') ? arr : aba, quieto = p.startsWith('arriba') ? aba : arr;
          capas = quieto.map((f, y) => f.map((c, x) => [...c, ...mover[medio - 1 - y][x]]));
        }
      }
      const grid = Array.from({ length: n }, () => Array(n).fill(false));
      for (const [x, y] of capas[hy][hx]) grid[y][x] = true;
      return grid;
    };
    for (const hxy of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const p1 of ['izquierda-sobre-derecha', 'derecha-sobre-izquierda'] as const) for (const p2 of ['arriba-sobre-abajo', 'abajo-sobre-arriba'] as const) {
      expect(agujerosAlAbrir(4, [p1, p2], hxy[0], hxy[1])).toEqual(pliegaCapas(4, [p1, p2], hxy[0], hxy[1]));
      expect(agujerosAlAbrir(4, [p2, p1], hxy[0], hxy[1])).toEqual(pliegaCapas(4, [p2, p1], hxy[0], hxy[1]));
    }
  });

  it('plegados: la pregunta describe los pliegues y la buena es la del papel abierto, con 4 agujeros', () => {
    const lados: Record<string, string> = {
      'se dobla la mitad izquierda sobre la derecha': 'izquierda-sobre-derecha', 'se dobla la mitad derecha sobre la izquierda': 'derecha-sobre-izquierda',
      'se dobla la mitad de arriba sobre la de abajo': 'arriba-sobre-abajo', 'se dobla la mitad de abajo sobre la de arriba': 'abajo-sobre-arriba',
    };
    for (const q of deTipo('plegados')) {
      const m = /Un papel cuadrado (.+) y, después, (.+)\. Se hace un agujero en la casilla de (arriba|abajo) a la (izquierda|derecha)/.exec(q.enunciado)!;
      const pliegues = [lados[m[1]], lados[m[2]]] as never;
      const esperado = agujerosAlAbrir(4, pliegues, m[4] === 'izquierda' ? 0 : 1, m[3] === 'arriba' ? 0 : 1);
      expect(q.opciones[q.correcta].agujeros).toEqual(esperado);
      expect(new Set(q.opciones.map((o) => JSON.stringify(o.agujeros))).size).toBe(q.opciones.length);
      for (const o of q.opciones) expect(o.agujeros!.flat().filter(Boolean)).toHaveLength(4);
    }
  });

  it('giros: girar cuatro veces devuelve la figura y el espejo se deshace al repetirlo', () => {
    const f = [{ forma: 'flecha', giro: 1 }, { forma: 'cruz', giro: 0 }, { forma: 'triangulo', giro: 3 }, { forma: 'cuadrado', giro: 0 }] as never;
    expect(giraFigura(giraFigura(giraFigura(giraFigura(f, 1), 1), 1), 1)).toEqual(f);
    expect(espejoFigura(espejoFigura(f))).toEqual(f);
    expect(giraFigura(f, 2)).toEqual(giraFigura(giraFigura(f, 1), 1));
    // la flecha de arriba, al girar 90° a la derecha, pasa al hueco de la derecha y apunta a la derecha
    const g = giraFigura(f, 1) as { forma: string; giro: number }[];
    expect(g[1]).toEqual({ forma: 'flecha', giro: 2 });
  });

  it('giros: la correcta es el giro del enunciado y las demás, otra cosa', () => {
    for (const q of deTipo('giros')) {
      const grados = Number(/figura (\d+)° a la derecha/.exec(q.enunciado)![1]);
      const llave = (f: unknown) => JSON.stringify(f);
      expect(llave(q.opciones[q.correcta].figura)).toBe(llave(giraFigura(q.figura!, grados / 90)));
      expect(q.opciones.filter((o) => llave(o.figura) === llave(giraFigura(q.figura!, grados / 90)))).toHaveLength(1);
      expect(q.figura!.filter((e) => e.forma === 'flecha' || e.forma === 'triangulo').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('parentescos: un árbol conocido da los parentescos de siempre', () => {
    const P = (nombre: string, mujer: boolean) => ({ nombre, mujer });
    const abuelo = P('Antonio', false), abuela = P('Pilar', true), c1 = P('Luis', false), c2 = P('Ana', true), p1 = P('Rosa', true), p2 = P('Pablo', false), k1 = P('Marta', true), k2 = P('Javier', false);
    const f = { abuelo, abuela, hijos: [c1, c2], pareja: [p1, p2], nietos: [k1, k2] } as never;
    expect(parentesco(f, k1, k2)).toBe('prima');
    expect(parentesco(f, k2, k1)).toBe('primo');
    expect(parentesco(f, c2, k1)).toBe('tía');
    expect(parentesco(f, k1, c2)).toBe('sobrina');
    expect(parentesco(f, k2, c1)).toBe('sobrino');
    expect(parentesco(f, p2, c1)).toBe('cuñado');
    expect(parentesco(f, p1, c2)).toBe('cuñada');
    expect(parentesco(f, c1, p2)).toBe('cuñado');
    expect(parentesco(f, abuelo, p1)).toBe('suegro');
    expect(parentesco(f, abuela, p2)).toBe('suegra');
    expect(parentesco(f, p1, abuelo)).toBe('nuera');
    expect(parentesco(f, p2, abuela)).toBe('yerno');
    expect(parentesco(f, k1, abuelo)).toBe('nieta');
    expect(parentesco(f, abuela, k2)).toBe('abuela');
    expect(parentesco(f, c1, c2)).toBe('hermano');
    expect(parentesco(f, p1, p2)).toBeNull();   // concuñados: no se pregunta
    expect(parentesco(f, p2, k1)).toBeNull();   // tío político: no se pregunta
  });

  it('parentescos: la respuesta sale de lo que dicen las frases, reconstruyendo el árbol', () => {
    for (const q of deTipo('parentescos')) {
      const [cuerpo, pregunta] = q.enunciado.split('. ¿');
      const frases = cuerpo.split('. ');
      const padres = new Map<string, string[]>(), pareja = new Map<string, string>(), mujer = new Map<string, boolean>();
      for (const fr of frases) {
        let m = /^(\S+) es (hijo|hija) de (\S+) y de (\S+)$/.exec(fr);
        if (m) { padres.set(m[1], [m[3], m[4]]); mujer.set(m[1], m[2] === 'hija'); continue; }
        m = /^(\S+) y (\S+) están casados$/.exec(fr);
        if (m) { pareja.set(m[1], m[2]); pareja.set(m[2], m[1]); continue; }
        m = /^(\S+) está (casado|casada) con (\S+)$/.exec(fr);
        if (m) { pareja.set(m[1], m[3]); pareja.set(m[3], m[1]); mujer.set(m[1], m[2] === 'casada'); continue; }
        throw new Error(fr);
      }
      const m = /^Qué es (\S+) de (\S+)\?$/.exec(pregunta)!;
      const [a, b] = [m[1], m[2]];
      const pa = (x: string) => padres.get(x) ?? [];
      const hermanos = (x: string, y: string) => x !== y && pa(x).length > 0 && pa(x).every((p) => pa(y).includes(p));
      const gen = (x: string) => (mujer.get(x) ? 1 : 0);
      void gen;
      const r = q.opciones[q.correcta].texto!;
      const posibles: boolean[] = [];
      // Cada parentesco se comprueba con la definición, no con el código del generador.
      if (/^(abuel)/.test(r)) posibles.push(pa(b).some((x) => pa(x).includes(a)));
      if (/^(niet)/.test(r)) posibles.push(pa(a).some((x) => pa(x).includes(b)));
      if (/^(tí)/.test(r)) posibles.push(pa(b).some((x) => hermanos(a, x)));
      if (/^(sobrin)/.test(r)) posibles.push(pa(a).some((x) => hermanos(b, x)));
      if (/^(prim)/.test(r)) posibles.push(pa(a).some((x) => pa(b).some((y) => hermanos(x, y))));
      if (/^(suegr)/.test(r)) posibles.push(pa(pareja.get(b) ?? '').includes(a));
      if (/^(yern|nuer)/.test(r)) posibles.push(pa(pareja.get(a) ?? '').includes(b));
      if (/^(cuñad)/.test(r)) posibles.push(hermanos(pareja.get(a) ?? '', b) || hermanos(a, pareja.get(b) ?? ''));
      if (/^(hermano|hermana)/.test(r)) posibles.push(hermanos(a, b));
      expect(posibles.length, `${r} ${q.enunciado}`).toBeGreaterThan(0);
      expect(posibles.every(Boolean), `${r} ${q.enunciado}`).toBe(true);
      // El género de la respuesta es el de la persona por la que se pregunta.
      const esFem = /a$/.test(r);
      // (el sexo de los abuelos no lo dice ninguna frase: solo se comprueba cuando se sabe)
      if (mujer.has(a)) expect(esFem).toBe(mujer.get(a) === true);
      expect(new Set(q.opciones.map((o) => o.texto)).size).toBe(q.opciones.length);
    }
  });
});

describe('la corrección', () => {
  const preguntas = generaSesion(2024, [...TIPOS_PSICO], 20);

  it('lo que viaja al navegador no lleva la respuesta ni la explicación', () => {
    for (const q of preguntas) {
      const publica = aPublica(q) as Record<string, unknown>;
      expect(publica.correcta).toBeUndefined();
      expect(publica.explicacion).toBeUndefined();
      expect(publica.opciones).toEqual(q.opciones);
    }
  });

  it('todo bien es un 10; todo en blanco, un 0', () => {
    expect(corrigeSesion(preguntas, preguntas.map((q) => q.correcta))).toMatchObject({ aciertos: 20, fallos: 0, blancos: 0, nota: 10 });
    expect(corrigeSesion(preguntas, [])).toMatchObject({ aciertos: 0, fallos: 0, blancos: 20, nota: 0 });
  });

  it('un blanco no es un fallo (regla 24): no resta', () => {
    const mitad = preguntas.map((q, i) => (i < 10 ? q.correcta : -1));
    expect(corrigeSesion(preguntas, mitad)).toMatchObject({ aciertos: 10, fallos: 0, blancos: 10, nota: 5 });
  });

  it('cada cuatro fallos quitan un acierto, y la nota no baja de cero', () => {
    expect(notaPsico(10, 4, 20)).toBe(4.5);
    expect(notaPsico(0, 20, 20)).toBe(0);
    expect(notaPsico(5, 0, 0)).toBe(0);
  });

  it('lo que no es una opción cuenta como blanco', () => {
    expect([5, -3, 2.5, '1', null, undefined, NaN].map((v) => normalizaRespuesta(v))).toEqual([-1, -1, -1, -1, -1, -1, -1]);
    expect([0, 4].map((v) => normalizaRespuesta(v))).toEqual([0, 4]);
    // Una opción que la pregunta no tiene (un 3 en una de tres) también es un blanco.
    expect(normalizaRespuesta(3, 3)).toBe(-1);
    expect(normalizaRespuesta(2, 3)).toBe(2);
  });

  it('el desglose por tipo suma el total', () => {
    const r = corrigeSesion(preguntas, preguntas.map((q) => q.correcta));
    expect(Object.values(r.porTipo).reduce((s, t) => s + t!.t, 0)).toBe(20);
    expect(Object.values(r.porTipo).reduce((s, t) => s + t!.a, 0)).toBe(20);
  });
});

describe('las acciones', () => {
  const lee = (r: string) => readFileSync(join(__dirname, '..', r), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = lee('app/actions/psico.ts');

  it('las tres piden usuario y módulo, con la academia de la sesión (reglas 1 y 109)', () => {
    for (const accion of ['empiezaPsico', 'entregaPsico', 'getMisPsico']) {
      const desde = src.indexOf(`export async function ${accion}`);
      const cuerpo = src.slice(desde, src.indexOf('\nexport ', desde + 10) === -1 ? undefined : src.indexOf('\nexport ', desde + 10));
      expect(cuerpo, accion).toContain('requireUser()');
      expect(cuerpo, accion).toContain("requireModule('psico', auth.user.organizationId)");
    }
  });

  it('al navegador solo van las preguntas SIN respuesta', () => {
    expect(src).toContain('.map(aPublica)');
    expect(src).not.toMatch(/seed[^\n]*(return|success)/);
  });

  it('la corrección se hace aquí, con la semilla guardada (regla 110)', () => {
    const desde = src.indexOf('export async function entregaPsico');
    const cuerpo = src.slice(desde);
    expect(cuerpo).toContain('generaSesion(Number(fila.seed)');
    expect(cuerpo).toContain('corrigeSesion(');
    expect(cuerpo).toContain(".eq('user_id', auth.user.id)");
  });

  it('una sesión se entrega una vez y solo si es de la misma versión', () => {
    expect(src).toContain(".is('finished_at', null)");
    expect(src).toContain('!esVersionPsico(fila.version)');
  });

  it('la semilla sale del azar del sistema, no del cliente', () => {
    expect(src).toContain('randomInt(');
  });

  it('el módulo existe y es de los que se apagan por academia', () => {
    expect(readFileSync(join(__dirname, '..', 'app/lib/modules.ts'), 'utf-8')).toContain("'psico'");
  });
});

describe('la ficha de psicotécnicos de un alumno (admin)', () => {
  const ses = (fecha: string, tot: number, a: number, f: number, porTipo: Record<string, { a: number; t: number; f?: number }>) => ({ version: 2, fecha, total: tot, aciertos: a, fallos: f, blancos: tot - a - f, porTipo: porTipo as never });

  it('sin sesiones: nada que decir, y la nota media es null, no 0 (regla 16)', async () => {
    const { resumenPsicoAlumno } = await import('../app/lib/psico');
    expect(resumenPsicoAlumno([])).toEqual({ sesiones: 0, notaMedia: null, ultimaNota: null, ultimaFecha: null, tipos: [], flojos: [] });
  });

  it('cuenta sesiones, saca la nota media y la última, y el acierto por tipo del peor al mejor', async () => {
    const { resumenPsicoAlumno } = await import('../app/lib/psico');
    const r = resumenPsicoAlumno([
      ses('2026-11-12', 10, 6, 2, { series: { a: 4, t: 5, f: 1 }, figuras: { a: 2, t: 5, f: 1 } }),
      ses('2026-11-10', 10, 2, 6, { series: { a: 2, t: 5, f: 3 }, figuras: { a: 0, t: 5, f: 3 } }),
    ]);
    expect(r.sesiones).toBe(2);
    expect(r.ultimaFecha).toBe('2026-11-12');
    expect(r.ultimaNota).toBe(notaDeSesionGuardada({ version: 2, total: 10, aciertos: 6, fallos: 2, porTipo: { series: { a: 4, t: 5, f: 1 }, figuras: { a: 2, t: 5, f: 1 } } }));
    expect(r.tipos.map((t) => t.tipo)).toEqual(['figuras', 'series']);
    expect(r.tipos[0]).toEqual({ tipo: 'figuras', acierto: 0.2, preguntas: 10 });
    expect(r.notaMedia).toBe(Math.round(((r.ultimaNota! + notaDeSesionGuardada({ version: 2, total: 10, aciertos: 2, fallos: 6, porTipo: { series: { a: 2, t: 5, f: 3 }, figuras: { a: 0, t: 5, f: 3 } } })) / 2) * 100) / 100);
  });

  it('«flojo» pide acierto bajo Y preguntas suficientes: dos fallos seguidos no son una tendencia', async () => {
    const { resumenPsicoAlumno, MIN_PREGUNTAS_TIPO_FLOJO, UMBRAL_TIPO_FLOJO } = await import('../app/lib/psico');
    const poco = resumenPsicoAlumno([ses('2026-11-12', 2, 0, 2, { dominos: { a: 0, t: 2, f: 2 } })]);
    expect(poco.flojos).toEqual([]);
    const mucho = resumenPsicoAlumno([ses('2026-11-12', MIN_PREGUNTAS_TIPO_FLOJO, 1, 5, { dominos: { a: 1, t: MIN_PREGUNTAS_TIPO_FLOJO, f: 5 } })]);
    expect(mucho.flojos.map((t) => t.tipo)).toEqual(['dominos']);
    expect(UMBRAL_TIPO_FLOJO).toBe(0.5);
    const bien = resumenPsicoAlumno([ses('2026-11-12', 10, 8, 2, { series: { a: 8, t: 10, f: 2 } })]);
    expect(bien.flojos).toEqual([]);
  });

  it('la acción solo la usa un admin, del alumno de SU academia, y no lleva el mensaje de la base de datos', () => {
    const fuente = readFileSync(join(__dirname, '..', 'app/actions/psico.ts'), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const a = fuente.slice(fuente.indexOf('export async function getPsicoDeAlumno'));
    void (0);
    expect(a).toContain('requireAdmin()');
    expect(a).toMatch(/\.eq\('academy_id', org\)\s*\.eq\('user_id', alumnoId\)/);
    expect(a).toMatch(/\.eq\('organization_id', org\)\s*\.eq\('user_id', alumnoId\)/);
    expect(a).toContain(".not('finished_at', 'is', null)");
    expect(a).toContain(".limit(40)");
    expect(a).not.toMatch(/error\.message/);
  });
});
