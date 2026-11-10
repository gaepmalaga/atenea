/**
 * Lo mínimo de los datos de demostración que comparten el servidor y la
 * pantalla (regla 106): las fases de la carga y las formas de lo que se
 * enseña. Aparte de `demo.ts` y `demo-motor.ts` para que la pantalla no
 * arrastre al navegador el generador entero.
 */

export type FaseDemo = 'cuentas' | 'grupos' | 'fisica' | 'respuestas' | 'cobros';
export const FASES_DEMO: readonly FaseDemo[] = ['cuentas', 'grupos', 'fisica', 'respuestas', 'cobros'];
export const ETIQUETA_FASE: Record<FaseDemo, string> = {
  cuentas: 'Cuentas',
  grupos: 'Grupos y horario',
  fisica: 'Física',
  respuestas: 'Respuestas y marcas',
  cobros: 'Cobros',
};

/** El dominio de los correos de la demo: reservado (`.test`), no recibe correo. */
export const DOMINIO_DEMO = 'demo.alphapol.test';
/** La cuenta de alumno para ver la parte del alumno. */
export const EMAIL_ALUMNO_DEMO = `alumno@${DOMINIO_DEMO}`;

export type EstadoDemo = {
  hay: boolean;
  /** `YYYY-MM` del mes de la carga. */
  periodo: string | null;
  /** Filas de verdad apuntadas (sin las marcas de la propia carga). */
  filas: number;
  cuentas: number;
  /** Las cinco fases terminaron. */
  completa: boolean;
  /** Las tandas hechas y las que hay. */
  hechas: number;
  tandas: number;
};

export type FilaEnsayo = { tabla: string; total: number; registradas: number; colgadas: number };
export type EnsayoDemo = {
  filas: FilaEnsayo[];
  /** Filas que se van (sin las cuentas). */
  total: number;
  colgadas: number;
  cuentas: number;
  /** Lo que el ensayo avisa: el contador de recibos, el registro de auditoría… */
  avisos: string[];
};
