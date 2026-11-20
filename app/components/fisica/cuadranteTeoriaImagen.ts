/**
 * LA IMAGEN DEL CUADRANTE DE TEORÍA (regla 142).
 *
 * Alphapol manda cada semana una imagen con el cuadrante de clases de teoría:
 * fondo claro, el título en marino, el rango de la semana en una pastilla, una
 * columna por día con su cabecera marina, las formaciones extras arriba (franja
 * amarilla) y cada clase en una tarjeta del color de su grupo, con su hora, el
 * tema y quién la da. Aquí se dibuja la misma, en el navegador, desde la rejilla
 * que arma `armaCuadranteTeoria`. Se descarga como PNG o, en el móvil, abre la
 * hoja de compartir (WhatsApp incluido).
 *
 * Solo corre en el navegador (usa `document` y `canvas`).
 */

import { MARCA } from '@/app/lib/marca';
import { textoProfesores, type CuadranteTeoria, type ClaseCuadranteTeoria } from '@/app/lib/cuadrante-teoria';
import { caja, textoAjustado, FUENTE, type Ctx } from './cuadranteImagen';

const ANCHO = 1600;
const MARGEN = 28;
const HUECO = 14;
const ALTO_CABECERA = 330;
const ALTO_TITULO_DIA = 62;
const ALTO_EXTRA = 86;
const ALTO_CLASE = 214;
const HUECO_FILA = 14;
const ALTO_PIE = 40;
const MARINO = '#14295a';

/** Un monigote sencillo (cabeza y hombros) para «quién la da». */
function persona(ctx: Ctx, x: number, y: number, t: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, t / 9);
  ctx.beginPath();
  ctx.arc(x, y - t * 0.22, t * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y + t * 0.5, t * 0.42, Math.PI, 0);
  ctx.stroke();
}

function dibujaClase(ctx: Ctx, k: ClaseCuadranteTeoria, x: number, y: number, w: number) {
  const c = k.color;
  caja(ctx, x, y, w, ALTO_CLASE, 18, k.sinPlanificar ? '#f1f5f9' : c.fondo, k.sinPlanificar ? '#cbd5e1' : c.borde);
  // La hora, en una pastilla del color del grupo.
  const pw = Math.min(w - 40, 250);
  caja(ctx, x + (w - pw) / 2, y + 14, pw, 42, 21, k.sinPlanificar ? '#94a3b8' : c.pastilla);
  textoAjustado(ctx, k.hora, x + w / 2, y + 35, pw - 20, 28, '800', '#ffffff');
  if (k.sinPlanificar) {
    textoAjustado(ctx, 'Por programar', x + w / 2, y + 128, w - 30, 38, '800', '#64748b');
    return;
  }
  const quien = textoProfesores(k.profesores);
  // Nota y tema, centrados: una o dos líneas.
  const lineas = [k.nota, k.tema].filter((l): l is string => !!l);
  if (!lineas.length) lineas.push('Sin tema');
  const y0 = lineas.length === 1 ? y + 108 : y + 96;
  lineas.forEach((l, i) => textoAjustado(ctx, l, x + w / 2, y0 + i * 42, w - 24, lineas.length === 1 ? 44 : 38, '900', MARINO));
  if (quien) {
    const yq = y + ALTO_CLASE - 28;
    ctx.font = `700 28px ${FUENTE}`;
    const ancho = Math.min(ctx.measureText(quien).width, w - 90);
    const x0 = x + w / 2 - (ancho + 40) / 2;
    persona(ctx, x0 + 14, yq, 26, '#334155');
    textoAjustado(ctx, quien, x0 + 40, yq, w - 90, 28, '700', '#334155', 'left');
  }
}

export function dibujaCuadranteTeoria(c: CuadranteTeoria): HTMLCanvasElement {
  const columnas = Math.max(1, c.dias.length);
  // Una fila por hora de inicio distinta de la semana: así las clases de la misma hora quedan alineadas.
  const horas = [...new Set(c.dias.flatMap((d) => d.clases.map((k) => k.inicio ?? '')))].sort();
  const filasExtra = Math.max(0, ...c.dias.map((d) => d.extras.length));
  const altoExtras = filasExtra ? filasExtra * (ALTO_EXTRA + 10) + 6 : 0;
  const altoClases = Math.max(1, horas.length) * (ALTO_CLASE + HUECO_FILA);
  const altoColumna = ALTO_TITULO_DIA + 16 + altoExtras + altoClases + 6;
  const alto = ALTO_CABECERA + altoColumna + ALTO_PIE;

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ANCHO, alto);

  // La marca, centrada.
  textoAjustado(ctx, MARCA.nombre.toUpperCase(), ANCHO / 2, 70, 700, 84, '900', MARINO);
  textoAjustado(ctx, 'C E N T R O   D E   F O R M A C I Ó N', ANCHO / 2, 128, 700, 26, '600', '#334155');
  // Título.
  textoAjustado(ctx, 'Cuadrante semanal de clases', ANCHO / 2, 200, ANCHO - 200, 84, '900', MARINO);
  // El rango, en una pastilla.
  ctx.font = `800 40px ${FUENTE}`;
  const pw = Math.min(ctx.measureText(c.rango).width + 120, ANCHO - 200);
  caja(ctx, (ANCHO - pw) / 2, 246, pw, 64, 32, '#ffffff', MARINO);
  textoAjustado(ctx, c.rango, ANCHO / 2, 279, pw - 60, 40, '800', MARINO);
  ctx.strokeStyle = MARINO;
  ctx.lineWidth = 2;
  for (const [a, b] of [[60, (ANCHO - pw) / 2 - 24], [(ANCHO + pw) / 2 + 24, ANCHO - 60]]) { ctx.beginPath(); ctx.moveTo(a, 278); ctx.lineTo(b, 278); ctx.stroke(); }

  // Una columna por día.
  const anchoCol = (ANCHO - MARGEN * 2 - HUECO * (columnas - 1)) / columnas;
  c.dias.forEach((d, i) => {
    const x = MARGEN + i * (anchoCol + HUECO);
    const y = ALTO_CABECERA;
    caja(ctx, x, y, anchoCol, altoColumna, 16, '#ffffff', '#cbd5e1');
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, anchoCol, ALTO_TITULO_DIA, [16, 16, 0, 0]);
    ctx.fillStyle = MARINO;
    ctx.fill();
    ctx.restore();
    textoAjustado(ctx, d.titulo, x + anchoCol / 2, y + ALTO_TITULO_DIA / 2, anchoCol - 24, 38, '900', '#ffffff');

    // Las formaciones extras, arriba.
    d.extras.forEach((e, j) => {
      const ey = y + ALTO_TITULO_DIA + 14 + j * (ALTO_EXTRA + 10);
      caja(ctx, x + 10, ey, anchoCol - 20, ALTO_EXTRA, 16, '#fef3c7', '#fcd34d');
      const quien = textoProfesores(e.profesores);
      textoAjustado(ctx, e.titulo, x + anchoCol / 2, ey + (quien || e.hora ? 30 : ALTO_EXTRA / 2), anchoCol - 40, 34, '800', '#451a03');
      const sub = [e.hora, quien ? `(${quien})` : null].filter(Boolean).join(' ');
      if (sub) textoAjustado(ctx, sub, x + anchoCol / 2, ey + 62, anchoCol - 40, 28, '600', '#78350f');
    });

    // Las clases, cada una en la fila de su hora.
    d.clases.forEach((k) => {
      const fila = Math.max(0, horas.indexOf(k.inicio ?? ''));
      dibujaClase(ctx, k, x + 10, y + ALTO_TITULO_DIA + 16 + altoExtras + fila * (ALTO_CLASE + HUECO_FILA), anchoCol - 20);
    });
  });
  return canvas;
}

const blobDe = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));

/**
 * Entrega la imagen: en el móvil abre la hoja de compartir (ahí está WhatsApp);
 * donde no se puede compartir un fichero, la descarga.
 */
export async function entregaImagenTeoria(c: CuadranteTeoria, nombreFichero: string): Promise<'compartida' | 'descargada' | 'error'> {
  try {
    const blob = await blobDe(dibujaCuadranteTeoria(c));
    if (!blob) return 'error';
    const fichero = new File([blob], nombreFichero, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [fichero] })) {
      try {
        await navigator.share({ files: [fichero], title: 'Cuadrante semanal de clases' });
        return 'compartida';
      } catch (e) {
        // Cerrar la hoja de compartir no es un fallo.
        if (e instanceof DOMException && e.name === 'AbortError') return 'compartida';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreFichero;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'descargada';
  } catch {
    return 'error';
  }
}
