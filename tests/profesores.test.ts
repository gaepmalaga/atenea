import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claveActividad, normalizaActividad, agrupaHabituales, habitualDeTitulo, profesorSugerido,
  leeListaTemas, formateaTemas, resumenTemas, aciertoDe, MIN_RESPUESTAS_TEMA,
} from '../app/lib/profesores';
import { profesoresOcupados, type GrupoCuadrante, type SesionCuadrante } from '../app/lib/cuadrante';

/**
 * LO QUE DA CADA PROFESOR (regla 100). El caso: el cuadrante de Alphapol de la
 * semana del 9 de noviembre de 2026, con la lista de partida que aprobó el
 * dueño (Boxeo → Juan, Jiujitsu → Lucas, F.M + RDL → Lucio y luego José, FLK →
 * José y luego Olivares).
 */

const [JOSE, LUCAS, OLIVARES, LUCIO, JUAN] = ['jose', 'lucas', 'olivares', 'lucio', 'juan'];
const ACTIVOS = new Set([JOSE, LUCAS, OLIVARES, LUCIO, JUAN]);
const HABITUALES = agrupaHabituales([
  { actividad: 'FLK', profesorId: OLIVARES, prioridad: 2 },
  { actividad: 'FLK', profesorId: JOSE, prioridad: 1 },
  { actividad: 'Boxeo', profesorId: JUAN, prioridad: 1 },
  { actividad: 'Jiujitsu', profesorId: LUCAS, prioridad: 1 },
  { actividad: 'F.M + RDL', profesorId: LUCIO, prioridad: 1 },
  { actividad: 'F.M + RDL', profesorId: JOSE, prioridad: 2 },
]);
const nadie = new Set<string>();

describe('reconocer la clase por el título', () => {
  it('agrupa por clase con los profesores en su orden', () => {
    expect(HABITUALES.find((h) => h.actividad === 'FLK')?.profesorIds).toEqual([JOSE, OLIVARES]);
  });

  it('sin mayúsculas, acentos ni signos: «f.m+rdl» es «F.M + RDL»', () => {
    expect(claveActividad('F.M + RDL')).toBe(claveActividad('f.m+rdl'));
    expect(habitualDeTitulo('f.m+rdl', HABITUALES)?.actividad).toBe('F.M + RDL');
    expect(habitualDeTitulo('BOXEO', HABITUALES)?.actividad).toBe('Boxeo');
    expect(habitualDeTitulo('Jiu-jitsu', HABITUALES)?.actividad).toBe('Jiujitsu');
  });

  it('por el principio: «FLK» vale para FLK 5.0 y 5.1; algo distinto, para nada', () => {
    expect(habitualDeTitulo('FLK 5.0', HABITUALES)?.actividad).toBe('FLK');
    expect(habitualDeTitulo('FLK 5.1', HABITUALES)?.actividad).toBe('FLK');
    expect(habitualDeTitulo('Carrera continua', HABITUALES)).toBeNull();
    expect(habitualDeTitulo('', HABITUALES)).toBeNull();
  });

  it('si encajan dos, la más larga', () => {
    const conTecnico = [...HABITUALES, { actividad: 'Boxeo técnico', profesorIds: [LUCAS] }];
    expect(habitualDeTitulo('Boxeo técnico: guardia', conTecnico)?.actividad).toBe('Boxeo técnico');
    expect(habitualDeTitulo('Boxeo', conTecnico)?.actividad).toBe('Boxeo');
  });

  it('el nombre de una clase: recortado, sin NUL, y con letras o números', () => {
    expect(normalizaActividad('  F.M  +  RDL ')).toBe('F.M + RDL');
    expect(normalizaActividad('a\0b')).toBe('ab');
    expect(normalizaActividad('+++')).toBeNull();
    expect(normalizaActividad('x'.repeat(61))).toBeNull();
    expect(normalizaActividad(5)).toBeNull();
  });
});

describe('el profesor que se propone', () => {
  it('Boxeo → Juan, y lo dice', () => {
    expect(profesorSugerido({ titulo: 'Boxeo', habituales: HABITUALES, ocupados: nadie, activos: ACTIVOS }))
      .toEqual({ profesorId: JUAN, actividad: 'Boxeo', ocupados: [] });
  });

  it('si el primero está en otra clase a esa hora, el siguiente libre', () => {
    const s = profesorSugerido({ titulo: 'F.M + RDL', habituales: HABITUALES, ocupados: new Set([LUCIO]), activos: ACTIVOS });
    expect(s).toEqual({ profesorId: JOSE, actividad: 'F.M + RDL', ocupados: [LUCIO] });
  });

  it('si todos están ocupados, el primero (y el cuadrante avisará del choque)', () => {
    const s = profesorSugerido({ titulo: 'FLK 5.0', habituales: HABITUALES, ocupados: new Set([JOSE, OLIVARES]), activos: ACTIVOS });
    expect(s?.profesorId).toBe(JOSE);
  });

  it('un profesor inactivo no se propone; sin habitual, nada', () => {
    expect(profesorSugerido({ titulo: 'FLK', habituales: HABITUALES, ocupados: nadie, activos: new Set([OLIVARES]) })?.profesorId).toBe(OLIVARES);
    expect(profesorSugerido({ titulo: 'Boxeo', habituales: HABITUALES, ocupados: nadie, activos: new Set([JOSE]) })).toBeNull();
    expect(profesorSugerido({ titulo: 'Natación', habituales: HABITUALES, ocupados: nadie, activos: ACTIVOS })).toBeNull();
  });
});

describe('quién está ocupado a una hora', () => {
  const g = (id: string, inicio: string | null, esMulti = false): GrupoCuadrante => ({
    id, nombre: id, corto: id, esMulti, inscritos: 20, horario: { weekdays: esMulti ? null : [2, 4], startTime: inicio, endTime: null, capacity: 30 },
  });
  const GRUPOS = [g('Betta', '20:00'), g('Delta', '20:00'), g('Omega', '08:00'), g('Multi', null, true)];
  const s = (id: string, grupo: string, profesorId: string | null, horaPropia: string | null = null, fecha = '2026-11-10'): SesionCuadrante =>
    ({ id, classId: grupo, fecha, titulo: 'x', tipo: 'otro', profesorId, horaPropia, position: 0 });
  const SESIONES = [s('d', 'Delta', LUCIO), s('o', 'Omega', LUCAS), s('m', 'Multi', LUCAS, '18:30'), s('j', 'Delta', JUAN, null, '2026-11-12')];

  it('el martes a las 20:00 está Lucio (con Delta); Lucas no (está a las 08:00 y a las 18:30)', () => {
    expect(profesoresOcupados({ sesiones: SESIONES, grupos: GRUPOS, fecha: '2026-11-10', hora: '20:00' })).toEqual(new Set([LUCIO]));
  });

  it('a las 19:00 se solapa con las 18:30 de Multi (una hora por clase)', () => {
    expect(profesoresOcupados({ sesiones: SESIONES, grupos: GRUPOS, fecha: '2026-11-10', hora: '19:00' })).toEqual(new Set([LUCAS]));
  });

  it('la celda que se escribe no cuenta, ni lo de un día quitado, ni sin hora', () => {
    expect(profesoresOcupados({ sesiones: SESIONES, grupos: GRUPOS, fecha: '2026-11-10', hora: '20:00', excluirSesion: 'd' }).size).toBe(0);
    expect(profesoresOcupados({ sesiones: SESIONES, grupos: GRUPOS, fecha: '2026-11-10', hora: '20:00', sinClase: [{ classId: 'Delta', fecha: '2026-11-10', motivo: null }] }).size).toBe(0);
    expect(profesoresOcupados({ sesiones: SESIONES, grupos: GRUPOS, fecha: '2026-11-10', hora: null }).size).toBe(0);
  });
});

describe('los temas de un profesor', () => {
  it('lee lo que se escribe: rangos, comas, «a», guion largo y repetidos', () => {
    expect(leeListaTemas('1-10, 14, 17, 18')).toEqual({ ok: true, temas: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 17, 18] });
    expect(leeListaTemas('temas 3 a 5; 7–8 y 7')).toEqual({ ok: true, temas: [3, 4, 5, 7, 8] });
    expect(leeListaTemas('  ')).toEqual({ ok: true, temas: [] });
    expect(leeListaTemas(null)).toEqual({ ok: true, temas: [] });
  });

  it('dice qué no entiende', () => {
    expect(leeListaTemas('1-10, catorce')).toMatchObject({ ok: false, error: /catorce/ });
    expect(leeListaTemas('51')).toMatchObject({ ok: false, error: /del 1 al 50/ });
    expect(leeListaTemas('0')).toMatchObject({ ok: false });
    expect(leeListaTemas('10-1')).toMatchObject({ ok: false, error: /al revés/ });
    expect(leeListaTemas(7)).toMatchObject({ ok: false });
  });

  it('y lo vuelve a escribir corto', () => {
    expect(formateaTemas([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 17, 18])).toBe('1–10, 14, 17–18');
    expect(formateaTemas([5, 3, 4, 4])).toBe('3–5');
    expect(formateaTemas([])).toBe('');
  });
});

describe('cómo van sus alumnos en sus temas', () => {
  const t = (numero: number, contestadas: number, aciertos: number) => ({ numero, titulo: `Tema ${numero}`, alumnos: 10, contestadas, aciertos });

  it('acierto medio ponderado por respuestas, y el más flojo entre los que tienen datos de sobra', () => {
    const r = resumenTemas([t(1, 100, 80), t(2, 100, 40), t(3, 5, 0)]);
    expect(r.acierto).toBe(59);
    expect(r.contestadas).toBe(205);
    expect(r.masFlojo).toMatchObject({ numero: 2, acierto: 40 });
    expect(r.conPocosDatos).toBe(1);
  });

  it('con pocas respuestas no se señala ningún tema: es ruido', () => {
    expect(resumenTemas([t(3, MIN_RESPUESTAS_TEMA - 1, 0)]).masFlojo).toBeNull();
  });

  it('sin respuestas, «sin datos» (null), no un 0 % (regla 8)', () => {
    expect(resumenTemas([t(5, 0, 0)]).acierto).toBeNull();
    expect(aciertoDe({ contestadas: 0, aciertos: 0 })).toBeNull();
    expect(resumenTemas([]).acierto).toBeNull();
  });
});

describe('las acciones y la pantalla (guardas estáticas)', () => {
  const lee = (f: string) => readFileSync(join(__dirname, '..', 'app', f), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const src = lee('actions/profesores.ts');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('\nexport async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('todo es del preparador y va acotado a su academia dentro de la consulta', () => {
    for (const f of ['getClasesHabituales', 'setClaseHabitual', 'getTemasProfesores', 'setTemasProfesor']) {
      const c = cuerpo(f);
      expect(c, f).toContain('requireAdmin()');
      expect(c, f).toMatch(/\.eq\('organization_id', org\)/);
    }
  });

  it('los profesores que se asignan son de su academia', () => {
    expect(cuerpo('setClaseHabitual')).toMatch(/from\('academy_staff'\)[\s\S]*?\.eq\('organization_id', org\)\.in\('id', ids\)/);
    expect(cuerpo('setTemasProfesor')).toMatch(/from\('academy_staff'\)[\s\S]*?\.eq\('id', profesorId\)\.eq\('organization_id', org\)/);
  });

  it('los recuentos por tema los hace la base de datos, solo de los alumnos (regla 91)', () => {
    const c = cuerpo('getTemasProfesores');
    expect(c).toContain("rpc('panel_academia_por_tema'");
    expect(c).toMatch(/role !== 'admin' && p\.role !== 'superadmin'/);
    expect(c).not.toContain("from('question_attempts')");
  });

  it('en la celda, el habitual se propone al cambiar el título, y una elección a mano manda', () => {
    const c = lee('components/Admin/components/fisica/Cuadrante.tsx');
    const f = c.slice(c.indexOf('function cambiaTitulo'), c.indexOf('const q = titulo.trim()'));
    expect(f).toContain('if (profesorTocado) return;');
    expect(f).toContain('profesorSugerido(');
    expect(f).toContain('profesoresOcupados(');
    expect(c).toMatch(/onChange=\{\(e\) => \{ setProfesorId\(e\.target\.value\); setProfesorTocado\(true\);/);
  });
});

describe('la carga semanal de cada profesor', () => {
  it('horasEntre: las horas entre dos HH:MM; 0 si falta alguna o van al revés', async () => {
    const { horasEntre } = await import('../app/lib/profesores');
    expect(horasEntre('08:00', '09:00')).toBe(1);
    expect(horasEntre('10:00', '13:30')).toBe(3.5);
    expect(horasEntre('18:30:00', '19:30')).toBe(1);
    expect(horasEntre(null, '09:00')).toBe(0);
    expect(horasEntre('09:00', '08:00')).toBe(0);
  });

  it('las clases de física del cuadrante SUMAN (Lucio, 4 clases, no puede salir con 0 h)', async () => {
    const { clasesDeLaSemana, horasDeClases } = await import('../app/lib/profesores');
    const grupos = [
      { id: 'alpha', name: 'Promo 44 · Alpha', llevaPlan: true, esMulti: false, staffIds: ['lucio'], horario: { weekdays: [1, 3], startTime: '08:00', endTime: '09:00' } },
      { id: 'teo', name: 'Promo 43', llevaPlan: false, esMulti: false, staffIds: ['sofia'], horario: { weekdays: [2, 4], startTime: '10:00', endTime: '13:00' } },
    ];
    const fisica = [
      { fecha: '2026-11-09', dia: 1, grupo: 'Alpha', titulo: 'F.M + RDL', hora: '08:00', fin: '09:00' },
      { fecha: '2026-11-10', dia: 2, grupo: 'Omega', titulo: 'F.M + RDL', hora: '08:00', fin: '09:00' },
      { fecha: '2026-11-11', dia: 3, grupo: 'Alpha', titulo: 'F.M + RDL', hora: '08:00', fin: '09:00' },
      { fecha: '2026-11-12', dia: 4, grupo: 'Multi', titulo: 'Boxeo', hora: '18:30', fin: '19:30' },
    ];
    const lucio = clasesDeLaSemana('lucio', grupos, fisica);
    expect(lucio).toHaveLength(4);
    expect(horasDeClases(lucio)).toBe(4);
    // Estar asignado a Alpha en «Grupos» no suma OTRA VEZ su horario: manda el cuadrante.
    expect(lucio.every((c) => c.fisica)).toBe(true);
    const sofia = clasesDeLaSemana('sofia', grupos, []);
    expect(sofia.map((c) => c.dia)).toEqual([2, 4]);
    expect(horasDeClases(sofia)).toBe(6);
  });
});
