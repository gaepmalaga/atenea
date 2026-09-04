/** La tarjeta de repaso con una respuesta LARGA, que es cuando se rompia. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:'dark' });
  await p.goto('http://localhost:8899/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);
  // Drills vive en el cajon "Mas", con su nombre largo.
  await p.locator('nav.fixed').locator('button', { hasText:'Más' }).first().click();
  await p.waitForTimeout(500);
  await p.locator('div.fixed.inset-0 button', { hasText:'Drills' }).first().click();
  await p.waitForTimeout(900);
  const sel = p.locator('select').first();
  if (await sel.count()) { const v = await sel.locator('option').nth(1).getAttribute('value'); if (v) await sel.selectOption(v); }
  await p.waitForTimeout(400);
  const emp = p.locator('button', { hasText:'Empezar a repasar' }).first();
  if (await emp.count()) { await emp.click(); await p.waitForTimeout(900); }
  await p.locator('h3').first().click({ force:true }).catch(()=>{});   // voltear
  await p.waitForTimeout(900);
  await p.screenshot({ path:'/home/user/atenea/.banco-pruebas/tomas/drills-respuesta.png', fullPage:true });
  // ¿queda texto recortado sin poder arrastrarlo?
  const mal = await p.evaluate(() => {
    const out=[];
    document.querySelectorAll('p,h3').forEach(el=>{
      if (el.scrollHeight > el.clientHeight + 2) out.push('recortado: '+el.textContent.slice(0,45));
    });
    return { out, ancho:[document.documentElement.clientWidth, document.documentElement.scrollWidth] };
  });
  console.log('desborde lateral:', mal.ancho.join('/'), mal.ancho[1]>mal.ancho[0]?'⚠':'✓');
  console.log('textos recortados:', mal.out.length ? mal.out : 'ninguno ✓');
  await b.close();
})();
