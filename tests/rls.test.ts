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
];

/** El receptor de un `.from('tabla')`, aguantando el salto de linea del medio. */
function receptoresDe(src: string, tabla: string): string[] {
  const re = new RegExp("(\\w+)\\s*\\.from\\('" + tabla + "'\\)", 'g');
  return [...src.matchAll(re)].map((m) => m[1]);
}

describe('lo del alumno va con su sesion, no con la clave de servicio', () => {
  for (const tabla of DEL_ALUMNO) {
    it(`${tabla} no se toca con la clave de servicio`, () => {
      const culpables: string[] = [];
      for (const { nombre, src } of fuentes) {
        for (const receptor of receptoresDe(src, tabla)) {
          if (receptor === 'supabaseAdmin' || receptor === 'supabase') {
            culpables.push(`${nombre}: ${receptor}.from('${tabla}')`);
          }
        }
      }
      expect(culpables).toEqual([]);
    });
  }

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

describe('question_attempts sigue esperando su política', () => {
  it('no se ha movido a la sesión antes de tiempo', () => {
    // Tiene politica de INSERT y de SELECT, pero NO de UPDATE, y
    // `setResultErrorType` actualiza. Con la sesion, ese update no daria error:
    // no tocaria ninguna fila, y el diagnostico del alumno se perderia en
    // silencio. El guion que lo desbloquea es docs/sql/1.2-attempts-update.sql.
    const culpables: string[] = [];
    for (const { nombre, src } of fuentes) {
      for (const receptor of receptoresDe(src, 'question_attempts')) {
        if (receptor === 'db') culpables.push(`${nombre}`);
      }
    }
    expect(culpables).toEqual([]);
  });
});
