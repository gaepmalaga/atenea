/**
 * Descarga las normas que el manifiesto necesita y las deja en cache.
 *
 *   npm run temario:descargar          todas las normas del manifiesto
 *   npm run temario:descargar -- 2     solo las del tema 2
 *
 * Se descarga POR NORMA, no por tema: la Constitucion alimenta al menos los
 * temas 2 y 3, y bajarla dos veces es pagar dos veces la misma transferencia y
 * arriesgarse a componer dos temas con versiones distintas del mismo articulo.
 *
 * La cache NO va al repositorio (.gitignore). Lo que se versiona es el temario
 * compuesto --el markdown y el PDF--, que es lo que lee un alumno; la cache es
 * un paso intermedio que se regenera con un comando.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { descargarMetadatos, descargarTexto, parsearTexto, numeroDeArticulo } from './boe.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFIESTO = join(RAIZ, 'temario', 'temario.json');
const CACHE = join(RAIZ, 'temario', 'fuentes');

const rutaCache = (id) => join(CACHE, `${id}.json`);

/** Los ids de norma que hacen falta, sin repetir y en orden de aparicion. */
function normasNecesarias(manifiesto, soloTema) {
  const temas = soloTema
    ? manifiesto.temas.filter((t) => t.numero === soloTema)
    : manifiesto.temas;
  if (soloTema && temas.length === 0) throw new Error(`No existe el tema ${soloTema}.`);
  return [...new Set(temas.flatMap((t) => (t.fuentes ?? []).map((f) => f.boe_id)))];
}

/**
 * `fecha_actualizacion` es la de la consolidacion, no la de la norma. Si no ha
 * cambiado, el texto tampoco: sirve de ETag pobre y ahorra bajar un codigo
 * entero para nada.
 */
async function estaAlDia(id, fechaRemota) {
  if (!existsSync(rutaCache(id))) return false;
  try {
    const previo = JSON.parse(await readFile(rutaCache(id), 'utf8'));
    return previo.fecha_actualizacion === fechaRemota;
  } catch {
    return false;
  }
}

async function main() {
  const argumentos = process.argv.slice(2);

  // Se admiten identificadores sueltos ademas del numero de tema: al asignar las
  // fuentes de un tema hay que mirar la norma ANTES de saber que tramo entra, y
  // el manifiesto todavia no la nombra.
  const idsSueltos = argumentos.filter((a) => a.startsWith('BOE-'));
  const soloTema = argumentos.find((a) => /^\d+$/.test(a));

  const manifiesto = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
  const ids = idsSueltos.length > 0
    ? idsSueltos
    : normasNecesarias(manifiesto, soloTema ? Number(soloTema) : null);

  if (ids.length === 0) {
    console.log('El manifiesto todavia no asigna ninguna fuente. Nada que descargar.');
    return;
  }

  await mkdir(CACHE, { recursive: true });

  for (const id of ids) {
    const meta = await descargarMetadatos(id);
    const titulo = meta.titulo ?? id;

    if (await estaAlDia(id, meta.fecha_actualizacion)) {
      console.log(`= ${id} sin cambios (${meta.fecha_actualizacion})`);
      continue;
    }

    const xml = await descargarTexto(id);
    const { bloques, futuros } = parsearTexto(xml);

    await writeFile(
      rutaCache(id),
      `${JSON.stringify({
        id,
        titulo,
        rango: meta.rango?.texto ?? null,
        fecha_disposicion: meta.fecha_disposicion ?? null,
        fecha_actualizacion: meta.fecha_actualizacion,
        descargado: new Date().toISOString().slice(0, 10),
        bloques,
      }, null, 1)}\n`,
      'utf8'
    );

    const articulos = bloques.filter((b) => numeroDeArticulo(b) !== null).length;
    console.log(`+ ${id}: ${bloques.length} bloques (${articulos} articulos) - ${titulo.slice(0, 60)}`);
    // Una reforma que aun no ha entrado en vigor no es lo que se pregunta hoy,
    // pero conviene saber que existe: el temario se quedara corto en esa fecha.
    if (futuros.length > 0) console.log(`  ojo: con version futura -> ${futuros.join(', ')}`);
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
