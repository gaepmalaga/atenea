import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeGroupInput,
  normalizeKindInput,
  slugDeTipo,
  llevaPlan,
  etiquetaTipo,
  planEfectivo,
  type GroupKindRow,
} from '../app/lib/groups';
import type { WeeklyPlan } from '../app/lib/training-plan';

/**
 * GRUPOS Y TIPOS DE GRUPO (P7 · rehecho en P8).
 *
 * P8: el tipo de grupo vive en `group_kinds` (editable), un grupo tiene varios
 * profesores, y los alumnos se asignan desde el alumno. Esto vigila la
 * normalización de la entrada y la decisión de qué plan ve un alumno.
 */

const KINDS: GroupKindRow[] = [
  { id: 'teoria', label: 'Teoría', lleva_plan: false },
  { id: 'fisicas', label: 'Físicas', lleva_plan: true },
  { id: 'oposicion-completa', label: 'Oposición completa', lleva_plan: true },
];

describe('normalizeGroupInput', () => {
  it('un grupo sin nombre no se guarda', () => {
    expect(normalizeGroupInput({ kind: 'fisicas' })).toBeNull();
    expect(normalizeGroupInput({ name: '   ' })).toBeNull();
  });

  it('recorta el nombre y limita', () => {
    expect(normalizeGroupInput({ name: '  Promoción 41 tarde  ' })?.name).toBe('Promoción 41 tarde');
    expect(normalizeGroupInput({ name: 'x'.repeat(300) })?.name).toHaveLength(120);
  });

  it('`kind` es cualquier cadena (se valida en la acción), vacío -> "otro"', () => {
    expect(normalizeGroupInput({ name: 'G', kind: 'lo-que-sea' })?.kind).toBe('lo-que-sea');
    expect(normalizeGroupInput({ name: 'G' })?.kind).toBe('otro');
  });

  it('`staffIds` sin repetidos, ignora lo que no es cadena', () => {
    const g = normalizeGroupInput({ name: 'G', staffIds: ['a', 'a', 'b', 3, null] });
    expect(g?.staffIds).toEqual(['a', 'b']);
  });

  it('horario vacío es null, no cadena vacía (reglas 8 y 16)', () => {
    expect(normalizeGroupInput({ name: 'G', schedule: '   ' })?.schedule).toBeNull();
  });
});

describe('tipos de grupo', () => {
  it('slugDeTipo: quita tildes, minúsculas, guiones', () => {
    expect(slugDeTipo('Oposición completa')).toBe('oposicion-completa');
    expect(slugDeTipo('  Solo Físicas!!  ')).toBe('solo-fisicas');
  });

  it('normalizeKindInput: sin label no se guarda; el id sale del label si falta', () => {
    expect(normalizeKindInput({ lleva_plan: true })).toBeNull();
    expect(normalizeKindInput({ label: 'Oposición completa' })).toEqual({
      id: 'oposicion-completa', label: 'Oposición completa', lleva_plan: false,
    });
  });

  it('llevaPlan mira `lleva_plan` de la lista, no `kind === "fisicas"` a pelo', () => {
    expect(llevaPlan('fisicas', KINDS)).toBe(true);
    expect(llevaPlan('oposicion-completa', KINDS)).toBe(true);
    expect(llevaPlan('teoria', KINDS)).toBe(false);
    expect(llevaPlan('lo-que-sea', KINDS)).toBe(false);
  });

  it('etiquetaTipo: el label, o el id si no está en la lista', () => {
    expect(etiquetaTipo('fisicas', KINDS)).toBe('Físicas');
    expect(etiquetaTipo('raro', KINDS)).toBe('raro');
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
  it('sin ninguno, ninguno', () => {
    expect(planEfectivo(null, null)).toEqual({ plan: null, origen: 'ninguno' });
  });
});

describe('las guardas de la acción', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'groups.ts'), 'utf-8');
  const training = readFileSync(join(__dirname, '..', 'app', 'actions', 'training.ts'), 'utf-8');

  it('cada acción exportada exige requireAdmin', () => {
    const exportadas = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exportadas.length).toBeGreaterThan(6);
    for (const nombre of exportadas) {
      const i = src.indexOf(`export async function ${nombre}`);
      expect(src.slice(i, i + 400), `${nombre} sin requireAdmin`).toMatch(/requireAdmin\(\)/);
    }
  });

  it('todo va con la clave de servicio', () => {
    expect(src).toContain('supabaseAdmin');
    expect(src).not.toMatch(/createSupabaseServerClient|\bdb\.from\(/);
  });

  it('la asignación de grupos es DESDE EL ALUMNO (P8)', () => {
    expect(src).toMatch(/export async function setStudentGroups\(studentId: string/);
  });

  it('un plan de grupo solo se cuelga de un tipo con lleva_plan', () => {
    const fn = src.slice(src.indexOf('export async function saveGroupTrainingPlan'), src.indexOf('export async function deleteGroupTrainingPlan'));
    expect(fn).toMatch(/llevaPlan\(/);
  });

  it('el plan de grupo va semana a semana (P9): upsert por (class_id, week_start) y no se editan semanas pasadas', () => {
    const fn = src.slice(src.indexOf('export async function saveGroupTrainingPlan'), src.indexOf('export async function deleteGroupTrainingPlan'));
    expect(fn).toMatch(/onConflict:\s*'class_id,week_start'/);
    expect(fn).toMatch(/lunesDeSemana\(\)/);
    expect(fn).toMatch(/ya pasó/);
  });

  it('el alumno hereda el plan de grupo por los tipos con lleva_plan, no por "fisicas", y solo la semana vigente', () => {
    const fn = training.slice(
      training.indexOf('export async function getActiveTrainingPlan'),
      training.indexOf('export async function completeTrainingDay'),
    );
    expect(fn).toMatch(/lleva_plan/);
    expect(fn).toMatch(/\.lte\('week_start'/);
    expect(fn.indexOf("origen: 'individual'")).toBeLessThan(fn.indexOf("origen: 'grupo'"));
  });
});
