-- =============================================================================
-- P4 — Encender y apagar modulos
-- =============================================================================
--
-- POR QUE
-- Hoy los ocho modulos del alumno estan escritos a mano en `StudentDashboard`
-- y siempre estan los ocho. La decision que faltaba —QUE modulos querria apagar
-- la academia— ya esta tomada: **cualquiera**. Inteligencia (RAG), Test,
-- Repasar fallos, Drills, Prep. Fisica, Perfilado… todos.
--
-- QUE HACE
-- Crea `module_settings`: una fila por modulo, con su estado y quien lo cambio.
--
-- LA CLAVE ES `module_id`, Y ESO ES UNA DECISION
-- Hoy la plataforma sirve a UNA academia. `organization_id` se deja creada
-- —cuesta cero y deja constancia de por donde crecera esto— pero NO entra en la
-- clave, por un motivo muy concreto de Postgres: en un UNIQUE, dos NULL se
-- consideran distintos, asi que `UNIQUE (organization_id, module_id)` con la
-- organizacion a NULL NO impediria filas duplicadas del mismo modulo. Y las
-- alternativas (indice sobre una expresion, o un UUID centinela) rompen el
-- `upsert` de PostgREST, que necesita columnas de verdad en `on_conflict`.
--
-- El dia que existan academias, la clave pasa a ser (organization_id,
-- module_id) y esta tabla se migra. Es una linea de SQL entonces, y mientras
-- tanto no hay una restriccion que mienta sobre lo que garantiza.
--
-- RLS
-- LEER lo puede hacer cualquier usuario con sesion: el dashboard del alumno
-- necesita saber que modulos estan encendidos. ESCRIBIR no: no hay politica de
-- escritura, asi que solo entra por la clave de servicio, que es la que usa la
-- accion de administracion (protegida ademas con `requireAdmin`).
--
-- SIN FILAS, TODO ENCENDIDO
-- La tabla nace vacia a proposito y el codigo trata "sin fila" como ACTIVO. Asi
-- ejecutar este guion no apaga nada, y un modulo nuevo del futuro aparece
-- encendido en vez de desaparecer en silencio.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La tabla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_settings (
  module_id       text PRIMARY KEY,
  enabled         boolean NOT NULL DEFAULT true,
  -- Hoy siempre NULL. Ver arriba por que no forma parte de la clave.
  organization_id uuid,
  updated_at      timestamp with time zone DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.module_settings IS
  'Que modulos del alumno estan activos. Una fila por modulo; SIN FILA = activo.';


-- -----------------------------------------------------------------------------
-- PASO 2 · RLS: leer si, escribir solo con la clave de servicio
-- -----------------------------------------------------------------------------
ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS module_settings_lectura ON public.module_settings;
CREATE POLICY module_settings_lectura ON public.module_settings
  FOR SELECT
  TO authenticated
  USING (true);


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobacion
-- -----------------------------------------------------------------------------
-- La tabla existe, con RLS y una sola politica, y de solo lectura:
--
--   SELECT c.relname, c.relrowsecurity, p.policyname, p.cmd
--   FROM pg_class c
--   LEFT JOIN pg_policies p ON p.tablename = c.relname
--   WHERE c.relname = 'module_settings';
--
-- Y que nace vacia, que es lo que garantiza que ejecutarlo no apaga nada:
--
--   SELECT count(*) FROM public.module_settings;
