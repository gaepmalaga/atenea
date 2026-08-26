-- =============================================================================
-- 2.6 · `__esquema_json()` — leer el esquema sin la contrasena de la BD
-- =============================================================================
--
-- POR QUE EXISTE
-- `supabase db pull` pide la contrasena de la base de datos. Esta funcion deja
-- volcar el esquema con lo que ya hay en `.env` (la clave de servicio), que es
-- lo que usan estos dos guiones:
--
--   node scripts/schema-snapshot.mjs   -> supabase/schema.json
--   node scripts/dump-migration.mjs    -> supabase/migrations/0001_esquema_actual.sql
--
-- El primero alimenta a `tests/schema-drift.test.ts`, que es lo que impide que
-- el codigo y la base de datos vuelvan a derivar en silencio.
--
-- SEGURIDAD
-- Solo LEE catalogos (information_schema y pg_*). No toca ni una fila de datos.
-- Va con `security definer` para poder leer los catalogos completos, y con el
-- REVOKE de abajo queda fuera del alcance de `anon` y `authenticated`: solo la
-- clave de servicio puede llamarla.
--
-- El prefijo `__` la excluye de su propio volcado de funciones.
-- =============================================================================

create or replace function public.__esquema_json()
returns jsonb language sql security definer set search_path = public as $fn$
  select jsonb_build_object(
    'columnas', (select jsonb_agg(to_jsonb(c)) from (
        select table_name, column_name, ordinal_position, data_type, udt_name,
               is_nullable, column_default, character_maximum_length, numeric_precision
        from information_schema.columns where table_schema='public'
        order by table_name, ordinal_position) c),
    'constraints', (select jsonb_agg(to_jsonb(x)) from (
        select tc.table_name, tc.constraint_name, tc.constraint_type,
               kcu.column_name, kcu.ordinal_position,
               ccu.table_name as ref_table, ccu.column_name as ref_column
        from information_schema.table_constraints tc
        left join information_schema.key_column_usage kcu
          on kcu.constraint_name = tc.constraint_name and kcu.table_schema='public'
        left join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name and tc.constraint_type='FOREIGN KEY'
        where tc.table_schema='public'
          and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position) x),
    'indices', (select jsonb_agg(to_jsonb(i)) from (
        select tablename, indexname, indexdef from pg_indexes
        where schemaname='public' order by tablename, indexname) i),
    'rls', (select jsonb_agg(to_jsonb(r)) from (
        select relname as tabla, relrowsecurity as habilitada from pg_class
        where relnamespace='public'::regnamespace and relkind='r' order by relname) r),
    'politicas', (select jsonb_agg(to_jsonb(p)) from (
        select tablename, policyname, cmd, roles::text as roles, qual, with_check
        from pg_policies where schemaname='public' order by tablename, policyname) p),
    -- `prokind = 'f'` deja fuera las agregadas: pg_get_functiondef falla con
    -- ellas ("avg" is an aggregate function) y tumbaria la consulta entera.
    'funciones', (select jsonb_agg(to_jsonb(f)) from (
        select p.proname as nombre, pg_get_functiondef(p.oid) as definicion
        from pg_proc p
        where p.pronamespace='public'::regnamespace
          and p.prokind = 'f'
          and p.proname not like '\_\_%'
        order by p.proname) f)
  );
$fn$;

revoke all on function public.__esquema_json() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- MARCHA ATRAS
-- -----------------------------------------------------------------------------
-- Quitarla no rompe la aplicacion: solo deja de poder regenerarse el volcado.
--
-- drop function if exists public.__esquema_json();
