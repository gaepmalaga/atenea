-- =============================================================================
-- Psicotécnicos: una fila por sesión (regla 117)
-- =============================================================================
--
-- POR QUÉ
-- Las preguntas de psicotécnicos no están en ningún banco: las genera el
-- código a partir de una semilla (series, cálculo, figuras…), así que no hay
-- nada que guardar por pregunta. Lo que se guarda es la SESIÓN: con qué
-- semilla se generó, qué tipos, y cómo salió.
--
-- LA SEMILLA NO SALE DEL SERVIDOR. Al empezar se crea la fila con la semilla y
-- al navegador van las preguntas SIN la respuesta correcta. Al entregar, el
-- servidor vuelve a generar las mismas preguntas con la semilla y corrige
-- (regla 110: el acierto no lo decide el navegador). Por eso la tabla tiene
-- RLS y NINGUNA política: solo la toca la clave de servicio, y las acciones
-- acotan por `user_id` de la sesión.
--
-- `finished_at` NULL es una sesión empezada y no entregada. La duración sale
-- de `started_at` y del reloj del servidor, no de lo que diga el cliente
-- (regla 14).
-- =============================================================================

create table if not exists public.psico_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.academies(id) on delete cascade,
  seed            bigint not null,
  -- Los tipos pedidos y cuántas preguntas: con la semilla, bastan para volver
  -- a generar exactamente la misma sesión.
  kinds           text[] not null,
  total           int not null check (total between 1 and 100),
  minutes         int not null check (minutes between 1 and 120),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  -- Lo que salió. NULL hasta que se entrega (regla 16).
  correct         int,
  wrong           int,
  blank           int,
  duration_ms     int,
  -- Aciertos y total por tipo: {"series": {"a": 4, "t": 5}, …}
  by_kind         jsonb,
  -- Lo que marcó en cada pregunta (-1 blanco): permite repasar la sesión.
  answers         smallint[]
);

create index if not exists psico_sessions_user_idx on public.psico_sessions (user_id, started_at desc);
create index if not exists psico_sessions_org_idx on public.psico_sessions (organization_id, finished_at desc);

alter table public.psico_sessions enable row level security;
