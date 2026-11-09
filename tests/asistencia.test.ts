import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeHorario, horarioDeFila, horaCorta, ahoraEnZona, sumaDias, diaSemanaDe, esFecha,
  proximasSesiones, sePuedeAvisar, cuentaSesion, horarioEnTexto, etiquetaFecha, DIAS_VISIBLES,
  type HorarioGrupo,
} from '../app/lib/asistencia';

/**
 * ASISTENCIA (regla 82): el horario de un grupo, sus sesiones, hasta cuándo se
 * puede avisar de una falta y cuántas plazas quedan.
 */

const LXV: HorarioGrupo = { weekdays: [1, 3, 5], startTime: '17:00', endTime: '19:00', capacity: 20 };
// 2026-11-09 es lunes.
const lunes = (minutos: number) => ({ fecha: '2026-11-09', minutos });

describe('normalizeHorario', () => {
  it('limpia días, horas y plazas', () => {
    const r = normalizeHorario({ weekdays: [5, 1, 3, 3, 9, 0], startTime: '9:05', endTime: '11:00:00', capacity: '20' });
    expect(r).toEqual({ ok: true, horario: { weekdays: [1, 3, 5], startTime: '09:05', endTime: '11:00', capacity: 20 } });
  });

  it('un campo vacío es null, nunca 0 (regla 16)', () => {
    const r = normalizeHorario({ weekdays: [], startTime: '', endTime: '', capacity: '' });
    expect(r).toEqual({ ok: true, horario: { weekdays: null, startTime: null, endTime: null, capacity: null } });
  });

  it('rechaza lo que no tiene sentido, diciendo por qué', () => {
    expect(normalizeHorario({ startTime: '19:00', endTime: '17:00' })).toMatchObject({ ok: false, error: /posterior/ });
    expect(normalizeHorario({ startTime: '25:00' })).toMatchObject({ ok: false, error: /inicio/ });
    expect(normalizeHorario({ capacity: '0' })).toMatchObject({ ok: false, error: /plazas/ });
    expect(normalizeHorario({ capacity: '2.5' })).toMatchObject({ ok: false });
  });

  it('lee la fila de Postgres (time con segundos) y aguanta filas sin horario', () => {
    expect(horarioDeFila({ weekdays: [2, 4], start_time: '18:30:00', end_time: '20:00:00', capacity: 15 }))
      .toEqual({ weekdays: [2, 4], startTime: '18:30', endTime: '20:00', capacity: 15 });
    expect(horarioDeFila({})).toEqual({ weekdays: null, startTime: null, endTime: null, capacity: null });
    expect(horaCorta('7:3')).toBeNull();
  });
});

describe('la hora es la de la academia, no la del servidor', () => {
  it('a las 23:30 UTC de un domingo de invierno, en Madrid ya es lunes', () => {
    expect(ahoraEnZona(Date.UTC(2026, 10, 8, 23, 30))).toEqual({ fecha: '2026-11-09', minutos: 30 });
  });

  it('en verano Madrid va dos horas por delante; en invierno, una', () => {
    expect(ahoraEnZona(Date.UTC(2026, 6, 1, 15, 0)).minutos).toBe(17 * 60);
    expect(ahoraEnZona(Date.UTC(2026, 11, 1, 15, 0)).minutos).toBe(16 * 60);
  });

  it('las fechas se suman por calendario, también cruzando el cambio de hora', () => {
    expect(sumaDias('2026-10-24', 2)).toBe('2026-10-26');
    expect(sumaDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(diaSemanaDe('2026-11-09')).toBe(1);
    expect(diaSemanaDe('2026-11-15')).toBe(7);
  });

  it('esFecha no se traga fechas imposibles', () => {
    expect(esFecha('2026-11-09')).toBe(true);
    expect(esFecha('2026-02-30')).toBe(false);
    expect(esFecha('9-11-2026')).toBe(false);
    expect(esFecha(null)).toBe(false);
  });
});

describe('proximasSesiones', () => {
  it('solo los días de clase, dentro de la ventana', () => {
    const s = proximasSesiones(LXV, lunes(10 * 60), 7);
    expect(s).toEqual(['2026-11-09', '2026-11-11', '2026-11-13']);
  });

  it('la clase de hoy sigue saliendo mientras no ha terminado, y desaparece al terminar', () => {
    expect(proximasSesiones(LXV, lunes(18 * 60), 1)).toEqual(['2026-11-09']);
    expect(proximasSesiones(LXV, lunes(19 * 60), 1)).toEqual([]);
  });

  it('un grupo sin días no tiene sesiones', () => {
    expect(proximasSesiones({ ...LXV, weekdays: null }, lunes(0))).toEqual([]);
  });

  it('la ventana por defecto cubre DIAS_VISIBLES días', () => {
    const s = proximasSesiones({ ...LXV, weekdays: [1, 2, 3, 4, 5, 6, 7] }, lunes(0));
    expect(s).toHaveLength(DIAS_VISIBLES);
  });
});

describe('sePuedeAvisar', () => {
  it('hasta que EMPIEZA la clase, no hasta que termina', () => {
    expect(sePuedeAvisar(LXV, '2026-11-09', lunes(16 * 60 + 59))).toBe(true);
    expect(sePuedeAvisar(LXV, '2026-11-09', lunes(17 * 60))).toBe(false);
  });

  it('una clase de otro día de la semana del grupo, sí; un día sin clase, no', () => {
    expect(sePuedeAvisar(LXV, '2026-11-11', lunes(20 * 60))).toBe(true);
    expect(sePuedeAvisar(LXV, '2026-11-10', lunes(0))).toBe(false); // martes
  });

  it('ni el pasado ni más allá de la ventana', () => {
    expect(sePuedeAvisar(LXV, '2026-11-06', lunes(0))).toBe(false);
    expect(sePuedeAvisar(LXV, sumaDias('2026-11-09', DIAS_VISIBLES + 7), lunes(0))).toBe(false);
  });

  it('sin hora de inicio, se puede todo ese día', () => {
    expect(sePuedeAvisar({ ...LXV, startTime: null, endTime: null }, '2026-11-09', lunes(23 * 60))).toBe(true);
  });
});

describe('cuentaSesion', () => {
  it('plazas libres = aforo − los que van', () => {
    expect(cuentaSesion(20, 20, 3)).toEqual({ aforo: 20, inscritos: 20, faltan: 3, asisten: 17, libres: 3, sobreaforo: false });
    expect(cuentaSesion(20, 20, 0).libres).toBe(0);
  });

  it('sin aforo puesto, «libres» es null, no 0 (regla 8)', () => {
    expect(cuentaSesion(null, 12, 2)).toMatchObject({ libres: null, asisten: 10, sobreaforo: false });
  });

  it('más alumnos que plazas se dice, no se esconde', () => {
    expect(cuentaSesion(20, 23, 1)).toMatchObject({ libres: -2, sobreaforo: true });
  });
});

describe('textos', () => {
  it('el horario en una línea', () => {
    expect(horarioEnTexto(LXV)).toBe('L · X · V · 17:00–19:00 · 20 plazas');
    expect(horarioEnTexto({ weekdays: null, startTime: null, endTime: null, capacity: null })).toBeNull();
  });

  it('la fecha sin correrse de día', () => {
    expect(etiquetaFecha('2026-11-09')).toMatch(/lun.*9.*nov/);
  });
});

describe('guardas de las acciones', () => {
  const src = readFileSync(join(__dirname, '..', 'app', 'actions', 'asistencia.ts'), 'utf-8');

  it('el alumno solo toca SUS faltas: toda escritura lleva su id', () => {
    expect(src).toMatch(/upsert\(\{ class_id: classId, user_id: auth\.user\.id/);
    expect(src).toMatch(/\.delete\(\)[\s\S]{0,80}\.eq\('user_id', auth\.user\.id\)/);
  });

  it('antes de escribir, comprueba que es del grupo, que el grupo es de su academia y que aún se puede', () => {
    const i = src.indexOf('export async function setMiFalta');
    const cuerpo = src.slice(i, src.indexOf('export type SesionAcademia'));
    expect(cuerpo).toContain(".eq('organization_id', organizationId)");
    expect(cuerpo).toContain("from('class_members')");
    expect(cuerpo.indexOf('sePuedeAvisar')).toBeLessThan(cuerpo.indexOf("from('class_absences')"));
  });

  it('la vista de la academia exige admin y se acota a su academia', () => {
    const i = src.indexOf('export async function getAsistenciaAcademia');
    const cuerpo = src.slice(i);
    expect(cuerpo).toContain('requireAdmin()');
    expect(cuerpo).toContain(".eq('organization_id', organizationId)");
  });
});

describe('el horario del grupo con la hora escrita a mano (regla 99)', () => {
  it('entiende «8», «0800», «20.30» y lo que devuelve Postgres', async () => {
    const { normalizeHorario } = await import('../app/lib/asistencia');
    expect(normalizeHorario({ weekdays: [1, 3], startTime: '8', endTime: '0900' })).toMatchObject({ ok: true, horario: { startTime: '08:00', endTime: '09:00' } });
    expect(normalizeHorario({ weekdays: [2], startTime: '20.30', endTime: '21:30:00' })).toMatchObject({ ok: true, horario: { startTime: '20:30', endTime: '21:30' } });
    expect(normalizeHorario({ weekdays: [2], startTime: 'tarde' })).toMatchObject({ ok: false });
  });
});

