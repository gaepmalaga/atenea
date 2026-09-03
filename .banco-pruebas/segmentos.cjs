const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('dialog', d => d.accept());
  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.locator('nav.fixed button', { hasText: 'Test' }).first().click(); await p.waitForTimeout(500);
  await p.locator('button', { hasText: 'Iniciar operación' }).first().click(); await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    // La fila de segmentos: el contenedor con gap-1 dentro de la cabecera
    const cab = document.querySelector('.sticky');
    const filas = [...cab.querySelectorAll('div')].filter(d => d.className.includes('flex gap-1 items-end'));
    if (!filas.length) return 'no encontrada';
    const f = filas[0];
    const r = f.getBoundingClientRect();
    return {
      contenedor: { w: Math.round(r.width), x: Math.round(r.x) },
      hijos: [...f.children].map(c => { const q = c.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height) }; }),
      padre: { w: Math.round(f.parentElement.getBoundingClientRect().width), cls: f.parentElement.className.slice(0,60) },
    };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
