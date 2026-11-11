/**
 * EL EXAMEN EN PAPEL (regla 115): cuestionario, hoja de respuestas y plantilla.
 *
 * POR QUÉ EXISTE
 * El día del examen el opositor no toca una pantalla: recibe un cuadernillo
 * con su portada, y una hoja de lectora óptica donde rellena círculos. Quien
 * solo ha entrenado en el móvil se encuentra ese día con un formato que no ha
 * visto, y la academia hace simulacros presenciales con fotocopias que monta a
 * mano. Esto saca del banco un examen con la MISMA forma que el de verdad:
 *
 *   · el CUESTIONARIO: la portada (escudo, «Escala Básica de la Policía
 *     Nacional», las instrucciones, «no pase la página hasta que se indique»)
 *     y las preguntas numeradas con sus tres opciones;
 *   · la HOJA DE RESPUESTAS: datos del opositor, el DNI en círculos, la zona 1
 *     (100 preguntas, A-B-C y su fila de anular) y la zona 2 (cinco opciones);
 *   · la PLANTILLA: la misma hoja con la respuesta correcta ya rellenada, para
 *     corregir poniéndola al lado.
 *
 * Todo lleva el logo y la marca de agua de Alphapol, y un pie que dice que es
 * un simulacro de la academia: se parece al examen, no se hace pasar por él.
 *
 * MÓDULO PURO (regla 21): recibe las preguntas y los bytes de las imágenes, y
 * devuelve los bytes del PDF. No lee ficheros ni la red, así que corre igual
 * en el navegador (que es donde se usa) que en un test.
 */

import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';

export type PreguntaImpresa = {
  enunciado: string;
  /** Las opciones en el orden del banco: la primera es la «a». */
  opciones: string[];
  /** Índice de la correcta (0 = a). */
  correcta: number;
};

export type DatosExamen = {
  /** «Global número 1», «Simulacro de noviembre»… Va entre paréntesis en la portada. */
  titulo: string;
  /** La letra del modelo: «A», «B»… */
  modelo: string;
  minutos: number;
  /** «25 de octubre de 2026». Opcional. */
  fecha?: string | null;
  preguntas: PreguntaImpresa[];
};

export type ImagenesExamen = {
  /** El escudo de la portada (PNG). */
  escudo: Uint8Array;
  /** «ALPHAPOL · CENTRO DE FORMACIÓN» con el fondo transparente (PNG). */
  logotipo: Uint8Array;
  /** La «A» sola con el fondo transparente (PNG). */
  isotipo: Uint8Array;
};

/** A4 en puntos. */
export const A4 = { ancho: 595.28, alto: 841.89 };
/** Cuántas preguntas caben en cada zona de la hoja de respuestas. */
export const PREGUNTAS_POR_ZONA = 100;

const MARINO = rgb(0.078, 0.161, 0.353);
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.35, 0.35, 0.35);
const ROJO = rgb(0.82, 0.07, 0.1);
const ROJO_SUAVE = rgb(0.99, 0.9, 0.88);
const ROJO_MEDIO = rgb(0.93, 0.42, 0.33);
const BLANCO = rgb(1, 1, 1);

const PIE = 'Simulacro de Alphapol · Centro de formación. Material de entrenamiento: no es un documento oficial.';

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** Lo que las fuentes estándar del PDF no saben escribir, a algo que sí. */
const SUSTITUTOS: Record<string, string> = {
  '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~',
  '−': '-', '‐': '-', '‑': '-', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
  '′': "'", '″': '"', '∗': '*', '×': 'x',
};

/**
 * Deja el texto en lo que la fuente puede pintar. Una pregunta del banco con
 * un carácter raro (una flecha, un espacio fino) no puede tumbar el PDF entero:
 * `pdf-lib` lanza si la fuente no tiene el glifo.
 */
export function textoImprimible(texto: string, fuente: PDFFont): string {
  const tiene = new Set(fuente.getCharacterSet());
  let out = '';
  for (const c of String(texto ?? '').replace(/\s+/g, ' ').trim()) {
    const s = SUSTITUTOS[c] ?? c;
    for (const x of s) out += tiene.has(x.codePointAt(0)!) ? x : '';
  }
  // Quitar un carácter puede dejar dos espacios seguidos.
  return out.replace(/ {2,}/g, ' ').trim();
}

/** Parte un texto en líneas que caben en `ancho`. Una palabra más larga que la línea se parte. */
export function partirEnLineas(texto: string, fuente: PDFFont, cuerpo: number, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = '';
  const cabe = (t: string) => fuente.widthOfTextAtSize(t, cuerpo) <= ancho;
  for (let palabra of texto.split(' ').filter(Boolean)) {
    while (!cabe(palabra)) {
      // Una «palabra» sin espacios más ancha que la línea (una URL, un código).
      let n = palabra.length - 1;
      while (n > 1 && !cabe(palabra.slice(0, n))) n--;
      if (actual) { lineas.push(actual); actual = ''; }
      lineas.push(palabra.slice(0, n));
      palabra = palabra.slice(n);
    }
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (cabe(prueba)) actual = prueba;
    else { lineas.push(actual); actual = palabra; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

const UNIDADES = ['CERO', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

/** 50 → «CINCUENTA», 45 → «CUARENTA Y CINCO». Hasta 199; fuera de ahí, las cifras. */
export function numeroEnLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 199) return String(n);
  if (n >= 100) return n === 100 ? 'CIEN' : `CIENTO ${numeroEnLetras(n - 100)}`;
  if (n < 30) return UNIDADES[n];
  const d = Math.floor(n / 10), u = n % 10;
  return u ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d];
}

function centrado(p: PDFPage, texto: string, y: number, fuente: PDFFont, cuerpo: number, color: RGB = NEGRO, x0 = 0, x1 = A4.ancho) {
  const w = fuente.widthOfTextAtSize(texto, cuerpo);
  p.drawText(texto, { x: x0 + (x1 - x0 - w) / 2, y, size: cuerpo, font: fuente, color });
}

function aLaDerecha(p: PDFPage, texto: string, xDerecha: number, y: number, fuente: PDFFont, cuerpo: number, color: RGB = NEGRO) {
  p.drawText(texto, { x: xDerecha - fuente.widthOfTextAtSize(texto, cuerpo), y, size: cuerpo, font: fuente, color });
}

// ---------------------------------------------------------------------------
// La marca de Alphapol
// ---------------------------------------------------------------------------

/** El logotipo sobre su placa marina: sobre papel blanco, «POL» (que es blanco) no se vería. */
function placaAlphapol(p: PDFPage, logotipo: PDFImage, x: number, yArriba: number, ancho: number) {
  const alto = ancho * 0.32;
  p.drawRectangle({ x, y: yArriba - alto, width: ancho, height: alto, color: MARINO, borderColor: MARINO, borderWidth: 0 });
  const w = ancho * 0.84;
  const h = (w * logotipo.height) / logotipo.width;
  p.drawImage(logotipo, { x: x + (ancho - w) / 2, y: yArriba - alto + (alto - h) / 2, width: w, height: h });
}

/** «ALPHAPOL» en diagonal, enorme y muy claro, de esquina a esquina. */
function marcaDeAguaGrande(p: PDFPage, negrita: PDFFont, isotipo: PDFImage) {
  const texto = 'ALPHAPOL';
  const cuerpo = 118;
  const angulo = 55;
  const rad = (angulo * Math.PI) / 180;
  const w = negrita.widthOfTextAtSize(texto, cuerpo);
  const cx = A4.ancho / 2 + 26, cy = A4.alto / 2 - 30;
  p.drawText(texto, {
    x: cx - (w / 2) * Math.cos(rad), y: cy - (w / 2) * Math.sin(rad),
    size: cuerpo, font: negrita, color: rgb(0.5, 0.5, 0.5), opacity: 0.11, rotate: degrees(angulo),
  });
  const lado = 150;
  p.drawImage(isotipo, { x: A4.ancho - lado - 34, y: 58, width: lado, height: (lado * isotipo.height) / isotipo.width, opacity: 0.1 });
}

/** La misma marca, pequeña y repetida: en la hoja de respuestas no puede tapar los círculos. */
function marcaDeAguaRepetida(p: PDFPage, negrita: PDFFont) {
  for (let fila = 0; fila < 7; fila++) {
    for (let col = 0; col < 4; col++) {
      p.drawText('ALPHAPOL', {
        x: 60 + col * 150 + (fila % 2) * 60, y: 70 + fila * 118,
        size: 17, font: negrita, color: MARINO, opacity: 0.07, rotate: degrees(45),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// El cuestionario
// ---------------------------------------------------------------------------

const MARGEN = 62;
const CUERPO_PREGUNTA = 10.5;
const INTERLINEA = 13.4;
const LETRAS = ['a', 'b', 'c', 'd', 'e'];

type Bloque = { lineas: { texto: string; x: number; negrita: boolean }[]; alto: number };

function bloqueDePregunta(numero: number, q: PreguntaImpresa, normal: PDFFont, negrita: PDFFont): Bloque {
  const ancho = A4.ancho - 2 * MARGEN;
  const sangria = 22;
  const lineas: Bloque['lineas'] = [];
  const enunciado = partirEnLineas(textoImprimible(q.enunciado, negrita), negrita, CUERPO_PREGUNTA, ancho - sangria);
  enunciado.forEach((t, i) => lineas.push({ texto: i === 0 ? `${numero}.` : '', x: MARGEN, negrita: true }, { texto: t, x: MARGEN + sangria, negrita: true }));
  q.opciones.slice(0, LETRAS.length).forEach((op, k) => {
    const partes = partirEnLineas(textoImprimible(op, normal), normal, CUERPO_PREGUNTA, ancho - sangria - 16);
    partes.forEach((t, i) => lineas.push({ texto: i === 0 ? `${LETRAS[k]})` : '', x: MARGEN + sangria, negrita: false }, { texto: t, x: MARGEN + sangria + 16, negrita: false }));
  });
  const filas = enunciado.length + q.opciones.slice(0, LETRAS.length).reduce(
    (n, op) => n + partirEnLineas(textoImprimible(op, normal), normal, CUERPO_PREGUNTA, ancho - sangria - 16).length, 0);
  return { lineas, alto: filas * INTERLINEA + 9 };
}

/** Reparte las preguntas en páginas sin partir ninguna entre dos. */
export function repartirEnPaginas(altos: number[], altoUtil: number): number[][] {
  const paginas: number[][] = [];
  let actual: number[] = [];
  let usado = 0;
  altos.forEach((alto, i) => {
    if (actual.length && usado + alto > altoUtil) { paginas.push(actual); actual = []; usado = 0; }
    actual.push(i);
    usado += alto;
  });
  if (actual.length) paginas.push(actual);
  return paginas;
}

function portada(p: PDFPage, d: DatosExamen, paginas: number, f: Fuentes, img: Imagenes) {
  marcaDeAguaGrande(p, f.helvNegrita, img.isotipo);

  // Cabecera: el escudo a la izquierda, el organismo a la derecha y, encima, Alphapol.
  const anchoEscudo = 62;
  p.drawImage(img.escudo, { x: MARGEN + 6, y: A4.alto - 62 - (anchoEscudo * img.escudo.height) / img.escudo.width, width: anchoEscudo, height: (anchoEscudo * img.escudo.height) / img.escudo.width });
  placaAlphapol(p, img.logotipo, A4.ancho - MARGEN - 92, A4.alto - 40, 92);
  const xDer = A4.ancho - MARGEN;
  ['DIRECCIÓN GENERAL DE LA POLICÍA', 'DIVISIÓN DE FORMACIÓN Y PERFECCIONAMIENTO', 'ÁREA DE PROCESOS SELECTIVOS']
    .forEach((t, i) => aLaDerecha(p, t, xDer, A4.alto - 92 - i * 12, f.timesNegritaCursiva, 9.2));

  centrado(p, 'ESCALA BÁSICA DE LA', A4.alto - 262, f.helv, 27);
  centrado(p, 'POLICÍA NACIONAL', A4.alto - 294, f.helv, 27);
  centrado(p, `(${textoImprimible(d.titulo, f.timesNegrita)})`, A4.alto - 320, f.timesNegrita, 14);

  // El recuadro del título.
  const cajaAncho = 318, cajaAlto = 38, cajaY = A4.alto - 422;
  p.drawRectangle({ x: (A4.ancho - cajaAncho) / 2, y: cajaY, width: cajaAncho, height: cajaAlto, borderColor: NEGRO, borderWidth: 1.6 });
  centrado(p, 'CUESTIONARIO DE PREGUNTAS', cajaY + 13, f.timesNegrita, 15.5);

  // Los datos del opositor.
  const yDatos = A4.alto - 502;
  p.drawText('APELLIDOS Y NOMBRE:', { x: MARGEN, y: yDatos, size: 7.6, font: f.timesNegritaCursiva });
  p.drawLine({ start: { x: MARGEN + 92, y: yDatos - 1 }, end: { x: A4.ancho - MARGEN - 128, y: yDatos - 1 }, thickness: 0.6 });
  p.drawText('D.N.I.:', { x: A4.ancho - MARGEN - 122, y: yDatos, size: 7.6, font: f.timesNegritaCursiva });
  p.drawLine({ start: { x: A4.ancho - MARGEN - 94, y: yDatos - 1 }, end: { x: A4.ancho - MARGEN, y: yDatos - 1 }, thickness: 0.6 });

  // Las instrucciones.
  let y = yDatos - 30;
  p.drawText('INSTRUCCIONES', { x: MARGEN, y, size: 7.6, font: f.helvNegrita });
  p.drawLine({ start: { x: MARGEN, y: y - 1.5 }, end: { x: MARGEN + f.helvNegrita.widthOfTextAtSize('INSTRUCCIONES', 7.6), y: y - 1.5 }, thickness: 0.5 });
  y -= 20;
  const n = d.preguntas.length;
  const instrucciones: { texto: string; negrita?: boolean }[] = [
    { texto: `La siguiente prueba consta de ${n} preguntas y ${paginas} páginas. Si en el transcurso de la prueba observa que le falta alguna, comuníquelo a algún miembro del Tribunal o colaborador.` },
    { texto: 'Cada pregunta solo tiene una respuesta correcta.' },
    { texto: 'Los errores penalizan.' },
    { texto: 'Solo está permitido bolígrafo azul o negro, tipo Bic.', negrita: true },
    { texto: 'Las contestaciones a las preguntas deben marcarse en la hoja de respuestas A5: zona 1.' },
    { texto: `Dispone de ${numeroEnLetras(d.minutos)} MINUTOS.` },
  ];
  for (const ins of instrucciones) {
    const fuente = ins.negrita ? f.helvNegrita : f.helv;
    const lineas = partirEnLineas(ins.texto, fuente, 7.6, A4.ancho - 2 * MARGEN - 34);
    p.drawCircle({ x: MARGEN + 22, y: y + 2.4, size: 1.3, color: NEGRO });
    lineas.forEach((t, i) => p.drawText(t, { x: MARGEN + 34, y: y - i * 9.6, size: 7.6, font: fuente }));
    y -= lineas.length * 9.6 + 1.5;
  }

  centrado(p, 'NO PASE LA PÁGINA HASTA QUE SE INDIQUE', 104, f.timesNegrita, 13);
  centrado(p, '1', 84, f.helv, 7.5);
  centrado(p, PIE, 30, f.helv, 6.6, GRIS);
}

type Fuentes = { helv: PDFFont; helvNegrita: PDFFont; times: PDFFont; timesNegrita: PDFFont; timesNegritaCursiva: PDFFont };
type Imagenes = { escudo: PDFImage; logotipo: PDFImage; isotipo: PDFImage };

async function prepara(pdf: PDFDocument, img: ImagenesExamen): Promise<{ f: Fuentes; i: Imagenes }> {
  const [helv, helvNegrita, times, timesNegrita, timesNegritaCursiva, escudo, logotipo, isotipo] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
    pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    pdf.embedPng(img.escudo),
    pdf.embedPng(img.logotipo),
    pdf.embedPng(img.isotipo),
  ]);
  return { f: { helv, helvNegrita, times, timesNegrita, timesNegritaCursiva }, i: { escudo, logotipo, isotipo } };
}

/** El cuadernillo: la portada y las preguntas. */
export async function pdfCuestionario(d: DatosExamen, imagenes: ImagenesExamen): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Cuestionario · ${d.titulo}`);
  pdf.setAuthor('Alphapol · Centro de formación');
  const { f, i } = await prepara(pdf, imagenes);

  const arriba = A4.alto - 64, abajo = 62;
  const bloques = d.preguntas.map((q, k) => bloqueDePregunta(k + 1, q, f.times, f.timesNegrita));
  const paginas = repartirEnPaginas(bloques.map((b) => b.alto), arriba - abajo);

  portada(pdf.addPage([A4.ancho, A4.alto]), d, paginas.length + 1, f, i);

  paginas.forEach((indices, n) => {
    const p = pdf.addPage([A4.ancho, A4.alto]);
    marcaDeAguaGrande(p, f.helvNegrita, i.isotipo);
    p.drawText(textoImprimible(`Escala Básica de la Policía Nacional · ${d.titulo} · Modelo ${d.modelo}`, f.helv), { x: MARGEN, y: A4.alto - 40, size: 7.4, font: f.helv, color: GRIS });
    aLaDerecha(p, 'ALPHAPOL', A4.ancho - MARGEN, A4.alto - 40, f.helvNegrita, 7.4, MARINO);
    p.drawLine({ start: { x: MARGEN, y: A4.alto - 46 }, end: { x: A4.ancho - MARGEN, y: A4.alto - 46 }, thickness: 0.4, color: GRIS });

    let y = arriba;
    for (const idx of indices) {
      const b = bloques[idx];
      let fila = 0;
      // Las líneas van de dos en dos: la etiqueta («12.», «a)») y su texto.
      for (let k = 0; k < b.lineas.length; k += 2) {
        const etiqueta = b.lineas[k], texto = b.lineas[k + 1];
        const yLinea = y - CUERPO_PREGUNTA - fila * INTERLINEA;
        if (etiqueta.texto) p.drawText(etiqueta.texto, { x: etiqueta.x, y: yLinea, size: CUERPO_PREGUNTA, font: etiqueta.negrita ? f.timesNegrita : f.times });
        p.drawText(texto.texto, { x: texto.x, y: yLinea, size: CUERPO_PREGUNTA, font: texto.negrita ? f.timesNegrita : f.times });
        fila++;
      }
      y -= b.alto;
    }
    centrado(p, String(n + 2), 40, f.helv, 7.5);
    centrado(p, PIE, 26, f.helv, 6.2, GRIS);
  });

  return pdf.save();
}

// ---------------------------------------------------------------------------
// La hoja de respuestas
// ---------------------------------------------------------------------------

/** Un círculo de la hoja, con su letra dentro; relleno si es la respuesta de la plantilla. */
function burbuja(p: PDFPage, x: number, y: number, letra: string, f: Fuentes, relleno: boolean, rx = 4.3, ry = 3.1) {
  p.drawEllipse({ x, y, xScale: rx, yScale: ry, color: relleno ? NEGRO : BLANCO, borderColor: relleno ? NEGRO : ROJO, borderWidth: 0.5 });
  if (!relleno) {
    const cuerpo = ry * 1.35;
    p.drawText(letra, { x: x - f.helv.widthOfTextAtSize(letra, cuerpo) / 2, y: y - cuerpo * 0.36, size: cuerpo, font: f.helv, color: ROJO });
  }
}

/**
 * Una zona: 100 preguntas en 4 columnas de 25. Cada pregunta, su número, sus
 * círculos y debajo la fila de «anular» (en el examen de verdad, quien se
 * equivoca rellena ahí la que marcó mal).
 */
function zona(
  p: PDFPage, f: Fuentes, titulo: string, x: number, yArriba: number, ancho: number, alto: number,
  opciones: number, respuestas: (number | null)[] | null, intenso: boolean,
) {
  const cabecera = 11;
  p.drawRectangle({ x, y: yArriba - cabecera, width: ancho, height: cabecera, color: intenso ? BLANCO : ROJO, borderColor: ROJO, borderWidth: 0.8 });
  centrado(p, titulo, yArriba - cabecera + 2.6, f.helvNegrita, 7.2, intenso ? ROJO : BLANCO, x, x + ancho);

  const columnas = 4, filas = 25;
  const anchoCol = ancho / columnas;
  const altoFila = (alto - cabecera) / filas;
  const anchoNumero = 17;
  const paso = (anchoCol - anchoNumero - 6) / opciones;
  const letras = ['A', 'B', 'C', 'D', 'E'];

  for (let c = 0; c < columnas; c++) {
    const x0 = x + c * anchoCol;
    for (let r = 0; r < filas; r++) {
      const numero = c * filas + r + 1;
      const yFila = yArriba - cabecera - r * altoFila;
      const yResp = yFila - altoFila * 0.33;
      const yAnular = yFila - altoFila * 0.77;
      p.drawRectangle({ x: x0, y: yFila - altoFila, width: anchoCol, height: altoFila, color: ROJO_SUAVE, borderColor: ROJO, borderWidth: 0.35 });
      // El número, en su casilla.
      p.drawRectangle({ x: x0, y: yFila - altoFila * 0.58, width: anchoNumero, height: altoFila * 0.58, color: intenso ? ROJO_MEDIO : ROJO_SUAVE });
      aLaDerecha(p, String(numero), x0 + anchoNumero - 2.2, yResp - 2.6, f.helvNegrita, 7.4, intenso ? BLANCO : ROJO);
      p.drawText('ANULAR', { x: x0 + 1.2, y: yAnular - 1.4, size: 3.3, font: f.helvNegrita, color: ROJO });
      const correcta = respuestas ? respuestas[numero - 1] : null;
      for (let o = 0; o < opciones; o++) {
        const cx = x0 + anchoNumero + 5 + paso * (o + 0.5);
        burbuja(p, cx, yResp, letras[o], f, correcta === o);
        burbuja(p, cx, yAnular, letras[o], f, false, 3.5, 2.4);
      }
    }
  }
  p.drawRectangle({ x, y: yArriba - alto, width: ancho, height: alto, borderColor: ROJO, borderWidth: 0.9 });
}

/** El DNI en círculos: ocho columnas del 0 al 9, y las casillas de arriba para escribirlo. */
function rejillaDni(p: PDFPage, f: Fuentes, x: number, yArriba: number, ancho: number, alto: number) {
  centrado(p, 'D.N.I.', yArriba + 4, f.helvNegrita, 6.6, NEGRO, x, x + ancho);
  p.drawRectangle({ x, y: yArriba - alto, width: ancho, height: alto, color: ROJO_SUAVE, borderColor: ROJO, borderWidth: 0.9 });
  const columnas = 8;
  const paso = (ancho - 12) / columnas;
  const altoCasilla = 15;
  for (let c = 0; c < columnas; c++) {
    const cx = x + 6 + paso * (c + 0.5);
    p.drawRectangle({ x: cx - paso * 0.42, y: yArriba - 5 - altoCasilla, width: paso * 0.84, height: altoCasilla, color: BLANCO, borderColor: ROJO, borderWidth: 0.6 });
    const pasoY = (alto - altoCasilla - 16) / 10;
    for (let n = 0; n < 10; n++) burbuja(p, cx, yArriba - altoCasilla - 12 - pasoY * (n + 0.5) + 2, String(n), f, false, 4.6, 3.3);
  }
}

/**
 * La hoja de respuestas. Con `resuelta`, los círculos de la respuesta correcta
 * de la zona 1 van rellenos: es la plantilla de corrección.
 */
export async function pdfHojaRespuestas(
  d: DatosExamen, imagenes: ImagenesExamen, opciones: { resuelta?: boolean } = {},
): Promise<Uint8Array> {
  const resuelta = opciones.resuelta === true;
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${resuelta ? 'Plantilla de corrección' : 'Hoja de respuestas'} · ${d.titulo}`);
  pdf.setAuthor('Alphapol · Centro de formación');
  const { f, i } = await prepara(pdf, imagenes);
  const p = pdf.addPage([A4.ancho, A4.alto]);
  marcaDeAguaRepetida(p, f.helvNegrita);

  const izq = 34, der = A4.ancho - 52;

  // ---- Arriba a la izquierda: Alphapol y los datos del opositor ----
  placaAlphapol(p, i.logotipo, izq, A4.alto - 26, 118);
  const cajaX = izq, cajaY = A4.alto - 76, cajaAncho = 178, filaAlto = 18;
  const campos = ['1.er APELLIDO', '2.º APELLIDO', 'NOMBRE', 'FIRMA'];
  const impreso = [
    'ESCALA BÁSICA',
    'P. CONOCIMIENTOS',
    textoImprimible(d.titulo, f.helvNegrita).toUpperCase().slice(0, 26),
    d.fecha ? textoImprimible(d.fecha, f.helv).toUpperCase().slice(0, 28) : '',
  ];
  campos.forEach((campo, k) => {
    const y = cajaY - k * filaAlto;
    p.drawRectangle({ x: cajaX, y: y - filaAlto, width: cajaAncho, height: filaAlto, color: BLANCO, borderColor: GRIS, borderWidth: 0.5 });
    p.drawText(campo, { x: cajaX + 3, y: y - 7, size: 4.6, font: f.helvNegrita, color: NEGRO });
    if (impreso[k]) p.drawText(impreso[k], { x: cajaX + 50, y: y - 12.5, size: k === 3 ? 7 : 7.6, font: k === 3 ? f.helv : f.helvNegrita, color: MARINO, opacity: 0.55 });
  });
  const yDni = cajaY - campos.length * filaAlto;
  p.drawRectangle({ x: cajaX, y: yDni - filaAlto, width: cajaAncho * 0.6, height: filaAlto, color: BLANCO, borderColor: GRIS, borderWidth: 0.5 });
  p.drawRectangle({ x: cajaX + cajaAncho * 0.6, y: yDni - filaAlto, width: cajaAncho * 0.4, height: filaAlto, color: BLANCO, borderColor: GRIS, borderWidth: 0.5 });
  p.drawText('D.N.I.', { x: cajaX + 3, y: yDni - 7, size: 4.6, font: f.helvNegrita });
  p.drawText('FECHA', { x: cajaX + cajaAncho * 0.6 + 3, y: yDni - 7, size: 4.6, font: f.helvNegrita });

  // ---- En el centro: cómo se marca, y la letra del modelo ----
  const insX = 228, insY = A4.alto - 52, insAncho = 86, insAlto = 44;
  p.drawRectangle({ x: insX, y: insY - insAlto, width: insAncho, height: insAlto, color: BLANCO, borderColor: GRIS, borderWidth: 0.5, borderDashArray: [2, 2] });
  p.drawRectangle({ x: insX + insAncho * 0.46, y: insY - 13, width: insAncho * 0.5, height: 10, color: ROJO });
  centrado(p, 'INSTRUCCIONES', insY - 7, f.helvNegrita, 3.6, BLANCO, insX + insAncho * 0.46, insX + insAncho * 0.96);
  centrado(p, 'DE MARCADO', insY - 11.4, f.helvNegrita, 3.6, BLANCO, insX + insAncho * 0.46, insX + insAncho * 0.96);
  p.drawText('marque así', { x: insX + 6, y: insY - 24, size: 4.2, font: f.helv });
  burbuja(p, insX + 18, insY - 33, 'A', f, true, 5, 3.6);
  p.drawText('así no marque', { x: insX + insAncho * 0.48, y: insY - 24, size: 4.2, font: f.helv });
  [0, 1, 2].forEach((k) => {
    const cx = insX + insAncho * 0.56 + k * 13, cy = insY - 33;
    burbuja(p, cx, cy, '', f, false, 5, 3.6);
    if (k === 0) p.drawLine({ start: { x: cx - 4, y: cy - 3 }, end: { x: cx + 4, y: cy + 3 }, thickness: 0.8 });
    if (k === 1) { p.drawLine({ start: { x: cx - 3, y: cy - 3 }, end: { x: cx + 3, y: cy + 3 }, thickness: 0.8 }); p.drawLine({ start: { x: cx - 3, y: cy + 3 }, end: { x: cx + 3, y: cy - 3 }, thickness: 0.8 }); }
    if (k === 2) p.drawCircle({ x: cx, y: cy, size: 1.4, color: NEGRO });
  });
  p.drawText('Cumplimente el cuestionario solo', { x: insX, y: insY - insAlto - 8, size: 4.7, font: f.helvNegrita });
  p.drawText('con lápiz o bolígrafo azul / negro', { x: insX, y: insY - insAlto - 14, size: 4.7, font: f.helvNegrita });
  const modX = insX + 4, modY = insY - insAlto - 22, modLado = 76, modAlto = 50;
  p.drawRectangle({ x: modX, y: modY - modAlto, width: modLado, height: modAlto, color: MARINO });
  const letra = textoImprimible(d.modelo, f.helvNegrita).slice(0, 1).toUpperCase() || 'A';
  centrado(p, letra, modY - modAlto + 9, f.helvNegrita, 44, BLANCO, modX, modX + modLado);

  // ---- A la derecha: el DNI en círculos ----
  rejillaDni(p, f, 398, A4.alto - 44, der - 398, 124);

  if (resuelta) {
    p.drawRectangle({ x: izq, y: A4.alto - 196, width: 178, height: 15, color: NEGRO });
    centrado(p, 'PLANTILLA DE CORRECCIÓN', A4.alto - 192, f.helvNegrita, 8.6, BLANCO, izq, izq + 178);
  }

  // ---- Las dos zonas ----
  const yZonas = A4.alto - 206, altoZonas = yZonas - 46;
  const anchoZ1 = 196;
  const respuestas = resuelta
    ? Array.from({ length: PREGUNTAS_POR_ZONA }, (_, k) => (k < d.preguntas.length ? d.preguntas[k].correcta : null))
    : null;
  zona(p, f, 'ZONA 1', izq, yZonas, anchoZ1, altoZonas, 3, respuestas, false);
  zona(p, f, 'ZONA 2', izq + anchoZ1 + 8, yZonas, der - (izq + anchoZ1 + 8), altoZonas, 5, null, true);

  // ---- El borde: la línea de corte y las marcas de la lectora ----
  p.drawText('Separe CUIDADOSAMENTE el original por esta línea de corte', {
    x: izq - 12, y: 250, size: 8.2, font: f.helvNegrita, color: ROJO, rotate: degrees(90),
  });
  for (let k = 0; k < 62; k++) {
    p.drawRectangle({ x: A4.ancho - 34, y: 44 + k * 11.6, width: 15, height: 5, color: NEGRO });
  }
  [0, 1, 3, 4, 5, 6, 8, 9].forEach((k) => p.drawRectangle({ x: A4.ancho - 48, y: A4.alto - 98 - k * 11.6, width: 8, height: 3.6, color: k === 0 ? ROJO : NEGRO }));

  p.drawLine({ start: { x: izq + 40, y: 36 }, end: { x: der, y: 36 }, thickness: 1.2, color: NEGRO });
  centrado(p, PIE, 22, f.helv, 6.2, GRIS);

  return pdf.save();
}
