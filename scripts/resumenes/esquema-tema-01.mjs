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
body { background: var(--crema); color: var(--texto);
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 9.5px; line-height: 1.3; }
.hoja { width: 1123px; height: 793px; overflow: hidden; position: relative; break-after: page; background: var(--crema); }
.hoja:last-child { break-after: auto; }
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

/* Radar del examen */
.radar { background: #fff; border: 1px solid var(--linea); border-radius: 9px; height: 54px; display: flex; align-items: center; gap: 14px; padding: 0 14px; flex: none; }
.radar .gran { flex: none; text-align: center; line-height: 1; padding-right: 14px; border-right: 1.5px solid var(--linea); }
.radar .gran b { font-family: 'Barlow Condensed', sans-serif; font-size: 36px; font-weight: 800; color: var(--marino); display: block; line-height: .85; }
.radar .gran span { font-size: 8px; letter-spacing: .1em; text-transform: uppercase; color: var(--suave); font-weight: 700; }
.radar .gran span em { display: block; font-style: normal; color: var(--oro-oscuro); }
.radar .barra { flex: 1; min-width: 0; }
.radar .tit { font-size: 9px; color: var(--suave); margin-bottom: 3px; }
.radar .tit b { color: var(--marino); }
.radar .seg { display: flex; height: 19px; border-radius: 6px; overflow: hidden; gap: 2px; }
.radar .seg div { color: #fff; font-weight: 800; font-size: 10px; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; overflow: hidden; }
.radar .seg .s1 { background: #d9531e; flex: 7; }
.radar .seg .s2 { background: var(--azul); flex: 2; }
.radar .seg .s3 { background: var(--verde); flex: 1; }
.radar .seg .s4 { background: var(--marino); flex: 1; }
.radar .frio { flex: none; width: 250px; font-size: 8.2px; line-height: 1.3; color: var(--suave); border-left: 1.5px solid var(--linea); padding-left: 14px; }
.radar .frio b { color: var(--marino); }

/* Zonas */
.zonas { display: grid; grid-template-columns: 1.38fr 1.06fr .96fr; gap: 8px; flex: 1 1 auto; min-height: 0; }
.col { display: flex; flex-direction: column; border-radius: 9px; overflow: hidden; background: var(--fondo); border: 1px solid var(--borde); }
.col > header { background: var(--c); color: #fff; padding: 6px 14px 5px 12px; display: flex; align-items: center; gap: 9px;
  clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 50%, calc(100% - 13px) 100%, 0 100%); margin-right: -1px; }
.col > header .n { font-weight: 800; font-size: 28px; line-height: .8; color: var(--oro-claro); opacity: .95; }
.col > header h2 { font-size: 16px; font-weight: 800; line-height: 1; flex: 1; }
.col > header h2 small { display: block; font-size: 8.6px; letter-spacing: .12em; font-weight: 600; color: #dbe4f7; margin-bottom: 2px; }
.col > header .calor { flex: none; display: flex; align-items: center; gap: 4px; background: rgba(255,255,255,.18); border-radius: 12px; padding: 2px 8px 2px 6px; margin-right: 8px;
  font-family: Inter, sans-serif; font-weight: 800; font-size: 9.6px; text-transform: none; letter-spacing: 0; }
.col > header .calor svg { display: block; }
.col.n1 { --c: #b9430f; --fondo: #fdf0e8; --borde: #f1cdb7; }
.col.n2 { --c: var(--azul); --fondo: #e8f0fb; --borde: #c7d9f1; }
.col.n3 { --c: var(--marino); --fondo: #e9eefa; --borde: #c9d4ee; }
.bloque { padding: 7px 11px 5px; border-top: 1px dashed rgba(20,41,90,.22); flex: 1 1 auto; min-height: 0; }
.bloque:first-of-type { border-top: 0; }
.bt { display: flex; align-items: center; gap: 7px; margin-bottom: 3px; }
.bt h3 { font-size: 13.5px; font-weight: 800; color: var(--marino); line-height: 1.02; }
.bt h3 small { display: block; font-family: Inter, sans-serif; font-weight: 600; font-size: 8px; letter-spacing: .06em; color: var(--suave); text-transform: none; margin-top: 1px; }
.medallon { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 0 0 3px rgba(255,255,255,.7); }
.medallon.marino { background: var(--marino); }
.medallon.oro { background: var(--oro); }
.medallon.azul { background: var(--azul); }
.medallon.verde { background: var(--verde); }
.medallon.fuego { background: #d9531e; }
.medallon svg { display: block; }
ul { list-style: none; }
li { position: relative; padding-left: 9px; margin-bottom: 2.2px; }
li::before { content: ''; position: absolute; left: 0; top: .5em; width: 4px; height: 4px; border-radius: 50%; background: var(--oro); }
b, strong { font-weight: 700; color: var(--marino); }
.art { color: var(--oro-oscuro); font-weight: 700; white-space: nowrap; }
mark { background: #fbe58a; color: var(--marino-hondo); padding: 0 2px; border-radius: 2px; font-weight: 700; }

/* «Cayó en el examen»: la pregunta real, con su año */
.real { display: flex; gap: 6px; align-items: flex-start; background: #fff; border: 1px solid #f0c9b2; border-left: 3px solid #d9531e; border-radius: 5px; padding: 2px 6px 2px 5px; margin: 2px 0 3px; line-height: 1.24; font-size: 8.7px; color: var(--texto); }
.real i { flex: none; font-style: normal; font-weight: 800; font-size: 8px; background: #d9531e; color: #fff; border-radius: 3px; padding: 0 4px; margin-top: 1px; letter-spacing: .04em; }
.real.fr { border-color: #c7d9f1; border-left-color: var(--azul); }
.real.fr i { background: var(--azul); }
.real.mr { border-color: #c9d4ee; border-left-color: var(--marino); }
.real.mr i { background: var(--marino); }
.real b { color: var(--marino); }

/* Piezas visuales */
.ecu { display: flex; align-items: stretch; gap: 5px; margin: 2px 0 3px; }
.ecu .caja { flex: 1; border-radius: 6px; padding: 3px 5px; background: #fff; border: 1.2px solid var(--marino); text-align: center; line-height: 1.22; }
.ecu .caja.o { border-color: var(--oro); background: #fff9e0; }
.ecu .caja small { display: block; font-size: 7.3px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--suave); }
.ecu .flecha { align-self: center; font-weight: 800; color: var(--oro-oscuro); font-size: 15px; }
.flujo { display: flex; gap: 3px; align-items: stretch; margin: 7px 0 3px; }
.flujo .paso { flex: 1; background: #fff; border: 1.2px solid var(--azul); border-radius: 6px; padding: 2px 4px 3px; text-align: center; line-height: 1.2; position: relative; }
.flujo .paso .k { position: absolute; top: -7px; left: 50%; transform: translateX(-50%); background: var(--azul); color: #fff; border-radius: 9px; font-size: 8px; font-weight: 800; padding: 0 6px; font-style: normal; }
.flujo .paso b { display: block; font-size: 9.6px; margin-top: 3px; }
.flujo .paso span { font-size: 7.8px; color: var(--suave); display: block; }
.flujo .sig { align-self: center; color: var(--azul); font-weight: 800; font-size: 13px; }
.piramide { display: flex; flex-direction: column; align-items: center; gap: 2px; margin: 2px 0 3px; }
.piramide .n { color: #fff; font-weight: 700; font-size: 8.8px; text-align: center; line-height: 1.1; padding: 1px 0; border-radius: 4px; }
.piramide .n small { display: block; font-weight: 500; font-size: 7.4px; opacity: .92; }
.pi1 { width: 34%; background: var(--marino-hondo); clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%); border-radius: 0 !important; }
.pi2 { width: 54%; background: var(--marino); }
.pi3 { width: 74%; background: var(--azul); }
.pi4 { width: 94%; background: #5e86c8; }
.dos { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 1px 0 3px; }
.dos .c { background: #fff; border-radius: 6px; border: 1.2px solid var(--azul); padding: 3px 5px; line-height: 1.24; }
.dos .c.o { border-color: var(--oro); }
.dos .c h4 { font-size: 12px; font-weight: 800; color: var(--azul); line-height: 1; margin-bottom: 2px; }
.dos .c.o h4 { color: var(--oro-oscuro); }
.dos .c p { font-size: 8.8px; }
.chips { display: flex; flex-wrap: wrap; gap: 3px; margin: 1px 0 3px; }
.chip { background: #fff; border: 1.2px solid var(--oro); border-radius: 10px; padding: 0 7px; font-weight: 700; color: var(--marino); font-size: 8.8px; }
.chip.g { background: var(--marino); border-color: var(--marino); color: var(--oro-claro); }
.pasos3 { display: flex; gap: 3px; margin: 3px 0; }
.pasos3 > div { flex: 1; background: var(--marino); color: #fff; border-radius: 5px; padding: 3px 5px; font-size: 8.4px; line-height: 1.18; }
.pasos3 > div b { display: inline; color: var(--oro-claro); font-size: 10px; font-weight: 800; margin-right: 2px; }

/* Banda inferior */
.banda { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; height: 108px; flex: none; }
.card { background: #fff; border-radius: 9px; border: 1px solid var(--linea); padding: 5px 11px 3px; overflow: hidden; }
.card.fond { background: var(--marino); border-color: var(--marino); color: #e8eefc; }
.card.fond .bt h3 { color: #fff; }
.card.fond .bt h3 small { color: var(--oro-claro); }
.numeros { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 10px; margin-top: 0; }
.numeros .nm { border-top: 2px solid var(--oro); padding-top: 2px; line-height: 1.12; }
.numeros .nm b { display: block; font-family: 'Barlow Condensed', sans-serif; font-size: 17px; font-weight: 800; color: var(--oro-claro); line-height: .95; letter-spacing: .01em; }
.numeros .nm b i { font-style: normal; font-size: 11px; font-weight: 700; color: #fff; letter-spacing: .04em; margin-left: 2px; text-transform: uppercase; }
.numeros .nm span { font-size: 7.3px; color: #cfd9f2; display: block; line-height: 1.1; }
.card .medallon { width: 28px; height: 28px; }
.card .medallon svg { width: 22px; height: 22px; }
.card .bt { margin-bottom: 2px; }
.trucos li { margin-bottom: 2px; font-size: 9.1px; }
.trucos li b { background: var(--marino); color: var(--oro-claro); border-radius: 3px; padding: 0 4px; font-size: 9px; }
.qr { display: flex; gap: 10px; align-items: center; background: linear-gradient(135deg, var(--marino) 0%, var(--marino-hondo) 100%); color: #fff; border: 0; border-bottom: 4px solid var(--oro); }
.qr .cod { flex: none; width: 78px; height: 78px; background: #fff; border-radius: 7px; padding: 5px; display: grid; place-items: center; }
.qr .cod img { width: 100%; height: 100%; display: block; }
.qr h3 { font-size: 15px; font-weight: 800; line-height: 1.02; color: #fff; }
.qr h3 em { color: var(--oro-claro); font-style: normal; }
.qr p { font-size: 8.8px; color: #cfd9f2; margin-top: 3px; line-height: 1.28; }
.qr p b { color: var(--oro-claro); }


/* Página 2: la nacionalidad paso a paso */
.flujo2 { display: flex; gap: 10px; height: 196px; flex: none; }
.flujo2 .pregunta { flex: none; width: 92px; background: var(--marino); color: #fff; border-radius: 9px; border-bottom: 4px solid var(--oro); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 8px; clip-path: polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%); padding-right: 16px; }
.flujo2 .pregunta b { font-size: 21px; font-weight: 800; line-height: 1.02; color: var(--oro-claro); }
.flujo2 .pregunta span { font-size: 8.5px; color: #c9d4ee; margin-top: 4px; letter-spacing: .1em; text-transform: uppercase; font-weight: 600; }
.flujo2 .rama { flex: 1; display: grid; grid-template-columns: 1.15fr 1.2fr .95fr; gap: 8px; }
.nodo { border-radius: 9px; overflow: hidden; background: #fff; border: 1px solid var(--linea); padding-bottom: 5px; }
.nodo .cab2 { display: flex; align-items: center; gap: 6px; padding: 5px 9px 4px; color: #fff; }
.nodo .cab2 h4 { font-size: 13.5px; font-weight: 800; line-height: 1; flex: 1; }
.nodo .cab2 em { font-style: normal; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; opacity: .9; }
.n-o .cab2 { background: #b9430f; } .n-b .cab2 { background: var(--azul); } .n-c .cab2 { background: var(--verde); }
.nodo ul { padding: 6px 10px 0; font-size: 10.6px; line-height: 1.34; }
.nodo li { margin-bottom: 4px; }
.nodo .mini { margin: 4px 10px 0; font-size: 9.4px; background: #eef3fb; border-radius: 5px; padding: 3px 6px; line-height: 1.25; }
.doble { display: grid; grid-template-columns: 1.55fr 1fr; gap: 8px; flex: 1 1 auto; min-height: 0; }
.esc2, .perd { background: #fff; border: 1px solid var(--linea); border-radius: 9px; padding: 7px 11px 6px; overflow: hidden; }
.et2 { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; border-bottom: 2px solid var(--oro); padding-bottom: 2px; }
.et2 span { font-size: 16px; font-weight: 800; color: var(--marino); }
.et2 em { font-style: normal; font-size: 8.6px; color: var(--suave); }
.escalera { display: grid; grid-template-columns: 1fr 1fr 1.5fr 2fr; gap: 6px; align-items: end; height: 205px; }
.peld { border-radius: 7px 7px 0 0; color: #fff; padding: 5px 7px; display: flex; flex-direction: column; justify-content: flex-start; line-height: 1.2; }
.peld b { font-size: 34px; font-weight: 800; line-height: .9; color: var(--oro-claro); }
.peld span { font-size: 9px; text-transform: uppercase; letter-spacing: .1em; font-weight: 700; margin-bottom: 3px; }
.peld p { font-size: 9.4px; margin: 0; } .peld p b { font-size: inherit; color: #fff; font-weight: 800; line-height: inherit; }
.peld mark { background: #fbe58a; color: var(--marino-hondo); font-size: 9.4px; }
.p10 { background: var(--marino-hondo); height: 100%; } .p5 { background: var(--marino); height: 80%; } .p2 { background: var(--azul); height: 100%; } .p1 { background: #5e86c8; height: 100%; }
.p2 { height: 70%; } .p1 { height: 58%; }
.req { margin-top: 12px; } .req .ti { font-size: 12px; font-weight: 800; color: var(--oro-oscuro); margin-bottom: 3px; }
.pasos4 { display: grid; grid-template-columns: 1.4fr 1.4fr 1fr 1fr; gap: 5px; }
.pasos4 > div { background: var(--marino); color: #fff; border-radius: 6px; padding: 5px 7px; font-size: 9.4px; line-height: 1.24; }
.pasos4 > div b { color: var(--oro-claro); } .pasos4 > div b:first-child { font-size: 15px; font-weight: 800; margin-right: 3px; }
.pasos4 .rojo { background: #b9430f; } .pasos4 .rojo b { color: #fff; }
.linea-t { position: relative; padding-left: 4px; }
.linea-t::before { content: ''; position: absolute; left: 14px; top: 8px; bottom: 8px; width: 2px; background: var(--oro); }
.hito { display: flex; gap: 8px; margin-bottom: 17px; position: relative; }
.hito i { flex: none; width: 21px; height: 21px; border-radius: 50%; background: var(--marino); display: grid; place-items: center; box-shadow: 0 0 0 3px #fff; z-index: 1; }
.hito.ok i { background: var(--verde); }
.hito p { font-size: 10.2px; line-height: 1.32; margin: 0; }
.test2 { background: linear-gradient(135deg, var(--marino), var(--marino-hondo)); border-radius: 9px; border-bottom: 4px solid var(--oro); color: #fff; padding: 7px 14px; display: flex; gap: 14px; align-items: center; flex: none; height: 92px; }
.test2 .tt { flex: none; width: 90px; line-height: 1.1; } .test2 .tt b { font-size: 20px; font-weight: 800; color: var(--oro-claro); display: block; }
.test2 .tt span { font-size: 8.5px; color: #c9d4ee; display: block; margin-top: 3px; }
.test2 ol { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; list-style: decimal; padding-left: 14px; font-size: 9.6px; line-height: 1.28; color: #e8eefc; }
.test2 ol b { color: var(--oro-claro); }
.test2 li { padding-left: 0; margin: 0; } .test2 li::before { display: none; }
.test2 .sol { flex: none; width: 160px; font-size: 9px; color: var(--oro-claro); border-left: 1.5px solid rgba(255,255,255,.25); padding-left: 12px; font-weight: 600; line-height: 1.35; }

/* Pie */
.pie { display: flex; justify-content: space-between; align-items: flex-start; border-top: 1.6px solid var(--oro); padding: 4px 2px 0; margin-top: auto; height: 30px; flex: none; }
.pie .l { font-size: 8px; color: var(--suave); line-height: 1.35; }
.pie .l b { color: var(--marino); }
.pie .r { font-size: 8.4px; text-align: right; color: var(--marino); line-height: 1.35; font-weight: 600; letter-spacing: .02em; }
.pie .r b { color: var(--oro-oscuro); }
`;

const preguntas = 167;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Alphapol · Tema 1 · El Derecho · Esquema con radar de examen</title>
<style>${css}</style></head>
<body>
<div class="hoja" id="h1">
<img class="agua" src="../../public/marca/alphapol-isotipo.svg" alt="">
<div class="pagina">

  <div class="cab">
    <img src="../../public/marca/alphapol-logotipo.svg" alt="Alphapol">
    <div class="linea"></div>
    <h1 class="t">El Derecho: <em>lo que de verdad cae</em><small>Esquema con radar de examen · Código Civil, Título Preliminar y Libro I</small></h1>
    <div class="esc"><small>Escala</small><b class="t">Básica · Ciencias Jurídicas</b></div>
    <div class="num"><div><span>Tema</span><b class="t">1</b></div></div>
  </div>

  <div class="radar">
    <div class="gran"><b>11</b><span>preguntas<em>2021 – 2025</em></span></div>
    <div class="barra">
      <div class="tit">Así se reparte el <b>Tema 1</b> en los 5 últimos exámenes oficiales de Escala Básica: <b>donde cae, estudia más</b>.</div>
      <div class="seg">
        <div class="s1">${icono('Flame', { size: 12, color: '#fff', grosor: 2.4 })} NACIONALIDAD · 7</div>
        <div class="s2">VECINDAD · 2</div>
        <div class="s3">PERSONA · 1</div>
        <div class="s4">NORMA · 1</div>
      </div>
    </div>
    <div class="frio">${icono('Snowflake', { size: 12, color: '#2a5db0', grosor: 2.2 })} <b>Aún no han caído:</b> jerarquía normativa, fuentes, domicilio, capacidad y personas jurídicas. Vale la pena saberlas, pero no son prioridad.</div>
  </div>

  <div class="zonas">

    <!-- 1 · NACIONALIDAD (lo que más cae) -->
    <section class="col n1">
      <header><span class="n t">1</span><h2 class="t"><small>Arts. 17-28 del Código Civil</small>La nacionalidad española</h2><span class="calor">${icono('Flame', { size: 12, color: '#ffd9a8', grosor: 2.2 })} Cae mucho · 7 de 11</span></header>
      <div class="bloque">
        <div class="bt">${medallon('Flag', 'fuego')}<h3 class="t">Españoles de origen<small>Art. 17</small></h3></div>
        <ul>
          <li>Hijos de <b>padre o madre españoles</b>.</li>
          <li>Nacidos en España de extranjeros si <b>uno nació también aquí</b> (no hijos de diplomáticos).</li>
          <li>Nacidos en España de padres <b>sin nacionalidad</b> o con <b>filiación no determinada</b>.</li>
        </ul>
        <div class="real"><i>2025</i><span>¿Españoles de origen? → <b>nacidos de padre o madre españoles</b> (17.1.a).</span></div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Stamp', 'oro')}<h3 class="t">Cómo se adquiere<small>Opción · carta de naturaleza · residencia</small></h3></div>
        <ul>
          <li><b>Opción</b> (20): quien esté o haya estado bajo patria potestad de un español. Adoptado mayor de 18: <b>2 años</b> (19.2).</li>
          <li><b>Carta de naturaleza:</b> Real Decreto discrecional (21.1). <b>Residencia</b> legal (22):</li>
        </ul>
        <div class="chips"><span class="chip g">10 años</span><span class="chip">5 · refugiados</span><span class="chip">2 · iberoamericanos, Andorra, Filipinas, G. Ecuatorial, Portugal, sefardíes</span><span class="chip">1 · casos del 22.2</span></div>
        <div class="pasos3">
          <div><b>1</b>Jurar fidelidad y obediencia</div>
          <div><b>2</b>Renunciar a la anterior</div>
          <div><b>3</b>Inscribir en el Registro</div>
        </div>
        <div class="real"><i>2024</i><span>¿Para quién <b>no basta</b> 2 años? → <b>Mónaco no está</b> en la lista (22.1). ¿Y 1 año? → quien <b>no ejerció la opción</b> a tiempo (22.2).</span></div>
        <div class="real"><i>2022</i><span>Adoptada <b>a los 19 años</b> → <b>opta en 2 años</b> (19.2). <b>2023:</b> patria potestad de español → opta (20.1.a).</span></div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Hourglass', 'marino')}<h3 class="t">Perder y recuperar<small>Arts. 24-26</small></h3></div>
        <ul>
          <li>Emancipados residentes fuera que <b>adquieren otra voluntariamente</b>: la pierden a los <b>3 años</b> salvo que declaren conservarla.</li>
          <li><b>No originarios:</b> 3 años usando solo la anterior, o servir en armas extranjeras contra la prohibición del Gobierno. <mark>En guerra no se pierde.</mark></li>
        </ul>
        <div class="real"><i>2021</i><span><b>Recuperar</b> (26): residir legalmente, <b>declararlo ante el Registro Civil</b> e inscribirlo.</span></div>
      </div>
    </section>

    <!-- 2 · VECINDAD, PERSONA, DOMICILIO -->
    <section class="col n2">
      <header><span class="n t">2</span><h2 class="t"><small>Arts. 14-15, 29-41</small>Vecindad y persona</h2><span class="calor">${icono('Flame', { size: 12, color: '#ffd9a8', grosor: 2.2 })} Cae · 3 de 11</span></header>
      <div class="bloque">
        <div class="bt">${medallon('Map', 'azul')}<h3 class="t">Vecindad civil<small>Arts. 14-15 · derecho civil común o foral</small></h3></div>
        <ul>
          <li><b>Hijos:</b> la de los padres; si difiere, la del primero con filiación determinada, luego la del lugar de nacimiento. Padres: <b>6 meses</b> para elegir; hijo: desde los <b>14 años</b>.</li>
          <li><b>Se adquiere</b> por <b>2 años</b> de residencia (si se declara) o <b>10 años</b> (sin declaración en contra).</li>
        </ul>
        <div class="real fr"><i>2023</i><span><b>El matrimonio no altera</b> la vecindad civil. <b>2024:</b> se adquiere por <b>2 años</b> de residencia continuada si se manifiesta.</span></div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Baby', 'azul')}<h3 class="t">La persona física<small>Arts. 29-33</small></h3></div>
        <ul>
          <li><b>Nace</b> con vida y <b>entero desprendimiento del seno materno</b> (30); el <b>concebido</b> cuenta si le favorece (29). Se <b>extingue por la muerte</b> (32); en la duda, <b>a la vez</b> (33).</li>
        </ul>
        <div class="dos">
          <div class="c"><h4 class="t">Capacidad jurídica</h4><p>Ser <b>titular</b> de derechos. Desde el <b>nacimiento</b>.</p></div>
          <div class="c o"><h4 class="t">Capacidad de obrar</h4><p><b>Ejercerlos</b> uno mismo. Plena a los <b>18 años</b> (315).</p></div>
        </div>
        <div class="real fr"><i>2024</i><span>Art. 30: personalidad <b>al nacer con vida</b>, ya desprendido del seno materno.</span></div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('House', 'azul')}<h3 class="t">Domicilio y personas jurídicas<small>Arts. 35-41 ${icono('Snowflake', { size: 10, color: '#2a5db0', grosor: 2.2 })} aún sin caer</small></h3></div>
        <ul>
          <li><b>Domicilio:</b> la <mark>residencia habitual</mark> (40). En personas jurídicas, el de su ley o estatutos, o donde esté su representación legal (41).</li>
          <li><b>Personas jurídicas</b> (35): corporaciones, asociaciones y fundaciones de interés público, y asociaciones de interés particular.</li>
        </ul>
      </div>
    </section>

    <!-- 3 · LA NORMA Y SUS FUENTES -->
    <section class="col n3">
      <header><span class="n t">3</span><h2 class="t"><small>Título Preliminar · 1-7</small>Norma y fuentes</h2><span class="calor">${icono('Snowflake', { size: 12, color: '#bfe3ff', grosor: 2.2 })} Cae poco · 1 de 11</span></header>
      <div class="bloque">
        <div class="bt">${medallon('Scale')}<h3 class="t">El Derecho y la norma<small>Concepto, estructura y clases</small></h3></div>
        <ul>
          <li><b>Objetivo</b> (conjunto de normas) y <b>subjetivo</b> (facultad de una persona); también <b>ciencia</b> y <b>justicia</b>.</li>
        </ul>
        <div class="ecu">
          <div class="caja"><small>Supuesto de hecho</small><b>Lo que ocurre</b></div>
          <div class="flecha">→</div>
          <div class="caja o"><small>Consecuencia jurídica</small><b>El efecto</b></div>
        </div>
        <ul>
          <li><b>Imperativas</b> ordenan y <b>prohibitivas</b> prohíben (lo contrario es <mark>nulo</mark>, 6.3); <b>dispositivas</b>: valen si no se pacta otra cosa.</li>
        </ul>
        <div class="real mr"><i>2025</i><span>Precepto general que ordena la convivencia y se impone por la fuerza → <b>norma jurídica positiva</b>.</span></div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Landmark', 'oro')}<h3 class="t">Fuentes y jerarquía<small>Art. 1 · manda el rango superior</small></h3></div>
        <div class="flujo">
          <div class="paso"><i class="k">1.º</i><b>Ley</b></div><div class="sig">›</div>
          <div class="paso"><i class="k">2.º</i><b>Costumbre</b><span>a falta de ley</span></div><div class="sig">›</div>
          <div class="paso"><i class="k">3.º</i><b>Principios</b><span>a falta de ambas</span></div>
        </div>
        <div class="piramide">
          <div class="n pi1">Constitución</div>
          <div class="n pi2">Tratados internacionales<small>tras publicarse en el BOE (1.5)</small></div>
          <div class="n pi3">Leyes<small>orgánicas y ordinarias · decretos-leyes</small></div>
          <div class="n pi4">Reglamentos</div>
        </div>
      </div>
      <div class="bloque">
        <div class="bt">${medallon('Newspaper', 'marino')}<h3 class="t">Eficacia de las leyes<small>Arts. 2 y 6</small></h3></div>
        <ul>
          <li><b>Vigor a los 20 días</b> de su publicación completa en el BOE.</li>
          <li>Las <b>deroga otra posterior</b>; no son retroactivas salvo que lo digan.</li>
          <li><mark>La ignorancia de las leyes no excusa su cumplimiento.</mark></li>
        </ul>
      </div>
    </section>
  </div>

  <div class="banda">
    <div class="card fond">
      <div class="bt">${medallon('BadgeCheck', 'oro')}<h3 class="t">Números que se preguntan</h3></div>
      <div class="numeros">
        <div class="nm"><b>10·5·2·1<i></i></b><span>residencia para ser español</span></div>
        <div class="nm"><b>3<i>años</i></b><span>para perder la nacionalidad</span></div>
        <div class="nm"><b>2·10<i>años</i></b><span>vecindad civil por residencia</span></div>
        <div class="nm"><b>180<i>días</i></b><span>caduca si no comparece</span></div>
        <div class="nm"><b>14<i>años</i></b><span>jurar y optar con asistencia</span></div>
        <div class="nm"><b>20<i>días</i></b><span>entrada en vigor de una ley</span></div>
      </div>
    </div>
    <div class="card trucos">
      <div class="bt">${medallon('Lightbulb', 'verde')}<h3 class="t">Trucos para no fallar<small>Lo que más se confunde</small></h3></div>
      <ul>
        <li><b>10·5·2·1</b> = escalera: cuanto más cerca, menos años.</li>
        <li><b>L-C-P:</b> Ley, Costumbre, Principios generales.</li>
        <li><b>Origen</b> = nace español; el resto, se adquiere.</li>
        <li><b>1 año</b> basta: nacido en España, casado con español, viudo, nieto de español…</li>
      </ul>
    </div>
    <div class="card qr">
      <div class="cod"><img src="qr-tema-01.svg" alt="Código QR del Campus Alphapol"></div>
      <div>
        <h3 class="t">Practica este tema <em>en el Campus</em></h3>
        <p>Escanea y entrena con <b>${preguntas} preguntas del Tema 1</b>, corregidas al momento y con explicación de cada respuesta.</p>
      </div>
    </div>
  </div>

  <div class="pie">
    <div class="l"><b>ALPHAPOL</b> · Centro de formación · Málaga &nbsp;|&nbsp; campus.alphapol.es<br>Fuente: Código Civil (BOE-A-1889-4763), texto consolidado. Radar: preguntas del Tema 1 en los exámenes oficiales de Escala Básica 2021-2025, contadas por Alphapol.</div>
    <div class="r"><b>T1 |</b> EL DERECHO · página 1 de 2<br>Contenido para uso personal de estudio</div>
  </div>
</div>
</div>

<!-- ═════════ PÁGINA 2 · LA NACIONALIDAD PASO A PASO ═════════ -->
<div class="hoja" id="h2">
<img class="agua" src="../../public/marca/alphapol-isotipo.svg" alt="">
<div class="pagina">
  <div class="cab">
    <img src="../../public/marca/alphapol-logotipo.svg" alt="Alphapol">
    <div class="linea"></div>
    <h1 class="t">La nacionalidad <em>paso a paso</em><small>Es el 64 % de lo que ha caído del Tema 1: aquí está entera, en orden y con las trampas</small></h1>
    <div class="esc"><small>Escala</small><b class="t">Básica · Ciencias Jurídicas</b></div>
    <div class="num"><div><span>Tema</span><b class="t">1</b></div></div>
  </div>

  <div class="flujo2">
    <div class="pregunta"><b class="t">¿Cómo se es español?</b><span>Arts. 17 a 26</span></div>
    <div class="rama">
      <div class="nodo n-o"><div class="cab2">${icono('Flag', { size: 15, color: '#fff' })}<h4 class="t">A · Se nace español</h4><em>Origen · art. 17</em></div>
        <ul>
          <li><b>Hijos de padre o madre españoles</b> (la que cayó en 2025).</li>
          <li><b>Nacidos en España</b> de extranjeros si <b>uno nació también aquí</b> (no hijos de diplomáticos).</li>
          <li>Nacidos en España de padres <b>sin nacionalidad</b> atribuible o con <b>filiación no determinada</b>.</li>
          <li>Si la filiación se determina <b>después de los 18</b>: <b>opta en 2 años</b> (17.2).</li>
        </ul>
      </div>
      <div class="nodo n-b"><div class="cab2">${icono('Handshake', { size: 15, color: '#fff' })}<h4 class="t">B · Se tiene derecho a optar</h4><em>Opción · art. 20</em></div>
        <ul>
          <li><b>Están o han estado bajo la patria potestad</b> de un español (cayó en 2023).</li>
          <li>Padre o madre <b>originariamente español y nacido en España</b> (<b>sin límite de edad</b>).</li>
          <li><b>Adoptado mayor de 18</b> (19.2) → <b>2 años</b> desde la adopción (cayó en 2022).</li>
        </ul>
        <div class="mini"><b>Quién declara:</b> &lt;14 años, su representante · ≥14, asistido por él · emancipado o ≥18, <b>por sí solo</b>. Caduca a los <b>20 años</b>.</div>
      </div>
      <div class="nodo n-c"><div class="cab2">${icono('Stamp', { size: 15, color: '#fff' })}<h4 class="t">C · Carta de naturaleza</h4><em>Art. 21.1</em></div>
        <ul>
          <li>La da el <b>Gobierno por Real Decreto</b>, de forma <b>discrecional</b>.</li>
          <li>Hacen falta <b>circunstancias excepcionales</b> en el interesado.</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="doble">
    <div class="esc2">
      <div class="et2"><span class="t">D · Por residencia: la escalera</span><em>Art. 22 · legal, continuada e inmediatamente anterior a la petición</em></div>
      <div class="escalera">
        <div class="peld p10"><b class="t">10</b><span>años</span><p><b>Regla general</b></p></div>
        <div class="peld p5"><b class="t">5</b><span>años</span><p><b>Refugiados</b></p></div>
        <div class="peld p2"><b class="t">2</b><span>años</span><p><b>Iberoamérica, Andorra, Filipinas, G. Ecuatorial, Portugal</b> y <b>sefardíes</b><br><mark>Mónaco NO está</mark></p></div>
        <div class="peld p1"><b class="t">1</b><span>año</span><p>Nacido en España · <b>no ejerció la opción</b> a tiempo · tutela o acogimiento 2 años · casado 1 año · viudo · nieto de español</p></div>
      </div>
      <div class="req">
        <div class="ti t">Y luego, siempre (art. 23)</div>
        <div class="pasos4">
          <div><b>1</b>Jurar o prometer fidelidad al <b>Rey</b> y obediencia a la CE y a las leyes (≥14 años)</div>
          <div><b>2</b><b>Renunciar</b> a la anterior (salvo los de la lista del 24.1 y sefardíes)</div>
          <div><b>3</b><b>Inscribir</b> en el Registro Civil</div>
          <div class="rojo"><b>180</b>días para comparecer, o <b>caduca</b> (21.4)</div>
        </div>
      </div>
    </div>
    <div class="perd">
      <div class="et2"><span class="t">Perder y recuperar</span><em>Arts. 24 a 26</em></div>
      <div class="linea-t">
        <div class="hito"><i>${icono('Hourglass', { size: 13, color: '#fff' })}</i><p><b>3 años</b> viviendo fuera, siendo emancipado y <b>adquiriendo otra nacionalidad voluntariamente</b> (o usando solo la extranjera) → <b>se pierde</b>… salvo que se <b>declare conservarla</b> en ese plazo.</p></div>
        <div class="hito"><i>${icono('Ban', { size: 13, color: '#fff' })}</i><p><b>No originarios:</b> 3 años usando solo la anterior, o servir en armas / cargo político extranjero <b>contra la prohibición del Gobierno</b>.</p></div>
        <div class="hito"><i>${icono('Shield', { size: 13, color: '#fff' })}</i><p><mark>En guerra no se pierde</mark> (24.4). Ningún español <b>de origen</b> puede ser privado de ella (art. 11 CE).</p></div>
        <div class="hito ok"><i>${icono('Undo2', { size: 13, color: '#fff' })}</i><p><b>Recuperar (26):</b> residir legalmente · <b>declararlo ante el Registro Civil</b> (cayó en 2021) · inscribirlo.</p></div>
      </div>
    </div>
  </div>

  <div class="test2">
    <div class="tt"><b class="t">Test relámpago</b><span>Contesta sin mirar. Soluciones abajo.</span></div>
    <ol>
      <li>Un joven de 20 años, adoptado por españoles el año pasado, ¿cuánto tiempo tiene para optar? <b>(A)</b> 1 año <b>(B)</b> 2 años <b>(C)</b> 10 años</li>
      <li>¿Qué país de la lista tiene derecho a los 2 años de residencia? <b>(A)</b> Mónaco <b>(B)</b> Filipinas <b>(C)</b> Italia</li>
      <li>Concedida la residencia, ¿cuántos días hay para comparecer? <b>(A)</b> 90 <b>(B)</b> 180 <b>(C)</b> 365</li>
      <li>¿Cuántos años fuera, con otra nacionalidad voluntaria, para perder la española (sin declarar)? <b>(A)</b> 3 <b>(B)</b> 5 <b>(C)</b> 10</li>
    </ol>
    <p class="sol">Soluciones:<br>1-B (art. 19.2) · 2-B (art. 22.1)<br>3-B (art. 21.4) · 4-A (art. 24.1)</p>
  </div>

  <div class="pie">
    <div class="l"><b>ALPHAPOL</b> · Centro de formación · Málaga &nbsp;|&nbsp; campus.alphapol.es<br>Fuente: Código Civil (BOE-A-1889-4763), texto consolidado y Constitución española, art. 11.</div>
    <div class="r"><b>T1 |</b> EL DERECHO · página 2 de 2<br>Contenido para uso personal de estudio</div>
  </div>
</div>
</div>
</body></html>`;

const fichero = join(CARPETA, 'tema-01.html');
await writeFile(fichero, html);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1123, height: 794 }, deviceScaleFactor: 2 });
await pagina.goto(pathToFileURL(fichero).href);
await pagina.evaluate(() => document.fonts.ready);
// Comprobación: nada se sale de su caja (en las dos hojas).
const desbordes = await pagina.evaluate(() => {
  const malos = [];
  document.querySelectorAll('.bloque, .card, .col, .radar, .nodo, .esc2, .perd, .test2, .flujo2, .doble').forEach((e) => {
    if (e.scrollHeight > e.clientHeight + 1) malos.push(`${e.className} ${e.querySelector('h3,h2,h4,.et2,.tt')?.textContent?.slice(0, 28)} (+${e.scrollHeight - e.clientHeight}px)`);
  });
  document.querySelectorAll('.hoja').forEach((h) => { if (h.scrollHeight > 794) malos.push(`${h.id} +${h.scrollHeight - 793}px`); });
  return malos;
});
console.log(desbordes.length ? 'DESBORDES:\n  ' + desbordes.join('\n  ') : 'Sin desbordes');
await pagina.locator('#h1').screenshot({ path: join(CARPETA, 'tema-01.png') });
await pagina.locator('#h2').screenshot({ path: join(CARPETA, 'tema-01-p2.png') });
await pagina.pdf({ path: join(CARPETA, 'tema-01.pdf'), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
await navegador.close();
// El mismo esquema en DOCX EDITABLE (tablas y texto de Word): se mantiene a mano junto a este guion.
const { execFileSync } = require('node:child_process');
execFileSync('python3', ['-I', join(RAIZ, 'scripts', 'resumenes', 'esquema_docx.py'), join(CARPETA, 'tema-01.docx'),
  join(RAIZ, 'public', 'marca', 'oficiales', 'logo-dorado-completo.png'), join(CARPETA, 'qr-tema-01.png')], { stdio: 'inherit' });
console.log('OK', join(CARPETA, 'tema-01.pdf'));
