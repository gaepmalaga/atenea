/**
 * REGENERA LOS ICONOS DE LA APP a partir de los SVG de la marca (regla 88).
 *
 *   node scripts/marca/iconos.mjs
 *
 * Escribe app/icon.png (512, también el favicon), app/apple-icon.png (180),
 * public/marca/icono-192.png, icono-512.png e icono-maskable-512.png.
 *
 * Las posiciones son las de la regla 88, en fracciones del lado, y se refieren
 * a la TINTA de la «A» y del nombre, no a su lienzo: por eso cada SVG lleva
 * aquí su caja de tinta (`CAJA`), en las unidades de su `viewBox`. Si llega un
 * logo en vector de verdad, se cambian los dos ficheros y estas dos cajas, y
 * se vuelve a ejecutar.
 *
 * Usa el Chromium de Playwright para pintar: así los bordes salen con el
 * suavizado del navegador, el mismo que verá el alumno.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SVG = {
  a: { fichero: 'public/marca/alphapol-isotipo.svg', CAJA: '24 22 1061 1102' },
  n: { fichero: 'public/marca/alphapol-nombre.svg', CAJA: '8 8 1092 145' },
};

const enDataUrl = ({ fichero, CAJA }) => {
  const svg = fs.readFileSync(path.join(RAIZ, fichero), 'utf8').replace(/viewBox="[^"]*"/, `viewBox="${CAJA}"`);
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
};

// (izquierda, arriba, ancho, alto) de la tinta, en fracciones del lado.
const DISENO = {
  // iPhone, navegador y «any» del manifest: dentro de las esquinas redondeadas.
  any: {
    a: [0.1875, 0.0708, 0.625, 0.6491], n: [0.0938, 0.7588, 0.8125, 0.1094],
    fondo: 'radial-gradient(circle at 50% 40%, #0b4a6e 0%, #123a6a 38%, #14295a 72%)',
  },
  // Android: dentro del círculo central del 80 %. El degradado llega al marino
  // EXACTO (el `background_color` del manifest) antes de ese círculo, así que
  // en la pantalla de arranque el icono no tiene un recuadro alrededor.
  maskable: {
    a: [0.261, 0.1235, 0.478, 0.4964], n: [0.1893, 0.6497, 0.6214, 0.0836],
    fondo: 'radial-gradient(circle at 50% 44%, #0b4a6e 0%, #123a6a 22%, #14295a 38%)',
  },
};

const SALIDAS = [
  ['app/icon.png', 'any', 512],
  ['public/marca/icono-512.png', 'any', 512],
  ['public/marca/icono-192.png', 'any', 192],
  ['app/apple-icon.png', 'any', 180],
  ['public/marca/icono-maskable-512.png', 'maskable', 512],
];

{
  const urls = { a: enDataUrl(SVG.a), n: enDataUrl(SVG.n) };
  const navegador = await chromium.launch();
  for (const [salida, diseno, lado] of SALIDAS) {
    const d = DISENO[diseno];
    const capas = ['a', 'n'].map((k) => {
      const [x, y, w, h] = d[k];
      return `<img src="${urls[k]}" style="position:absolute;left:${x * lado}px;top:${y * lado}px;width:${w * lado}px;height:${h * lado}px">`;
    }).join('');
    const pagina = await navegador.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
    await pagina.setContent(`<body style="margin:0;width:${lado}px;height:${lado}px;position:relative;overflow:hidden;background:${d.fondo}">${capas}</body>`);
    await pagina.waitForTimeout(300);
    await pagina.screenshot({ path: path.join(RAIZ, salida) });
    await pagina.close();
    console.log('  ✓', salida);
  }
  await navegador.close();
}
