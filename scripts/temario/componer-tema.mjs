/**
 * Compone el documento de un tema a partir del manifiesto y de la cache del BOE.
 *
 *   npm run temario:componer -- 2      un tema
 *   npm run temario:componer           todos los que tengan fuentes
 *
 * UN DOCUMENTO POR TEMA, CON SOLO SUS PRECEPTOS. No la ley entera repetida en
 * varios temas. Tres razones, y las tres tienen precedente en este repo:
 *
 *  - `generateTestQuestion` toma una ventana AL AZAR del documento (regla 28).
 *    Con la Constitucion entera dentro del tema 2, generaria preguntas del
 *    articulo 149 etiquetadas como tema 2 -- que es lo que paso con las 15
 *    preguntas de Inteligencia que vivian dentro de Constitucion (P5).
 *  - El chat manda el documento ENTERO al modelo (regla 33), con tope de
 *    150.000 caracteres. La Constitucion completa son ~125.000 y se pagan
 *    aunque la pregunta sea del Titulo Preliminar.
 *  - El diff. Cuando se reforme un articulo, `git diff` dice que temas cambian
 *    y, por tanto, que preguntas del banco hay que revisar.
 *
 * EL FORMATO NO ES DECORATIVO. El documento acaba en PDF, y la plataforma lo
 * vuelve a leer con `pdf2json` + `cleanLegalText` + `chunkDocument`. Ese
 * troceado detecta los encabezados con un regex anclado a principio de linea
 * (`^(TITULO|CAPITULO|SECCION|Articulo|Disposicion|Preambulo)`), asi que los
 * rotulos van EN CRUDO: un `## Articulo 1` de markdown rompe la deteccion y el
 * fragmento se queda sin referencia legal.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { numeroDeArticulo } from './boe.mjs';
import { MAX_CHARS_DOCUMENTOS } from '../../app/lib/chat.ts';

/**
 * Lo que cabe en un documento. El tope no se elige aqui: es el mismo que usa el
 * chat para decidir si manda un documento ENTERO al modelo (regla 33). Un tema
 * que lo pase viaja troceado, que es justo lo que este temario quiere evitar.
 *
 * Se deja margen para la cabecera de fuentes, que se repite en cada parte.
 */
const MAX_CHARS_DOCUMENTO = MAX_CHARS_DOCUMENTOS - 10_000;
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFIESTO = join(RAIZ, 'temario', 'temario.json');
const CACHE = join(RAIZ, 'temario', 'fuentes');
const SALIDA = join(RAIZ, 'temario', 'md');

/**
 * Las notas al pie del texto consolidado ("Se modifica por el art. unico de la
 * Reforma de..."), fuera del cuerpo. Son bibliografia de la consolidacion, no
 * norma, y meterlas dentro invita al generador a preguntar por la referencia de
 * la reforma en vez de por lo que dice el articulo. Lo que si importa --que la
 * redaccion es la reformada-- se dice en la cabecera del documento.
 */
const CLASES_FUERA = new Set(['nota_pie', 'nota_pie_2', 'firma_rey', 'firma_ministro']);

/**
 * Un articulo derogado, en el texto consolidado, es el rotulo y la palabra
 * "(Derogado)". Fuera del documento: en la LOFCS son once seguidos --el
 * Capitulo IV entero, que la LO 9/2015 se llevo-- y dejarlos dentro le da al
 * generador once articulos vacios de los que sacar preguntas, ademas de once
 * fragmentos indexados que no dicen nada.
 *
 * Que el programa siga pidiendo esa materia (el tema 9 pide "representacion
 * colectiva" y "Consejo de Policia") no significa que siga en esta ley: esta en
 * la que la derogo, y ahi hay que ir a buscarla.
 *
 * "(Suprimido)" cuenta igual: es como el BOE marca un organo que ya no existe,
 * y asi sale el articulo 13 del Real Decreto 207/2024 tras la reorganizacion de
 * abril de 2026.
 */
function estaDerogado(bloque) {
  const cuerpo = bloque.parrafos
    .filter((p) => !CLASES_FUERA.has(p.clase) && p.clase !== 'articulo')
    .map((p) => p.texto.trim());
  return cuerpo.length > 0 && cuerpo.every((t) => /^\((?:Derogad|Suprimid)[oa]\.?\)$/i.test(t));
}

function resolverAmbito(bloques, ambito) {
  if (ambito.tipo === 'completo') return bloques;

  if (ambito.tipo === 'bloques') {
    const pedidos = new Set(ambito.ids);
    const encontrados = bloques.filter((b) => pedidos.has(b.id));
    const faltan = ambito.ids.filter((id) => !bloques.some((b) => b.id === id));
    if (faltan.length) throw new Error(`bloques inexistentes: ${faltan.join(', ')}`);
    return encontrados;
  }

  // `articulos` se resuelve por el NUMERO leido del rotulo, no por el
  // identificador: el Codigo Civil usa `art2` y la LOFCS `aprimero`, asi que
  // componer `a${n}` acertaria solo en la Constitucion. Ver `numeroDeArticulo`.
  const primero = (n) => bloques.findIndex((b) => numeroDeArticulo(b) === n);
  // El FINAL se busca por el ultimo bloque con ese numero, no por el primero.
  // El Codigo Penal numera "156", "156 bis"... "156 quinquies", y los tres leen
  // 156: cerrando en el primero, el tramo de las lesiones se dejaba fuera
  // cinco articulos que el programa si pide.
  const ultimo = (n) => bloques.findLastIndex((b) => numeroDeArticulo(b) === n);

  const i = ambito.tipo === 'articulos' ? primero(ambito.desde) : bloques.findIndex((b) => b.id === ambito.desde);
  const j = ambito.tipo === 'articulos' ? ultimo(ambito.hasta) : bloques.findIndex((b) => b.id === ambito.hasta);
  const desde = ambito.tipo === 'articulos' ? `articulo ${ambito.desde}` : ambito.desde;
  const hasta = ambito.tipo === 'articulos' ? `articulo ${ambito.hasta}` : ambito.hasta;
  if (i === -1) throw new Error(`no existe el bloque inicial "${desde}"`);
  if (j === -1) throw new Error(`no existe el bloque final "${hasta}"`);
  if (j < i) throw new Error(`"${desde}" va despues de "${hasta}" en la norma`);

  // El tramo va ENTERO, encabezados incluidos: los TITULO/CAPITULO/SECCION que
  // caen dentro son la estructura del texto, y sin ellos el alumno lee
  // articulos sueltos sin saber de que parte de la ley salen.
  // Si el tramo empieza en un articulo, se recupera el encabezado que lo abre
  // ("TITULO III · De las infracciones"): sin el, el alumno lee articulos
  // sueltos sin saber de que parte de la ley salen.
  let inicio = i;
  while (inicio > 0 && bloques[inicio - 1].tipo === 'encabezado') inicio--;

  return bloques.slice(inicio, j + 1);
}

/**
 * El texto de un bloque, listo para el documento.
 *
 * Los encabezados van con salto SENCILLO ("CAPITULO PRIMERO" y "De los
 * espanoles y los extranjeros" son un solo rotulo partido en dos parrafos por
 * el BOE). Con linea en blanco entre medias, el titulo del capitulo queda
 * suelto y se lee como si fuera el primer parrafo del articulo siguiente.
 */
function volcarBloque(bloque) {
  const lineas = bloque.parrafos
    .filter((p) => !CLASES_FUERA.has(p.clase))
    .map((p) => p.texto);
  return lineas.join(bloque.tipo === 'encabezado' ? '\n' : '\n\n');
}

/** Que articulos del tramo llevan una redaccion posterior a la original. */
function reformados(seleccion, idNorma) {
  return seleccion
    .filter((b) => b.reformado_por && b.reformado_por !== idNorma && b.titulo)
    .map((b) => `${b.titulo} (${formatearFecha(b.vigente_desde)})`);
}

function formatearFecha(aaaammdd) {
  if (!aaaammdd || aaaammdd.length !== 8) return 'sin fecha';
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

/**
 * Reparte las fuentes de un tema en uno o varios documentos.
 *
 * Un tema como el 8 --la Orden de estructura de la DGP, cuatro tramos de la Ley
 * de Regimen de Personal y el regimen disciplinario entero-- son 225.000
 * caracteres. Partirlo NO es una concesion: es lo que pidio el encargo ("uno o
 * varios PDF por tema") y es lo unico que mantiene cada documento por debajo
 * del tope con el que el chat lo manda entero.
 *
 * Se parte SIEMPRE por fuente, nunca a mitad de una norma: cortar una ley por
 * el caracter 140.000 deja media parte sin saber de que ley es.
 */
function repartir(secciones) {
  const partes = [];
  let actual = [];
  let largo = 0;

  for (const seccion of secciones) {
    // Una sola fuente que ya no cabe no se puede repartir sin cortar una norma
    // por la mitad. Se avisa en vez de sacar un documento grande en silencio:
    // lo que toca es partir esa fuente en dos tramos en el manifiesto, por un
    // limite que signifique algo (un titulo, un libro).
    if (seccion.texto.length > MAX_CHARS_DOCUMENTO) {
      console.log(`  AVISO: "${seccion.texto.split('\n')[0]}" ocupa ${seccion.texto.length.toLocaleString('es-ES')} caracteres el solo. Partela en el manifiesto.`);
    }
    if (actual.length > 0 && largo + seccion.texto.length > MAX_CHARS_DOCUMENTO) {
      partes.push(actual);
      actual = [];
      largo = 0;
    }
    actual.push(seccion);
    largo += seccion.texto.length;
  }
  if (actual.length) partes.push(actual);
  return partes;
}

async function componer(tema, hoy) {
  if (!tema.fuentes?.length) return [];

  const secciones = [];

  for (const fuente of tema.fuentes) {
    let norma;
    try {
      norma = JSON.parse(await readFile(join(CACHE, `${fuente.boe_id}.json`), 'utf8'));
    } catch {
      throw new Error(`falta la cache de ${fuente.boe_id}. Ejecuta: npm run temario:descargar -- ${tema.numero}`);
    }

    let seleccion;
    try {
      seleccion = resolverAmbito(norma.bloques, fuente.ambito);
    } catch (e) {
      throw new Error(`tema ${tema.numero}, ${fuente.boe_id}: ${e.message}`);
    }
    if (seleccion.length === 0) throw new Error(`tema ${tema.numero}: el ambito de ${fuente.boe_id} no selecciona nada`);

    const derogados = seleccion.filter(estaDerogado);
    seleccion = seleccion.filter((b) => !estaDerogado(b));
    if (derogados.length) {
      console.log(`  tema ${tema.numero}: ${derogados.length} preceptos derogados fuera (${derogados.slice(0, 4).map((d) => d.titulo).join(', ')}${derogados.length > 4 ? '...' : ''})`);
    }

    const cambiados = reformados(seleccion, norma.id);
    const nombre = fuente.nombre ?? norma.titulo;

    secciones.push({
      cita: [
        `${nombre} (${fuente.boe_id})`,
        `  Texto consolidado del BOE, actualizado a ${formatearFecha(norma.fecha_actualizacion?.slice(0, 8))}.`,
        `  https://www.boe.es/buscar/act.php?id=${fuente.boe_id}`,
        fuente.nota ? `  Alcance en este tema: ${fuente.nota}` : null,
        cambiados.length ? `  Con redacción reformada: ${cambiados.join('; ')}.` : null,
      ].filter(Boolean).join('\n'),
      texto: `${nombre}\n\n${seleccion.map(volcarBloque).filter(Boolean).join('\n\n')}`,
    });
  }

  const grupos = repartir(secciones);

  return grupos.map((grupo, indice) => {
    const deVarias = grupos.length > 1 ? ` (parte ${indice + 1} de ${grupos.length})` : '';
    const cabecera = [
      `Tema ${tema.numero}. ${tema.titulo}${deVarias}`,
      '',
      tema.enunciado,
      '',
      'FUENTES',
      '',
      grupo.map((s) => s.cita).join('\n\n'),
      '',
      `Documento generado el ${hoy} para Atenea Policial a partir de los textos`,
      'consolidados del BOE. Contiene únicamente los preceptos que el programa',
      `oficial asigna a este tema${grupos.length > 1 ? ', repartidos en varios documentos por su extensión' : ''}.`,
      '',
      '---',
    ].join('\n');

    return { sufijo: grupos.length > 1 ? `-${indice + 1}` : '', texto: `${cabecera}\n\n${grupo.map((s) => s.texto).join('\n\n')}\n` };
  });
}

async function main() {
  const soloTema = process.argv[2] ? Number(process.argv[2]) : null;
  const manifiesto = JSON.parse(await readFile(MANIFIESTO, 'utf8'));
  const hoy = new Date().toISOString().slice(0, 10);

  const temas = soloTema
    ? manifiesto.temas.filter((t) => t.numero === soloTema)
    : manifiesto.temas.filter((t) => t.fuentes?.length);
  if (temas.length === 0) throw new Error(soloTema ? `No existe el tema ${soloTema}.` : 'Ningun tema tiene fuentes asignadas todavia.');

  await mkdir(SALIDA, { recursive: true });

  for (const tema of temas) {
    const documentos = await componer(tema, hoy);
    if (documentos.length === 0) {
      console.log(`- tema ${tema.numero}: sin fuentes, se salta`);
      continue;
    }
    for (const { sufijo, texto } of documentos) {
      const nombre = `tema-${String(tema.numero).padStart(2, '0')}${sufijo}.md`;
      await writeFile(join(SALIDA, nombre), texto, 'utf8');
      const articulos = (texto.match(/^Art[íi]culo /gm) ?? []).length;
      console.log(`+ ${nombre}: ${texto.length.toLocaleString('es-ES')} caracteres, ${articulos} articulos`);
    }
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
});
