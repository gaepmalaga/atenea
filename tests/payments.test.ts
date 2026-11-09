import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  periodoActual,
  periodosRecientes,
  formateaPeriodo,
  formateaEUR,
} from '../app/lib/payments';

/**
 * PAGOS MENSUALES EN EFECTIVO (P8).
 *
 * «Elijo septiembre, me salen los alumnos activos, marco quién paga, y veo el
 * recuento y lo cobrado.» La aritmética del resumen se testea aquí — regla 8
 * («sin importe» no es «0 €») y en dinero importa.
 */

describe('los periodos', () => {
  it('periodoActual es YYYY-MM', () => {
    expect(periodoActual(new Date(2026, 8, 15))).toBe('2026-09');
    expect(periodoActual(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('periodosRecientes va del mes actual hacia atrás y cruza el año', () => {
    const ps = periodosRecientes(4, new Date(2026, 1, 10)); // febrero 2026
    expect(ps).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('formateaPeriodo en español', () => {
    expect(formateaPeriodo('2026-09')).toBe('septiembre de 2026');
    expect(formateaPeriodo('nada')).toBe('nada');
  });
});

describe('formateaEUR', () => {
  it('null -> «—» (regla 8)', () => {
    expect(formateaEUR(null)).toBe('—');
  });
  it('coma decimal', () => {
    expect(formateaEUR(29.9)).toBe('29,90 €');
    expect(formateaEUR(0)).toBe('0,00 €');
  });
});

describe('las guardas de la acción', () => {
  const crudo = readFileSync(join(__dirname, '..', 'app', 'actions', 'payments.ts'), 'utf-8');
  // Sin comentarios: un comentario que cita el patrón no cuenta como código.
  const src = crudo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  const cuerpo = (n: string) => {
    const i = src.indexOf(`export async function ${n}`);
    const j = src.indexOf('export async function', i + 10);
    return src.slice(i, j < 0 ? undefined : j);
  };

  it('todo requireAdmin + clave de servicio', () => {
    expect(exportadas.length).toBeGreaterThan(8);
    for (const n of exportadas) {
      expect(cuerpo(n).slice(0, 300), n).toMatch(/requireAdmin\(\)/);
    }
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient/);
  });

  it('cada consulta va acotada a la academia DENTRO de la consulta (reglas 65 y 75)', () => {
    const sueltas: string[] = [];
    for (const m of src.matchAll(/\.from\('(\w+)'\)/g)) {
      const resto = src.slice(m.index!, m.index! + 700);
      const sentencia = resto.slice(0, resto.search(/\)\);|\);\n|;\n/) + 1 || 700);
      // `class_members` se pide por los grupos DE la academia, o con su filtro.
      if (m[1] === 'class_members' && /\.in\('class_id'|class_groups\.organization_id/.test(sentencia)) continue;
      if (!/organization_id|academy_id/.test(sentencia)) sueltas.push(`${m[1]}: ${sentencia.slice(0, 80)}`);
    }
    expect(sueltas).toEqual([]);
  });

  it('un alumno que llega de la pantalla se comprueba que es de la academia antes de escribir (regla 1)', () => {
    for (const n of ['registraCobro', 'setCuotaMes']) {
      const c = cuerpo(n);
      const comprueba = c.indexOf('esDeLaAcademia(');
      expect(comprueba, n).toBeGreaterThan(0);
      expect(comprueba, n).toBeLessThan(c.indexOf('.upsert('));
    }
    // Las otras escriben con un update acotado a la academia: si no es suyo, no toca nada.
    for (const n of ['anulaCobro', 'setCuotaPropia']) {
      expect(cuerpo(n), n).not.toMatch(/\.upsert\(|\.insert\(/);
    }
  });

  it('el mes se abre solo con los activos y no exentos', () => {
    expect(src).toMatch(/access_status === 'active'/);
    expect(src).toMatch(/x\.activo && !x\.exento/);
  });

  it('el importe se lee con leeImporte: vacío es null, nunca 0 (regla 16)', () => {
    for (const n of ['registraCobro', 'setCuotaMes', 'setCuotaPropia', 'setPrecioTipo', 'savePack']) {
      expect(cuerpo(n), n).toMatch(/leeImporte\(/);
      expect(cuerpo(n), n).not.toMatch(/Number\(/);
    }
  });
});
