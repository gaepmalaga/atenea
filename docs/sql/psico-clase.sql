-- =============================================================================
-- Psicotécnicos en clase: el mismo examen para un turno (regla 127)
-- =============================================================================
--
-- POR QUÉ
-- Un psicotécnico de práctica sale de una semilla al azar y es distinto para
-- cada alumno. En clase hace falta lo contrario: el MISMO examen para todo un
-- turno, para poder comparar notas y ver dónde falla la clase. Se guarda la
-- semilla (no las preguntas: con ella se regeneran idénticas), los tipos que se
-- eligieron (el filtro), cuántas preguntas y cuántos minutos.
--
-- DOS TABLAS (RLS activada y NINGUNA política: solo la clave de servicio, y las
-- acciones acotan por `organization_id` y por la sesión, reglas 34 y 65)
--   psico_clase             el examen puesto: semilla, tipos, grupos, día y cierre.
--                           `class_ids` vacío = toda la academia.
--   psico_clase_resultados  un alumno en un examen. La fila se crea al empezar
--                           (el reloj es el del servidor, regla 14) o al meter
--                           las respuestas de la hoja en papel; `finished_at`
--                           NULL = empezado y sin entregar. Un resultado por
--                           alumno y examen.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.psico_clase (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  seed            bigint not null,
  version         smallint not null default 2,
  kinds           text[] not null,
  total           int not null check (total between 1 and 100),
  minutes         int not null check (minutes between 1 and 120),
  class_ids       uuid[] not null default '{}',
  sat_on          date not null,
  closes_on       date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists psico_clase_org_idx on public.psico_clase (organization_id, sat_on desc);

create table if not exists public.psico_clase_resultados (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  psico_clase_id  uuid not null references public.psico_clase(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  -- Lo que salió. NULL hasta que se entrega (regla 16).
  correct         int,
  wrong           int,
  blank           int,
  score           numeric(4,2),
  duration_ms     int,
  -- Aciertos, total y fallos por tipo: {"series": {"a": 4, "t": 5, "f": 1}, …}
  by_kind         jsonb,
  -- Lo que marcó en cada pregunta (-1 blanco): permite repasar el examen.
  answers         smallint[],
  -- Cómo lo hizo: en la pantalla, con reloj, o pasando la hoja en papel.
  via             text not null default 'app' check (via in ('app', 'hoja')),
  unique (psico_clase_id, user_id)
);

create index if not exists psico_clase_res_clase_idx on public.psico_clase_resultados (psico_clase_id);
create index if not exists psico_clase_res_user_idx on public.psico_clase_resultados (user_id);

alter table public.psico_clase enable row level security;
alter table public.psico_clase_resultados enable row level security;
