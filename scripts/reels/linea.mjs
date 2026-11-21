/**
 * LA LÍNEA DE TIEMPO DE UN REEL DE PREGUNTA TEST (módulo puro).
 *
 * La usan dos cosas a la vez: la plantilla que dibuja cada fotograma y el
 * sonido. Si cada una calculara los tiempos por su cuenta, el «tic» no caería
 * donde cae el número. Todos los tiempos en segundos.
 */

const palabras = (s) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
const r2 = (x) => Math.round(x * 100) / 100;

/** Segundos de cuenta atrás según la dificultad: más difícil, más tiempo para pensar. */
export const CUENTA_ATRAS = { 1: 5, 2: 6, 3: 7 };

export function lineaDeTiempo(p) {
  const nq = palabras(p.pregunta);
  const ne = palabras(p.explicacion);

  const gancho = 1.7;                                  // «¿LA SABES?»
  const q0 = gancho;                                   // empieza la pregunta
  const qDur = Math.max(2.0, nq * 0.075 + 0.7);        // las palabras van entrando
  const cards0 = r2(q0 + qDur + 0.35);                 // entran las 3 opciones
  const cardsDur = 0.4 + 2 * 0.12;
  const cdStart = r2(cards0 + cardsDur + 0.4);         // empieza la cuenta atrás
  const cdDur = CUENTA_ATRAS[p.dificultad] ?? 6;
  const reveal = r2(cdStart + cdDur + 0.3);            // se desvela la correcta
  const trans = r2(reveal + 1.4);                      // la correcta sube y entra la explicación
  const expl0 = r2(trans + 0.5);
  const explDur = Math.max(2.4, ne / 4.0 + 0.6);
  const ref0 = r2(expl0 + Math.min(1.0, explDur * 0.35));
  const end0 = r2(expl0 + explDur + 1.1);              // tarjeta final
  const endDur = 2.8;
  return {
    gancho, q0, qDur: r2(qDur), cards0, cardsDur, cdStart, cdDur, reveal, trans, expl0,
    explDur: r2(explDur), ref0, end0, endDur, total: r2(end0 + endDur),
  };
}
