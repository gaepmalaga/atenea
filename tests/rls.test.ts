import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Fase 1.2 · quien entra con la clave de servicio y quien con la sesion.
 *
 * La clave de servicio SALTA RLS. Mientras toda la aplicacion entraba con ella,
 * las politicas de la fase 1.3 no protegian nada en la practica: la unica
 * barrera era que el programador se acordara de poner `.eq('user_id', …)` en
 * cada consulta. Una barrera que depende de acordarse no es una barrera.
 *
 * Ahora hay dos mundos, y este test los mantiene separados:
 *
 *   · LO DEL ALUMNO va con el cliente de la SESION (`createSupabaseServerClient`).
 *     Sus tablas tienen politica de propietario, asi que Postgres impone lo que
 *     antes imponia el cuidado de quien escribia la consulta.
 *
 *   · LO COMPARTIDO Y LO DE ADMINISTRACION va con la clave de servicio, y no es
 *     un descuido: `question_bank`, `documents`, `subjects` y compania tienen
 *     RLS activada y NINGUNA politica, asi que con la sesion del alumno no se
 *     leerian. Son contenido de la academia, no del alumno.
 */

const ACTIONS = join(__dirname, '..', 'app', 'actions');

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const fuentes = readdirSync(ACTIONS)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => ({ nombre: f, src: stripComments(readFileSync(join(ACTIONS, f), 'utf-8').replace(/\r\n/g, '\n')) }));

/** Tablas que son del alumno y tienen politica de propietario. */
const DEL_ALUMNO = [
  'question_notes',
  'profiles_physical',
  'training_plans',
  'profiles_biodata',
  'profiles_psych',
  'flashcard_progress',
  'flashcard_results',
  'question_votes',
  // El historial del chat: politica de propietario `for all`, asi que es
  // Postgres quien impone que un alumno solo vea SUS conversaciones.
  'chat_conversations',
  'chat_messages',
];

/**
 * Tablas que SOLO puede tocar la clave de servicio.
 *
 * No tienen ninguna politica —comprobado contra el volcado del esquema— asi que
 * con el cliente de la sesion devolverian vacio. Es contenido compartido de la
 * academia o contadores internos.
 */
const SOLO_SERVICIO = [
  'question_bank',
  'documents',
  'document_chunks',
  'subjects',
  'blocks',
  'profiles',
  'module_settings',
  'ai_quota',
  // El gasto de IA: RLS activada y CERO politicas a proposito. Es una tabla de
  // administracion — un alumno no tiene por que leer cuanto gasta nadie, ni el
  // mismo. Con el cliente de la sesion devolveria vacio EN SILENCIO.
  'ai_usage',
  // P6: control de acceso y pagos. Las tres son de administracion, con RLS y
  // cero politicas. `auth.ts` (que este test no analiza) SI lee `memberships`
  // y `membership_settings` con la clave de servicio, y ahi es lo correcto:
  // la puerta la decide el servidor, no el alumno.
  'membership_settings',
  'memberships',
  'academy_payments',
];

/** El receptor de un `.from('tabla')`, aguantando el salto de linea del medio. */
function receptoresDe(src: string, tabla: string): string[] {
  const re = new RegExp("(\\w+)\\s*\\.from\\('" + tabla + "'\\)", 'g');
  return [...src.matchAll(re)].map((m) => m[1]);
}

/**
 * Quita el CUERPO de una funcion nombrada, contando llaves desde su primera
 * `{`. Se usa para las pocas excepciones legitimas de esta regla: una accion
 * de ADMINISTRACION que escribe sobre la fila de OTRO usuario no puede ir con
 * la sesion de ese usuario —su RLS es `auth.uid() = user_id`, y quien actua es
 * el admin, no el— asi que ahi la clave de servicio SI es lo correcto,
 * protegida por `requireAdmin` (misma logica que el panel de academia,
 * regla 35).
 */
function sinFuncion(src: string, nombre: string): string {
  const i = src.indexOf(`function ${nombre}(`);
  if (i < 0) return src;

  // El cuerpo NO empieza en la primera `{` tras el nombre: si un parametro
  // lleva un tipo objeto —`params: { studentId: string; ... }`, como aqui
  // mismo— esa es la primera `{` y contarla como el cuerpo cierra la cuenta
  // en cuanto termina el TIPO, muchisimo antes de la funcion real. Primero se
  // cierra la lista de parametros contando parentesis, y solo despues se
  // busca la `{` del cuerpo.
  const parenIni = src.indexOf('(', i);
  let profParen = 0;
  let cierreParams = -1;
  for (let pos = parenIni; pos < src.length; pos++) {
    if (src[pos] === '(') profParen++;
    else if (src[pos] === ')') {
      profParen--;
      if (profParen === 0) { cierreParams = pos; break; }
    }
  }
  if (cierreParams < 0) return src;

  const llave = src.indexOf('{', cierreParams);
  let profundidad = 0;
  for (let pos = llave; pos < src.length; pos++) {
    if (src[pos] === '{') profundidad++;
    else if (src[pos] === '}') {
      profundidad--;
      if (profundidad === 0) return src.slice(0, i) + src.slice(pos + 1);
    }
  }
  return src;
}

/**
 * Las excepciones admitidas a "lo del alumno va con su sesion": funciones de
 * `actions/training.ts` que un ADMIN usa para escribir el plan de OTRO
 * alumno. `getStudentActivePlan` y `saveManualTrainingPlan` viven detras de
 * `requireAdmin`, no de `requireUser`, y por eso no cuentan aqui.
 */
const EXCEPCIONES_ADMIN: Record<string, string[]> = {
  training_plans: ['getStudentActivePlan', 'saveManualTrainingPlan'],
};

describe('lo del alumno va con su sesion, no con la clave de servicio', () => {
  for (const tabla of DEL_ALUMNO) {
    it(`${tabla} no se toca con la clave de servicio`, () => {
      const culpables: string[] = [];
      for (const { nombre, src } of fuentes) {
        let analizado = src;
        for (const funcion of EXCEPCIONES_ADMIN[tabla] ?? []) {
          analizado = sinFuncion(analizado, funcion);
        }
        for (const receptor of receptoresDe(analizado, tabla)) {
          if (receptor === 'supabaseAdmin' || receptor === 'supabase') {
            culpables.push(`${nombre}: ${receptor}.from('${tabla}')`);
          }
        }
      }
      expect(culpables).toEqual([]);
    });
  }

  it('las excepciones de admin SI exigen requireAdmin, no requireUser', () => {
    // La excepcion no puede quedarse sin guarda: si alguna de estas funciones
    // perdiera su `requireAdmin`, cualquier alumno podria escribir el plan de
    // otro con solo conocer su id.
    const training = fuentes.find((f) => f.nombre === 'training.ts')!;
    for (const funcion of EXCEPCIONES_ADMIN.training_plans) {
      const i = training.src.indexOf(`function ${funcion}(`);
      expect(i).toBeGreaterThan(-1);
      const cabecera = training.src.slice(i, i + 300);
      expect(cabecera).toMatch(/requireAdmin\(\)/);
    }
  });

  it('quien usa el cliente de sesion lo importa', () => {
    const sinImport = fuentes
      .filter((f) => /\bdb\s*\.from\(/.test(f.src))
      .filter((f) => !f.src.includes("from '../lib/supabase/server'"))
      .map((f) => f.nombre);
    expect(sinImport).toEqual([]);
  });
});

describe('lo compartido sigue con la clave de servicio', () => {
  for (const tabla of SOLO_SERVICIO) {
    it(`${tabla} no se lee con la sesión del alumno`, () => {
      // Estas tablas tienen RLS y CERO politicas: con la sesion del alumno la
      // consulta no falla, devuelve VACIO. Es el modo de fallo que menos se ve
      // y el que mas caro sale — la pantalla se queda en blanco sin un error.
      const culpables: string[] = [];
      for (const { nombre, src } of fuentes) {
        for (const receptor of receptoresDe(src, tabla)) {
          if (receptor === 'db') culpables.push(`${nombre}: db.from('${tabla}')`);
        }
      }
      expect(culpables).toEqual([]);
    });
  }
});

describe('question_attempts: la política de UPDATE ya existe, el código aún no se ha movido', () => {
  it('sigue con la clave de servicio hasta verificar el movimiento con una sesión real', () => {
    // `1.2-attempts-update.sql` SE EJECUTÓ el 5 sep 2026: `question_attempts`
    // ya tiene las tres políticas (insert, select, update). Así que el guion ya
    // NO es el bloqueo — el bloqueo ahora es que mover `saveTestResult` /
    // `setResultErrorType` / `saveExamResults` a `createSupabaseServerClient()`
    // es el camino más crítico del repo («el fallo más caro») y no se puede
    // comprobar sin una sesión de alumno de verdad. Cuando se mueva y se
    // verifique, este test se invierte: pasará a exigir `db.from(...)`.
    const culpables: string[] = [];
    for (const { nombre, src } of fuentes) {
      for (const receptor of receptoresDe(src, 'question_attempts')) {
        if (receptor === 'db') culpables.push(`${nombre}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
