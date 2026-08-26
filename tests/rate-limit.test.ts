import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { consume, sweep, buckets, QUOTAS, type QuotaName } from '../app/lib/rate-limit';

const T0 = 1_700_000_000_000;

beforeEach(() => buckets.clear());

describe('consume', () => {
  it('deja pasar hasta el limite y bloquea a partir de ahi', () => {
    const limite = QUOTAS.chat.limit;
    for (let i = 0; i < limite; i++) {
      expect(consume('u1', 'chat', T0).ok).toBe(true);
    }
    const bloqueada = consume('u1', 'chat', T0);
    expect(bloqueada.ok).toBe(false);
  });

  it('va descontando lo que queda', () => {
    const primera = consume('u1', 'chat', T0);
    expect(primera.ok && primera.remaining).toBe(QUOTAS.chat.limit - 1);
    const segunda = consume('u1', 'chat', T0);
    expect(segunda.ok && segunda.remaining).toBe(QUOTAS.chat.limit - 2);
  });

  it('la cuota es POR USUARIO', () => {
    // Si el contador fuera global, un alumno activo dejaria sin chat a todos
    // los demas. Ese es peor fallo que no tener cuota.
    for (let i = 0; i < QUOTAS.chat.limit; i++) consume('u1', 'chat', T0);
    expect(consume('u2', 'chat', T0).ok).toBe(true);
  });

  it('la cuota es POR RUTA', () => {
    // Agotar el chat no puede dejar al alumno sin flashcards.
    for (let i = 0; i < QUOTAS.chat.limit; i++) consume('u1', 'chat', T0);
    expect(consume('u1', 'flashcard', T0).ok).toBe(true);
  });

  it('la ventana se reinicia al expirar', () => {
    for (let i = 0; i < QUOTAS.chat.limit; i++) consume('u1', 'chat', T0);
    expect(consume('u1', 'chat', T0).ok).toBe(false);
    expect(consume('u1', 'chat', T0 + QUOTAS.chat.windowMs).ok).toBe(true);
  });

  it('un usuario bloqueado sigue bloqueado justo antes de expirar', () => {
    for (let i = 0; i < QUOTAS.chat.limit; i++) consume('u1', 'chat', T0);
    expect(consume('u1', 'chat', T0 + QUOTAS.chat.windowMs - 1).ok).toBe(false);
  });

  it('dice cuanto falta, en un mensaje que el alumno entiende', () => {
    for (let i = 0; i < QUOTAS.plan.limit; i++) consume('u1', 'plan', T0);
    const res = consume('u1', 'plan', T0 + 30 * 60_000);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.retryAfterMs).toBe(30 * 60_000);
      expect(res.error).toContain('30 min');
      // Nada de "429" ni de nombres internos de ruta.
      expect(res.error).not.toContain('plan');
    }
  });

  it('nunca dice "en 0 min"', () => {
    for (let i = 0; i < QUOTAS.plan.limit; i++) consume('u1', 'plan', T0);
    const res = consume('u1', 'plan', T0 + QUOTAS.plan.windowMs - 100);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('1 min');
  });

  it('devuelve un resultado, no lanza', () => {
    // Igual que `requireUser`: las Server Actions redactan las excepciones en
    // produccion y el alumno veria un error generico inutil.
    for (let i = 0; i < QUOTAS.chat.limit + 5; i++) {
      expect(() => consume('u1', 'chat', T0)).not.toThrow();
    }
  });

  it('todas las cuotas tienen limite y ventana positivos', () => {
    for (const [nombre, q] of Object.entries(QUOTAS)) {
      expect(q.limit, nombre).toBeGreaterThan(0);
      expect(q.windowMs, nombre).toBeGreaterThan(0);
    }
  });
});

describe('sweep', () => {
  it('tira las entradas expiradas y conserva las vivas', () => {
    // Sin limpieza, el mapa crece con cada usuario que pasa y no baja nunca.
    consume('viejo', 'chat', T0);
    consume('nuevo', 'chat', T0 + QUOTAS.chat.windowMs);
    expect(buckets.size).toBe(2);

    sweep(T0 + QUOTAS.chat.windowMs + 1);
    expect(buckets.size).toBe(1);
    expect(buckets.has('chat:nuevo')).toBe(true);
  });

  it('limpiar no le devuelve la cuota a quien la agoto', () => {
    for (let i = 0; i < QUOTAS.chat.limit; i++) consume('u1', 'chat', T0);
    sweep(T0);
    expect(consume('u1', 'chat', T0).ok).toBe(false);
  });
});

// ============================================================
// GUARDAS ESTATICAS
// ============================================================

const ACTIONS = join(__dirname, '..', 'app', 'actions');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const acciones = readdirSync(ACTIONS)
  .filter((f) => f.endsWith('.ts') && f !== 'core.ts' && f !== 'index.ts')
  .map((f) => ({ name: f, src: stripComments(readFileSync(join(ACTIONS, f), 'utf-8')) }));

/**
 * Trocea un fichero de acciones en funciones de primer nivel.
 *
 * Las llamadas al modelo no siempre estan dentro de la accion exportada: en
 * `exams.ts` viven en un ayudante privado (`generateTestQuestion`) al que llaman
 * dos acciones distintas. Mirar solo la accion que envuelve textualmente la
 * llamada da falsos positivos, asi que se sigue la cadena de llamadas.
 */
function funciones(src: string): { name: string; exported: boolean; body: string }[] {
  const out: { name: string; exported: boolean; body: string }[] = [];
  const re = /^(export )?async function (\w+)/gm;
  const marcas = [...src.matchAll(re)];

  marcas.forEach((m, i) => {
    const inicio = m.index!;
    const fin = i + 1 < marcas.length ? marcas[i + 1].index! : src.length;
    out.push({ name: m[2], exported: !!m[1], body: src.slice(inicio, fin) });
  });
  return out;
}

const LLAMA_AL_MODELO = /\b(generateContent|embedContent)\s*\(/;

describe('ninguna llamada al modelo se hace sin cuota', () => {
  it('toda acción que llega a Gemini comprueba checkQuota antes', () => {
    // Cinco acciones llamaban al modelo sin ningún control: cada mensaje, cada
    // tarjeta y cada turno de entrevista es una llamada de pago.
    const sinCuota: string[] = [];

    for (const { name: fichero, src } of acciones) {
      const fns = funciones(src);
      // Ayudantes privados que tocan el modelo: llamarlos cuenta como llamarlo.
      const ayudantes = fns.filter((f) => !f.exported && LLAMA_AL_MODELO.test(f.body)).map((f) => f.name);
      const tocaElModelo = (body: string) =>
        LLAMA_AL_MODELO.test(body) || ayudantes.some((a) => new RegExp(`\\b${a}\\s*\\(`).test(body));

      for (const fn of fns) {
        if (!fn.exported || !tocaElModelo(fn.body)) continue;
        if (!fn.body.includes('checkQuota')) sinCuota.push(`${fichero}: ${fn.name}`);
      }
    }

    expect(sinCuota).toEqual([]);
  });

  it('el ayudante que llama al modelo no se usa desde ningún sitio sin cuota', () => {
    // Si mañana alguien añade una acción que llama a `generateTestQuestion` y
    // se olvida de la cuota, el test de arriba ya lo coge. Este fija el otro
    // extremo: que el ayudante sigue siendo privado.
    const exams = acciones.find((a) => a.name === 'exams.ts')!.src;
    expect(exams).toContain('async function generateTestQuestion');
    expect(exams).not.toContain('export async function generateTestQuestion');
  });

  it('la cuota se espera: sin await, el resultado es una promesa y `!quota.ok` es siempre falso', () => {
    // `checkQuota` es async desde que la versión duradera consulta la BD. Una
    // llamada sin `await` devuelve una promesa, `.ok` es `undefined` y la
    // comprobación deja pasar TODO sin que falle nada visible.
    for (const { name, src } of acciones) {
      for (const m of src.matchAll(/checkQuota\(/g)) {
        expect(src.slice(m.index! - 6, m.index!), name).toBe('await ');
      }
    }
  });

  it('la cuota se pide con el id de la sesión, nunca con uno de parámetro', () => {
    for (const { name, src } of acciones) {
      for (const m of src.matchAll(/checkQuota\(([^,]+),/g)) {
        expect(m[1].trim(), name).toMatch(/^(auth\.user\.id|userId)$/);
      }
    }
  });

  it('cada nombre de cuota usado existe en QUOTAS', () => {
    const validos = new Set(Object.keys(QUOTAS));
    for (const { name, src } of acciones) {
      for (const m of src.matchAll(/checkQuota\([^,]+,\s*'([^']+)'/g)) {
        expect(validos.has(m[1] as QuotaName), `${name}: ${m[1]}`).toBe(true);
      }
    }
  });
});
