/**
 * LA CONTRASEÑA: un solo mínimo, y la marca de «provisional» (regla 111).
 *
 * POR QUÉ EXISTE
 * El mínimo era 6 en la pantalla de «elige tu contraseña» y 8 en «cambiar mi
 * contraseña» de Mi perfil: dos números para la misma cosa. Y la contraseña
 * provisional del alta en bloque (`Alpha-xxxx-xxxx`, regla 83) decía en su
 * comentario «se cambia al entrar», pero nada obligaba: el alumno podía
 * quedarse para siempre con la que salió en una lista que la academia
 * descarga, imprime o manda por WhatsApp.
 *
 * Ahora la cuenta creada con clave provisional lleva esta marca en sus
 * metadatos, y mientras la lleve la aplicación no enseña nada más que la
 * pantalla de poner una contraseña propia.
 */

/** El mínimo, en todas las pantallas. */
export const MIN_CLAVE = 8;

/** La clave de `user_metadata` que dice «esta contraseña la puso la academia». */
export const META_CLAVE_PROVISIONAL = 'clave_provisional';

/** ¿Tiene todavía la contraseña que le dio la academia? */
export function tieneClaveProvisional(metadata: unknown): boolean {
  return !!metadata && typeof metadata === 'object'
    && (metadata as Record<string, unknown>)[META_CLAVE_PROVISIONAL] === true;
}

/** Por qué no vale una contraseña nueva, o `null` si vale. */
export function problemaDeClave(clave: string, repetida: string): string | null {
  if (clave.length < MIN_CLAVE) return `La contraseña es demasiado corta: necesita al menos ${MIN_CLAVE} caracteres.`;
  if (clave !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}
