/** El panel de administracion en modo oscuro: que siga entero. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [tema, suf] of [['dark','-oscuro'],['light','-claro']]) {
    const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:tema });
    await p.goto('http://localhost:8899/index.html?vista=admin', { waitUntil:'networkidle' });
    await p.waitForTimeout(1000);
    await p.locator('button', { hasText:'Temario' }).first().click();
    await p.waitForTimeout(1400);
    await p.screenshot({ path:`/home/user/atenea/.banco-pruebas/tomas/admin-temario${suf}.png`, fullPage:true });
    const m = await p.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    console.log(`${tema}: ${m[0]}/${m[1]} ${m[1]>m[0]?'⚠ desborde':'✓'}`);
    await p.close();
  }
  await b.close();
})();
