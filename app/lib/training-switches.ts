/**
 * Interruptores de entrenamiento (feedback del dueño tras P8, ampliado en P10).
 *
 * Además de los módulos enteros (P4), la academia enciende o apaga por separado:
 *
 *  - `ai`       — que el ALUMNO se genere su plan de FÍSICAS con IA
 *                 (`generateWeeklyPlan` / `generateNextWeek`). De pago.
 *  - `group`    — el plan de físicas MANUAL por grupo (`saveGroupTrainingPlan`).
 *  - `adaptive` — que el modo «Entrenamiento» del TEST sea adaptativo (P10):
 *                 repetición espaciada + cajones por alumno. Apagado = vuelve a
 *                 la selección aleatoria de siempre.
 *
 * Se guardan en `module_settings` con `module_id` de TEXTO LIBRE. La tabla ya
 * lo admite y `toModuleSettings` ignora los ids que no conoce, así que esto NO
 * necesita SQL.
 *
 * **POR ACADEMIA, no global** (12 sep 2026, encontrado probando con dos
 * academias reales): `module_settings.organization_id` existe en la tabla
 * desde P11-multi-academia.sql, pero nadie lo usaba — la clave de conflicto
 * del upsert es `module_id` a secas, así que una sola fila `training_ai`
 * gobernaba TODAS las academias a la vez. Sin migrar la restricción (no hay
 * DDL desde aquí), el `module_id` lleva la academia incrustada —
 * `trainingSwitchModuleId('ai', organizationId)` da `training_ai:<uuid>` — y
 * así cada academia tiene su propia fila con el mismo mecanismo de siempre,
 * sin tocar el esquema. Mismo truco que ya usa P8 (regla 54).
 *
 * Misma semántica que P4, y por los mismos motivos:
 *   - SIN FILA = ENCENDIDO (crear nada no apaga; un interruptor nuevo nace on).
 *   - Si la LECTURA FALLA se cae a encendido: un blip de la BD no puede
 *     parecerse a un apagado deliberado y dejar a la clase sin plan.
 *
 * **`ai` y `group` son EXCLUYENTES por academia** (decidido el 12 sep): la
 * academia «casa» (`ACADEMIA_CASA_SLUG`) es solo-IA — el alumno se genera su
 * plan, sin grupos de físicas —; cualquier otra academia es solo-manual — un
 * preparador escribe el plan por grupo, sin que el alumno pueda pedirle uno a
 * Gemini —. `aplicaReglaCasa` fuerza el que no toca a `false` pase lo que diga
 * la fila guardada: no es solo qué interruptor se OFRECE en el panel, es lo
 * que de verdad corta `requireTrainingSwitch` en el servidor.
 *
 * ESTE fichero es PURO (etiquetas, ids, `toTrainingSwitches`): lo importa el
 * panel de admin, que es cliente. El LECTOR con caché y el corte de servidor
 * viven en `training-switch-guard.ts`, que arrastra `actions/core`
 * (`server-only`) — misma separación que `audit-labels.ts` / `admin-audit.ts`
 * (regla 49).
 */

export const TRAINING_SWITCH_IDS = ['ai', 'group', 'adaptive'] as const;
export type TrainingSwitchId = (typeof TRAINING_SWITCH_IDS)[number];

/** El prefijo del `module_id` con el que se guarda cada uno en `module_settings`. */
export const TRAINING_SWITCH_ROW: Record<TrainingSwitchId, string> = {
  ai: 'training_ai',
  group: 'training_group',
  adaptive: 'training_adaptive',
};

/** El `module_id` real de una academia: el prefijo + la academia incrustada. */
export function trainingSwitchModuleId(id: TrainingSwitchId, organizationId: string): string {
  return `${TRAINING_SWITCH_ROW[id]}:${organizationId}`;
}

export type TrainingSwitches = Record<TrainingSwitchId, boolean>;

export const TRAINING_SWITCH_LABEL: Record<TrainingSwitchId, string> = {
  ai: 'Plan de físicas generado con IA (lo pide el alumno)',
  group: 'Plan de físicas manual por grupo',
  adaptive: 'Entrenamiento del test adaptativo',
};

export const TRAINING_SWITCH_DESC: Record<TrainingSwitchId, string> = {
  ai: 'El alumno se genera su propio plan y la semana siguiente desde su móvil. Cada generación es una llamada de pago a Gemini.',
  group: 'Escribes un plan por grupo de físicas y sus miembros lo ven. Si lo apagas, el plan de grupo deja de llegarles.',
  adaptive: 'El modo «Entrenamiento» reparte las preguntas por repetición espaciada: repasa lo fallado, consolida lo aprendido, introduce lo nuevo con medida. Apagado = selección aleatoria de siempre.',
};

/** Todo encendido. Estado de partida y respaldo ante un fallo. */
export function todosLosSwitches(): TrainingSwitches {
  return { ai: true, group: true, adaptive: true };
}

/** Invierte `trainingSwitchModuleId`: del `module_id` guardado al id corto. */
function idDeFila(moduleId: unknown, organizationId: string): TrainingSwitchId | null {
  if (typeof moduleId !== 'string') return null;
  for (const id of TRAINING_SWITCH_IDS) {
    if (trainingSwitchModuleId(id, organizationId) === moduleId) return id;
  }
  return null;
}

/**
 * Filas de `module_settings` de UNA academia -> estado de sus interruptores.
 * `organizationId` decide qué `module_id` compuesto le pertenece a cada fila
 * — la consulta ya viene filtrada por `organization_id`, pero el `module_id`
 * es lo único que dice CUÁL de los tres interruptores es.
 */
export function toTrainingSwitches(
  filas: { module_id?: unknown; enabled?: unknown }[],
  organizationId: string,
): TrainingSwitches {
  const out = todosLosSwitches();
  for (const fila of filas ?? []) {
    const id = idDeFila(fila?.module_id, organizationId);
    if (id && fila.enabled === false) out[id] = false;
  }
  return out;
}

/**
 * `ai` y `group` no pueden convivir encendidos en la misma academia (decidido
 * el 12 sep): la academia «casa» es solo-IA, cualquier otra es solo-manual.
 * Se fuerza el que no toca a `false` aquí, en el sitio que leen TODOS los
 * consumidores (`requireTrainingSwitch`, el panel de admin, el módulo del
 * alumno) — así no hay un camino que se olvide de comprobarlo.
 */
export function aplicaReglaCasa(switches: TrainingSwitches, esCasa: boolean): TrainingSwitches {
  return esCasa ? { ...switches, group: false } : { ...switches, ai: false };
}

/** El mensaje que ve quien intenta usar un interruptor apagado. */
export function mensajeSwitchApagado(id: TrainingSwitchId): string {
  if (id === 'ai') return 'La academia ha desactivado la generación de planes con IA. Habla con tu preparador.';
  if (id === 'group') return 'El plan de grupo está desactivado por la academia.';
  return 'El entrenamiento adaptativo está desactivado por la academia.';
}
