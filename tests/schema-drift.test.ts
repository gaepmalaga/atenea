import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El codigo y la base de datos no pueden derivar en silencio.
 *
 * PostgREST rechaza una escritura ENTERA si una sola de las columnas no existe,
 * y en este proyecto esos errores solo se registraban en consola: la pantalla
 * seguia como si nada. Asi estuvieron rotos meses tres caminos distintos:
 *
 *   · `test_results` recibia `subject_id` y `error_type`, que no tiene. Ni un
 *     solo resultado de test llego a guardarse.
 *   · `flashcard_progress` recibia `subject_id`, que tampoco tiene. Ningun
 *     repaso se guardaba.
 *
 * Este test compara lo que el codigo escribe y filtra contra el esquema real,
 * volcado en `supabase/schema.json`. Para refrescar el volcado:
 *
 *   node scripts/schema-snapshot.mjs
 */

const ACTIONS = join(__dirname, '..', 'app', 'actions');

type Snapshot = {
  generado: string;
  tablas: Record<string, { columnas: string[]; obligatorias: string[] }>;
};

const snapshot: Snapshot = JSON.parse(
  readFileSync(join(__dirname, '..', 'supabase', 'schema.json'), 'utf-8')
);

const columnasDe = (tabla: string) => new Set(snapshot.tablas[tabla]?.columnas ?? []);

const ficheros = readdirSync(ACTIONS)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => ({
    nombre: f,
    src: readFileSync(join(ACTIONS, f), 'utf-8').replace(/\r\n/g, '\n'),
  }));

/** Linea (1-indexada) en la que cae un indice del fuente. */
const lineaDe = (src: string, indice: number) => src.slice(0, indice).split('\n').length;

describe('el codigo no escribe columnas que no existen', () => {
  it('todas las tablas que usa el codigo estan en el esquema', () => {
    const desconocidas: string[] = [];
    for (const { nombre, src } of ficheros) {
      for (const m of src.matchAll(/\.from\('([a-z_]+)'\)/g)) {
        if (!snapshot.tablas[m[1]]) {
          desconocidas.push(`${nombre}:${lineaDe(src, m.index!)} -> '${m[1]}'`);
        }
      }
    }
    expect(desconocidas).toEqual([]);
  });

  it('los objetos que van a insert/upsert/update solo traen columnas reales', () => {
    const malas: string[] = [];
    // El tramo entre el `.from(...)` y la operacion NO puede cruzar otro
    // `.from(`. Sin esa guarda, un `.delete()` sobre una tabla seguido de un
    // `.update({...})` sobre otra asociaba las columnas del segundo a la
    // primera tabla. Paso de verdad al aniadir `reindexDocument`, que borra
    // fragmentos y despues actualiza el documento.
    const re =
      /\.from\('([a-z_]+)'\)((?:(?!\.from\(')[\s\S]){0,600}?)\.(insert|upsert|update)\(\s*\{([\s\S]*?)\n?\s*\}\s*[,)]/g;

    for (const { nombre, src } of ficheros) {
      for (const m of src.matchAll(re)) {
        const [, tabla, , operacion, cuerpo] = m;
        const reales = columnasDe(tabla);
        if (!reales.size) continue; // lo canta el test de arriba
        // Solo las claves de primer nivel del objeto literal.
        const claves = [...cuerpo.matchAll(/^\s{0,20}([a-z_][a-z0-9_]*)\s*:/gm)].map((x) => x[1]);
        for (const clave of claves) {
          if (!reales.has(clave)) {
            malas.push(`${nombre}:${lineaDe(src, m.index!)} ${operacion} en '${tabla}' -> '${clave}'`);
          }
        }
      }
    }
    expect(malas).toEqual([]);
  });

  it('los filtros .eq/.in/... apuntan a columnas reales', () => {
    const malas: string[] = [];
    for (const { nombre, src } of ficheros) {
      // Misma guarda que arriba: la cadena de filtros no puede cruzar otro
      // `.from(`, o los filtros de una tabla se atribuyen a la anterior.
      for (const m of src.matchAll(/\.from\('([a-z_]+)'\)((?:(?!\.from\(')[\s\S]){0,400}?);/g)) {
        const [, tabla, cadena] = m;
        const reales = columnasDe(tabla);
        if (!reales.size) continue;
        for (const f of cadena.matchAll(/\.(eq|neq|gt|gte|lt|lte|ilike|like|in)\('([a-z_]+)'/g)) {
          if (!reales.has(f[2])) {
            malas.push(`${nombre}:${lineaDe(src, m.index!)} filtro en '${tabla}' -> '${f[2]}'`);
          }
        }
      }
    }
    expect(malas).toEqual([]);
  });
});

describe('las listas blancas de campos cuadran con el esquema', () => {
  // `saveBiodata` y `savePhysicalProfile` filtran lo que llega del cliente
  // contra una lista fija. Si la lista nombra una columna que no existe, la
  // escritura entera se cae en cuanto el usuario rellena ese campo.
  const listas: Array<[fichero: string, constante: string, tabla: string]> = [
    ['interview.ts', 'BIODATA_FIELDS', 'profiles_biodata'],
    ['training.ts', 'PHYSICAL_FIELDS', 'profiles_physical'],
  ];

  for (const [fichero, constante, tabla] of listas) {
    it(`${constante} solo nombra columnas de ${tabla}`, () => {
      const src = ficheros.find((f) => f.nombre === fichero)!.src;
      const bloque = src.match(new RegExp(`const ${constante}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
      expect(bloque, `no se encuentra ${constante} en ${fichero}`).not.toBeNull();

      const campos = [...bloque![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
      expect(campos.length, `${constante} esta vacia`).toBeGreaterThan(0);

      const reales = columnasDe(tabla);
      expect(campos.filter((c) => !reales.has(c))).toEqual([]);
    });
  }
});

describe('el volcado del esquema esta presente y es coherente', () => {
  it('tiene las tablas que la aplicacion necesita', () => {
    for (const tabla of [
      'question_bank', 'subjects', 'profiles', 'question_attempts',
      'flashcard_progress', 'flashcard_results', 'training_plans', 'ai_quota',
    ]) {
      expect(snapshot.tablas[tabla], `falta ${tabla} en el volcado`).toBeDefined();
    }
  });

  it('ninguna tabla sale sin columnas', () => {
    const vacias = Object.entries(snapshot.tablas)
      .filter(([, t]) => t.columnas.length === 0)
      .map(([n]) => n);
    expect(vacias).toEqual([]);
  });
});

/**
 * Lo que se PIDE en un `select` tambien tiene que existir.
 *
 * Los tests de arriba cubren las escrituras y los filtros. Las lecturas son la
 * otra mitad, y fallan distinto: PostgREST devuelve un error 400 y la pantalla
 * se queda vacia o cae al respaldo, sin que nadie sepa por que.
 *
 * Cubre tambien los joins: `question:question_bank(question_text)` comprueba
 * que la tabla anidada existe y que la columna pedida es suya. Un join sin la
 * clave ajena declarada no lo ve este test —eso solo se sabe ejecutando, y de
 * eso se encarga `npm run smoke`.
 */
describe('los select piden columnas que existen', () => {
  /** Separa una lista de columnas respetando los parentesis de los joins. */
  function partesDe(seleccion: string): string[] {
    const partes: string[] = [];
    let nivel = 0;
    let actual = '';
    for (const c of seleccion) {
      if (c === '(') nivel++;
      if (c === ')') nivel--;
      if (c === ',' && nivel === 0) {
        partes.push(actual.trim());
        actual = '';
      } else {
        actual += c;
      }
    }
    if (actual.trim()) partes.push(actual.trim());
    return partes;
  }

  it('ninguna columna pedida es inventada', () => {
    const malas: string[] = [];

    for (const { nombre, src } of ficheros) {
      const re = /\.from\('([a-z_]+)'\)\s*\n?\s*\.select\(\s*'([^']+)'/g;
      for (const m of src.matchAll(re)) {
        const [, tabla, seleccion] = m;
        const reales = columnasDe(tabla);
        if (!reales.size) continue;
        const linea = lineaDe(src, m.index!);

        for (const parte of partesDe(seleccion)) {
          if (parte === '*') continue;

          // Un join: `alias:tabla(col1, col2)` o `tabla(col1)`.
          const join = parte.match(/^(?:(\w+):)?(\w+)\s*\(([^)]*)\)$/);
          if (join) {
            const [, , tablaJoin, columnasJoin] = join;
            const realesJoin = columnasDe(tablaJoin);
            if (!realesJoin.size) {
              malas.push(`${nombre}:${linea} join a una tabla que no existe: '${tablaJoin}'`);
              continue;
            }
            for (const c of columnasJoin.split(',').map((x) => x.trim())) {
              if (c && c !== '*' && !realesJoin.has(c)) {
                malas.push(`${nombre}:${linea} '${tablaJoin}' no tiene '${c}'`);
              }
            }
            continue;
          }

          const columna = parte.replace(/^\w+:/, '').trim();
          if (columna && !reales.has(columna)) {
            malas.push(`${nombre}:${linea} '${tabla}' no tiene '${columna}'`);
          }
        }
      }
    }

    expect(malas).toEqual([]);
  });
});
