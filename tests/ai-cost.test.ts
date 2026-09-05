import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resumeGastoIA,
  formateaUSD,
  etiquetaRuta,
  type FilaGastoIA,
} from '../app/lib/ai-cost';

/**
 * EL PANEL DE CONSUMO DE IA (P6).
 *
 * `ai_usage` guarda una fila por llamada a Gemini. Esto la agrega para el
 * administrador. La aritmetica es la que este repositorio ha fallado siempre:
 * numerador y denominador de muestras distintas, y ceros donde no hay datos
 * (reglas 8 y 4).
 */

const fila = (f: Partial<FilaGastoIA>): FilaGastoIA => ({
  user_id: 'u1',
  route: 'chat',
  cost_usd: 0.01,
  input_tokens: 1000,
  output_tokens: 100,
  cached_tokens: 0,
  created_at: '2026-09-01T10:00:00Z',
  ...f,
});

describe('resumeGastoIA · el total', () => {
  it('suma coste y tokens de todas las filas', () => {
    const r = resumeGastoIA([
      fila({ cost_usd: 0.02, input_tokens: 2000, output_tokens: 200 }),
      fila({ cost_usd: 0.03, input_tokens: 3000, output_tokens: 300 }),
    ]);
    expect(r.total.coste).toBeCloseTo(0.05, 6);
    expect(r.total.entrada).toBe(5000);
    expect(r.total.salida).toBe(500);
    expect(r.total.llamadas).toBe(2);
  });

  it('lee `cost_usd` cuando PostgREST lo devuelve como CADENA', () => {
    // `numeric` en Postgres llega como string ("0.001234"). Sin parsearlo, el
    // total sale 0 y el panel diria que servir a los alumnos es gratis.
    const r = resumeGastoIA([
      fila({ cost_usd: '0.0125' as unknown as number }),
      fila({ cost_usd: '0.0075' as unknown as number }),
    ]);
    expect(r.total.coste).toBeCloseTo(0.02, 6);
  });

  it('un campo ilegible cuenta CERO, nunca NaN (regla 4)', () => {
    const r = resumeGastoIA([
      fila({ cost_usd: null, input_tokens: undefined, output_tokens: 'x' as unknown as number }),
      fila({ cost_usd: -5 }),
    ]);
    expect(Number.isFinite(r.total.coste)).toBe(true);
    expect(r.total.coste).toBe(0);
    expect(r.total.llamadas).toBe(2);
  });

  it('sin ninguna fila, todo a cero y las listas vacias', () => {
    const r = resumeGastoIA([]);
    expect(r.total.llamadas).toBe(0);
    expect(r.porAlumno).toEqual([]);
    expect(r.porRuta).toEqual([]);
    expect(r.porMes).toEqual([]);
    expect(r.desde).toBeNull();
    expect(r.hasta).toBeNull();
  });
});

describe('resumeGastoIA · el coste medio por alumno', () => {
  it('es null sin alumnos, no cero (regla 8)', () => {
    // 0,00 $ diria "servir a un alumno sale gratis"; null dice "no hay dato".
    expect(resumeGastoIA([]).costeMedioPorAlumno).toBeNull();
  });

  it('divide el total entre los alumnos CON gasto, no entre las filas', () => {
    const r = resumeGastoIA([
      fila({ user_id: 'a', cost_usd: 0.10 }),
      fila({ user_id: 'a', cost_usd: 0.10 }),
      fila({ user_id: 'b', cost_usd: 0.20 }),
    ]);
    // total 0,40 entre 2 alumnos = 0,20
    expect(r.costeMedioPorAlumno).toBeCloseTo(0.2, 6);
  });

  it('las filas sin usuario cuentan en el total pero no crean un alumno', () => {
    const r = resumeGastoIA([
      fila({ user_id: null, cost_usd: 0.30 }),
      fila({ user_id: 'a', cost_usd: 0.10 }),
    ]);
    expect(r.total.coste).toBeCloseTo(0.4, 6);
    expect(r.porAlumno).toHaveLength(1);
    expect(r.costeMedioPorAlumno).toBeCloseTo(0.4, 6);
  });
});

describe('resumeGastoIA · los cortes', () => {
  it('ordena los alumnos de mas caro a mas barato', () => {
    const r = resumeGastoIA([
      fila({ user_id: 'barato', cost_usd: 0.01 }),
      fila({ user_id: 'caro', cost_usd: 0.50 }),
      fila({ user_id: 'medio', cost_usd: 0.10 }),
    ]);
    expect(r.porAlumno.map((a) => a.userId)).toEqual(['caro', 'medio', 'barato']);
  });

  it('agrupa por ruta y ordena por coste', () => {
    const r = resumeGastoIA([
      fila({ route: 'chat', cost_usd: 0.05 }),
      fila({ route: 'ficha', cost_usd: 0.30 }),
      fila({ route: 'chat', cost_usd: 0.05 }),
    ]);
    expect(r.porRuta[0]).toMatchObject({ ruta: 'ficha', coste: 0.3, llamadas: 1 });
    expect(r.porRuta[1]).toMatchObject({ ruta: 'chat', llamadas: 2 });
    expect(r.porRuta[1].coste).toBeCloseTo(0.1, 6);
  });

  it('agrupa por mes en formato YYYY-MM y en orden cronologico', () => {
    const r = resumeGastoIA([
      fila({ created_at: '2026-10-05T00:00:00Z', cost_usd: 0.02 }),
      fila({ created_at: '2026-09-20T00:00:00Z', cost_usd: 0.01 }),
      fila({ created_at: '2026-09-01T00:00:00Z', cost_usd: 0.01 }),
    ]);
    expect(r.porMes.map((m) => m.mes)).toEqual(['2026-09', '2026-10']);
    expect(r.porMes[0].coste).toBeCloseTo(0.02, 6);
    expect(r.porMes[0].llamadas).toBe(2);
  });

  it('una fecha ilegible no rompe: la fila cuenta en el total pero no en un mes', () => {
    const r = resumeGastoIA([
      fila({ created_at: 'ni idea', cost_usd: 0.05 }),
      fila({ created_at: null, cost_usd: 0.05 }),
    ]);
    expect(r.total.coste).toBeCloseTo(0.1, 6);
    expect(r.porMes).toEqual([]);
    expect(r.desde).toBeNull();
  });

  it('desde/hasta son la primera y la ultima llamada con fecha', () => {
    const r = resumeGastoIA([
      fila({ created_at: '2026-09-15T12:00:00Z' }),
      fila({ created_at: '2026-09-01T08:00:00Z' }),
      fila({ created_at: '2026-09-30T20:00:00Z' }),
    ]);
    expect(r.desde).toBe(new Date('2026-09-01T08:00:00Z').toISOString());
    expect(r.hasta).toBe(new Date('2026-09-30T20:00:00Z').toISOString());
  });
});

describe('formateaUSD', () => {
  it('un gasto real por debajo de un centimo no se redondea a cero (regla 4)', () => {
    expect(formateaUSD(0.004)).toBe('< $0.01');
  });
  it('cero es cero', () => {
    expect(formateaUSD(0)).toBe('$0.00');
    expect(formateaUSD(-1)).toBe('$0.00');
  });
  it('dos decimales', () => {
    expect(formateaUSD(3.14159)).toBe('$3.14');
    expect(formateaUSD(12)).toBe('$12.00');
  });
});

describe('etiquetaRuta', () => {
  it('traduce las tres rutas que escriben hoy', () => {
    expect(etiquetaRuta('chat')).toBe('Chat');
    expect(etiquetaRuta('pregunta')).toBe('Generar preguntas');
    expect(etiquetaRuta('ficha')).toBe('Generar fichas');
  });
  it('una ruta nueva sin etiqueta se enseña por su nombre, no se oculta', () => {
    expect(etiquetaRuta('resumen')).toBe('resumen');
  });
});

describe('la accion getAiCostOverview', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'ai-cost.ts'), 'utf-8');

  it('exige rol de admin antes de tocar nada (regla 34: ai_usage no tiene politicas)', () => {
    expect(src).toMatch(/requireAdmin\(\)/);
    const cuerpo = src.slice(src.indexOf('export async function getAiCostOverview'));
    expect(cuerpo.indexOf('requireAdmin')).toBeLessThan(cuerpo.indexOf('supabaseAdmin'));
  });

  it('va con la clave de servicio, no con la sesion', () => {
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient/);
  });

  it('no acepta ningun identificador de usuario como parametro (regla 1)', () => {
    expect(src).toMatch(/export async function getAiCostOverview\(\)/);
  });

  it('la aritmetica no esta en la accion, esta en lib/ (regla 21)', () => {
    expect(src).toMatch(/from '\.\.\/lib\/ai-cost'/);
    // La accion no vuelve a sumar por su cuenta.
    expect(src).not.toMatch(/\.reduce\(/);
  });

  it('esta en el barril de acciones', () => {
    const barril = readdirSync(join(__dirname, '..', 'app', 'actions'));
    expect(barril).toContain('ai-cost.ts');
    const index = readFileSync(join(__dirname, '..', 'app', 'actions', 'index.ts'), 'utf-8');
    expect(index).toMatch(/ai-cost/);
  });
});
