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
-- Si no hay slug (alguien se registró por `/`) o el slug no existe, se aplica
-- el MISMO criterio que `resolveOrganizationId`: si hoy solo hay UNA academia
-- en toda la plataforma, es inequívoco quién es. Con dos o más, no se
-- adivina — la fila de `academy_members` no se crea, y esa cuenta se queda
-- en «no encontrada» hasta que un admin la añada a mano (`addAcademyAdmin`,
-- P11i) o el alumno se registre por el enlace correcto.
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

  -- Sin slug, o un slug que no existe: si solo hay UNA academia en toda la
  -- plataforma, es la suya sin ambigüedad (mismo criterio que
  -- resolveOrganizationId). Con dos o más, no se adivina.
  if v_academy_id is null then
    if (select count(*) from public.academies) = 1 then
      select id into v_academy_id from public.academies limit 1;
    end if;
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
-- Y de verdad, desde la app: registra una cuenta nueva por /alphapol (con
-- "Confirm email" activado, hace falta pulsar el enlace del correo antes de
-- entrar) y comprueba que aparece en academy_members apuntando a Alphapol:
--
--   select am.user_id, a.slug
--   from public.academy_members am
--   join public.academies a on a.id = am.academy_id
--   where am.user_id = (select id from auth.users where email = 'el-correo-de-prueba');
