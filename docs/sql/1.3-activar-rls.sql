-- =============================================================================
-- Fase 1.3 — Activar Row Level Security
-- =============================================================================
--
-- VERIFICADO CONTRA EL PROYECTO REAL (26 ago 2026, proyecto Atenea).
-- La version anterior deducia los nombres del codigo. Ya no: las listas de
-- abajo salen de consultar pg_class y pg_policies. Diferencias encontradas:
--
--   · `workout_logs` tiene user_id y no estaba en ninguna lista. Habria
--     quedado abierta con la clave publica.
--   · `content_documents` y `flashcard_bank` son contenido y faltaban en el
--     paso 3. `flashcard_bank` guarda las respuestas.
--   · Siete tablas YA tenian RLS con politicas correctas (exams, exam_questions,
--     question_attempts, flashcard_progress, flashcard_results,
--     profiles_biodata, profiles_psych). No se tocan: ver el paso 1b.
--
-- POR QUE ES SEGURO EJECUTARLO
-- Todas las consultas de la aplicacion van con `SUPABASE_SERVICE_ROLE_KEY`, que
-- salta RLS por completo. Comprobado ademas que el cliente del navegador
-- (`app/lib/supabase/client.ts`, usado solo en `app/page.tsx`) unicamente llama
-- a `supabase.auth.*` y no hace ni un `.from()`. Activar RLS no puede romper
-- la aplicacion: lo unico que hace es cerrar el acceso directo con la clave
-- publica (`anon`), que hoy esta abierto de par en par.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · Datos personales SIN proteger hoy: RLS + politica de propietario
-- -----------------------------------------------------------------------------
-- Las seis que salieron con rls=false, 0 politicas y columna user_id.
-- `auth.uid()` es el usuario de la sesion que hace la peticion. Con la clave de
-- servicio devuelve NULL, pero da igual: esa clave salta RLS entera.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'test_results', 'training_plans', 'question_votes',
    'question_reports', 'profiles_physical', 'workout_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_propietario', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $p$, t || '_propietario', t);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- PASO 1b · Las que YA estaban protegidas: no se tocan, a proposito
-- -----------------------------------------------------------------------------
--   exams (6 politicas), exam_questions (2), question_attempts (3),
--   flashcard_progress (1), flashcard_results (2), profiles_biodata (3),
--   profiles_psych (2)
--
-- Todas comprueban `auth.uid() = user_id` (exam_questions lo hace a traves de
-- `exams`). Ninguna es permisiva de mas.
--
-- La version anterior de este guion les habria anadido una politica FOR ALL por
-- encima. Como las politicas permisivas se combinan con OR, eso AMPLIABA el
-- acceso: `flashcard_results`, `profiles_psych` y `profiles_biodata` hoy no
-- dejan borrar, y habrian pasado a dejarlo. No es lo que busca esta fase.
--
-- Lo que si falta ahi es politica de UPDATE/DELETE donde no la hay. Eso es
-- trabajo de la fase 1.2, cuando alguna consulta pase al cliente: entonces se
-- anade la que corresponda, una por una y a sabiendas.


-- -----------------------------------------------------------------------------
-- PASO 2 · `profiles`: leer solo el propio perfil, y NO poder escribirlo
-- -----------------------------------------------------------------------------
-- Aqui la columna de identidad es `id`, no `user_id` (confirmado: profiles no
-- tiene columna user_id).
--
-- Se concede SELECT pero NO UPDATE a proposito: `profiles` guarda la columna
-- `role`, y dejar que un usuario escriba su propia fila seria dejarle
-- ascenderse a administrador. Los cambios de rol se hacen desde el panel de
-- Supabase o con la clave de servicio.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_leer_propio ON public.profiles;
CREATE POLICY profiles_leer_propio ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());


-- -----------------------------------------------------------------------------
-- PASO 3 · Contenido: RLS activa y SIN politicas = acceso directo denegado
-- -----------------------------------------------------------------------------
-- Estas tablas no tienen dueno: son el temario y los bancos. Hoy, con la clave
-- publica, cualquiera puede volcar `question_bank` y `flashcard_bank` enteros
-- CON LAS RESPUESTAS CORRECTAS. Al activar RLS sin politicas ese acceso se
-- cierra, y la aplicacion sigue leyendolas con la clave de servicio.
--
-- Si mas adelante (fase 1.2) alguna consulta pasa al cliente del usuario, habra
-- que anadir aqui la politica que corresponda. Por ejemplo:
--
--   CREATE POLICY question_bank_leer_activas ON public.question_bank
--     FOR SELECT TO authenticated USING (status = 'active');

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'question_bank', 'flashcard_bank', 'documents', 'content_documents',
    'document_chunks', 'subjects', 'blocks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- PASO 4 · Comprobar
-- -----------------------------------------------------------------------------
-- Al terminar, las 21 tablas deben salir con rls = true.

SELECT c.relname AS tabla,
       c.relrowsecurity AS rls,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
FROM pg_class c
WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
ORDER BY 1;

-- 4b) La comprobacion de verdad, desde fuera de SQL.
--     Con la clave ANONIMA (la publica, la que va en el navegador):
--
--       curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/question_bank?select=*&limit=1" \
--         -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
--
--     ANTES de este guion: devuelve preguntas con su respuesta correcta.
--     DESPUES: debe devolver [] o un error de permisos.
--
-- 4c) Y que la aplicacion sigue funcionando: entra como alumno, haz un test,
--     mira las estadisticas. Todo va por la clave de servicio, asi que no
--     deberia notarse ningun cambio.


-- -----------------------------------------------------------------------------
-- DESHACER (si algo fuera mal)
-- -----------------------------------------------------------------------------
-- Solo apaga lo que este guion enciende. Las siete del paso 1b no se tocan.
--
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'test_results','training_plans','question_votes','question_reports',
--     'profiles_physical','workout_logs','profiles','question_bank',
--     'flashcard_bank','documents','content_documents','document_chunks',
--     'subjects','blocks'
--   ]
--   LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
