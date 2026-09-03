/**
 * Lee el PDF generado EXACTAMENTE como lo hara la plataforma y dice que saldria
 * de subirlo.
 *
 *   npm run temario:comprobar -- 2
 *
 * POR QUE EXISTE: el documento hace un viaje de ida y vuelta --texto limpio ->
 * PDF -> `pdf2json` -> `cleanLegalText` -> `chunkDocument`-- y ese viaje es
 * donde se pierde la referencia legal de cada fragmento. Generar el PDF y darlo
 * por bueno es como dar por buena una escritura en Supabase sin mirar el error:
 * el fallo no aparece hasta que el chat no encuentra el articulo.
 *
 * Importa las funciones REALES de `app/lib/text.ts`. Una copia aqui probaria
 * una version distinta de la que corre en produccion, que es como no probar.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFParser from 'pdf2json';
import { cleanLegalText, chunkDocument } from '../../app/lib/text.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PDFS = join(RAIZ, 'temario', 'pdf');

/** El mismo camino que `uploadTopicPDF`: pdf2json en modo texto crudo. */
function extraer(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', (err) => reject(err?.parserError ?? err));
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()));
    parser.parseBuffer(buffer);
  });
}

async function comprobar(fichero) {
  const buffer = await readFile(join(PDFS, fichero));
  const crudo = await extraer(buffer);
  const limpio = cleanLegalText(crudo);
  const fragmentos = chunkDocument(limpio);

  const conReferencia = fragmentos.filter((f) => f.reference);
  const referencias = new Set(conReferencia.map((f) => f.reference));
  const articulos = [...referencias]
    .map((r) => Number(/Art[íi]culo\s+(\d+)/.exec(r)?.[1]))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  const huecos = [];
  for (let n = articulos[0]; n < articulos[articulos.length - 1]; n++) {
    if (!articulos.includes(n)) huecos.push(n);
  }

  const largo = fragmentos.reduce((max, f) => Math.max(max, f.text.length), 0);

  console.log(`\n${fichero}`);
  console.log(`  ${limpio.length.toLocaleString('es-ES')} caracteres tras la limpieza`);
  console.log(`  ${fragmentos.length} fragmentos, ${conReferencia.length} con referencia legal (${referencias.size} distintas)`);
  console.log(`  articulos detectados: ${articulos.length}${articulos.length ? ` (${articulos[0]}-${articulos[articulos.length - 1]})` : ''}`);
  console.log(`  fragmento mas largo: ${largo} caracteres`);
  if (huecos.length) console.log(`  HUECOS en la numeracion: ${huecos.join(', ')}`);

  // Un fragmento vacio reventaba `embedContent` y dejaba el documento indexado a
  // medias sin avisar (regla 9). Aqui se ve antes de subirlo.
  const vacios = fragmentos.filter((f) => !f.text.trim()).length;
  if (vacios) console.log(`  ATENCION: ${vacios} fragmentos vacios`);

  return { huecos: huecos.length, vacios };
}

async function main() {
  const soloTema = process.argv[2] ? String(process.argv[2]).padStart(2, '0') : null;
  const ficheros = (await readdir(PDFS))
    .filter((f) => f.endsWith('.pdf'))
    .filter((f) => !soloTema || f === `tema-${soloTema}.pdf`)
    .sort();

  if (ficheros.length === 0) throw new Error('No hay PDFs que comprobar.');

  let problemas = 0;
  for (const f of ficheros) {
    const r = await comprobar(f);
    problemas += r.huecos + r.vacios;
  }
  console.log('');
  if (problemas) {
    console.log(`${problemas} avisos. Un hueco puede ser legitimo (un articulo derogado) o un fallo de extraccion: miralo antes de subir.`);
  } else {
    console.log('Sin huecos ni fragmentos vacios.');
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
