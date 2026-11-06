-- =============================================================================
-- ASISTENCIA: HORARIO, PLAZAS Y AVISOS DE FALTA (regla 82, 6 nov 2026)
-- =============================================================================
--
-- Lo pidió Alphapol: que cada alumno pueda avisar de las clases a las que va a
-- faltar, para que la academia sepa cuántas plazas quedan libres en cada clase
-- cuando alguien pide un cambio. Cada grupo tiene un número de plazas fijo.
--
-- 1 · `class_groups` gana un horario ESTRUCTURADO: días de la semana, hora de
--     inicio y fin, y plazas. Hasta ahora `schedule` era un texto libre
--     («L-X 17:00»), y de un texto no se pueden sacar las sesiones de cada día.
--     `schedule` se queda como nota opcional. Todo nulable: un grupo sin
--     horario sigue funcionando igual que antes, solo que no tiene sesiones.
--
-- 2 · `class_absences`: una fila por alumno, grupo y fecha en la que avisa de
--     que falta. Las sesiones NO se guardan: se derivan del horario
--     (`app/lib/asistencia.ts`), igual que las semanas del plan de grupo.
--
-- RLS ACTIVADA Y SIN POLÍTICAS, a propósito. Solo la toca la clave de servicio,
-- detrás de `requireUser` (el alumno, siempre filtrando por su propio id y
-- comprobando que es del grupo) o de `requireAdmin` (la academia). Una
-- política de propietario no bastaría: dejaría a un alumno apuntar faltas en
-- un grupo que no es el suyo, porque comprobar `class_members` desde la
-- política no es posible (esa tabla tampoco tiene políticas).
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

alter table public.class_groups
  add column if not exists weekdays smallint[],
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists capacity integer;

-- 1 = lunes … 7 = domingo (ISO). Un día fuera de rango no puede entrar ni por
-- un cliente que se salte la validación de la aplicación.
alter table public.class_groups drop constraint if exists class_groups_weekdays_validos;
alter table public.class_groups add constraint class_groups_weekdays_validos
  check (weekdays is null or weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);

alter table public.class_groups drop constraint if exists class_groups_capacity_positiva;
alter table public.class_groups add constraint class_groups_capacity_positiva
  check (capacity is null or capacity > 0);

alter table public.class_groups drop constraint if exists class_groups_horas_ordenadas;
alter table public.class_groups add constraint class_groups_horas_ordenadas
  check (start_time is null or end_time is null or end_time > start_time);

create table if not exists public.class_absences (
  class_id uuid not null references public.class_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id, session_date)
);

alter table public.class_absences enable row level security;

create index if not exists class_absences_por_fecha on public.class_absences (session_date);

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_name = 'class_groups'
--      and column_name in ('weekdays', 'start_time', 'end_time', 'capacity');
--   -- cuatro filas
--
--   select relrowsecurity from pg_class where relname = 'class_absences';
--   -- true
