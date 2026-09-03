/**
 * Enseña el esqueleto de una norma ya descargada: sus titulos y capitulos con
 * el tramo de articulos que abarca cada uno.
 *
 *   npm run temario:esquema -- BOE-A-1995-25444
 *
 * Existe porque asignar las fuentes de un tema es elegir un tramo, y elegirlo
 * de memoria es como se acaba metiendo el Titulo VIII entero en un tema que
 * solo pedia dos capitulos. Con el esqueleto delante, el rango se lee.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { numeroDeArticulo } from './boe.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const nivelDe = (rotulo) =>
  /^(T[ÍI]TULO|LIBRO|PARTE)/i.test(rotulo) ? 0 : /^CAP[ÍI]TULO/i.test(rotulo) ? 1 : 2;

/**
 * El rango de un encabezado va hasta el siguiente del MISMO nivel o superior,
 * no hasta el siguiente cualquiera: un titulo con capitulos dentro no tiene
 * preceptos propios, y mirando solo al bloque siguiente salia vacio. Con el
 * rango del titulo delante se elige el tramo de un tema de un vistazo, que es
 * para lo que existe este guion.
 */
function conRangos(bloques) {
  const encabezados = [];
  bloques.forEach((b, indice) => {
    if (b.tipo !== 'encabezado') return;
    const rotulo = b.parrafos.map((p) => p.texto).join(' · ');
    encabezados.push({ indice, rotulo, nivel: nivelDe(rotulo) });
  });

  return encabezados.map((e, k) => {
    const siguiente = encabezados.slice(k + 1).find((o) => o.nivel <= e.nivel);
    const hasta = siguiente ? siguiente.indice : bloques.length;
    // Solo preceptos: si se cuentan los encabezados hijos, el rango de un
    // titulo empieza en "CAPITULO I" en vez de en su primer articulo.
    const dentro = bloques.slice(e.indice + 1, hasta).filter((b) => b.titulo && b.tipo === 'precepto');
    return {
      ...e,
      desde: dentro[0]?.titulo ?? null,
      ultimo: dentro[dentro.length - 1]?.titulo ?? null,
    };
  });
}

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Falta el identificador. Ej: npm run temario:esquema -- BOE-A-1995-25444');

  const norma = JSON.parse(await readFile(join(RAIZ, 'temario', 'fuentes', `${id}.json`), 'utf8'));
  console.log(`${norma.id}  ${norma.titulo}`);
  console.log(`${norma.bloques.length} bloques, actualizado a ${norma.fecha_actualizacion}\n`);

  const sueltos = [];
  const primerEncabezado = norma.bloques.findIndex((b) => b.tipo === 'encabezado');
  for (const b of norma.bloques.slice(0, primerEncabezado === -1 ? norma.bloques.length : primerEncabezado)) {
    if (b.titulo) sueltos.push(b.titulo);
  }
  if (sueltos.length) console.log(`(antes del primer encabezado) ${sueltos[0]} - ${sueltos[sueltos.length - 1]}\n`);

  for (const e of conRangos(norma.bloques)) {
    const rango = e.desde ? `  [${e.desde} - ${e.ultimo}]` : '';
    console.log(`${'  '.repeat(e.nivel)}${e.rotulo}${rango}`);
  }

  const numeros = norma.bloques.map(numeroDeArticulo).filter((n) => n !== null);
  console.log(`\nArticulos: ${numeros.length}${numeros.length ? ` (${numeros[0]} - ${numeros[numeros.length - 1]})` : ''}`);
  const otros = norma.bloques.filter((b) => b.tipo === 'precepto' && numeroDeArticulo(b) === null);
  if (otros.length) console.log(`Disposiciones y otros: ${otros.length}`);
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; });
