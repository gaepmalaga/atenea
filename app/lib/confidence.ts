/**
 * CALIBRACIÓN DE LA CONFIANZA (P10b · técnica 8 de METODO-APRENDIZAJE.md).
 *
 * En la oposición CNP los fallos restan: cada 2 fallos, un acierto menos
 * (`CNP_SCORING`). Así que *saber cuándo no lo sabes* —y dejar en blanco— es una
 * habilidad, y es entrenable si se mide. Al responder en entrenamiento, el
 * alumno marca «seguro / a medias / a ciegas», y esto convierte esas marcas en
 * un cuadro de calibración.
 *
 * Módulo PURO (regla 21). NO escribe nada. La columna `question_attempts.confidence`
 * la añade `docs/sql/P10b-marca-de-confianza.sql` — hasta que se ejecute, esta
 * aritmética no tiene datos que agregar, pero ya está lista y con tests.
 */

import { isBlankAnswer } from './exam-results.ts';

/** 0 = a ciegas · 1 = a medias · 2 = seguro. `null` = no se preguntó. */
export const CONFIDENCE = { CIEGAS: 0, MEDIAS: 1, SEGURO: 2 } as const;
export type ConfidenceLevel = (typeof CONFIDENCE)[keyof typeof CONFIDENCE];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  0: 'A ciegas',
  1: 'A medias',
  2: 'Seguro',
};

/** Cuánto vale un fallo, en aciertos. Con 3 opciones, medio acierto. */
const PENALIZACION_FALLO = 0.5;

export type ConfidenceAttempt = {
  is_correct?: boolean | null;
  selected_index?: number | null;
  confidence?: number | null;
};

export type NivelCalibracion = {
  nivel: ConfidenceLevel;
  /** Respuestas CONTESTADAS con esta marca (los blancos van aparte). */
  total: number;
  aciertos: number;
  /** Sobre las contestadas. `null` si no hay ninguna con esta marca (regla 8). */
  acierto: number | null;
};

export type ResumenCalibracion = {
  /** `true` si NINGUNA respuesta trae marca de confianza (aún sin datos / P10b sin ejecutar). */
  sinDatos: boolean;
  porNivel: NivelCalibracion[];
  /**
   * Sobreconfianza: contestadas «seguro» que se fallaron. Si es alta, el alumno
   * cree saber cosas que no sabe — el error más caro en un examen con
   * penalización.
   */
  seguroFallado: number;
  /** Contestadas «a ciegas»: aciertos y fallos. */
  ciegasAciertos: number;
  ciegasFallos: number;
  /**
   * Aciertos NETOS de lo contestado «a ciegas» (`aciertos − fallos/2`). Si es
   * NEGATIVO, adivinar le está restando: dejar esas en blanco habría puntuado
   * más. `0` si no contestó ninguna a ciegas.
   */
  netoDeAdivinar: number;
  /** Blancos: la decisión de no arriesgar. Ni suman ni restan. */
  blancos: number;
};

function nivelDe(v: unknown): ConfidenceLevel | null {
  return v === 0 || v === 1 || v === 2 ? v : null;
}

function redondea(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Agrega las marcas de confianza de un alumno en un cuadro de calibración.
 *
 * Solo cuentan las respuestas CONTESTADAS con marca. Un blanco es una decisión
 * (regla 24) y se cuenta aparte; una respuesta sin `confidence` (histórico, o
 * simulacro) no entra en `porNivel`.
 */
export function resumeCalibracion(intentos: ConfidenceAttempt[]): ResumenCalibracion {
  const porNivel = new Map<ConfidenceLevel, { total: number; aciertos: number }>([
    [0, { total: 0, aciertos: 0 }],
    [1, { total: 0, aciertos: 0 }],
    [2, { total: 0, aciertos: 0 }],
  ]);

  let conMarca = 0;
  let blancos = 0;
  let seguroFallado = 0;
  let ciegasAciertos = 0;
  let ciegasFallos = 0;

  for (const it of intentos ?? []) {
    if (isBlankAnswer(it.selected_index)) {
      blancos++;
      continue;
    }
    const nivel = nivelDe(it.confidence);
    if (nivel === null) continue;

    conMarca++;
    const acc = porNivel.get(nivel)!;
    acc.total++;
    if (it.is_correct) acc.aciertos++;

    if (nivel === CONFIDENCE.SEGURO && !it.is_correct) seguroFallado++;
    if (nivel === CONFIDENCE.CIEGAS) {
      if (it.is_correct) ciegasAciertos++;
      else ciegasFallos++;
    }
  }

  return {
    sinDatos: conMarca === 0,
    porNivel: [0, 1, 2].map((n) => {
      const nivel = n as ConfidenceLevel;
      const a = porNivel.get(nivel)!;
      return {
        nivel,
        total: a.total,
        aciertos: a.aciertos,
        acierto: a.total > 0 ? Math.round((a.aciertos / a.total) * 100) : null,
      };
    }),
    seguroFallado,
    ciegasAciertos,
    ciegasFallos,
    netoDeAdivinar: ciegasAciertos + ciegasFallos > 0
      ? redondea(ciegasAciertos - ciegasFallos * PENALIZACION_FALLO)
      : 0,
    blancos,
  };
}

/**
 * Una frase de consejo a partir del cuadro. La calibración solo enseña si se
 * traduce a algo accionable.
 */
export function consejoCalibracion(r: ResumenCalibracion): string | null {
  if (r.sinDatos) return null;
  if (r.netoDeAdivinar < 0) {
    return `Contestaste ${r.ciegasFallos + r.ciegasAciertos} a ciegas y en neto te restaron ${Math.abs(r.netoDeAdivinar)} aciertos: dejarlas en blanco habría puntuado más.`;
  }
  if (r.seguroFallado >= 3) {
    return `Fallaste ${r.seguroFallado} que dabas por seguras. Ese es el error más caro: repásalas con calma.`;
  }
  const seguro = r.porNivel.find((n) => n.nivel === CONFIDENCE.SEGURO);
  if (seguro && seguro.total >= 10 && (seguro.acierto ?? 100) >= 95) {
    return 'Tu «seguro» es de fiar. Cuando lo tengas claro, contesta sin miedo a la penalización.';
  }
  return null;
}
