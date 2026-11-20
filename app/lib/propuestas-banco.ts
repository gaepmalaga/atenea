/**
 * LAS MEJORAS DEL BANCO QUE PROPONE CLAUDE (regla 138, fase 2).
 *
 * Nada de esto toca una pregunta: produce el «después» de una PROPUESTA que
 * un tutor aprueba o rechaza. Dos arreglos, puros (regla 21):
 *
 * 1. «Según el texto proporcionado»: unas 730 preguntas activas se generaron
 *    a partir de un fragmento del temario y lo citan como si el alumno lo
 *    tuviera delante. Se quita la frase y, si se sabe con seguridad de qué ley
 *    y artículo es, se pone («según el artículo 69 del Reglamento General de
 *    Circulación»). Si no se sabe, se quita sin inventar.
 *
 * 2. La referencia legal: la que falta o la que solo dice «Artículo 2» se
 *    completa con la norma (`Art. 2 LO 4/2015`) cuando la norma sale de algo
 *    seguro: la propia pregunta, su explicación, el tema o el texto del BOE.
 */

import { preceptoLegible, nombreCorto } from './normativa.ts';

// ---------------------------------------------------------------------------
// Cómo se nombra una norma dentro de una frase
// ---------------------------------------------------------------------------

const LARGOS: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^CE$|^Constituci[oó]n( Espa[nñ]ola)?$/, () => 'la Constitución'],
  [/^C[oó]digo Penal$/, () => 'el Código Penal'],
  [/^C[oó]digo Civil$/, () => 'el Código Civil'],
  [/^LECrim$|^Ley de Enjuiciamiento Criminal$/, () => 'la Ley de Enjuiciamiento Criminal'],
  [/^RDLeg 5\/2015$|^Texto refundido del Estatuto B[aá]sico del Empleado P[uú]blico$/i, () => 'el texto refundido del Estatuto Básico del Empleado Público'],
  [/^LO (.+)$/, (m) => `la Ley Orgánica ${m[1]}`],
  [/^Ley (\d.+)$/, (m) => `la Ley ${m[1]}`],
  [/^RDL (.+)$/, (m) => `el Real Decreto-ley ${m[1]}`],
  [/^RDLeg (.+)$/, (m) => `el Real Decreto Legislativo ${m[1]}`],
  [/^RD (.+)$/, (m) => `el Real Decreto ${m[1]}`],
  [/^Orden (.+)$/, (m) => `la Orden ${m[1]}`],
  [/^(Reglamento|Directiva|Decisión) (.+)$/, (m) => `${m[1] === 'Directiva' || m[1] === 'Decisión' ? 'la' : 'el'} ${m[1]} ${m[2]}`],
  // Nombres del manifiesto del temario: «Reglamento General de Circulación», «Estatuto Orgánico del Ministerio Fiscal».
  [/^(Ley|Constitución|Orden|Convención|Instrucción|Resolución) (.+)$/, (m) => `la ${m[1]} ${m[2]}`],
  [/^(Reglamento|Estatuto|Real Decreto|Código|Convenio|Protocolo|Texto) (.+)$/, (m) => `el ${m[1] === 'Texto' ? 'texto' : m[1]} ${m[2]}`],
];

/** «la Ley Orgánica 4/2000», «el Código Penal»… `null` si no se sabe nombrarla con seguridad. */
export function normaConArticulo(norma: string | null | undefined): string | null {
  const n = (norma ?? '').trim();
  if (!n) return null;
  for (const [re, f] of LARGOS) {
    const m = re.exec(n);
    if (m) return f(m);
  }
  return null;
}

/** «de la Ley Orgánica 4/2000», «del Código Penal». */
export function deLaNorma(norma: string | null | undefined): string | null {
  const con = normaConArticulo(norma);
  if (!con) return null;
  return con.startsWith('el ') ? `del ${con.slice(3)}` : `de ${con}`;
}

/** «el artículo 69», «la disposición adicional 11.ª». */
export function preceptoConArticulo(precepto: string): string {
  const l = preceptoLegible(precepto).replace(/^art\. /, 'artículo ');
  return l.startsWith('disposición') ? `la ${l}` : l === 'preámbulo' ? 'el preámbulo' : `el ${l}`;
}

// ---------------------------------------------------------------------------
// 1. «Según el texto proporcionado»
// ---------------------------------------------------------------------------

const FR = String.raw`(?:texto|fragmento|documento|extracto)\s+(?:legal\s+|normativo\s+)?(?:proporcionado|adjunto|facilitado|suministrado|aportado)|texto\s+legal\s+propuesto`;
/** «Según el», «De acuerdo con el», «Conforme al», «Conforme a lo dispuesto en el», «Con arreglo al»… hasta el artículo determinado. */
const PREP_EL = String.raw`(?:[Ss]egún\s+(?:lo\s+(?:dispuesto|establecido)\s+en\s+)?el|[Dd]e\s+acuerdo\s+con\s+(?:lo\s+(?:dispuesto|establecido)\s+en\s+)?el|[Cc]onforme\s+(?:a\s+lo\s+(?:dispuesto|establecido)\s+en\s+el|al)|[Dd]e\s+conformidad\s+con\s+(?:lo\s+(?:dispuesto|establecido)\s+en\s+)?el|[Cc]on\s+arreglo\s+al|[Ss]egún\s+se\s+(?:indica|establece|recoge)\s+en\s+el)`;
const ARTICULO = String.raw`[Aa]rt[íi]culo\s+\d+[\w.º]*(?:\s+(?:bis|ter|quater))?`;

/** ¿Habla de un «texto proporcionado» que el alumno no tiene delante? */
export function hablaDeUnTexto(texto: string | null | undefined): boolean {
  return new RegExp(FR, 'i').test(texto ?? '');
}

export type Cita = { norma: string | null; precepto: string | null };

const mayuscula = (s: string) => s.replace(/^(¿?\s*)(\p{Ll})/u, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * Quita «según el texto proporcionado» y sus variantes. Con la norma y el
 * precepto seguros, los pone en su sitio; si no, quita la frase. Devuelve
 * `null` si queda alguna mención que no sabe arreglar sin tocar el sentido:
 * esa no se propone y queda para el tutor.
 */
export function quitaTextoProporcionado(texto: string, cita: Cita): string | null {
  const norma = cita.norma ? normaConArticulo(cita.norma) : null;
  const deNorma = cita.norma ? deLaNorma(cita.norma) : null;
  const precepto = cita.precepto ? preceptoConArticulo(cita.precepto) : null;
  const fuente = precepto && deNorma ? `${precepto} ${deNorma}` : norma; // «el artículo 69 del Reglamento…» o «la Ley 12/2009»
  let t = texto;

  const articulo = (art: string) => {
    const a = art.replace(/^Art/, 'art');
    return deNorma ? `${a} ${deNorma}` : a;
  };
  // «el Artículo 89 del texto proporcionado» → «el artículo 89 del Código Penal» (o «el artículo 89»).
  t = t.replace(new RegExp(String.raw`(${ARTICULO})\s+del?\s+(?:${FR})`, 'g'), (_, art: string) => articulo(art));
  // «el texto proporcionado del Artículo 83» y «el texto proporcionado (Artículo 47)» → «el artículo 83 del Código Penal».
  t = t.replace(new RegExp(String.raw`\b(el|al)\s+(?:${FR})\s+(?:del?\s+|\()(${ARTICULO})\)?`, 'g'), (_, el: string, art: string) => `${el} ${articulo(art)}`);
  // «el texto proporcionado, que forma parte del Artículo 108,» → «el artículo 108 del Real Decreto 137/1993,».
  t = t.replace(new RegExp(String.raw`\b(el|al)\s+(?:${FR})\s*,?\s*que\s+(?:forma\s+parte\s+del|corresponde\s+al|pertenece\s+al|reproduce\s+el|recoge\s+el)\s+(${ARTICULO})`, 'g'), (_, el: string, art: string) => `${el} ${articulo(art)}`);

  // Al principio: «¿Según el texto proporcionado sobre X, …» → «¿Sobre X, …»; «Según el texto proporcionado, …» → «Según el artículo 69 del…, …» o nada.
  t = t.replace(
    new RegExp(String.raw`^(¿?\s*)${PREP_EL}\s+(?:${FR})(\s+(?:sobre|acerca de|en relación con|relativo a)\s+[^,?]+)?\s*,\s*`),
    (_, q: string, sobre?: string) => {
      if (sobre) return `${q}${sobre.trim().replace(/^en relación con/, 'En relación con').replace(/^(\p{Ll})/u, (c) => c.toUpperCase())}, `;
      return fuente ? `${q}Según ${fuente}, ` : q;
    },
  );

  // En medio o al final: «…, según el texto proporcionado?» → «…, según el artículo 69 del…?» o nada.
  t = t.replace(
    new RegExp(String.raw`,?\s*(?:y\s+)?${PREP_EL}\s+(?:${FR})(?=\s*[?:.,;)]|\s*$)`, 'g'),
    () => (fuente ? `, según ${fuente}` : ''),
  );

  // «en el texto proporcionado», «del texto proporcionado», «el texto proporcionado»: solo con la norma segura.
  if (norma) {
    t = t.replace(new RegExp(String.raw`\ben el\s+(?:${FR})`, 'g'), `en ${norma}`);
    t = t.replace(new RegExp(String.raw`\bdel\s+(?:${FR})`, 'g'), deNorma ?? `de ${norma}`);
    t = t.replace(new RegExp(String.raw`\bel\s+(?:${FR})`, 'g'), norma);
  }

  // Sin la norma, «del texto proporcionado» y «en el texto proporcionado» detrás
  // de un apartado o una disposición se pueden quitar sin cambiar el sentido.
  if (!norma) t = t.replace(new RegExp(String.raw`,?\s+(?:del|en el)\s+(?:${FR})(?=\s*[,.;:)?]|\s+se\b)`, 'g'), '');

  if (hablaDeUnTexto(t)) return null; // queda alguna que no se sabe arreglar
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:?])/g, '$1').replace(/,\s*,/g, ',').replace(/¿\s+/g, '¿').trim();
  t = mayuscula(t);
  return t === texto ? null : t;
}

// ---------------------------------------------------------------------------
// 2. La referencia legal
// ---------------------------------------------------------------------------

/** «Art. 69 RD 1428/2003», «Art. 8 ter RD 207/2024», «DA 11.ª Ley 40/2015». La forma corta que ya usa el banco. */
export function referenciaCorta(norma: string, precepto: string): string {
  const [tipo, num = ''] = precepto.split(':');
  const corta = nombreCorto(norma);
  if (tipo === 'art') return `Art. ${preceptoLegible(precepto).replace(/^art\. /, '')} ${corta}`;
  if (tipo === 'anexo') return `Anexo ${num} ${corta}`;
  if (tipo === 'preambulo') return `Preámbulo ${corta}`;
  const abrev = { da: 'DA', dt: 'DT', df: 'DF', dd: 'DD' }[tipo] ?? tipo.toUpperCase();
  return `${abrev} ${num === 'unica' ? 'única' : `${num}.ª`} ${corta}`;
}

/**
 * Qué CLASE de precepto dice una referencia que no trae número («disposición
 * adicional», «anexo», «preámbulo»): el artículo que se deduzca tiene que ser
 * de esa clase. `null` si la referencia no dice ninguna.
 */
export function claseDePrecepto(referencia: string | null | undefined): ((clave: string) => boolean) | null {
  const r = (referencia ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!r.trim()) return null;
  if (/disposicion/.test(r)) {
    if (/adicional/.test(r)) return (c) => c.startsWith('da:');
    if (/transitoria/.test(r)) return (c) => c.startsWith('dt:');
    if (/final/.test(r)) return (c) => c.startsWith('df:');
    if (/derogatoria/.test(r)) return (c) => c.startsWith('dd:');
    return (c) => /^d[atfd]:/.test(c);
  }
  if (/anexo/.test(r)) return (c) => c.startsWith('anexo');
  if (/preambulo|exposicion de motivos/.test(r)) return (c) => c === 'preambulo';
  if (/\bart(iculo|\.)/.test(r)) return (c) => c.startsWith('art:');
  return null;
}

/** «sacado de el tema» → «sacado del tema». */
export const deCon = (como: string): string => (como.startsWith('el ') ? `del ${como.slice(3)}` : `de ${como}`);

/**
 * Los artículos que una explicación o un enunciado nombran («El Artículo 64
 * bis.2 establece…»). Los que el texto atribuye a una ley con nombre («el
 * artículo 31.1 del Real Decreto 1065/2007») NO: serían de esa ley, y
 * deducir otra por el tema sería inventarse la cita.
 */
export function articulosNombrados(texto: string | null | undefined): string[] {
  const out = new Set<string>();
  const re = /\b[Aa]rt(?:[íi]culo|\.)\s+(\d{1,4})(?:[\s.]*(bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)\b(?:\s+([a-n])(?=\s*$|[.,;:]|\s+(?:de|del|y|o|LECrim)\b))?)?/g;
  for (const m of (texto ?? '').matchAll(re)) {
    const detras = (texto ?? '').slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (DE_UNA_LEY.test(detras)) continue;
    out.add(`art:${Number(m[1])}${m[2] ?? ''}${m[3] ?? ''}`);
  }
  return [...out];
}
const DE_UNA_LEY = /^[\d.º°ª,\s]*(?:[a-z]\)\s*)?(?:del?|de\s+la)\s+(?:Real\s+Decreto|Decreto|Ley|LO\b|RD\b|C[óo]digo|Reglamento|Orden|Constituci[óo]n|Directiva|Estatuto|Texto|Convenio|Tratado)/;

// ---------------------------------------------------------------------------
// Parecido de texto (para saber de qué artículo sale una pregunta)
// ---------------------------------------------------------------------------

const VACIAS = new Set('el la los las de del al a en y o u que se por para con sin su sus un una unos unas lo como es son ser será serán no ni más menos este esta estos estas ese esa dicho dicha cual cuales cuál cuáles qué quién según caso casos podrá podrán deberá deberán así entre sobre otro otra otros otras todo toda todos todas cada mismo misma ya le les'.split(' '));

/** Las palabras con significado de un texto, sin tildes ni palabras vacías. */
export function palabras(texto: string): Set<string> {
  return new Set(
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .split(/[^a-zñ0-9]+/).filter((w) => w.length > 3 && !VACIAS.has(w)),
  );
}

/**
 * Lo mínimo que la pregunta (enunciado + correcta) tiene que parecerse al
 * artículo para dar por buena una ley DEDUCIDA (del tema o de la
 * explicación). Por debajo, la deducción puede ser una casualidad de números.
 */
export const PARECIDO_MINIMO = 0.3;

/** Cuánto del texto de la pregunta (enunciado + correcta) aparece en el del artículo: 0 a 1. */
export function cobertura(pregunta: Set<string>, articulo: Set<string>): number {
  if (pregunta.size === 0) return 0;
  let n = 0;
  for (const w of pregunta) if (articulo.has(w)) n++;
  return n / pregunta.size;
}

/**
 * El artículo del que sale una pregunta, si destaca de verdad: el mejor tiene
 * que cubrir al menos la mitad de las palabras de la pregunta y sacar al
 * segundo una ventaja clara. Si no, `null`: mejor sin referencia que con una
 * inventada.
 */
export function mejorArticulo(pregunta: Set<string>, candidatos: { clave: string; palabras: Set<string> }[], minimo = 0.5, ventaja = 0.15): { clave: string; cobertura: number } | null {
  const puntos = candidatos.map((c) => ({ clave: c.clave, cobertura: cobertura(pregunta, c.palabras) })).sort((a, b) => b.cobertura - a.cobertura);
  const [primero, segundo] = puntos;
  if (!primero || primero.cobertura < minimo) return null;
  if (segundo && primero.cobertura - segundo.cobertura < ventaja) return null;
  return primero;
}
