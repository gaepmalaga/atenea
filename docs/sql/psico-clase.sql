-- =============================================================================
-- Psicotécnicos en clase: guardar el examen, ponerlo a un turno y llevar la nota (regla 127)
-- =============================================================================
--
-- POR QUÉ
-- Un psicotécnico de práctica sale de una semilla al azar y es distinto para
-- cada alumno. En clase hace falta lo contrario: el MISMO examen para todo un
-- turno, para comparar notas y ver dónde falla la clase. Sigue el mismo proceso
-- que los exámenes de teoría (regla 118): PREPARAR y GUARDAR, PONER A UN TURNO,
-- y seguirlo EN CLASE. No se guardan preguntas, se guarda la SEMILLA: con ella,
-- los tipos y el total se regenera idéntico.
--
-- TRES TABLAS (RLS activada y NINGUNA política: solo la clave de servicio, y las
-- acciones acotan por `organization_id` y por la sesión, reglas 34 y 65)
--   psico_examenes          el examen guardado: semilla, tipos (el filtro), total
--                           y minutos. Se puede reimprimir y poner a varios turnos.
--   psico_clase             una «aplicación»: ese examen, a esos grupos, ese día.
--                           `class_ids` vacío = toda la academia. `closes_on` es
--                           el último día para entregarlo.
--   psico_clase_resultados  un alumno en una aplicación. La fila se crea al
--                           empezar (el reloj es el del servidor, regla 14) o al
--                           pasar la hoja en papel; `finished_at` NULL = empezado
--                           y sin entregar. Un resultado por alumno y aplicación.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.psico_examenes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 80),
  seed            bigint not null,
  version         smallint not null default 2,
  kinds           text[] not null,
  total           int not null check (total between 1 and 100),
  minutes         int not null check (minutes between 1 and 120),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists psico_examenes_org_idx on public.psico_examenes (organization_id, created_at desc);

create table if not exists public.psico_clase (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  examen_id       uuid not null references public.psico_examenes(id) on delete cascade,
  label           text not null check (char_length(label) between 1 and 80),
  class_ids       uuid[] not null default '{}',
  sat_on          date not null,
  closes_on       date,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists psico_clase_org_idx on public.psico_clase (organization_id, sat_on desc);
create index if not exists psico_clase_examen_idx on public.psico_clase (examen_id);

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

alter table public.psico_examenes enable row level security;
alter table public.psico_clase enable row level security;
alter table public.psico_clase_resultados enable row level security;
