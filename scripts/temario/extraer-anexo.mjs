/**
 * Extrae el programa oficial (Anexo I) de la convocatoria y genera el manifiesto
 * `temario/temario.json`.
 *
 * Los 45 titulos NO se escriben a mano. Las academias no coinciden entre ellas
 * en el reparto de los bloques II y III --unas publican 9+10, otras 11+8-- y un
 * titulo mal copiado es un alumno estudiando el tema equivocado. El BOE es el
 * unico sitio donde ese reparto no es opinable.
 *
 *   node scripts/temario/extraer-anexo.mjs
 *   node scripts/temario/extraer-anexo.mjs BOE-A-2027-XXXXX   (proxima convocatoria)
 *
 * Conserva las `fuentes` que ya tuviera cada tema en el manifiesto anterior: son
 * trabajo editorial (que norma y que articulos entran), no algo que el BOE diga.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFIESTO = join(RAIZ, 'temario', 'temario.json');
const COPIA_ANEXO = join(RAIZ, 'temario', 'fuentes', 'anexo-i.txt');

/** Convocatoria vigente: Resolucion de 7 de julio de 2026 (Escala Basica). */
const CONVOCATORIA_POR_DEFECTO = 'BOE-A-2026-15055';

/**
 * El BOE separa el numero del enunciado con un espacio EM ( ) y usa espacio
 * duro ( ) dentro de "Tema 10" y de las citas de normas. Un `\s` normal los
 * cubre, pero conviene nombrarlos: es la clase de detalle que rompe el parseo en
 * silencio cuando cambian la maquetacion.
 */
const LINEA_BLOQUE = /^([A-Z])\)[\s  ]+(.+)$/;
const LINEA_TEMA = /^Tema[\s ]+(\d+)\.[\s  ]+(.+)$/;

/**
 * El User-Agent es cortesia, no necesidad: el BOE sirve el documento igual sin
 * el. Se manda porque identificar quien descarga y para que es lo minimo cuando
 * uno se baja el BOE entero, y porque si algun dia limitan por robots, el aviso
 * llegara a alguien en vez de a un `undici` anonimo.
 *
 * OJO con el 403 de la primera vez: no venia del BOE sino del proxy del entorno.
 * El `fetch` de Node NO lee HTTPS_PROXY por su cuenta; hace falta
 * NODE_USE_ENV_PROXY=1, que es lo que pone `npm run temario:anexo`. En una
 * maquina sin proxy la variable no molesta.
 */
const CABECERAS = {
  'User-Agent': 'Atenea-Policial/1.0 (temario para preparacion de oposiciones; +https://atenea-eight.vercel.app)',
  Accept: 'application/xml, text/xml, */*',
};

async function descargarConvocatoria(id) {
  const url = `https://www.boe.es/diario_boe/xml.php?id=${id}`;
  const res = await fetch(url, { headers: CABECERAS });
  if (!res.ok) throw new Error(`El BOE respondio ${res.status} a ${url}`);
  return res.text();
}

/** Quita el marcado y deja una linea por parrafo. */
function aTextoPlano(xml) {
  return xml
    .replace(/<[^>]+>/g, '\n')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&uuml;/g, 'ü').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

/** El Anexo I es el programa; el II es el cuadro de exclusiones medicas. */
function recortarAnexoPrimero(texto) {
  const inicio = texto.indexOf('ANEXO I');
  if (inicio === -1) throw new Error('No se ha encontrado el ANEXO I en la convocatoria.');
  const resto = texto.slice(inicio);
  const fin = resto.indexOf('ANEXO II');
  return fin === -1 ? resto : resto.slice(0, fin);
}

/**
 * Un tema puede ocupar varias lineas: el tema 21 lleva dos parrafos sueltos
 * ("habeas corpus." y el procedimiento de la detencion). Se pegan al tema
 * abierto en vez de descartarse, que es como se pierde media pregunta de examen.
 */
function parsearTemas(anexo) {
  const bloques = [];
  const temas = [];
  let bloqueActual = null;
  let temaActual = null;

  for (const linea of anexo.split('\n')) {
    const bloque = LINEA_BLOQUE.exec(linea);
    if (bloque) {
      bloqueActual = { letra: bloque[1], nombre: bloque[2].trim() };
      bloques.push(bloqueActual);
      temaActual = null;
      continue;
    }

    const tema = LINEA_TEMA.exec(linea);
    if (tema) {
      if (!bloqueActual) throw new Error(`"${linea.slice(0, 40)}" aparece antes de ningun bloque.`);
      temaActual = {
        numero: Number(tema[1]),
        bloque: bloqueActual.letra,
        bloque_nombre: bloqueActual.nombre,
        enunciado: normalizarEspacios(tema[2]),
      };
      temas.push(temaActual);
      continue;
    }

    if (temaActual && linea !== 'ANEXO I') {
      temaActual.enunciado += ` ${normalizarEspacios(linea)}`;
    }
  }

  return { bloques, temas };
}

/** Los espacios duros del BOE no aportan nada una vez fuera del XML. */
function normalizarEspacios(texto) {
  return texto.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** El rotulo corto del tema: lo que cabe en un desplegable. */
function tituloCorto(enunciado) {
  const corte = enunciado.search(/[.:]/);
  const titulo = corte === -1 ? enunciado : enunciado.slice(0, corte);
  return titulo.length > 80 ? `${titulo.slice(0, 77)}...` : titulo;
}

/** Numeracion continua y sin huecos: si falta un tema, el manifiesto miente. */
function comprobarNumeracion(temas) {
  const esperados = temas.map((_, i) => i + 1);
  const reales = temas.map((t) => t.numero);
  const desajuste = esperados.findIndex((n, i) => n !== reales[i]);
  if (desajuste !== -1) {
    throw new Error(`Numeracion rota: se esperaba el tema ${esperados[desajuste]} y vino el ${reales[desajuste]}.`);
  }
}

/** Las fuentes son trabajo editorial: no se pisan al regenerar. */
async function fuentesAnteriores() {
  try {
    const previo = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
    return new Map(previo.temas.map((t) => [t.numero, t.fuentes ?? []]));
  } catch {
    return new Map();
  }
}

async function main() {
  const id = process.argv[2] ?? CONVOCATORIA_POR_DEFECTO;
  console.log(`Convocatoria ${id}`);

  const xml = await descargarConvocatoria(id);
  const actualizacion = /fecha_actualizacion="(\d+)"/.exec(xml)?.[1] ?? null;
  const titulo = /<titulo>([\s\S]*?)<\/titulo>/.exec(xml)?.[1]?.trim() ?? null;

  const anexo = recortarAnexoPrimero(aTextoPlano(xml));
  const { bloques, temas } = parsearTemas(anexo);
  comprobarNumeracion(temas);

  const previas = await fuentesAnteriores();
  const manifiesto = {
    convocatoria: {
      id,
      titulo: titulo && normalizarEspacios(titulo),
      fecha_actualizacion: actualizacion,
      url: `https://www.boe.es/diario_boe/txt.php?id=${id}`,
    },
    generado: new Date().toISOString().slice(0, 10),
    bloques,
    temas: temas.map((t) => ({
      numero: t.numero,
      bloque: t.bloque,
      titulo: tituloCorto(t.enunciado),
      enunciado: t.enunciado,
      fuentes: previas.get(t.numero) ?? [],
    })),
  };

  await mkdir(dirname(COPIA_ANEXO), { recursive: true });
  await writeFile(COPIA_ANEXO, `${anexo}\n`, 'utf8');
  await writeFile(MANIFIESTO, `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');

  for (const b of bloques) {
    const n = temas.filter((t) => t.bloque === b.letra).length;
    const rango = temas.filter((t) => t.bloque === b.letra);
    console.log(`  ${b.letra}) ${b.nombre}: ${n} temas (${rango[0].numero}-${rango[n - 1].numero})`);
  }
  console.log(`${temas.length} temas -> temario/temario.json`);
  const sinFuente = manifiesto.temas.filter((t) => t.fuentes.length === 0).length;
  if (sinFuente) console.log(`${sinFuente} temas todavia sin fuentes asignadas.`);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
