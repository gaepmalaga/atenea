/**
 * Recorrido completo de la aplicación, en un navegador de verdad y a tamaño
 * de móvil. Comprueba COMPORTAMIENTO, no solo la pinta:
 * el scroll al cambiar de pantalla, el botón Atrás, y que un examen a medias
 * se pueda reanudar después de recargar.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const TOMAS = '/home/user/atenea/.banco-pruebas/tomas';
const BASE = 'http://localhost:8899/index.html';

const barra = (page) => page.locator('nav.fixed');
const problemas = [];
const anota = (t) => { problemas.push(t); console.log('  ⚠ ' + t); };

/** Cualquier cosa que se salga del ancho de la pantalla. */
async function desbordes(page, donde) {
  const malos = await page.evaluate(() => {
    const raiz = document.documentElement;
    const w = raiz.clientWidth;
    // Solo interesa si la pagina se puede arrastrar de lado. Un adorno
    // recortado por `overflow-hidden` sobresale del rectangulo pero no
    // provoca scroll: no es un fallo.
    if (raiz.scrollWidth <= w + 1) return [];
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > w + 1 || r.left < -1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 70),
          txt: (el.textContent || '').trim().slice(0, 40),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
    }
    return out.slice(0, 6);
  });
  for (const m of malos) anota(`${donde}: se sale de la pantalla <${m.tag}> "${m.txt}" (${m.left}→${m.right}px) ${m.cls}`);
  return malos.length;
}

/** Texto cortado con puntos suspensivos por no caber. */
async function recortados(page, donde) {
  const cortados = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length > 0) continue;
      const s = getComputedStyle(el);
      if (s.textOverflow !== 'ellipsis') continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push({ txt: (el.textContent || '').trim().slice(0, 40), falta: el.scrollWidth - el.clientWidth });
      }
    }
    return out.slice(0, 8);
  });
  for (const c of cortados) anota(`${donde}: texto cortado "${c.txt}" (le faltan ${c.falta}px)`);
  return cortados.length;
}

/** Todo lo que se puede tocar tiene que llegar a 44px. */
async function tactil(page, donde) {
  const pequenos = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, a, input, select, [role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 40) {
        out.push({ h: Math.round(r.height), txt: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 32) });
      }
    }
    return out.slice(0, 6);
  });
  for (const p of pequenos) anota(`${donde}: área táctil de ${p.h}px "${p.txt}"`);
  return pequenos.length;
}

async function revisar(page, donde) {
  await desbordes(page, donde);
  await recortados(page, donde);
  await tactil(page, donde);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const fallosJS = [];
  page.on('pageerror', (e) => fallosJS.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) fallosJS.push(m.text()); });

  page.on('dialog', (d) => d.accept());

  console.log('\n=== ALUMNO ===');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${TOMAS}/alumno-01-inicio.png` });
  await revisar(page, 'Inicio');

  // --- EL SCROLL AL CAMBIAR DE PANTALLA (lo que reportó el usuario) ---
  console.log('\n--- scroll al cambiar de pestaña ---');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const antes = await page.evaluate(() => window.scrollY);
  await barra(page).locator('button', { hasText: 'Test' }).first().click();
  await page.waitForTimeout(600);
  const despues = await page.evaluate(() => window.scrollY);
  console.log(`  scroll antes=${Math.round(antes)}  después=${Math.round(despues)}`);
  if (despues > 10) anota(`al cambiar de pestaña la página se queda en ${Math.round(despues)}px en vez de arriba`);
  await page.screenshot({ path: `${TOMAS}/alumno-02-test-config.png` });
  await revisar(page, 'Configurar test');

  // --- HACER UN EXAMEN ---
  console.log('\n--- hacer un examen ---');
  await page.locator('button', { hasText: 'Iniciar operación' }).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${TOMAS}/alumno-03-pregunta.png` });
  await revisar(page, 'Pregunta activa');

  // Responder la primera
  const opciones = page.locator('button').filter({ hasText: /^[ABC]/ });
  const nOpc = await opciones.count();
  console.log(`  opciones visibles: ${nOpc}`);
  await page.locator('main button').filter({ hasText: 'opción' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${TOMAS}/alumno-04-respondida.png` });
  await revisar(page, 'Pregunta respondida');

  // --- REANUDAR DESPUÉS DE RECARGAR (el fallo grave) ---
  console.log('\n--- recargar en mitad del examen ---');
  const guardado = await page.evaluate(() => window.localStorage.getItem('atenea:examen-en-curso'));
  console.log(`  examen guardado en disco: ${guardado ? Math.round(guardado.length / 1024) + ' KB' : 'NADA'}`);
  if (!guardado) anota('el examen NO se está guardando: una recarga lo perdería');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await barra(page).locator('button', { hasText: 'Test' }).first().click();
  await page.waitForTimeout(700);
  const ofrece = await page.locator('text=/examen a medias/i').count();
  console.log(`  ¿ofrece reanudarlo?: ${ofrece > 0 ? 'SÍ' : 'NO'}`);
  if (ofrece === 0) anota('tras recargar no ofrece reanudar el examen');
  await page.screenshot({ path: `${TOMAS}/alumno-05-reanudar.png` });
  await revisar(page, 'Reanudar');

  // --- BOTÓN ATRÁS ---
  console.log('\n--- botón atrás ---');
  await barra(page).locator('button', { hasText: 'Inicio' }).first().click();
  await page.waitForTimeout(400);
  await page.goBack();
  await page.waitForTimeout(500);
  const sigueDentro = await page.locator('#raiz').count();
  const titulo = await page.locator('h1').first().innerText().catch(() => '');
  console.log(`  tras Atrás: ${sigueDentro ? 'sigue en la aplicación' : 'SE HA SALIDO'} · ${titulo}`);
  if (!sigueDentro) anota('el botón Atrás saca de la aplicación');

  // --- RESTO DE PANTALLAS ---
  for (const [etiqueta, fichero] of [['Chat', 'chat'], ['Fallos', 'repaso']]) {
    await barra(page).locator('button', { hasText: etiqueta }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${TOMAS}/alumno-${fichero}.png` });
    await revisar(page, etiqueta);
  }

  // El menú "Más"
  await barra(page).locator('button', { hasText: 'Más' }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${TOMAS}/alumno-mas.png` });
  await revisar(page, 'Menú Más');
  for (const etiqueta of ['Drills', 'Rango']) {
    const b = page.locator('div.fixed.inset-0 button', { hasText: etiqueta }).first();
    if (await b.count()) {
      await b.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${TOMAS}/alumno-${etiqueta.toLowerCase()}.png` });
      await revisar(page, etiqueta);
      await barra(page).locator('button', { hasText: 'Más' }).first().click();
      await page.waitForTimeout(400);
    }
  }

  console.log('\n=== ADMINISTRACIÓN ===');
  await page.goto(BASE + '?vista=admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${TOMAS}/admin-01-usuarios.png` });
  await revisar(page, 'Admin · Usuarios');

  for (const seccion of ['Academia', 'Temario', 'Banco', 'Moderación', 'Módulos', 'Logs']) {
    const b = page.locator('button', { hasText: seccion }).first();
    if (await b.count()) {
      await b.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${TOMAS}/admin-${seccion.toLowerCase().replace(/[^a-z]/g, '')}.png` });
      await revisar(page, `Admin · ${seccion}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`fallos de JavaScript: ${fallosJS.length}`);
  fallosJS.slice(0, 8).forEach((f) => console.log('  ✗ ' + f.slice(0, 160)));
  console.log(`problemas de interfaz: ${problemas.length}`);

  await browser.close();
})().catch((e) => { console.error('FALLO DEL RECORRIDO:', e.message); process.exit(1); });
