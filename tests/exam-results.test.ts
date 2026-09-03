import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  toResultRow,
  buildExamResults,
  countChange,
  EMPTY_METRICS,
  BLANK_INDEX,
  isBlankAnswer,
} from '../app/lib/exam-results';

/**
 * El contrato entre la UI y el servidor para los resultados de test.
 *
 * `ExamManager` construia el payload con `response_time_ms` / `option_changes`
 * y `saveExamResults` leia `r.time` / `r.changes`. El parametro era `any[]`, asi
 * que nadie se entero: las dos dimensiones de "Atenea Mind" se guardaron a 0 en
 * todos los examenes durante meses.
 *
 * Desde la fase 2.5 las filas van a `question_attempts`, que identifica el
 * tema por su TITULO en `topic`. La version anterior mandaba `subject_id` a
 * `test_results`, que no tiene esa columna: no se guardo ni un resultado.
 */

const q = (over: Record<string, unknown> = {}) => ({
  id: 'q-1',
  topic: 'Constitucion',
  userAnswer: 'a',
  correctOptionId: 'a',
  errorType: null,
  timeMs: 12_000,
  changes: 1,
  ...over,
});

describe('toResultRow', () => {
  it('traduce camelCase a las columnas de la tabla', () => {
    expect(
      toResultRow({
        questionId: 'q-1',
        topic: 'Derecho Penal',
        isCorrect: true,
        responseTimeMs: 8_400,
        optionChanges: 2,
        errorType: 'trampa',
      })
    ).toEqual({
      question_id: 'q-1',
      topic: 'Derecho Penal',
      is_correct: true,
      response_time_ms: 8_400,
      option_changes: 2,
      error_type: 'trampa',
      selected_index: null,
    });
  });

  it('rellena las metricas ausentes con 0, no con undefined', () => {
    const row = toResultRow({ questionId: null, topic: 'Tema suelto', isCorrect: false });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
    expect(row.error_type).toBeNull();
  });

  it('nunca deja pasar NaN ni Infinity a la base de datos', () => {
    // `Date.now() - undefined` da NaN. Un NaN en una columna numerica es un
    // error de insercion que se descubriria en produccion.
    const row = toResultRow({
      questionId: 'q',
      topic: 'Constitucion',
      isCorrect: true,
      responseTimeMs: NaN,
      optionChanges: Infinity,
    });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
  });

  it('descarta tiempos negativos', () => {
    const row = toResultRow({ questionId: 'q', topic: 'Constitucion', isCorrect: true, responseTimeMs: -500 });
    expect(row.response_time_ms).toBe(0);
  });

  it('EMPTY_METRICS produce una fila valida', () => {
    const row = toResultRow({ questionId: null, topic: '', isCorrect: false, ...EMPTY_METRICS });
    expect(row.response_time_ms).toBe(0);
    expect(row.option_changes).toBe(0);
  });
});

describe('buildExamResults', () => {
  it('conserva el tiempo y los cambios de cada pregunta', () => {
    // Este es EL test que faltaba: el payload salia con unos nombres y el
    // servidor leia otros, y ambos lados compilaban tan tranquilos.
    const [row] = buildExamResults([q({ timeMs: 9_000, changes: 3 })]);
    expect(row.responseTimeMs).toBe(9_000);
    expect(row.optionChanges).toBe(3);
  });

  it('deriva el acierto comparando la respuesta con la correcta', () => {
    expect(buildExamResults([q({ userAnswer: 'a', correctOptionId: 'a' })])[0].isCorrect).toBe(true);
    expect(buildExamResults([q({ userAnswer: 'b', correctOptionId: 'a' })])[0].isCorrect).toBe(false);
  });

  it('una pregunta sin contestar no es un acierto, pero tampoco un fallo', () => {
    // El nombre de este test decia "es un fallo" y eso era justo el error:
    // con la penalizacion del BOE un blanco no resta. No es acierto, y se
    // separa del fallo por `selectedIndex` (ver el bloque del blanco).
    for (const sin of [null, undefined]) {
      const [row] = buildExamResults([q({ userAnswer: sin })]);
      expect(row.isCorrect).toBe(false);
      expect(row.selectedIndex).toBe(BLANK_INDEX);
    }
  });

  it('una pregunta sin id llega como null y no como undefined', () => {
    const [row] = buildExamResults([q({ id: null })]);
    expect(row.questionId).toBeNull();
  });

  it('una pregunta sin tema propio hereda el del examen', () => {
    // `topic` es NOT NULL en question_attempts: nunca puede salir null.
    const [row] = buildExamResults([q({ topic: undefined })], 'Extranjeria');
    expect(row.topic).toBe('Extranjeria');
  });

  it('sin tema propio ni del examen queda cadena vacia, nunca null', () => {
    const [row] = buildExamResults([q({ topic: undefined })]);
    expect(row.topic).toBe('');
    expect(toResultRow({ questionId: 'q', topic: '', isCorrect: true }).topic).toBe('');
  });

  it('sin metricas medidas devuelve ceros', () => {
    const [row] = buildExamResults([q({ timeMs: undefined, changes: undefined })]);
    expect(row.responseTimeMs).toBe(0);
    expect(row.optionChanges).toBe(0);
  });

  it('el payload encaja en toResultRow sin adaptaciones', () => {
    // Si alguien cambia el nombre de un campo en un lado, esto deja de compilar
    // o deja de pasar.
    const rows = buildExamResults([q()]).map(toResultRow);
    expect(rows[0]).toMatchObject({ question_id: 'q-1', response_time_ms: 12_000, option_changes: 1 });
  });
});

describe('countChange', () => {
  it('la primera respuesta no es un cambio', () => {
    // Antes se sumaba en cada pulsacion: contestar una sola vez ya marcaba 1.
    expect(countChange(null, 'a')).toBe(false);
    expect(countChange(undefined, 'a')).toBe(false);
  });

  it('volver a pulsar la misma opcion tampoco', () => {
    expect(countChange('a', 'a')).toBe(false);
  });

  it('pasar a una opcion distinta si', () => {
    expect(countChange('a', 'b')).toBe(true);
  });
});

describe('el codigo usa el contrato', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const exams = stripComments(read('app/actions/exams.ts'));
  const manager = stripComments(read('app/components/student/modules/exams/ExamManager.tsx'));
  const activeTest = stripComments(read('app/components/student/modules/exams/ActiveTest.tsx'));

  it('saveExamResults ya no recibe any[]', () => {
    expect(exams).toContain('saveExamResults(results: ExamResultPayload[])');
  });

  it('el servidor no vuelve a inventarse nombres de campo', () => {
    // Los `r.time` / `r.changes` que nunca existieron.
    expect(exams).not.toMatch(/r\.(time|changes)\b/);
  });

  it('el payload del examen se construye con el helper compartido', () => {
    expect(manager).toContain('buildExamResults(');
    expect(manager).not.toMatch(/as any\)\.timeMs/);
  });

  it('ActiveTest no lee el contador de cambios desde el estado', () => {
    // `setOptionChanges(prev => prev + 1)` seguido de leer `optionChanges` en la
    // misma funcion devolvia el valor anterior: siempre 0 en entrenamiento.
    //
    // El contador paso de un ref suelto (`optionChangesRef`) a un mapa por
    // pregunta (`metricasRef`) al poder volver atras, pero la regla es la
    // misma: se escribe y se lee dentro del mismo manejador, asi que NO puede
    // ser estado.
    expect(activeTest).not.toContain('setOptionChanges');
    expect(activeTest).toContain('metricasRef.current');
    expect(activeTest).toMatch(/const metricasRef = useRef</);
  });

  it('las metricas se acumulan por pregunta, no por visita', () => {
    // Con navegacion libre una pregunta se visita varias veces. Si el tiempo se
    // midiera desde la ultima entrada, volver a revisarla al final borraria lo
    // que costo la primera vez.
    expect(activeTest).toContain('tiempo: m.tiempo + (Date.now() - entradaRef.current)');
    // Y el volcado final sale del mapa, para TODAS las preguntas: si se
    // escribiera al pasar de pregunta, la revisada se quedaria con el tiempo de
    // la ultima visita.
    const finish = activeTest.slice(activeTest.indexOf('const handleFinish = useCallback('));
    expect(finish.slice(0, 800)).toContain('metricasDe(i)');
  });

  it('ActiveTest no muta el estado en su sitio', () => {
    // `const updated = [...arr]; updated[i].campo = x;` copia el array pero no
    // los objetos: mutaba las mismas preguntas que tiene el padre.
    expect(activeTest).not.toMatch(/updated\[currentIndex\]\.\w+\s*=/);
  });

  it('no quedan @ts-ignore en el camino de las metricas', () => {
    expect(activeTest).not.toContain('@ts-ignore');
  });
});

/**
 * P3.4 — UN BLANCO NO ES UN FALLO.
 *
 * El simulacro puntua con la penalizacion del BOE, donde el blanco no resta.
 * Pero al guardar caia en `is_correct: false`, igual que un error: el mismo
 * examen daba dos verdades, y el porcentaje de acierto castigaba NO arriesgar.
 */
describe('el blanco deliberado', () => {
  const enBlanco = {
    id: 'q-1',
    userAnswer: null,
    correctOptionId: 'b',
    options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  };

  it('se guarda con el centinela, no como una respuesta cualquiera', () => {
    const [row] = buildExamResults([enBlanco]);
    expect(row.selectedIndex).toBe(BLANK_INDEX);
    expect(isBlankAnswer(row.selectedIndex)).toBe(true);
  });

  it('no cuenta como acierto', () => {
    const [row] = buildExamResults([enBlanco]);
    expect(row.isCorrect).toBe(false);
  });

  it('una respuesta guarda el INDICE de la opcion que se marco', () => {
    const [row] = buildExamResults([{ ...enBlanco, userAnswer: 'c' }]);
    expect(row.selectedIndex).toBe(2);
    expect(isBlankAnswer(row.selectedIndex)).toBe(false);
  });

  it('marcar la primera opcion da 0, no se confunde con "sin dato"', () => {
    // `0` es falsy. Si en algun punto se escribiera `indice || null`, la
    // opcion A se guardaria como desconocida en todos los examenes.
    const [row] = buildExamResults([{ ...enBlanco, userAnswer: 'a' }]);
    expect(row.selectedIndex).toBe(0);
  });

  it('sin las opciones el indice queda en null, no en 0', () => {
    // "No se sabe" es preferible a inventarse que marco la A.
    const [row] = buildExamResults([{ id: 'q', userAnswer: 'a', correctOptionId: 'a' }]);
    expect(row.selectedIndex).toBeNull();
    expect(row.isCorrect).toBe(true);
  });

  it('un blanco NUNCA se guarda como correcto, aunque el cliente lo diga', () => {
    // `saveExamResults` es un endpoint publico y `isCorrect` viaja desde el
    // navegador: sin esta guarda, un cliente manipulado se subiria la nota.
    const row = toResultRow({
      questionId: 'q',
      topic: 'Constitucion',
      isCorrect: true,
      selectedIndex: BLANK_INDEX,
    });
    expect(row.is_correct).toBe(false);
  });

  it('un blanco no arrastra diagnostico de error: no hubo error que clasificar', () => {
    const row = toResultRow({
      questionId: 'q',
      topic: 'Constitucion',
      isCorrect: false,
      selectedIndex: BLANK_INDEX,
      errorType: 'olvido',
    });
    expect(row.error_type).toBeNull();
  });

  it('un indice imposible cae a null en vez de guardarse', () => {
    for (const malo of [-7, 1.5, NaN, undefined, null]) {
      const row = toResultRow({
        questionId: 'q',
        topic: 'T',
        isCorrect: false,
        selectedIndex: malo as number | null | undefined,
      });
      expect(row.selected_index).toBeNull();
    }
  });

  it('null NO es un blanco: es una fila anterior a P3.4', () => {
    // La lectura tentadora era "null = en blanco". No vale: hasta P3.4 la
    // columna estaba vacia tambien en las contestadas, asi que cada fallo del
    // historico se habria leido como un blanco.
    expect(isBlankAnswer(null)).toBe(false);
    expect(isBlankAnswer(undefined)).toBe(false);
    expect(isBlankAnswer(0)).toBe(false);
  });
});

/**
 * P3.5 y P3.6 — GUARDAS DE LA PANTALLA DEL SIMULACRO.
 *
 * Estaticas: leen el fuente y fallan si vuelve un patron peligroso. No
 * necesitan Supabase ni renderizar React.
 */
describe('el reloj y la revision del simulacro', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf-8');
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const activeTest = stripComments(read('app/components/student/modules/exams/ActiveTest.tsx'));
  const manager = stripComments(read('app/components/student/modules/exams/ExamManager.tsx'));
  const results = stripComments(read('app/components/student/modules/exams/ExamResults.tsx'));

  it('el reloj se deriva, no se guarda en estado', () => {
    // Guardarlo obligaria a sincronizarlo con `ahora` en un efecto, que es de
    // donde salio la mitad de los fallos de esta pantalla (regla 14).
    expect(activeTest).toContain('examClock(durationSeconds, segundosTest)');
    expect(activeTest).not.toMatch(/useState[^;]*(reloj|remaining|secondsLeft)/i);
  });

  it('la duracion NO esta escrita a mano en el componente', () => {
    // Sale de `CNP_SCORING`, que es donde vive la convocatoria. Un 3000 suelto
    // aqui es un numero que nadie vuelve a encontrar el dia que cambie.
    expect(manager).toContain('examDurationSeconds(');
    expect(activeTest).not.toMatch(/durationSeconds\s*=\s*\d{3,}/);
  });

  it('la entrega automatica esta protegida contra dispararse dos veces', () => {
    // En StrictMode los efectos corren dos veces y el intervalo sigue
    // repintando despues de expirar: sin guarda, `saveExamResults` insertaria
    // las filas repetidas. Es el fallo de la doble insercion de la 2.4 por
    // otra puerta.
    expect(activeTest).toContain('entregadoRef');
    expect(activeTest).toMatch(/entregadoRef\.current\s*=\s*true/);
  });

  it('el simulacro pasa por la revision antes de entregar', () => {
    // Entregar es irreversible y estaba a un clic del boton de avanzar.
    expect(activeTest).toContain("setRevisando('final')");
    expect(activeTest).toContain('volverAlExamen');
  });

  it('el mapa de preguntas se puede abrir en mitad del simulacro', () => {
    // La barra de segmentos de la cabecera se podia pulsar para saltar de
    // pregunta y medía 12px de alto; con 20 preguntas, 18px de ancho cada una.
    // No era un objetivo tactil pequeño, era uno imposible. La cuadricula
    // buena —un boton por pregunta, con su numero— vivia en la pantalla de
    // resumen y solo se llegaba a ella desde la ULTIMA pregunta.
    expect(activeTest).toContain("setRevisando('mapa')");
    // Y los segmentos dejan de fingir que se pueden pulsar.
    expect(activeTest).not.toContain('flex-1 cursor-pointer group/seg');
  });

  it('la nota lleva al repaso de los fallos', () => {
    // La pantalla terminaba en "Nueva operación" y nada mas: quien acababa de
    // fallar cinco preguntas se iba con la nota sin ver ni una. El modulo de
    // repaso existe desde P3 y era invisible justo donde sirve.
    expect(results).toContain('onRepasarFallos');
    // Solo si hay fallos, y solo si la academia no lo ha apagado (P4).
    // El patron es el de la CONDICION DE PINTADO, no el del `variant` de
    // debajo: con un `/wrong > 0 && onRepasarFallos/` a secas, quitar el
    // `wrong > 0` del bloque dejaba el test en verde porque el `variant`
    // seguia teniendolo. Comprobado rompiendolo.
    expect(results).toMatch(/\{wrong > 0 && onRepasarFallos && \(/);
  });

  it('el reloj no corre en entrenamiento', () => {
    expect(manager).toMatch(/settings\.mode === 'exam' \? examDurationSeconds/);
  });
});
