-- =============================================================================
-- Exámenes en papel guardados, aplicados a turnos, y su nota (regla 118)
-- =============================================================================
--
-- POR QUÉ
-- «Exámenes en papel» (regla 115) generaba el examen, lo descargaba y se
-- perdía: no se podía reimprimir, ni evitar que el siguiente simulacro repita
-- preguntas, ni saber quién lo hizo ni cómo le fue. La academia lo pone en
-- clase a un turno (martes y jueves por la mañana) y quiere llevar un registro
-- por alumno: sus exámenes presenciales, su nota y su evolución.
--
-- TRES TABLAS
--   exam_papers    el examen guardado. Lleva una COPIA de las preguntas
--                  (`questions`), no sus ids: si luego alguien edita o descarta
--                  una pregunta del banco, el examen que se repartió en papel
--                  sigue siendo el mismo, y se corrige contra lo que se imprimió.
--   exam_sittings  una «aplicación»: ese examen, a esos grupos, ese día. El
--                  mismo examen se aplica a varios turnos. `class_ids` vacío =
--                  toda la academia. `closes_on` es el último día en que el
--                  alumno puede meter sus respuestas.
--   exam_results   un alumno en una aplicación. Sus respuestas las mete EL
--                  ALUMNO, en clase o en casa (el profesor no va a teclear 40
--                  hojas); el servidor las corrige y guarda la nota
--                  (`score`, regla 110). `teacher_score` es la nota oficial que
--                  el profesor puede poner encima, y `absent` el «no se
--                  presentó» (que no es un 0).
--
-- Las tres: RLS activada y NINGUNA política. Solo las toca la clave de
-- servicio, y las acciones acotan por `organization_id` y por la sesión
-- (reglas 34, 65). El alumno no lee `exam_papers`: la copia de preguntas lleva
-- las respuestas correctas.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.exam_papers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 60),
  model           text not null default 'A' check (char_length(model) = 1),
  minutes         int  not null check (minutes between 1 and 199),
  -- Con qué filtros se sacó (temas, bloques, dificultad…): para repetirlo.
  filters         jsonb not null default '{}'::jsonb,
  -- [{ "id": uuid, "q": enunciado, "o": [opciones], "c": índice correcto,
  --    "t": tema, "e": explicación|null, "r": referencia legal|null,
  --    "d": dificultad 1-3 }]
  questions       jsonb not null check (jsonb_typeof(questions) = 'array'),
  -- Los ids de esas preguntas, aparte: para no repetirlas en el siguiente examen
  -- sin tener que leer 40 KB de jsonb por cada examen guardado.
  question_ids    uuid[] not null default '{}',
  total           int  not null check (total between 1 and 100),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.exam_sittings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  paper_id        uuid not null references public.exam_papers(id) on delete cascade,
  label           text not null check (char_length(label) between 1 and 80),
  sat_on          date not null,
  class_ids       uuid[] not null default '{}',
  closes_on       date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists public.exam_results (
  id              uuid primary key default gen_random_uuid(),
  sitting_id      uuid not null references public.exam_sittings(id) on delete cascade,
  organization_id uuid not null references public.academies(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  -- Lo que marcó en cada pregunta: 0, 1, 2; -1 es blanco. NULL = no ha entregado.
  answers         smallint[],
  correct         int,
  wrong           int,
  blank           int,
  -- La nota calculada con la fórmula de la convocatoria, sobre 10.
  score           numeric(4,2) check (score is null or score between 0 and 10),
  -- La que pone el profesor desde el papel. Manda sobre `score`.
  teacher_score   numeric(4,2) check (teacher_score is null or teacher_score between 0 and 10),
  absent          boolean not null default false,
  submitted_at    timestamptz,
  updated_at      timestamptz not null default now(),
  unique (sitting_id, user_id)
);

create index if not exists exam_papers_org_idx    on public.exam_papers (organization_id, created_at desc);
create index if not exists exam_sittings_org_idx  on public.exam_sittings (organization_id, sat_on desc);
create index if not exists exam_sittings_paper_idx on public.exam_sittings (paper_id);
create index if not exists exam_results_user_idx  on public.exam_results (user_id, submitted_at desc);

alter table public.exam_papers   enable row level security;
alter table public.exam_sittings enable row level security;
alter table public.exam_results  enable row level security;
