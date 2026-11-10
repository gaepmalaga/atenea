import { describe, it, expect } from 'vitest';
import {
  cuando, instante, uuidDemo, crea, generaAlumnos, generaRespuestas, generaSimulacros, generaMarcas, generaRm, generaEntreno,
  generaCuadrante, generaAsistencia, generaCobros, indexaPool, gruposDe, tieneRespuestas, ejerciciosRm, DEUDORES_DEMO,
  GRUPO_INGLES, GRUPO_TEORIA_TARDE, TITULOS_CUADRANTE, EMAIL_ALUMNO_DEMO, type AlumnoDemo, type GrupoRef,
} from '../app/lib/demo';
import { puntosPrueba } from '../app/lib/baremo-fisico';
import { periodoEnZona, sumaMeses, type Tarifa } from '../app/lib/cuotas';
import { ahoraEnZona, diaSemanaDe, sumaDias } from '../app/lib/asistencia';

const NOV = Date.UTC(2026, 10, 10, 9, 30); // martes 10 nov 2026, 10:30 en Madrid
const DIC = Date.UTC(2026, 11, 15, 9, 30); // martes 15 dic 2026, 10:30 en Madrid (la misma hora del día que NOV)
const TARIFA: Tarifa = {
  tipos: [
    { id: 'teoria', label: 'Teoría', precio: 100 }, { id: 'ingles', label: 'Inglés', precio: null },
    { id: 'fisicas', label: 'Físicas', precio: 50 }, { id: 'otro', label: 'Otro', precio: null },
  ],
  packs: [],
};
const POOL = Array.from({ length: 900 }, (_, i) => ({ id: `q${String(i).padStart(4, '0')}`, subjectId: 38 + (i % 45), correctIndex: i % 3 }));
const TEMAS = Array.from({ length: 45 }, (_, i) => ({ subjectId: 38 + i, titulo: `Tema ${i + 1}` }));
const IDX = indexaPool(POOL, TEMAS);
const GRUPOS: GrupoRef[] = [
  { nombre: 'Promo 44 · Kappa', weekdays: [1, 3], inicio: '08:00', fin: '09:00', esMulti: false },
  { nombre: 'Promo 44 · Alpha', weekdays: [1, 3], inicio: '08:00', fin: '09:00', esMulti: false },
  { nombre: 'Promo 44 · Zetta', weekdays: [1, 3], inicio: '20:00', fin: '21:00', esMulti: false },
  { nombre: 'Promo 44 · Omega', weekdays: [2, 4], inicio: '08:00', fin: '09:00', esMulti: false },
  { nombre: 'Promo 44 · Sigma', weekdays: [2, 4], inicio: '08:00', fin: '09:00', esMulti: false },
  { nombre: 'Promo 44 · Betta', weekdays: [2, 4], inicio: '20:00', fin: '21:00', esMulti: false },
  { nombre: 'Promo 44 · Delta', weekdays: [2, 4], inicio: '20:00', fin: '21:00', esMulti: false },
  { nombre: 'Promo 44 · Multi', weekdays: null, inicio: null, fin: null, esMulti: true },
];
const HABITUALES = [
  { actividad: 'Boxeo', profesor: 'Juan', prioridad: 1 }, { actividad: 'Jiujitsu', profesor: 'Lucas', prioridad: 1 },
  { actividad: 'F.M + RDL', profesor: 'Lucio', prioridad: 1 }, { actividad: 'F.M + RDL', profesor: 'José Morato', prioridad: 2 },
  { actividad: 'FLK', profesor: 'José Morato', prioridad: 1 }, { actividad: 'FLK', profesor: 'Olivares', prioridad: 2 },
];
const PROFES = ['Sofía', 'José Morato', 'Lucas', 'Olivares', 'Lucio', 'Juan'];

const alumnos = generaAlumnos();
const por = (clave: string): AlumnoDemo => alumnos.find((a) => a.clave === clave)!;

describe('el azar con semilla', () => {
  it('da siempre lo mismo para la misma semilla y otra cosa para otra', () => {
    const a = crea('x'), b = crea('x'), c = crea('y');
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('los ids son uuid válidos, estables y distintos', () => {
    const id = uuidDemo('cuenta', 'a00');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidDemo('cuenta', 'a00')).toBe(id);
    const todos = new Set(Array.from({ length: 5000 }, (_, i) => uuidDemo('x', String(i))));
    expect(todos.size).toBe(5000);
  });
});

describe('el momento', () => {
  it('«hoy» y el mes salen de la hora de la academia, no de la del servidor', () => {
    // Las 23:30 UTC del 30 de noviembre ya son diciembre en Madrid.
    const c = cuando(Date.UTC(2026, 10, 30, 23, 30));
    expect(c.hoy).toBe('2026-12-01');
    expect(c.periodo).toBe('2026-12');
    expect(c.periodo).toBe(periodoEnZona(Date.UTC(2026, 10, 30, 23, 30)));
    expect(c.lunes).toBe('2026-11-30');
  });
  it('convierte la hora de Madrid a UTC con el cambio de hora', () => {
    expect(instante('2026-11-10', 8 * 3600)).toBe('2026-11-10T07:00:00.000Z');
    expect(instante('2026-07-10', 8 * 3600)).toBe('2026-07-10T06:00:00.000Z');
    expect(instante('2026-11-10', 8 * 3600 + 90)).toBe('2026-11-10T07:01:30.000Z');
    for (const [f, s] of [['2026-03-29', 4 * 3600], ['2026-10-25', 12 * 3600], ['2026-11-10', 23 * 3600 + 59 * 60]] as const) {
      const a = ahoraEnZona(Date.parse(instante(f, s)));
      expect(a.fecha).toBe(f);
      expect(a.minutos).toBe(Math.floor(s / 60));
    }
  });
});

describe('los alumnos', () => {
  it('son 45, con correo de la demo, únicos y siempre los mismos', () => {
    expect(alumnos).toHaveLength(45);
    expect(new Set(alumnos.map((a) => a.email)).size).toBe(45);
    expect(alumnos.every((a) => a.email.endsWith('@demo.alphapol.test'))).toBe(true);
    expect(alumnos[0].email).toBe(EMAIL_ALUMNO_DEMO);
    expect(generaAlumnos()).toEqual(alumnos);
    expect(alumnos.map((a) => a.email).every((e) => /^[a-z0-9.]+@demo\.alphapol\.test$/.test(e))).toBe(true);
  });

  it('salen todos los casos del panel «Alumnos»', () => {
    const c = cuando(NOV);
    const haceCuanto = (a: AlumnoDemo) => {
      const r = generaRespuestas(a, c, IDX);
      return r.length ? Math.floor((c.ahoraMs - Date.parse(r[r.length - 1].created_at)) / 86_400_000) : null;
    };
    const activos = alumnos.filter((a) => a.acceso === 'active');
    // Cuatro que llevan más de 14 días sin estudiar.
    const dormidos = activos.filter((a) => a.perfil === 'abandonado');
    expect(dormidos).toHaveLength(4);
    for (const a of dormidos) expect(haceCuanto(a)!).toBeGreaterThan(14);
    // Tres que nunca han entrado: ni una respuesta.
    const nunca = alumnos.filter((a) => a.perfil === 'nunca');
    expect(nunca).toHaveLength(3);
    for (const a of nunca) expect(generaRespuestas(a, c, IDX)).toEqual([]);
    // Tres solicitudes pendientes de aceptar, sin grupos.
    const pendientes = alumnos.filter((a) => a.acceso === 'pending');
    expect(pendientes).toHaveLength(3);
    expect(pendientes.every((a) => gruposDe(a).length === 0)).toBe(true);
    // Dos suspendidos que dejaron de venir.
    const suspendidos = alumnos.filter((a) => a.acceso === 'suspended');
    expect(suspendidos).toHaveLength(2);
    for (const a of suspendidos) expect(haceCuanto(a)!).toBeGreaterThan(14);
    // Dos exentos y dos con cuota propia (uno es el hermano con descuento).
    expect(alumnos.filter((a) => a.exento)).toHaveLength(2);
    const propias = alumnos.filter((a) => a.propia);
    expect(propias).toHaveLength(2);
    expect(propias.some((a) => /hermano/i.test(a.propia!.nota))).toBe(true);
    // Los que estudian a diario, activos: el resto de activos con datos, estudiando hoy o ayer.
    const aDiario = activos.filter((a) => a.perfil === 'intensivo');
    expect(aDiario.length).toBeGreaterThanOrEqual(6);
    for (const a of aDiario) expect(haceCuanto(a)!).toBeLessThanOrEqual(1);
  });

  it('cada uno está en 1 a 3 grupos, el de física respeta el sexo y inglés es de tres como mucho', () => {
    const conGrupos = alumnos.filter((a) => a.acceso !== 'pending');
    for (const a of conGrupos) {
      const n = gruposDe(a).length;
      expect(n, a.email).toBeGreaterThanOrEqual(1);
      expect(n, a.email).toBeLessThanOrEqual(3);
      if (a.fisica && !a.fisica.endsWith('Multi')) {
        const chica = /Kappa|Sigma|Betta/.test(a.fisica);
        expect(chica ? 'female' : 'male', `${a.email} en ${a.fisica}`).toBe(a.sexo);
      }
    }
    expect(alumnos.filter((a) => a.ingles)).toHaveLength(3);
    expect(gruposDe(alumnos.find((a) => a.ingles)!)).toContain(GRUPO_INGLES);
    expect(alumnos.some((a) => a.teoria === GRUPO_TEORIA_TARDE)).toBe(true);
    // Hay un hermano con los mismos apellidos que el del descuento.
    const hermano = alumnos.find((a) => a.propia && /hermano/i.test(a.propia.nota))!;
    expect(alumnos.filter((a) => a.nombre.split(' ').slice(1).join(' ') === hermano.nombre.split(' ').slice(1).join(' '))).toHaveLength(2);
  });
});

describe('las respuestas', () => {
  const c = cuando(NOV);
  const todas = alumnos.flatMap((a) => generaRespuestas(a, c, IDX).map((r) => ({ a, r })));

  it('son de los últimos 2-3 meses, no hay ninguna en el futuro y cada una tiene id único', () => {
    expect(todas.length).toBeGreaterThan(5000);
    expect(new Set(todas.map((x) => x.r.id)).size).toBe(todas.length);
    const fechas = todas.map((x) => x.r.created_at).sort();
    expect(Date.parse(fechas[fechas.length - 1])).toBeLessThanOrEqual(NOV);
    const dias = (NOV - Date.parse(fechas[0])) / 86_400_000;
    expect(dias).toBeGreaterThan(55);
    expect(dias).toBeLessThan(100);
  });

  it('hay blancos (-1, nunca correctos), dudosas y de todo un poco', () => {
    const blancos = todas.filter((x) => x.r.selected_index === -1);
    expect(blancos.length).toBeGreaterThan(100);
    expect(blancos.every((x) => x.r.is_correct === false && x.r.error_type === null)).toBe(true);
    expect(todas.filter((x) => x.r.confidence === 1).length).toBeGreaterThan(300);
    expect(todas.some((x) => x.r.option_changes > 0)).toBe(true);
    expect(todas.filter((x) => x.r.error_type).length).toBeGreaterThan(100);
  });

  it('cada respuesta es coherente con su pregunta y con la forma que guarda la tabla', () => {
    const porId = new Map(POOL.map((q) => [q.id, q]));
    for (const { r } of todas) {
      const q = porId.get(r.question_id)!;
      expect(q).toBeTruthy();
      expect(r.topic).toBe(TEMAS.find((t) => t.subjectId === q.subjectId)!.titulo);
      if (r.selected_index !== -1) expect(r.is_correct).toBe(r.selected_index === q.correctIndex);
      expect([-1, 0, 1, 2]).toContain(r.selected_index);
      expect([null, 1, 2]).toContain(r.confidence);
      expect(r.response_time_ms).toBeGreaterThan(0);
      if (r.first_touch_ms !== null) expect(r.first_touch_ms).toBeLessThanOrEqual(r.response_time_ms);
      if (r.answer_path !== null) {
        expect(Array.isArray(r.answer_path)).toBe(true);
        expect(r.answer_path.every((i) => Number.isInteger(i) && i >= 0 && i <= 2)).toBe(true);
        if (r.selected_index !== -1) expect(r.answer_path[r.answer_path.length - 1]).toBe(r.selected_index);
      }
    }
  });

  it('cada uno acierta a su ritmo: los intensivos más y más seguido que los irregulares', () => {
    const tasa = (perfil: string) => {
      const r = todas.filter((x) => x.a.perfil === perfil && x.r.selected_index !== -1);
      return r.filter((x) => x.r.is_correct).length / r.length;
    };
    const n = (perfil: string) => todas.filter((x) => x.a.perfil === perfil).length / alumnos.filter((a) => a.perfil === perfil).length;
    expect(tasa('intensivo')).toBeGreaterThan(tasa('regular'));
    expect(tasa('regular')).toBeGreaterThan(tasa('irregular'));
    expect(n('intensivo')).toBeGreaterThan(n('regular'));
    expect(n('regular')).toBeGreaterThan(n('irregular'));
  });

  it('los simulacros comparten un exam_id y llevan su nota', () => {
    const sims = alumnos.flatMap((a) => generaSimulacros(a, c, IDX));
    const ids = new Set(sims.map((s) => s.exam_id));
    expect(ids.size).toBeGreaterThanOrEqual(15);
    for (const id of ids) expect(sims.filter((s) => s.exam_id === id)).toHaveLength(40);
    expect(sims.every((s) => s.error_type === null)).toBe(true);
  });

  it('un alumno sin respuestas no inventa nada, y sin banco tampoco', () => {
    expect(generaRespuestas(por('a37'), c, IDX)).toEqual([]);
    expect(generaRespuestas(por('a00'), c, indexaPool([], TEMAS))).toEqual([]);
    expect(alumnos.filter(tieneRespuestas)).toHaveLength(39);
  });
});

describe('cargar en otro mes', () => {
  it('cargar en noviembre y en diciembre da los mismos alumnos con la misma historia', () => {
    const nov = cuando(NOV), dic = cuando(DIC);
    expect(generaAlumnos()).toEqual(alumnos);
    for (const a of alumnos) {
      const rn = generaRespuestas(a, nov, IDX), rd = generaRespuestas(a, dic, IDX);
      // Misma historia: el mismo número de respuestas, las mismas preguntas y los mismos aciertos…
      expect(rd.map((r) => [r.question_id, r.is_correct, r.selected_index, r.topic])).toEqual(rn.map((r) => [r.question_id, r.is_correct, r.selected_index, r.topic]));
      // …desplazada: 35 días después (del 10 de noviembre al 15 de diciembre).
      if (rn.length) expect(Math.round((Date.parse(rd[0].created_at) - Date.parse(rn[0].created_at)) / 86_400_000)).toBe(35);
    }
  });

  it('los cobros siguen al mes: los cinco anteriores y el actual', () => {
    for (const [ms, actual] of [[NOV, '2026-11'], [DIC, '2026-12'], [Date.UTC(2027, 0, 20), '2027-01']] as const) {
      const p = generaCobros({ c: cuando(ms), alumnos, tarifa: TARIFA });
      const periodos = [...new Set(p.meses.map((m) => m.periodo))].sort();
      expect(periodos).toEqual(Array.from({ length: 6 }, (_, i) => sumaMeses(actual, i - 5)));
      expect(p.eventos.every((e) => e.fecha.slice(0, 7) === e.periodo)).toBe(true);
      expect(p.eventos.every((e) => e.fecha <= cuando(ms).hoy)).toBe(true);
    }
  });

  it('el cuadrante se corre con la semana: de tres semanas antes a la que viene', () => {
    for (const ms of [NOV, DIC]) {
      const c = cuando(ms);
      const plan = generaCuadrante({ c, grupos: GRUPOS, habituales: HABITUALES, profesores: PROFES, ocupados: [] });
      const fechas = plan.sesiones.map((s) => s.fecha).sort();
      expect(fechas[0] >= sumaDias(c.lunes, -21)).toBe(true);
      expect(fechas[fechas.length - 1] <= sumaDias(c.lunes, 13)).toBe(true);
      expect(fechas.some((f) => f >= sumaDias(c.lunes, 7))).toBe(true);
      expect(plan.semanasPublicadas).toEqual([-21, -14, -7, 0].map((d) => sumaDias(c.lunes, d)));
      expect(plan.semanaBorrador).toBe(sumaDias(c.lunes, 7));
    }
  });
});

describe('las marcas y el 1RM', () => {
  const c = cuando(NOV);
  it('cada uno hace las pruebas de su sexo, con valores posibles, y mejora', () => {
    for (const a of alumnos) {
      const m = generaMarcas(a, c);
      if (a.perfil === 'nunca' || a.perfil === 'pendiente') { expect(m).toEqual([]); continue; }
      expect(m.length, a.email).toBeGreaterThan(0);
      const pruebas = new Set(m.map((x) => x.test));
      expect(pruebas.has(a.sexo === 'male' ? 'dominadas' : 'suspension')).toBe(true);
      expect(pruebas.has(a.sexo === 'male' ? 'suspension' : 'dominadas')).toBe(false);
      for (const x of m) {
        expect(x.measured_on <= c.hoy).toBe(true);
        expect(x.value).toBeGreaterThanOrEqual(0);
        if (x.test === 'agilidad') { expect(x.value).toBeGreaterThan(7); expect(x.value).toBeLessThan(14); }
        if (x.test === 'carrera_1000') { expect(x.value).toBeGreaterThan(180); expect(x.value).toBeLessThan(400); }
        // El baremo del BOE entiende cada marca.
        expect(puntosPrueba(x.test, x.value, a.sexo)).not.toBeNull();
      }
      const primera = m.filter((x) => x.test === 'carrera_1000').sort((p, q) => p.measured_on.localeCompare(q.measured_on));
      if (primera.length > 1) expect(primera[primera.length - 1].value).toBeLessThanOrEqual(primera[0].value + 3);
    }
    expect(new Set(alumnos.flatMap((a) => generaMarcas(a, c)).map((m) => m.id)).size).toBe(alumnos.flatMap((a) => generaMarcas(a, c)).length);
  });

  it('el 1RM es de pesos posibles y solo de quien lo tiene', () => {
    expect(alumnos.filter((a) => a.conRm).length).toBeGreaterThanOrEqual(10);
    for (const a of alumnos) {
      const rm = generaRm(a, c);
      expect(rm.length > 0).toBe(a.conRm);
      for (const x of rm) {
        expect(x.weight_kg).toBeGreaterThan(0);
        expect(x.weight_kg % 2.5).toBe(0);
        expect(x.reps).toBeGreaterThanOrEqual(1);
        expect(x.reps).toBeLessThanOrEqual(12);
        expect(ejerciciosRm(a)).toContain(x.exercise);
      }
    }
  });
});

describe('el entreno individual', () => {
  const c = cuando(NOV);
  it('lo tienen seis alumnos, con sesiones de tres semanas antes a la que viene', () => {
    const con = alumnos.filter((a) => a.entreno);
    expect(con).toHaveLength(6);
    for (const a of con) {
      const e = generaEntreno(a, c);
      expect(e.sesiones).toHaveLength(35);
      expect(e.sesiones[0].session_date).toBe(sumaDias(c.lunes, -21));
      expect(e.sesiones[34].session_date).toBe(sumaDias(c.lunes, 13));
      expect(new Set(e.sesiones.map((s) => s.id)).size).toBe(35);
      // Los de fuerza llevan cargas de SU 1RM; el resto, ninguna.
      for (const s of e.sesiones) {
        if (s.loads) {
          expect(s.kind).toBe('fuerza');
          for (const l of s.loads) { expect(ejerciciosRm(a)).toContain(l.ejercicio); expect(l.porcentaje).toBeGreaterThan(50); expect(l.porcentaje).toBeLessThanOrEqual(100); }
        }
        if (s.kind === 'descanso') expect(s.duration_min).toBeNull();
      }
      // Lo que ya pasó, apuntado; lo de hoy y lo que viene, no.
      const fecha = new Map(e.sesiones.map((s) => [s.id, s.session_date]));
      expect(e.registros.length).toBeGreaterThan(10);
      for (const r of e.registros) {
        expect(fecha.get(r.sessionId)! < c.hoy).toBe(true);
        if (r.status === 'hecha') { expect(r.rpe).toBeGreaterThanOrEqual(5); expect(r.rpe).toBeLessThanOrEqual(9); } else expect(r.rpe).toBeNull();
        if (r.coach_reply) { expect(r.status).toBe('hecha'); expect(r.respuestaEl! <= c.hoy).toBe(true); expect(r.coach_reply.length).toBeLessThanOrEqual(500); }
      }
      expect(e.notas).toHaveLength(2);
    }
    expect(con.flatMap((a) => generaEntreno(a, c).registros).some((r) => r.coach_reply)).toBe(true);
    expect(alumnos.filter((a) => !a.entreno).every((a) => generaEntreno(a, c).sesiones.length === 0)).toBe(true);
  });
});

describe('el cuadrante', () => {
  const c = cuando(NOV);
  const plan = generaCuadrante({ c, grupos: GRUPOS, habituales: HABITUALES, profesores: PROFES, ocupados: [] });

  it('rota los títulos del cuadrante y pone el profesor habitual de cada clase', () => {
    expect(new Set(plan.sesiones.map((s) => s.titulo))).toEqual(new Set(TITULOS_CUADRANTE));
    const habitual = (t: string) => HABITUALES.filter((h) => t.toLowerCase().startsWith(h.actividad.toLowerCase())).map((h) => h.profesor);
    for (const s of plan.sesiones) {
      expect(s.profesor, `${s.grupo} ${s.fecha}`).not.toBeNull();
      expect(habitual(s.titulo)).toContain(s.profesor);
    }
    expect(plan.sesiones.filter((s) => s.titulo === 'Boxeo').every((s) => s.profesor === 'Juan')).toBe(true);
    expect(plan.sesiones.filter((s) => s.titulo === 'Jiujitsu').every((s) => s.profesor === 'Lucas')).toBe(true);
  });

  it('Kappa no tiene la semana que viene, Multi tiene sueltas martes y jueves a las 18:30 y hay un festivo', () => {
    const kappa = plan.sesiones.filter((s) => s.grupo.endsWith('Kappa'));
    expect(kappa.some((s) => s.fecha >= sumaDias(c.lunes, 7))).toBe(false);
    expect(kappa.length).toBeGreaterThan(4);
    expect(plan.sesiones.filter((s) => s.grupo.endsWith('Alpha')).some((s) => s.fecha >= sumaDias(c.lunes, 7))).toBe(true);
    const multi = plan.sesiones.filter((s) => s.grupo.endsWith('Multi'));
    expect(multi.every((s) => s.horaPropia === '18:30' && [2, 4].includes(diaSemanaDe(s.fecha)))).toBe(true);
    expect(new Set(multi.map((s) => diaSemanaDe(s.fecha)))).toEqual(new Set([2, 4]));
    expect(plan.festivos.length).toBeGreaterThan(0);
    expect(plan.festivos.every((f) => f.motivo.length > 3 && f.motivo.length <= 120)).toBe(true);
    // Nadie tiene clase el día del festivo en un grupo que lo tiene.
    for (const f of plan.festivos) expect(plan.sesiones.some((s) => s.grupo === f.grupo && s.fecha === f.fecha)).toBe(false);
  });

  it('una sesión por grupo y día, y solo en sus días de clase', () => {
    const vistos = new Set<string>();
    for (const s of plan.sesiones.filter((x) => !x.grupo.endsWith('Multi'))) {
      const k = `${s.grupo}|${s.fecha}`;
      expect(vistos.has(k)).toBe(false);
      vistos.add(k);
      expect(GRUPOS.find((g) => g.nombre === s.grupo)!.weekdays).toContain(diaSemanaDe(s.fecha));
    }
  });

  it('respeta a los profesores que ya tienen clase a esa hora', () => {
    const ocupados = [{ fecha: '2026-11-16', inicio: '08:00', profesor: 'Juan' }];
    const otro = generaCuadrante({ c, grupos: GRUPOS, habituales: HABITUALES, profesores: PROFES, ocupados });
    expect(otro.sesiones.filter((s) => s.fecha === '2026-11-16' && s.profesor === 'Juan' && !s.grupo.endsWith('Multi') && GRUPOS.find((g) => g.nombre === s.grupo)!.inicio === '08:00')).toHaveLength(0);
  });
});

describe('la asistencia', () => {
  const c = cuando(NOV);
  const plan = generaCuadrante({ c, grupos: GRUPOS, habituales: HABITUALES, profesores: PROFES, ocupados: [] });
  const todos: GrupoRef[] = [
    ...GRUPOS,
    { nombre: 'Promo 43', weekdays: [2, 4], inicio: '10:00', fin: '13:00', esMulti: false },
    { nombre: 'Promo 44 · Teoría tarde', weekdays: [1, 3], inicio: '17:00', fin: '19:00', esMulti: false },
  ];
  const { faltas, uniones } = generaAsistencia({ c, alumnos, grupos: todos, festivos: plan.festivos, sinPlanificar: plan.sinPlanificar });

  it('hay faltas avisadas en días de clase de su grupo, pasadas y por venir', () => {
    expect(faltas.length).toBeGreaterThan(10);
    for (const f of faltas) {
      const a = por(f.alumno);
      expect(gruposDe(a)).toContain(f.grupo);
      expect(todos.find((g) => g.nombre === f.grupo)!.weekdays).toContain(diaSemanaDe(f.fecha));
      expect(plan.festivos.some((x) => x.grupo === f.grupo && x.fecha === f.fecha)).toBe(false);
    }
    expect(faltas.some((f) => f.fecha < c.hoy)).toBe(true);
    expect(faltas.some((f) => f.fecha >= c.hoy)).toBe(true);
  });

  it('los multis se apuntan a clases de otros grupos que de verdad se dan', () => {
    expect(uniones.length).toBeGreaterThan(10);
    const dadas = new Set(plan.sesiones.map((s) => `${s.grupo}|${s.fecha}`));
    for (const u of uniones) {
      expect(por(u.alumno).fisica).toContain('Multi');
      expect(u.grupo).not.toContain('Multi');
      expect(todos.find((g) => g.nombre === u.grupo)!.weekdays).toContain(diaSemanaDe(u.fecha));
      // Con sesión planificada (menos el hueco de Kappa la semana que viene, que es justo lo que se quiere ver).
      if (!(u.grupo === plan.sinPlanificar.grupo && u.fecha >= plan.sinPlanificar.semana)) expect(dadas.has(`${u.grupo}|${u.fecha}`)).toBe(true);
    }
    expect(new Set(uniones.map((u) => `${u.alumno}|${u.grupo}|${u.fecha}`)).size).toBe(uniones.length);
  });
});

describe('los cobros', () => {
  const c = cuando(NOV);
  const plan = generaCobros({ c, alumnos, tarifa: TARIFA });
  const cobros = plan.eventos.filter((e) => e.tipo === 'cobro');

  it('la cuota sale de los grupos, y inglés sin precio es «sin cuota»', () => {
    const cuota = (clave: string) => plan.cuotas.get(clave);
    expect(cuota('a00')).toBe(150); // teoría 100 + físicas 50
    expect(cuota('a06')).toBe(100); // solo teoría
    expect(cuota('a17')).toBe(50); // solo físicas
    expect(cuota('a28')).toBe(75); // cuota propia
    expect(cuota('a29')).toBe(90);
    const sinCuota = alumnos.filter((a) => plan.cuotas.get(a.clave) === null);
    expect(sinCuota).toHaveLength(3);
    expect(sinCuota.every((a) => a.ingles)).toBe(true);
    // Los exentos no tienen filas; los pendientes tampoco.
    for (const a of alumnos.filter((x) => x.exento || x.acceso === 'pending')) expect(plan.meses.some((m) => m.alumno === a.clave)).toBe(false);
    // Una fila por alumno y mes.
    expect(new Set(plan.meses.map((m) => `${m.alumno}|${m.periodo}`)).size).toBe(plan.meses.length);
  });

  it('casi todos al día, cuatro deben meses anteriores, tres pagos a medias y un cobro anulado', () => {
    expect([...plan.deudores]).toEqual([...DEUDORES_DEMO]);
    const pagado = (clave: string, periodo: string) => cobros.filter((e) => e.alumno === clave && e.periodo === periodo).reduce((s, e) => s + e.importe, 0);
    const debido = (clave: string, periodo: string) => plan.meses.find((m) => m.alumno === clave && m.periodo === periodo)!.debido!;
    const anteriores = [-5, -4, -3, -2, -1].map((n) => sumaMeses(c.periodo, n));
    let debenMes = 0, aMedias = 0, alDia = 0;
    for (const m of plan.meses) {
      if (m.periodo === c.periodo || m.debido === null) continue;
      const p = pagado(m.alumno, m.periodo), d = debido(m.alumno, m.periodo);
      if (p === 0 && d > 0) debenMes++;
      else if (p < d - 0.005) aMedias++;
      else alDia++;
    }
    expect(alDia).toBeGreaterThan(debenMes * 15);
    expect(aMedias).toBe(2); // los dos del mes pasado; el tercero es el del mes en curso
    const deudores = new Set(plan.meses.filter((m) => m.periodo !== c.periodo && m.debido && pagado(m.alumno, m.periodo) === 0).map((m) => m.alumno));
    expect([...deudores].sort()).toEqual([...DEUDORES_DEMO]);
    expect(deudores.size).toBe(4);
    // Los deudores deben meses ANTERIORES.
    for (const d of deudores) expect(anteriores.some((p) => plan.meses.some((m) => m.alumno === d && m.periodo === p) && pagado(d, p) === 0)).toBe(true);
    // El pago a medias del mes en curso.
    const actualAMedias = plan.meses.filter((m) => m.periodo === c.periodo && m.debido && pagado(m.alumno, m.periodo) > 0 && pagado(m.alumno, m.periodo) < m.debido);
    expect(actualAMedias).toHaveLength(1);
    // Uno anulado y vuelto a cobrar.
    const anulas = plan.eventos.filter((e) => e.tipo === 'anula');
    expect(anulas).toHaveLength(1);
    const a = anulas[0];
    const suyos = plan.eventos.filter((e) => e.alumno === a.alumno && e.periodo === a.periodo);
    expect(suyos.map((e) => e.tipo)).toEqual(['cobro', 'anula', 'cobro']);
    expect(suyos[0].fecha < suyos[1].fecha && suyos[1].fecha < suyos[2].fecha).toBe(true);
  });

  it('el mes en curso, más o menos al 60 % cobrado', () => {
    const { previsto, cobrado } = plan.resumen.actual;
    expect(cobrado / previsto).toBeGreaterThan(0.55);
    expect(cobrado / previsto).toBeLessThan(0.68);
    const delMes = cobros.filter((e) => e.periodo === c.periodo).reduce((s, e) => s + e.importe, 0);
    expect(delMes).toBeCloseTo(cobrado, 2);
  });

  it('sobre todo efectivo, algo de bizum y transferencia; en orden de fecha', () => {
    const n = (m: string) => cobros.filter((e) => e.metodo === m).length;
    expect(n('efectivo') / cobros.length).toBeGreaterThan(0.6);
    expect(n('bizum')).toBeGreaterThan(5);
    expect(n('transferencia')).toBeGreaterThan(2);
    const fechas = plan.eventos.map((e) => e.fecha);
    expect(fechas).toEqual([...fechas].sort());
    expect(cobros.every((e) => e.importe > 0 && e.importe < 10000)).toBe(true);
  });

  it('a un alumno sin cuota no se le cobra, y nadie cobra antes de estar dado de alta', () => {
    for (const e of cobros) {
      expect(plan.cuotas.get(e.alumno)).not.toBeNull();
      expect(plan.meses.some((m) => m.alumno === e.alumno && m.periodo === e.periodo)).toBe(true);
    }
  });
});

describe('lo que NO hace', () => {
  it('no usa Gemini, ni la hora del servidor, ni azar sin semilla, ni crea profesores', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['app/lib/demo.ts', 'app/lib/demo-motor.ts']) {
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now\(|new Date\(\)|gemini|genAI|supabase-js|server-only/i);
      expect(src, f).not.toMatch(/from\s+['"]\.\.?\/actions/);
    }
    const motor = readFileSync('app/lib/demo-motor.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(motor).not.toMatch(/inserta\(\s*['"]academy_staff['"]/);
    expect(motor).not.toMatch(/inserta\(\s*['"](question_bank|question_reports)['"]/);
  });
});
