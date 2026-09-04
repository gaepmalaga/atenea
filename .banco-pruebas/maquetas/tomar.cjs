/**
 * Las maquetas de login.
 *
 * Quedan DOS estructuras —la del HUD y la brutalista— porque son las dos que
 * se aprobaron; lo que se prueba ahora es la PALETA, que es lo que fallaba en
 * las dos. Por eso comparten fichero y cambian con `?p=a|b|c`: si la
 * estructura viviera copiada tres veces, tocar el titular obligaria a
 * tocarlo en tres sitios y acabarian siendo tres pantallas distintas sin que
 * nadie lo decidiera.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CASOS = [
  ['hud', 'a', 'hud-indigo'], ['hud', 'b', 'hud-marino'], ['hud', 'c', 'hud-grafito'],
  ['brut', 'a', 'brut-indigo'], ['brut', 'b', 'brut-hueso'], ['brut', 'c', 'brut-oscuro'],
];
(async () => {
  const browser = await chromium.launch();
  for (const [fam, p, nombre] of CASOS) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(`http://localhost:8899/maquetas/${fam}.html?p=${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `/home/user/atenea/.banco-pruebas/maquetas/${nombre}.png` });
    const [v, r] = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    console.log(`${nombre}: ${v}/${r} ${r > v ? '⚠ SE VA A LOS LADOS' : '✓'}`);
    await page.close();
  }
  await browser.close();
})();
