/**
 * Lectura de la legislacion consolidada del BOE.
 *
 * La API sirve el texto YA PARTIDO en bloques, y cada precepto trae su rotulo
 * (`titulo="Articulo 49"`). Eso es justo lo que en la plataforma se deducia con
 * expresiones regulares sobre el texto plano, y esa deduccion ya costo una tanda
 * de referencias falsas (P1f: el articulo 37 citado como el 30). Aqui la
 * referencia viene de la fuente.
 *
 *   https://www.boe.es/datosabiertos/api/legislacion-consolidada/id/{ID}/texto
 *
 * El endpoint /texto NO admite `Accept: application/json` (responde 400); solo
 * XML. El de /metadatos si da JSON.
 */

import { palabrasANumero } from '../../app/lib/chat.ts';

/**
 * Cortesia, no necesidad: el BOE sirve el documento igual sin esto. Se manda
 * para que, si algun dia limitan por robots, el aviso llegue a alguien.
 */
const CABECERAS = {
  'User-Agent': 'Atenea-Policial/1.0 (temario para preparacion de oposiciones; +https://atenea-eight.vercel.app)',
};

const BASE = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada/id';

async function pedir(url, accept) {
  const res = await fetch(url, { headers: { ...CABECERAS, Accept: accept } });
  if (!res.ok) throw new Error(`El BOE respondio ${res.status} a ${url}`);
  return res.text();
}

export async function descargarMetadatos(id) {
  const crudo = await pedir(`${BASE}/${id}/metadatos`, 'application/json');
  const json = JSON.parse(crudo);
  const datos = json?.data?.[0];
  if (!datos) throw new Error(`${id}: la respuesta de metadatos no trae datos.`);
  return datos;
}

export async function descargarTexto(id) {
  return pedir(`${BASE}/${id}/texto`, 'application/xml');
}

/** Quita el marcado de un parrafo y deja el texto. Dentro solo hay <a>. */
function textoDe(fragmento) {
  return fragmento
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[  ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * De las versiones de un bloque, la que esta en vigor HOY.
 *
 * Esto no es un detalle de formato: en la Constitucion, el articulo 49 trae la
 * redaccion de 1978 y la reforma de 2024, el 135 la de 2011 y el 69 la de 2026.
 * Quedarse con la primera version --que es lo que sale de leer el XML en
 * orden-- seria servirle al alumno un texto DEROGADO con toda la seguridad del
 * mundo. Y la reforma del 49 es de las que caen.
 *
 * Se descartan las versiones con entrada en vigor futura: existen, y no son lo
 * que se pregunta hoy.
 */
function versionVigente(versiones, hoy) {
  const enVigor = versiones.filter((v) => !v.fecha_vigencia || v.fecha_vigencia <= hoy);
  const candidatas = enVigor.length > 0 ? enVigor : versiones;
  return candidatas.reduce((mejor, v) =>
    (v.fecha_vigencia ?? '') >= (mejor.fecha_vigencia ?? '') ? v : mejor
  );
}

/**
 * Convierte el XML del BOE en bloques manejables.
 *
 * Cada bloque conserva su `id` (`a49`, `tpreliminar`, `df`) porque es lo que el
 * manifiesto usa para decir que entra en cada tema, y su `titulo`, que acabara
 * siendo la referencia legal del fragmento indexado.
 */
export function parsearTexto(xml, hoy = new Date().toISOString().slice(0, 10).replace(/-/g, '')) {
  const bloques = [];
  const futuros = [];

  const re = /<bloque id="([^"]+)" tipo="([^"]+)"(?: titulo="([^"]*)")?>([\s\S]*?)<\/bloque>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const [, id, tipo, titulo, cuerpo] = m;

    const versiones = [];
    const reV = /<version ([^>]*)>([\s\S]*?)<\/version>/g;
    let v;
    while ((v = reV.exec(cuerpo)) !== null) {
      const atributos = v[1];
      versiones.push({
        fecha_vigencia: /fecha_vigencia="(\d+)"/.exec(atributos)?.[1] ?? null,
        id_norma: /id_norma="([^"]+)"/.exec(atributos)?.[1] ?? null,
        parrafos: [...v[2].matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)]
          .map((p) => ({ clase: p[1], texto: textoDe(p[2]) }))
          .filter((p) => p.texto),
      });
    }
    if (versiones.length === 0) continue;

    const elegida = versionVigente(versiones, hoy);
    if (versiones.some((x) => x.fecha_vigencia && x.fecha_vigencia > hoy)) futuros.push(id);

    bloques.push({
      id,
      tipo,
      titulo: titulo ? textoDe(titulo) : null,
      vigente_desde: elegida.fecha_vigencia,
      reformado_por: elegida.id_norma,
      parrafos: elegida.parrafos,
    });
  }

  if (bloques.length === 0) throw new Error('El XML del BOE no ha producido ningun bloque.');
  return { bloques, futuros };
}

/**
 * El numero de articulo de un bloque, o null si no es un articulo.
 *
 * NO SE PUEDE MIRAR EL IDENTIFICADOR. Cada norma numera a su manera y esto se
 * vio en la primera tanda de descargas:
 *
 *   Constitucion            a1, a2, a3        "Articulo 1"
 *   Codigo Civil            a1, art2, art3    "Art 1", "Art 2"
 *   LOFCS                   aprimero, asegundo "Articulo primero"
 *
 * Contando `^a\d+$` el Codigo Civil declaraba 3 articulos de 1.951 y la LOFCS
 * cero de 54. Es la misma trampa de la regla 30, y por eso se lee el ROTULO y
 * se reutiliza `palabrasANumero` de `app/lib/chat.ts` en vez de escribir un
 * segundo lector de ordinales que derive del primero.
 */
export function numeroDeArticulo(bloque) {
  const rotulo = (bloque?.titulo ?? '').trim().toLowerCase();
  const m = /^art(?:[íi]culo|\.|)\s+(.+)$/.exec(sinTildes(rotulo));
  if (!m) return null;

  const resto = m[1].trim();
  const cifra = /^(\d{1,4})\b/.exec(resto);
  if (cifra) return Number(cifra[1]);

  return palabrasANumero(resto);
}

const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Un documento del diario, para lo que NO esta en legislacion consolidada.
 *
 * Los tratados internacionales se publican como "Instrumento de Ratificacion" y
 * viven en el diario, no en la base de textos consolidados: el Convenio Europeo
 * de Derechos Humanos (BOE-A-1979-24010) devuelve 404 en /metadatos y 200 en
 * xml.php. Sin esto, el tema 27 se quedaria sin su texto y habria que contarlo
 * de memoria, que es justo lo que este temario evita.
 *
 * Aqui no hay bloques ni versiones: el diario da parrafos sueltos. Se agrupan
 * por sus rotulos de articulo, que es lo que despues se convierte en la
 * referencia legal del fragmento.
 */
export async function descargarDocumentoDiario(id) {
  const xml = await pedir(`https://www.boe.es/diario_boe/xml.php?id=${id}`, 'application/xml');

  const titulo = textoDe(/<titulo>([\s\S]*?)<\/titulo>/.exec(xml)?.[1] ?? id);
  // OJO: hay varios <texto> en la respuesta. Dentro de <analisis> cada
  // referencia lleva el suyo ("el texto refundido del Convenio, en BOE num.
  // 108..."), y el primero que encuentra un regex no codicioso es ESE, que no
  // tiene ni un parrafo. El cuerpo es el que contiene <p>.
  const candidatos = [...xml.matchAll(/<texto>([\s\S]*?)<\/texto>/g)].map((m) => m[1]);
  const cuerpo = candidatos.filter((c) => c.includes('<p')).sort((a, b) => b.length - a.length)[0] ?? xml;
  const parrafos = [...cuerpo.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => textoDe(m[1]))
    .filter(Boolean);

  const bloques = [];
  let actual = { id: 'preambulo', tipo: 'preambulo', titulo: null, parrafos: [] };

  for (const texto of parrafos) {
    // Insensible a mayusculas y sin exigir tilde: los documentos antiguos del
    // diario vienen en versales y sin acentuar ("ARTICULO 1"), que es como esta
    // la Convencion contra la Tortura de 1987. Con el patron en minusculas, sus
    // 33 articulos se quedaban en un solo bloque sin una referencia legal.
    const rotulo = /^(art[íi]?culo\s+[\dIVXLC]+|art[íi]?culo\s+\w+)\.?$/i.exec(texto);
    if (rotulo) {
      if (actual.parrafos.length) bloques.push(actual);
      const crudo = rotulo[1].replace(/\s+/g, ' ');
      // Se normaliza el rotulo: es lo que acabara siendo la referencia legal del
      // fragmento, y "ARTICULO 1" y "Articulo 1" no pueden ser dos cosas.
      const nombre = `Artículo ${crudo.replace(/^art[íi]?culo\s+/i, '')}`;
      actual = { id: nombre.toLowerCase().replace(/\s+/g, ''), tipo: 'precepto', titulo: nombre, parrafos: [{ clase: 'articulo', texto: nombre }] };
      continue;
    }
    actual.parrafos.push({ clase: 'parrafo', texto });
  }
  if (actual.parrafos.length) bloques.push(actual);

  return { titulo, bloques };
}
