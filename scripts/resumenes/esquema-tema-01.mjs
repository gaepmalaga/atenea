/**
 * ESQUEMA VISUAL DEL TEMA 1 (El Derecho) — una página A4 apaisada, con la marca
 * de Alphapol, pensada para regalar a cambio de dejar los datos en la web.
 *
 *   node scripts/resumenes/esquema-tema-01.mjs
 *
 * Genera temario/esquemas/tema-01.html, .pdf y .png. Los iconos son de Lucide
 * (ya en el proyecto) pintados a dos tonos con los colores de la marca
 * (marino y oro); la pirámide y las comparativas son SVG/CSS propios. El texto
 * sale del Código Civil consolidado (temario/md/tema-01.md): cada dato lleva su
 * artículo.
 */
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const L = require('lucide-react');
const { chromium } = require('playwright');

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CARPETA = join(RAIZ, 'temario', 'esquemas');

/** Un icono de Lucide como SVG en línea. */
const icono = (nombre, { size = 30, color = '#14295a', grosor = 1.9 } = {}) =>
  renderToStaticMarkup(React.createElement(L[nombre], { size, color, strokeWidth: grosor }));

/** El icono dentro de su círculo, a dos tonos. */
const medallon = (nombre, tono = 'marino') =>
  `<span class="medallon ${tono}">${icono(nombre, { size: 27, color: tono === 'oro' ? '#0c1a3d' : '#ffffff' })}</span>`;

const css = `
@font-face { font-family: 'Barlow Condensed'; font-weight: 600; src: url('fuentes/barlow-condensed-600-latin.woff2') format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 700; src: url('fuentes/barlow-condensed-700-latin.woff2') format('woff2'); }
@font-face { font-family: 'Barlow Condensed'; font-weight: 800; src: url('fuentes/barlow-condensed-800-latin.woff2') format('woff2'); }
:root {
  --marino: #14295a; --marino-hondo: #0c1a3d; --azul: #2a5db0; --verde: #0f766e; --oro: #c5a738;
  --oro-claro: #e2c977; --oro-oscuro: #8a6d12; --crema: #f7f4ec; --linea: #ddd8c9; --texto: #1a2238; --suave: #5b6478;
}
@page { size: 297mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { width: 1123px; height: 793px; overflow: hidden; }
body { width: 1123px; height: 793px; overflow: hidden; background: var(--crema); color: var(--texto);
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 9.5px; line-height: 1.3; position: relative; }
.t { font-family: 'Barlow Condensed', 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .02em; }

/* Marca de agua */
.agua { position: absolute; left: 50%; top: 56%; width: 560px; transform: translate(-50%, -50%); opacity: .055; z-index: 0; }

.pagina { position: relative; z-index: 1; padding: 16px 26px 0; height: 100%; display: flex; flex-direction: column; gap: 8px; }

/* Cabecera: logo, título y tema en una sola franja marina */
.cab { background: var(--marino); border-radius: 9px; border-bottom: 4px solid var(--oro); color: #fff;
  display: flex; align-items: center; gap: 18px; padding: 0 16px 0 18px; height: 62px; }
.cab img { height: 34px; width: auto; display: block; flex: none; }
.cab .linea { width: 1.5px; align-self: stretch; margin: 11px 0; background: rgba(255,255,255,.22); flex: none; }
.cab h1 { flex: 1; font-size: 25px; font-weight: 800; line-height: 1; }
.cab h1 em { color: var(--oro-claro); font-style: normal; }
.cab h1 small { display: block; font-family: Inter, sans-serif; text-transform: none; letter-spacing: .02em; font-weight: 500; font-size: 9.2px; color: #c9d4ee; margin-top: 4px; }
.cab .esc { text-align: right; line-height: 1.05; flex: none; }
.cab .esc small { display: block; font-size: 8.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--oro-claro); font-weight: 600; }
.cab .esc b { font-size: 16px; font-weight: 800; color: #fff; }
.cab .num { width: 46px; height: 46px; border-radius: 50%; background: var(--oro); color: var(--marino-hondo);
  display: grid; place-items: center; line-height: .85; text-align: center; flex: none; }
.cab .num span { font-size: 7.5px; letter-spacing: .16em; display: block; font-weight: 800; text-transform: uppercase; }
.cab .num b { font-size: 24px; font-weight: 800; display: block; color: var(--marino-hondo); }

/* Columnas */
.cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; flex: 1 1 auto; min-height: 0; }
.col { display: flex; flex-direction: column; border-radius: 9px; overflow: hidden; background: var(--fondo); border: 1px solid var(--borde); }
.col > header { background: var(--c); color: #fff; padding: 6px 14px 5px 12px; display: flex; align-items: center; gap: 9px;
  clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%); margin-right: -1px; }
.col > header .n { font-weight: 800; font-size: 28px; line-height: .8; color: var(--oro-claro); opacity: .95; }
.col > header h2 { font-size: 16px; font-weight: 800; line-height: 1; }
.col > header h2 small { display: block; font-size: 9px; letter-spacing: .12em; font-weight: 600; color: #dbe4f7; margin-bottom: 2px; }
.col.m { --c: var(--marino); --fondo: #e9eefa; --borde: #c9d4ee; }
.col.a { --c: var(--azul); --fondo: #e8f0fb; --borde: #c7d9f1; }
.col.v { --c: var(--verde); --fondo: #e5f3f0; --borde: #bfe0da; }
.col.o { --c: var(--oro); --fondo: #fbf5df; --borde: #ecdfa8; }
.col.o > header { color: var(--marino-hondo); }
.col.o > header .n { color: var(--marino); }
.col.o > header h2 small { color: #5c4a0d; }
.bloque { padding: 7px 11px 5px; border-top: 1px dashed rgba(20,41,90,.22); flex: 1 1 auto; min-height: 0; }
.bloque:first-of-type { border-top: 0; }
.bt { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.bt h3 { font-size: 13.5px; font-weight: 800; color: var(--marino); line-height: 1.02; }
.bt h3 small { display: block; font-family: Inter, sans-serif; font-weight: 600; font-size: 8px; letter-spacing: .06em; color: var(--suave); text-transform: none; margin-top: 1px; }
.medallon { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 0 0 3px rgba(255,255,255,.7); }
.medallon.marino { background: var(--marino); }
.medallon.oro { background: var(--oro); }
.medallon.azul { background: var(--azul); }
.medallon.verde { background: var(--verde); }
.medallon svg { display: block; }
ul { list-style: none; }
li { position: relative; padding-left: 9px; margin-bottom: 2.4px; }
li::before { content: ''; position: absolute; left: 0; top: .5em; width: 4px; height: 4px; border-radius: 50%; background: var(--oro); }
b, strong { font-weight: 700; color: var(--marino); }
.art { color: var(--oro-oscuro); font-weight: 700; white-space: nowrap; }
mark { background: #fbe58a; color: var(--marino-hondo); padding: 0 2px; border-radius: 2px; font-weight: 700; }

/* Piezas visuales */
.ecu { display: flex; align-items: stretch; gap: 5px; margin: 2px 0 3px; }
.ecu .caja { flex: 1; border-radius: 6px; padding: 3px 5px; background: #fff; border: 1.2px solid var(--marino); text-align: center; line-height: 1.25; }
.ecu .caja.o { border-color: var(--oro); background: #fff9e0; }
.ecu .caja small { display: block; font-size: 7.3px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--suave); }
.ecu .flecha { align-self: center; font-weight: 800; color: var(--oro-oscuro); font-size: 15px; }
.eje { font-size: 8.6px; background: #fff; border-radius: 5px; padding: 3px 6px; border-left: 3px solid var(--oro); color: var(--suave); margin-top: 3px; }
.eje b { color: var(--marino); }

.flujo { display: flex; gap: 3px; align-items: stretch; margin: 7px 0 3px; }
.flujo .paso { flex: 1; background: #fff; border: 1.2px solid var(--azul); border-radius: 6px; padding: 3px 5px 4px; text-align: center; line-height: 1.22; position: relative; }
.flujo .paso .k { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: var(--azul); color: #fff; border-radius: 9px; font-size: 8.5px; font-weight: 800; padding: 0 6px; }
.flujo .paso b { display: block; font-size: 10.4px; margin-top: 3px; }
.flujo .paso span { font-size: 8px; color: var(--suave); display: block; }
.flujo .sig { align-self: center; color: var(--azul); font-weight: 800; font-size: 13px; }

.piramide { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 2px 0 3px; }
.piramide .n { color: #fff; font-weight: 700; font-size: 9px; text-align: center; line-height: 1.1; padding: 2px 0; border-radius: 4px; }
.piramide .n small { display: block; font-weight: 500; font-size: 7.8px; opacity: .92; }
.pi1 { width: 36%; background: var(--marino-hondo); clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%); }
.pi2 { width: 54%; background: var(--marino); }
.pi3 { width: 72%; background: var(--azul); }
.pi4 { width: 90%; background: #5e86c8; }
.piramide .n.pi1 { border-radius: 0; }

.dos { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 1px 0 3px; }
.dos .c { background: #fff; border-radius: 6px; border: 1.2px solid var(--verde); padding: 3px 5px; line-height: 1.25; }
.dos .c.o { border-color: var(--oro); }
.dos .c h4 { font-size: 12.5px; font-weight: 800; color: var(--verde); line-height: 1; margin-bottom: 2px; }
.dos .c.o h4 { color: var(--oro-oscuro); }
.dos .c p { font-size: 9.2px; }

.chips { display: flex; flex-wrap: wrap; gap: 3px; margin: 1px 0 3px; }
.chip { background: #fff; border: 1.2px solid var(--oro); border-radius: 10px; padding: 0 7px; font-weight: 700; color: var(--marino); font-size: 9px; }
.chip.g { background: var(--marino); border-color: var(--marino); color: var(--oro-claro); }
.pasos3 { display: flex; gap: 3px; margin-top: 3px; }
.pasos3 > div { flex: 1; background: var(--marino); color: #fff; border-radius: 5px; padding: 3px 4px; text-align: left; font-size: 8.4px; line-height: 1.18; }
.pasos3 > div b { display: inline; color: var(--oro-claro); font-size: 10px; font-weight: 800; margin-right: 2px; }

/* Banda inferior */
.banda { display: grid; grid-template-columns: 1fr 1.12fr 1.25fr; gap: 8px; height: 152px; flex: none; }
.card { background: #fff; border-radius: 9px; border: 1px solid var(--linea); padding: 6px 11px 4px; overflow: hidden; }
.card .bt { margin-bottom: 4px; }
.card.fond { background: var(--marino); border-color: var(--marino); color: #e8eefc; }
.card.fond .bt h3 { color: #fff; }
.card.fond .bt h3 small { color: var(--oro-claro); }
.numeros { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 8px; margin-top: 1px; }
.numeros .nm { border-top: 2px solid var(--oro); padding-top: 3px; line-height: 1.15; }
.numeros .nm b { display: block; font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 800; color: var(--oro-claro); line-height: .95; letter-spacing: .01em; }
.numeros .nm b i { font-style: normal; font-size: 12px; font-weight: 700; color: #fff; letter-spacing: .04em; margin-left: 2px; text-transform: uppercase; }
.numeros .nm span { font-size: 7.8px; color: #cfd9f2; display: block; line-height: 1.12; }

/* Pie */
.pie { display: flex; justify-content: space-between; align-items: flex-start; border-top: 1.6px solid var(--oro); padding: 4px 2px 0; margin-top: auto; height: 30px; flex: none; }
.pie .l { font-size: 8px; color: var(--suave); line-height: 1.35; }
.pie .l b { color: var(--marino); }
.pie .r { font-size: 8.4px; text-align: right; color: var(--marino); line-height: 1.35; font-weight: 600; letter-spacing: .02em; }
.pie .r b { color: var(--oro-oscuro); }
`;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Alphapol · Tema 1 · El Derecho · Esquema</title>
<style>${css}</style></head>
<body>
<img class="agua" src="../../public/marca/alphapol-isotipo.svg" alt="">
<div class="pagina">

  <div class="cab">
    <img src="../../public/marca/alphapol-logotipo.svg" alt="Alphapol">
    <div class="linea"></div>
    <h1 class="t">El Derecho: <em>las normas, la persona y la nacionalidad</em><small>Código Civil · Título Preliminar y Libro I — esquema de repaso para el examen</small></h1>
    <div class="esc"><small>Escala</small><b class="t">Básica · Ciencias Jurídicas</b></div>
    <div class="num"><div><span>Tema</span><b class="t">1</b></div></div>
  </div>

  <div class="cols">

    <!-- 1 · EL DERECHO Y LA NORMA -->
    <section class="col m">
      <header><span class="n t">1</span><h2 class="t"><small>Para empezar</small>El Derecho y la norma</h2></header>
      <div class="bloque">
        <div class="bt">${medallon('Scale')}<h3 class="t">Concepto y acepciones<small>Qué significa «Derecho»</small></h3></div>
        <div class="dos">
          <div class="c"><h4 class="t">Objetivo</h4><p>El <b>conjunto de normas</b> que ordenan la convivencia.</p></div>
          <div class="c o"><h4 class="t">Subjetivo</h4><p>La <b>facultad o poder</b> que la norma reconoce a una persona.</p></div>
        </div>
        <p>Además: Derecho como <b>ciencia</b> (su estudio) y como <b>justicia</b> (su ideal).</p>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Layers', 'oro')}<h3 class="t">Estructura de la norma<small>Toda norma tiene dos partes</small></h3></div>
        <div class="ecu">
          <div class="caja"><small>Supuesto de hecho</small><b>Lo que ocurre</b></div>
          <div class="flecha">→</div>
          <div class="caja o"><small>Consecuencia jurídica</small><b>El efecto que produce</b></div>
        </div>
        <div class="eje"><b>Ejemplo:</b> nacer con vida <span class="art">(art. 30)</span> → se adquiere la personalidad.</div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Gavel')}<h3 class="t">Caracteres y clases<small>Cómo es y cómo obliga</small></h3></div>
        <ul>
          <li><b>Caracteres:</b> general, abstracta, obligatoria, coercible y heterónoma.</li>
          <li><b>Imperativas</b> ordenan y <b>prohibitivas</b> prohíben: lo contrario es <mark>nulo de pleno derecho</mark> <span class="art">(6.3)</span>.</li>
          <li><b>Dispositivas:</b> valen si las partes no pactan otra cosa.</li>
        </ul>
      </div>
    </section>

    <!-- 2 · FUENTES, JERARQUÍA Y EFICACIA -->
    <section class="col a">
      <header><span class="n t">2</span><h2 class="t"><small>Art. 1 y siguientes del Código Civil</small>Fuentes y jerarquía</h2></header>
      <div class="bloque">
        <div class="bt">${medallon('BookOpen', 'azul')}<h3 class="t">Fuentes del ordenamiento<small>El orden importa <span class="art">(art. 1)</span></small></h3></div>
        <div class="flujo">
          <div class="paso"><i class="k">1.º</i><b>Ley</b><span>siempre prima</span></div><div class="sig">›</div>
          <div class="paso"><i class="k">2.º</i><b>Costumbre</b><span>a falta de ley</span></div><div class="sig">›</div>
          <div class="paso"><i class="k">3.º</i><b>Principios generales</b><span>a falta de ambas</span></div>
        </div>
        <ul>
          <li>Costumbre: ni contraria a la <b>moral u orden público</b> ni sin <b>probar</b>.</li>
          <li>La <b>jurisprudencia</b> del Supremo complementa <span class="art">(1.6)</span>.</li>
        </ul>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Landmark')}<h3 class="t">Jerarquía normativa<small>Manda el rango superior <span class="art">(1.2)</span></small></h3></div>
        <div class="piramide">
          <div class="n pi1">Constitución</div>
          <div class="n pi2">Tratados internacionales<small>aplicables tras su publicación íntegra en el BOE (1.5)</small></div>
          <div class="n pi3">Leyes<small>orgánicas y ordinarias · decretos-leyes y legislativos</small></div>
          <div class="n pi4">Reglamentos<small>reales decretos, órdenes…</small></div>
        </div>
        <p style="font-size:8.8px">Es <mark>nula</mark> toda disposición que contradiga otra de rango superior.</p>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Newspaper', 'oro')}<h3 class="t">Eficacia de las leyes<small>Arts. 2 y 6</small></h3></div>
        <ul>
          <li><b>Vigor a los 20 días</b> de su completa publicación en el BOE.</li>
          <li>Se <b>derogan solo por otra posterior</b>; sin retroactividad salvo que lo digan.</li>
          <li><mark>La ignorancia de las leyes no excusa de su cumplimiento.</mark></li>
        </ul>
      </div>
    </section>

    <!-- 3 · LA PERSONA -->
    <section class="col v">
      <header><span class="n t">3</span><h2 class="t"><small>Libro I · Títulos II y arts. 35-39</small>La persona</h2></header>
      <div class="bloque">
        <div class="bt">${medallon('Baby', 'verde')}<h3 class="t">Nacimiento y extinción<small>Personas físicas <span class="art">(arts. 29-33)</span></small></h3></div>
        <ul>
          <li><b>Nace</b> con vida y con <b>entero desprendimiento del seno materno</b> <span class="art">(30)</span>.</li>
          <li>El <b>concebido</b> se tiene por nacido si le <b>favorece</b> <span class="art">(29)</span>.</li>
          <li>Se <b>extingue por la muerte</b> <span class="art">(32)</span>; en la duda de quién murió antes, <b>a la vez</b> <span class="art">(33)</span>.</li>
        </ul>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('FileSignature', 'oro')}<h3 class="t">Capacidad<small>No es lo mismo tenerla que ejercerla</small></h3></div>
        <div class="dos">
          <div class="c"><h4 class="t">Jurídica</h4><p>Aptitud para ser <b>titular</b> de derechos y obligaciones. Se tiene <b>desde el nacimiento</b>.</p></div>
          <div class="c o"><h4 class="t">De obrar</h4><p>Aptitud para <b>ejercerlos uno mismo</b>. Plena con la <b>mayoría de edad: 18 años</b> <span class="art">(315)</span>.</p></div>
        </div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Building2', 'verde')}<h3 class="t">Personas jurídicas<small>Arts. 35-39</small></h3></div>
        <ul>
          <li><b>1.º Corporaciones, asociaciones y fundaciones de interés público</b> reconocidas por la ley (nacen al constituirse válidamente).</li>
          <li><b>2.º Asociaciones de interés particular</b> (civiles, mercantiles, industriales) con personalidad propia.</li>
          <li>Adquieren bienes, contraen obligaciones y ejercitan acciones <span class="art">(38)</span>.</li>
        </ul>
      </div>
    </section>

    <!-- 4 · LA NACIONALIDAD -->
    <section class="col o">
      <header><span class="n t">4</span><h2 class="t"><small>Libro I · Título I · Arts. 17-28</small>La nacionalidad española</h2></header>
      <div class="bloque">
        <div class="bt">${medallon('Flag', 'marino')}<h3 class="t">Españoles de origen<small>Art. 17</small></h3></div>
        <ul>
          <li>Hijos de <b>padre o madre españoles</b>.</li>
          <li>Nacidos en España de extranjeros si <b>uno nació también aquí</b> (salvo hijos de diplomáticos).</li>
          <li>Nacidos en España de padres <b>sin nacionalidad</b> o con <b>filiación no determinada</b>.</li>
        </ul>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Stamp', 'oro')}<h3 class="t">Cómo se adquiere<small>Opción · carta de naturaleza · residencia</small></h3></div>
        <ul>
          <li><b>Carta de naturaleza:</b> Real Decreto, discrecional <span class="art">(21.1)</span>.</li>
          <li><b>Residencia</b> legal, continuada e inmediata <span class="art">(22)</span>:</li>
        </ul>
        <div class="chips">
          <span class="chip g">10 años</span><span class="chip">5 · refugiados</span><span class="chip">2 · iberoamericanos y otros</span><span class="chip">1 · casos del 22.2</span>
        </div>
        <div class="pasos3">
          <div><b>1</b>Jurar fidelidad al Rey y obediencia a la CE</div>
          <div><b>2</b>Renunciar a la nacionalidad anterior</div>
          <div><b>3</b>Inscribir en el Registro Civil</div>
        </div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Hourglass', 'marino')}<h3 class="t">Pérdida y recuperación<small>Arts. 24-26</small></h3></div>
        <ul>
          <li>Emancipados residentes fuera que <b>adquieren otra voluntariamente</b>: la pierden a los <b>3 años</b> salvo que declaren conservarla.</li>
          <li>Los <b>no originarios</b>: si usan 3 años solo la anterior o sirven en armas extranjeras contra la prohibición del Gobierno.</li>
          <li><b>Recuperar:</b> residir legalmente, declararlo e <b>inscribirlo</b> <span class="art">(26)</span>. <mark>En guerra no se pierde.</mark></li>
        </ul>
      </div>
    </section>
  </div>

  <div class="banda">
    <div class="card">
      <div class="bt">${medallon('House', 'verde')}<h3 class="t">Domicilio<small>Arts. 40 y 41</small></h3></div>
      <ul>
        <li><b>Persona natural:</b> su <mark>residencia habitual</mark>.</li>
        <li><b>Diplomáticos</b> extraterritoriales: el último que tuvieron en España.</li>
        <li><b>Persona jurídica:</b> el de su ley o estatutos; si no, donde esté su <b>representación legal</b> o sus <b>principales funciones</b>.</li>
      </ul>
    </div>
    <div class="card">
      <div class="bt">${medallon('Map', 'azul')}<h3 class="t">Vecindad civil<small>Arts. 14-15 · derecho civil común o foral</small></h3></div>
      <ul>
        <li><b>Hijos:</b> la de los padres; si difiere, la del primero con filiación determinada, luego el lugar de nacimiento y, al final, el derecho común. Los padres eligen en <b>6 meses</b>; el hijo, desde los <b>14 años</b>.</li>
        <li><b>Se adquiere</b> por <b>2 años</b> de residencia (si se declara) o <b>10 años</b> (sin declaración en contrario).</li>
        <li>El <b>matrimonio no la altera</b>; en duda, el <b>lugar de nacimiento</b>.</li>
      </ul>
    </div>
    <div class="card fond">
      <div class="bt">${medallon('BadgeCheck', 'oro')}<h3 class="t">Números que se preguntan<small>Apréndelos antes del examen</small></h3></div>
      <div class="numeros">
        <div class="nm"><b>20<i>días</i></b><span>entrada en vigor de una ley</span></div>
        <div class="nm"><b>14<i>años</i></b><span>jurar y optar con asistencia</span></div>
        <div class="nm"><b>18<i>años</i></b><span>mayoría de edad</span></div>
        <div class="nm"><b>180<i>días</i></b><span>caduca la concesión si no comparece (21.4)</span></div>
        <div class="nm"><b>10·5·2<i>·1</i></b><span>años de residencia para ser español</span></div>
        <div class="nm"><b>3<i>años</i></b><span>para perder la nacionalidad</span></div>
        <div class="nm"><b>2·10<i>años</i></b><span>vecindad civil por residencia</span></div>
        <div class="nm"><b>6<i>meses</i></b><span>padres atribuyen la vecindad</span></div>
      </div>
    </div>
  </div>

  <div class="pie">
    <div class="l"><b>ALPHAPOL</b> · Centro de formación · Málaga &nbsp;|&nbsp; alphapol.es<br>Fuente: Código Civil (BOE-A-1889-4763), texto consolidado. Los artículos entre paréntesis son del Código Civil.</div>
    <div class="r"><b>T1 |</b> EL DERECHO<br>Contenido para uso personal de estudio</div>
  </div>
</div>
</body></html>`;

const fichero = join(CARPETA, 'tema-01.html');
await writeFile(fichero, html);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
await pagina.goto(pathToFileURL(fichero).href);
await pagina.evaluate(() => document.fonts.ready);
// Comprobación: nada se sale de su caja.
const desbordes = await pagina.evaluate(() => {
  const malos = [];
  document.querySelectorAll('.bloque, .card, .col').forEach((e) => {
    if (e.scrollHeight > e.clientHeight + 1) malos.push(`${e.className} ${e.querySelector('h3,h2')?.textContent?.slice(0, 28)} (+${e.scrollHeight - e.clientHeight}px)`);
  });
  if (document.body.scrollHeight > 794) malos.push(`página +${document.body.scrollHeight - 794}px`);
  return malos;
});
console.log(desbordes.length ? 'DESBORDES:\n  ' + desbordes.join('\n  ') : 'Sin desbordes');
await pagina.screenshot({ path: join(CARPETA, 'tema-01.png') });
await pagina.pdf({ path: join(CARPETA, 'tema-01.pdf'), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
await navegador.close();
console.log('OK', join(CARPETA, 'tema-01.pdf'));
