/** ¿Se ve el enunciado al pasar de pregunta, o hay que subir a mano? */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:'light' });
  await p.goto('http://localhost:8899/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);
  await p.locator('nav.fixed').locator('button', { hasText:/^TEST$/i }).first().click();
  await p.waitForTimeout(700);
  // Simulacro: en entrenamiento hay que diagnosticar el fallo antes de poder
  // avanzar, y aqui lo que se mide es el scroll, no eso.
  const sim = p.locator('button').filter({ hasText: /simulacro/i }).first();
  if (await sim.count()) { await sim.click(); await p.waitForTimeout(400); }
  await p.locator('button', { hasText:'Iniciar operación' }).first().click();
  await p.waitForTimeout(2200);

  // Bajar del todo, como quien acaba de leer una pregunta larga.
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(300);
  const antes = await p.evaluate(() => window.scrollY);

  // Pasar de pregunta.
  // En entrenamiento hay que contestar antes de poder avanzar.
  await p.locator('[data-opcion]').first().click();
  await p.waitForTimeout(600);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(300);
  const siguiente = p.locator('button').filter({ hasText: /SIGUIENTE|REVISAR|CONTINUAR/i }).first();
  if (await siguiente.count() === 0) { console.log('⚠ no hay botón de avanzar'); await b.close(); return; }
  await siguiente.click();
  await p.waitForTimeout(700);
  const despues = await p.evaluate(() => window.scrollY);

  // ¿Está el enunciado dentro de la pantalla?
  const visible = await p.evaluate(() => {
    const h = document.querySelector('h3');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return r.top >= 0 && r.top < window.innerHeight;
  });

  console.log(`scroll antes de avanzar: ${antes}px · después: ${despues}px`);
  console.log(`enunciado visible al llegar: ${visible === null ? '?' : visible ? 'SÍ ✓' : 'NO ⚠'}`);
  await p.screenshot({ path:'/home/user/atenea/.banco-pruebas/tomas/scroll-pregunta.png' });
  await b.close();
})();
