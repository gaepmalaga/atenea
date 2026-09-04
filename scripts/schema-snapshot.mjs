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
 * Necesita NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, del entorno
 * o de `.env.local`. No hace
 * falta la contrasena de la base de datos: se saca del documento OpenAPI que
 * PostgREST publica en la raiz de /rest/v1/.
 */

import { writeFileSync, mkdirSync } from 'node:fs';

// Las credenciales salen de `scripts/lib/env.mjs`, compartido con
// `smoke-contratos.mjs`. Los dos leian su propio `.env` a mano y los dos
// reventaban con la configuracion que el repo documenta, que es `.env.local`.
import { env, urlSupabase } from './lib/env.mjs';

const url = urlSupabase();
const key = env('SUPABASE_SERVICE_ROLE_KEY');

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
