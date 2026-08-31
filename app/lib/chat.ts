/**
 * Contrato y reglas de la conversacion del chat RAG.
 *
 * Modulo puro: la parte delicada de dar memoria a un chat con recuperacion no
 * es meter el historial en el prompt, sino QUE SE BUSCA en el temario. Si el
 * alumno pregunta "¿y que plazo aplica en ese caso?", el embedding de esa frase
 * suelta no recupera nada: hay que reconstruir de que se estaba hablando.
 */

export type ChatRole = 'user' | 'ai';

export type ChatTurn = {
  role: ChatRole;
  content: string;
};

/** Turnos que viajan al modelo. Mas historial es mas coste sin mas utilidad. */
export const MAX_HISTORY_TURNS = 6;
/** Recorte por turno, para que una respuesta larga no se coma el contexto. */
export const MAX_TURN_CHARS = 600;
/** Limite de la consulta del alumno. */
export const MAX_QUERY_CHARS = 1000;

/**
 * Marcadores de que una pregunta depende de la anterior.
 *
 * En espanol las repreguntas empiezan casi siempre por un conector o un
 * demostrativo: "¿y si...?", "en ese caso", "eso", "el anterior".
 */
const FOLLOW_UP_MARKERS = [
  'y ', 'e ', 'pero ', 'entonces', 'ademas', 'además', 'tambien', 'también',
  'en ese caso', 'en tal caso', 'eso', 'esa', 'ese', 'esto', 'esta', 'este',
  'aquel', 'aquello', 'lo anterior', 'el anterior', 'la anterior', 'ahi', 'ahí',
  'ampl', 'y eso', 'por que', 'por qué', 'cual es la diferencia', 'cuál es la diferencia',
];

/** Por debajo de esto, una pregunta casi nunca se sostiene sola. */
const SELF_CONTAINED_MIN_CHARS = 40;

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/^[¿¡\s]+/, '');
}

/**
 * ¿Esta pregunta depende del turno anterior?
 *
 * Heuristica a proposito, no una llamada extra al modelo: reescribir la
 * pregunta con la IA costaria una peticion de pago por cada mensaje. El coste
 * de equivocarse es bajo en los dos sentidos — de mas, se anade contexto que
 * el buscador pondera poco; de menos, se busca solo la pregunta actual, que es
 * exactamente lo que se hacia antes.
 */
export function isFollowUp(query: string): boolean {
  const q = normalize(query);
  if (!q) return false;
  if (q.length < SELF_CONTAINED_MIN_CHARS) return true;
  return FOLLOW_UP_MARKERS.some((m) => q.startsWith(m));
}

/** Ultimo turno del alumno, si lo hay. */
export function lastUserTurn(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user' && history[i].content.trim()) {
      return history[i].content.trim();
    }
  }
  return null;
}

/**
 * Texto que se manda a embeber para buscar en el temario.
 *
 * Para una repregunta se antepone la anterior, de modo que la busqueda semantica
 * sepa de que se esta hablando. Para una pregunta que se sostiene sola se manda
 * tal cual: incluir la anterior solo anadiria ruido si el alumno cambia de tema.
 */
export function buildRetrievalQuery(history: ChatTurn[], query: string): string {
  const current = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!current) return '';
  if (!isFollowUp(current)) return current;

  const previous = lastUserTurn(history);
  if (!previous) return current;

  return `${previous.slice(0, MAX_TURN_CHARS)}\n${current}`;
}

/** Recorta el historial a lo que se manda al modelo. */
export function trimHistory(history: ChatTurn[]): ChatTurn[] {
  return history
    .filter((t) => t?.content?.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({
      role: t.role,
      content: t.content.trim().slice(0, MAX_TURN_CHARS),
    }));
}

/** Historial en texto para el prompt. Vacio si no hay conversacion previa. */
export function formatHistory(history: ChatTurn[]): string {
  const turns = trimHistory(history);
  if (!turns.length) return '';
  return turns
    .map((t) => `${t.role === 'user' ? 'ASPIRANTE' : 'ATENEA'}: ${t.content}`)
    .join('\n');
}


// ============================================================
// PREGUNTAS QUE LA BUSQUEDA SEMANTICA NO PUEDE RESPONDER
// ============================================================
//
// «¿Cuantos articulos tiene la Constitucion?» no la contesta ningun fragmento,
// porque NINGUN FRAGMENTO LO DICE: el texto de la norma no se cuenta a si
// mismo. El buscador devolvia los articulos de reforma —los ultimos, y los que
// mas se parecen a una pregunta sobre "la Constitucion" en abstracto— y el
// modelo respondia, con razon, "no consta en el temario".
//
// Pero el dato SI existe en la plataforma: esta en el indice. Desde P1b cada
// fragmento sabe de que articulo viene, asi que contar las referencias
// distintas de un documento responde la pregunta. Lo que faltaba era llevarle
// ese recuento al modelo.
//
// La misma idea sirve para el caso contrario: si el alumno NOMBRA un articulo,
// buscarlo por su referencia es exacto, y depender de que el embedding acierte
// con un numero es jugarsela.

/** Quita acentos para comparar. Lo escribe el alumno a mano, y el BOE acentua. */
function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ------------------------------------------------------------------
// LEER EL NUMERO DE UN ARTICULO
// ------------------------------------------------------------------
//
// El temario NO numera igual en todas partes, y esto no es una suposicion: la
// Constitucion usa cifras ("Articulo 82") y la Ley Organica 2/1986 usa letra,
// mezclando ordinales para los nueve primeros y cardinales a partir de ahi
// ("Articulo primero", "Articulo diez", "Articulo cuarenta y uno").
//
// Sin esto, el indice contaba CERO articulos en la LOFCS y respondia "no es un
// texto legal articulado" sobre una ley con 54 articulos. Un dato falso dicho
// con seguridad, que es peor que no tener el dato.

const ORDINALES: Record<string, number> = {
  primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3,
  cuarto: 4, cuarta: 4, quinto: 5, quinta: 5, sexto: 6, sexta: 6,
  septimo: 7, septima: 7, octavo: 8, octava: 8, noveno: 9, novena: 9,
  decimo: 10, decima: 10, undecimo: 11, duodecimo: 12,
};

const HASTA_VEINTINUEVE: Record<string, number> = {
  uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
};

const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
};

const CENTENAS: Record<string, number> = {
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
  novecientos: 900,
};

/**
 * "cuarenta y uno" -> 41. `null` si no es un numero escrito con letra.
 *
 * Suma simple, que es todo lo que hace falta para como se numeran los
 * articulos: centena + decena + unidad, con la "y" de por medio. No pretende
 * ser un conversor general del castellano.
 */
export function palabrasANumero(texto: string): number | null {
  const palabras = sinAcentos(texto.toLowerCase())
    .replace(/[.,;:]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && p !== 'y');

  if (!palabras.length) return null;

  let total = 0;
  for (const p of palabras) {
    const valor = CENTENAS[p] ?? DECENAS[p] ?? HASTA_VEINTINUEVE[p] ?? ORDINALES[p];
    if (valor === undefined) return null;
    total += valor;
  }
  return total > 0 ? total : null;
}

/**
 * El numero de articulo de una referencia, venga en cifra o en letra.
 *
 * Devuelve `null` para lo que no es un articulo —"Disposicion adicional
 * primera", "TITULO II"— y eso es informacion, no un fallo: se cuentan aparte.
 */
export function numeroDeArticulo(referencia: string | null | undefined): number | null {
  const ref = sinAcentos((referencia ?? '').trim().toLowerCase());
  const m = ref.match(/^articulo\s+(.+)$/);
  if (!m) return null;

  const resto = m[1].trim();
  const cifra = resto.match(/^(\d{1,4})\b/);
  if (cifra) return Number(cifra[1]);

  return palabrasANumero(resto);
}

/**
 * El numero de articulo que nombra la pregunta, si nombra alguno.
 *
 * «¿que dice el articulo 27?» -> 27
 * «articulo 168.3»            -> 168  (el apartado no cambia el fragmento)
 * «cuantos articulos tiene»   -> null (no nombra ninguno)
 *
 * Solo reconoce cifras. Los textos legales del temario no son homogeneos —la
 * Constitucion numera con digitos y la LOFCS con letra ("Articulo cuarenta y
 * uno")— y traducir numeros a palabras para adivinar la forma exacta seria
 * inventarse una referencia, que es justo lo que costo P1f. Cuando no hay
 * coincidencia exacta no pasa nada: la busqueda semantica sigue corriendo.
 */
export function articuloPedido(query: string): number | null {
  const q = sinAcentos(normalize(query));

  const cifra = q.match(/\bart(?:iculo|\.|s?\b)\s*(\d{1,3})/);
  if (cifra) {
    const n = Number(cifra[1]);
    return n > 0 && n < 1000 ? n : null;
  }

  // Escrito con letra: "el articulo cuarenta y uno". Se toman como mucho cuatro
  // palabras ("ciento cuarenta y dos") y se para en la primera que no sea un
  // numero, que es lo que evita tragarse media pregunta.
  const letra = q.match(/\bart(?:iculo|\.)\s+([a-z\s]+)/);
  if (!letra) return null;

  const palabras = letra[1].trim().split(/\s+/);
  for (let n = Math.min(4, palabras.length); n > 0; n--) {
    const valor = palabrasANumero(palabras.slice(0, n).join(' '));
    if (valor !== null) return valor;
  }
  return null;
}

/** Lo que se pregunta SOBRE el documento, no sobre lo que dice. */
const PALABRAS_DE_RECUENTO = ['cuantos', 'cuantas', 'numero de', 'cuantos articulos', 'consta de', 'se compone', 'se estructura', 'estructura de'];
const PARTES_DEL_DOCUMENTO = ['articulo', 'articulos', 'titulo', 'titulos', 'capitulo', 'capitulos', 'seccion', 'secciones', 'disposicion', 'disposiciones'];

/**
 * ¿Pregunta por la ESTRUCTURA del documento en vez de por su contenido?
 *
 * Deliberadamente estrecha: pide una palabra de recuento Y una parte del
 * documento. «¿cuantos dias de plazo hay?» no entra —"dias" no es una parte del
 * documento— y «¿que dice el articulo 27?» tampoco, porque no hay recuento.
 * Un falso positivo aqui solo anade una fuente mas al prompt; un falso negativo
 * deja las cosas como estaban.
 */
export function esPreguntaDeEstructura(query: string): boolean {
  const q = sinAcentos(normalize(query));
  if (!q) return false;
  const hayRecuento = PALABRAS_DE_RECUENTO.some((p) => q.includes(p));
  if (!hayRecuento) return false;
  return PARTES_DEL_DOCUMENTO.some((p) => new RegExp(`\\b${p}\\b`).test(q));
}


/**
 * Las partes en las que se divide un documento: titulos, capitulos y secciones.
 *
 * POR QUE NO SALE DEL INDICE DE FRAGMENTOS
 * `document_chunks.reference` guarda el ARTICULO del que viene cada fragmento,
 * y nada mas. Preguntar "¿cuantos titulos tiene la Constitucion?" no lo
 * contestaba nadie: ni la busqueda semantica (ningun articulo lo dice) ni el
 * recuento de articulos. Pero los encabezados estan en el texto guardado, y
 * contarlos es leer, no adivinar.
 */
export type EstructuraDocumento = {
  /** Los titulos, en el orden en que aparecen. */
  titulos: string[];
  /** Capitulos, contados como pares titulo->capitulo. Ver abajo por que. */
  capitulos: number;
  secciones: number;
  /**
   * Cuantos capitulos cuelgan de cada titulo, solo para los que tienen alguno.
   *
   * Sin esto, "¿cuantos capitulos tiene el Titulo I?" se queda sin responder
   * aunque el dato este delante: el total no sirve para esa pregunta.
   */
  capitulosPorTitulo: { titulo: string; capitulos: number }[];
};

const RE_ENCABEZADO =
  /(T[ÍI]TULO\s+(?:PRELIMINAR|[IVXLC]+)|CAP[ÍI]TULO\s+(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO|[IVXLC]+)|Secci[óo]n\s+[0-9]+\.?ª?)/g;

/**
 * Cuenta las partes de un documento a partir de su texto.
 *
 * DOS COSAS QUE NO SON OBVIAS, y las dos salieron de mirar el BOE de verdad:
 *
 * 1. **Los capitulos se cuentan como pares titulo->capitulo.** Sus nombres se
 *    REPITEN entre titulos: la Constitucion tiene un "CAPITULO PRIMERO" dentro
 *    del Titulo I, otro dentro del III y otro dentro del VIII. Contar nombres
 *    distintos daria 5 cuando son 11.
 *
 * 2. **El PDF trae su propio indice al principio**, asi que cada encabezado
 *    aparece dos veces. Comparar pares lo arregla solo: el par ya visto no
 *    entra otra vez. Por eso tampoco se pueden contar las apariciones sueltas,
 *    que darian el doble.
 *
 * Comprobado contra el temario real: Constitucion 11 titulos (Preliminar y I a
 * X), 11 capitulos y 2 secciones; LOFCS 5, 14 y 4; unos apuntes, 0 de todo —
 * que es lo correcto, porque no tienen esa estructura.
 */
export function resumeEstructura(fullText: string): EstructuraDocumento {
  const texto = fullText ?? '';
  const titulos: string[] = [];
  const vistosTitulo = new Set<string>();
  const capitulos = new Set<string>();
  const secciones = new Set<string>();

  // Un documento sin titulos (unos apuntes) deja el cajon de sastre, y asi sus
  // capitulos sueltos —si los tuviera— siguen contandose una sola vez.
  let tituloActual = '(sin título)';

  for (const m of texto.matchAll(RE_ENCABEZADO)) {
    const encabezado = m[1].replace(/\s+/g, ' ').trim();

    if (/^t[ií]tulo/i.test(encabezado)) {
      tituloActual = encabezado;
      if (!vistosTitulo.has(encabezado)) {
        vistosTitulo.add(encabezado);
        titulos.push(encabezado);
      }
    } else if (/^cap[ií]tulo/i.test(encabezado)) {
      capitulos.add(`${tituloActual} > ${encabezado}`);
    } else {
      secciones.add(`${tituloActual} > ${encabezado}`);
    }
  }

  const porTitulo = new Map<string, number>();
  for (const par of capitulos) {
    const titulo = par.split(' > ')[0];
    porTitulo.set(titulo, (porTitulo.get(titulo) ?? 0) + 1);
  }

  return {
    titulos,
    capitulos: capitulos.size,
    secciones: secciones.size,
    // En el orden del documento, no en el que los vaya devolviendo el mapa.
    capitulosPorTitulo: titulos
      .filter((t) => porTitulo.has(t))
      .map((t) => ({ titulo: t, capitulos: porTitulo.get(t) as number })),
  };
}

/**
 * ¿La pregunta va de las partes internas (titulos, capitulos, secciones)?
 *
 * Se distingue de `esPreguntaDeEstructura` porque cuesta dinero saberlo: los
 * articulos se cuentan con las referencias, que son cadenas de dos palabras,
 * pero los titulos hay que leerlos del TEXTO COMPLETO de cada documento. Solo
 * se trae ese texto cuando la pregunta lo pide.
 */
export function pidePartesInternas(query: string): boolean {
  const q = sinAcentos(normalize(query));
  return /\b(titulo|titulos|capitulo|capitulos|seccion|secciones)\b/.test(q);
}

/** Lo que el indice sabe de un documento. */
export type IndiceDocumento = {
  /** Titulo del tema al que pertenece. `null` si no se pudo resolver. */
  tema: string | null;
  filename: string;
  /** Cuantos articulos DISTINTOS se han indexado. */
  articulos: number;
  primero: number | null;
  ultimo: number | null;
  /** Numeros que faltan dentro del rango. Si los hay, el recuento es un minimo. */
  huecos: number[];
  /** Referencias que no son un articulo numerado: disposiciones, sobre todo. */
  otras: string[];
  /**
   * Titulos, capitulos y secciones. `null` cuando no se ha mirado: solo se lee
   * el texto completo si la pregunta va de eso.
   */
  estructura?: EstructuraDocumento | null;
};

/**
 * Resume las referencias de un documento.
 *
 * `huecos` es la parte que importa: si el troceado se dejo articulos por el
 * camino, el recuento NO es el numero de articulos de la norma, es el de los
 * que hay indexados. Decirlo como si fuera lo mismo seria exactamente el fallo
 * de P1f: un dato falso dicho con seguridad.
 */
export function resumeIndice(referencias: (string | null | undefined)[]): {
  articulos: number;
  primero: number | null;
  ultimo: number | null;
  huecos: number[];
  otras: string[];
} {
  const numeros = new Set<number>();
  const otras = new Set<string>();

  for (const r of referencias) {
    const ref = r?.trim();
    if (!ref) continue;
    const n = numeroDeArticulo(ref);
    if (n !== null) numeros.add(n);
    else otras.add(ref);
  }

  const lista = [...numeros].sort((a, b) => a - b);
  if (lista.length === 0) {
    return { articulos: 0, primero: null, ultimo: null, huecos: [], otras: [...otras] };
  }

  const primero = lista[0];
  const ultimo = lista[lista.length - 1];
  const presentes = new Set(lista);
  const huecos: number[] = [];
  for (let i = primero; i <= ultimo; i++) if (!presentes.has(i)) huecos.push(i);

  return { articulos: lista.length, primero, ultimo, huecos, otras: [...otras] };
}

/**
 * La estructura de un documento, en palabras.
 *
 * DISTINGUE EL TITULO PRELIMINAR de los numerados, y no es un adorno: en la
 * Constitucion son "un Titulo Preliminar y diez numerados", y responder "once
 * titulos" a secas es caer justo en la confusion que pregunta el tribunal. El
 * dato es el mismo; decirlo mal lo convierte en una trampa.
 */
function describeEstructura(e: EstructuraDocumento): string {
  const preliminares = e.titulos.filter((t) => /preliminar/i.test(t)).length;
  const numerados = e.titulos.length - preliminares;

  const comoSeCuentan =
    preliminares > 0
      ? `${e.titulos.length} titulos en total: ${preliminares === 1 ? 'el Preliminar' : `${preliminares} preliminares`} y ${numerados} numerados`
      : `${e.titulos.length} titulos`;

  const partes = [`se divide en ${comoSeCuentan} (${e.titulos.join(', ')})`];

  if (e.capitulos) {
    const desglose = e.capitulosPorTitulo
      .map((c) => `${c.titulo}: ${c.capitulos}`)
      .join('; ');
    partes.push(`${e.capitulos} capitulos en total (${desglose})`);
  }
  if (e.secciones) partes.push(`${e.secciones} secciones`);

  return partes.join('; ');
}

/** Cuantos huecos se enumeran antes de resumirlos. Un prompt no es un listado. */
const MAX_HUECOS_LISTADOS = 12;

/**
 * El indice, en el texto que se le pasa al modelo como una fuente mas.
 *
 * Se etiqueta como RECUENTO DE LO INDEXADO y no como texto de la norma, a
 * proposito: el modelo tiene que poder decir de donde sale el numero, porque no
 * sale de ningun articulo.
 */
export function formatIndice(docs: IndiceDocumento[]): string {
  if (!docs.length) return '';

  const lineas = docs.map((d) => {
    const nombre = d.tema ? `${d.tema} (${d.filename})` : d.filename;
    if (d.articulos === 0) {
      const sinArticulos = d.otras.length
        ? `sin articulos numerados; ${d.otras.length} referencias de otro tipo`
        : 'sin articulos numerados (no es un texto legal articulado)';
      const conTitulos = d.estructura?.titulos.length
        ? `; aun asi se divide en ${d.estructura.titulos.length} titulos`
        : '';
      return `- ${nombre}: ${sinArticulos}${conTitulos}.`;
    }

    const partes = [`${d.articulos} articulos indexados, del ${d.primero} al ${d.ultimo}`];
    if (d.estructura?.titulos.length) partes.push(describeEstructura(d.estructura));
    if (d.huecos.length) {
      const muestra = d.huecos.slice(0, MAX_HUECOS_LISTADOS).join(', ');
      const resto = d.huecos.length > MAX_HUECOS_LISTADOS ? `, y ${d.huecos.length - MAX_HUECOS_LISTADOS} mas` : '';
      partes.push(`FALTAN ${d.huecos.length} en ese rango (${muestra}${resto}), asi que el recuento es un MINIMO`);
    } else {
      partes.push('sin huecos en ese rango');
    }
    if (d.otras.length) partes.push(`ademas ${d.otras.length} disposiciones u otras referencias`);

    return `- ${nombre}: ${partes.join('; ')}.`;
  });

  return [
    'RECUENTO DE LO INDEXADO EN EL TEMARIO (no es texto de la norma: sale del',
    'indice de fragmentos, contando de que articulo viene cada uno).',
    ...lineas,
  ].join('\n');
}


// ============================================================
// EL PROMPT
// ============================================================

/**
 * Como se nombra el indice cuando entra como fuente. Lo usan la accion y el
 * prompt, asi que vive con el prompt.
 */
export const FUENTE_INDICE = 'Índice del temario';

/**
 * El prompt del chat.
 *
 * Vive aqui, y no dentro de la accion, por lo de siempre (regla 21): asi se
 * puede leer, testear y —sobre todo— PROBAR CONTRA EL MODELO DE VERDAD sin
 * levantar la aplicacion (`node scripts/probar-chat.mjs`). Un prompt que solo
 * se puede ejecutar en produccion es un prompt que nadie revisa.
 *
 * QUE CAMBIO Y POR QUE
 * La version anterior OBLIGABA a rellenar secciones fijas respondiera lo que
 * respondiera. El resultado, con una pregunta real de un alumno:
 *
 *   «¿Cuantos articulos tiene la Constitucion?»
 *   -> "ASPIRANTE, PROCEDO A ANALIZAR SU CONSULTA. …no consta en el temario
 *       oficial aportado [1], [2], [3], [4], [5], [6]." + cuatro "trampas de
 *       examen" sobre la reforma constitucional, que nadie habia preguntado.
 *
 * Tres normas del prompt viejo lo provocaban: CITAS OBLIGATORIAS (citaba seis
 * fuentes para respaldar que no sabia nada), CIERRE OBLIGATORIO (soltaba las
 * trampas aunque no hubiera contestado) y una ESTRUCTURA fija que convertia un
 * dato en una ficha entera. Ahora todo es proporcional y condicional.
 */
export function buildChatPrompt(params: {
  contexto: string;
  conversacion: string;
  pregunta: string;
}): string {
  const { contexto, conversacion, pregunta } = params;

  return `
ERES ATENEA, el sistema de estudio de una academia de oposiciones a Policía Nacional.
Le respondes a un opositor que está estudiando. Habla claro y al grano, como un
buen profesor: sin fórmulas de tratamiento, sin anunciar lo que vas a hacer y sin
adornos militares.

CONTEXTO OFICIAL (lo único de lo que puedes sacar datos):
"""
${contexto}
"""
${conversacion ? `\nCONVERSACIÓN PREVIA (solo para saber a qué se refiere con "eso" o "en ese caso"; NO es fuente):\n"""\n${conversacion}\n"""\n` : ''}
CÓMO RESPONDER:

1. RESPONDE EN LA PRIMERA LÍNEA. Si te preguntan un dato, das el dato:
   "La Constitución tiene 169 artículos." Nada de preámbulos.

2. LA LONGITUD LA MARCA LA PREGUNTA. Un dato se responde en una o dos frases.
   Un "explícame" admite desarrollo. No rellenes para parecer completo: al
   opositor le sobra el texto, le falta tiempo.

3. SOLO EL CONTEXTO. Si la respuesta no está ahí, dilo en UNA frase y PARA:
   sin citas, sin secciones y sin trampas de examen. Si el contexto trae algo
   cercano que sí le sirva, ofrécelo en otra frase ("sí puedo decirte que…").

4. CITAS. Al final de la frase que sostiene, entre corchetes y SOLO el número:
   [1]. Nada más dentro del corchete.
   Y cuando la fuente traiga artículo, nómbralo en la prosa LA PRIMERA VEZ que
   lo uses —"El artículo 5 de la LOFCS exige…"—, no en cada línea: repetirlo en
   todas las viñetas es ruido. Un [1] suelto no le dice a nadie qué releer; el
   número del artículo sí.
   Nunca inventes un artículo que no venga en la cabecera de la fuente. Y nunca
   pongas citas detrás de un "no consta": citar seis fuentes para respaldar que
   no sabes algo es ruido.

5. LA FUENTE «${FUENTE_INDICE}» NO ES TEXTO DE LA NORMA: es el recuento de lo
   que la plataforma tiene indexado. Úsala para decir cuántos artículos o
   disposiciones hay, aclarando que sale del índice del temario. Si esa fuente
   avisa de que faltan artículos en el rango, el número es un MÍNIMO y lo dices.

6. FORMATO: usa viñetas o una tabla solo si hay varias cosas que comparar. Para
   una respuesta corta, prosa.

7. CIERRE OPCIONAL. Si —y solo si— has respondido y existe una confusión REAL y
   concreta con este contenido (un plazo que cambia, dos figuras que se
   parecen, una excepción), añade al final:
   **🎯 FOCO EXAMEN**
   con 1 a 3 puntos, cada uno de una línea. Si no hay ninguna de verdad, no
   pongas la sección: una sección de relleno enseña a saltársela.

PREGUNTA:
"${pregunta}"
`.trim();
}

/**
 * Una fuente recuperada, en lo que hace falta para nombrarla.
 *
 * El tipo completo (`Chunk`) vive en la accion porque lo devuelve PostgREST;
 * aqui solo se declara lo que se lee, que es lo que permite testear esto sin
 * base de datos.
 */
export type SourceRef = {
  filename: string;
  /**
   * De que articulo sale: «Artículo 37», «Disposición adicional primera»…
   * `null` cuando el documento no es un texto legal, y `undefined` mientras
   * `match_document_chunks` no devuelva la columna
   * (docs/sql/P1g-referencia-en-la-busqueda.sql).
   */
  reference?: string | null;
};

/**
 * Como se nombra una fuente delante del alumno.
 *
 * El nombre del fichero —«TEMA 9 - La Ley Organica 2-1986 - de 13 de marzo - de
 * Fuerzas y Cuerpos de Seguridad»— no le dice a un opositor QUE RELEER. El
 * articulo si. Se antepone la referencia cuando existe y el fichero se queda
 * detras como respaldo: unos apuntes no tienen articulos.
 *
 * Vive aqui y no en la accion por dos motivos: un fichero `'use server'` solo
 * puede exportar funciones async, y esto es logica pura (regla 21).
 */
export function citaDe(fuente: SourceRef): string {
  const referencia = fuente.reference?.trim();
  return referencia ? `${referencia} · ${fuente.filename}` : fuente.filename;
}
