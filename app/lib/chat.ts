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
