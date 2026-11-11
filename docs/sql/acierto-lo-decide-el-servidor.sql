-- =============================================================================
-- El acierto lo decide la base de datos, no el navegador (regla 110)
-- =============================================================================
--
-- POR QUÉ
-- `question_attempts` tiene política de INSERT y de UPDATE para el alumno
-- (`1.2-attempts-update.sql`): con su sesión puede escribir sus propias filas.
-- Eso está bien —es lo que hace que RLS proteja de verdad—, pero `is_correct`
-- era una columna más de esa fila, así que el alumno podía:
--
--   · mandar `is_correct = true` con la opción equivocada, o
--   · cambiar después un fallo por un acierto con un UPDATE,
--
-- desde la aplicación manipulada o directamente contra la API de Supabase con
-- su propio token. La aplicación ya calcula el acierto en el servidor
-- (`corrigeFila`, en `app/lib/exam-results.ts`), pero eso solo cubre lo que
-- pasa por la aplicación. Este disparador cubre TODOS los caminos.
--
-- QUÉ HACE
--   · Al INSERTAR con la sesión de un alumno: `is_correct` se recalcula contra
--     `question_bank.correct_index`. Lo que no se puede comprobar (pregunta que
--     no está en el banco, respuesta sin `selected_index`, un blanco) NO es un
--     acierto.
--   · Al ACTUALIZAR con la sesión de un alumno: `is_correct`, `selected_index`
--     y `question_id` se quedan como estaban. El alumno sigue pudiendo poner el
--     diagnóstico del fallo (`error_type`), que es para lo único que actualiza.
--   · Con la clave de servicio o con SQL a mano NO actúa: los datos de
--     demostración, los guiones de operación y las correcciones del dueño
--     escriben lo que tengan que escribir.
--
-- No cambia ninguna fila que ya exista ni ninguna columna: es idempotente y se
-- puede ejecutar las veces que haga falta.
--
-- PROBADO en un Postgres 16 local, y EJECUTADO en producción el 11 nov 2026.
-- =============================================================================

create or replace function public.corrige_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_correcta integer;
begin
  -- Solo lo que llega con la sesión de un usuario. `auth.role()` es
  -- 'service_role' con la clave de servicio y NULL con SQL a mano.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.is_correct     := old.is_correct;
    new.selected_index := old.selected_index;
    new.question_id    := old.question_id;
    return new;
  end if;

  select correct_index into v_correcta
  from public.question_bank
  where id = new.question_id;

  new.is_correct := v_correcta is not null
    and new.selected_index is not null
    and new.selected_index >= 0
    and new.selected_index = v_correcta;

  return new;
end;
$fn$;

-- Es una función de disparador: nadie tiene por qué llamarla a mano.
revoke all on function public.corrige_respuesta() from public, anon, authenticated;

drop trigger if exists corrige_respuesta on public.question_attempts;
create trigger corrige_respuesta
  before insert or update on public.question_attempts
  for each row execute function public.corrige_respuesta();

-- -----------------------------------------------------------------------------
-- Comprobación
-- -----------------------------------------------------------------------------
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.question_attempts'::regclass and not tgisinternal;
--
-- Tiene que salir `corrige_respuesta` con `O` (activo).
