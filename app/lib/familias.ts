/**
 * LAS FAMILIAS DE PREGUNTAS: la misma pregunta con otras palabras (regla 119).
 *
 * POR QUÉ EXISTE
 * El banco se generó con el modelo a partir de los mismos artículos, así que
 * tiene muchas preguntas que son LA MISMA: «plazo de quince años para anular
 * la nacionalidad» salía tres veces, el modelo tripartito de las actitudes
 * cuatro, la señal V-2 dos. Un examen que lleva el mismo concepto tres veces
 * regala puntos a quien lo sabe, castiga tres veces a quien no, y deja menos
 * sitio para los demás temas; y la dificultad medida de una se reparte entre
 * varias.
 *
 * CÓMO SE DETECTAN, SIN IA Y SIN GASTO
 * Cada pregunta es el texto de su enunciado más el de su opción CORRECTA (las
 * malas varían de una a otra, la buena no: es el hecho que se pregunta). Se
 * pesan las palabras por lo raras que son en todo el banco (TF-IDF), y dos
 * preguntas son de la misma familia si su similitud del coseno pasa el umbral.
 * Las familias son los componentes conexos de ese «se parecen».
 *
 * MÓDULO PURO (regla 21): sin base de datos ni red.
 */

export type PreguntaBanco = {
  id: string;
  /** Tema (`subject_id`). Se usa para acotar la búsqueda; las repetidas de un mismo hecho casi siempre comparten tema. */
  tema: number | null;
  enunciado: string;
  opciones: string[];
  correcta: number;
};

/** Se parecen lo bastante como para ser la misma pregunta. Calibrado mirando pares reales del banco (regla 119). */
export const UMBRAL_FAMILIA = 0.6;

/**
 * Y su respuesta correcta tiene que parecerse también POR SÍ SOLA: dos
 * preguntas sobre el mismo artículo que preguntan cosas distintas («¿qué juez
 * es competente?» y «¿qué se valora?») comparten casi todo el enunciado y no
 * son la misma pregunta.
 */
export const UMBRAL_RESPUESTA = 0.35;

/**
 * Una familia no puede ser mayor que esto: más es un encadenado de parecidos
 * (A se parece a B, B a C…), no una pregunta repetida. En el banco la mayor es
 * de 26, y mirándolas son coherentes; con 8 se troceaban en tres.
 */
export const MAX_FAMILIA = 30;

// Palabras que no dicen de qué trata la pregunta: las de las fórmulas con que se redactan.
const VACIAS = new Set((
  'a al algo ante aquel aquella aquellas aquellos as asi aun aunque bajo cada como con contra cual cuales cuando cuyo de del desde donde dos e el ella ellas ello ellos en entre era es esa esas ese eso esos esta estan estar este esto estos fue ha han hasta hay la las le les lo los mas me mi mientras muy ni no nos nuestro o otra otras otro otros para pero poco por porque que quien quienes se sea sean segun ser si sido sin sobre solo son su sus tal tambien tan tanto te tiene tienen todo todos tu un una uno unos y ya ' +
  // fórmulas de enunciado
  'conforme acuerdo establecido establece establecen dispuesto dispone proporcionado proporcionada texto textos legal legales siguiente siguientes afirmacion afirmaciones correcta correctas correcto correctos incorrecta incorrectas senale marque indique cual cuales respecto relacion relativo relativa relativos relativas ambito caso casos articulo articulos articulos apartado apartados presente documento facilitado adjunto referido segun tema ley normativa'
).split(/\s+/));

/** Minúsculas, sin tildes ni signos: lo mismo con otras palabras de adorno sigue siendo lo mismo. */
export function normaliza(texto: string): string {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Quita plurales y terminaciones comunes: «órganos» y «órgano», «reducir» y «reducirá», se juntan. */
function raiz(p: string): string {
  if (p.length <= 4 || /^\d+$/.test(p)) return p;
  return p.replace(/(amente|aciones|acion|ciones|cion|mente|ados|adas|idos|idas|ando|iendo|ara|era|ira|aran|eran|iran|an|en|es|os|as|ar|er|ir|a|o|s)$/, '') || p;
}

/** Las palabras que cuentan de un texto: sin vacías, con raíz, y los números enteros (un plazo es un dato). */
export function terminos(texto: string): string[] {
  return normaliza(texto)
    .split(' ')
    .filter((p) => p.length > 1 && !VACIAS.has(p))
    .map(raiz);
}

/** Lo que representa a una pregunta: su enunciado y su opción correcta (y esa va dos veces: es lo que se pregunta). */
export function textoDe(p: PreguntaBanco): string[] {
  const buena = terminos(p.opciones[p.correcta] ?? '');
  return [...terminos(p.enunciado), ...buena, ...buena];
}

type Vector = Map<string, number>;

const NUMEROS = new Set((
  'un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento mil millon millones ' +
  'primer primero primera segundo segunda tercer tercero tercera cuarto cuarta quinto quinta sexto sexta septimo octavo noveno decimo ' +
  'mitad doble triple'
).split(/\s+/));

/**
 * Las cantidades de un texto: cifras, números escritos y ordinales. Un plazo,
 * una pena o un «segundo lugar» distintos son OTRO hecho aunque el resto de la
 * frase sea igual («al día siguiente de su publicación» frente a «a los veinte
 * días de su publicación»).
 */
export function cantidades(texto: string): string[] {
  return [...new Set(normaliza(texto).split(' ').filter((p) => /^\d+$/.test(p) || NUMEROS.has(p)))].sort();
}

/**
 * Los números y códigos que lleva un texto: «265», «2024», «c3», «4x4». Si las
 * dos preguntas llevan alguno y no coinciden, no son la misma: preguntan por
 * otro artículo, otra fecha u otra calificación. Si UNA no lleva ninguno
 * («según la Ley…» frente a «Artículo 2 de la Ley 8/2011…») no se opone: es la
 * misma pregunta con más o menos referencia.
 */
export function codigos(texto: string): string[] {
  return [...new Set(normaliza(texto).split(' ').filter((p) => /\d/.test(p)))].sort();
}

const mismosCodigos = (a: string, b: string) => {
  const x = codigos(a), y = codigos(b);
  return x.length === 0 || y.length === 0 || (x.length === y.length && x.every((v, i) => v === y[i]));
};

const mismasCantidades = (a: string, b: string) => {
  const x = cantidades(a), y = cantidades(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

function vectorDe(docs: string[][]): Vector[] {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  return docs.map((d) => {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    let norma = 0;
    for (const [t, n] of tf) {
      const w = (1 + Math.log(n)) * Math.log(1 + N / (df.get(t) ?? 1));
      v.set(t, w);
      norma += w * w;
    }
    const k = Math.sqrt(norma) || 1;
    for (const [t, w] of v) v.set(t, w / k);
    return v;
  });
}

/** Los vectores de cada pregunta: el completo (enunciado + respuesta) y el de la respuesta correcta sola. */
export function vectores(preguntas: readonly PreguntaBanco[]): { completo: Vector[]; respuesta: Vector[] } {
  return {
    completo: vectorDe(preguntas.map((p) => textoDe(p))),
    respuesta: vectorDe(preguntas.map((p) => terminos(p.opciones[p.correcta] ?? ''))),
  };
}

export type Par = { a: number; b: number; similitud: number };

const coseno = (x: Vector, y: Vector) => { let s = 0; for (const [t, w] of x) s += w * (y.get(t) ?? 0); return s; };

/**
 * Los pares de preguntas que se parecen al menos `umbral` Y cuya respuesta
 * correcta se parece por sí sola al menos `umbralRespuesta` Y con las mismas
 * cantidades.
 *
 * Con un índice invertido: solo se comparan las que comparten alguna palabra, y
 * las palabras que están en más de `maxDf` preguntas se saltan (no distinguen
 * nada y son las que harían el cálculo cuadrático). Si `mismoTema`, solo dentro
 * de cada tema.
 */
export function paresParecidos(
  preguntas: readonly PreguntaBanco[], vs: { completo: readonly Vector[]; respuesta: readonly Vector[] }, umbral: number,
  opciones: { mismoTema?: boolean; maxDf?: number; umbralRespuesta?: number } = {},
): Par[] {
  const maxDf = opciones.maxDf ?? 400;
  const umbralRespuesta = opciones.umbralRespuesta ?? UMBRAL_RESPUESTA;
  const postings = new Map<string, number[]>();
  vs.completo.forEach((v, i) => { for (const t of v.keys()) { const l = postings.get(t); if (l) l.push(i); else postings.set(t, [i]); } });

  const pares: Par[] = [];
  for (let i = 0; i < vs.completo.length; i++) {
    const acumulado = new Map<number, number>();
    for (const [t, w] of vs.completo[i]) {
      const l = postings.get(t)!;
      if (l.length > maxDf) continue;
      for (const j of l) {
        if (j <= i) continue;
        acumulado.set(j, (acumulado.get(j) ?? 0) + w * (vs.completo[j].get(t) ?? 0));
      }
    }
    for (const [j, sim] of acumulado) {
      if (sim < umbral) continue;
      if (opciones.mismoTema && preguntas[i].tema !== preguntas[j].tema) continue;
      if (coseno(vs.respuesta[i], vs.respuesta[j]) < umbralRespuesta) continue;
      if (!mismasCantidades(preguntas[i].opciones[preguntas[i].correcta] ?? '', preguntas[j].opciones[preguntas[j].correcta] ?? '')) continue;
      if (!mismosCodigos(`${preguntas[i].enunciado} ${preguntas[i].opciones[preguntas[i].correcta] ?? ''}`, `${preguntas[j].enunciado} ${preguntas[j].opciones[preguntas[j].correcta] ?? ''}`)) continue;
      pares.push({ a: i, b: j, similitud: Math.round(sim * 1000) / 1000 });
    }
  }
  return pares;
}

export type Familia = { miembros: number[] };

/**
 * Las familias: los grupos de preguntas parecidas entre sí. Una familia que se
 * pasa de `MAX_FAMILIA` es un encadenado (A se parece a B, B a C, C a D…) y no
 * una pregunta repetida: se deshace quedándose solo con los pares MÁS parecidos
 * hasta que quepa.
 */
export function agrupa(total: number, pares: readonly Par[], maxFamilia = MAX_FAMILIA): Familia[] {
  const padre = Array.from({ length: total }, (_, i) => i);
  const tam = Array.from({ length: total }, () => 1);
  const raizDe = (x: number): number => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };

  // De más a menos parecido: los pares fuertes se unen primero, y uno que haría la familia demasiado grande se descarta.
  for (const p of [...pares].sort((x, y) => y.similitud - x.similitud)) {
    const ra = raizDe(p.a), rb = raizDe(p.b);
    if (ra === rb) continue;
    if (tam[ra] + tam[rb] > maxFamilia) continue;
    padre[rb] = ra;
    tam[ra] += tam[rb];
  }

  const grupos = new Map<number, number[]>();
  for (let i = 0; i < total; i++) { const r = raizDe(i); const l = grupos.get(r); if (l) l.push(i); else grupos.set(r, [i]); }
  return [...grupos.values()].filter((m) => m.length > 1).map((miembros) => ({ miembros }));
}

/** Todo el trabajo: de las preguntas a sus familias. */
export function familiasDelBanco(preguntas: readonly PreguntaBanco[], umbral = UMBRAL_FAMILIA): { familias: Familia[]; pares: Par[] } {
  const vs = vectores(preguntas);
  const pares = paresParecidos(preguntas, vs, umbral);
  return { familias: agrupa(preguntas.length, pares), pares };
}

// ---------------------------------------------------------------------------
// La pantalla de «Preguntas repetidas» (regla 119)
// ---------------------------------------------------------------------------

export const FAMILIAS_POR_PAGINA = 10;

/** Una pregunta de una familia, como la enseña la pantalla de repetidas. */
export type MiembroDeFamilia = {
  id: string;
  question_text: string;
  options: unknown;
  correct_index: number;
  explanation: string | null;
  legal_reference: string | null;
  difficulty_level: number | null;
  difficulty_source: string | null;
  tema: number | null;
};

export type FilaDeFamilia = { id: string; family_id: string | null };

export type PaginaDeFamilias = {
  /** Las familias de ESTA página, de la más repetida a la menos. */
  familias: { id: string; tamano: number }[];
  /** Familias con dos preguntas ACTIVAS o más. Una que ya se resolvió no cuenta. */
  totalFamilias: number;
  /** Preguntas que sobran si de cada familia se queda una. */
  sobran: number;
  pagina: number;
  paginas: number;
};

/**
 * De las preguntas activas con familia, la página de familias que aún tienen
 * repetidas. Una familia con una sola activa ya está resuelta (el resto se
 * descartó) y no vuelve a salir.
 *
 * Orden fijo —tamaño y luego id— para que paginar no salte ni repita familias
 * entre una página y la siguiente.
 */
export function paginaDeFamilias(filas: readonly FilaDeFamilia[], pagina = 1, porPagina = FAMILIAS_POR_PAGINA): PaginaDeFamilias {
  const tamanos = new Map<string, number>();
  for (const f of filas) if (f.family_id) tamanos.set(f.family_id, (tamanos.get(f.family_id) ?? 0) + 1);
  const vivas = [...tamanos].filter(([, n]) => n >= 2).map(([id, tamano]) => ({ id, tamano }));
  vivas.sort((a, b) => b.tamano - a.tamano || a.id.localeCompare(b.id));
  const paginas = Math.max(1, Math.ceil(vivas.length / porPagina));
  const actual = Math.min(Math.max(1, Math.trunc(pagina) || 1), paginas);
  return {
    familias: vivas.slice((actual - 1) * porPagina, actual * porPagina),
    totalFamilias: vivas.length,
    sobran: vivas.reduce((n, f) => n + f.tamano - 1, 0),
    pagina: actual,
    paginas,
  };
}
