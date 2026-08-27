-- =============================================================================
-- P1 — Ingesta fiable del temario
-- =============================================================================
--
-- POR QUE
-- Medido contra este mismo proyecto el 27 ago 2026:
--
--   TEMA 9 - Ley Organica 2/1986    108.233 caracteres    0 fragmentos
--   BOE-A-1978 (Constitucion)       124.764 caracteres   40 fragmentos
--   tema 40                          26.106 caracteres   31 fragmentos
--
-- El TEMA 9 no existe para el chat. Su texto esta entero en la base de datos,
-- asi que no se perdio al extraer el PDF: fallo el indexado y nadie se entero.
-- Deberia tener unos 136 fragmentos.
--
-- La causa: `uploadTopicPDF` inserta la fila de `documents` ANTES de indexar. Si
-- el indexado falla entero se lanza un error, pero el documento ya esta
-- guardado. Queda huerfano, aparece en la lista del panel como cualquier otro, y
-- el aviso de "indexado parcial" solo se ve en el momento de subir.
--
-- Este guion no arregla el codigo: le da a la base de datos lo que necesita para
-- que el arreglo sea posible y para que el estado se VEA siempre.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La referencia legal de cada fragmento
-- -----------------------------------------------------------------------------
-- `chunkDocument` (app/lib/text.ts) ya sabe de que articulo sale cada fragmento.
-- Guardarlo permite dos cosas que hoy no se pueden hacer:
--
--   · Que el chat cite «Articulo 11 LOFCS» en vez del nombre del fichero.
--   · Que una pregunta generada lleve su referencia legal, que para un opositor
--     vale casi tanto como la explicacion: le dice que releer.
--
-- Nula a proposito: los apuntes sin estructura no tienen articulos, y los
-- fragmentos ya indexados tampoco la tienen.

alter table public.document_chunks
  add column if not exists reference text;

comment on column public.document_chunks.reference is
  'Articulo o disposicion del que sale el fragmento. NULL en textos sin estructura legal.';


-- -----------------------------------------------------------------------------
-- PASO 2 · El estado de indexado de cada documento
-- -----------------------------------------------------------------------------
-- Hoy no hay forma de saber si un documento se indexo, ni cuantos fragmentos
-- tiene, sin contar filas a mano en `document_chunks`.

alter table public.documents
  add column if not exists index_status text not null default 'pendiente',
  add column if not exists chunk_count integer not null default 0,
  add column if not exists indexed_at timestamptz;

-- Los cuatro estados posibles. `parcial` es el que hoy no se veia en ninguna
-- parte y es justo el que hay que poder encontrar.
alter table public.documents
  drop constraint if exists documents_index_status_check;

alter table public.documents
  add constraint documents_index_status_check
  check (index_status in ('pendiente', 'indexado', 'parcial', 'fallido'));

comment on column public.documents.index_status is
  'pendiente | indexado | parcial | fallido. Se calcula al subir y al reindexar.';


-- -----------------------------------------------------------------------------
-- PASO 3 · Poner al dia los documentos que ya existen
-- -----------------------------------------------------------------------------
-- Sin esto, los tres documentos actuales se quedarian en 'pendiente' aunque dos
-- de ellos esten bien indexados.
--
-- No se puede saber cuantos fragmentos DEBERIA tener cada uno sin volver a
-- trocearlo, asi que aqui solo se distingue lo que se sabe con certeza: si tiene
-- cero fragmentos, esta fallido; si tiene alguno, se marca indexado y ya lo
-- corregira el primer reindexado.

update public.documents d
set chunk_count = sub.n,
    index_status = case when sub.n = 0 then 'fallido' else 'indexado' end,
    indexed_at   = case when sub.n = 0 then null else now() end
from (
  select d2.id, count(c.id) as n
  from public.documents d2
  left join public.document_chunks c on c.document_id = d2.id
  group by d2.id
) as sub
where sub.id = d.id;


-- -----------------------------------------------------------------------------
-- PASO 4 · Comprobar
-- -----------------------------------------------------------------------------
-- El TEMA 9 debe aparecer como 'fallido' con 0 fragmentos. Los otros dos, como
-- 'indexado'.

select
  filename,
  index_status,
  chunk_count,
  length(full_text) as caracteres,
  indexed_at
from public.documents
order by index_status, filename;


-- -----------------------------------------------------------------------------
-- MARCHA ATRAS
-- -----------------------------------------------------------------------------
-- alter table public.documents drop constraint if exists documents_index_status_check;
-- alter table public.documents drop column if exists index_status;
-- alter table public.documents drop column if exists chunk_count;
-- alter table public.documents drop column if exists indexed_at;
-- alter table public.document_chunks drop column if exists reference;
