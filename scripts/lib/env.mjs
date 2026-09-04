/**
 * DE DONDE SALEN LAS CREDENCIALES EN LOS GUIONES.
 *
 * POR QUE EXISTE ESTE FICHERO
 * `schema-snapshot.mjs` y `smoke-contratos.mjs` leian cada uno su `.env` a
 * mano, y los dos reventaban con `ENOENT: .env` en cuanto ese fichero no
 * existia — que es el caso NORMAL, porque todo el resto del repo usa
 * `.env.local`: es lo que dice el README, lo que carga `dotenv` en los guiones
 * de operacion y lo que Next lee en desarrollo.
 *
 * O sea que los dos guiones que comprueban que el esquema y los contratos
 * siguen en pie fallaban con la configuracion que el propio proyecto
 * documenta. Y `schema-snapshot` es el que sostiene `schema-drift`, el
 * guardian mas importante del repo.
 *
 * El ENTORNO va primero: es como llegan las credenciales en CI y dentro de un
 * contenedor, donde no hay ningun fichero. Despues `.env.local` y por ultimo
 * `.env`, el mismo orden que usa Next.
 */
import { existsSync, readFileSync } from 'node:fs';

function deFicheros() {
  const out = {};
  for (const ruta of ['.env.local', '.env']) {
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf-8').split(/\r?\n/)) {
      if (linea.trimStart().startsWith('#')) continue;
      const corte = linea.indexOf('=');
      if (corte < 1) continue;
      const clave = linea.slice(0, corte).trim();
      // El primero que aparece manda: `.env.local` pisa a `.env`.
      if (!(clave in out)) out[clave] = linea.slice(corte + 1).trim().replace(/^"|"$/g, '');
    }
  }
  return out;
}

const ficheros = deFicheros();

/** Lee una variable. Lanza si falta, con un mensaje que dice donde se busco. */
export function env(clave) {
  const valor = process.env[clave] || ficheros[clave];
  if (!valor) {
    throw new Error(
      `Falta ${clave}. Se busca en el entorno, en .env.local y en .env, por ese orden.`,
    );
  }
  return valor;
}

/** La URL de Supabase, sin la barra final que rompe las rutas al concatenar. */
export function urlSupabase() {
  return env('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
}
