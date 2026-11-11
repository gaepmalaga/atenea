import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { pdfCuestionario, pdfHojaRespuestas, numeroEnLetras, partirEnLineas, repartirEnPaginas, textoImprimible } from '../app/lib/examen-pdf';
import { pdfInforme } from '../app/lib/informe-pdf';
import { construyeInforme } from '../app/lib/informe-semanal';

/** Regla 115 · el examen en papel. */

const RAIZ = join(__dirname, '..');
const img = () => ({
  escudo: new Uint8Array(readFileSync(join(RAIZ, 'public/examen/escudo-policia.png'))),
  logotipo: new Uint8Array(readFileSync(join(RAIZ, 'public/examen/alphapol-logotipo.png'))),
  isotipo: new Uint8Array(readFileSync(join(RAIZ, 'public/examen/alphapol-isotipo.png'))),
});
const preguntas = (n: number) => Array.from({ length: n }, (_, i) => ({
  enunciado: `Pregunta ${i + 1}: ¿cuál de las siguientes afirmaciones sobre el artículo ${i + 1} es la correcta según la ley?`,
  opciones: ['Primera.', 'Segunda, algo más larga que las demás para que parta la línea al llegar al margen de la hoja.', 'Tercera.'],
  correcta: i % 3,
}));
const examen = (n = 100) => ({ titulo: 'Global número 1', modelo: 'A', minutos: 50, fecha: '25 de octubre de 2026', preguntas: preguntas(n) });

describe('el texto', () => {
  it('los minutos van en letras, como en el examen', () => {
    expect(numeroEnLetras(50)).toBe('CINCUENTA');
    expect(numeroEnLetras(45)).toBe('CUARENTA Y CINCO');
    expect(numeroEnLetras(25)).toBe('VEINTICINCO');
    expect(numeroEnLetras(100)).toBe('CIEN');
    expect(numeroEnLetras(120)).toBe('CIENTO VEINTE');
    expect(numeroEnLetras(500)).toBe('500');
  });

  it('un carácter que la fuente no tiene no tumba el PDF', async () => {
    const pdf = await PDFDocument.create();
    const fuente = await pdf.embedFont(StandardFonts.TimesRoman);
    expect(textoImprimible('A → B ≥ 3 ✓ «ñandú»', fuente)).toBe('A -> B >= 3 «ñandú»');
    expect(() => fuente.widthOfTextAtSize(textoImprimible('日本語 y emoji 🚓', fuente), 10)).not.toThrow();
  });

  it('las líneas no se salen del ancho, ni con una palabra larguísima', async () => {
    const pdf = await PDFDocument.create();
    const fuente = await pdf.embedFont(StandardFonts.TimesRoman);
    const lineas = partirEnLineas(`una frase normal y ${'x'.repeat(300)} otra más`, fuente, 10, 200);
    expect(lineas.length).toBeGreaterThan(3);
    for (const l of lineas) expect(fuente.widthOfTextAtSize(l, 10)).toBeLessThanOrEqual(200);
  });

  it('ninguna pregunta se parte entre dos páginas', () => {
    expect(repartirEnPaginas([40, 40, 40, 40], 100)).toEqual([[0, 1], [2, 3]]);
    expect(repartirEnPaginas([150], 100)).toEqual([[0]]);
    expect(repartirEnPaginas([], 100)).toEqual([]);
  });
});

describe('los tres documentos', () => {
  it('el cuestionario es un PDF con su portada y las preguntas', async () => {
    const bytes = await pdfCuestionario(examen(), img());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(5);
    expect(pdf.getTitle()).toBe('Cuestionario · Global número 1');
    expect(pdf.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it('la hoja de respuestas y la plantilla son una sola página', async () => {
    for (const resuelta of [false, true]) {
      const pdf = await PDFDocument.load(await pdfHojaRespuestas(examen(), img(), { resuelta }));
      expect(pdf.getPageCount()).toBe(1);
      expect(pdf.getTitle()).toBe(`${resuelta ? 'Plantilla de corrección' : 'Hoja de respuestas'} · Global número 1`);
    }
  });

  it('la plantilla no es la hoja en blanco: lleva las respuestas', async () => {
    const blanca = await pdfHojaRespuestas(examen(), img());
    const resuelta = await pdfHojaRespuestas(examen(), img(), { resuelta: true });
    expect(Buffer.compare(Buffer.from(blanca), Buffer.from(resuelta))).not.toBe(0);
  });

  it('aguanta un examen corto, uno vacío y un título imposible', async () => {
    await expect(pdfCuestionario(examen(25), img())).resolves.toBeInstanceOf(Uint8Array);
    await expect(pdfCuestionario({ ...examen(0) }, img())).resolves.toBeInstanceOf(Uint8Array);
    await expect(pdfHojaRespuestas({ ...examen(3), titulo: '→ ✓ 日本', modelo: '', fecha: null }, img(), { resuelta: true })).resolves.toBeInstanceOf(Uint8Array);
  });

  it('todos dicen que son un simulacro de la academia', () => {
    const src = readFileSync(join(RAIZ, 'app/lib/examen-pdf.ts'), 'utf-8');
    expect(src).toContain('no es un documento oficial');
    expect((src.match(/centrado\(p, PIE,/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('el informe semanal también sale en PDF', async () => {
    const informe = construyeInforme({
      hoy: '2026-11-11', semana: '2026-11-02',
      alumnos: Array.from({ length: 80 }, (_, i) => ({ id: `u${i}`, email: `alumno${i}@x.com`, nombre: `Alumno Número ${i}`, alta: '2026-06-01T10:00:00Z', faltas14: 0 })),
      filas: [],
    });
    const pdf = await PDFDocument.load(await pdfInforme(informe, 'Alphapol', img().logotipo));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});

describe('la acción', () => {
  const src = readFileSync(join(RAIZ, 'app/actions/exams.ts'), 'utf-8');
  const cuerpo = src.slice(src.indexOf('export async function getExamenImprimible'));
  it('lleva las respuestas: solo la academia, y de su banco (regla 75)', () => {
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo).not.toContain('requireUser()');
    expect(cuerpo).toContain('auth.user.organizationId');
  });
});
