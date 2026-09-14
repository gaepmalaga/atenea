-- =============================================================================
-- La curva de progreso, cacheada por día (regla 77 · "Mi Evolución")
-- =============================================================================
--
-- ⏳ SIN EJECUTAR. El código ya la usa y degrada con gracia si no existe
--    (mismo patrón que `admin_audit_log`/`academy_convocatoria` antes de
--    ejecutarse): sin esta tabla, "Mi Evolución" sigue funcionando, solo que
--    recalcula la curva entera en cada visita en vez de cachear el pasado.
--
-- QUÉ RESUELVE
--   La pantalla "Mi Evolución" enseña cuántas preguntas dominaba el alumno
--   CADA DÍA desde que empezó — no solo hoy. Un día YA PASADO no cambia
--   nunca: depende solo de intentos que ya ocurrieron. Sin guardarlo, cada
--   visita recalcularía el estado completo (`computeQuestionStates`) una vez
--   POR CADA DÍA del historial, y eso con meses de antigüedad se nota.
--
--   Decidido explícitamente por el dueño: NADA de `localStorage` — tiene que
--   verse igual entre el navegador y el móvil, así que va en una tabla.
--
-- QUÉ AÑADE
--   Una tabla, `curva_progreso`, una fila por (alumno, día):
--     user_id     uuid        el alumno
--     fecha       date        el día, en su zona horaria local
--     dominadas   integer     cuántas preguntas tenía en caja DOMINADA ESE día
--   Clave primaria (user_id, fecha): como mucho una fila por alumno y día.
--
--   El código (`app/actions/evolucion.ts`) solo escribe días YA CERRADOS
--   (nunca el de hoy, que cambia según lo que conteste) — así que un upsert
--   nunca pisa un dato que ya estuviera bien.
--
-- RLS
--   Política de PROPIETARIO (`auth.uid() = user_id`), igual que
--   `question_notes`/`interview_reports` (regla 34): es del alumno y se lee y
--   escribe con el cliente de la SESIÓN, nunca con la clave de servicio.
--
-- CÓMO EJECUTARLO: SQL Editor -> pegar -> Run. Idempotente. Después:
--   node scripts/schema-snapshot.mjs
--   y quitar 'curva_progreso' de PENDIENTE_SQL en tests/schema-drift.test.ts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.curva_progreso (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha      date NOT NULL,
  dominadas  integer NOT NULL CHECK (dominadas >= 0),
  PRIMARY KEY (user_id, fecha)
);

ALTER TABLE public.curva_progreso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curva_progreso_propietario" ON public.curva_progreso;
CREATE POLICY "curva_progreso_propietario" ON public.curva_progreso
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Comprobación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'curva_progreso';
