/**
 * EL GASTO DE IA, AGREGADO PARA EL PANEL DE ADMINISTRACIÓN (P6).
 *
 * POR QUÉ EXISTE
 * `ai-usage.ts` ya guarda cada llamada en `ai_usage` (tokens y dólares, por
 * usuario, ruta y tema). Lo que faltaba es SUMARLO: cuánto va gastado, en qué
 * se va, y qué alumnos pesan más. Es la única parte de P6 que el plan de
 * producto dice construir ya —«cuando llegue el momento de poner precio, vas a
 * necesitar saber cuánto cuesta servir a un alumno»— y no depende de ninguna
 * decisión sobre a quién se cobra.
 *
 * ES LÓGICA PURA (regla 21): toda la aritmética se prueba sin red. La acción
 * `getAiCostOverview` se limita a traer las filas y a poner los correos.
 *
 * REGLA 8: «sin datos» no es «cero». Sin ninguna llamada, el coste medio por
 * alumno es `null`, no `0` — sale distinto en pantalla y significa otra cosa.
 */

/** Una fila de `ai_usage`, tal y como la devuelve PostgREST. */
export type FilaGastoIA = {
  user_id?: string | null;
  route?: string | null;
  /** `numeric` en Postgres: PostgREST lo devuelve como CADENA ("0.001234"). */
  cost_usd?: number | string | null;
  input_tokens?: number | string | null;
  output_tokens?: number | string | null;
  cached_tokens?: number | string | null;
  created_at?: string | null;
  subject_id?: number | null;
};

/**
 * Cómo se llama cada ruta delante del administrador. Las tres que escriben hoy
 * son `chat` (`actions/chat.ts`), `pregunta` (`exams.ts`) y `ficha`
 * (`flashcards.ts`). Una ruta nueva sin etiqueta se enseña por su nombre.
 */
export const RUTA_IA_LABEL: Record<string, string> = {
  chat: 'Chat',
  pregunta: 'Generar preguntas',
  ficha: 'Generar fichas',
};

export function etiquetaRuta(ruta: string): string {
  return RUTA_IA_LABEL[ruta] ?? ruta;
}

export type TotalGastoIA = {
  coste: number;
  entrada: number;
  salida: number;
  cacheados: number;
  llamadas: number;
};

export type GastoPorAlumno = {
  userId: string;
  coste: number;
  llamadas: number;
  entrada: number;
  salida: number;
};

export type GastoPorRuta = { ruta: string; coste: number; llamadas: number };

/** `mes` en formato `YYYY-MM`. */
export type GastoPorMes = { mes: string; coste: number; llamadas: number };

export type ResumenGastoIA = {
  total: TotalGastoIA;
  /** De más caro a más barato. */
  porAlumno: GastoPorAlumno[];
  /** De más caro a más barato. */
  porRuta: GastoPorRuta[];
  /** En orden cronológico. */
  porMes: GastoPorMes[];
  /**
   * Coste medio por alumno CON gasto. `null` si no hay ninguno (regla 8):
   * dividir entre cero da `NaN`, y «0,00 $» mentiría diciendo que servir a un
   * alumno sale gratis.
   */
  costeMedioPorAlumno: number | null;
  /** ISO de la primera y la última llamada con fecha. `null` si no hay ninguna. */
  desde: string | null;
  hasta: string | null;
};

/** Número o cadena numérica -> número. Lo que no se puede leer cuenta como 0. */
function num(v: number | string | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

/** `created_at` ISO -> `YYYY-MM`, o `null` si no se puede leer. */
function mesDe(valor: string | null | undefined): string | null {
  if (typeof valor !== 'string' || valor.length < 7) return null;
  const ms = Date.parse(valor);
  if (!Number.isFinite(ms)) return null;
  return valor.slice(0, 7);
}

/**
 * Agrega las filas de `ai_usage` en los cuatro cortes del panel: el total, por
 * alumno, por ruta y por mes.
 *
 * Cada fila cuenta como UNA llamada aunque su coste sea 0 —`ai-usage.ts` ya no
 * persiste las que no tienen ni un token, así que una fila a cero aquí es una
 * llamada real cuyo `usageMetadata` vino incompleto, y esconderla falsearía el
 * recuento.
 */
export function resumeGastoIA(filas: FilaGastoIA[]): ResumenGastoIA {
  const total: TotalGastoIA = { coste: 0, entrada: 0, salida: 0, cacheados: 0, llamadas: 0 };
  const porAlumno = new Map<string, GastoPorAlumno>();
  const porRuta = new Map<string, GastoPorRuta>();
  const porMes = new Map<string, GastoPorMes>();

  let desde: number | null = null;
  let hasta: number | null = null;

  for (const fila of filas ?? []) {
    const coste = num(fila.cost_usd);
    const entrada = num(fila.input_tokens);
    const salida = num(fila.output_tokens);
    const cacheados = num(fila.cached_tokens);

    total.coste += coste;
    total.entrada += entrada;
    total.salida += salida;
    total.cacheados += cacheados;
    total.llamadas += 1;

    const uid = typeof fila.user_id === 'string' && fila.user_id ? fila.user_id : null;
    if (uid) {
      const a = porAlumno.get(uid) ?? { userId: uid, coste: 0, llamadas: 0, entrada: 0, salida: 0 };
      a.coste += coste;
      a.llamadas += 1;
      a.entrada += entrada;
      a.salida += salida;
      porAlumno.set(uid, a);
    }

    const ruta = typeof fila.route === 'string' && fila.route ? fila.route : 'sin ruta';
    const r = porRuta.get(ruta) ?? { ruta, coste: 0, llamadas: 0 };
    r.coste += coste;
    r.llamadas += 1;
    porRuta.set(ruta, r);

    const mes = mesDe(fila.created_at);
    if (mes) {
      const m = porMes.get(mes) ?? { mes, coste: 0, llamadas: 0 };
      m.coste += coste;
      m.llamadas += 1;
      porMes.set(mes, m);

      const ms = Date.parse(fila.created_at as string);
      if (desde === null || ms < desde) desde = ms;
      if (hasta === null || ms > hasta) hasta = ms;
    }
  }

  const alumnos = [...porAlumno.values()].sort((a, b) => b.coste - a.coste || b.llamadas - a.llamadas);

  return {
    total,
    porAlumno: alumnos,
    porRuta: [...porRuta.values()].sort((a, b) => b.coste - a.coste || b.llamadas - a.llamadas),
    porMes: [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes)),
    costeMedioPorAlumno: alumnos.length ? total.coste / alumnos.length : null,
    desde: desde === null ? null : new Date(desde).toISOString(),
    hasta: hasta === null ? null : new Date(hasta).toISOString(),
  };
}

/**
 * Formatea un coste en dólares para la pantalla. Por debajo de un céntimo se
 * dice «< $0.01» en vez de «$0.00»: un total redondeado a cero cuando SÍ se ha
 * gastado es la misma mentira tranquilizadora de la regla 4, un escalón abajo.
 */
export function formateaUSD(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) return '$0.00';
  if (valor < 0.01) return '< $0.01';
  return `$${valor.toFixed(2)}`;
}
