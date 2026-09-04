/**
 * CREAR UNA CUENTA DE PRUEBA, YA CONFIRMADA.
 *
 * Va en su propio guion, y no dentro del reset, a propósito: crear cuentas no
 * puede ir pegado a un borrado. Si el reset falla a mitad y el guion aborta, no
 * quiero que se lleve por delante el paso que te devuelve el acceso.
 *
 * POR QUÉ HACE FALTA
 * El proyecto tiene `Confirm email` activado, así que quien se registra por la
 * vía normal no puede entrar hasta pulsar el enlace del correo — y en el plan
 * Free el envío es limitado. Con la clave de servicio se crea con
 * `email_confirm: true` y entra a la primera.
 *
 * `profiles` se rellena a mano porque el rol vive ahí, no en `auth.users`: si
 * hay un trigger que ya crea la fila, el upsert la actualiza en vez de fallar.
 *
 * USO
 *   npm run cuenta -- alumno@ejemplo.com 'unaContraseña' student
 *   npm run cuenta -- jefe@ejemplo.com   'otraContraseña' admin
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';

config({ path: '.env.local' });

// Se normaliza: el panel de Supabase enseña la URL del endpoint REST
// (`…/rest/v1/`) y es la que se copia; el cliente quiere la base.
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const [email, password, rol = 'student'] = process.argv.slice(2);
if (!email || !password) {
  console.error("Uso: npm run cuenta -- correo@ejemplo.com 'contraseña' [student|admin]");
  process.exit(1);
}
if (rol !== 'student' && rol !== 'admin') {
  console.error(`Rol no válido: "${rol}". Solo student o admin.`);
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña necesita al menos 8 caracteres.');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/** Busca la cuenta por correo. `listUsers` pagina: hay que recorrerla. */
async function buscar(correo) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const encontrado = data.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase());
    if (encontrado) return encontrado;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`\nProyecto: ${URL}`);
  const existente = await buscar(email);

  let id;
  if (existente) {
    // Ya existe: se le pone la contraseña pedida y se confirma el correo, en
    // vez de fallar. Volver a ejecutar el guion tiene que dejar el mismo
    // estado, no un error.
    const { data, error } = await db.auth.admin.updateUserById(existente.id, {
      password,
      email_confirm: true,
    });
    if (error) { console.error(`No se pudo actualizar: ${error.message}`); process.exit(1); }
    id = data.user.id;
    console.log(`  · La cuenta ya existía: contraseña puesta y correo confirmado.`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) { console.error(`No se pudo crear: ${error.message}`); process.exit(1); }
    id = data.user.id;
    console.log(`  · Cuenta creada.`);
  }

  // El ROL vive en `profiles`, no en `auth.users`: sin esta fila, la aplicación
  // no sabe si eres alumno o administrador.
  const { error: perfilError } = await db
    .from('profiles')
    .upsert({ id, email, role: rol }, { onConflict: 'id' });

  if (perfilError) {
    console.error(`\nLa cuenta existe pero el perfil no se guardó: ${perfilError.message}`);
    console.error('Sin fila en `profiles` la aplicación no le reconocerá el rol.');
    process.exit(1);
  }

  // Se relee para no fiarse de que la escritura fue lo que se pedía.
  const { data: perfil } = await db.from('profiles').select('email, role').eq('id', id).single();
  console.log(`\n  ${perfil?.email} — rol ${perfil?.role} — id ${id}`);
  console.log(`\nYa puede entrar en https://atenea-eight.vercel.app\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
