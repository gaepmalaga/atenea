-- =============================================================================
-- P8 — Un solo panel de alumno: tipos de grupo editables, varios profesores,
--      pagos mensuales
-- =============================================================================
--
-- ✅ EJECUTADO el 6 sep 2026 contra el Supabase real.
--
-- QUÉ RESUELVE (feedback del dueño al probar P5/P6/P7):
--   · «Usuarios, Academia y Acceso & Pagos → una sola pantalla.»
--   · «Los grupos al revés: doy de alta un alumno y le marco sus grupos; si se
--      da de baja de físicas, entro en ESE alumno y le quito el clic.»  → la
--      asignación pasa a ser desde el alumno; el esquema (class_members) ya
--      valía, es la UI la que cambia.
--   · «El desplegable de tipos (físicas, teoría…) personalizable.»  → tabla
--      `group_kinds` que el admin edita.
--   · «Varios profesores por grupo.»  → `class_group_staff` (join), y fuera
--      `class_groups.staff_id`.
--   · «Pagos por mes: elijo septiembre, me salen los activos, voy marcando
--      quién paga, recuento y estadísticas.»  → `monthly_payments`, una fila
--      por (alumno, mes). Fuera `academy_payments` (registro libre, 0 filas,
--      modelo equivocado).
--
-- SE MANTIENEN de P6: `memberships` (acceso activo/suspendido) y
-- `membership_settings` (el interruptor global).
--
-- RLS: todo administración, cero políticas, salvo `group_training_plans`
-- (SELECT abierto, ya estaba) — el plan tiene que llegar al alumno.
--
-- COMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente.
-- Después: `node scripts/schema-snapshot.mjs`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · Tipos de grupo, editables
-- -----------------------------------------------------------------------------
-- `id` es el slug ('fisicas'), `label` lo que se ve ('Físicas'). `lleva_plan`
-- marca los tipos que llevan plan de entrenamiento (antes era `kind='fisicas'`
-- a pelo). El admin puede tener varios tipos con `lleva_plan = true` si quiere.
CREATE TABLE IF NOT EXISTS public.group_kinds (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  lleva_plan boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.group_kinds (id, label, lleva_plan, sort_order) VALUES
  ('teoria',  'Teoría',  false, 1),
  ('ingles',  'Inglés',  false, 2),
  ('fisicas', 'Físicas', true,  3),
  ('otro',    'Otro',    false, 9)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.group_kinds ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- PASO 2 · El `kind` de un grupo deja de ser un CHECK cerrado
-- -----------------------------------------------------------------------------
-- Se valida en el código contra `group_kinds`, no aquí: añadir un tipo no puede
-- pedir tocar una restricción de Postgres.
ALTER TABLE public.class_groups DROP CONSTRAINT IF EXISTS class_groups_kind_check;


-- -----------------------------------------------------------------------------
-- PASO 3 · Varios profesores por grupo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_group_staff (
  class_id uuid NOT NULL REFERENCES public.class_groups(id)  ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.academy_staff(id) ON DELETE CASCADE,
  PRIMARY KEY (class_id, staff_id)
);
CREATE INDEX IF NOT EXISTS class_group_staff_staff_idx ON public.class_group_staff (staff_id);

-- Migrar el `staff_id` que había (un solo profesor) al join, y quitar la columna.
INSERT INTO public.class_group_staff (class_id, staff_id)
  SELECT id, staff_id FROM public.class_groups WHERE staff_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.class_groups DROP COLUMN IF EXISTS staff_id;

ALTER TABLE public.class_group_staff ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- PASO 4 · Pagos mensuales
-- -----------------------------------------------------------------------------
-- Una fila por (alumno, mes). `period` es 'YYYY-MM'. Guardar es un upsert sobre
-- la clave. `paid` es el clic; `amount_eur` es opcional pero es lo que da la
-- estadística de dinero. `paid_on` se pone al marcar.
CREATE TABLE IF NOT EXISTS public.monthly_payments (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period      text NOT NULL,
  paid        boolean NOT NULL DEFAULT false,
  amount_eur  numeric(10, 2),
  paid_on     date,
  note        text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);
CREATE INDEX IF NOT EXISTS monthly_payments_period_idx ON public.monthly_payments (period);

ALTER TABLE public.monthly_payments ENABLE ROW LEVEL SECURITY;

-- Fuera el registro libre de P6: 0 filas, y el modelo (log suelto) no es el que
-- pidió el dueño (rejilla mensual).
DROP TABLE IF EXISTS public.academy_payments;


-- -----------------------------------------------------------------------------
-- PASO 5 · Comprobación
-- -----------------------------------------------------------------------------
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('group_kinds','class_group_staff','monthly_payments');
--   SELECT id, label, lleva_plan FROM public.group_kinds ORDER BY sort_order;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'class_groups' AND column_name = 'staff_id';  -- vacío
