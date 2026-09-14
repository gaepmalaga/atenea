import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectaConfusion, type IntentoParaConfusion } from '../app/lib/question-confusion';

/**
 * EL GRAFO DE CONFUSIÓN DESCUBIERTO DE LOS DATOS (regla 73).
 *
 * La única pieza del diseño de Opus que sobrevivió: en vez de que alguien
 * etiquete qué preguntas se confunden, se infiere de si los alumnos que
 * fallan A fallan B MÁS de lo que el azar explicaría (`lift`).
 */

function intento(userId: string, questionId: string, isCorrect: boolean, topic = 'T1'): IntentoParaConfusion {
  return { userId, questionId, isCorrect, topic };
}

describe('detectaConfusion', () => {
  it('sin intentos, no hay pares', () => {
    expect(detectaConfusion([])).toEqual([]);
  });

  it('dos preguntas que SIEMPRE se fallan juntas, con muestra suficiente, salen con lift alto', () => {
    const intentos: IntentoParaConfusion[] = [];
    // 10 alumnos: todos fallan A y B juntos. Sin nadie que las acierte, no hay
    // fallo "esperado" que calcular — hace falta algo de variación real.
    for (let i = 0; i < 10; i++) {
      intentos.push(intento(`u${i}`, 'A', false));
      intentos.push(intento(`u${i}`, 'B', false));
    }
    // Y unos cuantos alumnos que SÍ las aciertan, para que tasaFallo(A) y
    // tasaFallo(B) no sean 1 exacto (si no, cualquier co-fallo da lift=1).
    for (let i = 10; i < 20; i++) {
      intentos.push(intento(`u${i}`, 'A', true));
      intentos.push(intento(`u${i}`, 'B', true));
    }
    const pares = detectaConfusion(intentos);
    expect(pares).toHaveLength(1);
    expect(pares[0]).toMatchObject({ a: 'A', b: 'B', n: 20, fallanAmbas: 10 });
    expect(pares[0].lift).toBeGreaterThan(1.5);
  });

  it('dos preguntas difíciles pero SIN relación (co-fallo justo el esperado por azar) NO salen', () => {
    // A y B fallan cada una un 50% de las veces, pero de forma INDEPENDIENTE:
    // el patrón exacto de quién falla A no predice quién falla B.
    const intentos: IntentoParaConfusion[] = [];
    const patronA = [true, false, true, false, true, false, true, false, true, false,
                      true, false, true, false, true, false, true, false, true, false];
    const patronB = [true, true, false, false, true, true, false, false, true, true,
                      false, false, true, true, false, false, true, true, false, false];
    for (let i = 0; i < 20; i++) {
      intentos.push(intento(`u${i}`, 'A', patronA[i]));
      intentos.push(intento(`u${i}`, 'B', patronB[i]));
    }
    const pares = detectaConfusion(intentos);
    expect(pares).toEqual([]);
  });

  it('exige un mínimo de alumnos que hayan respondido a las dos, aunque el patrón sea perfecto', () => {
    const intentos: IntentoParaConfusion[] = [];
    // Solo 3 alumnos: muy pocos para fiarse, aunque fallen las dos siempre.
    for (let i = 0; i < 3; i++) {
      intentos.push(intento(`u${i}`, 'A', false));
      intentos.push(intento(`u${i}`, 'B', false));
    }
    intentos.push(intento('u99', 'A', true));
    intentos.push(intento('u99', 'B', true));
    expect(detectaConfusion(intentos)).toEqual([]);
    // Con el mínimo de muestra bajado a mano SÍ sale (para aislar que el
    // filtro que faltaba era ESE, no el lift: se relaja también a propósito).
    expect(detectaConfusion(intentos, { minEncuestados: 4, minCofallos: 2, minLift: 1 })).toHaveLength(1);
  });

  it('NO compara preguntas de temas distintos', () => {
    const intentos: IntentoParaConfusion[] = [];
    for (let i = 0; i < 10; i++) {
      intentos.push(intento(`u${i}`, 'A', false, 'Constitución'));
      intentos.push(intento(`u${i}`, 'B', false, 'Extranjería'));
    }
    for (let i = 10; i < 20; i++) {
      intentos.push(intento(`u${i}`, 'A', true, 'Constitución'));
      intentos.push(intento(`u${i}`, 'B', true, 'Extranjería'));
    }
    // Mismo patrón que el primer test (que SÍ detecta el par), pero con temas
    // distintos: no debe salir ningún par.
    expect(detectaConfusion(intentos)).toEqual([]);
  });

  it('si un alumno la falla en un intento y la acierta en otro, cuenta como fallada', () => {
    const intentos: IntentoParaConfusion[] = [
      intento('u1', 'A', false),
      intento('u1', 'A', true), // segundo intento, acertado
    ];
    // Con un solo alumno no hay muestra para un par, pero esto se comprueba
    // indirectamente: dos preguntas con este patrón de A deberían seguir
    // contando el fallo. Se arma un caso completo:
    const base: IntentoParaConfusion[] = [];
    for (let i = 0; i < 10; i++) {
      base.push(intento(`u${i}`, 'A', false));
      base.push(intento(`u${i}`, 'A', true)); // luego lo aprende, pero ya falló una vez
      base.push(intento(`u${i}`, 'B', false));
    }
    for (let i = 10; i < 20; i++) {
      base.push(intento(`u${i}`, 'A', true));
      base.push(intento(`u${i}`, 'B', true));
    }
    const pares = detectaConfusion(base);
    expect(pares).toHaveLength(1);
    expect(pares[0].fallanAmbas).toBe(10);
  });

  it('ordena los pares por lift, de más a menos llamativo', () => {
    const intentos: IntentoParaConfusion[] = [];
    // Par A-B: co-fallo perfecto.
    for (let i = 0; i < 10; i++) {
      intentos.push(intento(`u${i}`, 'A', false));
      intentos.push(intento(`u${i}`, 'B', false));
    }
    for (let i = 10; i < 20; i++) {
      intentos.push(intento(`u${i}`, 'A', true));
      intentos.push(intento(`u${i}`, 'B', true));
    }
    // Par C-D: otro patrón de co-fallo, con su propio lift.
    for (let i = 0; i < 8; i++) {
      intentos.push(intento(`v${i}`, 'C', i < 2));
      intentos.push(intento(`v${i}`, 'D', i < 2));
    }
    for (let i = 8; i < 30; i++) {
      intentos.push(intento(`v${i}`, 'C', true));
      intentos.push(intento(`v${i}`, 'D', true));
    }
    const pares = detectaConfusion(intentos, { minEncuestados: 8 });
    expect(pares.length).toBeGreaterThanOrEqual(1);
    // El primero es el de mayor lift.
    for (let i = 1; i < pares.length; i++) {
      expect(pares[i - 1].lift).toBeGreaterThanOrEqual(pares[i].lift);
    }
  });
});

describe('guarda: question-confusion es puro', () => {
  it('no importa React ni Supabase', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'lib', 'question-confusion.ts'), 'utf-8');
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/supabase|createClient/i);
  });
});
