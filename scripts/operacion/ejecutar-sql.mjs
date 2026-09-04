/**
 * Ejecuta un guion de `docs/sql/` contra el proyecto real.
 *
 * POR QUÉ EXISTE
 * Hasta ahora, el DDL de este repo solo lo podía lanzar el dueño desde el
 * editor SQL de Supabase, y eso ha sido el cuello de botella de media
 * plataforma: varias cosas del plan llevaban meses paradas esperando una
 * columna. La clave de servicio NO sirve para esto — habla con PostgREST, que
 * lee y escribe en tablas que ya existen y llama a funciones que ya existen,
 * pero no ejecuta `CREATE TABLE`. Y el puerto de Postgres está cerrado desde
 * fuera, así que `psql` tampoco.
 *
 * Lo que sí funciona es la API de gestión, que va por HTTPS:
 *   POST https://api.supabase.com/v1/projects/{ref}/database/query
 *
 * Pide un TOKEN DE CUENTA, no la clave de servicio. Es bastante más poderoso:
 * un token clásico puede tocar cualquier proyecto de la cuenta y borrarlos. Por
 * eso este guion NO lo lee de un argumento —quedaría en el historial del
 * intérprete de órdenes y en la lista de procesos— sino de un fichero o de
 * `SUPABASE_ACCESS_TOKEN`, y por eso conviene usar un token de permisos
 * acotados y revocarlo al terminar.
 *
 *   node scripts/operacion/ejecutar-sql.mjs docs/sql/gasto-ia.sql [--ensayo]
 *
 * Con `--ensayo` enseña lo que ejecutaría y no toca nada.
 */
import { readFileSync, existsSync } from 'node:fs';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const ENSAYO = args.includes('--ensayo');
const fichero = args.find((a) => !a.startsWith('--'));

if (!fichero) {
  console.error('Uso: node scripts/operacion/ejecutar-sql.mjs <fichero.sql> [--ensayo]');
  process.exit(1);
}
if (!existsSync(fichero)) {
  console.error(`No existe: ${fichero}`);
  process.exit(1);
}

/**
 * El token, por orden de preferencia.
 *
 * El fichero primero porque es lo que permite tenerlo fuera del entorno y
 * borrarlo de un `rm` en cuanto se ha usado.
 */
function leeToken() {
  const desdeFichero = process.env.SUPABASE_TOKEN_FILE;
  if (desdeFichero && existsSync(desdeFichero)) {
    return readFileSync(desdeFichero, 'utf-8').trim();
  }
  return (process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
}

const token = leeToken();
if (!token && !ENSAYO) {
  console.error(
    'Falta el token de la API de gestión.\n' +
      '  Se saca en https://supabase.com/dashboard/account/tokens\n' +
      '  y se pasa con SUPABASE_TOKEN_FILE=<ruta> o SUPABASE_ACCESS_TOKEN=<token>.',
  );
  process.exit(1);
}

// La referencia del proyecto sale de la URL que ya está configurada: pedirla
// aparte solo añadiría un sitio donde equivocarse y apuntar al proyecto que no
// es, que en un guion que ejecuta DDL no es un error cualquiera.
const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
const ref = url.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
if (!ref) {
  console.error('No se pudo deducir la referencia del proyecto desde NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const sql = readFileSync(fichero, 'utf-8');

console.log(`\nProyecto : ${ref}`);
console.log(`Guion    : ${fichero}  (${sql.length} caracteres)`);

if (ENSAYO) {
  console.log('\nEnsayo: no se ejecuta nada.\n');
  process.exit(0);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const texto = await res.text();

if (!res.ok) {
  console.error(`\n✗ HTTP ${res.status}`);
  console.error(texto.slice(0, 1200));
  process.exit(1);
}

console.log(`\n✓ Ejecutado (HTTP ${res.status})`);
// La respuesta de un DDL suele ser una lista vacía. Se enseña igualmente: si
// algún día devuelve algo, es lo que hay que leer.
const recorte = texto.trim();
if (recorte && recorte !== '[]') console.log(recorte.slice(0, 600));
console.log('');
