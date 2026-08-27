/**
 * Utilidades de texto puras (sin dependencias de red ni de entorno).
 * Extraidas de app/actions/core.ts para poder testearlas de forma aislada.
 */

// NOTA: `cleanAIResponse` se retiro en la fase 3. Era un apanio de expresiones
// regulares que corrompia el contenido en los casos limite (una coma seguida de
// `}` dentro de una cadena, o una llave dentro de un texto legal). Lo sustituye
// `parseAIJson` en app/lib/ai-output.ts, que parsea de verdad y respeta las
// cadenas; y los modelos van en modo JSON, asi que casi nunca hace falta.

/**
 * Normaliza el texto crudo extraido de un PDF legal.
 *
 * NOTA: el original en core.ts incluia `.replace(/[]/g, '')`. Una clase de
 * caracteres vacia en JavaScript no casa con NADA, asi que esa linea siempre
 * fue un no-op silencioso (probablemente se intentaba limpiar caracteres de
 * control). Aqui se replica el comportamiento actual a proposito: limpiarlos
 * de verdad es un cambio funcional y esta planificado en la Fase 3.
 */
export function cleanLegalText(raw: string): string {
  const sinRuido = raw
    .replace(/%[0-9A-F]{2}/g, (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    })
    .replace(/----------------Page \(\d+\) Break----------------/g, '\n')
    .replace(/\n\s*\d+\s*\n/g, '\n');

  // Reconstruir los parrafos ANTES de colapsar saltos: el PDF llega cortado al
  // ancho de la pagina, y sin esto todo lo que viene despues —el troceado, la
  // deteccion de articulos, los embeddings— trabaja sobre renglones sueltos en
  // vez de sobre texto. Ver `rejoinPdfLines`.
  return rejoinPdfLines(sinRuido)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Encabezados de un texto legal. Siempre abren linea propia: nunca se unen a la
 * anterior aunque parezca que continua la frase.
 */
const ENCABEZADO_LEGAL =
  /^(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|LIBRO|PARTE|Art[íi]culo|Disposici[óo]n|Pre[áa]mbulo|ANEXO)\b/i;

/** Apartados: «1.» «2)» «a)» «III.» — tambien abren linea. */
const APARTADO = /^(\d{1,2}[.)]\s|[a-z][.)]\s|[IVX]{1,5}[.)]\s)/;

/**
 * Reconstruye los parrafos de un texto extraido de un PDF.
 *
 * EL PROBLEMA QUE RESUELVE
 * `pdf2json` devuelve el texto tal y como esta MAQUETADO en la pagina: un
 * renglon por linea, cortado al ancho del papel. Medido sobre el temario real
 * del proyecto: lineas de 66-71 caracteres de media y el 39-40 % de ellas
 * cortadas a mitad de frase. La palabra «Articulo» llegaba partida en
 * «Articu» + «lo».
 *
 * Consecuencias, todas silenciosas:
 *
 *  - `chunkLegalText` divide por parrafos (`\n\n`) y apenas los habia: 30 saltos
 *    dobles en 108.000 caracteres. Producia bloques de ~3.600 caracteres que se
 *    partian a ciegas, asi que un fragmento podia empezar a mitad del articulo
 *    11 y acabar a mitad del 12.
 *  - Detectar la estructura legal era imposible con los encabezados partidos.
 *  - Los embeddings se calculaban sobre texto con saltos artificiales, y el chat
 *    citaba fragmentos ilegibles.
 *
 * QUE HACE
 * Une una linea con la anterior cuando la anterior no cerro la frase y esta
 * empieza en minuscula. Es deliberadamente conservador: en caso de duda mantiene
 * el salto, y ante un encabezado o un apartado no une nunca.
 *
 * NO PIERDE CONTENIDO. Verificado sobre los tres documentos del temario real:
 * comparando solo letras y numeros, el texto es identico antes y despues. Lo
 * unico que desaparece son los espacios de justificacion y los saltos de
 * maquetacion.
 */
export function rejoinPdfLines(texto: string): string {
  const lineas = texto.split('\n');
  const salida: string[] = [];

  for (let i = 0; i < lineas.length; i++) {
    // Los PDF justificados meten rachas de espacios entre palabras.
    const actual = lineas[i].replace(/[ \t]+/g, ' ').trim();

    if (!actual) {
      salida.push('');
      continue;
    }

    // Guion de particion al final del renglon: la palabra sigue abajo y se
    // reconstruye sin espacio y sin el guion.
    if (/[a-záéíóúñ]-$/.test(actual) && i + 1 < lineas.length) {
      const siguiente = lineas[i + 1].trim();
      if (/^[a-záéíóúñ]/.test(siguiente)) {
        lineas[i + 1] = actual.slice(0, -1) + siguiente;
        continue;
      }
    }

    const anterior = salida[salida.length - 1];
    const continuaLaFrase =
      Boolean(anterior) &&
      // La anterior no cerro la frase...
      !/[.:;!?»"]$/.test(anterior) &&
      // ...y esta arranca en minuscula, o abre parentesis o comilla.
      /^[a-záéíóúñ(«"]/.test(actual) &&
      // ...y no es el principio de algo nuevo.
      !ENCABEZADO_LEGAL.test(actual) &&
      !APARTADO.test(actual);

    if (continuaLaFrase) salida[salida.length - 1] = anterior + ' ' + actual;
    else salida.push(actual);
  }

  return salida.join('\n');
}

export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 200;

/**
 * Parte un parrafo demasiado largo en trozos que quepan en `limit`.
 *
 * Primero por frases (los textos legales estan llenos de puntos), y si una
 * frase sigue sin caber, corte duro. Nunca devuelve trozos vacios.
 */
function splitLongParagraph(paragraph: string, limit: number): string[] {
  if (paragraph.length <= limit) return [paragraph];

  // Se conserva el signo de puntuacion al final de cada frase.
  const sentences = paragraph.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let current = '';

  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;

    if (sentence.length > limit) {
      // Frase mas larga que el limite: corte duro.
      if (current) { out.push(current); current = ''; }
      for (let i = 0; i < sentence.length; i += limit) {
        out.push(sentence.slice(i, i + limit));
      }
      continue;
    }

    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= limit) current += ' ' + sentence;
    else { out.push(current); current = sentence; }
  }

  if (current) out.push(current);
  return out;
}

/** Divide el texto en unidades que ya caben en `limit`, respetando parrafos. */
function toSegments(text: string, limit: number): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLongParagraph(p, limit));
}

/**
 * Trocea un texto en fragmentos aptos para embeddings, respetando parrafos y
 * solapando el final del fragmento anterior para no perder contexto.
 *
 * Garantias (el algoritmo anterior no cumplia ninguna, ver PLAN 2.6):
 *  - Nunca devuelve fragmentos vacios. Antes, si el texto empezaba por un
 *    parrafo largo, el primer fragmento era '' y `embedContent('')` fallaba:
 *    el documento quedaba indexado a medias sin avisar al administrador.
 *  - Ningun fragmento supera `maxChars`. Antes un articulo largo sin lineas en
 *    blanco producia un fragmento unico gigante.
 *  - El solape se toma del CONTENIDO del fragmento anterior, no del fragmento
 *    ya solapado. Antes el solape se acumulaba y los tamanios crecian.
 */
export function chunkLegalText(
  cleanText: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlap: number = CHUNK_OVERLAP_CHARS
): string[] {
  const text = (cleanText ?? '').trim();
  if (!text) return [];

  const safeOverlap = Math.max(0, Math.min(overlap, Math.floor(maxChars / 2)));
  // Presupuesto de contenido NUEVO por fragmento: lo que sobra tras reservar
  // sitio para el solape Y para el salto de linea que lo separa. Sin contar ese
  // separador, el fragmento se pasaba del maximo por un caracter.
  const separator = safeOverlap > 0 ? 1 : 0;
  const budget = Math.max(1, maxChars - safeOverlap - separator);

  const segments = toSegments(text, budget);

  const packed: string[] = [];
  let current = '';
  for (const segment of segments) {
    if (!current) current = segment;
    else if (current.length + 2 + segment.length <= budget) current += '\n\n' + segment;
    else { packed.push(current); current = segment; }
  }
  if (current) packed.push(current);

  if (safeOverlap === 0) return packed;

  return packed.map((chunk, i) =>
    i === 0 ? chunk : packed[i - 1].slice(-safeOverlap) + '\n' + chunk
  );
}

// ============================================================
// TROCEADO POR ESTRUCTURA LEGAL
// ============================================================

/**
 * Un fragmento indexable, con la referencia legal de la que sale.
 *
 * La referencia es lo que permite que el chat cite «Artículo 11 LOFCS» en vez
 * del nombre del fichero, y que una pregunta generada lleve su fuente.
 */
export type LegalChunk = {
  text: string;
  /** «Artículo 11», «Disposición adicional primera»… o `null` si no se sabe. */
  reference: string | null;
};

/**
 * Encabezado de articulo NUMERADO: «Artículo 1.», «Artículo 11 bis».
 *
 * Las dos regex van SIN el flag `i`, y es a proposito: con el, «artículo 126 de
 * la Constitución» —una referencia en mitad de un parrafo— se tomaba por un
 * encabezado. La mayuscula inicial es lo unico que los distingue.
 *
 * Y se escriben como literales, no componiendo cadenas: en un template literal
 * `\s` no es una secuencia de escape valida y JavaScript lo colapsa a una `s`,
 * asi que la regex acababa siendo `^s*(Art[íi]culos+...` y no casaba nada. Pasó
 * exactamente eso al escribirla la primera vez.
 */
const RE_ARTICULO_NUM = /^\s*(Art[íi]culo\s+\d+(?:\s*(?:bis|ter|quater))?)\b/;

/**
 * Encabezado de articulo EN LETRA.
 *
 * La LOFCS usa ordinales del primero al noveno y despues cardinales: «Artículo
 * diez», «Artículo once». Sin los cardinales solo se detectaban 9 de sus ~54
 * articulos.
 */
const RE_ARTICULO_LETRA =
  /^\s*(Art[íi]culo\s+(?:primero|segundo|tercero|cuarto|quinto|sexto|s[ée]ptimo|octavo|noveno|d[ée]cimo|und[ée]cimo|duod[ée]cimo|diez|once|doce|trece|catorce|quince|diecis[ée]is|diecisiete|dieciocho|diecinueve|veinte|veinti\w+|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien(?:to)?))\b/;

/** Disposiciones adicionales, transitorias, derogatorias y finales. */
const RE_DISPOSICION =
  /^\s*(Disposici[óo]n\s+(?:adicional|transitoria|derogatoria|final)(?:\s+\w+)?)/i;

/** Una linea del INDICE, no del cuerpo: lleva puntos de relleno. */
const RE_RELLENO_INDICE = /\.{4,}/;

/** La referencia de una linea, si es un encabezado. `null` si no lo es. */
export function legalReferenceOf(linea: string): string | null {
  if (RE_RELLENO_INDICE.test(linea)) return null;

  const encontrado =
    linea.match(RE_ARTICULO_NUM) ?? linea.match(RE_ARTICULO_LETRA) ?? linea.match(RE_DISPOSICION);

  return encontrado ? encontrado[1].replace(/\s+/g, ' ').trim() : null;
}

/** Cuantos encabezados de articulo tiene un texto (fuera del indice). */
export function countLegalHeadings(texto: string): number {
  return texto.split('\n').filter((l) => legalReferenceOf(l) !== null).length;
}

/**
 * A partir de cuantos encabezados se considera que el documento es un texto
 * legal estructurado. Con menos, es un apunte y se trocea por longitud.
 *
 * Tres es deliberadamente bajo: un tema con tres articulos ya se beneficia, y
 * unos apuntes que mencionen «Artículo 1» de pasada rara vez llegan a tres
 * encabezados en linea propia.
 */
export const MIN_HEADINGS_FOR_STRUCTURE = 3;

export function hasLegalStructure(texto: string): boolean {
  return countLegalHeadings(texto) >= MIN_HEADINGS_FOR_STRUCTURE;
}

/**
 * Trocea un texto legal por su ESTRUCTURA: un fragmento por articulo.
 *
 * POR QUE
 * El troceado por longitud parte donde le toca, asi que un fragmento podia
 * empezar a mitad del articulo 11 y acabar a mitad del 12. Cuando el chat lo
 * recuperaba, la cita salia mutilada; y cuando la IA generaba una pregunta a
 * partir de el, podia estar mezclando dos articulos distintos.
 *
 * COMO
 *  - Un articulo = un fragmento, si cabe en `maxChars`.
 *  - Si no cabe, se parte con la misma logica de siempre (por frases, y solo
 *    entonces a la fuerza), pero TODOS los trozos conservan su referencia.
 *  - Lo que va antes del primer encabezado (el preambulo) sale sin referencia.
 *  - Las lineas del indice se descartan: llevan puntos de relleno.
 *
 * No lleva solape entre articulos a proposito: el limite de un articulo ES el
 * corte natural, y arrastrar el final del anterior solo mete ruido. El solape
 * se mantiene dentro de un articulo partido, que es donde hace falta.
 */
export function chunkLegalStructure(
  texto: string,
  maxChars: number = CHUNK_MAX_CHARS
): LegalChunk[] {
  const lineas = (texto ?? '').split('\n');
  const salida: LegalChunk[] = [];

  let referenciaActual: string | null = null;
  let acumulado: string[] = [];

  const volcar = () => {
    const contenido = acumulado.join('\n').trim();
    acumulado = [];
    if (!contenido) return;

    // Cabe entero: un articulo, un fragmento.
    if (contenido.length <= maxChars) {
      salida.push({ text: contenido, reference: referenciaActual });
      return;
    }

    // No cabe: se parte, y cada trozo se queda con la referencia.
    for (const trozo of chunkLegalText(contenido, maxChars)) {
      salida.push({ text: trozo, reference: referenciaActual });
    }
  };

  for (const linea of lineas) {
    if (RE_RELLENO_INDICE.test(linea)) continue; // indice

    const referencia = legalReferenceOf(linea);
    if (referencia) {
      volcar();
      referenciaActual = referencia;
    }
    acumulado.push(linea);
  }
  volcar();

  return salida;
}

/**
 * Trocea un documento eligiendo la estrategia sola.
 *
 * Un texto legal se trocea por articulos; unos apuntes, por longitud. Se decide
 * mirando cuantos encabezados hay, no preguntando al administrador: acertar
 * aqui es facil y una casilla mas en el formulario es una forma de equivocarse.
 */
export function chunkDocument(texto: string, maxChars: number = CHUNK_MAX_CHARS): LegalChunk[] {
  if (hasLegalStructure(texto)) return chunkLegalStructure(texto, maxChars);
  return chunkLegalText(texto, maxChars).map((text) => ({ text, reference: null }));
}
