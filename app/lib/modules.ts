/**
 * Que modulos del alumno estan encendidos (P4).
 *
 * Modulo puro y compartido: lo importan el dashboard del alumno, el panel de
 * administracion y las Server Actions que tienen que cerrarse cuando su modulo
 * esta apagado. Un solo sitio donde vive la lista.
 *
 * LA REGLA QUE NO SE PUEDE SALTAR: apagar un modulo tiene que apagarlo TAMBIEN
 * en el servidor. Una Server Action es un endpoint HTTP publico, asi que
 * esconder el enlace del menu no impide que nadie la llame — y cada llamada al
 * chat o al generador de preguntas se paga (regla 1, y la 20 para el coste).
 */

/**
 * Los ocho modulos, en el orden en el que salen en el menu.
 *
 * Se pueden apagar TODOS, incluidos Inicio y Estadisticas: fue una decision
 * explicita del dueño. Si se apaga el de inicio, el alumno entra por el primero
 * que quede encendido.
 */
export const MODULE_IDS = [
  'home',
  'chat',
  'test',
  'review',
  'cards',
  'training',
  'interview',
  'stats',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/** Como se llama cada uno delante del administrador. Igual que en el menu. */
export const MODULE_LABEL: Record<ModuleId, string> = {
  home: 'Centro de Mando',
  chat: 'Inteligencia (RAG)',
  test: 'Operaciones (Test)',
  review: 'Repasar fallos',
  cards: 'Drills (Memoria)',
  training: 'Prep. Física',
  interview: 'Perfilado & Voz',
  stats: 'Rango & Estadísticas',
};

/** Que se pierde el alumno si se apaga. Para que el interruptor no sea a ciegas. */
export const MODULE_DESCRIPCION: Record<ModuleId, string> = {
  home: 'La pantalla de entrada, con el resumen del día.',
  chat: 'Preguntar al temario. Cada consulta son dos llamadas de pago.',
  test: 'Hacer tests y simulacros, y todo lo que se guarda de ellos.',
  review: 'Volver sobre las preguntas falladas, con su diagnóstico.',
  cards: 'Repaso espaciado con tarjetas.',
  training: 'Perfil físico, marcas y plan de entrenamiento.',
  interview: 'Biodata, psicotécnico y simulador de entrevista.',
  stats: 'Progreso, rango y análisis de errores.',
};

export type ModuleSettings = Record<ModuleId, boolean>;

export function isModuleId(valor: unknown): valor is ModuleId {
  return typeof valor === 'string' && (MODULE_IDS as readonly string[]).includes(valor);
}

/** Todo encendido. Es el estado de partida y el respaldo si algo falla. */
export function todosActivos(): ModuleSettings {
  return Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as ModuleSettings;
}

/**
 * Filas de `module_settings` -> el estado de los ocho modulos.
 *
 * **SIN FILA = ACTIVO**, y es la decision que sostiene todo lo demas:
 *
 * - La tabla nace vacia, asi que crearla no apaga nada.
 * - Un modulo NUEVO aparece encendido en vez de desaparecer en silencio el dia
 *   que se añada al codigo y nadie se acuerde de insertar su fila.
 * - Si la consulta falla, se cae a "todo encendido" en vez de dejar al alumno
 *   con la pantalla vacia. Un fallo de lectura no puede parecerse a un apagado
 *   deliberado.
 *
 * Las filas de modulos que ya no existen se ignoran: el dia que se retire uno,
 * su fila se queda ahi sin molestar.
 */
export function toModuleSettings(filas: { module_id?: unknown; enabled?: unknown }[]): ModuleSettings {
  const settings = todosActivos();
  for (const fila of filas ?? []) {
    if (isModuleId(fila?.module_id) && fila.enabled === false) {
      settings[fila.module_id] = false;
    }
  }
  return settings;
}

/** Los encendidos, en el orden del menu. */
export function modulosActivos(settings: ModuleSettings): ModuleId[] {
  return MODULE_IDS.filter((id) => settings[id]);
}

/**
 * Por donde entra el alumno.
 *
 * Normalmente `home`, pero si esta apagado entra por el primero que quede.
 * Devuelve `null` cuando NO queda ninguno, que es un estado posible —se pueden
 * apagar los ocho— y la pantalla tiene que decirlo en vez de quedarse en
 * blanco.
 */
export function moduloDeEntrada(settings: ModuleSettings): ModuleId | null {
  return modulosActivos(settings)[0] ?? null;
}
