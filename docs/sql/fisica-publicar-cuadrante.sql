-- =============================================================================
-- PUBLICAR EL CUADRANTE DE UNA SEMANA (regla 98, 9 nov 2026)
-- =============================================================================
--
-- Lo pidió el dueño: el preparador monta el cuadrante de la semana que viene
-- con calma, y los alumnos no lo ven a medio escribir. Una semana SIN publicar
-- le enseña al alumno solo el horario de su grupo («clase de Kappa a las
-- 08:00, aún sin publicar qué toca»); publicada, lo que toca, el profesor y los
-- días sin clase.
--
-- Una fila por academia y semana (`week_start` = su lunes). Publicar es
-- crearla; retirar la publicación, borrarla. Lo que se cambie después de
-- publicar se ve al momento: no hay versiones que comparar.
--
-- RLS y CERO políticas, como el resto de la física (reglas 82, 86, 96 y 97):
-- solo la clave de servicio, detrás de `requireAdmin` (escribir) y de
-- `requireUser` (leer las semanas de su academia).
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================================

create table if not exists public.class_week_publications (
  organization_id uuid not null references public.academies(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  primary key (organization_id, week_start)
);

alter table public.class_week_publications enable row level security;

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select relrowsecurity from pg_class where relname = 'class_week_publications';  -- true
--   select count(*) from pg_policies where tablename = 'class_week_publications';   -- 0
