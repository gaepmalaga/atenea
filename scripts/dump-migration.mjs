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
 * valores por defecto, claves primarias y ajenas, indices, RLS, politicas y las
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

const { columnas = [], constraints = [], indices = [], rls = [], politicas = [], funciones = [] } = esquema;

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

w('-- =============================================================================');
w('-- Esquema de Atenea — volcado del proyecto real');
w('-- =============================================================================');
w('--');
w('-- Generado por `node scripts/dump-migration.mjs`. NO editar a mano: los cambios');
w('-- se hacen en la base de datos y luego se vuelve a volcar.');
w('--');
w('-- Este fichero existe porque el esquema solo vivia dentro de Supabase. Sin una');
w('-- copia en el repo, el codigo y la base de datos derivaron sin que nada lo');
w('-- cantara: se escribian columnas inexistentes y PostgREST rechazaba la');
w('-- escritura entera en silencio.');
w('--');
w(`-- Fecha del volcado: ${new Date().toISOString().slice(0, 10)}`);
w(`-- Tablas: ${nombresTabla.length}`);
w('-- =============================================================================');
w();
w('create extension if not exists "uuid-ossp";');
w('create extension if not exists vector;');
w();

// --- Tablas -----------------------------------------------------------------
for (const tabla of nombresTabla) {
  const cols = columnas.filter((c) => c.table_name === tabla).sort((a, b) => a.ordinal_position - b.ordinal_position);
  const pk = constraints
    .filter((c) => c.table_name === tabla && c.constraint_type === 'PRIMARY KEY')
    .sort((a, b) => (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0))
    .map((c) => c.column_name);

  w(`-- ${'-'.repeat(74)}`);
  w(`create table if not exists public.${tabla} (`);
  const cuerpo = cols.map((c) => {
    let l = `  ${c.column_name} ${tipoDe(c)}`;
    if (c.is_nullable === 'NO') l += ' not null';
    if (c.column_default) l += ` default ${c.column_default}`;
    return l;
  });
  if (pk.length) cuerpo.push(`  primary key (${pk.join(', ')})`);
  w(cuerpo.join(',\n'));
  w(');');
  w();
}

// --- Claves ajenas y unicidad ------------------------------------------------
w('-- ' + '='.repeat(74));
w('-- Claves ajenas y restricciones de unicidad');
w('-- ' + '='.repeat(74));
w();
const yaVistas = new Set();
for (const c of constraints) {
  if (yaVistas.has(c.constraint_name)) continue;
  if (c.constraint_type === 'FOREIGN KEY') {
    yaVistas.add(c.constraint_name);
    const cols = constraints
      .filter((x) => x.constraint_name === c.constraint_name)
      .sort((a, b) => (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0));
    const origen = [...new Set(cols.map((x) => x.column_name))].join(', ');
    w(`alter table public.${c.table_name} drop constraint if exists ${c.constraint_name};`);
    w(
      `alter table public.${c.table_name} add constraint ${c.constraint_name}` +
        ` foreign key (${origen}) references public.${c.ref_table}(${c.ref_column});`
    );
  } else if (c.constraint_type === 'UNIQUE') {
    yaVistas.add(c.constraint_name);
    const cols = constraints
      .filter((x) => x.constraint_name === c.constraint_name)
      .sort((a, b) => (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0))
      .map((x) => x.column_name);
    w(`alter table public.${c.table_name} drop constraint if exists ${c.constraint_name};`);
    w(`alter table public.${c.table_name} add constraint ${c.constraint_name} unique (${[...new Set(cols)].join(', ')});`);
  }
}
w();

// --- Indices ----------------------------------------------------------------
// Los de clave primaria y unicidad ya los crea Postgres con la restriccion.
const propios = indices.filter((i) => !yaVistas.has(i.indexname) && !i.indexname.endsWith('_pkey'));
if (propios.length) {
  w('-- ' + '='.repeat(74));
  w('-- Indices');
  w('-- ' + '='.repeat(74));
  w();
  for (const i of propios) {
    w(i.indexdef.replace(/^CREATE INDEX /i, 'create index if not exists ').replace(/^CREATE UNIQUE INDEX /i, 'create unique index if not exists ') + ';');
  }
  w();
}

// --- RLS y politicas ---------------------------------------------------------
w('-- ' + '='.repeat(74));
w('-- Row Level Security');
w('-- ' + '='.repeat(74));
w('--');
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
  w('-- ' + '='.repeat(74));
  w('-- Funciones del proyecto');
  w('-- ' + '='.repeat(74));
  w();
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

console.log(
  `Escrito supabase/migrations/0001_esquema_actual.sql\n` +
    `  ${nombresTabla.length} tablas, ${politicas.length} politicas, ${propias.length} funciones propias`
);
