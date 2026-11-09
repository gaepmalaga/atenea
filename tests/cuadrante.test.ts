import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  nombreCorto, nombrePila, turnoDe, etiquetaRango, tituloDia, armaCuadrante, textoCuadrante, choquesDeProfesor,
  normalizaCelda, colorDeGrupo, plazasSesion, quedaPlaza,
  type GrupoCuadrante, type SesionCuadrante, type Profesor,
} from '../app/lib/cuadrante';
import { cuentaSesion } from '../app/lib/asistencia';

/**
 * EL CUADRANTE SEMANAL (regla 96). El caso es la semana real de Alphapol del
 * 9 al 12 de noviembre de 2026 (la imagen que manda el preparador).
 */

const LUNES = '2026-11-09';
const grupo = (corto: string, dias: number[], inicio: string, extra: Partial<GrupoCuadrante> = {}): GrupoCuadrante => ({
  id: `g-${corto.toLowerCase()}`,
  nombre: `Promo 44 · ${corto}`,
  corto,
  esMulti: false,
  horario: { weekdays: dias, startTime: inicio, endTime: null, capacity: 30 },
  inscritos: 20,
  ...extra,
});
const GRUPOS: GrupoCuadrante[] = [
  grupo('Kappa', [1, 3], '08:00'), grupo('Alpha', [1, 3], '08:00'), grupo('Zetta', [1, 3], '20:00'),
  grupo('Omega', [2, 4], '08:00'), grupo('Sigma', [2, 4], '08:00'), grupo('Betta', [2, 4], '20:00'), grupo('Delta', [2, 4], '20:00'),
  grupo('Multi', [], '', { esMulti: true, horario: { weekdays: null, startTime: null, endTime: null, capacity: null } }),
];
const PROFES: Profesor[] = [
  { id: '00000000-0000-4000-8000-000000000001', nombre: 'José Morato' },
  { id: '00000000-0000-4000-8000-000000000002', nombre: 'Lucas' },
  { id: '00000000-0000-4000-8000-000000000003', nombre: 'Olivares' },
  { id: '00000000-0000-4000-8000-000000000004', nombre: 'Lucio' },
  { id: '00000000-0000-4000-8000-000000000005', nombre: 'Juan' },
];
const [JOSE, LUCAS, OLIVARES, LUCIO, JUAN] = PROFES.map((p) => p.id);

let n = 0;
const ses = (corto: string, fecha: string, titulo: string, profesorId: string | null, horaPropia: string | null = null): SesionCuadrante => ({
  id: `s${++n}`, classId: `g-${corto.toLowerCase()}`, fecha, titulo, tipo: 'otro', profesorId, horaPropia, position: 0,
});
const SEMANA: SesionCuadrante[] = [
  ses('Kappa', '2026-11-09', 'FLK 5.0', JOSE), ses('Alpha', '2026-11-09', 'Boxeo', JUAN), ses('Zetta', '2026-11-09', 'F.M + RDL', LUCIO),
  ses('Omega', '2026-11-10', 'Jiujitsu', LUCAS), ses('Sigma', '2026-11-10', 'FLK 5.0', JOSE), ses('Betta', '2026-11-10', 'FLK 5.0', OLIVARES),
  ses('Delta', '2026-11-10', 'F.M + RDL', LUCIO), ses('Multi', '2026-11-10', 'Jiujitsu', LUCAS, '18:30'),
  ses('Kappa', '2026-11-11', 'F.M + RDL', LUCIO), ses('Alpha', '2026-11-11', 'FLK 5.1', JOSE), ses('Zetta', '2026-11-11', 'FLK 5.1', OLIVARES),
  ses('Omega', '2026-11-12', 'FLK 5.1', OLIVARES), ses('Sigma', '2026-11-12', 'F.M + RDL', JOSE), ses('Betta', '2026-11-12', 'F.M + RDL', LUCIO),
  ses('Delta', '2026-11-12', 'FLK 5.0', JOSE), ses('Multi', '2026-11-12', 'Boxeo', JUAN, '18:30'),
];

describe('nombres, turnos y rango', () => {
  it('el nombre corto sale de «Promo 44 · Kappa»; sin separador, el nombre entero', () => {
    expect(nombreCorto('Promo 44 · Kappa')).toBe('Kappa');
    expect(nombreCorto('Física')).toBe('Física');
  });

  it('el profesor se escribe de pila, como en el cuadrante', () => {
    expect(nombrePila('José Morato')).toBe('José');
    expect(nombrePila('Lucas')).toBe('Lucas');
  });

  it('08:00 es de mañana y 20:00 de tarde; sin hora no hay turno', () => {
    expect(turnoDe('08:00')).toBe('manana');
    expect(turnoDe('13:59')).toBe('manana');
    expect(turnoDe('20:00')).toBe('tarde');
    expect(turnoDe(null)).toBeNull();
  });

  it('el rango dentro de un mes y a caballo entre dos', () => {
    expect(etiquetaRango('2026-11-09', '2026-11-12')).toBe('del 9 al 12 de noviembre');
    expect(etiquetaRango('2026-11-30', '2026-12-03')).toBe('del 30 de noviembre al 3 de diciembre');
    expect(tituloDia('2026-11-09')).toBe('LUNES 9');
  });

  it('cada grupo tiene su color y uno desconocido sale en el marino', () => {
    expect(colorDeGrupo('Kappa').fondo).not.toBe(colorDeGrupo('Delta').fondo);
    expect(colorDeGrupo('  ÓMEGA ').fondo).toBe(colorDeGrupo('omega').fondo);
    expect(colorDeGrupo('Nuevo').fondo).toBe(colorDeGrupo('multi').fondo);
  });
});

describe('armaCuadrante: la semana real', () => {
  const c = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES });

  it('salen cuatro días, de lunes a jueves, con el rango de la imagen', () => {
    expect(c.dias.map((d) => d.titulo)).toEqual(['LUNES 9', 'MARTES 10', 'MIÉRCOLES 11', 'JUEVES 12']);
    expect(c.rango).toBe('del 9 al 12 de noviembre');
  });

  it('lunes y miércoles: Kappa, Alpha y Zetta; martes y jueves: Omega, Sigma, Betta y Delta; Multi siempre al final', () => {
    const grupos = (i: number) => c.dias[i].filas.map((f) => f.grupo.corto);
    expect(grupos(0)).toEqual(['Kappa', 'Alpha', 'Zetta', 'Multi']);
    expect(grupos(1)).toEqual(['Omega', 'Sigma', 'Betta', 'Delta', 'Multi']);
    expect(grupos(2)).toEqual(['Kappa', 'Alpha', 'Zetta', 'Multi']);
    expect(grupos(3)).toEqual(['Omega', 'Sigma', 'Betta', 'Delta', 'Multi']);
  });

  it('el lunes Multi no tiene sesión: celda vacía, no desaparece', () => {
    const multi = c.dias[0].filas.at(-1)!;
    expect(multi.grupo.esMulti).toBe(true);
    expect(multi.sesion).toBeNull();
  });

  it('la hora de Multi se rotula (18:30) y la de los grupos no', () => {
    const multi = c.dias[1].filas.at(-1)!;
    expect(multi.horaRotulada).toBe('18:30');
    expect(multi.profesor?.nombre).toBe('Lucas');
    expect(c.dias[1].filas[0].horaRotulada).toBeNull();
    expect(c.dias[1].filas[0].hora).toBe('08:00');
  });

  it('los turnos: mañana a las 08:00 y tarde a las 20:00, con los grupos en su orden de alta', () => {
    expect(c.turnos).toEqual([
      { id: 'manana', hora: '08:00', grupos: ['Kappa', 'Alpha', 'Omega', 'Sigma'] },
      { id: 'tarde', hora: '20:00', grupos: ['Zetta', 'Betta', 'Delta'] },
    ]);
  });

  it('la semana de la imagen no tiene choques de profesor', () => {
    expect(c.dias.flatMap((d) => d.filas.flatMap((f) => f.avisos))).toEqual([]);
  });

  it('una sesión en un día que no es de clase del grupo se ve y se marca', () => {
    const extra = [...SEMANA, ses('Kappa', '2026-11-13', 'Carrera larga', JOSE)];
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: extra, profesores: PROFES });
    const viernes = x.dias.find((d) => d.fecha === '2026-11-13')!;
    expect(viernes.filas.find((f) => f.grupo.corto === 'Kappa')?.fueraDeHorario).toBe(true);
  });

  it('una sesión de otra semana no entra', () => {
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: [ses('Kappa', '2026-11-16', 'Otra', JOSE)], profesores: PROFES });
    expect(x.dias.flatMap((d) => d.filas).every((f) => f.sesion === null)).toBe(true);
  });

  it('con dos sesiones el mismo día, sale la primera y se cuenta la otra', () => {
    const dos = [...SEMANA, { ...ses('Kappa', '2026-11-09', 'Estiramientos', JOSE), position: 1 }];
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: dos, profesores: PROFES });
    const kappa = x.dias[0].filas[0];
    expect(kappa.sesion?.titulo).toBe('FLK 5.0');
    expect(kappa.extras).toBe(1);
  });
});

describe('un profesor no puede estar en dos sitios a la vez', () => {
  it('Lucas con Omega y con Sigma a las 08:00 avisa a las dos', () => {
    const malas = [ses('Omega', '2026-11-10', 'Jiujitsu', LUCAS), ses('Sigma', '2026-11-10', 'FLK 5.0', LUCAS)];
    const choques = choquesDeProfesor(malas, GRUPOS, PROFES);
    expect(choques.get(malas[0].id)?.[0]).toMatch(/Lucas.*Sigma/);
    expect(choques.get(malas[1].id)?.[0]).toMatch(/Lucas.*Omega/);
  });

  it('a la misma hora pero otro día, o con una hora de por medio, no avisa', () => {
    const a = ses('Omega', '2026-11-10', 'A', LUCAS);
    const otroDia = ses('Sigma', '2026-11-12', 'B', LUCAS);
    const multi18 = ses('Multi', '2026-11-10', 'C', LUCAS, '18:30');
    expect(choquesDeProfesor([a, otroDia, multi18], GRUPOS, PROFES).size).toBe(0);
  });

  it('solapar a medias (20:00 y 20:30) sí avisa', () => {
    const a = ses('Betta', '2026-11-10', 'A', LUCAS);
    const b = ses('Multi', '2026-11-10', 'B', LUCAS, '20:30');
    expect(choquesDeProfesor([a, b], GRUPOS, PROFES).size).toBe(2);
  });

  it('sin profesor, o sin hora conocida, no se avisa de lo que no se sabe', () => {
    const a = ses('Omega', '2026-11-10', 'A', null);
    const b = ses('Multi', '2026-11-10', 'B', LUCAS); // Multi no tiene hora de grupo ni propia
    const c = ses('Sigma', '2026-11-10', 'C', LUCAS);
    expect(choquesDeProfesor([a, b, c], GRUPOS, PROFES).size).toBe(0);
  });
});

describe('el texto para WhatsApp', () => {
  const t = textoCuadrante(armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES }));

  it('lleva el rango, los turnos y cada sesión con su profesor de pila', () => {
    expect(t).toContain('del 9 al 12 de noviembre');
    expect(t).toContain('Turno de mañana 08:00: KAPPA, ALPHA, OMEGA, SIGMA');
    expect(t).toContain('• KAPPA — FLK 5.0 (José)');
    expect(t).toContain('• MULTI — Jiujitsu · 18:30 h (Lucas)');
  });

  it('no pinta las celdas vacías (Multi el lunes)', () => {
    const lunes = t.split('*MARTES 10*')[0];
    expect(lunes).not.toContain('MULTI');
  });
});

describe('normalizaCelda', () => {
  const ok = { titulo: ' FLK 5.0 ', tipo: 'fuerza', profesorId: PROFES[0].id, horaPropia: '8:05' };

  it('limpia el título y la hora', () => {
    expect(normalizaCelda(ok)).toEqual({ ok: true, valor: { titulo: 'FLK 5.0', tipo: 'fuerza', profesorId: PROFES[0].id, horaPropia: '08:05' } });
  });

  it('lo que viene vacío es null y el tipo por defecto es «otro» (regla 16)', () => {
    expect(normalizaCelda({ titulo: 'Boxeo', tipo: '', profesorId: '', horaPropia: '' }))
      .toEqual({ ok: true, valor: { titulo: 'Boxeo', tipo: 'otro', profesorId: null, horaPropia: null } });
  });

  it('rechaza lo que no vale, diciendo por qué', () => {
    expect(normalizaCelda({ ...ok, titulo: '  ' })).toMatchObject({ ok: false, error: /qué toca/ });
    expect(normalizaCelda({ ...ok, titulo: 'x'.repeat(121) })).toMatchObject({ ok: false, error: /120/ });
    expect(normalizaCelda({ ...ok, tipo: 'yoga' })).toMatchObject({ ok: false, error: /tipo/ });
    expect(normalizaCelda({ ...ok, profesorId: 'no-es-uuid' })).toMatchObject({ ok: false, error: /profesor/ });
    expect(normalizaCelda({ ...ok, horaPropia: '25:00' })).toMatchObject({ ok: false, error: /hora/ });
  });

  it('un byte NUL no entra (regla 71)', () => {
    expect(normalizaCelda({ ...ok, titulo: 'FL\0K' })).toMatchObject({ ok: true, valor: { titulo: 'FLK' } });
  });
});

describe('plazas: los multis ocupan plaza', () => {
  it('Kappa: 20 propios, aforo 30, 10 multis apuntados → ya no queda ninguna', () => {
    const c = plazasSesion(30, 20, 0, 10);
    expect(c.asisten).toBe(30);
    expect(c.libres).toBe(0);
    expect(quedaPlaza(c)).toBe(false);
  });

  it('una falta de un propio libera plaza para un multi', () => {
    expect(plazasSesion(30, 20, 1, 10).libres).toBe(1);
    expect(quedaPlaza(plazasSesion(30, 20, 1, 10))).toBe(true);
  });

  it('sin aforo puesto no se sabe (null) y no se bloquea', () => {
    const c = plazasSesion(null, 20, 0, 50);
    expect(c.libres).toBeNull();
    expect(quedaPlaza(c)).toBe(true);
  });

  it('cuentaSesion sin multis se comporta como siempre', () => {
    expect(cuentaSesion(20, 15, 2)).toMatchObject({ asisten: 13, libres: 7 });
  });
});

describe('las acciones del cuadrante (guardas estáticas)', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'cuadrante.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('\nexport async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('lo del preparador va detrás de requireAdmin y acotado a su academia dentro de la consulta (regla 65)', () => {
    for (const f of ['getCuadrante', 'saveCelda', 'copiarCuadrante']) {
      const c = cuerpo(f);
      expect(c, f).toContain('requireAdmin()');
      expect(c, f).toMatch(/\.eq\('organization_id', org\)/);
    }
  });

  it('un multi solo se apunta a un día de clase que no ha empezado, y con plaza', () => {
    const c = cuerpo('setMiUnion');
    expect(c).toContain('requireUser()');
    expect(c).toContain('sePuedeAvisar');
    expect(c).toContain('quedaPlaza');
    expect(c).toMatch(/user_id: auth\.user\.id/);
  });

  it('«esta semana voy con…» comprueba lo mismo que una sesión suelta', () => {
    const c = cuerpo('setMiUnionSemana');
    expect(c).toContain('requireUser()');
    expect(c).toContain('sePuedeAvisar');
    expect(c).toContain('quedaPlaza');
  });

  it('el alumno solo se apunta si es de un grupo multi de su academia', () => {
    expect(src).toMatch(/is_multi', true\)/);
    expect(src).toContain("'class_groups.organization_id', org");
  });
});
