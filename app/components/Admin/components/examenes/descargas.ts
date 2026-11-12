import type { DatosExamen, ImagenesExamen } from '@/app/lib/examen-pdf';
import type { PreguntaGuardada } from '@/app/lib/examen-clase';

/**
 * Bajar los tres PDF de un examen (regla 115). El generador pesa, y quien entra
 * a mirar otra pestaña no tiene por qué descargárselo (regla 113): se carga
 * solo aquí, al descargar.
 */

export type TipoPdf = 'cuestionario' | 'hoja' | 'plantilla';

async function bytes(ruta: string): Promise<Uint8Array> {
  const r = await fetch(ruta);
  if (!r.ok) throw new Error(`No se ha podido cargar ${ruta}.`);
  return new Uint8Array(await r.arrayBuffer());
}

function guarda(nombre: string, datos: Uint8Array) {
  const url = URL.createObjectURL(new Blob([datos as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const nombreFichero = (titulo: string, que: string) =>
  `${que}-${titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'examen'}.pdf`;

export async function bajaPdf(que: TipoPdf, datos: DatosExamen): Promise<void> {
  const [pdf, escudo, logotipo, isotipo] = await Promise.all([
    import('@/app/lib/examen-pdf'),
    bytes('/examen/escudo-policia.png'),
    bytes('/examen/alphapol-logotipo.png'),
    bytes('/examen/alphapol-isotipo.png'),
  ]);
  const img: ImagenesExamen = { escudo, logotipo, isotipo };
  if (que === 'cuestionario') guarda(nombreFichero(datos.titulo, 'cuestionario'), await pdf.pdfCuestionario(datos, img));
  if (que === 'hoja') guarda(nombreFichero(datos.titulo, 'hoja-de-respuestas'), await pdf.pdfHojaRespuestas(datos, img));
  if (que === 'plantilla') guarda(nombreFichero(datos.titulo, 'plantilla-de-correccion'), await pdf.pdfHojaRespuestas(datos, img, { resuelta: true }));
}

/** Un examen guardado, en la forma que piden los PDF. */
export function datosDeGuardado(e: { titulo: string; modelo: string; minutos: number }, preguntas: PreguntaGuardada[], fecha?: string | null): DatosExamen {
  return {
    titulo: e.titulo, modelo: e.modelo, minutos: e.minutos, fecha: fecha ?? null,
    preguntas: preguntas.map((p) => ({ enunciado: p.q, opciones: p.o, correcta: p.c })),
  };
}
