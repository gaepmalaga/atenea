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
  aplicaReglaCasa,
  trainingSwitchModuleId,
  mensajeSwitchApagado,
  type TrainingSwitchId,
  type TrainingSwitches,
} from './training-switches';
import { ACADEMIA_CASA_SLUG } from './academies';

// Caché POR ACADEMIA (igual que `requiredCache` en `auth.ts`): son filas que
// cambian una vez cada muchos meses, y `leeTrainingSwitches` corre en cada
// Server Action de físicas.
const CACHE_MS = 30_000;
const switchesCache = new Map<string, { valor: TrainingSwitches; hasta: number }>();
const casaCache = new Map<string, { valor: boolean; hasta: number }>();

/** La llama la acción que escribe. Sin academia, tira las dos cachés enteras. */
export function olvidaTrainingSwitches(organizationId?: string | null): void {
  if (organizationId) switchesCache.delete(organizationId);
  else switchesCache.clear();
}

/**
 * ¿Es la academia «casa» (`ACADEMIA_CASA_SLUG`)? Decide si esta academia es
 * solo-IA o solo-manual (`aplicaReglaCasa`). Cacheado como el slug de una
 * academia no cambia nunca en la práctica.
 */
export async function esAcademiaCasa(organizationId: string): Promise<boolean> {
  const cacheado = casaCache.get(organizationId);
  if (cacheado && cacheado.hasta > Date.now()) return cacheado.valor;

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { data, error } = await supabaseAdmin
      .from('academies')
      .select('slug')
      .eq('id', organizationId)
      .maybeSingle();
    if (error) throw error;
    const valor = data?.slug === ACADEMIA_CASA_SLUG;
    casaCache.set(organizationId, { valor, hasta: Date.now() + CACHE_MS });
    return valor;
  } catch (e) {
    console.error('esAcademiaCasa (se asume que NO es la casa):', e instanceof Error ? e.message : e);
    // Fallar a "no es la casa" es fallar cerrado sobre `ai`: una academia
    // normal no puede acabar ofreciendo IA de pago por un blip de lectura.
    return false;
  }
}

/**
 * Estado de los tres interruptores DE UNA ACADEMIA, con la regla casa ya
 * aplicada (regla de negocio, no solo lo guardado — ver `aplicaReglaCasa`).
 * Con caché por instancia. Si la lectura falla se cae a TODO ENCENDIDO **y
 * luego se le aplica igualmente la regla casa** — un blip de la BD no puede
 * parecerse a un apagado deliberado, pero tampoco puede colar `ai` en una
 * academia normal.
 */
export async function leeTrainingSwitches(organizationId: string | null): Promise<TrainingSwitches> {
  if (!organizationId) return todosLosSwitches();

  const esCasa = await esAcademiaCasa(organizationId);

  const cacheado = switchesCache.get(organizationId);
  if (cacheado && cacheado.hasta > Date.now()) return aplicaReglaCasa(cacheado.valor, esCasa);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return aplicaReglaCasa(todosLosSwitches(), esCasa);

  try {
    const { supabaseAdmin } = await import('../actions/core');
    const moduleIds = Object.keys(TRAINING_SWITCH_ROW).map((id) =>
      trainingSwitchModuleId(id as TrainingSwitchId, organizationId),
    );
    const { data, error } = await supabaseAdmin
      .from('module_settings')
      .select('module_id, enabled')
      .in('module_id', moduleIds);

    if (error) {
      console.error('leeTrainingSwitches (se dan por encendidos):', error.message);
      return aplicaReglaCasa(todosLosSwitches(), esCasa);
    }

    const valor = toTrainingSwitches(data ?? [], organizationId);
    switchesCache.set(organizationId, { valor, hasta: Date.now() + CACHE_MS });
    return aplicaReglaCasa(valor, esCasa);
  } catch (e) {
    console.error('leeTrainingSwitches:', e instanceof Error ? e.message : e);
    return aplicaReglaCasa(todosLosSwitches(), esCasa);
  }
}

/**
 * Corta la acción si su interruptor está apagado. Devuelve resultado, no lanza
 * (regla 1). Va DESPUÉS de la sesión y del módulo, y ANTES de la cuota o de
 * Gemini — mismo orden que `requireModule`.
 */
export async function requireTrainingSwitch(
  id: TrainingSwitchId,
  organizationId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const switches = await leeTrainingSwitches(organizationId);
  if (switches[id]) return { ok: true };
  return { ok: false, error: mensajeSwitchApagado(id) };
}

/** Solo la lectura del interruptor, sin cortar. Para el modo adaptativo, que si
 * está apagado NO es un error: se cae a la selección aleatoria. */
export async function adaptativoEncendido(organizationId: string | null): Promise<boolean> {
  return (await leeTrainingSwitches(organizationId)).adaptive;
}
