/**
 * LA PUERTA DE ACCESO (P6 · afinado en P8).
 *
 * El registro de pagos se movió a `lib/payments.ts` (rejilla mensual). Aquí
 * queda solo la DECISIÓN de si un alumno entra, que es lógica pura y se testea.
 * La leen `auth.ts` (para aplicarla) y `actions/membership.ts` (para escribir).
 */

export const ACCESS_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
} as const;
export type AccessStatus = (typeof ACCESS_STATUS)[keyof typeof ACCESS_STATUS];

/** Lo que la puerta le dice al alumno. `pending` = registrado, sin activar. */
export type AccessDecision = 'ok' | 'pending' | 'suspended';

/** Una fila de `memberships`, o `null` si el alumno no tiene ninguna todavía. */
export type MembershipRow = {
  access_status?: string | null;
} | null;

/**
 * ¿Puede entrar este usuario?
 *
 * El ORDEN de las reglas es la decisión, y no es negociable:
 *
 *  1. Un ADMIN entra siempre. Cerrarle la puerta al que gestiona la puerta es
 *     cómo te quedas fuera de tu propia plataforma.
 *  2. Con el interruptor GLOBAL apagado (`required === false`), entra todo el
 *     mundo — es el estado de hoy, y encender el control de acceso no puede ser
 *     un efecto colateral de ejecutar el guion SQL.
 *  3. Si la LECTURA falló (la tabla no existe todavía, la BD no contesta), se
 *     abre la puerta. Un fallo de lectura no puede dejar a la academia entera
 *     fuera sin que nadie lo haya decidido — misma regla que `module-guard`,
 *     pero aquí el coste de equivocarse es mayor: son alumnos que SÍ han pagado.
 *  4. SIN FILA = pendiente. Un alumno recién registrado no entra hasta que el
 *     administrador lo active.
 *  5. Fila con `suspended` = fuera. Es lo que el administrador pone cuando
 *     alguien deja de pagar o pide la baja.
 *  6. Cualquier otra cosa (fila `active`) = dentro.
 */
export function decideAccess(params: {
  required: boolean;
  role: 'admin' | 'student';
  row: MembershipRow;
  /** `false` si la consulta a `memberships`/`membership_settings` dio error. */
  readOk: boolean;
}): AccessDecision {
  const { required, role, row, readOk } = params;

  if (role === 'admin') return 'ok';
  if (!required) return 'ok';
  if (!readOk) return 'ok';
  if (!row) return 'pending';
  if (row.access_status === ACCESS_STATUS.SUSPENDED) return 'suspended';
  return 'ok';
}
