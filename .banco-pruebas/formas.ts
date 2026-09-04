/**
 * QUE EL BANCO DE PRUEBAS NO PUEDA MENTIR.
 *
 * `acciones-falsas.ts` sustituye las 48 Server Actions por datos de prueba. Si
 * un stub devuelve otra forma que la accion de verdad, la pantalla se comporta
 * distinta —o revienta— y el banco da por bueno algo que en produccion no lo
 * es. Ya paso dos veces:
 *
 *   · `getAcademyOverview` devolvia `coverage`/`students` (en ingles) y la de
 *     verdad usa `cobertura`/`alumnos`: Academia se caia entera.
 *   · `getFailedQuestions` devolvia `{ data: [...] }` en snake_case y la de
 *     verdad devuelve `{ success, items, byTopic }` en camelCase, asi que
 *     `res.items` era `undefined` y la pantalla de repaso salia SIEMPRE vacia.
 *     El modulo entero no lo habia visto nadie con datos.
 *
 * Esto lo convierte en un error de compilacion. Compara las CLAVES de la rama
 * de exito, que es lo que leen las pantallas; no los tipos de cada campo,
 * porque un stub simplifica a proposito (una fecha como cadena, un enum como
 * `string`) y exigir tipo por tipo haria la comprobacion inmantenible.
 *
 * No se ejecuta: es un fichero de tipos. `npm run check` lo comprueba.
 */
import type * as Reales from '@/app/actions';
import type * as Falsas from './acciones-falsas';

/** La rama de exito de una accion, si es que la tiene discriminada. */
type Exito<F> = F extends (...args: never[]) => unknown
  ? Extract<Awaited<ReturnType<F>>, { success: true }>
  : never;

/**
 * Las claves OBLIGATORIAS de esa rama.
 *
 * Las opcionales no cuentan: casi todas las acciones declaran `error?: string`
 * tambien en la rama buena, y ninguna pantalla depende de que el stub la
 * traiga. Contarlas convertia la comprobacion en 43 falsos positivos.
 */
type ClavesRequeridas<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type ClavesDelExito<F> = ClavesRequeridas<Exito<F>>;

type Comunes = Extract<keyof typeof Falsas, keyof typeof Reales>;

/**
 * La comprobacion es EN UN SOLO SENTIDO: todo lo que promete la accion de
 * verdad tiene que estar en el stub. Al reves no: que el stub traiga un campo
 * de mas no rompe ninguna pantalla.
 *
 * Y solo opina de las acciones con la rama de exito DISCRIMINADA
 * (`success: true as const`). Varias devuelven `{ success: boolean }` a secas
 * —las de escribir, que solo dicen si fue bien—: ahi no hay forma que
 * comparar.
 */
type Desajustadas = {
  [K in Comunes]: [Exito<(typeof Reales)[K]>] extends [never]
    ? never
    : [Exito<(typeof Falsas)[K]>] extends [never]
      ? never
      : [ClavesDelExito<(typeof Reales)[K]>] extends [ClavesDelExito<(typeof Falsas)[K]>]
        ? never
        : K;
}[Comunes];

/**
 * Si esto deja de compilar, el error dice EXACTAMENTE que stub se ha desviado.
 * Se arregla el stub, no esta linea.
 */
export const sinDesajustes: [Desajustadas] extends [never] ? true : Desajustadas = true;
