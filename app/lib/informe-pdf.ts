/**
 * EL INFORME SEMANAL EN PDF (regla 116).
 *
 * Una hoja (o las que hagan falta) para llevar a la reunión o mandar al dueño:
 * el pulso de la semana y la lista de alumnos, primero a quién hay que llamar,
 * cada uno con su motivo. Mismo generador y misma marca que los exámenes.
 *
 * Módulo puro (regla 21): datos e imágenes dentro, bytes fuera.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { A4, partirEnLineas, textoImprimible } from './examen-pdf';
import { tituloSemana, type InformeSemanal, type NivelRiesgo } from './informe-semanal';

const MARINO = rgb(0.078, 0.161, 0.353);
const GRIS = rgb(0.38, 0.38, 0.38);
const LINEA = rgb(0.82, 0.82, 0.82);
const COLOR_RIESGO: Record<NivelRiesgo, ReturnType<typeof rgb>> = {
  alto: rgb(0.78, 0.1, 0.1), medio: rgb(0.75, 0.45, 0.02), bajo: rgb(0.05, 0.5, 0.25),
};
const ETIQUETA_RIESGO: Record<NivelRiesgo, string> = { alto: 'LLAMAR', medio: 'VIGILAR', bajo: 'BIEN' };

const M = 46;

export async function pdfInforme(informe: InformeSemanal, academia: string, logotipo: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Informe semanal · ${tituloSemana(informe.semana)}`);
  pdf.setAuthor(academia);
  const [normal, negrita, logo] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedPng(logotipo),
  ]);
  const t = (s: string, f: PDFFont = normal) => textoImprimible(s, f);

  let p!: PDFPage;
  let y = 0;
  let pagina = 0;

  const nuevaPagina = () => {
    p = pdf.addPage([A4.ancho, A4.alto]);
    pagina++;
    // La placa marina con el logotipo, arriba a la derecha.
    const ancho = 104, alto = ancho * 0.32;
    p.drawRectangle({ x: A4.ancho - M - ancho, y: A4.alto - 34 - alto, width: ancho, height: alto, color: MARINO });
    const w = ancho * 0.84, h = (w * logo.height) / logo.width;
    p.drawImage(logo, { x: A4.ancho - M - ancho + (ancho - w) / 2, y: A4.alto - 34 - alto + (alto - h) / 2, width: w, height: h });
    p.drawText('INFORME SEMANAL', { x: M, y: A4.alto - 50, size: 9, font: negrita, color: GRIS });
    p.drawText(t(tituloSemana(informe.semana) + (informe.enCurso ? ' (en curso)' : ''), negrita), { x: M, y: A4.alto - 70, size: 17, font: negrita, color: MARINO });
    p.drawLine({ start: { x: M, y: A4.alto - 82 }, end: { x: A4.ancho - M, y: A4.alto - 82 }, thickness: 0.8, color: MARINO });
    p.drawText(`${t(academia)} · página ${pagina}`, { x: M, y: 26, size: 7, font: normal, color: GRIS });
    y = A4.alto - 104;
  };
  nuevaPagina();

  // ---- El pulso de la semana ----
  const a = informe.academia;
  const cifras: [string, string][] = [
    [`${a.activos} de ${a.alumnos}`, 'han entrenado'],
    [String(a.contestadas), a.contestadasAnterior ? `preguntas (antes, ${a.contestadasAnterior})` : 'preguntas'],
    [a.acierto === null ? '—' : `${a.acierto} %`, 'de acierto'],
    [String(a.riesgoAlto), 'para llamar'],
    [String(a.riesgoMedio), 'para vigilar'],
  ];
  const anchoCifra = (A4.ancho - 2 * M) / cifras.length;
  cifras.forEach(([valor, etiqueta], k) => {
    const x = M + k * anchoCifra;
    p.drawText(valor, { x, y: y - 14, size: 17, font: negrita, color: k === 3 && a.riesgoAlto ? COLOR_RIESGO.alto : MARINO });
    p.drawText(t(etiqueta), { x, y: y - 27, size: 7.4, font: normal, color: GRIS });
  });
  y -= 48;

  // ---- La tabla ----
  const cols = { nombre: M, preguntas: M + 196, acierto: M + 262, dias: M + 312, estado: M + 352 };
  const cabecera = () => {
    p.drawRectangle({ x: M, y: y - 14, width: A4.ancho - 2 * M, height: 16, color: rgb(0.94, 0.94, 0.95) });
    const c = (texto: string, x: number) => p.drawText(texto, { x: x + 3, y: y - 10, size: 6.6, font: negrita, color: GRIS });
    c('ALUMNO', cols.nombre); c('PREGUNTAS', cols.preguntas); c('ACIERTO', cols.acierto); c('DÍAS', cols.dias); c('ESTADO Y MOTIVO', cols.estado);
    y -= 18;
  };
  cabecera();

  const anchoMotivo = A4.ancho - M - cols.estado - 46;
  for (const f of informe.filas) {
    const motivo = f.riesgo.motivos.length ? f.riesgo.motivos.join(' · ') : 'Sin señales';
    const lineas = partirEnLineas(t(motivo), normal, 7, anchoMotivo);
    const alto = Math.max(22, 8 + lineas.length * 8.6);
    if (y - alto < 46) { nuevaPagina(); cabecera(); }

    const nombre = partirEnLineas(t(f.nombre, negrita), negrita, 8.4, 188)[0] ?? '';
    p.drawText(nombre, { x: cols.nombre + 3, y: y - 9, size: 8.4, font: negrita });
    if (f.email) p.drawText((partirEnLineas(t(f.email), normal, 6.2, 188)[0] ?? ''), { x: cols.nombre + 3, y: y - 17, size: 6.2, font: normal, color: GRIS });
    p.drawText(String(f.contestadas), { x: cols.preguntas + 3, y: y - 9, size: 8.4, font: negrita });
    p.drawText(`antes ${f.anteriores}`, { x: cols.preguntas + 3, y: y - 17, size: 6.2, font: normal, color: GRIS });
    p.drawText(f.acierto === null ? '—' : `${f.acierto} %`, { x: cols.acierto + 3, y: y - 9, size: 8.4, font: normal });
    p.drawText(String(f.diasActivos), { x: cols.dias + 3, y: y - 9, size: 8.4, font: normal });
    p.drawText(ETIQUETA_RIESGO[f.riesgo.nivel], { x: cols.estado + 3, y: y - 9, size: 6.8, font: negrita, color: COLOR_RIESGO[f.riesgo.nivel] });
    lineas.forEach((l, k) => p.drawText(l, { x: cols.estado + 46, y: y - 9 - k * 8.6, size: 7, font: normal, color: f.riesgo.nivel === 'bajo' ? GRIS : rgb(0.1, 0.1, 0.1) }));
    y -= alto;
    p.drawLine({ start: { x: M, y: y + 3 }, end: { x: A4.ancho - M, y: y + 3 }, thickness: 0.3, color: LINEA });
  }

  return pdf.save();
}
