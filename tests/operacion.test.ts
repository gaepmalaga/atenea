import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeSupabaseUrl } from '../app/lib/supabase-url';

/**
 * LOS GUIONES DE OPERACIÓN NO PUEDEN SEPARARSE DE LA APLICACIÓN.
 *
 * `npm run sembrar` hace, sin interfaz, lo mismo que un administrador subiendo
 * un PDF por el panel: trocear, sacar la referencia de artículo, validar la
 * pregunta y calcular su huella. Si el guion se escribe su propia versión de
 * cualquiera de esas cuatro cosas, el día que se afine una la otra sigue
 * indexando como antes — y nadie se entera hasta que un alumno estudia el
 * resultado.
 *
 * Es la misma razón por la que la huella vive en un solo sitio (regla 27) y
 * por la que el prompt del chat salió de dentro de la acción (regla 32).
 */

const raiz = join(__dirname, '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf-8');
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sembrar = sinComentarios(leer('scripts/operacion/sembrar.mjs'));
const reset = sinComentarios(leer('scripts/operacion/reset.mjs'));

describe('el guion de siembra usa la lógica de la aplicación', () => {
  it('están los tres guiones', () => {
    for (const g of ['reset.mjs', 'crear-cuenta.mjs', 'sembrar.mjs']) {
      expect(existsSync(join(raiz, 'scripts/operacion', g)), g).toBe(true);
    }
  });

  it('importa el troceado, la huella, la validación y el prompt de `app/lib/`', () => {
    for (const pieza of [
      'chunkDocument',
      'cleanLegalText',
      'questionHash',
      'validateGeneratedQuestion',
      'buildQuestionPrompt',
      'QUESTION_SCHEMA',
    ]) {
      expect(sembrar, `${pieza} debería importarse, no reescribirse`).toContain(pieza);
    }
    expect(sembrar).toMatch(/from '\.\.\/\.\.\/app\/lib\/text\.ts'/);
    expect(sembrar).toMatch(/from '\.\.\/\.\.\/app\/lib\/question-prompt\.ts'/);
  });

  it('no se escribe su propio prompt', () => {
    // Dos copias de un prompt son dos prompts.
    expect(sembrar).not.toContain('ACTÚA COMO: Tribunal Calificador');
  });

  it('no se escribe su propio troceado ni su propia huella', () => {
    expect(sembrar).not.toContain('createHash(');
    expect(sembrar).not.toMatch(/function\s+chunk/i);
  });

  it('los estados y el origen salen de la constante, no de literales', () => {
    // Escribir 'active' suelto es lo que hizo que el banco no se sirviera
    // nunca (regla 3).
    expect(sembrar).toContain('QUESTION_STATUS.ACTIVE');
    expect(sembrar).toContain('QUESTION_ORIGIN.BANK_SEED');
    expect(sembrar).not.toMatch(/status:\s*['"](active|candidate|disabled)['"]/);
  });

  it('el upsert del banco ignora los duplicados', () => {
    // Sin esto, relanzar la siembra devolvería a `candidate` una pregunta ya
    // aprobada y resucitaría una descartada (regla 3).
    expect(sembrar).toMatch(/onConflict:\s*'question_hash'[^}]*ignoreDuplicates:\s*true/);
  });

  it('un documento sin fragmentos no se queda en la base de datos', () => {
    // Un documento huérfano se ve en el panel igual que uno sano y el chat no
    // encuentra nada de ese tema. Le pasó al tema 9 durante meses.
    expect(sembrar).toMatch(/if \(indexed === 0\)[\s\S]{0,200}\.delete\(\)/);
  });

  it('el join del contexto declara `documents!inner`', () => {
    // Sin declararlo en el SELECT, el `.eq('documents.subject_id', …)` no
    // filtra: PostgREST devuelve error y el tema se queda sin generar nada.
    const filtros = [...sembrar.matchAll(/\.eq\('documents\.subject_id'/g)];
    expect(filtros.length).toBeGreaterThan(0);
    const consultas = [...sembrar.matchAll(/\.select\('[^']*documents!inner[^']*'/g)];
    expect(consultas.length, 'cada filtro por el tema necesita su join declarado').toBeGreaterThanOrEqual(filtros.length);
  });
});

describe('el reset no puede llevarse por delante el acceso', () => {
  it('no toca cuentas, perfiles ni temas', () => {
    // Borrar `auth.users` es el único paso irreversible que puede dejar al
    // dueño fuera de su propia plataforma. Y `subjects` es la clave ajena de
    // todo lo demás: recrearlos renumera los temas.
    for (const tabla of ['auth.users', "'profiles'", "'subjects'", "'blocks'", "'module_settings'"]) {
      expect(reset, `el reset no debe borrar ${tabla}`).not.toMatch(
        new RegExp(`from\\(${tabla.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\)\\s*\\.delete`),
      );
    }
    expect(reset).not.toContain('deleteUser');
  });

  it('pide confirmación escrita y no borra por defecto', () => {
    // Un `confirm` se acepta sin leerlo; escribir la palabra no.
    expect(reset).toContain("escrito.trim() !== 'RESET'");
    expect(reset).toContain("includes('--hazlo')");
  });

  it('cada borrado filtra por una columna que esa tabla tiene', () => {
    // PostgREST rechaza la operación entera si la columna no existe, y seis de
    // estas tablas no tienen `id`. Se comprueba contra el esquema real.
    const esquema = JSON.parse(leer('supabase/schema.json')) as {
      tablas: Record<string, { columnas: string[] }>;
    };
    const entradas = [...reset.matchAll(/\{ nombre: '([^']+)', filtro: '([^']+)'/g)];
    expect(entradas.length).toBeGreaterThan(15);
    for (const [, tabla, filtro] of entradas) {
      const def = esquema.tablas[tabla];
      if (!def) continue; // Una tabla que ya no existe se salta en ejecución.
      expect(def.columnas, `${tabla} no tiene la columna ${filtro}`).toContain(filtro);
    }
  });

  it('comprueba el resultado releyendo, no fiándose de sus contadores', () => {
    expect(reset).toContain('Comprobando que ha quedado vacío');
  });
});

describe('la URL de Supabase aguanta las dos formas que se copian', () => {
  const BASE = 'https://ecupmlqimmpybbrlrmpx.supabase.co';

  it('deja la URL base como está', () => {
    expect(normalizeSupabaseUrl(BASE)).toBe(BASE);
  });

  it('quita el endpoint REST, que es el que enseña el panel', () => {
    // Pasó de verdad configurando la siembra: el panel de Supabase enseña
    // `…/rest/v1/` en la pantalla de API y es la que se copia. Con esa, el
    // cliente pide `/rest/v1/rest/v1/subjects` y Supabase contesta «Invalid
    // path specified in request URL», que no dice nada de lo que ha pasado.
    expect(normalizeSupabaseUrl(`${BASE}/rest/v1/`)).toBe(BASE);
    expect(normalizeSupabaseUrl(`${BASE}/rest/v1`)).toBe(BASE);
  });

  it('quita también los otros endpoints y las barras de más', () => {
    for (const sufijo of ['/auth/v1', '/storage/v1', '/functions/v1', '/realtime/v1']) {
      expect(normalizeSupabaseUrl(`${BASE}${sufijo}/`)).toBe(BASE);
    }
    expect(normalizeSupabaseUrl(`${BASE}///`)).toBe(BASE);
    expect(normalizeSupabaseUrl(`  ${BASE}  `)).toBe(BASE);
  });

  it('sin valor devuelve cadena vacía, no revienta', () => {
    // Es lo que hace que el guion pueda decir «falta la variable» en vez de
    // fallar con un error de red incomprensible.
    for (const v of [undefined, null, '']) expect(normalizeSupabaseUrl(v)).toBe('');
  });

  it('los tres guiones la usan', () => {
    for (const g of ['reset.mjs', 'crear-cuenta.mjs', 'sembrar.mjs']) {
      const src = leer(`scripts/operacion/${g}`);
      expect(src, g).toContain('normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)');
    }
  });
});
