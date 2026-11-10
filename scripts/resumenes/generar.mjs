/**
 * Convierte los documentos de estudio (temario/resumenes/*.html) en PDF con la
 * marca de Alphapol.
 *
 *   node scripts/resumenes/generar.mjs            # todos
 *   node scripts/resumenes/generar.mjs tema-05    # los que empiecen así
 *   node scripts/resumenes/generar.mjs hoja docs/propuesta   # otra carpeta
 *
 * Usa el Chromium que ya trae la sesión (Playwright). El estilo común vive en
 * scripts/resumenes/estilo.css.
 */
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const filtro = process.argv[2] ?? '';
const CARPETA = join(RAIZ, process.argv[3] ?? join('temario', 'resumenes'));

const pie = `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#5b6478;
  padding:0 12mm;display:flex;justify-content:space-between;border-top:1.5px solid #c5a738;margin:0 0 4mm;padding-top:2mm">
  <span><b style="color:#14295a">ALPHAPOL</b> · Centro de formación · Málaga</span>
  <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

const ficheros = (await readdir(CARPETA)).filter((f) => f.endsWith('.html') && f.startsWith(filtro));
const navegador = await chromium.launch();
for (const f of ficheros) {
  const pagina = await navegador.newPage();
  await pagina.goto(pathToFileURL(join(CARPETA, f)).href);
  await pagina.evaluate(() => document.fonts.ready);
  const salida = join(CARPETA, f.replace(/\.html$/, '.pdf'));
  await pagina.pdf({
    path: salida, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>', footerTemplate: pie,
    margin: { top: '13mm', bottom: '18mm', left: '12mm', right: '12mm' },
  });
  console.log('OK', salida);
  await pagina.close();
}
await navegador.close();
