/**
 * QUIÉN PUEDE TOCAR UNA PREGUNTA DEL BANCO (reglas 75 y 123).
 *
 * MÓDULO PURO (regla 21): lo usan las acciones del servidor, el panel y los
 * tests, y tiene que decir lo mismo en los tres sitios.
 *
 * LA REGLA ORIGINAL (75): un admin de academia solo toca el banco PRIVADO de su
 * academia; el banco GLOBAL (`organization_id IS NULL`) es del superadmin.
 * Tenía sentido con varias academias dentro de la misma plataforma.
 *
 * LO QUE CAMBIA (123): esta instalación es de UNA academia, Alphapol, y las
 * 4.617 preguntas son del banco global. Con la regla original ningún preparador
 * podía corregir una dificultad, descartar una repetida ni atender el reporte
 * de un alumno: solo el superadmin, que no administra la academia.
 *
 * `UNA_SOLA_ACADEMIA = true` deja al ADMIN de la academia editar, descartar y
 * reactivar también el banco global. Si algún día la plataforma se comparte con
 * otra academia, se pone a `false` y vuelve la regla 75 tal cual: cada admin,
 * solo lo suyo.
 *
 * LO QUE ESTE INTERRUPTOR NO ABRE: generar preguntas con IA, ver el consumo,
 * crear academias y crear admins (`requireSuperadmin`), ni «Vaciar banco»
 * (`discardAllQuestions`, que sigue acotado al banco privado de cada uno).
 */

export const UNA_SOLA_ACADEMIA = true;

type Quien = { role: string; organizationId: string | null };

/** ¿Puede esta persona editar, descartar o reactivar esta pregunta? */
export function puedeEditarBanco(
  user: Quien,
  fila: { organization_id: string | null },
  unaSola: boolean = UNA_SOLA_ACADEMIA,
): boolean {
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin' || !user.organizationId) return false;
  if (fila.organization_id === user.organizationId) return true;
  return fila.organization_id === null && unaSola;
}

/**
 * El filtro `.or(...)` de PostgREST que acota una ESCRITURA al banco que esa
 * persona puede tocar. `null` = sin filtro (el superadmin). Va DENTRO de la
 * consulta (regla 65): una fila que no es suya simplemente no cambia.
 *
 * Quien no es admin de una academia recibe un filtro que no casa con nada.
 */
export function filtroEscrituraBanco(user: Quien, unaSola: boolean = UNA_SOLA_ACADEMIA): string | null {
  if (user.role === 'superadmin') return null;
  if (user.role !== 'admin' || !user.organizationId) return 'id.is.null';
  return unaSola
    ? `organization_id.eq.${user.organizationId},organization_id.is.null`
    : `organization_id.eq.${user.organizationId}`;
}

/**
 * Lo mismo, para el PANEL: un admin solo ve filas globales o de su academia, así
 * que una fila con academia es suya y una global es suya solo si es una sola.
 */
export function puedeEditarFilaVisible(
  esSuperadmin: boolean,
  fila: { organization_id?: string | null },
  unaSola: boolean = UNA_SOLA_ACADEMIA,
): boolean {
  return esSuperadmin || (fila.organization_id ?? null) !== null || unaSola;
}
