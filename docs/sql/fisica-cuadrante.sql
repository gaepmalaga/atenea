-- =============================================================================
-- CUADRANTE SEMANAL DE FÍSICA: GRUPOS, PROFESORES Y MULTI (regla 96, 9 nov 2026)
-- =============================================================================
--
-- Alphapol organiza la física de la Promoción 44 en siete grupos fijos y manda
-- cada semana un «cuadrante» (imagen por WhatsApp): qué toca a cada grupo cada
-- día y qué profesor lo da, según quién esté disponible. Los alumnos
-- MULTIDISCIPLINARES no tienen grupo: cada semana avisan «esta semana voy con
-- OMEGA» y el preparador les organiza.
--
-- 1 · `training_sessions.teacher_id`: el profesor cambia por SESIÓN, no por
--     grupo, así que cuelga de la sesión. Apunta a `academy_staff` (nombres sin
--     cuenta, hoy; se podrán enlazar a una cuenta «preparador» después).
--     `on delete set null`: borrar a un profesor no borra sus sesiones.
--
--     Y `training_sessions.start_time`: la hora propia de esa sesión cuando no
--     es la del grupo (Multi tiene sesión suelta a las 18:30).
--
-- 2 · `class_groups.is_multi`: marca el grupo de los multidisciplinares. Un
--     booleano explícito, no deducirlo del nombre.
--
-- 3 · `class_session_joins`: el multi que se apunta a la sesión de OTRO grupo
--     (grupo, alumno, fecha). Ocupa plaza de esa sesión (aforo − propios que
--     van + multis apuntados). RLS y CERO políticas, como `class_absences`
--     (regla 82): solo la clave de servicio, detrás de `requireUser` /
--     `requireAdmin`.
--
-- 4 · DATOS: los siete grupos de la Promoción 44 + «Multi», los profesores que
--     faltaban y el renombrado de Morato. Aforo 30 (20 propios + 10 plazas para
--     multis; se cambia por grupo en el panel). Sesiones de 1 h.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

alter table public.training_sessions
  add column if not exists teacher_id uuid references public.academy_staff(id) on delete set null;

-- Hora propia de la sesión, si no es la del grupo (la de Multi a las 18:30).
-- `null` = la del grupo. Sirve también para detectar a un profesor en dos sitios.
alter table public.training_sessions
  add column if not exists start_time time;

create index if not exists training_sessions_por_profesor
  on public.training_sessions (teacher_id, session_date);

alter table public.class_groups
  add column if not exists is_multi boolean not null default false;

create table if not exists public.class_session_joins (
  class_id uuid not null references public.class_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_date date not null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id, session_date)
);

alter table public.class_session_joins enable row level security;

create index if not exists class_session_joins_por_fecha
  on public.class_session_joins (session_date);

-- -----------------------------------------------------------------------------
-- DATOS · profesores (Morato = José, el mismo de teoría)
-- -----------------------------------------------------------------------------
update public.academy_staff
   set name = 'José Morato'
 where id = 'ac9ed365-aef0-45e4-aa46-e4fce282a7d9'
   and name = 'Morato';

insert into public.academy_staff (name, role, active, organization_id)
select v.name, 'profesor', true, 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid
  from (values ('Lucas'), ('Olivares'), ('Lucio'), ('Juan')) as v(name)
 where not exists (
   select 1 from public.academy_staff s
    where s.organization_id = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid
      and lower(s.name) = lower(v.name)
 );

-- -----------------------------------------------------------------------------
-- DATOS · grupos de la Promoción 44 (1 = lunes … 7 = domingo)
-- -----------------------------------------------------------------------------
insert into public.class_groups
  (name, kind, schedule, organization_id, weekdays, start_time, end_time, capacity, is_multi)
select v.name, 'fisicas', v.nota, 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid,
       v.dias::smallint[], v.inicio::time, v.fin::time, v.aforo, v.multi
  from (values
    ('Promo 44 · Kappa', 'Chicas · turno de mañana', '{1,3}', '08:00', '09:00', 30, false),
    ('Promo 44 · Alpha', 'Chicos · turno de mañana', '{1,3}', '08:00', '09:00', 30, false),
    ('Promo 44 · Zetta', 'Chicos · turno de tarde',  '{1,3}', '20:00', '21:00', 30, false),
    ('Promo 44 · Omega', 'Chicos · turno de mañana', '{2,4}', '08:00', '09:00', 30, false),
    ('Promo 44 · Sigma', 'Chicas · turno de mañana', '{2,4}', '08:00', '09:00', 30, false),
    ('Promo 44 · Betta', 'Chicas · turno de tarde',  '{2,4}', '20:00', '21:00', 30, false),
    ('Promo 44 · Delta', 'Chicos · turno de tarde',  '{2,4}', '20:00', '21:00', 30, false),
    ('Promo 44 · Multi', 'Multidisciplinar: cada semana se apunta a las sesiones de otros grupos; a veces tiene sesión propia a las 18:30', null, null, null, null, true)
  ) as v(name, nota, dias, inicio, fin, aforo, multi)
 where not exists (
   select 1 from public.class_groups g
    where g.organization_id = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid
      and g.name = v.name
 );

-- El cuadrante ordena los grupos por su alta (Kappa, Alpha, Zetta…, el orden de
-- la imagen que ya conocen los alumnos, no el alfabético). Un INSERT de varias
-- filas les da a todas el mismo `created_at`, así que se escalonan un segundo.
update public.class_groups g
   set created_at = '2026-11-09 10:00:00+00'::timestamptz + (o.n || ' seconds')::interval
  from (values
    ('Promo 44 · Kappa', 0), ('Promo 44 · Alpha', 1), ('Promo 44 · Zetta', 2), ('Promo 44 · Omega', 3),
    ('Promo 44 · Sigma', 4), ('Promo 44 · Betta', 5), ('Promo 44 · Delta', 6), ('Promo 44 · Multi', 7)
  ) as o(name, n)
 where g.organization_id = 'aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2'::uuid
   and g.name = o.name;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select name, weekdays, start_time, capacity, is_multi from class_groups
--    where name like 'Promo 44%' order by name;               -- 8 filas
--   select name from academy_staff order by name;              -- José Morato, Sofía, Lucas, Olivares, Lucio, Juan
--   select relrowsecurity from pg_class where relname = 'class_session_joins';  -- true
