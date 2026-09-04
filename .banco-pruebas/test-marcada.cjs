/** El test con una opcion ya marcada: es donde entra el rojo de la bandera. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [tema, suf] of [['dark','-oscuro'],['light','-claro']]) {
    const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:tema });
    await p.goto('http://localhost:8899/index.html', { waitUntil:'networkidle' });
    await p.waitForTimeout(900);
    await p.locator('nav.fixed').locator('button', { hasText:/^TEST$/i }).first().click();
    await p.waitForTimeout(700);
    // Simulacro, para que marcar no revele la respuesta al momento.
    const sim = p.locator('button', { hasText:/simulacro/i }).first();
    if (await sim.count()) { await sim.click(); await p.waitForTimeout(300); }
    await p.locator('button', { hasText:'Iniciar operación' }).first().click();
    await p.waitForTimeout(2200);
    await p.locator('[data-opcion]').nth(1).click();
    await p.waitForTimeout(600);
    await p.screenshot({ path:`/home/user/atenea/.banco-pruebas/tomas/DESPUES-marcada${suf}.png`, fullPage:true });
    console.log(tema, '✓');
    await p.close();
  }
  await b.close();
})();
