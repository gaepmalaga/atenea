/**
 * El LECTOR (con caché) y el CORTE de servidor de los interruptores de físicas.
 *
 * Separado de `training-switches.ts` porque este arrastra `actions/core`
 * (`server-only`, con el cliente de Supabase de servicio) y el panel de admin
 * —que es cliente— necesita solo las etiquetas. Misma partición que
 * `admin-audit.ts` / `audit-labels.ts` (regla 49) y que `module-guard.ts`.
 *
 * NO puede vivir en `app/actions/`: un fichero `'use server'` convierte en
 * endpoint público todo lo que exporta, así que estos ayudantes serían Server
 * Actions sin sesión propia (regla 21, y el mismo motivo que `module-guard.ts`).
 */

import {
  TRAINING_SWITCH_ROW,
  todosLosSwitches,
  toTrainingSwitches,
  mensajeSwitchApagado,
  type TrainingSwitchId,
  type TrainingSwitches,
} from './training-switches';

let cache: { valor: TrainingSwitches; hasta: number } | null = null;
const CACHE_MS = 30_000;

/** Tira la caché. La llama la acción que escribe. */
export function olvidaTrainingSwitches(): void {
  cache = null;
}

/**
 * Estado de los dos interruptores, con caché por instancia (igual que
 * `leeModuleSettings`: son filas que cambian una vez cada muchos meses). Si la
 * lectura falla se cae a TODO ENCENDIDO — un blip de la BD no puede parecerse a
 * un apagado y dejar a la clase sin plan.
 */
export async function leeTrainingSwitches(): Promise<TrainingSwitches> {
  if (cache && cache.hasta > Date.now()) return cache.valor;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return todosLosSwitches();

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { data, error } = await supabaseAdmin
      .from('module_settings')
      .select('module_id, enabled')
      .in('module_id', Object.values(TRAINING_SWITCH_ROW));

    if (error) {
      console.error('leeTrainingSwitches (se dan por encendidos):', error.message);
      return todosLosSwitches();
    }

    const valor = toTrainingSwitches(data ?? []);
    cache = { valor, hasta: Date.now() + CACHE_MS };
    return valor;
  } catch (e) {
    console.error('leeTrainingSwitches:', e instanceof Error ? e.message : e);
    return todosLosSwitches();
  }
}

/**
 * Corta la acción si su interruptor está apagado. Devuelve resultado, no lanza
 * (regla 1). Va DESPUÉS de la sesión y del módulo, y ANTES de la cuota o de
 * Gemini — mismo orden que `requireModule`.
 */
export async function requireTrainingSwitch(
  id: TrainingSwitchId
): Promise<{ ok: true } | { ok: false; error: string }> {
  const switches = await leeTrainingSwitches();
  if (switches[id]) return { ok: true };
  return { ok: false, error: mensajeSwitchApagado(id) };
}

/** Solo la lectura del interruptor, sin cortar. Para el modo adaptativo, que si
 * está apagado NO es un error: se cae a la selección aleatoria. */
export async function adaptativoEncendido(): Promise<boolean> {
  return (await leeTrainingSwitches()).adaptive;
}
