import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseaRespuestas, respuestasEnTexto, normalizaRespuesta, normalizaRespuestas, corrigeClase, notaVigente, aNota,
  leeNotaProfesor, estadoEntrega, esParticipante, estadisticasPorPregunta, distribucionNotas, tendenciaDeNotas, mediaNotas,
  BLANCO, type PreguntaGuardada,
} from '../app/lib/examen-clase';
import { construyeInforme, riesgoDeAbandono, type EntradaRiesgo } from '../app/lib/informe-semanal';

/** Regla 118 · exámenes en clase: guardar, aplicar a un turno y llevar la nota. */

const RAIZ = join(__dirname, '..');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (ruta: string) => stripComments(readFileSync(join(RAIZ, ruta), 'utf-8'));

const preguntas = (corr: number[]): PreguntaGuardada[] =>
  corr.map((c, i) => ({ id: `q${i}`, q: `Pregunta ${i + 1}`, o: ['a', 'b', 'c'], c, t: i < 2 ? 'Tema A' : 'Tema B', e: null, r: null, d: 2 }));

describe('las respuestas que escribe el alumno', () => {
  it('«abcb-ac» son siete respuestas, con el guion en blanco', () => {
    expect(parseaRespuestas('abcb-ac', 7)).toEqual({ ok: true, respuestas: [0, 1, 2, 1, BLANCO, 0, 2] });
  });

  it('ignora espacios, comas, saltos de línea y mayúsculas, para poder pegar', () => {
    expect(parseaRespuestas('A b,C\nB ; -', 5)).toEqual({ ok: true, respuestas: [0, 1, 2, 1, BLANCO] });
    expect(parseaRespuestas('a.cx', 4)).toEqual({ ok: true, respuestas: [0, BLANCO, 2, BLANCO] });
  });

  it('si no salen EXACTAMENTE las que son, no adivina: dice cuántas faltan o sobran', () => {
    expect(parseaRespuestas('abc', 5)).toEqual({ ok: false, error: 'Has escrito 3 de 5: te faltan 2.' });
    expect(parseaRespuestas('abcabc', 5)).toEqual({ ok: false, error: 'Has escrito 6 y el examen tiene 5: te sobran 1.' });
  });

  it('una letra que no es una opción se dice, no se toma por blanco', () => {
    const r = parseaRespuestas('abd', 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('«d»');
  });

  it('ida y vuelta', () => {
    const r = [0, 1, BLANCO, 2];
    const t = respuestasEnTexto(r);
    expect(t).toBe('ab-c');
    expect(parseaRespuestas(t, 4)).toEqual({ ok: true, respuestas: r });
  });

  it('lo que llega de fuera que no es 0, 1 o 2 es blanco, no un fallo (regla 24)', () => {
    expect([0, 2, 3, -1, 1.5, '1', null, undefined, NaN].map(normalizaRespuesta)).toEqual([0, 2, -1, -1, -1, -1, -1, -1, -1]);
    expect(normalizaRespuestas([0, 1], 4)).toEqual([0, 1, -1, -1]);
    expect(normalizaRespuestas('basura', 2)).toEqual([-1, -1]);
    expect(normalizaRespuestas([0, 1, 2, 0, 1], 3)).toEqual([0, 1, 2]);
  });
});

describe('la corrección', () => {
  const p = preguntas([0, 1, 2, 0]);

  it('con la fórmula de la convocatoria: cada dos fallos quitan un acierto (regla 22)', () => {
    // 2 aciertos, 1 fallo, 1 blanco: neto 1,5 de 4 → 3,75
    const c = corrigeClase(p, [0, 1, 0, BLANCO]);
    expect(c).toMatchObject({ correct: 2, wrong: 1, blank: 1, net: 1.5, score: 3.75 });
    expect(c.flags).toEqual(['ok', 'ok', 'mal', 'blanco']);
  });

  it('todo bien es un 10; todo en blanco, un 0, y el blanco no resta', () => {
    expect(corrigeClase(p, [0, 1, 2, 0]).score).toBe(10);
    expect(corrigeClase(p, []).score).toBe(0);
    expect(corrigeClase(p, [0, 1, BLANCO, BLANCO]).score).toBe(5);
  });

  it('puntúa sobre las preguntas del examen, no sobre las respuestas que lleguen', () => {
    expect(corrigeClase(p, [0]).total).toBe(4);
    expect(corrigeClase(p, [0, 1, 2, 0, 0, 0, 0]).total).toBe(4);
  });

  it('la nota del profesor manda sobre la calculada', () => {
    expect(notaVigente({ teacher_score: 7.5, score: 3 })).toBe(7.5);
    expect(notaVigente({ teacher_score: null, score: 3 })).toBe(3);
    expect(notaVigente({ teacher_score: 0, score: 9 })).toBe(0); // un 0 puesto a mano es un 0
    expect(notaVigente({})).toBeNull();
  });

  it('«sin nota» no es un cero (regla 16): lo que llega de Postgres como texto', () => {
    expect(aNota('6.50')).toBe(6.5);
    expect(aNota(null)).toBeNull();
    expect(aNota('')).toBeNull();
    expect(aNota('abc')).toBeNull();
    expect(aNota(0)).toBe(0);
  });

  it('la nota que pone el profesor: de 0 a 10, con coma o con punto, o vacía', () => {
    expect(leeNotaProfesor('7,5')).toEqual({ ok: true, nota: 7.5 });
    expect(leeNotaProfesor(' 6.25 ')).toEqual({ ok: true, nota: 6.25 });
    expect(leeNotaProfesor('')).toEqual({ ok: true, nota: null });
    expect(leeNotaProfesor('0')).toEqual({ ok: true, nota: 0 });
    expect(leeNotaProfesor('11').ok).toBe(false);
    expect(leeNotaProfesor('-1').ok).toBe(false);
    expect(leeNotaProfesor('bien').ok).toBe(false);
  });
});

describe('estados y participantes', () => {
  const base = { satOn: '2026-11-17', closesOn: '2026-11-24', hoy: '2026-11-17', absent: false, entregado: false };

  it('antes del examen no hay nada que meter; el día y hasta el plazo, sí', () => {
    expect(estadoEntrega({ ...base, hoy: '2026-11-16' })).toBe('proximo');
    expect(estadoEntrega(base)).toBe('pendiente');
    expect(estadoEntrega({ ...base, hoy: '2026-11-24' })).toBe('pendiente');
    expect(estadoEntrega({ ...base, hoy: '2026-11-25' })).toBe('cerrado');
  });

  it('sin plazo no se cierra nunca', () => {
    expect(estadoEntrega({ ...base, closesOn: null, hoy: '2027-03-01' })).toBe('pendiente');
  });

  it('entregado y ausente mandan sobre las fechas', () => {
    expect(estadoEntrega({ ...base, entregado: true, hoy: '2026-12-31' })).toBe('entregado');
    expect(estadoEntrega({ ...base, absent: true, hoy: '2026-11-10' })).toBe('ausente');
  });

  it('sin grupos, toda la academia; con grupos, solo los suyos', () => {
    expect(esParticipante([], ['g1'])).toBe(true);
    expect(esParticipante([], [])).toBe(true);
    expect(esParticipante(['g1', 'g2'], ['g2', 'g9'])).toBe(true);
    expect(esParticipante(['g1'], ['g2'])).toBe(false);
    expect(esParticipante(['g1'], [])).toBe(false);
  });
});

describe('las estadísticas', () => {
  const p = preguntas([0, 1, 2]);
  const entregas = [[0, 1, 0], [0, 0, 0], [1, 1, BLANCO], [0, 2, 1]];

  it('cuántos acertaron, cuántos en blanco, y qué opción mala engaña', () => {
    const e = estadisticasPorPregunta(p, entregas);
    expect(e[0]).toMatchObject({ n: 1, contestadas: 4, aciertos: 3, blancos: 0, tasaFallo: 0.25, porOpcion: [3, 1, 0] });
    expect(e[2]).toMatchObject({ n: 3, contestadas: 3, aciertos: 0, blancos: 1, tasaFallo: 1, porOpcion: [2, 1, 0] });
  });

  it('sin nadie que haya contestado la tasa es null, no 0 (regla 8)', () => {
    expect(estadisticasPorPregunta(p, [[BLANCO, BLANCO, BLANCO]])[0].tasaFallo).toBeNull();
    expect(estadisticasPorPregunta(p, [])[0].tasaFallo).toBeNull();
  });

  it('las notas por tramos, con el 10 en el último', () => {
    expect(distribucionNotas([0, 1.9, 2, 5.5, 9.99, 10])).toEqual([2, 1, 1, 0, 2]);
  });

  it('la media y la tendencia, sin inventar con pocos datos', () => {
    expect(mediaNotas([4, 6, 5])).toBe(5);
    expect(mediaNotas([])).toBeNull();
    expect(tendenciaDeNotas([5, 5, 5])).toBeNull();
    expect(tendenciaDeNotas([3, 3, 3, 5, 5, 5])).toBe('sube');
    expect(tendenciaDeNotas([6, 6, 6, 4, 4, 4])).toBe('baja');
    expect(tendenciaDeNotas([5, 5, 5, 5.2, 5, 5])).toBe('estable');
  });
});

describe('el informe semanal cuenta los exámenes en clase', () => {
  const base: EntradaRiesgo = {
    diasSinActividad: 1, diasDesdeAlta: 90, contestadas: 200, mediaPrevia: 200, fraccion: 1, semanasBajando: 0,
    acierto: 70, aciertoPrevio: 70, base: 200, basePrevia: 200, faltas14: 0,
  };

  it('no presentarse es de «vigilar» por sí solo', () => {
    const r = riesgoDeAbandono({ ...base, examenAusente: 'Global 1' });
    expect(r.nivel).toBe('medio');
    expect(r.motivos).toEqual(['No se presentó al examen en clase «Global 1»']);
  });

  it('suspender suma, pero solo no es de vigilar', () => {
    const r = riesgoDeAbandono({ ...base, examenSuspenso: { titulo: 'Global 1', nota: 2.5 } });
    expect(r.nivel).toBe('bajo');
    expect(r.motivos[0]).toContain('Sacó un 2,5');
    expect(riesgoDeAbandono({ ...base, diasSinActividad: 9, examenSuspenso: { titulo: 'G', nota: 1 } }).nivel).toBe('medio');
  });

  const alumnos = [
    { id: 'a', email: 'a@x.com', nombre: 'Ana', alta: '2026-06-01T10:00:00Z', faltas14: 0 },
    { id: 'b', email: 'b@x.com', nombre: 'Beto', alta: '2026-06-01T10:00:00Z', faltas14: 0 },
    { id: 'c', email: 'c@x.com', nombre: 'Cris', alta: '2026-06-01T10:00:00Z', faltas14: 0 },
  ];
  const informe = construyeInforme({
    hoy: '2026-11-11', semana: '2026-11-02', alumnos, filas: [],
    examenes: [
      { userId: 'a', titulo: 'Global 1', fecha: '2026-11-03', nota: 6.5, ausente: false },
      { userId: 'b', titulo: 'Global 1', fecha: '2026-11-03', nota: null, ausente: true },
      { userId: 'c', titulo: 'Global 0', fecha: '2026-10-27', nota: 1, ausente: false }, // otra semana
    ],
  });

  it('sale en la fila de cada alumno, solo si fue ESA semana', () => {
    const f = (id: string) => informe.filas.find((x) => x.id === id)!;
    expect(f('a').examen).toEqual({ titulo: 'Global 1', nota: 6.5, ausente: false });
    expect(f('b').examen).toEqual({ titulo: 'Global 1', nota: null, ausente: true });
    expect(f('c').examen).toBeNull();
    expect(f('b').riesgo.motivos.join(' ')).toContain('No se presentó al examen en clase');
  });
});

describe('las acciones (regla 118)', () => {
  const src = lee('app/actions/examenes-clase.ts');
  const cuerpo = (nombre: string) => {
    const desde = src.indexOf(`export async function ${nombre}`);
    const sig = src.indexOf('\nexport async function', desde + 10);
    return src.slice(desde, sig === -1 ? undefined : sig);
  };

  it('las de la academia piden admin y acotan por SU academia (reglas 1, 65)', () => {
    for (const a of ['getExamenesGuardados', 'getExamenGuardado', 'borraExamen', 'aplicaExamen', 'getAplicaciones', 'getAplicacion', 'setResultadoProfesor', 'reiniciaEntrega', 'setCierreAplicacion', 'borraAplicacion']) {
      const c = cuerpo(a);
      expect(c, a).toContain('requireAdmin()');
      expect(c, a).not.toContain('requireUser()');
      expect(c, a).toMatch(/organization_id', org\)/);
    }
  });

  it('las del alumno piden usuario y módulo, con la academia de la sesión (reglas 1 y 109)', () => {
    for (const a of ['getMisExamenesClase', 'entregaExamenClase', 'getRevisionExamenClase']) {
      const c = cuerpo(a);
      expect(c, a).toContain('requireUser()');
      expect(c, a).toContain("requireModule('presencial', auth.user.organizationId)");
      expect(c, a).not.toMatch(/alumnoId|userId/);
    }
  });

  it('ninguna del alumno lee `exam_papers` para devolver las respuestas antes de entregar', () => {
    const c = cuerpo('getMisExamenesClase');
    expect(c).not.toContain("'questions'");
    expect(c).not.toContain('questions');
    // La revisión, solo con lo entregado.
    expect(cuerpo('getRevisionExamenClase')).toContain('!r.submitted_at');
  });

  it('entregar: corrige el servidor, una sola vez y dentro de plazo (regla 110)', () => {
    const c = cuerpo('entregaExamenClase');
    expect(c).toContain('corrigeClase(preguntas, respuestas)');
    expect(c).toContain(".is('submitted_at', null)");
    expect(c).toContain("estado === 'cerrado'");
    expect(c).toContain("estado === 'proximo'");
    expect(c).toContain("estado === 'entregado'");
    // La nota no viene del navegador.
    expect(c).not.toMatch(/d\.(nota|score|puntuacion)/);
  });

  it('la media del turno no devuelve a nadie: solo el promedio, y con tres como mínimo', () => {
    const c = cuerpo('getMisExamenesClase');
    expect(c).toContain('MIN_PARA_MEDIA');
    expect(c).not.toMatch(/user_id\s*:/);
  });

  it('guardar un examen es de la academia y lleva su academia', () => {
    const c = cuerpo('guardaExamen');
    expect(c).toContain('requireAdmin()');
    expect(c).toContain('organization_id: org');
  });

  it('guardar un examen lee las preguntas del banco, no las que mande el navegador (regla 2)', () => {
    const c = cuerpo('guardaExamen');
    expect(c).toContain('filtroBancoPorAcademia(org)');
    expect(c).toContain('.from(\'question_bank\')');
    expect(c).not.toMatch(/d\.(preguntas|questions)/);
  });

  it('la nota del profesor solo toca sus dos campos, y a alguien de esa aplicación', () => {
    const c = cuerpo('setResultadoProfesor');
    expect(c).toContain('participantesDe(org');
    expect(c).toContain('teacher_score');
    expect(c).not.toMatch(/answers|score:\s/);
  });

  it('TODA consulta a las tablas de exámenes lleva la academia dentro (regla 65)', () => {
    const sueltas: string[] = [];
    for (const m of src.matchAll(/\.from\('(exam_papers|exam_sittings|exam_results)'\)/g)) {
      // Hasta el final de la sentencia: la academia tiene que estar en ELLA.
      const resto = src.slice(m.index!);
      const fin = resto.search(/;\s*\n/);
      const sentencia = resto.slice(0, fin === -1 ? 600 : fin);
      if (!/organization_id/.test(sentencia)) sueltas.push(`${m[1]} → ${sentencia.slice(0, 90).replace(/\s+/g, ' ')}`);
    }
    expect(sueltas).toEqual([]);
  });

  it('un fichero de acciones solo exporta funciones async (regla 53)', () => {
    const exportados = [...src.matchAll(/^export (async function|const|type|function|class|let)/gm)].map((m) => m[1]);
    expect(exportados.filter((e) => !['async function', 'type'].includes(e))).toEqual([]);
  });
});

describe('el esquema', () => {
  const sql = readFileSync(join(RAIZ, 'docs/sql/examenes-clase.sql'), 'utf-8');
  it('las tres tablas llevan RLS y ninguna política: solo las toca el servidor (regla 34)', () => {
    for (const t of ['exam_papers', 'exam_sittings', 'exam_results']) expect(sql).toContain(`alter table public.${t}`);
    expect(sql).not.toMatch(/create policy/i);
  });
  it('un alumno no puede tener dos resultados en la misma aplicación', () => {
    expect(sql).toContain('unique (sitting_id, user_id)');
  });
  it('la nota va de 0 a 10', () => {
    expect(sql).toMatch(/teacher_score[^\n]*between 0 and 10/);
    expect(sql).toMatch(/score[^\n]*between 0 and 10/);
  });
});
