'use server'

import { supabaseAdmin } from './core';
import { requireAdmin, requireUser } from '../lib/auth';
import { isModuleId, type ModuleSettings } from '../lib/modules';
import { leeModuleSettings, olvidaModuleSettings } from '../lib/module-guard';
import { leeTrainingSwitches, olvidaTrainingSwitches } from '../lib/training-switch-guard';
import {
  TRAINING_SWITCH_ROW,
  TRAINING_SWITCH_IDS,
  type TrainingSwitchId,
  type TrainingSwitches,
} from '../lib/training-switches';
import { registraAccion } from '../lib/admin-audit';

/**
 * Encender y apagar modulos (P4).
 *
 * La decision del dueño fue "que se pueda apagar cualquiera", asi que los ocho
 * tienen interruptor, Inicio y Estadisticas incluidos.
 *
 * Aqui solo estan las dos acciones de verdad. La guarda que cierra un modulo en
 * el servidor vive en `lib/module-guard.ts`: un fichero `'use server'` convierte
 * en endpoint publico todo lo que exporta, asi que un ayudante interno no puede
 * estar aqui.
 */

export async function getModuleSettings(): Promise<
  { success: true; settings: ModuleSettings } | { success: false; error: string }
> {
  // requireUser y no requireAdmin: el dashboard del alumno necesita saber que
  // modulos pintar.
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };

  return { success: true as const, settings: await leeModuleSettings() };
}

export async function setModuleEnabled(input: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as { moduleId?: unknown; enabled?: unknown };
  if (!isModuleId(d.moduleId)) return { success: false, error: 'Ese módulo no existe.' };
  if (typeof d.enabled !== 'boolean') return { success: false, error: 'Falta el estado.' };

  const { error } = await supabaseAdmin.from('module_settings').upsert(
    {
      module_id: d.moduleId,
      enabled: d.enabled,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    },
    { onConflict: 'module_id' }
  );

  // La cache se tira SIEMPRE, tambien si la escritura fallo: es lo barato, y
  // asi la siguiente lectura trae lo que hay de verdad en la tabla.
  olvidaModuleSettings();

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'set_module_enabled',
      target: d.moduleId,
      detail: { enabled: d.enabled },
    });
  }

  return { success: !error, error: error?.message };
}

/**
 * Interruptores de la preparación física (feedback tras P8): la generación con
 * IA por el alumno, y el plan manual por grupo. Se guardan en la misma tabla
 * `module_settings` con `module_id` de texto libre — sin SQL. Ver
 * `lib/training-switches.ts`.
 */
export async function getTrainingSwitches(): Promise<
  { success: true; switches: TrainingSwitches } | { success: false; error: string }
> {
  // requireUser: el módulo del alumno esconde el botón «generar» si la IA está
  // apagada. El corte de verdad está en el servidor, en `generateWeeklyPlan`.
  const auth = await requireUser();
  if (!auth.ok) return { success: false as const, error: auth.error };
  return { success: true as const, switches: await leeTrainingSwitches() };
}

export async function setTrainingSwitch(input: unknown): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const d = (input ?? {}) as { switchId?: unknown; enabled?: unknown };
  if (typeof d.switchId !== 'string' || !(TRAINING_SWITCH_IDS as readonly string[]).includes(d.switchId)) {
    return { success: false, error: 'Ese interruptor no existe.' };
  }
  if (typeof d.enabled !== 'boolean') return { success: false, error: 'Falta el estado.' };
  const switchId = d.switchId as TrainingSwitchId;

  const { error } = await supabaseAdmin.from('module_settings').upsert(
    {
      module_id: TRAINING_SWITCH_ROW[switchId],
      enabled: d.enabled,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    },
    { onConflict: 'module_id' }
  );

  olvidaTrainingSwitches();

  if (!error) {
    registraAccion({
      actorId: auth.user.id,
      action: 'set_training_switch',
      target: TRAINING_SWITCH_ROW[switchId],
      detail: { enabled: d.enabled },
    });
  }

  return { success: !error, error: error?.message };
}
