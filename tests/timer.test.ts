import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  elapsedSeconds,
  displaySeconds,
  formatTime,
  shouldTick,
  voiceCueFor,
  BEEPS,
  TICK_FROM_SECONDS,
} from '../app/lib/timer';

/**
 * El cronometro contaba restando 1 en cada `setInterval(1000)`. Un setInterval
 * no es exacto: se retrasa con la pestania en segundo plano, con la carga del
 * movil y con el ahorro de bateria. En el test de Cooper, que dura 12 minutos,
 * ese desfase se acumula y el alumno mide mal su marca.
 */

const SEC = 1000;

describe('elapsedSeconds', () => {
  it('mide desde la marca de arranque, no contando ticks', () => {
    const t0 = 1_000_000;
    expect(elapsedSeconds(t0, 0, t0 + 30 * SEC)).toBe(30);
  });

  it('no se desvia aunque el repintado llegue tarde', () => {
    // Este es el caso que rompia el cronometro anterior: si el navegador
    // congela la pestania 5 minutos, al volver el tiempo real ya ha pasado.
    const t0 = 1_000_000;
    expect(elapsedSeconds(t0, 0, t0 + 300 * SEC)).toBe(300);
  });

  it('suma lo acumulado en pausas anteriores', () => {
    const t0 = 1_000_000;
    expect(elapsedSeconds(t0, 45 * SEC, t0 + 15 * SEC)).toBe(60);
  });

  it('en pausa solo cuenta lo acumulado', () => {
    expect(elapsedSeconds(null, 90 * SEC, 9_999_999)).toBe(90);
  });

  it('nunca devuelve negativos aunque el reloj retroceda', () => {
    const t0 = 1_000_000;
    expect(elapsedSeconds(t0, 0, t0 - 5 * SEC)).toBe(0);
  });
});

describe('displaySeconds', () => {
  it('la cuenta atras resta del total', () => {
    expect(displaySeconds('countdown', 720, 0)).toBe(720);
    expect(displaySeconds('countdown', 720, 60)).toBe(660);
  });

  it('la cuenta atras no baja de cero', () => {
    expect(displaySeconds('countdown', 720, 800)).toBe(0);
  });

  it('el cronometro cuenta hacia arriba', () => {
    expect(displaySeconds('stopwatch', 0, 137)).toBe(137);
  });
});

describe('formatTime', () => {
  it('formatea mm:ss con dos digitos', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(720)).toBe('12:00');
    expect(formatTime(3661)).toBe('61:01');
  });

  it('un valor negativo se muestra a cero, no como "-1:-1"', () => {
    expect(formatTime(-5)).toBe('0:00');
  });
});

describe('shouldTick', () => {
  it('pita cada segundo en los ultimos diez', () => {
    for (let s = 1; s <= TICK_FROM_SECONDS; s++) {
      expect(shouldTick('countdown', s), `quedan ${s}s`).toBe(true);
    }
  });

  it('no pita antes de los ultimos diez ni al llegar a cero', () => {
    expect(shouldTick('countdown', TICK_FROM_SECONDS + 1)).toBe(false);
    expect(shouldTick('countdown', 0)).toBe(false);
  });

  it('el cronometro ascendente no pita', () => {
    expect(shouldTick('stopwatch', 5)).toBe(false);
  });
});

describe('voiceCueFor', () => {
  it('avisa en los minutos clave', () => {
    expect(voiceCueFor('countdown', 11 * 60)).toContain('11 minutos');
    expect(voiceCueFor('countdown', 6 * 60)).toContain('Mitad de tiempo');
    expect(voiceCueFor('countdown', 3 * 60)).toContain('3 minutos');
    expect(voiceCueFor('countdown', 60)).toContain('Último minuto');
  });

  it('no avisa en un minuto cualquiera', () => {
    expect(voiceCueFor('countdown', 8 * 60)).toBeNull();
  });

  it('solo avisa en el segundo exacto del cambio de minuto', () => {
    expect(voiceCueFor('countdown', 3 * 60 + 1)).toBeNull();
    expect(voiceCueFor('countdown', 3 * 60 - 1)).toBeNull();
  });

  it('no avisa al llegar a cero ni en modo cronometro', () => {
    expect(voiceCueFor('countdown', 0)).toBeNull();
    expect(voiceCueFor('stopwatch', 180)).toBeNull();
  });
});

describe('BEEPS', () => {
  it('los cuatro tipos tienen parametros', () => {
    // `milestone` estaba en el tipo y NO tenia rama en el reproductor: pedirlo
    // no hacia absolutamente nada.
    for (const kind of ['tick', 'milestone', 'start', 'end'] as const) {
      expect(BEEPS[kind].freq, kind).toBeGreaterThan(0);
      expect(BEEPS[kind].durationMs, kind).toBeGreaterThan(0);
    }
  });
});

describe('el componente no repite los fallos anteriores', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app/components/student/modules/training/components/TacticalTimer.tsx'),
    'utf-8'
  );

  it('reutiliza un solo AudioContext y lo cierra al desmontar', () => {
    // Antes se creaba uno por pitido y no se cerraba nunca. En los ultimos 10
    // segundos se llama una vez por segundo y el navegador limita los contextos
    // simultaneos: el audio se apagaba justo en el tramo que mas importa.
    expect(src).toContain('audioCtxRef');
    expect(src).toContain('audioCtxRef.current?.close()');
    expect(src.match(/new Ctor\(\)/g) ?? []).toHaveLength(1);
  });

  it('no ejecuta efectos dentro del actualizador de setState', () => {
    // `speak`, `playBeep` y `onFinish` vivian dentro de `setTime(prev => ...)`,
    // que debe ser una funcion pura: en StrictMode se ejecuta dos veces y
    // sonaba todo por duplicado.
    expect(src).not.toMatch(/setTime\(\s*\(prev\)?\s*=>/);
  });

  it('el intervalo solo repinta: el tiempo sale del reloj', () => {
    expect(src).toContain('setInterval(() => setNow(Date.now())');
    expect(src).toContain('elapsedSeconds(');
  });
});
