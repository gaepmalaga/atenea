/**
 * El examen ENTERO, de configurar a ver la nota.
 *
 * `recorrido.cjs` llega a la primera pregunta y para ahi. Todo lo que viene
 * despues —la pantalla de revision previa a entregar, la nota con la
 * penalizacion del BOE, el desglose— no lo habia mirado nunca nadie con una
 * pantalla de movil delante, y es la pantalla de la que mas se acuerda un
 * opositor.
 *
 * Hace las dos modalidades: entrenamiento (corrige al momento, con
 * diagnostico del fallo) y simulacro (navegacion libre, revision y entrega).
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const TOMAS = '/home/user/atenea/.banco-pruebas/tomas';
const problemas = [];
const anota = (t) => { problemas.push(t); console.log('  ⚠ ' + t); };

const REVISAR = () => {
  const raiz = document.documentElement;
  const W = raiz.clientWidth;
  const out = [];

  if (raiz.scrollWidth > W + 1) {
    const recortado = (el) => {
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).position === 'fixed' || recortado(el)) continue;
      if (r.right > W + 1 || r.left < -1) {
        out.push(`se sale <${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().slice(0, 32)}" hasta ${Math.round(r.right)}px`);
      }
    }
  }
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length > 0) continue;
    if (getComputedStyle(el).textOverflow !== 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      out.push(`texto cortado "${(el.textContent || '').trim().slice(0, 32)}" (faltan ${el.scrollWidth - el.clientWidth}px)`);
    }
  }
  for (const el of document.querySelectorAll('button, a, input, select, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 40) out.push(`tactil de ${Math.round(r.height)}px "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28)}"`);
  }
  // Lo que pide tamaño y sale a 0x0 (ver invisibles.cjs).
  for (const el of document.querySelectorAll('body *')) {
    const cls = String(el.className);
    if (!/\b(?:w|h)-(?:\d|\[|full|px)/.test(cls)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    let oculto = false;
    for (let a = el.parentElement; a; a = a.parentElement) {
      const t = getComputedStyle(a);
      if (t.display === 'none' || t.visibility === 'hidden') { oculto = true; break; }
    }
    if (!oculto) out.push(`invisible <${el.tagName.toLowerCase()}> :: ${cls.slice(0, 55)}`);
  }
  return [...new Set(out)].slice(0, 8);
};

const mira = async (page, donde) => {
  for (const p of await page.evaluate(REVISAR)) anota(`${donde}: ${p}`);
};

async function examen(page, modo) {
  const etiqueta = modo === 'exam' ? 'Simulacro' : 'Entrenamiento';
  console.log(`\n--- ${etiqueta} de principio a fin ---`);

  await page.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.removeItem('atenea:examen-en-curso'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('nav.fixed').locator('button', { hasText: 'Test' }).first().click();
  await page.waitForTimeout(700);

  const boton = page.locator('button', { hasText: modo === 'exam' ? 'Simulacro' : 'Entrenamiento' }).first();
  if (await boton.count()) { await boton.click(); await page.waitForTimeout(300); }

  await page.locator('button', { hasText: 'Iniciar operación' }).first().click();
  await page.waitForTimeout(1300);

  let vueltas = 0;
  while (vueltas++ < 60) {
    const opciones = page.locator('[data-opcion]');
    if (await opciones.count() === 0) break;

    if (vueltas === 1) { await mira(page, `${etiqueta} · pregunta`); }
    // Una respuesta distinta cada vez, para que la nota no salga redonda.
    const n = await opciones.count();
    await opciones.nth(vueltas % n).click();
    await page.waitForTimeout(450);

    if (vueltas === 1 && modo === 'practice') {
      await page.screenshot({ path: `${TOMAS}/x-practica-corregida.png`, fullPage: true });
      await mira(page, `${etiqueta} · corregida`);
    }

    // En entrenamiento, un fallo OBLIGA a diagnosticarlo antes de avanzar.
    const diagnostico = page.locator('button').filter({ hasText: /^(OLVIDO|LAGUNA|TRAMPA|LECTURA)$/ }).first();
    if (await diagnostico.count()) {
      if (vueltas === 1) {
        await page.screenshot({ path: `${TOMAS}/x-diagnostico.png`, fullPage: true });
        await mira(page, `${etiqueta} · diagnóstico`);
      }
      await diagnostico.click();
      await page.waitForTimeout(600);
    }

    const siguiente = page.locator('button').filter({ hasText: /SIGUIENTE|REVISAR|FINALIZAR/ }).first();
    if (await siguiente.count() === 0) break;
    if (await siguiente.isDisabled()) { anota(`${etiqueta}: no se puede avanzar en la pregunta ${vueltas}`); break; }
    const texto = (await siguiente.textContent() || '').trim();
    await siguiente.click();
    await page.waitForTimeout(700);
    if (/REVISAR|FINALIZAR/.test(texto)) break;
  }

  // Pantalla de revision (solo simulacro)
  if (await page.locator('text=/Antes de entregar/i').count()) {
    await page.screenshot({ path: `${TOMAS}/x-revision.png`, fullPage: true });
    await mira(page, `${etiqueta} · revisión`);
    await page.locator('button', { hasText: /Entregar/ }).first().click();
    await page.waitForTimeout(1500);
  }

  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${TOMAS}/x-${modo}-nota.png`, fullPage: true });
  await mira(page, `${etiqueta} · nota final`);

  const nota = await page.evaluate(() => document.body.innerText.slice(0, 700));
  console.log('  --- lo que ve el alumno al terminar ---');
  console.log(nota.split('\n').filter(Boolean).slice(0, 22).map((l) => '    ' + l).join('\n'));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const fallosJS = [];
  page.on('pageerror', (e) => fallosJS.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) fallosJS.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  await examen(page, 'practice');
  await examen(page, 'exam');

  console.log('\n=== RESUMEN ===');
  console.log('fallos de JavaScript: ' + fallosJS.length);
  for (const f of fallosJS.slice(0, 5)) console.log('   ' + f.slice(0, 160));
  console.log('problemas de interfaz: ' + problemas.length);
  await browser.close();
})();
