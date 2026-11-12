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
  | 'disable_family_duplicates'
  | 'discard_all_candidates'
  | 'approve_questions'
  | 'set_module_enabled'
  | 'save_manual_training_plan'
  | 'resolve_report'
  | 'save_convocatoria'
  | 'save_academy_settings'
  | 'save_staff'
  | 'delete_staff'
  | 'set_membership_required'
  | 'set_member_access'
  | 'activate_all_students'
  | 'set_payment'
  | 'registra_cobro'
  | 'anula_cobro'
  | 'set_cuota_mes'
  | 'set_cuota_propia'
  | 'set_precio_tipo'
  | 'save_pack'
  | 'delete_pack'
  | 'create_group'
  | 'update_group'
  | 'delete_group'
  | 'set_student_groups'
  | 'save_group_kind'
  | 'delete_group_kind'
  | 'save_group_training_plan'
  | 'delete_group_training_plan'
  | 'set_training_switch'
  | 'create_academy'
  | 'add_academy_admin'
  | 'add_exempt_email'
  | 'remove_exempt_email'
  | 'invite_student'
  | 'bulk_add_students'
  | 'cargar_demo'
  | 'save_exam_paper'
  | 'apply_exam'
  | 'delete_exam'
  | 'set_exam_result'
  | 'borrar_demo';

/** Cómo se lee cada acción en la pantalla, en vez del nombre en inglés-código. */
export const ACCION_LABEL: Record<AccionAuditada, string> = {
  delete_document: 'Borró un documento del temario',
  delete_topic: 'Borró un tema',
  disable_question: 'Descartó una pregunta',
  disable_family_duplicates: 'Se quedó con una pregunta y descartó sus repetidas',
  discard_all_candidates: 'Descartó todas las candidatas',
  approve_questions: 'Publicó preguntas al banco',
  set_module_enabled: 'Cambió un módulo',
  save_manual_training_plan: 'Guardó un plan de entrenamiento',
  resolve_report: 'Resolvió un reporte',
  save_convocatoria: 'Fijó la fecha de la convocatoria',
  save_academy_settings: 'Editó los datos de la academia',
  save_staff: 'Guardó un profesor',
  delete_staff: 'Borró un profesor',
  set_membership_required: 'Cambió el control de acceso',
  set_member_access: 'Cambió el acceso de un alumno',
  activate_all_students: 'Dio acceso a todos los alumnos actuales',
  set_payment: 'Marcó un pago mensual',
  registra_cobro: 'Cobró una cuota',
  anula_cobro: 'Deshizo un cobro',
  set_cuota_mes: 'Cambió la cuota de un mes',
  set_cuota_propia: 'Puso la cuota propia de un alumno',
  set_precio_tipo: 'Cambió el precio de un tipo de grupo',
  save_pack: 'Guardó un pack de precios',
  delete_pack: 'Borró un pack de precios',
  create_group: 'Creó un grupo',
  update_group: 'Editó un grupo',
  delete_group: 'Borró un grupo',
  set_student_groups: 'Cambió los grupos de un alumno',
  save_group_kind: 'Guardó un tipo de grupo',
  delete_group_kind: 'Borró un tipo de grupo',
  save_group_training_plan: 'Guardó el plan de entrenamiento de un grupo',
  delete_group_training_plan: 'Borró el plan de entrenamiento de un grupo',
  set_training_switch: 'Cambió un interruptor de preparación física',
  create_academy: 'Dio de alta una academia',
  add_academy_admin: 'Añadió un admin a una academia',
  add_exempt_email: 'Añadió un correo exento de pago',
  remove_exempt_email: 'Quitó un correo de la lista de exentos',
  invite_student: 'Invitó a un alumno por correo',
  bulk_add_students: 'Dio de alta a varios alumnos de golpe',
  cargar_demo: 'Cargó los datos de demostración',
  borrar_demo: 'Borró los datos de demostración',
  save_exam_paper: 'Guardó un examen en papel',
  apply_exam: 'Puso un examen a un turno',
  delete_exam: 'Borró un examen o su aplicación',
  set_exam_result: 'Puso una nota o una ausencia en un examen',
};
