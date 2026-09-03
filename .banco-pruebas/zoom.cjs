const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4 });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.locator('nav.fixed button', { hasText: 'Test' }).first().click(); await p.waitForTimeout(500);
  await p.locator('button', { hasText: 'Iniciar operación' }).first().click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: '/home/user/atenea/.banco-pruebas/tomas/zoom-cabecera.png', clip: { x: 0, y: 60, width: 390, height: 80 } });
  // Y los colores reales que se estan pintando
  const c = await p.evaluate(() => {
    const cab = document.querySelector('.sticky');
    const fila = [...cab.querySelectorAll('div')].find(d => d.className.includes('flex gap-1 items-end'));
    return [...fila.children].map(hijo => {
      const barra = hijo.querySelector('span:last-child') || hijo;
      const s = getComputedStyle(barra);
      const r = barra.getBoundingClientRect();
      return { bg: s.backgroundColor, w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y) };
    });
  });
  console.log(JSON.stringify(c));
  console.log('fondo cabecera:', await p.evaluate(() => getComputedStyle(document.querySelector('.sticky')).backgroundColor));
  await b.close();
})();
