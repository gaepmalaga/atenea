/**
 * Vuelca el esquema real de Supabase a `supabase/schema.json`.
 *
 * POR QUE EXISTE
 * El esquema solo vivia dentro del proyecto de Supabase. Sin una copia en el
 * repo, el codigo y la base de datos derivaron sin que nada lo cantara: se
 * escribian columnas que no existen (`subject_id` en `flashcard_progress`,
 * `error_type` en `test_results`) y PostgREST rechazaba la escritura ENTERA en
 * silencio, porque el error solo se registraba en consola.
 *
 * `tests/schema-drift.test.ts` compara el codigo contra este fichero, asi que
 * el desajuste ahora sale en los tests y no en la cara del alumno.
 *
 * COMO SE USA
 *   node scripts/schema-snapshot.mjs
 *
 * Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env. No hace
 * falta la contrasena de la base de datos: se saca del documento OpenAPI que
 * PostgREST publica en la raiz de /rest/v1/.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

function leerEnv() {
  const texto = readFileSync('.env', 'utf-8');
  const valor = (clave) => {
    const linea = texto.split(/\r?\n/).find((l) => l.startsWith(clave + '='));
    return linea ? linea.slice(clave.length + 1).trim().replace(/^"|"$/g, '') : null;
  };
  const url = valor('NEXT_PUBLIC_SUPABASE_URL');
  const key = valor('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  }
  return { url, key };
}

const { url, key } = leerEnv();

const respuesta = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
if (!respuesta.ok) {
  throw new Error(`Supabase respondio ${respuesta.status}: ${await respuesta.text()}`);
}

const { definitions = {} } = await respuesta.json();

const tablas = {};
for (const nombre of Object.keys(definitions).sort()) {
  const def = definitions[nombre];
  const propiedades = def.properties ?? {};
  tablas[nombre] = {
    columnas: Object.keys(propiedades).sort(),
    // `required` de OpenAPI son las columnas NOT NULL sin valor por defecto.
    obligatorias: (def.required ?? []).slice().sort(),
    tipos: Object.fromEntries(
      Object.keys(propiedades)
        .sort()
        .map((c) => [c, propiedades[c].format ?? propiedades[c].type ?? 'desconocido'])
    ),
  };
}

mkdirSync('supabase', { recursive: true });
writeFileSync(
  'supabase/schema.json',
  JSON.stringify({ generado: new Date().toISOString().slice(0, 10), tablas }, null, 2) + '\n'
);

console.log(`Escrito supabase/schema.json con ${Object.keys(tablas).length} tablas.`);
