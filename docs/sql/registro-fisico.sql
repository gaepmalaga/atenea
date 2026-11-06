-- =============================================================================
-- REGISTRO DEL ENTRENAMIENTO DE GRUPO (regla 84, 6 nov 2026)
-- =============================================================================
--
-- Para sustituir la herramienta que usaba Alphapol para mandar la física: el
-- alumno marca cada día del plan de su grupo como HECHO, con el esfuerzo
-- (1-10) y cómo se ha sentido, y el preparador ve quién ha entrenado.
--
-- Hasta ahora no se podía marcar nada en un plan de grupo (regla 57): el plan
-- es COMPARTIDO y escribir el registro dentro de él lo habría reescrito para
-- todos. Por eso el registro vive aparte, UNA FILA POR ALUMNO Y DÍA, y el plan
-- no se toca.
--
-- El día se guarda como FECHA (`session_date`), no como posición en el plan:
-- si el preparador reordena o cambia un día, una posición apuntaría a otra
-- cosa; la fecha no.
--
-- RLS ACTIVADA Y SIN POLÍTICAS, igual que `class_absences` (regla 82): solo la
-- clave de servicio, detrás de `requireUser` (el alumno, filtrando siempre por
-- su id y comprobando que es del grupo) o de `requireAdmin` (el preparador).
--
-- Idempotente.
-- =============================================================================

create table if not exists public.group_workout_logs (
  class_id uuid not null references public.class_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  rpe smallint check (rpe is null or (rpe between 1 and 10)),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, user_id, session_date)
);

alter table public.group_workout_logs enable row level security;

create index if not exists group_workout_logs_por_fecha on public.group_workout_logs (class_id, session_date);

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select relrowsecurity from pg_class where relname = 'group_workout_logs';
--   -- true
--   select count(*) from pg_policies where tablename = 'group_workout_logs';
--   -- 0
