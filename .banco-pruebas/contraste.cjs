/**
 * TEXTO QUE NO SE LEE.
 *
 * Mide el contraste real de cada texto contra el fondo que de verdad tiene
 * detrás, con la fórmula de la WCAG, en las 19 pantallas.
 *
 * Existe por el compositor de preguntas: se escribió con la paleta del panel
 * de administración —que es oscura siempre— pero vive dentro del `Modal` del
 * sistema de diseño, que SIGUE EL TEMA del usuario. En un móvil en modo claro
 * quedaban recuadros casi negros con texto blanco dentro de un diálogo blanco,
 * y las opciones B y C eran gris sobre gris. Ilegible, en la pantalla donde se
 * escriben las preguntas a mano.
 *
 * No lo veía nada: las clases eran correctas una por una, el elemento tenía su
 * tamaño, y el texto no se salía de ningún sitio. Hay que MEDIRLO.
 *
 * El umbral es 3:1 y no el 4.5:1 de la WCAG a propósito. Esto no es una
 * auditoría de accesibilidad: es un detector de "esto no se ve", y con 4.5
 * salen cientos de avisos de texto de apoyo gris que está bien como está. Una
 * guardia que se queja de lo razonable acaba desactivada.
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const UMBRAL = 3;

const DETECTOR = (umbral) => {
  /**
   * Un color CSS a RGB, pintándolo.
   *
   * Un `match` con un regex de `rgb()` no vale: Tailwind v4 emite `oklch()` y
   * Chromium lo devuelve tal cual en `getComputedStyle`. Con el regex, todo
   * color de Tailwind salía `null`, el detector se saltaba ese fondo y subía
   * hasta el `<body>` blanco: decía que el panel de administración —que es
   * negro— tenía texto blanco sobre blanco. 71 avisos, todos falsos.
   *
   * Pintar el color en un canvas de 1x1 y leer el píxel deja la conversión en
   * manos del navegador, que es quien sabe hacerla.
   */
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 1;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  const lee = (c) => {
    if (!c || c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    if (cache.has(c)) return cache.get(c);
    let v = null;
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = c;
      // Si el navegador no entendió el color, `fillStyle` se queda en negro y
      // pintaríamos un falso negro opaco. Se comprueba con un segundo intento.
      const antes = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = c;
      if (ctx.fillStyle !== antes) return null;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    } catch { v = null; }
    cache.set(c, v);
    return v;
  };
  const sobre = (frente, fondo) => {
    const a = frente.a;
    return {
      r: frente.r * a + fondo.r * (1 - a),
      g: frente.g * a + fondo.g * (1 - a),
      b: frente.b * a + fondo.b * (1 - a),
      a: 1,
    };
  };
  const luz = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = luz(a), l2 = luz(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  /** El fondo que de verdad hay detrás: se apilan las capas semitransparentes. */
  const fondoReal = (el) => {
    const capas = [];
    for (let a = el; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      // Un degradado o una imagen de fondo no tienen UN color: no se puede
      // medir el contraste contra eso, y adivinarlo daría avisos inventados.
      if (s.backgroundImage !== 'none') return null;
      const c = lee(s.backgroundColor);
      if (!c || c.a === 0) continue;
      capas.push(c);
      if (c.a === 1) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
    return base;
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Solo elementos con texto PROPIO: si no, se cuenta el mismo texto una vez
    // por cada contenedor que lo envuelve.
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!propio) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.opacity === '0') continue;
    const color = lee(s.color);
    if (!color || color.a === 0) continue;
    const fondo = fondoReal(el);
    if (!fondo) continue;
    const c = ratio(sobre(color, fondo), fondo);
    if (c < umbral) {
      out.push(`contraste ${c.toFixed(1)}:1 en "${el.textContent.trim().slice(0, 32)}" (${s.color} sobre rgb(${Math.round(fondo.r)},${Math.round(fondo.g)},${Math.round(fondo.b)})) :: ${String(el.className).slice(0, 45)}`);
    }
  }
  return [...new Set(out)].slice(0, 8);
};

const problemas = [];
const anota = (t) => { problemas.push(t); console.log('  ⚠ ' + t); };

const ALUMNO = [['Inicio', null], ['Chat', null], ['Test', null], ['Fallos', null],
  [null, 'Drills'], [null, 'Prep. Física'], [null, 'Perfilado'], [null, 'Rango']];
const ADMIN = ['Usuarios', 'Academia', 'Temario', 'Banco', 'Moderación', 'Módulos', 'Logs'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('dialog', (d) => d.accept());

  console.log('\n=== ALUMNO ===');
  await page.goto('http://localhost:8899/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  for (const [enBarra, enCajon] of ALUMNO) {
    const barra = page.locator('nav.fixed');
    let boton;
    if (enBarra) boton = barra.locator('button', { hasText: new RegExp('^' + enBarra + '$', 'i') }).first();
    else {
      await barra.locator('button', { hasText: 'Más' }).first().click();
      await page.waitForTimeout(450);
      boton = page.locator('div.fixed.inset-0 button', { hasText: enCajon }).first();
    }
    if (await boton.count() === 0) continue;
    await boton.click();
    await page.waitForTimeout(1300);
    for (const p of await page.evaluate(DETECTOR, UMBRAL)) anota(`${enBarra ?? enCajon}: ${p}`);
  }

  console.log('\n=== ADMINISTRACIÓN ===');
  await page.goto('http://localhost:8899/index.html?vista=admin', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  for (const etiqueta of ADMIN) {
    const b = page.locator('button', { hasText: etiqueta }).first();
    if (await b.count() === 0) continue;
    await b.click();
    await page.waitForTimeout(1200);
    for (const p of await page.evaluate(DETECTOR, UMBRAL)) anota(`Admin · ${etiqueta}: ${p}`);
  }

  // Y los dos diálogos, que es donde apareció el fallo.
  const nueva = page.locator('button', { hasText: 'Banco' }).first();
  await nueva.click(); await page.waitForTimeout(1000);
  const componer = page.locator('button', { hasText: 'Nueva' }).first();
  if (await componer.count()) {
    await componer.click(); await page.waitForTimeout(900);
    for (const p of await page.evaluate(DETECTOR, UMBRAL)) anota(`Nueva pregunta: ${p}`);
  }

  console.log(`\n=== RESUMEN ===\ntextos por debajo de ${UMBRAL}:1 · ${problemas.length}`);
  await browser.close();
})();
