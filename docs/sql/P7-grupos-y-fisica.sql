-- =============================================================================
-- P7 — Grupos (clases) y preparación física
-- =============================================================================
--
-- ✅ EJECUTADO el 6 sep 2026 contra el Supabase real (Claude, con el método de
--    `[[ddl-supabase-solo-el-dueno]]`). Comprobado con schema-snapshot.
--
-- QUÉ RESUELVE
-- La academia organiza a sus alumnos en grupos —«Promoción 41 tarde»,
-- «Promoción 42 mañanas», «Inglés», «Físicas»— y **un alumno puede estar en
-- varios** (Inglés Y Teoría, pero no Físicas). Y quiere preparar el
-- entrenamiento por grupo, no alumno a alumno.
--
-- P5f montó `profiles.class_group` (UN texto libre por alumno). Eso no es una
-- relación muchos-a-muchos. Se retira —nunca llegó a producción— y se sustituye.
--
-- TRES TABLAS
--   · class_groups        — el grupo: nombre, TIPO, horario, profesor.
--   · class_members       — el par (grupo, alumno). Muchos a muchos.
--   · group_training_plans — el plan de entrenamiento de un grupo de físicas.
--
-- EL TIPO NO ES DECORATIVO. `kind` decide qué se le puede colgar a un grupo: a
-- uno de 'fisicas', un plan de entrenamiento; a uno de 'teoria', no. Es un
-- CHECK y no un enum de Postgres porque añadir un tipo no puede pedir una
-- migración (misma decisión que `academy_staff.role`, regla 50).
--
-- RLS
--   · class_groups, class_members  — cero políticas: administración pura, clave
--     de servicio detrás de `requireAdmin` (regla 34/35). El alumno no gestiona
--     sus grupos; `getActiveTrainingPlan` resuelve su plan de grupo en el
--     servidor filtrando por su `auth.user.id`.
--   · group_training_plans — SELECT para cualquier autenticado, porque el plan
--     TIENE que llegar al alumno. Escribir: solo servicio. Mismo patrón que
--     `module_settings` (P4).
--
-- EL PLAN INDIVIDUAL MANDA SOBRE EL DE GRUPO. No se refleja en el esquema: lo
-- decide `getActiveTrainingPlan` — mira primero `training_plans` (status
-- 'active') del alumno, y solo si no hay, el de su grupo de físicas.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente.
-- El DROP de `profiles.class_group` no pierde datos: la columna es de P5f y
-- nunca llegó a producción (el panel que la escribe está en la rama, sin
-- desplegar). Después: `node scripts/schema-snapshot.mjs`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 0 · Fuera lo de P5f
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.profiles_class_group_idx;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS class_group;


-- -----------------------------------------------------------------------------
-- PASO 1 · Los grupos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'otro'
             CHECK (kind IN ('teoria', 'ingles', 'fisicas', 'otro')),
  schedule   text,
  staff_id   uuid REFERENCES public.academy_staff(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.class_groups IS
  'Grupos de la academia. kind decide qué se le puede colgar (a fisicas, un plan).';


-- -----------------------------------------------------------------------------
-- PASO 2 · Quién está en cada grupo (muchos a muchos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_members (
  class_id   uuid NOT NULL REFERENCES public.class_groups(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS class_members_user_idx ON public.class_members (user_id);


-- -----------------------------------------------------------------------------
-- PASO 3 · El plan de entrenamiento de un grupo
-- -----------------------------------------------------------------------------
-- `plan_data` con la misma forma que `training_plans.plan_data` (lo normaliza
-- `normalizePlan`, regla 17). Una fila por grupo: guardar es un upsert.
CREATE TABLE IF NOT EXISTS public.group_training_plans (
  class_id   uuid PRIMARY KEY REFERENCES public.class_groups(id) ON DELETE CASCADE,
  plan_data  jsonb NOT NULL,
  week_start date,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- PASO 4 · RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.class_groups         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_training_plans ENABLE ROW LEVEL SECURITY;

-- El plan de grupo lo LEE el alumno (su módulo de entrenamiento); lo escribe
-- solo el servicio.
DROP POLICY IF EXISTS group_plan_lectura ON public.group_training_plans;
CREATE POLICY group_plan_lectura ON public.group_training_plans
  FOR SELECT TO authenticated
  USING (true);


-- -----------------------------------------------------------------------------
-- PASO 5 · Comprobación
-- -----------------------------------------------------------------------------
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('class_groups','class_members','group_training_plans');
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='class_group';
--   -- (no debe devolver nada)
