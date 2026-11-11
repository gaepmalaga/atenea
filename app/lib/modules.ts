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
  // Psicotécnicos generados por código (regla 117).
  'psico',
  'training',
  'interview',
  'stats',
  'profile',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

/** Como se llama cada uno delante del administrador. Igual que en el menu. */
export const MODULE_LABEL: Record<ModuleId, string> = {
  home: 'Inicio',
  chat: 'Pregunta al temario',
  test: 'Test',
  review: 'Repasar fallos',
  cards: 'Fichas',
  psico: 'Psicotécnicos',
  training: 'Preparación física',
  interview: 'Entrevista',
  stats: 'Mi evolución',
  profile: 'Mi perfil',
};

/** Que se pierde el alumno si se apaga. Para que el interruptor no sea a ciegas. */
export const MODULE_DESCRIPCION: Record<ModuleId, string> = {
  home: 'La pantalla de entrada, con el resumen del día.',
  chat: 'Preguntar al temario. Cada consulta son dos llamadas de pago.',
  test: 'Hacer tests y simulacros, y todo lo que se guarda de ellos.',
  review: 'Volver sobre las preguntas falladas, con su diagnóstico.',
  cards: 'Repaso espaciado con tarjetas.',
  psico: 'Series, cálculo, atención y figuras, contra el reloj. No gasta IA.',
  training: 'Perfil físico, marcas y plan de entrenamiento.',
  interview: 'Biodata, psicotécnico y simulador de entrevista.',
  stats: 'Simulacros, dominio del temario y cómo respondes.',
  profile: 'La convocatoria, el acceso del alumno y sus grupos.',
};

export type ModuleSettings = Record<ModuleId, boolean>;

/**
 * MÓDULOS QUE NO ENTRAN EN EL MVP.
 *
 * No están borrados: el código sigue entero —`IntelChat`, `actions/chat.ts`, la
 * recuperación del temario, el historial— y `requireModule` los sigue
 * protegiendo en el servidor. Simplemente NO se le ofrecen al alumno ni salen
 * en los interruptores del panel, porque hoy dan más problemas que valor.
 *
 * `chat` (7 sep 2026), por decisión del dueño: el coste por pregunta es alto
 * (documento entero, regla 33), la calidad depende de que el alumno elija bien
 * el tema, y para el piloto no es lo que diferencia a la plataforma — eso es el
 * entrenamiento adaptativo. Se retoma cuando el piloto lo pida.
 *
 * `interview` (8 sep 2026), también por decisión del dueño: la biodata y el
 * psicotécnico (`BiodataManager`) y el simulacro de entrevista por voz
 * (`InterviewRoom`) se aparcan para el piloto. Los datos personales que sí
 * importan viven ahora en «Mi perfil». El código entero se queda.
 *
 * Para devolver cualquiera: quitarlo de esta lista. Nada más.
 */
export const MODULOS_FUERA_DEL_MVP: readonly ModuleId[] = ['chat', 'interview'];

/** ¿Se le ofrece hoy al alumno? Ver `MODULOS_FUERA_DEL_MVP`. */
export function enElMvp(id: ModuleId): boolean {
  return !MODULOS_FUERA_DEL_MVP.includes(id);
}

/** Los módulos que hoy se ven, en el orden del menú. */
export const MODULE_IDS_MVP: readonly ModuleId[] = MODULE_IDS.filter(enElMvp);

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
/**
 * La fila de un módulo PARA UNA ACADEMIA (regla 109): `test:<uuid>`. El mismo
 * truco que `training-switches.ts`, y por lo mismo: `module_id` es la clave de
 * la tabla, así que una fila por academia cabe sin cambiar el esquema. La fila
 * sin sufijo (`test`) es la de toda la plataforma y solo la toca el superadmin.
 */
export function moduleRowId(id: ModuleId, organizationId: string): string {
  return `${id}:${organizationId}`;
}

export function toModuleSettings(
  filas: { module_id?: unknown; enabled?: unknown }[],
  organizationId?: string | null,
): ModuleSettings {
  const settings = todosActivos();
  // Primero lo de la plataforma…
  for (const fila of filas ?? []) {
    if (isModuleId(fila?.module_id) && fila.enabled === false) {
      settings[fila.module_id] = false;
    }
  }
  // …y encima lo que haya dicho ESTA academia, en un sentido o en otro. Las
  // filas de otra academia no se miran.
  if (organizationId) {
    for (const fila of filas ?? []) {
      if (typeof fila?.module_id !== 'string' || typeof fila.enabled !== 'boolean') continue;
      const [id, org, ...resto] = fila.module_id.split(':');
      if (resto.length === 0 && org === organizationId && isModuleId(id)) settings[id] = fila.enabled;
    }
  }
  return settings;
}

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
