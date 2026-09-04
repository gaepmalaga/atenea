/**
 * Las maquetas de login, una captura cada una.
 *
 * Son SEIS PANTALLAS DISTINTAS, no seis iconos: cada `dN.html` trae su propio
 * CSS. Escribirlas con las clases del proyecto era la primera version y no
 * valia para nada — solo dejaba proponer variaciones de lo que la aplicacion
 * ya es, que es justo lo que no se estaba pidiendo.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:8899/maquetas/d${n}.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/home/user/atenea/.banco-pruebas/maquetas/login-${n}.png` });
    const [v, r] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    console.log(`d${n}: ${v}/${r} ${r > v ? '⚠ SE VA A LOS LADOS' : '✓'}`);
    await page.close();
  }
  await browser.close();
})();
