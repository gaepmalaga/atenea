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

  it('el plan de semana viejo ya no se toca desde los grupos (reglas 86 y 97)', () => {
    // `getGroupTrainingPlan`, `saveGroupTrainingPlan` y `deleteGroupTrainingPlan`
    // se retiraron: ninguna pantalla las usaba desde que la física son
    // sesiones sueltas. Si vuelven, el borrado de la tabla vacía romperá algo.
    for (const f of ['getGroupTrainingPlan', 'saveGroupTrainingPlan', 'deleteGroupTrainingPlan']) {
      expect(src, f).not.toContain(`export async function ${f}`);
    }
    expect(src).not.toContain("from('group_training_plans')");
  });

  it('el plan de grupo por semanas se retiró con su tabla (regla 98): nadie la lee', () => {
    expect(training).not.toContain("from('group_training_plans')");
    expect(training).not.toContain('export async function getStudentGroupWeeks');
    expect(training).not.toContain('idsGruposConPlan');
  });
});

describe('grupos: Multi, horas a mano y borrar con cuidado (regla 99)', () => {
  const lee = (f: string) => readFileSync(join(__dirname, '..', 'app', f), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('un grupo se marca Multi solo con `true` explícito', () => {
    expect(normalizeGroupInput({ name: 'Multi', isMulti: true })?.isMulti).toBe(true);
    expect(normalizeGroupInput({ name: 'Kappa' })?.isMulti).toBe(false);
    expect(normalizeGroupInput({ name: 'Kappa', isMulti: 'true' })?.isMulti).toBe(false);
  });

  it('crear y cambiar un grupo escriben is_multi', () => {
    const src = lee('actions/groups.ts');
    for (const f of ['createGroup', 'updateGroup']) {
      const c = src.slice(src.indexOf(`export async function ${f}`), src.indexOf('\nexport async function', src.indexOf(`export async function ${f}`) + 10));
      expect(c, f).toContain('is_multi: clean.isMulti');
    }
  });

  it('la pantalla pregunta antes de borrar un grupo (el 6 nov se perdió uno así)', () => {
    const src = lee('components/Admin/components/AdminGroups.tsx');
    expect(src).toMatch(/onBorrar=\{async \(\) => \{[\s\S]*?if \(g && \(await confirmar\([\s\S]*?deleteGroup\(g\.id\)/);
  });

  it('las horas del grupo no usan type="time" (en Android salía vacío)', () => {
    expect(lee('components/Admin/components/AdminGroups.tsx')).not.toMatch(/type="time"/);
  });
});

describe('el cuadrante de grupos: carriles y tramos', () => {
  it('dos clases a la misma hora van una al lado de otra, no una encima de otra', async () => {
    const { enCarriles } = await import('../app/lib/groups');
    const r = enCarriles([
      { id: 'alpha', ini: 8, fin: 9 },
      { id: 'kappa', ini: 8, fin: 9 },
      { id: 'zetta', ini: 20, fin: 21 },
    ]);
    const de = (id: string) => r.find((x) => x.id === id)!;
    expect([de('alpha').carril, de('kappa').carril].sort()).toEqual([0, 1]);
    expect(de('alpha').carriles).toBe(2);
    expect(de('zetta')).toMatchObject({ carril: 0, carriles: 1 });
  });

  it('una clase que empieza cuando acaba otra reutiliza su carril', async () => {
    const { enCarriles } = await import('../app/lib/groups');
    const r = enCarriles([{ id: 'a', ini: 8, fin: 10 }, { id: 'b', ini: 9, fin: 11 }, { id: 'c', ini: 10, fin: 12 }]);
    expect(r.find((x) => x.id === 'c')!.carril).toBe(0);
    expect(r.every((x) => x.carriles === 2)).toBe(true);
  });

  it('las horas vacías entre la mañana y la tarde no se pintan', async () => {
    const { tramosDeHoras } = await import('../app/lib/groups');
    expect(tramosDeHoras([{ ini: 8, fin: 9 }, { ini: 20, fin: 21 }, { ini: 10, fin: 13 }])).toEqual([{ desde: 8, hasta: 13 }, { desde: 20, hasta: 21 }]);
    expect(tramosDeHoras([])).toEqual([]);
  });
});
