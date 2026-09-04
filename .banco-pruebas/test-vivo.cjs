/** La pantalla del test EN MARCHA, que es la que el alumno mira 50 minutos. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const salida = process.argv[2] || 'test-vivo';
(async () => {
  const b = await chromium.launch();
  for (const [tema, sufijo] of [['dark','-oscuro'], ['light','-claro']]) {
    const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme: tema });
    await p.goto('http://localhost:8899/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(900);
    await p.locator('nav.fixed').locator('button', { hasText:/^TEST$/i }).first().click();
    await p.waitForTimeout(800);
    const ini = p.locator('button', { hasText:'Iniciar operación' }).first();
    if (await ini.count() === 0) { console.log(tema, '⚠ no hay botón de iniciar'); await p.close(); continue; }
    await ini.click();
    await p.waitForTimeout(2200);
    await p.screenshot({ path:`/home/user/atenea/.banco-pruebas/tomas/${salida}${sufijo}.png`, fullPage:true });
    const m = await p.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    console.log(`${tema}: ${m[0]}/${m[1]} ${m[1]>m[0]?'⚠ SE VA A LOS LADOS':'✓'}`);
    await p.close();
  }
  await b.close();
})();
