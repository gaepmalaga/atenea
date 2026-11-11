/**
 * Las 48 Server Actions, sustituidas por datos de prueba.
 *
 * Sirve para USAR la interfaz de verdad —pinchando, respondiendo, navegando—
 * sin Supabase ni Gemini. No es un test automático: es el banco donde se
 * comprueba a mano lo que una captura no enseña (el scroll, el botón Atrás,
 * reanudar un examen, que el chat no se borre al cambiar de pestaña).
 */

import { mapBankRowToQuestion } from '../app/lib/questions';
import { armaCalendario, colorDe, type GrupoCal, type SesionCal } from '../app/lib/calendario';
import { ahoraEnZona, sumaDias as sumaDiasCal, diaSemanaDe } from '../app/lib/asistencia';
import {
  cuotaDeAlumno, resumeCuotasMes, resumeHistoricoCuotas, leeApunte, aplicaCobro, leeImporte, nombreDePack,
  periodoEnZona, sumaMeses, mesesHasta, esPeriodo, filaSegunLibro, esMetodo, type Tarifa, type FilaPagoBD, type Cobro,
} from '../app/lib/cuotas';

const ok = <T,>(extra: T) => ({ success: true as const, ...extra });

const TEMAS = [
  'El Derecho: concepto y acepciones. Normas jurídicas positivas.',
  'La Constitución Española (I): estructura y valores.',
  'La Unión Europea: Instituciones y Derecho derivado.',
  'Inteligencia: Ciclo, OSINT, Deep/Dark Web.',
];

/** Un plan semanal ya normalizado, como lo devuelve `normalizePlan`. */
const PLAN = {
  id: 'plan-1',
  week_number: 3,
  status: 'active',
  plan_data: {
    focus: 'Fuerza de tracción y base aeróbica',
    days: [
      { day: 'Lunes', type: 'Fuerza', title: 'Lunes · Tracción', exercises: [
        { name: 'Dominadas negativas', sets: 4, reps: '3' },
        { name: 'Remo invertido', sets: 3, reps: '8' },
        { name: 'Plancha', sets: 3, reps: '30 s' },
      ] },
      { day: 'Martes', type: 'Resistencia', title: 'Martes · Rodaje suave', exercises: [
        { name: 'Carrera continua', sets: 1, reps: '30 min' },
      ] },
      // Un dia sin ejercicios: es descanso, y la pantalla no puede ofrecer
      // "iniciar" una sesion de cero ejercicios.
      { day: 'Miércoles', type: 'Resistencia', title: 'Miércoles · Descanso', exercises: [] },
      { day: 'Jueves', type: 'Resistencia', title: 'Jueves · Series', exercises: [
        { name: 'Series de 400 m', sets: 6, reps: '400 m' },
      ] },
      { day: 'Viernes', type: 'Fuerza', title: 'Viernes · Circuito', exercises: [
        { name: 'Burpees', sets: 3, reps: '10' },
        { name: 'Sentadillas', sets: 3, reps: '15' },
        { name: 'Abdominales', sets: 3, reps: '20' },
      ] },
    ],
  },
  feedback: {},
  created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
};

const pregunta = (i: number) => ({
  id: `q-${i}`,
  question_text: `¿Cuál de estas afirmaciones sobre el artículo ${i + 10} es correcta, según la redacción vigente del texto consolidado?`,
  options: [
    `La primera opción, que desarrolla el supuesto general del artículo ${i + 10}.`,
    `La segunda, que introduce la excepción prevista en el apartado segundo.`,
    `La tercera, que corresponde en realidad a otro precepto distinto.`,
  ],
  correct_index: i % 3,
  explanation: 'La respuesta correcta se apoya en la redacción literal del precepto, que distingue el supuesto general de la excepción del apartado segundo.',
  difficulty_level: 2,
  status: i % 4 === 0 ? 'candidate' : 'active',
  origin: i % 4 === 0 ? ('live_ai' as const) : ('bank' as const),
  legal_reference: i % 2 === 0 ? `Artículo ${i + 10}` : null,
  subject_id: 1,
  subjects: { topic_number: 1, title: TEMAS[0] },
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
});

// ---------- ALUMNO ----------

/** La sesion. En el banco no hay login: siempre el mismo usuario. */
export async function getCurrentUser() {
  return { id: '11111111-1111-1111-1111-111111111111', email: 'gaepmalaga@gmail.com', role: 'admin' as const };
}
// P11h: el selector de academia no se ejerce en este banco (no hay login),
// pero el stub tiene que existir para que construir.mjs no reviente.
export async function getMisAcademias() {
  return ok({ academias: [{ slug: 'alphapol', name: 'Alphapol' }] });
}

export async function getPsychProfile() {
  return ok({ data: { user_id: '11111111-1111-1111-1111-111111111111', answers: {} } });
}

export async function getModuleSettings() {
  return ok({ settings: { home: true, chat: true, test: true, review: true, cards: true, training: true, interview: true, stats: true, profile: true } });
}

export async function getUserStats() {
  return ok({
    stats: {
      total: 42, correct: 24, wrong: 12, blank: 6, answered: 36, winRate: 67,
      avgTimeMs: 18400, timedCount: 30, uncertaintyIndex: 35, changesCount: 14,
      errorBreakdown: { olvido: 5, trampa: 4, desconocimiento: 2, fallo_procesamiento: 1 },
      taggedErrors: 12,
      racha: 4,
      firmeza: { firmes: 19, titubeantes: 7, normales: 10, medianaMs: 16200 },
      lastItems: Array.from({ length: 8 }, (_, i) => ({
        question_text: `Pregunta reciente número ${i + 1} sobre el articulado del tema, con enunciado largo para ver cómo se corta.`,
        is_correct: i % 3 !== 0,
        topic: TEMAS[i % TEMAS.length],
        response_time_ms: 8000 + i * 2200,
        option_changes: i % 4 === 0 ? 2 : 0,
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
      })),
    },
  });
}

export async function getSimulacros() {
  const s = (nota: number, dias: number, total: number) => ({
    examId: `ex-${dias}`, fecha: new Date(Date.now() - dias * 86400000).toISOString(),
    total, aciertos: Math.round(total * 0.6), fallos: Math.round(total * 0.3), blancos: Math.round(total * 0.1),
    nota, aprobado: nota >= 3,
  });
  return ok({
    data: {
      simulacros: [s(5.8, 1, 50), s(4.9, 5, 50), s(5.2, 9, 25), s(3.1, 16, 25)],
      media: 4.75, mejor: 5.8, tendencia: 'sube',
    },
  });
}

export async function getConvocatoria() {
  return ok({ convocatoria: { escala: 'Escala Básica', fechaExamen: '2027-05-16', nota: 'BOE-A-2027-0000' } });
}
export async function saveConvocatoria() { return { success: true as const }; }
export async function getMiPerfil() {
  return ok({
    perfil: {
      email: 'alumno@academia.test',
      convocatoria: { escala: 'Escala Básica', fechaExamen: '2027-05-16', nota: null },
      acceso: { estado: 'active' },
      pagoDelMes: { periodo: 'septiembre de 2026', pagado: false },
      grupos: [{ nombre: 'Teoría mañana', tipo: 'Teoría' }, { nombre: 'Físicas L-X', tipo: 'Físicas' }],
      proyeccion: [
        { fecha: '2026-09-14', vencen: 18 },
        { fecha: '2026-09-15', vencen: 6 },
        { fecha: '2026-09-16', vencen: 0 },
        { fecha: '2026-09-17', vencen: 11 },
        { fecha: '2026-09-18', vencen: 4 },
        { fecha: '2026-09-19', vencen: 0 },
        { fecha: '2026-09-20', vencen: 9 },
      ],
    },
  });
}

export async function getArticulo() {
  return ok({
    articulo: {
      reference: 'Artículo 25',
      texto: 'El español que no lo sea de origen perderá la nacionalidad cuando durante un período de tres años utilice exclusivamente la nacionalidad a la que hubiera declarado renunciar al adquirir la nacionalidad española.\n\nLa sentencia firme que declare que el interesado ha incurrido en falsedad, ocultación o fraude en la adquisición de la nacionalidad española produce la nulidad de tal adquisición. La acción de nulidad deberá ejercitarse por el Ministerio Fiscal dentro del plazo de quince años.',
      documento: 'tema-01.pdf',
    },
  });
}

export async function getStudentTopics() { return ok({ topics: TEMAS }); }
export async function getStudentSubjects() {
  return ok({ subjects: TEMAS.map((t, i) => ({ id: i + 1, title: t })) });
}
export async function getStudentSyllabus() {
  const tema = (t: string, i: number) => ({ numero: i + 1, titulo: t });
  return ok({
    bloques: [
      { id: 1, nombre: 'Bloque I · Ciencias Jurídicas', temas: TEMAS.slice(0, 3).map(tema) },
      { id: 2, nombre: 'Bloque II · Materias Sociales', temas: TEMAS.slice(3).map((t, i) => tema(t, i + 3)) },
    ],
  });
}
export async function getRecuentoEntrenamiento() {
  return ok({ propuestas: 14, disponibles: 60 });
}

// Lo que toca hoy (regla 94): el Inicio pinta una fila por cada cosa que haya.
export async function getEntrenoDeHoy() {
  return ok({ hoy: { propuestas: 18, disponibles: 60, porRepasar: 8, temaConMasFallos: { tema: TEMAS[1], fallos: 5 } } });
}

export async function getQuestionsFromBank({ limit = 5 }: { topic: string; difficulty: number; limit: number }) {
  return ok({ data: Array.from({ length: limit }, (_, i) => pregunta(i)) });
}
export async function getSimulacro({ limit = 25 }: { topics: string[]; limit: number; difficulty: number }) {
  return ok({
    data: {
      // La acción real devuelve la pregunta YA MAPEADA (`mapBankRowToQuestion`),
      // no la fila de la tabla: con la fila cruda el simulacro del banco se
      // pintaba sin enunciado ni opciones (regla 38: un banco que miente).
      questions: Array.from({ length: limit }, (_, i) => ({ ...mapBankRowToQuestion(pregunta(i)), topic: TEMAS[i % TEMAS.length] })),
      corto: false,
    },
  });
}

export async function generateAndSaveCandidate() {
  return ok({ data: { id: 'gen-1', question: '¿Pregunta generada por IA para rellenar el examen?', options: ['Una', 'Otra', 'La tercera'], correctIndex: 1, explanation: 'Porque sí.', legal_reference: null } });
}

export async function saveTestResult() { return { success: true as const, id: 'fila-1' }; }
export async function setResultErrorType() { return { success: true as const }; }
export async function saveExamResults() { return { success: true as const }; }
export async function voteQuestion() { return { success: true as const }; }
export async function reportQuestion() { return { success: true as const }; }
export async function getQuestionNote() { return ok({ note: '' }); }
export async function saveQuestionNote() { return { success: true as const }; }

export async function askAtenea(pregunta_: string) {
  await new Promise((r) => setTimeout(r, 600));
  return ok({
    answer: `**La Constitución tiene 169 artículos**, del 1 al 169 y sin huecos.\n\nSobre "${pregunta_}": el precepto distingue el supuesto general de la excepción del apartado segundo. Conviene fijarse en que la redacción vigente cambió con la reforma, y es justo ahí donde suele estar la trampa del examen.\n\n| Concepto | Artículo |\n|---|---|\n| Derechos fundamentales | 15 a 29 |\n| Garantías | 53 y 54 |`,
    sources: [
      { filename: 'tema-02.pdf', content_chunk: 'Artículo 53. 1. Los derechos y libertades reconocidos en el Capítulo segundo del presente Título vinculan a todos los poderes públicos...', reference: 'Artículo 53' },
      { filename: 'tema-02.pdf', content_chunk: 'Artículo 54. Una ley orgánica regulará la institución del Defensor del Pueblo...', reference: 'Artículo 54' },
    ],
  });
}

/**
 * Ojo con la FORMA: la accion de verdad devuelve `{ success, items, byTopic }`,
 * no `{ data }`, y los campos van en camelCase porque ya han pasado por
 * `groupFailedAttempts`. Este stub los tenia en snake_case dentro de `data`,
 * asi que `res.items` era `undefined` y la pantalla de repaso salia SIEMPRE
 * vacia en el banco de pruebas: nunca se llego a ver la lista de fallos, que
 * es la pantalla entera.
 */
export async function getFailedQuestions() {
  const items = Array.from({ length: 5 }, (_, i) => ({
    questionId: `q-${i}`,
    questionText: `Pregunta fallada ${i + 1}: ¿cuál es el plazo previsto en el artículo ${i + 20}?`,
    options: ['Quince días', 'Un mes', 'Tres meses'],
    correctIndex: 1,
    explanation: 'El plazo es de un mes desde la notificación.',
    topic: TEMAS[i % TEMAS.length],
    legalReference: `Artículo ${i + 20}`,
    times: i === 0 ? 3 : 1,
    lastErrorType: ['olvido', 'trampa', 'desconocimiento', 'fallo_procesamiento'][i % 4],
    lastFailedAt: new Date(Date.now() - i * 86400000).toISOString(),
    // `chosenIndexes` NO es opcional en `FailedQuestion`, y sin el la
    // pantalla de repaso reventaba entera (`chosenIndexes.length`).
    chosenIndexes: i === 0 ? [0, 2] : [(i + 1) % 3],
  }));
  const conteo = new Map<string, number>();
  for (const it of items) conteo.set(it.topic, (conteo.get(it.topic) ?? 0) + 1);
  return {
    success: true as const,
    items,
    byTopic: [...conteo].map(([topic, count]) => ({ topic, count })).sort((a, b) => b.count - a.count),
  };
}

export async function generateFlashcard() {
  await new Promise((r) => setTimeout(r, 400));
  // UNA FICHA LARGA DE VERDAD, y no es capricho: con la respuesta corta que
  // habia aqui antes, el banco daba por buena una tarjeta que en el movil de
  // un alumno salia CORTADA por arriba y por abajo. El stub mentia — que es
  // el modo de fallo que avisa la regla 38 — porque ningun dato de prueba se
  // parecia a lo que escribe el modelo con el temario real delante.
  return ok({ data: { id: 'fc-1',
    front: '¿Qué debe contener la resolución judicial que autoriza el registro de dispositivos de almacenamiento masivo de información?',
    back: 'La resolución del juez de instrucción debe determinar los términos y el alcance del registro; podrá autorizar la realización de copias de los datos informáticos, y fijará las condiciones necesarias para asegurar la integridad de los datos y las garantías de su preservación para hacer posible, en su caso, la práctica de un dictamen pericial. Debe identificar a los investigados y afectados, la extensión y alcance de la medida, la unidad investigadora de Policía Judicial que la ejecute, la duración, y la forma y periodicidad de la información al juez.',
    isReview: false } });
}
export async function saveFlashcardProgress() { return { success: true as const }; }

export async function getPhysicalProfile() {
  return ok({ data: { height: 178, weight: 74, gender: 'male', availability: 4, equipment: 'calisthenics', baseline_metrics: { pullups_score: 9, pullups_method: 'reps', run_1000_seconds: 215, agility_time: 9.4 } } });
}
export async function savePhysicalProfile() { return { success: true as const }; }
// Como en Alphapol: el plan lo escribe el preparador para el grupo (`grupo:…`),
// y el alumno apunta cada día (regla 84).
export async function getActiveTrainingPlan() { return ok({ plan: { ...PLAN, id: 'grupo:g1', weekStart: '2026-09-07' } }); }

export async function generateWeeklyPlan() { return ok({ data: null }); }
export async function generateNextWeek() { return ok({ plan: PLAN }); }
export async function completeTrainingDay() { return { success: true as const }; }
export async function getTrainingHistory() {
  return ok({
    semanas: [
      { weekStart: '2026-08-25', etiqueta: '25 ago', sesiones: [], completadas: 4, saltadas: 1, avgRpe: 7.2, molestias: [] },
      { weekStart: '2026-08-18', etiqueta: '18 ago', sesiones: [], completadas: 3, saltadas: 0, avgRpe: 5.5, molestias: ['injury: hombro derecho'] },
    ],
  });
}

export async function getBiodata() { return ok({ data: null }); }
export async function saveBiodata() { return { success: true as const }; }
export async function processInterviewTurn() { return ok({ response: 'Cuénteme por qué quiere ser policía. Y sea concreto.' }); }
export async function evaluateInterview() {
  return ok({
    report: {
      score: 62,
      summary: 'Motivación creíble pero poco concreta. Se ha puesto nervioso al preguntarle por sus límites.',
      strengths: ['Explica bien por qué quiere el Cuerpo', 'Reconoce que le falta preparación física'],
      weaknesses: ['Frases hechas al hablar de vocación', 'Evita la pregunta sobre antecedentes'],
      contradictions: [],
      recommendations: ['Prepara dos ejemplos concretos de trabajo en equipo', 'Ensaya la respuesta sobre tus límites'],
    },
    transcript: 'INSPECTOR: ¿Por qué quiere ser policía?\nASPIRANTE: Por vocación de servicio.',
  });
}
export async function getInterviewReports() {
  return ok({
    informes: [
      {
        id: 'ir1',
        createdAt: '2026-09-01T18:00:00Z',
        score: 62,
        turns: 6,
        report: {
          score: 62,
          veredicto: 'Motivación creíble pero poco concreta. Se pone nervioso al hablar de sus límites.',
          fortalezas: ['Explica bien por qué quiere el Cuerpo'],
          contradicciones: ['Dijo no tener antecedentes y luego mencionó una denuncia'],
          recomendaciones: ['Prepara dos ejemplos concretos de trabajo en equipo'],
        },
        transcript: 'INSPECTOR: ¿Por qué quiere ser policía?\nASPIRANTE: Por vocación de servicio.',
      },
    ],
  });
}

// ---------- ADMINISTRACIÓN ----------

export async function getOfficialSyllabus() {
  return ok({
    syllabus: [
      { id: 1, name: 'Ciencias Jurídicas', subjects: TEMAS.slice(0, 3).map((t, i) => ({ id: i + 1, number: i + 1, title: t, documents: i === 0 ? [{ id: `d${i}`, filename: 'tema-01', chunk_count: 42, index_status: 'indexado', uploaded_at: new Date().toISOString() }] : [], docCount: i === 0 ? 1 : 0 })) },
      { id: 2, name: 'Ciencias Sociales', subjects: [{ id: 4, number: 4, title: TEMAS[3], documents: [], docCount: 0 }] },
    ],
  });
}

export async function getAdminQuestionBank() {
  // Regla 78: dos de seis son de "tu academia" (privadas), el resto del banco
  // global — así se ve la insignia y el filtro de origen sin tener que subir
  // nada a mano.
  return ok({
    data: Array.from({ length: 6 }, (_, i) => ({ ...pregunta(i), academyName: i < 2 ? 'Tu academia' : null })),
    total: 6, page: 1, totalPages: 1, status: 'active',
  });
}

export async function getModerationQueue() {
  return ok({
    data: {
      // `topic`, NO `subject_title`: la accion de verdad aplana
      // `subject.title` a `topic`, que es lo que pinta la pantalla. Con el
      // nombre equivocado la insignia del tema salia vacia en el banco de
      // pruebas — y de paso destapo que la pantalla pintaba una pastilla azul
      // en blanco en vez de decir "sin tema".
      candidates: Array.from({ length: 2 }, (_, i) => ({ ...pregunta(i), topic: TEMAS[0] })),
      reports: [{ id: 'r1', question_id: 'q-1', report_type: 'wrong_correct_answer', message: 'La respuesta buena es la C, no la B. Lo dice el artículo 14.', status: 'pending', question: pregunta(1) }],
    },
  });
}

export async function getAcademyOverview() {
  return ok({
    data: {
      // `grupos`, `acceso`, `exento` y `pagadoMesActual` los pone la ACCIÓN
      // por cada alumno (`FilaAlumno`, app/lib/academy.ts) — no es solo la
      // lista de grupos de la academia. Faltaban en el stub desde siempre;
      // `formas.ts` no lo pilla porque solo compara las claves de PRIMER
      // NIVEL, nunca las de dentro de un array — así fue como AdminStudents
      // se caía de verdad, en cada pestaña de administración, con
      // "Cannot read properties of undefined (reading 'length')" en
      // `a.grupos.length`.
      alumnos: [
        { id: 'u2', email: 'alumno.que.acaba.de.registrarse@ejemplo.com', role: 'student', contestadas: 0, blancos: 0, aciertos: 0, winRate: null, ultimaActividad: null, ultimaConexion: null, diasSinEntrar: null, diasSinEstudiar: null, estado: 'nunca_entro' as const, estudiando: 'nunca' as const, grupos: [], acceso: 'pending' as const, exento: false, pagadoMesActual: false },
        { id: 'u3', email: 'alumno.flojo@ejemplo.com', role: 'student', contestadas: 18, blancos: 3, aciertos: 6, winRate: 31, ultimaActividad: new Date(Date.now() - 14 * 86400000).toISOString(), ultimaConexion: new Date(Date.now() - 14 * 86400000).toISOString(), diasSinEntrar: 14, diasSinEstudiar: 14, estado: 'abandonado' as const, estudiando: 'hace_tiempo' as const, grupos: [{ id: 'g1', name: 'Teoría mañana', kind: 'teoria' }], acceso: 'active' as const, exento: false, pagadoMesActual: false },
        // ESTE ES EL CASO QUE ARREGLÓ LA REGLA: entra HOY (activo de verdad),
        // pero no ha contestado ni una pregunta. Antes salía como «nunca ha
        // entrado» y encabezaba la lista de a quién llamar — al revés de lo
        // que tocaba. Sin este caso en el stub, el fallo no se veía nunca.
        { id: 'u4', email: 'entra.pero.no.hace.tests@ejemplo.com', role: 'student', contestadas: 0, blancos: 0, aciertos: 0, winRate: null, ultimaActividad: null, ultimaConexion: new Date().toISOString(), diasSinEntrar: 0, diasSinEstudiar: null, estado: 'activo' as const, estudiando: 'nunca' as const, grupos: [{ id: 'g1', name: 'Teoría mañana', kind: 'teoria' }, { id: 'g2', name: 'Físicas L-X', kind: 'fisicas' }], acceso: 'active' as const, exento: false, pagadoMesActual: true },
        { id: 'u1', email: 'gaepmalaga@gmail.com', role: 'admin', contestadas: 36, blancos: 6, aciertos: 24, winRate: 67, ultimaActividad: new Date().toISOString(), ultimaConexion: new Date().toISOString(), diasSinEntrar: 0, diasSinEstudiar: 0, estado: 'activo' as const, estudiando: 'al_dia' as const, grupos: [], acceso: 'active' as const, exento: false, pagadoMesActual: false },
        // Un suspendido: para ver que se recoge aparte de la lista principal
        // (regla nueva, "la lista no se vuelve interminable con los meses").
        { id: 'u5', email: 'alumno.del.curso.pasado@ejemplo.com', role: 'student', contestadas: 240, blancos: 30, aciertos: 150, winRate: 71, ultimaActividad: new Date(Date.now() - 200 * 86400000).toISOString(), ultimaConexion: new Date(Date.now() - 200 * 86400000).toISOString(), diasSinEntrar: 200, diasSinEstudiar: 200, estado: 'abandonado' as const, estudiando: 'hace_tiempo' as const, grupos: [], acceso: 'suspended' as const, exento: false, pagadoMesActual: false },
      ],
      porEstado: { nunca_entro: 1, activo: 2, en_riesgo: 0, abandonado: 2 },
      grupos: [{ id: 'g1', name: 'Teoría mañana', kind: 'teoria' }, { id: 'g2', name: 'Físicas L-X', kind: 'fisicas' }],
      membershipRequired: true,
      periodoActual: '2026-09',
      cobertura: [
        { subjectId: 1, title: TEMAS[0], preguntas: 24, alumnos: 2 },
        { subjectId: 2, title: TEMAS[1], preguntas: 0, alumnos: 0 },
        { subjectId: 3, title: TEMAS[2], preguntas: 12, alumnos: 0 },
      ],
      sospechosas: [{ questionId: 'q-1', veces: 22, aciertos: 2, winRate: 9, texto: '¿Pregunta que casi todos fallan y probablemente esté mal redactada?', tema: TEMAS[0] }],
      confusas: [{ a: 'q-1', b: 'q-2', topic: TEMAS[0], n: 12, fallanAmbas: 9, tasaCoFallo: 0.75, lift: 3.4, textoA: '¿Pregunta A que se confunde con B?', textoB: '¿Pregunta B, casi la misma distinción?' }],
      progresoSemanal: { alumnosQueAvanzan: 2, dominadasEstaSemana: 14 },
    },
  });
}

export async function getStudentDetail() {
  return ok({
    data: {
      alumno: { id: 'u3', email: 'alumno.flojo@ejemplo.com', role: 'student', contestadas: 18, blancos: 3, aciertos: 6, winRate: 31, ultimaActividad: new Date(Date.now() - 14 * 86400000).toISOString(), ultimaConexion: new Date(Date.now() - 14 * 86400000).toISOString(), diasSinEntrar: 14, diasSinEstudiar: 14, estado: 'abandonado' as const, estudiando: 'hace_tiempo' as const, grupos: [{ id: 'g1', name: 'Teoría mañana', kind: 'teoria' }], acceso: 'active' as const, exento: false, pagadoMesActual: false },
      temas: [{ topic: TEMAS[0], contestadas: 12, winRate: 25 }, { topic: TEMAS[1], contestadas: 6, winRate: 50 }],
      errores: { porTipo: [{ tipo: 'olvido' as const, veces: 5 }, { tipo: 'desconocimiento' as const, veces: 2 }], sinClasificar: 4 },
      // Por debajo del 33 %: el caso que la academia quiere ver (regla 80).
      dudosas: {
        sinDatos: false, marcadas: 16, contestadas: 13, aciertos: 4, fallos: 9, enBlanco: 3,
        acierto: 30.8, netoAciertos: -0.5, umbral: 1 / 3, compensa: false,
        noDudosas: { contestadas: 40, aciertos: 31, acierto: 77.5 },
      },
    },
  });
}

// EL PLAN DE ENTRENAMIENTO QUE ESCRIBE UN ENTRENADOR REAL, no la IA: la
// insignia y el precargado del formulario dependen de `source`, y con un plan
// generado por IA no se ve si el editor distingue las dos cosas.
export async function getStudentActivePlan() {
  return ok({
    plan: {
      id: 'plan-1',
      weekStart: new Date().toISOString(),
      plan: {
        week_focus: 'Fuerza tren superior y resistencia aeróbica',
        source: 'entrenador' as const,
        days: [
          { day: 'Lunes', type: 'Entrenamiento', title: 'Lunes', exercises: [
            { name: 'Sentadilla trasera', sets: '5', reps: '5', rest: '3min', target: null, metric_type: null },
            { name: 'Remo con barra', sets: '4', reps: '8', rest: '90s', target: null, metric_type: null },
          ] },
          { day: 'Martes', type: 'Entrenamiento', title: 'Martes', exercises: [] },
        ],
      },
    },
  });
}
export async function saveManualTrainingPlan() { return ok({}); }
export async function getDocumentChunks() {
  // `chunks`, no `data`: con el nombre equivocado el visor de fragmentos salia
  // vacio y parecia que el documento no estaba indexado.
  return ok({
    chunks: Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      content_chunk: `Artículo ${i + 1}. Contenido del fragmento indexado número ${i + 1}, con texto suficiente para ver cómo se pliega y se despliega en la pantalla.`,
      reference: i < 4 ? `Artículo ${i + 1}` : null,
    })),
  });
}

export async function approveQuestion() { return { success: true as const }; }
export async function approveQuestions() { return { success: true as const, approved: 2 }; }
export async function disableQuestion() { return { success: true as const }; }
export async function discardAllQuestions() { return { success: true as const, discarded: 6 }; }
export async function updateQuestion() { return { success: true as const }; }
export async function resolveReport() { return { success: true as const }; }
export async function createManualQuestion() { return { success: true as const }; }
export async function importManualQuestions() { return ok({ inserted: 3, rejected: [] }); }
export async function seedQuestionBank() { return ok({ inserted: 5, duplicated: 1, failed: 0, requested: 6, status: 'active', motivoFallo: null }); }
export async function seedFlashcardBank() { return ok({ inserted: 12, duplicated: 2, failed: 1, requested: 15 }); }
// Un tema a CERO y otro con fichas: el panel tiene que distinguir "hay que
// sembrar este" de "este ya esta", y con todos iguales no se ve si lo hace.
export async function getFlashcardBankCounts() {
  return ok({ porTema: { 'El Derecho: concepto y acepciones. Normas jurídicas positivas.': 15 } });
}
export async function uploadTopicPDF() { return ok({ complete: true, indexed: 42, total: 42, failures: [], withReference: 40, message: 'Indexado completo: 42 fragmentos.' }); }
export async function reindexDocument() { return ok({ status: 'indexado', indexed: 42, total: 42, withReference: 40, failures: [] }); }
export async function deleteDocument() { return { success: true as const }; }
export async function deleteTopic() { return { success: true as const }; }
export async function setModuleEnabled() { return { success: true as const }; }

// ── EL HISTORIAL DEL CHAT ──────────────────────────────────────────────────
// Una ABIERTA y una CERRADA: el panel tiene que distinguirlas (la cerrada
// lleva candado y no se puede continuar), y con todas iguales no se ve si lo
// hace. Es el mismo motivo por el que la ficha de prueba pasó a ser larga.
export async function listConversations() {
  return ok({ conversaciones: [
    { id: 'c1', title: '¿Cuántos artículos tiene la Constitución?', subjectId: 2,
      closedAt: null, updatedAt: new Date().toISOString() },
    { id: 'c2', title: 'Diferencia entre proyecto y proposición de ley, y quién puede presentar cada una',
      subjectId: null, closedAt: new Date().toISOString(), updatedAt: new Date(Date.now() - 864e5).toISOString() },
  ] });
}
export async function getConversation() {
  return ok({ mensajes: [
    { id: 'm1', role: 'user', content: '¿Cuántos artículos tiene la Constitución?', createdAt: new Date().toISOString() },
    { id: 'm2', role: 'ai', content: 'Tiene 169 artículos, del 1 al 169 y sin huecos, según el índice del temario.', createdAt: new Date().toISOString() },
  ] });
}
export async function appendTurn() { return ok({ conversationId: 'c1' }); }
export async function closeConversation() { return ok({}); }
export async function deleteConversation() { return ok({}); }

// ── DATOS DE LA ACADEMIA Y PROFESORES ───────────────────────────────────────
export async function getAcademySettings() {
  return ok({
    settings: {
      name: 'Academia Atenea',
      address: 'Calle Larios 12, Málaga',
      schedule: 'L-V 10:00-14:00 y 17:00-21:00',
      contactEmail: 'info@academia-atenea.es',
      contactPhone: '600 111 222',
      updatedAt: new Date(Date.now() - 3 * 864e5).toISOString(),
    },
    slug: 'alphapol',
  });
}
export async function saveAcademySettings() { return { success: true as const }; }

// Un activo y uno inactivo: la pantalla tiene que atenuar el segundo y decir
// "inactivo", y con los dos iguales no se ve si lo hace.
export async function listStaff() {
  return ok({
    staff: [
      { id: 's1', name: 'Marta Ortega', role: 'profesora', email: 'marta@academia-atenea.es', phone: '600 222 333', active: true, userId: null },
      { id: 's2', name: 'Javier Ruiz', role: 'entrenador', email: null, phone: '600 333 444', active: true, userId: 'u-prep' },
      { id: 's3', name: 'Sonia Vidal', role: 'coordinadora', email: 'sonia@academia-atenea.es', phone: null, active: false, userId: null },
    ],
  });
}
export async function getAgendaProfesores(params?: { lunes?: string }) {
  const lunes = params?.lunes ?? '2026-11-09';
  const c = (fecha: string, grupo: string, titulo: string, hora: string) => ({ fecha, grupo, titulo, hora, fin: `${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}${hora.slice(2)}` });
  return ok({
    lunes,
    agenda: [
      { profesorId: 's1', grupos: [{ id: 'g1', nombre: 'Teoría mañana', tipo: 'Teoría' }], clases: [] },
      { profesorId: 's2', grupos: [{ id: 'g-kappa', nombre: 'Promo 44 · Kappa', tipo: 'Físicas' }, { id: 'g-alpha', nombre: 'Promo 44 · Alpha', tipo: 'Físicas' }],
        clases: [c('2026-11-09', 'Kappa', 'FLK 5.0', '08:00'), c('2026-11-10', 'Multi', 'Jiujitsu', '18:30'), c('2026-11-11', 'Alpha', 'FLK 5.1', '08:00')] },
      { profesorId: 's3', grupos: [], clases: [] },
    ],
  });
}
// ── LO QUE DA CADA PROFESOR (regla 100) ─────────────────────────────────────
export async function getClasesHabituales() {
  return ok({ clases: [
    { actividad: 'Boxeo', profesorIds: ['s2'] }, { actividad: 'FLK', profesorIds: ['s2', 's1'] },
  ] });
}
export async function setClaseHabitual() { return { success: true as const }; }
export async function getTemasProfesores() {
  const t = (n: number, titulo: string, profesorIds: string[], contestadas: number, aciertos: number, bloque = 'CIENCIAS JURÍDICAS') =>
    ({ subjectId: 100 + n, numero: n, titulo, bloque, profesorIds, alumnos: contestadas ? 12 : 0, contestadas, aciertos, blancos: 3 });
  return ok({ temas: [
    t(1, 'El Derecho: concepto y acepciones', ['s1'], 240, 190), t(2, 'La Constitución Española (I)', ['s1'], 310, 220),
    t(3, 'La Constitución Española (II)', ['s1'], 180, 75), t(4, 'El Tribunal Constitucional', ['s1'], 12, 5),
    t(5, 'La Corona', ['s1'], 0, 0), t(14, 'El Código Penal', ['s1'], 150, 120),
    t(17, 'La Policía Nacional', ['s2'], 90, 60), t(18, 'Ley de Seguridad Ciudadana', ['s2'], 0, 0),
    t(23, 'Delitos contra la Administración', [], 40, 22), t(24, 'Faltas y delitos leves', [], 0, 0),
    t(46, 'Examen oficial 2020', [], 30, 20, 'EXÁMENES OFICIALES ANTERIORES'),
  ] });
}
export async function setTemasProfesor() { return { success: true as const, temas: [1, 2, 3] }; }
export async function listCuentasAcademia() {
  return ok({ cuentas: [{ id: 'u-prep', email: 'preparador@alphapol.es', role: 'admin' }, { id: 'u2', email: 'alumno@atenea.com', role: 'student' }] });
}
export async function saveStaff() { return { success: true as const }; }
export async function deleteStaff() { return { success: true as const }; }

// ── AUDITORÍA DE ADMINISTRACIÓN ──────────────────────────────────────────────
// Varias acciones distintas, con y sin detalle: la pantalla tiene que leerse
// como un registro de QUIÉN hizo QUÉ, no como una lista de códigos en inglés.
export async function getAdminAuditLog() {
  return ok({
    rows: [
      { id: 'a1', actorId: 'u1', actorEmail: 'gaepmalaga@gmail.com', action: 'set_module_enabled', target: 'chat', detail: { enabled: false }, createdAt: new Date().toISOString() },
      { id: 'a2', actorId: 'u1', actorEmail: 'gaepmalaga@gmail.com', action: 'approve_questions', target: null, detail: { count: 8 }, createdAt: new Date(Date.now() - 3600e3).toISOString() },
      { id: 'a3', actorId: 'u1', actorEmail: 'gaepmalaga@gmail.com', action: 'delete_topic', target: 'Tema de prueba', detail: null, createdAt: new Date(Date.now() - 2 * 864e5).toISOString() },
      { id: 'a4', actorId: 'u1', actorEmail: 'gaepmalaga@gmail.com', action: 'save_staff', target: 'Marta Ortega', detail: null, createdAt: new Date(Date.now() - 5 * 864e5).toISOString() },
    ],
  });
}

// Los fallos del servidor (regla 108): a quién, dónde y qué dijo la base de datos.
export async function getFallosRecientes() {
  return ok({
    rows: [
      { id: 'f1', email: 'prueba.alumno@alphapol.es', donde: 'saveTestResult', mensaje: 'new row violates row-level security policy for table "question_attempts"', codigo: '42501', createdAt: new Date(Date.now() - 20 * 60e3).toISOString() },
      { id: 'f2', email: 'prueba.admin@alphapol.es', donde: 'registraCobro', mensaje: 'Could not find the function public.registra_cobro in the schema cache', codigo: 'PGRST202', createdAt: new Date(Date.now() - 864e5).toISOString() },
    ],
  });
}

// Último acceso de cada usuario: alumnos y admin, con y sin conexión previa.
export async function getInicioSesiones() {
  return ok({
    sinFechas: false,
    usuarios: [
      { id: 'u1', email: 'gaepmalaga@gmail.com', rol: 'admin', ultimoAcceso: new Date(Date.now() - 2 * 3600e3).toISOString(), alta: new Date(Date.now() - 90 * 864e5).toISOString() },
      { id: 'u2', email: 'alumno@atenea.com', rol: 'student', ultimoAcceso: new Date(Date.now() - 26 * 3600e3).toISOString(), alta: new Date(Date.now() - 30 * 864e5).toISOString() },
      { id: 'u3', email: 'morato@atenea.com', rol: 'admin', ultimoAcceso: null, alta: new Date(Date.now() - 3 * 864e5).toISOString() },
    ],
  });
}

// ── ENTRENAMIENTO ADAPTATIVO (P10) ──────────────────────────────────────────

export async function getAdaptiveSession({ limit = 20 }: { topics: string[]; limit: number; difficulty?: number }) {
  return ok({
    data: {
      questions: Array.from({ length: limit }, (_, i) => ({ ...mapBankRowToQuestion(pregunta(i)), cajon: (['nueva', 'recaida', 'aprendiendo', 'consolidando'] as const)[i % 4], porQueHoy: i % 3 === 0 ? 'Te toca porque la fallaste hace 3 días.' : null })),
      adaptativo: true,
      resumen: null,
      aciertoEstimado: 82,
      bancoCorto: false,
      motivoCorto: null,
      atascadasTotales: 2,
    },
  });
}

// ── MI EVOLUCIÓN (regla 77) ──────────────────────────────────────────────────

export async function getMiEvolucion() {
  const tema = (i: number, progreso: number) => ({
    topic: TEMAS[i % TEMAS.length], total: 40, nuevas: Math.round(40 * (1 - progreso / 100) * 0.5),
    aprendiendo: 6, consolidando: 5, dominadas: Math.round(40 * (progreso / 100)), atascadas: i === 0 ? 3 : 0, progreso,
  });
  return ok({
    data: {
      fechaInicio: new Date(Date.now() - 37 * 864e5).toISOString(),
      diasEnOposicion: 37,
      racha: 6,
      mapaTemas: [tema(0, 12), tema(1, 48), tema(2, 71), tema(3, 0)],
      resumenBanco: { total: 1795, dominadas: 210, enCamino: 96, vistasSinAsentar: 340, sinTocar: 1149 },
      desglose: {
        dominadas: 210, enCamino: 96, seResisten: 14,
        temaQueMasResiste: { topic: TEMAS[0], veces: 6 },
        evitas: 9,
      },
      curva: Array.from({ length: 14 }, (_, i) => ({
        fecha: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10),
        dominadas: 150 + i * 4,
      })),
      diasDesdeCache: 0,
      actividad: Array.from({ length: 20 }, (_, i) => ({
        fecha: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10),
        respuestas: i % 5 === 0 ? 0 : 8 + (i % 12),
      })),
      dudosas: {
        sinDatos: false, marcadas: 27, contestadas: 22, aciertos: 13, fallos: 9, enBlanco: 5,
        acierto: 59.1, netoAciertos: 8.5, umbral: 1 / 3, compensa: true,
        noDudosas: { contestadas: 180, aciertos: 151, acierto: 83.9 },
      },
    },
  });
}

// ── CONSUMO DE IA (regla 51/75, solo superadmin) ────────────────────────────

export async function getAiCostOverview() {
  return ok({
    data: {
      total: { coste: 4.32, entrada: 1_200_000, salida: 180_000, cacheados: 0, llamadas: 620 },
      porAlumno: [
        { userId: 'u2', coste: 1.8, llamadas: 240, entrada: 500000, salida: 70000, email: 'alumno@atenea.com' },
        { userId: 'u3', coste: 0.9, llamadas: 110, entrada: 220000, salida: 30000, email: 'alumno.flojo@ejemplo.com' },
      ],
      porRuta: [{ ruta: 'pregunta', coste: 3.1, llamadas: 480 }, { ruta: 'chat', coste: 1.22, llamadas: 140 }],
      porMes: [{ mes: '2026-08', coste: 2.1, llamadas: 300 }, { mes: '2026-09', coste: 2.22, llamadas: 320 }],
      costeMedioPorAlumno: 1.35,
    },
  });
}

// ── ACADEMIAS (P11f/P11i, solo superadmin) ──────────────────────────────────

export async function getAcademiesOverview() {
  return ok({
    data: [
      { id: 'org-1', slug: 'alphapol', name: 'Alphapol', alumnos: 6, admins: [{ id: 'u5', email: 'morato@atenea.com' }], costeIA: 4.32, ingresosMes: 180 },
      { id: 'org-2', slug: 'atenea', name: 'Atenea (casa)', alumnos: 1, admins: [], costeIA: 0.4, ingresosMes: 0 },
    ],
  });
}
export async function createAcademy() {
  return { success: true as const, id: 'org-3', slug: 'academia-nueva' };
}
export async function addAcademyAdmin() {
  return { success: true as const, invitada: false };
}

// ── GRUPOS Y TIPOS DE GRUPO (P7/P8) ─────────────────────────────────────────

export async function getGroupKinds() {
  return ok({ kinds: [{ id: 'teoria', label: 'Teoría', lleva_plan: false, sort_order: 1 }, { id: 'fisicas', label: 'Físicas', lleva_plan: true, sort_order: 2 }, { id: 'ingles', label: 'Inglés', lleva_plan: false, sort_order: 3 }, { id: 'otro', label: 'Otro', lleva_plan: false, sort_order: 9 }] });
}
export async function saveGroupKind() { return { success: true as const }; }
export async function deleteGroupKind() { return { success: true as const }; }

export async function getGroups() {
  return ok({
    groups: [
      { id: 'g1', name: 'Teoría mañana', kind: 'teoria', kindLabel: 'Teoría', schedule: 'Aula 2', horario: { weekdays: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '11:00', capacity: 20 }, staffIds: ['s1'], staffNames: ['Marta Ortega'], memberIds: ['u2', 'u3'], miembros: 2, llevaPlan: false, esMulti: false },
      { id: 'g2', name: 'Físicas L-X', kind: 'fisicas', kindLabel: 'Físicas', schedule: null, horario: { weekdays: null, startTime: null, endTime: null, capacity: null }, staffIds: ['s2'], staffNames: ['Javier Ruiz'], memberIds: ['u2'], miembros: 1, llevaPlan: true, esMulti: false },
      // Dos grupos a la MISMA hora, como Alpha y Kappa en Alphapol: el cuadrante
      // tiene que enseñar los dos, uno al lado del otro.
      { id: 'g3', name: 'Promo 44 · Alpha', kind: 'fisicas', kindLabel: 'Físicas', schedule: null, horario: { weekdays: [1, 3], startTime: '08:00', endTime: '09:00', capacity: 30 }, staffIds: ['s2'], staffNames: ['Javier Ruiz'], memberIds: ['u2', 'u4'], miembros: 2, llevaPlan: true, esMulti: false },
      { id: 'g4', name: 'Promo 44 · Kappa', kind: 'fisicas', kindLabel: 'Físicas', schedule: null, horario: { weekdays: [1, 3], startTime: '08:00', endTime: '09:00', capacity: 30 }, staffIds: ['s2'], staffNames: ['Javier Ruiz'], memberIds: ['u7'], miembros: 1, llevaPlan: true, esMulti: false },
      { id: 'g5', name: 'Promo 44 · Zetta', kind: 'fisicas', kindLabel: 'Físicas', schedule: null, horario: { weekdays: [1, 3], startTime: '20:00', endTime: '21:00', capacity: 30 }, staffIds: [], staffNames: [], memberIds: ['u10'], miembros: 1, llevaPlan: true, esMulti: false },
    ],
  });
}
export async function createGroup() { return { success: true as const, error: undefined }; }
export async function updateGroup() { return { success: true as const, error: undefined }; }
export async function deleteGroup() { return { success: true as const }; }
export async function setStudentGroups() { return { success: true as const, error: undefined }; }

// ── ASISTENCIA (regla 82) ───────────────────────────────────────────────────
// Fechas fijas y no «hoy»: la pantalla solo pinta lo que le llega, y unas
// fechas fijas hacen las capturas comparables entre pasadas.
export async function getMisClases() {
  const sesion = (fecha: string, etiqueta: string, falta: boolean, editable = true) => ({ fecha, etiqueta, hora: '09:00', falta, editable, sinClase: false });
  return ok({
    fisicaAparte: true,
    clases: [{
      classId: 'g1', nombre: 'Teoría mañana', horario: 'L · M · X · J · V · 09:00–11:00 · 20 plazas',
      sesiones: [sesion('2026-11-09', 'lun, 9 nov', false, false), sesion('2026-11-10', 'mar, 10 nov', true), sesion('2026-11-11', 'mié, 11 nov', false)],
    }],
  });
}
export async function setMiFalta() { return { success: true as const, error: undefined }; }
// ── ALTA DE VARIOS ALUMNOS (regla 83) ───────────────────────────────────────
export async function altaMasivaAlumnos() {
  return ok({
    resultados: [
      { correo: 'ana.ruiz@gmail.com', estado: 'creada' as const, clave: 'Alpha-rTtt-U7LD' },
      { correo: 'alumno@atenea.com', estado: 'ya_tenia_cuenta' as const },
      { correo: 'mal@ejemplo.com', estado: 'error' as const, error: 'límite de peticiones' },
    ],
    sinProcesar: 0,
  });
}
export async function getAsistenciaAcademia() {
  const s = (nombre: string, hora: string, aforo: number | null, inscritos: number, quienes: string[]) => {
    const asisten = inscritos - quienes.length;
    const libres = aforo === null ? null : aforo - asisten;
    return { classId: nombre, nombre, hora, aforo, inscritos, faltan: quienes.length, asisten, libres, sobreaforo: libres !== null && libres < 0, quienesFaltan: quienes };
  };
  return ok({
    dias: [
      { fecha: '2026-11-10', etiqueta: 'mar, 10 nov', sesiones: [s('Teoría mañana', '09:00', 20, 20, ['alumno@atenea.com', 'alumno.flojo@ejemplo.com']), s('Teoría tarde', '17:00', 20, 21, [])] },
      { fecha: '2026-11-11', etiqueta: 'mié, 11 nov', sesiones: [s('Teoría mañana', '09:00', 20, 20, []), s('Inglés', '19:00', null, 8, ['exento@ejemplo.com'])] },
    ],
    gruposSinHorario: ['Físicas L-X'],
  });
}



// ── ACCESO Y EXENTOS (P6/P12) ────────────────────────────────────────────────

export async function setMembershipRequired() { return { success: true as const }; }
export async function setMemberAccess() { return { success: true as const }; }
export async function activateAllCurrentStudents() { return { success: true as const, activados: 4 }; }
export async function listExemptEmails() { return ok({ emails: ['exento@ejemplo.com'] }); }
export async function addExemptEmail() { return { success: true as const }; }
export async function removeExemptEmail() { return { success: true as const }; }
export async function inviteStudent() { return { success: true as const, invitada: true }; }

// ── INTERRUPTORES DE FÍSICAS (regla 54/68) ──────────────────────────────────

export async function getTrainingSwitches() {
  return ok({ switches: { ai: false, group: true, adaptive: true }, esCasa: false });
}
export async function setTrainingSwitch() { return { success: true as const }; }

// ── PAGOS Y CUOTAS (P8, regla 102) ───────────────────────────────────────────
// Un almacén en memoria con la misma lógica que el servidor (`lib/cuotas.ts`):
// cobrar, deshacer, la cuota de un mes y la propia funcionan de verdad en el
// banco, y el histórico sale de seis meses de datos inventados.

const TARIFA_BANCO: Tarifa = {
  tipos: [
    { id: 'teoria', label: 'Teoría', precio: 60 },
    { id: 'fisicas', label: 'Físicas', precio: 50 },
    { id: 'ingles', label: 'Inglés', precio: 20 },
    { id: 'otro', label: 'Otro', precio: null },
  ],
  packs: [{ id: 'pk1', nombre: 'Completo', tipos: ['fisicas', 'ingles', 'teoria'], precio: 100 }],
};

type AlumnoBanco = { id: string; email: string; tipos: string[]; grupos: string[]; propia: number | null; notaPropia: string | null; desde: number; activo: boolean };
const ALUMNOS_BANCO: AlumnoBanco[] = [
  { id: 'u2', email: 'alumno@atenea.com', tipos: ['teoria', 'fisicas', 'ingles'], grupos: ['Teoría mañana', 'Físicas L-X', 'Inglés B1'], propia: null, notaPropia: null, desde: 6, activo: true },
  { id: 'u3', email: 'alumno.flojo@ejemplo.com', tipos: ['teoria'], grupos: ['Teoría mañana'], propia: null, notaPropia: null, desde: 6, activo: true },
  { id: 'u4', email: 'lucia.martin@gmail.com', tipos: ['fisicas'], grupos: ['Físicas L-X'], propia: null, notaPropia: null, desde: 5, activo: true },
  { id: 'u5', email: 'javier.romero@hotmail.com', tipos: ['teoria', 'ingles'], grupos: ['Teoría tarde', 'Inglés B1'], propia: null, notaPropia: null, desde: 6, activo: true },
  { id: 'u6', email: 'sara.ortiz@gmail.com', tipos: ['teoria'], grupos: ['Teoría tarde'], propia: 45, notaPropia: 'hermana de Javier', desde: 4, activo: true },
  { id: 'u7', email: 'david.navas@gmail.com', tipos: ['teoria', 'fisicas'], grupos: ['Teoría mañana', 'Físicas M-J'], propia: null, notaPropia: null, desde: 3, activo: true },
  { id: 'u8', email: 'elena.ruiz@yahoo.es', tipos: ['ingles', 'otro'], grupos: ['Inglés B1', 'Psicotécnicos'], propia: null, notaPropia: null, desde: 1, activo: true },
  { id: 'u9', email: 'pablo.gil@gmail.com', tipos: [], grupos: [], propia: null, notaPropia: null, desde: 0, activo: true },
  { id: 'u10', email: 'marta.leon@gmail.com', tipos: ['fisicas'], grupos: ['Físicas M-J'], propia: null, notaPropia: null, desde: 2, activo: true },
  { id: 'u11', email: 'ruben.soto@gmail.com', tipos: ['teoria'], grupos: [], propia: null, notaPropia: null, desde: 6, activo: false },
];
const cuotaBanco = (a: AlumnoBanco) => cuotaDeAlumno({ tipos: a.tipos, tarifa: TARIFA_BANCO, propia: a.propia });

/** Seis meses de pagos: casi todos al día, con algún retraso, un pago a medias y una baja. */
const FILAS_BANCO: FilaPagoBD[] = (() => {
  const actual = periodoEnZona();
  const filas: FilaPagoBD[] = [];
  for (const a of ALUMNOS_BANCO) {
    for (let k = a.desde; k >= 1; k--) {
      const period = sumaMeses(actual, -k);
      if (a.id === 'u11' && k < 3) continue; // se dio de baja hace dos meses
      const due = cuotaBanco(a).importe;
      const dia = `${period}-0${(k % 7) + 2}`;
      let amount: number | null = due;
      if (a.id === 'u3' && k === 1) amount = null; // debe el mes pasado
      if (a.id === 'u11' && k === 3) amount = null; // se fue debiendo
      if (a.id === 'u7' && k === 2) amount = 50; // a medias hace dos meses
      if (a.id === 'u8') amount = null; // sin cuota calculada
      filas.push({ user_id: a.id, period, due_eur: due, due_manual: false, amount_eur: amount, paid: due !== null && amount !== null && amount >= due, paid_on: amount ? dia : null, note: null });
    }
  }
  // Este mes: unos ya han pagado, Lucía trajo 30 de 50 y Marta no paga (lesión).
  const pagaron: Record<string, number> = { u2: 100, u5: 80, u6: 45, u4: 30 };
  for (const a of ALUMNOS_BANCO.filter((x) => x.activo)) {
    const due = a.id === 'u10' ? 0 : cuotaBanco(a).importe;
    const amount = pagaron[a.id] ?? null;
    filas.push({ user_id: a.id, period: actual, due_eur: due, due_manual: a.id === 'u10', amount_eur: amount, paid: due === 0 || (due !== null && amount !== null && amount >= due), paid_on: amount ? `${actual}-03` : null, note: a.id === 'u10' ? 'Lesionada este mes' : null });
  }
  return filas;
})();

const filaBanco = (userId: string, period: string) => FILAS_BANCO.find((f) => f.user_id === userId && f.period === period);

/** El libro de cobros del banco: un cobro por cada mes pagado (Lucía, en dos veces). */
let reciboBanco = 0;
const METODOS_BANCO = ['efectivo', 'efectivo', 'bizum', 'efectivo', 'transferencia'] as const;
const COBROS_BANCO: Cobro[] = FILAS_BANCO
  .filter((f) => (f.amount_eur ?? 0) !== 0 && f.amount_eur !== null)
  .sort((a, b) => String(a.paid_on).localeCompare(String(b.paid_on)))
  .map((f) => ({
    id: `cb${++reciboBanco}`, userId: f.user_id as string, alumno: ALUMNOS_BANCO.find((a) => a.id === f.user_id)?.email ?? '',
    periodo: f.period as string, importe: Number(f.amount_eur), metodo: METODOS_BANCO[reciboBanco % METODOS_BANCO.length],
    recibo: reciboBanco, fecha: f.paid_on as string, anulado: false,
  }));
const recalculaBanco = (userId: string, period: string) => {
  const f = filaBanco(userId, period);
  if (!f) return;
  const total = COBROS_BANCO.filter((c) => c.userId === userId && c.periodo === period && !c.anulado).reduce((s, c) => s + c.importe, 0);
  Object.assign(f, filaSegunLibro(f, total));
  f.paid_on = total > 0 ? COBROS_BANCO.filter((c) => c.userId === userId && c.periodo === period && !c.anulado).map((c) => c.fecha).sort().at(-1) : null;
};

export async function getPagos(periodo?: string) {
  const actual = periodoEnZona();
  const siguiente = sumaMeses(actual, 1);
  const p = esPeriodo(periodo) && periodo <= siguiente ? periodo : actual;
  const roster = ALUMNOS_BANCO.filter((a) => a.activo);
  const cuotaPorId = new Map(ALUMNOS_BANCO.map((a) => [a.id, cuotaBanco(a)]));
  const delMes = FILAS_BANCO.filter((f) => f.period === p);
  const ids = new Set<string>([...delMes.map((f) => f.user_id as string), ...(p === siguiente ? roster.map((r) => r.id) : [])]);
  const persona = new Map(ALUMNOS_BANCO.map((a) => [a.id, a]));
  const mes = resumeCuotasMes(p, [...ids].map((id) => ({
    userId: id, email: persona.get(id)?.email ?? null, activo: persona.get(id)?.activo ?? false, cuota: cuotaPorId.get(id) ?? null, fila: filaBanco(id, p) ?? null,
  })));
  const historico = resumeHistoricoCuotas(mesesHasta(actual, 12), actual,
    ALUMNOS_BANCO.map((a) => ({ userId: a.id, email: a.email, activo: a.activo })), FILAS_BANCO.filter((f) => (f.period as string) <= actual));
  const cuotas = roster.map((r) => cuotaPorId.get(r.id)!);
  const faltan = new Map<string, number>();
  for (const c of cuotas) for (const t of c.sinPrecio) faltan.set(t, (faltan.get(t) ?? 0) + 1);
  return ok({
    data: {
      actual, periodo: p, esPrevision: p === siguiente, mes, historico,
      prevision: { periodo: siguiente, previsto: cuotas.reduce((s, c) => s + (c.importe ?? 0), 0), alumnos: roster.length, sinCuota: cuotas.filter((c) => c.importe === null).length },
      avisos: {
        sinPrecio: [...faltan].map(([tipo, alumnos]) => ({ tipo, alumnos })),
        sinGrupos: roster.filter((r) => cuotaPorId.get(r.id)!.origen === 'sin_grupos').map((r) => r.email),
        tarifaVacia: false,
      },
      cuotas: roster.map((r) => ({ userId: r.id, email: r.email, cuota: cuotaPorId.get(r.id)!, notaPropia: r.notaPropia, grupos: r.grupos })),
      cobros: [...COBROS_BANCO],
    },
  });
}

export async function registraCobro(input: { studentId: string; period: string; cantidad?: string | null; metodo?: string }) {
  const lectura = leeImporte(input.cantidad ?? null);
  if (!lectura.ok) return { success: false as const, error: lectura.error };
  let f = filaBanco(input.studentId, input.period);
  if (!f) {
    const a = ALUMNOS_BANCO.find((x) => x.id === input.studentId);
    f = { user_id: input.studentId, period: input.period, due_eur: a ? cuotaBanco(a).importe : null, due_manual: false, amount_eur: null, paid: false, paid_on: null, note: null };
    FILAS_BANCO.push(f);
  }
  const antes = leeApunte(f);
  const r = aplicaCobro({ debido: antes.debido, cobrado: antes.cobrado }, lectura.valor);
  if (!r.ok) return { success: false as const, error: r.error };
  const recibo = ++reciboBanco;
  COBROS_BANCO.push({
    id: `cb${recibo}`, userId: input.studentId, alumno: ALUMNOS_BANCO.find((a) => a.id === input.studentId)?.email ?? '',
    periodo: input.period, importe: r.cobrado - antes.cobrado, metodo: esMetodo(input.metodo) ? input.metodo : 'efectivo',
    recibo, fecha: new Date().toISOString().slice(0, 10), anulado: false,
  });
  recalculaBanco(input.studentId, input.period);
  return { success: true as const, cobrado: r.cobrado, estado: r.estado, recibo };
}
export async function anulaCobro(input: { studentId: string; period: string; cobroId?: string }) {
  for (const c of COBROS_BANCO) {
    if (c.userId === input.studentId && c.periodo === input.period && !c.anulado && (!input.cobroId || c.id === input.cobroId)) c.anulado = true;
  }
  recalculaBanco(input.studentId, input.period);
  return { success: true as const };
}
export async function setCuotaMes(input: { studentId: string; period: string; cuota: string | null; nota: string | null }) {
  const lectura = leeImporte(input.cuota);
  if (!lectura.ok) return { success: false as const, error: lectura.error };
  const a = ALUMNOS_BANCO.find((x) => x.id === input.studentId);
  let f = filaBanco(input.studentId, input.period);
  if (!f) { f = { user_id: input.studentId, period: input.period, amount_eur: null, paid: false }; FILAS_BANCO.push(f); }
  f.due_eur = lectura.valor ?? (a ? cuotaBanco(a).importe : null);
  f.due_manual = lectura.valor !== null;
  f.note = lectura.valor !== null ? input.nota : null;
  recalculaBanco(input.studentId, input.period);
  return { success: true as const };
}
export async function setCuotaPropia(input: { studentId: string; cuota: string | null; nota: string | null }) {
  const lectura = leeImporte(input.cuota);
  if (!lectura.ok) return { success: false as const, error: lectura.error };
  const a = ALUMNOS_BANCO.find((x) => x.id === input.studentId);
  if (a) { a.propia = lectura.valor; a.notaPropia = lectura.valor === null ? null : input.nota; }
  return { success: true as const };
}
export async function getTarifa() { return ok({ tarifa: TARIFA_BANCO }); }
export async function setPrecioTipo(kindId: string, precio: string) {
  const lectura = leeImporte(precio);
  if (!lectura.ok) return { success: false as const, error: lectura.error };
  const t = TARIFA_BANCO.tipos.find((x) => x.id === kindId);
  if (t) t.precio = lectura.valor;
  return { success: true as const };
}
export async function savePack(input: { id?: string; tipos: string[]; precio: string; nombre: string }) {
  const lectura = leeImporte(input.precio);
  if (!lectura.ok || lectura.valor === null) return { success: false as const, error: 'Pon el precio del pack.' };
  const tipos = [...input.tipos].sort();
  const pk = TARIFA_BANCO.packs.find((x) => x.id === input.id);
  if (pk) Object.assign(pk, { tipos, precio: lectura.valor, nombre: input.nombre || nombreDePack(tipos, TARIFA_BANCO) });
  else TARIFA_BANCO.packs.push({ id: `pk${Date.now()}`, tipos, precio: lectura.valor, nombre: input.nombre || nombreDePack(tipos, TARIFA_BANCO) });
  return { success: true as const };
}
export async function deletePack(id: string) {
  TARIFA_BANCO.packs = TARIFA_BANCO.packs.filter((x) => x.id !== id);
  return { success: true as const };
}

// ── LA FÍSICA COMO LA LLEVA UN PREPARADOR (regla 86) ─────────────────────────
// Fechas relativas a hoy: el calendario tiene que salir lleno al abrirlo.
const fFis = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const lunesFis = (n: number) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sesionFis = (id: string, dia: number, kind: 'fuerza' | 'carrera' | 'agilidad' | 'circuito' | 'movilidad' | 'descanso' | 'otro', title: string, extra: Partial<{ description: string; durationMin: number; distanceKm: number; video: string; classId: string | null; userId: string | null }> = {}) => ({
  id, fecha: lunesFis(dia), kind, title, description: extra.description ?? null, durationMin: extra.durationMin ?? null,
  // Los entrenos son del alumno (regla 97); `classId` solo en uno de plan común.
  distanceKm: extra.distanceKm ?? null, video: extra.video ?? null, classId: extra.classId ?? null,
  userId: extra.classId ? null : extra.userId ?? 'u2', position: 0,
  cargas: id === 's4' ? [{ ejercicio: 'Sentadilla', porcentaje: 75, series: 4, reps: 6 }, { ejercicio: 'Press de banca', porcentaje: 70, series: 4, reps: 8 }] : [],
});
const SESIONES_FIS = [
  sesionFis('s1', -7, 'fuerza', 'Tren superior y core', { description: 'Calentamiento: 10′ movilidad de hombro\nDominadas: 5 × máximas · R 2′\nFlexiones: 4 × 15\nPlancha: 3 × 45″', durationMin: 60 }),
  sesionFis('s2', -6, 'carrera', 'Series de 400 m', { description: '15′ trote suave\n6 × 400 m a ritmo de prueba · R 1′30″\n5′ vuelta a la calma', durationMin: 50, distanceKm: 6, classId: 'g1' }),
  sesionFis('s3', -4, 'agilidad', 'Circuito de agilidad', { durationMin: 40, video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
  sesionFis('s4', 0, 'fuerza', 'Fuerza: dominadas lastradas', { description: 'Dominadas lastradas 4 × 5\nRemo invertido 3 × 12', durationMin: 55 }),
  sesionFis('s5', 1, 'carrera', 'Rodaje continuo', { description: '40′ a ritmo cómodo, sin mirar el reloj.', durationMin: 40, distanceKm: 8 }),
  sesionFis('s6', 2, 'movilidad', 'Movilidad y estiramientos', { durationMin: 25 }),
  sesionFis('s7', 3, 'agilidad', 'Simulacro de agilidad', { description: '3 intentos con 5′ de descanso. Cronometra cada uno.', durationMin: 45 }),
  sesionFis('s8', 4, 'carrera', 'Test de 1.000 m', { description: 'Calentamiento 15′ + 1.000 m a tope.', durationMin: 35, distanceKm: 4 }),
  sesionFis('s9', 5, 'circuito', 'Circuito de fuerza-resistencia', { durationMin: 45, classId: null, userId: 'u2' }),
  sesionFis('s10', 6, 'descanso', 'Descanso', {}),
];
const APUNTES_FIS = [
  { sessionId: 's1', userId: 'u2', status: 'hecha' as const, rpe: 8, comment: 'Las dominadas me cuestan mucho todavía', durationMin: 65, distanceKm: null, coachReply: 'Normal. El jueves bajamos el volumen.', email: 'alumno@atenea.com' },
  { sessionId: 's2', userId: 'u2', status: 'hecha' as const, rpe: 6, comment: null, durationMin: null, distanceKm: 6.2, coachReply: null, email: 'alumno@atenea.com' },
  { sessionId: 's3', userId: 'u2', status: 'no_hecha' as const, rpe: null, comment: 'Molestia en el tobillo', durationMin: null, distanceKm: null, coachReply: null, email: 'alumno@atenea.com' },
  { sessionId: 's1', userId: 'u3', status: 'hecha' as const, rpe: 7, comment: null, durationMin: null, distanceKm: null, coachReply: null, email: 'alumno.flojo@ejemplo.com' },
];
// Las clases de grupo del alumno (regla 97): Kappa lunes y miércoles a las
// 08:00, con su profesor; el miércoles, festivo; la semana que viene, aún sin
// escribir; y el jueves, la de Omega, a la que se apuntó como multi.
const claseFis = (dia: number, grupo: string, hora: string, extra: Partial<{ titulo: string; profesor: string; sinClase: boolean; motivo: string; origen: 'grupo' | 'multi'; falta: boolean; editable: boolean }> = {}) => ({
  classId: `g-${grupo.toLowerCase()}`, grupo, fecha: lunesFis(dia), hora,
  sesion: extra.titulo ? { ...sesionFis(`c-${grupo}-${dia}`, dia, 'otro', extra.titulo, { classId: `g-${grupo.toLowerCase()}` }), profesorId: 'p', horaPropia: null } : null,
  profesor: extra.profesor ?? null, sinClase: extra.sinClase ?? false, motivo: extra.motivo ?? null,
  origen: extra.origen ?? 'grupo' as const, falta: extra.falta ?? false, editable: extra.editable ?? true,
});
const CLASES_FIS = [
  claseFis(-7, 'Kappa', '08:00', { titulo: 'FLK 5.0', profesor: 'José Morato', editable: false }),
  claseFis(-5, 'Kappa', '08:00', { titulo: 'F.M + RDL', profesor: 'Lucio', editable: false }),
  claseFis(0, 'Kappa', '08:00', { titulo: 'FLK 5.0', profesor: 'José Morato', editable: false }),
  claseFis(2, 'Kappa', '08:00', { sinClase: true, motivo: 'Festivo', editable: false }),
  claseFis(3, 'Omega', '08:00', { titulo: 'FLK 5.1', profesor: 'Olivares', origen: 'multi' }),
  claseFis(7, 'Kappa', '08:00', {}),
  claseFis(9, 'Kappa', '08:00', { falta: true }),
];
const NOTAS_FIS = [{ weekStart: lunesFis(0), note: 'Semana de test: llegad descansados al viernes', classId: 'g1' }];
const PLANTILLAS_FIS = [
  { id: 'p1', kind: 'carrera' as const, title: 'Series de 400 m', description: '6 × 400 m · R 1′30″', durationMin: 50, distanceKm: 6, video: null, cargas: [] },
  { id: 'p2', kind: 'carrera' as const, title: 'Rodaje suave 30′', description: null, durationMin: 30, distanceKm: 5, video: null, cargas: [] },
  { id: 'p3', kind: 'fuerza' as const, title: 'Dominadas: pirámide', description: '1-2-3-4-3-2-1', durationMin: 30, distanceKm: null, video: null, cargas: [] },
  { id: 'p4', kind: 'agilidad' as const, title: 'Técnica de agilidad', description: null, durationMin: 30, distanceKm: null, video: null, cargas: [] },
];
const RM_FIS = (dias: number) => { const d = new Date(); d.setDate(d.getDate() - dias); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const RMS_FIS = [
  { id: 'r1', ejercicio: 'Sentadilla', pesoKg: 100, reps: 1, fecha: RM_FIS(40), nota: null },
  { id: 'r2', ejercicio: 'Sentadilla', pesoKg: 95, reps: 5, fecha: RM_FIS(5), nota: null },
  { id: 'r3', ejercicio: 'Press de banca', pesoKg: 70, reps: 3, fecha: RM_FIS(5), nota: 'Con ayuda en la última' },
];

export async function getDestinosFisica() {
  return ok({
    grupos: [{ id: 'g1', name: 'Promo 43 · Físicas', kind: 'fisicas', miembros: 3 }, { id: 'g2', name: 'Teoría mañana', kind: 'teoria', miembros: 20 }],
    alumnos: [
      { id: 'u2', email: 'alumno@atenea.com', grupos: ['g1'] },
      { id: 'u3', email: 'alumno.flojo@ejemplo.com', grupos: ['g1'] },
      { id: 'u4', email: 'maria.lopez.garcia.larguisimo@gmail.com', grupos: ['g1'] },
    ],
  });
}
export async function getPlanificador() {
  return ok({
    sesiones: SESIONES_FIS, apuntes: APUNTES_FIS,
    miembros: [{ id: 'u3', email: 'alumno.flojo@ejemplo.com' }, { id: 'u2', email: 'alumno@atenea.com' }, { id: 'u4', email: 'maria.lopez.garcia.larguisimo@gmail.com' }],
    notas: NOTAS_FIS, nombresGrupo: { g1: 'Promo 43 · Físicas' }, rm: {}, hoy: fFis(0), clases: CLASES_FIS,
  });
}
export async function getPlantillas() { return ok({ plantillas: PLANTILLAS_FIS }); }
// «Planificar» por alumno (regla 97): unos con la semana hecha, otros sin.
export async function getAlumnosFisica(params?: { lunes?: string }) {
  const lunes = params?.lunes ?? lunesFis(0);
  const sem = (l: string, sesiones: number, vencidas: number, apuntadas: number) => ({ lunes: l, sesiones, vencidas, apuntadas });
  const sig = (() => { const [y, m, d] = lunes.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + 7)); return x.toISOString().slice(0, 10); })();
  const al = (id: string, email: string, grupos: string[], a: [number, number, number], b: number) => ({ id, email, grupos, semanas: [sem(lunes, ...a), sem(sig, b, 0, 0)] });
  return ok({
    lunes, hoy: fFis(0),
    grupos: [
      { id: 'g-kappa', nombre: 'Promo 44 · Kappa', esMulti: false, conHorario: true },
      { id: 'g-alpha', nombre: 'Promo 44 · Alpha', esMulti: false, conHorario: true },
      { id: 'g-multi', nombre: 'Promo 44 · Multi', esMulti: true, conHorario: false },
      { id: 'g1', nombre: 'Promo 43 · Físicas', esMulti: false, conHorario: false },
    ],
    alumnos: [
      al('u2', 'alumno@atenea.com', ['g-kappa', 'g1'], [5, 1, 0], 3),
      al('u3', 'alumno.flojo@ejemplo.com', ['g-kappa'], [0, 0, 0], 0),
      al('u4', 'maria.lopez.garcia.larguisimo@gmail.com', ['g-alpha'], [4, 1, 1], 0),
      al('u5', 'sin.sexo@ejemplo.com', ['g-alpha'], [3, 0, 0], 3),
      al('u8', 'pablo.multi@gmail.com', ['g-multi'], [0, 0, 0], 2),
    ],
  });
}
export async function copiarAAlumnos() { return { success: true as const, creadas: 10, alumnos: 2 }; }
export async function saveSesion() { return { success: true as const, id: 'nueva' }; }
export async function deleteSesion() { return { success: true as const }; }
export async function moverSesion() { return { success: true as const }; }
export async function copiarSemanaFisica() { return { success: true as const, creadas: 5 }; }
export async function setNotaSemana() { return { success: true as const }; }
export async function responderApunte() { return { success: true as const }; }
export async function savePlantilla() { return { success: true as const, id: 'p9' }; }
export async function deletePlantilla() { return { success: true as const }; }
export async function getMarcasAcademia() {
  const m = (id: string, prueba: 'agilidad' | 'dominadas' | 'suspension' | 'carrera_1000', valor: number, dias: number) => ({ id, prueba, valor, fecha: fFis(-dias), nota: null });
  return ok({
    hoy: fFis(0),
    alumnos: [
      { id: 'u2', email: 'alumno@atenea.com', sexo: 'male' as const, marcas: [m('m1', 'agilidad', 9.6, 30), m('m2', 'agilidad', 9.1, 3), m('m3', 'dominadas', 11, 3), m('m4', 'carrera_1000', 212, 3)], rms: RMS_FIS },
      { id: 'u3', email: 'alumno.flojo@ejemplo.com', sexo: 'male' as const, marcas: [m('m5', 'agilidad', 11.9, 5), m('m6', 'dominadas', 6, 5)], rms: [] },
      { id: 'u4', email: 'maria.lopez.garcia.larguisimo@gmail.com', sexo: 'female' as const, marcas: [m('m7', 'agilidad', 10.6, 2), m('m8', 'suspension', 64, 2), m('m9', 'carrera_1000', 238, 2)], rms: [] },
      { id: 'u5', email: 'sin.sexo@ejemplo.com', sexo: null, marcas: [], rms: [] },
    ],
  });
}
export async function addMarca() { return { success: true as const }; }
export async function deleteMarca() { return { success: true as const }; }
export async function setSexoAlumno() { return { success: true as const }; }
export async function getMiFisica() {
  return ok({
    sesiones: SESIONES_FIS, clases: CLASES_FIS, apuntes: APUNTES_FIS.filter((a) => a.userId === 'u2').map(({ email: _e, ...a }) => a),
    notas: NOTAS_FIS, nombresGrupo: { g1: 'Promo 43 · Físicas' }, hoy: fFis(0),
    rm: { sentadilla: { ejercicio: 'Sentadilla', rm: 110.8 }, 'press de banca': { ejercicio: 'Press de banca', rm: 77 } },
  });
}
export async function setMiApunte() {
  return ok({ apunte: { sessionId: 's4', userId: 'u2', status: 'hecha' as const, rpe: 7, comment: null, durationMin: null, distanceKm: null, coachReply: null } });
}
export async function getMisMarcas() {
  const m = (id: string, prueba: 'agilidad' | 'dominadas' | 'carrera_1000', valor: number, dias: number, porMi = true) => ({ id, prueba, valor, fecha: fFis(-dias), nota: null, porMi });
  return ok({ sexo: 'male' as const, hoy: fFis(0), marcas: [m('m1', 'agilidad', 9.6, 30), m('m2', 'agilidad', 9.1, 3, false), m('m3', 'dominadas', 11, 3), m('m4', 'carrera_1000', 212, 3)],
    rms: RMS_FIS.map((r, i) => ({ ...r, porMi: i > 0 })) });
}
export async function addMiRM() { return { success: true as const }; }
export async function deleteMiRM() { return { success: true as const }; }
export async function addRM() { return { success: true as const }; }
export async function deleteRM() { return { success: true as const }; }
export async function addMiMarca() { return { success: true as const }; }
export async function deleteMiMarca() { return { success: true as const }; }
export async function setMiSexo() { return { success: true as const }; }

// ── CUADRANTE SEMANAL Y MULTI (regla 96) ────────────────────────────────────
// La semana real de Alphapol (9-12 nov 2026), con fechas fijas.
const CUAD_PROFES = [
  { id: 'p-jose', nombre: 'José Morato' }, { id: 'p-lucas', nombre: 'Lucas' }, { id: 'p-olivares', nombre: 'Olivares' },
  { id: 'p-lucio', nombre: 'Lucio' }, { id: 'p-juan', nombre: 'Juan' },
];
const cuadGrupo = (corto: string, dias: number[] | null, inicio: string | null, multi = false) => ({
  id: `g-${corto.toLowerCase()}`, nombre: `Promo 44 · ${corto}`, corto, esMulti: multi, inscritos: multi ? 14 : 20,
  horario: { weekdays: dias, startTime: inicio, endTime: inicio ? `${String(Number(inicio.slice(0, 2)) + 1).padStart(2, '0')}:00` : null, capacity: multi ? null : 30 },
});
const CUAD_GRUPOS = [
  cuadGrupo('Kappa', [1, 3], '08:00'), cuadGrupo('Alpha', [1, 3], '08:00'), cuadGrupo('Zetta', [1, 3], '20:00'),
  cuadGrupo('Omega', [2, 4], '08:00'), cuadGrupo('Sigma', [2, 4], '08:00'), cuadGrupo('Betta', [2, 4], '20:00'), cuadGrupo('Delta', [2, 4], '20:00'),
  cuadGrupo('Multi', null, null, true),
];
let cuadN = 0;
const cs = (corto: string, fecha: string, titulo: string, profesorId: string | null, horaPropia: string | null = null) =>
  ({ id: `cs${++cuadN}`, classId: `g-${corto.toLowerCase()}`, fecha, titulo, tipo: 'otro' as const, profesorId, horaPropia, position: 0 });
const CUAD_SESIONES = [
  cs('Kappa', '2026-11-09', 'FLK 5.0', 'p-jose'), cs('Alpha', '2026-11-09', 'Boxeo', 'p-juan'), cs('Zetta', '2026-11-09', 'F.M + RDL', 'p-lucio'),
  cs('Omega', '2026-11-10', 'Jiujitsu', 'p-lucas'), cs('Sigma', '2026-11-10', 'FLK 5.0', 'p-jose'), cs('Betta', '2026-11-10', 'FLK 5.0', 'p-olivares'),
  cs('Delta', '2026-11-10', 'F.M + RDL', 'p-lucio'), cs('Multi', '2026-11-10', 'Jiujitsu', 'p-lucas', '18:30'),
  cs('Kappa', '2026-11-11', 'F.M + RDL', 'p-lucio'), cs('Alpha', '2026-11-11', 'FLK 5.1', 'p-jose'), cs('Zetta', '2026-11-11', 'FLK 5.1', 'p-olivares'),
  // Un choque a propósito para ver el aviso: Lucas con Sigma y con Omega a la vez.
  cs('Omega', '2026-11-12', 'FLK 5.1', 'p-lucas'), cs('Sigma', '2026-11-12', 'F.M + RDL', 'p-lucas'), cs('Betta', '2026-11-12', 'F.M + RDL', 'p-lucio'),
  cs('Delta', '2026-11-12', 'FLK 5.0', 'p-jose'), cs('Multi', '2026-11-12', 'Boxeo', 'p-juan', '18:30'),
];
export async function getCuadrante(params?: { lunes?: string }) {
  const lunes = params?.lunes ?? '2026-11-09';
  const sesiones = lunes === '2026-11-09' ? CUAD_SESIONES : [];
  const plaza = (aforo: number, asisten: number) => ({ aforo, inscritos: 20, faltan: 0, asisten, libres: aforo - asisten, sobreaforo: false });
  // `?sinclase=no` quita la marca del miércoles, para ver la semana entera.
  const conMarca = typeof location === 'undefined' || !/sinclase=no/.test(location.search);
  return ok({
    datos: {
      lunes, hoy: '2026-11-10', grupos: CUAD_GRUPOS, profesores: CUAD_PROFES, sesiones,
      // Zetta no tiene clase el miércoles: sale abajo, en «Sin clase esta semana».
      sinClase: lunes === '2026-11-09' && conMarca ? [{ classId: 'g-zetta', fecha: '2026-11-11', motivo: 'Sin profesor' }] : [],
      plazas: {
        'g-kappa|2026-11-09': { aforo: 30, inscritos: 20, faltan: 1, asisten: 21, libres: 9, sobreaforo: false },
        'g-omega|2026-11-10': plaza(30, 30), 'g-sigma|2026-11-10': plaza(30, 24),
      },
      multis: { 'g-kappa|2026-11-09': [{ userId: 'u2', email: 'alumno@atenea.com' }, { userId: 'u4', email: 'maria.lopez.garcia.larguisimo@gmail.com' }] },
      faltan: { 'g-kappa|2026-11-09': [{ userId: 'u7', email: 'lucia.fernandez@gmail.com' }] },
      alumnosMulti: [
        { userId: 'u2', email: 'alumno@atenea.com' }, { userId: 'u4', email: 'maria.lopez.garcia.larguisimo@gmail.com' },
        { userId: 'u8', email: 'pablo.multi@gmail.com' },
      ],
      totalMultis: 14,
      titulos: ['FLK 5.0', 'F.M + RDL', 'FLK 5.1', 'Boxeo', 'Jiujitsu', 'Rodaje 40′', 'Circuito de agilidad'],
      // La del 9 de noviembre, publicada; las demás, sin publicar (regla 98).
      publicada: lunes === '2026-11-09' ? '2026-11-08T18:12:00Z' : null,
      // Los habituales que aprobó el dueño (regla 100).
      habituales: [
        { actividad: 'Boxeo', profesorIds: ['p-juan'] }, { actividad: 'F.M + RDL', profesorIds: ['p-lucio', 'p-jose'] },
        { actividad: 'FLK', profesorIds: ['p-jose', 'p-olivares'] }, { actividad: 'Jiujitsu', profesorIds: ['p-lucas'] },
      ],
    },
  });
}
export async function saveCelda() { return { success: true as const, id: 'cs-nueva' }; }
export async function publicarCuadrante(params?: { publicar?: boolean }) {
  return { success: true as const, publicada: params?.publicar ? new Date().toISOString() : null };
}
export async function copiarCelda() { return { success: true as const, copiadas: 2 }; }
export async function setSinClase() { return { success: true as const }; }
export async function borrarSesionesDia() { return { success: true as const, borradas: 1 }; }
export async function setMultiEnClase() { return { success: true as const }; }
export async function moverMulti() { return { success: true as const }; }
export async function copiarCuadrante() { return { success: true as const, creadas: 12, omitidas: 0 }; }
export async function getMiMulti() {
  const s = (classId: string, grupo: string, fecha: string, etiqueta: string, hora: string, titulo: string | null, profesor: string | null, libres: number | null, unido: boolean, editable = true) =>
    ({ classId, grupo, fecha, etiqueta, hora, titulo, profesor, libres, unido, editable, llena: !unido && libres === 0 });
  return ok({
    esMulti: true as const,
    semanas: [
      { classId: 'g-kappa', grupo: 'Kappa', lunes: '2026-11-09', total: 1, unidas: 1 },
      { classId: 'g-omega', grupo: 'Omega', lunes: '2026-11-09', total: 2, unidas: 0 },
      { classId: 'g-delta', grupo: 'Delta', lunes: '2026-11-09', total: 2, unidas: 1 },
      { classId: 'g-kappa', grupo: 'Kappa', lunes: '2026-11-16', total: 2, unidas: 0 },
    ],
    dias: [
      { fecha: '2026-11-11', etiqueta: 'mié, 11 nov', sesiones: [s('g-kappa', 'Kappa', '2026-11-11', 'mié, 11 nov', '08:00', 'F.M + RDL', 'Lucio', 9, true)] },
      { fecha: '2026-11-12', etiqueta: 'jue, 12 nov', sesiones: [
        s('g-omega', 'Omega', '2026-11-12', 'jue, 12 nov', '08:00', 'FLK 5.1', 'Olivares', 0, false),
        s('g-delta', 'Delta', '2026-11-12', 'jue, 12 nov', '20:00', 'FLK 5.0', 'José', 12, true),
      ] },
      { fecha: '2026-11-16', etiqueta: 'lun, 16 nov', sesiones: [s('g-kappa', 'Kappa', '2026-11-16', 'lun, 16 nov', '08:00', null, null, null, false)] },
    ],
  });
}
export async function setMiUnion() { return { success: true as const }; }
export async function setMiUnionSemana() { return { success: true as const, cambiadas: 2, completas: 0 }; }

// ── EL CALENDARIO (regla 105) ────────────────────────────────────────────────
// Seis semanas alrededor de hoy: teoría e inglés del horario, física con su
// sesión del cuadrante (Alpha y Kappa a la misma hora), sueltas de Multi a las
// 18:30, entrenos de dos alumnos, un festivo y el examen.

const H = (weekdays: number[] | null, startTime: string | null, endTime: string | null, capacity: number | null) => ({ weekdays, startTime, endTime, capacity });
const GRUPOS_CAL: GrupoCal[] = [
  { id: 'c-teo', nombre: 'Teoría mañana', kind: 'teoria', kindLabel: 'Teoría', llevaPlan: false, esMulti: false, horario: H([1, 2, 3, 4], '10:00', '13:00', 34), profesorIds: ['p-marta'] },
  { id: 'c-teo2', nombre: 'Teoría tarde', kind: 'teoria', kindLabel: 'Teoría', llevaPlan: false, esMulti: false, horario: H([1, 3], '17:00', '19:00', 30), profesorIds: ['p-carlos'] },
  { id: 'c-ing', nombre: 'Inglés B1', kind: 'ingles', kindLabel: 'Inglés', llevaPlan: false, esMulti: false, horario: H([2, 4], '19:00', '20:00', null), profesorIds: ['p-laura'] },
  { id: 'c-alpha', nombre: 'Promo 44 · Alpha', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([1, 3], '08:00', '09:00', 30), profesorIds: [] },
  { id: 'c-kappa', nombre: 'Promo 44 · Kappa', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([1, 3], '08:00', '09:00', 30), profesorIds: [] },
  { id: 'c-omega', nombre: 'Promo 44 · Omega', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([2, 4], '08:00', '09:00', 30), profesorIds: [] },
  { id: 'c-zetta', nombre: 'Promo 44 · Zetta', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: false, horario: H([1, 3], '20:00', '21:00', 30), profesorIds: [] },
  { id: 'c-multi', nombre: 'Promo 44 · Multi', kind: 'fisicas', kindLabel: 'Físicas', llevaPlan: true, esMulti: true, horario: H(null, null, null, null), profesorIds: [] },
];
const PROFES_CAL = new Map([['p-marta', 'Marta Ortega'], ['p-carlos', 'Carlos Ruiz'], ['p-laura', 'Laura Gil'], ['p-juan', 'Juan'], ['p-jose', 'José'], ['p-lucas', 'Lucas'], ['p-lucio', 'Lucio']]);
const ROTACION: [string, string][] = [['Boxeo', 'p-juan'], ['FLK 5.0', 'p-jose'], ['F.M + RDL', 'p-lucio'], ['Jiujitsu', 'p-lucas'], ['FLK 5.1', 'p-jose']];

export async function getCalendario(params: { desde: string; hasta: string }) {
  const hoy = ahoraEnZona(Date.now()).fecha;
  const sesiones: SesionCal[] = [];
  let n = 0;
  for (let f = sumaDiasCal(hoy, -35); f <= sumaDiasCal(hoy, 35); f = sumaDiasCal(f, 1)) {
    const d = diaSemanaDe(f);
    for (const g of GRUPOS_CAL.filter((x) => x.llevaPlan && !x.esMulti && x.horario.weekdays?.includes(d))) {
      // La semana que viene, Kappa aún sin planificar.
      if (g.id === 'c-kappa' && f > sumaDiasCal(hoy, 7)) continue;
      const [titulo, profe] = ROTACION[(n++) % ROTACION.length];
      sesiones.push({ id: `cs${n}`, classId: g.id, userId: null, fecha: f, inicio: null, titulo, profesorId: profe, duracionMin: 60 });
    }
    if (d === 2 || d === 4) sesiones.push({ id: `cm${n++}`, classId: 'c-multi', userId: null, fecha: f, inicio: '18:30:00', titulo: d === 2 ? 'Jiujitsu' : 'Boxeo', profesorId: d === 2 ? 'p-lucas' : 'p-juan', duracionMin: 60 });
    if (d <= 5) {
      sesiones.push({ id: `ce${n++}`, classId: null, userId: 'u2', fecha: f, inicio: null, titulo: d % 2 ? 'Carrera 5 km' : 'Fuerza tren superior', profesorId: null, duracionMin: 45 });
      if (d === 1 || d === 4) sesiones.push({ id: `ce${n++}`, classId: null, userId: 'u4', fecha: f, inicio: '19:00:00', titulo: 'Series 400 m', profesorId: 'p-lucio', duracionMin: 45 });
    }
  }
  const lunes = sumaDiasCal(hoy, 1 - diaSemanaDe(hoy));
  const eventos = armaCalendario({
    desde: params.desde, hasta: params.hasta, grupos: GRUPOS_CAL, sesiones,
    sinClase: [{ classId: 'c-zetta', fecha: sumaDiasCal(lunes, 2), motivo: 'Festivo local' }, { classId: 'c-teo', fecha: sumaDiasCal(lunes, 9), motivo: 'Simulacro en el aula' }],
    profesores: PROFES_CAL,
    alumnos: new Map([['u2', 'alumno@atenea.com'], ['u4', 'lucia.martin@gmail.com']]),
    cuentas: new Map([[`c-alpha|${lunes}`, { inscritos: 28, faltan: 2, multis: 3 }], [`c-teo|${sumaDiasCal(lunes, 1)}`, { inscritos: 33, faltan: 0, multis: 0 }]]),
    inscritos: new Map([['c-teo', 31], ['c-teo2', 22], ['c-ing', 9], ['c-alpha', 27], ['c-kappa', 30], ['c-omega', 18], ['c-zetta', 12]]),
    examen: sumaDiasCal(hoy, 26),
  });
  return ok({
    datos: {
      desde: params.desde, hasta: params.hasta, hoy, eventos,
      grupos: GRUPOS_CAL.map((g) => ({ id: g.id, nombre: g.nombre, kind: g.kind, color: colorDe(g), esMulti: g.esMulti })),
      tipos: [{ id: 'teoria', label: 'Teoría' }, { id: 'ingles', label: 'Inglés' }, { id: 'fisicas', label: 'Físicas' }],
      profesores: [...PROFES_CAL].map(([id, nombre]) => ({ id, nombre })),
    },
  });
}

// ============================================================
// DATOS DE DEMOSTRACIÓN (regla 106)
// ============================================================
//
// La tarjeta de «Ajustes» en el banco: una carga que avanza fase a fase, un
// ensayo con filas «colgadas» y un borrado que tarda dos llamadas. Con
// `?demo=hay` el banco arranca con una carga completa, y con `?demo=medias`
// con una carga a medias. Nada de esto habla con Supabase.

import type { EstadoDemo, FaseDemo } from '../app/lib/demo-fases';

const TANDAS_DEMO: { fase: FaseDemo; tandas: number }[] = [
  { fase: 'cuentas', tandas: 4 }, { fase: 'grupos', tandas: 1 }, { fase: 'fisica', tandas: 1 }, { fase: 'respuestas', tandas: 5 }, { fase: 'cobros', tandas: 6 },
];
const TOTAL_TANDAS_DEMO = TANDAS_DEMO.reduce((s, f) => s + f.tandas, 0);
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

const arranqueDemo = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('demo') : null;
let estadoDemo: EstadoDemo = arranqueDemo === 'hay'
  ? { hay: true, periodo: periodoEnZona(), filas: 12_418, cuentas: 45, completa: true, hechas: TOTAL_TANDAS_DEMO, tandas: TOTAL_TANDAS_DEMO }
  : arranqueDemo === 'medias'
    ? { hay: true, periodo: periodoEnZona(), filas: 4_310, cuentas: 45, completa: false, hechas: 9, tandas: TOTAL_TANDAS_DEMO }
    : { hay: false, periodo: null, filas: 0, cuentas: 0, completa: false, hechas: 0, tandas: TOTAL_TANDAS_DEMO };
let borradosDemo = 0;

export async function getEstadoDemo() {
  return ok({ data: { estado: estadoDemo, mesActual: periodoEnZona(), fases: TANDAS_DEMO } });
}

export async function cargaDemoFase(input: { fase: FaseDemo; tanda: number }) {
  await pausa(arranqueDemo === 'rapido' ? 5 : 350);
  const total = TANDAS_DEMO.find((f) => f.fase === input.fase)!.tandas;
  estadoDemo = { ...estadoDemo, hay: true, periodo: periodoEnZona(), filas: estadoDemo.filas + 280, cuentas: input.fase === 'cuentas' ? estadoDemo.cuentas + 12 : estadoDemo.cuentas, hechas: Math.min(estadoDemo.tandas, estadoDemo.hechas + 1) };
  estadoDemo.completa = estadoDemo.hechas >= estadoDemo.tandas;
  return ok({
    fase: input.fase, tanda: input.tanda, tandas: total, siguiente: input.tanda + 1 < total ? input.tanda + 1 : null, filas: 280, texto: 'hecha',
    claveAlumno: input.fase === 'cuentas' && input.tanda === 0 ? 'Aa1xK7mQpR4vTz9HcB2nWdY6' : undefined,
  });
}

export async function ensayoDemo() {
  await pausa(200);
  return ok({
    data: {
      filas: [
        { tabla: 'question_attempts', total: 9_859, registradas: 9_859, colgadas: 0 },
        { tabla: 'training_sessions', total: 269, registradas: 269, colgadas: 0 },
        { tabla: 'monthly_payments', total: 212, registradas: 211, colgadas: 1 },
        { tabla: 'physical_marks', total: 315, registradas: 315, colgadas: 0 },
        { tabla: 'class_members', total: 80, registradas: 79, colgadas: 1 },
        { tabla: 'payment_entries', total: 175, registradas: 174, colgadas: 1 },
        { tabla: 'class_absences', total: 29, registradas: 28, colgadas: 1 },
        { tabla: 'class_groups', total: 2, registradas: 2, colgadas: 0 },
        { tabla: 'class_week_publications', total: 3, registradas: 3, colgadas: 0 },
      ],
      total: 10_944, colgadas: 4, cuentas: 45,
      avisos: ['Hay 1 cobro que no es de la demo: el contador de recibos NO se toca y habrá un hueco en la numeración. Los recibos del 1 al 174 eran de la demo.', 'El registro de auditoría no se toca (3 apuntes nombran cuentas de la demo).'],
    },
  });
}

export async function borraDemoPaso(input: { confirmacion: string }) {
  if (input.confirmacion !== 'BORRAR') return { success: false as const, error: 'Escribe BORRAR para confirmar.' };
  await pausa(arranqueDemo === 'rapido' ? 5 : 450);
  borradosDemo++;
  if (borradosDemo < 2) return ok({ hecho: false, borradas: 9_000, avisos: [] as string[] });
  borradosDemo = 0;
  estadoDemo = { hay: false, periodo: null, filas: 0, cuentas: 0, completa: false, hechas: 0, tandas: TOTAL_TANDAS_DEMO };
  return ok({ hecho: true, borradas: 1_989, avisos: ['Hay 1 cobro que no es de la demo: el contador de recibos NO se toca y habrá un hueco en la numeración.'] });
}
