-- =============================================================================
-- 1.2 — La politica que le falta a `question_attempts`
-- =============================================================================
--
-- POR QUE
-- La fase 1.2 movio a la sesion del usuario todo lo que es SUYO: sus notas, su
-- perfil fisico, sus planes, sus tarjetas, su biodata, sus votos y reportes.
-- Con eso, RLS deja de ser decorativa en esas tablas: aunque alguien se dejara
-- el `.eq('user_id', …)`, Postgres no devolveria la fila de otro.
--
-- `question_attempts` —las respuestas del alumno— se quedo fuera, y no por
-- descuido. Tiene politicas de INSERT y de SELECT, pero **NO de UPDATE**:
--
--   "Users can insert own attempts"  ... for insert  with check (auth.uid() = user_id)
--   "Users can select own attempts"  ... for select  using      (auth.uid() = user_id)
--   "Users can view own attempts"    ... for select  using      (auth.uid() = user_id)
--
-- Y `setResultErrorType` ACTUALIZA la fila para guardar el diagnostico del
-- fallo. Con el cliente de la sesion y sin politica de UPDATE, Postgres no da
-- error: simplemente no toca ninguna fila. El alumno clasificaria su error, la
-- pantalla diria "Error archivado" y el dato no se guardaria — el fallo mas
-- caro de este repo, otra vez, por otra puerta (regla 4).
--
-- QUE HACE
-- Anade la politica de UPDATE que falta. Con ella, `saveTestResult` y
-- `setResultErrorType` pueden pasar tambien al cliente de la sesion y
-- `question_attempts` deja de necesitar la clave de servicio.
--
-- De paso quita una de las dos politicas de SELECT, que son IDENTICAS
-- ("Users can select own attempts" y "Users can view own attempts"). Dos
-- politicas iguales no suman seguridad: suman una cosa mas que revisar cuando
-- algo no cuadre.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente y aditivo: no toca
-- ninguna fila y el codigo funciona igual antes y despues.
--
-- DESPUES DE EJECUTARLO, en el codigo:
--   · `saveTestResult` y `setResultErrorType` (app/actions/exams.ts) pasan a
--     `createSupabaseServerClient()`.
--   · `getUserStats` y `getFailedQuestions` (app/actions/user.ts) NO pueden:
--     hacen join con `question_bank`, que no tiene ninguna politica de lectura
--     —es contenido compartido— asi que se quedan con la clave de servicio.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La politica que falta
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own attempts" ON public.question_attempts;
CREATE POLICY "Users can update own attempts" ON public.question_attempts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- PASO 2 · Fuera la politica de SELECT duplicada
-- -----------------------------------------------------------------------------
-- Se queda "Users can select own attempts", que dice exactamente lo mismo.
DROP POLICY IF EXISTS "Users can view own attempts" ON public.question_attempts;


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobacion
-- -----------------------------------------------------------------------------
-- Tienen que salir tres politicas: insert, select y update.
--
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'question_attempts'
--   ORDER BY cmd;
