/**
 * EL VIGILANTE DE LA NORMATIVA (regla 137; la lógica está en
 * `app/lib/normativa.ts`).
 *
 * Para cada pregunta del banco (activas y pendientes) mira la norma y el
 * artículo que cita, baja del BOE el texto consolidado de esa norma con TODAS
 * las versiones de cada artículo, y si alguna versión entra en vigor después
 * de la fecha de la pregunta —o la norma está derogada— deja un aviso en la
 * bandeja «Revisión» (`question_reports`, tipo `vigencia`). Los actos de la
 * UE se miran en Cellar (SPARQL): qué actos los modifican y cuándo.
 *
 *   npm run normativa                ENSAYO: lo cuenta todo, no escribe nada
 *   npm run normativa -- --hazlo     deja los avisos nuevos y avisa por correo
 *   npm run normativa -- --hazlo --maximo=800   sube el tope de avisos de una vez
 *   npm run normativa -- --desde=20260101       barrido hacia atrás: trata cada
 *       pregunta como escrita ese día (o antes, si lo es), para ver qué ha
 *       cambiado desde entonces en lo que cita el banco
 *   npm run normativa -- --pendientes           solo las pendientes (un lote nuevo)
 *
 * QUÉ NO HACE
 *  · No toca ninguna pregunta: decide quien sabe (sigue valiendo, se corrige,
 *    se retira). Un cambio en el artículo no quiere decir que la pregunta esté
 *    mal: muchas veces cambia otro apartado.
 *  · No repite un aviso: si esta pregunta ya tuvo ESTE aviso (abierto o
 *    archivado), no lo vuelve a dejar. El texto del aviso es determinista.
 *  · Si de una vez saldrían más avisos que el tope (400), no escribe ninguno:
 *    eso huele a fallo del lector, no a una reforma, y se mira antes.
 *
 * Necesita la clave de servicio (va por GitHub Actions: «Vigilancia de la
 * normativa», dos veces por semana, y «Operación» → normativa-ensayo). Con
 * RESEND_API_KEY manda el resumen por correo a los admin.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSupabaseUrl } from '../../app/lib/supabase-url.ts';
import {
  NO_VIGILADAS, TIPO_REPORTE_VIGENCIA, citasDeLaPregunta, cabeceraDelTemario, busquedaBoe, celexDe, eligePorTexto,
  bloquesDelXml, indicePorPrecepto, cambiosPosteriores, esTextoDerogado, fecha8, fechaLegible, preceptoLegible,
  avisoDeBloque, avisoDeBloqueDerogado, avisoDeNormaDerogada, avisoDeActoUE, agrupaAvisos, familiaDeArticulo, preceptoDelRotulo, huellaDeAviso,
} from '../../app/lib/normativa.ts';
import { plantillaCambiosNormativa } from '../../app/lib/app-email-templates.ts';
import { remitenteCorreo } from '../../app/lib/marca.ts';
import { UNA_SOLA_ACADEMIA } from '../../app/lib/permisos-banco.ts';

config({ path: '.env.local' });

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HAZLO = process.argv.includes('--hazlo');
const MAXIMO = Number(process.argv.find((a) => a.startsWith('--maximo='))?.split('=')[1] ?? 400);
const DESDE = process.argv.find((a) => a.startsWith('--desde='))?.split('=')[1]?.replace(/-/g, '') || null;
// Solo las pendientes: para el barrido de un lote nuevo (el Tomo), cuya fecha
// real es la de su edición y no la de subida, sin tocar las activas.
const SOLO_PENDIENTES = process.argv.includes('--pendientes');
if (DESDE && !/^\d{8}$/.test(DESDE)) { console.error(`--desde tiene que ser una fecha AAAAMMDD; llegó «${DESDE}».`); process.exit(1); }
const URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const BOE = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada';
const SPARQL = 'https://publications.europa.eu/webapi/rdf/sparql';
const CABECERAS = { 'User-Agent': 'Alphapol-Campus/1.0 (vigilancia de la normativa del temario; +https://atenea-eight.vercel.app)' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Todas las filas, de 1.000 en 1.000: PostgREST corta ahí sin avisar (regla 74). */
async function todas(pedir, etiqueta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) { console.error(`No se pudo leer ${etiqueta}:`, error.message); process.exit(1); }
    filas.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return filas;
}

/**
 * GET con dos reintentos: el BOE a veces corta una descarga grande. Con tope de
 * 90 s por petición: sin él, un servidor que se queda callado deja la ejecución
 * esperando hasta que GitHub la mata.
 */
async function pedir(url, accept) {
  for (let intento = 1; ; intento++) {
    try {
      const res = await fetch(url, { headers: { ...CABECERAS, Accept: accept }, signal: AbortSignal.timeout(90_000) });
      if (res.status === 404) return { estado: 404, texto: '' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { estado: 200, texto: await res.text() };
    } catch (e) {
      if (intento >= 3) return { estado: 0, texto: '', error: e instanceof Error ? e.message : String(e) };
      await espera(2000 * intento);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Lo que hay que vigilar
// ---------------------------------------------------------------------------

const preguntas = await todas(
  (d, h) => db.from('question_bank')
    .select('id, status, subject_id, document_id, legal_reference, question_text, explanation, created_at, organization_id')
    .in('status', SOLO_PENDIENTES ? ['candidate'] : ['active', 'candidate']).order('id').range(d, h),
  'question_bank',
);
const temas = await todas((d, h) => db.from('subjects').select('id, topic_number').order('id').range(d, h), 'subjects');
const temaDe = new Map(temas.map((s) => [s.id, s.topic_number]));
// Sin `full_text`: es el temario entero.
const documentos = await todas((d, h) => db.from('documents').select('id, filename').order('id').range(d, h), 'documents');

const manifiesto = JSON.parse(await readFile(join(RAIZ, 'temario', 'temario.json'), 'utf8'));
const temaDelManifiesto = new Map(manifiesto.temas.map((t) => [t.numero, t]));

/** documento → normas de esa parte del temario y día en que se generó. */
const cabeceras = new Map();
for (const doc of documentos) {
  const ruta = join(RAIZ, 'temario', 'md', `${doc.filename}.md`);
  if (doc.filename && existsSync(ruta)) cabeceras.set(doc.id, cabeceraDelTemario(await readFile(ruta, 'utf8')));
}

const cuenta = { preguntas: preguntas.length, sinReferencia: 0, sinNorma: 0, noVigiladas: 0, normaEntera: 0, conCita: 0 };
/** pregunta → { fecha, citas } */
const vigiladas = [];
const sinLocalizar = new Map(); // motivo → n
const anotaPrevio = (motivo) => sinLocalizar.set(motivo, (sinLocalizar.get(motivo) ?? 0) + 1);
for (const q of preguntas) {
  if (!q.legal_reference?.trim()) { cuenta.sinReferencia++; continue; }
  const cab = cabeceras.get(q.document_id);
  const todasLasCitas = citasDeLaPregunta(q.legal_reference, temaDelManifiesto.get(temaDe.get(q.subject_id)), cab?.boes);
  if (todasLasCitas.length === 0) { cuenta.sinNorma++; anotaPrevio('la referencia no cita un precepto reconocible'); continue; }
  const citas = todasLasCitas.filter((c) => !c.norma || !NO_VIGILADAS.has(c.norma));
  if (citas.length === 0) { cuenta.noVigiladas++; continue; }
  const fechas = [fecha8(q.created_at), cab?.generado, DESDE].filter(Boolean).sort();
  vigiladas.push({ q, fecha: fechas[0], citas });
}

// ---------------------------------------------------------------------------
// 2. Cada norma en su fuente
// ---------------------------------------------------------------------------

/** nombre → id del BOE (lo que no tiene identificador fijo se busca por rango y número). */
const idPorNombre = new Map();
/** id del BOE → { nombre, metadatos, indice, error } */
const normasBoe = new Map();
const fallosResolver = [];

const nombresPorBuscar = new Set();
const idsNecesarios = new Set();
const celexNecesarios = new Map(); // celex → nombre
for (const { citas } of vigiladas) {
  for (const c of citas) {
    if (c.boe) idsNecesarios.add(c.boe);
    else if (c.norma && busquedaBoe(c.norma)) nombresPorBuscar.add(c.norma);
    else if (c.norma && celexDe(c.norma)) celexNecesarios.set(celexDe(c.norma), c.norma);
    for (const cand of c.candidatas ?? []) idsNecesarios.add(cand.boe);
  }
}

for (const nombre of nombresPorBuscar) {
  const { rango, numero } = busquedaBoe(nombre);
  const consulta = encodeURIComponent(JSON.stringify({ query: { query_string: { query: `numero_oficial:${numero}` } } }));
  const r = await pedir(`${BOE}?query=${consulta}&limit=50`, 'application/json');
  await espera(250);
  let datos = [];
  try { datos = JSON.parse(r.texto || '{}')?.data ?? []; } catch { datos = []; }
  const estatales = datos.filter((d) => d.numero_oficial === numero && d.rango?.texto === rango && d.ambito?.codigo === '1');
  if (estatales.length !== 1) {
    fallosResolver.push(`${nombre}: ${estatales.length === 0 ? 'no está en la legislación consolidada del BOE' : `${estatales.length} normas con ese número`}${r.error ? ` (${r.error})` : ''}`);
    continue;
  }
  idPorNombre.set(nombre, estatales[0].identificador);
  idsNecesarios.add(estatales[0].identificador);
  normasBoe.set(estatales[0].identificador, { nombre, metadatos: estatales[0] });
}

for (const id of idsNecesarios) {
  const previa = normasBoe.get(id) ?? { nombre: null };
  let metadatos = previa.metadatos;
  if (!metadatos) {
    const r = await pedir(`${BOE}/id/${id}/metadatos`, 'application/json');
    if (r.estado === 404) { normasBoe.set(id, { ...previa, error: 'no está en la legislación consolidada (tratado o documento del diario)' }); continue; }
    try { metadatos = JSON.parse(r.texto)?.data?.[0]; } catch { metadatos = null; }
    if (!metadatos) { normasBoe.set(id, { ...previa, error: `sin metadatos${r.error ? ` (${r.error})` : ''}` }); continue; }
  }
  const t = await pedir(`${BOE}/id/${id}/texto`, 'application/xml');
  await espera(400);
  if (!t.texto) { normasBoe.set(id, { ...previa, metadatos, error: `no se pudo bajar el texto${t.error ? ` (${t.error})` : ''}` }); continue; }
  const bloques = bloquesDelXml(t.texto);
  normasBoe.set(id, { ...previa, metadatos, indice: indicePorPrecepto(bloques), bloques: bloques.length, lista: bloques });
}

/** Cellar: los actos que modifican cada acto de la UE, con su fecha. */
const modificadoresUE = new Map();
for (const [celex, nombre] of celexNecesarios) {
  const consulta = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    SELECT DISTINCT ?celex ?fecha WHERE { ?w cdm:resource_legal_id_celex "${celex}"^^xsd:string .
    ?x cdm:resource_legal_amends_resource_legal ?w . ?x cdm:resource_legal_id_celex ?celex . ?x cdm:work_date_document ?fecha }`;
  const r = await pedir(`${SPARQL}?query=${encodeURIComponent(consulta)}&format=${encodeURIComponent('application/sparql-results+json')}`, 'application/sparql-results+json');
  await espera(250);
  try {
    const filas = JSON.parse(r.texto).results.bindings.map((b) => ({ celex: b.celex.value, fecha: b.fecha.value }));
    modificadoresUE.set(celex, { nombre, filas });
  } catch {
    modificadoresUE.set(celex, { nombre, filas: null, error: r.error ?? 'respuesta ilegible' });
  }
}

// ---------------------------------------------------------------------------
// 3. Los avisos
// ---------------------------------------------------------------------------

const avisos = []; // { question_id, organization_id, message, clave, enunciado }
const anota = anotaPrevio;

for (const { q, fecha, citas } of vigiladas) {
  let alguna = false;
  for (const c of citas) {
    let id = c.boe ?? (c.norma ? idPorNombre.get(c.norma) : null);
    let nombre = c.norma;
    // Varias candidatas por el tema: vale la única que de verdad tiene ese
    // precepto y, si son dos, la que nombra la propia explicación.
    if (!id && c.candidatas?.length) {
      const conPrecepto = c.candidatas.filter((cand) => normasBoe.get(cand.boe)?.indice?.has(c.precepto));
      const elegida = conPrecepto.length === 1 ? conPrecepto[0] : eligePorTexto(conPrecepto, `${q.explanation ?? ''} ${q.question_text ?? ''}`);
      if (elegida) { id = elegida.boe; nombre = elegida.nombre; }
      else { anota(`${conPrecepto.length === 0 ? 'el tema no tiene ese precepto en ninguna de sus normas' : 'dos normas del tema tienen ese precepto y la explicación no dice cuál'} (tema ${temaDe.get(q.subject_id) ?? '¿?'})`); continue; }
    }
    const celex = c.norma ? celexDe(c.norma) : null;
    if (!id && celex) {
      const ue = modificadoresUE.get(celex);
      if (!ue?.filas) { anota(`UE: no se pudo consultar ${c.norma}`); continue; }
      alguna = true;
      for (const m of ue.filas) {
        if (m.fecha.replace(/-/g, '') > fecha) {
          avisos.push({ question_id: q.id, organization_id: q.organization_id, enunciado: q.question_text, clave: c.norma, cambio: `${m.celex} (${fechaLegible(m.fecha.replace(/-/g, ''))})`, message: avisoDeActoUE({ norma: c.norma, modificador: m.celex, fecha: m.fecha }) });
        }
      }
      continue;
    }
    if (!id) { anota(c.norma ? `sin identificar en el BOE: ${c.norma}` : 'la referencia no dice la ley y el tema no la deja clara'); continue; }
    const norma = normasBoe.get(id);
    if (!norma || norma.error) { anota(`${nombre ?? id}: ${norma?.error ?? 'no descargada'}`); continue; }
    nombre = nombre ?? norma.nombre ?? id;
    alguna = true;

    if (norma.metadatos?.vigencia_agotada === 'S') {
      avisos.push({ question_id: q.id, organization_id: q.organization_id, enunciado: q.question_text, clave: `${nombre} (derogada)`, cambio: 'derogada', message: avisoDeNormaDerogada({ norma: nombre, boe: id }) });
      continue;
    }
    if (!c.precepto) { cuenta.normaEntera++; continue; }
    // «588 ter» sin letra: se vigilan todos sus artículos con letra (588 ter a … m).
    const familia = norma.indice.has(c.precepto) ? [] : familiaDeArticulo(norma.indice, c.precepto);
    const bloques = norma.indice.has(c.precepto) ? [norma.indice.get(c.precepto)] : familia;
    if (bloques.length === 0) {
      // Con los rótulos que más se le parecen, tal cual vienen: si el lector no
      // entiende cómo rotula el BOE una norma, aquí se ve.
      const num = /\d+/.exec(c.precepto)?.[0];
      const mismoNumero = new RegExp(`(^|\\D)${num}(\\D|$)`);
      const parecidos = num ? norma.lista.filter((b) => mismoNumero.test(b.id) || mismoNumero.test(b.titulo ?? '')).slice(0, 3).map((b) => `${b.id}=${JSON.stringify(b.titulo)}`).join(', ') : '';
      // Sin parecidos, una muestra de cómo rotula el BOE esa norma.
      const muestra = parecidos || norma.lista.filter((b) => /^art/i.test(b.titulo ?? '')).slice(60, 63).map((b) => `${b.id}=${JSON.stringify(b.titulo)}`).join(', ');
      anota(`${nombre}: no tiene ${preceptoLegible(c.precepto)}${muestra ? ` (en el BOE: ${muestra})` : ''}`);
      continue;
    }
    for (const bloque of bloques) for (const v of cambiosPosteriores(bloque, fecha)) {
      const precepto = familia.length ? (preceptoDelRotulo(bloque.titulo) ?? c.precepto) : c.precepto;
      const datos = { norma: nombre, precepto, boe: id, bloque: bloque.id, version: v };
      avisos.push({
        question_id: q.id,
        organization_id: q.organization_id,
        enunciado: q.question_text,
        clave: `${nombre}, ${preceptoLegible(precepto)}`,
        cambio: `${fechaLegible(v.vigencia ?? v.publicacion)}${v.norma && v.norma !== id ? ` · ${v.norma}` : ''}`,
        message: esTextoDerogado(v.texto ?? '') ? avisoDeBloqueDerogado(datos) : avisoDeBloque(datos),
      });
    }
  }
  if (alguna) cuenta.conCita++; else cuenta.sinNorma++;
}

// Lo que ya se avisó (abierto o archivado) no se repite.
const previos = await todas(
  (d, h) => db.from('question_reports').select('id, question_id, message').eq('report_type', TIPO_REPORTE_VIGENCIA).order('id').range(d, h),
  'question_reports',
);
// Por la huella (enlace, fechas y normas), no por el texto: el nombre de la norma puede cambiar.
const yaAvisado = new Set(previos.map((r) => `${r.question_id}|${huellaDeAviso(r.message)}`));
const vistos = new Set();
const nuevos = avisos.filter((a) => {
  const k = `${a.question_id}|${huellaDeAviso(a.message)}`;
  if (yaAvisado.has(k) || vistos.has(k)) return false;
  vistos.add(k);
  return true;
});

// ---------------------------------------------------------------------------
// 4. El informe
// ---------------------------------------------------------------------------

const lineas = [];
const di = (t = '') => { console.log(t); lineas.push(t); };
di(`## Vigilancia de la normativa · ${new Date().toISOString().slice(0, 10)}${HAZLO ? '' : ' · ENSAYO (no escribe)'}${DESDE ? ` · cambios desde el ${DESDE}` : ''}${SOLO_PENDIENTES ? ' · solo pendientes' : ''}`);
di();
di(`- Preguntas activas y pendientes: **${cuenta.preguntas}**`);
di(`- Con una norma vigilada localizada: **${cuenta.conCita}** · sin referencia legal: ${cuenta.sinReferencia} · solo Tratados/Schengen: ${cuenta.noVigiladas} · sin localizar: ${cuenta.sinNorma}`);
di(`- Normas del BOE vigiladas: **${[...normasBoe.values()].filter((n) => n.indice).length}** · de la UE: **${[...modificadoresUE.values()].filter((n) => n.filas).length}**`);
di(`- Avisos: **${nuevos.length} nuevos** (${avisos.length - nuevos.length} ya estaban dados)`);
di();
if (nuevos.length) {
  di('### Lo que ha cambiado después de escribir la pregunta');
  di();
  di('| Norma y precepto | En vigor desde · lo cambia | Preguntas |');
  di('|---|---|---|');
  const porCambio = agrupaAvisos(nuevos.map((a) => ({ clave: `${a.clave} | ${a.cambio}` })));
  for (const g of porCambio.slice(0, 80)) di(`| ${g.clave} | ${g.n} |`);
  di();
  di('<details><summary>Las preguntas</summary>');
  di();
  for (const a of [...nuevos].sort((x, y) => x.clave.localeCompare(y.clave)).slice(0, 300)) {
    di(`- **${a.clave}** · ${(a.enunciado ?? '').replace(/\s+/g, ' ').slice(0, 110)} · \`${a.question_id.slice(0, 8)}\``);
  }
  di();
  di('</details>');
  di();
}
const conError = [...normasBoe].filter(([, n]) => n.error);
if (fallosResolver.length || conError.length) {
  di('### Normas que no se han podido mirar');
  di();
  for (const f of fallosResolver) di(`- ${f}`);
  for (const [id, n] of conError) di(`- ${n.nombre ?? id} (${id}): ${n.error}`);
  di();
}
if (sinLocalizar.size) {
  di('### Citas que no se han podido localizar');
  di();
  for (const [motivo, n] of [...sinLocalizar].sort((a, b) => b[1] - a[1]).slice(0, 25)) di(`- ${n} · ${motivo}`);
  di();
}
di('<details><summary>Normas vigiladas</summary>');
di();
for (const [id, n] of normasBoe) if (n.indice) di(`- ${n.nombre ?? n.metadatos?.titulo?.slice(0, 70) ?? id} · ${id} · ${n.bloques} bloques · actualizada ${n.metadatos?.fecha_actualizacion?.slice(0, 8) ?? '¿?'}${n.metadatos?.vigencia_agotada === 'S' ? ' · DEROGADA' : ''}`);
for (const [celex, n] of modificadoresUE) if (n.filas) di(`- ${n.nombre} · CELEX ${celex} · ${n.filas.length} actos que la modifican`);
di();
di('</details>');

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lineas.join('\n')}\n`);

const vigilable = [...normasBoe.values()].filter((n) => n.indice).length;
if (idsNecesarios.size > 0 && vigilable === 0) {
  console.error('\nNo se ha podido bajar NINGUNA norma del BOE: no se ha vigilado nada.');
  process.exit(1);
}

if (!HAZLO) { console.log('\nENSAYO: no se ha escrito nada. Para dejar los avisos: --hazlo'); process.exit(0); }
if (nuevos.length === 0) { console.log('\nNada nuevo que avisar.'); process.exit(0); }
if (nuevos.length > MAXIMO) {
  console.error(`\n${nuevos.length} avisos de una vez es más que el tope (${MAXIMO}). No se escribe nada: mira el informe y, si es una reforma de verdad, vuelve a lanzarlo con --maximo=${nuevos.length}.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5. Escribir y avisar
// ---------------------------------------------------------------------------

let escritos = 0;
for (let i = 0; i < nuevos.length; i += 100) {
  const tanda = nuevos.slice(i, i + 100).map((a) => ({
    question_id: a.question_id, report_type: TIPO_REPORTE_VIGENCIA, message: a.message, status: 'open', user_id: null,
  }));
  const { error } = await db.from('question_reports').insert(tanda);
  if (error) { console.error('No se pudieron guardar los avisos:', error.message); process.exit(1); }
  escritos += tanda.length;
}
console.log(`\nEscritos ${escritos} avisos en «Revisión».`);

// La línea de «Novedades» (regla 138): los tutores se enteran aunque no llegue el correo.
{
  const grupos = agrupaAvisos(nuevos);
  const preguntasAfectadas = new Set(nuevos.map((a) => a.question_id)).size;
  const { error } = await db.from('novedades').insert({
    tipo: 'vigilancia',
    titulo: `Cambios en la ley: ${grupos.length} ${grupos.length === 1 ? 'precepto' : 'preceptos'} que citan ${preguntasAfectadas} ${preguntasAfectadas === 1 ? 'pregunta' : 'preguntas'}`,
    detalle: grupos.slice(0, 4).map((g) => `${g.clave} (${g.n})`).join(' · ') + (grupos.length > 4 ? ` y ${grupos.length - 4} más` : ''),
    organization_id: null,
  });
  if (error) console.error('No se pudo anotar la novedad:', error.message);
}

// El correo: a los admin de la academia de cada pregunta; las del banco global,
// al superadmin y —con una sola academia (regla 123)— también a sus admin.
const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.log('Sin RESEND_API_KEY: no se manda correo (los avisos ya están en «Revisión»).');
  process.exit(0);
}
const [{ data: academias }, { data: miembros }, { data: perfiles }] = await Promise.all([
  db.from('academies').select('id, slug, name'),
  db.from('academy_members').select('academy_id, user_id'),
  db.from('profiles').select('id, email, role').in('role', ['admin', 'superadmin']),
]);
const perfil = new Map((perfiles ?? []).map((p) => [p.id, p]));
const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://atenea-eight.vercel.app';
for (const academia of academias ?? []) {
  const suyos = nuevos.filter((a) => a.organization_id === academia.id || (a.organization_id === null && UNA_SOLA_ACADEMIA));
  if (suyos.length === 0) continue;
  const correos = new Set((miembros ?? []).filter((m) => m.academy_id === academia.id).map((m) => perfil.get(m.user_id)).filter((p) => p?.role === 'admin' && p.email).map((p) => p.email));
  for (const p of perfiles ?? []) if (p.role === 'superadmin' && p.email) correos.add(p.email);
  if (correos.size === 0) continue;
  const { subject, html } = plantillaCambiosNormativa({
    academiaName: academia.name, total: suyos.length, grupos: agrupaAvisos(suyos), panelUrl: `${sitio}/${academia.slug}`,
  });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: remitenteCorreo(), to: [...correos], subject, html }),
  });
  console.log(res.ok ? `Correo mandado a ${correos.size} persona(s) de ${academia.name}.` : `Resend respondió ${res.status}: ${await res.text().catch(() => '')}`);
}
