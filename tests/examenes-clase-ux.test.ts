import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regla 124: la pantalla «En clase» compacta, «Pegar notas», el nombre
 * automático, el aviso de duplicados y la calculadora de nota.
 */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));

const acciones = lee('app/actions/examenes-clase.ts');
const cuerpo = (nombre: string) => {
  const i = acciones.indexOf(`export async function ${nombre}`);
  expect(i, nombre).toBeGreaterThan(-1);
  const sig = acciones.indexOf('\nexport async function', i + 10);
  return acciones.slice(i, sig === -1 ? undefined : sig);
};

describe('aplicaExamen: el nombre es opcional y no se repite sin avisar', () => {
  const f = cuerpo('aplicaExamen');

  it('ya no exige un nombre: sin él se pone solo', () => {
    expect(f).not.toMatch(/Ponle un nombre/);
    expect(f).toMatch(/propio \|\| nombreDeAplicacion\(/);
  });

  it('mira lo ya puesto de ESTE examen y de ESTA academia antes de insertar', () => {
    const previos = f.indexOf("from('exam_sittings').select('id, label, sat_on, class_ids')");
    expect(previos).toBeGreaterThan(-1);
    expect(f.slice(previos, previos + 200)).toMatch(/\.eq\('organization_id', org\)\.eq\('paper_id', paper\.id\)/);
    expect(previos).toBeLessThan(f.indexOf('.insert('));
  });

  it('si coincide, se niega salvo confirmación explícita', () => {
    expect(f).toMatch(/if \(solapan\.length && d\.confirmaRepetido !== true\)/);
    expect(f).toMatch(/yaPuesto: cuales/);
  });

  it('el aviso se anota en el registro cuando se repite a sabiendas', () => {
    expect(f).toMatch(/repetido: solapan\.length > 0/);
  });
});

describe('getExamenesGuardados enseña a qué grupos y qué día ya se puso', () => {
  it('lleva `puestos` y lo lee de la academia', () => {
    const f = cuerpo('getExamenesGuardados');
    expect(f).toMatch(/puestos: puestosDe\.get\(f\.id\) \?\? \[\]/);
    expect(f).toMatch(/\.from\('exam_sittings'\)\.select\('paper_id, sat_on, class_ids'\)\.eq\('organization_id', org\)/);
  });
});

describe('setResultadosProfesor: todo o nada, de esta academia', () => {
  const f = cuerpo('setResultadosProfesor');

  it('exige admin y acota el examen puesto a su academia', () => {
    expect(f).toMatch(/requireAdmin\(\)/);
    expect(f).toMatch(/from\('exam_sittings'\)\.select\('id, class_ids'\)\.eq\('organization_id', org\)\.eq\('id', d\.aplicacionId\)/);
  });

  it('tiene tope de filas', () => {
    expect(f).toMatch(/d\.filas\.length > MAX_LOTE/);
  });

  it('valida TODAS las filas y que los alumnos sean del examen ANTES de escribir ninguna', () => {
    const escribe = f.indexOf('.upsert(');
    expect(escribe).toBeGreaterThan(-1);
    expect(f.indexOf('for (const f of d.filas)')).toBeLessThan(escribe);
    // La condición misma, no solo el mensaje: sin ella un id de otro grupo se escribiría igual.
    expect(f).toMatch(/if \(\[\.\.\.filas\.keys\(\)\]\.some\(\(id\) => !suyos\.has\(id\)\)\) return \{ success: false as const, error: 'Algún alumno no es de este examen\.' \}/);
    expect(f.indexOf('suyos.has(id)')).toBeLessThan(escribe);
  });

  it('una sola escritura, con la clave de siempre', () => {
    expect((f.match(/\.upsert\(/g) ?? []).length).toBe(1);
    expect(f).toMatch(/onConflict: 'sitting_id,user_id'/);
  });

  it('quien trae nota estuvo, y a quien no vino se le quita la nota oficial', () => {
    expect(f).toMatch(/teacher_score: null, absent: true/);
    expect(f).toMatch(/teacher_score: n\.nota, absent: false/);
  });

  it('no toca lo que entregó el alumno: no escribe respuestas ni nota calculada', () => {
    expect(f).not.toMatch(/(?<!teacher_)score:|answers:|submitted_at:|correct:|wrong:|blank:/);
  });
});

describe('los textos: «aplicación» era jerga', () => {
  const admin = lee('app/components/Admin/components/examenes/EnClase.tsx') + lee('app/components/Admin/components/examenes/Guardados.tsx');

  it('ya no se habla de «aplicaciones» ni se pide «Cómo lo llamas»', () => {
    for (const mal of ['Todas las aplicaciones', 'Borrar esta aplicación', 'esta aplicación', 'Cómo lo llamas']) {
      expect(admin, mal).not.toContain(mal);
    }
    expect(acciones).not.toMatch(/Esa aplicación|esta aplicación|la aplicación,/);
  });

  it('se llaman «Exámenes puestos a un turno» y «Borrar este examen puesto»', () => {
    expect(admin).toContain('Exámenes puestos a un turno');
    expect(admin).toContain('Borrar este examen puesto');
  });
});

describe('la pantalla En clase', () => {
  const src = lee('app/components/Admin/components/examenes/EnClase.tsx');

  it('tiene las cuatro pestañas', () => {
    for (const p of ["'notas'", "'resumen'", "'preguntas'", "'ajustes'"]) expect(src).toContain(p);
  });

  it('«Pegar notas» no guarda hasta pulsar el botón', () => {
    const pegar = src.slice(src.indexOf('function PegarNotas'));
    // Solo `guarda()` llama a `onGuardar`, y solo la enlaza el botón de guardar.
    expect((pegar.match(/onGuardar\(/g) ?? []).length).toBe(1);
    expect(pegar).toMatch(/async function guarda\(\)[\s\S]*onGuardar\(/);
    expect(pegar).toMatch(/<Boton onClick=\{guarda\}/);
  });

  it('lo que pega se lee con la función pura, con los alumnos de ESTE examen', () => {
    expect(src).toMatch(/leeNotasPegadas\(texto, alumnos\)/);
    expect(src).toMatch(/alumnos=\{d\.participantes\.map/);
  });

  it('la nota oficial de una fila sigue guardándose sola al salir del campo', () => {
    expect(src).toMatch(/onBlur=\{\(\) => \{ const antes/);
  });

  it('el nombre del alumno se puede leer entero: dos líneas antes que cortarlo', () => {
    expect(src).toMatch(/line-clamp-2/);
    expect(src).not.toMatch(/truncate[^\n]*\{p\.nombre\}/);
  });
});

describe('la calculadora de nota del alumno', () => {
  const comp = lee('app/components/student/modules/presencial/CalculadoraNota.tsx');
  const pantalla = lee('app/components/student/modules/presencial/ExamenesClase.tsx');
  const lib = lee('app/lib/calculadora-nota.ts');

  it('está en «Exámenes» y se enseña aunque no haya ningún examen puesto', () => {
    expect(pantalla).toMatch(/examenes !== null && <CalculadoraNota \/>/);
  });

  it('usa la función pura y no guarda nada', () => {
    expect(comp).toContain("from '@/app/lib/calculadora-nota'");
    expect(comp).not.toMatch(/from '@\/actions'|localStorage|fetch\(/);
  });

  it('la fórmula no se reescribe: sale de `scoreExam` (regla 22)', () => {
    expect(lib).toMatch(/scoreExam\(hechas, reglas\)/);
    expect(lib).not.toMatch(/\(alternativas - 1\)|options - 1/);
  });
});
