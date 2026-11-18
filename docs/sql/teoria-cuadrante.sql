-- =============================================================================
-- Cuadrante de teoría: quién da cada clase y qué tema (regla 131)
-- =============================================================================
--
-- POR QUÉ
-- En teoría no hay un profesor fijo por tema: cada día va UNO distinto y da
-- uno o varios temas. La responsable abre la semana (o las siguientes), ve las
-- clases de cada grupo vacías y apunta quién va y qué tema da. Se puede
-- programar con antelación y cambiar después. De ahí salen los «temas dados»
-- de cada grupo y las horas reales de cada profesor.
--
-- UNA fila = una clase de un grupo en una fecha. No hay fila = sin asignar.
-- `topics` guarda números de tema (subjects.topic_number), no ids.
-- RLS activada y CERO políticas: solo la clave de servicio (regla 34), y cada
-- acción acota por organization_id. Seguro de repetir.
-- =============================================================================

create table if not exists public.theory_sessions (
  organization_id uuid not null,
  class_id        uuid not null references public.class_groups(id) on delete cascade,
  session_date    date not null,
  teacher_id      uuid references public.academy_staff(id) on delete set null,
  topics          integer[] not null default '{}',
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (class_id, session_date)
);

create index if not exists theory_sessions_org_fecha on public.theory_sessions (organization_id, session_date);
create index if not exists theory_sessions_profesor on public.theory_sessions (teacher_id, session_date);

alter table public.theory_sessions enable row level security;
