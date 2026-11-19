/**
 * DOCUMENTOS COMPARTIDOS DE LOS ADMIN (regla 134): lo que se acepta y cómo se
 * llama.
 *
 * Una Server Action es un endpoint público (regla 1) y el archivo lo elige el
 * usuario: se valida AQUÍ, en el servidor, lo que dice ser (extensión), lo que
 * pesa y lo que lleva dentro (los primeros bytes), nunca lo que diga el
 * navegador. Módulo PURO (regla 21).
 */

/** Lo que cabe en una petición de Server Action (`next.config.ts`: 10 MB) con margen. */
export const MAX_BYTES_DOCUMENTO = 9 * 1024 * 1024;
export const MAX_NOMBRE_DOCUMENTO = 120;
export const MAX_NOMBRE_CARPETA = 60;
/** Documentos que sube cada petición (el navegador los manda de uno en uno). */
export const MAX_DOCUMENTOS_POR_CARPETA = 500;

type Firma = 'pdf' | 'png' | 'jpg' | 'webp' | 'zip' | 'ole' | 'texto' | 'svg';

/** Formatos aceptados: su tipo MIME y la firma que tiene que llevar dentro. */
export const FORMATOS: Record<string, { mime: string; firma: Firma; imagen: boolean }> = {
  pdf: { mime: 'application/pdf', firma: 'pdf', imagen: false },
  png: { mime: 'image/png', firma: 'png', imagen: true },
  jpg: { mime: 'image/jpeg', firma: 'jpg', imagen: true },
  jpeg: { mime: 'image/jpeg', firma: 'jpg', imagen: true },
  webp: { mime: 'image/webp', firma: 'webp', imagen: true },
  svg: { mime: 'image/svg+xml', firma: 'svg', imagen: true },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', firma: 'zip', imagen: false },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', firma: 'zip', imagen: false },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', firma: 'zip', imagen: false },
  doc: { mime: 'application/msword', firma: 'ole', imagen: false },
  xls: { mime: 'application/vnd.ms-excel', firma: 'ole', imagen: false },
  ppt: { mime: 'application/vnd.ms-powerpoint', firma: 'ole', imagen: false },
  csv: { mime: 'text/csv', firma: 'texto', imagen: false },
  txt: { mime: 'text/plain', firma: 'texto', imagen: false },
};

export const LISTA_FORMATOS = 'PDF, Word, Excel, PowerPoint, imágenes (PNG, JPG, WebP, SVG), CSV y TXT';
export const ACEPTA_INPUT = Object.keys(FORMATOS).map((e) => `.${e}`).join(',');

/** La extensión en minúsculas, sin punto (`''` si no hay). */
export function extensionDe(nombre: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nombre.trim());
  return m ? m[1].toLowerCase() : '';
}

/**
 * El nombre tal como se enseña: sin carpetas (`C:\x\logo.png` → `logo.png`),
 * sin caracteres de control ni NUL (regla 71), sin espacios de más y con tope.
 * Conserva la extensión al recortar. Vacío → `documento`.
 */
export function limpiaNombre(nombre: unknown): string {
  let n = typeof nombre === 'string' ? nombre : '';
  n = n.replace(/\0/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ');
  n = n.split(/[\\/]/).pop() ?? '';
  n = n.replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!n) return 'documento';
  if (n.length > MAX_NOMBRE_DOCUMENTO) {
    const ext = extensionDe(n);
    const sufijo = ext ? `.${ext}` : '';
    n = n.slice(0, MAX_NOMBRE_DOCUMENTO - sufijo.length - 1).trimEnd() + '…' + sufijo;
  }
  return n;
}

/** El nombre de una carpeta, o `null` si no vale. */
export function nombreCarpeta(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v.replace(/\0/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  return n.length >= 1 && n.length <= MAX_NOMBRE_CARPETA ? n : null;
}

const empieza = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);
const ascii = (b: Uint8Array, desde: number, txt: string) => [...txt].every((c, i) => b[desde + i] === c.charCodeAt(0));

/** ¿Lleva dentro lo que su extensión dice? Solo los primeros bytes. */
export function firmaCorrecta(firma: Firma, b: Uint8Array): boolean {
  switch (firma) {
    case 'pdf': return ascii(b, 0, '%PDF');
    case 'png': return empieza(b, 0x89, 0x50, 0x4e, 0x47);
    case 'jpg': return empieza(b, 0xff, 0xd8, 0xff);
    case 'webp': return ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP');
    case 'zip': return empieza(b, 0x50, 0x4b, 0x03, 0x04);
    case 'ole': return empieza(b, 0xd0, 0xcf, 0x11, 0xe0);
    case 'texto': return !b.slice(0, 4096).includes(0);
    case 'svg': return !b.slice(0, 4096).includes(0) && /<svg[\s>]/i.test(new TextDecoder().decode(b.slice(0, 4096)));
  }
}

export type ArchivoValido = { ok: true; ext: string; mime: string; nombre: string } | { ok: false; error: string };

/** Lo que se sabe SIN leer el archivo: extensión permitida y tamaño. Se mira antes de traerlo entero. */
export function validaPrevia(p: { nombre: unknown; tamano: number }): ArchivoValido {
  const nombre = limpiaNombre(p.nombre);
  const ext = extensionDe(nombre);
  const formato = FORMATOS[ext];
  if (!formato) return { ok: false, error: `Ese formato no se admite. Se aceptan: ${LISTA_FORMATOS}.` };
  if (!Number.isFinite(p.tamano) || p.tamano <= 0) return { ok: false, error: 'El archivo está vacío.' };
  if (p.tamano > MAX_BYTES_DOCUMENTO) return { ok: false, error: `Pesa demasiado: el máximo es ${etiquetaTamano(MAX_BYTES_DOCUMENTO)}.` };
  return { ok: true, ext, mime: formato.mime, nombre };
}

/** Valida un archivo subido: extensión permitida, tamaño y que el contenido sea de verdad de ese tipo. */
export function validaArchivo(p: { nombre: unknown; tamano: number; bytes: Uint8Array }): ArchivoValido {
  const previa = validaPrevia(p);
  if (!previa.ok) return previa;
  if (!firmaCorrecta(FORMATOS[previa.ext].firma, p.bytes)) return { ok: false, error: 'El contenido no coincide con el tipo de archivo. Comprueba que no esté dañado.' };
  return previa;
}

/** «2,4 MB», «310 KB». */
export function etiquetaTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** ¿Es una imagen que se puede enseñar en miniatura? */
export const esImagen = (ext: string) => FORMATOS[ext]?.imagen === true;
