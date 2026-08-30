-- =============================================================================
-- P3.8 — La nota que el alumno escribe sobre una pregunta
-- =============================================================================
--
-- POR QUE
-- Un opositor que falla una pregunta y entiende por que quiere dejarse un aviso
-- para la proxima vez: "ojo, aqui confundo prescripcion con caducidad". Hoy no
-- tiene donde: la plataforma guarda su respuesta y el tipo de error, pero no
-- una sola palabra suya.
--
-- Es privado y es suyo. Por eso NO va en `question_bank` —que es contenido
-- compartido por todos los alumnos— sino en una tabla propia con el par
-- (usuario, pregunta).
--
-- QUE HACE
-- Crea `question_notes` y la cierra con RLS igual que las demas tablas
-- personales (fase 1.3): cada uno ve y escribe SOLO sus notas.
--
-- POR QUE UNA RESTRICCION UNICA
-- Una nota por alumno y pregunta. Sin ella, guardar dos veces la misma nota
-- crearia dos filas y la pantalla tendria que decidir cual ensenia; con ella,
-- guardar es un `upsert` sobre `(user_id, question_id)` y el problema no
-- existe. Es la misma decision que en `question_votes`.
--
-- POR QUE `ON DELETE CASCADE` EN LAS DOS CLAVES
-- Si se borra la cuenta, sus notas se van con ella. Si se borra la pregunta del
-- banco, una nota sobre una pregunta que ya no existe no le sirve a nadie.
-- Ojo: descartar una pregunta en moderacion NO la borra (pasa a 'disabled'),
-- asi que eso no toca las notas.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La tabla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  note        text NOT NULL,
  created_at  timestamp with time zone DEFAULT now(),
  updated_at  timestamp with time zone DEFAULT now()
);

-- Una nota por alumno y pregunta. Es lo que permite guardar con un upsert.
ALTER TABLE public.question_notes
  DROP CONSTRAINT IF EXISTS question_notes_user_question_key;
ALTER TABLE public.question_notes
  ADD CONSTRAINT question_notes_user_question_key UNIQUE (user_id, question_id);

COMMENT ON TABLE public.question_notes IS
  'Notas privadas de cada alumno sobre una pregunta concreta. Una por (usuario, pregunta).';


-- -----------------------------------------------------------------------------
-- PASO 2 · RLS: cada uno, lo suyo
-- -----------------------------------------------------------------------------
-- Misma forma que las seis tablas personales de la fase 1.3. `auth.uid()` es el
-- usuario de la peticion; con la clave de servicio devuelve NULL, pero da igual
-- porque esa clave salta RLS entera y es la que usa la aplicacion.
--
-- Aqui la politica SI incluye borrar, y a proposito: una nota personal la puede
-- retirar quien la escribio.

ALTER TABLE public.question_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS question_notes_propietario ON public.question_notes;
CREATE POLICY question_notes_propietario ON public.question_notes
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobacion
-- -----------------------------------------------------------------------------
-- 1) La tabla existe, con RLS activada y una politica:
--
--   SELECT c.relname, c.relrowsecurity, count(p.policyname) AS politicas
--   FROM pg_class c
--   LEFT JOIN pg_policies p ON p.tablename = c.relname
--   WHERE c.relname = 'question_notes'
--   GROUP BY c.relname, c.relrowsecurity;
--
-- 2) Y que la clave ajena a `question_bank` esta declarada — sin ella PostgREST
--    no resuelve el join que enseniara la nota junto a su pregunta:
--
--   SELECT conname, confrelid::regclass
--   FROM pg_constraint
--   WHERE conrelid = 'public.question_notes'::regclass AND contype = 'f';
