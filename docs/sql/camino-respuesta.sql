-- =============================================================================
-- El camino de la respuesta (motor adaptativo v2, fase 2)
-- =============================================================================
--
-- ✅ EJECUTADO (14 sep 2026). Verificado contra la BD real:
--    `answer_path jsonb` en `question_attempts`. `node scripts/schema-snapshot.mjs`
--    detrás (39 tablas). El código ya lo escribe y lo lee
--    (`ActiveTest.tsx`, `exam-results.ts`, `answer-signals.ts::patronDeCambio`).
--
-- QUÉ RESUELVE
--   `option_changes` cuenta CUÁNTAS veces cambió de opción, pero no CUÁLES.
--   Hoy no se distingue entre tres alumnos que el planificador ve idénticos:
--   quien fue directo, quien dudó y se autocorrigió de verdad (B → C, se
--   queda en C), y quien dudó y volvió a su primer instinto por pánico
--   (B → C → B) — la peor señal de las tres, y hoy invisible.
--
-- QUÉ AÑADE
--   Una columna a `question_attempts`:
--     answer_path  jsonb  NULL
--   Array pequeño de índices de opción (0, 1, 2), en el orden en que se
--   marcaron ANTES de confirmar — no una cadena de texto, para que una
--   consulta pueda mirar dentro sin parsear. NULL = no se midió: todo el
--   histórico, y cualquier fila donde no se llegue a tocar ninguna opción
--   (blanco por ignorancia, ver `tipoDeBlanco` en `answer-signals.ts`, que ya
--   funciona SIN esta columna).
--
--   Ejemplo: [1, 2] = marcó B, cambió a C, confirmó C.
--            [1, 2, 1] = marcó B, cambió a C, volvió a B, confirmó B.
--
-- LO QUE YA FUNCIONA SIN ESTO, A PROPÓSITO
--   Los «tres tipos de blanco» (ignorancia / cálculo / reloj) y la firmeza
--   deducida NO necesitan esta columna — se derivan de `first_touch_ms` y
--   `option_changes`, que ya existen (`tipoDeBlanco`, `inferFirmeza`). Esto
--   es solo para el patrón MÁS fino (volver a la opción inicial), que hoy no
--   se puede distinguir de un cambio limpio.
--
-- CÓMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
-- =============================================================================

ALTER TABLE public.question_attempts
  ADD COLUMN IF NOT EXISTS answer_path jsonb;

-- Solo un array de enteros pequeños, o NULL. Un objeto o una cadena suelta
-- aquí sería un dato que ninguna consulta esperaría.
ALTER TABLE public.question_attempts
  DROP CONSTRAINT IF EXISTS question_attempts_answer_path_check;
ALTER TABLE public.question_attempts
  ADD CONSTRAINT question_attempts_answer_path_check
  CHECK (answer_path IS NULL OR jsonb_typeof(answer_path) = 'array');

-- RLS: no se toca. La columna va dentro de las mismas filas que ya tienen
-- política de propietario para insert/select/update.

-- Comprobación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'question_attempts' AND column_name = 'answer_path';
