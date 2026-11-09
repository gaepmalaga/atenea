/**
 * LA IMAGEN DEL CUADRANTE (regla 96).
 *
 * Alphapol manda cada semana una imagen por WhatsApp con el cuadrante. Aquí se
 * dibuja la misma, en el navegador, desde los datos de la rejilla: un lienzo
 * marino con el título en oro, una columna por día, cada grupo con su color y
 * lo que toca con su profesor, y al pie los turnos. Se descarga como PNG o, en
 * el móvil, se abre la hoja de compartir (WhatsApp incluido).
 *
 * Solo corre en el navegador (usa `document` y `canvas`). Los colores y los
 * nombres salen de `app/lib/cuadrante.ts` y `app/lib/marca.ts`.
 */

import { MARCA } from '@/app/lib/marca';
import { colorDeGrupo, ETIQUETA_TURNO, nombrePila, type Cuadrante } from '@/app/lib/cuadrante';
import { diaSemanaDe } from '@/app/lib/asistencia';

const ANCHO = 1600;
const MARGEN = 36;
const HUECO = 18;
const ALTO_CABECERA = 200;
const ALTO_TITULO_DIA = 64;
const ALTO_FILA = 112;
const HUECO_FILA = 12;
const ALTO_PIE = 150;
const FUENTE = '"Arial Narrow", "Helvetica Neue", Arial, sans-serif';

/** El color de la cabecera de cada día de la semana (1 = lunes), como en la imagen de Alphapol. */
const COLOR_DIA: Record<number, { fondo: string; texto: string }> = {
  1: { fondo: '#fbbf24', texto: '#14295a' },
  2: { fondo: '#2563eb', texto: '#ffffff' },
  3: { fondo: '#2563eb', texto: '#ffffff' },
  4: { fondo: '#16a34a', texto: '#ffffff' },
  5: { fondo: '#7c3aed', texto: '#ffffff' },
  6: { fondo: '#db2777', texto: '#ffffff' },
  7: { fondo: '#0d9488', texto: '#ffffff' },
};

type Ctx = CanvasRenderingContext2D;

function caja(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, relleno: string, borde?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = relleno;
  ctx.fill();
  if (borde) {
    ctx.strokeStyle = borde;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** Escribe un texto reduciendo la letra hasta que quepa; si aun así no cabe, lo corta con «…». */
function textoAjustado(ctx: Ctx, texto: string, x: number, y: number, ancho: number, tam: number, peso: string, color: string, alinea: CanvasTextAlign = 'center') {
  let t = tam;
  ctx.font = `${peso} ${t}px ${FUENTE}`;
  while (ctx.measureText(texto).width > ancho && t > 16) {
    t -= 1;
    ctx.font = `${peso} ${t}px ${FUENTE}`;
  }
  let salida = texto;
  while (ctx.measureText(salida).width > ancho && salida.length > 1) salida = `${salida.slice(0, -2)}…`;
  ctx.fillStyle = color;
  ctx.textAlign = alinea;
  ctx.textBaseline = 'middle';
  ctx.fillText(salida, x, y);
}

export function dibujaCuadrante(c: Cuadrante): HTMLCanvasElement {
  const columnas = Math.max(1, c.dias.length);
  const filasMax = Math.max(1, ...c.dias.map((d) => d.filas.length));
  const altoColumna = ALTO_TITULO_DIA + 14 + filasMax * (ALTO_FILA + HUECO_FILA);
  const alto = ALTO_CABECERA + altoColumna + ALTO_PIE;

  const canvas = document.createElement('canvas');
  canvas.width = ANCHO;
  canvas.height = alto;
  const ctx = canvas.getContext('2d')!;

  // Fondo marino con un degradado suave.
  const fondo = ctx.createLinearGradient(0, 0, ANCHO, alto);
  fondo.addColorStop(0, '#0b1530');
  fondo.addColorStop(1, MARCA.colores.marino);
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ANCHO, alto);

  // Título en oro.
  ctx.save();
  ctx.translate(MARGEN + 8, 84);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  caja(ctx, -10, -58, 760, 104, 10, MARCA.colores.dorado);
  textoAjustado(ctx, 'CUADRANTE SEMANAL', 360, -4, 720, 78, '900', '#0b1530');
  ctx.restore();
  textoAjustado(ctx, c.rango.toUpperCase(), MARGEN + 20, 160, 760, 40, '800', '#ffffff', 'left');

  // La marca, a la derecha.
  textoAjustado(ctx, MARCA.nombre.toUpperCase().split('').join(' '), ANCHO - MARGEN - 20, 70, 560, 48, '800', '#ffffff', 'right');
  textoAjustado(ctx, 'ACADEMIA POLICÍA NACIONAL', ANCHO - MARGEN - 20, 116, 560, 24, '600', MARCA.colores.doradoClaro, 'right');

  // Una columna por día.
  const anchoCol = (ANCHO - MARGEN * 2 - HUECO * (columnas - 1)) / columnas;
  c.dias.forEach((d, i) => {
    const x = MARGEN + i * (anchoCol + HUECO);
    const y = ALTO_CABECERA;
    caja(ctx, x, y, anchoCol, altoColumna, 18, '#f8fafc');
    const color = COLOR_DIA[diaSemanaDe(d.fecha)] ?? COLOR_DIA[2];
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, anchoCol, ALTO_TITULO_DIA, [18, 18, 0, 0]);
    ctx.fillStyle = color.fondo;
    ctx.fill();
    ctx.restore();
    textoAjustado(ctx, d.titulo, x + anchoCol / 2, y + ALTO_TITULO_DIA / 2, anchoCol - 24, 38, '900', color.texto);

    d.filas.forEach((f, j) => {
      const fy = y + ALTO_TITULO_DIA + 14 + j * (ALTO_FILA + HUECO_FILA);
      const etiquetaAncho = Math.min(170, anchoCol * 0.42);
      const col = colorDeGrupo(f.grupo.corto);
      caja(ctx, x + 10, fy, etiquetaAncho, ALTO_FILA, 14, col.fondo);
      textoAjustado(ctx, f.grupo.corto.toUpperCase(), x + 10 + etiquetaAncho / 2, fy + ALTO_FILA / 2, etiquetaAncho - 14, 40, 'italic 900', col.texto);

      const cx = x + 10 + etiquetaAncho + 8;
      const cw = anchoCol - etiquetaAncho - 28;
      caja(ctx, cx, fy, cw, ALTO_FILA, 14, '#ffffff', '#cbd5e1');
      if (!f.sesion) return;
      const quien = f.profesor ? `(${nombrePila(f.profesor.nombre)})` : '';
      if (f.horaRotulada) {
        textoAjustado(ctx, f.sesion.titulo, cx + cw / 2, fy + 34, cw - 16, 40, '900', '#0f172a');
        const hora = `${f.horaRotulada} h`;
        // La hora y el profesor comparten renglón: se reduce la letra hasta que quepan.
        let t = 24;
        let wh = 0;
        let wq = 0;
        for (; t >= 14; t -= 1) {
          ctx.font = `800 ${t}px ${FUENTE}`;
          wh = ctx.measureText(hora).width + 16;
          ctx.font = `600 ${t + 2}px ${FUENTE}`;
          wq = quien ? ctx.measureText(quien).width + 8 : 0;
          if (wh + wq <= cw - 16) break;
        }
        const x0 = cx + (cw - (wh + wq)) / 2;
        caja(ctx, x0, fy + 62, wh, 34, 8, '#fbbf24');
        textoAjustado(ctx, hora, x0 + wh / 2, fy + 79, wh, t, '800', '#0f172a');
        if (quien) textoAjustado(ctx, quien, x0 + wh + 8 + (wq - 8) / 2, fy + 79, wq, t + 2, '600', '#334155');
      } else {
        textoAjustado(ctx, f.sesion.titulo, cx + cw / 2, fy + (quien ? 42 : ALTO_FILA / 2), cw - 16, 42, '900', '#0f172a');
        if (quien) textoAjustado(ctx, quien, cx + cw / 2, fy + 82, cw - 16, 30, '600', '#334155');
      }
    });
  });

  // Pie: los turnos y el lema.
  const yPie = ALTO_CABECERA + altoColumna + 28;
  caja(ctx, MARGEN, yPie, ANCHO * 0.62, ALTO_PIE - 56, 16, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.25)');
  let xt = MARGEN + 24;
  const anchoTurno = (ANCHO * 0.62 - 48) / Math.max(1, c.turnos.length);
  for (const t of c.turnos) {
    textoAjustado(ctx, `${ETIQUETA_TURNO[t.id].toUpperCase()} · ${t.hora ?? ''}`, xt, yPie + 28, anchoTurno - 16, 28, '900', MARCA.colores.doradoClaro, 'left');
    textoAjustado(ctx, t.grupos.map((g) => g.toUpperCase()).join(', '), xt, yPie + 68, anchoTurno - 16, 26, '600', '#ffffff', 'left');
    xt += anchoTurno;
  }
  textoAjustado(ctx, '¡A POR ELLO!', ANCHO - MARGEN - 20, yPie + 34, 560, 60, 'italic 900', MARCA.colores.dorado, 'right');
  textoAjustado(ctx, 'DISCIPLINA  /  ESFUERZO  /  CONSTANCIA', ANCHO - MARGEN - 20, yPie + 84, 560, 24, '600', '#ffffff', 'right');
  return canvas;
}

const blobDe = (canvas: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));

/**
 * Entrega la imagen: en el móvil abre la hoja de compartir (ahí está WhatsApp);
 * donde no se puede compartir un fichero, la descarga.
 */
export async function entregaImagenCuadrante(c: Cuadrante, nombreFichero: string): Promise<'compartida' | 'descargada' | 'error'> {
  try {
    const blob = await blobDe(dibujaCuadrante(c));
    if (!blob) return 'error';
    const fichero = new File([blob], nombreFichero, { type: 'image/png' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [fichero] })) {
      try {
        await navigator.share({ files: [fichero], title: 'Cuadrante semanal' });
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
