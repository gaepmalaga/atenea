/**
 * La pantalla de entrada EN MODO OSCURO.
 *
 * El resto del banco mide en claro, que es lo que da Chromium por defecto.
 * Pero el `.dark` de la aplicacion lo pone `StudentDashboard` al montarse, y
 * a la pantalla de entrada NO LA HA MONTADO NADIE todavia: ahi el tema sale
 * solo de `prefers-color-scheme`. Es justo el caso que no cubre el banco, y
 * es como la ve quien tiene el movil en oscuro — la mayoria.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  const fallos = [];
  page.on('pageerror', (e) => fallos.push(String(e)));
  await page.goto('http://localhost:8899/index.html?vista=login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/user/atenea/.banco-pruebas/tomas/entrada-oscuro.png', fullPage: true });
  const ancho = await page.evaluate(() => ({
    doc: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  console.log('ancho visible', ancho.doc, '· ancho real', ancho.scroll,
    ancho.scroll > ancho.doc ? '  ⚠ LA PAGINA SE VA A LOS LADOS' : '  ✓ sin desborde lateral');
  console.log('fallos de JavaScript:', fallos.length);
  await browser.close();
})();
