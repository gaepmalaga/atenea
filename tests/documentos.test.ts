import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  limpiaNombre, extensionDe, nombreCarpeta, validaArchivo, validaPrevia, etiquetaTamano, esImagen, MAX_BYTES_DOCUMENTO, FORMATOS,
} from '../app/lib/documentos';

/** Regla 134 · Documentos compartidos de los admin. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => quita(readFileSync(join(__dirname, '..', ruta), 'utf-8').replace(/\r\n/g, '\n'));
const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(64).fill(0x20)]);
const texto = (t: string) => new TextEncoder().encode(t);

describe('el nombre de un documento', () => {
  it('quita carpetas, caracteres de control y NUL (regla 71)', () => {
    expect(limpiaNombre('C:\\Users\\x\\logo.png')).toBe('logo.png');
    expect(limpiaNombre('../../etc/passwd')).toBe('passwd');
    expect(limpiaNombre('a\0b\nc.pdf')).toBe('ab c.pdf');
    expect(limpiaNombre('   ')).toBe('documento');
    expect(limpiaNombre(null)).toBe('documento');
    expect(limpiaNombre('.htaccess')).toBe('htaccess');
  });
  it('recorta sin perder la extensión', () => {
    const n = limpiaNombre('x'.repeat(300) + '.pdf');
    expect(n.length).toBeLessThanOrEqual(120);
    expect(n.endsWith('.pdf')).toBe(true);
  });
  it('la extensión sale en minúsculas', () => {
    expect(extensionDe('Logo.PNG')).toBe('png');
    expect(extensionDe('sin_extension')).toBe('');
  });
  it('el nombre de una carpeta: 1 a 60 letras, sin barras', () => {
    expect(nombreCarpeta('  Marca y logos ')).toBe('Marca y logos');
    expect(nombreCarpeta('a/b')).toBe('a b');
    expect(nombreCarpeta('')).toBeNull();
    expect(nombreCarpeta('x'.repeat(61))).toBeNull();
    expect(nombreCarpeta(5)).toBeNull();
  });
});

describe('qué archivos se aceptan', () => {
  it('acepta lo que lleva dentro lo que dice su extensión', () => {
    expect(validaArchivo({ nombre: 'a.pdf', tamano: 100, bytes: texto('%PDF-1.7') }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'a.png', tamano: 100, bytes: bytes(0x89, 0x50, 0x4e, 0x47) }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'a.JPG', tamano: 100, bytes: bytes(0xff, 0xd8, 0xff) }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'a.docx', tamano: 100, bytes: bytes(0x50, 0x4b, 0x03, 0x04) }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'a.xls', tamano: 100, bytes: bytes(0xd0, 0xcf, 0x11, 0xe0) }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'a.csv', tamano: 100, bytes: texto('a,b\n1,2') }).ok).toBe(true);
    expect(validaArchivo({ nombre: 'logo.svg', tamano: 100, bytes: texto('<svg xmlns="x"></svg>') }).ok).toBe(true);
  });
  it('rechaza un ejecutable que se hace pasar por PDF (la extensión no basta)', () => {
    const r = validaArchivo({ nombre: 'factura.pdf', tamano: 100, bytes: texto('MZ\x90\x00 programa') });
    expect(r.ok).toBe(false);
  });
  it('rechaza formatos que no están en la lista', () => {
    for (const n of ['virus.exe', 'script.js', 'web.html', 'pagina.htm', 'a.sh', 'a.zip', 'sin_extension']) {
      expect(validaPrevia({ nombre: n, tamano: 100 }).ok).toBe(false);
    }
  });
  it('rechaza lo vacío y lo que pesa más del tope', () => {
    expect(validaPrevia({ nombre: 'a.pdf', tamano: 0 }).ok).toBe(false);
    expect(validaPrevia({ nombre: 'a.pdf', tamano: MAX_BYTES_DOCUMENTO + 1 }).ok).toBe(false);
    expect(validaPrevia({ nombre: 'a.pdf', tamano: MAX_BYTES_DOCUMENTO }).ok).toBe(true);
  });
  it('un «txt» o un «svg» con bytes de programa (NUL) no vale', () => {
    expect(validaArchivo({ nombre: 'a.txt', tamano: 10, bytes: new Uint8Array([65, 0, 66]) }).ok).toBe(false);
    expect(validaArchivo({ nombre: 'a.svg', tamano: 10, bytes: texto('<html><script>') }).ok).toBe(false);
  });
  it('solo las imágenes llevan miniatura; no se admite html ni nada que se ejecute', () => {
    expect(esImagen('png')).toBe(true);
    expect(esImagen('pdf')).toBe(false);
    for (const e of Object.keys(FORMATOS)) expect(['html', 'htm', 'js', 'exe', 'zip', 'sh', 'bat']).not.toContain(e);
  });
  it('el tamaño se escribe en castellano', () => {
    expect(etiquetaTamano(500)).toBe('500 B');
    expect(etiquetaTamano(310 * 1024)).toBe('310 KB');
    expect(etiquetaTamano(2.4 * 1024 * 1024)).toBe('2,4 MB');
  });
});

describe('seguridad de las acciones', () => {
  const src = lee('app/actions/documentos.ts');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('export async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };
  const ACCIONES = ['getDocumentos', 'crearCarpetaDocs', 'renombrarCarpetaDocs', 'borrarCarpetaDocs', 'subirDocumento', 'renombrarDocumento', 'borrarDocumento', 'urlDocumento'];
  it('cada acción exige admin', () => {
    for (const f of ACCIONES) expect(cuerpo(f), f).toContain('requireAdmin()');
  });
  it('cada acción acota por academia dentro de la consulta (o la fija al crear)', () => {
    for (const f of ACCIONES) expect(cuerpo(f), f).toMatch(/\.eq\('organization_id', org\)|organization_id: org/);
  });
  it('lo que lee, cambia o borra una fila se acota con .eq(organization_id), no solo con el id', () => {
    for (const f of ['renombrarCarpetaDocs', 'borrarCarpetaDocs', 'renombrarDocumento', 'borrarDocumento', 'urlDocumento']) {
      expect(cuerpo(f), f).toMatch(/\.eq\('organization_id', org\)/);
    }
  });
  it('subir valida en el servidor y el nombre del fichero lo genera el servidor, no el usuario', () => {
    const c = cuerpo('subirDocumento');
    expect(c).toContain('validaPrevia(');
    expect(c).toContain('validaArchivo(');
    expect(c).toMatch(/const ruta = `\$\{org\}\/\$\{carpetaId\}\/\$\{randomUUID\(\)\}\.\$\{v\.ext\}`/);
    expect(c).not.toMatch(/ruta = [^;]*archivo\.name/);
  });
  it('la descarga es una URL firmada corta y de descarga forzada', () => {
    const c = cuerpo('urlDocumento');
    expect(c).toMatch(/createSignedUrl\([^)]*,\s*120,\s*\{ download:/);
  });
  it('borrar una carpeta solo si está vacía, y todo lo que borra o sube queda en «Logs»', () => {
    expect(cuerpo('borrarCarpetaDocs')).toContain('no está vacía');
    for (const f of ['subirDocumento', 'borrarDocumento', 'crearCarpetaDocs', 'borrarCarpetaDocs']) expect(cuerpo(f), f).toContain('registraAccion(');
  });
  it('al navegador no viaja el mensaje de la base de datos (regla 108)', () => {
    expect(src).not.toMatch(/error: [a-z]+\.message/);
  });
  it('el guion SQL deja las tablas con RLS y sin políticas, y el depósito privado', () => {
    const sql = readFileSync(join(__dirname, '..', 'docs/sql/documentos.sql'), 'utf-8');
    expect(sql).toContain('alter table public.document_folders enable row level security');
    expect(sql).toContain('alter table public.admin_documents enable row level security');
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/values \('documentos', 'documentos', false,/);
  });
  it('la pestaña existe en el panel y limpieza conoce las dos tablas', () => {
    expect(lee('app/components/Admin/AdminView.tsx')).toContain("id: 'documents'");
    const lim = lee('app/lib/limpieza.ts');
    expect(lim).toContain("'admin_documents'");
    expect(lim).toContain("'document_folders'");
  });
});
