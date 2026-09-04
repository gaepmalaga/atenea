/**
 * Las 48 Server Actions, sustituidas por datos de prueba.
 *
 * Sirve para USAR la interfaz de verdad —pinchando, respondiendo, navegando—
 * sin Supabase ni Gemini. No es un test automático: es el banco donde se
 * comprueba a mano lo que una captura no enseña (el scroll, el botón Atrás,
 * reanudar un examen, que el chat no se borre al cambiar de pestaña).
 */

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
      { title: 'Lunes · Tracción', exercises: ['4x3 dominadas negativas', '3x8 remo invertido', '3x30s plancha'] },
      { title: 'Martes · Rodaje suave', exercises: ['30 min a ritmo cómodo'] },
      { title: 'Miércoles · Descanso', exercises: [] },
      { title: 'Jueves · Series', exercises: ['6x400m con 90s de recuperación'] },
      { title: 'Viernes · Circuito', exercises: ['3 vueltas: 10 burpees, 15 sentadillas, 20 abdominales'] },
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
  origin: i % 4 === 0 ? 'live_ai' : 'bank',
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

export async function getPsychProfile() {
  return ok({ data: { user_id: '11111111-1111-1111-1111-111111111111', answers: {} } });
}

export async function getModuleSettings() {
  return ok({ settings: { home: true, chat: true, test: true, review: true, cards: true, training: true, interview: true, stats: true } });
}

export async function getUserStats() {
  return ok({
    stats: {
      total: 42, correct: 24, wrong: 12, blank: 6, answered: 36, winRate: 67,
      avgTimeMs: 18400, timedCount: 30, uncertaintyIndex: 35, changesCount: 14,
      errorBreakdown: { olvido: 5, trampa: 4, desconocimiento: 2, fallo_procesamiento: 1 },
      taggedErrors: 12,
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

export async function getStudentTopics() { return ok({ topics: TEMAS }); }
export async function getStudentSubjects() {
  return ok({ subjects: TEMAS.map((t, i) => ({ id: i + 1, title: t })) });
}

export async function getQuestionsFromBank({ limit = 5 }: { topic: string; difficulty: number; limit: number }) {
  return ok({ data: Array.from({ length: limit }, (_, i) => pregunta(i)) });
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
  return ok({ data: { id: 'fc-1', front: '¿Qué órgano nombra al Defensor del Pueblo?', back: 'Las Cortes Generales, según el artículo 54 de la Constitución.', isReview: false } });
}
export async function saveFlashcardProgress() { return { success: true as const }; }

export async function getPhysicalProfile() {
  return ok({ data: { height: 178, weight: 74, max_pullups: 9, cooper_meters: 2650, agility_seconds: 9.4 } });
}
export async function savePhysicalProfile() { return { success: true as const }; }
export async function getActiveTrainingPlan() { return ok({ plan: PLAN }); }
export async function generateWeeklyPlan() { return ok({ data: null }); }
export async function generateNextWeek() { return ok({ plan: PLAN }); }
export async function completeTrainingDay() { return { success: true as const }; }

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

// ---------- ADMINISTRACIÓN ----------

export async function getAdminUsersList() {
  return ok({
    users: [
      { id: 'u1', email: 'gaepmalaga@gmail.com', role: 'admin', total_tests: 42, win_rate: 67 },
      { id: 'u2', email: 'alumno.que.acaba.de.registrarse@ejemplo.com', role: 'student', total_tests: 0, win_rate: null },
      { id: 'u3', email: 'alumno.flojo@ejemplo.com', role: 'student', total_tests: 18, win_rate: 31 },
    ],
  });
}

export async function getOfficialSyllabus() {
  return ok({
    syllabus: [
      { id: 1, name: 'Ciencias Jurídicas', subjects: TEMAS.slice(0, 3).map((t, i) => ({ id: i + 1, number: i + 1, title: t, documents: i === 0 ? [{ id: `d${i}`, filename: 'tema-01', chunk_count: 42, index_status: 'indexado', uploaded_at: new Date().toISOString() }] : [], docCount: i === 0 ? 1 : 0 })) },
      { id: 2, name: 'Ciencias Sociales', subjects: [{ id: 4, number: 4, title: TEMAS[3], documents: [], docCount: 0 }] },
    ],
  });
}

export async function getAdminQuestionBank() {
  return ok({ data: Array.from({ length: 6 }, (_, i) => pregunta(i)), total: 6, page: 1, totalPages: 1, status: 'active' });
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
      alumnos: [
        { id: 'u2', email: 'alumno.que.acaba.de.registrarse@ejemplo.com', role: 'student', contestadas: 0, blancos: 0, aciertos: 0, winRate: null, ultimaActividad: null, diasSinEntrar: null, estado: 'nunca_entro' as const },
        { id: 'u3', email: 'alumno.flojo@ejemplo.com', role: 'student', contestadas: 18, blancos: 3, aciertos: 6, winRate: 31, ultimaActividad: new Date(Date.now() - 14 * 86400000).toISOString(), diasSinEntrar: 14, estado: 'abandonado' as const },
        { id: 'u1', email: 'gaepmalaga@gmail.com', role: 'admin', contestadas: 36, blancos: 6, aciertos: 24, winRate: 67, ultimaActividad: new Date().toISOString(), diasSinEntrar: 0, estado: 'activo' as const },
      ],
      porEstado: { nunca_entro: 1, activo: 1, en_riesgo: 0, abandonado: 1 },
      cobertura: [
        { subjectId: 1, title: TEMAS[0], preguntas: 24, alumnos: 2 },
        { subjectId: 2, title: TEMAS[1], preguntas: 0, alumnos: 0 },
        { subjectId: 3, title: TEMAS[2], preguntas: 12, alumnos: 0 },
      ],
      sospechosas: [{ questionId: 'q-1', veces: 22, aciertos: 2, winRate: 9, texto: '¿Pregunta que casi todos fallan y probablemente esté mal redactada?', tema: TEMAS[0] }],
    },
  });
}

export async function getStudentDetail() { return ok({ data: null }); }
export async function getGlobalActivity() {
  // `activity`, no `data`, y con `question_text` YA APLANADO: la accion de
  // verdad deshace el join antes de devolverlo.
  return ok({
    activity: Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      user_id: 'u3',
      topic: TEMAS[i % TEMAS.length],
      is_correct: i % 2 === 0,
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      question_text: `Pregunta contestada hace ${i + 1} hora${i === 0 ? '' : 's'} sobre el articulado del tema.`,
    })),
  });
}
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
export async function seedQuestionBank() { return ok({ inserted: 5, duplicated: 1, failed: 0, requested: 6, status: 'active' }); }
export async function uploadTopicPDF() { return ok({ complete: true, indexed: 42, total: 42, failures: [], withReference: 40, message: 'Indexado completo: 42 fragmentos.' }); }
export async function reindexDocument() { return ok({ status: 'indexado', indexed: 42, total: 42, withReference: 40, failures: [] }); }
export async function deleteDocument() { return { success: true as const }; }
export async function deleteTopic() { return { success: true as const }; }
export async function setModuleEnabled() { return { success: true as const }; }
