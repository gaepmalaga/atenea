-- =============================================================================
-- LA FÍSICA COMO LA LLEVA UN PREPARADOR (regla 86, 6 nov 2026)
-- =============================================================================
--
-- Alphapol mandaba la preparación física con TrainingMonkeys. Para que el
-- preparador dé el salto sin aprender otra forma de trabajar, el modelo pasa a
-- ser el suyo: el plan no es «una semana con ejercicios por día», son SESIONES
-- sueltas en el calendario, cada una con su tipo, su título y una descripción
-- escrita como la escribe él, y que pueden ser de un GRUPO o de UN alumno.
--
--   training_sessions      una sesión en una fecha, para un grupo O un alumno
--   training_session_logs  lo que cada alumno apunta de cada sesión: hecha o
--                          no, esfuerzo, sensaciones, tiempo y distancia reales,
--                          y la respuesta del preparador
--   session_templates      la biblioteca de sesiones reutilizables
--   training_week_notes    la nota de la semana («Semana de carga»…)
--   physical_marks         el histórico de marcas en las pruebas oficiales
--
-- Todas con RLS ACTIVADA Y SIN POLÍTICAS, como `class_absences` (regla 82):
-- solo la clave de servicio, detrás de `requireUser` (el alumno, filtrando
-- siempre por su id y comprobando que la sesión es suya o de su grupo) o de
-- `requireAdmin` (el preparador, acotado a su academia).
--
-- Al final, los planes de semana que ya existían (`group_training_plans`) se
-- pasan a sesiones: un día del plan = una sesión. No se borra nada de lo viejo.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  class_id uuid references public.class_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  session_date date not null,
  kind text not null check (kind in ('fuerza','carrera','agilidad','circuito','movilidad','descanso','otro')),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 4000),
  duration_min integer check (duration_min is null or duration_min between 1 and 600),
  distance_km numeric(6,2) check (distance_km is null or (distance_km > 0 and distance_km < 1000)),
  video text check (video is null or video like 'https://%'),
  position smallint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O de un grupo, o de un alumno. Nunca de los dos ni de ninguno.
  constraint training_sessions_un_destino check ((class_id is null) <> (user_id is null))
);
create index if not exists training_sessions_grupo on public.training_sessions (class_id, session_date);
create index if not exists training_sessions_alumno on public.training_sessions (user_id, session_date);
create index if not exists training_sessions_academia on public.training_sessions (organization_id, session_date);
alter table public.training_sessions enable row level security;

create table if not exists public.training_session_logs (
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('hecha','no_hecha')),
  rpe smallint check (rpe is null or rpe between 1 and 10),
  comment text check (comment is null or char_length(comment) <= 500),
  duration_min integer check (duration_min is null or duration_min between 1 and 600),
  distance_km numeric(6,2) check (distance_km is null or (distance_km > 0 and distance_km < 1000)),
  coach_reply text check (coach_reply is null or char_length(coach_reply) <= 500),
  coach_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists training_session_logs_alumno on public.training_session_logs (user_id);
alter table public.training_session_logs enable row level security;

create table if not exists public.session_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  kind text not null check (kind in ('fuerza','carrera','agilidad','circuito','movilidad','descanso','otro')),
  title text not null check (char_length(title) between 1 and 120),
  description text check (description is null or char_length(description) <= 4000),
  duration_min integer check (duration_min is null or duration_min between 1 and 600),
  distance_km numeric(6,2) check (distance_km is null or (distance_km > 0 and distance_km < 1000)),
  video text check (video is null or video like 'https://%'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists session_templates_academia on public.session_templates (organization_id);
alter table public.session_templates enable row level security;

create table if not exists public.training_week_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  class_id uuid references public.class_groups(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  week_start date not null,
  note text not null check (char_length(note) between 1 and 300),
  updated_at timestamptz not null default now(),
  constraint training_week_notes_un_destino check ((class_id is null) <> (user_id is null))
);
-- Una nota por destino y semana. Dos índices parciales porque en un UNIQUE de
-- Postgres dos NULL son distintos (regla 31).
create unique index if not exists training_week_notes_grupo on public.training_week_notes (class_id, week_start) where class_id is not null;
create unique index if not exists training_week_notes_alumno on public.training_week_notes (user_id, week_start) where user_id is not null;
alter table public.training_week_notes enable row level security;

create table if not exists public.physical_marks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  test text not null check (test in ('agilidad','dominadas','suspension','carrera_1000')),
  value numeric(7,2) not null check (value >= 0),
  measured_on date not null,
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists physical_marks_alumno on public.physical_marks (user_id, test, measured_on);
create index if not exists physical_marks_academia on public.physical_marks (organization_id);
alter table public.physical_marks enable row level security;

-- -----------------------------------------------------------------------------
-- LOS PLANES QUE YA HABÍA → SESIONES
-- -----------------------------------------------------------------------------
-- Un día del plan con ejercicios = una sesión de ese grupo en esa fecha. El
-- título es el del día si dice algo más que el nombre del día; si no, los
-- nombres de los ejercicios. La descripción, un ejercicio por línea. La nota de
-- la semana sale de `week_focus`. Solo se migra lo que aún no se migró.

with dias as (
  select
    p.class_id,
    g.organization_id,
    p.week_start,
    d.value as dia,
    translate(lower(left(trim(d.value->>'day'), 3)), 'áéíóú', 'aeiou') as abrev
  from public.group_training_plans p
  join public.class_groups g on g.id = p.class_id
  cross join lateral jsonb_array_elements(coalesce(p.plan_data->'days', '[]'::jsonb)) d
  where jsonb_array_length(coalesce(d.value->'exercises', '[]'::jsonb)) > 0
),
con_fecha as (
  select *,
    week_start + (case abrev when 'lun' then 0 when 'mar' then 1 when 'mie' then 2 when 'jue' then 3
                             when 'vie' then 4 when 'sab' then 5 when 'dom' then 6 end) as fecha
  from dias
),
filas as (
  select
    c.organization_id, c.class_id, c.fecha,
    case coalesce(c.dia->'exercises'->0->>'metric_type', '')
      when 'fuerza' then 'fuerza' when 'carrera' then 'carrera' when 'circuito' then 'circuito'
      else 'otro' end as kind,
    left(case
      when translate(lower(trim(coalesce(c.dia->>'title', ''))), 'áéíóú', 'aeiou')
           in ('', 'lunes','martes','miercoles','jueves','viernes','sabado','domingo')
      then (select string_agg(e->>'name', ', ') from jsonb_array_elements(c.dia->'exercises') e)
      else trim(c.dia->>'title') end, 120) as title,
    left((select string_agg(
        (e->>'name')
        || coalesce(' — ' || nullif(e->>'sets', '') || ' series', '')
        || coalesce(' · ' || nullif(e->>'reps', ''), '')
        || coalesce(' · descanso ' || nullif(e->>'rest', ''), '')
        || coalesce(' · ' || nullif(e->>'target', ''), ''),
        E'\n') from jsonb_array_elements(c.dia->'exercises') e), 4000) as description
  from con_fecha c
  where c.fecha is not null
)
insert into public.training_sessions (organization_id, class_id, session_date, kind, title, description)
select f.organization_id, f.class_id, f.fecha, f.kind, coalesce(nullif(f.title, ''), 'Entrenamiento'), f.description
from filas f
where not exists (
  select 1 from public.training_sessions s where s.class_id = f.class_id and s.session_date = f.fecha
);

-- Los planes viejos casi nunca guardaban el tipo de ejercicio: se deduce del
-- título (solo en las migradas, que no tienen `created_by`).
update public.training_sessions set kind = case
    when title ~* 'agilidad' then 'agilidad'
    when title ~* 'circuito' then 'circuito'
    when title ~* 'rodaje|carrera|series|trote|1\.?000|fartlek|ritmo' then 'carrera'
    when title ~* 'fuerza|dominada|flexi|tren superior|core|gimnasio' then 'fuerza'
    when title ~* 'movilidad|estiramiento|recuperaci' then 'movilidad'
    else kind end
where kind = 'otro' and created_by is null;

insert into public.training_week_notes (organization_id, class_id, week_start, note)
select g.organization_id, p.class_id, p.week_start, left(trim(p.plan_data->>'week_focus'), 300)
from public.group_training_plans p
join public.class_groups g on g.id = p.class_id
where coalesce(trim(p.plan_data->>'week_focus'), '') <> ''
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select relname, relrowsecurity, (select count(*) from pg_policies p where p.tablename = c.relname)
--   from pg_class c where relname in ('training_sessions','training_session_logs','session_templates',
--                                     'training_week_notes','physical_marks');
--   -- las cinco: true, 0
--   select count(*) from training_sessions;   -- los días con ejercicios de los planes viejos
