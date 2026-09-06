-- =============================================================================
-- Retirar tablas en desuso
-- =============================================================================
--
-- ✅ EJECUTADO el 7 sep 2026. Se comprobó `count(*) = 0` en las cuatro
--    inmediatamente antes del DROP. `schema-snapshot.mjs` y `dump-migration.mjs`
--    detrás (35 tablas). Se conserva por si hay que recrearlas en otro proyecto.
--
--    Eran: destructivo pero seguro — las cuatro VACÍAS y sin NINGÚN código que
--    las lea ni las escriba (0 referencias en `app/`).
--
-- POR QUÉ
--   El esquema arrastra tablas de intentos anteriores que nunca llegaron a
--   usarse. Mientras están, `schema-drift` y quien lea `supabase/schema.json`
--   tienen que adivinar cuál es la buena, y ya pasó una vez: el código escribía
--   resultados en `test_results` (que no tenía `error_type` ni `subject_id`) y
--   PostgREST rechazaba la escritura entera, en silencio, durante meses.
--
--   | Tabla              | Qué era                          | La buena hoy        |
--   |-------------------|-----------------------------------|---------------------|
--   | test_results       | resultados de test (fase < 2.8)   | question_attempts   |
--   | exams              | cabecera de examen guardado       | — (no se guarda)    |
--   | exam_questions     | preguntas de un examen guardado   | —                   |
--   | content_documents  | CMS de contenido que no se hizo   | documents           |
--
--   `workout_logs` NO se toca: está vacía pero SÍ se va a usar (el registro de
--   entrenamiento pasa a escribirse ahí, ver `completeTrainingDay`).
--   `blocks` NO se toca: es la estructura del temario y `admin.ts` la lee.
--
-- ANTES DE EJECUTAR
--   Si quieres conservar alguna, comenta su línea. Para deshacer hay que
--   recrear la tabla desde `supabase/migrations/0001_esquema_actual.sql` — pero
--   como están vacías, no se pierde ningún dato.
--
-- DESPUÉS
--   node scripts/schema-snapshot.mjs      (refresca supabase/schema.json)
--   node scripts/dump-migration.mjs       (regenera la migración)
--   `npm run reset` ya no las nombra (se quitaron de scripts/operacion/reset.mjs).
-- =============================================================================

DROP TABLE IF EXISTS public.test_results     CASCADE;
DROP TABLE IF EXISTS public.exam_questions   CASCADE;   -- FK a exams: va antes
DROP TABLE IF EXISTS public.exams            CASCADE;
DROP TABLE IF EXISTS public.content_documents CASCADE;

-- La copia de seguridad que dejó la fase 2.4 (deduplicación de test_results),
-- si aún existe. También vacía a estas alturas.
DROP TABLE IF EXISTS public.test_results_backup_2_4 CASCADE;

-- Comprobación:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('test_results','exams','exam_questions','content_documents');
--   -- debe devolver 0 filas
