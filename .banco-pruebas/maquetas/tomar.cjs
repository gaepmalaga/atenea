const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  for (const v of ['a','b','c','d','e','f']) {
    const page = await browser.newPage({
      viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark',
    });
    await page.goto(`http://localhost:8899/maquetas/login.html?v=${v}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `/home/user/atenea/.banco-pruebas/maquetas/login-${v}.png`, fullPage: true });
    const w = await page.evaluate(() => [document.documentElement.clientWidth, document.documentElement.scrollWidth]);
    console.log(`${v}: ${w[0]} / ${w[1]} ${w[1] > w[0] ? '⚠ desborde' : '✓'}`);
    await page.close();
  }
  await browser.close();
})();
