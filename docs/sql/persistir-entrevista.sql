-- =============================================================================
-- Persistir la transcripción y el informe de la entrevista (§2.11 / fase 4)
-- =============================================================================
--
-- ✅ EJECUTADO el 7 sep 2026. `interview_reports` con sus 7 columnas, RLS de
--    propietario e índice. `schema-snapshot.mjs` detrás (35 tablas).
--
-- QUÉ RESUELVE
--   `evaluateInterview` genera un informe (puntuación, veredicto, fortalezas,
--   contradicciones, qué preparar) a partir de la transcripción. Hoy se ve una
--   vez y se pierde al cerrar la sala. Un aspirante que hace tres simulacros en
--   un mes no puede comparar si va mejorando.
--
-- QUÉ AÑADE
--   Una tabla, `interview_reports`, una fila por informe generado:
--     id, user_id, created_at, score, turns, report (jsonb), transcript (text)
--
--   `report` guarda el informe entero ya normalizado (`InterviewReport`), así
--   que si mañana se le añade un campo, los informes viejos no se rompen.
--
-- RLS
--   Política de PROPIETARIO (`auth.uid() = user_id`). Es del alumno y solo suya:
--   `interview.ts` la escribe y la lee con el cliente de la SESIÓN, no con la
--   clave de servicio (regla 34). Es material sensible —lo que el aspirante
--   contó de sí mismo bajo presión— y no lo mira nadie más.
--
-- COMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
--   node scripts/dump-migration.mjs
--   y quitar `interview_reports` de PENDIENTE_SQL en tests/schema-drift.test.ts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.interview_reports (
  id          uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  score       smallint,
  turns       smallint,
  report      jsonb NOT NULL,
  transcript  text NOT NULL DEFAULT ''
);

ALTER TABLE public.interview_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interview_reports_propietario" ON public.interview_reports;
CREATE POLICY "interview_reports_propietario" ON public.interview_reports
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS interview_reports_user_idx
  ON public.interview_reports (user_id, created_at DESC);

-- Comprobación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'interview_reports';
