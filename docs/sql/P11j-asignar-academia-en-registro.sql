-- =============================================================================
-- P11j — Asignar la academia de un alta nueva (registro)
-- =============================================================================
--
-- ⬜ SIN EJECUTAR.
--
-- POR QUÉ HACE FALTA
-- P11 (multi-academia) resolvió quién pertenece a qué academia por
-- `academy_members` — pero NINGÚN camino de código escribe ahí para un alta
-- nueva. `supabase.auth.signUp()` (app/components/AppShell.tsx) no dice de
-- qué academia es, así que un alumno que se registre hoy —por `/alphapol` o
-- por `/`— confirma su correo, entra, y `resolveOrganizationId`
-- (app/lib/auth.ts) no encuentra ninguna fila: `organizationId` sale `null`,
-- `access` sale `'no-academy'`, y ve la pantalla «No hemos encontrado tu
-- academia» — sin ninguna forma de salir de ahí por sí mismo. Confirmado
-- leyendo el código: ni un solo `.from('academy_members').insert(...)` fuera
-- del backfill de este mismo guion de P11 y de `addAcademyAdmin` (el
-- superadmin añadiendo a alguien a mano).
--
-- CÓMO SE RESUELVE
-- El propio código (`AppShell.tsx`) ya manda el slug de la academia como
-- metadata del registro (`options.data.academia_slug`) cuando se registra
-- desde `/<slug>`. Este disparador lee esa metadata en cuanto Supabase crea
-- la fila de `auth.users` y da de alta la membresía — atómico, sin que el
-- cliente tenga que hacer una segunda llamada (que además violaría la regla
-- 1: nadie más que la sesión puede decir "yo soy este `user_id`").
--
-- SIN SLUG (alguien se registró por `/`, la URL pelada, sin el enlace de
-- ninguna academia concreta) o con un slug que no existe: entra en
-- **`atenea`**, la academia «casa» (decidido con el dueño, 12 sep 2026:
-- academia real, ya creada — `slug = 'atenea'`, sin grupos ni cobro en
-- persona — donde caen los registros genéricos y estudian con el banco
-- común). NO es "si solo hay una academia en la plataforma, es esa" —esa
-- primera versión se rompía en cuanto existiera una segunda academia real—;
-- es un destino FIJO y permanente, independiente de cuántas academias más se
-- den de alta después.
--
-- Decidido también: el `superadmin` NO administra `atenea` como excepción
-- (sería lo mismo que el hueco que se corrigió en regla 65 — heredar una
-- academia por casualidad). Si algún día hace falta ver uno a uno a sus
-- alumnos, se crea una cuenta `admin` normal para esa academia, igual que
-- para cualquier otra.
--
-- NO TOCA el disparador que ya crea `public.profiles` al registrarse —vive
-- en Supabase, no en este repo, y no hace falta saber cómo está escrito—:
-- Postgres permite varios disparadores `AFTER INSERT` sobre la misma tabla,
-- y este es uno nuevo e independiente.
--
-- Es idempotente: `create or replace function` y `drop trigger if exists`
-- antes de crear.
-- =============================================================================

create or replace function public.asigna_academia_en_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_academy_id uuid;
begin
  v_slug := new.raw_user_meta_data->>'academia_slug';

  if v_slug is not null and v_slug <> '' then
    select id into v_academy_id from public.academies where slug = v_slug;
  end if;

  -- Sin slug, o un slug que no existe: la academia «casa», fija. Si por lo
  -- que sea ni siquiera esa existiera todavía, no se adivina con ninguna
  -- otra — se deja sin asignar antes que colar a alguien en la academia
  -- equivocada.
  if v_academy_id is null then
    select id into v_academy_id from public.academies where slug = 'atenea';
  end if;

  if v_academy_id is not null then
    insert into public.academy_members (academy_id, user_id)
    values (v_academy_id, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_academia on auth.users;

create trigger on_auth_user_created_academia
  after insert on auth.users
  for each row execute function public.asigna_academia_en_registro();

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN
-- -----------------------------------------------------------------------------
--   select proname from pg_proc where proname = 'asigna_academia_en_registro';
--   -- una fila
--
--   select tgname from pg_trigger where tgname = 'on_auth_user_created_academia';
--   -- una fila
--
-- Y de verdad, desde la app:
--   1. Registra una cuenta por /alphapol (con "Confirm email" activado, hace
--      falta pulsar el enlace del correo antes de entrar) y comprueba que
--      entra en Alphapol.
--   2. Registra otra por / (la URL pelada) y comprueba que entra en `atenea`.
--
--   select am.user_id, a.slug
--   from public.academy_members am
--   join public.academies a on a.id = am.academy_id
--   where am.user_id = (select id from auth.users where email = 'el-correo-de-prueba');
