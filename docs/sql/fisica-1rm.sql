-- =============================================================================
-- EL 1RM (regla 87, 6 nov 2026)
-- =============================================================================
--
-- El 1RM («una repetición máxima») es el peso máximo que alguien levanta UNA
-- vez en un ejercicio. El preparador de Alphapol lo pidió para pautar las
-- cargas en porcentaje: «sentadilla 4 × 6 al 75 %», y que a cada alumno le
-- salgan sus kilos.
--
--   rm_marks                   cada marca: ejercicio, peso y repeticiones. Con
--                              1 repetición es el 1RM medido; con más, la app lo
--                              ESTIMA (fórmula de Epley) y así no hace falta
--                              probar el máximo, que es donde está el riesgo.
--   training_sessions.loads    las cargas de una sesión en % del 1RM: una lista
--   session_templates.loads    de {ejercicio, porcentaje, series, reps}.
--
-- RLS ACTIVADA Y SIN POLÍTICAS, como el resto de la física (regla 86).
--
-- Idempotente.
-- =============================================================================

create table if not exists public.rm_marks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.academies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null check (char_length(exercise) between 1 and 60),
  weight_kg numeric(6,2) not null check (weight_kg > 0 and weight_kg < 1000),
  reps smallint not null default 1 check (reps between 1 and 12),
  measured_on date not null,
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rm_marks_alumno on public.rm_marks (user_id, measured_on);
create index if not exists rm_marks_academia on public.rm_marks (organization_id);
alter table public.rm_marks enable row level security;

alter table public.training_sessions add column if not exists loads jsonb;
alter table public.session_templates add column if not exists loads jsonb;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select relrowsecurity, (select count(*) from pg_policies where tablename = 'rm_marks')
--   from pg_class where relname = 'rm_marks';            -- true, 0
--   select column_name from information_schema.columns
--   where table_name in ('training_sessions', 'session_templates') and column_name = 'loads';  -- 2 filas
