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

export async function getFailedQuestions() {
  return ok({
    data: Array.from({ length: 5 }, (_, i) => ({
      question_id: `q-${i}`,
      question_text: `Pregunta fallada ${i + 1}: ¿cuál es el plazo previsto en el artículo ${i + 20}?`,
      options: ['Quince días', 'Un mes', 'Tres meses'],
      correct_index: 1,
      explanation: 'El plazo es de un mes desde la notificación.',
      topic: TEMAS[i % TEMAS.length],
      legal_reference: `Artículo ${i + 20}`,
      times: i === 0 ? 3 : 1,
      last_error_type: ['olvido', 'trampa', 'desconocimiento', 'fallo_procesamiento'][i % 4],
      last_failed_at: new Date(Date.now() - i * 86400000).toISOString(),
    })),
  });
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
export async function getActiveTrainingPlan() { return ok({ data: null }); }
export async function generateWeeklyPlan() { return ok({ data: null }); }
export async function generateNextWeek() { return ok({ data: null }); }
export async function completeTrainingDay() { return { success: true as const }; }

export async function getBiodata() { return ok({ data: null }); }
export async function saveBiodata() { return { success: true as const }; }
export async function processInterviewTurn() { return ok({ reply: 'Cuénteme por qué quiere ser policía.', finished: false }); }
export async function evaluateInterview() { return ok({ report: null }); }

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
  return ok({ data: Array.from({ length: 6 }, (_, i) => pregunta(i)), total: 6, page: 1, totalPages: 1 });
}

export async function getModerationQueue() {
  return ok({
    data: {
      candidates: Array.from({ length: 2 }, (_, i) => ({ ...pregunta(i), subject_title: TEMAS[0] })),
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
  return ok({ data: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, user_id: 'u3', topic: TEMAS[i % TEMAS.length], is_correct: i % 2 === 0, created_at: new Date(Date.now() - i * 3600000).toISOString(), question: { question_text: `Actividad ${i}` } })) });
}
export async function getDocumentChunks() {
  return ok({ data: Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, content_chunk: `Artículo ${i + 1}. Contenido del fragmento indexado número ${i + 1}, con texto suficiente para ver cómo se pliega y se despliega en la pantalla.`, reference: i < 4 ? `Artículo ${i + 1}` : null })) });
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
export async function reindexDocument() { return ok({ status: 'indexado', indexed: 42, total: 42, withReference: 40 }); }
export async function deleteDocument() { return { success: true as const }; }
export async function setModuleEnabled() { return { success: true as const }; }
