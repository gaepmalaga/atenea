/**
 * EL VIGILANTE DE LA CONVOCATORIA (regla 141) — la parte pura.
 *
 * Mira el sumario diario del BOE y reconoce lo que toca a la oposición de
 * Escala Básica de la Policía Nacional: la convocatoria, la lista de admitidos,
 * el tribunal, la fecha del ejercicio, los resultados… y la oferta de empleo
 * público del año, que es lo que la precede. El guion
 * (`scripts/operacion/vigilar-convocatoria.mjs`) hace la red y la escritura;
 * aquí vive lo que se puede probar sin ninguna de las dos (regla 21).
 *
 * Reconocer es por el TÍTULO de la disposición, que en el BOE es literal y
 * estable («…por la que se convoca proceso selectivo para ingreso, por
 * oposición libre, en la Escala Básica, categoría de Policía, del Cuerpo
 * Nacional de Policía»). Un aviso de más lo descarta una persona; uno de menos
 * es peor, así que el filtro es holgado en la clase y estricto en la escala.
 */

/** `novedades.tipo` de lo que deja este vigilante. */
export const TIPO_NOVEDAD_CONVOCATORIA = 'convocatoria';

export type ClaseDeConvocatoria =
  | 'convocatoria'
  | 'oferta'
  | 'admitidos'
  | 'tribunal'
  | 'fecha'
  | 'resultados'
  | 'otra';

export type ItemDelBoe = {
  /** `BOE-A-2026-15055`. */
  id: string;
  titulo: string;
  departamento: string | null;
  urlPdf: string | null;
  urlHtml: string | null;
};

export type HalladoDeConvocatoria = ItemDelBoe & { clase: ClaseDeConvocatoria; dia: string };

/** Minúsculas, sin tildes ni signos raros y con los espacios colapsados. */
export function normalizaTitulo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ES_ID_BOE = /^BOE-[A-Z]-\d{4}-\d+$/;

/**
 * Todas las disposiciones de un sumario del BOE (`/datosabiertos/api/boe/sumario/AAAAMMDD`
 * pedido en JSON).
 *
 * El árbol es `diario → seccion → departamento → epigrafe → item`, pero en
 * cada nivel el BOE manda UN objeto cuando hay uno y una lista cuando hay
 * varios, y hay departamentos con `item` directo y otros con `epigrafe`. En
 * vez de depender de esa forma se recorre todo el árbol y se recoge cada nodo
 * que tenga `identificador` y `titulo`, llevando el nombre del departamento.
 */
export function itemsDelSumario(json: unknown): ItemDelBoe[] {
  const salida: ItemDelBoe[] = [];
  const vistos = new Set<string>();

  const visita = (nodo: unknown, departamento: string | null) => {
    if (Array.isArray(nodo)) { for (const n of nodo) visita(n, departamento); return; }
    if (!nodo || typeof nodo !== 'object') return;
    const o = nodo as Record<string, unknown>;
    const id = typeof o.identificador === 'string' ? o.identificador.trim() : '';
    const titulo = typeof o.titulo === 'string' ? o.titulo.trim() : '';
    if (ES_ID_BOE.test(id) && titulo && !vistos.has(id)) {
      vistos.add(id);
      salida.push({
        id,
        titulo,
        departamento,
        urlPdf: typeof o.url_pdf === 'string' ? o.url_pdf : null,
        urlHtml: typeof o.url_html === 'string' ? o.url_html : null,
      });
    }
    for (const [clave, hijo] of Object.entries(o)) {
      if (!hijo || typeof hijo !== 'object') continue;
      if (clave === 'departamento') {
        // Cada departamento lleva su nombre a todo lo que cuelga de él.
        for (const d of Array.isArray(hijo) ? hijo : [hijo]) {
          const nombre = d && typeof d === 'object' && typeof (d as Record<string, unknown>).nombre === 'string'
            ? ((d as Record<string, unknown>).nombre as string) : departamento;
          visita(d, nombre);
        }
      } else {
        visita(hijo, departamento);
      }
    }
  };

  visita(json, null);
  return salida;
}

/**
 * ¿Es de la oposición de Escala Básica de la Policía Nacional? Exige las DOS
 * cosas: la escala y el cuerpo. «Escala Básica» sola también es la de la
 * Guardia Civil o de otros cuerpos, y «Policía Nacional» sola sale en medio
 * BOE (destinos, condecoraciones).
 */
export function esDeEscalaBasicaPolicia(titulo: string): boolean {
  const t = normalizaTitulo(titulo);
  if (!t.includes('escala basica')) return false;
  return t.includes('cuerpo nacional de policia') || t.includes('policia nacional');
}

/** La oferta de empleo público del Estado: general, no solo de la Policía. */
export function esOfertaDeEmpleoPublico(titulo: string): boolean {
  const t = normalizaTitulo(titulo);
  return /oferta de empleo publico/.test(t) && /\b20\d{2}\b/.test(t) && !/(universidad|comunidad|sanitari|entidades locales)/.test(t);
}

/** Qué paso del proceso es, por el título. `otra` si no encaja en ninguno. */
export function claseDelTitulo(titulo: string): ClaseDeConvocatoria {
  const t = normalizaTitulo(titulo);
  if (/lista (provisional|definitiva)?\s*de? ?(aspirantes )?admitidos|admitidos y excluidos|relacion (provisional|definitiva) de aspirantes/.test(t)) return 'admitidos';
  if (/tribunal/.test(t)) return 'tribunal';
  if (/(fecha|lugar|hora)[^.]{0,60}(ejercicio|prueba|examen)|comienzo de (los )?ejercicios|calendario de (las )?pruebas/.test(t)) return 'fecha';
  if (/(aprobados|calificaciones|resultado|relacion de aspirantes que (han )?(superado|aprobado))/.test(t)) return 'resultados';
  if (/(se convoca|convocatoria|proceso selectivo|bases)/.test(t)) return 'convocatoria';
  return 'otra';
}

/**
 * Lo que merece un aviso, de una lista de disposiciones de un día. Nada de lo
 * que no sea de la escala (salvo la oferta de empleo público del Estado).
 */
export function halladosEnElDia(items: ItemDelBoe[], dia: string): HalladoDeConvocatoria[] {
  const hallados: HalladoDeConvocatoria[] = [];
  for (const item of items) {
    if (esDeEscalaBasicaPolicia(item.titulo)) {
      hallados.push({ ...item, clase: claseDelTitulo(item.titulo), dia });
    } else if (esOfertaDeEmpleoPublico(item.titulo)) {
      hallados.push({ ...item, clase: 'oferta', dia });
    }
  }
  return hallados;
}

const ROTULO: Record<ClaseDeConvocatoria, string> = {
  convocatoria: 'Convocatoria de Escala Básica',
  oferta: 'Oferta de empleo público del Estado',
  admitidos: 'Lista de admitidos y excluidos',
  tribunal: 'Tribunal de la oposición',
  fecha: 'Fecha del ejercicio',
  resultados: 'Resultados de la oposición',
  otra: 'Disposición de la oposición',
};

/** `20261120` → `2026-11-20`. */
export function diaLegible(dia8: string): string {
  return /^\d{8}$/.test(dia8) ? `${dia8.slice(0, 4)}-${dia8.slice(4, 6)}-${dia8.slice(6)}` : dia8;
}

/**
 * La marca que se guarda en `novedades.detalle` para no repetir el aviso. El
 * texto del aviso es determinista (misma disposición, mismo texto) y la marca
 * es el identificador del BOE entre corchetes: `existeAviso` la busca ahí.
 */
export function marcaDeAviso(id: string): string {
  return `[${id}]`;
}

export function existeAviso(detallesGuardados: string[], id: string): boolean {
  const marca = marcaDeAviso(id);
  return detallesGuardados.some((d) => d.includes(marca));
}

/** La línea de «Novedades» (regla 138) de una disposición hallada. */
export function novedadDeHallazgo(h: HalladoDeConvocatoria): { tipo: string; titulo: string; detalle: string; autor: string } {
  const titulo = `${ROTULO[h.clase]}: ${h.titulo.length > 150 ? `${h.titulo.slice(0, 147)}…` : h.titulo}`;
  const enlace = h.urlHtml ?? h.urlPdf ?? `https://www.boe.es/diario_boe/txt.php?id=${h.id}`;
  const detalle = [
    `Publicado en el BOE del ${diaLegible(h.dia)} ${marcaDeAviso(h.id)}.`,
    h.departamento ? `Departamento: ${h.departamento}.` : null,
    `Título completo: ${h.titulo}`,
    `Texto oficial: ${enlace}`,
    h.clase === 'oferta'
      ? 'Es la oferta de empleo público general del Estado: confirmar en el texto si trae plazas de Policía Nacional.'
      : 'Lo ha detectado el vigilante a partir del título; confirmar los datos (plazos, plazas, fechas) en el texto oficial.',
  ].filter(Boolean).join('\n');
  return { tipo: TIPO_NOVEDAD_CONVOCATORIA, titulo, detalle, autor: 'Vigilante de la convocatoria' };
}

/** Los días AAAAMMDD de los últimos `dias` días hasta `hoy` (incluido), el más viejo primero. */
export function ultimosDias(dias: number, hoy: Date): string[] {
  const n = Math.min(Math.max(Math.trunc(dias) || 1, 1), 60);
  const base = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());
  const salida: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base - i * 86_400_000);
    salida.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
  }
  return salida;
}
