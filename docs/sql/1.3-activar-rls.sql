-- =============================================================================
-- Fase 1.3 — Activar Row Level Security
-- =============================================================================
--
-- POR QUÉ ESTO ES SEGURO EJECUTAR HOY
-- Todas las consultas de la aplicación van con `SUPABASE_SERVICE_ROLE_KEY`, que
-- salta RLS por completo. Activar RLS ahora NO puede romper la aplicación: lo
-- único que hace es cerrar el acceso directo con la clave pública (`anon`), que
-- hoy está abierto de par en par para cualquiera que conozca la URL del proyecto.
--
-- Esto invierte el orden del plan: la fase 1.3 va ANTES que la 1.2. Mover las
-- consultas al cliente del usuario (1.2) sin RLS puesta las dejaría sin ninguna
-- protección; con RLS ya activa, cada consulta que se mueva queda cubierta desde
-- el primer momento.
--
-- QUÉ HACE
--   · Tablas de datos personales → RLS + políticas de propietario
--     (cada usuario ve y escribe solo sus filas).
--   · Tablas de contenido → RLS sin políticas, o sea acceso directo DENEGADO.
--     La aplicación las lee con la clave de servicio, así que sigue funcionando.
--
-- AVISO SOBRE EL ESQUEMA
-- Los nombres de tabla y de columna están deducidos del código, no de la base de
-- datos: el esquema todavía no está versionado. EJECUTA EL PASO 0 PRIMERO.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 0 · Comprobar que el esquema es el que espera este guion (solo lectura)
-- -----------------------------------------------------------------------------
-- Cada fila debe aparecer con `tiene_user_id = true`. Si alguna falta o la
-- columna se llama distinto, ajusta el guion antes de seguir.

SELECT
  t.table_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name   = t.table_name
      AND c.column_name  = 'user_id'
  ) AS tiene_user_id
FROM (VALUES
  ('test_results'), ('flashcard_progress'), ('flashcard_results'),
  ('profiles_biodata'), ('profiles_psych'), ('profiles_physical'),
  ('training_plans'), ('question_votes'), ('question_reports')
) AS t(table_name)
ORDER BY 1;

-- Y el estado actual de RLS. Al terminar, todas deben salir con rls = true.
SELECT relname AS tabla, relrowsecurity AS rls
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY 1;


-- -----------------------------------------------------------------------------
-- PASO 1 · Datos personales: RLS + política de propietario
-- -----------------------------------------------------------------------------
-- `auth.uid()` es el usuario de la sesión que hace la petición. Con la clave de
-- servicio devuelve NULL, pero da igual: esa clave salta RLS entera.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'test_results', 'flashcard_progress', 'flashcard_results',
    'profiles_biodata', 'profiles_psych', 'profiles_physical',
    'training_plans', 'question_votes', 'question_reports'
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
-- PASO 2 · `profiles`: leer solo el propio perfil, y NO poder escribirlo
-- -----------------------------------------------------------------------------
-- Aquí la columna de identidad es `id`, no `user_id`.
--
-- Se concede SELECT pero NO UPDATE a propósito: `profiles` guarda la columna
-- `role`, y dejar que un usuario escriba su propia fila sería dejarle
-- ascenderse a administrador. Los cambios de rol se hacen desde el panel de
-- Supabase o con la clave de servicio.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_leer_propio ON public.profiles;
CREATE POLICY profiles_leer_propio ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());


-- -----------------------------------------------------------------------------
-- PASO 3 · Contenido: RLS activa y SIN políticas = acceso directo denegado
-- -----------------------------------------------------------------------------
-- Estas tablas no tienen dueño: son el temario y el banco de preguntas. Hoy,
-- con la clave pública, cualquiera puede volcar `question_bank` entero CON LAS
-- RESPUESTAS CORRECTAS. Al activar RLS sin políticas, ese acceso se cierra y la
-- aplicación sigue leyéndolas con la clave de servicio.
--
-- Si más adelante (fase 1.2) alguna consulta pasa al cliente del usuario, habrá
-- que añadir aquí la política que corresponda. Por ejemplo, para que un alumno
-- autenticado pueda leer el banco activo:
--
--   CREATE POLICY question_bank_leer_activas ON public.question_bank
--     FOR SELECT TO authenticated USING (status = 'active');

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'question_bank', 'documents', 'document_chunks', 'subjects', 'blocks'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- PASO 4 · Comprobar
-- -----------------------------------------------------------------------------
-- 4a) Todas las tablas con rls = true:
--     (repite la segunda consulta del PASO 0)
--
-- 4b) Políticas creadas:
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4c) La comprobación de verdad, desde fuera de SQL.
--     Con la clave ANÓNIMA (la pública, la que va en el navegador):
--
--       curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/question_bank?select=*&limit=1" \
--         -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
--
--     ANTES de este guion: devuelve preguntas con su respuesta correcta.
--     DESPUÉS: debe devolver [] o un error de permisos.
--
-- 4d) Y que la aplicación sigue funcionando: entra como alumno, haz un test,
--     mira las estadísticas. Todo va por la clave de servicio, así que no
--     debería notarse ningún cambio.


-- -----------------------------------------------------------------------------
-- DESHACER (si algo fuera mal)
-- -----------------------------------------------------------------------------
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'test_results','flashcard_progress','flashcard_results','profiles_biodata',
--     'profiles_psych','profiles_physical','training_plans','question_votes',
--     'question_reports','profiles','question_bank','documents','document_chunks',
--     'subjects','blocks'
--   ]
--   LOOP
--     EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
