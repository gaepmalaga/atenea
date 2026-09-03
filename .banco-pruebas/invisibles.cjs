/**
 * Elementos que PIDEN un tamaño y se pintan a 0x0.
 *
 * Es el fallo que dejó la barra de progreso del examen invisible desde
 * siempre: un `<span>` es `inline` por defecto y un elemento inline ignora
 * `width` y `height`. Dentro de un contenedor flex no pasa (los hijos se
 * "bloquifican"), así que el análisis estático da falsos positivos: hay que
 * medirlo en el navegador.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const DETECTOR = () => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cls = String(el.className);
    if (!/\b(?:w|h)-(?:\d|\[|full|px)/.test(cls)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) continue;
    // Lo que está oculto a propósito no cuenta.
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    let padreOculto = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const t = getComputedStyle(a);
      if (t.display === 'none' || t.visibility === 'hidden') { padreOculto = true; break; }
    }
    if (padreOculto) continue;
    out.push({ tag: el.tagName.toLowerCase(), display: s.display, cls: cls.slice(0, 80), padre: el.parentElement ? getComputedStyle(el.parentElement).display : '?' });
  }
  return out;
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  p.on('dialog', d => d.accept());
  const barra = () => p.locator('nav.fixed');
  const mira = async (donde) => {
    const r = await p.evaluate(DETECTOR);
    const vistos = new Set();
    for (const x of r) {
      const k = x.cls.slice(0, 50);
      if (vistos.has(k)) continue;
      vistos.add(k);
      console.log(`  ${donde}: <${x.tag}> display:${x.display} dentro de ${x.padre} :: ${x.cls}`);
    }
    return r.length;
  };

  let total = 0;
  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700); total += await mira('Inicio');

  await barra().locator('button', { hasText: 'Test' }).first().click(); await p.waitForTimeout(500);
  total += await mira('Config test');
  await p.locator('button', { hasText: 'Iniciar operación' }).first().click(); await p.waitForTimeout(1200);
  total += await mira('Examen');

  await p.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  for (const t of ['Chat', 'Fallos']) {
    await barra().locator('button', { hasText: t }).first().click(); await p.waitForTimeout(900);
    total += await mira(t);
  }

  await p.goto('http://localhost:8899/index.html?vista=admin', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  total += await mira('Admin');
  for (const s of ['Academia', 'Temario', 'Banco', 'Moderación', 'Módulos', 'Logs']) {
    const btn = p.locator('button', { hasText: s }).first();
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(800); total += await mira('Admin·' + s); }
  }

  console.log(total === 0 ? '\nNada invisible.' : `\n${total} elementos a 0x0.`);
  await b.close();
})();
