import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  candidateTurns,
  canEvaluate,
  trimContext,
  formatTranscript,
  normalizeReport,
  MAX_CONTEXT_TURNS,
  MAX_TURN_CHARS,
  MIN_TURNS_FOR_REPORT,
  buildInterviewProfile,
  summarizeLegalIssues,
  hasProfileContent,
  MAX_PROFILE_FIELD_CHARS,
  type InterviewTurn,
} from '../app/lib/interview';

/**
 * El modulo de entrevista tenia todo el peso en presionar al aspirante y nada
 * en devolverle algo: ni transcripcion ni informe. La sesion terminaba y el
 * alumno se quedaba igual que empezo.
 */

const turn = (speaker: InterviewTurn['speaker'], text: string): InterviewTurn => ({ speaker, text });

const entrevista: InterviewTurn[] = [
  turn('inspector', '¿Por que quiere ser Policia Nacional?'),
  turn('candidato', 'Por vocacion de servicio publico.'),
  turn('inspector', 'Eso lo dice todo el mundo. Concrete.'),
  turn('candidato', 'Mi padre fue guardia civil y crecí viendo el oficio.'),
  turn('inspector', '¿Y si su padre le hubiera dicho que no?'),
  turn('candidato', 'Lo habria hecho igual.'),
];

describe('candidateTurns', () => {
  it('solo cuenta lo que dice el aspirante', () => {
    expect(candidateTurns(entrevista)).toHaveLength(3);
  });

  it('descarta los turnos vacios', () => {
    expect(candidateTurns([turn('candidato', '   '), turn('candidato', 'algo')])).toHaveLength(1);
  });
});

describe('canEvaluate', () => {
  it('exige un minimo de respuestas para que el informe diga algo', () => {
    // Un informe sobre una sola respuesta no evalua nada: seria inventarselo.
    expect(canEvaluate([])).toBe(false);
    expect(canEvaluate([turn('candidato', 'una')])).toBe(false);
    expect(canEvaluate(entrevista)).toBe(true);
  });

  it('las preguntas del inspector no cuentan para el minimo', () => {
    const soloInspector = Array.from({ length: 10 }, () => turn('inspector', 'pregunta'));
    expect(canEvaluate(soloInspector)).toBe(false);
    expect(MIN_TURNS_FOR_REPORT).toBeGreaterThan(0);
  });
});

describe('trimContext', () => {
  it('se queda con los ultimos turnos', () => {
    const larga = Array.from({ length: 30 }, (_, i) => turn('candidato', `turno ${i}`));
    const trimmed = trimContext(larga);
    expect(trimmed).toHaveLength(MAX_CONTEXT_TURNS);
    expect(trimmed[trimmed.length - 1].text).toBe('turno 29');
  });

  it('recorta cada turno', () => {
    expect(trimContext([turn('candidato', 'z'.repeat(5000))])[0].text).toHaveLength(MAX_TURN_CHARS);
  });
});

describe('formatTranscript', () => {
  it('etiqueta quien habla', () => {
    const t = formatTranscript(entrevista);
    expect(t).toContain('INSPECTOR:');
    expect(t).toContain('ASPIRANTE:');
  });

  it('conserva el orden de la conversacion', () => {
    const t = formatTranscript(entrevista);
    expect(t.indexOf('vocacion')).toBeLessThan(t.indexOf('guardia civil'));
  });

  it('sin turnos devuelve cadena vacia', () => {
    expect(formatTranscript([])).toBe('');
  });
});

const informe = {
  score: 72,
  veredicto: 'Discurso coherente pero con motivacion poco concreta.',
  fortalezas: ['Mantiene la calma bajo presion'],
  contradicciones: ['Dice que lo haria igual, pero justifica la vocacion por su padre'],
  recomendaciones: ['Preparar ejemplos concretos de servicio publico'],
};

describe('normalizeReport', () => {
  it('acepta un informe completo', () => {
    expect(normalizeReport(informe)).toEqual(informe);
  });

  it('acota la puntuacion a 0-100', () => {
    expect(normalizeReport({ ...informe, score: 250 })?.score).toBe(100);
    expect(normalizeReport({ ...informe, score: -30 })?.score).toBe(0);
    expect(normalizeReport({ ...informe, score: 'ocho' })?.score).toBe(0);
  });

  it('tolera listas ausentes', () => {
    const r = normalizeReport({ score: 50, veredicto: 'Correcto', fortalezas: null });
    expect(r?.fortalezas).toEqual([]);
    expect(r?.contradicciones).toEqual([]);
  });

  it('limpia las entradas vacias de las listas', () => {
    const r = normalizeReport({ ...informe, fortalezas: ['buena', '  ', '', 'otra'] });
    expect(r?.fortalezas).toEqual(['buena', 'otra']);
  });

  it('descarta un informe que no dice nada', () => {
    // Un informe sin veredicto, sin fortalezas y sin recomendaciones no es un
    // informe: es mejor decirselo al alumno que pintarle una pantalla vacia.
    expect(normalizeReport({ score: 60, fortalezas: [], contradicciones: [], recomendaciones: [] })).toBeNull();
    expect(normalizeReport(null)).toBeNull();
    expect(normalizeReport('texto')).toBeNull();
  });
});

describe('la sala usa el contrato', () => {
  const src = readFileSync(
    join(__dirname, '..', 'app/components/student/modules/interview/InterviewRoom.tsx'),
    'utf-8'
  );
  const server = readFileSync(join(__dirname, '..', 'app/actions/interview.ts'), 'utf-8');

  it('un navegador sin reconocimiento de voz tiene su propio estado', () => {
    // Antes era un `alert()` en mitad del flujo: la pantalla se quedaba
    // congelada en "TRIBUNAL HABLANDO" y no había forma de salir.
    // `useSyncExternalStore` en vez de un efecto: es una capacidad del
    // navegador, no estado de React.
    expect(src).toContain('useSyncExternalStore');
    expect(src).toContain('speechSupported');
    expect(src).not.toContain('alert("Navegador no compatible');
  });

  it('el envio de la respuesta se decide leyendo un ref, no reasignando onend', () => {
    // El manejador `onend` se reasignaba desde un efecto en cada cambio de
    // transcript, y el envío leía un `history` obsoleto del cierre.
    expect(src).toContain('transcriptRef.current');
    expect(src).not.toMatch(/recognitionRef\.current\.onend\s*=/);
  });

  it('el historial se lee de un espejo, no del estado recien puesto', () => {
    // El actualizador de `setState` no se ejecuta de forma sincrona: leer el
    // estado justo despues de llamarlo devuelve el valor anterior y se pierden
    // turnos de la conversacion.
    expect(src).toContain('historyRef.current');
    expect(src).toContain('processInterviewTurn(historyRef.current, text)');
    expect(src).toContain('evaluateInterview(historyRef.current)');
  });

  it('existe la accion que genera el informe', () => {
    expect(server).toContain('export async function evaluateInterview');
    expect(server).toContain('canEvaluate(history)');
    expect(server).toContain('normalizeReport(');
  });
});


// ============================================================
// QUE SALE DEL SISTEMA HACIA GEMINI
// ============================================================

const filaBiodata = {
  id: 'row-1',
  user_id: 'usuario-secreto',
  created_at: '2026-01-01',
  family_background: 'Familia numerosa, padre guardia civil.',
  studies_motivation: 'Criminología.',
  work_history: 'Seguridad privada 3 años.',
  leisure_activities: 'Atletismo.',
  police_motivation: 'Vocación de servicio.',
  strengths_weaknesses: 'Constante, impaciente.',
  fears_concerns: 'Miedo a la entrevista.',
  legal_issues: 'Condena por conducir sin carnet en 2019, expediente 1234/19.',
  psych_answers: { p1: 3, p2: 5 },
  psych_profile: { sincerity: 4, stability: 6, normativity: 7, leadership: 5 },
};

describe('buildInterviewProfile', () => {
  it('conserva lo que el tribunal pregunta de verdad', () => {
    const p = buildInterviewProfile(filaBiodata);
    expect(p.entorno).toContain('guardia civil');
    expect(p.motivacion).toBe('Vocación de servicio.');
    expect(p.temores).toContain('entrevista');
  });

  it('NUNCA saca el texto de los antecedentes', () => {
    // Es el dato más sensible que guarda la aplicación, y se mandaba entero a
    // un tercero en cada turno. El simulador necesita saber que hay algo que
    // preguntar, no qué es.
    const serializado = JSON.stringify(buildInterviewProfile(filaBiodata));
    expect(serializado).not.toContain('carnet');
    expect(serializado).not.toContain('1234/19');
    expect(serializado).not.toContain('Condena');
  });

  it('NUNCA saca el user_id ni las columnas internas', () => {
    const serializado = JSON.stringify(buildInterviewProfile(filaBiodata));
    expect(serializado).not.toContain('usuario-secreto');
    expect(serializado).not.toContain('row-1');
    expect(serializado).not.toContain('created_at');
  });

  it('NUNCA saca las respuestas crudas del psicotécnico', () => {
    // Las puntuaciones derivadas ya viajan aparte y son las que se usan; las
    // 30 respuestas una a una no aportan nada al prompt.
    expect(JSON.stringify(buildInterviewProfile(filaBiodata))).not.toContain('psych_answers');
  });

  it('un campo nuevo en la tabla no sale solo', () => {
    // Es la razón de ser de la lista blanca: antes se mandaba la fila entera,
    // así que cualquier columna que se añadiera empezaba a salir del sistema
    // sin que nadie lo decidiera.
    const conCampoNuevo = { ...filaBiodata, numero_documento_identidad: '12345678Z' };
    expect(JSON.stringify(buildInterviewProfile(conCampoNuevo))).not.toContain('12345678Z');
  });

  it('recorta el texto libre', () => {
    const largo = { family_background: 'a'.repeat(5000) };
    expect(buildInterviewProfile(largo).entorno).toHaveLength(MAX_PROFILE_FIELD_CHARS);
  });

  it('no revienta sin fila', () => {
    expect(buildInterviewProfile(null).incidencias_legales).toBe('sin declarar');
    expect(hasProfileContent(buildInterviewProfile(null))).toBe(false);
  });
});

describe('summarizeLegalIssues', () => {
  it('distingue los tres casos sin repetir el texto', () => {
    expect(summarizeLegalIssues('')).toBe('sin declarar');
    expect(summarizeLegalIssues(null)).toBe('sin declarar');
    expect(summarizeLegalIssues('Ninguno')).toBe('declara no tener');
    expect(summarizeLegalIssues('No tengo antecedentes')).toBe('declara no tener');
    expect(summarizeLegalIssues('Una multa en 2019')).toContain('declara incidencias');
  });

  it('el resumen de un caso real no filtra el caso', () => {
    const resumen = summarizeLegalIssues('Detenido en 2018 por una pelea en Málaga.');
    expect(resumen).not.toContain('2018');
    expect(resumen).not.toContain('Málaga');
  });
});

describe('hasProfileContent', () => {
  it('los antecedentes por sí solos no cuentan como perfil relleno', () => {
    // `incidencias_legales` siempre trae valor ("sin declarar"), así que
    // contarlo daría por relleno un perfil vacío y el inspector se pondría a
    // repreguntar sobre nada.
    expect(hasProfileContent(buildInterviewProfile({}))).toBe(false);
    expect(hasProfileContent(buildInterviewProfile({ legal_issues: 'no' }))).toBe(false);
    expect(hasProfileContent(buildInterviewProfile({ police_motivation: 'Vocación' }))).toBe(true);
  });
});

describe('guardas estáticas sobre lo que se envía al modelo', () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const leer = (rel: string) => stripComments(readFileSync(join(__dirname, '..', rel), 'utf-8'));

  it('ninguna acción serializa la fila cruda de la base de datos hacia el modelo', () => {
    // El fallo: `JSON.stringify(biodata)` con la fila entera, en cada turno.
    for (const fichero of ['app/actions/interview.ts', 'app/actions/training.ts']) {
      const src = leer(fichero);
      expect(src, fichero).not.toMatch(/JSON\.stringify\((biodata|profile|data|row)\)/);
    }
  });

  it('lo que viaja se construye con una lista blanca', () => {
    expect(leer('app/actions/interview.ts')).toContain('buildInterviewProfile');
    expect(leer('app/actions/training.ts')).toContain('buildCoachProfile');
  });
});
