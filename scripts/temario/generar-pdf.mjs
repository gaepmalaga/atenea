/**
 * Convierte el markdown de un tema en el PDF que se sube al panel.
 *
 *   npm run temario:pdf -- 2
 *   npm run temario:pdf
 *
 * POR QUE PDFKIT Y NO UN NAVEGADOR: el PDF lo tiene que poder generar
 * cualquiera con `npm ci`, sin un Chrome instalado ni una descarga de 150 MB.
 * Y para un texto legal a una columna, lo que aporta un motor de maquetado es
 * casi nada.
 *
 * CUIDADO CON EL VIAJE DE IDA Y VUELTA. Este PDF lo vuelve a leer la plataforma
 * con `pdf2json`, que devuelve el texto tal y como quedo MAQUETADO: un renglon
 * por linea. Por eso aqui:
 *
 *  - Una sola columna, sin cabeceras ni pies con texto (el numero de pagina
 *    suelto lo tira `cleanLegalText`, que ya borra las lineas de solo digitos).
 *  - Fuentes estandar (Times/Helvetica), sin ligaduras raras que ensucien la
 *    extraccion.
 *  - Los rotulos --"TITULO I", "Articulo 27"-- en su propia linea y sin
 *    sangria, que es lo que busca el regex del troceador.
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENTRADA = join(RAIZ, 'temario', 'md');
const SALIDA = join(RAIZ, 'temario', 'pdf');

/** Los mismos encabezados que reconoce `app/lib/text.ts`. */
const ENCABEZADO = /^(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|Secci[óo]n|LIBRO|PARTE|PRE[ÁA]MBULO)\b/;
const ARTICULO = /^(Art[íi]culo|Disposici[óo]n)\b/;

const ANCHO_A4 = 595.28;
const MARGEN = 62;

function tipoDeLinea(linea) {
  if (ENCABEZADO.test(linea)) return 'encabezado';
  if (ARTICULO.test(linea)) return 'articulo';
  return 'parrafo';
}

async function generar(rutaMd, rutaPdf) {
  const markdown = await readFile(rutaMd, 'utf8');
  const [cabecera, cuerpo] = partir(markdown);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
    info: { Title: cabecera.split('\n')[0], Author: 'Atenea Policial' },
    autoFirstPage: true,
  });

  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  const terminado = new Promise((resolve) => doc.on('end', resolve));

  pintarCabecera(doc, cabecera);
  pintarCuerpo(doc, cuerpo);
  numerarPaginas(doc);

  doc.end();
  await terminado;
  await writeFile(rutaPdf, Buffer.concat(trozos));
  return Buffer.concat(trozos).length;
}

/** La cabecera va antes del `---`; el articulado, despues. */
function partir(markdown) {
  const corte = markdown.indexOf('\n---\n');
  if (corte === -1) return ['', markdown];
  return [markdown.slice(0, corte).trim(), markdown.slice(corte + 5).trim()];
}

function pintarCabecera(doc, cabecera) {
  const lineas = cabecera.split('\n');
  const titulo = lineas[0];

  doc.font('Helvetica-Bold').fontSize(17).text(titulo, { align: 'left' });
  doc.moveDown(0.8);

  doc.font('Helvetica').fontSize(9).fillColor('#444444');
  for (const linea of lineas.slice(1)) {
    if (!linea.trim()) { doc.moveDown(0.4); continue; }
    doc.text(linea.trim(), { align: 'left', indent: linea.startsWith('  ') ? 12 : 0 });
  }

  doc.moveDown(0.8);
  doc.strokeColor('#999999').lineWidth(0.7)
    .moveTo(MARGEN, doc.y).lineTo(ANCHO_A4 - MARGEN, doc.y).stroke();
  doc.moveDown(1.2);
  doc.fillColor('#000000');
}

function pintarCuerpo(doc, cuerpo) {
  for (const bloque of cuerpo.split('\n\n')) {
    const texto = bloque.trim();
    if (!texto) continue;

    switch (tipoDeLinea(texto)) {
      case 'encabezado':
        doc.moveDown(1);
        doc.font('Helvetica-Bold').fontSize(11).text(texto, { align: 'center' });
        doc.moveDown(0.5);
        break;
      case 'articulo': {
        // El rotulo y su texto son un bloque: si el salto de pagina cae entre
        // medias, el articulo empieza huerfano al pie de la pagina anterior.
        const [rotulo, ...resto] = texto.split('\n');
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(10.5).text(rotulo);
        doc.moveDown(0.2);
        if (resto.length) doc.font('Times-Roman').fontSize(10.5).text(resto.join('\n'), { align: 'justify' });
        break;
      }
      default:
        doc.font('Times-Roman').fontSize(10.5).text(texto, { align: 'justify' });
        doc.moveDown(0.45);
    }
  }
}

/**
 * El numero de pagina, solo. Nada de titulillos repetidos en cada hoja: al
 * reextraer el texto apareceria una vez por pagina metido en mitad de un
 * articulo. `cleanLegalText` ya sabe tirar las lineas de solo digitos.
 */
function numerarPaginas(doc) {
  const paginas = doc.bufferedPageRange();
  for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#888888')
      .text(String(i + 1), MARGEN, 800, { width: ANCHO_A4 - MARGEN * 2, align: 'center' });
  }
}

async function main() {
  const soloTema = process.argv[2] ? String(process.argv[2]).padStart(2, '0') : null;
  await mkdir(SALIDA, { recursive: true });

  const ficheros = (await readdir(ENTRADA))
    .filter((f) => f.endsWith('.md'))
    .filter((f) => !soloTema || f === `tema-${soloTema}.md`)
    .sort();

  if (ficheros.length === 0) throw new Error(soloTema ? `No hay temario/md/tema-${soloTema}.md. Componlo antes.` : 'No hay ningun markdown que convertir.');

  for (const f of ficheros) {
    const destino = f.replace(/\.md$/, '.pdf');
    const bytes = await generar(join(ENTRADA, f), join(SALIDA, destino));
    console.log(`+ ${destino}: ${Math.round(bytes / 1024)} KB`);
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
