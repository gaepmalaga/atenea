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
    const re =
      /\.from\('([a-z_]+)'\)[\s\S]{0,600}?\.(insert|upsert|update)\(\s*\{([\s\S]*?)\n?\s*\}\s*[,)]/g;

    for (const { nombre, src } of ficheros) {
      for (const m of src.matchAll(re)) {
        const [, tabla, operacion, cuerpo] = m;
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
      for (const m of src.matchAll(/\.from\('([a-z_]+)'\)([\s\S]{0,400}?);/g)) {
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
