/**
 * Compone el documento de un tema a partir del manifiesto y de la cache del BOE.
 *
 *   npm run temario:componer -- 2      un tema
 *   npm run temario:componer           todos los que tengan fuentes
 *
 * UN DOCUMENTO POR TEMA, CON SOLO SUS PRECEPTOS. No la ley entera repetida en
 * varios temas. Tres razones, y las tres tienen precedente en este repo:
 *
 *  - `generateTestQuestion` toma una ventana AL AZAR del documento (regla 28).
 *    Con la Constitucion entera dentro del tema 2, generaria preguntas del
 *    articulo 149 etiquetadas como tema 2 -- que es lo que paso con las 15
 *    preguntas de Inteligencia que vivian dentro de Constitucion (P5).
 *  - El chat manda el documento ENTERO al modelo (regla 33), con tope de
 *    150.000 caracteres. La Constitucion completa son ~125.000 y se pagan
 *    aunque la pregunta sea del Titulo Preliminar.
 *  - El diff. Cuando se reforme un articulo, `git diff` dice que temas cambian
 *    y, por tanto, que preguntas del banco hay que revisar.
 *
 * EL FORMATO NO ES DECORATIVO. El documento acaba en PDF, y la plataforma lo
 * vuelve a leer con `pdf2json` + `cleanLegalText` + `chunkDocument`. Ese
 * troceado detecta los encabezados con un regex anclado a principio de linea
 * (`^(TITULO|CAPITULO|SECCION|Articulo|Disposicion|Preambulo)`), asi que los
 * rotulos van EN CRUDO: un `## Articulo 1` de markdown rompe la deteccion y el
 * fragmento se queda sin referencia legal.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFIESTO = join(RAIZ, 'temario', 'temario.json');
const CACHE = join(RAIZ, 'temario', 'fuentes');
const SALIDA = join(RAIZ, 'temario', 'md');

/**
 * Las notas al pie del texto consolidado ("Se modifica por el art. unico de la
 * Reforma de..."), fuera del cuerpo. Son bibliografia de la consolidacion, no
 * norma, y meterlas dentro invita al generador a preguntar por la referencia de
 * la reforma en vez de por lo que dice el articulo. Lo que si importa --que la
 * redaccion es la reformada-- se dice en la cabecera del documento.
 */
const CLASES_FUERA = new Set(['nota_pie', 'nota_pie_2', 'firma_rey', 'firma_ministro']);

function resolverAmbito(bloques, ambito) {
  if (ambito.tipo === 'completo') return bloques;

  if (ambito.tipo === 'bloques') {
    const pedidos = new Set(ambito.ids);
    const encontrados = bloques.filter((b) => pedidos.has(b.id));
    const faltan = ambito.ids.filter((id) => !bloques.some((b) => b.id === id));
    if (faltan.length) throw new Error(`bloques inexistentes: ${faltan.join(', ')}`);
    return encontrados;
  }

  // `articulos` es azucar sobre `rango`: los ids de articulo son `aN`.
  const desde = ambito.tipo === 'articulos' ? `a${ambito.desde}` : ambito.desde;
  const hasta = ambito.tipo === 'articulos' ? `a${ambito.hasta}` : ambito.hasta;

  const i = bloques.findIndex((b) => b.id === desde);
  const j = bloques.findIndex((b) => b.id === hasta);
  if (i === -1) throw new Error(`no existe el bloque inicial "${desde}"`);
  if (j === -1) throw new Error(`no existe el bloque final "${hasta}"`);
  if (j < i) throw new Error(`"${desde}" va despues de "${hasta}" en la norma`);

  // El tramo va ENTERO, encabezados incluidos: los TITULO/CAPITULO/SECCION que
  // caen dentro son la estructura del texto, y sin ellos el alumno lee
  // articulos sueltos sin saber de que parte de la ley salen.
  return bloques.slice(i, j + 1);
}

/**
 * El texto de un bloque, listo para el documento.
 *
 * Los encabezados van con salto SENCILLO ("CAPITULO PRIMERO" y "De los
 * espanoles y los extranjeros" son un solo rotulo partido en dos parrafos por
 * el BOE). Con linea en blanco entre medias, el titulo del capitulo queda
 * suelto y se lee como si fuera el primer parrafo del articulo siguiente.
 */
function volcarBloque(bloque) {
  const lineas = bloque.parrafos
    .filter((p) => !CLASES_FUERA.has(p.clase))
    .map((p) => p.texto);
  return lineas.join(bloque.tipo === 'encabezado' ? '\n' : '\n\n');
}

/** Que articulos del tramo llevan una redaccion posterior a la original. */
function reformados(seleccion, idNorma) {
  return seleccion
    .filter((b) => b.reformado_por && b.reformado_por !== idNorma && b.titulo)
    .map((b) => `${b.titulo} (${formatearFecha(b.vigente_desde)})`);
}

function formatearFecha(aaaammdd) {
  if (!aaaammdd || aaaammdd.length !== 8) return 'sin fecha';
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

async function componer(tema, hoy) {
  if (!tema.fuentes?.length) return null;

  const partes = [];
  const cabeceraFuentes = [];

  for (const fuente of tema.fuentes) {
    let norma;
    try {
      norma = JSON.parse(await readFile(join(CACHE, `${fuente.boe_id}.json`), 'utf8'));
    } catch {
      throw new Error(`falta la cache de ${fuente.boe_id}. Ejecuta: npm run temario:descargar -- ${tema.numero}`);
    }

    let seleccion;
    try {
      seleccion = resolverAmbito(norma.bloques, fuente.ambito);
    } catch (e) {
      throw new Error(`tema ${tema.numero}, ${fuente.boe_id}: ${e.message}`);
    }
    if (seleccion.length === 0) throw new Error(`tema ${tema.numero}: el ambito de ${fuente.boe_id} no selecciona nada`);

    const cambiados = reformados(seleccion, norma.id);
    cabeceraFuentes.push(
      [
        `${fuente.nombre ?? norma.titulo} (${fuente.boe_id})`,
        `  Texto consolidado del BOE, actualizado a ${formatearFecha(norma.fecha_actualizacion?.slice(0, 8))}.`,
        `  https://www.boe.es/buscar/act.php?id=${fuente.boe_id}`,
        fuente.nota ? `  Alcance en este tema: ${fuente.nota}` : null,
        cambiados.length ? `  Con redacción reformada: ${cambiados.join('; ')}.` : null,
      ].filter(Boolean).join('\n')
    );

    partes.push(`${fuente.nombre ?? norma.titulo}\n\n${seleccion.map(volcarBloque).filter(Boolean).join('\n\n')}`);
  }

  const cabecera = [
    `Tema ${tema.numero}. ${tema.titulo}`,
    '',
    tema.enunciado,
    '',
    'FUENTES',
    '',
    cabeceraFuentes.join('\n\n'),
    '',
    `Documento generado el ${hoy} para Atenea Policial a partir de los textos`,
    'consolidados del BOE. Contiene únicamente los preceptos que el programa',
    'oficial asigna a este tema.',
    '',
    '---',
  ].join('\n');

  return `${cabecera}\n\n${partes.join('\n\n')}\n`;
}

async function main() {
  const soloTema = process.argv[2] ? Number(process.argv[2]) : null;
  const manifiesto = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
  const hoy = new Date().toISOString().slice(0, 10);

  const temas = soloTema
    ? manifiesto.temas.filter((t) => t.numero === soloTema)
    : manifiesto.temas.filter((t) => t.fuentes?.length);
  if (temas.length === 0) throw new Error(soloTema ? `No existe el tema ${soloTema}.` : 'Ningun tema tiene fuentes asignadas todavia.');

  await mkdir(SALIDA, { recursive: true });

  for (const tema of temas) {
    const documento = await componer(tema, hoy);
    if (!documento) {
      console.log(`- tema ${tema.numero}: sin fuentes, se salta`);
      continue;
    }
    const nombre = `tema-${String(tema.numero).padStart(2, '0')}.md`;
    await writeFile(join(SALIDA, nombre), documento, 'utf8');
    const articulos = (documento.match(/^Art[íi]culo /gm) ?? []).length;
    console.log(`+ ${nombre}: ${documento.length.toLocaleString('es-ES')} caracteres, ${articulos} articulos`);
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
