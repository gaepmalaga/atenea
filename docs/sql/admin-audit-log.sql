-- ============================================================================
-- EL REGISTRO DE ACCIONES DE ADMINISTRACIÓN
--
-- QUÉ RESUELVE
-- La pestaña "Logs" enseñaba las últimas 20 respuestas de CUALQUIER alumno a
-- CUALQUIER pregunta. Eso no es un registro de administración: no dice quién
-- hizo qué, no se puede filtrar y no sirve para auditar nada. Es un resto de
-- cuando la aplicación aún no distinguía "actividad del alumno" de "acciones
-- del que dirige la academia".
--
-- UN REGISTRO DE VERDAD ES DE ACCIONES DE ADMINISTRACIÓN: quién borró un
-- tema, quién publicó preguntas al banco, quién apagó un módulo, quién dio de
-- baja a un alumno. Eso es lo que se guarda aquí.
--
-- POR QUÉ ES SOLO ESTA TABLA Y NO UN "TRIGGER EN TODO"
-- Registrar cada lectura sería ruido; lo que importa auditar es lo que
-- CAMBIA algo para más de una persona o que no se puede deshacer solo. La
-- lista concreta vive en `app/lib/admin-audit.ts` y no aquí: la tabla solo
-- necesita saber guardar una fila, no decidir cuáles.
--
-- CERO POLÍTICAS DE RLS: es administración pura, igual que `ai_usage` y
-- `academy_settings`. Se lee y se escribe con la clave de servicio, detrás de
-- `requireAdmin`.
--
-- ES IDEMPOTENTE.
-- ============================================================================

create table if not exists public.admin_audit_log (
  id         uuid        primary key default gen_random_uuid(),
  actor_id   uuid        not null references auth.users(id) on delete set null,
  -- 'delete_document', 'disable_question', 'set_module_enabled'... El nombre
  -- corto de la acción, no una frase: se filtra por él.
  action     text        not null,
  -- A quién o qué afecta: un tema, una pregunta, un alumno, un módulo. Texto
  -- libre porque el "tipo" de destino cambia según la acción.
  target     text,
  -- Lo que explica la acción sin tener que adivinarlo: el título del tema
  -- borrado, el motivo de un rechazo, el módulo que se apagó.
  detail     jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_fecha on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_actor on public.admin_audit_log (actor_id, created_at desc);

alter table public.admin_audit_log enable row level security;
