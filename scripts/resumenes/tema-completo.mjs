/**
 * EL TEMA COMPLETO EN PDF Y DOCX, con la marca de Alphapol.
 *
 *   node scripts/resumenes/tema-completo.mjs 01
 *
 * Lee temario/completo/tema-NN.contenido.mjs (fuente ÚNICA del texto) y genera
 * temario/completo/tema-NN.{html,pdf,docx}. El PDF sale de HTML + Chromium
 * (Playwright); el DOCX, de scripts/resumenes/tema_completo_docx.py con el mismo
 * contenido. Los números de página del índice se calculan en una segunda pasada.
 */
import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const L = require('lucide-react');
const { chromium } = require('playwright');

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NN = process.argv[2] ?? '01';
const CARPETA = join(RAIZ, 'temario', 'completo');
const { meta, secciones, realesPorAnio, test } = await import(pathToFileURL(join(CARPETA, `tema-${NN}.contenido.mjs`)).href);

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** **negrita** y ==subrayado amarillo== */
const en = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/==(.+?)==/g, '<mark>$1</mark>');
const icono = (n, color = '#fff', size = 22) => renderToStaticMarkup(React.createElement(L[n], { size, color, strokeWidth: 2 }));
const ICONOS = { guia: 'Target', derecho: 'Scale', norma: 'FileText', fuentes: 'BookOpen', jerarquia: 'Landmark', eficacia: 'Newspaper', persona: 'Baby', juridicas: 'Building2', nacionalidad: 'Flag', domicilio: 'House', vecindad: 'Map', numeros: 'BadgeCheck' };
const QR = await readFile(join(RAIZ, 'temario', 'esquemas', `qr-tema-${NN}.svg`), 'utf8').catch(() => '');
const LETRAS = ['A', 'B', 'C'];

const bloque = (b) => {
  switch (b.t) {
    case 'h3': return `<h3>${en(b.texto)}</h3>`;
    case 'p': return `<p>${en(b.texto)}</p>`;
    case 'ul': return `<ul>${b.items.map((i) => `<li>${en(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol>${b.items.map((i) => `<li>${en(i)}</li>`).join('')}</ol>`;
    case 'tabla': {
      const ancho = b.anchos ?? b.cols.map(() => 100 / b.cols.length);
      return `<table><colgroup>${ancho.map((a) => `<col style="width:${a}%">`).join('')}</colgroup><thead><tr>${b.cols.map((c) => `<th>${en(c)}</th>`).join('')}</tr></thead><tbody>${b.filas.map((f) => `<tr>${f.map((c) => `<td>${en(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    case 'clave': return `<div class="caja clave"><div class="et">${icono('Quote', '#8a6d12', 13)} ${esc(b.titulo)}</div><p>${en(b.texto)}</p></div>`;
    case 'examen': return `<div class="caja examen"><div class="et"><span>${icono('Flame', '#fff', 12)} CAYÓ EN EL EXAMEN</span><b>${b.anio}</b></div><p>${en(b.texto)}</p></div>`;
    case 'ojo': return `<div class="caja ojo"><div class="et">${icono('TriangleAlert', '#7a4a00', 13)} ${esc(b.titulo ?? 'OJO')}</div><p>${en(b.texto)}</p></div>`;
    case 'ejemplo': return `<div class="caja ejemplo"><div class="et">EJEMPLO</div><p>${en(b.texto)}</p></div>`;
    case 'resumen': return `<div class="caja resumen"><div class="et">${icono('Lightbulb', '#e2c977', 14)} EN RESUMEN</div><ul>${b.items.map((i) => `<li>${en(i)}</li>`).join('')}</ul></div>`;
    default: throw new Error('Bloque desconocido: ' + b.t);
  }
};

const cuerpoSecciones = secciones.map((s) => `
<section class="seccion${s.destacada ? ' hot' : ''}" id="${s.id}">
  <h2><span class="ic">${icono(ICONOS[s.id] ?? 'Book', '#fff', 22)}</span><span class="tx">${esc(s.titulo)}</span></h2>
  ${s.bloques.map(bloque).join('\n')}
</section>`).join('\n');

const reales = `
<section class="seccion" id="reales">
  <h2><span class="ic">${icono('Flame', '#fff', 22)}</span><span class="tx">12. Las preguntas reales de 2021 a 2025</span></h2>
  <p>Estas son las <b>11 preguntas</b> de este tema que han caído en los cinco últimos exámenes oficiales de Escala Básica. Léelas con la respuesta delante: los enunciados cambian, pero <b>los datos que se piden se repiten</b>.</p>
  <table><colgroup><col style="width:9%"><col style="width:13%"><col style="width:40%"><col style="width:38%"></colgroup>
  <thead><tr><th>Año</th><th>Parte</th><th>Qué se preguntaba</th><th>Respuesta</th></tr></thead>
  <tbody>${realesPorAnio.map((r) => `<tr><td><b>${r.anio}</b></td><td>${esc(r.parte)}</td><td>${en(r.pregunta)}</td><td>${en(r.respuesta)}</td></tr>`).join('')}</tbody></table>
  <div class="caja ojo"><div class="et">${icono('TriangleAlert', '#7a4a00', 13)} Lo que dicen los datos</div><p>De 11 preguntas, <b>7 son de nacionalidad</b>, 2 de vecindad, 1 de la persona y 1 de la norma jurídica. En cambio <b>jerarquía normativa, fuentes, domicilio, capacidad y personas jurídicas no han caído</b> en estos cinco exámenes: apréndelas, pero reparte el tiempo en función de lo que cae.</p></div>
</section>`;

const testHtml = `
<section class="seccion" id="test">
  <h2><span class="ic">${icono('ListChecks', '#fff', 22)}</span><span class="tx">13. Test de autoevaluación</span></h2>
  <p>Dieciséis preguntas con tres opciones, como en el examen. Contesta sin mirar el tema y comprueba en la página de soluciones. Si fallas más de tres, vuelve al apartado que corresponda.</p>
  <ol class="test">${test.map((q) => `<li><div class="q">${en(q.q)}</div><div class="ops">${q.o.map((o, i) => `<div><span class="l">${LETRAS[i]}</span>${en(o)}</div>`).join('')}</div></li>`).join('')}</ol>
</section>
<section class="seccion soluciones" id="soluciones">
  <h2><span class="ic">${icono('CircleCheck', '#fff', 22)}</span><span class="tx">Soluciones del test</span></h2>
  <table><colgroup><col style="width:7%"><col style="width:10%"><col style="width:83%"></colgroup><thead><tr><th>N.º</th><th>Respuesta</th><th>Por qué</th></tr></thead>
  <tbody>${test.map((q, i) => `<tr><td><b>${i + 1}</b></td><td><b>${LETRAS[q.c]}</b></td><td>${en(q.e)}</td></tr>`).join('')}</tbody></table>
  <div class="cierre">
    <div class="cod">${QR}</div>
    <div><h4>Sigue practicando este tema en el Campus</h4><p>Escanea el código y entrena con <b>167 preguntas del Tema 1</b>, corregidas al momento y con explicación de cada respuesta.</p><p class="peq">campus.alphapol.es</p></div>
  </div>
</section>`;

const indice = (paginas) => {
  const lista = [...secciones.map((s) => [s.id, s.titulo]), ['reales', '12. Las preguntas reales de 2021 a 2025'], ['test', '13. Test de autoevaluación'], ['soluciones', 'Soluciones del test']];
  return `<section class="indice"><h2><span class="ic">${icono('List', '#fff', 22)}</span><span class="tx">Índice</span></h2>
  <ol>${lista.map(([id, t]) => `<li><span class="t">${esc(t)}</span><span class="pt"></span><span class="pg">${paginas?.[id] ?? ''}</span></li>`).join('')}</ol>
  <div class="caja clave"><div class="et">Programa oficial</div><p>${esc(meta.programa)}</p></div></section>`;
};

const css = await readFile(join(RAIZ, 'scripts', 'resumenes', 'tema-completo.css'), 'utf8');
const construye = (paginas) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Alphapol · Tema ${meta.numero} · ${esc(meta.titulo)}</title>
<style>${css}</style></head><body>
<div class="portada">
  <div class="top"><img src="../../public/marca/alphapol-logotipo.svg" alt="Alphapol"><span class="esc">${esc(meta.escala)}</span></div>
  <div class="centro">
    <div class="etq">Apuntes completos</div>
    <div class="num"><span>Tema</span><b>${meta.numero}</b></div>
    <h1>${esc(meta.titulo)}</h1>
    <p class="sub">${esc(meta.subtitulo)}</p>
    <div class="trio"><div><b>11</b><span>preguntas reales<br>2021 – 2025</span></div><div><b>16</b><span>preguntas de<br>autoevaluación</span></div><div><b>167</b><span>preguntas para<br>practicar en el Campus</span></div></div>
  </div>
  <div class="pie"><span><b>ALPHAPOL</b> · Centro de formación · Málaga</span><span>${esc(meta.fuente)}</span></div>
</div>
${indice(paginas)}
${cuerpoSecciones}
${reales}
${testHtml}
</body></html>`;

const fichero = join(CARPETA, `tema-${NN}.html`);
const pieHtml = `<div style="width:100%;font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#5b6478;padding:0 16mm;display:flex;justify-content:space-between;border-top:1.5px solid #c5a738;margin:0 0 5mm;padding-top:2mm"><span><b style="color:#14295a">ALPHAPOL</b> · Tema ${meta.numero} · ${esc(meta.titulo)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

async function genera(paginas) {
  await writeFile(fichero, construye(paginas));
  const nav = await chromium.launch();
  const pag = await nav.newPage();
  await pag.goto(pathToFileURL(fichero).href);
  await pag.evaluate(() => document.fonts.ready);
  const pdf = join(CARPETA, `tema-${NN}.pdf`);
  await pag.pdf({ path: pdf, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: pieHtml, preferCSSPageSize: true });
  await nav.close();
  return pdf;
}

/** Página (1-based) en que empieza cada sección, buscando su título en el texto del PDF. */
function paginasDe(pdf) {
  const n = Number(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())[1]);
  const lista = [...secciones.map((s) => [s.id, s.titulo]), ['reales', '12. Las preguntas reales de 2021 a 2025'], ['test', '13. Test de autoevaluación'], ['soluciones', 'Soluciones del test']];
  const out = {};
  for (let p = 3; p <= n; p++) {
    const txt = execFileSync('pdftotext', ['-f', String(p), '-l', String(p), '-layout', pdf, '-']).toString();
    for (const [id, t] of lista) if (!(id in out) && txt.toLowerCase().includes(t.toLowerCase())) out[id] = p;
  }
  return out;
}

let pdf = await genera(null);
const pags = paginasDe(pdf);
pdf = await genera(pags);
console.log('Páginas:', JSON.stringify(pags));
console.log('PDF', execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+\d+/)[0]);

// DOCX con el mismo contenido
const dir = await mkdtemp(join(tmpdir(), 'tema-'));
const json = join(dir, 'tema.json');
await writeFile(json, JSON.stringify({ meta, secciones, realesPorAnio, test }));
execFileSync('python3', ['-I', join(RAIZ, 'scripts', 'resumenes', 'tema_completo_docx.py'), json, join(CARPETA, `tema-${NN}.docx`), join(RAIZ, 'public', 'marca', 'alphapol-logo.jpg')], { stdio: 'inherit' });
console.log('OK', CARPETA);
