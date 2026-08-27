import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Una fila de `test_results` por respuesta.
 *
 * En modo entrenamiento se insertaba dos veces por cada fallo etiquetado: una
 * al responder y otra al elegir la taxonomia del error. Cada fallo contaba
 * doble, asi que el porcentaje de acierto quedaba sesgado a la baja de forma
 * permanente y las estadisticas del alumno mentian.
 */

// Normalizamos CRLF: en Windows los cortes por salto de linea de mas abajo
// no encajarian con lo que hay en disco.
const read = (rel: string) =>
  readFileSync(join(__dirname, '..', rel), 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const exams = stripComments(read('app/actions/exams.ts'));
const activeTest = stripComments(read('app/components/student/modules/exams/ActiveTest.tsx'));

const fn = (src: string, name: string) => {
  const start = src.indexOf(name);
  expect(start, `no se encuentra ${name}`).toBeGreaterThan(-1);
  return src.slice(start, src.indexOf('\n  };', start) + 5 || undefined);
};

describe('el servidor permite actualizar en vez de reinsertar', () => {
  it('saveTestResult devuelve el id de la fila creada', () => {
    // Sin el id no hay forma de actualizar despues: era lo que forzaba el
    // segundo insert.
    expect(exams).toContain('Promise<{ success: boolean; id: string | null }>');
    expect(exams).toContain(".select('id')");
  });

  it('existe una accion que solo anade la taxonomia', () => {
    expect(exams).toContain('export async function setResultErrorType');
  });

  it('esa accion hace UPDATE, no INSERT', () => {
    const body = exams.slice(exams.indexOf('export async function setResultErrorType'));
    expect(body).toMatch(/\.update\(\{\s*error_type/);
    expect(body.slice(0, body.indexOf('}\n\n'))).not.toContain('.insert(');
  });

  it('solo toca error_type, no las metricas ya guardadas', () => {
    // Reescribir tiempo o cambios aqui los sustituiria por los de la pantalla
    // de diagnostico, que no son los de la respuesta.
    const body = exams.slice(exams.indexOf('export async function setResultErrorType'));
    const update = body.slice(body.indexOf('.update('), body.indexOf('.eq('));
    expect(update).not.toContain('response_time_ms');
    expect(update).not.toContain('option_changes');
  });

  it('no se puede etiquetar el resultado de otro usuario', () => {
    const body = exams.slice(exams.indexOf('export async function setResultErrorType'));
    expect(body).toMatch(/\.eq\('user_id', auth\.user\.id\)/);
  });
});

describe('el cliente no vuelve a insertar dos veces', () => {
  const handleErrorTag = fn(activeTest, 'const handleErrorTag');

  it('etiquetar un fallo actualiza la fila existente', () => {
    expect(handleErrorTag).toContain('setResultErrorType(resultId, type)');
  });

  it('solo inserta si el guardado de la respuesta habia fallado', () => {
    // El `saveTestResult` que queda en esta funcion vive en la rama en la que
    // NO hay id, o sea cuando no existe fila que actualizar.
    const elseBranch = handleErrorTag.slice(handleErrorTag.indexOf('} else {'));
    expect(elseBranch).toContain('saveTestResult(');

    const ifBranch = handleErrorTag.slice(
      handleErrorTag.indexOf('if (resultId)'),
      handleErrorTag.indexOf('} else {')
    );
    expect(ifBranch).not.toContain('saveTestResult(');
  });

  it('espera al guardado en vuelo antes de decidir', () => {
    // Los botones de diagnostico aparecen mientras el insert viaja: sin esperar,
    // un clic rapido leeria el id a null y volveria a insertar.
    expect(handleErrorTag).toContain('await savePromiseRef.current');
    expect(handleErrorTag.indexOf('await savePromiseRef.current')).toBeLessThan(
      handleErrorTag.indexOf('if (resultId)')
    );
  });

  it('el id se reinicia al cambiar de pregunta', () => {
    // Si sobreviviera, la respuesta de la pregunta siguiente sobreescribiria
    // la taxonomia de la anterior.
    //
    // Vivia en un efecto sobre [currentIndex]; desde que se puede volver atras
    // lo hace `irA`, que es quien sabe que pregunta se deja y cual se abre. Lo
    // que vigila esta guarda no es DONDE esta, sino que sigue estando: se busca
    // en la funcion que mueve de pregunta.
    const inicio = activeTest.indexOf('const irA = useCallback(');
    expect(inicio, 'ActiveTest ya no tiene irA: revisa donde se reinicia el id').toBeGreaterThan(-1);

    const irA = activeTest.slice(inicio, activeTest.indexOf('}, [', inicio));
    expect(irA).toContain('resultIdRef.current = null');
    expect(irA).toContain('savePromiseRef.current = null');
  });

  it('ya no queda el PENDIENTE de esta fase', () => {
    expect(activeTest).not.toContain('PENDIENTE (fase 2.4)');
  });
});
