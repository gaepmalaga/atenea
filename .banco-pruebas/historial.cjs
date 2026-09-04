/** El panel del historial del chat. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2, colorScheme:'light' });
  const fallos = []; p.on('pageerror', e => fallos.push(String(e)));
  await p.goto('http://localhost:8899/index.html', { waitUntil:'networkidle' });
  await p.waitForTimeout(900);
  await p.locator('nav.fixed').locator('button', { hasText:/^CHAT$/i }).first().click();
  await p.waitForTimeout(1200);
  await p.locator('button[aria-label="Ver mis conversaciones"]').click();
  await p.waitForTimeout(700);
  await p.screenshot({ path:'/home/user/atenea/.banco-pruebas/tomas/chat-historial.png', fullPage:true });
  // Abrir la cerrada y comprobar el aviso.
  await p.locator('button', { hasText:'Diferencia entre proyecto' }).first().click();
  await p.waitForTimeout(900);
  const aviso = await p.locator('text=Conversación archivada').count();
  await p.screenshot({ path:'/home/user/atenea/.banco-pruebas/tomas/chat-archivada.png', fullPage:true });
  const m = await p.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
  console.log(`ancho ${m[0]}/${m[1]} ${m[1]>m[0]?'⚠':'✓'} · aviso de archivada: ${aviso ? 'SÍ ✓' : 'NO ⚠'} · fallos JS: ${fallos.length}`);
  await b.close();
})();
