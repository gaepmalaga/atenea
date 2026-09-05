import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeGroupInput,
  admitePlan,
  etiquetaTipo,
  planEfectivo,
  GROUP_KINDS,
} from '../app/lib/groups';
import type { WeeklyPlan } from '../app/lib/training-plan';

/**
 * GRUPOS Y PREPARACIÓN FÍSICA (P7).
 *
 * P5f montó UN texto libre por alumno (`profiles.class_group`). No servía: los
 * grupos son muchos-a-muchos y un tipo de grupo se comporta distinto (físicas
 * lleva plan, teoría no). Esto vigila la normalización de la entrada y la
 * decisión de qué plan ve un alumno.
 */

describe('normalizeGroupInput', () => {
  it('un grupo sin nombre no se guarda (formulario a medio rellenar, no dato ausente)', () => {
    expect(normalizeGroupInput({ kind: 'fisicas' })).toBeNull();
    expect(normalizeGroupInput({ name: '   ' })).toBeNull();
  });

  it('recorta el nombre y lo limita', () => {
    expect(normalizeGroupInput({ name: '  Promoción 41 tarde  ' })?.name).toBe('Promoción 41 tarde');
    expect(normalizeGroupInput({ name: 'x'.repeat(300) })?.name).toHaveLength(120);
  });

  it('un tipo desconocido cae a "otro", no revienta', () => {
    expect(normalizeGroupInput({ name: 'G', kind: 'quimica' })?.kind).toBe('otro');
    expect(normalizeGroupInput({ name: 'G' })?.kind).toBe('otro');
  });

  it('acepta los cuatro tipos válidos', () => {
    for (const k of GROUP_KINDS) {
      expect(normalizeGroupInput({ name: 'G', kind: k })?.kind).toBe(k);
    }
  });

  it('horario y profesor vacíos son null, no cadena vacía (reglas 8 y 16)', () => {
    const g = normalizeGroupInput({ name: 'G', schedule: '  ', staffId: '' });
    expect(g?.schedule).toBeNull();
    expect(g?.staffId).toBeNull();
  });
});

describe('admitePlan / etiquetaTipo', () => {
  it('solo los grupos de físicas llevan plan de entrenamiento', () => {
    expect(admitePlan('fisicas')).toBe(true);
    expect(admitePlan('teoria')).toBe(false);
    expect(admitePlan('ingles')).toBe(false);
    expect(admitePlan('otro')).toBe(false);
  });

  it('un tipo sin etiqueta se enseña por su nombre', () => {
    expect(etiquetaTipo('fisicas')).toBe('Físicas');
    expect(etiquetaTipo('raro')).toBe('raro');
  });
});

describe('planEfectivo · el individual manda sobre el de grupo', () => {
  const ind = { weekFocus: 'individual', days: [] } as unknown as WeeklyPlan;
  const grp = { weekFocus: 'grupo', days: [] } as unknown as WeeklyPlan;

  it('con plan individual, ese gana', () => {
    expect(planEfectivo(ind, grp)).toEqual({ plan: ind, origen: 'individual' });
  });

  it('sin individual, hereda el del grupo', () => {
    expect(planEfectivo(null, grp)).toEqual({ plan: grp, origen: 'grupo' });
  });

  it('sin ninguno, ninguno — y se dice, no se finge (regla 8)', () => {
    expect(planEfectivo(null, null)).toEqual({ plan: null, origen: 'ninguno' });
    expect(planEfectivo(undefined, undefined).origen).toBe('ninguno');
  });
});

describe('las guardas de la acción', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'groups.ts'), 'utf-8');
  const training = readFileSync(join(__dirname, '..', 'app', 'actions', 'training.ts'), 'utf-8');

  it('cada acción exportada exige requireAdmin', () => {
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exportadas.length).toBeGreaterThan(6);
    for (const nombre of exportadas) {
      const cuerpo = src.slice(src.indexOf(`export async function ${nombre}`), src.indexOf(`export async function ${nombre}`) + 400);
      expect(cuerpo, `${nombre} sin requireAdmin`).toMatch(/requireAdmin\(\)/);
    }
  });

  it('todo va con la clave de servicio', () => {
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient|\bdb\.from\(/);
  });

  it('no se cuelga un plan de un grupo que no es de físicas', () => {
    const fn = src.slice(src.indexOf('export async function saveGroupTrainingPlan'));
    expect(fn).toMatch(/admitePlan/);
  });

  it('el plan de grupo se valida con normalizePlan, igual que el individual (regla 27)', () => {
    expect(src).toMatch(/normalizePlan\(buildManualPlan/);
  });

  it('el alumno hereda el plan de su grupo de físicas SOLO si no tiene uno individual', () => {
    const fn = training.slice(
      training.indexOf('export async function getActiveTrainingPlan'),
      training.indexOf('export async function completeTrainingDay'),
    );
    // Primero mira el individual; el fallback al grupo va después.
    expect(fn.indexOf("origen: 'individual'")).toBeGreaterThan(-1);
    expect(fn.indexOf("origen: 'grupo'")).toBeGreaterThan(fn.indexOf("origen: 'individual'"));
    expect(fn).toMatch(/'fisicas'/);
  });

  it('no se pueden marcar días en un plan de grupo (es compartido)', () => {
    const fn = training.slice(
      training.indexOf('export async function completeTrainingDay'),
      training.indexOf('export async function completeTrainingDay') + 1200,
    );
    expect(fn).toMatch(/grupo:/);
  });
});
