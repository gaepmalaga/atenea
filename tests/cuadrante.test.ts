import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  nombreCorto, nombrePila, turnoDe, etiquetaRango, tituloDia, armaCuadrante, textoCuadrante, choquesDeProfesor,
  normalizaCelda, colorDeGrupo, plazasSesion, quedaPlaza, entraEnCuadrante, fechasDelCuadrante, leeHora, tipoDeTitulo,
  titulosFrecuentes, normalizaMotivo,
  type GrupoCuadrante, type SesionCuadrante, type Profesor, type DiaSinClase,
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

  it('una clase extra de un grupo en un día de clase de otros se ve como extra', () => {
    const extra = [...SEMANA, ses('Kappa', '2026-11-10', 'Carrera larga', JOSE)];
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: extra, profesores: PROFES });
    const kappa = x.dias[1].filas.find((f) => f.grupo.corto === 'Kappa');
    expect(kappa?.extra).toBe(true);
    expect(kappa?.sesion?.titulo).toBe('Carrera larga');
    expect(x.dias[1].filas.find((f) => f.grupo.corto === 'Omega')?.extra).toBe(false);
  });

  it('un día añadido a un grupo con horario (un sábado) crea su día, suelto y solo con ese grupo y Multi (regla 99)', () => {
    const extra = [...SEMANA, ses('Kappa', '2026-11-14', 'Carrera larga', JOSE, '10:00')];
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: extra, profesores: PROFES });
    const sabado = x.dias.find((d) => d.fecha === '2026-11-14')!;
    expect(sabado.titulo).toBe('SÁBADO 14');
    expect(sabado.suelto).toBe(true);
    expect(sabado.filas.map((f) => [f.grupo.corto, f.extra, f.horaRotulada])).toEqual([['Kappa', true, '10:00'], ['Multi', false, null]]);
    expect(x.rango).toBe('del 9 al 14 de noviembre');
    expect(textoCuadrante(x)).toContain('• KAPPA — Carrera larga · 10:00 h (José)');
  });

  it('ningún día de la semana real es suelto: todos son de algún horario fijo', () => {
    expect(c.dias.every((d) => !d.suelto)).toBe(true);
    expect(c.quitados).toEqual([]);
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

/**
 * REGLA 97: el cuadrante solo lleva CLASES DE GRUPO. Lo que se vio en
 * producción el 9 nov: el grupo genérico «Promo 43 · Físicas» (sin horario, con
 * 31 sesiones de ejemplo) salía como una fila más, con «Sin profesor · Día sin
 * clase en su horario», y hasta creaba columnas como «DOMINGO 15 · FÍSICAS ·
 * Descanso», con Multi colgando debajo.
 */
describe('el cuadrante solo lleva clases de grupo (regla 97)', () => {
  const SIN_HORARIO = grupo('Físicas', [], '', {
    id: 'g-promo43', nombre: 'Promo 43 · Físicas',
    horario: { weekdays: null, startTime: null, endTime: null, capacity: null },
  });
  const CON_PROMO43 = [...GRUPOS, SIN_HORARIO];
  const DEL_43 = (fecha: string, titulo: string): SesionCuadrante => ({ ...ses('Kappa', fecha, titulo, null), classId: 'g-promo43' });
  // La semana real (lunes a jueves) + lo del grupo sin horario: una sesión en
  // un día de clase y el descanso del domingo.
  const conPromo43 = [...SEMANA, DEL_43('2026-11-09', 'Dominadas: pirámide'), DEL_43('2026-11-15', 'Descanso')];
  const c = armaCuadrante({ lunes: LUNES, grupos: CON_PROMO43, sesiones: conPromo43, profesores: PROFES });

  it('un grupo sin horario no entra; Multi y los grupos con horario, sí', () => {
    expect(entraEnCuadrante(SIN_HORARIO)).toBe(false);
    expect(entraEnCuadrante(GRUPOS[0])).toBe(true);
    expect(entraEnCuadrante(GRUPOS.at(-1)!)).toBe(true);
  });

  it('la semana sigue siendo de lunes a jueves: el domingo del grupo sin horario no aparece', () => {
    expect(c.dias.map((d) => d.titulo)).toEqual(['LUNES 9', 'MARTES 10', 'MIÉRCOLES 11', 'JUEVES 12']);
    expect(c.rango).toBe('del 9 al 12 de noviembre');
  });

  it('ni su fila ni sus sesiones salen en ningún día', () => {
    const corto = c.dias.flatMap((d) => d.filas.map((f) => f.grupo.id));
    expect(corto).not.toContain('g-promo43');
    expect(c.dias[0].filas.map((f) => f.grupo.corto)).toEqual(['Kappa', 'Alpha', 'Zetta', 'Multi']);
  });

  it('ni en el texto de WhatsApp', () => {
    const t = textoCuadrante(c);
    expect(t).not.toMatch(/FÍSICAS|Dominadas: pirámide|DOMINGO/);
  });

  it('la fila de Multi no crea días: un sábado sin nada no existe', () => {
    expect(fechasDelCuadrante(GRUPOS, [], LUNES)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('una sesión de un grupo SIN horario tampoco crea días, aunque sea en sábado', () => {
    expect(fechasDelCuadrante(CON_PROMO43, [DEL_43('2026-11-14', 'Rodaje')], LUNES)).not.toContain('2026-11-14');
  });

  it('una sesión de Multi sí crea su día, y ese día es suelto', () => {
    const sabado = ses('Multi', '2026-11-14', 'Carrera en la playa', LUCAS, '10:00');
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: [...SEMANA, sabado], profesores: PROFES });
    const dia = x.dias.find((d) => d.fecha === '2026-11-14')!;
    expect(dia.suelto).toBe(true);
    expect(dia.filas.map((f) => f.grupo.corto)).toEqual(['Multi']);
  });
});

describe('quitar un día o un grupo: «sin clase» (regla 97)', () => {
  const off = (corto: string, fecha: string, motivo: string | null = null): DiaSinClase => ({ classId: `g-${corto.toLowerCase()}`, fecha, motivo });

  it('un grupo sin clase un día desaparece de ese día, y se apunta para poder devolverlo', () => {
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES, sinClase: [off('Kappa', '2026-11-09', 'Sin profesor')] });
    expect(x.dias[0].filas.map((f) => f.grupo.corto)).toEqual(['Alpha', 'Zetta', 'Multi']);
    expect(x.quitados).toEqual([{ fecha: '2026-11-09', titulo: 'LUNES 9', grupos: [GRUPOS[0]], motivos: ['Sin profesor'], todos: false }]);
    // El miércoles Kappa sigue: la marca es por FECHA, el horario fijo no se toca.
    expect(x.dias[2].filas[0].grupo.corto).toBe('Kappa');
  });

  it('el martes festivo para todos: con la sesión de Multi también quitada, el día desaparece entero', () => {
    const festivo = ['Omega', 'Sigma', 'Betta', 'Delta', 'Multi'].map((g) => off(g, '2026-11-10', 'Festivo'));
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES, sinClase: festivo });
    expect(x.dias.map((d) => d.titulo)).toEqual(['LUNES 9', 'MIÉRCOLES 11', 'JUEVES 12']);
    expect(x.quitados[0]).toMatchObject({ fecha: '2026-11-10', motivos: ['Festivo'], todos: true });
    const t = textoCuadrante(x);
    expect(t).not.toContain('MARTES 10');
    expect(t).not.toContain('Jiujitsu · 18:30');
  });

  it('si solo se quitan los grupos fijos y Multi conserva su clase, el día queda solo con Multi', () => {
    const x = armaCuadrante({
      lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES,
      sinClase: ['Omega', 'Sigma', 'Betta', 'Delta'].map((g) => off(g, '2026-11-10')),
    });
    const martes = x.dias.find((d) => d.fecha === '2026-11-10')!;
    expect(martes.filas.map((f) => f.grupo.corto)).toEqual(['Multi']);
    expect(martes.suelto).toBe(false);
  });

  it('el último día quitado se lleva también el rango', () => {
    const jueves = ['Omega', 'Sigma', 'Betta', 'Delta', 'Multi'].map((g) => off(g, '2026-11-12'));
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES, sinClase: jueves });
    expect(x.rango).toBe('del 9 al 11 de noviembre');
  });

  it('una sesión de un día quitado no avisa de choques', () => {
    const malas = [ses('Omega', '2026-11-10', 'A', LUCAS), ses('Sigma', '2026-11-10', 'B', LUCAS)];
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: malas, profesores: PROFES, sinClase: [off('Sigma', '2026-11-10')] });
    expect(x.dias.flatMap((d) => d.filas.flatMap((f) => f.avisos))).toEqual([]);
  });

  it('una marca de otra semana, o de un grupo que no sale, no hace nada', () => {
    const x = armaCuadrante({ lunes: LUNES, grupos: GRUPOS, sesiones: SEMANA, profesores: PROFES, sinClase: [off('Kappa', '2026-11-16'), { classId: 'g-otro', fecha: '2026-11-09', motivo: null }] });
    expect(x.quitados).toEqual([]);
    expect(x.dias).toHaveLength(4);
  });

  it('el motivo: corto, sin NUL, y vacío es null (regla 16)', () => {
    expect(normalizaMotivo('  Festivo local ')).toBe('Festivo local');
    expect(normalizaMotivo('   ')).toBeNull();
    expect(normalizaMotivo(undefined)).toBeNull();
    expect(normalizaMotivo('a\0b')).toBe('ab');
    expect(normalizaMotivo('x'.repeat(200))).toHaveLength(120);
  });
});

describe('el tipo sale del título (regla 97)', () => {
  it('lo evidente', () => {
    expect(tipoDeTitulo('Rodaje 40′')).toBe('carrera');
    expect(tipoDeTitulo('Series: 6 × 400 m')).toBe('carrera');
    expect(tipoDeTitulo('Ritmo de prueba: 2 × 1.000 m')).toBe('carrera');
    expect(tipoDeTitulo('Circuito de fuerza-resistencia')).toBe('circuito');
    expect(tipoDeTitulo('Circuito de agilidad: velocidad')).toBe('agilidad');
    expect(tipoDeTitulo('Movilidad y recuperación activa')).toBe('movilidad');
    expect(tipoDeTitulo('Estiramientos')).toBe('movilidad');
    expect(tipoDeTitulo('F.M + RDL')).toBe('fuerza');
    expect(tipoDeTitulo('Dominadas: pirámide')).toBe('fuerza');
    expect(tipoDeTitulo('Descanso')).toBe('descanso');
  });

  it('lo que no se reconoce es «otro», no un color equivocado', () => {
    for (const t of ['FLK 5.0', 'Boxeo', 'Jiujitsu', 'Clase libre', '5 min de charla']) expect(tipoDeTitulo(t), t).toBe('otro');
  });
});

describe('la hora escrita a mano (regla 97)', () => {
  it('entiende lo que se escribe en un móvil', () => {
    for (const [entra, sale] of [
      ['18:30', '18:30'], ['18.30', '18:30'], ['18,30', '18:30'], ['18h30', '18:30'], ['18 30', '18:30'],
      ['1830', '18:30'], ['830', '08:30'], ['8:30', '08:30'], ['18', '18:00'], ['18h', '18:00'], [' 9 ', '09:00'],
    ]) expect(leeHora(entra), entra).toBe(sale);
  });

  it('rechaza lo que no es una hora', () => {
    for (const v of ['25:00', '18:60', '18:3', 'tarde', '', '12345', null, 1830]) expect(leeHora(v), String(v)).toBeNull();
  });
});

describe('las sugerencias de título', () => {
  it('del más usado al menos, sin repetir mayúsculas', () => {
    expect(titulosFrecuentes(['FLK 5.0', 'Boxeo', 'flk 5.0', 'F.M + RDL', 'FLK 5.0', 'Boxeo', ' '])).toEqual(['FLK 5.0', 'Boxeo', 'F.M + RDL']);
  });
  it('con tope', () => {
    expect(titulosFrecuentes(['a', 'b', 'c'], 2)).toHaveLength(2);
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
  const ok = { titulo: ' FLK 5.0 ', profesorId: PROFES[0].id, horaPropia: '8:05' };

  it('limpia el título y la hora', () => {
    expect(normalizaCelda(ok)).toEqual({ ok: true, valor: { titulo: 'FLK 5.0', profesorId: PROFES[0].id, horaPropia: '08:05' } });
    expect(normalizaCelda({ ...ok, horaPropia: '1830' })).toMatchObject({ ok: true, valor: { horaPropia: '18:30' } });
  });

  it('lo que viene vacío es null (regla 16), y un tipo que llegue no se usa: sale del título', () => {
    expect(normalizaCelda({ titulo: 'Boxeo', tipo: 'yoga', profesorId: '', horaPropia: ' ' }))
      .toEqual({ ok: true, valor: { titulo: 'Boxeo', profesorId: null, horaPropia: null } });
  });

  it('rechaza lo que no vale, diciendo por qué', () => {
    expect(normalizaCelda({ ...ok, titulo: '  ' })).toMatchObject({ ok: false, error: /qué toca/ });
    expect(normalizaCelda({ ...ok, titulo: 'x'.repeat(121) })).toMatchObject({ ok: false, error: /120/ });
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
    for (const f of ['getCuadrante', 'saveCelda', 'copiarCuadrante', 'copiarCelda', 'setSinClase', 'borrarSesionesDia', 'getAgendaProfesores']) {
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

  it('el cuadrante y copiar la semana solo cargan grupos con horario o de Multi (regla 97)', () => {
    expect(cuerpo('getCuadrante')).toContain('filter(conHorarioOMulti)');
    expect(cuerpo('copiarCuadrante')).toContain('filter(conHorarioOMulti)');
    expect(src).toMatch(/const conHorarioOMulti = \(g: Fila\) => g\.is_multi === true \|\| \(\(g\.weekdays/);
  });

  it('el tipo de la sesión sale del título al poner una celda', () => {
    expect(src).toContain('tipoDeTitulo(valor.titulo)');
  });

  it('un día quitado no admite multis: ni el alumno ni el preparador lo apuntan ahí', () => {
    // Al alumno, solo lo de semanas publicadas (regla 98); al preparador, todo.
    expect(cuerpo('setMiUnion')).toContain('diasSinClasePublicados(');
    expect(cuerpo('setMiUnionSemana')).toContain('diasSinClasePublicados(');
    expect(cuerpo('getMiMulti')).toContain('diasSinClasePublicados(');
    expect(src.slice(src.indexOf('async function claseParaMulti'), src.indexOf('type ResultadoMulti'))).toContain('diasSinClase(');
  });

  it('el preparador maneja multis detrás de requireAdmin, solo alumnos de Multi y grupos de su academia', () => {
    for (const f of ['setMultiEnClase', 'moverMulti']) {
      const c = cuerpo(f);
      expect(c, f).toContain('requireAdmin()');
      expect(c, f).toContain('esMulti(alumnoId, org)');
      expect(c, f).toMatch(/\.eq\('organization_id', org\)/);
    }
    // Sin `forzar`, una clase completa no admite a nadie más.
    expect(src.slice(src.indexOf('async function uneMulti'), src.indexOf('export async function setMultiEnClase'))).toContain('quedaPlaza');
  });

  it('marcar «sin clase» escribe la academia de la sesión, no la que llegue', () => {
    const c = cuerpo('setSinClase');
    expect(c).toContain('organization_id: org');
    expect(c).not.toMatch(/params\.organization/);
  });
});

describe('el profesor y su cuenta (regla 97)', () => {
  it('la cuenta es opcional: un id o nada; lo demás no se guarda', async () => {
    const { normalizeStaffInput, rowToStaffMember } = await import('../app/lib/academy-settings');
    const id = '00000000-0000-4000-8000-0000000000aa';
    expect(normalizeStaffInput({ name: 'Lucas', userId: id })?.user_id).toBe(id);
    expect(normalizeStaffInput({ name: 'Lucas' })?.user_id).toBeNull();
    expect(normalizeStaffInput({ name: 'Lucas', userId: '' })?.user_id).toBeNull();
    expect(normalizeStaffInput({ name: 'Lucas', userId: "x' or 1=1" })?.user_id).toBeNull();
    expect(rowToStaffMember({ id: 's', name: 'Lucas', user_id: id }).userId).toBe(id);
    expect(rowToStaffMember({ id: 's', name: 'Lucas' }).userId).toBeNull();
  });

  it('el servidor comprueba que la cuenta es de su academia antes de enlazarla', () => {
    const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'settings.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const c = src.slice(src.indexOf('export async function saveStaff'), src.indexOf('export async function listCuentasAcademia'));
    expect(c).toMatch(/if \(clean\.user_id\) \{[\s\S]*?from\('academy_members'\)[\s\S]*?\.eq\('academy_id', auth\.user\.organizationId\)/);
    const l = src.slice(src.indexOf('export async function listCuentasAcademia'));
    expect(l).toContain('requireAdmin()');
    expect(l).toContain(".eq('academy_id', org)");
  });
});

describe('publicar el cuadrante (regla 98)', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'cuadrante.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}`);
    const j = src.indexOf('\nexport async function', i + 10);
    return src.slice(i, j === -1 ? undefined : j);
  };

  it('publicar es del preparador, solo un lunes, y con la academia de la sesión', () => {
    const c = cuerpo('publicarCuadrante');
    expect(c).toContain('requireAdmin()');
    expect(c).toContain('esLunes(lunes)');
    expect(c).toContain('organization_id: org');
    expect(c).toMatch(/\.delete\(\)\.eq\('organization_id', org\)/);
  });

  it('el multi solo ve qué toca y con quién en una semana publicada', () => {
    const c = cuerpo('getMiMulti');
    expect(c).toContain('semanasPublicadas(');
    expect(c).toMatch(/publicadas\.has\(lunesDe\(fecha\)\)/);
  });

  it('el día sin clase que ve el alumno es el de una semana publicada', () => {
    const h = src.slice(src.indexOf('async function diasSinClasePublicados'), src.indexOf('const esDiaDeClase'));
    expect(h).toContain('publicadas.has(lunesDe(d.fecha))');
  });
});
