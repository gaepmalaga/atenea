-- =============================================================================
-- P3.4 — Un blanco deja de contar como fallo  (MEJORA OPCIONAL, no bloqueante)
-- =============================================================================
--
-- EL PROBLEMA, QUE YA ESTA RESUELTO EN EL CODIGO
-- El simulacro puntua con la penalizacion de la convocatoria, y ahi el blanco
-- NO resta: `[A - E/(n-1)] * 10/P` no lo menciona. Pero al guardar, un blanco
-- caia en `is_correct = false`, igual que un error. El mismo examen daba dos
-- verdades: la nota decia que el blanco era neutro y las estadisticas lo
-- contaban como fallo, castigando NO arriesgar — la estrategia contraria a la
-- que enseña la formula del BOE.
--
-- COMO SE RESOLVIO SIN TOCAR EL ESQUEMA
-- Con `selected_index`, que llevaba declarada desde siempre y NADIE escribia.
-- Ahora se rellena, con tres estados que no se confunden entre si:
--
--     0, 1, 2 ...  la opcion que marco el alumno
--     -1           lo dejo en blanco A PROPOSITO   (BLANK_INDEX)
--     null         no se sabe: fila anterior a P3.4
--
-- El tercer estado es la razon de que NO se dedujera "null = en blanco", que
-- era la lectura tentadora: hasta hoy la columna estaba vacia tambien en las
-- contestadas, asi que un fallo historico se habria leido como blanco. Un
-- discriminante que confunde el pasado con el presente es peor que ninguno.
--
-- QUE APORTA ESTE GUION, SI SE EJECUTA
-- Nada imprescindible. Dos cosas que solo puede dar la base de datos:
--
--   1. La invariante «un blanco nunca es correcto» IMPUESTA, no confiada al
--      cliente. `saveExamResults` es un endpoint publico: hoy la garantiza
--      TypeScript, y TypeScript no corre en el servidor de Postgres.
--   2. Una columna que se lee sola en un `select`, sin recordar que -1 es un
--      centinela.
--
-- Es aditivo, idempotente y no borra nada. El codigo sigue funcionando
-- exactamente igual antes y despues: `is_blank` se rellena sola desde
-- `selected_index`, con una columna generada.
-- =============================================================================

-- Columna GENERADA: no hay dos fuentes de verdad que puedan discrepar, y el
-- historico (null) queda en false, que es lo correcto — hasta P3.4 no habia
-- forma de dejar una pregunta en blanco a proposito.
alter table public.question_attempts
  add column if not exists is_blank boolean
  generated always as (selected_index = -1) stored;

comment on column public.question_attempts.selected_index is
  'Opcion marcada, 0-based. -1 = la dejo en blanco a proposito. NULL = fila anterior a P3.4.';

comment on column public.question_attempts.is_blank is
  'Derivada de selected_index. Un blanco no suma ni resta: la formula del BOE no lo menciona.';

-- La invariante, en la base de datos y no solo en el cliente.
alter table public.question_attempts
  drop constraint if exists question_attempts_blanco_no_acierta;

alter table public.question_attempts
  add constraint question_attempts_blanco_no_acierta
  check (selected_index is distinct from -1 or is_correct = false);

-- -----------------------------------------------------------------------------
-- COMPROBACION
-- -----------------------------------------------------------------------------
select
  count(*)                                      as filas,
  count(*) filter (where selected_index = -1)   as en_blanco,
  count(*) filter (where selected_index >= 0)   as contestadas,
  count(*) filter (where selected_index is null) as sin_dato_historico
from public.question_attempts;
