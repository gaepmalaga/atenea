import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASOS_BORRADO, CLAVES_TABLAS } from '../app/lib/demo-motor';
import { TABLAS_POR_USUARIO, TABLAS_POR_GRUPO } from '../app/lib/limpieza';

/**
 * EL BORRADO DE LA DEMO NUNCA ES «POR ACADEMIA» (regla 106).
 *
 * La base de datos es la de producción y no tiene copias. Todo borrado de los
 * datos de demostración tiene que acotarse a una lista de ids o de claves que
 * sale del registro (cuentas, grupos o sesiones de la demo, o filas apuntadas).
 * Estas guardas leen el código y fallan si alguien añade un `delete` más
 * ancho. Se comprobó rompiéndolas a propósito.
 */

const raiz = join(__dirname, '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (f: string) => sinComentarios(readFileSync(join(raiz, f), 'utf-8').replace(/\r\n/g, '\n'));
const esquema = JSON.parse(readFileSync(join(raiz, 'supabase/schema.json'), 'utf-8')).tablas as Record<string, { columnas: string[] }>;

const adaptador = leer('app/actions/demo.ts');
const motor = leer('app/lib/demo-motor.ts');

describe('el adaptador: los únicos borrados', () => {
  it('hay exactamente dos `.delete()` y cada uno va acotado a ids o a una clave entera', () => {
    const todos = [...adaptador.matchAll(/\.delete\(/g)];
    expect(todos).toHaveLength(2);
    const bien = [...adaptador.matchAll(/\.delete\(\)\s*\.(in|match)\(/g)].map((m) => m[1]).sort();
    expect(bien).toEqual(['in', 'match']);
  });

  it('un borrado sin ids o sin clave no borra nada (no se convierte en «todo»)', () => {
    expect(adaptador).toMatch(/if \(!ids\.length\) return \{ error: null \}/);
    expect(adaptador).toMatch(/if \(!Object\.keys\(clave\)\.length\) return/);
  });

  it('nada borra con eq/neq/like/gt/is/or/not/filter', () => {
    expect(adaptador).not.toMatch(/\.delete\(\)\s*\.(eq|neq|like|ilike|gt|gte|lt|lte|is|or|not|filter)\(/);
    expect(adaptador).not.toMatch(/\.delete\(\)\s*;/);
    expect(adaptador).not.toMatch(/\.delete\(\)\s*\n?\s*\.select/);
  });

  it('solo llama a las dos funciones de cobros, y nunca a la IA', () => {
    expect(adaptador).toMatch(/RPC_PERMITIDAS = new Set\(\['registra_cobro', 'anula_cobros'\]\)/);
    expect(adaptador).not.toMatch(/gemini|genAI|chatModel|questionModel|embeddingModel/i);
  });
});

describe('el motor: quién llama a los borrados', () => {
  it('el motor no importa Supabase: solo habla con la DemoDb', () => {
    expect(motor).not.toMatch(/supabase|from ['"]\.\.\/actions/i);
  });

  it('`borraEn` solo se llama con el registro (por id) o con un paso del plan; `borraClave` con un paso o el contador', () => {
    const llamadasEn = [...motor.matchAll(/\.borraEn\(([^,]+),\s*([^,]+),/g)].map((m) => `${m[1].trim()}|${m[2].trim()}`);
    expect(llamadasEn.length).toBeGreaterThan(0);
    for (const l of llamadasEn) expect(['REGISTRO|\'id\'', 'p.tabla|p.columna'], l).toContain(l);
    expect(llamadasEn.filter((l) => l === 'p.tabla|p.columna')).toHaveLength(1);
    const llamadasClave = [...motor.matchAll(/\.borraClave\(([^,]+),/g)].map((m) => m[1].trim());
    expect(llamadasClave.sort()).toEqual(["'receipt_counters'", 'p.tabla']);
  });

  it('el contador de recibos solo se borra por su clave y tras mirar si quedan cobros', () => {
    expect(motor).toMatch(/cont\.accion === 'borrar'[\s\S]{0,200}borraClave\('receipt_counters', \{ organization_id: org \}\)/);
  });

  it('ningún borrado de datos se acota con organization_id / academy_id', () => {
    // La academia solo sirve para LEER el registro; los pasos no la usan.
    for (const p of PASOS_BORRADO) expect(['organization_id', 'academy_id']).not.toContain(p.columna);
  });
});

describe('el plan de borrado', () => {
  it('cada paso sale de cuentas, grupos, sesiones o del registro: no hay origen «academia»', () => {
    for (const p of PASOS_BORRADO) expect(['usuarios', 'grupos', 'sesiones', 'registro'], `${p.tabla}.${p.columna}`).toContain(p.origen);
  });

  it('cada origen borra solo por su columna', () => {
    const permitidas: Record<string, string[]> = {
      usuarios: ['user_id', 'id'],
      grupos: ['class_id', 'id'],
      sesiones: ['session_id', 'id'],
      registro: ['id', 'class_id', 'week_start', 'subject_id'],
    };
    for (const p of PASOS_BORRADO) expect(permitidas[p.origen], `${p.tabla}.${p.columna}`).toContain(p.columna);
    // `id` de usuarios solo en perfiles; `id` de grupos solo en class_groups; `id` de sesiones solo en training_sessions.
    for (const p of PASOS_BORRADO.filter((x) => x.columna === 'id')) {
      expect({ usuarios: 'profiles', grupos: 'class_groups', sesiones: 'training_sessions', registro: 'session_templates' }[p.origen]).toBe(p.tabla);
    }
  });

  it('toda tabla y columna del plan existe en el esquema', () => {
    for (const p of PASOS_BORRADO) {
      expect(esquema[p.tabla], p.tabla).toBeTruthy();
      expect(esquema[p.tabla].columnas, `${p.tabla}.${p.columna}`).toContain(p.columna);
      for (const c of p.claveCompuesta ?? []) expect(esquema[p.tabla].columnas, `${p.tabla}.${c}`).toContain(c);
    }
    for (const [t, pk] of Object.entries(CLAVES_TABLAS)) for (const c of pk) expect(esquema[t].columnas, `${t}.${c}`).toContain(c);
  });

  it('cubre todo lo que cuelga de una cuenta y de un grupo (las listas de la limpieza)', () => {
    const porUsuario = new Set(PASOS_BORRADO.filter((p) => p.columna === 'user_id').map((p) => p.tabla));
    for (const t of TABLAS_POR_USUARIO) expect(porUsuario.has(t), `falta ${t} por user_id`).toBe(true);
    const porGrupo = new Set(PASOS_BORRADO.filter((p) => p.origen === 'grupos' && p.columna === 'class_id').map((p) => p.tabla));
    for (const t of TABLAS_POR_GRUPO) expect(porGrupo.has(t), `falta ${t} por class_id`).toBe(true);
  });

  it('las filas de la propia carga que cuelgan de una sesión se borran antes que la sesión, y las de un grupo antes que el grupo', () => {
    const pos = (t: string, c: string) => PASOS_BORRADO.findIndex((p) => p.tabla === t && p.columna === c);
    expect(pos('training_session_logs', 'session_id')).toBeLessThan(pos('training_sessions', 'id'));
    expect(pos('class_members', 'class_id')).toBeLessThan(pos('class_groups', 'id'));
    expect(pos('payment_entries', 'user_id')).toBeLessThan(pos('profiles', 'id'));
    expect(pos('profiles_physical', 'user_id')).toBeLessThan(pos('profiles', 'id'));
  });

  it('nada del banco común, del temario, de los profesores ni del libro de la academia entero', () => {
    const tablas = new Set(PASOS_BORRADO.map((p) => p.tabla));
    for (const t of ['question_bank', 'subjects', 'documents', 'academy_staff', 'group_kinds', 'fee_packs', 'academy_settings', 'academy_convocatoria', 'academies', 'admin_audit_log', 'receipt_counters', 'staff_activities']) {
      expect(tablas.has(t), t).toBe(false);
    }
  });
});
