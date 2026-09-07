-- =============================================================================
-- Tiempo hasta el primer toque en una pregunta (señal 3 de TEST-Y-ENTRENAMIENTO)
-- =============================================================================
--
-- ✅ EJECUTADO el 7 sep 2026. Verificado: `first_touch_ms integer`.
--    `schema-snapshot.mjs` detrás.
--
-- QUÉ RESUELVE
--   `response_time_ms` mide el tiempo TOTAL en la pregunta, que mezcla dos cosas
--   distintas: cuánto tardó en RECORDAR la respuesta y cuánto en DELIBERAR entre
--   opciones. Separarlas es la diferencia entre «lo tenía» y «lo he razonado» —
--   y eso decide si un acierto cuenta como dominio o solo como haber salido del
--   paso (regla 56).
--
-- QUÉ AÑADE
--   Una columna a `question_attempts`:
--     first_touch_ms  integer  NULL
--   Milisegundos desde que se mostró la pregunta hasta el PRIMER toque en una
--   opción (aunque luego se cambie). NULL = no se midió: todo el histórico, el
--   simulacro (donde no aporta), y cualquier fila anterior a esto (regla 8: un
--   dato que falta no es un cero).
--
-- POR QUÉ ESPERA AL GUION
--   `question_attempts` se escribe en cada respuesta. PostgREST rechaza la
--   escritura ENTERA si `first_touch_ms` no es una columna, y ese guardado ya se
--   rompió en silencio una vez en este repo (fase 1.2). El código que la escribe
--   NO se toca hasta que esto esté ejecutado.
--
-- COMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
-- =============================================================================

ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS first_touch_ms integer;

-- Un valor negativo no tiene sentido; NULL sí (no medido).
ALTER TABLE public.question_attempts
  DROP CONSTRAINT IF EXISTS question_attempts_first_touch_ms_check;
ALTER TABLE public.question_attempts
  ADD CONSTRAINT question_attempts_first_touch_ms_check
  CHECK (first_touch_ms IS NULL OR first_touch_ms >= 0);

-- RLS: no se toca. La columna va dentro de las mismas filas que ya tienen
-- política de propietario para insert/select/update.

-- Comprobación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'question_attempts' AND column_name = 'first_touch_ms';
