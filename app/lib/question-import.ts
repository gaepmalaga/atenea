/**
 * Escribir preguntas a mano: el contrato compartido y la lectura de una hoja
 * de calculo.
 *
 * Modulo puro (sin red, sin SDK, sin Supabase) por dos motivos:
 *
 * 1. Lo importa TAMBIEN el navegador. El fichero se lee en el cliente y lo que
 *    viaja a la Server Action son preguntas ya troceadas, no el CSV entero.
 * 2. Un lector de CSV es justo el tipo de codigo que hay que poder testear con
 *    casos reales: comillas, saltos de linea dentro de una celda, y el punto y
 *    coma que pone Excel en espaniol.
 *
 * `ManualQuestion` es el contrato cliente-servidor de la regla 6: la misma
 * forma la construye el formulario, la construye el importador y la recibe la
 * accion. Ninguno de los tres puede divergir sin que TypeScript lo cante.
 */

import { OPTION_IDS, DIFFICULTY, DIFFICULTY_DEFAULT, type DifficultyLevel } from './questions';
import { validateGeneratedQuestion, REQUIRED_OPTIONS } from './ai-output';

// ============================================================
// EL CONTRATO
// ============================================================

/** Una pregunta escrita a mano, lista para viajar a la Server Action. */
export type ManualQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: DifficultyLevel;
  /**
   * Tema de ESTA fila, si el CSV traía una columna `tema` y se pudo resolver a
   * un id de `subjects`. `undefined` = usa el tema elegido en el desplegable
   * (el comportamiento de siempre: un fichero, un tema).
   *
   * Lo resuelve el cliente contra su lista de temas y el servidor lo vuelve a
   * comprobar — una Server Action es un endpoint público.
   */
  subjectId?: number;
  /** El texto de la celda `tema` tal cual, para pintarlo en la vista previa. */
  temaRaw?: string;
};

/** Tema del temario, lo mínimo para resolver la columna `tema` de un CSV. */
export type TemaResoluble = { id: number; number: number; title: string };

/** Una fila que no se pudo aprovechar, con su numero de linea y el porque. */
export type ImportIssue = { fila: number; motivo: string };

export type ImportParse = {
  preguntas: ManualQuestion[];
  rechazadas: ImportIssue[];
};

/**
 * Tope de preguntas por importacion.
 *
 * No es una limitacion tecnica: es que el resultado hay que poder leerlo. Un
 * fichero de 5.000 filas con 300 rechazos deja un informe que nadie revisa, y
 * revisarlo es lo unico que evita meter basura en el banco de los alumnos.
 */
export const MAX_IMPORT = 500;

// ============================================================
// LECTURA DEL CSV
// ============================================================

/**
 * Separador del fichero.
 *
 * Excel en espaniol exporta con PUNTO Y COMA, no con coma, y ese detalle decide
 * si el fichero se lee o si sale una sola columna con todo dentro. Se decide
 * contando en la CABECERA, que es la unica linea sin texto libre.
 */
export function detectaSeparador(cabecera: string): string {
  const candidatos = [';', ',', '\t'];
  let mejor = ';';
  let max = -1;
  for (const c of candidatos) {
    const n = cabecera.split(c).length - 1;
    if (n > max) {
      max = n;
      mejor = c;
    }
  }
  return max > 0 ? mejor : ';';
}

/**
 * CSV -> matriz de celdas.
 *
 * Respeta las comillas dobles y los saltos de linea DENTRO de una celda: una
 * explicacion de dos parrafos es de lo mas normal en un banco de preguntas, y
 * partir por `\n` a ciegas convertiria una fila buena en dos rotas.
 */
export function parseCsv(texto: string, separador: string): string[][] {
  // El BOM que pone Excel se cuela dentro del nombre de la primera columna y
  // deja de reconocerse la cabecera.
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let enComillas = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];

    if (enComillas) {
      if (ch === '"') {
        // Dos comillas seguidas son una comilla literal.
        if (t[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        celda += ch;
      }
      continue;
    }

    if (ch === '"') { enComillas = true; continue; }
    if (ch === separador) { fila.push(celda); celda = ''; continue; }
    if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; continue; }
    celda += ch;
  }

  // La ultima celda no lleva salto detras.
  if (celda.length > 0 || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }

  return filas;
}

// ============================================================
// CABECERA
// ============================================================

/** Minusculas, sin acentos y sin signos: para comparar nombres de columna. */
function normalizaClave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Nombres admitidos para cada campo. El primero es el que documenta la plantilla. */
const ALIAS = {
  question: ['enunciado', 'pregunta', 'question', 'question text'],
  correct: ['correcta', 'respuesta', 'respuesta correcta', 'correct', 'solucion'],
  explanation: ['explicacion', 'justificacion', 'explanation', 'feedback'],
  difficulty: ['dificultad', 'nivel', 'difficulty'],
  // OPCIONAL. Si la trae, cada fila puede ir a un tema distinto; si no, todas
  // van al tema elegido en el desplegable.
  tema: ['tema', 'topic', 'asignatura', 'materia', 'numero de tema', 'n tema'],
};

/** Nombres admitidos para la opcion numero `i`: A, B, C… */
function aliasOpcion(i: number): string[] {
  const letra = OPTION_IDS[i];
  return [letra, `opcion ${letra}`, `respuesta ${letra}`, `option ${letra}`, `opcion ${i + 1}`];
}

function buscaColumna(cabecera: string[], alias: string[]): number {
  return cabecera.findIndex((c) => alias.includes(c));
}

// ============================================================
// CAMPOS SUELTOS
// ============================================================

/**
 * "A", "b", "1", "3"… -> indice de la opcion correcta.
 *
 * Los DIGITOS se leen empezando por 1, que es como cuenta quien escribe una
 * hoja de calculo. El 0 NO se interpreta: se rechaza la fila. Es tentador
 * tratarlo como la A —seria el indice interno— pero entonces el mismo fichero
 * significaria cosas distintas segun quien lo hubiera escrito, y una respuesta
 * correcta mal leida es exactamente el fallo que persigue la regla 10: el
 * alumno estudia un dato falso y nada avisa.
 */
export function parseCorrecta(valor: string): number | null {
  const v = normalizaClave(valor);
  if (!v) return null;

  const porLetra = (OPTION_IDS as readonly string[]).indexOf(v);
  if (porLetra >= 0) return porLetra;

  if (/^[0-9]+$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= REQUIRED_OPTIONS) return n - 1;
  }
  return null;
}

/** "media", "3", "fácil"… -> 1, 2 o 3. Lo que no se entienda cae en el defecto. */
export function parseDificultad(valor: string | undefined): DifficultyLevel {
  const v = normalizaClave(valor ?? '');
  if (!v) return DIFFICULTY_DEFAULT;
  if (/^[123]$/.test(v)) return Number(v) as DifficultyLevel;
  if (v.startsWith('facil') || v.startsWith('baja')) return DIFFICULTY.easy;
  if (v.startsWith('media') || v.startsWith('medio') || v.startsWith('normal')) return DIFFICULTY.medium;
  if (v.startsWith('dificil') || v.startsWith('alta') || v.startsWith('avanzada')) return DIFFICULTY.hard;
  return DIFFICULTY_DEFAULT;
}

/**
 * "5", "Tema 5", "La Constitución Española (I)"… -> id del tema, o `null`.
 *
 * Por número (lo más fiable) o por título. Un título que coincida con VARIOS
 * temas se rechaza en vez de elegir uno: meter la pregunta en el tema
 * equivocado es el mismo fallo que una respuesta correcta mal leída (regla 10).
 */
export function resuelveTema(valor: string, temas: TemaResoluble[]): number | null {
  const bruto = (valor ?? '').trim();
  if (!bruto) return null;

  // "Tema 5", "T5", "5" -> 5
  const soloNumero = bruto.replace(/^\s*(tema|t)\s*/i, '').trim();
  if (/^\d+$/.test(soloNumero)) {
    const n = Number(soloNumero);
    return temas.find((t) => t.number === n)?.id ?? null;
  }

  const clave = normalizaClave(bruto);
  if (!clave) return null;

  const exacto = temas.filter((t) => normalizaClave(t.title) === clave);
  if (exacto.length === 1) return exacto[0].id;
  if (exacto.length > 1) return null;

  const contiene = temas.filter((t) => normalizaClave(t.title).includes(clave));
  return contiene.length === 1 ? contiene[0].id : null;
}

// ============================================================
// LA IMPORTACION ENTERA
// ============================================================

/**
 * La plantilla que descarga la interfaz. Cabecera y una fila de ejemplo.
 *
 * La columna `tema` es OPCIONAL y va la última: si se rellena, esa fila entra en
 * ese tema en vez de en el del desplegable. Admite el número ("5", "Tema 5") o
 * el título. Se deja vacía en el ejemplo — sin ella, todas van al tema elegido.
 */
export const CSV_PLANTILLA = [
  'enunciado;A;B;C;correcta;explicacion;dificultad;tema',
  '"¿Cuantos Diputados tiene el Congreso como minimo?";300;350;400;A;"Articulo 68.1 CE: entre 300 y 400.";2;',
].join('\n');

/**
 * Hoja de calculo -> preguntas listas para guardar.
 *
 * NADA se descarta en silencio: cada fila que no sirve sale en `rechazadas` con
 * su numero de linea y el motivo. Un importador que se come tres filas sin
 * decirlo es peor que uno que no importa ninguna, porque el administrador se
 * queda creyendo que su banco esta completo.
 *
 * `temas` es OPCIONAL: si se pasa y el fichero trae una columna `tema`, cada
 * fila se resuelve a su `subjectId` y una que nombre un tema inexistente se
 * RECHAZA (no se cuela en el tema por defecto). Sin `temas` —los tests, o antes
 * de que carguen— la columna solo se guarda como texto (`temaRaw`) para la
 * vista previa.
 */
export function parseQuestionsCsv(texto: string, temas?: TemaResoluble[]): ImportParse {
  const rechazadas: ImportIssue[] = [];
  const preguntas: ManualQuestion[] = [];

  const limpio = (texto ?? '').replace(/^\uFEFF/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? '';
  if (!primeraLinea.trim()) {
    return { preguntas, rechazadas: [{ fila: 1, motivo: 'El fichero esta vacio.' }] };
  }

  const filas = parseCsv(limpio, detectaSeparador(primeraLinea));
  const cabecera = (filas[0] ?? []).map(normalizaClave);

  const iEnunciado = buscaColumna(cabecera, ALIAS.question);
  const iCorrecta = buscaColumna(cabecera, ALIAS.correct);
  const iOpciones = OPTION_IDS.map((_, i) => buscaColumna(cabecera, aliasOpcion(i)));
  const iExplicacion = buscaColumna(cabecera, ALIAS.explanation);
  const iDificultad = buscaColumna(cabecera, ALIAS.difficulty);
  const iTema = buscaColumna(cabecera, ALIAS.tema);

  const faltan: string[] = [];
  if (iEnunciado < 0) faltan.push('enunciado');
  iOpciones.forEach((idx, i) => {
    if (idx < 0) faltan.push(OPTION_IDS[i].toUpperCase());
  });
  if (iCorrecta < 0) faltan.push('correcta');

  if (faltan.length) {
    return {
      preguntas,
      rechazadas: [
        {
          fila: 1,
          motivo: `La primera fila tiene que ser la cabecera, y faltan estas columnas: ${faltan.join(', ')}.`,
        },
      ],
    };
  }

  const letras = OPTION_IDS.map((o) => o.toUpperCase()).join(', ');

  for (let f = 1; f < filas.length; f++) {
    const fila = filas[f];
    // 1-indexado y contando la cabecera: el mismo numero que ve en Excel.
    const numero = f + 1;

    // Una linea en blanco al final del fichero es lo normal, no un error.
    if (fila.every((c) => !c.trim())) continue;

    if (preguntas.length >= MAX_IMPORT) {
      rechazadas.push({ fila: numero, motivo: `Se importan como maximo ${MAX_IMPORT} preguntas por fichero.` });
      break;
    }

    const correctIndex = parseCorrecta(fila[iCorrecta] ?? '');
    if (correctIndex === null) {
      const llego = (fila[iCorrecta] ?? '').trim();
      rechazadas.push({
        fila: numero,
        motivo: `La columna "correcta" tiene que decir ${letras} (o 1-${REQUIRED_OPTIONS}); llego "${llego}".`,
      });
      continue;
    }

    // Se valida con la MISMA funcion que la salida del modelo: opciones
    // repetidas, opciones vacias, enunciado demasiado corto e indice fuera de
    // rango. Una fila de Excel se equivoca igual que la IA, y lo que le pasa al
    // alumno es identico (regla 10).
    const check = validateGeneratedQuestion({
      question: fila[iEnunciado] ?? '',
      options: iOpciones.map((idx) => fila[idx] ?? ''),
      correctIndex,
      explanation: iExplicacion >= 0 ? fila[iExplicacion] ?? '' : '',
    });

    if (!check.ok) {
      rechazadas.push({ fila: numero, motivo: check.reason });
      continue;
    }

    // Columna `tema` (opcional). Con celda vacía: al tema del desplegable, como
    // siempre. Con celda y `temas` disponibles: se resuelve, y si no cuadra con
    // ninguno se RECHAZA la fila — colarla en el tema por defecto la metería
    // donde nadie la va a encontrar.
    const temaRaw = (iTema >= 0 ? fila[iTema] : '')?.trim() || undefined;
    let subjectId: number | undefined;
    if (temaRaw && temas) {
      const sid = resuelveTema(temaRaw, temas);
      if (sid === null) {
        rechazadas.push({
          fila: numero,
          motivo: `El tema "${temaRaw}" no coincide con ninguno del temario (usa el número o el título exacto).`,
        });
        continue;
      }
      subjectId = sid;
    }

    preguntas.push({
      ...check.value,
      difficulty: parseDificultad(iDificultad >= 0 ? fila[iDificultad] : undefined),
      ...(temaRaw ? { temaRaw } : {}),
      ...(subjectId !== undefined ? { subjectId } : {}),
    });
  }

  return { preguntas, rechazadas };
}

/**
 * Quita las preguntas repetidas DENTRO del mismo fichero.
 *
 * Dos filas iguales chocarian contra la restriccion unica de `question_hash` y
 * el aviso saldria como un error de base de datos, en vez de como lo que es:
 * una fila duplicada en el Excel de quien importa.
 *
 * La comparacion no es el hash real —ese necesita el tema y se calcula en el
 * servidor— sino el enunciado normalizado, que es lo que una persona llamaria
 * "la misma pregunta".
 */
export function quitaRepetidas(preguntas: ManualQuestion[]): { unicas: ManualQuestion[]; repetidas: number } {
  const vistas = new Set<string>();
  const unicas: ManualQuestion[] = [];
  let repetidas = 0;

  for (const p of preguntas) {
    // El tema forma parte de la identidad: la misma pregunta en dos temas
    // distintos son dos filas legítimas (el hash real incluye el `subject_id`).
    const clave = `${p.subjectId ?? p.temaRaw ?? ''}|${normalizaClave(p.question)}`;
    if (vistas.has(clave)) {
      repetidas++;
      continue;
    }
    vistas.add(clave);
    unicas.push(p);
  }

  return { unicas, repetidas };
}
