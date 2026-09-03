const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const T = '/home/user/atenea/.banco-pruebas/tomas';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p.on('dialog', d => d.accept());
  const barra = () => p.locator('nav.fixed');

  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);

  // Examen: config -> pregunta -> respondida -> diagnostico
  await barra().locator('button', { hasText: 'Test' }).first().click(); await p.waitForTimeout(600);
  await p.screenshot({ path: `${T}/v-01-config.png` });
  await p.locator('button', { hasText: 'Iniciar operación' }).first().click(); await p.waitForTimeout(1300);
  await p.screenshot({ path: `${T}/v-02-pregunta.png` });

  // Responder: pulsamos la primera opcion de la tarjeta
  const opts = p.locator('button').filter({ hasText: 'La primera opción' });
  if (await opts.count()) { await opts.first().click(); await p.waitForTimeout(900); }
  await p.screenshot({ path: `${T}/v-03-respondida.png` });
  await p.evaluate(() => window.scrollTo(0, 1200)); await p.waitForTimeout(400);
  await p.screenshot({ path: `${T}/v-04-diagnostico.png` });

  // Chat
  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await barra().locator('button', { hasText: 'Chat' }).first().click(); await p.waitForTimeout(700);
  await p.locator('input[placeholder*="consulta"]').fill('¿Cuántos artículos tiene la Constitución?');
  await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${T}/v-05-chat.png` });

  // Repasar fallos
  await barra().locator('button', { hasText: 'Fallos' }).first().click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${T}/v-06-fallos.png` });

  // Admin
  await p.goto('http://localhost:8899/index.html?vista=admin', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  await p.screenshot({ path: `${T}/v-07-admin-usuarios.png` });
  for (const [s, f] of [['Academia','v-08-admin-academia'],['Temario','v-09-admin-temario'],['Banco','v-10-admin-banco'],['Módulos','v-11-admin-modulos']]) {
    const btn = p.locator('button', { hasText: s }).first();
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(900); await p.screenshot({ path: `${T}/${f}.png` }); }
  }
  await b.close();
  console.log('capturas listas');
})();
