const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const mira = async (donde) => {
    const r = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('button, a, select, [role="button"]')) {
        const q = el.getBoundingClientRect();
        if (q.width === 0 || q.height === 0) continue;
        if (q.height >= 40) continue;
        out.push({ h: Math.round(q.height), w: Math.round(q.width), cls: String(el.className).slice(0, 95), txt: (el.textContent||'').trim().slice(0,26) });
      }
      return out;
    });
    const vistos = new Set();
    for (const x of r) { const k = x.cls.slice(0,60); if (vistos.has(k)) continue; vistos.add(k); console.log(`  ${donde} · ${x.h}px "${x.txt}" :: ${x.cls}`); }
  };
  await p.goto('http://localhost:8899/index.html?vista=admin', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  for (const s of ['Temario', 'Banco', 'Moderación', 'Módulos', 'Logs']) {
    const btn = p.locator('button', { hasText: s }).first();
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(800); await mira(s); }
  }
  console.log('\n--- ALUMNO: fichas ---');
  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('nav.fixed button', { hasText: 'Más' }).first().click(); await p.waitForTimeout(400);
  const d = p.locator('div.fixed.inset-0 button', { hasText: 'Drills' }).first();
  if (await d.count()) { await d.click(); await p.waitForTimeout(900); await mira('Fichas'); }
  await b.close();
})();
