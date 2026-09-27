/**
 * Genera las imágenes de los carruseles (1080×1350, 4:5) y POSTS.md a partir
 * de `contenido.mjs`.
 *
 *   cd marketing/instagram/generador
 *   npm install            # solo la primera vez (playwright-core + fuentes)
 *   node render.mjs        # todos
 *   node render.mjs 02     # solo los posts cuyo id empieza por 02
 *
 * Usa el Chromium del sistema. Si no está en /opt/pw-browsers, pasa la ruta
 * en CHROMIUM_PATH.
 *
 * Diseño: el mismo lenguaje que la pantalla de entrada de la app (regla 43 de
 * CLAUDE.md): plano, bordes gruesos, el filete de la bandera 1:2:1 y el rojo
 * como acento. HUESO = post para opositores, NOCHE = post para academias. En
 * la cuadrícula del perfil se distingue de un vistazo a quién habla cada post.
 */
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { POSTS } from './contenido.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA_PNG = resolve(AQUI, '../png');
const SALIDA_MD = resolve(AQUI, '../POSTS.md');
const FUENTES = pathToFileURL(join(AQUI, 'node_modules/@fontsource')).href;

const CHROMIUM =
  process.env.CHROMIUM_PATH ??
  ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(
    existsSync,
  );

const TEMAS = {
  hueso: { bg: '#f7f4ee', ink: '#111820', muted: '#3d4a5a', acc: '#c60b1e', card: '#ffffff', line: '#111820', soft: '#e9e4d9' },
  noche: { bg: '#111820', ink: '#f7f4ee', muted: '#a3aebb', acc: '#ffc400', card: '#1a2330', line: '#f7f4ee', soft: '#243040' },
};
const TONOS = { rojo: '#c60b1e', ambar: '#d98a00', verde: '#15803d', azul: '#1d4ed8', gris: '#8d99a8', negro: '#111820' };
/** El usuario de Instagram que sale en la última diapositiva. Si la cuenta se llama de otra forma, cámbialo aquí y regenera. */
const USUARIO = process.env.IG_USUARIO ?? '@ateneapolicial';
const PUBLICO = { opositor: 'Para opositores', academia: 'Para academias', ambos: 'Opositores · Academias' };

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **texto** → acento. */
const md = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<em>$1</em>');
const sinMarcas = (s = '') => String(s).replace(/\*\*/g, '');

const ESCUDO = (ground, ink) => `
<svg viewBox="128 110 256 312" xmlns="http://www.w3.org/2000/svg">
  <path fill="${ink}" d="M128 120 L384 120 L384 250 C384 326 344 380 256 412 C168 380 128 326 128 250 Z"/>
  <path fill="#c60b1e" d="M128 120 H384 V134 H128 Z"/>
  <path fill="#ffc400" d="M128 134 H384 V162 H128 Z"/>
  <path fill="#c60b1e" d="M128 162 H384 V176 H128 Z"/>
  <path fill="${ground}" d="M256 194 L186 366 L230 366 L244 318 L268 318 L282 366 L326 366 Z"/>
  <path fill="${ink}" d="M256 236 L236 302 L276 302 Z"/>
</svg>`;

// ─────────────────────────────────────────────────────────── diapositivas

function cuerpoSlide(s, t) {
  switch (s.tipo) {
    case 'portada':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h1 class="portada fit">${md(s.titulo)}</h1>
        ${s.sub ? `<p class="sub">${md(s.sub)}</p>` : ''}`;
    case 'texto':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h2 class="fit">${md(s.titulo)}</h2>
        <p class="cuerpo">${md(s.cuerpo)}</p>`;
    case 'lista':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        ${s.titulo ? `<h2 class="h-lista">${md(s.titulo)}</h2>` : ''}
        <ol class="lista fit">
          ${s.items.map((it, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><div><b>${md(it.h)}</b>${it.p ? `<span>${md(it.p)}</span>` : ''}</div></li>`).join('')}
        </ol>
        ${s.nota ? `<p class="nota">${md(s.nota)}</p>` : ''}`;
    case 'formula':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <div class="formula">${esc(s.formula)}</div>
        <div class="leyenda">${s.leyenda.map((l) => `<span>${esc(l)}</span>`).join('')}</div>
        <p class="cuerpo grande">${md(s.cuerpo)}</p>`;
    case 'cuenta':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h2 class="h-lista">${md(s.titulo)}</h2>
        <div class="cuenta">
          ${s.pasos.map(([a, b]) => `<div class="paso"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}
          <div class="resultado"><span>Nota</span><span>${esc(s.resultado)}</span></div>
        </div>
        ${s.nota ? `<p class="cuerpo grande">${md(s.nota)}</p>` : ''}`;
    case 'numero':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <div class="grande">${esc(s.grande)}</div>
        <p class="label">${md(s.label)}</p>
        ${s.cuerpo ? `<p class="cuerpo">${md(s.cuerpo)}</p>` : ''}`;
    case 'barras':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <div class="barras">
          ${s.filas
            .map(
              (f) => `<div class="barra">
                <div class="barra-top"><span class="tn">${esc(f.n)}</span><span class="bl">${esc(f.label)}</span><span class="bv">${f.v}</span></div>
                <div class="pista"><div class="relleno" style="width:${(f.v / s.max) * 100}%"></div></div>
              </div>`,
            )
            .join('')}
        </div>
        <p class="nota">${md(s.nota)}</p>`;
    case 'cajones':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h2 class="h-lista">${md(s.titulo)}</h2>
        <div class="cajones">
          ${s.items.map((c) => `<div class="cajon" style="--c:${TONOS[c.c]}"><b>${esc(c.h)}</b><span>${esc(c.p)}</span></div>`).join('')}
        </div>`;
    case 'compara':
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h2 class="h-lista">${md(s.titulo)}</h2>
        <div class="compara">
          ${[s.izq, s.der]
            .map(
              (col, i) => `<div class="col ${i ? 'der' : 'izq'}"><b>${esc(col.h)}</b>${col.items.map((x) => `<span>${esc(x)}</span>`).join('')}</div>`,
            )
            .join('')}
        </div>`;
    case 'panel':
      return `
        <div class="kicker">${md(s.kicker)}${s.ejemplo ? ' <i class="ej">Ejemplo</i>' : ''}</div>
        <h2 class="h-lista">${md(s.titulo)}</h2>
        <div class="panel">
          ${s.filas
            .map(
              (f) => `<div class="fila" style="--c:${TONOS[f.tono]}"><span class="punto"></span><div><b>${esc(f.estado)}</b><span>${esc(f.nombre)} · ${esc(f.detalle)}</span></div></div>`,
            )
            .join('')}
        </div>`;
    case 'cuadricula': {
      const celdas = [...s.celdas]
        .map((c, i) => `<div class="celda ${c}"><span>${i + 1}</span></div>`)
        .join('');
      return `
        <div class="kicker">${md(s.kicker)}</div>
        <h2 class="h-lista">${md(s.titulo)}</h2>
        <div class="cuadricula">${celdas}</div>
        <div class="leyenda2"><span class="V">Acertada</span><span class="R">Fallada</span><span class="B">En blanco</span></div>
        <p class="cuerpo">${md(s.cuerpo)}</p>`;
    }
    case 'semana': {
      const max = Math.max(...s.dias.map(([, v]) => v), 1);
      return `
        <div class="kicker">${md(s.kicker)}${s.ejemplo ? ' <i class="ej">Ejemplo</i>' : ''}</div>
        <div class="semana">
          ${s.dias
            .map(
              ([d, v], i) => `<div class="dia${i === 0 ? ' hoy' : ''}${v === 0 ? ' vacio' : ''}">
                <span class="dv">${v}</span>
                <div class="col-barra"><div style="height:${(v / max) * 100}%"></div></div>
                <span class="dd">${esc(d)}</span>
              </div>`,
            )
            .join('')}
        </div>
        <p class="cuerpo">${md(s.cuerpo)}</p>`;
    }
    case 'aviso':
      return `
        <div class="kicker">${md(s.kicker)}${s.ejemplo ? ' <i class="ej">Ejemplo</i>' : ''}</div>
        <div class="aviso"><span class="flecha">↗</span><p>${md(s.texto)}</p></div>
        <p class="cuerpo">${md(s.cuerpo)}</p>`;
    case 'curva': {
      const W = 904, H = 420, max = Math.max(...s.puntos);
      const pts = s.puntos.map((v, i) => [(i / (s.puntos.length - 1)) * W, H - (v / max) * (H - 20)]);
      const linea = pts.map((p) => p.join(',')).join(' ');
      return `
        <div class="kicker">${md(s.kicker)}${s.ejemplo ? ' <i class="ej">Ejemplo</i>' : ''}</div>
        <div class="grande medio">${esc(s.grande)}</div>
        <p class="label">${md(s.label)}</p>
        <svg class="curva" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <polygon points="0,${H} ${linea} ${W},${H}" fill="${t.acc}" opacity=".14"/>
          <polyline points="${linea}" fill="none" stroke="${t.acc}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${pts.at(-1)[0] - 4}" cy="${pts.at(-1)[1] + 4}" r="12" fill="${t.acc}"/>
        </svg>`;
    }
    case 'cierre':
      return `
        <div class="escudo-grande">${ESCUDO(t.bg, t.ink)}</div>
        <h2 class="cierre fit">${md(s.titulo)}</h2>
        ${s.cuerpo ? `<p class="cuerpo">${md(s.cuerpo)}</p>` : ''}
        <div class="accion">${esc(s.accion)} →</div>`;
    default:
      throw new Error(`Tipo de diapositiva desconocido: ${s.tipo}`);
  }
}

function html(post, s, i, total) {
  const tema = post.publico === 'academia' ? 'noche' : 'hueso';
  const t = TEMAS[tema];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;font-weight:500;src:url(${FUENTES}/archivo/files/archivo-latin-500-normal.woff2)}
@font-face{font-family:Archivo;font-weight:600;src:url(${FUENTES}/archivo/files/archivo-latin-600-normal.woff2)}
@font-face{font-family:Archivo;font-weight:800;src:url(${FUENTES}/archivo/files/archivo-latin-800-normal.woff2)}
@font-face{font-family:ArchivoBlack;src:url(${FUENTES}/archivo-black/files/archivo-black-latin-400-normal.woff2)}
@font-face{font-family:Mono;font-weight:500;src:url(${FUENTES}/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2)}
@font-face{font-family:Mono;font-weight:800;src:url(${FUENTES}/jetbrains-mono/files/jetbrains-mono-latin-800-normal.woff2)}
:root{--bg:${t.bg};--ink:${t.ink};--muted:${t.muted};--acc:${t.acc};--card:${t.card};--line:${t.line};--soft:${t.soft}}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1350px;background:var(--bg);color:var(--ink);font-family:Archivo,sans-serif;-webkit-font-smoothing:antialiased}
.lienzo{position:relative;width:1080px;height:1350px;display:flex;flex-direction:column;overflow:hidden}
.filete{height:30px;display:flex;flex-direction:column}
.filete i{display:block;background:#c60b1e;flex:1}.filete i:nth-child(2){background:#ffc400;flex:2}
header{display:flex;align-items:center;justify-content:space-between;padding:44px 84px 0}
.marca{display:flex;align-items:center;gap:18px;font-family:ArchivoBlack;font-size:32px;letter-spacing:.14em}
.marca svg{width:46px;height:56px}
.publico{font-family:Mono;font-weight:500;font-size:22px;letter-spacing:.06em;text-transform:uppercase;border:3px solid var(--line);padding:10px 18px}
main{flex:1;display:flex;flex-direction:column;justify-content:center;padding:40px 84px;min-height:0}
footer{display:flex;justify-content:space-between;align-items:center;padding:0 84px 52px;font-family:Mono;font-weight:500;font-size:24px;color:var(--muted)}
footer .desliza{color:var(--ink);font-weight:800}
em{font-style:normal;color:var(--acc)}
.kicker{font-family:Mono;font-weight:800;font-size:26px;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);margin-bottom:36px}
.ej{font-style:normal;color:var(--muted);border:2px solid var(--muted);padding:3px 10px;margin-left:12px;font-weight:500;font-size:20px;vertical-align:3px}
h1.portada{font-family:ArchivoBlack;font-size:124px;line-height:.98;letter-spacing:-.01em;text-transform:uppercase;max-height:760px}
.sub{font-weight:600;font-size:48px;line-height:1.2;color:var(--muted);margin-top:48px;max-width:880px}
h2{font-family:ArchivoBlack;font-size:84px;line-height:1.02;letter-spacing:-.01em;max-height:560px}
h2.h-lista{font-size:60px;margin-bottom:44px;max-height:none}
h2.cierre{font-size:80px;max-height:460px}
.cuerpo{font-weight:500;font-size:42px;line-height:1.36;color:var(--muted);margin-top:44px;max-width:900px}
.cuerpo.grande{font-size:48px;color:var(--ink);font-weight:600}
.nota{font-family:Mono;font-weight:500;font-size:26px;color:var(--muted);margin-top:32px}
.lista{list-style:none;display:flex;flex-direction:column;gap:30px;max-height:900px}
.lista li{display:flex;gap:30px;align-items:flex-start;border-top:3px solid var(--line);padding-top:26px}
.lista .num{font-family:Mono;font-weight:800;font-size:30px;color:var(--acc);padding-top:6px;min-width:48px}
.lista b{display:block;font-weight:800;font-size:44px;line-height:1.12}
.lista span:not(.num){display:block;font-weight:500;font-size:34px;line-height:1.3;color:var(--muted);margin-top:8px}
.formula{font-family:Mono;font-weight:800;font-size:66px;letter-spacing:-.03em;border:4px solid var(--line);background:var(--card);padding:56px 40px;text-align:center;white-space:nowrap}
.leyenda{display:flex;gap:40px;margin-top:28px;font-family:Mono;font-weight:500;font-size:28px;color:var(--muted)}
.cuenta{border:4px solid var(--line);background:var(--card)}
.paso,.resultado{display:flex;justify-content:space-between;align-items:baseline;padding:26px 40px;font-family:Mono;font-weight:500;font-size:44px}
.paso+.paso{border-top:2px dashed var(--soft)}
.paso span:last-child{font-weight:800}
.resultado{background:var(--ink);color:var(--bg);font-weight:800}
.resultado span:first-child{font-size:34px;letter-spacing:.1em;text-transform:uppercase}
.resultado span:last-child{font-family:ArchivoBlack;font-size:120px;line-height:1;color:${tema === 'hueso' ? '#ffc400' : '#c60b1e'}}
.grande{font-family:ArchivoBlack;font-size:320px;line-height:.9;letter-spacing:-.03em;color:var(--acc)}
.grande.medio{font-size:190px}
.label{font-weight:800;font-size:60px;line-height:1.1;margin-top:30px;max-width:900px}
.barras{display:flex;flex-direction:column;gap:38px}
.barra-top{display:flex;align-items:baseline;gap:22px;margin-bottom:14px}
.tn{font-family:Mono;font-weight:800;font-size:32px;color:var(--acc);min-width:92px}
.bl{font-weight:600;font-size:34px;flex:1;line-height:1.15}
.bv{font-family:ArchivoBlack;font-size:52px}
.pista{height:30px;background:var(--soft)}
.relleno{height:100%;background:var(--ink)}
.cajones{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.cajon{border:3px solid var(--line);border-top:18px solid var(--c);background:var(--card);padding:28px 30px;min-height:190px}
.cajon b{display:block;font-weight:800;font-size:42px}
.cajon span{display:block;font-size:30px;line-height:1.25;color:var(--muted);margin-top:10px}
.compara{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.col{border:4px solid var(--line);padding:36px 32px;display:flex;flex-direction:column;gap:22px;background:var(--card)}
.col b{font-family:ArchivoBlack;font-size:46px;margin-bottom:6px}
.col.der b{color:var(--acc)}
.col span{font-weight:600;font-size:33px;line-height:1.25;border-top:2px solid var(--soft);padding-top:18px}
.panel{border:4px solid var(--line);background:var(--card)}
.fila{display:flex;gap:26px;align-items:center;padding:30px 34px}
.fila+.fila{border-top:2px solid var(--soft)}
.punto{width:30px;height:30px;border-radius:50%;background:var(--c);flex:none}
.fila b{display:block;font-weight:800;font-size:40px}
.fila span:not(.punto){display:block;font-size:30px;color:var(--muted);margin-top:6px}
.cuadricula{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;max-width:600px}
.celda{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-family:Mono;font-weight:800;font-size:32px;color:#fff}
.celda.V{background:#15803d}.celda.R{background:#c60b1e}
.celda.B{border:4px dashed var(--muted);color:var(--muted)}
.leyenda2{display:flex;gap:36px;margin-top:30px;font-family:Mono;font-size:26px;font-weight:500}
.leyenda2 span::before{content:'';display:inline-block;width:24px;height:24px;margin-right:12px;vertical-align:-4px}
.leyenda2 .V::before{background:#15803d}.leyenda2 .R::before{background:#c60b1e}.leyenda2 .B::before{border:3px dashed var(--muted)}
.aviso{display:flex;gap:30px;border:4px solid var(--line);background:var(--card);padding:48px 44px}
.aviso .flecha{font-family:ArchivoBlack;font-size:84px;color:var(--acc);line-height:1}
.aviso p{font-weight:800;font-size:54px;line-height:1.18}
.curva{width:100%;height:420px;margin-top:40px;border-bottom:4px solid var(--line)}
.escudo-grande svg{width:120px;height:146px;margin-bottom:48px}
.accion{align-self:flex-start;margin-top:56px;font-family:ArchivoBlack;font-size:32px;white-space:nowrap;text-transform:uppercase;letter-spacing:.02em;background:var(--acc);color:${tema === 'hueso' ? '#fff' : '#111820'};padding:26px 36px;border:4px solid var(--line)}
.semana{display:flex;gap:18px;align-items:flex-end;height:560px;border-bottom:4px solid var(--line)}
.dia{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
.dv{font-family:ArchivoBlack;font-size:46px;margin-bottom:12px}
.col-barra{flex:1;width:100%;display:flex;align-items:flex-end}
.col-barra div{width:100%;background:var(--ink);min-height:6px}
.dia.hoy .col-barra div{background:var(--acc)}.dia.hoy .dv{color:var(--acc)}
.dia.vacio .dv{color:var(--muted)}
.dd{font-family:Mono;font-weight:800;font-size:26px;margin:18px 0 -58px;text-transform:uppercase}
.semana+.cuerpo{margin-top:92px}
</style></head><body><div class="lienzo">
  <div class="filete"><i></i><i></i><i></i></div>
  <header><div class="marca">${ESCUDO(t.bg, t.ink)}ATENEA</div><div class="publico">${PUBLICO[post.publico]}</div></header>
  <main>${cuerpoSlide(s, t)}</main>
  <footer><span>${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>${i + 1 < total ? '<span class="desliza">Desliza →</span>' : `<span>${USUARIO}</span>`}</footer>
</div>
<script>
// Encoge el texto marcado .fit hasta que quepa (portadas y titulares largos).
document.fonts.ready.then(() => {
  for (const el of document.querySelectorAll('.fit')) {
    // Se mide contra el max-height del CSS, no contra clientHeight: con un
    // interlineado < 1 las letras sobresalen de su línea y clientHeight
    // encogería el texto sin necesidad.
    const limite = parseFloat(getComputedStyle(el).maxHeight);
    let size = parseFloat(getComputedStyle(el).fontSize);
    while ((el.scrollHeight > limite || el.scrollWidth > el.clientWidth) && size > 30) { size -= 2; el.style.fontSize = size + 'px'; }
  }
  const main = document.querySelector('main');
  window.__desborda = main.scrollHeight > main.clientHeight + 2;
  window.__listo = true;
});
</script></body></html>`;
}

// ─────────────────────────────────────────────────────────── POSTS.md

function markdown() {
  const lineas = [
    '# Los 12 posts de Instagram — textos',
    '',
    '> **Generado por `generador/render.mjs` a partir de `generador/contenido.mjs`. No se edita a mano:**',
    '> cambia el texto allí y vuelve a generar, o la imagen y el pie dirán cosas distintas.',
    '',
    'Las imágenes de cada post están en `png/<id>/`, numeradas en el orden en que se suben.',
    '',
  ];
  for (const p of POSTS) {
    lineas.push(
      `## ${p.id} · ${p.tema}`,
      '',
      `**Semana ${p.semana}, ${p.dia}** · Público: **${PUBLICO[p.publico]}**${p.fijar ? ' · 📌 **Fijar en el perfil**' : ''}`,
      '',
      '### Diapositivas',
      '',
    );
    p.slides.forEach((s, i) => {
      const partes = [s.kicker, s.titulo, s.sub, s.formula, s.grande && `${s.grande} ${s.label ?? ''}`, s.texto, s.cuerpo, s.nota, s.accion]
        .filter(Boolean)
        .map(sinMarcas);
      if (s.items) partes.push(...s.items.map((it) => `· ${sinMarcas(it.h)}${it.p ? ` — ${sinMarcas(it.p)}` : ''}`));
      if (s.filas) partes.push(...s.filas.map((f) => `· ${f.n ? `${f.n} ${f.label}: ${f.v}` : `${f.estado} — ${f.detalle}`}`));
      if (s.pasos) partes.push(...s.pasos.map(([a, b]) => `· ${a} ${b}`), `· Nota: ${s.resultado}`);
      if (s.izq) partes.push(`· ${s.izq.h}: ${s.izq.items.join(' / ')}`, `· ${s.der.h}: ${s.der.items.join(' / ')}`);
      if (s.ejemplo) partes.push('_(ejemplo ilustrativo)_');
      lineas.push(`${i + 1}. ${partes.join('  \n   ')}`);
    });
    lineas.push(
      '',
      '### Pie de foto',
      '',
      '```text',
      p.pie,
      '',
      p.hashtags.map((h) => `#${h}`).join(' '),
      '```',
      '',
      '### Texto alternativo (accesibilidad)',
      '',
      `> ${p.alt}`,
      '',
      '---',
      '',
    );
  }
  return lineas.join('\n');
}

// ─────────────────────────────────────────────────────────── main

const filtro = process.argv[2];
const posts = filtro ? POSTS.filter((p) => p.id.startsWith(filtro)) : POSTS;
if (!CHROMIUM) throw new Error('No encuentro Chromium. Pasa la ruta en CHROMIUM_PATH.');

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
const tmp = join(AQUI, '.tmp.html');
const avisos = [];

for (const post of posts) {
  const dir = join(SALIDA_PNG, post.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [i, s] of post.slides.entries()) {
    writeFileSync(tmp, html(post, s, i, post.slides.length));
    await page.goto(pathToFileURL(tmp).href);
    await page.waitForFunction(() => window.__listo === true);
    if (await page.evaluate(() => window.__desborda)) avisos.push(`${post.id} diapositiva ${i + 1}: el contenido desborda`);
    await page.screenshot({ path: join(dir, `${String(i + 1).padStart(2, '0')}.png`) });
  }
  console.log(`✓ ${post.id} (${post.slides.length} diapositivas)`);
}
await browser.close();
rmSync(tmp, { force: true });
if (!filtro) writeFileSync(SALIDA_MD, markdown());
if (avisos.length) {
  console.error('\n⚠ Revisar:\n' + avisos.join('\n'));
  process.exitCode = 1;
}
