-- UNA PREGUNTA REVISADA QUE CAMBIA DE TEXTO DEJA DE ESTAR REVISADA (regla 142, 20 nov 2026).
--
-- Por qué: `question_bank.reviewed_at` dice «un tutor revisó esta pregunta», pero
-- no qué texto vio. Si alguien cambiaba el enunciado, las opciones, la correcta,
-- la explicación o la referencia por SQL o con un script, la marca seguía
-- puesta y el alumno recibía como «revisada» una pregunta que nadie había
-- leído (con «Los alumnos solo reciben preguntas revisadas», regla 138). La
-- regla lo prohibía, pero nada lo impedía.
--
-- Qué hace: un disparador ANTES de cada UPDATE. Si la fila estaba revisada y el
-- contenido cambia SIN que la misma escritura cambie también `reviewed_at`, la
-- deja sin revisar (`reviewed_at`, `reviewed_by` y `reviewed_by_email` a null).
--   · Las rutas de la aplicación que sellan la revisión en la misma escritura
--     (editar, publicar, «Está bien») siguen igual: cambian `reviewed_at`.
--   · Aprobar un cambio propuesto escribe el texto SIN sellar (regla 138: dar
--     por buena es ver la pregunta entera), así que ahora la deja sin revisar y
--     el tutor la da por buena otra vez. Es coherente con esa regla.
--   · Cambiar la dificultad, el estado, la familia o el tema NO la afecta: no
--     es contenido que el tutor leyó.
--   · Un INSERT no se toca: el disparador es solo de UPDATE.
--
-- No guarda ninguna huella y no hay nada que vigilar después: lo impide la
-- propia base de datos, sea cual sea el camino (app, SQL o script).
-- Quien tiene la clave de servicio todavía podría desactivarlo: esto protege
-- contra descuidos, no contra mala fe.
--
-- Idempotente: se puede ejecutar dos veces. Se deshace con
--   drop trigger question_bank_revision_no_sobrevive on public.question_bank;
--   drop function public.question_bank_revision_no_sobrevive();

create or replace function public.question_bank_revision_no_sobrevive()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.reviewed_at is not null
     and new.reviewed_at is not distinct from old.reviewed_at
     and (   new.question_text   is distinct from old.question_text
          or new.options         is distinct from old.options
          or new.correct_index   is distinct from old.correct_index
          or new.explanation     is distinct from old.explanation
          or new.legal_reference is distinct from old.legal_reference)
  then
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.reviewed_by_email := null;
  end if;
  return new;
end;
$$;

drop trigger if exists question_bank_revision_no_sobrevive on public.question_bank;
create trigger question_bank_revision_no_sobrevive
  before update on public.question_bank
  for each row
  execute function public.question_bank_revision_no_sobrevive();
