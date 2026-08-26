-- =============================================================================
-- Fase 2.5 — `question_attempts` pasa a ser la tabla de resultados
-- =============================================================================
--
-- POR QUE
-- Habia dos tablas para lo mismo y el codigo escribia en la equivocada:
--
--   test_results       id, user_id, question_id, is_correct, response_time_ms,
--                      option_changes, created_at
--   question_attempts  id, user_id, exam_id, question_id, topic, is_correct,
--                      selected_index, error_type, response_time_ms, created_at
--
-- El codigo mandaba `subject_id` y `error_type` a `test_results`, que no tiene
-- ninguna de las dos. PostgREST rechaza la escritura ENTERA si una sola columna
-- no existe, asi que NUNCA se guardo un resultado: la tabla estaba a 0 filas.
--
-- Se elige `question_attempts` y no ampliar `test_results` porque:
--   · user_id, topic y is_correct son NOT NULL (en test_results user_id admite
--     nulos, que para una tabla de resultados por usuario no tiene sentido).
--   · Ya tiene RLS con tres politicas de propietario correctas.
--   · Guarda `topic` como texto, que es lo que la interfaz pinta, y ademas
--     `exam_id` y `selected_index`, que test_results no tiene.
--
-- Las dos tablas estan VACIAS, asi que no hay datos que migrar.
--
-- `test_results` se deja en pie a proposito: no se borra nada en esta fase.
-- Cuando lleve un tiempo con la aplicacion guardando en question_attempts y se
-- confirme que nadie la lee, se puede retirar.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 · La columna que le faltaba
-- -----------------------------------------------------------------------------
-- `option_changes` es la segunda dimension de "Atenea Mind" (el indice de
-- inseguridad). La tenia test_results y no question_attempts.
-- NOT NULL DEFAULT 0: la ausencia de cambios es 0, no "no se sabe".

alter table public.question_attempts
  add column if not exists option_changes integer not null default 0;


-- -----------------------------------------------------------------------------
-- PASO 2 · La clave ajena hacia el banco de preguntas
-- -----------------------------------------------------------------------------
-- PostgREST solo resuelve un join si la clave ajena esta DECLARADA. Sin esto,
-- `select=*,question:question_bank(question_text)` falla y las estadisticas se
-- quedan sin el enunciado de la pregunta.
--
-- `question_attempts` solo tenia declarada exam_id -> exams.id.
-- on delete set null: si un admin borra una pregunta del banco, el intento del
-- alumno se conserva; lo que se pierde es el enlace.

alter table public.question_attempts
  drop constraint if exists question_attempts_question_id_fkey;

alter table public.question_attempts
  add constraint question_attempts_question_id_fkey
  foreign key (question_id) references public.question_bank(id) on delete set null;


-- -----------------------------------------------------------------------------
-- PASO 3 · Indice para las consultas de estadisticas
-- -----------------------------------------------------------------------------
-- getUserStats pide las 100 ultimas filas de un usuario ordenadas por fecha.

create index if not exists question_attempts_user_created_idx
  on public.question_attempts (user_id, created_at desc);


-- -----------------------------------------------------------------------------
-- PASO 4 · Comprobar
-- -----------------------------------------------------------------------------
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'question_attempts'
order by ordinal_position;

-- Y que la clave ajena quedo declarada (deben salir dos filas: exam_id y
-- question_id).
select tc.constraint_name, kcu.column_name, ccu.table_name as apunta_a
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name = 'question_attempts'
order by 2;


-- -----------------------------------------------------------------------------
-- MARCHA ATRAS
-- -----------------------------------------------------------------------------
-- alter table public.question_attempts drop constraint if exists question_attempts_question_id_fkey;
-- drop index if exists public.question_attempts_user_created_idx;
-- alter table public.question_attempts drop column if exists option_changes;
