/**
 * Reconstruye el esquema como SQL en `supabase/migrations/0001_esquema_actual.sql`.
 *
 * POR QUE NO `supabase db pull`
 * El CLI de Supabase pide la contrasena de la base de datos. Esto se apoya en
 * una funcion instalada en el propio proyecto (`public.__esquema_json`, ver
 * `docs/sql/2.6-funcion-volcado.sql`) a la que solo llega la clave de servicio,
 * asi que basta con lo que ya hay en `.env`.
 *
 * QUE SALE Y QUE NO
 * Sale lo que define la forma de la base de datos: tablas, columnas, tipos,
 * valores por defecto, todas las restricciones, indices, RLS, politicas y las
 * funciones propias del proyecto.
 *
 * NO sale el contenido de las tablas, ni los objetos de los esquemas `auth` y
 * `storage`, que gestiona Supabase.
 *
 *   node scripts/dump-migration.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

function leerEnv(clave) {
  const texto = readFileSync('.env', 'utf-8');
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(clave + '='));
  if (!linea) throw new Error(`Falta ${clave} en .env`);
  return linea.slice(clave.length + 1).trim().replace(/^"|"$/g, '');
}

const url = leerEnv('NEXT_PUBLIC_SUPABASE_URL');
const key = leerEnv('SUPABASE_SERVICE_ROLE_KEY');

const respuesta = await fetch(`${url}/rest/v1/rpc/__esquema_json`, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}',
});
if (!respuesta.ok) throw new Error(`Supabase respondio ${respuesta.status}: ${await respuesta.text()}`);

const esquema = await respuesta.json();
if (esquema.code) throw new Error(`La funcion fallo: ${esquema.message}`);

const {
  columnas = [], constraints = [], indices = [],
  rls = [], politicas = [], funciones = [],
} = esquema;

if (!constraints.length || !('definicion' in constraints[0])) {
  throw new Error(
    'La funcion __esquema_json devuelve el formato antiguo.\n' +
      'Vuelve a ejecutar docs/sql/2.6-funcion-volcado.sql en el editor SQL de Supabase.'
  );
}

/** Las funciones de pgvector no son del proyecto: se instalan con la extension. */
const DE_LA_EXTENSION =
  /^(array_to_|binary_quantize|halfvec|hamming_|hnsw|inner_product|ivfflat|jaccard_|l1_|l2_|cosine_|sparsevec|subvector|vector)/;

const nombresTabla = [...new Set(columnas.map((c) => c.table_name))].sort();

/** El tipo tal y como se escribe en un CREATE TABLE. */
function tipoDe(col) {
  if (col.data_type === 'USER-DEFINED') return col.udt_name;
  if (col.data_type === 'ARRAY') return `${col.udt_name.replace(/^_/, '')}[]`;
  if (col.data_type === 'character varying' && col.character_maximum_length) {
    return `varchar(${col.character_maximum_length})`;
  }
  return col.data_type;
}

const lineas = [];
const w = (s = '') => lineas.push(s);
const titulo = (t) => {
  w('-- ' + '='.repeat(74));
  w(`-- ${t}`);
  w('-- ' + '='.repeat(74));
  w();
};

w('-- =============================================================================');
w('-- Esquema de Atenea — volcado del proyecto real');
w('-- =============================================================================');
w('--');
w('-- Generado por `npm run schema:migration`. NO editar a mano: los cambios se');
w('-- hacen en la base de datos y luego se vuelve a volcar.');
w('--');
w('-- Este fichero existe porque el esquema solo vivia dentro de Supabase. Sin una');
w('-- copia en el repo, el codigo y la base de datos derivaron sin que nada lo');
w('-- cantara: se escribian columnas inexistentes y PostgREST rechazaba la');
w('-- escritura entera en silencio.');
w('--');
w(`-- Fecha del volcado: ${new Date().toISOString().slice(0, 10)}`);
w(`-- Tablas: ${nombresTabla.length}   ·   Politicas: ${politicas.length}`);
w('-- =============================================================================');
w();
w('create extension if not exists "uuid-ossp";');
w('create extension if not exists vector;');
w();

// --- Tablas ------------------------------------------------------------------
// Solo columnas. Las restricciones van despues, para que las claves ajenas
// encuentren ya creadas las tablas a las que apuntan.
titulo('Tablas');
for (const tabla of nombresTabla) {
  const cols = columnas
    .filter((c) => c.table_name === tabla)
    .sort((a, b) => a.ordinal_position - b.ordinal_position);

  w(`-- ${'-'.repeat(74)}`);
  w(`create table if not exists public.${tabla} (`);
  w(
    cols
      .map((c) => {
        let l = `  ${c.column_name} ${tipoDe(c)}`;
        if (c.is_nullable === 'NO') l += ' not null';
        if (c.column_default) l += ` default ${c.column_default}`;
        return l;
      })
      .join(',\n')
  );
  w(');');
  w();
}

// --- Restricciones -----------------------------------------------------------
// La definicion viene literal de `pg_get_constraintdef`. Reconstruirla a mano
// desde `information_schema` daba `references public.null(null)` en las claves
// ajenas hacia `auth.users`, porque esa tabla vive en otro esquema y la vista
// deja el destino a NULL. El fichero no se podia ejecutar.
titulo('Claves primarias, ajenas, unicidad y checks');

const ORDEN = { p: 0, u: 1, c: 2, f: 3 }; // las ajenas al final
const nombresConstraint = new Set();
for (const c of [...constraints].sort((a, b) => (ORDEN[a.tipo] ?? 9) - (ORDEN[b.tipo] ?? 9))) {
  if (!nombresTabla.includes(c.tabla)) continue;
  nombresConstraint.add(c.nombre);
  w(`alter table public.${c.tabla} drop constraint if exists ${c.nombre};`);
  w(`alter table public.${c.tabla} add constraint ${c.nombre} ${c.definicion};`);
}
w();

// --- Indices -----------------------------------------------------------------
// Los de clave primaria y unicidad los crea Postgres con la restriccion.
const propios = indices.filter(
  (i) => !nombresConstraint.has(i.indexname) && !i.indexname.endsWith('_pkey')
);
if (propios.length) {
  titulo('Indices');
  for (const i of propios) {
    w(
      i.indexdef
        .replace(/^CREATE INDEX /i, 'create index if not exists ')
        .replace(/^CREATE UNIQUE INDEX /i, 'create unique index if not exists ') + ';'
    );
  }
  w();
}

// --- RLS y politicas ---------------------------------------------------------
titulo('Row Level Security');
w('-- Las tablas de contenido salen con RLS activa y SIN politicas: es a proposito.');
w('-- Significa acceso directo DENEGADO con la clave publica; la aplicacion las lee');
w('-- con la clave de servicio, que salta RLS. Ver docs/sql/1.3-activar-rls.sql.');
w();
for (const r of rls) {
  if (!nombresTabla.includes(r.tabla)) continue;
  w(`alter table public.${r.tabla} ${r.habilitada ? 'enable' : 'disable'} row level security;`);
}
w();
for (const p of politicas) {
  const roles = (p.roles || '{public}').replace(/[{}]/g, '');
  w(`drop policy if exists "${p.policyname}" on public.${p.tablename};`);
  let s = `create policy "${p.policyname}" on public.${p.tablename}\n  for ${p.cmd.toLowerCase()}\n  to ${roles}`;
  if (p.qual) s += `\n  using (${p.qual})`;
  if (p.with_check) s += `\n  with check (${p.with_check})`;
  w(s + ';');
  w();
}

// --- Funciones ---------------------------------------------------------------
const propias = funciones.filter((f) => !DE_LA_EXTENSION.test(f.nombre));
if (propias.length) {
  titulo('Funciones del proyecto');
  const vistas = new Set();
  for (const f of propias) {
    if (vistas.has(f.nombre)) continue;
    vistas.add(f.nombre);
    w(f.definicion.trim() + ';');
    w();
  }
}

mkdirSync('supabase/migrations', { recursive: true });
writeFileSync('supabase/migrations/0001_esquema_actual.sql', lineas.join('\n') + '\n');

const porTipo = (t) => constraints.filter((c) => c.tipo === t).length;
console.log(
  'Escrito supabase/migrations/0001_esquema_actual.sql\n' +
    `  ${nombresTabla.length} tablas · ${porTipo('p')} PK · ${porTipo('f')} FK · ` +
    `${porTipo('u')} unique · ${propios.length} indices · ${politicas.length} politicas · ` +
    `${new Set(propias.map((f) => f.nombre)).size} funciones`
);
