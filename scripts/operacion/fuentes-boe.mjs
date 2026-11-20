/**
 * Leer del BOE las normas que cita el banco, con el TEXTO vigente de cada
 * precepto (reglas 137 y 138). Lo usan los guiones que proponen mejoras y que
 * repasan preguntas contra la ley; el vigilante (vigilar-normativa.mjs) solo
 * necesita las fechas de cada versión y lleva su propia lectura.
 *
 * API de datos abiertos del BOE, sin clave. Con tope de tiempo por petición y
 * reintentos: el BOE a veces corta una descarga grande.
 */
import { busquedaBoe, preceptoDelRotulo, NORMAS_FIJAS } from '../../app/lib/normativa.ts';
import { parsearTexto } from '../temario/boe.mjs';

const BOE = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada';
const CABECERAS = { 'User-Agent': 'Alphapol-Campus/1.0 (revisión del banco de preguntas; +https://atenea-eight.vercel.app)' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function pedir(url, accept) {
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

/** El identificador del BOE de una norma por su nombre corto («LO 4/2000»), o `null`. */
export async function idDeNorma(nombre) {
  if (NORMAS_FIJAS[nombre]) return NORMAS_FIJAS[nombre];
  const b = busquedaBoe(nombre);
  if (!b) return null;
  const consulta = encodeURIComponent(JSON.stringify({ query: { query_string: { query: `numero_oficial:${b.numero}` } } }));
  const r = await pedir(`${BOE}?query=${consulta}&limit=50`, 'application/json');
  await espera(250);
  let datos = [];
  try { datos = JSON.parse(r.texto || '{}')?.data ?? []; } catch { datos = []; }
  const estatales = datos.filter((d) => d.numero_oficial === b.numero && d.rango?.texto === b.rango && d.ambito?.codigo === '1');
  return estatales.length === 1 ? estatales[0].identificador : null;
}

/**
 * El texto vigente de una norma, por precepto: `Map<'art:69', { id, titulo, texto }>`.
 * `null` si no está en la legislación consolidada (tratados del diario) o no se pudo bajar.
 */
export async function textoPorPrecepto(boeId) {
  const r = await pedir(`${BOE}/id/${boeId}/texto`, 'application/xml');
  await espera(400);
  if (!r.texto) return null;
  let bloques;
  try { ({ bloques } = parsearTexto(r.texto)); } catch { return null; }
  const mapa = new Map();
  for (const b of bloques) {
    // El BOE escribe el espacio de «64&#160;bis» como entidad (regla 137).
    const titulo = (b.titulo ?? '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
    const p = b.tipo === 'preambulo' || b.id === 'preambulo' ? 'preambulo' : preceptoDelRotulo(titulo);
    if (!p || mapa.has(p)) continue;
    mapa.set(p, { id: b.id, titulo: b.titulo, texto: b.parrafos.map((x) => x.texto).join('\n') });
  }
  return mapa;
}
