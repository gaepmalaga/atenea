/**
 * Comprueba contra la base de datos REAL que lo que el codigo escribe entra.
 *
 * POR QUE, HABIENDO YA `tests/schema-drift.test.ts`
 * Ese test es estatico: compara nombres de columna contra el volcado. No ve los
 * tipos, ni los NOT NULL, ni las claves ajenas. Un `topic` que llega a null o un
 * `week_start` con formato raro pasan su filtro y revientan en produccion.
 *
 * Esto inserta una fila de verdad por cada camino de escritura y la borra.
 *
 * QUE NO TOCA
 * Las tablas cuya clave primaria es `user_id` —`profiles_physical`,
 * `profiles_biodata`, `profiles_psych`— NO se escriben: un upsert ahi
 * sobrescribiria los datos reales del usuario. De esas solo se comprueba que
 * las columnas existen, con un SELECT.
 *
 * ES DESTRUCTIVO EN POTENCIA: escribe y borra. No lo lances contra una base de
 * datos con datos que te importen sin leer antes lo que hace.
 *
 *   node scripts/smoke-contratos.mjs
 */

// Las credenciales salen de `scripts/lib/env.mjs` y no de un `readFileSync`
// aqui: este guion leia SOLO `.env` y reventaba con la configuracion que el
// propio repo documenta, que es `.env.local`.
import { env, urlSupabase } from './lib/env.mjs';

const URL_BASE = urlSupabase();
const KEY = env('SUPABASE_SERVICE_ROLE_KEY');
const cabeceras = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const MARCA = '__SMOKE_CONTRATOS__';

async function rest(metodo, ruta, cuerpo) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    method: metodo,
    headers: { ...cabeceras, Prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  return { ok: r.ok, estado: r.status, datos };
}

// --- Datos reales de los que colgar las claves ajenas -----------------------
const usuarios = await rest('GET', 'profiles?select=id&limit=1');
if (!usuarios.ok || !usuarios.datos?.length) throw new Error('No hay ningun perfil del que colgar la prueba.');
const USER_ID = usuarios.datos[0].id;

const temas = await rest('GET', 'subjects?select=id,title&limit=1');
const SUBJECT_ID = temas.datos?.[0]?.id ?? 1;
const TOPIC = temas.datos?.[0]?.title ?? 'Tema de prueba';

const AHORA = new Date().toISOString();

// Una pregunta real de la que colgar la nota (P3.8): `question_notes` tiene
// clave ajena a `question_bank`, asi que un id inventado no entra.
const preguntas = await rest('GET', 'question_bank?select=id&limit=1');
const QUESTION_ID = preguntas.datos?.[0]?.id ?? null;

/**
 * Un caso por camino de escritura del codigo. `payload` es literalmente lo que
 * arma la Server Action, con los valores de prueba puestos.
 */
const CASOS = [
  {
    tabla: 'ai_usage',
    accion: 'lib/ai-usage.ts · registraGasto (persistencia del gasto)',
    payload: {
      user_id: USER_ID,
      route: MARCA,
      input_tokens: 34675,
      output_tokens: 412,
      cached_tokens: 0,
      // El coste va en `numeric`, no en `float`: sumar dinero en coma flotante
      // acumula error y este numero acaba en una factura.
      cost_usd: 0.011433,
      subject_id: SUBJECT_ID,
      created_at: AHORA,
    },
    borrarPor: `route=eq.${MARCA}`,
  },
  {
    tabla: 'chat_conversations',
    accion: 'historial del chat · una conversacion del alumno',
    payload: {
      user_id: USER_ID,
      title: MARCA,
      subject_id: SUBJECT_ID,
      created_at: AHORA,
      updated_at: AHORA,
    },
    borrarPor: `title=eq.${MARCA}`,
    // Cerrar una conversacion es un UPDATE, y `question_attempts` ya ensenio
    // lo que cuesta quedarse sin politica de UPDATE: no falla, simplemente no
    // toca ninguna fila y el cambio se pierde en silencio.
    luegoActualizar: { closed_at: AHORA },
  },
  {
    tabla: 'question_attempts',
    accion: 'exams.ts · saveTestResult / saveExamResults',
    payload: {
      question_id: null, topic: MARCA, is_correct: true,
      response_time_ms: 8400, option_changes: 2, error_type: null,
      user_id: USER_ID, created_at: AHORA,
    },
    borrarPor: `topic=eq.${MARCA}`,
    // El etiquetado posterior del fallo (setResultErrorType).
    luegoActualizar: { error_type: 'trampa' },
  },
  {
    tabla: 'question_bank',
    accion: 'moderation.ts · createManualQuestion / importManualQuestions (P2)',
    payload: {
      subject_id: SUBJECT_ID,
      question_text: MARCA,
      options: ['una', 'dos', 'tres'],
      correct_index: 0,
      explanation: 'Fila de prueba del smoke.',
      question_hash: MARCA,
      difficulty_level: 2,
      // P3.7: la columna es nueva, y es justo la que rompe la escritura
      // ENTERA si el guion no se ha ejecutado.
      legal_reference: 'Articulo de prueba',
      status: 'candidate',
      origin: 'manual',
      created_at: AHORA,
    },
    borrarPor: `question_hash=eq.${MARCA}`,
  },
  ...(QUESTION_ID
    ? [{
        tabla: 'question_notes',
        accion: 'notes.ts · saveQuestionNote (P3.8)',
        payload: {
          user_id: USER_ID,
          question_id: QUESTION_ID,
          note: MARCA,
          created_at: AHORA,
          updated_at: AHORA,
        },
        borrarPor: `note=eq.${MARCA}`,
        // Reescribir la nota es lo normal: se comprueba tambien el update.
        luegoActualizar: { updated_at: AHORA },
      }]
    : []),
  {
    tabla: 'module_settings',
    accion: 'modules.ts · setModuleEnabled (P4)',
    payload: { module_id: MARCA, enabled: false, updated_at: AHORA, updated_by: USER_ID },
    borrarPor: `module_id=eq.${MARCA}`,
    // Volver a pulsar el interruptor es lo normal: se comprueba el update.
    luegoActualizar: { enabled: true },
  },
  {
    tabla: 'flashcard_progress',
    accion: 'flashcards.ts · saveFlashcardProgress',
    payload: {
      user_id: USER_ID, front: MARCA, back: 'reverso',
      box: 2, next_review: AHORA, topic: TOPIC,
    },
    borrarPor: `front=eq.${MARCA}`,
  },
  {
    tabla: 'flashcard_results',
    accion: 'flashcards.ts · recordFlashcardResult',
    payload: {
      user_id: USER_ID, subject_id: SUBJECT_ID, topic: TOPIC,
      front: MARCA, back: 'reverso', grade: 'easy',
      box_before: 1, box_after: 2, next_review: AHORA,
    },
    borrarPor: `front=eq.${MARCA}`,
  },
  {
    tabla: 'training_plans',
    accion: 'training.ts · generateTrainingPlan',
    payload: {
      user_id: USER_ID, week_start: AHORA, status: MARCA,
      plan_data: { days: [{ title: 'Dia de prueba', exercises: [] }] },
    },
    borrarPor: `status=eq.${MARCA}`,
  },
];

/** Estas solo se leen: escribirlas pisaria datos reales del usuario. */
const SOLO_LECTURA = [
  { tabla: 'profiles_biodata', accion: 'interview.ts · saveBiodata',
    columnas: 'user_id,family_background,studies_motivation,work_history,leisure_activities,police_motivation,fears_concerns,strengths_weaknesses,legal_issues,psych_answers,psych_profile' },
  { tabla: 'profiles_physical', accion: 'training.ts · savePhysicalProfile',
    columnas: 'user_id,height,weight,birth_year,gender,availability,equipment,injuries,baseline_metrics' },
  { tabla: 'question_votes', accion: 'moderation.ts · voteQuestion',
    columnas: 'question_id,user_id,vote' },
  { tabla: 'question_reports', accion: 'moderation.ts · reportQuestion',
    columnas: 'question_id,user_id,report_type,message' },
];

let fallos = 0;

console.log(`Contra ${URL_BASE}\n`);
console.log('ESCRITURA (inserta y borra)');
for (const caso of CASOS) {
  const alta = await rest('POST', caso.tabla, caso.payload);
  if (!alta.ok) {
    fallos++;
    console.log(`  FALLA  ${caso.tabla.padEnd(20)} ${alta.datos?.message ?? alta.estado}`);
    console.log(`         ${caso.accion}`);
    continue;
  }

  let detalle = 'insert';
  if (caso.luegoActualizar) {
    // `rest` pide siempre `return=representation`, asi que se puede mirar
    // CUANTAS filas toco el update. Sin mirarlo, un PATCH que no encuentra nada
    // se cantaba como "update ok": paso de verdad con `module_settings`, cuyo
    // filtro se habia quedado sin valor, y el guion dio verde sin comprobar ni
    // el update ni el borrado (regla 4, aplicada al propio guion de pruebas).
    const upd = await rest('PATCH', `${caso.tabla}?${caso.borrarPor}`, caso.luegoActualizar);
    const tocadas = Array.isArray(upd.datos) ? upd.datos.length : 0;

    if (!upd.ok) {
      detalle += ` + UPDATE FALLA (${upd.datos?.message ?? upd.estado})`;
      fallos++;
    } else if (tocadas === 0) {
      detalle += ' + UPDATE NO TOCO NADA (¿mal el filtro?)';
      fallos++;
    } else {
      detalle += ' + update';
    }
  }

  await fetch(`${URL_BASE}/rest/v1/${caso.tabla}?${caso.borrarPor}`, { method: 'DELETE', headers: cabeceras });

  // Y que el borrado se haya llevado la fila de verdad: un guion de pruebas que
  // deja restos en la base de datos de produccion no es un guion de pruebas.
  const resto = await rest('GET', `${caso.tabla}?${caso.borrarPor}&select=*`);
  if (Array.isArray(resto.datos) && resto.datos.length) {
    detalle += ` + NO SE BORRO (${resto.datos.length} fila/s)`;
    fallos++;
  }

  console.log(`  ${detalle.includes('FALLA') || detalle.includes('NO ') ? 'FALLA ' : 'ok    '} ${caso.tabla.padEnd(20)} ${detalle}`);
}

console.log('\nSOLO LECTURA (las columnas existen)');
for (const caso of SOLO_LECTURA) {
  const r = await rest('GET', `${caso.tabla}?select=${caso.columnas}&limit=1`);
  if (!r.ok) {
    fallos++;
    console.log(`  FALLA  ${caso.tabla.padEnd(20)} ${r.datos?.message ?? r.estado}`);
    console.log(`         ${caso.accion}`);
  } else {
    console.log(`  ok     ${caso.tabla.padEnd(20)} ${caso.columnas.split(',').length} columnas`);
  }
}

console.log(fallos ? `\n${fallos} contrato(s) rotos.` : '\nTodos los contratos entran.');
process.exit(fallos ? 1 : 0);
