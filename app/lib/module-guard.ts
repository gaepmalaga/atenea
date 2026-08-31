/**
 * La guarda que cierra un modulo apagado EN EL SERVIDOR (P4).
 *
 * POR QUE ESTA AQUI Y NO EN LAS ACCIONES
 * Un fichero `'use server'` convierte en endpoint publico todo lo que exporta,
 * asi que un ayudante interno como este no puede vivir ahi: seria una accion
 * mas, sin comprobacion de sesion propia. Mismo motivo por el que la aritmetica
 * de las cuotas vive en `rate-limit.ts` (regla 20 y regla 21).
 *
 * LA REGLA QUE JUSTIFICA TODO EL FICHERO: apagar un modulo tiene que apagarlo
 * tambien en el servidor. Esconder el enlace del menu no impide que nadie llame
 * a la Server Action, y las de IA se pagan por llamada.
 */

import { toModuleSettings, todosActivos, type ModuleId, type ModuleSettings } from './modules';

/**
 * Cuanto vale la lectura en cache.
 *
 * `requireModule` corre en cada llamada a las acciones de IA, y son ocho filas
 * que cambian una vez cada varios meses. Sin cache, cada mensaje del chat serian
 * dos consultas a Supabase en vez de una.
 *
 * Es POR INSTANCIA, como el contador de respaldo de la cuota: con varias
 * instancias vivas, apagar un modulo tarda como mucho esto en llegar a todas.
 * Para un ajuste de configuracion es aceptable — y quien lo cambia limpia la
 * cache de su instancia, asi que lo ve al momento.
 */
export const CACHE_MS = 30_000;

let cache: { valor: ModuleSettings; hasta: number } | null = null;

/** Tira la cache. La llama la accion que escribe. */
export function olvidaModuleSettings(): void {
  cache = null;
}

/**
 * El estado de los ocho modulos, con cache.
 *
 * Si la consulta falla se registra y se cae a TODO ENCENDIDO. Un fallo de
 * lectura no puede parecerse a un apagado deliberado: dejaria al alumno sin
 * plataforma sin que nadie lo haya decidido.
 *
 * El import de `actions/core` es dinamico por lo mismo que en `rate-limit.ts`:
 * ese modulo es `server-only` y arrastra el cliente de Gemini.
 */
export async function leeModuleSettings(): Promise<ModuleSettings> {
  if (cache && cache.hasta > Date.now()) return cache.valor;

  // Sin clave de servicio no hay a donde llamar (tests, o entorno a medio
  // configurar): todo encendido, que es el estado de partida.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return todosActivos();

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { data, error } = await supabaseAdmin.from('module_settings').select('module_id, enabled');

    if (error) {
      console.error('leeModuleSettings (se dan todos por activos):', error.message);
      return todosActivos();
    }

    const valor = toModuleSettings(data ?? []);
    cache = { valor, hasta: Date.now() + CACHE_MS };
    return valor;
  } catch (e) {
    console.error('leeModuleSettings:', e instanceof Error ? e.message : e);
    return todosActivos();
  }
}

/**
 * Corta la accion si su modulo esta apagado.
 *
 * Devuelve un resultado y no lanza, por lo mismo que `requireUser`: las Server
 * Actions redactan las excepciones en produccion y el alumno veria un error
 * generico inutil (regla 1).
 *
 * Va DESPUES de comprobar la sesion y ANTES de tocar a Gemini o de leer nada:
 * ese orden es justo lo que evita pagar la llamada de un modulo apagado.
 */
export async function requireModule(
  moduleId: ModuleId
): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = await leeModuleSettings();
  if (settings[moduleId]) return { ok: true };
  return { ok: false, error: 'Este módulo está desactivado por la academia.' };
}
