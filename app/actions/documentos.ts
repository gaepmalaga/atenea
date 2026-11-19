'use server';

/**
 * DOCUMENTOS COMPARTIDOS DE LOS ADMIN (regla 134).
 *
 * Una carpeta dentro de la plataforma, solo para los admin de la academia:
 * carpetas con nombre y archivos con quién los subió y cuándo. Cualquier admin
 * puede subir, renombrar y borrar (decisión del dueño, 19 nov).
 *
 * Las tablas (`document_folders`, `admin_documents`) y el depósito PRIVADO
 * `documentos` de Storage no tienen políticas: solo la clave de servicio
 * (regla 34), y cada acción exige `requireAdmin()` y acota por academia DENTRO
 * de la consulta (regla 65). El fichero se valida en el servidor (extensión,
 * tamaño y firma, `app/lib/documentos.ts`) y se guarda con un nombre
 * generado: el del usuario es solo una etiqueta y nunca forma parte de la
 * ruta. La descarga es una URL firmada de pocos minutos, tras comprobar que el
 * documento es de su academia.
 *
 * `docs/sql/documentos.sql` crea las tablas y el depósito.
 */

import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from './core';
import { requireAdmin } from '../lib/auth';
import { fallo } from '../lib/fallos';
import { registraAccion } from '../lib/admin-audit';
import { paginaCompleta, type ResultadoPagina } from '../lib/pagination';
import {
  validaArchivo, validaPrevia, limpiaNombre, nombreCarpeta, esImagen, extensionDe, MAX_DOCUMENTOS_POR_CARPETA,
} from '../lib/documentos';

const CUBO = 'documentos';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
type Fila = Record<string, unknown>;

export type CarpetaDoc = { id: string; nombre: string; documentos: number };
export type DocumentoAdmin = {
  id: string; carpetaId: string; nombre: string; ext: string; tamano: number;
  subidoPor: string | null; fecha: string;
  /** Miniatura firmada (10 min) si es una imagen. */
  miniatura: string | null;
};

/** Las carpetas y los documentos de la academia, con miniaturas de las imágenes. */
export async function getDocumentos(): Promise<
  { success: true; carpetas: CarpetaDoc[]; documentos: DocumentoAdmin[] } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org) return { success: false as const, error: 'No hay una academia seleccionada.' };

  const [car, docs] = await Promise.all([
    supabaseAdmin.from('document_folders').select('id, name').eq('organization_id', org).order('name'),
    paginaCompleta<Fila>((d, h) => supabaseAdmin.from('admin_documents')
      .select('id, folder_id, name, storage_path, size_bytes, uploaded_email, created_at')
      .eq('organization_id', org).order('created_at', { ascending: false }).order('id').range(d, h) as unknown as Promise<ResultadoPagina<Fila>>),
  ]);
  if (car.error) return { success: false as const, error: fallo('getDocumentos', car.error) };
  if (docs.error) return { success: false as const, error: docs.error };

  // Miniaturas de las imágenes: URL firmadas de 10 minutos, en un solo viaje.
  const rutasImagen = docs.data.filter((d) => esImagen(extensionDe(d.name as string))).slice(0, 80).map((d) => d.storage_path as string);
  const firmadas = new Map<string, string>();
  if (rutasImagen.length) {
    const { data } = await supabaseAdmin.storage.from(CUBO).createSignedUrls(rutasImagen, 600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }

  const documentos: DocumentoAdmin[] = docs.data.map((d) => ({
    id: d.id as string,
    carpetaId: d.folder_id as string,
    nombre: d.name as string,
    ext: extensionDe(d.name as string),
    tamano: Number(d.size_bytes),
    subidoPor: (d.uploaded_email as string | null) ?? null,
    fecha: d.created_at as string,
    miniatura: firmadas.get(d.storage_path as string) ?? null,
  }));
  const cuenta = new Map<string, number>();
  for (const d of documentos) cuenta.set(d.carpetaId, (cuenta.get(d.carpetaId) ?? 0) + 1);
  return {
    success: true as const,
    carpetas: (car.data ?? []).map((c) => ({ id: c.id as string, nombre: c.name as string, documentos: cuenta.get(c.id as string) ?? 0 })),
    documentos,
  };
}

export async function crearCarpetaDocs(params: { nombre: string }): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const nombre = nombreCarpeta(params?.nombre);
  if (!org || !nombre) return { success: false as const, error: 'Ponle un nombre a la carpeta (hasta 60 letras).' };
  const { data, error } = await supabaseAdmin.from('document_folders')
    .insert({ organization_id: org, name: nombre, created_by: auth.user.id }).select('id').single();
  if (error) {
    return { success: false as const, error: error.code === '23505' ? 'Ya hay una carpeta con ese nombre.' : fallo('crearCarpetaDocs', error) };
  }
  registraAccion({ actorId: auth.user.id, action: 'crear_carpeta_docs', target: nombre, organizationId: org });
  return { success: true as const, id: data.id as string };
}

export async function renombrarCarpetaDocs(params: { id: string; nombre: string }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const nombre = nombreCarpeta(params?.nombre);
  if (!org || !esUuid(params?.id) || !nombre) return { success: false as const, error: 'Ponle un nombre a la carpeta (hasta 60 letras).' };
  const { data, error } = await supabaseAdmin.from('document_folders').update({ name: nombre })
    .eq('organization_id', org).eq('id', params.id).select('id');
  if (error) return { success: false as const, error: error.code === '23505' ? 'Ya hay una carpeta con ese nombre.' : fallo('renombrarCarpetaDocs', error) };
  if (!data?.length) return { success: false as const, error: 'Esa carpeta no existe.' };
  return { success: true as const };
}

/** Solo se borra una carpeta VACÍA: los documentos no se pierden por un descuido. */
export async function borrarCarpetaDocs(params: { id: string }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false as const, error: 'Datos no válidos.' };
  const { count, error: e0 } = await supabaseAdmin.from('admin_documents').select('id', { count: 'exact', head: true })
    .eq('organization_id', org).eq('folder_id', params.id);
  if (e0) return { success: false as const, error: fallo('borrarCarpetaDocs', e0) };
  if ((count ?? 0) > 0) return { success: false as const, error: 'La carpeta no está vacía: borra o mueve antes sus documentos.' };
  const { data, error } = await supabaseAdmin.from('document_folders').delete()
    .eq('organization_id', org).eq('id', params.id).select('id, name');
  if (error) return { success: false as const, error: fallo('borrarCarpetaDocs', error) };
  if (!data?.length) return { success: false as const, error: 'Esa carpeta no existe.' };
  registraAccion({ actorId: auth.user.id, action: 'borrar_carpeta_docs', target: data[0].name as string, organizationId: org });
  return { success: true as const };
}

/** Sube UN documento a una carpeta. El navegador los manda de uno en uno. */
export async function subirDocumento(formData: FormData): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  const carpetaId = formData?.get?.('carpetaId');
  const archivo = formData?.get?.('archivo');
  if (!org || !esUuid(carpetaId) || !(archivo instanceof File)) return { success: false as const, error: 'Datos no válidos.' };

  const { data: carpeta } = await supabaseAdmin.from('document_folders').select('id')
    .eq('organization_id', org).eq('id', carpetaId).maybeSingle();
  if (!carpeta) return { success: false as const, error: 'Esa carpeta no es de tu academia.' };
  const { count } = await supabaseAdmin.from('admin_documents').select('id', { count: 'exact', head: true })
    .eq('organization_id', org).eq('folder_id', carpetaId);
  if ((count ?? 0) >= MAX_DOCUMENTOS_POR_CARPETA) return { success: false as const, error: 'La carpeta está llena: crea otra.' };

  // El tamaño se mira ANTES de leer el archivo entero.
  const previo = validaPrevia({ nombre: archivo.name, tamano: archivo.size });
  if (!previo.ok) return { success: false as const, error: previo.error };
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const v = validaArchivo({ nombre: archivo.name, tamano: bytes.length, bytes });
  if (!v.ok) return { success: false as const, error: v.error };

  // El nombre del fichero lo genera el servidor; el del usuario es solo la etiqueta.
  const ruta = `${org}/${carpetaId}/${randomUUID()}.${v.ext}`;
  const { error: subir } = await supabaseAdmin.storage.from(CUBO).upload(ruta, bytes, { contentType: v.mime, upsert: false, cacheControl: '3600' });
  if (subir) return { success: false as const, error: fallo('subirDocumento', subir) };

  const { data, error } = await supabaseAdmin.from('admin_documents').insert({
    organization_id: org, folder_id: carpetaId, name: v.nombre, storage_path: ruta, mime_type: v.mime,
    size_bytes: bytes.length, uploaded_by: auth.user.id, uploaded_email: auth.user.email ?? null,
  }).select('id').single();
  if (error) {
    // Sin fila no hay quien encuentre el fichero: no se deja suelto.
    await supabaseAdmin.storage.from(CUBO).remove([ruta]);
    return { success: false as const, error: fallo('subirDocumento', error) };
  }
  registraAccion({ actorId: auth.user.id, action: 'subir_documento_admin', target: v.nombre, detail: { bytes: bytes.length }, organizationId: org });
  return { success: true as const, id: data.id as string };
}

export async function renombrarDocumento(params: { id: string; nombre: string }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false as const, error: 'Datos no válidos.' };
  const nombre = limpiaNombre(params.nombre);
  const { data: actual } = await supabaseAdmin.from('admin_documents').select('name').eq('organization_id', org).eq('id', params.id).maybeSingle();
  if (!actual) return { success: false as const, error: 'Ese documento no existe.' };
  // La extensión no se cambia: es lo que dice qué es.
  const ext = extensionDe(actual.name as string);
  const final = ext && extensionDe(nombre) !== ext ? `${nombre.replace(/\.[A-Za-z0-9]{1,5}$/, '')}.${ext}` : nombre;
  const { error } = await supabaseAdmin.from('admin_documents').update({ name: limpiaNombre(final) }).eq('organization_id', org).eq('id', params.id);
  if (error) return { success: false as const, error: fallo('renombrarDocumento', error) };
  return { success: true as const };
}

export async function borrarDocumento(params: { id: string }): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false as const, error: 'Datos no válidos.' };
  const { data: doc } = await supabaseAdmin.from('admin_documents').select('name, storage_path')
    .eq('organization_id', org).eq('id', params.id).maybeSingle();
  if (!doc) return { success: false as const, error: 'Ese documento no existe.' };
  // Primero la fila: si falla el fichero queda uno suelto, no una fila que apunta a nada.
  const { error } = await supabaseAdmin.from('admin_documents').delete().eq('organization_id', org).eq('id', params.id);
  if (error) return { success: false as const, error: fallo('borrarDocumento', error) };
  const { error: quitar } = await supabaseAdmin.storage.from(CUBO).remove([doc.storage_path as string]);
  if (quitar) fallo('borrarDocumento', quitar);
  registraAccion({ actorId: auth.user.id, action: 'borrar_documento_admin', target: doc.name as string, organizationId: org });
  return { success: true as const };
}

/** La URL para descargar un documento: firmada, de 2 minutos y de descarga forzada (nunca se abre dentro de la web). */
export async function urlDocumento(params: { id: string }): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false as const, error: auth.error };
  const org = auth.user.organizationId;
  if (!org || !esUuid(params?.id)) return { success: false as const, error: 'Datos no válidos.' };
  const { data: doc } = await supabaseAdmin.from('admin_documents').select('name, storage_path')
    .eq('organization_id', org).eq('id', params.id).maybeSingle();
  if (!doc) return { success: false as const, error: 'Ese documento no existe.' };
  const { data, error } = await supabaseAdmin.storage.from(CUBO).createSignedUrl(doc.storage_path as string, 120, { download: doc.name as string });
  if (error || !data?.signedUrl) return { success: false as const, error: fallo('urlDocumento', error ?? { message: 'sin URL' }) };
  return { success: true as const, url: data.signedUrl };
}
