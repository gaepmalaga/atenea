-- =============================================================================
-- P1f — Que la referencia legal llegue hasta el chat
-- =============================================================================
--
-- POR QUE
-- P1b guarda de que articulo sale cada fragmento en `document_chunks.reference`,
-- y despues de reindexar el temario esta lleno:
--
--   BOE-A-1978 (Constitucion)   232 fragmentos   229 con referencia   184 distintas
--   TEMA 9 (LOFCS)              177 fragmentos   118 con referencia    72 distintas
--   tema 40 (apuntes)            40 fragmentos     0 con referencia (no es texto legal)
--
-- Pero el chat no la ve. `match_document_chunks` se escribio antes de que la
-- columna existiera y devuelve `id, content_chunk, similarity, filename`, asi
-- que `askAtenea` solo puede citar el NOMBRE DEL FICHERO:
--
--   [FUENTE 1]: TEMA 9 - La Ley Organica 2-1986 - de 13 de marzo - de Fuerzas...
--
-- cuando el dato para citar «Articulo treinta y siete» esta guardado al lado.
-- Para un opositor la diferencia no es cosmetica: la referencia es lo que le
-- dice QUE RELEER.
--
-- QUE HACE
-- Redefine la funcion anadiendo `reference` a lo que devuelve. Nada mas: los
-- mismos parametros, el mismo orden y el mismo umbral.
--
-- HAY QUE BORRARLA ANTES DE CREARLA. Postgres no deja cambiar el tipo de
-- retorno de una funcion con CREATE OR REPLACE, y esto anade una columna a la
-- tabla que devuelve. El DROP es seguro: la funcion no guarda estado.
--
-- COMO EJECUTARLO
-- Supabase → SQL Editor → pegar → Run. Es idempotente: se puede repetir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · Fuera la version vieja
-- -----------------------------------------------------------------------------
-- La firma se nombra entera porque podria haber sobrecargas.
DROP FUNCTION IF EXISTS public.match_document_chunks(vector, double precision, integer);


-- -----------------------------------------------------------------------------
-- PASO 2 · La misma busqueda, devolviendo tambien la referencia
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector,
  match_threshold double precision,
  match_count integer
)
RETURNS TABLE(
  id bigint,
  content_chunk text,
  similarity double precision,
  filename text,
  -- NUEVO. `null` en los fragmentos que no salen de un texto legal (unos
  -- apuntes no tienen articulo), asi que quien la lea tiene que contar con eso.
  reference text
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content_chunk,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.filename,
    dc.reference
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$;


-- -----------------------------------------------------------------------------
-- PASO 3 · Comprobacion
-- -----------------------------------------------------------------------------
-- Devuelve las columnas de la funcion. Tiene que aparecer `reference`.
--
--   SELECT p.proname, t.column_name, t.data_type
--   FROM information_schema.columns t, pg_proc p
--   WHERE p.proname = 'match_document_chunks' AND t.table_name = 'x'
--
-- Mas simple, y lo que de verdad importa: preguntar por algo del temario y ver
-- que sale la referencia. Desde `psql` o el editor SQL no hay embedding a mano,
-- asi que la comprobacion util es la del propio chat: preguntar por los
-- principios basicos de actuacion y mirar si la fuente cita el articulo.
