import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  generaSesion, corrigeSesion, notaPsico, normalizaRespuesta, aPublica, tiposValidos, azarDe,
  TIPOS_PSICO, OPCIONES_PSICO, SINONIMOS, ANTONIMOS, ABECEDARIO, girar, type PreguntaPsico, type TipoPsico,
} from '../app/lib/psico';

/** Regla 117 · psicotécnicos generados por código. */

const SEMILLAS = Array.from({ length: 400 }, (_, i) => i * 7919 + 13);
const deTipo = (tipo: TipoPsico, n = 400): PreguntaPsico[] => SEMILLAS.slice(0, n).flatMap((s) => generaSesion(s, [tipo], 3));
const clave = (q: PreguntaPsico) => q.opciones.map((o) => o.texto ?? JSON.stringify(o.celda ?? o.ficha ?? o.rejilla));

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
    for (const q of generaSesion(7, [...TIPOS_PSICO], 27)) cuenta.set(q.tipo, (cuenta.get(q.tipo) ?? 0) + 1);
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
    it(`${tipo}: cinco opciones distintas y una sola correcta`, () => {
      for (const q of deTipo(tipo)) {
        expect(q.opciones).toHaveLength(OPCIONES_PSICO);
        expect(new Set(clave(q)).size, `${q.enunciado} ${q.lineas?.join(' | ')} → ${clave(q).join(', ')}`).toBe(OPCIONES_PSICO);
        expect(q.correcta >= 0 && q.correcta < OPCIONES_PSICO).toBe(true);
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
      expect(q.correcta).toBe(iguales);
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
      .update(JSON.stringify(Array.from({ length: 300 }, (_, i) => generaSesion(i * 7919 + 13, TIPOS_PSICO.slice(0, 6), 25))))
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
      expect(new Set(llaves).size).toBe(OPCIONES_PSICO);
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
    expect([5, -3, 2.5, '1', null, undefined, NaN].map(normalizaRespuesta)).toEqual([-1, -1, -1, -1, -1, -1, -1]);
    expect([0, 4].map(normalizaRespuesta)).toEqual([0, 4]);
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
    expect(src).toContain('fila.version !== VERSION_PSICO');
  });

  it('la semilla sale del azar del sistema, no del cliente', () => {
    expect(src).toContain('randomInt(');
  });

  it('el módulo existe y es de los que se apagan por academia', () => {
    expect(readFileSync(join(__dirname, '..', 'app/lib/modules.ts'), 'utf-8')).toContain("'psico'");
  });
});
