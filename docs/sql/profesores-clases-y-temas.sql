-- =============================================================================
-- LO QUE DA CADA PROFESOR: SUS CLASES DE FÍSICA Y SUS TEMAS (regla 100, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: «prácticamente el 100 % de las veces el boxeo lo da el
-- mismo, el jiujitsu el mismo…», y en teoría, «asignar a un profesor los temas
-- del 1 al 10, 14, 17, 18…». Siempre con la puerta abierta a un imprevisto.
--
-- 1 · `staff_activities`: el profesor HABITUAL de cada clase de física, en
--     orden («FLK: José y, si no puede, Olivares»). En el cuadrante, al
--     escribir «Boxeo» el profesor se rellena solo con Juan; se cambia a mano
--     como siempre. `activity` es el principio del título: «FLK» vale para
--     «FLK 5.0» y «FLK 5.1» (la comparación, sin mayúsculas, acentos ni
--     signos, la hace el código).
--
-- 2 · `staff_subjects`: los temas que da cada profesor de teoría.
--     `subject_id` es el del temario común (`subjects`, numerado del 1 al 50).
--
-- 3 · `panel_academia_por_tema`: cómo van los alumnos de la academia en cada
--     tema, contado en la base de datos (regla 91: no se traen las respuestas,
--     llegan los totales). Un blanco no es un fallo (regla 24): las
--     contestadas no lo cuentan.
--
-- Las dos tablas, con RLS y CERO políticas, como el resto del panel: solo la
-- clave de servicio, detrás de `requireAdmin`. La función, solo para la clave
-- de servicio (como `panel_academia_resumen`).
--
-- 4 · DATOS: la lista de partida que aprobó el dueño, sacada del cuadrante de
--     la semana del 9 de noviembre.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

create table if not exists public.staff_activities (
  organization_id uuid not null references public.academies(id) on delete cascade,
  activity text not null check (char_length(btrim(activity)) between 1 and 60),
  staff_id uuid not null references public.academy_staff(id) on delete cascade,
  priority smallint not null default 1 check (priority between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (organization_id, activity, staff_id)
);
alter table public.staff_activities enable row level security;

create table if not exists public.staff_subjects (
  organization_id uuid not null references public.academies(id) on delete cascade,
  staff_id uuid not null references public.academy_staff(id) on delete cascade,
  subject_id integer not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, subject_id)
);
alter table public.staff_subjects enable row level security;
create index if not exists staff_subjects_por_academia on public.staff_subjects (organization_id);

create or replace function public.panel_academia_por_tema(p_user_ids uuid[])
returns table (subject_id integer, alumnos integer, contestadas integer, aciertos integer, blancos integer)
language sql
stable
set search_path to 'public'
as $$
  select qb.subject_id,
         count(distinct qa.user_id)::int,
         count(*) filter (where qa.selected_index is distinct from -1)::int,
         count(*) filter (where qa.selected_index is distinct from -1 and qa.is_correct)::int,
         count(*) filter (where qa.selected_index = -1)::int
    from public.question_attempts qa
    join public.question_bank qb on qb.id = qa.question_id
   where qa.user_id = any(p_user_ids)
     and qb.subject_id is not null
   group by qb.subject_id;
$$;

revoke execute on function public.panel_academia_por_tema(uuid[]) from public, anon, authenticated;
grant execute on function public.panel_academia_por_tema(uuid[]) to service_role;

-- -----------------------------------------------------------------------------
-- DATOS · los profesores habituales de partida (aprobados por el dueño)
--   Boxeo → Juan · Jiujitsu → Lucas · F.M + RDL → Lucio, luego José ·
--   FLK → José, luego Olivares
-- -----------------------------------------------------------------------------
insert into public.staff_activities (organization_id, activity, staff_id, priority) values
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'Boxeo',     '674b5383-8b38-4ecb-87f5-93237b3fb3c4', 1),
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'Jiujitsu',  'fc978e7b-2c74-4367-b448-fd0380e47f57', 1),
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'F.M + RDL', '637de4f2-c024-4c80-a144-0111447d05a4', 1),
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'F.M + RDL', 'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', 2),
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'FLK',       'ac9ed365-aef0-45e4-aa46-e4fce282a7d9', 1),
  ('aeee26b3-b6a8-49da-a5c3-4d3c8cde6df2', 'FLK',       '9fbbdf0a-9beb-4cb5-ba5b-f3aa43cd3fae', 2)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select activity, s.name, priority from staff_activities a join academy_staff s on s.id = a.staff_id order by 1, 3;
--   select count(*) from pg_policies where tablename in ('staff_activities', 'staff_subjects');   -- 0
