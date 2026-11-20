/**
 * EL VIGILANTE DE LA CONVOCATORIA (regla 141; la lógica está en
 * `app/lib/convocatoria-boe.ts`).
 *
 * Lee el sumario diario del BOE de los últimos días y, si aparece algo de la
 * oposición de Escala Básica de la Policía Nacional (la convocatoria, la lista
 * de admitidos, el tribunal, la fecha del ejercicio, los resultados) o la
 * oferta de empleo público del Estado, deja una línea en «Novedades» con el
 * enlace al texto oficial.
 *
 *   npm run convocatoria                 ENSAYO: cuenta y enseña, no escribe
 *   npm run convocatoria -- --hazlo      deja las novedades nuevas
 *   npm run convocatoria -- --dias=30    mira los últimos 30 días (por defecto 10, máximo 60)
 *
 * QUÉ NO HACE
 *  · No toca la fecha de examen de «Convocatoria» (la fija el admin, regla 64):
 *    solo avisa de que hay algo nuevo.
 *  · No repite un aviso: la marca `[BOE-A-…]` queda en el detalle y se busca ahí.
 *    Por eso se puede mirar 10 días hacia atrás cada día sin avisar dos veces.
 *  · No calla un fallo: si el BOE no contesta ningún día, falla (un vigilante
 *    mudo parece uno tranquilo).
 *
 * Solo escribe en `novedades`. Necesita la clave de servicio, y el BOE no se
 * alcanza desde la nube de Claude: va por GitHub Actions («Vigilancia de la
 * convocatoria», cada día, y «Operación» → convocatoria-ensayo).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { appendFile } from 'node:fs/promises';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import {
  TIPO_NOVEDAD_CONVOCATORIA, itemsDelSumario, halladosEnElDia, existeAviso, novedadDeHallazgo, ultimosDias, diaLegible,
} from '../../app/lib/convocatoria-boe.ts';

config({ path: '.env.local' });

const HAZLO = process.argv.includes('--hazlo');
const DIAS = Number(process.argv.find((a) => a.startsWith('--dias='))?.split('=')[1] ?? 10);
if (!Number.isInteger(DIAS) || DIAS < 1 || DIAS > 60) { console.error(`--dias tiene que ser un entero entre 1 y 60; llegó «${DIAS}».`); process.exit(1); }
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const SUMARIO = 'https://www.boe.es/datosabiertos/api/boe/sumario';
const CABECERAS = { 'User-Agent': 'Alphapol-Campus/1.0 (vigilancia de la convocatoria; +https://atenea-eight.vercel.app)', Accept: 'application/json' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET con dos reintentos y tope de 60 s (un servidor callado no cuelga la ejecución). 404 = ese día no hubo BOE. */
async function pide(dia) {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(`${SUMARIO}/${dia}`, { headers: CABECERAS, signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) return { estado: 404 };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { estado: 200, json: await res.json() };
    } catch (e) {
      if (intento >= 3) return { estado: 0, error: e instanceof Error ? e.message : String(e) };
      await espera(2000 * intento);
    }
  }
}

const dias = ultimosDias(DIAS, new Date());
const cuenta = { dias: dias.length, conBoe: 0, sinBoe: 0, fallidos: 0, disposiciones: 0 };
const fallos = [];
const hallados = [];
for (const dia of dias) {
  const r = await pide(dia);
  if (r.estado === 404) { cuenta.sinBoe++; continue; }
  if (r.estado === 0) { cuenta.fallidos++; fallos.push(`${diaLegible(dia)}: ${r.error}`); continue; }
  cuenta.conBoe++;
  const items = itemsDelSumario(r.json);
  cuenta.disposiciones += items.length;
  hallados.push(...halladosEnElDia(items, dia));
  await espera(300);
}

// Un día con BOE y cero disposiciones es un sumario que no se supo leer, no un día tranquilo.
if (cuenta.conBoe > 0 && cuenta.disposiciones === 0) fallos.push('el sumario llegó pero no se reconoció ninguna disposición: ha cambiado su forma');

// Lo ya avisado, para no repetir (regla 120: el aviso solo cuenta si la BD lo aceptó).
const guardados = [];
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await db.from('novedades').select('detalle').eq('tipo', TIPO_NOVEDAD_CONVOCATORIA).order('id').range(desde, desde + 999);
  if (error) { console.error('No se pudo leer novedades:', error.message); process.exit(1); }
  guardados.push(...(data ?? []).map((n) => n.detalle ?? ''));
  if ((data ?? []).length < 1000) break;
}
const nuevos = hallados.filter((h) => !existeAviso(guardados, h.id));

const lineas = [
  `## Vigilancia de la convocatoria (${HAZLO ? 'escribe' : 'ensayo'})`,
  '',
  `Días mirados: ${cuenta.dias} · con BOE: ${cuenta.conBoe} · sin BOE: ${cuenta.sinBoe} · fallidos: ${cuenta.fallidos} · disposiciones leídas: ${cuenta.disposiciones}`,
  `Hallazgos: ${hallados.length} · ya avisados: ${hallados.length - nuevos.length} · nuevos: ${nuevos.length}`,
  ...nuevos.map((h) => `- ${diaLegible(h.dia)} · ${h.clase} · ${h.id} · ${h.titulo}`),
  ...fallos.map((f) => `- FALLO ${f}`),
];
console.log(lineas.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

if (HAZLO) {
  for (const h of nuevos) {
    const { error } = await db.from('novedades').insert({ ...novedadDeHallazgo(h), organization_id: null });
    if (error) { console.error(`No se pudo dejar el aviso de ${h.id}:`, error.message); process.exit(1); }
  }
}

// Un día sin BOE no es un fallo; que no conteste ninguno, o que cambie la forma, sí.
if (cuenta.conBoe === 0 || fallos.length > 0) {
  console.error(cuenta.conBoe === 0 ? 'El BOE no contestó ningún día.' : 'Hubo fallos al leer el BOE: mira el informe.');
  process.exit(1);
}
