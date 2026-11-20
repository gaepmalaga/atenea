import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leeValores, propuestaVigente, cambiaAlgo, cambiosLegibles, juntaNovedades } from '../app/lib/revision';

/**
 * LA ÚLTIMA PALABRA ES DE LOS TUTORES (regla 138).
 *
 * Que nada cambie una pregunta sin un tutor, que lo que se sirve al alumno
 * pueda limitarse a lo revisado, y que los tutores se enteren de todo.
 */

const raiz = join(__dirname, '..');
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf-8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const cuerpoDe = (src: string, nombre: string) => {
  const i = src.indexOf(`function ${nombre}(`);
  return src.slice(i, src.indexOf('\n}\n', i));
};

describe('las propuestas de cambio (lógica pura)', () => {
  it('solo aceptan campos conocidos y bien formados', () => {
    expect(leeValores({ difficulty_level: 3 })).toEqual({ difficulty_level: 3 });
    expect(leeValores({ question_text: 'Enunciado', legal_reference: 'Art. 1 CE' })).toEqual({ question_text: 'Enunciado', legal_reference: 'Art. 1 CE' });
    expect(leeValores({ status: 'active' })).toBeNull(); // el estado no se propone
    expect(leeValores({ difficulty_level: 7 })).toBeNull();
    expect(leeValores({ correct_index: 3 })).toBeNull();
    expect(leeValores({ options: ['a', 'b'] })).toBeNull();
    expect(leeValores({})).toBeNull();
    expect(leeValores(null)).toBeNull();
  });

  it('una propuesta deja de valer si alguien ha tocado la pregunta entre tanto', () => {
    const antes = { question_text: 'Según el texto proporcionado, ¿qué dice el art. 1?' };
    const despues = { question_text: 'Según el art. 1, ¿qué dice?' };
    expect(propuestaVigente({ question_text: antes.question_text, explanation: 'x' }, antes, despues)).toBe(true);
    expect(propuestaVigente({ question_text: 'Otro enunciado que puso un tutor' }, antes, despues)).toBe(false);
    // Lo que la propuesta no toca puede haber cambiado sin problema.
    expect(propuestaVigente({ question_text: antes.question_text, explanation: 'cambiada' }, { ...antes, explanation: 'vieja' }, despues)).toBe(true);
  });

  it('una propuesta que no cambia nada no es una propuesta', () => {
    expect(cambiaAlgo({ difficulty_level: 2 }, { difficulty_level: 2 })).toBe(false);
    expect(cambiaAlgo({ difficulty_level: 2 }, { difficulty_level: 3 })).toBe(true);
  });

  it('el «antes / después» se lee como lo lee un tutor', () => {
    const c = cambiosLegibles(
      { options: ['Uno', 'Dos', 'Tres'], correct_index: 0, difficulty_level: 1 },
      { correct_index: 2, difficulty_level: 3 },
    );
    expect(c).toEqual([
      { campo: 'correct_index', nombre: 'Respuesta correcta', antes: 'A) Uno', despues: 'C) Tres' },
      { campo: 'difficulty_level', nombre: 'Dificultad', antes: 'Fácil', despues: 'Difícil' },
    ]);
  });

  it('las novedades juntan lo del sistema y las decisiones, y cuentan las repetidas del mismo día', () => {
    const n = juntaNovedades(
      [{ created_at: '2026-11-20T05:41:00Z', tipo: 'vigilancia', titulo: 'Cambios en la ley', detalle: null, autor: null }],
      [
        { created_at: '2026-11-20T10:00:00Z', action: 'review_question', detail: null, actor: 'Ana' },
        { created_at: '2026-11-20T09:59:00Z', action: 'review_question', detail: null, actor: 'Ana' },
        { created_at: '2026-11-20T09:58:00Z', action: 'review_question', detail: null, actor: 'Ana' },
        { created_at: '2026-11-20T09:00:00Z', action: 'approve_questions', detail: { cantidad: 12 }, actor: 'Luis' },
        { created_at: '2026-11-20T08:00:00Z', action: 'set_payment', detail: null, actor: 'Luis' }, // no es de la revisión
      ],
    );
    expect(n.map((x) => x.titulo)).toEqual(['Revisó una pregunta y la dio por buena', 'Publicó 12 preguntas', 'Cambios en la ley']);
    expect(n[0]).toMatchObject({ autor: 'Ana', detalle: '3 veces ese día' });
  });
});

describe('nada cambia una pregunta sin un tutor', () => {
  const moderacion = sinComentarios(leer('app/actions/moderation.ts'));
  const medir = sinComentarios(leer('scripts/operacion/medir-dificultad.mjs'));
  const clasificar = sinComentarios(leer('scripts/operacion/clasificar-dificultad.mjs'));

  it('publicar, editar y el alta manual de un admin dejan la pregunta revisada por esa persona', () => {
    expect(cuerpoDe(moderacion, 'approveQuestions')).toMatch(/update\(\{ status: QUESTION_STATUS\.ACTIVE, \.\.\.revisadaPor\(auth\.user\) \}\)/);
    expect(cuerpoDe(moderacion, 'editaPregunta')).toMatch(/\.\.\.revisadaPor\(user\)/);
    expect(moderacion).toMatch(/upsert\(\{ \.\.\.preparada\.fila, \.\.\.revisadaPor\(auth\.user\) \}/);
    expect(moderacion).toMatch(/filas\.push\(\{ \.\.\.preparada\.fila, \.\.\.revisadaPor\(auth\.user\) \}\)/);
  });

  it('«revisada» es de un admin, sobre lo suyo, y no con un aviso de la ley o un cambio sin decidir', () => {
    const c = cuerpoDe(moderacion, 'marcarRevisada');
    expect(c).toMatch(/requireAdmin\(\)/);
    expect(c).toMatch(/filtroEscrituraBanco\(auth\.user\)/);
    expect(c).toMatch(/in\('report_type', \[TIPO_REPORTE_VIGENCIA, TIPO_REPORTE_REVISION_IA\]\)/);
    expect(c).toMatch(/from\('question_proposals'\)/);
  });

  it('aprobar un cambio comprueba que sigue valiendo, valida y anota el historial ANTES de escribir', () => {
    const c = cuerpoDe(moderacion, 'aprobarPropuesta');
    expect(c).toMatch(/requireAdmin\(\)/);
    const vigente = c.indexOf('propuestaVigente(');
    const valida = c.indexOf('validateGeneratedQuestion(');
    const historial = c.indexOf("from('question_edit_history').insert(");
    const escribe = c.indexOf("from('question_bank').update(");
    expect(vigente).toBeGreaterThan(-1);
    expect(vigente).toBeLessThan(valida);
    expect(valida).toBeLessThan(historial);
    expect(historial).toBeLessThan(escribe);
  });

  it('la medición de dificultad y la IA proponen en las del banco; no escriben su nivel', () => {
    expect(medir).not.toMatch(/difficulty_level: p\.nivel, difficulty_source/);
    expect(medir).toMatch(/proponer\(db,/);
    // El clasificador solo escribe sobre pendientes; en las del banco, propone.
    expect(clasificar).toMatch(/update\(\{ difficulty_level: nivel, difficulty_source: 'estimada' \}\)\.eq\('id', id\)\.eq\('status', 'candidate'\)/);
    expect(clasificar).toMatch(/fila\?\.status === 'active'[\s\S]{0,200}paraProponer\.push/);
  });
});

describe('lo que se sirve al alumno', () => {
  const exams = sinComentarios(leer('app/actions/exams.ts'));
  const evolucion = sinComentarios(leer('app/actions/evolucion.ts'));
  const servir = sinComentarios(leer('app/lib/servir.ts'));

  it('si la academia lo pide, solo preguntas revisadas: en el test, el entrenamiento, el simulacro y el recuento', () => {
    for (const [src, fn] of [[exams, 'bancoLigero'], [exams, 'getQuestionsFromBank'], [evolucion, 'getMiEvolucion']] as const) {
      const c = cuerpoDe(src, fn) || src;
      expect(c, fn).toMatch(/exigeRevision\(/);
      expect(c, fn).toMatch(/\.not\('reviewed_at', 'is', null\)/);
    }
  });

  it('si no se puede leer el ajuste, se cierra: no se sirve lo no revisado por un fallo', () => {
    expect(servir).toMatch(/if \(error\) \{[\s\S]{0,80}return true;/);
  });
});

describe('los tutores se enteran', () => {
  const vista = sinComentarios(leer('app/components/Admin/AdminView.tsx'));
  const vigilante = sinComentarios(leer('scripts/operacion/vigilar-normativa.mjs'));

  it('«Revisión» lleva en el menú el número de lo que espera', () => {
    expect(vista).toMatch(/getPorRevisar\(\)/);
    expect(vista).toMatch(/t\.id === 'moderation' \? \{ \.\.\.t, cuenta: porRevisar \}/);
  });

  it('el vigilante de la ley y las propuestas dejan su línea en «Novedades»', () => {
    expect(vigilante).toMatch(/from\('novedades'\)\.insert\(/);
    expect(sinComentarios(leer('scripts/operacion/propuestas.mjs'))).toMatch(/from\('novedades'\)\.insert\(/);
  });
});
