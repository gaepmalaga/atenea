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
const MDS = join(RAIZ, 'temario', 'md');

/** El mismo camino que `uploadTopicPDF`: pdf2json en modo texto crudo. */
function extraer(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser(null, 1);
    parser.on('pdfParser_dataError', (err) => reject(err?.parserError ?? err));
    parser.on('pdfParser_dataReady', () => resolve(parser.getRawTextContent()));
    parser.parseBuffer(buffer);
  });
}

/** Los rotulos de articulo de un texto, tal y como abren linea. */
function articulosDe(texto) {
  return new Set(
    [...texto.matchAll(/^(Art[íi]culo\s+[^\n.]{1,40}?)\s*\.?$/gm)].map((m) => m[1].trim())
  );
}

/**
 * Compara el PDF con el markdown del que salio.
 *
 * La primera version contaba "huecos" en la numeracion y daba 695 avisos: un
 * tema puede ser varios tramos sueltos a proposito --el 20 son tres trozos del
 * Codigo Penal y uno de la Ley de Enjuiciamiento-- asi que entre el 201 y el
 * 248 no falta nada. Un aviso en el que no se puede confiar acaba ignorado, que
 * es como se paso meses el "indexado ✅" tapando un indexado a medias.
 *
 * Lo que si es un fallo: que un articulo este en el markdown y no aparezca al
 * releer el PDF. Eso es texto que el alumno no vera y que el chat no podra
 * citar.
 */
async function comprobar(fichero) {
  const buffer = await readFile(join(PDFS, fichero));
  const crudo = await extraer(buffer);
  const limpio = cleanLegalText(crudo);
  const fragmentos = chunkDocument(limpio);

  const markdown = await readFile(join(MDS, fichero.replace(/\.pdf$/, '.md')), 'utf8');
  const esperados = articulosDe(markdown);
  const recuperados = articulosDe(limpio);
  const perdidos = [...esperados].filter((a) => !recuperados.has(a));

  const conReferencia = fragmentos.filter((f) => f.reference);
  const vacios = fragmentos.filter((f) => !f.text.trim()).length;
  const largo = fragmentos.reduce((max, f) => Math.max(max, f.text.length), 0);

  console.log(`\n${fichero}`);
  console.log(`  ${limpio.length.toLocaleString('es-ES')} caracteres tras la limpieza`);
  console.log(`  ${fragmentos.length} fragmentos, ${conReferencia.length} con referencia legal`);
  console.log(`  articulos: ${esperados.size} en el markdown, ${recuperados.size} recuperados del PDF`);
  console.log(`  fragmento mas largo: ${largo} caracteres`);
  if (perdidos.length) console.log(`  PERDIDOS AL PASAR POR PDF: ${perdidos.slice(0, 8).join(', ')}${perdidos.length > 8 ? `... (${perdidos.length})` : ''}`);
  if (vacios) console.log(`  ATENCION: ${vacios} fragmentos vacios`);

  return perdidos.length + vacios;
}

async function main() {
  const soloTema = process.argv[2] ? String(process.argv[2]).padStart(2, '0') : null;
  const ficheros = (await readdir(PDFS))
    .filter((f) => f.endsWith('.pdf'))
    .filter((f) => !soloTema || f === `tema-${soloTema}.pdf`)
    .sort();

  if (ficheros.length === 0) throw new Error('No hay PDFs que comprobar.');

  let problemas = 0;
  for (const f of ficheros) problemas += await comprobar(f);
  console.log('');
  console.log(problemas === 0
    ? `${ficheros.length} documentos: ni un articulo perdido al pasar por PDF, ni un fragmento vacio.`
    : `${problemas} problemas. No subas eso: el articulo que no se recupera del PDF no existe para el alumno.`);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
