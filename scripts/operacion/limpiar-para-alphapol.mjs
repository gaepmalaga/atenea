/**
 * DEJA LA BASE DE DATOS SOLO DE ALPHAPOL (regla 81).
 *
 * Borra las cuentas de prueba (todas menos los `superadmin` y las que se
 * pidan conservar) con todo lo suyo, y las academias que no son Alphapol con
 * todo lo suyo. NO toca el temario, el banco común ni la configuración de
 * Alphapol. El QUÉ lo decide `app/lib/limpieza.ts` (puro, con tests); este
 * guion solo lo ejecuta.
 *
 * VA POR SQL, EN UNA TRANSACCIÓN, con la API de gestión de Supabase
 * (`POST /v1/projects/{ref}/database/query`, la misma que `ejecutar-sql.mjs`).
 * O se borra todo o no se borra nada: con PostgREST eran decenas de peticiones
 * sueltas y una caída a mitad dejaba la base de datos a medias.
 *
 * Pide un TOKEN DE CUENTA (supabase.com/dashboard/account/tokens), no la clave
 * de servicio: en `SUPABASE_ACCESS_TOKEN`. El proyecto sale de
 * `NEXT_PUBLIC_SUPABASE_URL`, de `--proyecto=<ref>` o, si la cuenta solo tiene
 * uno, de la propia cuenta.
 *
 * Antes de borrar guarda una COPIA en JSON de todas las filas que va a borrar
 * (`--copia=<ruta>`; por defecto en la carpeta temporal del sistema).
 *
 * USO
 *   npm run limpiar                         enseña lo que borraría y NO borra
 *   npm run limpiar -- --conservar=a@b.com  además conserva esas cuentas
 *   npm run limpiar -- --hazlo              borra, preguntando por la consola
 *   npm run limpiar -- --hazlo --confirmacion=ALPHAPOL   sin terminal
 */
import { createInterface } from 'node:readline/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { MARCA } from '../../app/lib/marca.ts';
import { planLimpieza, pasosLimpiezaSql, sqlDeConteo, sqlDeBorrado } from '../../app/lib/limpieza.ts';

config({ path: '.env.local' });

const args = process.argv.slice(2);
const HAZLO = args.includes('--hazlo');
const valor = (nombre) => args.find((a) => a.startsWith(`--${nombre}=`))?.split('=').slice(1).join('=');
const conservarEmails = (valor('conservar') ?? '').split(',').map((e) => e.trim()).filter(Boolean);

const TOKEN = (process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
if (!TOKEN) {
  console.error('Falta SUPABASE_ACCESS_TOKEN (un token de cuenta: supabase.com/dashboard/account/tokens).');
  process.exit(1);
}
const API = 'https://api.supabase.com/v1';
const cabeceras = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

async function proyecto() {
  const porArgumento = valor('proyecto');
  if (porArgumento) return porArgumento;
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
  const ref = url.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');
  if (ref) return ref;
  const res = await fetch(`${API}/projects`, { headers: cabeceras });
  const lista = await res.json();
  if (!Array.isArray(lista) || lista.length !== 1) {
    throw new Error('No sé qué proyecto limpiar: pon NEXT_PUBLIC_SUPABASE_URL o --proyecto=<ref>.');
  }
  return lista[0].id;
}

const REF = await proyecto();

/** Ejecuta SQL en el proyecto. Lanza si Supabase devuelve error. */
async function sql(consulta) {
  const res = await fetch(`${API}/projects/${REF}/database/query`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify({ query: consulta }),
  });
  const cuerpo = await res.text();
  if (!res.ok) throw new Error(`SQL rechazado (${res.status}): ${cuerpo.slice(0, 500)}`);
  return cuerpo ? JSON.parse(cuerpo) : [];
}

async function leeCuentas() {
  // Las de `auth.users` con su rol, y los perfiles huérfanos (sin cuenta).
  return sql(`
    select u.id::text, u.email, p.role, false as huerfano
      from auth.users u left join public.profiles p on p.id = u.id
    union all
    select p.id::text, p.email, p.role, true
      from public.profiles p
     where not exists (select 1 from auth.users u where u.id = p.id)`);
}

async function main() {
  console.log(`\nProyecto: ${REF}`);
  console.log(HAZLO ? '\n⚠  MODO REAL: se va a borrar.\n' : '\nEnsayo. No se borra nada. Añade --hazlo para ejecutarlo.\n');

  const [cuentas, academias] = await Promise.all([
    leeCuentas(),
    sql('select id::text, slug, name from public.academies order by created_at'),
  ]);

  const plan = planLimpieza({ cuentas, academias, academiaSlug: MARCA.academiaSlug, conservarEmails });

  console.log(`  Se queda la academia: ${plan.academia ? `${plan.academia.name} (/${plan.academia.slug})` : '— NO EXISTE —'}`);
  console.log(`\n  Cuentas que SE QUEDAN (${plan.conservar.length}):`);
  for (const c of plan.conservar) console.log(`    · ${c.email ?? c.id} — ${c.role ?? 'sin rol'}`);
  console.log(`\n  Cuentas que se BORRAN (${plan.borrarCuentas.length}):`);
  for (const c of plan.borrarCuentas) console.log(`    ✱ ${c.email ?? c.id} — ${c.role ?? 'sin rol'}${c.huerfano ? ' (perfil sin cuenta)' : ''}`);
  console.log(`\n  Academias que se BORRAN (${plan.borrarAcademias.length}):`);
  for (const a of plan.borrarAcademias) console.log(`    ✱ ${a.name} (/${a.slug})`);

  if (plan.error) {
    console.error(`\n✗ ${plan.error}\n`);
    process.exit(1);
  }

  const pasos = pasosLimpiezaSql(plan);
  const conteo = await sql(sqlDeConteo(pasos));
  console.log('\n  Filas que se borrarían:');
  let total = 0;
  for (const { paso, filas } of conteo) {
    if (filas > 0) console.log(`    ✱  ${pasos[paso].tabla.padEnd(30)} ${String(filas).padStart(6)}  (${pasos[paso].etiqueta})`);
    total += filas;
  }
  console.log(`\n  Total: ${total} filas (incluidas ${plan.borrarCuentas.filter((c) => !c.huerfano).length} cuentas de auth.users).`);
  console.log('  NO se tocan: el temario, el banco común de preguntas y fichas, ni la configuración de Alphapol.');

  if (!HAZLO) {
    console.log('\nEnsayo terminado. Nada se ha borrado.\n');
    return;
  }

  const porArgumento = valor('confirmacion');
  let escrito;
  if (porArgumento !== undefined) escrito = porArgumento;
  else if (!process.stdin.isTTY) {
    console.error('\nSin terminal y sin --confirmacion=ALPHAPOL. No se borra nada.');
    process.exit(1);
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    escrito = await rl.question(`\nEscribe ALPHAPOL para borrar ${total} filas: `);
    rl.close();
  }
  if (escrito.trim() !== 'ALPHAPOL') {
    console.log('Cancelado. No se ha borrado nada.\n');
    return;
  }

  // La copia, ANTES de borrar: si algo sale mal, lo borrado está ahí.
  const copia = {};
  for (const p of pasos) {
    const [fila] = await sql(`select coalesce(json_agg(x), '[]'::json) as filas from (select * from ${p.tabla} where ${p.donde}) x`);
    if (fila.filas.length) (copia[p.tabla] ??= []).push(...fila.filas);
  }
  const rutaCopia = valor('copia') ?? join(tmpdir(), `limpieza-alphapol-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(rutaCopia, JSON.stringify({ proyecto: REF, fecha: new Date().toISOString(), plan, filas: copia }, null, 2));
  console.log(`\nCopia de lo que se va a borrar: ${rutaCopia}`);

  await sql(sqlDeBorrado(pasos));

  console.log('\nComprobando…');
  const despues = await sql(sqlDeConteo(pasos));
  const restos = despues.filter((r) => r.filas > 0);
  for (const r of restos) console.log(`  ✗ ${pasos[r.paso].tabla} conserva ${r.filas} filas (${pasos[r.paso].etiqueta})`);
  console.log(
    restos.length === 0
      ? `\nHecho. Queda ${plan.academia.name} con ${plan.conservar.length} cuenta(s), el temario y el banco.\n`
      : '\nHa quedado algo sin borrar (mira arriba).\n',
  );
}

main().catch((e) => { console.error(`\n✗ ${e.message}\n`); process.exit(1); });
