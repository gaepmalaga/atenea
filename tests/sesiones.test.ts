import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizaContenido, normalizaApunte, estadoSesion, sePuedeApuntar, leeMinutos, leeKilometros,
  lunesDe, diasDeSemana, semanasDelMes, sumaMeses, etiquetaMes, etiquetaSemana, formateaMinutos, formateaKm,
  porDia, resumenSemana, copiaSemana, esDestino, DIAS_PARA_APUNTAR, type Sesion,
} from '../app/lib/sesiones';
import {
  puntosPrueba, notaFisica, leeMarca, formateaMarca, pruebasDe, pruebaDeFuerza, mejorMarca, ultimaMarca,
  BAREMO_CNP, type Marca,
} from '../app/lib/baremo-fisico';
import { normalizePlan, normalizaVideo } from '../app/lib/training-plan';

/**
 * LA FÍSICA COMO LA LLEVA UN PREPARADOR (regla 86): sesiones, lo que apunta el
 * alumno, el calendario, copiar semanas, y el baremo oficial de las pruebas.
 */

const ses = (id: string, fecha: string, extra: Partial<Sesion> = {}): Sesion => ({
  id, fecha, kind: 'fuerza', title: `Sesión ${id}`, description: null, durationMin: null, distanceKm: null,
  video: null, classId: 'g1', userId: null, position: 0, ...extra,
});

describe('lo que escribe el preparador', () => {
  it('pide tipo y título; lo demás es opcional y vacío es null (regla 16)', () => {
    expect(normalizaContenido({ kind: 'carrera', title: '  Series  ', description: '  ', durationMin: '', distanceKm: '' }))
      .toEqual({ ok: true, valor: { kind: 'carrera', title: 'Series', description: null, durationMin: null, distanceKm: null, video: null } });
    expect(normalizaContenido({ kind: 'nadar', title: 'X' }).ok).toBe(false);
    expect(normalizaContenido({ kind: 'fuerza', title: '   ' }).ok).toBe(false);
    expect(normalizaContenido({ kind: 'fuerza', title: 'x'.repeat(121) }).ok).toBe(false);
  });

  it('la distancia admite coma, y la duración son minutos enteros', () => {
    expect(leeKilometros('8,5')).toEqual({ ok: true, valor: 8.5 });
    expect(leeKilometros('0').ok).toBe(false);
    expect(leeKilometros('abc').ok).toBe(false);
    expect(leeMinutos('45')).toEqual({ ok: true, valor: 45 });
    expect(leeMinutos('45,5').ok).toBe(false);
    expect(leeMinutos('0').ok).toBe(false);
  });

  it('un vídeo que no es https se rechaza diciendo por qué, no se guarda en silencio', () => {
    const r = normalizaContenido({ kind: 'fuerza', title: 'X', video: 'javascript:alert(1)' });
    expect(r).toEqual({ ok: false, error: 'El enlace del vídeo tiene que empezar por https://' });
    expect(normalizaContenido({ kind: 'fuerza', title: 'X', video: 'https://youtu.be/a' }).ok).toBe(true);
  });

  it('el vídeo del plan viejo también se limpia al RELEER (regla 17)', () => {
    expect(normalizaVideo('http://youtu.be/abc')).toBeNull();
    const plan = normalizePlan({ week_focus: 'x', days: [{ day: 'Lunes', exercises: [{ name: 'A', video: 'javascript:alert(1)' }, { name: 'B', video: 'https://youtu.be/b' }] }] });
    expect(plan?.days[0].exercises.map((e) => e.video)).toEqual([null, 'https://youtu.be/b']);
  });

  it('un destino es un grupo o un alumno, con id', () => {
    expect(esDestino({ tipo: 'grupo', id: 'g1' })).toBe(true);
    expect(esDestino({ tipo: 'alumno', id: '' })).toBe(false);
    expect(esDestino({ tipo: 'todos', id: 'x' })).toBe(false);
  });
});

describe('lo que apunta el alumno', () => {
  it('«hecha» con esfuerzo, sensaciones, tiempo y distancia reales; esfuerzo vacío es null', () => {
    expect(normalizaApunte({ status: 'hecha', rpe: 7, comment: ' bien ', durationMin: '50', distanceKm: '6,2' }))
      .toEqual({ ok: true, valor: { status: 'hecha', rpe: 7, comment: 'bien', durationMin: 50, distanceKm: 6.2 } });
    expect(normalizaApunte({ status: 'hecha', rpe: '' })).toMatchObject({ ok: true, valor: { rpe: null } });
    expect(normalizaApunte({ status: 'hecha', rpe: 11 })).toMatchObject({ ok: true, valor: { rpe: null } });
  });

  it('«no hecha» solo guarda el motivo: ni esfuerzo ni tiempo', () => {
    expect(normalizaApunte({ status: 'no_hecha', rpe: 8, durationMin: 30, comment: 'tobillo' }))
      .toEqual({ ok: true, valor: { status: 'no_hecha', rpe: null, comment: 'tobillo', durationMin: null, distanceKm: null } });
    expect(normalizaApunte({ status: 'quizá' }).ok).toBe(false);
  });

  it('el estado: lo apuntado, o pendiente si ya tocaba, o planificada si no', () => {
    expect(estadoSesion('2026-11-02', { status: 'hecha' }, '2026-11-06')).toBe('hecha');
    expect(estadoSesion('2026-11-02', null, '2026-11-06')).toBe('pendiente');
    expect(estadoSesion('2026-11-06', null, '2026-11-06')).toBe('pendiente');
    expect(estadoSesion('2026-11-07', null, '2026-11-06')).toBe('planificada');
  });

  it(`se apunta hoy y hasta ${DIAS_PARA_APUNTAR} días atrás, nunca el futuro`, () => {
    const hoy = '2026-11-06';
    expect(sePuedeApuntar(hoy, hoy)).toBe(true);
    expect(sePuedeApuntar('2026-11-07', hoy)).toBe(false);
    expect(sePuedeApuntar('2026-09-08', hoy)).toBe(true);
    expect(sePuedeApuntar('2026-09-07', hoy)).toBe(false);
  });
});

describe('el calendario', () => {
  it('el lunes de cualquier día y los siete días de su semana', () => {
    expect(lunesDe('2026-11-06')).toBe('2026-11-02');
    expect(lunesDe('2026-11-08')).toBe('2026-11-02');
    expect(lunesDe('2026-11-02')).toBe('2026-11-02');
    expect(diasDeSemana('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });

  it('las semanas que tocan un mes, aunque empiecen en el anterior', () => {
    // Noviembre de 2026 empieza en domingo: la primera semana es la del 26 oct.
    expect(semanasDelMes('2026-11')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
    expect(sumaMeses('2026-12', 1)).toBe('2027-01');
    expect(sumaMeses('2026-01', -1)).toBe('2025-12');
    expect(etiquetaMes('2026-11')).toBe('noviembre 2026');
    expect(etiquetaSemana('2026-11-02')).toBe('2–8 nov');
    expect(etiquetaSemana('2026-10-26')).toBe('26 oct – 1 nov');
  });

  it('formatos: sin dato no se pinta nada (regla 8)', () => {
    expect(formateaMinutos(45)).toBe('45′');
    expect(formateaMinutos(80)).toBe('1 h 20′');
    expect(formateaMinutos(120)).toBe('2 h');
    expect(formateaMinutos(null)).toBeNull();
    expect(formateaKm(8.5)).toBe('8,5 km');
    expect(formateaKm(0)).toBeNull();
  });

  it('las sesiones de cada día, en su orden', () => {
    const m = porDia([ses('b', '2026-11-03', { position: 1 }), ses('a', '2026-11-03', { position: 0 }), ses('c', '2026-11-02')]);
    expect([...m.keys()]).toEqual(['2026-11-02', '2026-11-03']);
    expect(m.get('2026-11-03')!.map((s) => s.id)).toEqual(['a', 'b']);
  });
});

describe('el resumen de una semana', () => {
  const sesiones = [
    ses('a', '2026-11-02', { durationMin: 60 }),
    ses('b', '2026-11-04', { kind: 'carrera', durationMin: 40, distanceKm: 8 }),
    ses('c', '2026-11-05', { kind: 'descanso' }),
    ses('d', '2026-11-07', { durationMin: 30 }),
  ];

  it('en un grupo, cada sesión que ya tocaba cuenta una vez por alumno; los descansos no cuentan', () => {
    const r = resumenSemana({
      sesiones, hoy: '2026-11-06', alumnos: ['u1', 'u2'],
      apuntes: [
        { sessionId: 'a', userId: 'u1', status: 'hecha', rpe: 6 },
        { sessionId: 'a', userId: 'u2', status: 'no_hecha', rpe: null },
        { sessionId: 'b', userId: 'u1', status: 'hecha', rpe: 8 },
        { sessionId: 'b', userId: 'fuera', status: 'hecha', rpe: 2 },
        { sessionId: 'd', userId: 'u1', status: 'hecha', rpe: 9 },
      ],
    });
    expect(r).toEqual({ sesiones: 3, minutos: 130, kilometros: 8, hechas: 2, posibles: 4, rpeMedio: 7 });
  });

  it('sin esfuerzo apuntado, el medio es null, no 0 (regla 8)', () => {
    const r = resumenSemana({ sesiones, hoy: '2026-11-06', apuntes: [{ sessionId: 'a', userId: 'u1', status: 'hecha', rpe: null }] });
    expect(r.rpeMedio).toBeNull();
    expect(r.posibles).toBe(2);
  });
});

describe('copiar una semana', () => {
  it('las mismas sesiones el mismo día de la semana, solo las de esa semana', () => {
    const copias = copiaSemana([
      ses('a', '2026-11-02', { title: 'Lunes' }),
      ses('b', '2026-11-08', { title: 'Domingo', kind: 'carrera', distanceKm: 8 }),
      ses('c', '2026-11-09', { title: 'De la otra semana' }),
    ], '2026-11-02', '2026-11-16');
    expect(copias.map((c) => [c.fecha, c.title])).toEqual([['2026-11-16', 'Lunes'], ['2026-11-22', 'Domingo']]);
    expect(copias[1].distanceKm).toBe(8);
  });

  it('cruza el cambio de hora sin desplazar un día', () => {
    // El 25 de octubre de 2026 se cambia la hora en España.
    const copias = copiaSemana([ses('a', '2026-10-19')], '2026-10-19', '2026-10-26');
    expect(copias[0].fecha).toBe('2026-10-26');
  });
});

describe('el baremo oficial (BOE-A-2026-15055, anexo II)', () => {
  it('agilidad: por sexo, en décimas, y 11,7 s (h) / 12,8 s (m) eliminan', () => {
    expect(puntosPrueba('agilidad', 8.2, 'male')).toBe(10);
    expect(puntosPrueba('agilidad', 8.3, 'male')).toBe(9);
    expect(puntosPrueba('agilidad', 10.5, 'male')).toBe(5);
    expect(puntosPrueba('agilidad', 11.6, 'male')).toBe(1);
    expect(puntosPrueba('agilidad', 11.7, 'male')).toBe(0);
    expect(puntosPrueba('agilidad', 9.3, 'female')).toBe(10);
    expect(puntosPrueba('agilidad', 11.6, 'female')).toBe(5);
    expect(puntosPrueba('agilidad', 12.8, 'female')).toBe(0);
    // 9,44 se lee 9,4 como en el cronómetro.
    expect(puntosPrueba('agilidad', 9.44, 'male')).toBe(7);
  });

  it('dominadas (hombres): de 0 a 4, 0; 8 y 9, 4; 17 o más, 10', () => {
    expect(puntosPrueba('dominadas', 4, 'male')).toBe(0);
    expect(puntosPrueba('dominadas', 5, 'male')).toBe(1);
    expect(puntosPrueba('dominadas', 9, 'male')).toBe(4);
    expect(puntosPrueba('dominadas', 13, 'male')).toBe(6);
    expect(puntosPrueba('dominadas', 25, 'male')).toBe(10);
  });

  it('suspensión (mujeres): de 0 a 35 s, 0; de 57 a 62 s, 5; 95 s o más, 10', () => {
    expect(puntosPrueba('suspension', 35, 'female')).toBe(0);
    expect(puntosPrueba('suspension', 36, 'female')).toBe(1);
    expect(puntosPrueba('suspension', 62, 'female')).toBe(5);
    expect(puntosPrueba('suspension', 95, 'female')).toBe(10);
  });

  it('1.000 m: la tabla de siempre (2:54 o menos = 10 en hombres)', () => {
    expect(puntosPrueba('carrera_1000', 174, 'male')).toBe(10);
    expect(puntosPrueba('carrera_1000', 229, 'male')).toBe(0);
    expect(puntosPrueba('carrera_1000', 204, 'female')).toBe(10);
  });

  it('cada frontera de las cuatro tablas, copiada del BOE tramo a tramo', () => {
    // [desde, hasta, puntos] tal cual vienen en el anexo II.
    const dominadas: [number, number, number][] = [[0, 4, 0], [5, 5, 1], [6, 6, 2], [7, 7, 3], [8, 9, 4], [10, 11, 5], [12, 13, 6], [14, 14, 7], [15, 15, 8], [16, 16, 9], [17, 30, 10]];
    for (const [a, b, p] of dominadas) for (const v of [a, b]) expect(puntosPrueba('dominadas', v, 'male'), `dominadas ${v}`).toBe(p);
    const suspension: [number, number, number][] = [[0, 35, 0], [36, 40, 1], [41, 45, 2], [46, 51, 3], [52, 56, 4], [57, 62, 5], [63, 69, 6], [70, 77, 7], [78, 85, 8], [86, 94, 9], [95, 200, 10]];
    for (const [a, b, p] of suspension) for (const v of [a, b]) expect(puntosPrueba('suspension', v, 'female'), `suspensión ${v}`).toBe(p);
    // Agilidad: [más lento, más rápido, puntos].
    const agH: [number, number, number][] = [[11.6, 11.5, 1], [11.4, 11.3, 2], [11.2, 11.0, 3], [10.9, 10.6, 4], [10.5, 10.2, 5], [10.1, 9.8, 6], [9.7, 9.4, 7], [9.3, 8.9, 8], [8.8, 8.3, 9], [8.2, 7.0, 10]];
    for (const [a, b, p] of agH) for (const v of [a, b]) expect(puntosPrueba('agilidad', v, 'male'), `agilidad h ${v}`).toBe(p);
    const agM: [number, number, number][] = [[12.7, 12.6, 1], [12.5, 12.4, 2], [12.3, 12.1, 3], [12.0, 11.7, 4], [11.6, 11.3, 5], [11.2, 10.9, 6], [10.8, 10.4, 7], [10.3, 9.9, 8], [9.8, 9.4, 9], [9.3, 8.0, 10]];
    for (const [a, b, p] of agM) for (const v of [a, b]) expect(puntosPrueba('agilidad', v, 'female'), `agilidad m ${v}`).toBe(p);
  });

  it('sin marca o sin sexo cuando hace falta: null, no 0 — un 0 elimina', () => {
    expect(puntosPrueba('agilidad', 9, null)).toBeNull();
    expect(puntosPrueba('carrera_1000', 200, null)).toBeNull();
    expect(puntosPrueba('dominadas', null, 'male')).toBeNull();
  });

  it('la nota: media de las tres, un 0 elimina, un 5 aprueba', () => {
    expect(notaFisica([6, 5, 4])).toEqual({ media: 5, eliminado: false, apto: true });
    expect(notaFisica([10, 0, 10])).toEqual({ media: 6.67, eliminado: true, apto: false });
    expect(notaFisica([4, 5, 5])).toEqual({ media: 4.67, eliminado: false, apto: false });
    expect(notaFisica([6, null, 6])).toEqual({ media: null, eliminado: false, apto: null });
    expect(notaFisica([0, null, 6])).toEqual({ media: null, eliminado: true, apto: false });
    expect(BAREMO_CNP.aprobado).toBe(5);
  });

  it('qué prueba de fuerza hace cada uno', () => {
    expect(pruebaDeFuerza('male')).toBe('dominadas');
    expect(pruebaDeFuerza('female')).toBe('suspension');
    expect(pruebasDe('female')).toEqual(['agilidad', 'suspension', 'carrera_1000']);
    expect(pruebasDe(null)).toHaveLength(4);
  });

  it('leer y escribir marcas como se teclean', () => {
    expect(leeMarca('agilidad', '9,4')).toBe(9.4);
    expect(leeMarca('carrera_1000', '3:35')).toBe(215);
    expect(leeMarca('carrera_1000', "3'35")).toBe(215);
    expect(leeMarca('carrera_1000', '3:75')).toBeNull();
    expect(leeMarca('dominadas', '12')).toBe(12);
    expect(leeMarca('dominadas', '0')).toBe(0);
    expect(leeMarca('dominadas', '12,5')).toBeNull();
    expect(leeMarca('suspension', '')).toBeNull();
    expect(formateaMarca('agilidad', 9.4)).toBe('9,4 s');
    expect(formateaMarca('carrera_1000', 215)).toBe('3:35');
    expect(formateaMarca('suspension', 61)).toBe('61 s');
  });

  it('la mejor y la última: en tiempo la menor, en repeticiones la mayor', () => {
    const m = (id: string, prueba: Marca['prueba'], valor: number, fecha: string): Marca => ({ id, prueba, valor, fecha, nota: null });
    const marcas = [m('1', 'agilidad', 9.8, '2026-10-01'), m('2', 'agilidad', 9.2, '2026-10-15'), m('3', 'agilidad', 9.5, '2026-11-01'), m('4', 'dominadas', 10, '2026-10-01'), m('5', 'dominadas', 8, '2026-11-01')];
    expect(mejorMarca(marcas, 'agilidad')!.id).toBe('2');
    expect(ultimaMarca(marcas, 'agilidad')!.id).toBe('3');
    expect(mejorMarca(marcas, 'dominadas')!.id).toBe('4');
    expect(mejorMarca(marcas, 'suspension')).toBeNull();
  });
});

describe('guardas de las acciones', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'fisica.ts'), 'utf-8');
  const cuerpo = (nombre: string) => {
    const i = src.indexOf(`export async function ${nombre}(`);
    expect(i, nombre).toBeGreaterThan(-1);
    const j = src.indexOf('\nexport async function ', i + 10);
    return src.slice(i, j < 0 ? undefined : j);
  };

  it('todo lo del preparador exige admin y se acota a su academia', () => {
    for (const n of ['getDestinosFisica', 'getPlanificador', 'saveSesion', 'deleteSesion', 'moverSesion', 'copiarSemanaFisica',
      'setNotaSemana', 'responderApunte', 'getPlantillas', 'savePlantilla', 'deletePlantilla', 'getMarcasAcademia', 'addMarca',
      'deleteMarca', 'setSexoAlumno']) {
      const c = cuerpo(n);
      expect(c, n).toContain('requireAdmin()');
      expect(c, n).toMatch(/organization_id|academy_id|destinoDeLaAcademia|esAlumnoDe/);
    }
  });

  it('lo del alumno exige sesión y escribe siempre con SU id', () => {
    for (const n of ['getMiFisica', 'setMiApunte', 'getMisMarcas', 'addMiMarca', 'deleteMiMarca', 'setMiSexo']) {
      expect(cuerpo(n), n).toContain('requireUser()');
    }
    expect(cuerpo('setMiApunte')).toMatch(/session_id: sessionId, user_id: auth\.user\.id/);
    expect(cuerpo('addMiMarca')).toMatch(/user_id: auth\.user\.id, test:/);
    expect(cuerpo('deleteMiMarca')).toMatch(/\.eq\('user_id', auth\.user\.id\)\.eq\('recorded_by', auth\.user\.id\)/);
  });

  it('antes de apuntar, comprueba que la sesión es suya o de un grupo suyo, y la fecha', () => {
    const c = cuerpo('setMiApunte');
    const escribe = c.indexOf("from('training_session_logs')");
    expect(c.indexOf('gruposDelAlumno')).toBeLessThan(escribe);
    expect(c.indexOf('sePuedeApuntar')).toBeLessThan(escribe);
    expect(c).toContain(".eq('organization_id', org)");
  });

  it('la respuesta del preparador no la pisa el alumno al corregir lo apuntado', () => {
    expect(cuerpo('setMiApunte')).not.toMatch(/coach_reply/);
  });
});
