/**
 * EL REGISTRO DE ACCIONES DE ADMINISTRACIÓN.
 *
 * POR QUÉ EXISTE
 * La pestaña "Logs" enseñaba las últimas 20 respuestas de cualquier alumno a
 * cualquier pregunta. Eso no es un registro: no dice QUIÉN hizo QUÉ, y con una
 * sola academia y un solo admin no importaba — pero en cuanto hay más de una
 * persona con acceso, borrar un tema o apagar un módulo sin dejar rastro de
 * quién lo hizo es el tipo de fallo que solo se nota cuando ya ha pasado.
 *
 * MISMO PATRÓN QUE `ai-usage.ts`: se registra en el log del servidor SIEMPRE
 * (con un prefijo filtrable, para tener rastro incluso antes de que exista la
 * tabla) y se intenta persistir en `admin_audit_log`. Nunca lanza: registrar
 * la acción no puede tumbar la acción en sí.
 *
 * QUÉ SE REGISTRA Y QUÉ NO
 * No todo: registrar cada lectura sería ruido. Lo que se registra es lo que
 * CAMBIA algo para más de una persona (borrar un tema del temario, publicar
 * preguntas al banco) o lo que no se puede deshacer solo (descartar
 * candidatas, apagar un módulo). Generar contenido con IA ya queda registrado
 * por `ai-usage.ts` con su propio detalle (ruta, coste, tema); no se duplica
 * aquí.
 */

export type { AccionAuditada } from './audit-labels';
import type { AccionAuditada } from './audit-labels';

export type EntradaAuditoria = {
  actorId: string;
  action: AccionAuditada;
  /** A quién o qué afecta: el título de un tema, el id de una pregunta... */
  target?: string | null;
  /** Lo que explica la acción sin tener que adivinarlo. */
  detail?: Record<string, unknown>;
};

/** La línea que va al registro del servidor. Prefijo fijo para poder filtrar. */
export function lineaDeAuditoria(e: EntradaAuditoria): string {
  return [
    '[admin-audit]',
    `actor=${e.actorId}`,
    `accion=${e.action}`,
    e.target ? `destino=${e.target}` : '',
    e.detail ? `detalle=${JSON.stringify(e.detail)}` : '',
  ].filter(Boolean).join(' ');
}

/**
 * Registra una acción de administración. Nunca lanza.
 *
 * Se llama DESPUÉS de que la acción real haya tenido éxito: un fallo al
 * auditar no puede deshacer un borrado que ya ha pasado ni impedir uno que
 * debía pasar.
 */
export function registraAccion(e: EntradaAuditoria): void {
  try {
    console.log(lineaDeAuditoria(e));
  } catch {
    // Un registro que rompe la petición es peor que no tener registro.
  }
  void persisteAccion(e);
}

/**
 * El insert, aparte y sin esperar. Import dinámico de `actions/core` por lo
 * mismo que `rate-limit.ts` y `ai-usage.ts`: ese módulo es `server-only` y
 * arrastra el cliente de Gemini.
 */
async function persisteAccion(e: EntradaAuditoria): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const { supabaseAdmin } = await import('../actions/core');
    const { error } = await supabaseAdmin.from('admin_audit_log').insert({
      actor_id: e.actorId,
      action: e.action,
      target: e.target ?? null,
      detail: e.detail ?? null,
    });
    if (error) console.error('[admin-audit] no se pudo guardar:', error.message);
  } catch (err) {
    console.error('[admin-audit] no se pudo guardar:', err instanceof Error ? err.message : err);
  }
}
