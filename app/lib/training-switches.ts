/**
 * Interruptores de la preparación física (feedback del dueño tras P8).
 *
 * Además del módulo `training` entero (P4), la academia enciende o apaga por
 * separado dos cosas:
 *
 *  - `ai`    — que el ALUMNO se genere su plan con IA (`generateWeeklyPlan` y
 *              `generateNextWeek`). Cada generación se paga.
 *  - `group` — el plan MANUAL por grupo (`saveGroupTrainingPlan`) y que sus
 *              miembros lo hereden en el módulo del alumno.
 *
 * Se guardan en `module_settings` con `module_id` de TEXTO LIBRE
 * (`training_ai`, `training_group`). La tabla ya lo admite y `toModuleSettings`
 * ignora los ids que no conoce, así que esto NO necesita SQL.
 *
 * Misma semántica que P4, y por los mismos motivos:
 *   - SIN FILA = ENCENDIDO (crear nada no apaga; un interruptor nuevo nace on).
 *   - Si la LECTURA FALLA se cae a encendido: un blip de la BD no puede
 *     parecerse a un apagado deliberado y dejar a la clase sin plan.
 *
 * ESTE fichero es PURO (etiquetas, ids, `toTrainingSwitches`): lo importa el
 * panel de admin, que es cliente. El LECTOR con caché y el corte de servidor
 * viven en `training-switch-guard.ts`, que arrastra `actions/core`
 * (`server-only`) — misma separación que `audit-labels.ts` / `admin-audit.ts`
 * (regla 49).
 */

export const TRAINING_SWITCH_IDS = ['ai', 'group'] as const;
export type TrainingSwitchId = (typeof TRAINING_SWITCH_IDS)[number];

/** El `module_id` con el que se guarda cada uno en `module_settings`. */
export const TRAINING_SWITCH_ROW: Record<TrainingSwitchId, string> = {
  ai: 'training_ai',
  group: 'training_group',
};

export type TrainingSwitches = Record<TrainingSwitchId, boolean>;

export const TRAINING_SWITCH_LABEL: Record<TrainingSwitchId, string> = {
  ai: 'Plan generado con IA (lo pide el alumno)',
  group: 'Plan manual por grupo',
};

export const TRAINING_SWITCH_DESC: Record<TrainingSwitchId, string> = {
  ai: 'El alumno se genera su propio plan y la semana siguiente desde su móvil. Cada generación es una llamada de pago a Gemini.',
  group: 'Escribes un plan por grupo de físicas y sus miembros lo ven. Si lo apagas, el plan de grupo deja de llegarles.',
};

/** Todo encendido. Estado de partida y respaldo ante un fallo. */
export function todosLosSwitches(): TrainingSwitches {
  return { ai: true, group: true };
}

/** Invierte `TRAINING_SWITCH_ROW`: del `module_id` guardado al id corto. */
function idDeFila(moduleId: unknown): TrainingSwitchId | null {
  if (typeof moduleId !== 'string') return null;
  for (const id of TRAINING_SWITCH_IDS) {
    if (TRAINING_SWITCH_ROW[id] === moduleId) return id;
  }
  return null;
}

/** Filas de `module_settings` -> estado de los dos interruptores. */
export function toTrainingSwitches(filas: { module_id?: unknown; enabled?: unknown }[]): TrainingSwitches {
  const out = todosLosSwitches();
  for (const fila of filas ?? []) {
    const id = idDeFila(fila?.module_id);
    if (id && fila.enabled === false) out[id] = false;
  }
  return out;
}

/** El mensaje que ve quien intenta usar un interruptor apagado. */
export function mensajeSwitchApagado(id: TrainingSwitchId): string {
  return id === 'ai'
    ? 'La academia ha desactivado la generación de planes con IA. Habla con tu preparador.'
    : 'El plan de grupo está desactivado por la academia.';
}
