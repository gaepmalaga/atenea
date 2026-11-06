/**
 * DEJA LA BASE DE DATOS SOLO DE ALPHAPOL (regla 81).
 *
 * Borra las cuentas de prueba (todas menos los `superadmin` y las que se
 * pidan conservar) con todo lo suyo, y las academias que no son Alphapol con
 * todo lo suyo. NO toca el temario, el banco común ni la configuración de
 * Alphapol. El QUÉ lo decide `app/lib/limpieza.ts` (puro, con tests); este
 * guion solo lo ejecuta.
 *
 * A diferencia de `npm run reset`, este SÍ borra cuentas (`auth.users`): es lo
 * que se pidió —«no hay nadie real registrado, borra todo»—, y por eso se
 * niega a seguir si no quedara ninguna cuenta con la que volver a entrar.
 *
 * USO
 *   npm run limpiar                         enseña lo que borraría y NO borra
 *   npm run limpiar -- --conservar=a@b.com  además conserva esas cuentas
 *   npm run limpiar -- --hazlo              borra, preguntando por la consola
 *   npm run limpiar -- --hazlo --confirmacion=ALPHAPOL   sin terminal
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import { MARCA } from '../../app/lib/marca.ts';
import {
  planLimpieza, trozos,
  TABLAS_POR_USUARIO, TABLAS_POR_GRUPO, TABLAS_POR_PREGUNTA, TABLAS_POR_ACADEMIA, TABLAS_DE_PRUEBA_DE_LA_ACADEMIA,
} from '../../app/lib/limpieza.ts';

config({ path: '.env.local' });

const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const HAZLO = args.includes('--hazlo');
const conservarEmails = (args.find((a) => a.startsWith('--conservar='))?.split('=')[1] ?? '')
  .split(',').map((e) => e.trim()).filter(Boolean);

/** Todas las cuentas de `auth.users`, con su rol de `profiles`. Paginado: listUsers da 50 por página. */
async function leeCuentas() {
  const cuentas = [];
  for (let page = 1; page < 200; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    cuentas.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, role: null })));
    if (data.users.length < 200) break;
  }
  const { data: perfiles, error } = await db.from('profiles').select('id, email, role');
  if (error) throw new Error(`profiles: ${error.message}`);
  const rol = new Map((perfiles ?? []).map((p) => [p.id, p.role]));
  // Un perfil sin cuenta de auth (huérfano) también entra: se borra igual.
  const ids = new Set(cuentas.map((c) => c.id));
  for (const p of perfiles ?? []) if (!ids.has(p.id)) cuentas.push({ id: p.id, email: p.email ?? null, role: p.role, huerfano: true });
  return cuentas.map((c) => ({ ...c, role: c.role ?? rol.get(c.id) ?? null }));
}

/** Cuántas filas cumplen un filtro. `null` si la tabla no responde. */
async function cuenta(tabla, aplica) {
  const { count, error } = await aplica(db.from(tabla).select('*', { count: 'exact', head: true }));
  return error ? null : (count ?? 0);
}

/**
 * Los borrados, como una lista de pasos `{ etiqueta, tabla, aplica }` donde
 * `aplica` añade el filtro. Así el ensayo cuenta EXACTAMENTE lo mismo que
 * luego se borra: una sola descripción para las dos cosas.
 */
async function pasos(plan) {
  const lista = [];
  const idsCuentas = plan.borrarCuentas.map((c) => c.id);

  // 1 · Las academias que no son Alphapol.
  for (const a of plan.borrarAcademias) {
    const { data: grupos } = await db.from('class_groups').select('id').eq('organization_id', a.id);
    const idsGrupos = (grupos ?? []).map((g) => g.id);
    for (const tabla of TABLAS_POR_GRUPO) {
      for (const t of trozos(idsGrupos)) lista.push({ etiqueta: `${a.slug} · grupos`, tabla, aplica: (q) => q.in('class_id', t) });
    }
    lista.push({ etiqueta: `${a.slug}`, tabla: 'class_groups', aplica: (q) => q.eq('organization_id', a.id) });

    const { data: preguntas } = await db.from('question_bank').select('id').eq('organization_id', a.id);
    const idsPreguntas = (preguntas ?? []).map((p) => p.id);
    for (const tabla of TABLAS_POR_PREGUNTA) {
      for (const t of trozos(idsPreguntas)) lista.push({ etiqueta: `${a.slug} · banco privado`, tabla, aplica: (q) => q.in('question_id', t) });
    }
    lista.push({ etiqueta: `${a.slug} · banco privado`, tabla: 'question_bank', aplica: (q) => q.eq('organization_id', a.id) });

    for (const tabla of TABLAS_POR_ACADEMIA) lista.push({ etiqueta: a.slug, tabla, aplica: (q) => q.eq('organization_id', a.id) });
    // Los interruptores de físicas por academia llevan su id dentro del
    // `module_id` (regla 68), no siempre en `organization_id`.
    lista.push({ etiqueta: a.slug, tabla: 'module_settings', aplica: (q) => q.like('module_id', `%:${a.id}`) });
    lista.push({ etiqueta: a.slug, tabla: 'academy_members', aplica: (q) => q.eq('academy_id', a.id) });
    lista.push({ etiqueta: a.slug, tabla: 'academies', aplica: (q) => q.eq('id', a.id) });
  }

  // 2 · Lo de prueba de la propia Alphapol.
  for (const tabla of TABLAS_DE_PRUEBA_DE_LA_ACADEMIA) {
    lista.push({ etiqueta: `${plan.academia.slug} · de prueba`, tabla, aplica: (q) => q.eq('organization_id', plan.academia.id) });
  }

  // 3 · Las cuentas de prueba, con todo lo suyo. `profiles` al final; la
  // cuenta de `auth.users` la borra `deleteUser` después.
  for (const tabla of TABLAS_POR_USUARIO) {
    for (const t of trozos(idsCuentas)) lista.push({ etiqueta: 'cuentas de prueba', tabla, aplica: (q) => q.in('user_id', t) });
  }
  for (const t of trozos(idsCuentas)) lista.push({ etiqueta: 'cuentas de prueba', tabla: 'profiles', aplica: (q) => q.in('id', t) });
  return lista;
}

async function main() {
  console.log(`\nProyecto: ${URL}`);
  console.log(HAZLO ? '\n⚠  MODO REAL: se va a borrar.\n' : '\nEnsayo. No se borra nada. Añade --hazlo para ejecutarlo.\n');

  const [cuentas, { data: academias, error: errAc }] = await Promise.all([
    leeCuentas(),
    db.from('academies').select('id, slug, name'),
  ]);
  if (errAc) throw new Error(`academies: ${errAc.message}`);

  const plan = planLimpieza({ cuentas, academias: academias ?? [], academiaSlug: MARCA.academiaSlug, conservarEmails });

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

  const lista = await pasos(plan);
  console.log('\n  Filas que se borrarían:');
  let total = 0;
  for (const p of lista) {
    const n = await cuenta(p.tabla, p.aplica);
    p.filas = n;
    if (n === null) { console.log(`    ·  ${p.tabla.padEnd(22)} no accesible  (${p.etiqueta})`); continue; }
    if (n > 0) console.log(`    ✱  ${p.tabla.padEnd(22)} ${String(n).padStart(6)}  (${p.etiqueta})`);
    total += n;
  }
  console.log(`\n  Total: ${total} filas y ${plan.borrarCuentas.length} cuentas.`);
  console.log('  NO se tocan: el temario, el banco común de preguntas y fichas, ni la configuración de Alphapol.');

  if (!HAZLO) {
    console.log('\nEnsayo terminado. Nada se ha borrado.\n');
    return;
  }

  const porArgumento = args.find((a) => a.startsWith('--confirmacion='))?.split('=')[1];
  let escrito;
  if (porArgumento !== undefined) escrito = porArgumento;
  else if (!process.stdin.isTTY) {
    console.error('\nSin terminal y sin --confirmacion=ALPHAPOL. No se borra nada.');
    process.exit(1);
  } else {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    escrito = await rl.question(`\nEscribe ALPHAPOL para borrar ${total} filas y ${plan.borrarCuentas.length} cuentas: `);
    rl.close();
  }
  if (escrito.trim() !== 'ALPHAPOL') {
    console.log('Cancelado. No se ha borrado nada.\n');
    return;
  }

  // Varias pasadas: si una tabla falla por una clave ajena que apunta a otra
  // que aún no se ha vaciado, en la siguiente pasada ya puede.
  let pendientes = lista.filter((p) => p.filas !== 0);
  for (let pasada = 1; pasada <= 3 && pendientes.length; pasada++) {
    const fallidos = [];
    for (const p of pendientes) {
      const { error } = await p.aplica(db.from(p.tabla).delete());
      if (error) fallidos.push({ ...p, motivo: error.message });
    }
    pendientes = fallidos;
  }
  for (const p of pendientes) console.log(`  ✗ ${p.tabla} (${p.etiqueta}): ${p.motivo}`);

  let cuentasMal = 0;
  for (const c of plan.borrarCuentas) {
    if (c.huerfano) continue;
    const { error } = await db.auth.admin.deleteUser(c.id);
    if (error) { cuentasMal++; console.log(`  ✗ cuenta ${c.email ?? c.id}: ${error.message}`); }
  }

  console.log('\nComprobando…');
  let restos = 0;
  for (const p of lista) {
    const n = await cuenta(p.tabla, p.aplica);
    if (n) { restos += n; console.log(`  ✗ ${p.tabla} conserva ${n} filas (${p.etiqueta})`); }
  }
  console.log(
    restos === 0 && cuentasMal === 0 && pendientes.length === 0
      ? `\nHecho. Queda ${plan.academia.name} con ${plan.conservar.length} cuenta(s), el temario y el banco.\n`
      : `\nHa quedado algo sin borrar (mira los errores de arriba).\n`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
