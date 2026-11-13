import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validaExamenPsico, validaAplicacion, minutosPorDefecto, tituloAutomatico, parseaRespuestasPsico, resumenDeClase, MAX_TOTAL_CLASE, MAX_MINUTOS_CLASE,
} from '../app/lib/psico-clase';
import { EJERCICIOS_PSICO, TIPOS_PSICO } from '../app/lib/psico';

/** Regla 127 · psicotécnicos en clase. */

const quita = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const lee = (rel: string) => quita(readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n'));
const G1 = '11111111-1111-1111-1111-111111111111';

describe('validaExamenPsico (preparar y guardar)', () => {
  const base = { titulo: '', ejercicio: null, tipos: ['series', 'cubos'], total: 20, minutos: '', hoy: '2026-11-17' };

  it('acepta un examen libre y pone nombre y minutos si no se dan', () => {
    const r = validaExamenPsico(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.tipos).toEqual(['series', 'cubos']);
    expect(r.valor.total).toBe(20);
    expect(r.valor.minutos).toBe(minutosPorDefecto(20));
    expect(r.valor.titulo).toMatch(/^Psicotécnico · Series numéricas y Cubos contados · 20 preguntas · /);
  });

  it('un ejercicio del examen lleva sus tipos, preguntas y minutos, aunque el navegador mande otros', () => {
    for (const n of [1, 2, 3] as const) {
      const r = validaExamenPsico({ ...base, ejercicio: n, tipos: ['series'], total: 5, minutos: 3 });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.valor.total).toBe(EJERCICIOS_PSICO[n].total);
      expect(r.valor.minutos).toBe(EJERCICIOS_PSICO[n].minutos);
      expect(r.valor.tipos).toEqual(EJERCICIOS_PSICO[n].tipos);
      expect(r.valor.titulo).toContain(EJERCICIOS_PSICO[n].nombre);
    }
  });

  it('exige al menos un tipo válido y descarta los inventados', () => {
    expect(validaExamenPsico({ ...base, tipos: [] })).toMatchObject({ ok: false });
    expect(validaExamenPsico({ ...base, tipos: ['inventado'] })).toMatchObject({ ok: false });
    const r = validaExamenPsico({ ...base, tipos: ['inventado', 'series'] });
    expect(r.ok && r.valor.tipos).toEqual(['series']);
    expect(validaExamenPsico({ ...base, tipos: 'series' })).toMatchObject({ ok: false });
  });

  it('el total y los minutos tienen tope', () => {
    for (const total of [0, -1, 1.5, MAX_TOTAL_CLASE + 1, NaN, 'abc']) expect(validaExamenPsico({ ...base, total })).toMatchObject({ ok: false });
    expect(validaExamenPsico({ ...base, total: MAX_TOTAL_CLASE })).toMatchObject({ ok: true });
    for (const minutos of [0, -5, 2.5, MAX_MINUTOS_CLASE + 1]) expect(validaExamenPsico({ ...base, minutos })).toMatchObject({ ok: false });
    expect(validaExamenPsico({ ...base, minutos: MAX_MINUTOS_CLASE })).toMatchObject({ ok: true });
  });

  it('el nombre propio se limpia de controles y se corta (regla 71)', () => {
    const r = validaExamenPsico({ ...base, titulo: `  Hola\u0000   mundo ${'x'.repeat(200)}` });
    expect(r.ok && r.valor.titulo).toMatch(/^Hola mundo x+$/);
    expect(r.ok && r.valor.titulo.length).toBe(80);
    expect(r.ok && r.valor.titulo).not.toContain('\u0000');
  });

  it('todos los tipos se dicen «todos los tipos» en el nombre', () => {
    expect(tituloAutomatico([...TIPOS_PSICO], 40, '2026-11-17', null)).toContain('todos los tipos');
    expect(tituloAutomatico(['series', 'cubos', 'giros'], 40, '2026-11-17', null)).toContain('3 tipos');
  });

  it('los minutos por defecto: los de la tabla si el tamaño es de los de siempre, y 33 s por pregunta si no', () => {
    expect(minutosPorDefecto(15)).toBe(8); expect(minutosPorDefecto(40)).toBe(20);
    expect(minutosPorDefecto(50)).toBe(28);
    expect(minutosPorDefecto(100)).toBeLessThanOrEqual(MAX_MINUTOS_CLASE);
    expect(minutosPorDefecto(1)).toBeGreaterThanOrEqual(1);
  });
});

describe('validaAplicacion (ponerlo a un turno)', () => {
  const base = { etiqueta: '', fecha: '2026-11-17', cierre: '', classIds: [] };
  it('acepta el día y el plazo, y sin nombre propio sale null (el servidor pone el del examen)', () => {
    const r = validaAplicacion(base);
    expect(r.ok && r.valor).toEqual({ etiqueta: null, fecha: '2026-11-17', cierre: null, classIds: [] });
  });
  it('las fechas se comprueban: el cierre no puede ser anterior al día, y el 31 de febrero no existe', () => {
    expect(validaAplicacion({ ...base, fecha: 'mañana' })).toMatchObject({ ok: false });
    expect(validaAplicacion({ ...base, fecha: '2026-02-31' })).toMatchObject({ ok: false });
    expect(validaAplicacion({ ...base, cierre: '2026-11-10' })).toMatchObject({ ok: false });
    expect(validaAplicacion({ ...base, cierre: '2026-11-24' })).toMatchObject({ ok: true });
  });
  it('los grupos: solo ids con forma de uuid y sin repetir', () => {
    const r = validaAplicacion({ ...base, classIds: [G1, G1, 'no-es-un-id', 7] });
    expect(r.ok && r.valor.classIds).toEqual([G1]);
  });
  it('el nombre propio se limpia y se corta', () => {
    const r = validaAplicacion({ ...base, etiqueta: ` Turno\u0000  de   mañana ${'y'.repeat(200)}` });
    expect(r.ok && r.valor.etiqueta).toMatch(/^Turno de mañana y+$/);
    expect(r.ok && (r.valor.etiqueta ?? '').length).toBe(80);
  });
});

describe('parseaRespuestasPsico (la hoja en papel)', () => {
  const cuatro = Array(6).fill(4);
  it('acepta letras de seguido, con guiones para los blancos, y tolera espacios y mayúsculas', () => {
    expect(parseaRespuestasPsico('abcd-a', cuatro)).toEqual({ ok: true, respuestas: [0, 1, 2, 3, -1, 0] });
    expect(parseaRespuestasPsico(' A B, C D - A ', cuatro)).toEqual({ ok: true, respuestas: [0, 1, 2, 3, -1, 0] });
  });
  it('si no salen EXACTAMENTE las que son, no se adivina nada', () => {
    const corta = parseaRespuestasPsico('abcd-', cuatro);
    expect(corta.ok).toBe(false);
    expect(!corta.ok && corta.error).toMatch(/5 respuestas y el examen tiene 6/);
    expect(parseaRespuestasPsico('abcd-aa', cuatro).ok).toBe(false);
    expect(parseaRespuestasPsico('', cuatro).ok).toBe(false);
  });
  it('una letra que la pregunta no tiene se rechaza, diciendo cuál', () => {
    const r = parseaRespuestasPsico('abcddd', [4, 4, 4, 4, 3, 4]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/pregunta 5 solo tiene 3 opciones/);
    expect(parseaRespuestasPsico('abcdbd', [4, 4, 4, 4, 3, 4]).ok).toBe(true);
  });
  it('un número u otro símbolo no se cuela como respuesta', () => {
    expect(parseaRespuestasPsico('abc1dx', cuatro).ok).toBe(false);
  });
});

describe('resumenDeClase', () => {
  const f = (userId: string, entregado: boolean, a: number, fa: number, porTipo: Record<string, { a: number; t: number; f?: number }>) =>
    ({ userId, entregado, version: 2, total: 10, aciertos: a, fallos: fa, blancos: 10 - a - fa, porTipo: porTipo as never });
  it('sin entregas no hay nota media (null, no 0) y sí los participantes', () => {
    expect(resumenDeClase([], 12)).toEqual({ participantes: 12, entregados: 0, notaMedia: null, porTipo: [] });
    expect(resumenDeClase([f('a', false, 0, 0, {})], 3).entregados).toBe(0);
  });
  it('suma por tipo (del peor al mejor) y no cuenta lo no entregado', () => {
    const r = resumenDeClase([
      f('a', true, 6, 2, { series: { a: 4, t: 5, f: 1 }, cubos: { a: 2, t: 5, f: 1 } }),
      f('b', true, 3, 4, { series: { a: 3, t: 5, f: 2 }, cubos: { a: 0, t: 5, f: 2 } }),
      f('c', false, 9, 0, { series: { a: 9, t: 10, f: 0 } }),
    ], 3);
    expect(r.entregados).toBe(2);
    expect(r.porTipo.map((t) => t.tipo)).toEqual(['cubos', 'series']);
    expect(r.porTipo[0]).toEqual({ tipo: 'cubos', acierto: 0.2, preguntas: 10 });
    expect(r.porTipo[1]).toEqual({ tipo: 'series', acierto: 0.7, preguntas: 10 });
    expect(r.notaMedia).not.toBeNull();
  });
});

describe('las acciones de psicotécnicos en clase', () => {
  const a = lee('app/actions/psico-clase.ts');
  const cuerpo = (n: string) => { const i = a.indexOf(`export async function ${n}`); expect(i, n).toBeGreaterThan(-1); const s = a.indexOf('\nexport async function', i + 10); return a.slice(i, s === -1 ? undefined : s); };
  const admin = ['getPsicoGuardados', 'guardaPsicoExamen', 'borraPsicoExamen', 'getHojaPsicoExamen', 'aplicaPsicoExamen', 'getPsicoClases', 'getDetallePsicoClase', 'borraPsicoClase'];
  const alumno = ['getMisPsicoClase', 'empiezaPsicoClase', 'entregaPsicoClase', 'getRevisionPsicoClase'];

  it('las de la academia piden admin y se acotan por su academia dentro de la consulta (reglas 65 y 75)', () => {
    for (const n of admin) {
      const c = cuerpo(n);
      expect(c, n).toContain('requireAdmin()');
      expect(c, n).not.toContain('requireUser()');
      // Una lectura se acota con `.eq`; una escritura, con el valor que se inserta.
      expect(c, n).toMatch(/\.eq\('organization_id', org\)|organization_id: org/);
    }
  });
  it('las del alumno piden usuario y módulo, y su identidad sale de la sesión (regla 1)', () => {
    for (const n of alumno) {
      const c = cuerpo(n);
      expect(c, n).toContain('requireUser()');
      expect(c, n).toContain("requireModule('psico'");
      expect(c, n).not.toMatch(/\.eq\('user_id', (d|input)\./);
    }
    expect(a).not.toMatch(/user_id: (d|input)\./);
  });
  it('un alumno solo toca exámenes de SU turno', () => {
    const ac = a.slice(a.indexOf('async function acotado'), a.indexOf('export async function getMisPsicoClase'));
    expect(ac).toContain('esParticipante(');
    expect(ac).toContain('misGrupos(org, userId)');
    for (const n of ['empiezaPsicoClase', 'entregaPsicoClase', 'getRevisionPsicoClase']) expect(cuerpo(n), n).toContain('acotado(');
  });
  it('los grupos de un turno tienen que ser de la academia, y el examen también', () => {
    const c = cuerpo('aplicaPsicoExamen');
    expect(c).toContain(".from('class_groups').select('id').eq('organization_id', org).in('id', a.classIds)");
    expect(c).toContain(".from('psico_examenes').select('id, title').eq('organization_id', org).eq('id', d.examenId)");
    expect(c).toContain('validaAplicacion(');
  });
  it('al guardar un examen la semilla la elige el servidor', () => {
    const c = cuerpo('guardaPsicoExamen');
    expect(c).toContain('validaExamenPsico(');
    expect(c).toContain('randomInt(');
    expect(c).not.toMatch(/seed: d\./);
  });
  it('el examen de una aplicación se busca siempre dentro de la academia', () => {
    const c = a.slice(a.indexOf('async function conExamen'), a.indexOf('/** Las preguntas de un examen de clase'));
    expect(c).toContain(".from('psico_examenes').select(COLS_EXAMEN).eq('organization_id', org)");
  });
  it('la solución solo se ve después de entregar, y las preguntas viajan sin respuesta', () => {
    expect(cuerpo('getRevisionPsicoClase')).toContain('if (!r?.finished_at)');
    expect(cuerpo('empiezaPsicoClase')).toContain('preguntas.map(aPublica)');
    expect(cuerpo('getMisPsicoClase')).not.toMatch(/correcta|explicacion/);
  });
  it('el reloj es del servidor: se guarda al empezar y se mira el plazo', () => {
    const c = cuerpo('empiezaPsicoClase');
    expect(c).toContain("from('psico_clase_resultados').insert(");
    expect(c).toContain('sat_on');
    expect(c).toContain('closes_on');
    expect(c).toContain('quedaMs');
  });
  it('se entrega una sola vez y se corrige aquí con la semilla', () => {
    const c = cuerpo('entregaPsicoClase');
    expect(c).toContain(".is('finished_at', null)");
    expect(c).toContain('corrigeSesion(');
    expect(c).toContain('preguntasDe(');
    expect(c).toContain("via === 'app' && !previo");
  });
  it('el navegador nunca recibe el mensaje de la base de datos (regla 108)', () => {
    expect(a).not.toMatch(/error\.message/);
    expect(a).toMatch(/fallo\('guardaPsicoExamen'/);
    expect(a).toMatch(/fallo\('aplicaPsicoExamen'/);
  });
  it('el guion SQL crea las dos tablas con RLS y un resultado por alumno y examen', () => {
    const sql = readFileSync(join(__dirname, '..', 'docs/sql/psico-clase.sql'), 'utf-8');
    expect(sql).toContain('alter table public.psico_examenes enable row level security');
    expect(sql).toContain('alter table public.psico_clase enable row level security');
    expect(sql).toContain('alter table public.psico_clase_resultados enable row level security');
    expect(sql).toContain('unique (psico_clase_id, user_id)');
    expect(sql).not.toMatch(/create policy/i);
  });
});

describe('las pantallas', () => {
  it('«Exámenes en papel» elige primero teoría o psicotécnicos, y los dos siguen Preparar → Guardados → En clase', () => {
    const s = lee('app/components/Admin/components/AdminExamenes.tsx');
    expect(s).toContain("cambiaTipo('psico')");
    for (const t of ['<PrepararPsico ', '<GuardadosPsico ', '<PsicoClase ']) expect(s).toContain(t);
    for (const t of ['<Preparar ', '<Guardados ', '<EnClase ']) expect(s).toContain(t);
  });
  it('al preparar se puede filtrar por tipo (los 23 chips) y elegir un ejercicio, y se guarda', () => {
    const s = lee('app/components/Admin/components/examenes/PrepararPsico.tsx');
    expect(s).toContain('TIPOS_PSICO.map((t) => <FiltroChip');
    expect(s).toContain('EJERCICIOS_PSICO[n]');
    expect(s).toContain('guardaPsicoExamen(');
  });
  it('desde «Guardados» se pone a un turno, se imprime y se borra', () => {
    const s = lee('app/components/Admin/components/examenes/GuardadosPsico.tsx');
    for (const t of ['aplicaPsicoExamen(', 'getHojaPsicoExamen(', 'borraPsicoExamen(', 'Ya puesto el']) expect(s).toContain(t);
  });
  it('el alumno puede hacerlo en la pantalla o pasar la hoja, y ver la solución', () => {
    const s = lee('app/components/student/modules/psico/Psicotecnicos.tsx');
    for (const t of ['empiezaPsicoClase(id)', "via: 'hoja'", 'getRevisionPsicoClase(id)', 'Ya lo hice en papel', 'parseaRespuestasPsico(']) expect(s).toContain(t);
  });
  it('el alumno elige entre «Simulacro del examen» y «Entrenar por tipos», y solo ve una a la vez', () => {
    const s = lee('app/components/student/modules/psico/Psicotecnicos.tsx');
    expect(s).toContain('title="Simulacro del examen"');
    expect(s).toContain('title="Entrenar por tipos"');
    expect(s).toContain("modo === 'examen' && (");
    expect(s).toContain("modo === 'libre' && (");
    expect(s).not.toContain('Práctica libre');
  });
  it('la hoja imprimible lleva preguntas, hoja de respuestas y solucionario en páginas distintas', () => {
    const s = lee('app/components/Admin/components/examenes/hojaPsico.tsx');
    expect(s).toContain('Hoja de respuestas');
    expect(s).toContain('Solucionario (solo profesor)');
    expect(s.match(/className="pag"/g)).toHaveLength(2);
  });
});
