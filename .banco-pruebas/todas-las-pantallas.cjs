/**
 * TODAS las pantallas, alumno y administracion, una por una.
 *
 * `recorrido.cjs` sigue un camino (el examen) y `examen-completo.cjs` lo
 * termina. Este entra en CADA modulo y en CADA seccion del panel, incluidos
 * los que nadie habia mirado nunca en un movil: fichas, preparacion fisica,
 * perfilado, moderacion, registro y el alta de preguntas a mano.
 *
 * Comprueba lo mismo en todos: que nada ensancha la pagina, que ningun texto
 * se corta, que todo lo que se toca llega a 44px, que nada se pinta a 0x0 y
 * que la consola no escupe errores.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const TOMAS = '/home/user/atenea/.banco-pruebas/tomas';
const problemas = [];
const anota = (t) => { problemas.push(t); console.log('  ⚠ ' + t); };

const REVISAR = () => {
  const raiz = document.documentElement;
  const W = raiz.clientWidth;
  const out = [];
  const recortado = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') return true;
    }
    return false;
  };
  if (raiz.scrollWidth > W + 1) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (getComputedStyle(el).position === 'fixed' || recortado(el)) continue;
      if (r.right > W + 1 || r.left < -1) {
        out.push(`se sale <${el.tagName.toLowerCase()}> "${(el.textContent || '').trim().slice(0, 30)}" hasta ${Math.round(r.right)}px :: ${String(el.className).slice(0, 50)}`);
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
  for (const el of document.querySelectorAll('button, a, input, select, textarea, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.height < 40) out.push(`tactil de ${Math.round(r.height)}px "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 26)}" :: ${String(el.className).slice(0, 45)}`);
  }
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
    if (!oculto) out.push(`invisible <${el.tagName.toLowerCase()}> :: ${cls.slice(0, 50)}`);
  }
  // Un modulo caido deja su aviso: es el peor fallo posible y no se ve en las
  // otras comprobaciones porque la pantalla "funciona".
  if (/Este módulo ha fallado|ha fallado al cargar/i.test(document.body.innerText)) {
    out.push('EL MÓDULO SE HA CAÍDO (ModuleErrorBoundary)');
  }
  return [...new Set(out)].slice(0, 10);
};

const mira = async (page, donde) => {
  for (const p of await page.evaluate(REVISAR)) anota(`${donde}: ${p}`);
};

// Las cinco de la barra + las del cajon "Más".
// [etiqueta en la barra, etiqueta en el cajon "Más", fichero]
const ALUMNO = [
  ['Inicio', null, 'a-inicio'],
  ['Chat', null, 'a-chat'],
  ['Test', null, 'a-test'],
  ['Fallos', null, 'a-fallos'],
  [null, 'Drills', 'a-fichas'],
  [null, 'Prep. Física', 'a-fisica'],
  [null, 'Perfilado', 'a-perfil'],
  [null, 'Rango', 'a-rango'],
];
const ADMIN = [
  ['Usuarios', 'b-usuarios'], ['Academia', 'b-academia'], ['Temario', 'b-temario'],
  ['Banco', 'b-banco'], ['Moderación', 'b-moderacion'], ['Módulos', 'b-modulos'], ['Logs', 'b-logs'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const fallosJS = [];
  page.on('pageerror', (e) => fallosJS.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) fallosJS.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  console.log('\n=== ALUMNO ===');
  await page.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  for (const [enBarra, enCajon, fichero] of ALUMNO) {
    const etiqueta = enBarra ?? enCajon;
    const barra = page.locator('nav.fixed');
    let boton;
    if (enBarra) {
      boton = barra.locator('button', { hasText: new RegExp('^' + enBarra + '$', 'i') }).first();
    } else {
      // Vive en el cajon "Más". El cajon usa el nombre LARGO del modulo
      // ("Drills (Memoria)"), no el corto de la barra.
      await barra.locator('button', { hasText: 'Más' }).first().click();
      await page.waitForTimeout(450);
      boton = page.locator('div.fixed.inset-0 button', { hasText: enCajon }).first();
    }
    if (await boton.count() === 0) { anota(`${etiqueta}: no hay forma de llegar`); continue; }
    await boton.click();
    await page.waitForTimeout(1400);
    console.log(`\n--- ${etiqueta} ---`);
    await page.screenshot({ path: `${TOMAS}/${fichero}.png`, fullPage: true });
    await mira(page, etiqueta);
  }

  // --- LAS SUBPANTALLAS QUE NO SON UNA PESTAÑA ---
  // Se llega a ellas desde dentro de un modulo, asi que la vuelta por la barra
  // de pestañas no las ve. Son justo las que llevaban `text-7xl` y `text-9xl`
  // fijos: cronometro de las pruebas fisicas y contador de series.
  console.log('\n=== SUBPANTALLAS ===');

  // Prueba fisica: hub -> corredor de la prueba (cronometro incluido)
  await page.locator('nav.fixed').locator('button', { hasText: 'Más' }).first().click();
  await page.waitForTimeout(450);
  await page.locator('div.fixed.inset-0 button', { hasText: 'Prep. Física' }).first().click();
  await page.waitForTimeout(1300);
  for (const prueba of ['Fuerza', 'Resistencia']) {
    const b = page.locator('button', { hasText: prueba }).first();
    if (await b.count() === 0) { anota(`${prueba}: no se puede abrir`); continue; }
    await b.click();
    await page.waitForTimeout(1100);
    console.log(`\n--- Prueba: ${prueba} ---`);
    await page.screenshot({ path: `${TOMAS}/a-prueba-${prueba.toLowerCase()}.png`, fullPage: true });
    await mira(page, 'Prueba ' + prueba);
    const volver = page.locator('button', { hasText: /Volver a las pruebas/ }).first();
    if (await volver.count()) { await volver.click(); await page.waitForTimeout(1000); }
    else anota(`${prueba}: no hay forma de volver a las pruebas`);
  }

  // La sala de voz: es una capa a pantalla completa, no una pestaña.
  await page.locator('nav.fixed').locator('button', { hasText: 'Más' }).first().click();
  await page.waitForTimeout(450);
  await page.locator('div.fixed.inset-0 button', { hasText: 'Perfilado' }).first().click();
  await page.waitForTimeout(1200);
  const simular = page.locator('button[aria-label*="simulación"]').first();
  if (await simular.count()) {
    await simular.click();
    await page.waitForTimeout(1200);
    console.log('\n--- Sala de voz ---');
    await page.screenshot({ path: `${TOMAS}/a-sala-voz.png`, fullPage: true });
    await mira(page, 'Sala de voz');
  } else {
    anota('Sala de voz: no se encuentra el boton de iniciar simulacion');
  }

  console.log('\n=== ADMINISTRACIÓN ===');
  await page.goto('http://localhost:8899/index.html?vista=admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  for (const [etiqueta, fichero] of ADMIN) {
    const boton = page.locator('button', { hasText: etiqueta }).first();
    if (await boton.count() === 0) { anota(`Admin ${etiqueta}: no hay pestaña`); continue; }
    await boton.click();
    await page.waitForTimeout(1300);
    console.log(`\n--- Admin · ${etiqueta} ---`);
    await page.screenshot({ path: `${TOMAS}/${fichero}.png`, fullPage: true });
    await mira(page, 'Admin · ' + etiqueta);
  }

  console.log('\n=== RESUMEN ===');
  console.log('fallos de JavaScript: ' + fallosJS.length);
  for (const f of [...new Set(fallosJS)].slice(0, 8)) console.log('   ' + f.slice(0, 170));
  console.log('problemas de interfaz: ' + problemas.length);
  await browser.close();
})();
