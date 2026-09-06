-- =============================================================================
-- P10b — Marca de confianza en las respuestas (entrenar el blanco)
-- =============================================================================
--
-- ⬜ PENDIENTE DE EJECUTAR. Es la técnica 8 de `docs/METODO-APRENDIZAJE.md`, y
--    la deja preparada para construirla encima.
--
-- QUÉ RESUELVE
--   En la oposición CNP los fallos restan (cada 2, un acierto menos), así que
--   *saber cuándo no lo sabes* —y dejar en blanco— es una habilidad medible.
--   Hoy no se mide. Con la marca de confianza el alumno dice, al responder, si
--   va «seguro / a medias / a ciegas», y en resultados ve su CALIBRACIÓN:
--   «contestaste a ciegas 12, acertaste 4 — a −0,5 eso te costó 4 puntos netos;
--   en blanco habrías puntuado más».
--
-- QUÉ AÑADE
--   Una sola columna a `question_attempts`:
--     confidence  smallint  NULL   -- 0 = a ciegas · 1 = a medias · 2 = seguro
--   NULL = no se preguntó (todo el histórico, y el simulacro, donde no aplica).
--
-- POR QUÉ ESPERA AL GUION
--   `question_attempts` se escribe en CADA respuesta (`saveTestResult`,
--   `saveExamResults`). PostgREST rechaza la escritura ENTERA si `confidence`
--   no es una columna, y ese guardado ya se rompió en silencio una vez en este
--   repo (fase 1.2). Así que el código que la escribe NO se toca hasta que esto
--   esté ejecutado. La aritmética de calibración puede ir preparada en
--   `app/lib/` (pura, con tests) desde ya.
--
-- COMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
-- =============================================================================

ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS confidence smallint;

-- 0..2, o NULL. Nada más.
ALTER TABLE public.question_attempts
  DROP CONSTRAINT IF EXISTS question_attempts_confidence_check;
ALTER TABLE public.question_attempts
  ADD CONSTRAINT question_attempts_confidence_check
  CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 2);

-- RLS: no se toca. `question_attempts` ya tiene política de propietario para
-- insert/select/update (`auth.uid() = user_id`), y esta columna va dentro de
-- esas mismas filas.

-- Comprobación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'question_attempts' AND column_name = 'confidence';
