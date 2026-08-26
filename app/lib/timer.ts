/**
 * Cronometro de las pruebas fisicas. Modulo puro y testeable.
 *
 * El cronometro anterior contaba restando 1 en cada `setInterval(1000)`. Un
 * `setInterval` no es exacto: se retrasa con la pestania en segundo plano, con
 * la carga del movil y con el ahorro de bateria. En el test de Cooper, que dura
 * 12 minutos, ese desfase se acumula y el alumno mide mal su marca.
 *
 * Aqui el tiempo se deriva SIEMPRE de marcas de reloj, asi que el intervalo solo
 * decide cada cuanto se repinta, no cuanto tiempo ha pasado.
 */

export type TimerMode = 'countdown' | 'stopwatch';

/** Segundos transcurridos desde que arranco, contando pausas anteriores. */
export function elapsedSeconds(startedAtMs: number | null, accumulatedMs: number, nowMs: number): number {
  const running = startedAtMs === null ? 0 : Math.max(0, nowMs - startedAtMs);
  return Math.floor((accumulatedMs + running) / 1000);
}

/** Lo que se muestra: cuenta atras o cuenta adelante. */
export function displaySeconds(mode: TimerMode, duration: number, elapsed: number): number {
  if (mode === 'stopwatch') return elapsed;
  return Math.max(0, duration - elapsed);
}

/** mm:ss */
export function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/** Segundos restantes a partir de los cuales suena el pitido de cada segundo. */
export const TICK_FROM_SECONDS = 10;

export function shouldTick(mode: TimerMode, secondsLeft: number): boolean {
  return mode === 'countdown' && secondsLeft > 0 && secondsLeft <= TICK_FROM_SECONDS;
}

/**
 * Avisos de voz por minuto restante.
 *
 * Solo suenan en el segundo exacto del cambio de minuto; el componente ademas
 * lleva cuenta de lo ya anunciado para que un repintado no lo repita.
 */
const VOICE_CUES: Record<number, string> = {
  11: 'Quedan 11 minutos',
  6: 'Mitad de tiempo. Mantén el ritmo.',
  3: 'Quedan 3 minutos. ¡Tú puedes!',
  1: '¡Último minuto! ¡Dalo todo!',
};

export function voiceCueFor(mode: TimerMode, secondsLeft: number): string | null {
  if (mode !== 'countdown') return null;
  if (secondsLeft <= 0 || secondsLeft % 60 !== 0) return null;
  return VOICE_CUES[secondsLeft / 60] ?? null;
}

/** Tipos de senial acustica. */
export type BeepKind = 'tick' | 'milestone' | 'start' | 'end';

/**
 * Parametros de cada pitido.
 *
 * `milestone` estaba en el tipo y no tenia rama en el reproductor: pedirlo no
 * hacia absolutamente nada.
 */
export const BEEPS: Record<BeepKind, { freq: number; gain: number; durationMs: number; slideTo?: number }> = {
  tick:      { freq: 800,  gain: 0.10, durationMs: 100 },
  milestone: { freq: 1200, gain: 0.15, durationMs: 200 },
  start:     { freq: 1000, gain: 0.10, durationMs: 300 },
  end:       { freq: 300,  gain: 0.30, durationMs: 2000, slideTo: 100 },
};
