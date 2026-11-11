/**
 * Los logos de Alphapol en PNG con fondo transparente, para los PDF (regla 115).
 *
 *   node scripts/marca/logos-pdf.mjs
 *
 * `pdf-lib` incrusta PNG y JPEG, no SVG: los exámenes en PDF (portada, hoja de
 * respuestas, marca de agua) necesitan el logotipo y la «A» en mapa de bits.
 * Se sacan de los mismos SVG que el resto de la marca (regla 88), con el
 * Chromium de Playwright, a un tamaño que aguanta la impresión.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SALIDAS = [
  { svg: 'public/marca/alphapol-logotipo.svg', png: 'public/examen/alphapol-logotipo.png', ancho: 900 },
  { svg: 'public/marca/alphapol-isotipo.svg', png: 'public/examen/alphapol-isotipo.png', ancho: 600 },
];

mkdirSync('public/examen', { recursive: true });
const navegador = await chromium.launch();
for (const { svg, png, ancho } of SALIDAS) {
  const fuente = readFileSync(svg, 'utf8');
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: ancho }, deviceScaleFactor: 1 });
  await pagina.setContent(
    `<style>html,body{margin:0;background:transparent}img{display:block;width:${ancho}px}</style>` +
    `<img src="data:image/svg+xml;base64,${Buffer.from(fuente).toString('base64')}">`,
  );
  await pagina.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  const img = pagina.locator('img');
  writeFileSync(png, await img.screenshot({ omitBackground: true }));
  const caja = await img.boundingBox();
  console.log(`${png}: ${Math.round(caja.width)} x ${Math.round(caja.height)}`);
  await pagina.close();
}
await navegador.close();
