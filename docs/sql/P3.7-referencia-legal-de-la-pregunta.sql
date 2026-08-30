-- =============================================================================
-- P3.7 — De que articulo sale cada pregunta
-- =============================================================================
--
-- POR QUE
-- Para un opositor, saber de que articulo sale una pregunta vale casi tanto
-- como la explicacion: le dice QUE RELEER. Hoy la pantalla de resultados puede
-- decirle por que la respuesta es la B, pero no donde estudiarlo.
--
-- El dato YA EXISTE en la base de datos. P1b lo puso en
-- `document_chunks.reference` y P1f lo arreglo cuando resulto que la referencia
-- guardada era falsa en la mayoria del temario:
--
--   BOE-A-1978 (Constitucion)   232 fragmentos   229 con referencia
--   TEMA 9 (LOFCS)              177 fragmentos   118 con referencia
--
-- Lo que falta es un sitio donde guardarlo EN LA PREGUNTA. Sin columna no se
-- puede escribir el codigo: PostgREST rechaza la escritura ENTERA si una sola
-- columna no existe, asi que adelantarlo romperia el guardado de preguntas —
-- el fallo que este repositorio ya ha pagado tres veces.
--
-- QUE HACE
-- Anade `legal_reference text` a `question_bank`. Nada mas: sin NOT NULL y sin
-- valor por defecto, asi que las 67 preguntas que ya existen se quedan con
-- `null` y ninguna consulta actual cambia de comportamiento.
--
-- `null` significa "no se sabe", y hay dos motivos legitimos para ello:
--   · la pregunta es anterior a este cambio;
--   · sale de unos apuntes, que no tienen articulos (el tema 40 tiene 40
--     fragmentos y CERO referencias, y eso es correcto).
-- Quien la lea tiene que contar con las dos.
--
-- LO QUE VIENE DESPUES, EN EL CODIGO
-- Hoy `generateTestQuestion` toma una ventana aleatoria de `documents.full_text`
-- y el fragmento —que es quien sabe de que articulo viene— no participa. Con la
-- columna ya creada, la generacion pasa a elegir un FRAGMENTO al azar del tema y
-- guardar su `reference` aqui. Efecto de paso: la pregunta se redacta sobre un
-- articulo entero en vez de sobre un corte a ciegas de 12.000 caracteres.
--
-- COMO EJECUTARLO
-- Supabase -> SQL Editor -> pegar -> Run. Es idempotente: se puede repetir.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La columna
-- -----------------------------------------------------------------------------
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS legal_reference text;

COMMENT ON COLUMN public.question_bank.legal_reference IS
  'Articulo o disposicion del que sale la pregunta, copiado de document_chunks.reference al generarla. NULL = no se sabe (pregunta anterior a P3.7) o no procede (apuntes sin articulos).';


-- -----------------------------------------------------------------------------
-- PASO 2 · Comprobacion
-- -----------------------------------------------------------------------------
-- Tiene que devolver una fila con data_type = text e is_nullable = YES.
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name = 'question_bank'
--     AND column_name = 'legal_reference';
--
-- Y esta, que todas las preguntas existentes siguen ahi y con la columna vacia:
--
--   SELECT count(*) AS total,
--          count(legal_reference) AS con_referencia
--   FROM public.question_bank;
