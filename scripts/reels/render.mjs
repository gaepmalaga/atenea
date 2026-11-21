/**
 * RENDER DE UN REEL DE PREGUNTA TEST (1080×1920, 30 fps, MP4 con sonido).
 *
 * Cada fotograma se calcula desde cero a partir del tiempo (`render(t)` en
 * `plantilla.html`), así que no hay nada que dependa de cuándo se pinta: el
 * mismo `t` da siempre la misma imagen. Se hace una captura por fotograma con
 * Chromium y se codifica con ffmpeg junto al sonido de `sonido.mjs`.
 *
 *   node scripts/reels/render.mjs                    los 3 ejemplos de `ejemplos.json`
 *   node scripts/reels/render.mjs --solo=1           solo el segundo
 *   node scripts/reels/render.mjs --previa           solo unas capturas clave (PNG), sin vídeo
 *   node scripts/reels/render.mjs --salida=/ruta     dónde dejar los ficheros (por defecto ./reels-salida)
 *   node scripts/reels/render.mjs --fps=30 --hilos=4
 *
 * Necesita `ffmpeg` y Chromium (`playwright`). No toca la base de datos.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lineaDeTiempo } from './linea.mjs';
import { generaSonido } from './sonido.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] ?? d;
const SALIDA = resolve(arg('salida', 'reels-salida'));
const FPS = Number(arg('fps', 30));
const HILOS = Number(arg('hilos', 4));
const PREVIA = process.argv.includes('--previa');
const SOLO = arg('solo', null);

const ejemplos = JSON.parse(readFileSync(join(AQUI, 'ejemplos.json'), 'utf-8'));
const assets = {
  isotipo: pathToFileURL(join(AQUI, '../../public/marca/alphapol-isotipo-oficial.webp')).href,
  logotipo: pathToFileURL(join(AQUI, '../../public/marca/alphapol-logotipo-oficial.webp')).href,
};
mkdirSync(SALIDA, { recursive: true });

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const abre = async (p, L) => {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(AQUI, 'plantilla.html')).href);
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(([d, l, a]) => window.setup(d, l, a), [p, L, assets]);
  await page.evaluate(async () => { await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  return page;
};

for (const [idx, p] of ejemplos.entries()) {
  if (SOLO !== null && Number(SOLO) !== idx) continue;
  const L = lineaDeTiempo(p);
  const nombre = `reel-${idx + 1}-tema${p.tema}-${p.id}`;
  console.log(`\n▶ ${nombre}  ${L.total}s  (${Math.round(L.total * FPS)} fotogramas)`);

  if (PREVIA) {
    const page = await abre(p, L);
    const marcas = [0.9, 2.0, L.q0 + 1.6, L.cards0 + 1.2, L.cdStart + 1.5, L.reveal + 0.12, L.reveal + 0.5, L.trans + 1.4, L.end0 + 2.2];
    for (const [i, t] of marcas.entries()) {
      await page.evaluate((x) => window.render(x), t);
      await page.screenshot({ path: join(SALIDA, `${nombre}-previa${i}.png`) });
    }
    await page.close();
    continue;
  }

  const dir = join('/tmp', `reels-${nombre}`);
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const n = Math.round(L.total * FPS);
  const paginas = await Promise.all(Array.from({ length: HILOS }, () => abre(p, L)));
  const t0 = Date.now();
  await Promise.all(paginas.map(async (page, h) => {
    for (let f = h; f < n; f += HILOS) {
      await page.evaluate((x) => window.render(x), f / FPS);
      await page.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
    }
  }));
  await Promise.all(paginas.map((pg) => pg.close()));
  console.log(`  fotogramas listos en ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  const wav = join(dir, 'sonido.wav');
  generaSonido(p, L, wav);
  const mp4 = join(SALIDA, `${nombre}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', join(dir, '%05d.jpg'), '-i', wav,
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9,afade=t=out:st=' + (L.total - 0.5) + ':d=0.5',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', '-shortest', mp4], { stdio: 'inherit' });
  console.log(`  ✔ ${mp4}`);
  rmSync(dir, { recursive: true, force: true });
}
await browser.close();
