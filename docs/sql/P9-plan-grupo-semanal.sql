-- =============================================================================
-- P9 — El plan de físicas de un grupo, semana a semana y con histórico
-- =============================================================================
--
-- ✅ EJECUTADO el 6 sep 2026 contra el Supabase real (PK confirmada como
--    PRIMARY KEY (class_id, week_start); verificado end-to-end en el preview:
--    dos semanas distintas guardadas para el mismo grupo).
--
-- Feedback del dueño tras P8:
--   «Preparación física solo me deja preparar la semana actual. ¿Cómo preparo la
--    que viene? ¿Se queda histórico guardado?»  → sí a las dos: semana a semana,
--    y las pasadas quedan en solo lectura.
--
-- QUÉ CAMBIA
--   `group_training_plans` tiene hoy la clave primaria en `class_id` — UNA fila
--   por grupo, que se reescribe en cada guardado. Con eso no hay ni «semana que
--   viene» ni histórico. Este guion mueve la clave a `(class_id, week_start)`,
--   así que caben varias semanas por grupo:
--     · una fila con `week_start` = lunes de esta semana  → el plan de esta semana
--     · una fila con `week_start` = lunes de la que viene  → preparada por adelantado
--     · las de semanas pasadas se quedan, en solo lectura.
--
--   El alumno (`getActiveTrainingPlan`) verá la fila cuyo `week_start` sea el más
--   reciente que NO pase de hoy — es decir, el plan de la semana en curso.
--
-- NO añade columnas: `week_start` ya existe en la tabla. Solo cambia la clave y
-- la deja obligatoria. Por eso `schema-drift` no se entera — pero el CÓDIGO que
-- usa `onConflict: 'class_id'` sí deja de valer, así que NO se toca hasta que
-- esto esté ejecutado (PostgREST necesita la restricción única nueva para el
-- upsert por `(class_id, week_start)`).
--
-- RLS: no se toca. Sigue con el `SELECT` abierto a cualquier autenticado (el
-- plan tiene que llegar al alumno) y sin políticas de escritura (solo la clave
-- de servicio escribe). Ver regla 53.
--
-- COMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · `week_start` pasa a ser un DATE obligatorio (lunes de la semana)
-- -----------------------------------------------------------------------------
-- Las filas que ya hay pueden traer `week_start` a NULL o con hora: se
-- normalizan al lunes de SU semana (o al de esta semana si está vacío).
UPDATE public.group_training_plans
SET week_start = date_trunc('week', COALESCE(week_start::timestamp, now()))::date
WHERE week_start IS NULL
   OR week_start::text !~ '^\d{4}-\d{2}-\d{2}$'
   OR EXTRACT(ISODOW FROM week_start) <> 1;

ALTER TABLE public.group_training_plans
  ALTER COLUMN week_start TYPE date USING week_start::date,
  ALTER COLUMN week_start SET NOT NULL;


-- -----------------------------------------------------------------------------
-- PASO 2 · La clave primaria pasa de (class_id) a (class_id, week_start)
-- -----------------------------------------------------------------------------
-- Si en el paso 1 dos filas del mismo grupo cayeron en el mismo lunes (no
-- debería: hoy solo hay una por grupo), esto fallaría — en ese caso, borra la
-- más antigua a mano y reintenta.
ALTER TABLE public.group_training_plans
  DROP CONSTRAINT IF EXISTS group_training_plans_pkey;

ALTER TABLE public.group_training_plans
  ADD CONSTRAINT group_training_plans_pkey PRIMARY KEY (class_id, week_start);

CREATE INDEX IF NOT EXISTS group_training_plans_class_idx
  ON public.group_training_plans (class_id, week_start DESC);


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobación
-- -----------------------------------------------------------------------------
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.group_training_plans'::regclass;
--   -- debe salir PRIMARY KEY (class_id, week_start)
--
--   SELECT class_id, week_start FROM public.group_training_plans ORDER BY 1, 2;
