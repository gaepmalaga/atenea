-- =============================================================================
-- DÍAS SIN CLASE EN EL CUADRANTE Y PROFESOR CON CUENTA (regla 97, 9 nov 2026)
-- =============================================================================
--
-- 1 · `class_days_off`: «ese día ese grupo no tiene clase» (festivo, no hay
--     profesor…). El horario fijo del grupo (`class_groups.weekdays`) NO se
--     toca: la marca es por FECHA y por GRUPO. «Quitar el día entero» del
--     cuadrante es una fila por cada grupo que tenía clase ese día, así que no
--     hay un `class_id` nulo que signifique «todos» y pueda colarse en los
--     grupos de teoría.
--
--     Lo que hace la marca:
--       - el cuadrante quita ese grupo (o el día entero) del panel, de la imagen
--         y del texto de WhatsApp, y lo deja en «Sin clase esta semana» para
--         poder devolverlo;
--       - el alumno ve esa clase como «sin clase»;
--       - un multi no se puede apuntar a ella;
--       - las sesiones que ese grupo tuviera ese día NO se borran: se esconden,
--         y vuelven si se devuelve el día.
--
--     RLS y CERO políticas, como `class_absences` (regla 82) y
--     `class_session_joins` (regla 96): solo la clave de servicio, detrás de
--     `requireAdmin` (escribir) o `requireUser` (leer las de SUS grupos).
--     `organization_id` está en la fila para acotar cada consulta del panel
--     por academia DENTRO de la consulta (reglas 65 y 75).
--
-- 2 · `academy_staff.user_id`: el profesor que hoy es solo un NOMBRE (regla 96)
--     se puede enlazar, si se quiere, con la cuenta con la que entra. Nulable:
--     los nombres sin cuenta siguen funcionando igual. Una cuenta, como mucho
--     un profesor por academia. Borrar la cuenta no borra al profesor.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

create table if not exists public.class_days_off (
  class_id uuid not null references public.class_groups(id) on delete cascade,
  session_date date not null,
  organization_id uuid not null references public.academies(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, session_date)
);

alter table public.class_days_off enable row level security;

create index if not exists class_days_off_por_academia
  on public.class_days_off (organization_id, session_date);

alter table public.academy_staff
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists academy_staff_una_cuenta
  on public.academy_staff (organization_id, user_id)
  where user_id is not null;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select relrowsecurity from pg_class where relname = 'class_days_off';           -- true
--   select count(*) from pg_policies where tablename = 'class_days_off';            -- 0
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'academy_staff' and column_name = 'user_id';                -- YES
