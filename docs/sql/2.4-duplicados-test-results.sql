-- =============================================================================
-- Fase 2.4 — Reparación de los resultados duplicados en `test_results`
-- =============================================================================
--
-- QUÉ PASÓ
-- En modo entrenamiento, cada fallo etiquetado insertaba DOS filas:
--
--   Fila A (al responder)     is_correct=false, error_type NULL,     response_time_ms con valor
--   Fila B (al diagnosticar)  is_correct=false, error_type con valor, response_time_ms NULL
--
-- Resultado: cada fallo etiquetado cuenta doble y el porcentaje de acierto del
-- alumno queda sesgado a la baja de forma permanente.
--
-- El código ya no las genera (desde el commit de la fase 2.4: ahora se guarda
-- una fila y se actualiza). Este guion repara lo que quedó de antes.
--
-- CÓMO USARLO
--   1. Ejecuta el PASO 1 y mira cuántas hay. Si sale 0, no hay nada que hacer.
--   2. Haz una copia de seguridad de la tabla (PASO 2).
--   3. Revisa el PASO 3 con el SELECT antes de ejecutar el UPDATE/DELETE.
--
-- NO ejecutes el fichero entero de una vez. Va por pasos a propósito.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · ¿Cuántos duplicados hay?  (solo lectura, seguro)
-- -----------------------------------------------------------------------------
-- Empareja cada fila A con su fila B: mismo usuario, misma pregunta, y creadas
-- con menos de 10 minutos de diferencia (el diagnóstico es inmediato).

WITH pares AS (
  SELECT
    a.id  AS id_respuesta,
    b.id  AS id_diagnostico,
    a.user_id,
    a.question_id,
    b.error_type,
    a.created_at
  FROM test_results a
  JOIN test_results b
    ON  b.user_id     = a.user_id
    AND b.question_id = a.question_id
    AND b.id         <> a.id
    AND b.created_at >= a.created_at
    AND b.created_at <  a.created_at + INTERVAL '10 minutes'
  WHERE a.is_correct = false
    AND a.error_type IS NULL          -- A: sin taxonomía
    AND b.is_correct = false
    AND b.error_type IS NOT NULL      -- B: con taxonomía
    AND a.question_id IS NOT NULL     -- sin id no se pueden emparejar
)
SELECT
  COUNT(*)                        AS filas_sobrantes,
  COUNT(DISTINCT user_id)         AS alumnos_afectados,
  MIN(created_at)                 AS desde,
  MAX(created_at)                 AS hasta
FROM pares;


-- -----------------------------------------------------------------------------
-- PASO 2 · Copia de seguridad antes de tocar nada
-- -----------------------------------------------------------------------------
-- Déjala hasta comprobar que las estadísticas de los alumnos son correctas.
-- Para deshacer:  INSERT INTO test_results SELECT * FROM test_results_backup_2_4;

CREATE TABLE IF NOT EXISTS test_results_backup_2_4 AS
SELECT * FROM test_results;


-- -----------------------------------------------------------------------------
-- PASO 3 · Fusionar y limpiar
-- -----------------------------------------------------------------------------
-- Se conserva la fila A (tiene el tiempo de respuesta) y se le copia la
-- taxonomía de la fila B. Después se borra la B.
--
-- Se hace en este orden a propósito: si el DELETE fallara, la A ya tiene el
-- dato bueno y lo peor que queda es el duplicado que ya había.

-- 3a) Míralo antes de ejecutarlo: cambia el UPDATE por este SELECT.
--
--   SELECT a.id, a.created_at, a.error_type AS antes, b.error_type AS despues
--   FROM test_results a
--   JOIN test_results b ON ... (mismas condiciones que abajo)
--   LIMIT 50;

-- 3b) Copiar la taxonomía a la fila que conserva el tiempo.
UPDATE test_results a
SET    error_type = b.error_type
FROM   test_results b
WHERE  b.user_id     = a.user_id
  AND  b.question_id = a.question_id
  AND  b.id         <> a.id
  AND  b.created_at >= a.created_at
  AND  b.created_at <  a.created_at + INTERVAL '10 minutes'
  AND  a.is_correct = false
  AND  a.error_type IS NULL
  AND  b.is_correct = false
  AND  b.error_type IS NOT NULL
  AND  a.question_id IS NOT NULL;

-- 3c) Borrar la fila sobrante.
-- Se identifica por lo que la caracteriza: fallo etiquetado SIN tiempo medido,
-- que es justo lo que producía el segundo insert y nada más lo produce.
DELETE FROM test_results b
WHERE  b.is_correct = false
  AND  b.error_type IS NOT NULL
  AND  COALESCE(b.response_time_ms, 0) = 0
  AND  b.question_id IS NOT NULL
  AND  EXISTS (
         SELECT 1 FROM test_results a
         WHERE a.user_id     = b.user_id
           AND a.question_id = b.question_id
           AND a.id         <> b.id
           AND a.is_correct = false
           AND a.error_type = b.error_type   -- ya fusionada en 3b
           AND COALESCE(a.response_time_ms, 0) > 0
       );


-- -----------------------------------------------------------------------------
-- PASO 4 · Comprobar
-- -----------------------------------------------------------------------------
-- El PASO 1 debe devolver ahora 0 filas sobrantes.
-- Compara el porcentaje de acierto de un alumno antes y después:
--
--   SELECT
--     ROUND(100.0 * COUNT(*) FILTER (WHERE is_correct) / COUNT(*), 1) AS acierto_ahora,
--     (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE is_correct) / COUNT(*), 1)
--        FROM test_results_backup_2_4 WHERE user_id = 'UUID-DEL-ALUMNO')  AS acierto_antes
--   FROM test_results WHERE user_id = 'UUID-DEL-ALUMNO';
--
-- El de "ahora" debe ser IGUAL O MAYOR: se han quitado fallos duplicados.
-- Si bajara, algo ha ido mal: restaura desde la copia del PASO 2.
