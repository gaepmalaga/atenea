/**
 * LA VIGILANCIA DE LA NORMATIVA (regla 137).
 *
 * POR QUÉ EXISTE
 * Una pregunta de la oposición es un hecho de una ley en una fecha. La ley
 * cambia —el Código Penal varias veces al año, la LECrim con cada reforma de la
 * justicia, el Reglamento de extranjería entero en 2024— y la pregunta no se
 * entera: el alumno estudia una redacción derogada con toda la seguridad del
 * mundo, y nadie lo ve hasta que un examen lo pregunta al revés.
 *
 * El BOE publica la legislación consolidada con una API abierta: cada norma
 * partida en bloques (un artículo, una disposición), y cada bloque con TODAS
 * sus versiones, la norma que lo cambió y la fecha en que entra en vigor. La
 * Oficina de Publicaciones de la UE (Cellar) dice, por SPARQL, qué actos
 * modifican cada reglamento o directiva. Con eso se puede saber, para cada
 * pregunta, si el artículo que cita ha cambiado DESPUÉS de escribirla.
 *
 * QUÉ HACE ESTE MÓDULO (puro, regla 21)
 *   · reconoce la norma y el precepto de una referencia («Art. 69.3 Ley
 *     40/2015», «DA 11.ª Ley 40/2015», «Art. 9.3 CE»);
 *   · cuando la referencia solo dice «Artículo 2» —unas 3.600 del banco, las
 *     que salieron del temario por temas— deduce la ley del tema con el
 *     manifiesto (`temario/temario.json`), que dice qué norma y qué artículos
 *     entran en cada uno; si dos normas del tema tienen ese artículo, no
 *     adivina: la cuenta como «sin localizar»;
 *   · lee el XML del texto consolidado y lo indexa por precepto (por el
 *     ROTULO del bloque, no por su id: cada norma numera sus ids a su manera);
 *   · decide qué versiones de un precepto son posteriores a la pregunta y
 *     redacta el aviso.
 *
 * QUÉ NO HACE: no toca las preguntas. El aviso entra en la cola de
 * «Moderación» como un reporte (`question_reports`, tipo `vigencia`) y quien
 * sabe decide: sigue valiendo, se corrige o se retira. Un cambio en el
 * artículo no significa que la pregunta esté mal —a menudo cambia otro
 * apartado—, y esconderla sola podría vaciar un tema de un día para otro.
 */

/** Fecha `AAAAMMDD`, que es como la da el BOE y como se comparan aquí. */
export type Fecha8 = string;

/** Una cita de una pregunta: la norma (por su nombre corto) y el precepto. */
export type CitaReferencia = {
  /** Nombre corto canónico: «Ley 40/2015», «LO 4/2000», «CE», «Reglamento (UE) 2016/399». `null` si la referencia no la nombra. */
  norma: string | null;
  /** Clave del precepto: «art:69», «art:8ter», «da:11», «dt:unica», «anexo:2», «preambulo». `null` si cita la norma entera. */
  precepto: string | null;
};

export type Cita = CitaReferencia & {
  /** Identificador BOE ya conocido (deducido del tema). Si es null, se resuelve por el nombre. */
  boe: string | null;
  /** De dónde salió la norma: la propia referencia o el tema de la pregunta. */
  origen: 'referencia' | 'tema';
  /** Si el tema deja varias normas posibles, cuáles (se decide mirando cuál tiene el precepto). */
  candidatas?: { boe: string; nombre: string }[];
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const normal = (t: string) => sinTildes(t).toLowerCase().replace(/[º°ª]/g, (c) => (c === 'ª' ? 'a' : 'o'));

// ---------------------------------------------------------------------------
// Ordinales (los rótulos del BOE: «Disposición adicional decimotercera»,
// «Artículo vigésimo primero»). `palabrasANumero` de chat.ts llega a duodécimo
// y en masculino: aquí hacen falta los compuestos y el femenino.
// ---------------------------------------------------------------------------

const UNIDADES_ORD: Record<string, number> = {
  primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5,
  sexto: 6, septimo: 7, setimo: 7, octavo: 8, noveno: 9,
};
const DECENAS_ORD: Record<string, number> = {
  decimo: 10, vigesimo: 20, trigesimo: 30, cuadragesimo: 40, quincuagesimo: 50,
  sexagesimo: 60, septuagesimo: 70, octogesimo: 80, nonagesimo: 90, centesimo: 100,
};
const SUELTOS_ORD: Record<string, number> = { undecimo: 11, duodecimo: 12 };

/** «primera», «undécima», «decimotercera», «vigésima primera» → número. `null` si no es un ordinal. */
export function ordinalANumero(texto: string): number | null {
  // Al masculino: «-a» final → «-o» (primera → primero, decimotercera → decimotercero).
  const palabras = normal(texto).trim().split(/[\s-]+/).filter(Boolean).map((p) => p.replace(/a$/, 'o'));
  if (palabras.length === 0) return null;
  let total = 0;
  for (const p of palabras) {
    if (SUELTOS_ORD[p] !== undefined) { total += SUELTOS_ORD[p]; continue; }
    if (UNIDADES_ORD[p] !== undefined) { total += UNIDADES_ORD[p]; continue; }
    if (DECENAS_ORD[p] !== undefined) { total += DECENAS_ORD[p]; continue; }
    // «decimotercero», «vigesimoprimero»: decena pegada a la unidad.
    const pegada = Object.keys(DECENAS_ORD).find((d) => p.startsWith(d) && UNIDADES_ORD[p.slice(d.length)] !== undefined);
    if (pegada) { total += DECENAS_ORD[pegada] + UNIDADES_ORD[p.slice(pegada.length)]; continue; }
    return null;
  }
  return total > 0 ? total : null;
}

const CARDINALES: Record<string, number> = {
  uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30,
  cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100,
  doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
};

/** «cincuenta y uno» → 51. Hay preguntas que citan así («Artículo cincuenta y uno»). */
export function cardinalANumero(texto: string): number | null {
  const palabras = normal(texto).trim().split(/\s+/).filter((p) => p && p !== 'y');
  if (palabras.length === 0) return null;
  let total = 0;
  for (const p of palabras) {
    if (CARDINALES[p] === undefined) return null;
    total += CARDINALES[p];
  }
  return total;
}

const ROMANOS: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
function romanoANumero(r: string): number | null {
  const s = r.toLowerCase();
  if (!/^[ivxlc]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMANOS[s[i]];
    const sig = ROMANOS[s[i + 1]] ?? 0;
    total += v < sig ? -v : v;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Preceptos
// ---------------------------------------------------------------------------

const SUFIJOS = 'bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies';
const TIPO_DISP: Record<string, string> = { adicional: 'da', transitoria: 'dt', final: 'df', derogatoria: 'dd' };

type Hallazgo = { pos: number; fin: number; claves: string[] };

/** Número de una disposición escrito en cifra («11», «11.ª»), «única» o en ordinal. */
function numeroDisposicion(texto: string): string | null {
  const t = texto.trim();
  if (/^unic[oa]\b/.test(t)) return 'unica';
  const cifra = /^(\d{1,3})\b/.exec(t);
  if (cifra) return String(Number(cifra[1]));
  // Hasta tres palabras: «vigesima primera», «decimo tercera». Sin la puntuación
  // del rótulo: «Disposición adicional undécima. Conflictos…».
  const palabras = t.split(/[\s.,;:]+/).filter(Boolean).slice(0, 3);
  for (let n = palabras.length; n >= 1; n--) {
    const v = ordinalANumero(palabras.slice(0, n).join(' '));
    if (v !== null) return String(v);
  }
  return null;
}

/**
 * Todos los preceptos de un texto, con su posición. Lee «Art. 69.3»,
 * «Arts. 8 y 9», «Art. 8 ter.4» (el 8 ter), «Art. 12.2 bis» (el 12: el «bis»
 * es del apartado), «Artículo primero», «DA 11.ª», «Disposición transitoria
 * única», «Anexo II» y «Preámbulo».
 */
function preceptosEn(textoOriginal: string): Hallazgo[] {
  const t = normal(textoOriginal);
  const hallazgos: Hallazgo[] = [];

  // Artículos en cifra. «Art. 8 ter.4» es el 8 ter; en «Art. 12.2 bis» el
  // «bis» es del apartado, y el artículo es el 12. La LO 4/2000 rotula
  // «Artículo 18.bis», con punto: también es el 18 bis.
  const reArt = new RegExp(`\\b(art(?:iculo)?s?)\\b\\.?\\s*(\\d{1,4})(?:[\\s.]*(${SUFIJOS})\\b)?`, 'g');
  const reLista = new RegExp(`^(?:\\.\\d+[a-z]?)*((?:\\s*(?:,|\\by\\b)\\s*\\d{1,4}(?:\\s*(?:${SUFIJOS})\\b)?(?:\\.\\d+[a-z]?)*)+)`);
  for (const m of t.matchAll(reArt)) {
    const pos = m.index ?? 0;
    const claves = [`art:${Number(m[2])}${m[3] ?? ''}`];
    // Listas y rangos solo con «arts.»: en «art. 5.1 y 2» el «2» es un apartado, no otro artículo.
    if (m[1].endsWith('s')) {
      const cola = t.slice(pos + m[0].length, pos + m[0].length + 60);
      const rango = /^(?:\.\d+[a-z]?)*\s*a\s*(\d{1,4})\b/.exec(cola);
      const lista = rango ? null : reLista.exec(cola);
      if (rango) {
        const desde = Number(m[2]);
        for (let n = desde + 1; n <= Number(rango[1]) && n - desde <= 40; n++) claves.push(`art:${n}`);
      } else if (lista) {
        for (const x of lista[1].matchAll(new RegExp(`(\\d{1,4})(?:\\s*(${SUFIJOS})\\b)?(?:\\.\\d+[a-z]?)*`, 'g'))) {
          claves.push(`art:${Number(x[1])}${x[2] ?? ''}`);
        }
      }
    }
    hallazgos.push({ pos, fin: pos + m[0].length, claves });
  }

  // «Artículo único» (el de los reales decretos que aprueban un reglamento).
  for (const m of t.matchAll(/\barticulo\s+unico\b/g)) hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: ['art:unico'] });

  // Artículos en letra: «Artículo primero», «Artículo vigésimo primero», «Artículo cincuenta y uno».
  for (const m of t.matchAll(/\barticulo\s+([a-z]+(?:\s+[a-z]+){0,3})/g)) {
    const palabras = m[1].split(/\s+/);
    for (let n = palabras.length; n >= 1; n--) {
      const trozo = palabras.slice(0, n).join(' ');
      const v = ordinalANumero(trozo) ?? cardinalANumero(trozo);
      if (v !== null) { hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: [`art:${v}`] }); break; }
    }
  }

  // Disposiciones escritas: «disposición adicional undécima», «disp. final 1.ª».
  for (const m of t.matchAll(/\b(?:disposicion(?:es)?|disp\.?)\s+(adicional|transitoria|final|derogatoria)\s+([a-z0-9 .]+)/g)) {
    const num = numeroDisposicion(m[2]);
    if (num) hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: [`${TIPO_DISP[m[1]]}:${num}`] });
  }
  // Abreviadas: «DA 11.ª», «DT única», «DF 1.ª».
  for (const m of t.matchAll(/\b(da|dt|df|dd)\s*(\d{1,3}|unica|[a-z]+)\b/g)) {
    const num = numeroDisposicion(m[2]);
    if (num) hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: [`${m[1]}:${num}`] });
  }

  for (const m of t.matchAll(/\banexo\s+([ivxlc]+|\d{1,3})\b/g)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : romanoANumero(m[1]);
    if (n) hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: [`anexo:${n}`] });
  }
  for (const m of t.matchAll(/\bpreambulo\b/g)) hallazgos.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, claves: ['preambulo'] });

  return hallazgos.sort((a, b) => a.pos - b.pos);
}

/**
 * El precepto de un ROTULO de bloque del BOE («Artículo 69», «Art 1»,
 * «Artículo primero», «Disposición adicional undécima. Conflictos…»,
 * «ANEXO II»). `null` si el bloque no es un precepto (títulos, capítulos,
 * firma, nota inicial).
 */
export function preceptoDelRotulo(rotulo: string | null | undefined): string | null {
  const t = normal(rotulo ?? '').trim();
  if (!t) return null;
  if (!/^(art|disposicion|anexo|preambulo)/.test(t)) return null;
  const h = preceptosEn(rotulo ?? '').find((x) => x.pos === 0);
  return h ? h.claves[0] : null;
}

/** Cómo se le enseña un precepto a una persona: «art. 69», «art. 8 ter», «disposición adicional 11.ª». */
export function preceptoLegible(clave: string): string {
  const [tipo, num = ''] = clave.split(':');
  if (tipo === 'art') return `art. ${num.replace(new RegExp(`(\\d+)(${SUFIJOS})$`), '$1 $2')}`;
  if (tipo === 'anexo') return `anexo ${num}`;
  if (tipo === 'preambulo') return 'preámbulo';
  const nombre = { da: 'disposición adicional', dt: 'disposición transitoria', df: 'disposición final', dd: 'disposición derogatoria' }[tipo] ?? tipo;
  return num === 'unica' ? `${nombre} única` : `${nombre} ${num}.ª`;
}

// ---------------------------------------------------------------------------
// Normas
// ---------------------------------------------------------------------------

/**
 * Las siglas que el banco usa por la norma. Solo las que no se pueden leer
 * por rango y número. La Constitución, el Código Civil, el Penal y la LECrim
 * no tienen número oficial y van con su identificador del BOE (`NORMAS_FIJAS`).
 */
const SIGLAS: [RegExp, string][] = [
  [/\bCE\b|\bConstituci[oó]n( Espa[nñ]ola)?\b/, 'CE'],
  [/\bCC\b|\bC[oó]digo Civil\b/, 'Código Civil'],
  [/\bCP\b|\bC[oó]digo Penal\b/, 'Código Penal'],
  [/\bLECrim\b|\bLey de Enjuiciamiento Criminal\b/i, 'LECrim'],
  [/\bT?R?EBEP\b|\bEstatuto B[aá]sico del Empleado P[uú]blico\b/, 'RDLeg 5/2015'],
  [/\bLOFCS\b/, 'LO 2/1986'],
  [/\bLOPSC\b/, 'LO 4/2015'],
  [/\bLOREG\b/, 'LO 5/1985'],
  [/\bLOPJ\b/, 'LO 6/1985'],
  [/\bLRJSP\b/, 'Ley 40/2015'],
  [/\bLPAC(AP)?\b/, 'Ley 39/2015'],
  [/\bLOEX\b/, 'LO 4/2000'],
  [/\bLOPDGDD\b/, 'LO 3/2018'],
  [/\bRGPD\b/, 'Reglamento (UE) 2016/679'],
  // Los Tratados y el Convenio de Schengen no tienen versión consolidada que
  // vigilar: un cambio en ellos exige ratificación de todos los Estados. Se
  // reconocen para no contarlos como «sin norma», y se dejan fuera a propósito.
  [/\bTFUE\b/, 'TFUE'],
  [/\bTUE\b/, 'TUE'],
  [/\bCAAS\b/, 'CAAS'],
];

/** Las que se reconocen pero no se vigilan (ver `SIGLAS`). */
export const NO_VIGILADAS = new Set(['TFUE', 'TUE', 'CAAS']);

/**
 * Identificadores del BOE de las normas sin número oficial. Son los del
 * manifiesto del temario (`temario/temario.json`), que ya se descargaron y se
 * comprobaron contra la API al componer el temario.
 */
export const NORMAS_FIJAS: Record<string, string> = {
  CE: 'BOE-A-1978-31229',
  'Código Civil': 'BOE-A-1889-4763',
  'Código Penal': 'BOE-A-1995-25444',
  LECrim: 'BOE-A-1882-6036',
  'RDLeg 5/2015': 'BOE-A-2015-11719',
};

type Mencion = { pos: number; fin: number; norma: string };

const RANGO_CORTO: [RegExp, string][] = [
  [/^(ley org[aá]nica|l\.?\s?o\.?)$/i, 'LO'],
  [/^(real decreto legislativo|rd\s?leg\.?|rdlg|rdleg)$/i, 'RDLeg'],
  [/^(real decreto[- ]ley|rdl|rd-ley)$/i, 'RDL'],
  [/^(real decreto|r\.?\s?d\.?)$/i, 'RD'],
  [/^ley$/i, 'Ley'],
];

/** Las normas que nombra un texto, con su posición y su nombre canónico. */
function normasEn(texto: string): Mencion[] {
  const menciones: Mencion[] = [];
  const reNum = /\b(Ley Org[aá]nica|L\.?\s?O\.?|Real Decreto Legislativo|RD\s?Leg\.?|RDLeg|Real Decreto[- ]ley|RD-ley|RDL|Real Decreto|R\.?\s?D\.?|Ley)\s+(\d{1,4}\/\d{4})\b/g;
  for (const m of texto.matchAll(reNum)) {
    const corto = RANGO_CORTO.find(([re]) => re.test(m[1].trim()))?.[1];
    if (corto) menciones.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, norma: `${corto} ${m[2]}` });
  }
  for (const m of texto.matchAll(/\bOrden\s+([A-Z]{2,4})\/(\d{1,5})\/(\d{4})\b/g)) {
    menciones.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, norma: `Orden ${m[1]}/${m[2]}/${m[3]}` });
  }
  // UE: «Reglamento (UE) 2024/1348», «Reglamento (CE) 810/2009», «Directiva (UE) 2016/680», «Directiva 2008/115/CE».
  for (const m of texto.matchAll(/\b(Reglamento|Directiva|Decisi[oó]n)\s*(?:\((UE|CE|CEE)\)\s*(?:n\.?[ºo°]\s*)?(\d{1,4})\/(\d{1,4})|(\d{4})\/(\d{1,4})\/(UE|CE|CEE))/g)) {
    const tipo = m[1].startsWith('Reg') ? 'Reglamento' : m[1].startsWith('Dir') ? 'Directiva' : 'Decisión';
    const norma = m[5] ? `${tipo} ${m[5]}/${m[6]}/${m[7]}` : `${tipo} (${m[2]}) ${m[3]}/${m[4]}`;
    menciones.push({ pos: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, norma });
  }
  for (const [re, norma] of SIGLAS) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of texto.matchAll(global)) {
      // «Ley 5/2014 de Seguridad Privada» no es la CE aunque lleve mayúsculas: las siglas se quedan solo si no pisan otra mención.
      const pos = m.index ?? 0;
      if (!menciones.some((x) => pos >= x.pos && pos < x.fin)) menciones.push({ pos, fin: pos + m[0].length, norma });
    }
  }
  return menciones.sort((a, b) => a.pos - b.pos);
}

/**
 * Las citas de una referencia legal. Cada precepto va con la norma que lo
 * sigue («Art. 4 RD 617/1997»); si no la sigue ninguna, con la anterior
 * («Ley 12/2009, art. 5»); si el texto no nombra ninguna, con `null` y la
 * pondrá el tema. Una norma sin precepto delante es una cita de la norma
 * entera.
 */
export function citasDeLaReferencia(referencia: string | null | undefined): CitaReferencia[] {
  const ref = (referencia ?? '').trim();
  if (!ref) return [];
  const normas = normasEn(ref);
  const preceptos = preceptosEn(ref);
  const citas: CitaReferencia[] = [];
  const usadas = new Set<number>();

  for (const p of preceptos) {
    const siguiente = normas.findIndex((n) => n.pos >= p.fin - 1);
    const idx = siguiente >= 0 ? siguiente : normas.length - 1;
    if (idx >= 0) usadas.add(idx);
    for (const clave of p.claves) citas.push({ norma: idx >= 0 ? normas[idx].norma : null, precepto: clave });
  }
  // Una norma sin precepto delante es una cita de la norma entera, salvo que
  // sea la misma ya citada con precepto: «Art. 49 RDLeg 5/2015 (TREBEP)».
  const conPrecepto = new Set(citas.map((c) => c.norma));
  normas.forEach((n, i) => {
    if (!usadas.has(i) && !conPrecepto.has(n.norma)) citas.push({ norma: n.norma, precepto: null });
  });

  const vistas = new Set<string>();
  return citas.filter((c) => {
    const k = `${c.norma}|${c.precepto}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

// ---------------------------------------------------------------------------
// La norma por el tema (para las «Artículo N» del temario por temas)
// ---------------------------------------------------------------------------

export type FuenteManifiesto = {
  boe_id?: string;
  nombre?: string;
  ambito?: { tipo: 'completo' } | { tipo: 'articulos'; desde: number; hasta: number } | { tipo: 'rango'; desde: string; hasta: string };
};
export type TemaManifiesto = { numero: number; fuentes?: FuenteManifiesto[] };

/** Un id de bloque del rango del manifiesto («preambulo», «a55», «a588bisa») → número de artículo. */
function numeroDeBloqueRango(id: string): number | null {
  if (id === 'preambulo') return 0;
  const m = /^a(\d+)/.exec(id);
  return m ? Number(m[1]) : null;
}

function fuenteCubre(f: FuenteManifiesto, precepto: string): boolean {
  const amb = f.ambito;
  if (!amb || amb.tipo === 'completo') return true;
  if (precepto === 'preambulo') return amb.tipo === 'rango' && amb.desde === 'preambulo';
  const art = /^art:(\d+)/.exec(precepto);
  if (!art) return false; // una disposición solo la cubre una fuente «completa»
  const n = Number(art[1]);
  if (amb.tipo === 'articulos') return n >= amb.desde && n <= amb.hasta;
  const desde = numeroDeBloqueRango(amb.desde);
  const hasta = numeroDeBloqueRango(amb.hasta);
  return desde !== null && hasta !== null && n >= desde && n <= hasta;
}

export type Candidata = { boe: string; nombre: string };

/**
 * Las normas del tema que pueden tener ese precepto. Si la pregunta salió de
 * una PARTE del temario (`tema-08-1`), solo las normas de esa parte. Una
 * fuente «completa» cubre cualquier número: quien llama descarta después las
 * que no tienen ese artículo en su texto (la Orden INT/859/2023 no tiene
 * artículo 66), y si aun así quedan dos, no se adivina.
 */
export function candidatasPorTema(tema: TemaManifiesto | undefined, precepto: string | null, boesDelDocumento?: string[] | null): Candidata[] {
  const fuentes = (tema?.fuentes ?? [])
    .filter((f): f is FuenteManifiesto & { boe_id: string } => !!f.boe_id)
    .filter((f) => !boesDelDocumento?.length || boesDelDocumento.includes(f.boe_id));
  if (fuentes.length === 0) return [];
  const distintas = new Set(fuentes.map((f) => f.boe_id));
  const cubren = precepto ? fuentes.filter((f) => fuenteCubre(f, precepto)) : (distintas.size === 1 ? fuentes : []);
  const vistas = new Map<string, Candidata>();
  for (const f of cubren) if (!vistas.has(f.boe_id)) vistas.set(f.boe_id, { boe: f.boe_id, nombre: nombreCorto(f.nombre ?? f.boe_id) });
  return [...vistas.values()];
}

/**
 * Entre varias normas posibles, la que nombra la propia pregunta en su
 * explicación («…según el art. 15 de la Ley Orgánica 9/2015…»). Solo si nombra
 * UNA de las candidatas; si no nombra ninguna o nombra dos, `null`.
 */
export function eligePorTexto<T extends Candidata>(candidatas: T[], texto: string | null | undefined): T | null {
  const nombradas = new Set(normasEn(texto ?? '').map((m) => m.norma));
  const ids = new Set([...nombradas].map((n) => NORMAS_FIJAS[n]).filter(Boolean));
  const elegidas = candidatas.filter((c) => nombradas.has(c.nombre) || ids.has(c.boe));
  return elegidas.length === 1 ? elegidas[0] : null;
}

/** «Ley 40/2015, de Régimen Jurídico…» → «Ley 40/2015»; «Código Penal» se queda. */
export function nombreCorto(nombre: string): string {
  const reconocida = normasEn(nombre)[0]?.norma;
  return reconocida ?? nombre.split(',')[0].trim();
}

/**
 * La cabecera de una parte del temario (`temario/md/tema-08-1.md`): las normas
 * que lleva («… (BOE-A-2023-17072)») y el día en que se generó («Documento
 * generado el 2026-09-03»). Ese día se eligió la versión de cada artículo que
 * estaba en vigor, así que las preguntas que salieron de ese documento son de
 * ese día aunque se generaran después.
 */
export function cabeceraDelTemario(md: string): { boes: string[]; generado: Fecha8 | null } {
  const inicio = md.slice(0, 6000);
  const boes = [...new Set([...inicio.matchAll(/^\S.*\((BOE-A-\d{4}-\d+)\)\s*$/gm)].map((m) => m[1]))];
  const g = /Documento generado el (\d{4})-(\d{2})-(\d{2})/.exec(inicio);
  return { boes, generado: g ? `${g[1]}${g[2]}${g[3]}` : null };
}

/**
 * Las citas de una pregunta: las de su referencia, con la norma del tema donde
 * la referencia no la dice. Si el tema deja más de una candidata, la cita
 * lleva la lista y `boe: null`: la decide quien tiene los textos.
 */
export function citasDeLaPregunta(referencia: string | null | undefined, tema: TemaManifiesto | undefined, boesDelDocumento?: string[] | null): Cita[] {
  return citasDeLaReferencia(referencia).map((c) => {
    if (c.norma) return { ...c, boe: NORMAS_FIJAS[c.norma] ?? null, origen: 'referencia' as const };
    const candidatas = candidatasPorTema(tema, c.precepto, boesDelDocumento);
    if (candidatas.length === 1) return { norma: candidatas[0].nombre, precepto: c.precepto, boe: candidatas[0].boe, origen: 'tema' as const };
    return { ...c, boe: null, origen: 'tema' as const, candidatas };
  });
}

// ---------------------------------------------------------------------------
// Cómo se busca cada norma en su fuente
// ---------------------------------------------------------------------------

const RANGO_BOE: Record<string, string> = {
  LO: 'Ley Orgánica', Ley: 'Ley', RD: 'Real Decreto', RDLeg: 'Real Decreto Legislativo', RDL: 'Real Decreto-ley', Orden: 'Orden',
};

/** Rango y número oficial con los que se busca una norma en el BOE. `null` si no es del BOE o no tiene número. */
export function busquedaBoe(norma: string): { rango: string; numero: string } | null {
  const m = /^(LO|Ley|RD|RDLeg|RDL) (\d{1,4}\/\d{4})$/.exec(norma);
  if (m) return { rango: RANGO_BOE[m[1]], numero: m[2] };
  const o = /^Orden ([A-Z]{2,4}\/\d{1,5}\/\d{4})$/.exec(norma);
  if (o) return { rango: 'Orden', numero: o[1] };
  return null;
}

/**
 * El número CELEX de un acto de la UE. A partir de 2015 la numeración es
 * «año/número»; antes, en reglamentos, «número/año» (el 810/2009); en
 * directivas siempre «año/número».
 */
export function celexDe(norma: string): string | null {
  const nueva = /^(Reglamento|Directiva|Decisión) \((UE|CE|CEE)\) (\d{1,4})\/(\d{1,4})$/.exec(norma);
  const vieja = /^(Reglamento|Directiva|Decisión) (\d{4})\/(\d{1,4})\/(UE|CE|CEE)$/.exec(norma);
  const letra = (tipo: string) => (tipo === 'Reglamento' ? 'R' : tipo === 'Directiva' ? 'L' : 'D');
  if (vieja) return `3${vieja[2]}${letra(vieja[1])}${vieja[3].padStart(4, '0')}`;
  if (!nueva) return null;
  const [a, b] = [Number(nueva[3]), Number(nueva[4])];
  // Año primero si el primero parece un año y el segundo no lo es, o si es una directiva.
  const anioPrimero = nueva[1] !== 'Reglamento' || (a >= 1950 && a <= 2100 && (a >= 2015 || b < 1950));
  const [anio, num] = anioPrimero ? [a, b] : [b, a];
  return `3${anio}${letra(nueva[1])}${String(num).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// El texto consolidado del BOE
// ---------------------------------------------------------------------------

export type VersionBloque = {
  norma: string | null;
  publicacion: Fecha8 | null;
  vigencia: Fecha8 | null;
  /** El comienzo del texto de la versión, sin el rótulo: basta para saber si dice «(Derogado)». */
  texto?: string;
};
export type Bloque = { id: string; tipo?: string | null; titulo: string | null; versiones: VersionBloque[] };

/**
 * Las entidades del XML, también las numéricas: el BOE escribe el espacio de
 * «Artículo 64&#160;bis» como entidad, y sin decodificarla el 64 bis se leía
 * como el 64 y se perdía.
 */
const desescapa = (t: string) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ')
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** El texto de una versión: sus párrafos sin marcado, sin el rótulo del artículo, y corto. */
function textoDeVersion(cuerpo: string): string {
  const parrafos = [...cuerpo.matchAll(/<p class="([^"]*)">([\s\S]*?)<\/p>/g)]
    .filter((p) => !/^articulo|^titulo|^capitulo|^seccion|^anexo_num/.test(p[1]))
    .map((p) => desescapa(p[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return parrafos.join(' ').slice(0, 200);
}

/** Los bloques del XML de `/texto`, con las fechas de cada versión y el comienzo de su texto. */
export function bloquesDelXml(xml: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const m of xml.matchAll(/<bloque ([^>]*)>([\s\S]*?)<\/bloque>/g)) {
    const atr = m[1];
    const id = /\bid="([^"]+)"/.exec(atr)?.[1];
    if (!id) continue;
    const titulo = /\btitulo="([^"]*)"/.exec(atr)?.[1];
    const tipo = /\btipo="([^"]*)"/.exec(atr)?.[1] ?? null;
    const versiones = [...m[2].matchAll(/<version ([^>]*)>([\s\S]*?)<\/version>/g)].map((v) => ({
      norma: /\bid_norma="([^"]+)"/.exec(v[1])?.[1] ?? null,
      publicacion: /\bfecha_publicacion="(\d{8})"/.exec(v[1])?.[1] ?? null,
      vigencia: /\bfecha_vigencia="(\d{8})"/.exec(v[1])?.[1] ?? null,
      texto: textoDeVersion(v[2]),
    }));
    bloques.push({ id, tipo, titulo: titulo ? desescapa(titulo) : null, versiones });
  }
  return bloques;
}

/** Los bloques indexados por precepto. Si dos bloques dan el mismo (pasa con anexos repetidos), se queda el primero. */
export function indicePorPrecepto(bloques: Bloque[]): Map<string, Bloque> {
  const indice = new Map<string, Bloque>();
  for (const b of bloques) {
    // El preámbulo no lleva rótulo: solo `tipo="preambulo"`.
    const p = b.tipo === 'preambulo' || b.id === 'preambulo' ? 'preambulo' : preceptoDelRotulo(b.titulo);
    if (p && !indice.has(p)) indice.set(p, b);
  }
  return indice;
}

/** La fecha en que una versión cambia algo: la más tardía entre publicarse y entrar en vigor. */
export function fechaDelCambio(v: VersionBloque): Fecha8 | null {
  const fechas = [v.publicacion, v.vigencia].filter((f): f is string => !!f).sort();
  return fechas.at(-1) ?? null;
}

/**
 * Las versiones de un bloque que cambian algo DESPUÉS de la fecha de la
 * pregunta: las que entraron en vigor más tarde y las que todavía no han
 * entrado (una reforma ya publicada con vigor en el futuro también deja la
 * pregunta mal, solo que más adelante). La versión original de la norma no
 * cuenta: es el texto con el que se escribió.
 */
export function cambiosPosteriores(bloque: Bloque, fechaPregunta: Fecha8): VersionBloque[] {
  const [, ...reformas] = [...bloque.versiones].sort((a, b) => (a.vigencia ?? '').localeCompare(b.vigencia ?? ''));
  return reformas.filter((v) => {
    const f = fechaDelCambio(v);
    return f !== null && f > fechaPregunta;
  });
}

/** `AAAAMMDD` → `d/m/aaaa`. */
export function fechaLegible(f: Fecha8 | null): string {
  if (!f || !/^\d{8}/.test(f)) return 'fecha desconocida';
  return `${Number(f.slice(6, 8))}/${Number(f.slice(4, 6))}/${f.slice(0, 4)}`;
}

/** Fecha de una pregunta (ISO) → `AAAAMMDD`. */
export function fecha8(iso: string | null | undefined): Fecha8 | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * La fecha de la que es el contenido de una pregunta. La de crearla, salvo que
 * saliera de un documento del temario subido antes: entonces la del documento,
 * porque la pregunta repite el texto de ese día aunque se generara después.
 */
export function fechaDeLaPregunta(creada: string | null | undefined, documentoSubido: string | null | undefined): Fecha8 | null {
  const fechas = [fecha8(creada), fecha8(documentoSubido)].filter((f): f is string => !!f).sort();
  return fechas[0] ?? null;
}

// ---------------------------------------------------------------------------
// Los avisos
// ---------------------------------------------------------------------------

export const TIPO_REPORTE_VIGENCIA = 'vigencia';

export const urlBoe = (boe: string, bloque?: string | null) =>
  `https://www.boe.es/buscar/act.php?id=${boe}${bloque ? `#${bloque}` : ''}`;
export const urlEurLex = (celex: string) => `https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:${celex}`;

/**
 * El texto del aviso. Es DETERMINISTA —no depende del día en que se escribe—
 * porque es también la llave para no repetirlo: si el vigilante ya dejó este
 * mismo aviso a esta pregunta, abierto o archivado, no lo vuelve a dejar.
 * Por eso dice «entra en vigor el …» y no «entró» o «entrará».
 */
export function avisoDeBloque(p: { norma: string; precepto: string; boe: string; bloque: string; version: VersionBloque }): string {
  const que = `${p.norma}, ${preceptoLegible(p.precepto)}`;
  const por = p.version.norma && p.version.norma !== p.boe ? ` (lo cambia ${p.version.norma})` : '';
  return `${que}: nueva redacción que entra en vigor el ${fechaLegible(p.version.vigencia ?? p.version.publicacion)}${por}, posterior a la pregunta. Comprueba que la pregunta y su explicación siguen valiendo. ${urlBoe(p.boe, p.bloque)}`;
}

export function avisoDeNormaDerogada(p: { norma: string; boe: string }): string {
  return `${p.norma} ya no está en vigor (el BOE la da por derogada). La pregunta la cita: corrígela con la norma que la sustituye o retírala. ${urlBoe(p.boe)}`;
}

export function avisoDeBloqueDerogado(p: { norma: string; precepto: string; boe: string; bloque: string; version: VersionBloque }): string {
  return `${p.norma}, ${preceptoLegible(p.precepto)}: queda sin contenido o derogado desde el ${fechaLegible(p.version.vigencia ?? p.version.publicacion)}${p.version.norma && p.version.norma !== p.boe ? ` (por ${p.version.norma})` : ''}. La pregunta lo cita: corrígela o retírala. ${urlBoe(p.boe, p.bloque)}`;
}

export function avisoDeActoUE(p: { norma: string; modificador: string; fecha: string }): string {
  return `${p.norma}: lo modifica el acto ${p.modificador} de ${fechaLegible(p.fecha.replace(/-/g, ''))}, posterior a la pregunta. Comprueba que la pregunta y su explicación siguen valiendo. ${urlEurLex(p.modificador)}`;
}

/**
 * Si la última versión de un bloque lo deja vacío: el BOE conserva el
 * artículo derogado con un texto del tipo «(Derogado)» o «(Sin contenido)».
 * Se mira el texto de la versión, que esta función recibe ya extraído.
 */
export function esTextoDerogado(texto: string): boolean {
  const t = normal(texto).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length < 120 && /\b(derogad[oa]s?|sin contenido|suprimid[oa]s?)\b/.test(t);
}

/** Cuántas preguntas por precepto, para el resumen y el correo: «Ley 40/2015, art. 69 · 3 preguntas». */
export function agrupaAvisos<T extends { clave: string }>(avisos: T[]): { clave: string; n: number }[] {
  const cuenta = new Map<string, number>();
  for (const a of avisos) cuenta.set(a.clave, (cuenta.get(a.clave) ?? 0) + 1);
  return [...cuenta].map(([clave, n]) => ({ clave, n })).sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave));
}

/** Las fuentes oficiales cuyos enlaces se pintan como enlace en «Moderación». Nada más: el mensaje de un alumno no se enlaza nunca. */
const ORIGENES_OFICIALES = ['https://www.boe.es/', 'https://eur-lex.europa.eu/'];

/**
 * Separa el texto del aviso y su enlace al artículo, para pintar el enlace
 * como botón. Solo si el enlace va al BOE o a EUR-Lex y está al final.
 */
export function separaEnlaceOficial(mensaje: string | null | undefined): { texto: string; url: string | null; fuente: 'BOE' | 'EUR-Lex' | null } {
  const m = /\s(https:\/\/\S+)\s*$/.exec(mensaje ?? '');
  const url = m && ORIGENES_OFICIALES.some((o) => m[1].startsWith(o)) ? m[1] : null;
  if (!m || !url) return { texto: (mensaje ?? '').trim(), url: null, fuente: null };
  return { texto: (mensaje ?? '').slice(0, m.index).trim(), url, fuente: url.startsWith('https://www.boe.es/') ? 'BOE' : 'EUR-Lex' };
}
