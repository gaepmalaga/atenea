/**
 * El tipo de acción auditada y cómo se lee en pantalla — separado de
 * `admin-audit.ts` a propósito.
 *
 * `admin-audit.ts` importa `actions/core` (dinámicamente, pero lo importa) y
 * ese módulo es `server-only`. La pantalla de auditoría (`AdminActivity.tsx`,
 * un componente de cliente) solo necesita el mapa de etiquetas para pintar
 * cada fila — si lo importara de `admin-audit.ts` arrastraría el cliente de
 * Supabase de servicio al bundle del navegador. Separar el dato puro del
 * efecto (escribir el registro) es la misma idea que ya obliga la regla 21 a
 * `core.ts`.
 */

export type AccionAuditada =
  | 'delete_document'
  | 'delete_topic'
  | 'disable_question'
  | 'discard_all_candidates'
  | 'approve_questions'
  | 'set_module_enabled'
  | 'save_manual_training_plan'
  | 'resolve_report'
  | 'save_academy_settings'
  | 'save_staff'
  | 'delete_staff';

/** Cómo se lee cada acción en la pantalla, en vez del nombre en inglés-código. */
export const ACCION_LABEL: Record<AccionAuditada, string> = {
  delete_document: 'Borró un documento del temario',
  delete_topic: 'Borró un tema',
  disable_question: 'Descartó una pregunta',
  discard_all_candidates: 'Descartó todas las candidatas',
  approve_questions: 'Publicó preguntas al banco',
  set_module_enabled: 'Cambió un módulo',
  save_manual_training_plan: 'Guardó un plan de entrenamiento',
  resolve_report: 'Resolvió un reporte',
  save_academy_settings: 'Editó los datos de la academia',
  save_staff: 'Guardó un profesor',
  delete_staff: 'Borró un profesor',
};
